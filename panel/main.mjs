import { app, BrowserWindow, ipcMain, dialog, screen, shell, protocol, net, globalShortcut } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { onEvent, emit } from './service/bus.mjs';
import { startServer, TOKEN } from './service/http.mjs';
import { getSettings, patchSettings, opencodeModels } from './service/settings.mjs';
import { engineStatus, listJobs, startJob, cancelJob } from './service/engine.mjs';
import { modelStatus, startDownloads, cancelDownload, useVariant } from './service/models.mjs';
import * as pc from './service/photocraft.mjs';
import * as chat from './service/chat.mjs';
import * as sessions from './service/sessions.mjs';
import * as setup from './service/setup.mjs';
import { CONTROL_FILE, DATA_DIR, LOG_DIR, OUT_DIR, PANEL_DIR, TMP_DIR, pruneScratch } from './service/paths.mjs';

protocol.registerSchemesAsPrivileged([
  { scheme: 'egl', privileges: { standard: false, secure: true, supportFetchAPI: true, stream: true } },
]);

let win = null;
let serviceUrl = null;
let dockProc = null;
// The egg floats above PhotoCraft by default. The pin button can opt out.
let pinned = true;

/* ------------------------------------------------------------------ */
/* floating egg shell                                                  */
/* ------------------------------------------------------------------ */

// Collapsed: a single egg with enough transparent gutter for its shadow.
// Expanded: the chat surface. Both are fixed — the shell never resizes freely.
const EGG = { width: 108, height: 128 };
const PANEL = { width: 464, height: 676 };
const WINDOW_STATE_FILE = path.join(DATA_DIR, 'window-state.json');

let shellExpanded = false;
let eggAnchor = null;
let applyingBounds = false;
let suppressMoveUntil = 0;
let windowSaveTimer = 0;

/**
 * Append one line to the main log. Module scope so IPC handlers (session
 * switches, clears, deletes) leave the same evidence as the document watcher —
 * without a line here, a thread change is invisible when a switch goes wrong.
 */
const trace = (msg) => {
  try {
    fs.appendFileSync(path.join(LOG_DIR, 'main.log'), `${new Date().toISOString()} ${msg}\n`);
  } catch {}
};

/**
 * After the user picks a chat in the list, PhotoCraft needs a moment to bring
 * its document to the front. The document watcher stays quiet for this long so
 * it cannot snap the thread back before the canvas catches up.
 */
let holdSyncUntil = 0;

function shellLog(message) {
  try {
    fs.appendFileSync(
      path.join(LOG_DIR, 'main.log'),
      `${new Date().toISOString()} shell ${message}\n`,
    );
  } catch {}
}

function readWindowState() {
  try {
    const raw = JSON.parse(fs.readFileSync(WINDOW_STATE_FILE, 'utf8'));
    const x = Number(raw?.egg?.x);
    const y = Number(raw?.egg?.y);
    if (Number.isFinite(x) && Number.isFinite(y)) return { x: Math.round(x), y: Math.round(y) };
  } catch {}
  return null;
}

function writeWindowState() {
  try {
    fs.writeFileSync(
      WINDOW_STATE_FILE,
      JSON.stringify({ egg: eggAnchor, at: new Date().toISOString() }, null, 2),
      'utf8',
    );
  } catch {}
}

function scheduleWindowSave() {
  clearTimeout(windowSaveTimer);
  windowSaveTimer = setTimeout(() => {
    windowSaveTimer = 0;
    writeWindowState();
  }, 260);
  windowSaveTimer.unref?.();
}

function clampEggAnchor(point) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  const fallback = defaultEggAnchor();
  if (!Number.isFinite(x) || !Number.isFinite(y)) return fallback;
  const display = screen.getDisplayMatching({
    x: Math.round(x),
    y: Math.round(y),
    width: EGG.width,
    height: EGG.height,
  });
  const work = display.workArea;
  return {
    x: Math.round(Math.max(work.x, Math.min(x, work.x + work.width - EGG.width))),
    y: Math.round(Math.max(work.y, Math.min(y, work.y + work.height - EGG.height))),
  };
}

