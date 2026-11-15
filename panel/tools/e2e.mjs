import { api } from './api.mjs';

const step = (msg) => console.log(`\n== ${msg}`);

step('photocraft status');
let st = await api('GET', '/api/status');
console.log(JSON.stringify(st.photocraft, null, 1));

if (!st.photocraft.running) throw new Error('PhotoCraft is not running');

step('new document 1080x1080');
console.log(JSON.stringify(await api('POST', '/api/photocraft/new-document', {
  width: 1080, height: 1080, background: 'white', name: 'EggLab test',
}), null, 1));

step('render turbo 512x512');
const start = Date.now();
const { job } = await api('POST', '/api/jobs', {
  prompt: 'a glossy die-cut sticker of a smiling fried egg with a thick white outline, centred',
  workflow: 'turbo',
  width: 512,
  height: 512,
  transparent: true,
});
console.log('job', job.id, job.status, 'expected', Math.round(job.expectedMs / 1000) + 's');

let done = job;
for (let i = 0; i < 240 && done.status === 'running'; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  done = (await api('GET', `/api/jobs/${done.id}`)).job;
  process.stdout.write(`\r${done.phase} ${done.percent}% ${Math.round(done.elapsedMs / 1000)}s   `);
}
console.log('\nresult', JSON.stringify({
  status: done.status,
  outPath: done.outPath,
  seed: done.seed,
  seconds: Math.round(done.elapsedMs / 1000),
  error: done.error,
}, null, 1));

if (done.status !== 'done') process.exit(1);

step('place into PhotoCraft');
console.log(JSON.stringify(await api('POST', '/api/photocraft/place', { path: done.outPath, fit: true }), null, 1));

step('layers');
const layers = await api('POST', '/api/photocraft/layers');
console.log(JSON.stringify(layers, null, 1).slice(0, 2500));

step('preview');
const preview = await api('POST', '/api/photocraft/preview', { maxSide: 1024 });
console.log(JSON.stringify(preview, null, 1));

step('total seconds');
console.log(Math.round((Date.now() - start) / 1000));
