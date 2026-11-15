// Smoke-test the batched command tool over the real MCP stdio protocol.
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
p.stderr.on('data', (d) => process.stderr.write(d.toString()));
const send = (o) => p.stdin.write(JSON.stringify(o) + '\n');
const rpc = (id, method, params) => {
  const w = new Promise((res) => waiters.push(res));
  send({ jsonrpc: '2.0', id, method, params });
  return w;
};

await rpc(1, 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'batchtest', version: '0' } });
send({ jsonrpc: '2.0', method: 'notifications/initialized' });

const list = await rpc(2, 'tools/list', {});
const names = list.result.tools.map((t) => t.name);
console.log('tools:', names.length, '| batch present:', names.includes('photocraft_batch'));

const good = await rpc(3, 'tools/call', {
  name: 'photocraft_batch',
  arguments: {
    commands: [
      { id: 'document.inspect', params: {} },
      { id: 'document.activate', params: { document: 0 } },
    ],
  },
});
console.log('GOOD:', JSON.stringify(good.result ?? good.error).slice(0, 500));

const bad = await rpc(4, 'tools/call', {
  name: 'photocraft_batch',
  arguments: {
    commands: [
      { id: 'type.create', params: { x: 10, y: 10, text: 'BATCH', name: 'Batch test' } },
      { id: 'nope.notACommand', params: {} },
      { id: 'layer.delete', params: {} },
    ],
  },
});
console.log('BAD :', JSON.stringify(bad.result ?? bad.error).slice(0, 700));

// Always clean up the probe layer if one was created.
const doc = await rpc(5, 'tools/call', { name: 'photocraft_layers', arguments: {} });
const text = JSON.stringify(doc.result ?? doc.error);
const m = text.match(/Batch test[^}]*?"id":(\d+)|"id":(\d+)[^}]*?Batch test/);
console.log('cleanup match:', m ? (m[1] || m[2]) : 'none');
if (m) {
  await rpc(6, 'tools/call', {
    name: 'photocraft_command',
    arguments: { id: 'layer.delete', params: { layer: Number(m[1] || m[2]) } },
  });
}
p.kill();
process.exit(0);
