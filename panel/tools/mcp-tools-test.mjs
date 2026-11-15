import { spawn } from 'node:child_process';
import fs from 'node:fs';

const c = JSON.parse(fs.readFileSync('D:/neww/EggLab/panel/control.json', 'utf8'));
const env = { ...process.env, EGGLAB_URL: c.url, EGGLAB_TOKEN: c.token };
const p = spawn(process.execPath, ['mcp-server.mjs'], { cwd: 'D:/neww/EggLab/panel', env, stdio: ['pipe', 'pipe', 'pipe'] });
let buf = '';
let stderr = '';
p.stderr.on('data', (d) => (stderr += d));
p.stdout.setEncoding('utf8');
p.stdout.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    const m = JSON.parse(line);
    if (m.id === 1) {
      p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\n');
    } else if (m.id === 2) {
      const names = m.result.tools.map((t) => t.name);
      console.log('tools:', names.length);
      console.log('asset tools:', names.filter((n) => /alpha|edit_active|generate|place/.test(n)).join(', '));
      p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'check_alpha', arguments: { path: 'D:/neww/EggLab/out/egglab-turbo-20261104-020346-826624407-rgba.png' } } }) + '\n');
    } else if (m.id === 3) {
      console.log('check_alpha:', m.result.content[0].text.replace(/\s+/g, ' ').slice(0, 260));
      p.stdin.end();
      process.exit(0);
    }
  }
});
p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 't', version: '1' } } }) + '\n');
setTimeout(() => {
  console.log('timeout; stderr:', stderr);
  process.exit(1);
}, 20000);
