import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { IS_WIN, userDirs } from './platform.mjs';

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
 * On Linux the same split follows XDG: ~/.config/egglab and
 * ~/.local/share/egglab (see platform.userDirs).
 *
 * Dev keeps the historic repo layout byte-for-byte, so nothing changes while
 * developing. PACKAGED is detected from the module's own location rather than
 * `app.isPackaged`, because this file also loads under plain node (tools,
 * tests, and ELECTRON_RUN_AS_NODE children) where electron is not importable.
 * ------------------------------------------------------------------------ */
export const PACKAGED = /app\.asar/.test(fileURLToPath(import.meta.url));

const USER = userDirs('EggLab');
/** User data root: `%APPDATA%\EggLab` when packaged, the panel dir in dev. */
export const DATA_DIR = PACKAGED ? USER.data : PANEL_DIR;

/** Where the downloaded engine (sd-cli + backend DLLs) lives. */
export const ENGINE_DIR = PACKAGED
  ? path.join(USER.local, 'engine')
  : path.join(ROOT, 'engine');
/** Where an on-demand OpenCode install would be extracted (wizard, Phase 2). */
export const BIN_DIR = PACKAGED
  ? path.join(USER.local, 'bin')
  : path.join(ROOT, 'bin');

/** Downloaded update installers (large, local-only) until they are applied. */
export const UPDATES_DIR = PACKAGED
  ? path.join(USER.local, 'updates')
  : path.join(ROOT, '.updates');

// Default models folder: the sibling `Models` directory the dev checkout has
// always used (present next to the repo), else a per-user folder. Never a
// hardcoded machine path — the repo is published.
const siblingModels = path.join(ROOT, '..', 'Models');
export const MODELS_DIR = fs.existsSync(siblingModels)
  ? siblingModels
  : path.join(USER.local, 'models');

// Where the Electron shell keeps its immutable payload (app.asar + the files we
// ship as extraResources). Null in dev, where everything lives in the checkout.
const RESOURCES_DIR = PACKAGED
  ? process.resourcesPath || path.join(path.dirname(process.execPath), 'resources')
  : null;

// The engine runner script. Packaged installs ship it via extraResources
// (spawn cannot execute files inside app.asar); dev runs it from the repo root.
export const EGGLAB_PS1 = PACKAGED
  ? path.join(RESOURCES_DIR, 'egglab.ps1')
  : path.join(ROOT, 'egglab.ps1');
/**
 * The same runner in Node, used where PowerShell is not available (Linux).
 * It takes the egglab.ps1 parameter names, so the panel builds one argument
 * list for both.
 */
export const EGGLAB_RUN_MJS = PACKAGED
  ? path.join(RESOURCES_DIR, 'egglab-run.mjs')
  : path.join(ROOT, 'egglab-run.mjs');

/**
 * The shared engine downloader (installer + first-run wizard). The NSIS
 * installer ships it in resources\; dev keeps it next to the build config.
 */
export const ENGINE_INSTALL_PS1 = PACKAGED
  ? path.join(RESOURCES_DIR, 'engine-install.ps1')
  : path.join(PANEL_DIR, 'build', 'engine-install.ps1');
/** Linux engine installer (builds the pinned stable-diffusion.cpp). */
export const ENGINE_INSTALL_SH = PACKAGED
  ? path.join(RESOURCES_DIR, 'engine-install.sh')
  : path.join(PANEL_DIR, 'build', 'engine-install.sh');
/** The engine installer for this platform. */
export const ENGINE_INSTALLER = IS_WIN ? ENGINE_INSTALL_PS1 : ENGINE_INSTALL_SH;

export const OUT_DIR = PACKAGED ? path.join(DATA_DIR, 'out') : path.join(ROOT, 'out');
export const LOG_DIR = PACKAGED ? path.join(DATA_DIR, 'logs') : path.join(PANEL_DIR, 'logs');
export const TMP_DIR = PACKAGED ? path.join(DATA_DIR, 'tmp') : path.join(PANEL_DIR, 'tmp');
// The agent workspace must not sit inside the repo checkout on Linux: OpenCode
// also loads the repo-root opencode.json (a developer config whose relative
// `egl` command then resolves against the wrong folder and carries no panel
// URL/token), and the agent loses every egl_* tool. Windows dev keeps the
// historic location.
export const AGENT_DIR = PACKAGED
  ? path.join(DATA_DIR, 'agent')
  : IS_WIN
    ? path.join(PANEL_DIR, 'agent')
    : path.join(USER.local, 'agent');
/**
 * Runtime workspace for the beta agent (`egglab-beta`). Separate folder and a
 * separate OpenCode project scope: beta chats cannot inherit official-agent
 * sessions and vice versa, and beta can diverge freely without touching the
 * official agent's workspace.
 */
export const AGENT_BETA_DIR = PACKAGED
  ? path.join(DATA_DIR, 'agent-beta')
  : path.join(PANEL_DIR, 'agent-beta');
/**
 * The read-only knowledge package (skills/, references/, templates/, config/,
 * manifest, prompts). Dev reads it from the repo checkout; packaged installs
 * ship a real-copy under resources\knowledge because mcp-server.mjs runs
 * under ELECTRON_RUN_AS_NODE, which cannot read inside app.asar.
 */
export const KNOWLEDGE_DIR = PACKAGED
  ? path.join(RESOURCES_DIR, 'knowledge')
  : PANEL_DIR;
/**
 * The beta agent's knowledge package. Dev reads it from panel/beta-agent;
 * packaged installs ship a real copy under resources\knowledge-beta (mcp-server
 * serves it with an EGGLAB_KNOWLEDGE_ROOT override). The official package stays
 * untouched while beta diverges.
 */
export const KNOWLEDGE_BETA_DIR = PACKAGED
  ? path.join(RESOURCES_DIR, 'knowledge-beta')
  : path.join(PANEL_DIR, 'beta-agent');
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
