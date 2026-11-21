# EggLab Agent V2 — Full Architecture, Research and Upgrade Plan

**Research date:** 21 November 2026  
**Target:** `YanNyeinHtet/EggLab`, public `master` branch  
**Primary model:** Qwen-Image-2.1  
**Image runtime:** the current EggLab `stable-diffusion.cpp` integration  
**Creative workspace:** PhotoCraft  
**Agent runtime:** OpenCode, one primary agent  
**Status:** Research and implementation specification; no repository files have been modified by this document.

---

## Executive recommendation

Upgrade EggLab around two visible jobs:

1. **Image Editing** — start with an existing image, one or more references, or a marked/masked source and use Qwen-Image-2.1 to transform it.
2. **Designing** — start with a design brief, generate the required visual assets with Qwen, and use PhotoCraft to build the editable final composition.

These are two modes of one creative agent, not two agents.

The agent should know the full range of PhotoCraft capabilities, but it should not load every command and every instruction into every request. It should discover the relevant PhotoCraft operation, load the matching recipe and exact command schema, execute it, inspect the result, and continue. The goal is **complete capability knowledge with selective active context**.

The current EggLab code already contains much of the right foundation: progressive skill loading, one primary creative agent, a curated production tool set, a live PhotoCraft command lookup, image inspection, job state, alpha checks, a serialized render queue and PhotoCraft audit/export support. Keep those foundations. The upgrade should focus on making the agent’s job model, Qwen edit modes, design production process, tool discovery and quality verification more explicit and reliable.

### Highest-priority findings

- The top-level agent/router currently classifies many intents, but it does not present the user’s requested **Image Editing / Designing** split as the primary product model.
- Qwen-Image-2.1 supports multiple references, circle annotations, paint annotations, separate visual masks, and native RGBA. The official Qwen description supports up to **10 input images**. The current ComfyUI text-encoder node exposes 16 slots, but its published edit templates wire the first 10. EggLab should start with a tested 10-image contract and only raise it after the local `stable-diffusion.cpp` path is validated.
- EggLab’s current `egl_edit` handler deliberately drops all donor references when `mask_image` is supplied. This prevents the requested **original + mask + extra reference images** workflow through the current tool API.
- `photocraft_edit_active` supports region, mark and PhotoCraft mask-layer editing, but its current tool schema does not accept additional donor reference images.
- The current engine already supports repeated reference images, reference downscaling and low-VRAM handling. Keep these mechanisms and improve role handling and testing.
- The README says only chat text goes to the selected model provider, but the current chat service passes attached image files to OpenCode using `--file`; vision-capable custom providers are explicitly declared image-capable. Update privacy wording and introduce explicit remote-image consent.
- The current Qwen model weights are under the Qwen Research License, which restricts use to non-commercial purposes unless a separate commercial license is obtained. This must be resolved for paid client use or commercial distribution of the model materials.
- Keep **CFG = 1**. It is the standard CFG value in the current ComfyUI Qwen-Image-2.1 workflows and matches the stated product preference. Do not change it as part of this agent upgrade.

---

# 1. Product philosophy

## 1.1 What Generate-First means

EggLab is a **Generate-First creative workflow** powered by Qwen-Image-2.1.

Generate-First is a reasoning and production principle:

- When the task requires creating or transforming visual imagery, the agent considers Qwen first.
- It understands the available Qwen modes and chooses the right one: text-to-image, reference-based generation, direct instruction edit, multi-reference edit, local edit, annotation-guided edit, mask-guided edit, transparent generation or transparent-layer editing.
- It then decides whether PhotoCraft should be used to construct an editable design, manipulate layers, add precise typography, compose assets, make deterministic adjustments or export the final deliverable.
- It can deliver the generated image directly when that is all the user asked for. It must not force every result into a PhotoCraft document.
- It can also do PhotoCraft-native work directly when the task is fundamentally a typography, vector, layout, document or deterministic editing task. It must not generate an image just because the user says “design”.

Generate-First does **not** mean PhotoCraft is a secondary tool. Qwen is the primary generative and semantic image engine; PhotoCraft is the primary native creative workspace. They have different strengths and should work together when that improves the result.

## 1.2 The two top-level jobs

| Job | Primary starting point | Main responsibility | Final output |
|---|---|---|---|
| **Image Editing** | Existing image(s), source layer, prompt, annotation or mask | Understand and transform source imagery with Qwen | Edited image, transparent asset, or updated PhotoCraft layer |
| **Designing** | Creative brief, copy, brand assets, layout needs or visual idea | Develop the design, generate assets, construct and finish an editable composition | PhotoCraft project plus requested flat/layered exports |

The agent can enter one mode and temporarily use capabilities from the other. For example, a poster job is Designing, but it may use reference editing to preserve a supplied product photo. A photo retouch job is Image Editing, but it may use PhotoCraft for a strict composite or final export.

## 1.3 Keep one agent

Do not split EggLab into separate image-editing and design agents. Separate agents would introduce duplicated context, handoff state, competing interpretations and extra orchestration. Keep one creative director that routes the job, loads only the matching specialist skills and uses a shared job record.

The current OpenCode configuration already defines a single primary agent and restricts it to EggLab’s own production tools. Preserve that model.

---

# 2. Fresh repository review: current state

**Scope limitation:** this is a static review of the current public EggLab repository and its exposed PhotoCraft bridge. The proprietary PhotoCraft desktop application's complete internal source is not part of the public repository, and this review did not execute the project on a live Windows/PhotoCraft/GPU installation. Therefore, claims about PhotoCraft are limited to the commands, snapshots and operations that EggLab's public bridge exposes.

## 2.1 What already exists and should be retained

| Current component | Existing capability | Recommendation |
|---|---|---|
| `panel/AGENT.md` | One creative-director identity, direct EggLab tool guidance, inspect-after-render rule | Rewrite around the two top-level jobs and clearer task contracts |
| `panel/ROUTER.md` | Intent classification, constraint extraction, skill selection, runtime check, QA sequence | Make Image Editing and Designing the first routing decision |
| `panel/manifest.yaml` | Skill metadata and progressive reference loading | Keep this architecture; refine skill scopes and triggers |
| `egl_read_knowledge` | Read-only, allowlisted knowledge loading | Keep; use it for selected skill and reference retrieval |
| `egl_generate` | Qwen generation, 1–4 outputs, quality/turbo workflows, transparent option | Retain; add asset-role and output-intent guidance |
| `egl_edit` | One or more image references, optional source/mask path, output controls | Extend its edit-mode contract; fix reference loss in mask mode |
| `egl_photocraft_edit_active` | Edit active layer, region, annotation and a separate mask layer | Extend to support donor refs and explicit edit methods |
| PhotoCraft command tools | `photocraft_commands`, `photocraft_command`, `photocraft_batch` | Keep as dynamic discovery/execution rather than exposing all commands |
| PhotoCraft state tools | Status, layer tree, canvas preview, project, audit and save/export | Improve snapshots and revision awareness |
| `egl_inspect` | Returns actual rendered pixels for inspection | Keep as a mandatory verification step for visual outputs |
| `egl_check_alpha` | Measures transparent/opaque/partial alpha and subject bounds | Keep mandatory for transparent outputs |
| Engine queue | One `sd-cli` job at a time, with cancellation and low-VRAM handling | Retain; expose workload estimates and avoid accidental concurrent jobs |
| QA/audit | Composite audit and file export validation | Expand into task-specific acceptance checks |

The current production profile exposes roughly 21 curated agent tools, not the complete PhotoCraft command registry. The PhotoCraft raw command tool is described as accessing roughly 948 commands, while `photocraft_commands` discovers commands only when they are not already documented. This is the correct direction for a bounded-context agent.

## 2.2 Confirmed implementation gaps

### Gap A — the current mask path discards donor references

In `panel/mcp-server.mjs`, the `edit` handler constructs `images` from `args.images`, but sets the submitted render job's `images` to an empty array whenever a `mask_image` is present. The code comment explicitly says that this path is a true masked inpaint with no donor conditioning.

The result: the current API can do either:

- multi-reference edit, or
- engine-native masked inpaint,

but not yet the full user-requested combination of original + separate mask + extra donor references.

### Gap B — active-layer editing has no donor-reference parameter

