// Setup/install contract gate. Runs on Windows CI with the agent gate.
// It catches drift between the installer, the shared engine downloader, the
// first-run wizard and the packaged resources without downloading anything.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PANEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(PANEL, '..');
const read = (rel, base = REPO) => fs.readFileSync(path.join(base, rel), 'utf8');
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

// ---- installer entry point --------------------------------------------
const install = read('install.ps1');
check('install.ps1 uses shared engine downloader', /engine-install\.ps1/.test(install));
check('install.ps1 has no old engine pin', !/master-1028|37bc88b/.test(install));
check('install.ps1 defaults are per-user, not D:\\EggLab', !/engine = 'D:\\EggLab/.test(install));
check('install.ps1 passes auto variant', /Variant\s*=\s*'auto'/.test(install));
check('install.ps1 writes engine path after install', /engineParent/.test(install) && /engine\s*=\s*Join-Path/.test(install));

// ---- engine downloader -------------------------------------------------
const engine = read('panel/build/engine-install.ps1');
const pin = (engine.match(/\$release\s*=\s*'([^']+)'/) || [])[1] || '';
check('engine pin is present', /^master-\d+-[a-f0-9]+$/.test(pin), pin);
check('engine pin matches app test build', pin === 'master-1091-b9d7176', pin);
check('engine hashes are pinned', /sha256\s*=\s*'[a-f0-9]{64}'/.test(engine));
check('engine auto variant ladder', /Resolve-Variant/.test(engine) && /vulkan/.test(engine) && /cpu/.test(engine));

// ---- NSIS installer ----------------------------------------------------
const nsis = read('panel/build/installer.nsh');
check('installer free-space handles fresh vs update', /3221225472/.test(nsis) && /1610612736/.test(nsis));
check('installer runs shared engine installer', /engine-install\.ps1/.test(nsis));
check('installer kills app before upgrade', /taskkill \/IM "EggLab\.exe"/.test(nsis));
check('uninstall kills engine before removing files', /taskkill \/IM "sd-cli\.exe"/.test(nsis));
check('update keeps engine', /\$\{isUpdated\}/.test(nsis));

// ---- first-run setup ---------------------------------------------------
const setup = read('panel/service/setup.mjs');
check('setup repairs stale config engine path', /writeJson\(cfg\.path,\s*cfg\.raw\)/.test(setup));
check('setup rejects OpenCode v1 as ready', /version\[0\]\s*<\s*2/.test(setup));
check('setup requires downloaded OpenCode v2', /requires v2 or newer/.test(setup));
check('setup has curl fallback for GitHub assets', /downloadWithCurl/.test(setup) && /ssl-no-revoke/.test(setup));
check('setup has stalled-download timeout', /AbortController/.test(setup) && /120000/.test(setup));

// ---- engine config is self-initializing -------------------------------
// A packaged install has no install.ps1 step, so config.json starts missing.
// Selecting a downloaded variant used to be a silent no-op in that state and
// setup reported "model missing" forever.
const settingsSource = read('panel/service/settings.mjs');
check(
  'missing config.json is created on first run',
  /export function ensureEngineConfig/.test(settingsSource) &&
    /writeJson\(cfgPath,\s*raw\)/.test(settingsSource),
);
check(
  'model selection writes config instead of no-op',
  /export function setEngineModel/.test(settingsSource) &&
    !/if \(!cfg\.raw\) return null/.test(settingsSource) &&
    /ensureEngineConfig\(\)/.test(settingsSource),
);
check(
  'config.json is the models-folder authority',
  /settings\.modelsDir !== raw\.models/.test(settingsSource),
);
check(
  'fresh settings default to a bundled OpenCode provider',
  /model: 'opencode-go\//.test(settingsSource) && !/model: 'inferx\//.test(settingsSource),
);
check('setup status exposes the config path', /config:\s*cfg\.path/.test(setup));
const mainSource = read('main.mjs', PANEL);
const httpSource = read('service/http.mjs', PANEL);
check(
  'detect rebuilds agent workspace',
  /refreshDetection[\s\S]{0,400}buildWorkspace/.test(mainSource) &&
    /refreshDetection[\s\S]{0,400}buildWorkspace/.test(httpSource),
);

// ---- packaged resources ------------------------------------------------
const pkg = JSON.parse(read('panel/package.json'));
const resources = pkg.build?.extraResources || [];
const hasResource = (from, to) => resources.some((r) => r.from === from && r.to === to);
check('packages engine-install.ps1', hasResource('build/engine-install.ps1', 'engine-install.ps1'));
check('packages knowledge', hasResource('skills', 'knowledge/skills') && hasResource('references', 'knowledge/references'));
check('packages evals', hasResource('evals', 'knowledge/evals'));
const rendererSource = read('renderer/app.js', PANEL);
check(
  'setup offers the PhotoCraft download link',
  /get-pc/.test(rendererSource) && /getartcraft\.com/.test(rendererSource),
);
check('README links to PhotoCraft', /getartcraft\.com/.test(read('README.md')));
check('package declares the MIT license', pkg.license === 'MIT');
check(
  'Windows signing is configured',
  pkg.build?.win?.signtoolOptions?.signingHashAlgorithms?.includes('sha256') &&
    Boolean(pkg.build?.win?.signtoolOptions?.rfc3161TimeStampServer),
);
check(
  'signing guide is linked',
  fs.existsSync(path.join(REPO, 'docs/SIGNING.md')) && /docs\/SIGNING\.md/.test(read('README.md')),
);
const releaseWorkflow = read('.github/workflows/release.yml');
check(
  'release workflow accepts signing secrets and verifies the signature',
  /WIN_CSC_LINK/.test(releaseWorkflow) && /Get-AuthenticodeSignature/.test(releaseWorkflow),
);
check(
  'model roles accept absolute paths',
  /export function resolveModelPath/.test(settingsSource) && /IsPathRooted/.test(read('egglab.ps1')),
);
check(
  'setup can choose an existing models folder',
  /export function setModelsFolder/.test(settingsSource) && /use-models-folder/.test(rendererSource),
);
check(
  'setup can choose existing model files',
  /export function setModelFile/.test(settingsSource) && /choose-model-files/.test(rendererSource),
);
check(
  'OpenCode report reads paths, auth and models',
  /opencodeDebugPaths/.test(settingsSource) &&
    /opencodeAuthList/.test(settingsSource) &&
    /--standalone/.test(settingsSource),
);
check(
  'setup can select an existing OpenCode binary',
  /export function setOpenCodePath/.test(settingsSource) && /use-opencode/.test(rendererSource),
);
check(
  'preload exposes model and OpenCode actions',
  /setModelsFolder/.test(read('preload.cjs', PANEL)) &&
    /opencodeReport/.test(read('preload.cjs', PANEL)) &&
    /setOpenCode/.test(read('preload.cjs', PANEL)),
);
check(
  'models have role subfolders and dropdowns',
  /ROLE_FOLDERS/.test(settingsSource) &&
    /text_encoder/.test(settingsSource) &&
    /data-role-select/.test(rendererSource) &&
    /roleDir\(cfg, entry\.key\)/.test(read('panel/service/models.mjs')),
);

// ---- PowerShell parse (Windows only) ----------------------------------
function parsePs1(file) {
  if (process.platform !== 'win32') return true;
  const script = `$t=$null; $e=$null; [System.Management.Automation.Language.Parser]::ParseFile('${file.replace(/'/g, "''")}',[ref]$t,[ref]$e)|Out-Null; if($e){ $e|ForEach-Object{$_.Message}; exit 1 }`;
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    windowsHide: true,
    encoding: 'utf8',
    timeout: 30000,
  });
  check(`PowerShell parses ${path.basename(file)}`, r.status === 0, (r.stdout || r.stderr || '').trim().slice(0, 300));
  return r.status === 0;
}
parsePs1(path.join(REPO, 'install.ps1'));
parsePs1(path.join(PANEL, 'build', 'engine-install.ps1'));

console.log(`\n${failures ? 'FAILED' : 'OK'} — ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
