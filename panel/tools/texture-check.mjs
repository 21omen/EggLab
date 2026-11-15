// Skin-retouch check: measure a patch of skin before and after.
//
//   node tools/texture-check.mjs <image.png> [x y w h]
//
// Two numbers, both needed:
//   texture   high-frequency energy in the patch (mean |pixel - neighbours|).
//             Pores and fine lines live here. A retouch that drops this close
//             to zero has plastic-waxed the skin.
//   evenness  standard deviation of the patch *after* a 9px box blur, as a
//             percentage of the mean. Redness blotches and tone patches live
//             here. A real retouch lowers this while leaving texture standing.
//
// A good result moves evenness down and keeps texture within ~70-130% of the
// original. Texture near zero or evenness unchanged are both failures.
import fs from 'node:fs';
import zlib from 'node:zlib';

function decode(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('Not a PNG');
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

function analyse(file, x, y, w, h) {
  const img = decode(file);
  const { ch, data } = img;
  const at = (px, py) => (py * img.w + px) * ch;
  const lum = (px, py) => {
    const i = at(px, py);
    return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  };

  // High-frequency energy: |p - mean of its 4 neighbours|.
  let hf = 0;
  let n = 0;
  for (let py = y + 1; py < y + h - 1; py++) {
    for (let px = x + 1; px < x + w - 1; px++) {
      const c = lum(px, py);
      const around = (lum(px - 1, py) + lum(px + 1, py) + lum(px, py - 1) + lum(px, py + 1)) / 4;
      hf += Math.abs(c - around);
      n++;
    }
  }
  const texture = hf / n;

  // Low-frequency spread: 9px box blur, then stddev / mean.
  const bw = 9;
  const half = bw >> 1;
  const vals = [];
  for (let py = y + half; py < y + h - half; py++) {
    for (let px = x + half; px < x + w - half; px++) {
      let s = 0;
      for (let dy = -half; dy <= half; dy++) for (let dx = -half; dx <= half; dx++) s += lum(px + dx, py + dy);
      vals.push(s / (bw * bw));
    }
  }
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);

  // Redness is chroma, not luminance: a blotchy cheek and an even one can have
  // identical brightness. Measure red-excess (R - (G+B)/2) across the patch —
  // its spread is the redness blotchiness a retouch is supposed to reduce.
  const excess = [];
  for (let py = y + 1; py < y + h - 1; py++) {
    for (let px = x + 1; px < x + w - 1; px++) {
      const i = (py * img.w + px) * ch;
      excess.push(data[i] - (data[i + 1] + data[i + 2]) / 2);
    }
  }
  const em = excess.reduce((a, b) => a + b, 0) / excess.length;
  const esd = Math.sqrt(excess.reduce((a, b) => a + (b - em) ** 2, 0) / excess.length);

  return {
    file,
    box: [x, y, w, h],
    texture: Math.round(texture * 1000) / 1000,
    evenness: Math.round((sd / mean) * 10000) / 100,
    redness: Math.round(em * 10) / 10,
    redSpread: Math.round(esd * 100) / 100,
    mean: Math.round(mean * 10) / 10,
  };
}

const [file, xs, ys, ws, hs] = process.argv.slice(2);
// Default patch: her right cheek (left side of frame), skin only.
const r = analyse(file, Number(xs) || 360, Number(ys) || 500, Number(ws) || 110, Number(hs) || 110);
console.log(
  `${r.file}\n  box [${r.box.join(', ')}]  mean ${r.mean}\n` +
    `  texture   ${r.texture}   (high-freq: pores/lines)\n` +
    `  evenness  ${r.evenness}%  (low-freq luminance spread: shading)\n` +
    `  redness   ${r.redness} +/- ${r.redSpread}  (chroma blotchiness: the redness target)`
);
