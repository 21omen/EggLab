// One-shot verdict on a retouch: did it keep the texture, did it fix the tone,
// and can you see where the edit was placed?
//
//   node tools/retouch-verdict.mjs <source.png> <result.png> [x y w h]
//
// The box is both the skin sample and the region whose borders get traced.
// Defaults to the box used for every earlier baseline so numbers stay
// comparable: 360 500 120 120.
//
// Three questions, three numbers:
//   texture  high-frequency energy (pores/grain). A real over-smooth drops it
//            far; ~85% is the floor a resampled patch sits at, so that is the
//            pass line rather than 90%.
//   redness  chroma mean + spread. The retouch target: it has to improve by a
//            real margin (~3%) in either the level or the blotchiness. "0.5%
//            lower" is noise, not a retouch.
//   seam     the biggest jump at the changed area's border measured against the
//            image's OWN noise floor. Above ~2.5x and there is a visible edge.
import fs from 'node:fs';
import zlib from 'node:zlib';

function decode(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('Not a PNG: ' + file);
  let pos = 8;
  let w = 0;
  let h = 0;
  let depth = 0;
  let colorType = 0;
  const idat = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      depth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (depth !== 8 || (colorType !== 2 && colorType !== 6)) throw new Error(`depth ${depth} type ${colorType}`);
  const ch = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = Buffer.alloc(stride * h);
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  let off = 0;
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[off++];
    const line = raw.subarray(off, off + stride);
    off += stride;
    const cur = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0;
      const b = prev[x];
      const c = x >= ch ? prev[x - ch] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) v += paeth(a, b, c);
      cur[x] = v & 0xff;
    }
    cur.copy(out, y * stride);
    prev = cur;
  }
  return { w, h, ch, data: out };
}

/** texture / evenness / redness over a box — same definitions as texture-check. */
function sample(img, x, y, bw, bh) {
  const { w, ch, data } = img;
  const lum = [];
  const chroma = [];
  for (let j = y; j < y + bh; j++) {
    for (let i = x; i < x + bw; i++) {
      const p = (j * w + i) * ch;
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];
      lum.push(0.299 * r + 0.587 * g + 0.114 * b);
      chroma.push(r - (g + b) / 2);
    }
  }
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const sd = (a) => {
    const m = mean(a);
    return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length);
  };
  // High-pass: value minus the mean of its 4-neighbour cross. Averaged over the
  // box this is texture energy — pores and grain, not shading.
  let hp = 0;
  let n = 0;
  for (let j = y + 1; j < y + bh - 1; j++) {
    for (let i = x + 1; i < x + bw - 1; i++) {
      const at = (px, py) => lum[(py - y) * bw + (px - x)];
      hp += Math.abs(at(i, j) - (at(i - 1, j) + at(i + 1, j) + at(i, j - 1) + at(i, j + 1)) / 4);
      n++;
    }
  }
  return { texture: hp / n, lumMean: mean(lum), redness: mean(chroma), redSd: sd(chroma) };
}

const [srcFile, outFile, bx, by, bw, bh] = process.argv.slice(2);
if (!outFile) {
  console.log('usage: node tools/retouch-verdict.mjs <source.png> <result.png> [x y w h]');
  process.exit(1);
}
const box = [bx, by, bw, bh].map(Number);
const region = box.every(Number.isFinite) ? box : [360, 500, 120, 120];

const A = decode(srcFile);
const B = decode(outFile);
if (A.w !== B.w || A.h !== B.h) throw new Error(`size mismatch ${A.w}x${A.h} vs ${B.w}x${B.h}`);

const delta = (x, y) => {
  const i = (y * A.w + x) * A.ch;
  const j = (y * B.w + x) * B.ch;
  return (Math.abs(A.data[i] - B.data[j]) + Math.abs(A.data[i + 1] - B.data[j + 1]) + Math.abs(A.data[i + 2] - B.data[j + 2])) / 3;
};

// Whole-image change.
let sum = 0;
let n = 0;
let unchanged = 0;
for (let y = 0; y < A.h; y += 3) {
  for (let x = 0; x < A.w; x += 3) {
    const v = delta(x, y);
    sum += v;
    n++;
    if (v < 0.5) unchanged++;
  }
}

