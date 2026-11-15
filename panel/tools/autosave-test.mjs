// Place a layer through the agent's HTTP path and check that autosave persists it.
import fs from 'node:fs';
import { api } from './api.mjs';

const before = await api('GET', '/api/photocraft/project');
console.log('before: revision', before.document.revision, 'dirty', before.document.dirty, 'path', before.document.path);

const sticker = 'D:\\neww\\EggLab\\out\\egglab-turbo-20261031-151249-1600732461-rgba.png';
const t0 = Date.now();
const placed = await api('POST', '/api/photocraft/place', {
  path: sticker,
  at: [200, 200],
  name: 'Autosave probe',
}, 180000);
console.log('place took', Math.round((Date.now() - t0) / 1000), 's');
console.log('save:', JSON.stringify(placed.save));

const file = placed.save?.path;
console.log('project file exists:', file ? fs.existsSync(file) : 'no path', file ? fs.statSync(file).size : 0);

const after = await api('GET', '/api/photocraft/project');
console.log('after: revision', after.document.revision, 'dirty', after.document.dirty, 'savedRevision', after.document.savedRevision);

const layers = await api('POST', '/api/photocraft/layers', {});
console.log('layers now:', layers.layers.map((l) => l.name).join(', '));
