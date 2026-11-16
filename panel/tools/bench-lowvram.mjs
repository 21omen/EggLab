// Low-VRAM benchmark harness for the pinned engine builds.
//
// Runs the same 4-reference edit through a matrix of engine builds, model
// quantizations and memory flags, and prints one JSON line per run plus full
// logs in %TEMP%. Used to tune EggLab's memory plan (P0) and to compare the
// Vulkan build with the pinned CUDA build.
//
//   node tools/bench-lowvram.mjs p0     # fp8 + Vulkan, free-aware budget
//   node tools/bench-lowvram.mjs q4     # Q4_K_M + Vulkan
//   node tools/bench-lowvram.mjs cuda   # Q4_K_M + CUDA
//   node tools/bench-lowvram.mjs all
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MODELS = 'D:\\neww\\Models';
const REFS = [1, 2, 3, 4].map((n) => path.join(os.tmpdir(), `ref-768-${n}.png`));
const FP8 = path.join(MODELS, 'qwen-image-2.1-UC-fp8.safetensors');
const Q4 = path.join(MODELS, 'qwen-image-2.1-Q4_K_M.gguf');
const VAE = path.join(MODELS, 'qwen_image_2.1_vae_bf16.safetensors');
const LLM = path.join(MODELS, 'Qwen3VL-8B-Uncensored-HauhauCS-Balanced-Q6_K.gguf');
const MMPROJ = path.join(MODELS, 'Qwen3VL-8B-Uncensored-HauhauCS-Balanced-mmproj-f16.gguf');
const TURBO = 'qwen_image_2.1_turbo_lora_avg_rank_178_bf16';

const PACKAGED = path.join(process.env.LOCALAPPDATA, 'EggLab', 'engine', 'sd', 'sd-cli.exe');
const CUDA = path.join(os.tmpdir(), 'egglab-cuda-engine', 'sd', 'sd-cli.exe');

const P0_FLAGS = ['--offload-to-cpu', '--params-backend', 'cpu', '--max-vram', '-1', '--vae-tiling'];
const OLD_FLAGS = ['--offload-to-cpu', '--params-backend', 'cpu', '--max-vram', '7'];

const RUNS = {
  p0: [
    { label: 'Vulkan fp8 1024x1280 p0', engine: PACKAGED, model: FP8, w: 1024, h: 1280, flags: P0_FLAGS },
    { label: 'Vulkan fp8 1024x1280 p0-budget2', engine: PACKAGED, model: FP8, w: 1024, h: 1280, flags: ['--offload-to-cpu', '--params-backend', 'cpu', '--max-vram', '-2', '--vae-tiling'] },
    { label: 'Vulkan fp8 928x1408 p0', engine: PACKAGED, model: FP8, w: 928, h: 1408, flags: P0_FLAGS },
    { label: 'Vulkan fp8 1024x1280 old-budget', engine: PACKAGED, model: FP8, w: 1024, h: 1280, flags: OLD_FLAGS },
  ],
  q4: [
    { label: 'Vulkan q4 1024x1280 p0', engine: PACKAGED, model: Q4, w: 1024, h: 1280, flags: P0_FLAGS },
    { label: 'Vulkan q4 1280x1600 p0', engine: PACKAGED, model: Q4, w: 1280, h: 1600, flags: P0_FLAGS },
  ],
  cuda: [
    { label: 'CUDA q4 1024x1280 p0', engine: CUDA, model: Q4, w: 1024, h: 1280, flags: P0_FLAGS },
    { label: 'CUDA fp8 1024x1280 p0', engine: CUDA, model: FP8, w: 1024, h: 1280, flags: P0_FLAGS },
  ],
};

const which = process.argv[2] || 'all';
const only = process.env.BENCH_ONLY || '';
const runs = (which === 'all' ? [...RUNS.p0, ...RUNS.q4, ...RUNS.cuda] : RUNS[which] || []).filter(
  (run) => !only || run.label.includes(only),
);
if (!runs.length) {
  console.error('usage: node tools/bench-lowvram.mjs [p0|q4|cuda|all]');
  process.exit(2);
}

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

function runOne(run) {
  return new Promise((resolve) => {
    // Guard against benchmarking the wrong backend: the installer's fallback
    // ladder can leave a Vulkan build in a folder meant for CUDA.
    const dir = path.dirname(run.engine);
    const wantsCuda = run.label.startsWith('CUDA');
    const backendOk = wantsCuda ? fs.existsSync(path.join(dir, 'ggml-cuda.dll')) : fs.existsSync(path.join(dir, 'ggml-vulkan.dll'));
    if (!backendOk) {
      console.log(JSON.stringify({ label: run.label, error: `wrong backend in ${dir} (missing ${wantsCuda ? 'ggml-cuda.dll' : 'ggml-vulkan.dll'})` }));
      return resolve();
    }
    for (const file of [run.engine, run.model, VAE, LLM, MMPROJ, ...REFS]) {
      if (!fs.existsSync(file)) {
        console.log(JSON.stringify({ label: run.label, error: `missing ${file}` }));
        return resolve();
      }
    }
    const out = path.join(os.tmpdir(), `bench-${run.label.replace(/[^a-z0-9]+/gi, '-')}.png`);
    const logFile = path.join(os.tmpdir(), `bench-${run.label.replace(/[^a-z0-9]+/gi, '-')}.log`);
    try {
      fs.rmSync(out, { force: true });
    } catch {}
    const args = [
      '--diffusion-model', run.model,
      '--vae', VAE,
      '--llm', LLM,
      '--llm_vision', MMPROJ,
      '--lora-model-dir', MODELS,
      '-p', `a studio group portrait of these people together<lora:${TURBO}:1>`,
      '--cfg-scale', '1',
      '--sampling-method', 'euler',
      '--steps', '8',
      '--seed', '42',
      '-W', String(run.w),
      '-H', String(run.h),
      '--sigmas', 'qwen-image-2.1-turbo',
      ...run.flags,
      '-o', out,
    ];
    for (const ref of REFS) args.push('-r', ref);
    const started = Date.now();
    const freeBefore = freeVramGb();
    console.log(`>>> ${run.label} (free VRAM ${freeBefore} GB)`);
    const child = spawn(run.engine, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = [];
    child.stdout.on('data', (c) => chunks.push(c));
    child.stderr.on('data', (c) => chunks.push(c));
    child.on('exit', (code) => {
      const text = Buffer.concat(chunks).toString('utf8');
      fs.writeFileSync(logFile, text, 'utf8');
      const lines = text.split(/\r?\n/);
      const key = lines
        .filter((l) => /capacity check|weight preparation|get_learned_condition completed|generate_image completed|failed during|out of memory/i.test(l))
        .slice(-2)
        .map((l) => l.trim());
      const seconds = Math.round((Date.now() - started) / 1000);
      const result = {
        label: run.label,
        engine: path.basename(path.dirname(path.dirname(run.engine))),
        model: path.basename(run.model),
        size: `${run.w}x${run.h}`,
        seconds,
        exit: code,
        output: fs.existsSync(out),
        freeBefore,
        freeAfter: freeVramGb(),
        key,
        log: logFile,
      };
      console.log(JSON.stringify(result));
      resolve();
    });
    child.on('error', (err) => {
      console.log(JSON.stringify({ label: run.label, error: err.message }));
      resolve();
    });
  });
}

for (const run of runs) await runOne(run);
console.log('done');
