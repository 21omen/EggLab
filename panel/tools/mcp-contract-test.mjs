// Functional MCP contract test (no model, no GPU, no network).
//
// Runs the real mcp-server.mjs against a fake panel to lock down the bug where
// a failed model download was reported as ok:true, and the recent-projects
// limit that was accepted by the schema but never forwarded.
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const PANEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const state = { mode: 'ok', posts: 0, modelCalls: 0, recentLimit: null };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  req.resume();
  const send = (code, body) => {
    res.writeHead(code, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  if (req.method === 'POST' && url.pathname === '/api/models/download') {
    state.posts++;
    return send(200, { started: ['diffusion'] });
  }
  if (req.method === 'GET' && url.pathname === '/api/models') {
    state.modelCalls++;
    if (state.mode === 'fail') {
      return send(200, {
        entries: [
          {
            id: 'diffusion',
            file: 'qwen-image-2.1-Q4_K_M.gguf',
            exists: true,
            sizeText: '3.9 GB',
            variants: [
              { id: 'q4km-beta', file: 'qwen-image-2.1-Q4_K_M.gguf', installed: true },
              { id: 'uc-fp8', file: 'qwen-image-2.1-UC-fp8.safetensors', installed: false },
            ],
            download: { status: 'error', error: 'HTTP 500 from the model host', file: 'qwen-image-2.1-UC-fp8.safetensors' },
          },
        ],
      });
    }
    if (state.mode === 'running' && state.modelCalls === 1) {
      return send(200, {
        entries: [
          {
            id: 'diffusion',
            file: 'qwen-image-2.1-Q4_K_M.gguf',
            exists: true,
            sizeText: '3.9 GB',
            variants: [
              { id: 'q4km-beta', file: 'qwen-image-2.1-Q4_K_M.gguf', installed: true },
              { id: 'uc-fp8', file: 'qwen-image-2.1-UC-fp8.safetensors', installed: false },
            ],
            download: { status: 'running', percent: 42, file: 'qwen-image-2.1-UC-fp8.safetensors' },
          },
        ],
      });
    }
    return send(200, {
      entries: [
        {
          id: 'diffusion',
          file: 'qwen-image-2.1-Q4_K_M.gguf',
          exists: true,
          sizeText: '3.9 GB',
          variants: [
            { id: 'q4km-beta', file: 'qwen-image-2.1-Q4_K_M.gguf', installed: true },
            { id: 'uc-fp8', file: 'qwen-image-2.1-UC-fp8.safetensors', installed: true },
          ],
          download: null,
        },
      ],
    });
  }
  if (req.method === 'GET' && url.pathname === '/api/photocraft/project/recent') {
    state.recentLimit = url.searchParams.get('limit');
    return send(200, { projects: [] });
  }
  return send(404, { error: `No route for ${req.method} ${url.pathname}` });
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const child = spawn(process.execPath, ['mcp-server.mjs'], {
  cwd: PANEL,
  env: { ...process.env, EGGLAB_URL: `http://127.0.0.1:${port}`, EGGLAB_TOKEN: 'test' },
  stdio: ['pipe', 'pipe', 'pipe'],
});
const lines = createInterface({ input: child.stdout });
const pending = new Map();
let stderr = '';
child.stderr.on('data', (d) => (stderr += d.toString()));
lines.on('line', (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
});

let id = 0;
function request(method, params) {
  return new Promise((resolve, reject) => {
    const callId = ++id;
    const timer = setTimeout(() => {
      pending.delete(callId);
      reject(new Error(`MCP ${method} timed out`));
    }, 15000);
    pending.set(callId, (msg) => {
      clearTimeout(timer);
      resolve(msg);
    });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: callId, method, params }) + '\n');
  });
}
async function tool(name, args) {
  const msg = await request('tools/call', { name, arguments: args });
  if (msg.error) throw new Error(msg.error.message);
  if (msg.result?.isError) throw new Error(msg.result.content?.[0]?.text || 'tool error');
  const text = msg.result?.content?.[0]?.text || '{}';
  return JSON.parse(text);
}

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

try {
  await request('initialize', {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'egglab-contract-test', version: '1' },
  });

  state.mode = 'fail';
  state.posts = 0;
  const failed = await tool('download_models', { ids: ['diffusion'], variant: 'uc-fp8' });
  check('failed download reported as failure', failed.ok === false, failed.error || '');
  check('failed download actually POSTed', state.posts > 0);

  state.mode = 'ok';
  const ready = await tool('download_models', { ids: ['diffusion'], variant: 'uc-fp8' });
  check('completed download reported as success', ready.ok === true);

  state.mode = 'running';
  state.modelCalls = 0;
  const waited = await tool('download_models', { ids: ['diffusion'], variant: 'uc-fp8' });
  check('running download is waited for', waited.ok === true && state.modelCalls >= 2, `${state.modelCalls} status calls`);

  state.mode = 'ok';
  await tool('photocraft_recent_projects', { limit: 7 });
  check('recent-projects limit forwarded', state.recentLimit === '7', String(state.recentLimit));
} catch (err) {
  check('MCP contract test completed', false, err.message);
} finally {
  child.kill();
  server.close();
}

if (stderr.trim()) console.error(stderr.trim().slice(0, 800));
console.log(`\n${failures ? 'FAILED' : 'OK'} — ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