The current `photocraft_edit_active` tool accepts prompt, region, mask-layer name, invert flag, mode, feather, strength, workflow, steps, seed and replace. It does not accept a reference-image list. This blocks a PhotoCraft-originated annotation/mask edit that also needs one or more donor images.

### Gap C — mask concepts are conflated

The current product has at least three distinct concepts that need separate names and routes:

1. A mask used as a **visual reference image** for Qwen.
2. A mask passed to the engine as an **actual inpainting mask**.
3. A PhotoCraft **mask layer** that describes a selected portion of a document/layer.

They are related but not interchangeable. The agent must know which one it is using and what preservation guarantee it provides.

### Gap D — annotation is documented as a PhotoCraft operation, not fully as a Qwen input mode

Qwen-Image-2.1 specifically demonstrates different-coloured circles and painted annotations as visible visual instructions. The knowledge package should teach these Qwen-specific patterns directly, including image ordering and how to phrase the prompt, rather than only telling the agent to use the generic marked-photo flow.

### Gap E — editing resolution can silently default lower than the user's source

The current engine auto-follows the source aspect ratio, but the no-explicit-size edit path scales the long side to approximately 1024 px before setting the output dimensions. The product can render up to 2048 px, but the agent should not imply that every normal edit defaults to native 2K. Add explicit resolution profiles and report actual output dimensions.

### Gap F — no clear first-class design production contract

The existing design direction and asset-planning skills are useful. However, Designing needs one orchestrating workflow that tracks the brief, fixed copy, visual concept, asset inventory, PhotoCraft document state, quality checks and deliverables together.

---

# 3. Qwen-Image-2.1 capability model for EggLab

Qwen-Image-2.1 is a unified text-to-image and instruction-edit model. Its official material describes a 7B visual-generation component, native alpha-channel output, transparent-layer editing, subject extraction, local editing and up to 10 reference images. The current ComfyUI implementation exposes 16 image slots on its text-encode node, but the published edit templates wire the first 10. For EggLab, **10 total image inputs should be the initial supported contract** until the local `stable-diffusion.cpp` path proves a higher count reliably.

## 3.1 Image input ordering

Use a deterministic input order:

| Slot | Meaning | Rule |
|---|---|---|
| `image_1` | Main source / canvas being edited | Preserve its framing, aspect ratio and all non-targeted content unless the user requests otherwise |
| `image_2` | First guide/donor/mask/annotation image, depending on mode | State its role explicitly in the prompt |
| `image_3` onward | Additional donor/reference images | Assign each a role; do not make the model guess what each image contributes |

The prompt compiler should use `<image1>`, `<image2>`, etc. when more than one image is provided. Image order is a contract: do not reorder images after writing the prompt, and do not silently insert a thumbnail or canvas preview into the reference list.

Recommended total input cap for the first release: 10 images. Practical default for an 8 GB machine: one source plus one to three high-value references. More references can be supported when requested, but should trigger runtime and memory planning rather than being blindly loaded.

## 3.2 Direct prompt editing

Use this route when the user supplies an existing image and describes a transformation without a separate local mask or annotation.

Examples:
- Change the sky to a cloudy sunset.
- Remove the car in the background.
- Change the wall colour to warm beige.
- Make the product photo look like a premium studio shoot.
- Replace a visible label with exact supplied wording.

Prompt structure:

1. Lead with the actual operation.
2. Name the target object/attribute precisely.
3. State only the important invariants that must remain unchanged.
4. Preserve exact user-provided text, numbers, product details and identity.
5. Avoid describing the whole picture as though it were a new text-to-image prompt.

For a simple local edit, use concise imperative wording. For a broad style or scene transformation, a more detailed direction is appropriate.

## 3.3 Multi-reference editing

Use this route when the edit requires visual information from multiple images.

The agent must assign explicit reference roles before calling Qwen. Suggested roles:

- `canvas`: the source image whose composition should remain the base.
- `identity`: a person/character identity reference.
- `product`: the exact product/model/packaging reference.
- `object_donor`: the object to transfer into the canvas.
- `clothing_donor`: garment, accessories or styling reference.
- `pose`: pose/body-position reference.
- `style`: visual treatment, material or art direction reference.
- `environment`: background/location reference.
- `lighting`: lighting direction, softness, colour or mood reference.
- `layout`: structural design/composition reference.
- `mask`: a separate mask image used only in visual-mask mode.
- `annotation`: the annotated source image used only in annotation mode.

Prompt example:

> Put the backpack from <image2> onto the person in <image1>. Use the colour palette and material finish from <image3>. Keep the person's face, pose, clothing outside the backpack, camera angle and background from <image1> unchanged. Preserve the backpack's logo and exact construction from <image2>.

The role map should be stored in job state, not reconstructed from the conversation on every turn.

## 3.4 Mask-guided editing: two different implementations

EggLab should expose the user-facing concept **Mask-Guided Edit**, but the implementation must distinguish two methods.

### Method A — Qwen visual-mask reference

This is the Qwen-specific approach demonstrated by Qwen: send the original image and a separate mask image as visual inputs. Additional donor/reference images can follow them.

Input contract:

- `image_1`: original image.
- `image_2`: mask image aligned to the original image.
- `image_3...`: optional donor/reference images.

Recommended mask preparation:

- Same width, height, aspect ratio and pixel registration as the original.
- Use a high-contrast, easy-to-read mask preview. Begin with white for the editable area and black for the preserved area, then state this convention in the prompt.
- If the user paints on a transparent layer, composite it to a clear mask preview before sending it to Qwen. Do not assume alpha-only transparency will be interpreted as the intended visual selection.
- Preserve the original image as a clean source; the mask must never replace or overwrite it.
- Prompt explicitly: “The white region in <image2> is the target area; the black region is context to preserve.”

This is **visual guidance**, not a guarantee that every pixel outside the selected region will remain identical. Qwen still generates an edited image.

### Method B — engine-native masked inpainting

This is the current EggLab engine-level method using `initImg`, `mask` and `strength`, passed to the local engine as `-InitImg`, `-Mask` and `-Strength`.

Input contract:

- Original image is the inpaint canvas.
- Separate grayscale/binary/soft mask is the actual inpainting mask.
- The current PhotoCraft tool convention is white/alpha = editable, black/transparent = preserved, with optional inversion.
- The agent should query mask convention from the tool/runtime and verify it before rendering.

This method can give more controlled region replacement, but the current EggLab MCP handler intentionally drops donor images when `mask_image` is supplied. The engine builder itself has separate code paths for `-ImageFile`, `-InitImg` and `-Mask`, but the compatibility of combining those flags for the installed runtime has not been established here. Do not assume the combination works simply because the CLI accepts the flags.

Implementation requirement:

1. Add a compatibility test for `-ImageFile + -InitImg + -Mask` using one source, one mask and one donor reference.
2. If the combined mode works reliably, expose `native_mask_with_refs` and retain the full ordered reference list.
3. If it does not, keep engine-native inpaint as a no-donor mode and use the Qwen visual-mask-reference method when extra visual references are required.
4. Never silently drop donor references. Return an explicit `unsupported_combination` result if the selected backend cannot honour the requested inputs.

### Strict pixel preservation

Neither Qwen visual-mask guidance nor general generative inpainting should be described as a hard guarantee of unchanged pixels outside the selected area. If the user requires strict preservation:

1. Generate the edited image.
2. Keep the original image unchanged.
3. Composite the generated region back through the same canonical mask in PhotoCraft or a deterministic image compositor.
4. Apply a user-controlled feather/border blend.
5. Compare the untouched area against the source.

This is a separate deterministic finishing step, not a model-prompt promise.

## 3.5 Annotation-guided editing

Qwen-Image-2.1 supports annotation on the image itself. EggLab should preserve two separate forms of annotation.

### Circle-guided editing

- Draw one or more circles over the original image.
- Use different colours to distinguish different targets.
- Keep a mapping from each colour to the instruction.
- Permit several edits in one request when the marked targets and instructions are unambiguous.
- Do not overload colours with inconsistent meanings inside a single job.

Example mapping:

| Mark | Target | Instruction |
|---|---|---|
| Blue circle | Watch | Remove the watch |
| Red circle | Hair | Change hair colour to black |
| Green circle | Shirt | Replace the shirt with a grey linen shirt |

### Paint-guided editing

