// Region composite test: a feathered patch must be merged over the original
// layer, not placed over a still-visible original. This is the fix for the
// green-arc / square-seam artefact seen in the annotated-photo eval.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { decodePng, encodePng, compositePng } from '../service/pngfeather.mjs';

const dir = path.join(os.tmpdir(), `egglab-composite-${process.pid}`);
fs.mkdirSync(dir, { recursive: true });
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

function solid(width, height, r, g, b, a) {
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  }
  return data;
}

const baseFile = path.join(dir, 'base.png');
const patchFile = path.join(dir, 'patch.png');
const outFile = path.join(dir, 'out.png');
encodePng(baseFile, 4, 4, solid(4, 4, 200, 20, 20, 255));
encodePng(patchFile, 2, 2, solid(2, 2, 20, 20, 200, 128));
compositePng(baseFile, patchFile, outFile, [1, 1, 2, 2]);
let out = decodePng(outFile);
const px = (img, x, y) => [...img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4)];
check('composite size', out.width === 4 && out.height === 4, `${out.width}x${out.height}`);
check('outside untouched', JSON.stringify(px(out, 0, 0)) === JSON.stringify([200, 20, 20, 255]), JSON.stringify(px(out, 0, 0)));
check('inside blended', px(out, 1, 1)[3] === 255 && px(out, 1, 1)[0] > 20 && px(out, 1, 1)[2] > 20, JSON.stringify(px(out, 1, 1)));

// Resize path: a 1x1 patch stretched over a 2x2 region must cover it.
const smallFile = path.join(dir, 'small.png');
encodePng(smallFile, 1, 1, solid(1, 1, 10, 200, 10, 255));
compositePng(baseFile, smallFile, outFile, [0, 0, 2, 2]);
out = decodePng(outFile);
let covered = 0;
for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
  const p = px(out, x, y);
  if (p[0] === 10 && p[1] === 200 && p[2] === 10) covered++;
}
check('resized patch covers region', covered === 4, `${covered}/4`);
check('resize leaves outside untouched', JSON.stringify(px(out, 3, 3)) === JSON.stringify([200, 20, 20, 255]));

try {
  fs.rmSync(dir, { recursive: true, force: true });
} catch {}
console.log(`\n${failures ? 'FAILED' : 'OK'} — ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
