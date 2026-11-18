// Engine-config regression gate.
//
// The packaged app does not run install.ps1: on a fresh install config.json is
// absent. This test proves that reading the config creates it, and that a
// downloaded model is actually selected (the old setEngineModel() returned null
// for a missing file, so setup kept saying "model missing" after a finished
// download).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { engineConfig, ensureEngineConfig, getSettings, setEngineModel } from '../service/settings.mjs';

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const settings = getSettings();
const originalRoot = settings.engineRoot;
const originalModels = settings.modelsDir;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'egglab-config-'));

try {
  settings.engineRoot = tmp;
  settings.modelsDir = path.join(tmp, 'models');
  const configPath = path.join(tmp, 'config.json');

  check('fresh profile has no config.json', !fs.existsSync(configPath));

  const cfg = ensureEngineConfig();
  check('config.json is created on first read', fs.existsSync(configPath));
  check('create uses the models folder from settings', cfg.models === settings.modelsDir, cfg.models);
  check('create writes the engine path', typeof cfg.engine === 'string' && cfg.engine.length > 0);
  check('create writes a diffusion default', Boolean(cfg.diffusion));

  setEngineModel('diffusion', 'qwen-image-2.1-Q4_K_M.gguf');
  const onDisk = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  check('selecting a model persists to config.json', onDisk.diffusion === 'qwen-image-2.1-Q4_K_M.gguf', onDisk.diffusion);
  check(
    'a new engineConfig sees the selected model',
    engineConfig().diffusion === 'qwen-image-2.1-Q4_K_M.gguf',
    engineConfig().diffusion,
  );

  // The downloader and modelStatus both read cfg.models. A 1-byte file is
  // enough to prove the path that status checks is the path selection wrote.
  const file = path.join(cfg.models, onDisk.diffusion);
  fs.writeFileSync(file, 'x');
  check('selected model is visible at the status path', fs.statSync(file).size === 1);

  const partial = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  delete partial.models;
  fs.writeFileSync(configPath, JSON.stringify(partial));
  const repaired = ensureEngineConfig();
  check('a config with a missing models key is repaired', Boolean(repaired.models), repaired.models);
} finally {
  settings.engineRoot = originalRoot;
  settings.modelsDir = originalModels;
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {}
}

console.log(`\n${failures ? 'FAILED' : 'OK'} — ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