function defaultEggAnchor() {
  const work = screen.getPrimaryDisplay().workArea;
  return {
    x: Math.round(work.x + work.width - EGG.width - 26),
    y: Math.round(work.y + work.height - EGG.height - 26),
  };
}

function applyBounds(bounds) {
  if (!win || win.isDestroyed()) return;
  applyingBounds = true;
  suppressMoveUntil = Date.now() + 400;
  try {
    win.setBounds(bounds, false);
  } finally {
    applyingBounds = false;
  }
}

function shellPayload() {
  return {
    expanded: shellExpanded,
    bounds: win && !win.isDestroyed() ? win.getBounds() : null,
    egg: eggAnchor,
  };
}

function sendShell(expanded) {
  sendToRenderer('egglab:shell', { expanded });
}

function expandShell() {
  if (!win || win.isDestroyed()) return { expanded: false, bounds: null };
  if (shellExpanded) return shellPayload();
  shellLog('expand');
  const current = win.getBounds();
  eggAnchor = clampEggAnchor({ x: current.x, y: current.y });
  const display = screen.getDisplayMatching({
    x: current.x,
    y: current.y,
    width: current.width,
    height: current.height,
  });
  const work = display.workArea;
  const width = Math.min(PANEL.width, work.width);
  const height = Math.min(PANEL.height, work.height);
  // Open upward from the egg, bottom-aligned, then clamp. If there is no room
  // above, fall back to centring on the egg; the work area always wins.
  let x = Math.round(eggAnchor.x + EGG.width / 2 - width / 2);
  let y = Math.round(eggAnchor.y + EGG.height - height);
  if (y < work.y) y = Math.round(eggAnchor.y + EGG.height / 2 - height / 2);
  x = Math.max(work.x, Math.min(x, work.x + work.width - width));
  y = Math.max(work.y, Math.min(y, work.y + work.height - height));
  applyBounds({ x, y, width, height });
  shellExpanded = true;
  try {
    win.setAlwaysOnTop(true, 'floating');
  } catch {}
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  sendShell(true);
  scheduleWindowSave();
  return shellPayload();
}

function collapseShell() {
  if (!win || win.isDestroyed()) return { expanded: false, bounds: null };
  if (!shellExpanded) return shellPayload();
  shellLog('collapse');
  const anchor = clampEggAnchor(eggAnchor || win.getBounds());
  applyBounds({ x: anchor.x, y: anchor.y, width: EGG.width, height: EGG.height });
  shellExpanded = false;
  sendShell(false);
  // Give focus back to PhotoCraft instead of keeping a hidden chat focused.
  try {
    win.blur();
  } catch {}
  scheduleWindowSave();
  return shellPayload();
}

function toggleShell() {
  return shellExpanded ? collapseShell() : expandShell();
}


const IMAGE_ROOTS = [OUT_DIR, TMP_DIR];

function isAllowedFile(file) {
  const resolved = path.resolve(file);
  return IMAGE_ROOTS.some((root) => resolved.toLowerCase().startsWith(path.resolve(root).toLowerCase()));
}

/* ------------------------------------------------------------------ */
/* window                                                              */
/* ------------------------------------------------------------------ */

