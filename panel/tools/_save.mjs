import fs from 'node:fs';
import { api } from './api.mjs';
const name = process.argv[2] || 'jazz-night';
fs.mkdirSync(`D:/neww/projects/${name}/assets`, { recursive: true });
console.log(await api('POST', '/api/photocraft/project/save', { path: `projects/${name}/${name}.pcraft` }));
console.log('doc:', JSON.stringify((await api('GET', '/api/photocraft/project')).document));
