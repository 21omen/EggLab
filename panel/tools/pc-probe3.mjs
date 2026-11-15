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
child.stderr.on('data', (d) => console.log('stderr', d.toString().slice(0, 300)));
const rpc = (method, params) => new Promise((res) => { const rid = ++id; pending.set(rid, res); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: rid, method, params }) + '\n'); });
await rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'probe', version: '1' } });
child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

async function call(name, args) {
  const r = await rpc('tools/call', { name, arguments: args });
  if (r.result?.isError) return { error: r.result.content?.[0]?.text };
  const t = r.result?.content?.[0]?.text;
  try { return JSON.parse(t); } catch { return t; }
}

console.log('control_call session.list');
console.log(JSON.stringify(await call('control_call', { method: 'session.list', params: {} })).slice(0, 2000));

console.log('\ndoc_open generated png');
const opened = await call('doc_open', { path: 'D:/neww/EggLab/out/egglab-turbo-20261031-142941-2059112601-rgba.png' });
console.log(JSON.stringify(opened).slice(0, 2000));

console.log('\ncontrol_call session.list after open');
console.log(JSON.stringify(await call('control_call', { method: 'session.list', params: {} })).slice(0, 2000));

console.log('\nui_inspect document name');
const ui = await call('ui_inspect', {});
console.log(JSON.stringify({ name: ui?.document?.name, width: ui?.document?.width, height: ui?.document?.height, tabs: ui?.documentTabs, windows: ui?.windows }, null, 1));

child.kill();
process.exit(0);
