import fs from 'node:fs';
const { spawn } = await import('node:child_process');
const s = JSON.parse(fs.readFileSync('settings.json', 'utf8'));
const cli = s.photocraft.cli;
const token = s.photocraft.tokenFile.replace(/\\\\/g, '\\');
const child = spawn(cli, ['mcp', '--bridge', '127.0.0.1:' + s.photocraft.controlPort, '--control-token-file', s.photocraft.tokenFile], { stdio: ['pipe','pipe','pipe'] });
let buf = ''; let id = 0; const pending = new Map();
child.stdout.on('data', (d) => { buf += d.toString(); let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0,i); buf = buf.slice(i+1); if (!line.trim()) continue; let m; try { m = JSON.parse(line); } catch { continue; } const cb = pending.get(m.id); if (cb) { pending.delete(m.id); cb(m); } } });
child.stderr.on('data', (d) => console.error('ERR', d.toString()));
const rpc = (method, params) => new Promise((res) => { const rid = ++id; pending.set(rid, res); child.stdin.write(JSON.stringify({ jsonrpc:'2.0', id: rid, method, params }) + '\n'); });
await rpc('initialize', { protocolVersion:'2025-11-25', capabilities:{}, clientInfo:{name:'dump',version:'1'} });
child.stdin.write(JSON.stringify({ jsonrpc:'2.0', method:'notifications/initialized' }) + '\n');
const out = await rpc('tools/call', { name:'command_list', arguments:{ filter:'layer.delete' } });
const txt = out.result?.content?.[0]?.text || JSON.stringify(out);
const list = JSON.parse(txt);
for (const c of list) console.log(c.id, '|', c.label || '', '| enabled:', c.enabled, c.disabledReason || '', '| params:', JSON.stringify(c.params || c.paramsDoc || '').slice(0, 300));
child.kill();

