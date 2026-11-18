/**
 * Session registry.
 *
 * A PhotoCraft document is a SCOPE; a chat is a THREAD inside it. One canvas
 * can hold any number of conversations (the model used to be one document =
 * one chat forever, so starting over meant destroying the transcript). Every
 * thread records the `docKey` it belongs to, and a document resumes its most
 * recently used thread when PhotoCraft switches to it.
 *
 * The PRIMARY thread of a document uses the document key as its own id, which
 * is what keeps every pre-existing transcript filename and OpenCode binding
 * valid. Further threads on the same document are `<docKey>#2`, `<docKey>#3`…
 *
 * OpenCode has no session rename (`opencode session list | delete` is all it
 * exposes), so titles and the document binding live here and OpenCode only
 * supplies ids, auto-titles and message history.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { visionForModel, resolveOpenCode } from './settings.mjs';
import { AGENT_DIR, CHATS_DIR, DATA_DIR, OUT_DIR, TMP_DIR, readJson, writeJson, uid } from './paths.mjs';
import { historyFileName } from './history-names.mjs';

const execFileAsync = promisify(execFile);
const REGISTRY_FILE = path.join(DATA_DIR, 'sessions.json');
const REGISTRY_BACKUP = path.join(DATA_DIR, 'sessions.backup.json');

// A session started by a no-vision model stays vision-blind even after the
// setting changes, so switching models must switch sessions too. Capability is
// decided by settings.visionForModel (the same rule chat uses to write the
// provider config), so the two can never disagree.

function loadRegistry() {
  for (const file of [REGISTRY_FILE, REGISTRY_BACKUP]) {
    const data = readJson(file, null);
    if (!data || typeof data !== 'object' || Array.isArray(data)) continue;
    if (data.threads && typeof data.threads === 'object') return data;
    // Older shape: one entry per PhotoCraft document. Each document's entry
    // becomes its PRIMARY thread, whose id is the document key itself, so every
    // existing transcript filename and OpenCode binding keeps working unchanged.
    if (data.docs && typeof data.docs === 'object') {
      const threads = {};
      for (const [key, entry] of Object.entries(data.docs)) {
        threads[key] = { id: key, docKey: key, ...(entry && typeof entry === 'object' ? entry : {}) };
      }
      return { currentKey: data.currentKey ?? null, threads };
    }
  }
  return {};
}

let registry = loadRegistry();
registry.currentKey = registry.currentKey ?? null;
registry.threads = registry.threads && typeof registry.threads === 'object' ? registry.threads : {};
/**
 * Last thread READ per document (`docKey -> threadId`). `updatedAt` tracks the
 * last MESSAGE, but a document should resume the conversation the user was
 * looking at: reading an older thread and then hopping tabs must come back to
 * that thread, not to whichever sibling was messaged most recently.
 */
registry.activeThreads =
  registry.activeThreads && typeof registry.activeThreads === 'object' ? registry.activeThreads : {};
// A thread always knows which document it belongs to. Primary threads (id ===
// docKey) written before that field existed inherit it from their own id.
for (const [id, entry] of Object.entries(registry.threads)) {
  if (!entry || typeof entry !== 'object') continue;
  entry.id = id;
  if (!entry.docKey) entry.docKey = id;
}
// Drop active pointers whose thread is gone or now belongs to another document.
for (const [doc, id] of Object.entries(registry.activeThreads)) {
  const entry = registry.threads[id];
  if (!entry || entry.docKey !== doc) delete registry.activeThreads[doc];
}

function save() {
  writeJson(REGISTRY_FILE, registry);
  // Keep a mirror next to the live file. If the live file is lost or torn,
  // loadRegistry can still recover every document binding on the next launch.
  try {
    writeJson(REGISTRY_BACKUP, registry);
  } catch {}
}

/**
 * `opencode session list` is the only listing OpenCode offers. It is slow
 * (~1s, it boots the server), so callers should not do it per keystroke.
 */
