import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

export const PANEL_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const ROOT = path.dirname(PANEL_DIR);

/* --------------------------------------------------------------------------
 * Dual layout: dev checkout vs packaged install.
 *
 * Packaged installs (electron-builder) load this module from inside
 * `resources\app.asar`, which is a read-only archive, and app updates replace
 * `resources\` entirely. Every writable file therefore lives in the user's
 * profile:
 *
 *   %APPDATA%\EggLab        settings, sessions, chats, logs, tmp, out,
 *                           config.json, control.json (small, may roam)
 *   %LOCALAPPDATA%\EggLab   engine binaries, models, bin (large, never roam)
 *
 * Dev keeps the historic repo layout byte-for-byte, so nothing changes while
 * developing. PACKAGED is detected from the module's own location rather than
 * `app.isPackaged`, because this file also loads under plain node (tools,
 * tests, and ELECTRON_RUN_AS_NODE children) where electron is not importable.
 * ------------------------------------------------------------------------ */
export const PACKAGED = /app\.asar/.test(fileURLToPath(import.meta.url));

const localAppData =
  process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
const roamingAppData =
  process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
/** User data root: `%APPDATA%\EggLab` when packaged, the panel dir in dev. */
export const DATA_DIR = PACKAGED ? path.join(roamingAppData, 'EggLab') : PANEL_DIR;

/** Where the downloaded engine (sd-cli + backend DLLs) lives. */
export const ENGINE_DIR = PACKAGED
  ? path.join(localAppData, 'EggLab', 'engine')
  : path.join(ROOT, 'engine');
/** Where an on-demand OpenCode install would be extracted (wizard, Phase 2). */
export const BIN_DIR = PACKAGED
  ? path.join(localAppData, 'EggLab', 'bin')
  : path.join(ROOT, 'bin');

// Default models folder: the sibling `Models` directory the dev checkout has
// always used (present next to the repo), else a per-user folder. Never a
// hardcoded machine path — the repo is published.
const siblingModels = path.join(ROOT, '..', 'Models');
export const MODELS_DIR = fs.existsSync(siblingModels)
  ? siblingModels
  : path.join(localAppData, 'EggLab', 'models');

// The engine runner script. Packaged installs ship it via extraResources
// (spawn cannot execute files inside app.asar); dev runs it from the repo root.
export const EGGLAB_PS1 = PACKAGED
  ? path.join(process.resourcesPath || path.join(path.dirname(process.execPath), 'resources'), 'egglab.ps1')
  : path.join(ROOT, 'egglab.ps1');

export const OUT_DIR = PACKAGED ? path.join(DATA_DIR, 'out') : path.join(ROOT, 'out');
export const LOG_DIR = PACKAGED ? path.join(DATA_DIR, 'logs') : path.join(PANEL_DIR, 'logs');
export const TMP_DIR = PACKAGED ? path.join(DATA_DIR, 'tmp') : path.join(PANEL_DIR, 'tmp');
export const AGENT_DIR = PACKAGED ? path.join(DATA_DIR, 'agent') : path.join(PANEL_DIR, 'agent');
/**
 * The read-only knowledge package (skills/, references/, templates/, config/,
 * manifest, prompts). Dev reads it from the repo checkout; packaged installs
 * ship a real-copy under resources\knowledge because mcp-server.mjs runs
 * under ELECTRON_RUN_AS_NODE, which cannot read inside app.asar.
 */
export const KNOWLEDGE_DIR = PACKAGED
  ? path.join(process.resourcesPath || path.join(path.dirname(process.execPath), 'resources'), 'knowledge')
  : PANEL_DIR;
/**
 * Generated runtime config (paths.yaml, runtime-profile.yaml). These belong
 * to the knowledge package — mcp-server serves `config/` from KNOWLEDGE_DIR —
 * so packaged mode writes into resources\knowledge\config (per-user install,
 * user-writable; regenerated at every startup, so updates replacing
 * resources\ lose nothing).
 */
export const CONFIG_DIR = path.join(KNOWLEDGE_DIR, 'config');
/** Chat transcripts, one JSON file per thread. */
export const CHATS_DIR = PACKAGED ? path.join(DATA_DIR, 'chats') : path.join(PANEL_DIR, 'chats');
/** Service URL + token handshake file for the dev tools. */
export const CONTROL_FILE = PACKAGED
  ? path.join(DATA_DIR, 'control.json')
  : path.join(PANEL_DIR, 'control.json');

for (const dir of [OUT_DIR, LOG_DIR, TMP_DIR, AGENT_DIR, DATA_DIR, CONFIG_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

export function readJson(file, fallback = null) {
  try {
    // Strip a UTF-8 BOM: PowerShell 5.1's `Set-Content -Encoding UTF8` (and
    // some editors) write one, and JSON.parse chokes on it — which would make
    // a perfectly good config.json silently fall back to defaults.
    const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

let writeSeq = 0;

/**
 * Write JSON atomically. A crash or forced exit halfway through a plain
 * writeFileSync leaves a truncated file, and the next launch reads it as
 * "missing" - which is how a whole session registry or transcript can
 * disappear. Write a sibling temp file first, then rename it over the target
 * (an atomic replace on both NTFS and POSIX filesystems).
 */
export function writeJson(file, value) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${++writeSeq}.tmp`);
  try {
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
    fs.renameSync(tmp, file);
  } catch (err) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {}
    throw err;
  }
}

export function stripAnsi(text) {
  return String(text)
    .replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '')
    .replace(/\u001b\][^\u0007]*\u0007/g, '')
    .replace(/\r/g, '\n');
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function round32(value) {
  return Math.max(256, Math.round(Number(value) / 32) * 32);
}

export function stamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-` +
    `${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`
  );
}

export function humanBytes(bytes) {
  if (!bytes && bytes !== 0) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let n = Number(bytes);
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Remove old scratch renders (`pc-preview-*`, `pc-canvas-*`, `pc-ref-*`).
 * Chat transcripts reference these chips, so keep a generous window; the goal
 * is only to stop the tmp folder growing forever, not to reclaim space fast.
 */
export function pruneScratch(maxAgeDays = 14) {
  const cutoff = Date.now() - maxAgeDays * 24 * 3600 * 1000;
  let removed = 0;
  let names = [];
  try {
    names = fs.readdirSync(TMP_DIR);
  } catch {
    return 0;
  }
  for (const name of names) {
    if (!/^(pc-preview|pc-canvas|pc-ref)-.*\.png$/i.test(name)) continue;
    const file = path.join(TMP_DIR, name);
    try {
      const stat = fs.statSync(file);
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(file);
        removed++;
      }
    } catch {}
  }
  return removed;
}
