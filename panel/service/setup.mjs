/**
 * First-run setup: detect the pieces EggLab needs and fetch the ones that can
 * be installed automatically.
 *
 *   PhotoCraft   companion app; detect + let the user locate its exe
 *   OpenCode     agent runtime; standalone zip from the pinned release
 *   Engine       stable-diffusion.cpp; the same resumable downloader the
 *                installer uses (engine-install.ps1)
 *   Models       never bundled; HF downloads (resumable) or a manual file
 *
 * Everything reports through the bus (`setup` events) so the wizard can show
 * live progress while the HTTP API and the renderer stay decoupled.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { emit } from './bus.mjs';
import {
  BIN_DIR,
  ENGINE_DIR,
  ENGINE_INSTALL_PS1,
  TMP_DIR,
  humanBytes,
  readJson,
} from './paths.mjs';
import {
  clearOpenCodeCache,
  detectPhotoCraft,
  engineConfig,
  getSettings,
  patchSettings,
  resolveOpenCode,
} from './settings.mjs';
import { modelStatus, useVariant, variantForFile } from './models.mjs';

const execFileAsync = promisify(execFile);

/* ------------------------------------------------------------------ */
/* volatile state (progress of long-running setup actions)             */
/* ------------------------------------------------------------------ */

const state = {
  engine: { running: false, variant: '', error: null, log: [] },
  opencode: { running: false, phase: '', received: 0, total: 0, error: null },
  importing: { running: false, file: '', received: 0, total: 0, error: null },
};

function engineInfo() {
  const cfg = engineConfig();
  return readJson(path.join(cfg.engine, 'engine-info.json'), null);
}

function opencodeFound() {
  const oc = resolveOpenCode();
  if (!oc || !oc.cmd || oc.cmd === 'opencode') return null;
  try {
    if (!fs.existsSync(oc.cmd)) return null;
  } catch {
    return null;
  }
  return oc;
}

/* ------------------------------------------------------------------ */
/* status                                                              */
/* ------------------------------------------------------------------ */

export async function setupStatus() {
  const s = getSettings();
  const cfg = engineConfig();
  const status = modelStatus();
  const info = engineInfo();
  const oc = opencodeFound();
  const pcExe = String(s.photocraft?.exe || '');
  let pcFound = false;
  try {
    pcFound = Boolean(pcExe) && fs.existsSync(pcExe);
  } catch {}

  const missing = status.entries
    .filter((entry) => entry.required && !entry.exists)
    .map((entry) => entry.id);

  const engineInstalled = Boolean(status.engineReady);
  const done = Boolean(s.setup?.completed);

  return {
    done,
    firstRun: !done,
    ready: pcFound && Boolean(oc) && engineInstalled && missing.length === 0,
    photocraft: {
      found: pcFound,
      exe: pcExe,
      projectRoot: s.photocraft?.projectRoot || '',
    },
    opencode: {
      found: Boolean(oc),
      exe: oc?.cmd || '',
      running: state.opencode.running,
      phase: state.opencode.phase,
      received: state.opencode.received,
      total: state.opencode.total,
      error: state.opencode.error,
    },
    engine: {
      installed: engineInstalled,
      dir: cfg.engine,
      variant: info?.variant || null,
      release: info?.release || null,
      running: state.engine.running,
      error: state.engine.error,
      log: state.engine.log.slice(-6),
    },
    models: {
      dir: cfg.models,
      ready: missing.length === 0,
      missing,
      entries: status.entries.map((entry) => ({
        id: entry.id,
        label: entry.label,
        required: entry.required,
        exists: entry.exists,
        sizeText: entry.sizeText,
        file: entry.file,
      })),
      importing: { ...state.importing },
    },
  };
}

/**
 * Re-run detection (fresh machine, app installed after boot, PATH changed).
 * Only real findings are persisted; "not found" keeps whatever the user set.
 */
export async function refreshDetection() {
  const s = getSettings();
  const patch = {};
  if (!s.photocraft?.exe || !fs.existsSync(s.photocraft.exe)) {
    const dir = detectPhotoCraft();
    if (dir) {
      const cli = path.join(dir, 'photocraft-cli.exe');
      patch.photocraft = {
        exe: path.join(dir, 'photocraft.exe'),
        ...(fs.existsSync(cli) ? { cli } : {}),
      };
    }
  }
  clearOpenCodeCache();
  const oc = resolveOpenCode();
  if (oc.cmd !== 'opencode' && fs.existsSync(oc.cmd) && oc.cmd !== s.opencode?.exe) {
    patch.opencode = { exe: oc.cmd };
  }
  if (Object.keys(patch).length) patchSettings(patch);
  return setupStatus();
}

/* ------------------------------------------------------------------ */
/* PhotoCraft                                                          */
/* ------------------------------------------------------------------ */

