import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { DATA_DIR, ENGINE_DIR, MODELS_DIR, PACKAGED, ROOT, readJson, writeJson } from './paths.mjs';

const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

export const ASPECTS = {
  '1:1': [1024, 1024],
  '4:3': [1152, 864],
  '3:4': [864, 1152],
  '3:2': [1152, 768],
  '2:3': [768, 1152],
  '16:9': [1152, 640],
  '9:16': [640, 1152],
  '4:5': [1024, 1280],
  '5:4': [1280, 1024],
  '2:1': [1280, 640],
  '1:2': [640, 1280],
};

/* ------------------------------------------------------------------ *
 * Environment detection — no machine-specific paths may be hardcoded:
 * this repo is published and installs must work on any Windows profile.
 * ------------------------------------------------------------------ */

/**
 * PhotoCraft install folder: sibling checkout first (dev), then the usual
 * per-user/Program Files locations. Empty when nothing is found — the
 * first-run wizard then asks the user to locate it (or skip).
 */
export function detectPhotoCraft() {
  const candidates = [
    path.join(ROOT, '..', 'photocraft-app'),
    path.join(ROOT, '..', 'photocraft'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'PhotoCraft'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'photocraft'),
    'C:\\Program Files\\PhotoCraft',
    'C:\\Program Files (x86)\\PhotoCraft',
  ];
  for (const dir of candidates) {
    if (!dir) continue;
    try {
      if (fs.existsSync(path.join(dir, 'photocraft.exe'))) return dir;
    } catch {}
  }
  return '';
}

// OpenCode: prefer the npm global install's real .exe (a .cmd shim cannot be
// spawned without a shell since Node's CVE-2024-27980 hardening), then other
// common locations, then PATH via where.exe. See resolveOpenCode().
function defaultOpenCodeExe() {
  const npmExe = process.env.APPDATA
    ? path.join(process.env.APPDATA, 'npm', 'node_modules', 'opencode-ai', 'bin', 'opencode.exe')
    : '';
  try {
    if (npmExe && fs.existsSync(npmExe)) return npmExe;
  } catch {}
  return '';
}

// The dev workspace root: the checkout's parent (PhotoCraft requires the
// automation roots to contain the projects folder).
const DEV_ROOT = path.dirname(ROOT);
const PHOTO_DIR = detectPhotoCraft();

