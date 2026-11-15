// Feather a PNG's edges into transparency so a patched region can be composited
// without a visible rectangle.
//
// Why this exists: the local-edit path crops a region, has the model edit the
// crop, and pastes it back at the same bounds. Model output is opaque, so the
// paste lands as a hard-edged rectangle over an unchanged image — measured on a
// real retouch as an outside delta of exactly 0.00 jumping straight to ~2 at the
// boundary. In smooth areas (sky, skin, wall) a straight step like that is
// immediately visible.
//
// Setting a ramped alpha instead means the top layer fades into the layer below
// over N pixels, so there is no line to see.
import fs from 'node:fs';
import zlib from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/* ------------------------------------------------------------------ */
/* decode                                                              */
/* ------------------------------------------------------------------ */

export function decodePng(file) {
  const buf = fs.readFileSync(file);
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`Not a PNG: ${file}`);
  let pos = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = 0;
  const idat = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (!width || !height) throw new Error(`PNG has no header: ${file}`);
  if (depth !== 8) throw new Error(`Unsupported bit depth ${depth}: ${file}`);
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`Unsupported colour type ${colorType}: ${file}`);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(stride * height);
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  let off = 0;
  let prev = Buffer.alloc(stride);
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
  // Normalise everything to RGBA so the encoder only ever writes one layout.
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0, j = 0; i < width * height; i++, j += 4) {
    const s = i * channels;
    if (channels === 4) {
      rgba[j] = out[s];
      rgba[j + 1] = out[s + 1];
      rgba[j + 2] = out[s + 2];
      rgba[j + 3] = out[s + 3];
    } else if (channels === 3) {
      rgba[j] = out[s];
      rgba[j + 1] = out[s + 1];
      rgba[j + 2] = out[s + 2];
      rgba[j + 3] = 255;
    } else if (channels === 2) {
      rgba[j] = rgba[j + 1] = rgba[j + 2] = out[s];
      rgba[j + 3] = out[s + 1];
    } else {
      rgba[j] = rgba[j + 1] = rgba[j + 2] = out[s];
      rgba[j + 3] = 255;
    }
  }
  return { width, height, data: rgba };
}

/* ------------------------------------------------------------------ */
/* encode                                                              */
/* ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** Write an RGBA buffer as a PNG (colour type 6, no interlace). */
export function encodePng(file, width, height, rgba) {
  if (rgba.length !== width * height * 4) {
    throw new Error(`RGBA buffer is ${rgba.length} bytes, expected ${width * height * 4}`);
  }
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none, keeps the encoder honest and simple
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const png = Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(file, png);
  return file;
}

/* ------------------------------------------------------------------ */
/* feather                                                             */
/* ------------------------------------------------------------------ */

// Smoothstep, so the ramp has no visible shoulder where it starts or ends.
const smooth = (t) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};

/**
 * Ramp alpha to 0 over `px` pixels at every edge of the image.
 * Returns the feather actually used (clamped so a small patch never loses its
 * whole interior).
 */
/**
 * Write an inpaint mask: white over `rect`, fading to black over `feather` px
 * past each edge (smoothstep, so it starts and ends with a zero slope).
 *
 * Why the ramp lives *outside* the rect rather than inside it: the edit box is
 * where the change must land, so the core has to be fully selected; the blend
 * band sits in pixels the edit does not need, which is exactly where a cut line
 * would otherwise show. Growing past the box also gives the model surrounding
 * context to match against — a surgical strip is the thing that reads as a seam.
 */
export function regionMask(file, width, height, rect, featherPx) {
  const [rx, ry, rw, rh] = rect.map((v) => Math.round(Number(v) || 0));
  const wanted = Math.max(1, Math.round(Number(featherPx) || 0));
  // Keep at least a quarter of the box as solid core, whatever the request.
  const limit = Math.max(1, Math.floor(Math.min(rw, rh) / 4));
  const f = Math.min(wanted, limit);
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Distance outside the rect (0 or negative inside).
      const dx = Math.max(rx - x, x - (rx + rw - 1), 0);
      const dy = Math.max(ry - y, y - (ry + rh - 1), 0);
      const d = Math.max(dx, dy);
      const a = d >= f ? 0 : smooth(1 - d / f);
      const v = Math.round(a * 255);
      const i = (y * width + x) * 4;
      rgba[i] = v;
      rgba[i + 1] = v;
      rgba[i + 2] = v;
      rgba[i + 3] = 255;
    }
  }
  encodePng(file, width, height, rgba);
  return f;
}

export function featherEdges(src, dst, px) {
  const { width, height, data } = decodePng(src);
  const wanted = Math.max(1, Math.round(Number(px) || 0));
  // Never eat more than a third of the patch: the middle has to stay opaque or
  // the edit stops being visible at all.
  const limit = Math.max(1, Math.floor(Math.min(width, height) / 3));
  const f = Math.min(wanted, limit);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const fromEdge = Math.min(x, y, width - 1 - x, height - 1 - y);
      if (fromEdge >= f) continue;
      const a = smooth((fromEdge + 1) / (f + 1));
      data[(y * width + x) * 4 + 3] = Math.round(data[(y * width + x) * 4 + 3] * a);
    }
  }
  encodePng(dst, width, height, data);
  return f;
}
