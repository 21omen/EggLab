import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { emit } from './bus.mjs';
import { engineConfig, getSettings, patchSettings, workflowParams } from './settings.mjs';
import { alphaStats } from './imagecheck.mjs';
import { EGGLAB_PS1, LOG_DIR, OUT_DIR, TMP_DIR, clamp, readJson, round32, stamp, stripAnsi, uid } from './paths.mjs';

const jobs = new Map();
// One engine process at a time: a second sd-cli on 8 GB dies while loading
// weights (observed live: two parallel jobs, the second killed at load). Jobs
// arriving while another runs are queued and launched when the engine frees up.
let engineBusy = false;
const launchQueue = [];
const order = [];

export function transparentPrompt(prompt) {
  const text = String(prompt || '').trim().replace(/\.+$/, '');
  if (/rgba|alpha channel|transparent background/i.test(text)) return text;
  return `This is an RGBA image with transparency. ${text}. The image has alpha channel and the background is transparent.`;
}

function expectedSeconds(job) {
  const s = getSettings();
  const perStep = Number(s.perStepSec?.[job.workflow]) || (job.workflow === 'turbo' ? 3 : 4);
  const area = clamp((job.width * job.height) / (1024 * 1024), 0.45, 2.6);
  const load = job.images.length ? 58 : 30;
  const cond = job.images.length ? 34 : 12;
  return load + cond + job.steps * perStep * area + 10;
}

function publicJob(job) {
  const now = Date.now();
  const elapsed = (job.endedAt || now) - job.startedAt;
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    phase: job.phase,
    prompt: job.prompt,
    promptUsed: job.promptUsed,
    workflow: job.workflow,
    width: job.width,
    height: job.height,
    steps: job.steps,
    cfg: job.cfg,
    seed: job.seed,
    transparent: job.transparent,
    alpha: job.alpha || null,
    images: job.images,
    // How a local edit was actually driven (init image, mask, strength) — the
    // only proof from the outside that an inpaint was a real inpaint.
    localEdit: job.localEdit || null,
    outPath: job.outPath || null,
    error: job.error || null,
    percent: job.status === 'queued' ? 0 : job.status === 'done' ? 100 : Math.min(95, Math.round((elapsed / job.expectedMs) * 100)),
    elapsedMs: elapsed,
    expectedMs: job.expectedMs,
    startedAt: job.startedAt,
    endedAt: job.endedAt || null,
    detail: job.detail || '',
    logTail: job.logTail.slice(-14),
  };
}

function update(job, patch = {}) {
  Object.assign(job, patch);
  emit('job', { job: publicJob(job) });
}

function setPhase(job, phase, detail) {
  if (job.phase === phase && (!detail || job.detail === detail)) return;
  job.phase = phase;
  if (detail) job.detail = detail;
  update(job);
}

function remember(job) {
  jobs.set(job.id, job);
  order.push(job.id);
  while (order.length > 60) {
    const id = order.shift();
    const old = jobs.get(id);
    if (old && old.status !== 'running' && old.status !== 'queued') jobs.delete(id);
  }
}

export function listJobs() {
  return order
    .map((id) => jobs.get(id))
    .filter(Boolean)
    .slice()
    .reverse()
    .map(publicJob);
}

export function getJob(id) {
  const job = jobs.get(id);
  return job ? publicJob(job) : null;
}

export function cancelJob(id) {
  const job = jobs.get(id);
  if (!job) return false;
  if (job.status === 'queued') {
    // Not launched yet: drop it from the queue and settle it now.
    const i = launchQueue.findIndex((e) => e.job === job);
    if (i >= 0) launchQueue.splice(i, 1);
    job.canceled = true;
    job.status = 'canceled';
    job.phase = 'canceled';
    job.detail = 'Canceled';
    job.endedAt = Date.now();
    update(job);
    emit('job:finished', { job: publicJob(job) });
    return true;
  }
  if (job.status !== 'running' || !job.child) return false;
  try {
    spawn('taskkill', ['/pid', String(job.child.pid), '/t', '/f'], { windowsHide: true });
  } catch {}
  job.canceled = true;
  setPhase(job, 'canceling', 'Stopping…');
  return true;
}

