// An untitled document that gets saved for the first time changes identity.
// Its conversation must follow, and no orphan `untitled:` entry may be left.
import fs from 'node:fs';
import { api } from './api.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDoc(mutate, match, label) {
  await mutate();
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    const s = await api('GET', '/api/photocraft/project');
    if (s.document && match(s.document)) return s.document;
  }
  throw new Error(`timed out waiting for ${label}`);
}

async function waitForThread(match, label) {
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    const h = await api('GET', '/api/chat');
    if (match(h)) return h;
  }
  throw new Error(`timed out waiting for thread ${label}`);
}

// 1. A brand-new untitled document.
const doc = await waitForDoc(
  () => api('POST', '/api/photocraft/new-document', { width: 512, height: 512, background: 'white', name: 'Migration probe' }),
  (d) => d.name === 'Migration probe',
  'the untitled document',
);
console.log('1. untitled doc   :', doc.key, '| path', doc.path);

// 2. Speak to it -> this is what mints the session under the untitled key.
await waitForThread((h) => h.docKey === doc.key, 'the untitled thread');
await api('POST', '/api/chat', { text: 'Reply with exactly: UNTITLED. Do not call any tools.' }, 300000);
const untitledSessions = await api('GET', '/api/sessions');
console.log('2. after chat     :', untitledSessions.docs.map((d) => `${d.title}[${d.key.startsWith('untitled:') ? 'untitled' : 'saved'}]`).join(', '));

// 3. Save it -> identity changes from untitled:<name>:<w>x<h> to the real path.
const saved = await api('POST', '/api/photocraft/project/path', { name: 'migration-probe' });
await api('POST', '/api/photocraft/project/save', { path: saved.path });
console.log('3. saved to       :', saved.path, '| exists', fs.existsSync(saved.path));

// 4. Give the watcher a moment, then check the thread followed.
const h = await waitForThread((x) => x.docKey.includes('migration-probe'), 'the migrated thread');
console.log('4. thread key     :', h.docKey);
console.log('   history kept   :', h.items.map((i) => `${i.role}:${(i.text || '').trim().slice(0, 10)}`).join(' | '));

// 5. No orphan left behind.
const final = await api('GET', '/api/sessions');
console.log('5. registry       :');
for (const s of final.docs) console.log(`     ${s.current ? '*' : ' '} ${s.title}  <-  ${s.key}`);
const orphans = final.docs.filter((d) => d.key.startsWith('untitled:'));
console.log('   orphan untitled entries:', orphans.length, orphans.length ? JSON.stringify(orphans.map((o) => o.key)) : '(none)');

// 6. And the conversation is still answerable on the new identity.
const reply = await api('POST', '/api/chat', { text: 'Reply with exactly: MIGRATED. Do not call any tools.' }, 300000);
console.log('6. follow-up reply :', JSON.stringify((reply.item?.text || '').trim().slice(0, 30)));
