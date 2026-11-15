// Save the untitled test document as a real project, then verify dirty clears.
import fs from 'node:fs';
import { api } from './api.mjs';

const before = await api('GET', '/api/photocraft/project');
console.log('before:', JSON.stringify(before.document));

const made = await api('POST', '/api/photocraft/project/path', { name: before.document.name });
console.log('project path:', made.path);

const saved = await api('POST', '/api/photocraft/project/save', { path: made.path });
console.log('save result:', JSON.stringify(saved));

console.log('file exists:', fs.existsSync(saved.path), 'bytes:', fs.existsSync(saved.path) ? fs.statSync(saved.path).size : 0);
console.log('assets dir:', fs.existsSync(made.path.replace(/[^\\/]+$/, 'assets')));

const after = await api('GET', '/api/photocraft/project');
console.log('after:', JSON.stringify(after.document));

const recent = await api('GET', '/api/photocraft/project/recent');
console.log('recent:', JSON.stringify(recent.projects));