export async function opencodeSessions(limit = 40) {
  try {
    const oc = resolveOpenCode();
    const { stdout } = await execFileAsync(
      oc.cmd,
      ['session', 'list', '--format', 'json', '--max-count', String(limit)],
      {
        // Sessions are project-scoped (v2 especially): list them from the same
        // directory the chats run in, otherwise every known session shows as
        // "dead" because it belongs to another project.
        cwd: AGENT_DIR,
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024,
        shell: oc.shell,
      },
    );
    const parsed = JSON.parse(String(stdout).trim() || '[]');
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    // null means "could not ask", not "no sessions". Callers must not clear
    // bindings or treat chats as dead on a transient CLI failure.
    return null;
  }
}

/** Export one OpenCode session (messages + metadata) for transcript recovery. */
export async function exportSession(sessionId) {
  if (!sessionId) return null;
  try {
    const oc = resolveOpenCode();
    const { stdout } = await execFileAsync(
      oc.cmd,
      ['session', 'export', sessionId],
      {
        cwd: AGENT_DIR,
        windowsHide: true,
        maxBuffer: 16 * 1024 * 1024,
        shell: oc.shell,
      },
    );
    const parsed = JSON.parse(String(stdout).trim());
    return parsed && Array.isArray(parsed.messages) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Point the registry at a THREAD without creating a chat entry.
 *
 * Merely switching tabs must not pollute the list: a document you never spoke
 * to has no conversation, and an untitled document that later gets saved would
 * otherwise leave an orphan `untitled:...` entry behind. Entries are created by
 * bind()/newThread(), which only run when there is something to remember.
 */
export function setCurrent(key) {
  const next = key || 'no-document';
  const entry = registry.threads[next];
  const changed = registry.currentKey !== next;
  if (entry?.docKey) registry.activeThreads[entry.docKey] = next;
  if (changed) registry.currentKey = next;
  if (changed || entry?.docKey) save();
  return next;
}

/**
 * Move a document's chats to its new key. A PhotoCraft document changes
 * identity when it is saved for the first time
 * (`untitled:<name>:<w>x<h>` -> the real path), and its conversations must
 * follow rather than be abandoned.
 *
 * Every thread of the document follows, not just the primary one — otherwise a
 * secondary conversation would be stranded on an identity nothing resolves.
 */
export function migrateKey(from, to) {
  if (!from || !to || from === to) return false;
  const source = registry.threads[from];
  const siblings = Object.values(registry.threads).filter((t) => t && t.docKey === from);
  if (!source && !siblings.length) return false;

  for (const thread of siblings) thread.docKey = to;

  if (source) {
    const dest = registry.threads[to];
    delete registry.threads[from];
    if (!dest) {
      registry.threads[to] = { ...source, id: to, docKey: to };
    } else {
      // Both identities already have a binding. Keep the destination session
      // (the saved document's own memory) and fill any gaps from the source;
      // never drop the source entry without carrying its useful fields over.
      if (!dest.sessionId && source.sessionId) dest.sessionId = source.sessionId;
      for (const field of ['title', 'model', 'vision', 'docName', 'createdAt']) {
        if ((dest[field] === undefined || dest[field] === null) && source[field] !== undefined) {
          dest[field] = source[field];
        }
      }
      dest.updatedAt = Math.max(Number(dest.updatedAt) || 0, Number(source.updatedAt) || 0) || Date.now();
    }
  }
  if (registry.currentKey === from) registry.currentKey = to;
  // The document's remembered thread follows the identity change.
  if (registry.activeThreads[from]) {
    const active = registry.activeThreads[from];
    delete registry.activeThreads[from];
    registry.activeThreads[to] = active === from ? to : active;
  }
  save();
  return true;
}

/**
 * The session to use for a thread, creating the binding on first contact.
 *
 * @param {object} opts
 * @param {string} opts.key           thread id (a document's primary thread
 *                                    uses the document key as its id)
 * @param {string|null} opts.docKey   PhotoCraft document the thread belongs to
 * @param {string} opts.model         model the next message will run on
 * @param {string|null} opts.docName   for the human-readable title
 * @param {string|null} opts.sessionId  OpenCode's id, once a message has run
 */
export function bind({ key, docKey = null, model, vision = null, docName = null, sessionId = null } = {}) {
  const id = key || 'no-document';
  const doc = docKey || id;
  const existing = registry.threads[id] || null;

  // A session last driven by a different model may not be able to see images.
  // Starting fresh is cheaper and less confusing than a vision-blind thread.
  const modelChanged = Boolean(existing?.model && model && existing.model !== model);
  const lostVision = Boolean(
    existing?.model &&
      model &&
      !visionForModel(existing.model) &&
      visionForModel(model),
  );
  // Image capability can change without the model id changing (a custom
  // provider starts declaring `modalities`, or the user toggles
  // `opencode.vision`). A thread that already learned "I can't see images"
  // repeats that answer forever, so fork when the capability flips.
  const visionChanged = Boolean(
    existing && existing.vision !== undefined && vision !== null && Boolean(existing.vision) !== Boolean(vision),
  );

  let entry = existing;
  if (!entry || modelChanged || lostVision || visionChanged) {
    entry = {
      id,
      docKey: doc,
      sessionId: null,
      // Deliberately NOT seeded from the document name: every chat used to be
      // titled after its canvas, so a list of them was unreadable. The first
      // message names the thread instead (see chat.send).
      title: existing?.title || null,
      model: model || null,
      vision: vision === null ? undefined : Boolean(vision),
      docName,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      forkedFrom: modelChanged || lostVision || visionChanged ? existing?.sessionId || null : null,
    };
    registry.threads[id] = entry;
  }

  if (sessionId && entry.sessionId !== sessionId) {
    entry.sessionId = sessionId;
    entry.updatedAt = Date.now();
  }
  if (model) entry.model = model;
  if (vision !== null) entry.vision = Boolean(vision);
  if (docName) entry.docName = docName;
  entry.docKey = doc;
  registry.currentKey = id;
  save();
  return { ...entry, key: id, docKey: doc, switched: Boolean(modelChanged || lostVision || visionChanged) };
}

/** Record the id OpenCode minted, plus the title it auto-generated. */
export function noteSession({ key, docKey = null, sessionId, title }) {
  const id = key || registry.currentKey || 'no-document';
  const entry =
    registry.threads[id] ||
    (registry.threads[id] = { id, docKey: docKey || id, sessionId: null, title: null, createdAt: Date.now() });
  if (sessionId) entry.sessionId = sessionId;
  if (title && !entry.title) entry.title = String(title);
  entry.updatedAt = Date.now();
  registry.currentKey = id;
  save();
  return entry;
}

/**
 * Make sure a document that HAS a conversation also has a registry entry.
 *
 * Job cards are appended straight to the transcript without ever going through
 * bind()/noteSession(), so a thread could hold real history while missing from
 * the registry. That had two consequences: it never appeared in the chat list,
 * and pruneOrphanThreads treated it as an orphan and moved it to `_trash` —
 * history silently disappearing. A transcript with content is never an orphan,
 * so it always gets a binding.
 *
 * Does not touch currentKey: minting an entry must not move the current chat.
 */
export function ensureEntry(key, { docKey = null, docName = null, title = null } = {}) {
  const id = key || 'no-document';
  const doc = docKey || id;
  const existing = registry.threads[id];
  if (existing) return existing;

  // Fall back to the file's own name when the document is not open, so the
  // chat list still shows something recognisable instead of a raw key.
  const looksLikePath = /^[A-Za-z]:[\\/]/.test(doc) || doc.includes('/');
  const fromPath = looksLikePath ? doc.split(/[\\/]/).pop() : null;
  const label =
    title ||
    (docName ? String(docName).replace(/\.(pcraft|psd|psb|jfif|png|jpe?g|tiff?)$/i, '') : null) ||
    (fromPath ? fromPath.replace(/\.[^.]+$/, '') : null) ||
    null;

  const entry = {
    id,
    docKey: doc,
    sessionId: null,
    title: label,
    model: null,
    vision: undefined,
    docName: docName || fromPath || null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    forkedFrom: null,
  };
  registry.threads[id] = entry;
  save();
  return entry;
}

/**
 * Start a brand-new conversation for a document.
 *
 * The document's existing threads are left completely untouched — that is the
 * whole point: "new chat" must never destroy the transcript it replaces. The
 * new thread becomes the document's active one because its `updatedAt` is now
 * the newest, and it becomes the registry's current thread.
 */
export function newThread({ docKey = null, docName = null } = {}) {
  const doc = docKey || 'no-document';
  const taken = new Set(Object.keys(registry.threads));
  let id = doc;
  if (taken.has(id)) {
    // The primary thread already exists, so this is an additional stream over
    // the same document scope.
    let n = 2;
    while (taken.has(`${doc}#${n}`)) n++;
    id = `${doc}#${n}`;
  }
  const entry = {
    id,
    docKey: doc,
    sessionId: null,
    title: null,
    model: null,
    vision: undefined,
    docName,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    forkedFrom: null,
  };
  registry.threads[id] = entry;
  registry.currentKey = id;
  registry.activeThreads[doc] = id;
  save();
  return entry;
}

export function current() {
  const key = registry.currentKey;
  const entry = key ? registry.threads[key] : null;
  return { key, entry: entry || null };
}

/** The binding for one thread, independent of which one is current. */
export function entryFor(key) {
  return registry.threads[key] || null;
}

/** The raw thread bindings, for callers that need the ids only. */
export function registryThreads() {
  return { ...registry.threads };
}

/**
 * The thread a document resumes: the one its user touched most recently.
 * A brand-new document has none, and the caller then falls back to the primary
 * thread id (the document key), which is created on first contact.
 */
/** A panel transcript with messages is a real conversation even if its
 * OpenCode binding was pruned. Used only for routing/listing, never for binding. */
function threadHasHistory(id) {
  try {
    const data = readJson(path.join(CHATS_DIR, historyFileName(id)), null);
    return Boolean(data && Array.isArray(data.items) && data.items.length);
  } catch {
    return false;
  }
}

export function threadFor(docKey) {
  if (!docKey) return null;
  const remembered = registry.threads[registry.activeThreads[docKey]];
  const candidates = Object.values(registry.threads)
    .filter((thread) => thread && thread.docKey === docKey)
    .sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0));
  // A remembered empty "new chat" must not hide the document's real
  // conversation. Prefer a thread with a live session or real panel history;
  // only fall back to the remembered/new thread when the document has neither.
  if (remembered && remembered.docKey === docKey && (remembered.sessionId || threadHasHistory(remembered.id))) {
    return remembered;
  }
  const withContent = candidates.find((thread) => thread.sessionId || threadHasHistory(thread.id));
  if (withContent) return withContent;
  if (remembered && remembered.docKey === docKey) return remembered;
  return candidates[0] || null;
}