- Paint over a target area to show where an addition/replacement should happen.
- Useful for adding an object where none currently exists, changing a portion of the scene, or showing a rough spatial footprint.
- The prompt must say what the painted region means: add an object inside it, replace its contents, or modify the marked area.

### Annotation input handling

- Keep the clean original as a separate source layer/file.
- Composite annotations onto a temporary preview copy for the model input.
- Keep the annotation visible in the temporary input; do not pass only the clean source and expect the model to infer the user’s marks.
- Tell Qwen the marks are instructions and should not appear in the final result.
- Add donor images after the annotated source, preserving the correct `<imageN>` mapping.
- Inspect the generated result for leftover strokes, circles, marks or annotation colour contamination.
- If exact pixel preservation is needed, use deterministic compositing with the clean original.

PhotoCraft already has an active-layer annotation path. Extend that path rather than creating a separate annotation application. The agent should use PhotoCraft to create and preserve the annotated preview, while the backend passes the right image sequence into Qwen.

## 3.6 Transparent generation and editing

Qwen-Image-2.1 supports four-channel RGBA output, transparent-background generation, transparent-layer editing and subject extraction.

Agent workflow:

1. Decide whether transparency is a real requirement or whether the user merely wants a plain background.
2. Use Qwen’s native transparent mode for isolated assets, stickers, product cut-outs, decorative elements, UI elements and compositing assets.
3. Verify the actual alpha channel with `egl_check_alpha` after every render.
4. Inspect the edge for halos, clipped hair, missing translucent detail, unwanted transparent holes and subject-edge contact.
5. Place the asset into PhotoCraft and inspect it against the target background, not only the checkerboard preview.
6. Keep alpha when exporting layered assets. Do not flatten a transparent asset against an arbitrary background.

Do not assume a PNG file is transparent merely because the user asked for transparency. The alpha check is authoritative.

## 3.7 Prompt enhancer: optional future feature

Qwen publishes separate prompt-enhancement models for text-to-image and image-edit prompts. The image-edit enhancer uses both the user instruction and input images to produce an actionable edit instruction, role mapping and output-ratio guidance.

However, these are separate Qwen3.5-VL 9B components, not free prompt logic built into the 7B image generator. The official repository describes substantial memory requirements for the BF16 variants; the ComfyUI workflows make prompt refinement optional. Do not add the prompt enhancer as a compulsory default dependency for EggLab's 8 GB target.

Recommended order:

1. First build a deterministic prompt compiler inside the existing agent workflow.
2. Create fixed tests comparing raw prompts to agent-compiled prompts.
3. Later benchmark the official PE-I2I and PE-T2I models as optional components.
4. Turn them on only if measured image quality/adherence improves enough to justify latency, RAM/VRAM and install size.
5. If a prompt enhancer needs the source image, disclose whether that image is sent to a local or remote model.

---

# 4. Job contracts and persistent state

The agent needs a structured internal job record. It should not rely on a long chat transcript to remember image order, locked copy, target regions, design assets or what it has already done.

## 4.1 Shared `CreativeJobSpec`

Minimum shared fields:

```json
{
  "job_id": "job-...",
  "job_type": "image_edit | designing",
  "user_brief": "Original request, preserved verbatim",
  "output_goal": "What must exist when the job is complete",
  "hard_constraints": {
    "exact_text": [],
    "names_and_numbers": [],
    "identity_or_product_locks": [],
    "dimensions": null,
    "aspect_ratio": null,
    "format": "png",
    "transparent_background": false,
    "must_preserve": [],
    "must_not_add": []
  },
  "references": [],
  "selected_skills": [],
  "selected_tools": [],
  "runtime_profile": {},
  "plan": [],
  "outputs": [],
  "qa": [],
  "status": "planning"
}
```

The real schema should be validated in code. The model should not be allowed to invent file paths or PhotoCraft document IDs.

## 4.2 `ImageEditJob`

```json
{
  "job_type": "image_edit",
  "edit_method": "direct | multi_reference | visual_mask | native_mask | circle_annotation | paint_annotation",
  "source_image": "verified path or active-layer export",
  "reference_images": [
    {"index": 1, "path": "...", "role": "canvas", "description": "Image being edited"},
    {"index": 2, "path": "...", "role": "clothing_donor", "description": "Garment to transfer"}
  ],
  "mask": {
    "path": null,
    "kind": "none | visual_reference | engine_mask | photocraft_layer",
    "editable_value": "white_or_alpha",
    "invert": false,
    "same_canvas_size": true
  },
  "annotations": [],
  "edit_operations": [],
  "preserve": [],
  "output": {"resolution_profile": "follow_source", "format": "png", "keep_alpha": false},
  "strict_preservation": false
}
```

Key rule: a mask and an annotation are not ordinary donor images. They are special input roles with different preprocessing and prompt instructions.

## 4.3 `DesignJob`

```json
{
  "job_type": "designing",
  "brief": {
    "purpose": "...",
    "audience": "...",
    "format": "poster | social_post | banner | packaging | other",
    "dimensions": {"width": 1080, "height": 1350},
    "copy": {"headline": "exact text", "body": "exact text", "cta": "exact text"},
    "brand_rules": [],
    "visual_direction": "..."
  },
  "concept": {},
  "asset_plan": [],
  "photocraft_document": {"id": null, "revision": null, "path": null},
  "layers": [],
  "exports": [],
  "qa": []
}
```

Do not force every job to ask the user for every field. Infer reasonable defaults when safe, and ask one question only when an essential ambiguity blocks work.

## 4.4 State update rules

- Update state after each meaningful phase: planned, generated, inspected, placed, edited, exported, verified.
- Store exact paths, dimensions, seeds, model filename, workflow, CFG, steps, masks and ordered references.
- Record failed operations and the reason; do not silently repeat failed tool calls.
- When the agent resumes a job, inspect current PhotoCraft document identity/revision before acting.
- If the active document changes, re-bind the job to the new document only after confirming the mapping.
- Keep a compact summary in active context. Full logs, asset manifests and detailed command recipes remain on disk and are loaded only when needed.

---

# 5. Image Editing job: complete operating workflow

## Phase 1 — Understand the input

1. Check whether the user supplied an image, multiple images, PhotoCraft layer mentions, a canvas preview, a mask, or annotated imagery.
2. Determine the target/canvas image.
3. Classify each additional image by role.
4. Determine whether the task is a direct edit, multi-reference edit, visual-mask edit, engine-mask inpaint, circle annotation or paint annotation.
5. Identify what must change and what must remain invariant.
6. Check whether exact pixel preservation is required.

The agent should not ask the user “which image is the original?” when the application metadata already identifies the canvas or active layer. It should inspect the available context first.

## Phase 2 — Choose the method

| User request / input | Method |
|---|---|
| One source image + simple text instruction | Direct edit |
| Source image + one or more donor/reference photos | Multi-reference edit |
| Original + separately painted mask image | Qwen visual-mask reference or native-mask inpaint, depending on requested preservation |
| User draws coloured circles on the original | Circle annotation |
| User paints a target region on the original | Paint annotation |
| User requires no pixel changes outside a region | Model edit followed by deterministic masked compositing |
| User wants an isolated subject/asset | Transparent generation or extraction |

## Phase 3 — Compile the prompt

Use a short structured prompt rather than an indiscriminate long image description.

A useful template:

```text
[Operation] [target object/attribute] in <image1>.
Use [specific property] from <image2> and [specific property] from <image3>.
Keep [critical invariants] unchanged.
Preserve [exact text/product construction/identity] exactly.
[Output style or physical integration requirement].
```

Prompt compiler rules:

- Preserve the user's intent and action verb.
- Resolve spatial ambiguity using annotations, image roles and visible context.
- Name the exact source image supplying the target or donor.
- Do not re-describe untouched parts in excessive detail; unnecessary elaboration can cause drift.
- Make preservation clauses concise and specific.
- Keep text inside the image exact, character for character, including script, punctuation and spacing.
- Do not invent logos, labels, text, accessories, objects or scene details.
- If the user requests a creative scene from an identity reference rather than an edit of the original composition, treat it as a new composition and choose the appropriate ratio rather than automatically following the source frame.

## Phase 4 — Runtime planning

Before rendering:

