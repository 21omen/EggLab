// Remove the migration-probe fixture: its chat, its history file, its project.
import fs from 'node:fs';
import path from 'node:path';
import { api } from './api.mjs';

const PANEL = 'D:\\neww\\EggLab\\panel';
const KEY = 'd:\\neww\\projects\\migration-probe\\migration-probe.pcraft';

// 1. Drop the chat binding (deletes the OpenCode session + registry entry).
const before = await api('GET', '/api/sessions');
if (before.docs.some((d) => d.key === KEY)) {
  await api('POST', '/api/sessions/delete', { key: KEY });
  console.log('chat removed');
} else {
  console.log('chat already gone');
}

// 2. Drop the per-document history file.
const hist = path.join(PANEL, 'chats', `${KEY.replace(/[^a-z0-9]+/gi, '_').slice(0, 80)}.json`);
if (fs.existsSync(hist)) {
  fs.rmSync(hist);
  console.log('history file removed:', path.basename(hist));
}

// 3. Drop the project folder.
const dir = 'D:\\neww\\projects\\migration-probe';
if (fs.existsSync(dir)) {
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('project folder removed');
}

const after = await api('GET', '/api/sessions');
console.log('\nregistry now:');
for (const s of after.docs) console.log(`  ${s.current ? '*' : ' '} ${s.title}  <-  ${s.key}`);
console.log('\nprojects on disk:');
for (const p of fs.readdirSync('D:\\neww\\projects')) console.log('  ' + p);
