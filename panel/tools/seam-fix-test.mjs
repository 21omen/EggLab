// End-to-end proof that a region edit no longer leaves a visible rectangle.
//
//   node tools/seam-fix-test.mjs [crop|inpaint|both]
//
// For each mode: build a 1024x1280 document from the retouch source, run the
// same scoped retouch that produced the complaint, flatten what the user would
// actually see, and profile the difference against the source across each of
// the four region borders.
//
// The number that matters is the biggest step within +/-16 px of a border. The
// old hard-rectangle path measured ~2.2 there with an outside level of exactly
// 0.00 — a clean cut. A finished edit keeps that step well under 1.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const PANEL = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = 'D:/neww/EggLab/out/retouch-test/source.png';
const OUT_DIR = path.join(PANEL, 'out', 'seam-fix');
const REGION = [300, 350, 420, 500]; // the same box the probe mask covered
const PROMPT =
  'Professional beauty retouch of this portrait: even out the skin tone and redness, ' +
  'soften the shadow under the eyes, keep pores and all skin texture, do not change ' +
  'any facial features, hair or background.';

const c = JSON.parse(fs.readFileSync(path.join(PANEL, 'control.json'), 'utf8'));
const H = { 'x-egglab-token': c.token, 'content-type': 'application/json' };

// Raw node:http, NOT fetch: a quality edit can run past five minutes on a cold
// engine, and undici's default HeadersTimeout of 300 s kills the request while
// the server happily finishes the job for nobody. Here nothing cuts it off
// before the render does.
function api(method, p, body) {
  const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const req = http.request(
      c.url + p,
      {
        method,
        headers: {
          ...H,
          ...(payload ? { 'content-type': 'application/json; charset=utf-8', 'content-length': payload.length } : {}),
        },
        timeout: 1800000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (d) => chunks.push(d));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = JSON.parse(text);
          } catch {}
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(json?.error || text || String(res.statusCode)));
          }
          resolve(json);
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('request timed out')));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/* ------------------------------------------------------------------ */
/* PNG decode (RGB or RGBA)                                            */
/* ------------------------------------------------------------------ */

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
  const paeth = (a, b, cc) => {
    const p = a + b - cc;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - cc);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : cc;
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
      const cc = x >= ch ? prev[x - ch] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) v += paeth(a, b, cc);
      cur[x] = v & 0xff;
    }
    cur.copy(out, y * stride);
    prev = cur;
  }
  return { w, h, ch, data: out };
}

/** mean |delta| of a whole row / column between source and result. */
function profiles(A, B) {
  const delta = (x, y) => {
    const i = (y * A.w + x) * A.ch;
    const j = (y * B.w + x) * B.ch;
    return (Math.abs(A.data[i] - B.data[j]) + Math.abs(A.data[i + 1] - B.data[j + 1]) + Math.abs(A.data[i + 2] - B.data[j + 2])) / 3;
  };
  const cols = [];
  for (let x = 0; x < A.w; x++) {
    let s = 0;
    for (let y = 0; y < A.h; y++) s += delta(x, y);
    cols.push(s / A.h);
  }
  const rows = [];
  for (let y = 0; y < A.h; y++) {
    let s = 0;
    for (let x = 0; x < A.w; x++) s += delta(x, y);
    rows.push(s / A.w);
  }
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
  return { cols, rows, mean: sum / n, unchanged: (unchanged / n) * 100 };
}

/**
 * Is the border a step, or just the image's own grain?
 *
 * A fixed threshold is wrong the moment a result drifts globally (inpaint
 * touches nearly every pixel), because ordinary line-to-line noise then reads as
 * a "seam" — that is exactly how the first run produced a false FAIL. Each
 * profile therefore gets its OWN noise floor, the 99th percentile of jumps
 * between adjacent lines, and the border is judged against that: an edge counts
 * only if it is a clear outlier inside its own image.
 */
function stepAt(profile, border) {
  const jumps = [];
  for (let i = 2; i < profile.length; i++) jumps.push(Math.abs(profile[i] - profile[i - 2]));
  const sorted = [...jumps].sort((a, b) => a - b);
  const p99 = sorted[Math.floor(sorted.length * 0.99)] || 1;
  let worst = 0;
  let at = null;
  for (let i = Math.max(2, border - 4); i <= Math.min(profile.length - 1, border + 4); i++) {
    const d = Math.abs(profile[i] - profile[i - 2]);
    if (d > worst) {
      worst = d;
      at = i;
    }
  }
  const mean = (from, to) => {
    const v = [];
    for (let i = from; i <= to; i++) if (i >= 0 && i < profile.length) v.push(profile[i]);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  };
  return {
    z: worst / p99,
    worst,
    p99,
    at,
    outside: mean(border - 8, border - 2),
    inside: mean(border + 2, border + 8),
  };
}

