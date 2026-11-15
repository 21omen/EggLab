import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';

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
child.stderr.on('data', (d) => console.log('stderr', d.toString().slice(0, 300)));
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

const PNG = 'D:/neww/EggLab/out/egglab-turbo-20261031-142941-2059112601-rgba.png';

console.log('close the opened png');
console.log(JSON.stringify(await cmd('file.close', {})).slice(0, 300));
const ui = await call('ui_inspect', {});
console.log('active doc now:', ui?.document?.name, ui?.document?.width + 'x' + ui?.document?.height, 'layers', ui?.document?.layers?.length);

console.log('\nset clipboard from png');
execFileSync('powershell.exe', ['-NoProfile', '-STA', '-Command', `Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; $img=[System.Drawing.Image]::FromFile('${PNG.replace(/\//g, '\\')}'); [System.Windows.Forms.Clipboard]::SetImage($img); $img.Dispose(); 'ok'`], { encoding: 'utf8' });

console.log('paste');
const pasted = await cmd('edit.paste', {});
console.log(JSON.stringify(pasted).slice(0, 600));
const after = await call('doc_inspect', {});
console.log('layers after paste:', (after.layers || []).map((l) => `${l.id}:${l.name}:${l.kind}:${JSON.stringify(l.bounds)}:sel=${l.selected}:act=${l.active}`).join('\n'));

const target = (after.layers || []).find((l) => l.active) || (after.layers || [])[0];
console.log('\nselect pasted layer', target?.id);
console.log(JSON.stringify(await cmd('layer.select', { layer: target.id })).slice(0, 300));

console.log('\nclear clipboard');
execFileSync('powershell.exe', ['-NoProfile', '-STA', '-Command', `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::Clear(); 'ok'`], { encoding: 'utf8' });

console.log('copy');
console.log(JSON.stringify(await cmd('edit.copy', {})).slice(0, 300));

console.log('read clipboard image');
const out = 'D:/neww/EggLab/panel/tmp/clip-test.png';
const res = execFileSync('powershell.exe', ['-NoProfile', '-STA', '-Command', `Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; $i=[System.Windows.Forms.Clipboard]::GetImage(); if(-not $i){'EMPTY'} else { $i.Save('${out.replace(/\//g, '\\')}', [System.Drawing.Imaging.ImageFormat]::Png); "$($i.Width)x$($i.Height)"; $i.Dispose() }`], { encoding: 'utf8' });
console.log(res.trim());
if (fs.existsSync(out)) console.log('file', fs.statSync(out).size);

child.kill();
process.exit(0);