export function engineStatus() {
  const cfg = engineConfig();
  const s = getSettings();
  const cli = path.join(cfg.engine, 'sd-cli.exe');
  const models = {
    diffusion: fs.existsSync(path.join(cfg.models, cfg.diffusion)),
    vae: fs.existsSync(path.join(cfg.models, cfg.vae)),
    llm: fs.existsSync(path.join(cfg.models, cfg.llm)),
    mmproj: fs.existsSync(path.join(cfg.models, cfg.llmVision)),
    turbo: fs.existsSync(path.join(cfg.models, cfg.turbo?.lora || '')),
  };
  const quality = workflowParams('quality');
  const turbo = workflowParams('turbo');
  return {
    ready: fs.existsSync(cli) && models.diffusion && models.vae && models.llm,
    editReady: models.mmproj,
    engineDir: cfg.engine,
    engineExists: fs.existsSync(cli),
    models,
    modelsDir: cfg.models,
    config: { diffusion: cfg.diffusion, vae: cfg.vae, llm: cfg.llm, llmVision: cfg.llmVision, turbo: cfg.turbo?.lora },
    workflows: { quality, turbo },
    defaults: {
      aspect: s.aspect,
      width: s.width,
      height: s.height,
      transparent: s.transparent,
      offload: s.offload,
    },
    engineRoot: s.engineRoot,
  };
}

/* ------------------------------------------------------------------ */

// Natural dimensions of a PNG or JPEG without loading or decoding it — enough
// for the edit auto-aspect rule. Returns null for anything it cannot parse
// (caller falls back to the settings size).
function imageDims(p) {
  try {
    const buf = fs.readFileSync(p);
    if (buf.length < 24) return null;
    // PNG: IHDR width/height at fixed offsets, big-endian.
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    // JPEG: walk the marker chain to the first SOFn frame header.
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) { i += 1; continue; }
        const marker = buf[i + 1];
        const isStartOfFrame =
          marker >= 0xc0 && marker <= 0xcf &&
          marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
        if (isStartOfFrame) {
          return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        }
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
          i += 2;
          continue;
        }
        i += 2 + buf.readUInt16BE(i + 2);
      }
    }
  } catch {
    /* unreadable file — fall through */
  }
  return null;
}

