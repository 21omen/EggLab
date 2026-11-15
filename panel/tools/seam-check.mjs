// Where did the retouch patch land, and how hard is its edge?
//
//   node tools/seam-check.mjs <source.png> <retouched.png>
//
// Diffs the two images per pixel, finds the bounding box of everything that
// changed, then measures the discontinuity along that box's perimeter: the mean
// |delta| across the boundary line versus just inside it. A retouch blended
// properly has no step at the boundary; a rectangle pasted back has one.
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

const [aFile, bFile] = process.argv.slice(2);
if (!bFile) {
  console.log('usage: node tools/seam-check.mjs <source.png> <retouched.png>');
  process.exit(1);
}
const A = decode(aFile);
const B = decode(bFile);
if (A.w !== B.w || A.h !== B.h) throw new Error(`size mismatch ${A.w}x${A.h} vs ${B.w}x${B.h}`);

const delta = (x, y) => {
  const i = (y * A.w + x) * A.ch;
  const j = (y * B.w + x) * B.ch;
  return (
    (Math.abs(A.data[i] - B.data[j]) +
      Math.abs(A.data[i + 1] - B.data[j + 1]) +
      Math.abs(A.data[i + 2] - B.data[j + 2])) /
    3
  );
};

// Changed bounding box (delta > 6 counts as changed).
let x0 = A.w;
let y0 = A.h;
let x1 = -1;
let y1 = -1;
let changed = 0;
for (let y = 0; y < A.h; y++) {
  for (let x = 0; x < A.w; x++) {
    if (delta(x, y) > 6) {
      changed++;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
}
const total = A.w * A.h;
console.log(`changed pixels: ${((changed / total) * 100).toFixed(1)}% of frame`);
if (x1 < 0) {
  console.log('nothing changed');
  process.exit(0);
}
console.log(`changed bbox: x ${x0}..${x1}  y ${y0}..${y1}  (${x1 - x0 + 1}x${y1 - y0 + 1})`);

// Perimeter discontinuity: mean delta exactly on the box border, vs the band
// just inside it and the band just outside it. A step at the line = seam.
const meanDelta = (pts) => (pts.length ? pts.reduce((a, b) => a + b, 0) / pts.length : 0);
const on = [];
const inBand = [];
const outBand = [];
for (let x = x0; x <= x1; x++) {
  for (const [y, list] of [
    [y0, 0],
    [y1, 0],
  ]) {
    const v = delta(x, y);
    on.push(v);
    if (y0 + 5 < y1) (list === 0 ? (y === y0 ? inBand : outBand) : []).push(0);
  }
  on[on.length - 1] = delta(x, y0);
}
// Explicit, readable bands instead of the tuple trick above.
const band = (y, from, to) => {
  const pts = [];
  for (let x = from; x <= to; x++) pts.push(delta(x, y));
  return meanDelta(pts);
};
const vband = (x, from, to) => {
  const pts = [];
  for (let y = from; y <= to; y++) pts.push(delta(x, y));
  return meanDelta(pts);
};

const topOn = band(x0 === 0 ? 1 : x0, x0, x1);
const borderTop = meanDelta(Array.from({ length: x1 - x0 + 1 }, (_, i) => delta(x0 + i, y0)));
const insideTop = meanDelta(Array.from({ length: x1 - x0 + 1 }, (_, i) => delta(x0 + i, y0 + 4)));
const outsideTop = y0 > 4 ? meanDelta(Array.from({ length: x1 - x0 + 1 }, (_, i) => delta(x0 + i, y0 - 4))) : 0;
const borderLeft = meanDelta(Array.from({ length: y1 - y0 + 1 }, (_, i) => delta(x0, y0 + i)));
const insideLeft = meanDelta(Array.from({ length: y1 - y0 + 1 }, (_, i) => delta(x0 + 4, y0 + i)));
const borderRight = meanDelta(Array.from({ length: y1 - y0 + 1 }, (_, i) => delta(x1, y0 + i)));
const insideRight = meanDelta(Array.from({ length: y1 - y0 + 1 }, (_, i) => delta(x1 - 4, y0 + i)));
const borderBottom = meanDelta(Array.from({ length: x1 - x0 + 1 }, (_, i) => delta(x0 + i, y1)));
const insideBottom = meanDelta(Array.from({ length: x1 - x0 + 1 }, (_, i) => delta(x0 + i, y1 - 4)));

const r = (n) => Math.round(n * 100) / 100;
console.log('');
console.log('perimeter: mean |delta| on the boundary line vs 4px inside it');
console.log(`  top     border ${r(borderTop)}   inside ${r(insideTop)}   outside ${r(outsideTop)}`);
console.log(`  left    border ${r(borderLeft)}   inside ${r(insideLeft)}`);
console.log(`  right   border ${r(borderRight)}   inside ${r(insideRight)}`);
console.log(`  bottom  border ${r(borderBottom)}   inside ${r(insideBottom)}`);
const avgBorder = (borderTop + borderLeft + borderRight + borderBottom) / 4;
const avgInside = (insideTop + insideLeft + insideRight + insideBottom) / 4;
console.log(`  average border ${r(avgBorder)} vs inside ${r(avgInside)}  -> step ratio ${r(avgBorder / (avgInside || 1))}`);
console.log(
  avgBorder > avgInside * 1.25
    ? 'VERDICT: hard edge — the edit is a rectangle pasted back (visible seam).'
    : 'VERDICT: no step at the boundary — the edit is blended.'
);
