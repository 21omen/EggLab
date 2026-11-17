// Agent contract gate — runs on every push and before every release.
//
// It does not call a model (CI has no provider credentials); it validates the
// things that broke silently: the 24 benchmark cases, every skill they name,
// every egglab_* tool they mention, the root OpenCode config, and the timeout
// chain for long model downloads.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PANEL = path.resolve(HERE, '..');
const REPO = path.resolve(PANEL, '..');

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}
const read = (rel, base = PANEL) => fs.readFileSync(path.join(base, rel), 'utf8');
const exists = (rel, base = PANEL) => fs.existsSync(path.join(base, rel));

// ---- MCP tool registry -------------------------------------------------
const toolSource = read('mcp-server.mjs');
const toolsStart = toolSource.indexOf('const tools = [');
const toolsEnd = toolSource.indexOf('\n];', toolsStart);
const toolsBlock = toolSource.slice(toolsStart, toolsEnd);
const toolNames = new Set([...toolsBlock.matchAll(/name:\s*'([a-z0-9_]+)'/g)].map((m) => m[1]));
check('MCP tool registry parsed', toolNames.size >= 20, `${toolNames.size} tools`);
for (const required of ['status', 'generate', 'edit', 'download_models', 'photocraft_recent_projects', 'read_knowledge']) {
  check(`tool: ${required}`, toolNames.has(required));
}

// ---- knowledge skills --------------------------------------------------
const skillNames = new Set(
  fs
    .readdirSync(path.join(PANEL, 'skills'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && exists(`skills/${d.name}/SKILL.md`))
    .map((d) => d.name),
);
check('skills parsed', skillNames.size >= 8, [...skillNames].join(', '));

// ---- benchmark cases ---------------------------------------------------
const caseText = read('evals/benchmark-cases.yaml');
const caseBlocks = [];
let current = null;
for (const line of caseText.split(/\r?\n/)) {
  const m = line.match(/^\s{2}- id:\s*(\S+)/);
  if (m) {
    current = { id: m[1], lines: [line] };
    caseBlocks.push(current);
  } else if (current) {
    current.lines.push(line);
  }
}
check('benchmark case count', caseBlocks.length === 24, `${caseBlocks.length} cases`);
const ids = caseBlocks.map((c) => c.id);
check('benchmark ids unique', new Set(ids).size === ids.length, `${ids.length} unique`);

const referencedSkills = new Set();
for (const block of caseBlocks) {
  const text = block.lines.join('\n');
  if (!/\bbrief:/.test(text)) check(`case ${block.id} brief`, false);
  if (!/\bchecks:/.test(text)) check(`case ${block.id} checks`, false);
  for (const field of ['must_load', 'conditional']) {
    const m = text.match(new RegExp(`${field}:\\s*\\[([^\\]]*)\\]`));
    if (!m) continue;
    for (const name of m[1].split(',').map((s) => s.trim()).filter(Boolean)) {
      referencedSkills.add(name);
      if (!skillNames.has(name)) check(`case ${block.id} skill ${name}`, false);
    }
  }
}
check(
  'benchmark skills resolve',
  [...referencedSkills].every((s) => skillNames.has(s)),
  `${referencedSkills.size} skill names`,
);

// ---- prompt/tool references -------------------------------------------
const promptFiles = ['AGENT.md', 'ROUTER.md', 'manifest.yaml', 'evals/benchmark-cases.yaml'];
for (const file of promptFiles) {
  const text = read(file);
  const refs = [...new Set([...text.matchAll(/\begglab_([a-z0-9_]+)/g)].map((m) => m[1]))];
  for (const ref of refs) {
    check(`${file} tool ${ref}`, toolNames.has(ref));
  }
}
const instructionRefs = [
  ...new Set([...toolSource.matchAll(/\begglab_([a-z0-9_]+)/g)].map((m) => m[1])),
];
for (const ref of instructionRefs) check(`MCP instructions tool ${ref}`, toolNames.has(ref));

// ---- no stale bridge-only prompt --------------------------------------
const staleFiles = ['opencode.json', 'README.md', 'PERFORMANCE-RESEARCH.md', 'UI-AUDIT.md', 'panel/AGENT.md'];
for (const file of staleFiles) {
  if (!exists(file, REPO)) continue;
  check(`${file} has no egglab_ping`, !read(file, REPO).includes('egglab_ping'));
}
check('root AGENT.md removed', !exists('AGENT.md', REPO));

// ---- root OpenCode config ---------------------------------------------
let rootConfig = null;
try {
  rootConfig = JSON.parse(read('opencode.json', REPO));
} catch (err) {
  check('root opencode.json parses', false, err.message);
}
if (rootConfig) {
  const prompt = rootConfig?.agent?.egglab?.prompt || '';
  const m = prompt.match(/\{file:\.\/(.+?)\}/);
  check('root prompt is a file reference', Boolean(m), prompt);
  if (m) check('root prompt file exists', exists(m[1], REPO), m[1]);
  const timeout = Number(rootConfig?.mcp?.egglab?.timeout) || 0;
  check('root MCP timeout', timeout >= 3_900_000, `${timeout} ms`);
}

// ---- generated config / download timeout chain ------------------------
const downloadDeadline = 3_600_000;
const mcpSource = read('mcp-server.mjs');
check(
  'download_models deadline',
  mcpSource.includes(`Date.now() + ${downloadDeadline.toLocaleString('en-US')}`) ||
    mcpSource.includes('Date.now() + 3_600_000'),
  '60 minutes',
);
const chatSource = read('service/chat.mjs');
const mcpTimeoutMatch = chatSource.match(/mcp:\s*\{[\s\S]*?timeout:\s*([0-9_]+)/);
const generatedTimeout = mcpTimeoutMatch ? Number(mcpTimeoutMatch[1].replace(/_/g, '')) : 0;
check('generated MCP timeout', generatedTimeout >= 3_900_000, `${generatedTimeout} ms`);
const settingsSource = read('service/settings.mjs');
const turnTimeout = Number((settingsSource.match(/timeoutSec:\s*(\d+)/) || [])[1]) || 0;
check('agent turn timeout', turnTimeout * 1000 >= 3_900_000, `${turnTimeout} s`);

console.log(`\n${failures ? 'FAILED' : 'OK'} — ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