- Read the current Qwen runtime profile and installed model variant.
- Preserve CFG 1.
- Choose quality or Turbo based on the actual installed workflow profile and the task's tolerance for speed/detail.
- Do not confuse the current base checkpoint + Turbo LoRA with a separate official Qwen-Image-2.1-Turbo checkpoint. Record the actual diffusion file and LoRA path in the job log.
- Preserve source aspect ratio by default.
- Choose a preview or final resolution profile explicitly. Do not silently promise 2K when the current default edit size is capped at about 1024 px on the long edge.
- Keep reference images in order. Use runtime-aware downscaling and avoid excessive donor images on 8 GB VRAM.
- Queue renders sequentially unless the engine is re-profiled and proven to support parallel inference.

## Phase 5 — Inspect and repair

Every visual edit must be inspected. Do not report success because a model call returned `done`.

Check:

- Did the requested object/attribute actually change?
- Did identity, face, product, logo, shape, material and count remain correct?
- Did the model alter unrelated regions?
- Were annotation marks/circles removed?
- Are mask edges clean? Any halo, colour fringe or rectangular seam?
- Is the output crop/aspect ratio correct?
- Is the alpha channel present and meaningful when requested?
- Is readable text exact?

If the output is wrong:

1. Identify the specific failure.
2. Decide whether to improve the prompt, change the method, crop a difficult local edit, adjust the mask feather/strength, or use PhotoCraft compositing.
3. Retry only with a reason and bounded retry count.
4. If the issue cannot be solved by the current backend, report the limitation instead of repeatedly rendering.

## Phase 6 — Deliver

Return the actual output path/image, dimensions, format and transparency status. If it was inserted into PhotoCraft, verify the layer placement and current document state. Do not claim that the original layer or pixels are preserved unless the tool/compositing path verifies it.

---

# 6. Designing job: complete operating workflow

Designing is not “generate one poster and stop.” It is a creative-production process in which Qwen creates imagery and PhotoCraft creates the final editable design.

## Phase 1 — Understand the brief

Extract:

- Purpose and audience.
- Deliverable type (poster, social post, banner, packaging, key art, infographic, product ad, etc.).
- Exact dimensions, ratio and platform.
- Exact text/copy, names, numbers, logos and legal lines.
- Brand colours, type rules, supplied assets and exclusions.
- Tone, style, visual references and degree of creative freedom.
- Whether the user needs an editable PhotoCraft project, a flattened deliverable, layered asset exports or multiple versions.

If the user provides a finished design as a reference, decide which parts are visual direction and which are content/layout requirements. Do not copy irrelevant elements by default.

## Phase 2 — Creative direction

Before generating, establish a compact design direction:

- Main visual concept and focal point.
- Visual hierarchy: primary, secondary, supporting information and CTA.
- Composition and grid.
- Colour palette and contrast strategy.
- Typography direction and hierarchy.
- Image/asset style, camera perspective, lighting and material language.
- Safe margins, bleed and negative space.

Do not ask the user to approve every minor decision. Choose a coherent direction and show the result; request confirmation only when a decision is consequential or irreversible.

## Phase 3 — Build an asset plan

Break the visual into assets before rendering. For each asset specify:

- Asset ID/name.
- Purpose and canvas position.
- Qwen generation/edit method.
- Reference images and their roles.
- Desired dimensions/aspect ratio.
- Whether a transparent background is required.
- Visual continuity rules (lighting, camera, palette, perspective, material, scale).
- QA requirements.

Typical asset categories:

- Hero subject/product.
- Supporting objects/props.
- Background/environment plate.
- Decorative forms, textures and graphical elements.
- Foreground elements.
- Transparent cut-outs.
- Secondary images or panels.

Generate only the assets needed for the selected design; do not generate an unnecessarily large pile of alternatives.

## Phase 4 — Generate visual elements with Qwen

Use Qwen for photographic, illustrative, painterly, textured and otherwise generative visual content. Use multiple references when needed to preserve product, character, style, pose, material or environment continuity.

For isolated objects, request native RGBA transparency and verify the result with `egl_check_alpha`.

For visual consistency:

- Maintain a shared visual direction across prompts.
- Reuse the same approved subject/product reference where needed.
- Specify camera, lighting and perspective relationships.
- Track seeds and prompts for each asset.
- Inspect each asset before placing it into the final composition.

Do not use generated imagery to replace exact brand logos, legal copy, QR codes, serial numbers or precision text unless the user specifically asks for a model-generated approximation. Place exact text and logos natively in PhotoCraft whenever editability and correctness matter.

## Phase 5 — Build the native design in PhotoCraft

PhotoCraft should be used to construct the actual design, not merely as a file dump for generated images.

The agent should be able to:

1. Inspect the running application and active document.
2. Create or open the correct document with the requested dimensions.
3. Place and name generated assets as separate layers.
4. Create and manage groups/layers in a meaningful hierarchy.
5. Build editable text and typography.
6. Create vector shapes, strokes, fills and graphic structures.
7. Arrange objects using alignment, spacing, transforms and layer ordering.
8. Apply masks, blend modes and adjustments as needed.
9. Use image operations, selections, filters, crop and transform where appropriate.
10. Keep the composition editable and logically organised.
11. Save the native project and export flat/layered deliverables.

Suggested layer structure:

```text
00_GUIDES (hidden)
01_BACKGROUND
02_ENVIRONMENT
03_HERO
04_SUPPORTING_ASSETS
05_DECORATIVE_ELEMENTS
06_GRAPHICS_AND_SHAPES
07_HEADLINE
08_BODY_COPY
09_CTA_AND_BRAND
10_FINISHING_ADJUSTMENTS
```

Use semantic layer names rather than generic names such as `Layer 14 copy 2`.

## Phase 6 — Design QA and delivery

Before export, inspect the actual canvas and check:

- Visual hierarchy and focal point.
- Alignment, grid, margins, balance and negative space.
- Typography size, spacing, contrast, spelling and exact copy.
- Text clipping/overflow and font availability.
- Brand and product fidelity.
- Colour consistency and image integration.
- Layer organisation and editability.
- Output size, aspect ratio, colour mode and format.
- Alpha channel when transparency is required.
- Exported image matches the saved document.

Use PhotoCraft's measurable audit as one QA signal, not as a substitute for visual review. Save the native project when requested; verify that the file exists and that the exported image opens correctly.

---

# 7. PhotoCraft: complete knowledge without loading everything

## 7.1 The correct architecture

PhotoCraft must be treated as a complete creative workspace. The agent should know the available capability map, but only the current task's exact command details should enter active context.

Use three layers:

### Layer 1 — Capability index (small, always discoverable)

A compact machine-readable index of PhotoCraft categories and what each category can do. For example:

- Document/project: new, open, inspect, resize, save, recent projects.
- Canvas: preview, dimensions, colour/background, visible bounds.
- Layers/groups: create, rename, reorder, duplicate, show/hide, lock, delete, group.
- Raster/image: place, crop, resize, transform, flip, rotate, retouch.
- Selection/masks: selection tools, masks, feather, invert, mask application.
- Typography: create/edit text, font, size, weight, tracking, leading, alignment, transform.
- Vector/shapes: paths, shapes, fills, strokes, geometry and effects.
- Adjustments/filters: tonal, colour, blur/sharpen and other host-supported filters.
- Compositing: opacity, blending, layer order, clipping/group behaviour.
- Export/delivery: flat export, layer export, project save and file checks.

This index should be refreshed or versioned against the live PhotoCraft bridge rather than becoming a stale hard-coded list.

### Layer 2 — Task recipes (load only when selected)

Examples:

- Build a text-led poster.
- Assemble a product advertisement from a generated hero and transparent assets.
- Edit an existing document without flattening.
- Create a layer group and align a multi-element layout.
- Perform a masked local image replacement.
- Create a social-media aspect-ratio variant.
- Export both flattened and editable layered deliverables.

A recipe explains the correct sequence, not just a list of command names.

### Layer 3 — Exact command schema (retrieve just before use)

Use `photocraft_commands` to search for the relevant command or retrieve exact parameters for a command ID. Then call `photocraft_command` or a typed higher-level tool. Use `photocraft_batch` when multiple deterministic operations can safely be executed in sequence.

Do not expose the complete 948-command catalogue to the model on every turn.

## 7.2 Improve the live command-discovery system

Enhance the existing dynamic command lookup with:

