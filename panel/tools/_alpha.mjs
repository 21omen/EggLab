// Report real alpha statistics for a PNG: colour type, transparent pixel count,
// min/max alpha, and the bounding box of fully opaque pixels. This distinguishes
// "has an alpha channel" from "is actually transparent", and catches cut-outs
// whose subject touches the frame edge.
import fs from 'node:fs';
import zlib from 'node:zlib';

const file = process.argv[2];
if (!file) {
  console.error('usage: node tools/_alpha.mjs <file.png>');
  process.exit(2);
}
const buf = fs.readFileSync(file);
if (buf.readUInt32BE(0) !== 0x89504e47) {
  console.error('not a PNG');
  process.exit(2);
}

let pos = 8;
let width = 0;
let height = 0;
let depth = 0;
let colorType = 0;
const idat = [];
while (pos < buf.length) {
  const len = buf.readUInt32BE(pos);
  const type = buf.toString('ascii', pos + 4, pos + 8);
  const data = buf.subarray(pos + 8, pos + 8 + len);
  if (type === 'IHDR') {
    width = data.readUInt32BE(0);
    height = data.readUInt32BE(4);
    depth = data[8];
    colorType = data[9];
  } else if (type === 'IDAT') {
    idat.push(data);
  } else if (type === 'IEND') break;
  pos += 12 + len;
}
if (depth !== 8) {
  console.log(`${file} depth=${depth} unsupported`);
  process.exit(1);
}
const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
if (!channels) {
  console.log(`${file} colorType=${colorType} unsupported`);
  process.exit(1);
}

const raw = zlib.inflateSync(Buffer.concat(idat));
const stride = width * channels;
const out = Buffer.alloc(stride * height);
let prev = Buffer.alloc(stride);
const paeth = (a, b, c) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};
let off = 0;
for (let y = 0; y < height; y++) {
  const filter = raw[off++];
  const line = raw.subarray(off, off + stride);
  off += stride;
  const cur = Buffer.alloc(stride);
  for (let x = 0; x < stride; x++) {
    const a = x >= channels ? cur[x - channels] : 0;
    const b = prev[x];
    const c = x >= channels ? prev[x - channels] : 0;
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

if (colorType !== 6) {
  console.log(`${file} ${width}x${height} colorType=${colorType} (no alpha channel)`);
  process.exit(0);
}

let min = 255;
let max = 0;
let clear = 0;
let opaque = 0;
let x0 = width;
let y0 = height;
let x1 = -1;
let y1 = -1;
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const a = out[y * stride + x * 4 + 3];
    if (a < min) min = a;
    if (a > max) max = a;
    if (a === 0) clear++;
    if (a > 250) {
      opaque++;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
}
const total = width * height;
const pct = (n) => ((n / total) * 100).toFixed(1) + '%';
console.log(
  `${file}\n${width}x${height} RGBA  minAlpha=${min} maxAlpha=${max} ` +
    `transparent=${pct(clear)} opaque=${pct(opaque)} ` +
    `opaqueBounds=[${x0},${y0},${x1 - x0 + 1},${y1 - y0 + 1}] edges=${x0 === 0 || y0 === 0 || x1 === width - 1 || y1 === height - 1}`,
);
