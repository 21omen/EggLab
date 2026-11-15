// Render a source image for an edit test.
//   node tools/render-source.mjs <out.png> <w> <h> <prompt...>
// Starts a job, waits for it, prints the file it wrote.
import fs from 'node:fs';

const c = JSON.parse(fs.readFileSync('D:/neww/EggLab/panel/control.json', 'utf8'));
const H = { 'x-egglab-token': c.token, 'content-type': 'application/json' };
const [out, w, h, ...rest] = process.argv.slice(2);
const prompt = rest.join(' ');

const res = await fetch(c.url + '/api/jobs', {
  method: 'POST',
  headers: H,
  body: JSON.stringify({ prompt, width: Number(w), height: Number(h), workflow: 'quality' }),
});
const { job } = await res.json();
if (!job?.id) throw new Error(JSON.stringify({ res: res.status, job }));
console.log(`job ${job.id} started at ${w}x${h}`);

for (;;) {
  await new Promise((r) => setTimeout(r, 3000));
  const list = await (await fetch(c.url + '/api/jobs', { headers: H })).json();
  const j = (list.jobs || []).find((x) => x.id === job.id);
  if (!j) continue;
  if (j.status === 'done' || j.status === 'error' || j.status === 'failed') {
    console.log(`status: ${j.status} ${j.error || ''}`);
    const file = j.file || j.path || j.output;
    if (file && out) {
      fs.copyFileSync(file, out);
      console.log(`wrote ${out} (${fs.statSync(out).size} bytes) from ${file}`);
    } else {
      console.log(JSON.stringify(j).slice(0, 600));
    }
    break;
  }
}
