import { api } from './api.mjs';

const W = 1080, H = 1350;
console.log(await api('POST', '/api/photocraft/new-document', { width: W, height: H, background: '#efe9df', name: 'Type probe' }));

const type = (params) => api('POST', '/api/photocraft/command', { id: 'type.create', params });
const shape = (params) => api('POST', '/api/photocraft/command', { id: 'shape.create', params });

for (const [font, size, y, text, name, color] of [
  ['Arial Black', 150, 520, 'MIDNIGHT', 'Headline', '#111111'],
  ['Arial', 54, 610, 'SET  ·  FRIDAY 8PM', 'Subhead', '#c2410c'],
  ['Consolas', 26, 1260, 'TICKETS 15  ·  THE BLUE ROOM', 'Footer', '#111111'],
]) {
  try {
    console.log(name, JSON.stringify(await type({ x: 90, y, text, name, align: 'left', font, size, color })).slice(0, 160));
  } catch (e) {
    console.log(name, 'ERR', e.message);
  }
}

try {
  console.log('shape', JSON.stringify(await shape({ kind: 'rect', rect: [90, 640, 240, 6], fill: '#c2410c', name: 'Accent bar' })).slice(0, 160));
} catch (e) {
  console.log('shape ERR', e.message);
}

const layers = await api('POST', '/api/photocraft/layers', {});
console.log('layers:', JSON.stringify(layers.layers?.map((l) => ({ name: l.name, kind: l.kind, bounds: l.bounds }))));
const shot = await api('POST', '/api/photocraft/preview', { maxSide: 900 });
console.log('canvas:', shot.path, shot.kind);