export async function setPhotoCraft(filePath) {
  const exe = path.resolve(String(filePath || ''));
  let stat = null;
  try {
    stat = fs.statSync(exe);
  } catch {}
  if (!stat || !stat.isFile()) throw new Error('That PhotoCraft executable does not exist.');
  if (!/\.exe$/i.test(exe)) throw new Error('Pick the PhotoCraft .exe file.');
  const cli = path.join(path.dirname(exe), 'photocraft-cli.exe');
  patchSettings({
    photocraft: {
      exe,
      ...(fs.existsSync(cli) ? { cli } : {}),
    },
  });
  emit('settings', { settings: getSettings() });
  return setupStatus();
}

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

export async function installEngine(variant = 'auto', force = false) {
  if (state.engine.running) return { started: false, running: true };
  if (!fs.existsSync(ENGINE_INSTALL_PS1)) {
    throw new Error(`Engine downloader missing: ${ENGINE_INSTALL_PS1}`);
  }
  const wanted = ['auto', 'cuda', 'vulkan', 'cpu'].includes(variant) ? variant : 'auto';
  state.engine = { running: true, variant: wanted, error: null, log: [] };
  emit('setup', { step: 'engine', status: 'running', variant: wanted });

  const args = [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    ENGINE_INSTALL_PS1,
    '-EngineDir',
    ENGINE_DIR,
    '-Variant',
    wanted,
  ];
  if (force) args.push('-Force');

  const child = spawn('powershell.exe', args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const push = (chunk) => {
    for (const line of String(chunk).split(/\r?\n/)) {
      if (!line.trim()) continue;
      state.engine.log.push(line);
      if (state.engine.log.length > 300) state.engine.log.shift();
      emit('setup', { step: 'engine', status: 'running', line });
    }
  };
  child.stdout.on('data', push);
  child.stderr.on('data', push);
  child.on('error', (err) => {
    state.engine.running = false;
    state.engine.error = err.message;
    emit('setup', { step: 'engine', status: 'error', error: err.message });
  });
  child.on('exit', (code) => {
    state.engine.running = false;
    if (code !== 0) {
      state.engine.error = `Engine download failed (exit ${code}).`;
      emit('setup', { step: 'engine', status: 'error', error: state.engine.error });
    } else {
      state.engine.error = null;
      emit('setup', { step: 'engine', status: 'done' });
    }
    emit('models', { status: modelStatus() });
  });
  return { started: true, variant: wanted };
}

/* ------------------------------------------------------------------ */
/* OpenCode                                                            */
/* ------------------------------------------------------------------ */

// Pinned: the standalone Windows build used by the wizard. Users with their
// own install (npm/scoop/…) never hit this path.
const OPENCODE_VERSION = '1.19.5';
const OPENCODE_ZIP = `https://github.com/anomalyco/opencode/releases/download/v${OPENCODE_VERSION}/opencode-windows-x64.zip`;

function systemTar() {
  const root = process.env.SystemRoot || 'C:\\Windows';
  return path.join(root, 'System32', 'tar.exe');
}

function spawnWait(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true, ...options });
    let stderr = '';
    child.stderr?.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(cmd)} exited ${code}${stderr ? `: ${stderr.trim().slice(0, 300)}` : ''}`));
    });
  });
}

/** Download with `.part` resume; reports progress through `onProgress`. */
async function downloadFile(url, dest, onProgress) {
  const part = `${dest}.part`;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  let offset = 0;
  try {
    offset = fs.statSync(part).size;
  } catch {}
  const headers = { 'user-agent': 'EggLab/0.1' };
  if (offset > 0) headers.range = `bytes=${offset}-`;
  const res = await fetch(url, { redirect: 'follow', headers });
  if (res.status === 416) {
    try {
      fs.rmSync(part, { force: true });
    } catch {}
    throw new Error('The partial download does not match the remote file. Press install again.');
  }
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${url}`);
  let append = false;
  let total = 0;
  if (res.status === 206) {
    append = offset > 0;
    const found = String(res.headers.get('content-range') || '').match(/\/(\d+)\s*$/);
    total = found ? Number(found[1]) : offset + (Number(res.headers.get('content-length')) || 0);
  } else {
    total = Number(res.headers.get('content-length')) || 0;
  }
  let received = append ? offset : 0;
  onProgress?.(received, total);

  const out = fs.createWriteStream(part, append ? { flags: 'a' } : undefined);
  const reader = res.body.getReader();
  let lastEmit = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!out.write(Buffer.from(value))) {
      await new Promise((resolve) => out.once('drain', resolve));
    }
    received += value.length;
    const now = Date.now();
    if (now - lastEmit > 300) {
      lastEmit = now;
      onProgress?.(received, total);
    }
  }
  await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
  const finalSize = fs.statSync(part).size;
  if (total && finalSize !== total) {
    throw new Error(`Download incomplete (${humanBytes(finalSize)} of ${humanBytes(total)}).`);
  }
  fs.renameSync(part, dest);
  return dest;
}

function findFile(dir, name) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const hit = findFile(full, name);
      if (hit) return hit;
    } else if (entry.name.toLowerCase() === name.toLowerCase()) {
      return full;
    }
  }
  return null;
}

async function extractZip(zip, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  if (fs.existsSync(systemTar())) {
    await spawnWait(systemTar(), ['-xf', zip, '-C', destDir]);
    return;
  }
  await spawnWait('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
  ]);
}

