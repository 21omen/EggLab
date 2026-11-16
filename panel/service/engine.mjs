import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { nativeImage } from 'electron';
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

/* ------------------------------------------------------------------ */
/* engine process hygiene                                              */
/* ------------------------------------------------------------------ */

/** Kill a process and its children. Safe when it already exited. */
function killTree(pid) {
  if (!pid) return;
  try {
    spawn('taskkill', ['/pid', String(pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
  } catch {}
}

let lastSweep = 0;

/**
 * Kill leftover sd-cli processes that belong to THIS engine folder.
 *
 * stable-diffusion.cpp can leave its process alive after writing the output
 * (seen live: a job finished, the process kept 3.4 GB of VRAM, and every later
 * render failed with "capacity check" at a random stage). A single stray holds
 * enough VRAM on an 8 GB card to break the next ten jobs, so sweep before each
 * launch and once at startup. Filtering by executable path keeps an unrelated
 * sd-cli (another checkout/tool) untouched.
 */
export function cleanupStaleEngines(force = false) {
  const now = Date.now();
  if (!force && now - lastSweep < 20000) return;
  lastSweep = now;
  // taskkill by image name: sd-cli.exe is the stable-diffusion.cpp CLI that
  // EggLab ships and runs; a CIM/PowerShell path-filtered sweep proved
  // unreliable inside the Electron process (it silently missed a survivor
  // holding 2.8 GB). EggLab is single-instance, so nothing else of ours can be
  // running; this is the deterministic equivalent.
  // Fire-and-forget: taskkill exits non-zero when the process is already gone,
  // which is the common case at the end of a successful render.
  try {
    spawn('taskkill', ['/F', '/IM', 'sd-cli.exe', '/T'], {
      windowsHide: true,
      stdio: 'ignore',
    }).unref?.();
  } catch {}
}

/** Kill whatever engine process a running job owns (called on app quit). */
export function killActiveEngine() {
  for (const job of jobs.values()) {
    if (job.child?.pid) killTree(job.child.pid);
  }
}

/* ------------------------------------------------------------------ */
/* VRAM planning                                                       */
/* ------------------------------------------------------------------ */

let vramCache = { total: 0, free: 0, at: 0 };
/**
 * Total and free VRAM in GiB when detectable (NVIDIA's nvidia-smi), refreshed
 * every 30 s. Other vendors return zeros and keep the engine defaults. Free
 * memory matters: browsers/Electron apps routinely hold 2-3 GB, so a budget
 * based on the card's total size over-commits.
 */
function detectVram() {
  if (vramCache.total && Date.now() - vramCache.at < 30000) return vramCache;
  const info = { total: 0, free: 0, at: Date.now() };
  try {
    const out = execFileSync(
      'nvidia-smi',
      ['--query-gpu=memory.total,memory.free', '--format=csv,noheader,nounits'],
      { windowsHide: true, timeout: 6000, encoding: 'utf8' },
    );
    const first = String(out)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)[0] || '';
    const [totalMb, freeMb] = first.split(',').map((n) => Number(n.trim()));
    if (Number.isFinite(totalMb) && totalMb > 0) {
      info.total = totalMb / 1024;
      info.free = Number.isFinite(freeMb) ? freeMb / 1024 : 0;
    }
  } catch {}
  vramCache = info;
  return info;
}

/**
 * Downscale reference images before handing them to the engine.
 *
 * Qwen edits keep identity/style from references, and the engine preprocesses
 * them at native size — a 1080x1700 photo becomes ~7300 latent tokens. With
 * four references the diffusion graph then believes a single segment needs
 * more VRAM than an 8 GB card has, and fails in "weight preparation" after the
 * prompt has already been encoded (minutes wasted). 768 px on the long side
 * keeps far more detail than the guidance uses, and made a 4-reference edit
 * render on a 4060 Ti where full-size references failed.
 */
function prepareReferenceImages(images, id, maxSideOverride = null) {
  if (!Array.isArray(images) || !images.length) return { files: [], temp: [] };
  const s = getSettings();
  const maxSide = Math.max(256, Number(maxSideOverride || s.refMaxSide) || 768);
  const files = [];
  const temp = [];
  for (let i = 0; i < images.length; i++) {
    const src = images[i];
    try {
      const img = nativeImage.createFromPath(src);
      if (img.isEmpty()) {
        files.push(src);
        continue;
      }
      const { width, height } = img.getSize();
      const side = Math.max(width, height);
      if (!side || side <= maxSide) {
        files.push(src);
        continue;
      }
      const scale = maxSide / side;
      const resized = img.resize({
        width: Math.max(16, Math.round(width * scale)),
        height: Math.max(16, Math.round(height * scale)),
        quality: 'best',
      });
      const file = path.join(TMP_DIR, `${id}-ref${i + 1}.png`);
      fs.writeFileSync(file, resized.toPNG());
      files.push(file);
      temp.push(file);
    } catch {
      files.push(src);
    }
  }
  return { files, temp };
}

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
    sizeCapped: job.sizeCapped || null,
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

/**
 * Cancel every running or queued job.
 *
 * "Stop" in the chat kills the OpenCode process, but tool calls already in
 * flight run inside the panel — the render would keep the GPU busy for minutes
 * after the chat says "Stopped.". Stopping a turn must stop its work too.
 */
export function cancelAllJobs() {
  let count = 0;
  for (const job of [...jobs.values()]) {
    if (job.status === 'running' || job.status === 'queued') {
      if (cancelJob(job.id)) count++;
    }
  }
  return count;
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
    vram: (() => {
      const v = detectVram();
      return v.total
        ? { total: Math.round(v.total * 10) / 10, free: Math.round(v.free * 10) / 10 }
        : null;
    })(),
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
  // Scale references before the engine sees them (see prepareReferenceImages):
  // full-size photos from PhotoCraft exports otherwise blow up the edit graph.
  const preparedRefs = prepareReferenceImages(images, id);
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

  // Memory plan for 8-12 GB cards. `--max-vram -1` asks the engine to snapshot
  // FREE VRAM at startup and keep ~1 GiB headroom, so plans stay honest even
  // while a browser holds 2-3 GB. A fixed (total-1) budget over-commits and
  // makes a segment fail 70 MB short (observed). Params stay in RAM; the text
  // encoder keeps using the GPU (17-30 s vs ~600 s on CPU).
  const vram = detectVram();
  if (s.offload !== false && vram.total && vram.total <= 12) {
    args.push('-MaxVram', '-1');
    // References are VAE-encoded; tiling keeps those peaks small on cards that
    // must share VRAM with the diffusion graph.
    if (images.length) args.push('-VaeTiling');
  }

  // The text encoder (Qwen3VL 8B, ~6 GB) competes with the diffusion model for
  // VRAM. On 8 GB cards the Vulkan backend sometimes puts the whole encoder on
  // the device and then fails its own workspace capacity check while encoding
  // the prompt ("qwen3vl segment 1/1 (graph) failed during workspace capacity
  // check"). If that happens after the size fallback, retry once with the
  // encoder on CPU - it costs a few seconds of prompt encoding but fits
  // (verified on a 4060 Ti 8 GB).
  let teCpuRetry = false;
  let sizeRetry = false;
  let sizeRetry2 = false;
  let imageListFile = null;
if (Array.isArray(images) && images.length) {
  imageListFile = path.join(TMP_DIR, `${id}-images.txt`);
  fs.writeFileSync(imageListFile, preparedRefs.files.join('\n') + '\n', 'utf8');
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
  const vramNow = detectVram();
  if (
    vramNow.total &&
    vramNow.total <= 12 &&
    vramNow.free &&
    vramNow.free < 3 &&
    (images.length || width * height > 1000000)
  ) {
    emit('chat', {
      action: 'notice',
      text: `Low VRAM: only ${vramNow.free.toFixed(1)} GB free. Close browsers or other GPU apps for large edits — EggLab will split or shrink the render if it runs out.`,
    });
  }
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
    if (buffer.trim()) onLine(buffer);
    const exists = fs.existsSync(outPath);

    // Memory-pressure failures are recoverable: retry once with the text
    // encoder pinned to the CPU. Everything else (and a second attempt) ends
    // the job as an error.
    const memoryFailure =
      !job.canceled &&
      !(code === 0 && exists) &&
      /capacity check|cannot make enough memory available|out of memory|failed during (workspace|weight preparation)|allocated capacity/i.test(
        `${stderrText}\n${job.logTail.slice(-20).join('\n')}`,
      );
    // Memory failures here are dominated by the first transformer block's
    // attention workspace, which scales with TARGET resolution (measured:
    // 6.48 GB needed at 1024x1280 vs 6.42 GB free; reference size and model
    // quantization did not change the number). So the first fallback shrinks
    // the canvas to a reference-aware ceiling, then a second step to a safe
    // ~0.9 MP.
    const fitArea = (cap) => {
      const current = job.width * job.height;
      const scale = Math.sqrt(cap / current);
      return [
        Math.max(512, round32(job.width * scale)),
        Math.max(512, round32(job.height * scale)),
      ];
    };
    const refAreaCap =
      images.length >= 4 ? 1050000 : images.length >= 2 ? 1310720 : 2000000;
    if (memoryFailure && !sizeRetry && job.width * job.height > refAreaCap) {
      sizeRetry = true;
      const [nextW, nextH] = fitArea(refAreaCap);
      const wi = args.indexOf('-Width');
      const hi = args.indexOf('-Height');
      if (wi >= 0) args[wi + 1] = String(nextW);
      if (hi >= 0) args[hi + 1] = String(nextH);
      job.sizeCapped = `${job.width}x${job.height} -> ${nextW}x${nextH} (VRAM)`;
      job.width = nextW;
      job.height = nextH;
      log.write(`# retry: VRAM capacity check failed, size -> ${nextW}x${nextH}\n`);
      job.logTail.push(`--- VRAM was full: retrying at ${nextW}x${nextH} ---`);
      job.error = null;
      job.child = null;
      job.phase = 'starting';
      job.detail = `Retrying at ${nextW}x${nextH} (VRAM was full)`;
      stderrText = '';
      buffer = '';
      update(job);
      launchNow();
      return;
    }
    // Second step: even the reference-aware ceiling can be a few MB short when
    // browsers hold 3 GB. ~0.9 MP is the last size that reliably fits here.
    if (memoryFailure && !sizeRetry2 && job.width * job.height > 900000) {
      sizeRetry2 = true;
      const [nextW, nextH] = fitArea(900000);
      const wi = args.indexOf('-Width');
      const hi = args.indexOf('-Height');
      if (wi >= 0) args[wi + 1] = String(nextW);
      if (hi >= 0) args[hi + 1] = String(nextH);
      job.sizeCapped = `${job.sizeCapped || `${job.width}x${job.height}`} -> ${nextW}x${nextH} (VRAM)`;
      job.width = nextW;
      job.height = nextH;
      log.write(`# retry: VRAM capacity check failed, size -> ${nextW}x${nextH}\n`);
      job.logTail.push(`--- VRAM still full: retrying at ${nextW}x${nextH} ---`);
      job.error = null;
      job.child = null;
      job.phase = 'starting';
      job.detail = `Retrying at ${nextW}x${nextH} (VRAM was full)`;
      stderrText = '';
      buffer = '';
      update(job);
      launchNow();
      return;
    }

    // The text encoder has its own memory budget. Only retry it on CPU when the
    // failure actually happened while encoding the prompt — for sampling
    // workspace failures it costs minutes and changes nothing.
    const encoderFailure = /qwen3vl|failed to encode prompt|LLM prompt encoding/i.test(
      `${stderrText}\n${job.logTail.slice(-20).join('\n')}`,
    );
    if (memoryFailure && !teCpuRetry && encoderFailure) {
      teCpuRetry = true;
      args.push('-TeCpu');
      log.write('# retry: VRAM capacity check failed, text encoder -> CPU\n');
      job.logTail.push('--- VRAM was full: retrying with the text encoder on CPU ---');
      job.error = null;
      job.child = null;
      job.phase = 'starting';
      job.detail = 'VRAM full — retrying with the text encoder on CPU';
      stderrText = '';
      buffer = '';
      update(job);
      launchNow();
      return;
    }

    clearInterval(ticker);
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
    // Reference copies made for this job (originals are never touched).
    for (const file of preparedRefs.temp) {
      try {
        fs.unlinkSync(file);
      } catch {}
    }
    // A successful sd-cli can still leave its process alive holding VRAM; make
    // sure the whole engine tree for this job is gone before the next one.
    killTree(child && child.pid);
    cleanupStaleEngines(true);
    // Second sweep after the OS has finished terminating the tree (cancels
    // especially: the immediate sweep can race TerminateProcess).
    setTimeout(() => cleanupStaleEngines(true), 2500).unref?.();
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
    job.detail = teCpuRetry ? 'Text encoder on CPU (VRAM was full)' : 'Preparing';
    job.startedAt = Date.now();
    job.expectedMs = expectedSeconds(job) * 1000;
    // A stray sd-cli from an earlier run holds VRAM and turns this job into a
    // random capacity failure. Sweep ours first (throttled internally).
    cleanupStaleEngines();
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
