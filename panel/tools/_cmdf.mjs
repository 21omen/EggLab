import fs from 'node:fs';
const { spawn } = await import('node:child_process');
const s = JSON.parse(fs.readFileSync('settings.json', 'utf8'));
const child = spawn(s.photocraft.cli, ['mcp', '--bridge', '127.0.0.1:' + s.photocraft.controlPort, '--control-token-file', s.photocraft.tokenFile], { stdio: ['pipe', 'pipe', 'pipe'] });
let buf = ''; let id = 0; const pending = new Map();
child.stdout.on('data', (d) => { buf += d.toString(); let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line.trim()) continue; let m; try { m = JSON.parse(line); } catch { continue; } const cb = pending.get(m.id); if (cb) { pending.delete(m.id); cb(m); } } });
const rpc = (method, params) => new Promise((res) => { const rid = ++id; pending.set(rid, res); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: rid, method, params }) + '\n'); });
await rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'dump', version: '1' } });
child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
const filters = process.argv.slice(2);
for (const f of filters) {
  const out = await rpc('tools/call', { name: 'command_list', arguments: { filter: f } });
  const txt = out.result?.content?.[0]?.text || '[]';
  let list = [];
  try { list = JSON.parse(txt); } catch {}
  console.log('##', f, list.length);
  for (const c of list) console.log(' ', c.id, '|', c.label || '');
}
child.kill();