/**
 * Startup repair: if the remembered thread has never run and a sibling
 * conversation on the same document has an OpenCode session, open the sibling
 * instead. This is what stops an abandoned "new chat" from hiding real history.
 */
export function repairCurrent() {
  const currentThread = registry.threads[registry.currentKey];
  if (!currentThread || currentThread.sessionId) return false;
  const better = threadFor(currentThread.docKey);
  if (!better || better.id === currentThread.id) return false;
  if (!better.sessionId && !threadHasHistory(better.id)) return false;
  registry.currentKey = better.id;
  registry.activeThreads[currentThread.docKey] = better.id;
  save();
  return true;
}

/** Every conversation belonging to one document, newest first. */
export function threadsFor(docKey) {
  if (!docKey) return [];
  return Object.values(registry.threads)
    .filter((t) => t && t.docKey === docKey)
    .sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0));
}

/**
 * Documents that exist only as artefacts: renders in `out/`, scaled previews in
 * `tmp/`. The agent (and PhotoCraft) open these as documents while placing or
 * exporting, and each one used to add another "Untitled-1" chat to the list.
 * They are real threads for as long as they are on screen, but the chat list
 * folds them into a single "Generated images" group.
 */
export function isTransientDocKey(key) {
  const value = String(key || '');
  if (/^[A-Za-z]:[\\/]/.test(value) === false) return false;
  const normalized = value.replace(/\//g, '\\').toLowerCase();
  const roots = [OUT_DIR, TMP_DIR]
    .filter(Boolean)
    .map((root) => `${String(root).replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()}\\`);
  return roots.some((root) => normalized.startsWith(root));
}

/** The registry, merged with OpenCode's live list so dead ids are visible. */
export async function list(limit = 40) {
  const live = await opencodeSessions(limit);
  const byId = new Map((live || []).map((s) => [s.id, s]));
  const docs = Object.entries(registry.threads)
    // An empty "new chat" that the user never sent to is not a conversation.
    // A thread with real panel history stays visible even if its OpenCode
    // session was pruned; only the current empty thread is kept.
    .filter(
      ([id, entry]) =>
        Boolean(entry?.sessionId) || id === registry.currentKey || threadHasHistory(id),
    )
    .map(([id, entry]) => {
    const liveEntry = entry.sessionId ? byId.get(entry.sessionId) : null;
    return {
      // `key` is the id every rename/delete/switch call takes back. Threads on
      // the same document share a docKey but never a key.
      key: id,
      threadId: id,
      docKey: entry.docKey || id,
      docName: entry.docName || null,
      transient: isTransientDocKey(entry.docKey || id),
      // Fall back to the document name, then OpenCode's own title, so a chat
      // that has not spoken yet still reads as something.
      title: entry.title || liveEntry?.title || entry.docName || 'Untitled chat',
      sessionId: entry.sessionId || null,
      model: entry.model || null,
      exists: Boolean(liveEntry),
      current: id === registry.currentKey,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt || liveEntry?.updated || entry.createdAt,
    };
  });
  return { currentKey: registry.currentKey, docs: docs.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)) };
}

