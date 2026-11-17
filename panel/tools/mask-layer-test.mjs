// Unit test for converting a user-painted PhotoCraft mask layer to the
// full-canvas black/white mask used by sd-cli --mask. No PhotoCraft/GPU needed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { decodePng, encodePng, layerMask } from '../service/pngfeather.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'egglab-mask-'));
const mask = path.join(dir, 'mask.png');
const out = path.join(dir, 'out.png');
const invert = path.join(dir, 'invert.png');
const alphaMask = path.join(dir, 'alpha.png');
const alphaOut = path.join(dir, 'alpha-out.png');

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

// Opaque black mask with a white 10x8 region at (5,7).
const mw = 40;
const mh = 30;
const md = Buffer.alloc(mw * mh * 4);
for (let i = 3; i < md.length; i += 4) md[i] = 255;
for (let y = 7; y < 15; y++) {
  for (let x = 5; x < 15; x++) {
    const i = (y * mw + x) * 4;
    md[i] = md[i + 1] = md[i + 2] = 255;
  }
}
encodePng(mask, mw, mh, md);

// Place the mask at document (20,10) on a 100x80 canvas layer.
layerMask(mask, out, 100, 80, [20, 10], false);
const o = decodePng(out);
const at = (x, y) => o.data[(y * 100 + x) * 4];
check('mask canvas size', o.width === 100 && o.height === 80);
check('white region lands at bounds', at(27, 19) === 255, String(at(27, 19)));
check('outside stays black', at(0, 0) === 0 && at(60, 50) === 0);
check('output is opaque', o.data[3] === 255);

layerMask(mask, invert, 100, 80, [20, 10], true);
const inv = decodePng(invert);
const iat = (x, y) => inv.data[(y * 100 + x) * 4];
check('invert flips editable area', iat(27, 19) === 0 && iat(20, 10) === 255);

// Transparent layer with a white brush stroke: alpha must select the region.
const aw = 20;
const ah = 20;
const ad = Buffer.alloc(aw * ah * 4);
for (let i = 0; i < ad.length; i += 4) {
  ad[i] = ad[i + 1] = ad[i + 2] = 255;
  ad[i + 3] = 0;
}
for (let y = 2; y < 6; y++) {
  for (let x = 3; x < 9; x++) ad[(y * aw + x) * 4 + 3] = 255;
}
encodePng(alphaMask, aw, ah, ad);
layerMask(alphaMask, alphaOut, 40, 40, [5, 5], false);
const ao = decodePng(alphaOut);
const aat = (x, y) => ao.data[(y * 40 + x) * 4];
check('transparent stroke selected by alpha', aat(9, 8) === 255, String(aat(9, 8)));
check('transparent background kept', aat(0, 0) === 0);

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${failures ? 'FAILED' : 'OK'} — ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
