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

const res = await api('POST', '/api/jobs', {
  prompt: 'a detailed cinematic group portrait, Q4 stop test',
  workflow: 'quality',
  width: 1024,
  height: 1024,
  steps: 40,
});
const id = res.data.job.id;
console.log('started', id);
let running = false;
for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  const list = await api('GET', '/api/jobs');
  const j = (list.data.jobs || []).find((x) => x.id === id);
  if (j && j.status === 'running') {
    running = true;
    console.log('running at', i + 1, 's');
    break;
  }
}
console.log('stop ->', JSON.stringify((await api('POST', '/api/chat/stop')).data));
await new Promise((r) => setTimeout(r, 15000));
const list = (await api('GET', '/api/jobs')).data.jobs || [];
const j = list.find((x) => x.id === id);
console.log('job final ->', j?.status, j?.phase);
console.log('any running ->', list.some((x) => x.status === 'running' || x.status === 'queued'));
const chat = (await api('GET', '/api/chat')).data;
console.log('chat busy ->', chat.items?.at(-1)?.pending === true);

const sw = await api('POST', '/api/models/use', { id: 'diffusion', file: 'qwen-image-2.1-UC-fp8.safetensors' });
console.log('restored ->', sw.status, sw.data.entries?.find((e) => e.id === 'diffusion')?.file);
