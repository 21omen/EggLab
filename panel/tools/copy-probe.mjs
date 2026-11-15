import fs from 'node:fs';
import { spawn } from 'node:child_process';

const s = JSON.parse(fs.readFileSync('settings.json', 'utf8'));
const child = spawn(s.photocraft.cli, ['mcp', '--bridge', `127.0.0.1:${s.photocraft.controlPort}`, '--control-token-file', s.photocraft.tokenFile], { stdio: ['pipe', 'pipe', 'pipe'] });
let buf = '';
let id = 0;
const pending = new Map();
child.stdout.on('data', (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i);
    buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    let m;
    try { m = JSON.parse(line); } catch { continue; }
    const cb = pending.get(m.id);
    if (cb) { pending.delete(m.id); cb(m); }
  }
});
child.stderr.on('data', (d) => console.log('stderr', d.toString().slice(0, 200)));
const rpc = (method, params) => new Promise((res) => { const rid = ++id; pending.set(rid, res); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: rid, method, params }) + '\n'); });
await rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'probe', version: '1' } });
child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
async function call(name, args) {
  const r = await rpc('tools/call', { name, arguments: args });
  if (r.result?.isError) return { error: r.result.content?.[0]?.text };
  const t = r.result?.content?.[0]?.text;
  try { return JSON.parse(t); } catch { return t; }
}
const cmd = (id, params) => call('command_run', { id, params });

const PNG = 'D:/neww/EggLab/out/egglab-turbo-20261031-142941-2059112601-rgba.png';

const menu = await call('control_call', { method: 'ui.menu.list', params: {} });
const docsBefore = menu.filter((m) => /^window\.document\./.test(m.id));
console.log('docs before', docsBefore.map((d) => `${d.id}:${d.label}:checked=${d.checked}`));
const activeBefore = docsBefore.find((d) => d.checked);

console.log('\ndelete the gray pasted layers');
console.log(JSON.stringify(await cmd('layer.delete', { layer: 6 })));
console.log(JSON.stringify(await cmd('layer.delete', { layer: 5 })));

console.log('\nopen png as a document');
console.log(JSON.stringify(await call('doc_open', { path: PNG })));

const menu2 = await call('control_call', { method: 'ui.menu.list', params: {} });
const docsAfter = menu2.filter((m) => /^window\.document\./.test(m.id));
console.log('docs after', docsAfter.map((d) => `${d.id}:${d.label}:checked=${d.checked}`));
const source = docsAfter.find((d) => d.checked);
const dest = docsAfter.find((d) => !d.checked);
console.log('source', source?.id, 'dest', dest?.id, 'activeBefore', activeBefore?.id);

const srcIndex = Number(source.id.split('.').pop());
const destIndex = Number((dest || activeBefore).id.split('.').pop());

const srcDoc = await call('doc_inspect', {});
console.log('source doc', srcDoc.name, srcDoc.width, srcDoc.height, 'layers', srcDoc.layers?.map((l) => `${l.id}:${l.name}:${JSON.stringify(l.bounds)}`));

console.log('\ncopy layer into destination');
console.log(JSON.stringify(await cmd('layer.copyToDocument', {
  document: destIndex,
  source: srcIndex,
  at: [540, 540],
})));

console.log('close source document', JSON.stringify(await cmd('file.close', { document: srcIndex })));

console.log('\nactive doc now', (await call('doc_inspect', {})).name);
console.log('pixel 290,290', JSON.stringify(await cmd('document.pixel', { x: 290, y: 290 })));
console.log('pixel 540,540', JSON.stringify(await cmd('document.pixel', { x: 540, y: 540 })));

child.kill();
process.exit(0);
