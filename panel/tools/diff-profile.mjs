// Column/row profile of the difference between two images.
//   node tools/diff-profile.mjs <a.png> <b.png> [axis]
// A rectangular patch shows up as a step (or spike) in these profiles: columns
// where the mean difference jumps and stays up, then jumps back down.
import fs from 'node:fs';
import zlib from 'node:zlib';

function decode(file) {
  const buf = fs.readFileSync(file);
  let pos = 8;
  let w = 0;
  let h = 0;
  let colorType = 0;
  const idat = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
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

const [aFile, bFile, axis = 'col'] = process.argv.slice(2);
const A = decode(aFile);
const B = decode(bFile);
// The two files do not have to share a channel count (RGB source vs RGBA export),
// so index each image with its own stride.
const delta = (x, y) => {
  const p = (y * A.w + x) * A.ch;
  const q = (y * B.w + x) * B.ch;
  if (p + 2 >= A.data.length || q + 2 >= B.data.length) return 0;
  return (
    (Math.abs(A.data[p] - B.data[q]) +
      Math.abs(A.data[p + 1] - B.data[q + 1]) +
      Math.abs(A.data[p + 2] - B.data[q + 2])) /
    3
  );
};
const n = axis === 'col' ? A.w : A.h;
const other = axis === 'col' ? A.h : A.w;
const prof = [];
for (let i = 0; i < n; i++) {
  let s = 0;
  for (let j = 0; j < other; j++) {
    const x = axis === 'col' ? i : j;
    const y = axis === 'col' ? j : i;
    s += delta(x, y);
  }
  prof.push(s / other);
}
// Largest jumps between adjacent lines = the rectangle edges.
const jumps = [];
for (let i = 1; i < prof.length; i++) jumps.push({ i, jump: prof[i] - prof[i - 1], v: prof[i] });
jumps.sort((a, b) => Math.abs(b.jump) - Math.abs(a.jump));
console.log(`${axis} profile (${n} lines), top 12 jumps:`);
for (const j of jumps.slice(0, 12)) {
  console.log(
    `  ${axis} ${String(j.i).padStart(4)}  jump ${j.jump >= 0 ? '+' : ''}${j.jump.toFixed(2)}  level ${j.v.toFixed(2)}`
  );
}
const mean = prof.reduce((a, b) => a + b, 0) / prof.length;
console.log(`mean level ${mean.toFixed(2)}`);
