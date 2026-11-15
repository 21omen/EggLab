// Gate for the v2 knowledge loader: verifies the MCP tool exists, reads real
// skill/reference files, and rejects traversal, code files and unknown paths.
// Run: node tools\_knowledge-check.mjs
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PANEL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const child = spawn(process.execPath, [path.join(PANEL_DIR, 'mcp-server.mjs')], {
  cwd: PANEL_DIR,
  env: { ...process.env, EGGLAB_URL: 'http://127.0.0.1:1', EGGLAB_TOKEN: 'check' },
  stdio: ['pipe', 'pipe', 'inherit'],
});

let buf = '';
let seq = 0;
const pending = new Map();
child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  buf += chunk;
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    const resolve = pending.get(msg.id);
    if (resolve) {
      pending.delete(msg.id);
      resolve(msg);
    }
  }
});

function send(method, params) {
  const id = ++seq;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
}

const init = await send('initialize', {
  protocolVersion: '2025-11-25',
  capabilities: {},
  clientInfo: { name: 'knowledge-check', version: '1' },
});
if (!init.result) {
  console.error('initialize failed:', init.error);
  process.exit(1);
}

const list = await send('tools/list', {});
const names = (list.result?.tools || []).map((tool) => tool.name);
const hasTool = names.includes('read_knowledge');
console.log(`read_knowledge in tools/list: ${hasTool ? 'PASS' : 'FAIL'}`);

const cases = [
  ['skills/transparency/SKILL.md', 'ok'],
  ['skills/design-direction/SKILL.md', 'ok'],
  ['references/engine/qwen-image-2.1-legacy-facts.md', 'ok'],
  ['references/research/local/agent-failure-research.md', 'ok'],
  ['AGENT.md', 'ok'],
  ['config/runtime-profile.yaml', 'ok'],
  ['../README.md', 'not_allowlisted'],
  ['skills/../service/chat.mjs', 'not_allowlisted'],
  ['renderer/app.js', 'not_allowlisted'],
  ['logs/agent.log', 'not_allowlisted'],
  ['references/../chats/no_document.json', 'not_allowlisted'],
  ['references/styles/not-a-file.md', 'not_found'],
  ['references/styles/swiss.md', 'ok'],
];

let failed = 0;
for (const [request, expected] of cases) {
  const res = await send('tools/call', { name: 'read_knowledge', arguments: { path: request } });
  let payload = null;
  try {
    payload = JSON.parse(res.result?.content?.[0]?.text || 'null');
  } catch {}
  const actual = payload?.ok ? 'ok' : payload?.error || 'no-payload';
  const pass = actual === expected;
  if (!pass) failed++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${request} -> ${actual}${payload?.bytes ? ` (${payload.bytes} B)` : ''}`);
}

child.kill();
if (!hasTool || failed) {
  console.error(`KNOWLEDGE CHECK FAILED (${failed} case(s))`);
  process.exit(1);
}
console.log('KNOWLEDGE CHECK: all green');