export const DEFAULTS = {
  // First-run wizard: shown until the user finishes (or dismisses) it.
  setup: { completed: false, at: null },
  // Longest side (px) of reference images sent to the engine. Qwen edits keep
  // identity/style from these; 768 px is already more guidance than the model
  // uses, while a 1080x1700 export turns into ~7300 latent tokens and makes
  // multi-reference edits exceed an 8 GB card's memory during sampling.
  refMaxSide: 768,
  // Packaged installs keep config.json (engine/model locations, written by
  // the installer or the first-run wizard) in the user data folder; dev keeps
  // reading it from the repo root next to egglab.ps1.
  engineRoot: PACKAGED ? DATA_DIR : ROOT,
  modelsDir: MODELS_DIR,
  workflow: 'quality',
  // Qwen-Image-2.1 is specified at 40 steps, CFG 1 (it is meant to be sampled
  // without guidance). 20 steps was the old panel default and produced soft,
  // under-resolved renders.
  quality: { steps: 40, cfg: 1 },
  turbo: { steps: 8, cfg: 1 },
  aspect: '1:1',
  width: 1024,
  height: 1024,
  seed: -1,
  lockSeed: false,
  batch: 1,
  transparent: false,
  offload: true,
  method: 'euler',
  // Rough wall-clock cost per sampling step on this 8 GB card, used for the
  // progress estimate only (the engine has no step counter on stdout).
  perStepSec: { quality: 4.5, turbo: 5.5 },
  photocraft: {
    exe: PHOTO_DIR ? path.join(PHOTO_DIR, 'photocraft.exe') : '',
    cli: PHOTO_DIR ? path.join(PHOTO_DIR, 'photocraft-cli.exe') : '',
    controlPort: 7878,
    tokenFile: path.join(DATA_DIR, 'photocraft.token'),
    // PhotoCraft refuses paths outside the automation roots. Dev anchors them
    // at the workspace (the checkout's parent); packaged installs default to
    // the user profile and let the wizard pick real folders.
    readRoot: PACKAGED ? os.homedir() : DEV_ROOT,
    writeRoot: PACKAGED ? os.homedir() : DEV_ROOT,
    projectRoot: PACKAGED ? path.join(os.homedir(), 'EggLab projects') : path.join(DEV_ROOT, 'projects'),
    autosave: true,
    autoLaunch: true,
    dock: true,
    dockGap: 6,
    width: 440,
  },
  opencode: {
    exe: defaultOpenCodeExe(),
    agent: 'egglab',
    model: 'inferx/deepseek-v4.1-flash-1017-basic',
    // Providers whose models come from a live list without capability metadata
    // (so opencode would treat them as text-only and drop image attachments).
    customProviders: ['inferx'],
    // Declare image input for the selected custom-provider model.
    vision: true,
    // One turn may hold a render plus several tool round trips. Must exceed
    // download_models' 60-minute wait, so a large model download does not get
    // killed by the turn timeout first.
    timeoutSec: 4200,
    // A healthy run emits its first event in seconds. opencode's own retry is
    // hard-coded to 5 attempts (~68s) and is not configurable, so a silent run
    // is the panel's job to detect and restart.
    firstByteSec: 100,
    // A running tool can legitimately hold the turn for many minutes with no
    // events; the idle watchdog only runs between tool calls.
    idleSec: 600,
    // Capacity ("all replicas at capacity", HTTP 429) is transient. Retry the
    // SAME model with exponential backoff - there is no fallback model.
    retries: 6,
    retryBaseSec: 8,
    retryMaxSec: 60,
    retryBudgetSec: 720,
    // How often the chat bubble reports that it is still waiting.
    heartbeatSec: 15,
  },
};

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function merge(base, patch) {
  if (!isObject(patch)) return base;
  const out = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (isObject(value) && isObject(base[key])) out[key] = merge(base[key], value);
    else if (value !== undefined) out[key] = value;
  }
  return out;
}

let settings = merge(DEFAULTS, readJson(SETTINGS_FILE, {}));
let saveTimer = null;

// Keys that were removed from the schema. An older panel process can rewrite
// settings.json with them still present (file values win over defaults), so
// strip them on load and before every save. Leftover keys would otherwise
// silently override the current retry/watchdog defaults.
const REMOVED_OPENCODE_KEYS = [
  'fallbackModel',
  'capacityRetries',
  'capacityBackoffSec',
  'fallbackFirstByteSec',
];

function sanitize(target) {
  if (target?.opencode) {
    for (const key of REMOVED_OPENCODE_KEYS) delete target.opencode[key];
    // The old default was 30 minutes, shorter than download_models' 60-minute
    // wait. Raise it once for configs that still carry the old default.
    if (Number(target.opencode.timeoutSec) === 1800) target.opencode.timeoutSec = 4200;
  }
  // `lockSeed` was written as the string "on" by an older build.
  if (target && target.lockSeed === 'on') target.lockSeed = true;
  return target;
}

sanitize(settings);

export function getSettings() {
  return settings;
}

// Models known to accept image parts. Custom providers are handled separately:
// opencode's live model list carries no capability metadata for them, so the
// panel declares image input itself (see chat.prepareAgent) and this helper
// mirrors that decision for session bookkeeping.
const VISION_CAPABLE = /vl|vision|gpt-4|gemini|claude|qwen.*(vl|omni)|mimo|deepseek[^/]*v4\.1/i;

export function visionForModel(model = settings.opencode.model, current = settings) {
  if (current.opencode?.vision === false) return false;
  const id = String(model || '');
  const slash = id.indexOf('/');
  const provider = slash > 0 ? id.slice(0, slash) : '';
  const custom = (current.opencode?.customProviders || []).map(String);
  if (provider && custom.includes(provider)) return true;
  return VISION_CAPABLE.test(id);
}

export function patchSettings(patch) {
  settings = merge(settings, patch);
  sanitize(settings);
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    writeJson(SETTINGS_FILE, settings);
  }, 150);
  return settings;
}

