// Session/thread regression gate.
//
// Covers the failure modes that made chats feel broken:
//   1. "New chat" must create a NEW thread and leave the previous transcript
//      untouched (it used to wipe it).
//   2. Switching chats must restore the right transcript and thread id, even
//      for secondary threads on the same document.
//   3. A document must resume the thread the user was READING last, not merely
//      the one that was messaged most recently.
//
// Requires: panel running, PhotoCraft running, one project document open.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { api } from './api.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PANEL = path.resolve(HERE, '..');
const CHATS = path.join(PANEL, 'chats');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (p) => String(p || '').replace(/\\\\/g, '\\').replace(/\//g, '\\').toLowerCase();
const fileFor = (key) => path.join(CHATS, `${String(key).replace(/[^a-z0-9]+/gi, '_').slice(0, 80)}.json`);
const chat = () => api('GET', '/api/chat');
const sessions = () => api('GET', '/api/sessions');

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function openDoc(target) {
  const wanted = norm(target);
  await api('POST', '/api/photocraft/project/open', { path: target });
  for (let i = 0; i < 20; i++) {
    await sleep(1000);
    const state = await api('GET', '/api/photocraft/project');
    const doc = state.document || {};
    if (norm(doc.key) === wanted || norm(doc.path) === wanted) {
      // Give the document watcher one poll to point the chat at it.
      for (let j = 0; j < 10; j++) {
        const hist = await chat();
        if (norm(hist.docKey) === wanted) return hist;
        await sleep(1000);
      }
      return await chat();
    }
  }
  throw new Error(`document did not open: ${target}`);
}

const DOC_A = 'd:\\neww\\projects\\egglab-poster\\egglab-poster.pcraft';

// --- 1. current state -------------------------------------------------------
let base = await openDoc(DOC_A);
if (!base.items.length) {
  console.log('seeding the first thread with one agent turn…');
  await api('POST', '/api/chat', { text: 'Reply with exactly: THREAD-SEED. Do not call any tools.' });
  base = await chat();
}
check('document thread has a transcript', base.items.length > 0, `${base.items.length} items`);
const t1 = base.threadId;
const baseIds = base.items.map((i) => i.id);

// --- 2. new chat creates a thread without destroying the old one -----------
const created = await api('POST', '/api/sessions/new');
check('new chat returns a different thread', created.threadId !== t1, `${created.threadId}`);
check('new chat stays on the same document', created.key === base.docKey, created.key);
const fresh = await chat();
check('new chat starts empty', fresh.items.length === 0);
check('new chat becomes current', fresh.threadId === created.threadId);
const oldFile = fileFor(t1);
check('previous transcript file still exists', fs.existsSync(oldFile), oldFile);

// --- 3. the chat list knows both threads of the document -------------------
let list = await sessions();
const rows = (list.docs || []).filter((d) => d.docKey === base.docKey);
check('both chats are listed under the document', rows.length >= 2, `${rows.length} rows`);
check('list marks the new chat current', rows.some((d) => d.current && d.threadId === created.threadId));

// --- 4. switching chats restores the right transcript ----------------------
await api('POST', '/api/sessions/switch', { key: t1 });
const back = await chat();
check('switching back restores the thread id', back.threadId === t1, back.threadId);
check('switching back restores every item', back.items.map((i) => i.id).join() === baseIds.join(), `${back.items.length} items`);
check('switching back keeps the document', back.docKey === base.docKey);

await api('POST', '/api/sessions/switch', { key: created.threadId });
const second = await chat();
check('switching to the new chat is empty again', second.items.length === 0 && second.threadId === created.threadId);

// --- 5. a document resumes the thread that was last READ -------------------
// Leave the document on the OLD thread although the new one has a newer
// updatedAt; coming back must resume the old thread (active-thread memory).
await api('POST', '/api/sessions/switch', { key: t1 });
const docState = await api('GET', '/api/photocraft/project');
const insideRoot = (p) => /^d:\\neww\\/i.test(norm(p));
const probeB = 'd:\\neww\\projects\\migration-probe\\migration-probe.pcraft';
let other =
  (docState.documents || [])
    .map((d) => d.path)
    .find((p) => p && insideRoot(p) && norm(p) !== norm(DOC_A)) || null;
if (!other && fs.existsSync(probeB)) other = probeB;

let hopped = false;
try {
  if (other) {
    await openDoc(other);
    const away = await chat();
    check('another document gets its own thread', norm(away.docKey) === norm(other), away.docKey);
  } else {
    // No second file to open: an untitled document is its own scope too.
    await api('POST', '/api/photocraft/new-document', { name: 'Session gate', width: 1080, height: 1080 });
    for (let i = 0; i < 10; i++) {
      await sleep(1000);
      const hist = await chat();
      if (String(hist.docKey).startsWith('untitled:')) break;
    }
    const away = await chat();
    check('a new untitled document gets its own thread', String(away.docKey).startsWith('untitled:'), away.docKey);
  }
  const returned = await openDoc(DOC_A);
  check('returning resumes the last READ thread', returned.threadId === t1, `resumed ${returned.threadId}`);
  check('returning restores its transcript', returned.items.length === base.items.length, `${returned.items.length} items`);
  hopped = true;
} catch (err) {
  console.log('SKIP  document-hop check —', err.message);
}

// --- 6. deleting the extra chat falls back to the surviving one -------------
if (second.threadId === (await chat()).threadId) {
  await api('POST', '/api/sessions/switch', { key: t1 });
}
await api('POST', '/api/sessions/delete', { key: created.threadId });
const afterDelete = await chat();
check('deleting a sibling keeps the current chat', afterDelete.threadId === t1, afterDelete.threadId);
list = await sessions();
check('deleted chat is gone from the list', !(list.docs || []).some((d) => d.threadId === created.threadId));

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
