/**
 * Auto-update (packaged installs only).
 *
 * Deliberately does NOT use electron-updater's transport: that downloads
 * through Chromium's network stack, which fails TLS to GitHub's asset CDN
 * (`objects.githubusercontent.com` → net::ERR_CONNECTION_RESET) on networks
 * that break certificate-revocation checks. The exact same problem is why the
 * engine downloader uses `curl --ssl-no-revoke`. So:
 *
 *   check    Node fetch → api.github.com/repos/<owner>/<repo>/releases/latest
 *            (the API also publishes a sha256 digest per asset)
 *   download curl.exe with --ssl-no-revoke, resume and a stall guard
 *   verify   SHA-256 against the API digest before anything is executed
 *   install  run the NSIS installer silently (`/S --force-run`), then exit
 *
 * A failed check or download only lands in `state.error`; the app keeps
 * running on the current version and retries on the next launch/6h poll.
 *
 * Testing hook: EGGLAB_UPDATE_AUTO=1 installs without the restart dialog so
 * the release pipeline can verify fetch → download → verify → install
 * unattended.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { app, dialog } from 'electron';
import { emit } from './bus.mjs';
import { LOG_DIR, UPDATES_DIR } from './paths.mjs';

const OWNER = 'YanNyeinHtet';
const REPO = 'EggLab';
const API_URL = `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`;

let initialized = false;
let checking = false;
let downloading = false;
let timer = null;
let readyFile = null;

let state = {
  status: 'idle', // idle | dev | checking | current | available | downloading | downloaded | error
  version: null,
  percent: 0,
  error: null,
  at: null,
};

function log(line) {
  try {
    fs.appendFileSync(path.join(LOG_DIR, 'update.log'), `${new Date().toISOString()} ${line}\n`);
  } catch {}
}

function publish(next) {
  state = { ...state, ...next, at: Date.now() };
  log(`${state.status} ${state.version || ''} ${state.percent || ''} ${state.error || ''}`.trim());
  emit('update', { update: updateStatus() });
}

export function updateStatus() {
  return {
    ...state,
    current: app.getVersion(),
    packaged: app.isPackaged,
  };
}

function versionParts(value) {
  return String(value || '')
    .replace(/^v/i, '')
    .split(/[.\-+]/)
    .slice(0, 3)
    .map((part) => Number(part) || 0);
}

function isNewer(remote, current) {
  const a = versionParts(remote);
  const b = versionParts(current);
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

async function fetchLatestRelease() {
  const res = await fetch(API_URL, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': `EggLab/${app.getVersion()}`,
    },
    signal: AbortSignal.timeout(12000),
  });
  if (res.status === 404) return null; // repository exists but no release yet
  if (res.status === 403) throw new Error('GitHub API rate limit reached - try again later.');
  if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
  return await res.json();
}

function sha256(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(file);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function runCurl(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('curl.exe', args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      if (stderr.length > 8000) stderr = stderr.slice(-4000);
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`curl exited ${code}${stderr ? `: ${stderr.trim().split(/\r?\n/).slice(-1)[0]}` : ''}`));
    });
  });
}

async function downloadAsset(asset, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const part = `${dest}.part`;
  const total = Number(asset.size) || 0;
  const tick = setInterval(() => {
    let size = 0;
    try {
      size = fs.statSync(part).size;
    } catch {}
    publish({
      status: 'downloading',
      percent: total ? Math.min(99, Math.floor((size / total) * 100)) : 0,
    });
  }, 700);

  // Some networks reset TLS sessions mid-handshake (this is also why the
  // engine downloader uses --ssl-no-revoke). curl's own --retry does not
  // cover every transport error, so retry the whole transfer here; -C -
  // resumes from the .part file instead of starting over.
  try {
    let lastError = null;
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        await runCurl([
          '-L',
          '--ssl-no-revoke',
          '--retry',
          '5',
          '--retry-all-errors',
          '-C',
          '-',
          '--connect-timeout',
          '20',
          '--speed-limit',
          '1024',
          '--speed-time',
          '60',
          '-o',
          part,
          '--',
          asset.browser_download_url,
        ]);
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        let have = 0;
        try {
          have = fs.statSync(part).size;
        } catch {}
        log(`download attempt ${attempt} failed at ${have} bytes: ${err?.message || err}`);
        if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, attempt * 3000));
      }
    }
    if (lastError) throw lastError;
  } finally {
    clearInterval(tick);
  }

  const got = fs.statSync(part).size;
  if (total && got !== total) {
    throw new Error(`Download incomplete (${got} of ${total} bytes). It will resume next time.`);
  }
  const digest = String(asset.digest || '').replace(/^sha256:/i, '').toLowerCase();
  if (digest) {
    const have = (await sha256(part)).toLowerCase();
    if (have !== digest) {
      try {
        fs.rmSync(part, { force: true });
      } catch {}
      throw new Error('Download checksum mismatch - discarded the file.');
    }
  }
  fs.renameSync(part, dest);
  return dest;
}

function installNow() {
  const file = readyFile;
  if (!file || !fs.existsSync(file)) {
    log('install skipped: installer file missing');
    return;
  }
  log(`installing ${file}`);
  try {
    // NSIS removes the program files before copying the new build. A running
    // app - or a leftover Electron renderer that shares the EggLab.exe name -
    // keeps those files locked, and the old-uninstaller step then aborts with
    // "file is busy" (surfaced as "Failed to uninstall old application
    // files"). The app cannot fix that after it exits, so hand over to a
    // detached helper script that: waits briefly for this process, force-stops
    // every remaining EggLab process, and only then starts the installer.
    fs.mkdirSync(UPDATES_DIR, { recursive: true });
    const helperPath = path.join(UPDATES_DIR, 'install-helper.ps1');
    const psQuote = (value) => String(value).replace(/'/g, "''");
    const helper = [
      "$ErrorActionPreference = 'SilentlyContinue'",
      `$log = '${psQuote(path.join(LOG_DIR, 'update.log'))}'`,
      `Add-Content -LiteralPath $log -Value ('[' + (Get-Date -Format o) + '] helper: start (pid=${process.pid})')`,
      '$deadline = (Get-Date).AddSeconds(8)',
      `while ((Get-Process -Id ${process.pid} -ErrorAction SilentlyContinue) -and ((Get-Date) -lt $deadline)) { Start-Sleep -Milliseconds 250 }`,
      'for ($i = 0; $i -lt 20; $i++) {',
      '  $procs = Get-Process -Name EggLab -ErrorAction SilentlyContinue',
      '  if (-not $procs) { break }',
      '  $procs | Stop-Process -Force -ErrorAction SilentlyContinue',
      '  Start-Sleep -Milliseconds 300',
      '}',
      'Start-Sleep -Milliseconds 500',
      `Add-Content -LiteralPath $log -Value ('[' + (Get-Date -Format o) + '] helper: starting installer')`,
      `Start-Process -FilePath '${psQuote(file)}' -ArgumentList '/S','--force-run'`,
    ].join('\r\n');
    fs.writeFileSync(helperPath, helper, 'utf8');
    spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', helperPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    }).unref();
  } catch (err) {
    log(`install spawn failed ${err?.message || err}`);
    return;
  }
  setTimeout(() => app.exit(0), 400);
}

function askToRestart() {
  if (process.env.EGGLAB_UPDATE_AUTO === '1') {
    log('auto-installing (EGGLAB_UPDATE_AUTO=1)');
    setImmediate(installNow);
    return;
  }
  dialog
    .showMessageBox({
      type: 'info',
      title: 'EggLab update ready',
      message: `EggLab ${state.version} is ready to install.`,
      detail: 'Restart now to finish the update. Your chats, settings and models are kept.',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    })
    .then(({ response }) => {
      if (response === 0) installNow();
    })
    .catch(() => {});
}

export async function checkForUpdates({ userInitiated = false } = {}) {
  if (!app.isPackaged) return { ...updateStatus(), status: 'dev' };
  if (checking || downloading) return updateStatus();
  checking = true;
  publish({ status: 'checking', error: null, percent: 0 });
  try {
    const release = await fetchLatestRelease();
    if (!release) {
      publish({ status: 'current', version: null });
      return updateStatus();
    }
    const version = String(release.tag_name || '').replace(/^v/i, '');
    const asset = (release.assets || []).find((item) => /^EggLab-Setup-.*\.exe$/i.test(item.name || ''));
    if (!asset || !version || !isNewer(version, app.getVersion())) {
      publish({ status: 'current', version: null, percent: 0 });
      if (userInitiated) log(`up to date (latest release: ${version || 'none'})`);
      return updateStatus();
    }

    publish({ status: 'available', version });
    const dest = path.join(UPDATES_DIR, asset.name);
    downloading = true;
    try {
      if (fs.existsSync(dest)) {
        const digest = String(asset.digest || '').replace(/^sha256:/i, '').toLowerCase();
        const ok = digest ? (await sha256(dest)).toLowerCase() === digest : true;
        if (!ok) {
          log('cached installer failed verification, re-downloading');
          try {
            fs.rmSync(dest, { force: true });
          } catch {}
        }
      }
      if (!fs.existsSync(dest)) await downloadAsset(asset, dest);
      readyFile = dest;
      publish({ status: 'downloaded', version, percent: 100 });
      askToRestart();
    } finally {
      downloading = false;
    }
  } catch (err) {
    publish({ status: 'error', error: String(err?.message || err).slice(0, 300) });
  } finally {
    checking = false;
  }
  return updateStatus();
}

export function installUpdate() {
  installNow();
}

export function initUpdater() {
  if (initialized || !app.isPackaged) return false;
  initialized = true;

  // Leftovers from an interrupted download: keep the finished installer (it is
  // verified and reused on the next check), drop partial files.
  try {
    fs.mkdirSync(UPDATES_DIR, { recursive: true });
    for (const file of fs.readdirSync(UPDATES_DIR)) {
      if (file.endsWith('.part') || file.endsWith('.ps1')) {
        fs.rmSync(path.join(UPDATES_DIR, file), { force: true });
      }
    }
  } catch {}

  // First check after the window settles, then a slow periodic poll. The
  // unauthenticated GitHub API allows 60 requests/hour per address.
  setTimeout(() => checkForUpdates(), 12000).unref?.();
  timer = setInterval(() => checkForUpdates(), 6 * 60 * 60 * 1000);
  timer.unref?.();
  return true;
}
