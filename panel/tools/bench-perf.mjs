// Performance benchmark for Qwen-Image-2.1 on EggLab's 8 GB target.
//
// Compares engine builds (1091 vs 1106), backends (Vulkan vs CUDA),
// quantisations (fp8 vs Q4_K_M) and memory flags. Every run is a fresh
// sd-cli process, exactly like the app, so timings include model load.
//
//   node tools/bench-perf.mjs [all|engines|backends|flags|models|edits]
//
// Results are JSON lines; full engine logs stay in %TEMP%\egglab-perf.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MODELS = 'D:\\neww\\Models';
const OUT = path.join(os.tmpdir(), 'egglab-perf');
fs.mkdirSync(OUT, { recursive: true });

const FP8 = path.join(MODELS, 'qwen-image-2.1-UC-fp8.safetensors');
const Q4 = path.join(MODELS, 'qwen-image-2.1-Q4_K_M.gguf');
const VAE = path.join(MODELS, 'qwen_image_2.1_vae_bf16.safetensors');
const LLM = path.join(MODELS, 'Qwen3VL-8B-Uncensored-HauhauCS-Balanced-Q6_K.gguf');
const MMPROJ = path.join(MODELS, 'Qwen3VL-8B-Uncensored-HauhauCS-Balanced-mmproj-f16.gguf');
const TURBO = 'qwen_image_2.1_turbo_lora_avg_rank_178_bf16';
const REF = path.join(os.tmpdir(), 'ref-768-1.png');

const ENGINE_1091 = path.join(process.env.LOCALAPPDATA, 'EggLab', 'engine', 'sd', 'sd-cli.exe');
const ENGINE_1106 = path.join(os.tmpdir(), 'egglab-1106', 'sd', 'sd-cli.exe');
const CUDA_1091 = path.join(os.tmpdir(), 'egglab-cuda-engine', 'sd', 'sd-cli.exe');

const CURRENT = ['--offload-to-cpu', '--params-backend', 'cpu', '--max-vram', '-1'];
const NO_RESERVE = ['--offload-to-cpu', '--params-backend', 'cpu', '--max-vram', '-0.5'];
const AUTOFIT = ['--offload-to-cpu', '--max-vram', '-1'];

function freeVramGb() {
  try {
    const out = execFileSync('nvidia-smi', ['--query-gpu=memory.free', '--format=csv,noheader,nounits'], {
      windowsHide: true,
      timeout: 5000,
      encoding: 'utf8',
    });
    const mb = Number(String(out).split(/\r?\n/)[0].trim());
    return Number.isFinite(mb) ? Math.round((mb / 1024) * 10) / 10 : null;
  } catch {
    return null;
  }
}

const RUNS = {
  engines: [
    { label: '1091 vulkan q4 864x1152 t2i', engine: ENGINE_1091, model: Q4, w: 864, h: 1152, steps: 8, flags: CURRENT },
    { label: '1106 vulkan q4 864x1152 t2i', engine: ENGINE_1106, model: Q4, w: 864, h: 1152, steps: 8, flags: CURRENT },
    { label: '1091 vulkan fp8 864x1152 t2i', engine: ENGINE_1091, model: FP8, w: 864, h: 1152, steps: 8, flags: CURRENT },
    { label: '1106 vulkan fp8 864x1152 t2i', engine: ENGINE_1106, model: FP8, w: 864, h: 1152, steps: 8, flags: CURRENT },
  ],
  backends: [
    { label: '1091 vulkan q4 864x1152 t2i', engine: ENGINE_1091, model: Q4, w: 864, h: 1152, steps: 8, flags: CURRENT },
    { label: '1091 cuda q4 864x1152 t2i', engine: CUDA_1091, model: Q4, w: 864, h: 1152, steps: 8, flags: CURRENT },
    { label: '1091 cuda q4 sage 864x1152 t2i', engine: CUDA_1091, model: Q4, w: 864, h: 1152, steps: 8, flags: [...CURRENT, '--sage-attn'] },
    { label: '1091 vulkan fp8 864x1152 t2i', engine: ENGINE_1091, model: FP8, w: 864, h: 1152, steps: 8, flags: CURRENT },
    { label: '1091 cuda fp8 864x1152 t2i', engine: CUDA_1091, model: FP8, w: 864, h: 1152, steps: 8, flags: CURRENT },
  ],
  flags: [
    { label: 'flags q4 864x1152 current', engine: ENGINE_1091, model: Q4, w: 864, h: 1152, steps: 8, flags: CURRENT },
    { label: 'flags q4 864x1152 reserve05', engine: ENGINE_1091, model: Q4, w: 864, h: 1152, steps: 8, flags: NO_RESERVE },
    { label: 'flags q4 864x1152 autofit', engine: ENGINE_1091, model: Q4, w: 864, h: 1152, steps: 8, flags: AUTOFIT },
    { label: 'flags q4 1024x1024 current', engine: ENGINE_1091, model: Q4, w: 1024, h: 1024, steps: 8, flags: CURRENT },
    { label: 'flags q4 1024x1024 reserve05', engine: ENGINE_1091, model: Q4, w: 1024, h: 1024, steps: 8, flags: NO_RESERVE },
    { label: 'flags q4 1024x1024 autofit', engine: ENGINE_1091, model: Q4, w: 1024, h: 1024, steps: 8, flags: AUTOFIT },
  ],
  models: [
    { label: 'models q4 512x512', engine: ENGINE_1091, model: Q4, w: 512, h: 512, steps: 8, flags: CURRENT },
    { label: 'models fp8 512x512', engine: ENGINE_1091, model: FP8, w: 512, h: 512, steps: 8, flags: CURRENT },
    { label: 'models q4 1024x1024', engine: ENGINE_1091, model: Q4, w: 1024, h: 1024, steps: 8, flags: CURRENT },
    { label: 'models fp8 1024x1024', engine: ENGINE_1091, model: FP8, w: 1024, h: 1024, steps: 8, flags: CURRENT },
  ],
  edits: [
    { label: 'edits q4 864x1152 1ref current', engine: ENGINE_1091, model: Q4, w: 864, h: 1152, steps: 8, flags: [...CURRENT, '--vae-tiling', '--model-args', 'qwen_image_2_1_prefix_cache_type=q8_0'], refs: 1 },
    { label: 'edits fp8 864x1152 1ref current', engine: ENGINE_1091, model: FP8, w: 864, h: 1152, steps: 8, flags: [...CURRENT, '--vae-tiling', '--model-args', 'qwen_image_2_1_prefix_cache_type=q8_0'], refs: 1 },
    { label: 'edits q4 864x1152 1ref no-prefix-q8', engine: ENGINE_1091, model: Q4, w: 864, h: 1152, steps: 8, flags: [...CURRENT, '--vae-tiling'], refs: 1 },
  ],
};

