import fs from 'node:fs';
import path from 'node:path';
import { emit } from './bus.mjs';
import { engineConfig, getSettings, resolveModelPath, roleFolder, setEngineModel } from './settings.mjs';
import { humanBytes, readJson, writeJson, DATA_DIR } from './paths.mjs';

const STATE_FILE = path.join(DATA_DIR, 'downloads.json');
const MODEL_FILE = /\.(safetensors|gguf)$/i;

/** Folder that owns one role (diffusion/, vae/, text_encoder/, vision/, lora/). */
function roleDir(cfg, key) {
  const folder = roleFolder(key);
  return folder ? path.join(cfg.models, folder) : cfg.models;
}

/** Store a file inside the models root as a portable relative path. */
function relativeToModels(cfg, abs) {
  const rel = path.relative(cfg.models, abs);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return abs;
  return rel.split(path.sep).join('/');
}

/**
 * Files the Models dropdown can offer for one role: the role subfolder and
 * the models root (so a user's existing flat folder keeps working). No
 * scanning/classification; just the files in those folders.
 */
function listRoleFiles(cfg, key, currentPath) {
  const dirs = [];
  const nested = roleDir(cfg, key);
  const roots = [nested, cfg.models];
  for (const dir of roots) {
    if (!dir || dirs.some((seen) => path.resolve(seen) === path.resolve(dir))) continue;
    try {
      if (fs.statSync(dir).isDirectory()) dirs.push(dir);
    } catch {}
  }
  const seen = new Set();
  const files = [];
  const add = (full) => {
    const resolved = path.resolve(full);
    if (seen.has(resolved)) return;
    seen.add(resolved);
    let size = 0;
    try {
      const stat = fs.statSync(full);
      if (!stat.isFile()) return;
      size = stat.size;
    } catch {
      return;
    }
    files.push({
      name: path.basename(full),
      path: full,
      size,
      current: Boolean(currentPath && path.resolve(currentPath) === resolved),
    });
  };
  for (const dir of dirs) {
    let names = [];
    try {
      names = fs.readdirSync(dir);
    } catch {}
    for (const name of names) {
      if (MODEL_FILE.test(name)) add(path.join(dir, name));
    }
  }
  // A custom file outside both folders is still a valid current choice.
  if (currentPath && !seen.has(path.resolve(currentPath))) add(currentPath);
  return files.sort((a, b) => a.name.localeCompare(b.name));
}

const HF = 'https://huggingface.co';

/**
 * Curated model sources. Every URL was HEAD-checked; each entry is a file that
 * stable-diffusion.cpp can load directly (safetensors or GGUF).
 */
const UC_REPO = `${HF}/KasugaiSakura/Qwen-Image-2.1-Uncensored-Abenzerps-GGUF/resolve/main`;

const DIFFUSION_VARIANTS = [
  {
    id: 'uc-fp8',
    label: 'Uncensored FP8 · 6.6 GB',
    file: 'qwen-image-2.1-UC-fp8.safetensors',
    url: `${UC_REPO}/qwen-image-2.1-UC-fp8.safetensors`,
    note: 'Uncensored weights in fp8. Fast to load and a good fit for 8 GB.',
  },
  {
    id: 'q4km-beta',
    beta: true,
    label: 'Official Q4_K_M · 3.9 GB',
    file: 'qwen-image-2.1-Q4_K_M.gguf',
    url: `${HF}/unsloth/Qwen-Image-2.1-GGUF/resolve/main/qwen-image-2.1-Q4_K_M.gguf`,
    note:
      'Beta: official weights quantised to Q4_K_M. Measured ~35% faster than FP8 and 2.9 GB smaller on an 8 GB card; slightly less detail, and not the uncensored variant.',
  },
  {
    id: 'uc-q5km',
    label: 'Uncensored Q5_K_M · 4.9 GB',
    file: 'qwen-image-2.1-UC-Q5_K_M.gguf',
    url: `${UC_REPO}/qwen-image-2.1-UC-Q5_K_M.gguf`,
    note: 'Uncensored weights quantised to Q5_K_M. Smallest uncensored option.',
  },
];

