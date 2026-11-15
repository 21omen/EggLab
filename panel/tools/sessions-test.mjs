// Phase 2: verify each PhotoCraft document gets its own chat thread + session.
import { api } from './api.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function doc() {
  const s = await api('GET', '/api/photocraft/project');
  return s.document;
}

async function chat() {
  return api('GET', '/api/chat');
}

// 1. Current doc: send one message so it mints a session id.
let d = await doc();
console.log('doc A:', d.name, d.key);
let c = await chat();
console.log('  thread before:', c.docKey, 'items', c.items.length);

const a = await api('POST', '/api/chat', { text: 'Reply with exactly: THREAD-A. Do not call any tools.' }, 300000);
console.log('  agent A said:', JSON.stringify((a.item?.text || '').slice(0, 60)));

c = await chat();
console.log('  thread after:', c.docKey, 'session', c.sessionID, 'items', c.items.length);

// 2. Open the other document — the watcher should switch the thread by itself.
await api('POST', '/api/photocraft/project/open', { path: 'projects/EggLab-test/EggLab-test.pcraft' });
console.log('\nswitched PhotoCraft to EggLab-test');
for (let i = 0; i < 20; i++) {
  await sleep(1000);
  const now = await chat();
  if (now.docKey !== c.docKey) break;
}
d = await doc();
c = await chat();
console.log('doc B:', d.name, d.key);
console.log('  thread now:', c.docKey, 'items', c.items.length, '(should be 0 — a fresh conversation)');

// 3. Send in doc B and confirm it does not leak into doc A's history.
const b = await api('POST', '/api/chat', { text: 'Reply with exactly: THREAD-B. Do not call any tools.' }, 300000);
console.log('  agent B said:', JSON.stringify((b.item?.text || '').slice(0, 60)));

// 4. Switch back to doc A and confirm its history is intact and separate.
await api('POST', '/api/photocraft/project/open', { path: 'projects/poster-draft/poster-draft.pcraft' });
for (let i = 0; i < 20; i++) {
  await sleep(1000);
  const now = await chat();
  if (now.docKey.includes('poster-draft')) break;
}
const backA = await chat();
console.log('\nback on doc A — thread', backA.docKey);
console.log('  items:', backA.items.length, '(should be 2: user + agent)');
console.log('  texts:', backA.items.map((i) => `${i.role}:${(i.text || '').slice(0, 12)}`).join(' | '));

const sessions = await api('GET', '/api/sessions');
console.log('\nregistry:');
for (const s of sessions.docs) {
  console.log(`  ${s.current ? '*' : ' '} ${s.title} — session ${s.sessionId || 'none'} — live:${s.exists} — ${s.key}`);
}
