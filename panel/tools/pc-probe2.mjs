import fs from 'node:fs';
import { spawn } from 'node:child_process';

console.log('reading settings');
const s = JSON.parse(fs.readFileSync('settings.json', 'utf8'));
console.log('cli', s.photocraft.cli, 'port', s.photocraft.controlPort);
const child = spawn(s.photocraft.cli, ['mcp', '--bridge', `127.0.0.1:${s.photocraft.controlPort}`, '--control-token-file', s.photocraft.tokenFile], { stdio: ['pipe', 'pipe', 'pipe'] });
let buf = '';
let id = 0;
const pending = new Map();
child.stdout.on('data', (d) => {
  console.log('stdout chunk', d.length);
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
child.on('exit', (c) => console.log('exit', c));
const rpc = (method, params) => new Promise((res) => { const rid = ++id; pending.set(rid, res); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: rid, method, params }) + '\n'); });
console.log('init');
console.log(JSON.stringify(await rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'probe', version: '1' } })).slice(0, 300));
child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
console.log('list');
console.log((await rpc('tools/list', {})).result?.tools?.map((t) => t.name).join(','));
console.log('session_list');
const sl = await rpc('tools/call', { name: 'session_list', arguments: {} });
console.log(JSON.stringify(sl).slice(0, 1500));
console.log('doc_inspect');
const di = await rpc('tools/call', { name: 'doc_inspect', arguments: {} });
console.log(JSON.stringify(di).slice(0, 1000));
child.kill();
process.exit(0);