- Search by capability category, task description, command ID and keyword.
- Short result summaries with exact IDs and parameter schema retrieval.
- Command metadata: description, required arguments, optional arguments, preconditions, active-document requirement, expected result and side effects.
- A `read_only / reversible / destructive` risk classification.
- Version/build information so cached recipes can be invalidated when PhotoCraft changes.
- Alias mapping from creative intent to categories (e.g. “make a title” → text; “align these” → transform/align; “soft edge mask” → mask/selection).

If PhotoCraft's public runtime does not expose reliable metadata for some of these fields, maintain them in EggLab's recipe package and validate IDs/parameters against the live bridge before invocation.

## 7.3 Add document snapshots and revision guards

Before editing a document, obtain a compact snapshot:

- Document identity, name, path and dimensions.
- Revision or modification state if available.
- Layer IDs, names, bounds, visibility, lock state, active selection and semantic roles when discoverable.
- Active layer and mask relationship.
- Current export/save state.

Use that snapshot to plan changes and detect unexpected state drift. Before a sequence of operations that depends on a particular layer/document state, confirm that the document is still the same document/revision. If it changed, refresh the snapshot.

## 7.4 Improve tool safety

Raw command execution is powerful. Classify operations:

- **Read-only:** inspect, list, query, preview, audit.
- **Reversible edits:** create layer, move/transform, text edit, colour change, adjustment with undo available.
- **Potentially destructive:** delete, flatten, merge, overwrite, destructive filter, clear, replace/close document.

The agent may perform ordinary reversible composition work within the user's requested task. It should ask before destructive actions that may destroy existing user work or overwrite a file. Never flatten the working project when the requested output is an editable layered design.

## 7.5 High-level operations vs raw commands

Keep typed EggLab tools for common operations such as create document, inspect layers, place image, edit active layer, audit, save and export. Use raw PhotoCraft commands for advanced or uncommon operations discovered on demand. This gives the model reliable common actions without preventing access to the wider application.

---

# 8. Agent architecture upgrade

## 8.1 Keep the core prompt small

`AGENT.md` should contain only universal operating rules:

- Who EggLab is: one creative director/operator.
- The two top-level jobs.
- Generate-First relationship between Qwen and PhotoCraft.
- Universal inspect-before-report rule.
- Tool safety and privacy constraints.
- Job-state rules.
- Progressive skill/command discovery instructions.

Do not duplicate detailed Qwen prompt recipes, PhotoCraft command schemas, design theory or niche use cases in the core prompt.

## 8.2 Router update

`ROUTER.md` should start with one decision:

```text
Is this primarily:
A. IMAGE EDITING — transform existing image content; or
B. DESIGNING — create a complete visual composition/product?
```

Then identify supporting routes:

- Image Editing may load multi-reference, mask/annotation, transparency, scenario and QA skills.
- Designing may load design direction, asset planning, image generation, PhotoCraft production and QA skills.
- Both can load PhotoCraft or Qwen resources when needed.

The router should not ask the model to decide between dozens of unrelated operations before it knows which job it is doing.

## 8.3 Recommended skill map

Keep existing useful skills and add/refactor only enough to represent the real workflows.

| Skill | Purpose | Typical triggers |
|---|---|---|
| `image-editing` | Common image edit reasoning, source/reference roles and prompt compiler | Change, remove, add, replace, restyle, retouch |
| `multi-reference-editing` | Reference assignment, ordering and `<imageN>` prompts | Multiple photos, donor objects, product/style/pose transfer |
| `mask-annotation-editing` | Visual mask vs engine mask vs marked-image annotation | Mask, painted region, coloured circles, local edit |
| `transparency` | RGBA generation/edit, cut-outs and alpha verification | Transparent PNG, isolate, extract subject |
| `design-direction` | Audience, concept, hierarchy, visual style | New poster/ad/packaging/design brief |
| `asset-planning` | Decompose full composition into generated/native assets | Multi-element design, product ad, layered composition |
| `image-generation` | Qwen T2I, prompt structure, runtime profiles | New image, scene, background, asset |
| `photocraft-production` | Native document, typography, vectors, layer and export procedures | Layout, typography, vectors, project, canvas |
| `photocraft-discovery` | Search and use capabilities not covered by common recipes | Unfamiliar PhotoCraft operation |
| `qa-delivery` | Image, design, alpha, project and export QA | All production jobs |
| `scenario-recipes` | Narrow high-value production recipes | Product placement, restoration, skin retouch, label edit, outpaint |

These are skills under one agent, not subagents. The manifest should load only skill metadata at startup, the selected `SKILL.md` on activation and deeper references only when the workflow requires them.

## 8.4 Knowledge/reference layout

Suggested structure:

```text
panel/
  AGENT.md
  ROUTER.md
  manifest.yaml
  skills/
    image-editing/SKILL.md
    multi-reference-editing/SKILL.md
    mask-annotation-editing/SKILL.md
    transparency/SKILL.md
    design-direction/SKILL.md
    asset-planning/SKILL.md
    image-generation/SKILL.md
    photocraft-production/SKILL.md
    photocraft-discovery/SKILL.md
    qa-delivery/SKILL.md
    scenario-recipes/SKILL.md
  references/
    qwen/
      capabilities.md
      input-ordering.md
      direct-edit-prompting.md
      multi-reference-prompting.md
      visual-mask-vs-engine-mask.md
      annotation-editing.md
      rgba-and-alpha.md
      runtime-profiles.md
    design/
      visual-principles.md
      layout-and-hierarchy.md
      typography.md
      colour-and-contrast.md
      finishing-and-support.md
    asset-planning/
      asset-stack.md
      continuity-rules.md
    photocraft/
      capability-index.yaml
      document-snapshot.md
      layers-and-groups.md
      typography-and-vector.md
      masks-selections-and-adjustments.md
      transform-crop-composite.md
      save-export.md
      recipes/
    qa/
      image-edit-checks.md
      design-checks.md
      transparency-checks.md
      output-delivery.md
  templates/
    creative-job.json
    image-edit-job.json
    design-job.json
    asset-manifest.json
  evals/
    image-edit-cases.yaml
    design-cases.yaml
    tool-discovery-cases.yaml
    privacy-and-safety-cases.yaml
```

Do not build every file before the implementation starts. Use this as the target structure; migrate one category at a time and remove duplicate or stale content after verifying the new route.

## 8.5 Progressive disclosure contract

The agent must be able to answer “what can PhotoCraft do?” without loading all the individual command schemas.

A typical turn should load:

- Always: `AGENT.md`, `ROUTER.md`, compact skill metadata.
- Image Editing: `image-editing/SKILL.md`, plus only the relevant multi-reference or mask/annotation/transparency recipe.
- Designing: `design-direction` and `asset-planning`, plus the generation and PhotoCraft skills actually needed.
- PhotoCraft operation: query the capability index, then load the relevant recipe and exact command schemas.
- QA: load the relevant QA checklist after the production path is known.

The capability index is always discoverable, not all instructions. This distinction is essential.

---

# 9. Tool/API changes needed

## 9.1 Extend `egl_edit` without breaking simple edits

Keep the existing `images` array for backwards compatibility, but add explicit edit mode and role metadata.

Proposed conceptual schema:

```json
{
  "prompt": "...",
  "edit_mode": "direct | multi_reference | visual_mask | native_mask | circle_annotation | paint_annotation",
  "images": ["source.png", "donor.png"],
  "image_roles": [
    {"index": 1, "role": "canvas"},
    {"index": 2, "role": "product_donor"}
  ],
  "init_image": null,
  "mask_image": null,
  "mask_invert": false,
  "strength": 0.85,
  "workflow": "quality",
  "width": null,
  "height": null,
  "steps": null,
  "seed": null,
  "transparent": false
}
```

Semantics:

- `direct` / `multi_reference`: all ordered input images are Qwen visual references.
- `visual_mask`: `images[0]` is the source, `images[1]` is the mask preview and subsequent images are donor references. `mask_image` must be omitted because the mask is an ordinary visual reference image in this mode.
- `native_mask`: `init_image` + `mask_image` drive the engine-level masked inpaint. Additional donor refs are permitted only after the combined CLI path passes integration tests.
- `circle_annotation` / `paint_annotation`: first image is a temporary annotated copy of the source; following images are donor references. The clean source path should be preserved separately for compositing and audit.

If the runtime cannot support the requested combination, return a typed error explaining the limitation. Do not silently discard or reorder images.

## 9.2 Extend `photocraft_edit_active`

