// End-to-end: attach a text-layer export + canvas render exactly like the
// composer does, then ask the agent what it sees. Proves @canvas/@layer labels
// reach the model and that the model can actually read the pixels.
import { api } from './api.mjs';

const st = await api('GET', '/api/status');
console.log('photocraft:', st?.photocraft?.running, st?.photocraft?.document?.name);

const layers = await api('POST', '/api/photocraft/layers', {});
const flat = [];
const walk = (l) => (l || []).forEach((x) => { flat.push(x); walk(x.children); });
walk(layers?.layers);
const text = flat.find((l) => String(l.kind || '').toLowerCase() === 'type');
if (!text) throw new Error('no type layer — run canvas-text-test.mjs first');
console.log('type layer:', text.name);

const ref = await api('POST', '/api/photocraft/export-layer', { name: text.name });
const canvas = await api('POST', '/api/photocraft/preview', { maxSide: 800 });
console.log('refs:', ref.path, canvas.path, canvas.kind);

await api('POST', '/api/chat/clear', {});
const sent = await api(
  'POST',
  '/api/chat',
  {
    text: 'Look at the two reference images. Reply in one line: the exact word on the text layer, then the canvas size in pixels. Do not call any tools.',
    files: [ref.path, canvas.path],
    refMap: { [ref.path]: text.name, [canvas.path]: 'canvas' },
  },
  400000,
);
console.log('TOOLS:', JSON.stringify((sent.item?.tools || []).map((t) => t.name)));
console.log('ANSWER:', JSON.stringify(sent.item?.text));
console.log('ERROR:', sent.item?.error || null);
