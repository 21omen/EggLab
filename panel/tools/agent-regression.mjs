// Agent contract gate — runs on every push and before every release.
//
// It does not call a model (CI has no provider credentials); it validates the
// things that broke silently: the 24 benchmark cases, every skill they name,
// every egglab_* tool they mention, the root OpenCode config, and the timeout
// chain for long model downloads.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

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

// ---- manifest ----------------------------------------------------------
let manifest = null;
try {
  manifest = yaml.load(read('manifest.yaml'));
  check('manifest parses', Boolean(manifest?.skills?.length), `${manifest?.skills?.length || 0} skills`);
} catch (err) {
  check('manifest parses', false, err.message);
}
if (manifest) {
  for (const entry of manifest.references || []) {
    check(`manifest reference ${entry}`, exists(entry), entry);
  }
  for (const skill of manifest.skills || []) {
    for (const ref of skill.references || []) {
      check(`manifest ${skill.name} reference ${ref}`, exists(ref), ref);
    }
  }
  const byName = new Map((manifest.skills || []).map((s) => [s.name, s]));
  for (const [skill, refs] of [
    ['image-generation', ['references/research/local/qwen-image-2.1-features.md']],
    [
      'reference-editing',
      [
        'references/research/local/qwen-image-2.1-features.md',
        'references/research/local/qwen-seamless-local-edit.md',
      ],
    ],
    ['transparency', ['references/research/local/qwen-image-2.1-features.md']],
  ]) {
    for (const ref of refs) {
      check(`${skill} loads ${path.basename(ref)}`, (byName.get(skill)?.references || []).includes(ref));
    }
  }
}

// ---- benchmark cases ---------------------------------------------------
const caseText = read('evals/benchmark-cases.yaml');
let benchmarkYaml = null;
try {
  benchmarkYaml = yaml.load(caseText);
  check('benchmark YAML parses', Boolean(benchmarkYaml?.cases?.length), `${benchmarkYaml?.cases?.length || 0} cases`);
} catch (err) {
  check('benchmark YAML parses', false, err.message);
}
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

// ---- agent-upgrade cases ----------------------------------------------
const upgradeText = read('evals/agent-upgrade-cases.yaml');
let upgradeYaml = null;
try {
  upgradeYaml = yaml.load(upgradeText);
  check('agent-upgrade YAML parses', Boolean(upgradeYaml?.cases?.length), `${upgradeYaml?.cases?.length || 0} cases`);
} catch (err) {
  check('agent-upgrade YAML parses', false, err.message);
}
const upgradeBlocks = [];
let upgradeCurrent = null;
for (const line of upgradeText.split(/\r?\n/)) {
  const m = line.match(/^\s{2}- id:\s*(\S+)/);
  if (m) {
    upgradeCurrent = { id: m[1], lines: [line] };
    upgradeBlocks.push(upgradeCurrent);
  } else if (upgradeCurrent) {
    upgradeCurrent.lines.push(line);
  }
}
check('agent-upgrade case count', upgradeBlocks.length >= 10, `${upgradeBlocks.length} cases`);
const allIds = [...ids, ...upgradeBlocks.map((c) => c.id)];
check('all case ids unique', new Set(allIds).size === allIds.length, `${allIds.length} total`);

