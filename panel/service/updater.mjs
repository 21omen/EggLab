/**
 * Auto-update (packaged installs only).
 *
 * electron-updater reads `resources\app-update.yml` (generated from the
 * `build.publish` block) and pulls new versions from the GitHub releases of
 * YanNyeinHtet/EggLab. Downloads happen in the background; when one is ready
 * the user is asked to restart. A failed check must never disturb the app -
 * offline machines simply stay on the current version.
 *
 * Testing hook: EGGLAB_UPDATE_AUTO=1 installs immediately without the dialog,
 * so the release pipeline can verify the whole feed → download → NSIS →
 * restart path unattended.
 */
import fs from 'node:fs';
import path from 'node:path';
import { app, dialog } from 'electron';
import electronUpdater from 'electron-updater';
import { emit } from './bus.mjs';
import { LOG_DIR } from './paths.mjs';

const { autoUpdater } = electronUpdater;

let initialized = false;
let checking = false;
let timer = null;

let state = {
  status: 'idle', // idle | dev | checking | current | available | downloading | downloaded | error
  version: null, // version offered by the feed
  current: null,
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
  emit('update', { update: state });
}

export function updateStatus() {
  return {
    ...state,
    current: app.getVersion(),
    packaged: app.isPackaged,
  };
}

/**
 * Check the feed. Safe to call repeatedly: concurrent checks collapse into the
 * running one, and errors only land in `state.error` (never thrown at callers).
 */
export async function checkForUpdates({ userInitiated = false } = {}) {
  if (!app.isPackaged) return { ...updateStatus(), status: 'dev' };
  if (checking) return updateStatus();
  checking = true;
  publish({ status: 'checking', error: null });
  try {
    autoUpdater.checkForUpdates().catch((err) => {
      publish({ status: 'error', error: String(err?.message || err).slice(0, 300) });
    });
    if (userInitiated) log('check requested by user');
  } catch (err) {
    publish({ status: 'error', error: String(err?.message || err).slice(0, 300) });
  } finally {
    checking = false;
  }
  return updateStatus();
}

function askToRestart() {
  if (process.env.EGGLAB_UPDATE_AUTO === '1') {
    log('auto-installing (EGGLAB_UPDATE_AUTO=1)');
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
    return;
  }
  dialog
    .showMessageBox({
      type: 'info',
      title: 'EggLab update ready',
      message: `EggLab ${state.version} is ready to install.`,
      detail: 'Restart now to finish the update. Your chats and settings are kept.',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    })
    .then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall(true, true);
    })
    .catch(() => {});
}

export function initUpdater() {
  if (initialized || !app.isPackaged) return false;
  initialized = true;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.logger = {
    info: (m) => log(`info ${m}`),
    warn: (m) => log(`warn ${m}`),
    error: (m) => log(`error ${m}`),
    debug: (m) => log(`debug ${m}`),
  };

  autoUpdater.on('checking-for-update', () => publish({ status: 'checking' }));
  autoUpdater.on('update-available', (info) => {
    publish({ status: 'available', version: info?.version || null });
  });
  autoUpdater.on('update-not-available', () => {
    publish({ status: 'current', version: null, percent: 0 });
  });
  autoUpdater.on('download-progress', (progress) => {
    publish({
      status: 'downloading',
      percent: Math.max(0, Math.min(100, Math.round(progress?.percent || 0))),
    });
  });
  autoUpdater.on('update-downloaded', (info) => {
    publish({ status: 'downloaded', version: info?.version || state.version, percent: 100 });
    askToRestart();
  });
  autoUpdater.on('error', (err) => {
    publish({ status: 'error', error: String(err?.message || err).slice(0, 300) });
  });

  // First check after the window settles, then a slow periodic poll. GitHub's
  // release API is rate limited per address; six hours is plenty for a desktop
  // app and invisible to the user.
  setTimeout(() => checkForUpdates(), 12000).unref?.();
  timer = setInterval(() => checkForUpdates(), 6 * 60 * 60 * 1000);
  timer.unref?.();
  return true;
}
