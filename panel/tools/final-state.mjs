import fs from 'node:fs';
import path from 'node:path';
import { api } from './api.mjs';

console.log('=== EggLab final state ===');
console.log('\nProjects on disk:');
for (const p of fs.readdirSync('D:\\neww\\projects')) console.log('  ' + p);

console.log('\nChat transcripts:');
for (const p of fs.readdirSync(path.join('D:\\neww\\EggLab\\panel', 'chats'))) {
  const st = fs.statSync(path.join('D:\\neww\\EggLab\\panel', 'chats', p));
  console.log(`  ${p} (${Math.round(st.size / 1024)} KB)`);
}

const sessions = await api('GET', '/api/sessions');
console.log('\nSession registry:');
for (const d of sessions.docs) {
  console.log(`  ${d.current ? '*' : ' '} ${d.title}  <-  ${d.model}  (live:${d.exists})`);
}

const proj = await api('GET', '/api/photocraft/project');
console.log('\nPhotoCraft doc:', proj.document?.name, '| path:', proj.document?.path, '| dirty:', proj.document?.dirty);