const TASK_TOOL = {
  text_to_image: 'generate',
  instruction_edit: 'edit',
  marked_edit: 'photocraft_edit_active',
  mask_edit: 'photocraft_edit_active',
  sketch_edit: 'edit',
  multi_reference: 'edit',
  transparent_generate: 'generate',
  transparent_edit: 'edit',
  typography: 'generate',
  storyboard: 'generate',
  panorama: 'generate',
};
for (const block of upgradeBlocks) {
  const text = block.lines.join('\n');
  const task = (text.match(/\btask:\s*(\S+)/) || [])[1];
  const tool = (text.match(/\bexpected_tool:\s*(\S+)/) || [])[1];
  const primary = (text.match(/\bprimary_skill:\s*(\S+)/) || [])[1];
  const supports = ((text.match(/\bsupporting_skills:\s*\[([^\]]*)\]/) || [])[1] || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const includes = ((text.match(/\bprompt_must_include:\s*\[([^\]]*)\]/) || [])[1] || '')
    .split(',')
    .map((s) => s.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
  check(`upgrade ${block.id} task`, Boolean(task && TASK_TOOL[task]), task || 'missing');
  check(`upgrade ${block.id} expected tool`, Boolean(tool) && toolNames.has(tool), tool || 'missing');
  if (task && TASK_TOOL[task]) {
    check(`upgrade ${block.id} task/tool`, tool === TASK_TOOL[task], `${task} -> ${tool}`);
  }
  check(`upgrade ${block.id} primary skill`, Boolean(primary) && skillNames.has(primary), primary || 'missing');
  for (const skill of supports) check(`upgrade ${block.id} skill ${skill}`, skillNames.has(skill));
  check(`upgrade ${block.id} prompt evidence`, includes.length > 0, `${includes.length} requirements`);
  if (task === 'mask_edit') {
    check(`upgrade ${block.id} mask_layer arg`, /tool_args:\s*\{[^}]*mask_layer:/.test(text));
  }
  if (task === 'marked_edit') {
    check(`upgrade ${block.id} annotation language`, includes.some((s) => /annotation|mark/i.test(s)));
  }
  if (task === 'multi_reference') {
    check(`upgrade ${block.id} image tags`, includes.includes('<image1>') && includes.includes('<image2>'));
  }
  if (task === 'transparent_generate' || task === 'transparent_edit') {
    check(`upgrade ${block.id} alpha language`, includes.some((s) => /alpha|transparent/i.test(s)));
  }
}

// ---- prompt/tool references -------------------------------------------
const promptFiles = [
  'AGENT.md',
  'ROUTER.md',
  'manifest.yaml',
  'evals/benchmark-cases.yaml',
  'evals/agent-upgrade-cases.yaml',
];
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
check('OpenCode v2 uses a private server', /if \(major >= 2\) args\.push\('--standalone'\)/.test(chatSource));
check('Stop has a settle watchdog', /current\.finish\?\.\(-1\)/.test(chatSource));
check('Stop covers the retry gap', /let turnRunning/.test(chatSource) && /turnStopped/.test(chatSource));
check('Retry wait aborts on Stop', /if \(turnStopped\) return false/.test(chatSource));
check('Busy includes the retry gap', /Boolean\(active \|\| turnRunning\)/.test(chatSource));
const mainSource = read('main.mjs');
const httpSource = read('service/http.mjs');
const modelsSource = read('service/models.mjs');
check('IPC Stop cancels agent downloads', /cancelAgentDownloads\(\)/.test(mainSource));
check('HTTP Stop cancels agent downloads', /cancelAgentDownloads\(\)/.test(httpSource));
check('agent downloads are tagged', /source:\s*'agent'/.test(read('mcp-server.mjs')));
check('agent download cancel helper exists', /export function cancelAgentDownloads/.test(modelsSource));
const mcpTimeoutMatch = chatSource.match(/mcp:\s*\{[\s\S]*?timeout:\s*([0-9_]+)/);
const generatedTimeout = mcpTimeoutMatch ? Number(mcpTimeoutMatch[1].replace(/_/g, '')) : 0;
check('generated MCP timeout', generatedTimeout >= 3_900_000, `${generatedTimeout} ms`);
const settingsSource = read('service/settings.mjs');
const turnTimeout = Number((settingsSource.match(/timeoutSec:\s*(\d+)/) || [])[1]) || 0;
check('agent turn timeout', turnTimeout * 1000 >= 3_900_000, `${turnTimeout} s`);

console.log(`\n${failures ? 'FAILED' : 'OK'} — ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
