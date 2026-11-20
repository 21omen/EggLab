#!/usr/bin/env node
/*
  EggLab - local Qwen-Image-2.1 runner, Node edition of egglab.ps1.

  Used by the panel on platforms without PowerShell (Linux). It takes the
  same parameter names as egglab.ps1 so the panel builds one argument list
  for both, and it can be run by hand:

    node egglab-run.mjs "a neon sign that reads EGGLAB, rainy night"
    node egglab-run.mjs "change the text to NEON CAT" -Image ./photo.png
    node egglab-run.mjs "a neon sign that reads EGGLAB" -Turbo

  Options: -Width -Height -Steps -Cfg -Seed -Method -Out -Config -PromptFile
           -Image (repeatable) -ImageFile -InitImg -Mask -Strength -ImgCfg
           -MaxVram -NoOffload -Cpu -Turbo -TeCpu -VaeTiling
*/
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SD_CLI = process.platform === 'win32' ? 'sd-cli.exe' : 'sd-cli';

const SWITCHES = new Set(['noOffload', 'cpu', 'turbo', 'open', 'teCpu', 'vaeTiling']);
const ALIASES = { p: 'prompt', r: 'image', ref: 'image', o: 'out' };

function parseArgs(argv) {
  const opts = { image: [] };
  const given = new Set();
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const m = /^-{1,2}([A-Za-z][A-Za-z0-9]*)$/.exec(arg);
    if (!m) {
      positional.push(arg);
      continue;
    }
    let key = m[1].charAt(0).toLowerCase() + m[1].slice(1);
    key = ALIASES[key] || key;
    given.add(key);
    if (SWITCHES.has(key)) {
      opts[key] = true;
      continue;
    }
    const value = argv[++i];
    if (value === undefined) throw new Error(`Missing value for ${arg}`);
    if (key === 'image') opts.image.push(value);
    else opts[key] = value;
  }
  if (!opts.prompt && positional.length) opts.prompt = positional.join(' ');
  return { opts, given };
}

/** Natural size of a PNG or JPEG without decoding it. */
function imageDims(file) {
  try {
    const buf = fs.readFileSync(file);
    if (buf.length < 24) return null;
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) { i += 1; continue; }
        const marker = buf[i + 1];
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        }
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
        i += 2 + buf.readUInt16BE(i + 2);
      }
    }
  } catch {}
  return null;
}

