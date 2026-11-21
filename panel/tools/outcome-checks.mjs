/**
 * Outcome graders — executable checks for finished work (V2 ticket 6).
 *
 * These grade the DELIVERABLE, not the agent's tool path: a file exists, the
 * real pixel dimensions, alpha coverage, exact copy in the report, and the
 * saved project. Run directly for a self-test:
 *   node tools/outcome-checks.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { decodePng, encodePng } from '../service/pngfeather.mjs';

/** The file exists and is not empty. */
export function fileReady(file) {
  try {
    const st = fs.statSync(file);
    return { ok: st.isFile() && st.size > 0, bytes: st.size };
  } catch {
    return { ok: false, bytes: 0 };
  }
}

/** Actual PNG dimensions (never trust the requested size). */
export function pngDimensions(file) {
  try {
    const png = decodePng(file);
    return { ok: true, width: png.width, height: png.height };
  } catch {
    return { ok: false, width: null, height: null };
  }
}

/** Alpha coverage of a PNG: opaque / partial / transparent pixel counts. */
export function alphaStats(file) {
  try {
    const { width, height, data } = decodePng(file);
    let opaque = 0;
    let partial = 0;
    let transparent = 0;
    for (let i = 3; i < data.length; i += 4) {
      const a = data[i];
      if (a >= 250) opaque++;
      else if (a <= 5) transparent++;
      else partial++;
    }
    const total = width * height;
    return {
      ok: true,
      width,
      height,
      opaque,
      partial,
      transparent,
      alphaPresent: transparent > 0 || partial > 0,
      coverage: total ? Math.round(((opaque + partial) / total) * 100) : 0,
    };
  } catch {
    return { ok: false, alphaPresent: false };
  }
}

/** Exact copy appears in the delivered text/report (character-for-character). */
export function exactCopy(file, text) {
  try {
    const content = fs.readFileSync(file, 'utf8');
    return { ok: content.includes(String(text)), missing: content.includes(String(text)) ? null : String(text) };
  } catch {
    return { ok: false, missing: String(text) };
  }
}

/** The saved project exists and looks like a project file. */
export function projectSaved(file) {
  const ready = fileReady(file);
  return { ok: ready.ok && /\.(pcraft|psd|psb)$/i.test(file), bytes: ready.bytes };
}

/* ------------------------------------------------------------------ */
/* Self-test                                                           */
/* ------------------------------------------------------------------ */

let failures = 0;
const check = (name, pass, detail = '') => {
  if (!pass) failures++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'egglab-outcome-'));
try {
  // Opaque 64x32 fixture.
  const opaque = Buffer.alloc(64 * 32 * 4);
  for (let i = 0; i < opaque.length; i += 4) {
    opaque[i] = 120;
    opaque[i + 1] = 30;
    opaque[i + 2] = 30;
    opaque[i + 3] = 255;
  }
  const opaquePath = path.join(dir, 'opaque.png');
  encodePng(opaquePath, 64, 32, opaque);

  // Transparent fixture: a 20x10 opaque rect on a transparent canvas.
  const clear = Buffer.alloc(64 * 32 * 4);
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 20; x++) {
      const i = (y * 64 + x) * 4;
      clear[i] = 30;
      clear[i + 1] = 200;
      clear[i + 2] = 90;
      clear[i + 3] = 255;
    }
  }
  const clearPath = path.join(dir, 'cutout.png');
  encodePng(clearPath, 64, 32, clear);

  const reportPath = path.join(dir, 'report.txt');
  fs.writeFileSync(reportPath, 'Deliverable: poster\nHeadline: OPEN ALL NIGHT\n', 'utf8');
  const projectPath = path.join(dir, 'piece.pcraft');
  fs.writeFileSync(projectPath, 'project');

  check('missing file fails cleanly', !fileReady(path.join(dir, 'nope.png')).ok);
  check('file exists and is non-empty', fileReady(opaquePath).ok);
  check('dimensions are read from pixels', pngDimensions(opaquePath).width === 64 && pngDimensions(opaquePath).height === 32);
  const alphaOpaque = alphaStats(opaquePath);
  check('opaque png reports no alpha', !alphaOpaque.alphaPresent && alphaOpaque.opaque === 64 * 32);
  const alphaCut = alphaStats(clearPath);
  check(
    'cutout png reports real alpha coverage',
    alphaCut.alphaPresent && alphaCut.opaque === 200 && alphaCut.coverage === Math.round((200 / (64 * 32)) * 100),
    `${alphaCut.opaque} opaque, ${alphaCut.transparent} transparent`,
  );
  check('exact copy matches character-for-character', exactCopy(reportPath, 'OPEN ALL NIGHT').ok);
  check('wrong copy is rejected', !exactCopy(reportPath, 'open all night').ok);
  check('saved project is recognised', projectSaved(projectPath).ok);
  check('non-project file is not a project', !projectSaved(reportPath).ok);
} finally {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
}

console.log(`\n${failures ? 'FAILED' : 'OK'} — ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