Add:

- `reference_images[]` or equivalent ordered references.
- `edit_mode` with the same mode semantics as `egl_edit`.
- A way to export the active layer as clean `image_1` and annotation/mask as the appropriate additional input.
- A way to preserve the original active layer and optionally composite the result back through a mask.
- Clear response data describing which layers were read, replaced, hidden or created.

Do not turn the PhotoCraft mask layer itself into a donor reference unless the selected mode explicitly needs a visual mask image.

## 9.3 Create a shared image-input preparation module

Avoid implementing image handling separately in every MCP tool. Create a small shared module responsible for:

- Checking supported image file types and existence.
- Reading width/height and alpha metadata.
- Validating mask registration and dimensions.
- Creating a temporary visual-mask preview when required.
- Creating a temporary annotated-source composite.
- Preserving image input order.
- Downscaling references according to runtime limits while preserving aspect ratio.
- Keeping the original high-resolution files untouched.
- Cleaning up temporary files after the job completes or is cancelled.

## 9.4 Explicit output metadata

Every image generation/edit response should return:

- Output path.
- Actual dimensions.
- File type.
- Actual model/checkpoint and any LoRA used.
- Workflow, steps, CFG and seed.
- Reference count and effective reference size.
- Mask/annotation mode used.
- Alpha-validation result when applicable.
- Whether the output was inserted into PhotoCraft or only rendered to disk.

The agent should use returned metadata in the delivery summary instead of guessing.

## 9.5 Keep the current tool-surface strategy

Keep the compact, curated EggLab tool set. It is correct that the agent sees a small set of high-level tools and the PhotoCraft command search tool, not every raw command definition.

Avoid adding a new exposed model tool for every PhotoCraft command. Prefer:

- A few stable, typed high-level EggLab operations.
- A capability index.
- A command search operation.
- A command detail/schema lookup.
- A batch execution operation for safe, deterministic sequences.

---

# 10. Runtime and performance plan

## 10.1 Preserve the current strengths

The current engine already:

- Detects NVIDIA VRAM and checks free memory.
- Serializes diffusion jobs because multiple concurrent loads can fail on an 8 GB card.
- Downscales reference images (currently configured around a 768 px long-side default) to control the image-edit graph's memory use.
- Uses CPU offload/retry and output-size retry paths for low-memory conditions.
- Records model, workflow, dimensions, steps, CFG, seed and local-edit data.

Retain these mechanisms. Upgrade the planner so it uses them before it submits a render.

## 10.2 Runtime profiles

Expose a small runtime profile the agent can read at the beginning of an image job:

```json
{
  "engine": "stable-diffusion.cpp",
  "diffusion_checkpoint": "actual filename",
  "text_encoder": "actual filename",
  "vision_projector": "actual filename",
  "vae": "actual filename",
  "workflow": "quality | turbo",
  "turbo_kind": "base_plus_lora | separate_distilled_checkpoint | none",
  "cfg": 1,
  "steps": 25,
  "reference_max_side": 768,
  "max_output_dimension": 2048,
  "vram_total_gb": 8,
  "vram_free_gb": 4,
  "max_reference_images_tested": 4
}
```

`max_reference_images_tested` must be measured for the actual installed backend/settings. Do not assume the model's theoretical input count will fit in available VRAM.

## 10.3 Reference-count and size policy

- Model support: initially cap at 10 total image inputs because this is the model creator's published count.
- Local implementation: expose only the count that has passed EggLab runtime tests for the installed model/quantisation.
- Low-VRAM default: prefer one source plus one to three high-value visual references.
- Let the user add more references, but communicate that additional references can increase latency and memory use.
- Reduce donor reference resolution when they only provide appearance/style information. Preserve enough detail for logos, label text or critical product geometry when those are important.
- Do not downscale the target canvas and donor references identically without considering their roles.

## 10.4 Resolution policy

Qwen-Image-2.1 can create native outputs up to 2K. EggLab should offer clear profiles:

- **Preview:** fast, lower resolution for concept and prompt verification.
- **Standard:** normal final asset/design output.
- **High:** larger final output up to the active runtime's tested cap.
- **Follow source:** preserve source ratio and choose a size based on the actual source and current VRAM.

Never silently distort a source image to fit a square. Never report a target dimension if the engine returned a smaller dimension. The returned `sizeCapped` field should be surfaced to the agent and user.

## 10.5 Turbo profile naming

Current EggLab documentation describes Turbo as an 8-step LoRA path attached to the base checkpoint. Qwen/ComfyUI also documents a separate distilled Qwen-Image-2.1-Turbo checkpoint. Those are two different runtime configurations.

Keep the existing Turbo LoRA stable. Add a separate benchmark for the official distilled checkpoint only if the `stable-diffusion.cpp` build and packaging support it. Record the actual checkpoint and LoRA in every render; do not call both modes simply “Turbo” in diagnostic output.

## 10.6 CFG policy

Keep CFG at **1**. This matches the user's explicit preference and the documented standard ComfyUI Qwen-Image-2.1 workflows. Do not alter CFG as part of the agent redesign. When evaluating other sampler/step/model settings, hold CFG constant at 1 so comparisons are meaningful.

At CFG 1, the ComfyUI workflow documentation notes that negative conditioning is skipped, so a negative prompt is not an effective substitute for precise positive instructions in that workflow. EggLab's prompt compiler should therefore emphasize clear positive edits and preservation requirements.

---

# 11. Privacy, licensing and tool safety

## 11.1 Remote image privacy — fix the README promise

The current README says local models and renders stay on disk and only chat text goes to the selected provider. The current chat implementation also passes attached image files to OpenCode with `--file`, and it explicitly declares image input capability for custom providers when vision is enabled.

Therefore, when the selected agent model is a remote, vision-capable provider, user attachments and images returned for visual inspection may be sent to that provider. This does not mean every image always leaves the machine; local vision models remain local. It does mean the current one-line privacy promise is too broad.

Required changes:

1. Update the README to distinguish **local Qwen rendering** from **agent-model image understanding**.
2. Add a clear local/remote provider indicator.
3. Add an explicit setting to allow or disallow sending image attachments to a remote agent model.
4. When disabled, either use a local vision model or fall back to text-only reasoning with an honest notice that visual analysis is unavailable.
5. Disclose that canvas previews, generated images or attached user images may be provided to a remote vision model if that mode is enabled.
6. Never send a private source image to a prompt enhancer or remote vision model without the same policy.

## 11.2 Qwen commercial license — release blocker

The official Qwen-Image-2.1 license is titled **Qwen Research License Agreement**. It defines non-commercial use as research or evaluation and grants the model materials for non-commercial purposes only. It requires a separate commercial license for commercial use.

EggLab's own MIT license does not replace the Qwen model license. Before distributing Qwen weights as part of a commercial product or using those model materials for paid client work, request written commercial permission from Qwen and obtain legal review. Do not describe the Qwen weights as unrestricted open-source or commercially cleared until this is resolved.

This is a model-material licensing warning, not legal advice and not a determination of the copyright status of every output image.

## 11.3 User work and destructive operations

- Preserve source images, original layers and native documents.
- Keep generated outputs separate until the user requested replacement or the workflow explicitly requires it.
- Use versioned save/export paths for new deliverables.
- Ask before overwriting existing files, flattening an editable project, deleting user layers or closing unsaved documents.
- Keep tool paths constrained to the existing allowlisted roots and preserve the current no-arbitrary-shell model.

---

# 12. Evaluation plan: test finished work, not just tool calls

The upgrade needs a repeatable benchmark suite. A model reply that says “done” is not success. A successful tool call is not success. The final output and PhotoCraft state must be checked.

## 12.1 Image-editing test cases