function registry() {
  const cfg = engineConfig();
  return [
    {
      id: 'diffusion',
      label: 'Qwen-Image-2.1 DiT',
      note: 'The image model itself (fp8 / GGUF).',
      required: true,
      key: 'diffusion',
      variants: DIFFUSION_VARIANTS,
    },
    {
      id: 'vae',
      label: 'Qwen-Image VAE',
      note: 'Must be the 2.1 VAE; older Qwen-VAE files produce washed out colours.',
      required: true,
      key: 'vae',
      variants: [
        {
          id: 'vae',
          label: 'bf16 · 0.68 GB',
          file: 'qwen_image_2.1_vae_bf16.safetensors',
          url: `${HF}/Comfy-Org/Qwen-Image-2.1/resolve/main/vae/qwen_image_2.1_vae_bf16.safetensors`,
        },
      ],
    },
    {
      id: 'llm',
      label: 'Qwen3-VL 8B text encoder',
      note: 'Reads prompts and reference images (Q6_K GGUF).',
      required: true,
      key: 'llm',
      variants: [
        {
          id: 'q6k',
          label: 'Uncensored Q6_K · 6.7 GB',
          file: 'Qwen3VL-8B-Uncensored-HauhauCS-Balanced-Q6_K.gguf',
          url: `${HF}/HauhauCS/Qwen3VL-8B-Uncensored-HauhauCS-Balanced/resolve/main/Qwen3VL-8B-Uncensored-HauhauCS-Balanced-Q6_K.gguf`,
        },
      ],
    },
    {
      id: 'mmproj',
      label: 'Vision projector (edits)',
      note: 'Required for image editing / multi-reference prompts.',
      required: true,
      key: 'llmVision',
      variants: [
        {
          id: 'f16',
          label: 'mmproj f16 · 1.2 GB',
          file: 'Qwen3VL-8B-Uncensored-HauhauCS-Balanced-mmproj-f16.gguf',
          url: `${HF}/HauhauCS/Qwen3VL-8B-Uncensored-HauhauCS-Balanced/resolve/main/Qwen3VL-8B-Uncensored-HauhauCS-Balanced-mmproj-f16.gguf`,
        },
      ],
    },
    {
      id: 'turbo',
      label: 'Turbo LoRA',
      note: 'Optional. Turns Quality (40 steps) into Turbo (8 steps, CFG 1).',
      required: false,
      key: 'turbo',
      variants: [
        {
          id: 'lora',
          label: 'Turbo LoRA · 0.9 GB',
          file: 'qwen_image_2.1_turbo_lora_avg_rank_178_bf16.safetensors',
          url: `${HF}/Comfy-Org/Qwen-Image-2.1/resolve/main/loras/qwen_image_2.1_turbo_lora_avg_rank_178_bf16.safetensors`,
        },
      ],
    },
  ];
}

function targetFor(entry) {
  const cfg = engineConfig();
  const modelsDir = cfg.models;
  // Keep the configured file name; fall back to the variant when config is stale.
  const configured =
    entry.key === 'turbo' ? cfg.turbo?.lora : cfg[entry.key];
  return { modelsDir, configured };
}

