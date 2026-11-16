// Engine VRAM-retry gate.
//
// Reproduces the failing case from the field: on an 8 GB card the Vulkan build
// can fail the text encoder's workspace capacity check while encoding a prompt.
// The panel must retry once with the encoder on CPU and finish the render.
//
// Run against the packaged app:  node tools/engine-retry-test.mjs packaged
// Run against the dev panel:      node tools/engine-retry-test.mjs
import fs from 'node:fs';
import path from 'node:path';

const which = process.argv[2] === 'packaged' ? 'packaged' : 'dev';
const ctlPath =
  which === 'packaged'
    ? path.join(process.env.APPDATA, 'EggLab', 'control.json')
    : path.join(process.cwd(), 'control.json');
const ctl = JSON.parse(fs.readFileSync(ctlPath, 'utf8'));
const api = async (method, route, body, timeout = 600000) => {
  const res = await fetch(ctl.url + route, {
    method,
    headers: { 'x-egglab-token': ctl.token, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeout),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!res.ok) throw new Error(`${method} ${route} -> ${res.status} ${JSON.stringify(data).slice(0, 400)}`);
  return data;
};

const prompt =
  "A single artist's flat paintbrush, warm wooden handle, silver ferrule, cream bristles with crimson paint at the tip, " +
  'three-quarter view, studio product light from upper left, sharp focus, isolated subject with clear margin.';

const status = await api('GET', '/api/status');
console.log(`target: ${which} | engine: ${status.engine.engineDir} | ready: ${status.engine.ready}`);

const { job } = await api('POST', '/api/jobs', {
  prompt,
  workflow: 'turbo',
  width: 512,
  height: 512,
  transparent: true,
});
console.log('job:', job.id);

const t0 = Date.now();
let last = '';
for (;;) {
  await new Promise((r) => setTimeout(r, 1500));
  const { job: current } = await api('GET', `/api/jobs/${job.id}`);
  const line = `${current.status} | ${current.phase} | ${current.detail || ''}`;
  if (line !== last) {
    console.log(`${Math.round((Date.now() - t0) / 1000)}s: ${line}`);
    last = line;
  }
  if (['done', 'error', 'canceled'].includes(current.status)) {
    console.log('final:', current.status, '| out:', current.outPath, '| error:', current.error || 'none');
    break;
  }
  if (Date.now() - t0 > 600000) {
    console.log('TIMEOUT');
    break;
  }
}

const logFile = path.join(path.dirname(ctlPath), 'logs', `${job.id}.log`);
let retried = false;
try {
  const log = fs.readFileSync(logFile, 'utf8');
  retried = log.includes('text encoder -> CPU');
  const marker = log.includes('# retry:');
  console.log('log: retry marker =', marker, '| capacity error seen =', /capacity check/i.test(log));
} catch (err) {
  console.log('log read failed:', err.message);
}

const final = await api('GET', `/api/jobs/${job.id}`);
const ok = final.job.status === 'done';
console.log(ok ? `PASS: render completed${retried ? ' (after VRAM retry)' : ' (no retry needed)'}` : 'FAIL: render did not complete');
process.exit(ok ? 0 : 1);
