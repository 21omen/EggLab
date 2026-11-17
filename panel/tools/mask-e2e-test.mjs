// Manual PhotoCraft end-to-end test for the separate mask layer path.
// Requires the panel + PhotoCraft running. Creates a scratch document, paints
// synthetic source/mask layers, runs one masked edit, then discards the scratch
// document and reactivates the document that was open before. It never saves
// the user's document. Run from panel/:
//   node tools/mask-e2e-test.mjs
//   $env:EGGLAB_CONTROL="$env:APPDATA\EggLab\control.json"; node tools/mask-e2e-test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { encodePng } from '../service/pngfeather.mjs';

const controlPath = process.env.EGGLAB_CONTROL || 'control.json';
const ctl = JSON.parse(fs.readFileSync(controlPath, 'utf8'));
const api = async (method, p, body, timeout = 300000) => {
  const r = await fetch(ctl.url + p, {
    method,
    headers: { 'x-egglab-token': ctl.token, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeout),
  });
  const t = await r.text();
  let d;
  try {
    d = JSON.parse(t);
  } catch {
    d = t;
  }
  if (r.status >= 400) throw new Error(`${p}: ${d.error || d}`);
  return d;
};

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'egglab-mask-e2e-'));
const source = path.join(dir, 'source.png');
const mask = path.join(dir, 'mask.png');
const w = 512;
const h = 512;
const sd = Buffer.alloc(w * h * 4);
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    sd[i] = 40 + Math.round((x / w) * 80);
    sd[i + 1] = 60 + Math.round((y / h) * 60);
    sd[i + 2] = 110;
    sd[i + 3] = 255;
  }
}
encodePng(source, w, h, sd);
const md = Buffer.alloc(w * h * 4);
for (let i = 3; i < md.length; i += 4) md[i] = 255;
for (let y = 120; y < 300; y++) {
  for (let x = 140; x < 340; x++) {
    const i = (y * w + x) * 4;
    md[i] = md[i + 1] = md[i + 2] = 255;
  }
}
encodePng(mask, w, h, md);

let created = false;
let original = null;
try {
  const before = await api('GET', '/api/photocraft/project');
  original = (before.documents || []).find((d) => d.active) || null;
  console.log('original document:', original?.label || '(none)');
  console.log('new doc ->', JSON.stringify((await api('POST', '/api/photocraft/new-document', { width: w, height: h, background: 'white', name: 'EggLab Mask Test' })).result).slice(0, 120));
  created = true;
  await api('POST', '/api/photocraft/place', { path: source, name: 'SourceTest', center: [w / 2, h / 2] });
  await api('POST', '/api/photocraft/place', { path: mask, name: 'MaskTest', center: [w / 2, h / 2] });
  const layers = await api('POST', '/api/photocraft/layers');
  const flat = [];
  const walk = (list) => (list || []).forEach((l) => { flat.push(l); walk(l.children); });
  walk(layers.layers);
  const src = flat.find((l) => l.name === 'SourceTest');
  const msk = flat.find((l) => l.name === 'MaskTest');
  console.log('layers:', flat.map((l) => `${l.name}#${l.id}`).join(', '));
  if (!src || !msk) throw new Error('scratch layers missing');
  await api('POST', '/api/photocraft/command', { id: 'layer.select', params: { layer: src.id } });
  const res = await api('POST', '/api/photocraft/edit-active', {
    prompt: 'A large solid blue circle fills the masked area. Preserve everything outside the mask.',
    maskLayer: 'MaskTest',
    strength: 0.9,
    workflow: 'turbo',
    width: w,
    height: h,
    seed: 123,
  });
  console.log('edit ->', JSON.stringify({ ok: res.ok, mode: res.mode, maskLayer: res.maskLayer, job: res.job?.status, output: res.output, error: res.error }).slice(0, 500));
} finally {
  if (created) {
    try {
      const closed = await api('POST', '/api/photocraft/project/close', { save: false });
      console.log('closed scratch ->', JSON.stringify(closed).slice(0, 160));
      if (original) {
        const after = await api('GET', '/api/photocraft/project');
        const still = (after.documents || []).find((d) => d.label === original.label);
        if (still && !still.active) {
          await api('POST', '/api/photocraft/command', {
            id: 'document.activate',
            params: { document: still.index },
          });
          console.log('reactivated original ->', still.label);
        }
      }
    } catch (err) {
      console.log('close scratch failed:', err.message);
    }
  }
  fs.rmSync(dir, { recursive: true, force: true });
}