/** Effective sampling parameters for a workflow, honouring custom steps/cfg. */
export function workflowParams(workflow = settings.workflow) {
  const isTurbo = workflow === 'turbo';
  const base = isTurbo ? settings.turbo : settings.quality;
  return {
    workflow: isTurbo ? 'turbo' : 'quality',
    steps: Number(base.steps) || (isTurbo ? 8 : 40),
    cfg: isTurbo ? Number(base.cfg) || 1 : Number(base.cfg) || 1,
    method: settings.method || 'euler',
  };
}

export function sizeFor(aspect = settings.aspect, width = settings.width, height = settings.height) {
  const preset = ASPECTS[aspect];
  if (preset) return { width: preset[0], height: preset[1] };
  return { width: Number(width) || 1024, height: Number(height) || 1024 };
}

/**
 * Engine paths and model file names, in the shape `egglab.ps1` expects.
 *
 * `config.json` is the authoritative record. The packaged app has no
 * install.ps1 step (the NSIS installer only downloads the engine), so on a
 * fresh install this file does not exist. The old code returned in-memory
 * defaults and made setEngineModel() a no-op: a model that finished
 * downloading was never selected, and setup kept reporting the old default
 * file as "missing" forever. Create/repair the file on first contact instead.
 */
function defaultEngineConfig() {
  return {
    engine: path.join(ENGINE_DIR, 'sd'),
    models: settings.modelsDir || MODELS_DIR,
    diffusion: 'qwen-image-2.1-UC-fp8.safetensors',
    vae: 'qwen_image_2.1_vae_bf16.safetensors',
    llm: 'Qwen3VL-8B-Uncensored-HauhauCS-Balanced-Q6_K.gguf',
    llmVision: 'Qwen3VL-8B-Uncensored-HauhauCS-Balanced-mmproj-f16.gguf',
    turbo: {
      lora: 'qwen_image_2.1_turbo_lora_avg_rank_178_bf16.safetensors',
      steps: 8,
      cfg: 1,
    },
    defaults: {
      width: 1024,
      height: 1024,
      steps: 40,
      cfg: 1,
      method: 'euler',
      offload: true,
    },
  };
}

/**
 * Read the engine config, creating it (or filling missing keys) when needed.
 * Safe to call on every status poll: it only writes when something changed.
 */
export function ensureEngineConfig() {
  const cfgPath = path.join(settings.engineRoot, 'config.json');
  const base = defaultEngineConfig();
  let raw = readJson(cfgPath, null);
  let changed = false;

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    raw = base;
    changed = true;
  } else {
    for (const key of ['engine', 'models', 'diffusion', 'vae', 'llm', 'llmVision']) {
      if (typeof raw[key] !== 'string' || !raw[key].trim()) {
        raw[key] = base[key];
        changed = true;
      }
    }
    if (!raw.turbo || typeof raw.turbo !== 'object' || !raw.turbo.lora) {
      raw.turbo = { ...base.turbo, ...(raw.turbo && typeof raw.turbo === 'object' ? raw.turbo : {}) };
      if (!raw.turbo.lora) raw.turbo.lora = base.turbo.lora;
      changed = true;
    }
    if (!raw.defaults || typeof raw.defaults !== 'object') {
      raw.defaults = base.defaults;
      changed = true;
    }
  }

  if (changed) {
    try {
      writeJson(cfgPath, raw);
    } catch {
      // A read-only profile must not break status; the defaults still work for
      // this session and a later run can persist them.
    }
  }

  // config.json is authoritative. Mirror its models folder into settings so a
  // legacy `settings.modelsDir` (the old default pointed at a folder that no
  // longer existed) can never disagree with the downloader and status.
  if (raw.models && settings.modelsDir !== raw.models) {
    try {
      patchSettings({ modelsDir: raw.models });
    } catch {}
  }
  try {
    fs.mkdirSync(raw.models, { recursive: true });
  } catch {}

  return raw;
}

export function engineConfig() {
  const cfgPath = path.join(settings.engineRoot, 'config.json');
  const raw = ensureEngineConfig();
  return {
    path: cfgPath,
    raw,
    engine: raw.engine,
    models: raw.models,
    diffusion: raw.diffusion,
    vae: raw.vae,
    llm: raw.llm,
    llmVision: raw.llmVision,
    turbo: raw.turbo,
  };
}

