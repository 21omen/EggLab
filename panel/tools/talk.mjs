// Send one human-style message to the panel agent and print what it did.
// Usage: node tools/talk.mjs "message" [--file path]...
import { api } from './api.mjs';

const argv = process.argv.slice(2);
const files = [];
let text = '';
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--file') files.push(argv[++i]);
  else text = text ? `${text} ${argv[i]}` : argv[i];
}

const before = await api('GET', '/api/photocraft/project');
console.log('DOC BEFORE:', before?.document?.name || null, before?.document?.path || '');

const res = await api('POST', '/api/chat', { text, files }, 1800000);
const item = res.item || {};
console.log('TOOLS:', (item.tools || []).map((t) => t.name).join(' > ') || '(none)');
console.log('AGENT:', item.text);
if (item.error) console.log('ERROR:', item.error);

const after = await api('GET', '/api/photocraft/project');
console.log('DOC AFTER:', after?.document?.name || null, after?.document?.path || '', 'dirty:', after?.document?.dirty);
