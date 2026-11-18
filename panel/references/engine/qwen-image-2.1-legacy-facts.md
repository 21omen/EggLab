# Qwen-Image-2.1 legacy profile — verify against live EggLab runtime

**Status: migrated from the original EggLab specification; not independently certified as the current local model build.** Before using these facts, query `egglab_status` and `egglab_models` where appropriate, and compare the installed model/config version.

## Source-derived model description
The original specification describes Qwen-Image-2.1 as a 7B DiT with a Qwen3-VL encoder and a 64-channel RGBA VAE. Treat exact architecture claims as version-specific and confirm against the installed model metadata.

## Source-derived generation constraints
- Original profile says the model does not use a negative-prompt field; encode desired positive attributes instead. Confirm the actual EggLab API schema before constructing calls.
- Original profile says not to modify CFG manually. Follow the installed engine preset unless the current runtime documentation explicitly permits otherwise.
- Original profile says width and height should be multiples of 32, in the 256–2048 range. Validate current limits from runtime status/model metadata.
- Source lists trained resolution buckets around 1.0–1.8 MP, including 1328², 1664×928, 1472×1104 and 1584×1056. Treat these as historical recommendations, not a hard limit.
- Source says an 8 GB VRAM configuration can run the local profile, but performance depends on quantization, precision, offload, resolution, other allocations and runtime version.
- Original workflow uses sequential rather than parallel renders to avoid VRAM contention. Confirm whether the current runtime supports safe concurrency before changing this.
- Source says the API accepts up to 10 references but recommends no more than 4 for clarity. Verify live schema and quality behavior.
- Source says editing is heavier than generation and recommends 2–3 passes maximum. Prefer fewer, well-scoped edits and inspect after each pass.

## Quality and Turbo
The original refers to Quality and Turbo rendering presets, but the actual parameter values were template placeholders or runtime-managed. Do not invent steps, samplers, CFG or scheduler values. Ask runtime for supported presets and retain its defaults unless a supported parameter is explicitly required.

## Runtime-first rule
1. Call `egglab_status` before selecting a model-sensitive workflow.
2. Query `egglab_models` if model identity/availability is uncertain.
3. Use only the exact parameters in the live tool schema.
4. Record model identifier, version, profile, resolution, seed and relevant options in the job trace.
5. When actual behavior conflicts with this legacy reference, trust the live schema and observed tool response, then record the discrepancy for controlled profile update.

## Licensing
The original v1 text described the model license as a non-commercial research license. This statement can become stale or depend on the exact checkpoint and revision. Do not make commercial-use representations from this legacy note. Verify the exact downloaded checkpoint's license file and source before advising on use.