function createWindow() {
  eggAnchor = clampEggAnchor(readWindowState() || defaultEggAnchor());
  win = new BrowserWindow({
    x: eggAnchor.x,
    y: eggAnchor.y,
    width: EGG.width,
    height: EGG.height,
    minWidth: EGG.width,
    minHeight: EGG.height,
    maxWidth: PANEL.width,
    maxHeight: PANEL.height,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    show: false,
    skipTaskbar: false,
    title: 'EggLab',
    webPreferences: {
      preload: path.join(PANEL_DIR, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  win.loadFile(path.join(PANEL_DIR, 'renderer', 'index.html'));

  win.once('ready-to-show', () => {
    try {
      win.setAlwaysOnTop(true, 'floating');
    } catch {}
    // The egg must not pull focus away from the editor when it appears.
    win.showInactive();
  });

  win.on('closed', () => {
    shellLog('window closed');
    writeWindowState();
    win = null;
    stopDockWatcher();
  });

  win.on('move', () => {
    if (!win || win.isDestroyed() || applyingBounds) return;
    // setBounds emits move asynchronously on Windows. Ignore the echo so the
    // remembered egg anchor is not rewritten from a programmatic resize.
    if (Date.now() < suppressMoveUntil) return;
    const b = win.getBounds();
    if (shellExpanded) {
      // Dragging the chat header moves the panel. Collapsing should put the egg
      // back near the panel's bottom-left, not at its old pre-expansion spot.
      eggAnchor = clampEggAnchor({ x: b.x + 18, y: b.y + b.height - EGG.height - 18 });
    } else {
      eggAnchor = clampEggAnchor({ x: b.x, y: b.y });
    }
    scheduleWindowSave();
  });
}

function sendToRenderer(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

/**
 * Show a chat's document in PhotoCraft — open the file if it is closed,
 * activate its tab if it is not — so the chat list and the canvas always
 * describe the same thing. Returns false for a key PhotoCraft cannot show
 * (`no-document`, a draft tab that is gone, the editor closed); the chat then
 * simply stays where the user put it until the canvas itself changes.
 */
async function showDocumentForKey(key) {
  const value = String(key || '');
  if (!value || value === 'no-document') return false;
  if (value.toLowerCase().endsWith('.pcraft')) {
    await pc.openProject({ path: value });
    return true;
  }
  if (value.startsWith('untitled:')) {
    const name = value.split(':')[1] || '';
    const state = await pc.projectState();
    const hit = (state.documents || []).find(
      (d) => String(d.label || '').replace(/\.(pcraft|psd|psb)$/i, '') === name,
    );
    if (!hit) return false;
    if (!hit.active) await pc.command('document.activate', { document: hit.index });
    return true;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* docking to the PhotoCraft window                                    */
/* ------------------------------------------------------------------ */

function stopDockWatcher() {
  if (dockProc) {
    try {
      dockProc.kill();
    } catch {}
    dockProc = null;
  }
}

function toggleDock() {
  // Docking belonged to the old full-size panel. The egg shell positions
  // itself, so this stays off and the checkbox is no longer shown.
  stopDockWatcher();
  return false;
}

/* ------------------------------------------------------------------ */
/* app                                                                 */
/* ------------------------------------------------------------------ */

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(async () => {
    trace('ready');
    const server = await startServer();
    serviceUrl = server.url;
    trace(`server ${serviceUrl}`);
    fs.writeFileSync(
      CONTROL_FILE,
      JSON.stringify({ url: serviceUrl, token: TOKEN, at: new Date().toISOString() }, null, 2),
      'utf8',
    );
    trace('control written');
    chat.buildWorkspace({ url: serviceUrl, token: TOKEN });
    trace('workspace built');
    chat.sanitizeOnLoad();
    trace('history sanitized');
    const pruned = chat.pruneOrphanThreads();
    if (pruned) trace(`pruned ${pruned} orphan chat transcript(s)`);
    const scratch = pruneScratch();
    if (scratch) trace(`pruned ${scratch} stale reference render(s)`);

    /**
     * Follow the active PhotoCraft document: when the user switches tabs in
     * the editor, the chat switches to that project's own thread and session.
     * Polling is the only signal available — PhotoCraft emits no event when the
     * active document changes.
     *
     * "Is the chat on the right thread?" is answered by comparing PhotoCraft's
     * document with `chat.documentKey()` — the thread actually loaded. It used
     * to be answered against a remembered copy of the key, so any change made
     * outside this watcher (a pick in the session list, a cleared or deleted
     * chat) left the two out of step: the guard then matched on every poll and
     * returned early, and the chat stayed on a thread the canvas no longer
     * owned — it stopped following the document until the next tab switch.
     */
    let lastDocKey = null;
    let lastDocTab = null;
    let lastPcUp = null;
    let sawBusy = false;
    const NO_DOCUMENT = 'no-document';
    const isUntitledKey = (value) => typeof value === 'string' && value.startsWith('untitled:');
    const isPcraftKey = (value) => typeof value === 'string' && value.toLowerCase().endsWith('.pcraft');
    // A thread with no document of its own: it may follow a document that is
    // created for it, but it can never lose one to an unrelated document.
    const isDetachedKey = (value) => value === NO_DOCUMENT || isUntitledKey(value);
    const syncDocument = async () => {
      try {
        // An agent run may create a document. Switching the chat thread while
        // the run is streaming would move the transcript out from under it, so
        // wait until the turn ends — the migration below then carries the whole
        // exchange onto the new document.
        if (chat.isBusy()) {
          sawBusy = true;
          return;
        }
        const state = await pc.projectState();
        if (chat.isBusy()) {
          // A run started while the state call was in flight.
          sawBusy = true;
          return;
        }

        const doc = state.document || null;
        // PhotoCraft closed (or its menu could not be read) is not a document
        // change. Detaching to the no-document chat there used to hide the
        // conversation the user was reading as soon as the editor went away.
        const pcUp = Boolean(state.running) && (!state.error || Boolean(doc));
        if (!pcUp) {
          if (lastPcUp !== false) {
            lastPcUp = false;
            sendToRenderer('egglab:event', {
              type: 'chat',
              action: 'document',
              docKey: chat.documentKey(),
              doc: null,
            });
          }
          return;
        }
        // Coming back up after the editor closed: the status line was cleared
        // then, so a document event must go out even if nothing else moved.
        const cameUp = lastPcUp !== true;
        lastPcUp = true;

        const key = doc?.key || NO_DOCUMENT;
        const activeTab = Array.isArray(state.documents)
          ? state.documents.find((d) => d.active)?.index ?? null
          : null;

        const attachedKey = chat.documentKey();
        const docChanged = key !== lastDocKey;
        const tabChanged = activeTab !== lastDocTab;
        // Nothing moved and the chat already owns this thread.
        if (key === attachedKey && !docChanged && !tabChanged && !cameUp) return;
        // The user just picked a chat and PhotoCraft is still bringing its
        // document forward; do not drag the thread back while it does.
        if (Date.now() < holdSyncUntil) return;
        // Only a poll that really processes a change may spend the flag — a
        // deferred poll still has to run the post-run migration.
        const afterRun = sawBusy;
        if (afterRun) sawBusy = false;

        // Saving an untitled document for the first time changes its identity
        // (untitled:<name>:<w>x<h> -> the real path). Carry its conversation
        // across, but only when the SAME PhotoCraft tab changed identity: a
        // switch between two existing documents must never move a transcript.
        const draftBecameFile =
          lastDocTab !== null &&
          activeTab === lastDocTab &&
          isUntitledKey(lastDocKey) &&
          key !== NO_DOCUMENT &&
          !isUntitledKey(key) &&
          attachedKey === lastDocKey;

        let migrateFrom = draftBecameFile ? lastDocKey : null;
        if (!migrateFrom && afterRun && isDetachedKey(attachedKey) && isDetachedKey(lastDocKey) && isPcraftKey(key)) {
          // The run started with no document of its own — the only session
          // available while PhotoCraft had nothing open, or a draft — and this
          // project file was written during the turn. The conversation belongs
          // with the document it produced, so it follows instead of being
          // abandoned on an empty thread.
          const runAt = chat.lastRunStartedAt();
          let savedDuringRun = false;
          try {
            savedDuringRun = Boolean(runAt) && fs.statSync(key).mtimeMs >= runAt - 2000;
          } catch {}
          if (savedDuringRun) migrateFrom = attachedKey;
        }
        if (migrateFrom) {
          if (chat.migrateThread(migrateFrom, key, doc?.name || null)) trace(`thread migrated -> ${key}`);
        }

        lastDocKey = key;
        lastDocTab = activeTab;
        const result = chat.useDocument(key, doc?.name || null);
        if (result.changed) trace(`thread -> ${key}`);
        sendToRenderer('egglab:event', { type: 'chat', action: 'document', docKey: key, doc });
      } catch (err) {
        // PhotoCraft being closed is normal; keep the last thread.
      }
    };
    syncDocument();
    const docTimer = setInterval(syncDocument, 2500);
    docTimer.unref?.();
    app.on('will-quit', () => clearInterval(docTimer));

    protocol.handle('egl', (request) => {
      try {
        const url = new URL(request.url);
        const file = decodeURIComponent(url.pathname.replace(/^\//, ''));
        if (!isAllowedFile(file) || !fs.existsSync(file)) {
          return new Response('Not found', { status: 404 });
        }
        return net.fetch(pathToFileURL(file).toString());
      } catch {
        return new Response('Bad request', { status: 400 });
      }
    });
    trace('protocol registered');

    createWindow();
    trace('window created');

    // One shortcut brings the assistant back from anywhere. It must never be
    // the only way to reach the egg, so failures are logged, not fatal.
    try {
      const ok = globalShortcut.register('CommandOrControl+Alt+E', () => {
        if (shellExpanded) collapseShell();
        else expandShell();
      });
      trace(`shortcut Ctrl+Alt+E ${ok ? 'registered' : 'unavailable'}`);
    } catch (err) {
      trace(`shortcut failed ${err?.message || err}`);
    }
    app.on('will-quit', () => {
      try {
        globalShortcut.unregisterAll();
      } catch {}
    });
  }).catch((err) => {
    try {
      fs.appendFileSync(path.join(LOG_DIR, 'main.log'), `STARTUP FAILED ${err?.stack || err}\n`);
    } catch {}
  });

  app.on('window-all-closed', () => {
    stopDockWatcher();
    pc.resetBridge();
    app.quit();
  });
}

/* ------------------------------------------------------------------ */
/* events + ipc                                                        */
/* ------------------------------------------------------------------ */

onEvent((event) => {
  sendToRenderer('egglab:event', event);
  if (event.type === 'job') {
    chat.upsertJobCard(event.job, event.job.status !== 'running');
  }
});

ipcMain.handle('app:state', async () => ({
  settings: getSettings(),
  engine: engineStatus(),
  models: modelStatus(),
  photocraft: await pc.status(),
  chat: chat.getHistory(),
  jobs: listJobs().slice(0, 8),
  serviceUrl,
  outDir: OUT_DIR,
  busy: chat.isBusy(),
  pinned,
  version: app.getVersion(),
}));

ipcMain.handle('settings:patch', (e, patch) => {
  const before = getSettings().quality?.steps;
  const next = patchSettings(patch);
  // A step count silently reverting to the legacy 20 is the exact failure that
  // shipped soft renders for weeks. Record who changed it.
  if (patch?.quality?.steps !== undefined && patch.quality.steps !== before) {
    try {
      fs.appendFileSync(
        path.join(LOG_DIR, 'main.log'),
        `${new Date().toISOString()} settings quality.steps ${before} -> ${patch.quality.steps} (renderer)\n`
      );
    } catch {}
  }
  // The agent workspace declares the selected model's capabilities (vision,
  // tools), points the local provider config at it, and rebuilds the always-on
  // v2 core plus the live runtime snapshot. Skill bodies and references stay on
  // disk and load through egglab_read_knowledge, so a settings change never
  // leaves a monolithic prompt out of date.
  if (serviceUrl) {
    try {
      chat.buildWorkspace({ url: serviceUrl, token: TOKEN });
    } catch {}
  }
  return next;
});
ipcMain.handle('opencode:models', async (e, { force } = {}) => {
  return await opencodeModels(force);
});

ipcMain.handle('job:start', (e, payload) => startJob(payload));
ipcMain.handle('job:cancel', (e, id) => cancelJob(id));
ipcMain.handle('job:wait', async (e, id) => {
  const { waitForJob } = await import('./service/engine.mjs');
  return await waitForJob(id);
});
ipcMain.handle('jobs:list', () => listJobs().slice(0, 20));

ipcMain.handle('models:list', () => modelStatus());
ipcMain.handle('models:download', (e, { ids, variant }) => startDownloads(ids, variant));
ipcMain.handle('models:cancel', (e, id) => cancelDownload(id));
ipcMain.handle('models:use', (e, { id, file }) => useVariant(id, file));

ipcMain.handle('setup:status', () => setup.setupStatus());
ipcMain.handle('setup:action', async (e, { action, payload } = {}) => {
  switch (action) {
    case 'detect':
      return await setup.refreshDetection();
    case 'photocraft': {
      const status = await setup.setPhotoCraft(payload?.path);
      if (serviceUrl) {
        try {
          chat.buildWorkspace({ url: serviceUrl, token: TOKEN });
        } catch {}
      }
      return status;
    }
    case 'engine':
      return await setup.installEngine(payload?.variant || 'auto', Boolean(payload?.force));
    case 'opencode':
      return await setup.installOpencode();
    case 'import-model':
      return await setup.importModelFile(payload?.path);
    case 'complete':
      return await setup.completeSetup();
    default:
      throw new Error(`Unknown setup action: ${action}`);
  }
});
ipcMain.handle('dialog:pickApp', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Locate PhotoCraft',
    properties: ['openFile'],
    filters: [{ name: 'Applications', extensions: ['exe'] }],
  });
  return res.canceled ? '' : res.filePaths[0] || '';
});
ipcMain.handle('dialog:pickModel', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Add a model file',
    properties: ['openFile'],
    filters: [{ name: 'Model files', extensions: ['safetensors', 'gguf'] }],
  });
  return res.canceled ? '' : res.filePaths[0] || '';
});

ipcMain.handle('chat:send', async (e, { text, files, refMap }) => {
  return await chat.send(text, files || [], refMap || {});
});
ipcMain.handle('chat:stop', () => chat.stop());
// Returns false (instead of always true) when the agent is mid-run, so the
// renderer keeps the timeline instead of blanking a reply that never landed.
ipcMain.handle('chat:clear', () => chat.clearHistory());
ipcMain.handle('chat:history', () => chat.getHistory());
ipcMain.handle('sessions:list', () => sessions.list());
ipcMain.handle('sessions:rename', (e, { key, title }) => sessions.rename(key, title));
ipcMain.handle('sessions:delete', (e, key) => chat.deleteThread(key));
ipcMain.handle('sessions:switch', async (e, { key, title }) => {
  if (chat.isBusy()) {
    throw new Error('The agent is still working. Wait for it to finish or press stop before switching chats.');
  }
  const res = chat.useDocument(key, title || null);
  if (res.changed) trace(`thread -> ${key} (picked in the chat list)`);

  // The chat follows the active PhotoCraft document, so picking a chat has to
  // bring its document forward too. Without this the watcher pulled the thread
  // back to the previous document on its next poll — a session switch that
  // appeared to fail.
  holdSyncUntil = Date.now() + 4000;
  const shown = await showDocumentForKey(key).catch(() => false);
  if (shown) trace(`document follows chat -> ${key}`);
  return { ...res, history: chat.getHistory() };
});

ipcMain.handle('pc:status', () => pc.status());
ipcMain.handle('pc:launch', () => pc.launch());
ipcMain.handle('pc:layers', () => pc.layers());
ipcMain.handle('pc:preview', () => pc.preview());
ipcMain.handle('pc:place', async (e, { path: file, options }) => {
  const result = await pc.place(file, options || {});
  return { ...result, save: await pc.autosave('placed a layer') };
});
ipcMain.handle('pc:newDoc', (e, opts) => pc.newDocument(opts || {}));
ipcMain.handle('pc:exportLayers', (e, opts) => pc.exportLayers(opts || {}));
ipcMain.handle('pc:exportActive', () => pc.exportActiveLayer());
ipcMain.handle('pc:exportLayer', (e, { name, makeVisible }) => pc.exportLayerByName(name, { makeVisible }));
ipcMain.handle('pc:exportMentions', (e, { names }) => pc.exportLayersByMentions(names || []));
ipcMain.handle('pc:command', (e, { id, params }) => pc.command(id, params || {}));

ipcMain.handle('pc:project', () => pc.projectState());
ipcMain.handle('pc:save', (e, opts) => pc.save(opts || {}));
ipcMain.handle('pc:openProject', (e, opts) => pc.openProject(opts || {}));
ipcMain.handle('pc:closeDoc', (e, opts) => pc.closeDocument(opts || {}));
ipcMain.handle('pc:recentProjects', (e, limit) => pc.recentProjects(Number(limit) || 20));
ipcMain.handle('pc:projectPath', (e, { name, ext }) => ({ path: pc.projectPathFor(name, { ext }) }));

ipcMain.handle('pc:editActive', async (e, payload) => {
  const exported = await pc.exportActiveLayer();
  const size = exported?.path ? pc.pngSize(exported.path) : null;
  const job = startJob({
    ...payload,
    images: [exported.path],
    width: payload.width || (size ? Math.min(1024, size.width) : undefined),
    height: payload.height || (size ? Math.min(1024, size.height) : undefined),
  });
  const done = await (await import('./service/engine.mjs')).waitForJob(job.id);
  if (done.status !== 'done') return { ok: false, job: done };
  const doc = await pc.inspect();
  const d = doc?.document || doc || {};
  const bounds = exported.layer?.bounds;
  const placed = bounds
    ? await pc.placeAtBounds(done.outPath, bounds, {
        name: exported.layer?.name ? `${exported.layer.name} (EggLab)` : 'EggLab edit',
      })
    : await pc.place(done.outPath, {
        fit: true,
        name: 'EggLab edit',
        center: [(d.width || 0) / 2, (d.height || 0) / 2],
      });
  let hidden = null;
  if (payload.replace !== false && exported.layer?.id !== undefined) {
    try {
      hidden = await pc.command('layer.setProps', { layer: exported.layer.id, visible: false });
    } catch (err) {
      hidden = { error: err.message };
    }
  }
  return { ok: true, job: done, layer: exported.layer, placed, hidden, save: await pc.autosave('edited a layer') };
});

ipcMain.handle('dialog:pickImages', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Add reference images',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tif', 'tiff'] }],
  });
  return res.canceled ? [] : res.filePaths;
});

