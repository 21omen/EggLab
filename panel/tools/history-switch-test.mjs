// Regression: switching PhotoCraft tabs must never move or delete another
// document's chat. Before the fix, every active-document change called
// migrateThread(lastDocKey, key), so A -> B merged A's history into B and
// migrateKey dropped A's binding. This test switches away from the current
// document and back, then checks the transcript and registry are untouched.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { api } from './api.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PANEL = path.resolve(HERE, '..');
const CHATS = path.join(PANEL, 'chats');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const fileFor = (key) => path.join(CHATS, `${String(key).replace(/[^a-z0-9]+/gi, '_').slice(0, 80)}.json`);

async function project() {
  return api('GET', '/api/photocraft/project');
}

async function chat() {
  return api('GET', '/api/chat');
}

async function waitForDocKey(match, label) {
  for (let i = 0; i < 20; i++) {
    await sleep(1000);
    const c = await chat();
    if (match(c.docKey)) return c;
  }
  throw new Error(`timed out waiting for ${label}`);
}

const startState = await project();
const start = startState.document;
if (!start) throw new Error('Open a PhotoCraft document first.');
const startChat = await chat();
const startFile = fileFor(startChat.docKey);
const startHash = hash(startFile);
const startCount = startChat.items.length;
const startSession = startChat.sessionID;
console.log(`start: ${start.name} (${startCount} items, session ${startSession || 'none'})`);

const other = (startState.documents || []).find((d) => !d.active);
if (!other) throw new Error('Need a second open PhotoCraft document to test the switch.');

const otherPath = `projects/${other.label.replace(/\.pcraft$/i, '')}/${other.label}`;
await api('POST', '/api/photocraft/project/open', { path: otherPath });
const away = await waitForDocKey((k) => k !== startChat.docKey, 'the other document thread');
console.log(`away:  ${away.docKey} (${away.items.length} items)`);

// The old bug deleted the previous document's binding on the way out.
const awaySessions = await api('GET', '/api/sessions');
const stillBound = awaySessions.docs.some((d) => d.key === startChat.docKey && d.sessionId === startSession);
if (!stillBound) throw new Error('The previous document lost its chat binding during a tab switch.');
if (!fs.existsSync(startFile)) throw new Error('The previous document transcript disappeared during a tab switch.');
if (hash(startFile) !== startHash) throw new Error('The previous document transcript was rewritten during a tab switch.');

await api('POST', '/api/photocraft/project/open', { path: start.path });
const back = await waitForDocKey((k) => k === startChat.docKey, 'the original thread');
if (back.items.length !== startCount) {
  throw new Error(`History changed after switching away and back: ${startCount} -> ${back.items.length}`);
}
if (back.sessionID !== startSession) {
  throw new Error(`Session changed after switching away and back: ${startSession} -> ${back.sessionID}`);
}
if (hash(startFile) !== startHash) throw new Error('The transcript changed after switching back.');

const finalSessions = await api('GET', '/api/sessions');
const bound = finalSessions.docs.some((d) => d.key === startChat.docKey && d.sessionId === startSession);
if (!bound) throw new Error('The original session binding is missing after switching back.');

console.log('PASS: tab switches keep separate transcripts and session bindings.');