| ID | Test | Pass condition |
|---|---|---|
| IE-01 | Single image direct edit | Requested visible change is present; key non-target content remains consistent |
| IE-02 | Multi-reference product transfer | Correct donor product is placed; logo, shape, label and material are retained |
| IE-03 | Three donor refs | Correct role of each input; correct `<imageN>` mapping; no swapped references |
| IE-04 | Qwen visual-mask input | Mask is treated as target-location guidance; no file-order corruption |
| IE-05 | Visual mask + two donor refs | Source, mask and donors all reach the model in the correct order |
| IE-06 | Native engine mask | Mask convention/inversion works; no silent donor drop; result is inspectable |
| IE-07 | Circle-guided edit | Three differently coloured marks are resolved into three correct operations |
| IE-08 | Paint-guided addition | New object is placed in the painted area and annotations do not remain visible |
| IE-09 | Annotation + donor reference | Annotated source and donor are both correctly passed |
| IE-10 | Strict preservation | Output is composited through the canonical mask; pixels outside the allowed blend region are unchanged |
| IE-11 | Transparent cut-out | Alpha is non-empty and meaningful; edge quality passes inspection |
| IE-12 | Transparent asset edit | Alpha survives editing and export |
| IE-13 | High-resolution edit | Output dimensions match the selected profile or are accurately reported when capped |
| IE-14 | Low-VRAM multi-reference edit | Job succeeds or returns a clear resource limitation without repeated wasteful retries |

## 12.2 Designing test cases

| ID | Test | Pass condition |
|---|---|---|
| DE-01 | Poster from a short brief | Coherent concept; generated visual assets; editable PhotoCraft composition; exact copy |
| DE-02 | Product ad with source product photo | Product identity and design preserved; new generated scene/visual assets integrated |
| DE-03 | Design with several transparent elements | Assets have valid alpha and are placed as separate layers |
| DE-04 | Text-only/vector layout | Completed in PhotoCraft without unnecessary image generation |
| DE-05 | Social campaign with two aspect ratios | Variant is correctly reflowed, not simply stretched |
| DE-06 | Exact Burmese/English mixed copy | Text is character-accurate and does not silently change language/script |
| DE-07 | User-provided style reference | Style is interpreted while content and brand constraints remain correct |
| DE-08 | Existing project refinement | Correct document is edited; layer structure and user work are preserved |
| DE-09 | Layered export | Native project and requested layer files exist and open correctly |
| DE-10 | Final flat export | Exported PNG matches visible PhotoCraft canvas dimensions/content |

## 12.3 PhotoCraft tool-discovery tests

- Ask for a normal poster: agent discovers only the required document, text, shape, layer and export commands.
- Ask for an unfamiliar PhotoCraft feature: agent searches the capability index, reads the exact command schema and then uses it.
- Ask for a type-only design: agent uses PhotoCraft-native operations without calling Qwen.
- Ask for a complex composition: agent uses a batch of safe deterministic commands rather than many unnecessary turns.
- Change the active document mid-job: agent notices document identity/revision drift and refreshes state before proceeding.
- Request destructive flatten/delete/overwrite: agent pauses for approval.
- Update PhotoCraft version: cached command recipes are checked against the new registry before use.

## 12.4 Metrics

Measure at least:

- End-to-end task success rate.
- Consistency across 3–5 trials.
- Correct tool selection.
- Tool-call precision (no unnecessary/hallucinated calls).
- Argument accuracy (right paths, image order, layer IDs, dimensions and command parameters).
- Exact-copy accuracy.
- Image-edit fidelity and preservation score.
- Alpha correctness.
- Design QA score.
- Steps per successful task.
- GPU time and wall-clock time per successful task.
- Context tokens loaded per task.
- User approval/revision rate.

Use executable checks where possible (file existence, exact text, dimensions, alpha stats, layer tree, saved document state). Human review is still necessary for visual quality and taste. Run the same golden cases against the current agent and the upgraded agent so improvement is observable.

---

# 13. Implementation roadmap

## Phase 0 — Baseline, safeguards and contract tests

**Purpose:** prevent regressions before rewriting the agent.

Tasks:

1. Create a clean branch and preserve the current agent package.
2. Capture the current `AGENT.md`, `ROUTER.md`, manifest and tool-schema baseline.
3. Build the initial golden benchmark from the test cases in this document.
4. Confirm the runtime model files and actual `CFG=1` setting.
5. Add tests for image order, mask input, alpha and actual output dimensions.
6. Correct privacy wording and add remote-image consent work.
7. Start Qwen commercial-license clarification.

**Exit gate:** baseline tests can run; image-sharing behaviour is accurately disclosed; current user files remain untouched.

## Phase 1 — Two-job brain and persistent job contracts

**Purpose:** change how the agent thinks before adding new UI complexity.

Files:

- `panel/AGENT.md`
- `panel/ROUTER.md`
- `panel/manifest.yaml`
- `panel/skills/*`
- `panel/templates/*`

Tasks:

1. Make `Image Editing` and `Designing` the two top-level jobs.
2. Rewrite the router around job selection, constraints, skill loading, execution and QA.
3. Introduce `CreativeJobSpec`, `ImageEditJob` and `DesignJob` schemas.
4. Store image roles and exact image ordering in job state.
5. Add skill descriptions and targeted trigger phrases.
6. Keep one primary agent and the existing progressive loader.

**Exit gate:** all basic existing test cases still pass, and the agent selects the correct top-level job on the first route.

## Phase 2 — Image Editing engine/API upgrade

**Purpose:** support all requested Qwen editing approaches reliably.

Files:

- `panel/mcp-server.mjs`
- `panel/service/engine.mjs`
- `panel/service/imagecheck.mjs` or a new shared image-preparation module
- `panel/skills/image-editing/`
- `panel/skills/multi-reference-editing/`
- `panel/skills/mask-annotation-editing/`
- `panel/references/qwen/`

Tasks:

1. Add explicit `edit_mode` and ordered image roles.
2. Add a Qwen visual-mask reference route.
3. Add canonical mask preparation and alignment checks.
4. Add an annotated-source temporary export route for circles/paint.
5. Extend `photocraft_edit_active` with donor references.
6. Test native `-ImageFile + -InitImg + -Mask` combinations.
7. Never silently drop or reorder donor refs.
8. Add strict preservation via deterministic composite when requested.
9. Add input/output dimensions and mode metadata to the result.
10. Add regression fixtures for all editing modes.

**Exit gate:** source + mask + donor refs works or returns an explicit supported-mode alternative; circle/paint workflows pass; exact preservation path is deterministic.

## Phase 3 — Designing production upgrade

**Purpose:** make EggLab produce complete, editable designs rather than standalone images.

Files:

- `panel/skills/design-direction/SKILL.md`
- `panel/skills/asset-planning/SKILL.md`
- `panel/skills/image-generation/SKILL.md`
- `panel/skills/photocraft-production/SKILL.md`
- `panel/references/design/`
- `panel/references/asset-planning/`
- `panel/templates/design-job.json`

Tasks:

1. Introduce a compact design brief and asset plan.
2. Add visual hierarchy, composition, type, palette and brand rules to the plan.
3. Generate required photographic/illustrative assets with Qwen.
4. Use true transparent assets for compositing elements when appropriate.
5. Build editable PhotoCraft composition with semantic layers.
6. Keep exact typography and critical copy native/editable where appropriate.
7. Make flat/layered/native-project delivery options explicit.
8. Add visual and document-state QA.

**Exit gate:** a brief can be turned into an editable PhotoCraft design with verified final export; a type-only design does not call Qwen unnecessarily.

## Phase 4 — PhotoCraft capability intelligence

**Purpose:** allow the agent to access the full application without context overload.

Files:

- `panel/service/photocraft.mjs`
- `panel/mcp-server.mjs`
- `panel/references/photocraft/`
- `panel/skills/photocraft-discovery/`

Tasks:

1. Build/maintain the versioned PhotoCraft capability index.
2. Improve command search and schema retrieval.
3. Add document snapshot/revision guards.
4. Add command risk/side-effect classification.
5. Add task-oriented recipes for common high-value designs.
6. Make raw command discovery the fallback for uncommon features.
7. Retain the small curated tool surface.

**Exit gate:** an unfamiliar PhotoCraft capability is discoverable and usable by the agent without loading the full command registry or requiring a code change for every individual command.

## Phase 5 — QA, telemetry and optimisation

**Purpose:** make the agent measurably better and reduce wasteful loops.

Tasks:

1. Run all golden cases 3–5 times.
2. Compare current vs upgraded task success and consistency.
3. Track wrong tool calls, wrong image order, prompt drift and unnecessary retries.
4. Record render cost and context loaded by each skill.
5. Add bounded retry policies with a reason for each retry.
6. Tune reference-size, render-size and Turbo profiles based on actual EggLab hardware.
7. Evaluate the official Turbo checkpoint separately from the current Turbo LoRA.
8. Evaluate the official Qwen prompt enhancer only as an optional component.

