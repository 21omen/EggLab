---
name: image-generation
description: Create new visual assets and scenes using the configured EggLab image engine, verified capabilities and controlled prompt/render iterations.
---
# Image Generation

## Preconditions
- Check `egglab_status` and verify model availability.
- If missing, query `egglab_models`; use `egglab_download_models` only under the user's authorization or configured install policy.
- Read current runtime profile. Historical Qwen facts are not automatically current.
- Decide whether transparency, source identity, exact text or exact ratio matters.

## Prompt procedure
1. Separate fixed facts/content, job rules and creative freedom.
2. Set ratio/dimensions in tool parameters, not prose.
3. Describe the finished image with observable language, not instructions to an AI.
4. Describe medium, subject, setting, material, composition, position, physical detail and lighting.
5. For a full scene, design quiet space for later assets/type. Field/backdrop excludes hero/props added later. Atmosphere plate isolates effect for masking.
6. Client-readable text normally belongs in editable PhotoCraft type.
7. Use positive descriptions. Do not rely on a negative prompt unless live engine explicitly supports it.
8. Reuse world line across assets in one piece.
9. Select Quality/Turbo and resolution from live runtime and task risk.
10. Render serially unless runtime confirms safe concurrency; inspect output and change one variable per iteration.

V1 prescribes 400–500 words for complex poster/layout T2I. Preserve this as a legacy long-form mode when spatial detail helps; do not pad simple props, isolated subjects, quick exploration or local edits. Benchmark shorter prompts before changing model defaults.

Load `references/image-generation/prompt-blueprint.md`; load `references/engine/qwen-image-2.1-legacy-facts.md` only as historical facts and verify runtime-sensitive values.