export function startJob(input = {}) {
  const s = getSettings();
  const cfg = engineConfig();
  const params = workflowParams(input.workflow || s.workflow);
  const kind = Array.isArray(input.images) && input.images.length ? 'edit' : 't2i';
  // Text-to-image honours the panel default; an edit only goes RGBA when the
  // caller asks for it explicitly, so a global "transparent" default can never
  // silently strip the background out of someone's photo.
  const transparent = kind === 't2i' ? Boolean(input.transparent ?? s.transparent) : Boolean(input.transparent);

  const problems = [];
  if (!fs.existsSync(path.join(cfg.engine, 'sd-cli.exe'))) problems.push('Engine missing — run install.ps1');
  if (!fs.existsSync(path.join(cfg.models, cfg.diffusion))) problems.push(`Diffusion model missing: ${cfg.diffusion}`);
  if (!fs.existsSync(path.join(cfg.models, cfg.vae))) problems.push(`VAE missing: ${cfg.vae}`);
  if (!fs.existsSync(path.join(cfg.models, cfg.llm))) problems.push(`Text encoder missing: ${cfg.llm}`);
  if (kind === 'edit' && !fs.existsSync(path.join(cfg.models, cfg.llmVision))) problems.push('Vision projector missing (needed for edits)');
  if (params.workflow === 'turbo') {
    const lora = cfg.turbo?.lora;
    if (!lora || !fs.existsSync(path.join(cfg.models, lora))) problems.push('Turbo LoRA missing — download it in Models');
  }
  if (problems.length) {
    const err = new Error(problems.join('\n'));
    err.code = 'ENGINE_NOT_READY';
    throw err;
  }

  const prompt = String(input.prompt || '').trim();
  if (!prompt) throw new Error('A prompt is required.');

  const seed =
    Number.isFinite(Number(input.seed)) && Number(input.seed) >= 0
      ? Number(input.seed)
      : kind === 'edit'
        ? // Qwen-Image-2.1 edits replay the exact initial noise when the seed is
          // reused across t2i -> edit (the "noise replay" failure mode: same seed
          // + same sigma schedule = grainy, over-sharpened output). Draw a fresh
          // random seed for every edit no matter what the lock says.
          Math.floor(Math.random() * 2147483647)
        : s.lockSeed && Number.isFinite(Number(s.seed)) && Number(s.seed) >= 0
          ? Number(s.seed)
          : Math.floor(Math.random() * 2147483647);

  const images = (input.images || []).filter((p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  });

  // Size envelope for the generator: multiples of 32 (round32 floors at 256),
  // hard ceiling 2048 on the long side (8 GB VRAM; model curriculum tops at
  // 2048p). Oversized requests are clamped, not rejected, and the cap is
  // reported on the job so the agent sees the real size it got.
  const sizeCap = 2048;
  const explicitSize =
    Number.isFinite(Number(input.width)) || Number.isFinite(Number(input.height));
  let reqWidth = round32(input.width || s.width || 1024);
  let reqHeight = round32(input.height || s.height || 1024);
  // An edit without explicit dimensions follows the source aspect, capped at
  // 1024 on the long side — the same rule egglab.ps1 applies for direct CLI
  // use. Without this the reference is resized to the settings size, which
  // squashes off-square sources. (sd.cpp resizes refs to -W/-H.)
  if (kind === 'edit' && !explicitSize && images.length) {
    const dims = imageDims(images[0]);
    if (dims && dims.width > 0 && dims.height > 0) {
      const scale = Math.min(1, 1024 / Math.max(dims.width, dims.height));
      reqWidth = round32(dims.width * scale);
      reqHeight = round32(dims.height * scale);
    }
  }
  const width = Math.min(reqWidth, sizeCap);
  const height = Math.min(reqHeight, sizeCap);
  const sizeCapped = width !== reqWidth || height !== reqHeight;
  const steps = clamp(Number(input.steps || params.steps), 1, 60);
  const cfgScale = Number(input.cfg || params.cfg);

  const id = uid('job');
  const promptUsed = transparent ? transparentPrompt(prompt) : prompt;
  const promptFile = path.join(TMP_DIR, `${id}.prompt.txt`);
  fs.writeFileSync(promptFile, promptUsed, 'utf8');

  const outPath = path.join(
    OUT_DIR,
    // id suffix: stamp() has 1-second resolution, and jobs submitted in the
    // same second would otherwise share one filename and overwrite each other.
    `egglab-${params.workflow}-${stamp()}-${seed}-${id.slice(4)}${transparent ? '-rgba' : ''}.png`,
  );

  const job = {
    id,
    kind,
    status: 'running',
    phase: 'starting',
    detail: 'Preparing',
    prompt,
    promptUsed,
    workflow: params.workflow,
    width,
    height,
    sizeCapped: sizeCapped ? `${reqWidth}x${reqHeight} -> ${width}x${height}` : null,
    steps,
    cfg: cfgScale,
    seed,
    transparent,
    images,
    outPath: null,
    error: null,
    startedAt: Date.now(),
    endedAt: null,
    logTail: [],
    expectedMs: 0,
    canceled: false,
    child: null,
    logFile: path.join(LOG_DIR, `${id}.log`),
  };
  job.expectedMs = expectedSeconds(job) * 1000;

  const args = [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    // Packaged installs ship egglab.ps1 as an extraResource while config.json
    // lives in the user data folder, so the config location is always passed
    // explicitly (dev resolves to the same repo-root file as before).
    EGGLAB_PS1,
    '-Config',
    cfg.path,
    '-PromptFile',
    promptFile,
    '-Steps',
    String(steps),
    '-Cfg',
    String(cfgScale),
    '-Width',
    String(width),
    '-Height',
    String(height),
    '-Seed',
    String(seed),
    '-Out',
    outPath,
  ];
  if (params.workflow === 'turbo') args.push('-Turbo');
  if (s.offload === false) args.push('-NoOffload');
  let imageListFile = null;
if (Array.isArray(images) && images.length) {
  imageListFile = path.join(TMP_DIR, `${id}-images.txt`);
  fs.writeFileSync(imageListFile, images.join('\n') + '\n', 'utf8');
  args.push('-ImageFile', imageListFile);
}
  // Local-edit knobs, all optional: without them this is the same reference
  // edit it has always been. With them the engine gets a real init image and
  // mask, so the model repaints one continuous canvas instead of us pasting a
  // rectangle back — which is what produced a visible seam.
  const localEdit = {};
  if (input.initImg && fs.existsSync(input.initImg)) {
    localEdit.initImg = input.initImg;
    args.push('-InitImg', input.initImg);
  }
  if (input.mask && fs.existsSync(input.mask)) {
    localEdit.mask = input.mask;
    args.push('-Mask', input.mask);
  }
  const strength = Number(input.strength);
  if (Number.isFinite(strength) && strength >= 0) {
    localEdit.strength = strength;
    args.push('-Strength', String(strength));
  }
  const imgCfg = Number(input.imgCfg);
  if (Number.isFinite(imgCfg) && imgCfg >= 0) {
    localEdit.imgCfg = imgCfg;
    args.push('-ImgCfg', String(imgCfg));
  }
  if (Object.keys(localEdit).length) job.localEdit = localEdit;

  // The spawn lives in launchNow() below: if the engine is busy this job is
  // queued and starts only when the running one finishes.
  let child = null;
  remember(job);
  update(job);

  const log = fs.createWriteStream(job.logFile, { flags: 'a' });
  log.write(`# ${new Date().toISOString()} ${JSON.stringify({ ...job, child: undefined, logFile: undefined })}\n`);

  let buffer = '';
  let phaseTimer = 0;
  let ticker = null;
  let stderrText = '';

  const onLine = (rawLine) => {
    const line = rawLine.trim();
    if (!line) return;
    log.write(line + '\n');
    if (/^\|#+\|/.test(line) || /^#+$/.test(line)) return;
    job.logTail.push(line.slice(0, 300));
    if (job.logTail.length > 200) job.logTail.shift();

    if (/loading diffusion model/i.test(line)) setPhase(job, 'loading', 'Loading diffusion model');
    else if (/loading llm|load .*gguf/i.test(line)) setPhase(job, 'loading', 'Loading text encoder');
    else if (/loading vae/i.test(line)) setPhase(job, 'loading', 'Loading VAE');
    else if (/total params memory size/i.test(line)) setPhase(job, 'loading', 'Warming up');
    else if (/get_learned_condition/i.test(line)) setPhase(job, 'encoding', 'Reading prompt' + (job.images.length ? ' + reference' : ''));
    else if (/generating image/i.test(line)) setPhase(job, 'sampling', `Sampling ${job.steps} steps`);
    else if (/decoding|vae decode/i.test(line)) setPhase(job, 'decoding', 'Decoding image');
    else if (/Done in/i.test(line)) setPhase(job, 'saving', 'Saving PNG');
    else if (/error|failed|not found|invalid/i.test(line) && !job.error && /\b(error|failed)\b/i.test(line)) {
      job.error = line.replace(/^\[[A-Z]\]\s*/, '').slice(0, 400);
    }

    const now = Date.now();
    if (now - phaseTimer > 900) {
      phaseTimer = now;
      update(job);
    }
  };

  const onData = (chunk) => {
    const text = stripAnsi(chunk.toString('utf8'));
    buffer += text;
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      onLine(line);
    }
    if (buffer.length > 8000) {
      onLine(buffer);
      buffer = '';
    }
  };

  // stdout/stderr wiring moved into launchNow() with the spawn.

  ticker = setInterval(() => {
    if (job.status !== 'running') return;
    const elapsed = Date.now() - job.startedAt;
    // Nudge the phase text when sampling outlives the estimate.
    if (job.phase === 'sampling' && elapsed > job.expectedMs) job.detail = `Sampling ${job.steps} steps (slow run)`;
    update(job);
  }, 1000);

  const finish = (code) => {
    clearInterval(ticker);
    if (buffer.trim()) onLine(buffer);
    const exists = fs.existsSync(outPath);
    job.endedAt = Date.now();
    job.child = null;

    if (job.canceled) {
      job.status = 'canceled';
      job.phase = 'canceled';
      job.detail = 'Canceled';
    } else if (code === 0 && exists) {
      job.status = 'done';
      job.phase = 'done';
      job.detail = 'Done';
      job.outPath = outPath;
      // A mid-run log line that merely contained "error" (e.g. weight
      // preparation progress text) is not a failure — success clears it, so a
      // done job never reports a stale error fragment.
      job.error = null;
      // A transparent render is only a cut-out if the alpha channel is actually
      // empty outside the subject. Measure it now so the agent never has to
      // trust the "-rgba" filename.
      if (job.transparent) {
        try {
          job.alpha = alphaStats(outPath);
        } catch {}
      }
      const seconds = (job.endedAt - job.startedAt) / 1000;
      const observed = Math.max(0.5, (seconds - (job.images.length ? 70 : 30)) / job.steps);
      const s2 = getSettings();
      const old = Number(s2.perStepSec?.[job.workflow]) || observed;
      const next = Math.round((old * 0.6 + observed * 0.4) * 100) / 100;
      patchSettings({ perStepSec: { ...s2.perStepSec, [job.workflow]: next } });
    } else {
      job.status = 'error';
      job.phase = 'error';
      const tail = job.logTail.slice(-6).join('\n');
      job.error = job.error || (code === 0 ? 'Engine exited without writing the output file.' : `Engine failed (exit ${code}).`);
      job.error += tail ? `\n${tail}` : '';
    }
    try {
      log.write(`# finished ${job.status} code=${code} in ${((job.endedAt - job.startedAt) / 1000).toFixed(1)}s\n`);
      log.end();
    } catch {}
    try {
      fs.unlinkSync(promptFile);
    } catch {}
    try {
      if (imageListFile) fs.unlinkSync(imageListFile);
    } catch {}
    update(job);
    emit('job:finished', { job: publicJob(job) });
    // Engine is free: start the next queued job, if any.
    engineBusy = false;
    const next = launchQueue.shift();
    if (next) next.launch();
    if (job.status === 'error' && stderrText.trim() && !job.error.includes('ggml')) {
      // keep the message readable
    }
  };

  const launchNow = () => {
    if (job.canceled) {
      job.status = 'canceled';
      job.phase = 'canceled';
      job.detail = 'Canceled';
      job.endedAt = Date.now();
      try { fs.unlinkSync(promptFile); } catch {}
      update(job);
      emit('job:finished', { job: publicJob(job) });
      return;
    }
    engineBusy = true;
    job.status = 'running';
    job.phase = 'starting';
    job.detail = 'Preparing';
    job.startedAt = Date.now();
    child = spawn('powershell.exe', args, {
      cwd: s.engineRoot,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    job.child = child;
    child.stdout.on('data', onData);
    child.stderr.on('data', (chunk) => {
      stderrText += chunk.toString('utf8');
      onData(chunk);
    });
    child.on('exit', (code) => finish(code ?? 1));
    child.on('error', (err) => {
      job.error = err.message;
      finish(1);
    });
    update(job);
  };

  if (engineBusy) {
    job.status = 'queued';
    job.phase = 'queued';
    job.detail = 'Waiting for the running job…';
    update(job);
    launchQueue.push({ job, launch: launchNow });
  } else {
    launchNow();
  }

  return publicJob(job);
}

/** Wait for a job to settle (used by the MCP tools). */
export async function waitForJob(id, { timeoutMs = 1800000 } = {}) {
  const started = Date.now();
  for (;;) {
    const job = jobs.get(id);
    if (!job) throw new Error(`Unknown job ${id}`);
    if (job.status !== 'running' && job.status !== 'queued') return publicJob(job);
    if (Date.now() - started > timeoutMs) throw new Error('Timed out waiting for the render.');
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
}

export function latestOutput() {
  try {
    return fs
      .readdirSync(OUT_DIR)
      .filter((f) => /\.(png|webp|jpg)$/i.test(f))
      .map((f) => ({ file: path.join(OUT_DIR, f), time: fs.statSync(path.join(OUT_DIR, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time)
      .slice(0, 40);
  } catch {
    return [];
  }
}

export function recentOutputFiles() {
  return latestOutput().map((f) => f.file);
}

export { readJson };
