// Minimal MCP stdio handshake against the panel's MCP server.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const panelDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ctl = JSON.parse(await import('node:fs').then((fs) => fs.readFileSync(path.join(panelDir, 'control.json'), 'utf8')));
const p = spawn(process.execPath, ['mcp-server.mjs'], {
  cwd: panelDir,
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, EGGLAB_URL: ctl.url, EGGLAB_TOKEN: ctl.token },
});
let buf = '';
const send = (o) => p.stdin.write(JSON.stringify(o) + '\n');
const waiters = [];
p.stdout.on('data', (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i);
    buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      const w = waiters.shift();
      if (w) w(msg);
    } catch {}
  }
});
p.stderr.on('data', (d) => process.stderr.write(d.toString()));
const rpc = (id, method, params) => {
  const w = new Promise((res) => waiters.push(res));
  send({ jsonrpc: '2.0', id, method, params });
  return w;
};

await rpc(1, 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'probe', version: '0' } });
send({ jsonrpc: '2.0', method: 'notifications/initialized' });
const list = await rpc(2, 'tools/list', {});
const names = list.result.tools.map((t) => t.name);
console.log('tools:', names.length, '| has photocraft_commands:', names.includes('photocraft_commands'));
const call = await rpc(3, 'tools/call', { name: 'photocraft_commands', arguments: { filter: 'adjustment layer', limit: 5 } });
console.log('CALL:', JSON.stringify(call.result ?? call.error).slice(0, 1200));
p.kill();
process.exit(0);