/**
 * A dead OpenCode binding must not poison a panel conversation forever. If the
 * CLI returns a real session list and a thread's id is absent, clear the
 * binding; the next message starts a fresh OpenCode session while the panel
 * transcript stays intact. Never run this when the list is null/empty because
 * that is indistinguishable from a transient CLI failure.
 */
export async function repairDeadSessions() {
  const live = await opencodeSessions(200);
  if (!Array.isArray(live) || !live.length) return 0;
  const ids = new Set(live.map((session) => session.id));
  let cleared = 0;
  for (const entry of Object.values(registry.threads)) {
    if (!entry?.sessionId || ids.has(entry.sessionId)) continue;
    entry.sessionId = null;
    entry.updatedAt = Date.now();
    cleared++;
  }
  if (cleared) save();
  return cleared;
}

/** Rename in the panel (OpenCode cannot rename). */
export function rename(key, title) {
  const entry = registry.threads[key];
  if (!entry) throw new Error('No such chat.');
  entry.title = String(title || '').trim() || 'Untitled chat';
  entry.updatedAt = Date.now();
  save();
  return entry;
}

/** Forget a binding; OpenCode's own history is deleted separately. */
export function unbind(key) {
  const entry = registry.threads[key];
  if (entry?.docKey && registry.activeThreads[entry.docKey] === key) {
    delete registry.activeThreads[entry.docKey];
  }
  if (key === registry.currentKey) registry.currentKey = null;
  delete registry.threads[key];
  save();
  return true;
}

export async function deleteSession(key) {
  const entry = registry.threads[key];
  const id = entry?.sessionId;
  if (id) {
    try {
      const oc = resolveOpenCode();
      await execFileAsync(oc.cmd, ['session', 'delete', id], {
        // Same project scope the chats are created in (see opencodeSessions).
        cwd: AGENT_DIR,
        windowsHide: true,
        shell: oc.shell,
      });
    } catch {
      // A session OpenCode never persisted is not an error worth surfacing.
    }
  }
  unbind(key);
  return { deleted: Boolean(id) };
}

/** Start over on one thread without touching its siblings. */
export function clear(key) {
  const target = key || registry.currentKey;
  if (!target) return false;
  const entry = registry.threads[target];
  if (!entry) return false;
  entry.sessionId = null;
  entry.forkedFrom = null;
  entry.updatedAt = Date.now();
  save();
  return true;
}