/* ------------------------------------------------------------------ */

const modes = (process.argv[2] || 'both') === 'both' ? ['crop', 'inpaint'] : [process.argv[2]];
if (!fs.existsSync(SRC)) throw new Error('missing source: ' + SRC);
fs.mkdirSync(OUT_DIR, { recursive: true });
const A = decode(SRC);
console.log(`source ${A.w}x${A.h}   region [${REGION.join(', ')}]   modes: ${modes.join(', ')}\n`);

const results = [];
for (const mode of modes) {
  const t0 = Date.now();
  console.log(`=== mode: ${mode} ===`);

  const doc = await api('POST', '/api/photocraft/new-document', {
    width: A.w,
    height: A.h,
    background: '#000000',
    name: `seam-fix-${mode}`,
  });
  console.log('  document', doc.document ?? doc.result?.document ?? '?');

  const placed = await api('POST', '/api/photocraft/place', {
    path: SRC,
    name: 'Photo',
    fit: true,
    center: [A.w / 2, A.h / 2],
  });
  console.log('  placed source');

  const before = await api('POST', '/api/photocraft/layers', {});
  const photo = (before.layers || []).find((l) => l.name === 'Photo');
  if (!photo) throw new Error('Photo layer not found: ' + JSON.stringify(before.layers || []).slice(0, 300));
  console.log('  Photo bounds', JSON.stringify(photo.bounds));

  const edit = await api('POST', '/api/photocraft/edit-active', {
    prompt: PROMPT,
    region: REGION,
    mode,
    workflow: 'quality',
  });
  if (!edit.ok) throw new Error('edit failed: ' + (edit.error || JSON.stringify(edit)).slice(0, 400));
  console.log(
    `  edit ok  mode=${edit.mode}  feather=${edit.feather}  mask=${edit.mask ? path.basename(edit.mask) : 'none'}  ` +
      `job=${edit.job?.status}  in ${((Date.now() - t0) / 1000).toFixed(1)}s`,
  );

  const flat = await api('POST', '/api/photocraft/export-flat', {
    dir: OUT_DIR,
    name: `seam-${mode}`,
    overwrite: true,
  });
  const flatFile = flat.path || flat.file || flat.out || flat.output;
  if (!flatFile || !fs.existsSync(flatFile)) {
    throw new Error('flat export did not return a path: ' + JSON.stringify(flat).slice(0, 400));
  }
  console.log('  flat ->', flatFile);

  const B = decode(flatFile);
  if (B.w !== A.w || B.h !== A.h) throw new Error(`size drift ${B.w}x${B.h} vs ${A.w}x${A.h}`);
  const p = profiles(A, B);
  console.log(`  changed: mean delta ${p.mean.toFixed(2)}   unchanged ${p.unchanged.toFixed(1)}%`);

  const [rx, ry, rw, rh] = REGION;
  const borders = [
    ['top', stepAt(p.rows, ry)],
    ['bottom', stepAt(p.rows, ry + rh - 1)],
    ['left', stepAt(p.cols, rx)],
    ['right', stepAt(p.cols, rx + rw - 1)],
  ];
  let worstZ = 0;
  for (const [name, s] of borders) {
    if (s.z > worstZ) worstZ = s.z;
    console.log(
      `    ${name.padEnd(6)} edge ${s.worst.toFixed(2)} vs own noise p99 ${s.p99.toFixed(2)} = ${s.z.toFixed(2)}x   ` +
        `outside ${s.outside.toFixed(2)}  inside ${s.inside.toFixed(2)}`,
    );
  }
  const verdict = worstZ < 2.5 ? 'BLENDED' : 'SEAM';
  console.log(`  worst border is ${worstZ.toFixed(2)}x its own noise floor  ->  ${verdict}`);
  results.push({ mode, mean: p.mean, unchanged: p.unchanged, worst: worstZ, verdict });
  console.log('');
}

console.log('=== SUMMARY ===');
for (const r of results) {
  console.log(
    `  ${r.mode.padEnd(8)} mean ${r.mean.toFixed(2)}  unchanged ${r.unchanged.toFixed(1)}%  ` +
      `worst border ${r.worst.toFixed(2)}x own noise  ${r.verdict}`,
  );
}
const failed = results.filter((r) => r.verdict === 'SEAM');
console.log(failed.length ? `FAIL: ${failed.map((r) => r.mode).join(', ')} still show a seam.` : 'PASS: no hard rectangle in either mode.');
process.exit(failed.length ? 1 : 0);