export function modelStatus() {
  const cfg = engineConfig();
  const stored = readJson(STATE_FILE, {});
  return {
    modelsDir: cfg.models,
    configPath: cfg.path,
    engineReady: fs.existsSync(path.join(cfg.engine, 'sd-cli.exe')),
    engineDir: cfg.engine,
    entries: registry().map((entry) => {
      const { configured } = targetFor(entry);
      const variant =
        entry.variants.find(
          (v) => v.file === configured || v.file === path.basename(String(configured || '')),
        ) || entry.variants[0];
      const file = configured || variant.file;
      // A role may be a bare filename in `models`, or an absolute path the
      // user picked from another folder. Resolve both the same way the engine
      // script does; never assume one models directory.
      const full = resolveModelPath(cfg, entry.key) || path.join(cfg.models, file);
      let dir = path.dirname(full);
      try {
        if (!fs.existsSync(full)) dir = roleDir(cfg, entry.key);
      } catch {
        dir = roleDir(cfg, entry.key);
      }
      let size = 0;
      try {
        size = fs.statSync(full).size;
      } catch {}
      const live = downloads.get(entry.id);
      let dl = live || stored[entry.id] || null;
      // Check the file belonging to the download, not the currently active
      // checkpoint: downloading Q4_K_M while FP8 is installed must not look
      // successful just because FP8 exists.
      let dlExists = false;
      if (dl?.file) {
        for (const candidate of [path.join(roleDir(cfg, entry.key), dl.file), path.join(cfg.models, dl.file)]) {
          try {
            if (fs.statSync(candidate).size > 0) {
              dlExists = true;
              break;
            }
          } catch {}
        }
      }
      // A persisted "running"/"queued" record with no live download means the
      // app died mid-transfer. Surface it as an error instead of silently
      // hiding it (the MCP download tool used to report success for this).
      if (dl && !live && (dl.status === 'running' || dl.status === 'queued')) {
        dl = dlExists
          ? { ...dl, status: 'done' }
          : { ...dl, status: 'error', error: 'Download interrupted. Press Retry.' };
      }
      // Terminal states are noise when that download's file is on disk; a
      // stale error must not make every later download_models call look failed.
      if (dl && (dl.status === 'done' || (dl.status === 'error' && dlExists))) dl = null;
      return {
        id: entry.id,
        label: entry.label,
        note: entry.note,
        required: entry.required,
        key: entry.key,
        file,
        path: full,
        dir,
        files: listRoleFiles(cfg, entry.key, full),
        exists: size > 0,
        size,
        sizeText: size ? humanBytes(size) : '',
        variant: variant.id,
        variants: entry.variants.map((v) => {
          let installed = false;
          const candidates = [
            path.join(roleDir(cfg, entry.key), v.file),
            path.join(cfg.models, v.file),
          ];
          if (path.isAbsolute(String(configured || '')) && path.basename(String(configured)) === v.file) {
            candidates.push(String(configured));
          }
          for (const candidate of candidates) {
            try {
              if (fs.statSync(candidate).size > 0) {
                installed = true;
                break;
              }
            } catch {}
          }
          return {
            id: v.id,
            label: v.label,
            file: v.file,
            note: v.note || '',
            beta: Boolean(v.beta),
            installed,
            current:
              v.file === configured || v.file === path.basename(String(configured || '')),
            downloadable: Boolean(v.url),
          };
        }),
        download: dl ? publicState({ ...dl, id: entry.id }) : null,
      };
    }),
  };
}

/* ------------------------------------------------------------------ */
/* switching between installed variants                               */
/* ------------------------------------------------------------------ */

/**
 * Point the engine at a variant that is already on disk. Downloads call
 * setEngineModel too, but a user may keep several quantisations around and
 * want to switch back and forth without re-downloading.
 */
export function useVariant(entryId, fileOrId) {
  const cfg = engineConfig();
  const entry = registry().find((e) => e.id === entryId);
  if (!entry) throw new Error(`Unknown model: ${entryId}`);
  const variant = entry.variants.find((v) => v.file === fileOrId || v.id === fileOrId);
  if (!variant) throw new Error(`Unknown variant for ${entry.label}`);
  const candidates = [];
  const resolved = resolveModelPath(cfg, entry.key);
  if (resolved && path.basename(resolved) === variant.file) candidates.push(resolved);
  candidates.push(path.join(roleDir(cfg, entry.key), variant.file), path.join(cfg.models, variant.file));
  const full = candidates.find((candidate) => {
    try {
      return fs.statSync(candidate).size > 0;
    } catch {
      return false;
    }
  }) || candidates[0];
  let size = 0;
  try {
    size = fs.statSync(full).size;
  } catch {}
  if (!size) throw new Error(`${variant.file} is not installed`);
  setEngineModel(entry.key, relativeToModels(cfg, full));
  const status = modelStatus();
  emit('models', { status });
  return status;
}

/* ------------------------------------------------------------------ */
/* downloads                                                           */
/* ------------------------------------------------------------------ */

const downloads = new Map();
let queue = Promise.resolve();

function persist() {
  const out = {};
  for (const [id, dl] of downloads) {
    out[id] = {
      status: dl.status,
      received: dl.received,
      total: dl.total,
      error: dl.error || null,
      file: dl.file,
      variant: dl.variant || null,
      source: dl.source || 'manual',
      updated: Date.now(),
    };
  }
  writeJson(STATE_FILE, out);
}

function publicState(dl) {
  return {
    id: dl.id,
    status: dl.status,
    received: dl.received,
    total: dl.total,
    percent: dl.total ? Math.floor((dl.received / dl.total) * 100) : 0,
    speed: dl.speed || 0,
    speedText: dl.speed ? `${humanBytes(dl.speed)}/s` : '',
    receivedText: humanBytes(dl.received),
    totalText: humanBytes(dl.total),
    file: dl.file,
    variant: dl.variant || null,
    error: dl.error || null,
  };
}

