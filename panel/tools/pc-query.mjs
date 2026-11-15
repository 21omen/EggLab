import net from 'node:net';
import fs from 'node:fs';

const PORT = 7878;
const token = fs.readFileSync('D:/neww/EggLab/panel/photocraft.token', 'utf8').trim();

const sock = net.connect(PORT, '127.0.0.1');
let buf = '';
const pending = new Map();
let nextId = 1;

sock.on('data', (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    const r = pending.get(msg.id);
    if (r) { pending.delete(msg.id); r(msg); }
  }
});

function call(method, params = {}, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const t = setTimeout(() => { pending.delete(id); reject(new Error('timeout ' + method)); }, timeoutMs);
    pending.set(id, (m) => { clearTimeout(t); resolve(m); });
    sock.write(JSON.stringify({ id, method, params }) + '\n');
  });
}

sock.on('error', (e) => { console.error('socket error', e.message); process.exit(1); });

sock.on('connect', async () => {
  const a = await call('auth', { token });
  if (!a.ok) { console.error('auth failed', a.error); process.exit(1); }
  console.error('authenticated');
  const list = await call('engine.commands');
  if (!list.ok) { console.error('commands failed', list.error); process.exit(1); }
  fs.writeFileSync('D:/neww/EggLab/panel/tmp/pc-commands.json', JSON.stringify(list.result, null, 1));
  console.error('commands:', list.result.length);
  const docs = await call('ui.inspect');
  fs.writeFileSync('D:/neww/EggLab/panel/tmp/pc-ui.json', JSON.stringify(docs, null, 1));
  sock.end();
  process.exit(0);
});
