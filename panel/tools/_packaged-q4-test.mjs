import fs from 'node:fs';
const ctl = JSON.parse(fs.readFileSync(process.env.APPDATA + '/EggLab/control.json', 'utf8'));
const api = async (method, p, body, timeout = 300000) => {
  const r = await fetch(ctl.url + p, {
    method,
    headers: { 'x-egglab-token': ctl.token, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeout),
  });
  const t = await r.text();
  let d;
  try {
    d = JSON.parse(t);
  } catch {
    d = t;
  }
  return { status: r.status, data: d };
};

console.log('version:', (await api('GET', '/api/update')).data.current);
const models = await api('GET', '/api/models');
const diff = models.data.entries.find((e) => e.id === 'diffusion');
const beta = diff.variants.find((v) => v.id === 'q4km-beta');
console.log('q4 beta:', JSON.stringify({ beta: beta.beta, installed: beta.installed, file: beta.file }));

const sw = await api('POST', '/api/models/use', { id: 'diffusion', file: beta.file });
console.log('switch ->', sw.status, sw.data.entries?.find((e) => e.id === 'diffusion')?.file);

const prompt = 'A studio poster that says \u201CEggLab\u201D \u2014 Q4 beta test';
const res = await api('POST', '/api/jobs', {
  prompt,
  workflow: 'turbo',
  width: 512,
  height: 512,
  steps: 8,
  seed: 11,
});
const job = res.data.job || {};
console.log('job ->', res.status, job.id, 'prompt exact:', job.prompt === prompt);
let final = job;
for (let i = 0; i < 180; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  const list = await api('GET', '/api/jobs');
  final = (list.data.jobs || []).find((j) => j.id === job.id) || final;
  if (['done', 'error', 'canceled'].includes(final.status)) break;
}
console.log('render ->', final.status, final.phase, 'output:', final.outPath ? fs.existsSync(final.outPath) : false);
