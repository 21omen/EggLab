import { api } from './api.mjs';
const c = await api('POST', '/api/photocraft/preview', { maxSide: 1000 });
console.log(c.path);
const l = await api('POST', '/api/photocraft/layers', {});
const flat = [];
const walk = (xs) => (xs || []).forEach((x) => { flat.push(x); walk(x.children); });
walk(l.layers);
for (const x of flat) console.log(x.name, `[${x.kind}]`, JSON.stringify(x.bounds), x.visible === false ? 'HIDDEN' : '');