async function downloadOne(entry, variant, existing = null) {
  const cfg = engineConfig();
  const dest = path.join(roleDir(cfg, entry.key), variant.file);
  const part = `${dest}.part`;
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  const dl = existing || {
    id: entry.id,
    status: 'queued',
    received: 0,
    total: 0,
    speed: 0,
    file: variant.file,
    variant: variant.id,
    source: 'manual',
    abort: new AbortController(),
  };
  // A queued download may have been canceled while waiting behind another.
  if (dl.abort?.signal.aborted) {
    const err = new Error('Canceled');
    err.name = 'AbortError';
    throw err;
  }
  dl.status = 'running';
  dl.error = null;
  dl.speed = 0;
  dl.total = 0;
  downloads.set(entry.id, dl);
  persist();
  emit('model', { id: entry.id, download: publicState(dl) });

  // Resume a leftover .part (cancelled or interrupted download) instead of
  // starting the multi-GB transfer over. huggingface.co honours Range.
  let offset = 0;
  try {
    offset = fs.statSync(part).size;
  } catch {}
  dl.received = offset;
  emit('model', { id: entry.id, download: publicState(dl) });

  const headers = { 'user-agent': 'EggLab/0.1' };
  if (offset > 0) headers.range = `bytes=${offset}-`;
  const res = await fetch(variant.url, {
    redirect: 'follow',
    signal: dl.abort.signal,
    headers,
  });

  if (res.status === 416) {
    // The .part is at least as large as the remote file (or was truncated by
    // something else) - start over instead of looping on a bad offset.
    try {
      fs.rmSync(part, { force: true });
    } catch {}
    throw new Error('The partial download does not match the remote file. Press download again to restart.');
  }
  if (!res.ok || !res.body) {
    throw new Error(`HTTP ${res.status} for ${variant.url}`);
  }

  let append = false;
  if (res.status === 206) {
    append = offset > 0;
    const range = String(res.headers.get('content-range') || '');
    const totalMatch = range.match(/\/(\d+)\s*$/);
    dl.total = totalMatch ? Number(totalMatch[1]) : offset + (Number(res.headers.get('content-length')) || 0);
  } else {
    // The server ignored Range: restart from zero and truncate the part file.
    dl.received = 0;
    dl.total = Number(res.headers.get('content-length')) || 0;
  }

  // Fail before a multi-GB transfer if the target disk cannot hold the
  // remaining bytes. Setup/model downloads otherwise die halfway with a
  // generic HTTP/write error.
  try {
    if (dl.total && typeof fs.statfsSync === 'function') {
      const st = fs.statfsSync(cfg.models);
      const free = Number(st.bavail) * Number(st.bsize);
      const need = Math.max(0, dl.total - (append ? offset : 0));
      if (Number.isFinite(free) && free > 0 && need + 512 * 1024 * 1024 > free) {
        throw new Error(
          `Not enough disk space in ${cfg.models}: need ${humanBytes(need)} plus headroom, ${humanBytes(free)} free.`,
        );
      }
    }
  } catch (err) {
    if (/^Not enough disk space/.test(err.message)) throw err;
    // statfs unavailable or the folder is not ready: let the transfer decide.
  }

  const out = fs.createWriteStream(part, append ? { flags: 'a' } : undefined);
  const reader = res.body.getReader();
  let lastEmit = 0;
  let lastBytes = dl.received;
  let lastTime = Date.now();

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!out.write(Buffer.from(value))) {
      await new Promise((resolve) => out.once('drain', resolve));
    }
    dl.received += value.length;
    const now = Date.now();
    if (now - lastEmit > 400) {
      const dt = (now - lastTime) / 1000;
      if (dt > 0) dl.speed = (dl.received - lastBytes) / dt;
      lastBytes = dl.received;
      lastTime = now;
      lastEmit = now;
      emit('model', { id: entry.id, download: publicState(dl) });
      persist();
    }
  }
  await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));

  // A short read must keep the .part file so the next click resumes, never
  // silently rename a truncated multi-GB model into place.
  const finalSize = fs.statSync(part).size;
  if (dl.total && finalSize !== dl.total) {
    throw new Error(
      `Download incomplete (${humanBytes(finalSize)} of ${humanBytes(dl.total)}). Press download again to resume.`
    );
  }
  fs.renameSync(part, dest);

  dl.status = 'done';
  dl.percent = 100;

  // Installing a model must not silently switch the engine away from a model
  // that is already working. Auto-select only when the configured file is
  // missing (first install or a broken install); otherwise the new variant
  // shows up in the picker and the user switches explicitly.
  const current = resolveModelPath(cfg, entry.key);
  let currentExists = false;
  try {
    currentExists = current ? fs.statSync(current).size > 0 : false;
  } catch {}
  if (!currentExists) {
    const stored = relativeToModels(cfg, dest);
    if (entry.id === 'turbo') setEngineModel('turbo', stored);
    else setEngineModel(entry.key, stored);
  }

  emit('model', { id: entry.id, download: publicState(dl) });
  emit('models', { status: modelStatus() });
  persist();
}

