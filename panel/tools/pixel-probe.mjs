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

console.log('pixel 290,290', JSON.stringify(await cmd('document.pixel', { x: 290, y: 290 })));
console.log('pixel 50,50 (background)', JSON.stringify(await cmd('document.pixel', { x: 50, y: 50 })));

const menu = await call('control_call', { method: 'ui.menu.list', params: {} });
console.log('\nmenu keys', Object.keys(menu || {}));
const text = JSON.stringify(menu);
const idx = text.indexOf('window.document');
console.log('window entries:', text.slice(Math.max(0, idx - 400), idx + 900));

child.kill();
process.exit(0);
