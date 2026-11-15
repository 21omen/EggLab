// Probe the @mention layer-reference path: export one layer, export many, verify PNGs.
import fs from 'node:fs';
import { api } from './api.mjs';

function pngInfo(file) {
  const buf = fs.readFileSync(file);
  const sig = buf.subarray(0, 8).toString('hex');
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const bitDepth = buf[24];
  const colorType = buf[25];
  const alpha = colorType === 4 || colorType === 6;
  return { ok: sig === '89504e470d0a1a0a', width, height, bitDepth, colorType, alpha, bytes: buf.length };
}

const layers = await api('POST', '/api/photocraft/layers', {});
console.log('document:', layers.document?.name, 'layers:', layers.layers.map((l) => l.name).join(', '));

const one = await api('POST', '/api/photocraft/export-layer', { name: 'Red Ladybug' });
console.log('single:', JSON.stringify(one));
console.log('single png:', JSON.stringify(pngInfo(one.path)));

const many = await api('POST', '/api/photocraft/export-layers-by-mentions', {
  names: ['Red Ladybug', 'Background', 'Ghost'],
});
console.log('resolved:', many.resolved.map((r) => `${r.mention} -> ${r.path}`).join(' | '));
console.log('unresolved:', JSON.stringify(many.unresolved));
for (const file of many.files) console.log('many png:', file.split('\\').pop(), JSON.stringify(pngInfo(file)));