**Exit gate:** quality gains are measurable; no critical image or PhotoCraft workflow regresses; runtime cost remains acceptable.

---

# 14. First implementation tickets (recommended order)

| Priority | Ticket | Files / area | Definition of done |
|---|---|---|---|
| P0 | Fix remote image privacy statement | README, `chat.mjs`, settings UI | Remote vision image handling is explicit and user-controllable |
| P0 | Resolve Qwen commercial licensing | Release/legal docs | Written license clarification or commercial grant obtained before commercial use |
| P0 | Create golden task fixtures | `panel/evals/` | Baseline can verify image edit, design, PhotoCraft and privacy tasks |
| P1 | Two-job routing | `AGENT.md`, `ROUTER.md`, manifest | Every task starts in Image Editing or Designing, then loads specialists |
| P1 | Shared job schemas | `templates/`, job-state service | Image roles, constraints and design assets persist structurally |
| P1 | Qwen visual-mask path | `mcp-server.mjs`, engine | Original + mask image + donor references retain exact order |
| P1 | Active PhotoCraft edit donor refs | `mcp-server.mjs`, `photocraft.mjs` | Annotation/mask active-layer edit can use extra refs |
| P1 | Annotation temporary export | PhotoCraft bridge | Circle/paint layer is composited into a temporary annotated source; original remains safe |
| P1 | Native-mask compatibility test | Engine + integration tests | Combined image refs and actual init/mask path proved or explicitly unsupported |
| P2 | Design brief and asset manifest | Skills + templates | Design job contains brief, copy, assets and delivery requirements |
| P2 | PhotoCraft capability index | Bridge + references | Agent can search all documented capability categories with on-demand exact schemas |
| P2 | Document snapshot and revision checks | PhotoCraft service | Agent detects active-document changes before stateful edits |
| P2 | Design QA and output verification | QA skills/service | Correct copy, dimensions, alpha, layer structure and export are checked |
| P3 | Turbo checkpoint comparison | Engine/model packaging | Official checkpoint benchmarked against existing LoRA at CFG 1 |
| P3 | Prompt enhancer evaluation | Optional runtime | Measured gains justify the additional model and resource footprint |

---

# 15. Example of the new agent's decision process

## Example A — user asks to change a product photo

1. Route to **Image Editing**.
2. Inspect the attached image and active PhotoCraft document.
3. Determine whether the task is direct edit or requires donor references.
4. Load only image-editing and multi-reference skills.
5. Assign the source to `<image1>` and each donor to its correct `<imageN>` role.
6. Compile the prompt with the product identity and exact brand marks preserved.
7. Check engine status and use CFG 1.
8. Render.
9. Inspect the image and product details.
10. If the edit spills outside the target and strict preservation is needed, composite through a mask.
11. Deliver the result or insert it into the active PhotoCraft document if requested.

## Example B — user draws a red circle around an object and asks to replace it

1. Route to **Image Editing**.
2. Inspect the PhotoCraft layer tree and identify the source and annotation layer.
3. Export a temporary annotated source; keep the clean original.
4. Load the mask/annotation editing skill.
5. Write an instruction mapping the red circle to the replacement.
6. If donor images exist, add them after the annotated source and map their roles.
7. Render with CFG 1.
8. Inspect for remaining red pixels/circle strokes and unrelated changes.
9. Use deterministic compositing only if requested or needed for exact preservation.

## Example C — user asks for a promotional poster

1. Route to **Designing**.
2. Extract audience, purpose, format, exact copy and brand constraints.
3. Build a visual concept and asset plan.
4. Generate the hero visual and required supporting elements with Qwen.
5. Validate transparent assets.
6. Inspect the active PhotoCraft document or create a new one at the correct size.
7. Place assets as individual layers; create type, shapes, logos and layout natively.
8. Inspect the complete canvas and run QA.
9. Save the native project and export the requested PNG/layered assets.
10. Deliver verified paths and dimensions.

## Example D — user asks for a clean type-only layout

1. Route to **Designing**.
2. Load design-direction, PhotoCraft production and QA.
3. Do not invoke Qwen because image generation adds no value.
4. Create editable typography, vectors, layout and exports in PhotoCraft.

---

# 16. Non-goals and decisions to avoid

- Do not create separate image-edit and design agents.
- Do not expose the entire PhotoCraft command registry to every model request.
- Do not make every visual job call Qwen even when PhotoCraft-native design is more appropriate.
- Do not force every generated image through PhotoCraft before delivery.
- Do not treat Qwen visual-mask references and engine-native masks as the same API.
- Do not silently drop donor references if a mask is present.
- Do not claim an unchanged-pixel boundary unless the deterministic composite enforces it.
- Do not introduce the 9B prompt enhancer into the default 8 GB installation without performance evidence.
- Do not alter CFG 1 as part of this upgrade.
- Do not claim commercial clearance for Qwen-Image-2.1 until the licensing issue is resolved.
- Do not keep an obsolete README privacy promise after image attachments are sent to a remote vision provider.

---

# 17. Research references

## Primary model documentation

1. Qwen, **Qwen-Image-2.1 official announcement and editing examples**: https://qwen.ai/blog?id=qwen-image-2.1
2. Qwen, **Qwen-Image-2.1 official repository / README**: https://github.com/QwenLM/Qwen-Image-2.1
3. Qwen, **Qwen-Image-2.1 model card**: https://huggingface.co/Qwen/Qwen-Image-2.1
4. Qwen, **Qwen-Image-2.1 Research License**: https://github.com/QwenLM/Qwen-Image-2.1/blob/main/LICENSE
5. Qwen, **Image-edit prompt enhancer system prompt**: https://huggingface.co/Qwen/Qwen-Image-2.1-PE-I2I/blob/main/system_prompt.txt
6. Qwen, **Prompt rewrite implementation and model requirements**: https://github.com/QwenLM/Qwen-Image-2.1/tree/main/prompt_rewrite

## Runtime/workflow documentation

7. ComfyUI, **Qwen-Image-2.1 workflow guide**: https://docs.comfy.org/tutorials/image/qwen/qwen-image-2-1
8. Comfy, **Qwen-Image-2.1 image-edit example workflow**: https://comfy.org/hub/workflows/qwen-image-2-1-image-edit-5fbe136ba6f9/
9. stable-diffusion.cpp, **Qwen Image 2.1 usage guide**: https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/qwen_image_2.1.md

## Agent architecture and evaluation

10. OpenCode, **Tools and MCP tool discovery**: https://opencode.ai/docs/tools/
11. Anthropic, **Agent Skills / progressive disclosure documentation**: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview
12. NVIDIA, **How to Evaluate AI Agents From Tool Calls to Task Completion** (21 September 2026): https://developer.nvidia.com/blog/how-to-evaluate-ai-agents-from-tool-calls-to-task-completion

## EggLab source reviewed

13. EggLab repository: https://github.com/YanNyeinHtet/EggLab
14. `panel/AGENT.md`: https://github.com/YanNyeinHtet/EggLab/blob/master/panel/AGENT.md
15. `panel/ROUTER.md`: https://github.com/YanNyeinHtet/EggLab/blob/master/panel/ROUTER.md
16. `panel/manifest.yaml`: https://github.com/YanNyeinHtet/EggLab/blob/master/panel/manifest.yaml
17. `panel/mcp-server.mjs`: https://github.com/YanNyeinHtet/EggLab/blob/master/panel/mcp-server.mjs
18. `panel/service/engine.mjs`: https://github.com/YanNyeinHtet/EggLab/blob/master/panel/service/engine.mjs
19. `panel/service/chat.mjs`: https://github.com/YanNyeinHtet/EggLab/blob/master/panel/service/chat.mjs
20. `panel/service/photocraft.mjs`: https://github.com/YanNyeinHtet/EggLab/blob/master/panel/service/photocraft.mjs

---

## Final direction

EggLab should become a single, skilled creative director with two unmistakable production modes:

- **Image Editing:** understands how to use Qwen's full editing language — direct prompts, references, visual masks, true masks, circles, paint annotations and transparency.
- **Designing:** thinks through a creative brief, generates its visual assets, uses PhotoCraft as a complete native creative workspace, then delivers an editable and verified design.

The agent knows the whole workshop, but it only brings the tools and instructions for the current job onto the workbench. That is the core architecture to build.