ipcMain.handle('fs:open', (e, file) => shell.openPath(file));
ipcMain.handle('fs:reveal', (e, file) => shell.showItemInFolder(file));
ipcMain.handle('shell:external', (e, url) => shell.openExternal(url));

ipcMain.handle('window:min', () => win?.minimize());
ipcMain.handle('window:close', () => {
  shellLog('window:close ipc');
  return win?.close();
});
ipcMain.handle('window:pin', (e, value) => {
  pinned = Boolean(value);
  win?.setAlwaysOnTop(pinned, 'floating');
  return pinned;
});
ipcMain.handle('window:dock', () => toggleDock());
ipcMain.handle('window:bounds', () => win?.getBounds() || null);
ipcMain.handle('window:setWidth', () => win?.getBounds() || null);

/* ---- floating egg shell --------------------------------------------- */
ipcMain.handle('egg:state', () => shellPayload());
ipcMain.handle('egg:expand', () => expandShell());
ipcMain.handle('egg:collapse', () => collapseShell());
ipcMain.handle('egg:bounds', () => (win && !win.isDestroyed() ? win.getBounds() : null));
ipcMain.handle('egg:move', (e, point = {}) => {
  if (!win || win.isDestroyed() || shellExpanded) return null;
  const x = Number(point?.x);
  const y = Number(point?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const display = screen.getDisplayNearestPoint({
    x: Math.round(x + EGG.width / 2),
    y: Math.round(y + EGG.height / 2),
  });
  const work = display.workArea;
  const nx = Math.max(work.x, Math.min(Math.round(x), work.x + work.width - EGG.width));
  const ny = Math.max(work.y, Math.min(Math.round(y), work.y + work.height - EGG.height));
  applyBounds({ x: nx, y: ny, width: EGG.width, height: EGG.height });
  eggAnchor = { x: nx, y: ny };
  return eggAnchor;
});
ipcMain.handle('egg:drag-end', () => {
  writeWindowState();
  return shellPayload();
});
