// Security contract for egl_inspect: missing roots fail closed, external
// paths are rejected, and canonical paths inside an approved root work.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { encodePng } from '../service/pngfeather.mjs';

const PANEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(os.tmpdir(), `egglab-inspect-${process.pid}`);
const allowed = path.join(dir, 'allowed');
const outside = path.join(dir, 'outside');
fs.mkdirSync(allowed, { recursive: true });
fs.mkdirSync(outside, { recursive: true });
const rgba = Buffer.alloc(4 * 4 * 4);
for (let i = 0; i < rgba.length; i += 4) {
  rgba[i] = 200;
  rgba[i + 1] = 40;
  rgba[i + 2] = 40;
  rgba[i + 3] = 255;
}
const allowedPng = path.join(allowed, 'ok.png');
const outsidePng = path.join(outside, 'private.png');
encodePng(allowedPng, 4, 4, rgba);
encodePng(outsidePng, 4, 4, rgba);

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

function run(roots, calls) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['mcp-server.mjs'], {
      cwd: PANEL,
      env: {
        ...process.env,
        ...(roots === null ? {} : { EGGLAB_READ_ROOTS: JSON.stringify(roots) }),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const lines = createInterface({ input: child.stdout });
    const pending = new Map();
    let seq = 0;
    const request = (method, params) => new Promise((res) => {
      const id = ++seq;
      pending.set(id, res);
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
    lines.on('line', (line) => {
      const msg = JSON.parse(line);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg.result);
        pending.delete(msg.id);
      }
    });
    (async () => {
      await request('initialize', {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'inspect-security-test', version: '1' },
      });
      const results = [];
      for (const file of calls) {
        results.push(await request('tools/call', { name: 'inspect', arguments: { path: file } }));
      }
      child.kill();
      resolve(results);
    })();
  });
}

const noRoots = await run(null, [allowedPng]);
check('missing roots fail closed', noRoots[0]?.isError === true, JSON.stringify(noRoots[0]?.content || []).slice(0, 120));

const withRoots = await run([allowed], [allowedPng, outsidePng]);
check('allowed image returns image content', withRoots[0]?.isError === false && withRoots[0]?.content?.some((c) => c.type === 'image'));
check('outside image rejected', withRoots[1]?.isError === true, JSON.stringify(withRoots[1]?.content || []).slice(0, 120));

try {
  fs.rmSync(dir, { recursive: true, force: true });
} catch {}
console.log(`\n${failures ? 'FAILED' : 'OK'} — ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
