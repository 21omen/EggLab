---
name: image-generation
description: Create new visual assets and scenes with Qwen-Image-2.1, verify runtime capability, construct task-specific prompts and run controlled render iterations.
---
# Image Generation

Use this skill only when the deliverable is a **new image** and no supplied image is the canvas to preserve. If the user supplies a photo to change, use `reference-editing`; if they drew marks on a photo or painted a separate mask, use the PhotoCraft local-edit workflow. Do not turn an edit request into a long text-to-image prompt.

## 1. Runtime and model check

- Call `egglab_status`; check engine readiness, active model file and current workflow.
- Read the active model label. Base Qwen-Image-2.1 and the Turbo LoRA/checkpoint are different operating modes; never assume Turbo because the model family is Qwen.
- `egglab_status` reports missing model files. Model installation and downloads belong to the panel/setup flow; the production agent has no download tool. If a file is missing, stop and report it.
- Treat historical Qwen facts as research, not runtime guarantees. Verify live resolution, steps and capabilities.

## 2. Task classification

| Request | Route |
|---|---|
| New scene/backdrop/plate from text | `egglab_generate` |
| New scene anchored to a person/product/photo | `egglab_edit` (reference-driven generation) |
| Change/remove/replace/relight an existing image | `reference-editing` |
| Marks on a photo / painted mask layer | `reference-editing` + `egglab_photocraft_edit_active` |
| Transparent cut-out or RGBA edit | `transparency` skill |
| Poster, packaging, infographic, signage | `egglab_generate` for imagery + PhotoCraft for exact type/layout |
| Storyboard/character sheet/panorama | `egglab_generate` with continuity planning |
| Multiple references contributing attributes | `reference-editing` multi-reference path |

If a source image is present, do not use `generate` unless the source is only inspiration and the user explicitly wants a wholly new frame.

## 3. Prompt construction

1. Separate fixed facts (exact copy, counts, colours, required objects), job constraints (ratio, transparency) and creative freedom.
2. Put size/ratio in tool parameters, not prose.
3. Describe the finished image as an observer would see it: subject, setting, composition, materials, lighting, camera/medium.
4. For a full scene, reserve quiet space where later assets/type will go. Background plates exclude the hero/prop that will be composited later.
5. Keep simple props/subjects short. Long 400–500-word prompts are a legacy mode for complex spatial layouts, not a default.
6. Use positive, observable language. Qwen-Image-2.1 runs at CFG 1; do not rely on negative prompts or invent scheduler/guidance controls.
7. For exact text, quote the string exactly and plan editable PhotoCraft type for the final; generated type is a draft until proofread.
8. Reuse one world line across assets in the same piece.
9. Render serially unless runtime confirms safe concurrency. Change one variable per iteration and inspect.

## 4. Qwen-Image-2.1 mental model

Qwen-Image-2.1 is unified generation + instruction editing:
- text-to-image;
- natural-language image editing;
- multiple reference images (official documentation states up to 10; verify the live request/VRAM);
- local edits guided by marks or a separate mask;
- sketch as a visual condition;
- native RGBA generation/editing;
- subject extraction;
- typography/layout, panorama and storyboard concepts.

Capability boundaries:
- No strict ControlNet/pose/depth/edge control through the current EggLab integration.
- No guaranteed pixel-perfect preservation or exact logo/text reproduction.
- A sketch is guidance, not geometric tracing.
- Turbo is a separate checkpoint/schedule; check before quoting steps.
- The Qwen Research License applies to the weights; do not claim commercial rights.

## 5. Multi-reference generation

When the user supplies multiple images for a new frame, route through `reference-editing` and assign roles before writing:
- `<image1>` canvas/framing;
- identity donor(s);
- product/material/lighting/style donor(s).

Do not ask one donor to supply everything. For a new scene, describe the scene actively and lock identity/product to the references. For group portraits, state the left-to-right order and which donor supplies which person.

## 6. Transparency and RGBA

- Use `transparent: true` when the deliverable is a cut-out, sprite, reusable layer or foreground element.
- The panel wraps the prompt in the official RGBA template; describe the subject, not “on a white background”.
- Prefer PNG. Verify real alpha with `egglab_check_alpha`; a checkerboard preview is not proof.
- Inspect hair/fur, semi-transparent edges, halos and contact shadows.
- For editing an existing transparent asset, use the transparency skill and preserve alpha.

## 7. Typography, posters, packaging and information design

- Treat `egglab_generate` as concept imagery; exact type, legal copy, logos and brand typography belong in editable PhotoCraft layers.
- Establish hierarchy, alignment, reading order and margins.
- Proofread every generated character; generated text is not final.
- For packaging, preserve product silhouette/branding from the product reference; do not redesign unless asked.

## 8. Storyboards, character sheets and panoramas

- Decide whether the output is a concept board or a production-accurate storyboard.
- For character sheets, use identity references and state which views/expressions are required; check costume and feature continuity.
- For storyboards, plan panel order, camera direction and scene geography; each panel is a separate render unless a supported multi-panel workflow exists.
- For panoramas, keep horizon, camera height, scale and landmarks consistent; inspect edges and repeated structures. Do not promise seamless projection mapping without testing.

## 9. Iteration and QA

- Inspect the full frame and native-size details; check subject, style, composition, object count, perspective, lighting, shadows and edges.
- If a render fails, identify the failure (prompt ambiguity, missing model, VRAM, wrong workflow) and make one targeted change.
- Do not reroll an identical prompt hoping for a different result; change a variable or use the correct edit/local workflow.
- Report what was rendered and what was verified; do not claim exactness that was not checked.

Load `references/image-generation/prompt-blueprint.md` for prompt structure and
`references/research/local/qwen-image-2.1-features.md` for Qwen capability facts.
