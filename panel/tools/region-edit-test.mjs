// Verify the local (region) edit path: create a small doc, place an asset, run a
// region edit and confirm only that rectangle changed.
import fs from 'node:fs';

const c = JSON.parse(fs.readFileSync('D:/neww/EggLab/panel/control.json', 'utf8'));
const H = { 'x-egglab-token': c.token, 'content-type': 'application/json' };
async function api(method, path, body) {
  const res = await fetch(c.url + path, { method, headers: H, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  if (!res.ok) throw new Error(json?.error || text || res.status);
  return json;
}

const asset = process.argv[2];
if (!asset) throw new Error('usage: node region-edit-test.mjs <asset.png>');

const doc = await api('POST', '/api/photocraft/new-document', { width: 600, height: 600, background: '#10221C', name: 'region-edit-test' });
const index = doc.document ?? doc.index ?? doc.result?.document ?? doc.result?.index;
console.log('document', index);

const placed = await api('POST', '/api/photocraft/place', { path: asset, name: 'Hero', scale: 40, center: [300, 300] });
console.log('place:', JSON.stringify(placed).slice(0, 200));

const layers = await api('POST', '/api/photocraft/layers', {});
const hero = (layers.layers || []).find((l) => l.name === 'Hero');
console.log('hero bounds:', JSON.stringify(hero?.bounds));

const auditBefore = await api('POST', '/api/photocraft/audit', { max_side: 400 });

const region = [hero.bounds[0], hero.bounds[1], Math.round(hero.bounds[2] / 2), Math.round(hero.bounds[3] / 2)];
console.log('region:', region);

const edit = await api('POST', '/api/photocraft/edit-active', {
  prompt: 'Repaint this area with a single flat matte teal panel, even colour, no texture. Keep everything else unchanged.',
  region,
  workflow: 'turbo',
});
console.log('edit ok:', edit.ok, 'region:', JSON.stringify(edit.region), 'alpha:', JSON.stringify(edit.alpha));
console.log('placed:', JSON.stringify(edit.placed).slice(0, 220));

const layersAfter = await api('POST', '/api/photocraft/layers', {});
console.log('layer count before/after:', (layers.layers || []).length, (layersAfter.layers || []).length);

const outDir = 'D:/neww/projects/region-edit-test';
fs.mkdirSync(outDir, { recursive: true });
const flat = await api('POST', '/api/photocraft/export-flat', { dir: outDir, name: 'region-edit-test' });
console.log('flat:', JSON.stringify(flat));

try {
  await api('POST', '/api/photocraft/command', { id: 'file.close', params: { document: index } });
  console.log('closed');
} catch (err) {
  console.log('close failed:', err.message);
}
console.log('RESULT', flat.file);