/** Point the engine config at a different model file (after a download). */
export function setEngineModel(key, filename) {
  const cfg = engineConfig();
  const raw = cfg.raw || ensureEngineConfig();
  if (!raw) throw new Error('EggLab could not create the engine config file.');
  if (key === 'turbo') {
    raw.turbo = { ...(raw.turbo || {}), lora: filename };
  } else {
    raw[key] = filename;
  }
  try {
    writeJson(cfg.path, raw);
  } catch (err) {
    throw new Error(`Model selected, but EggLab could not write ${cfg.path}: ${err.message}`);
  }
  return raw;
}

export function modelFileFor(key) {
  const cfg = engineConfig();
  if (key === 'turbo') return { dir: cfg.models, file: cfg.turbo.lora };
  return { dir: cfg.models, file: cfg[key] };
}

/* ------------------------------------------------------------------ */
/* OpenCode model discovery                                           */
/* ------------------------------------------------------------------ */

/* `opencode models` lists every model the connected providers know about,
   one per line as `provider/modelId`. We group by provider so the settings
   drawer can render a provider → model list the user can choose from. The
   result is cached briefly so repeated drawer opens don't re-spawn opencode. */

/**
 * Resolve the OpenCode binary without hardcoding any user profile.
 *
 * Order: the configured path, the npm global install's real .exe, other
 * common install locations (V2 standalone, scoop), then `where.exe` for
 * anything on PATH. A `.cmd`/`.bat` match (npm/shim wrappers) can only be
 * spawned through a shell since Node's CVE-2024-27980 hardening, so callers
 * get the flag back and pass it to spawn/execFile.
 */
let whereCache; // undefined = not probed yet (null = probed, nothing found)
const versionCache = new Map();
/** Forget the PATH probe so the next resolve sees a just-installed OpenCode. */
export function clearOpenCodeCache() {
  whereCache = undefined;
  versionCache.clear();
}

function whereOpenCode() {
  if (whereCache !== undefined) return whereCache;
  whereCache = [];
  try {
    const out = execFileSync('where.exe', ['opencode'], {
      windowsHide: true,
      encoding: 'utf8',
      timeout: 5000,
    });
    whereCache = String(out).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  } catch {
    whereCache = [];
  }
  return whereCache;
}