async function openCodeVersion(exe) {
  try {
    const { stdout } = await execFileAsync(exe, ['--version'], {
      windowsHide: true,
      timeout: 20000,
      maxBuffer: 1024 * 1024,
    });
    return String(stdout).trim().split(/\r?\n/)[0] || 'unknown';
  } catch {
    return null;
  }
}

export async function installOpencode() {
  if (state.opencode.running) return { started: false, running: true };
  state.opencode = { running: true, phase: 'downloading', received: 0, total: 0, error: null };
  emit('setup', { step: 'opencode', status: 'downloading' });

  (async () => {
    const zip = path.join(TMP_DIR, `opencode-windows-x64-${OPENCODE_VERSION}.zip`);
    await downloadFile(OPENCODE_ZIP, zip, (received, total) => {
      state.opencode.received = received;
      state.opencode.total = total;
      emit('setup', { step: 'opencode', status: 'downloading', received, total });
    });

    state.opencode.phase = 'extracting';
    emit('setup', { step: 'opencode', status: 'extracting' });
    const dest = path.join(BIN_DIR, 'opencode');
    fs.rmSync(dest, { recursive: true, force: true });
    await extractZip(zip, dest);

    const exe = findFile(dest, 'opencode.exe');
    if (!exe) throw new Error('opencode.exe was not found inside the downloaded archive.');
    const version = await openCodeVersion(exe);
    if (!version) throw new Error('The downloaded OpenCode binary did not start correctly.');

    patchSettings({ opencode: { exe } });
    clearOpenCodeCache();
    state.opencode.phase = 'done';
    state.opencode.received = state.opencode.total;
    emit('setup', { step: 'opencode', status: 'done', exe, version });
    emit('settings', { settings: getSettings() });
  })()
    .catch((err) => {
      state.opencode.error = err.message;
      state.opencode.phase = 'error';
      emit('setup', { step: 'opencode', status: 'error', error: err.message });
    })
    .finally(() => {
      state.opencode.running = false;
      try {
        fs.rmSync(path.join(TMP_DIR, `opencode-windows-x64-${OPENCODE_VERSION}.zip`), { force: true });
      } catch {}
    });

  return { started: true, url: OPENCODE_ZIP };
}

/* ------------------------------------------------------------------ */
/* Models                                                              */
/* ------------------------------------------------------------------ */

/**
 * Install a model the user already has on disk (wizard "add from file" or
 * drag-and-drop). Only files EggLab's engine config can point at are accepted;
 * the copy is streamed so a 14 GB weight file does not sit in memory.
 */
export async function importModelFile(filePath) {
  const src = path.resolve(String(filePath || ''));
  let stat = null;
  try {
    stat = fs.statSync(src);
  } catch {}
  if (!stat || !stat.isFile()) throw new Error('That model file does not exist.');

  const base = path.basename(src);
  const target = variantForFile(base);
  if (!target) {
    throw new Error(
      `"${base}" is not a file EggLab can use. Expected one of the model files listed in the Models card.`
    );
  }

  const cfg = engineConfig();
  const dest = path.join(cfg.models, base);
  if (path.resolve(dest) !== src) {
    state.importing = { running: true, file: base, received: 0, total: stat.size, error: null };
    emit('setup', { step: 'import', status: 'copying', file: base, received: 0, total: stat.size });
    try {
      fs.mkdirSync(cfg.models, { recursive: true });
      const part = `${dest}.part`;
      const input = fs.createReadStream(src);
      const output = fs.createWriteStream(part);
      let received = 0;
      let lastEmit = 0;
      await new Promise((resolve, reject) => {
        input.on('data', (chunk) => {
          received += chunk.length;
          const now = Date.now();
          if (now - lastEmit > 400) {
            lastEmit = now;
            state.importing.received = received;
            emit('setup', {
              step: 'import',
              status: 'copying',
              file: base,
              received,
              total: stat.size,
            });
          }
        });
        input.on('error', reject);
        output.on('error', reject);
        output.on('finish', resolve);
        input.pipe(output);
      });
      const copied = fs.statSync(part).size;
      if (stat.size && copied !== stat.size) {
        throw new Error(`Copy incomplete (${humanBytes(copied)} of ${humanBytes(stat.size)}).`);
      }
      try {
        fs.rmSync(dest, { force: true });
      } catch {}
      fs.renameSync(part, dest);
    } catch (err) {
      state.importing = { ...state.importing, running: false, error: err.message };
      emit('setup', { step: 'import', status: 'error', file: base, error: err.message });
      throw err;
    }
  }

  // Point the engine config at the imported file (validates it exists on disk).
  const status = useVariant(target.entryId, target.file);
  state.importing = { running: false, file: base, received: stat.size, total: stat.size, error: null };
  emit('setup', { step: 'import', status: 'done', file: base });
  return status;
}

/* ------------------------------------------------------------------ */
/* completion                                                          */
/* ------------------------------------------------------------------ */

export async function completeSetup() {
  patchSettings({ setup: { completed: true, at: new Date().toISOString() } });
  return setupStatus();
}
