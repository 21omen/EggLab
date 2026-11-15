// Verify the audit tool over the real MCP stdio protocol.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const panelDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ctl = JSON.parse(fs.readFileSync(path.join(panelDir, 'control.json'), 'utf8'));
const p = spawn(process.execPath, ['mcp-server.mjs'], {
  cwd: panelDir,
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, EGGLAB_URL: ctl.url, EGGLAB_TOKEN: ctl.token },
});
let buf = '';
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
const send = (o) => p.stdin.write(JSON.stringify(o) + '\n');
const rpc = (id, method, params) => {
  const w = new Promise((res) => waiters.push(res));
  send({ jsonrpc: '2.0', id, method, params });
  return w;
};

await rpc(1, 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'audittest', version: '0' } });
send({ jsonrpc: '2.0', method: 'notifications/initialized' });
const list = await rpc(2, 'tools/list', {});
console.log('tools:', list.result.tools.length, '| audit:', list.result.tools.some((t) => t.name === 'photocraft_audit'), '| preview:', list.result.tools.some((t) => t.name === 'photocraft_preview'), '| status:', list.result.tools.some((t) => t.name === 'photocraft_status'));
const res = await rpc(3, 'tools/call', { name: 'photocraft_audit', arguments: {} });
console.log('AUDIT:', JSON.stringify(res.result ?? res.error).slice(0, 900));
p.kill();
process.exit(0);
