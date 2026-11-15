import fs from 'node:fs';
import zlib from 'node:zlib';

/**
 * Read the alpha channel of a PNG and report what is actually transparent.
 *
 * "It has an alpha channel" and "it is a usable cut-out" are different facts.
 * A failed transparency render still ships an RGBA file whose alpha is ~255
 * everywhere, and a subject that runs into the frame edge looks like a crop, not
 * an object. Only numbers distinguish those cases.
 */
export function alphaStats(file) {
  let buf;
  try {
    buf = fs.readFileSync(file);
  } catch (err) {
    return { ok: false, error: `Cannot read ${file}: ${err.message}` };
  }
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) {
    return { ok: false, error: 'Not a PNG file.' };
  }

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
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (!width || !height) return { ok: false, error: 'PNG has no header.' };
  if (depth !== 8) {
    return { ok: true, width, height, depth, hasAlpha: false, note: `bit depth ${depth} not inspected` };
  }
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels) return { ok: true, width, height, hasAlpha: false, note: `colour type ${colorType} not inspected` };
  if (colorType !== 4 && colorType !== 6) {
    return { ok: true, width, height, hasAlpha: false, verdict: 'opaque', note: 'no alpha channel' };
  }

  let raw;
  try {
    raw = zlib.inflateSync(Buffer.concat(idat));
  } catch (err) {
    return { ok: false, error: `Cannot inflate image data: ${err.message}` };
  }

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

  const aOff = channels - 1;
  let min = 255;
  let max = 0;
  let clear = 0;
  let opaque = 0;
  let partial = 0;
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    for (let x = 0; x < width; x++) {
      const a = out[row + x * channels + aOff];
      if (a < min) min = a;
      if (a > max) max = a;
      if (a < 8) clear++;
      else if (a > 247) {
        opaque++;
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      } else partial++;
    }
  }

  const total = width * height;
  const round = (n) => Math.round((n / total) * 1000) / 10;
  const transparentPct = round(clear);
  const opaquePct = round(opaque);
  const partialPct = round(partial);
  const touchesEdge =
    x1 >= 0 && (x0 === 0 || y0 === 0 || x1 === width - 1 || y1 === height - 1);
  const bounds = x1 >= 0 ? [x0, y0, x1 - x0 + 1, y1 - y0 + 1] : null;

  let verdict = 'cutout';
  if (transparentPct < 2) verdict = 'opaque';
  else if (opaquePct < 2) verdict = 'empty';

  return {
    ok: true,
    width,
    height,
    hasAlpha: true,
    minAlpha: min,
    maxAlpha: max,
    transparentPct,
    opaquePct,
    partialPct,
    subjectBounds: bounds,
    subjectTouchesEdge: touchesEdge,
    verdict,
  };
}

/** One-line verdict for tool output. */
export function describeAlpha(a) {
  if (!a?.ok) return 'alpha check failed';
  if (!a.hasAlpha) return 'no alpha channel — fully opaque';
  return (
    `${a.verdict}: transparent ${a.transparentPct}%, opaque ${a.opaquePct}%, ` +
    `partial ${a.partialPct}%, alpha ${a.minAlpha}..${a.maxAlpha}` +
    (a.subjectTouchesEdge ? ', subject touches the frame edge' : '')
  );
}
