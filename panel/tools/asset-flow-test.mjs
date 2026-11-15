// End-to-end check of the asset workflow: transparent asset -> alpha verdict ->
// place -> type -> audit -> save -> export. Cleans up its scratch document.
import fs from 'node:fs';

const c = JSON.parse(fs.readFileSync('D:/neww/EggLab/panel/control.json', 'utf8'));
const H = { 'x-egglab-token': c.token, 'content-type': 'application/json' };

async function api(method, path, body) {
  const res = await fetch(c.url + path, {
    method,
    headers: H,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  if (!res.ok) throw new Error(json?.error || text || res.status);
  return json;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitJob(id) {
  for (;;) {
    const { job } = await api('GET', `/api/jobs/${id}`);
    if (job.status !== 'running') return job;
    await sleep(2000);
  }
}

const prompt =
  'A single ripe mango with a deep red-orange blush fading to green at the stem, ' +
  'glossy skin with fine speckles, isolated subject, centred with clear empty margin on all sides, ' +
  'no floor, no shadow, no outline, soft studio light from upper left, sharp throughout, fine surface texture.';

console.log('rendering transparent asset...');
const { job } = await api('POST', '/api/jobs', {
  prompt,
  workflow: 'turbo',
  width: 1024,
  height: 1024,
  transparent: true,
});
const done = await waitJob(job.id);
console.log('job:', done.status, `${Math.round(done.elapsedMs / 1000)}s`);
if (done.status !== 'done') throw new Error(done.error || 'render failed');
console.log('alpha:', JSON.stringify(done.alpha));

console.log('\nnew document...');
const doc = await api('POST', '/api/photocraft/new-document', {
  width: 1080,
  height: 1350,
  background: '#10221C',
  name: 'alpha-flow-test',
});
console.log('document:', JSON.stringify(doc).slice(0, 160));
const index = doc.document ?? doc.index ?? doc.result?.document ?? doc.result?.index;

console.log('\nplace + type in one batch...');
const steps = [
  { id: 'place', params: { path: done.outPath, name: 'Hero — mango', scale: 62, center: [540, 640] } },
  { id: 'type.create', params: { x: 96, y: 180, text: 'RIO MANGO', name: 'Headline', font: 'Impact', size: 132, color: '#F3EBDD' } },
  { id: 'type.create', params: { x: 100, y: 236, text: 'RIPE BY THE CASE', name: 'Subhead', font: 'Montserrat', size: 30, color: '#C9A063' } },
  { id: 'shape.create', params: { kind: 'roundedRect', rect: [96, 1150, 320, 76], radii: 38, fill: '#C9A063' } },
  { id: 'type.create', params: { x: 152, y: 1199, text: 'ORDER NOW', name: 'CTA', font: 'Montserrat', size: 26, color: '#10221C' } },
];
const results = [];
for (const step of steps) {
  if (step.id === 'place') {
    results.push({ id: 'place', ok: true, ...(await api('POST', '/api/photocraft/place', step.params)) });
  } else {
    results.push({ id: step.id, ok: true, ...(await api('POST', '/api/photocraft/command', step)) });
  }
}
console.log('steps ok:', results.length, '/', steps.length);
console.log('place result:', JSON.stringify(results[0]).slice(0, 240));

console.log('\naudit...');
const audit = await api('POST', '/api/photocraft/audit', { max_side: 900 });
console.log('audit keys:', Object.keys(audit).join(', '));
const m = audit.metrics || audit.audit || {};
console.log('metrics:', JSON.stringify(m).slice(0, 500));

console.log('\nexport...');
const outDir = 'D:/neww/projects/alpha-flow-test';
fs.mkdirSync(outDir, { recursive: true });
const flat = await api('POST', '/api/photocraft/export-flat', { dir: outDir, name: 'alpha-flow-test' });
console.log('flat:', JSON.stringify(flat).slice(0, 300));

console.log('\nclosing scratch document...');
if (Number.isFinite(index)) {
  try {
    const closed = await api('POST', '/api/photocraft/command', { id: 'file.close', params: { document: index } });
    console.log('closed:', JSON.stringify(closed).slice(0, 120));
  } catch (err) {
    console.log('close failed:', err.message);
  }
}
console.log('\nRESULT asset:', done.outPath);
console.log('RESULT flat:', flat.path || flat.output || JSON.stringify(flat).slice(0, 200));
