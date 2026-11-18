// Live agent-surface test (opt-in; needs a running panel and a model).
//
// The static gate can prove the generated config and MCP profile are correct.
// It cannot prove OpenCode actually sends those tools to the provider. This
// test starts a clean `opencode run --standalone` turn, asks the model to
// report its exact function list as JSON, and asserts:
//   - every curated EggLab core tool is visible
//   - `read` is visible (image inspection)
//   - unrelated built-ins and other MCP servers are absent
//
// Usage: npm run test:surface
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { AGENT_DIR } from '../service/paths.mjs';
import { getSettings, resolveOpenCode } from '../service/settings.mjs';
import { buildWorkspace } from '../service/chat.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PANEL = path.resolve(HERE, '..');

const CORE = [
  'status',
  'read_knowledge',
  'generate',
  'edit',
  'cancel',
  'check_alpha',
  'photocraft_launch',
  'photocraft_new_document',
  'photocraft_layers',
  'photocraft_place',
  'photocraft_canvas',
  'photocraft_edit_active',
  'photocraft_audit',
  'photocraft_save',
  'photocraft_export_flat',
  'photocraft_export_layers',
  'photocraft_command',
  'photocraft_commands',
  'photocraft_batch',
].map((name) => `egglab_${name}`);

const FORBIDDEN = [
  'experimental_image_generate',
  'execute',
  'glob',
  'grep',
  'question',
  'webfetch',
  'websearch',
  'egg_enhance',
  'context7_query-docs',
];

function controlFile() {
  const candidates = [
    path.join(PANEL, 'control.json'),
    path.join(process.env.APPDATA || '', 'EggLab', 'control.json'),
  ];
  return candidates.find((file) => fs.existsSync(file));
}

function findJson(text) {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

const file = controlFile();
if (!file) {
  console.log('SKIP  agent surface test — no running panel control.json');
  process.exit(0);
}

const ctl = JSON.parse(fs.readFileSync(file, 'utf8'));
const oc = resolveOpenCode();
if (!oc?.cmd) {
  console.log('SKIP  agent surface test — OpenCode executable not found');
  process.exit(0);
}

buildWorkspace({ url: ctl.url, token: ctl.token });
const settings = getSettings();
const model = process.env.EGGLAB_SURFACE_MODEL || settings.opencode?.model;
if (!model) {
  console.log('SKIP  agent surface test — no agent model configured');
  process.exit(0);
}

const prompt = [
  'Tool-surface test. Do not call any tool.',
  'Reply with only one JSON object and no markdown:',
  '{"visible":["exact tool name", "..."]}',
  'Include every tool currently available to you, exactly as named.',
].join(' ');

const child = spawn(
  oc.cmd,
  ['run', '--standalone', '--format', 'json', '--agent', 'egglab', '--model', model, prompt],
  { cwd: AGENT_DIR, windowsHide: true, shell: oc.shell, stdio: ['ignore', 'pipe', 'pipe'] },
);
let stdout = '';
let stderr = '';
child.stdout.setEncoding('utf8');
child.stderr.setEncoding('utf8');
child.stdout.on('data', (chunk) => (stdout += chunk));
child.stderr.on('data', (chunk) => (stderr += chunk));
const timer = setTimeout(() => {
  try {
    child.kill();
  } catch {}
}, 180000);
const result = await new Promise((resolve) => {
  child.on('error', (err) => resolve({ code: null, signal: null, error: err }));
  child.on('exit', (code, signal) => resolve({ code, signal, error: null }));
});
clearTimeout(timer);
const code = result.code;
if (result.error) {
  console.error(`FAIL  could not start OpenCode (${oc.cmd}): ${result.error.message}`);
  process.exit(1);
}
if (!stdout.trim()) {
  console.error(`FAIL  OpenCode produced no JSON events (code=${code}, signal=${result.signal})`);
  console.error(stderr.slice(0, 1200));
  process.exit(1);
}

const text = stdout
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => {
    try {
      const event = JSON.parse(line);
      return event.type === 'text' ? event.part?.text || '' : '';
    } catch {
      return '';
    }
  })
  .join('\n');

const report = findJson(text);
if (!report || !Array.isArray(report.visible)) {
  console.error('FAIL  model did not return a JSON tool list');
  console.error(`exit=${code} stderr=${stderr.slice(0, 800)}`);
  console.error(text.slice(0, 1200));
  process.exit(1);
}

const visible = new Set(report.visible.map(String));
let failures = 0;
for (const name of CORE) {
  if (!visible.has(name)) {
    console.error(`FAIL  missing core tool ${name}`);
    failures++;
  }
}
if (!visible.has('read')) {
  console.error('FAIL  missing read tool (image inspection)');
  failures++;
}
for (const name of FORBIDDEN) {
  if (visible.has(name)) {
    console.error(`FAIL  forbidden tool visible ${name}`);
    failures++;
  }
}
console.log(
  failures
    ? `FAILED — ${failures} failure(s); visible=${visible.size}`
    : `OK — ${visible.size} visible, ${CORE.length} core tools present`,
);
process.exit(failures ? 1 : 0);
