# Qwen-Image-2.1 on 8 GB — performance research (2026-11-16)

Test machine: RTX 4060 Ti 8 GB, Windows, EggLab 0.3.3 engine
`master-1091-b9d7176` (Vulkan unless stated). Every run is a fresh `sd-cli`
process, exactly like the app, so wall time includes model load, text encoding,
sampling and VAE decode. All runs: Qwen-Image-2.1, Euler, 8-step Turbo LoRA
(`qwen_image_2.1_turbo_lora_avg_rank_178_bf16`), `--sigmas qwen-image-2.1-turbo`,
seed 42, `--offload-to-cpu --params-backend cpu --max-vram -1`.
Full logs: `%TEMP%\egglab-perf\`.

## Headline result: Q4_K_M is the real speed win

| Model | Size | 864×1152 T2I | Per step | 1024×1024 T2I | 864×1152 1-ref edit |
|---|---:|---:|---:|---:|---:|
| Uncensored FP8 (current default) | 6.6 GB | 47 s | 3.19 s/it | 48 s | 67 s |
| Official Q4_K_M (new beta) | 3.9 GB | **29 s** | **2.65 s/it** | **31 s** | **60 s** |

- ~35–38 % faster end-to-end for text-to-image, ~10 % for a one-reference edit.
- 2.9 GB less RAM/disk traffic per run, and a much shorter model load.
- Visual check at 1024²: clean faces, lighting and detail. The quantisation
  changes the image for a fixed seed (expected), but not in a degenerate way.
- File SHA-256 `631d532e7ca71e8d90a87c71d3699761a812039d22e3370e87498d87754660fe`
  matches `unsloth/Qwen-Image-2.1-GGUF` exactly.

Q4_K_M does **not** move the 4-reference memory wall: the first transformer
block still needs a ~6.48 GB workspace, independent of weight quantisation.
The existing reference-size fallback stays.

## Engine build: 1106 is not faster

| Engine | Model | 864×1152 T2I | Per step |
|---|---|---:|---:|
| `master-1091-b9d7176` | Q4_K_M | 29 s | 2.65 s/it |
| `master-1106-532d2c1` | Q4_K_M | 123 s first run, 2.69 s/it steady | 2.69 s/it |
| `master-1091-b9d7176` | FP8 | 47 s | 3.19 s/it |
| `master-1106-532d2c1` | FP8 | 46 s | 3.19 s/it |

The 1106 Q4 first run paid a one-off ~90 s shader/plan cost; steady-state was
identical. 1106 is a large API refactor ("opaque options") and a ggml 1.0.0
sync, with no measured gain for this workload, so EggLab stays pinned at 1091.

## Backend: CUDA vs Vulkan

| Backend | Model | Wall | Sampling | Text encoding |
|---|---|---:|---:|---:|
| Vulkan | Q4_K_M | 29 s | 2.65 s/it | 2.1 s |
| CUDA | Q4_K_M | 38 s | 2.67 s/it | 9.1 s |
| Vulkan | FP8 | 47 s | 3.19 s/it | 2.1 s |
| CUDA | FP8 | 49 s | 2.39 s/it | 9.6 s |

On this 8 GB card CUDA samples FP8 faster but pays ~7.5 s more for text
encoding; the net is a wash for 8-step Turbo and a modest CUDA win for 25–40
step Quality (sampling dominates). The installer already picks CUDA on NVIDIA;
the local test install is Vulkan, and both are supported. No change shipped.

SageAttention on CUDA (`--sage-attn`): 2.62 vs 2.67 s/it — inside run-to-run
noise (~2 %), so it is not worth the extra flag and quality risk.

## Memory flags: current plan is already optimal

At 864×1152 and 1024×1024 with Q4_K_M:

| Plan | Wall | Per step |
|---|---:|---:|
| Current: `--params-backend cpu --max-vram -1` | 29–31 s | 2.65–2.79 s/it |
| Smaller reserve: `--max-vram -0.5` | 30–31 s | 2.66–2.79 s/it |
| Auto-fit: no `--params-backend`, `--max-vram -1` | 30–31 s | 2.64–2.78 s/it |

No reliable difference. The current free-aware budget is kept because it also
accounts for browsers/PhotoCraft holding 2–3 GB. A smaller reserve cannot pass
the 6.48 GB workspace at 1024×1280 with four references, so it would only add
OOM risk.

Other flags checked:

- **Flash attention** — the engine already logs
  `flash attention auto: Vulkan0 -> on`; passing `--flash-attn on` is a no-op.
- **Direct convolution** — already `conv2d/conv3d direct auto: on`.
- **Prefix cache** — the app already forces `q8_0` for edits. Removing it made
  no difference at 864×1152 (60 s both ways), so keep it for memory headroom.
- **`--lora-apply-mode immediately`** — fails on quantised (GGUF) weights; the
  documented `auto` / `at_runtime` path is correct for Q4_K_M.
- **`--conditioning-cache-size`** — every EggLab render is a new process, so a
  per-process conditioning cache cannot help.
- **`--eager-load`, `--disable-prefetch`** — prefetch is already on and helps;
  eager loading does not reduce total work.

## What we shipped

1. **Q4_K_M beta variant** in the model registry, downloadable, selectable, and
   auto-detected when the file is already on disk. Official weights, not the
   uncensored variant; labelled BETA with the measured trade-off.
2. **Installing a model no longer silently switches the engine** away from a
   working model. The new variant appears in the picker; the user chooses.
3. **Faster model experiments are reproducible** with
   `tools/bench-perf.mjs` (engines / backends / flags / models / edits).

## Future opportunities (not shipped)

- **Persistent engine (`sd-server`)**: keep 14 GB of weights resident between
  renders and remove ~10–20 s of load per job. Biggest remaining win for chat
  workflows, but it is an architectural change (cancel, logs, VRAM release).
- **Smaller text encoder**: the official Qwen3-VL 8B Q4-class encoder is
  ~5.0 GB vs the current 6.7 GB uncensored Q6_K, saving RAM and a few seconds.
  Not adopted because it changes the uncensored encoder that defines EggLab.
- **Q4 uncensored variants** exist (e.g. `qwen-image-2.1-UC-Q4_K_M.gguf`,
  4.6 GB) but were not tested/validated here.
- **Quality-step tuning**: Q4_K_M makes 25–40 step renders cheaper, but Turbo
  (8 steps) remains ~4× faster than 25 steps for most drafts.

## Sources

- stable-diffusion.cpp Qwen Image 2.1 guide:
  https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/models/qwen_image_2.1.md
  (GGUF support, Turbo sigmas, prefix-cache memory table).
- stable-diffusion.cpp releases / commit history:
  https://github.com/leejet/stable-diffusion.cpp/releases
  (`master-1091-b9d7176`, `master-1106-532d2c1`, PR #2251 Vulkan kernels).
- PR #2251 "perf: optimize Vulkan kernels, graph fusion, and workspace reuse":
  https://github.com/leejet/stable-diffusion.cpp/pull/2251
- Off-grid-ai Qwen-Image-2.1 GGUF benchmarks:
  https://huggingface.co/off-grid-ai/Qwen-Image-2.1-GGUF/blob/main/BENCHMARKS.md
  (Q4 vs Q8 vs original, `--fa --vae-conv-direct` preset).
- Unsloth Qwen-Image-2.1 GGUF model card:
  https://huggingface.co/unsloth/Qwen-Image-2.1-GGUF
  (Dynamic 2.0 quantisation, encoder comparison).
