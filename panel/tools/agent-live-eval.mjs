// Live production eval (opt-in; needs a running panel, engine and PhotoCraft).
//
// Unlike agent-surface-test.mjs, this drives real jobs and checks the artifacts:
// text-as-artwork, transparency, multi-reference edit, editable-type poster,
// annotated-photo edit and separate-mask edit. It creates a base image and
// marked/mask fixtures, builds throwaway PhotoCraft documents, and prints a
// JSON report with the exact tool sequences and output paths.
//
// Usage: npm run test:live
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { decodePng, encodePng } from '../service/pngfeather.mjs';

const ctl = JSON.parse(
  fs.readFileSync(
    path.join(process.env.APPDATA || '', 'EggLab', 'control.json'),
    'utf8',
  ),
);
const OUT = path.join(process.env.TEMP || os.tmpdir(), 'opencode');
const FIX = path.join(OUT, 'agent-live-eval-fixtures');
fs.mkdirSync(FIX, { recursive: true });

const api = async (method, p, body, timeout = 600000) => {
  const res = await fetch(ctl.url + p, {
    method,
    headers: { 'x-egglab-token': ctl.token, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeout),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`${p}: HTTP ${res.status} ${text.slice(0, 300)}`);
  return data;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];
const check = (task, label, ok, detail = '') => {
  results.push({ task, label, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${task}: ${label}${detail ? ` — ${detail}` : ''}`);
};
const toolNames = (item) => (item?.tools || []).map((t) => t.name).filter(Boolean);
const toolEntry = (item, name) => (item?.tools || []).find((t) => t.name === name);
const toolText = (item, name) => String(toolEntry(item, name)?.output || '');
function walk(value, visit) {
  if (typeof value === 'string') return visit(value);
  if (!value || typeof value !== 'object') return undefined;
  for (const child of Object.values(value)) {
    const found = walk(child, visit);
    if (found) return found;
  }
  return undefined;
}
function outputPath(item, name) {
  const raw = toolText(item, name);
  if (!raw) return null;
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch {}
  const fromJson = parsed && walk(parsed, (s) => {
    const m = s.match(/^[A-Za-z]:[\\/].+\.png$/i);
    return m ? m[0] : null;
  });
  if (fromJson) return fromJson;
  const m = raw.match(/([A-Za-z]:[^"\n]+?\.png)/i);
  return m ? m[1].replace(/\\\\/g, '\\') : null;
}
function textPath(item) {
  const m = String(item?.text || '').match(/([A-Za-z]:\\[^\n`"]+?\.png)/i);
  return m ? m[1].trim() : null;
}
async function newThread() {
  const data = await api('POST', '/api/sessions/new', {});
  return data?.threadId || data?.id;
}
async function deleteThread(key) {
  if (key) await api('POST', '/api/sessions/delete', { key }, 30000).catch(() => {});
}
async function chat(text, timeout = 600000) {
  const data = await api('POST', '/api/chat', { text }, timeout);
  return data?.item || data;
}
async function waitJob(id, timeout = 300000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const data = await api('GET', `/api/jobs/${id}`, null, 30000);
    const job = data?.job;
    if (job && job.status !== 'running' && job.status !== 'queued') return job;
    await sleep(1500);
  }
  throw new Error(`job ${id} timed out`);
}
async function generateBase() {
  const data = await api('POST', '/api/jobs', {
    prompt: 'A single solid green circle centered on a plain white background, flat vector style, no text, no shadow.',
    workflow: 'turbo',
    width: 512,
    height: 512,
  });
  const job = await waitJob(data.job.id);
  if (job.status !== 'done' || !job.outPath) {
    throw new Error(`base job failed: ${job.error || job.status}`);
  }
  return job.outPath;
}
function makeFixtures(basePath) {
  const base = decodePng(basePath);
  const marked = Buffer.from(base.data);
  const maskFull = Buffer.alloc(base.width * base.height * 4);
  const cx = base.width / 2;
  const cy = base.height / 2;
  for (let y = 0; y < base.height; y++) {
    for (let x = 0; x < base.width; x++) {
      const d = Math.hypot(x - cx, y - cy);
      const i = (y * base.width + x) * 4;
      if (d > 145 && d < 158) {
        marked[i] = 220;
        marked[i + 1] = 20;
        marked[i + 2] = 20;
        marked[i + 3] = 255;
      }
      const inside = d <= 250;
      maskFull[i] = maskFull[i + 1] = maskFull[i + 2] = inside ? 255 : 0;
      maskFull[i + 3] = 255;
    }
  }
  const markedPath = path.join(FIX, 'marked.png');
  const maskPath = path.join(FIX, 'mask-full.png');
  encodePng(markedPath, base.width, base.height, marked);
  encodePng(maskPath, base.width, base.height, maskFull);
  return { markedPath, maskPath };
}
async function pcNewDoc(name) {
  const data = await api('POST', '/api/photocraft/new-document', {
    width: 512, height: 512, background: 'white', name,
  });
  return data.result.document;
}
async function pcPlace(file, name) {
  return api('POST', '/api/photocraft/place', {
    path: file, name, fit: true, center: [256, 256],
  });
}
async function pcCommand(id, params) {
  return api('POST', '/api/photocraft/command', { id, params });
}
async function activateDoc(index) {
  return pcCommand('document.activate', { document: index });
}
async function pcLayers() {
  return api('POST', '/api/photocraft/layers', {});
}

const report = { startedAt: new Date().toISOString(), model: null, tasks: results, artifacts: {} };

try {
  const status = await api('GET', '/api/status', null, 30000);
  report.model = status.settings?.opencode?.model || null;
  if (!status.engine?.ready) throw new Error('engine is not ready');
  if (!status.photocraft?.running) await api('POST', '/api/photocraft/launch', {}, 60000);

  const basePath = await generateBase();
  const { markedPath, maskPath } = makeFixtures(basePath);
  report.artifacts.base = basePath;
  report.artifacts.marked = markedPath;
  report.artifacts.mask = maskPath;

  const annotatedDoc = await pcNewDoc('eval-annotated');
  await pcPlace(markedPath, 'photo');
  const maskDoc = await pcNewDoc('eval-mask');
  await pcPlace(basePath, 'base');
  await pcPlace(maskPath, 'mask-full');
  await pcCommand('layer.setProps', { name: 'mask-full', visible: false });
  await pcCommand('layer.select', { name: 'base' });
  report.artifacts.annotatedDoc = annotatedDoc;
  report.artifacts.maskDoc = maskDoc;

  // 1 — text effect
  let thread = await newThread();
  try {
    const item = await chat(
      'Use egl_generate to create a 768x768 quality text-effect image of the word "EGGLAB" as polished 3D chrome letters on a dark charcoal studio background. The text must read exactly EGGLAB. Then use egl_inspect on the returned PNG and report whether it is legible and correctly spelled. Do not use any other tool.',
    );
    const names = toolNames(item);
    const generated = outputPath(item, 'egl_generate') || textPath(item);
    const text = String(item?.text || '');
    check('text_effect', 'egl_generate', names.includes('egl_generate'), names.join(', '));
    check('text_effect', 'egl_inspect', names.includes('egl_inspect'));
    check('text_effect', 'artifact exists', Boolean(generated) && fs.existsSync(generated), generated || 'missing');
    check('text_effect', 'exact word in report', /EGGLAB/i.test(text));
    report.artifacts.textEffect = generated;
  } finally {
    await deleteThread(thread);
  }

  // 2 — transparent product
  thread = await newThread();
  try {
    const item = await chat(
      'Use egl_generate to create a 512x512 quality transparent RGBA asset of one red apple with a green leaf, centered, no background and no cast shadow. Then use egl_check_alpha on the returned PNG and report the measured transparency. Do not use any other tool.',
    );
    const names = toolNames(item);
    const generated = outputPath(item, 'egl_generate') || textPath(item);
    const alpha = toolText(item, 'egl_check_alpha');
    check('transparent', 'egl_generate', names.includes('egl_generate'), names.join(', '));
    check('transparent', 'egl_check_alpha', names.includes('egl_check_alpha'));
    check('transparent', 'artifact exists', Boolean(generated) && fs.existsSync(generated), generated || 'missing');
    check('transparent', 'cutout alpha', /cutout|transparentPct/i.test(alpha), alpha.slice(0, 120));
    report.artifacts.transparent = generated;
  } finally {
    await deleteThread(thread);
  }

  // 3 — multi-reference edit (uses the text-effect render as the canvas)
  thread = await newThread();
  try {
    if (!report.artifacts.textEffect) {
      check('multi_reference', 'skipped', false, 'no text-effect canvas');
    } else {
      const item = await chat(
        `Use egl_edit with images ${JSON.stringify([report.artifacts.textEffect, basePath])}. <image1> is the chrome-text studio canvas and must keep its framing, lighting and reflections. <image2> is the donor: place the green circle on the reflective floor in front of the chrome letters, scaled to about one third of the frame width, with a soft contact shadow. Use turbo at 512x512. Do not use egl_generate. Then use egl_inspect on the result and report whether the circle is present and the background preserved.`,
      );
      const names = toolNames(item);
      const edited = outputPath(item, 'egl_edit') || textPath(item);
      check('multi_reference', 'egl_edit', names.includes('egl_edit'), names.join(', '));
      check('multi_reference', 'egl_inspect', names.includes('egl_inspect'));
      check('multi_reference', 'artifact exists', Boolean(edited) && fs.existsSync(edited), edited || 'missing');
      report.artifacts.multiReference = edited;
    }
  } finally {
    await deleteThread(thread);
  }

  // 4 — editable type poster + save/export
  thread = await newThread();
  try {
    const item = await chat(
      'Create a new 1080x1350 PhotoCraft document named eval-poster with a deep charcoal background. Add an editable type layer with the headline exactly "EGGLAB SALE 50%" in a large warm-gold serif, and a second editable type layer with the subheadline exactly "THIS WEEK ONLY" in smaller white letterspaced caps. Keep generous margins and a clean centered hierarchy. Do not bake the text into an image and do not generate a background. Use egl_photocraft_new_document, then egl_photocraft_command or egl_photocraft_batch for the shapes/type, audit the layout, save the editable project, export a flat PNG to the EggLab out folder, and inspect the actual export. Report the exact text and paths.',
    );
    const names = toolNames(item);
    const exported = outputPath(item, 'egl_photocraft_export_flat') || textPath(item);
    const text = String(item?.text || '');
    check('poster', 'new document', names.includes('egl_photocraft_new_document'), names.join(', '));
    check('poster', 'type command', names.includes('egl_photocraft_command') || names.includes('egl_photocraft_batch'));
    check('poster', 'save', names.includes('egl_photocraft_save'));
    check('poster', 'export flat', names.includes('egl_photocraft_export_flat'));
    check('poster', 'inspect', names.includes('egl_inspect'));
    check('poster', 'exact headline', /EGGLAB SALE 50%/.test(text) || toolText(item, 'egl_photocraft_command').includes('EGGLAB SALE 50%'));
    check('poster', 'exact subhead', /THIS WEEK ONLY/.test(text) || toolText(item, 'egl_photocraft_command').includes('THIS WEEK ONLY'));
    check('poster', 'export exists', Boolean(exported) && fs.existsSync(exported), exported || 'missing');
    report.artifacts.poster = exported;
  } finally {
    await deleteThread(thread);
  }

  // 5 — annotated-photo edit
  await activateDoc(annotatedDoc);
  thread = await newThread();
  try {
    const item = await chat(
      'The active PhotoCraft document is eval-annotated. Its photo layer has a red circle drawn around a green circle. Remove the green circle and the red annotation, leaving a clean white background and keeping the rest unchanged. Use egl_photocraft_layers to inspect the document, then egl_photocraft_edit_active on the photo layer with a region covering the mark. Then inspect the actual result with egl_inspect and say whether the mark is gone. Do not use full-image generate or full-image edit.',
    );
    const names = toolNames(item);
    check('annotated', 'layers', names.includes('egl_photocraft_layers'), names.join(', '));
    check('annotated', 'scoped edit', names.includes('egl_photocraft_edit_active'));
    check('annotated', 'inspect', names.includes('egl_inspect'));
    check('annotated', 'no full edit/generate', !names.includes('egl_generate') && !names.includes('egl_edit'));
    const layerState = await pcLayers();
    const layerNames = (layerState.layers || []).map((l) => l.name);
    check(
      'annotated',
      'composite placed',
      (layerState.layers || []).some((l) => l.visible && /^photo \(EggLab/.test(l.name)),
      layerNames.join(' | '),
    );
    check(
      'annotated',
      'original hidden',
      (layerState.layers || []).some((l) => l.name === 'photo' && !l.visible),
    );
    report.artifacts.annotated = outputPath(item, 'egl_photocraft_canvas') || textPath(item);
  } finally {
    await deleteThread(thread);
  }

  // 6 — separate mask
  await activateDoc(maskDoc);
  thread = await newThread();
  try {
    const item = await chat(
      'The active PhotoCraft document is eval-mask. Layer "base" is active and layer "mask-full" is a separate hidden mask layer. Its white ellipse covers the green circle and leaves white corners outside. Use egl_photocraft_layers to find the exact mask layer name, then call egl_photocraft_edit_active with mask_layer:"mask-full" and strength 1.0 to replace only the masked area with a flat solid medium blue. Keep the white corners outside the mask unchanged. Inspect the composite with egl_inspect and report the measured result. Do not use a full-image edit or generate.',
    );
    const names = toolNames(item);
    check('mask', 'layers', names.includes('egl_photocraft_layers'), names.join(', '));
    check('mask', 'mask_layer edit', names.includes('egl_photocraft_edit_active'));
    check('mask', 'inspect', names.includes('egl_inspect'));
    check('mask', 'no full edit/generate', !names.includes('egl_generate') && !names.includes('egl_edit'));
    const layerState = await pcLayers();
    const layerNames = (layerState.layers || []).map((l) => l.name);
    check(
      'mask',
      'composite placed',
      (layerState.layers || []).some((l) => l.visible && /^base \(EggLab/.test(l.name)),
      layerNames.join(' | '),
    );
    check(
      'mask',
      'original hidden',
      (layerState.layers || []).some((l) => l.name === 'base' && !l.visible),
    );
    report.artifacts.mask = outputPath(item, 'egl_photocraft_canvas') || textPath(item);
  } finally {
    await deleteThread(thread);
  }
} catch (err) {
  check('suite', 'run', false, err.message);
}

report.finishedAt = new Date().toISOString();
report.summary = {
  total: results.length,
  passed: results.filter((r) => r.ok).length,
  failed: results.filter((r) => !r.ok).length,
};
const reportFile = path.join(OUT, `agent-live-eval-${Date.now()}.json`);
fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
console.log(`\n${report.summary.failed ? 'FAILED' : 'OK'} — ${report.summary.passed}/${report.summary.total} checks passed`);
console.log(`report: ${reportFile}`);
process.exit(report.summary.failed ? 1 : 0);