const num = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function main() {
  const { opts, given } = parseArgs(process.argv.slice(2));

  const configPath = opts.config ? path.resolve(opts.config) : path.join(ROOT, 'config.json');
  if (!fs.existsSync(configPath)) throw new Error(`config.json not found at ${configPath}. Open EggLab's setup first.`);
  const conf = JSON.parse(fs.readFileSync(configPath, 'utf8').replace(/^﻿/, ''));
  const defaults = conf.defaults || {};

  let images = opts.image;
  if (!images.length && opts.imageFile) {
    if (!fs.existsSync(opts.imageFile)) throw new Error(`Image list file not found: ${opts.imageFile}`);
    images = fs.readFileSync(opts.imageFile, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  }
  const autoSize = images.length > 0 && !given.has('width') && !given.has('height');

  let width = num(opts.width, 0);
  let height = num(opts.height, 0);
  let steps = num(opts.steps, 0);
  let cfg = num(opts.cfg, 0);
  let seed = num(opts.seed, -1);
  let method = opts.method || '';
  const stepsGiven = steps > 0;
  const cfgGiven = cfg > 0;

  if (width <= 0) width = num(defaults.width, 1024);
  if (height <= 0) height = num(defaults.height, 1024);
  if (steps <= 0) steps = num(defaults.steps, 40);
  if (cfg <= 0) cfg = num(defaults.cfg, 1);
  if (!method) method = String(defaults.method || 'euler');
  const noOffload = given.has('noOffload') ? true : defaults.offload === false;

  // Turbo LoRA is distilled for a fixed 8-step schedule at CFG 1.
  if (opts.turbo) {
    const turboSteps = num(conf.turbo?.steps, 8) || 8;
    const turboCfg = num(conf.turbo?.cfg, 1) || 1;
    if (stepsGiven && steps !== turboSteps) console.warn(`Turbo uses a fixed ${turboSteps}-step schedule; ignoring -Steps ${steps}.`);
    if (cfgGiven && Math.abs(cfg - turboCfg) > 0.001) console.warn(`Turbo is trained for CFG ${turboCfg}; ignoring -Cfg ${cfg}.`);
    steps = turboSteps;
    cfg = turboCfg;
  }

  if (autoSize) {
    const dims = imageDims(images[0]);
    if (dims && dims.width > 0 && dims.height > 0) {
      const scale = Math.min(1, 1024 / Math.max(dims.width, dims.height));
      width = Math.round((dims.width * scale) / 32) * 32;
      height = Math.round((dims.height * scale) / 32) * 32;
    } else {
      console.log('Could not read reference image size, using defaults.');
    }
  }
  // Qwen-Image-2.1 needs both dimensions divisible by 32.
  width = Math.max(256, Math.round(width / 32) * 32);
  height = Math.max(256, Math.round(height / 32) * 32);

  let prompt = opts.prompt || '';
  if (opts.promptFile) {
    if (!fs.existsSync(opts.promptFile)) throw new Error(`Prompt file not found: ${opts.promptFile}`);
    prompt = fs.readFileSync(opts.promptFile, 'utf8').replace(/^﻿/, '');
  }
  if (!prompt.trim()) throw new Error('A prompt is required.');

  const engine = path.join(conf.engine, SD_CLI);
  if (!fs.existsSync(engine)) throw new Error(`Engine not found at ${engine}. Install it in EggLab's setup.`);

  // A role may be a bare file name, a path relative to the models folder, or a
  // full path the user chose (models kept outside EggLab). Downloads land in a
  // role subfolder (diffusion/, vae/, ...), so a bare name is also looked up
  // there, like the panel's resolveModelPath().
  const ROLE_FOLDERS = { diffusion: 'diffusion', vae: 'vae', llm: 'text_encoder', llmVision: 'vision', turbo: 'lora' };
  const model = (name, role) => {
    if (!name) throw new Error(`No model configured for ${role}.\nPick it in EggLab's Models card.`);
    if (path.isAbsolute(name)) {
      if (!fs.existsSync(name)) throw new Error(`Model not found: ${name}\nDownload it in EggLab's Models card.`);
      return name;
    }
    const direct = path.join(conf.models, name);
    if (fs.existsSync(direct)) return path.resolve(direct);
    const folder = ROLE_FOLDERS[role];
    const nested = folder ? path.join(conf.models, folder, path.basename(name)) : '';
    if (nested && fs.existsSync(nested)) return path.resolve(nested);
    throw new Error(`Model not found: ${direct}\nDownload it in EggLab's Models card.`);
  };
  const diffusion = model(conf.diffusion, 'diffusion');
  const vae = model(conf.vae, 'vae');
  const llm = model(conf.llm, 'llm');
  let llmVision = null;
  if (images.length) {
    llmVision = model(conf.llmVision, 'llmVision');
    for (const img of images) if (!fs.existsSync(img)) throw new Error(`Reference image not found: ${img}`);
  }

  if (seed < 0) seed = Math.floor(Math.random() * 2147483647);

  let out = opts.out;
  if (!out) {
    const dir = path.join(ROOT, 'out');
    fs.mkdirSync(dir, { recursive: true });
    out = path.join(dir, `egglab-${stamp()}.png`);
  } else {
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  }

  const args = ['--diffusion-model', diffusion, '--vae', vae, '--llm', llm];
  // The engine picks LoRAs from prompt tags, so Turbo is appended to the prompt.
  let promptText = prompt;
  if (opts.turbo) {
    const loraPath = model(conf.turbo?.lora || 'qwen_image_2.1_turbo_lora_avg_rank_178_bf16.safetensors', 'turbo');
    const loraName = path.basename(loraPath).replace(/\.[^.]+$/, '');
    args.push('--lora-model-dir', conf.turbo?.dir ? String(conf.turbo.dir) : path.dirname(loraPath));
    promptText = `${prompt}<lora:${loraName}:1>`;
  }
  if (llmVision) args.push('--llm_vision', llmVision);
  for (const img of images) args.push('-r', path.resolve(img));
  if (opts.initImg) args.push('-i', path.resolve(opts.initImg));
  if (opts.mask) args.push('--mask', path.resolve(opts.mask));
  const strength = num(opts.strength, -1);
  const imgCfg = num(opts.imgCfg, -1);
  if (strength >= 0) args.push('--strength', String(strength));
  if (imgCfg >= 0) args.push('--img-cfg-scale', String(imgCfg));
  args.push(
    '-p', promptText,
    '--cfg-scale', String(cfg),
    '--sampling-method', method,
    '--steps', String(steps),
    '--seed', String(seed),
    '-W', String(width),
    '-H', String(height),
  );
  if (opts.turbo) args.push('--sigmas', 'qwen-image-2.1-turbo');
  if (opts.cpu) {
    args.push('--backend', 'cpu');
  } else {
    if (!noOffload) args.push('--offload-to-cpu');
    if (opts.teCpu) args.push('--backend', 'te=cpu');
    const maxVram = num(opts.maxVram, 0);
    if (maxVram !== 0) args.push('--params-backend', 'cpu', '--max-vram', String(Math.trunc(maxVram)));
    if (opts.vaeTiling) args.push('--vae-tiling');
  }
  // Editing needs the text + reference KV cache; the 8-bit cache keeps prefix
  // caching enabled on small cards.
  if (images.length) args.push('--model-args', 'qwen_image_2_1_prefix_cache_type=q8_0');
  args.push('-o', out);

  console.log('');
  console.log('EggLab - Qwen-Image-2.1');
  console.log(`  mode   : ${images.length ? `edit (${images.length} ref)` : 'text to image'}${opts.turbo ? '   turbo: 8-step LoRA' : ''}`);
  console.log(`  size   : ${width}x${height}   steps: ${steps}   cfg: ${cfg}   seed: ${seed}`);
  console.log(`  output : ${out}`);
  console.log('');

  const started = Date.now();
  const child = spawn(engine, args, { stdio: 'inherit' });
  // Forward a stop to the engine, so killing the runner never leaves sd-cli
  // holding VRAM.
  for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
    process.on(sig, () => {
      try {
        child.kill('SIGKILL');
      } catch {}
      process.exit(1);
    });
  }
  const code = await new Promise((resolve) => {
    child.on('exit', (c) => resolve(c ?? 1));
    child.on('error', (err) => {
      console.error(err.message);
      resolve(1);
    });
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (!fs.existsSync(out)) {
    throw new Error(`Generation failed (exit ${code}, ${seconds}s). See the engine output above.`);
  }
  console.log(`Done in ${seconds}s -> ${out}`);
}

// Like egglab.ps1: a written output file is success, whatever sd-cli's exit
// code was (it can exit non-zero after a successful save).
main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err.message || String(err));
    process.exit(1);
  });