/** Version tuple from `opencode --version` ("1.19.5", "opencode v2.3.0"). */
function probeOpenCodeVersion(exe) {
  if (versionCache.has(exe)) return versionCache.get(exe);
  let version = null;
  try {
    const out = execFileSync(exe, ['--version'], {
      windowsHide: true,
      encoding: 'utf8',
      timeout: 10000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const match = String(out).match(/(\d+)\.(\d+)\.(\d+)/);
    if (match) version = [Number(match[1]), Number(match[2]), Number(match[3])];
  } catch {}
  versionCache.set(exe, version);
  return version;
}

function compareVersions(a, b) {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

/** CLIs bundled with the OpenCode desktop app (newest first). */
function desktopOpenCodeCandidates() {
  const roaming = process.env.APPDATA || '';
  if (!roaming) return [];
  const root = path.join(roaming, 'ai.opencode.desktop', 'cli');
  try {
    return fs
      .readdirSync(root)
      .map((name) => ({ name, file: path.join(root, name, 'opencode-cli.exe') }))
      .filter((entry) => {
        try {
          return fs.statSync(entry.file).isFile();
        } catch {
          return false;
        }
      })
      .sort((a, b) => compareVersions(probeOpenCodeVersion(b.file), probeOpenCodeVersion(a.file)))
      .map((entry) => entry.file);
  } catch {
    return [];
  }
}

export function resolveOpenCode() {
  const configured = settings.opencode?.exe || '';
  const home = process.env.USERPROFILE || os.homedir();
  const local = process.env.LOCALAPPDATA || '';
  const roaming = process.env.APPDATA || '';
  const candidates = [
    configured,
    ...desktopOpenCodeCandidates(),
    home && path.join(home, '.opencode', 'bin', 'opencode.exe'),
    roaming && path.join(roaming, 'npm', 'node_modules', 'opencode-ai', 'bin', 'opencode.exe'),
    local && path.join(local, 'Programs', 'opencode', 'opencode.exe'),
    home && path.join(home, 'scoop', 'shims', 'opencode.exe'),
    ...whereOpenCode(),
  ].filter(Boolean);

  // Every OpenCode client on the machine shares one data directory, and a
  // newer client migrates its schema forward. An older CLI then fails on every
  // run with "no such column: project_id". So pick the NEWEST working CLI that
  // exists instead of trusting the configured path: the newest client is the
  // one that matches (or upgrades) the shared schema.
  let best = null;
  let bestVersion = null;
  let bestOrder = Number.POSITIVE_INFINITY;
  const seen = new Set();
  candidates.forEach((candidate, order) => {
    if (!candidate || seen.has(candidate)) return;
    seen.add(candidate);
    let exists = false;
    try {
      exists = fs.existsSync(candidate);
    } catch {}
    if (!exists) return;
    const version = /\.(cmd|bat)$/i.test(candidate) ? null : probeOpenCodeVersion(candidate);
    if (!best) {
      best = candidate;
      bestVersion = version;
      bestOrder = order;
      return;
    }
    const cmp = compareVersions(version, bestVersion);
    if (cmp > 0 || (cmp === 0 && order < bestOrder)) {
      best = candidate;
      bestVersion = version;
      bestOrder = order;
    }
  });
  if (best) return { cmd: best, shell: /\.(cmd|bat)$/i.test(best), version: bestVersion };
  // Last resort: PATH lookup by CreateProcess (.exe only).
  return { cmd: 'opencode', shell: false, version: null };
}

let modelsCache = null;
let modelsCacheAt = 0;
const MODELS_CACHE_TTL = 30000; // 30 s — fresh enough for auto-sync

export async function opencodeModels(force = false) {
  const now = Date.now();
  if (!force && modelsCache && now - modelsCacheAt < MODELS_CACHE_TTL) {
    return modelsCache;
  }
  const result = await new Promise((resolve) => {
    // Same binary the chat will use: probing an older CLI can return a model
    // list the chat process cannot actually run.
    const oc = resolveOpenCode();
    // Run from the user's home directory so OpenCode reads its global config
    // (.jsonc) instead of the panel's shadowing old .json.
    const cwd = process.env.HOME || process.env.USERPROFILE;
    // v1 needs --refresh to bypass its cache; v2 has no such flag.
    const major = oc.version?.[0] ?? 1;
    const args = ['models'];
    if (major < 2) args.push('--refresh');
    const child = spawn(oc.cmd, args, {
      cwd,
      windowsHide: true,
      shell: oc.shell,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(value);
    };
    // A hung provider discovery must not freeze the settings drawer.
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {}
      finish({ providers: [], error: 'opencode models timed out', fetchedAt: Date.now() });
    }, 20000);
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('close', () => {
      const byProvider = new Map();
      for (const line of stdout.trim().split(/\r?\n/).filter(Boolean)) {
        const slash = line.indexOf('/');
        if (slash < 0) continue;
        const provider = line.slice(0, slash);
        const modelId = line.slice(slash + 1);
        if (!byProvider.has(provider)) byProvider.set(provider, []);
        byProvider.get(provider).push({ id: line, modelId, provider });
      }
      const providers = [...byProvider.entries()]
        .map(([provider, models]) => ({
          provider,
          models: models.sort((a, b) => a.modelId.localeCompare(b.modelId)),
        }))
        .sort((a, b) => a.provider.localeCompare(b.provider));
      finish({ providers, error: null, fetchedAt: Date.now() });
    });
    child.on('error', (err) => {
      finish({ providers: [], error: err.message, fetchedAt: Date.now() });
    });
  });
  // Cache only successful listings. A failed scan (opencode busy, provider
  // offline) should be retried on the next drawer open instead of showing an
  // empty list for the whole TTL.
  if (!result.error) {
    modelsCache = result;
    modelsCacheAt = Date.now();
  }
  return result;
}

export function ensureDirs() {
  let modelsDir = settings.modelsDir;
  try {
    modelsDir = engineConfig().models || modelsDir;
  } catch {}
  for (const dir of [modelsDir]) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {}
  }
}