// Where did the edit land? Its own bounding box, measured from the pixels.
// Tracing THAT (rather than a box the caller guessed) is what makes the seam
// check find the real edge: the old failure sat at x260..779, y370..1208.
let x0 = A.w;
let y0 = A.h;
let x1 = -1;
let y1 = -1;
for (let y = 0; y < A.h; y += 2) {
  for (let x = 0; x < A.w; x += 2) {
    if (delta(x, y) > 6) {
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
}
if (x1 < 0) {
  console.log('nothing changed');
  process.exit(1);
}
// An explicit box overrides it, otherwise sample skin for tone/texture and
// trace the seam on the detected change.
const explicit = box.every(Number.isFinite);
const skin = explicit ? region : [360, 500, 120, 120];
const seamBox = explicit ? region : [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
const [rx, ry, rw, rh] = seamBox;

const rows = [];
for (let y = 0; y < A.h; y++) {
  let s = 0;
  for (let x = 0; x < A.w; x++) s += delta(x, y);
  rows.push(s / A.w);
}
const cols = [];
for (let x = 0; x < A.w; x++) {
  let s = 0;
  for (let y = 0; y < A.h; y++) s += delta(x, y);
  cols.push(s / A.h);
}

const floor = (pr) => {
  const j = [];
  for (let i = 2; i < pr.length; i++) j.push(Math.abs(pr[i] - pr[i - 2]));
  j.sort((a, b) => a - b);
  return j[Math.floor(j.length * 0.99)] || 1;
};
const edge = (pr, border) => {
  let worst = 0;
  for (let i = Math.max(2, border - 4); i <= Math.min(pr.length - 1, border + 4); i++) {
    worst = Math.max(worst, Math.abs(pr[i] - pr[i - 2]));
  }
  return worst / floor(pr);
};

const borders = [
  ['top', edge(rows, ry)],
  ['bottom', edge(rows, ry + rh - 1)],
  ['left', edge(cols, rx)],
  ['right', edge(cols, rx + rw - 1)],
];
const worst = Math.max(...borders.map(([, z]) => z));

const s0 = sample(A, ...skin);
const s1 = sample(B, ...skin);

const r2 = (v) => Math.round(v * 100) / 100;
console.log(`${srcFile}  ->  ${outFile}`);
console.log(`frame ${A.w}x${A.h}   edit bbox [${seamBox.join(', ')}]   tone sample [${skin.join(', ')}]`);
console.log('');
console.log(`  changed      ${r2(sum / n)} mean delta   ${(unchanged / n * 100).toFixed(1)}% untouched`);
console.log(`  texture      ${r2(s0.texture)} -> ${r2(s1.texture)}   (${((s1.texture / s0.texture) * 100).toFixed(0)}% retained)`);
console.log(`  redness      ${r2(s0.redness)} +/- ${r2(s0.redSd)}  ->  ${r2(s1.redness)} +/- ${r2(s1.redSd)}`);
console.log(`  luminance    ${r2(s0.lumMean)} -> ${r2(s1.lumMean)}`);
console.log('');
for (const [name, z] of borders) console.log(`  ${name.padEnd(7)} border ${r2(z)}x own noise`);
console.log('');

const kept = s1.texture / s0.texture >= 0.85;
// A real correction moves the level or the blotchiness by ~3%+. A 0.5% dip with
// a WIDER spread is the old result exactly: nothing was actually fixed.
const better =
  s1.redness <= s0.redness * 0.97 || s1.redSd <= s0.redSd * 0.97;
const noSeam = worst < 2.5;
console.log(
  `  texture ${kept ? 'KEPT' : 'LOST'}   redness ${better ? 'REDUCED' : 'NOT REDUCED'}   seam ${noSeam ? 'NONE' : 'VISIBLE'}`,
);
const pass = kept && better && noSeam;
console.log(`  verdict: ${pass ? 'PASS' : 'FAIL'}`);
process.exit(pass ? 0 : 1);
