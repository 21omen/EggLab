// Verifies the _clock marker reaches tool results (harness timing feedback,
// arXiv:2610.10833). Prints the matched _clock object or the result tail.
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const ctl = JSON.parse(fs.readFileSync('D:/neww/EggLab/panel/control.json', 'utf8'));
const p = spawn(process.execPath, ['mcp-server.mjs'], {
  cwd: 'D:/neww/EggLab/panel',
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
    try { const m = JSON.parse(line); waiters.shift()?.(m); } catch {}
  }
});
const rpc = (id, method, params) => {
  const w = new Promise((res) => waiters.push(res));
  p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  return w;
};

await rpc(1, 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'clock-probe', version: '0' } });
p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
const r = await rpc(2, 'tools/call', { name: 'status', arguments: {} });
const text = r.result?.content?.[0]?.text ?? JSON.stringify(r);
const m = text.match(/"_clock"\s*:\s*\{[^}]*\}/);
console.log(m ? 'CLOCK OK: ' + m[0] : 'NO CLOCK. tail: ' + text.slice(-300));
p.kill();
process.exit(0);