const which = process.argv[2] || 'all';
const only = process.env.BENCH_ONLY || '';
const runs = (which === 'all' ? Object.values(RUNS).flat() : RUNS[which] || []).filter(
  (run) => !only || run.label.includes(only),
);
if (!runs.length) {
  console.error(`usage: node tools/bench-perf.mjs [all|${Object.keys(RUNS).join('|')}]`);
  process.exit(2);
}
if (!fs.existsSync(REF)) {
  console.error(`missing reference image: ${REF}`);
  process.exit(2);
}

function runOne(run) {
  return new Promise((resolve) => {
    for (const file of [run.engine, run.model, VAE, LLM, MMPROJ]) {
      if (!fs.existsSync(file)) {
        console.log(JSON.stringify({ label: run.label, error: `missing ${file}` }));
        return resolve();
      }
    }
    const slug = run.label.replace(/[^a-z0-9]+/gi, '-');
    const out = path.join(OUT, `${slug}.png`);
    const logFile = path.join(OUT, `${slug}.log`);
    try {
      fs.rmSync(out, { force: true });
    } catch {}

    const args = [
      '--diffusion-model', run.model,
      '--vae', VAE,
      '--llm', LLM,
      '--llm_vision', MMPROJ,
      '--lora-model-dir', MODELS,
      '-p', `a studio group portrait, cinematic light<lora:${TURBO}:1>`,
      '--cfg-scale', '1',
      '--sampling-method', 'euler',
      '--steps', String(run.steps),
      '--seed', '42',
      '-W', String(run.w),
      '-H', String(run.h),
      '--sigmas', 'qwen-image-2.1-turbo',
      ...run.flags,
      '-o', out,
    ];
    for (let i = 0; i < (run.refs || 0); i++) args.push('-r', REF);

    const started = Date.now();
    const freeBefore = freeVramGb();
    console.log(`>>> ${run.label} (free VRAM ${freeBefore} GB)`);
    const child = spawn(run.engine, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = [];
    child.stdout.on('data', (c) => chunks.push(c));
    child.stderr.on('data', (c) => chunks.push(c));
    const timer = setTimeout(() => {
      try {
        spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true });
      } catch {}
    }, 360000);
    child.on('exit', (code) => {
      clearTimeout(timer);
      const text = Buffer.concat(chunks).toString('utf8');
      fs.writeFileSync(logFile, text, 'utf8');
      const lines = text.split(/\r?\n/);
      const numberAfter = (re) => {
        const line = lines.find((l) => re.test(l));
        const m = line && line.match(/([0-9.]+)s/);
        return m ? Number(m[1]) : null;
      };
      const stepTimes = [...text.matchAll(/([0-9.]+)s\/it/g)].map((m) => Number(m[1]));
      const steady = stepTimes.length > 2 ? stepTimes.slice(1, -1) : stepTimes;
      const avgStep = steady.length
        ? Math.round((steady.reduce((a, b) => a + b, 0) / steady.length) * 100) / 100
        : null;
      const result = {
        label: run.label,
        engine: path.basename(path.dirname(path.dirname(run.engine))),
        model: path.basename(run.model),
        size: `${run.w}x${run.h}`,
        refs: run.refs || 0,
        seconds: Math.round((Date.now() - started) / 1000),
        exit: code,
        output: fs.existsSync(out),
        avgStep,
        conditionSec: numberAfter(/get_learned_condition completed/),
        encodeSec: numberAfter(/encode_first_stage completed/),
        freeBefore,
        freeAfter: freeVramGb(),
        log: logFile,
      };
      console.log(JSON.stringify(result));
      resolve();
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      console.log(JSON.stringify({ label: run.label, error: err.message }));
      resolve();
    });
  });
}

for (const run of runs) await runOne(run);
console.log('done');
