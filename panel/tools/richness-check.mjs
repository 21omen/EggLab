// Richness scorecard — the §13 gate, measured.
//
// Two halves: the layer stack (from the panel API, since .pcraft is a zip) and
// the exported PNG (decoded here). The point is to replace "it looks a bit flat"
// with numbers that can be compared between two runs of the same brief.
//
//   node tools/richness-check.mjs <export.png> [--layers]
//
// Metrics:
//   grain      mean |delta| between horizontally adjacent pixels. A digital-clean
//              flat fill scores ~0.1-0.5; a real grain pass scores several times
//              that. This is the "was it finished" number.
//   zones      edge density (fraction of pixels with a luminance step > 12) in a
//              3x3 grid. max/min across zones = density variance: ~1.0 means
//              every zone has the same rhythm (the template tell).
//   colours    distinct 5-bit-per-channel buckets covering 99% of pixels.
//   layers     pixel renders, shapes (support elements), type, adjustments.
import fs from 'node:fs';
import zlib from 'node:zlib';

function decodeRgb(file) {
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
  if (depth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`Unsupported PNG: depth ${depth} colourType ${colorType}`);
  }
  const channels = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * channels;
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
  return { w, h, channels, data: out };
}

function metrics(img) {
  const { w, h, channels: ch, data } = img;
  const lum = (i) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

  // Grain: mean absolute luminance step between horizontally adjacent pixels.
  let delta = 0;
  let n = 0;
  for (let y = 0; y < h; y += 2) {
    const row = y * w * ch;
    for (let x = 1; x < w; x += 2) {
      delta += Math.abs(lum(row + x * ch) - lum(row + (x - 1) * ch));
      n++;
    }
  }
  const grain = delta / n;

  // Zone density: 3x3 grid, fraction of pixels with a visible step.
  const cells = [];
  for (let gy = 0; gy < 3; gy++) {
    for (let gx = 0; gx < 3; gx++) {
      const x0 = Math.floor((gx * w) / 3);
      const x1 = Math.floor(((gx + 1) * w) / 3);
      const y0 = Math.floor((gy * h) / 3);
      const y1 = Math.floor(((gy + 1) * h) / 3);
      let hot = 0;
      let total = 0;
      for (let y = y0 + 1; y < y1; y++) {
        const row = y * w * ch;
        for (let x = x0 + 1; x < x1; x++) {
          const l = lum(row + x * ch);
          if (Math.abs(l - lum(row + (x - 1) * ch)) > 12) hot++;
          total++;
        }
      }
      cells.push(total ? hot / total : 0);
    }
  }
  const lo = Math.min(...cells);
  const hi = Math.max(...cells);
  const zoneRatio = lo > 0.0005 ? hi / lo : Infinity;
  const detail = cells.reduce((a, b) => a + b, 0) / cells.length;

  // Colours: 5 bits per channel buckets, smallest set covering 99% of pixels.
  const hist = new Map();
  const total = w * h;
  for (let i = 0; i < data.length; i += ch) {
    const key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
    hist.set(key, (hist.get(key) || 0) + 1);
  }
  const counts = [...hist.values()].sort((a, b) => b - a);
  let acc = 0;
  let colours = 0;
  while (colours < counts.length && acc < total * 0.99) {
    acc += counts[colours];
    colours++;
  }

  return {
    grain: Math.round(grain * 100) / 100,
    zones: cells.map((c) => Math.round(c * 1000) / 10),
    zoneRatio: Number.isFinite(zoneRatio) ? Math.round(zoneRatio * 10) / 10 : 'open-cell',
    detail: Math.round(detail * 10000) / 100,
    colours,
  };
}

async function layerStats() {
  const c = JSON.parse(fs.readFileSync(new URL('../control.json', import.meta.url), 'utf8'));
  const res = await fetch(c.url + '/api/photocraft/layers', {
    method: 'POST',
    headers: { 'x-egglab-token': c.token, 'content-type': 'application/json' },
    body: '{}',
  });
  const j = await res.json();
  const layers = j.layers || [];
  const byKind = {};
  for (const l of layers) byKind[l.kind] = (byKind[l.kind] || 0) + 1;
  return { document: j.document, activeLayer: j.activeLayer, layers, byKind };
}

const png = process.argv[2];
if (!png) {
  console.log('usage: node tools/richness-check.mjs <export.png>');
  process.exit(1);
}

const m = metrics(decodeRgb(png));
console.log(`file        ${png}`);
console.log(`grain       ${m.grain}   (flat digital fill ~0.1-0.5, grain pass 2+)`);
console.log(`zone density ${m.zones.join(' | ')}  (9 cells, % of pixels with a step)`);
console.log(`zone ratio  ${m.zoneRatio}   (~1.0 = every zone the same rhythm)`);
console.log(`detail load ${m.detail}% mean of the 9 zones (how much is actually drawn)`);
console.log(`colours     ${m.colours} buckets covering 99% of pixels`);

if (process.argv.includes('--layers')) {
  const s = await layerStats();
  console.log(`document    ${s.document?.name} ${s.document?.width}x${s.document?.height}, ${s.layers.length} layers`);
  console.log(`by kind     ${JSON.stringify(s.byKind)}`);
  console.log(`layers      ${s.layers.map((l) => `${l.name}[${l.kind}]`).join(' | ')}`);
}