export function startDownloads(ids, variantId = null, source = 'manual') {
  const entries = registry();
  const started = [];
  for (const id of ids) {
    const entry = entries.find((e) => e.id === id);
    if (!entry) continue;
    const variant = entry.variants.find((v) => v.id === variantId) || entry.variants[0];
    if (!variant) continue;
    if (!variant.url) continue;
    // Already on disk: do not re-download a multi-GB file because the agent
    // asked for it again. Check both the role folder and a flat models root.
    try {
      const cfg = engineConfig();
      const candidates = [path.join(roleDir(cfg, entry.key), variant.file), path.join(cfg.models, variant.file)];
      let exists = false;
      for (const candidate of candidates) {
        try {
          if (fs.statSync(candidate).size > 0) {
            exists = true;
            break;
          }
        } catch {}
      }
      if (exists) continue;
    } catch {}
    if (['running', 'queued'].includes(downloads.get(id)?.status)) continue;
    // Register the job synchronously, before the queue runs. The MCP
    // download_models tool polls /api/models immediately after POST; without
    // this, it saw no active download and reported success while the file was
    // still missing.
    const dl = {
      id,
      status: 'queued',
      received: 0,
      total: 0,
      speed: 0,
      file: variant.file,
      variant: variant.id,
      source,
      error: null,
      abort: new AbortController(),
    };
    downloads.set(id, dl);
    started.push(id);
    emit('model', { id, download: publicState(dl) });
    persist();
    queue = queue
      .then(() => downloadOne(entry, variant, dl))
      .catch((err) => {
        dl.status = 'error';
        dl.error = err.name === 'AbortError' ? 'Canceled' : err.message;
        downloads.set(id, dl);
        emit('model', { id, download: publicState(dl) });
        persist();
      });
  }
  return { started, queue: started.length ? publicState(downloads.get(started[0])) : null };
}

export function cancelDownload(id) {
  const dl = downloads.get(id);
  if (!dl) return false;
  dl.abort?.abort();
  // A queued transfer has not reached fetch() yet; settle it now so the UI and
  // the MCP status do not show "queued" forever.
  if (dl.status === 'queued') {
    dl.status = 'error';
    dl.error = 'Canceled';
    emit('model', { id, download: publicState(dl) });
    persist();
  }
  return true;
}

/** Cancel model downloads started by an agent turn (not manual downloads). */
export function cancelAgentDownloads() {
  let count = 0;
  for (const dl of [...downloads.values()]) {
    if (dl.source === 'agent' && (dl.status === 'running' || dl.status === 'queued')) {
      if (cancelDownload(dl.id)) count++;
    }
  }
  return count;
}

export function retryDownload(id) {
  // Retry the variant that failed, not entry.variants[0]: the Models row lets
  // the user pick Q4_K_M / Q5_K_M / FP8, and a retry used to quietly download
  // a different file.
  const failed = downloads.get(id);
  const stored = failed ? null : readJson(STATE_FILE, {})[id];
  return startDownloads(
    [id],
    failed?.variant || stored?.variant || null,
    failed?.source || stored?.source || 'manual',
  );
}

export function publicDownloads() {
  return [...downloads.values()].map(publicState);
}

/**
 * Map a bare file name to its registry entry. Used by the wizard's manual
 * "add model from file" path (and by drag-and-drop onto the Models card):
 * only files EggLab's config can actually point at are accepted.
 */
export function variantForFile(fileName) {
  const base = path.basename(String(fileName || ''));
  for (const entry of registry()) {
    const variant = entry.variants.find((v) => v.file === base);
    if (variant) return { entryId: entry.id, key: entry.key, file: variant.file };
  }
  return null;
}
