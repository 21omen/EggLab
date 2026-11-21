---
name: reference-editing
description: Instruction edits, marked-photo and separate-mask local edits, sketch guidance, multi-reference roles, identity/product preservation, scoped changes and seam checks.
---
# Reference Editing

Qwen-Image-2.1 is a unified generator/editor. Treat an edit as **"change this source"**, not as a new text-to-image prompt. Use `image-generation` only when there is no source canvas to preserve.

## 1. Classify before choosing a tool

| Request | Workflow | Primary tool |
|---|---|---|
| Change/replace/remove/relight/retouch an existing image | Instruction edit | `egl_edit` (full image) or `egl_photocraft_edit_active` (active layer) |
| Photo has circles, arrows or brush marks drawn on it | Marked-photo edit | `egl_photocraft_edit_active` |
| A separate layer contains the painted mask | Separate-mask edit | `egl_photocraft_edit_active` with `mask_layer` |
| A sketch supplies shape/composition | Sketch-guided edit | `egl_edit` with the sketch as a tagged reference |
| Several images supply different attributes | Multi-reference edit | `egl_edit` with explicit roles |
| New scene using a person/product as identity anchor | Reference-driven generation | `egl_edit` (not `generate`) |
| Transparent cut-out or RGBA edit | Transparency workflow | `transparency` skill + `egl_generate`/`egl_edit` |

Do not route an edit through `egl_generate`. `generate` has no source canvas and cannot preserve identity or untouched pixels.

## 2. Inspect inputs and assign roles

1. Call `egl_photocraft_layers` when the work is in PhotoCraft. Identify the active canvas, annotation layer/layer marks, and any separate mask layer.
2. Inventory every supplied image. Assign exactly one primary role:
   - **Canvas** — framing/composition survives; edits happen here.
   - **Identity donor** — face/person likeness.
   - **Product/design donor** — silhouette, components, branding.
   - **Material/lighting/style donor** — one named attribute only.
   - **Sketch** — structure/composition guidance.
   - **Mask** — region selector; never a visual donor.
3. Use `<image1>`, `<image2>`, … tags when more than one image is sent. `<image1>` is the canvas; every other tag gets an explicit role.
4. If roles are genuinely ambiguous and choosing wrong would change the result, ask one focused question. Otherwise state the interpretation and proceed.
5. Never treat a mask as a donor, or a donor as a mask. Never use the user's annotation layer as a texture/style reference.

## 3. Prompt formula for edits

Qwen-Image-2.1 is trained on **detailed, imperative edit prompts** (the official
prompt rewriter for edits produces long prompts). Write an imperative
instruction with five parts, and be generous about the CHANGE:

1. **Action** — replace/remove/add/change/relight.
2. **Target** — object/person/material/region, named precisely.
3. **Result state** — describe what the target should look like afterwards
   (materials, colours, lighting integration, contact shadows). This is where
   detail belongs; under-specified changes are the top cause of bad edits.
4. **Preservation** — one blanket clause for identity, pose, framing, product
   geometry, background, count (only what matters).
5. **Integration** — perspective, lighting, scale, material response.

Do not describe preserved content in detail — concrete descriptions of
untargeted content make it drift. Name untargeted content by type/position/role.
One-line prompts underperform on this model; a bare "make the sky sunset" is
the input to the official rewriter, not the final prompt.

Examples:

```text
Replace the jacket in <image1> with the jacket from <image2>.
Use the design, fabric and colour from <image2>.
Preserve the person's face, identity, pose, body proportions and background.
Fit the clothing naturally to the original lighting.
```

```text
Remove the object inside the red circle from <image1>.
Reconstruct the background and floor naturally, matching perspective, texture and light.
Remove the red annotation and preserve all unmarked areas.
```

## 3.1 Chat attachments: mask images and drawn descriptions

Users often attach files directly instead of using PhotoCraft layers. Classify
each attachment before prompting:

| Attachment | Meaning | Tool path |
|---|---|---|
| Photo + blank layer painted with the PhotoCraft brush | Separate MASK: white/alpha = change, black/transparent = keep | `egl_edit` with `init_image` (photo) + `mask_image` (mask) + `strength` |
| Photo with circles / sketched areas / handwritten notes | DRAWN DESCRIPTION: the marks are the instructions | `egl_edit` with the marked photo as `<image1>`; name each mark and its target, say the marks are removed |
| Extra photos (hat, garment, character) | Donors with explicit roles | `egl_edit` with `<image2>`+ and one role per donor |

Rules:
- The mask is a selector, never artwork: do not pass it in `images`; do not ask
  the model to render it.
- PhotoCraft layer references are exported **full-canvas at their true
  position** (a painted mask layer arrives the same size as the image). If a
  mask still has a different size than the image, the engine refuses it — use
  `egl_photocraft_edit_active` with `mask_layer` (native alignment) or
  re-export the layer full-canvas.
- Strength follows the task, not the attachment: replace/add/remove 0.75–0.95;
  recolour or retouch 0.4–0.6.
- **Never mention the mask's colour** in the prompt ("the red masked area"
  makes the model paint red). Say "the masked region" and describe what the
  area should become (the target state), e.g. "the masked region shows the
  clean desk surface continuing behind the subject".
- Masked edits must start from a CLEAN source. If the layer already contains a
  previous bad render, select the original layer (or the user's source) instead
  of stacking edits on contamination.
- With drawn marks plus donors, `<image1>` is the marked canvas and the marks
  name WHERE; the donor names WHAT (e.g. "put the hat from <image2> on the girl
  inside the blue circle; remove the blue circle").
- Multiple marks in one photo are allowed: map each colour/shape to one change
  in the user's order and finish with one removal + preserve clause.

Worked example A — mask attachment:
```text
Use the first image as the canvas and the second image as the editable mask
(white = change, black = keep). Inside the masked area, replace the object with
a realistic potted fern matching the original perspective and lighting.
Preserve everything outside the masked area.
```

Worked example B — drawn description plus donor:
```text
<image1> is the canvas with drawn instructions.
- Red circle: change the dog's leg inside it to soft pink.
- Red sketched area: replace that area with clean flames.
Preserve the rest of the dog, the floor and the lighting.
Remove all drawn marks and sketches from the final image.
```

```text
<image1> is a group photo with a blue circle around one girl.
<image2> is a red hat.
Put the red hat from <image2> on the girl inside the blue circle, fitted to her
head and lighting. Leave every other person and the background unchanged.
Remove the blue circle.
```

## 5.1 Selection → mask (deprecated)

Building masks by filling the selection proved unreliable in PhotoCraft (the fill does not clip to the selection; the panel catches the all-white result and refuses it). Use a **painted mask layer** instead (see §5): the panel selects painted colour by alpha, exports the layer full-canvas, and composites the render back through the mask. If the panel reports an all-white mask, the mask layer content is wrong — repaint it.

## 4. PhotoCraft annotations — marks drawn on the photo


The model is **trained on circle-guided and annotation-guided local editing**;
on this engine the whole-marked-photo path is verified to be the strongest
local edit (change applied inside the circle, marks removed, everything outside
untouched). Do not reach for region/mask machinery when the marks themselves
are the region selector.

1. Inspect the active layer at native size. Identify each mark's colour/shape and the object or area it targets.
2. Map each mark to one requested edit, in the user's order. Do not invent a semantic meaning for a colour unless the user assigned one.
3. **Preferred: whole-layer edit with the marks visible.** Use `egl_photocraft_edit_active` with the photo as the active layer and **omit `region` and `mask_layer`**: the exported layer includes the marks, and the model reads them as region selectors. In the prompt, name each mark (colour/shape → target), describe the intended result inside it, say the annotation must be removed, and protect unmarked areas.
4. Only use a `region` edit when the marked photo contains something the marks must NOT touch nearby and the model keeps drifting (the crop hides the distractor). Then expand the region box well beyond the object for context, and prefer `mode:"inpaint"` on flat surfaces. A tight surgical crop is the last resort — it strips context the model needs.
5. **Donors ride along with the marks.** When the user supplies extra reference images (e.g. a hat photo for the circled girl), pass them as `reference_images` on `egl_photocraft_edit_active` (or `<image2>+` on `egl_edit`) and tie each donor to a mark in the prompt. The source is never listed twice; the mask layer is never a donor.
5. If the annotations are on a **separate layer** rather than the photo layer:
   - Export a marked composite with `egl_photocraft_export_flat` (do not pass the annotation layer alone as the canvas).
   - Run `egl_edit` with the flat marked image as `<image1>`.
   - Place the result back with `egl_photocraft_place` and keep the original layer as backup.
   - Still tell the model to remove the marks.

Multiple marks example (verified pattern):

```text
Use the drawn marks as edit guidance:
- Red circle: change the hair to a short dark style.
- Blue circle: remove the wristwatch and rebuild the sleeve.
- Green painted area: replace it with neutral grey fabric.
Preserve the person's identity, pose, framing and background.
Remove all annotation marks from the final image.
```

## 5. PhotoCraft separate mask — painted on its own layer

Use this when the user painted a mask on a **separate layer** (for example `Mask`). The active layer remains the original canvas.

1. `egl_photocraft_layers` → find the exact mask layer name and the active source layer.
2. Activate the source/canvas layer (not the mask layer).
3. Call `egl_photocraft_edit_active` with:
   - `mask_layer: "Mask"` (the exact layer name).
   - `mask_invert: true` only when the mask uses black/opaque as the editable area and white/transparent as keep.
   - `strength` **scaled to the task (verified on this engine)**:
     | Task | strength |
     |---|---|
     | Replace/add/remove an object, rewrite a feature | **0.75–0.95** |
     | Recolour, material/texture or lighting change | 0.4–0.6 |
     | Subtle retouch (skin, blemish, tonal) | 0.25–0.35 |

     The old 0.4 default was measured to leave a replacement almost unchanged —
     a masked edit that "did nothing" almost always means strength was too low.
     Pair a high strength with a `quality` run and inspect the seams.
4. The tool exports the active canvas and the named mask layer, aligns the mask to the canvas bounds (white/opaque = repainted, black/transparent = kept), and runs the engine with `--init-img --mask --strength`. The mask is not sent as a donor image.
5. In the prompt: use the **native-mask template** above - describe the WHOLE image first, then what the masked area becomes, one blanket preservation clause. Never mention the mask, its colour, or pixel promises.
6. Inspect the mask boundary at native size. If the change is weak, raise `strength` (not the prompt length). If edges show, the mask feather/blend is the issue — say so, or ask the user to widen the mask (do not invent a new mask UI).

Example:

```text
A poster of a teenage boy at a white desk with cartoon mascots on a deep blue background. In the masked region the deep-blue background continues cleanly with no text or marks. The boy, mascots, desk, headline and all other elements stay exactly as they are.
```

Native-mask prompt template (official Qwen-Image-2.1 format — the engine-mask
prompt describes the whole target image, because the mask marks the region):

1. Describe the WHOLE target image first (scene, subject, style, background).
2. Then the masked change: what the region becomes, concretely and visibly.
3. One blanket preservation clause naming untargeted content by type/position/role.
4. Never mention "the mask", its colour, or "every pixel" — the model cannot see
   a mask, and detailed preserved-appearance language makes content drift.

Example:
"A poster of a teenage boy at a white desk with cartoon app mascots, on a deep
blue background. In the masked region the deep-blue background continues
cleanly with no text or marks. The boy, mascots, desk, headline and all other
elements stay exactly as they are."

Mask conventions:
- White/opaque paint = editable; black/transparent = keep (default).
- Use `mask_invert` for an inverted black/white mask.
- The mask layer must be separate from the active canvas. A layer mask attached to the canvas is not the same input; use a `region` edit or export a separate mask layer.
- If both `region` and `mask_layer` are supplied, the mask layer wins; choose one deliberately.

## 6. Sketch-guided work

Sketch → photo is a **trained behaviour of this model** (the official docs turn
a yacht line sketch into a photorealistic render). It is not loose concept
guidance — it is structure to be translated.

- **Translate the sketch's structure into words exhaustively**: enumerate the
  silhouette/body shape, every major component, counts, openings, placements
  and the camera angle, phrased as "Build <the photo> with the structure shown
  in the input sketch: …". Then add materials, lighting and photorealistic
  rendering. The official pattern pairs the sketch with a long structural
  description; a short prompt that just says "make this sketch a photo"
  underperforms badly.
- For an edit: `<image1>` = base canvas, `<image2>` = sketch; preserve the
  base's identity/lighting while following the sketch's shape and arrangement.
- For generation from a sketch: send the sketch as the reference and describe
  the structure it shows in detail, then the materials/light.
- Sketches are structure, not texture: do not promise exact line tracing of
  strokes, but DO promise the structural elements you name in words.
- Inspect against the sketch for invented components, wrong counts, warped
  proportions or ignored openings; correct them in the next pass.

## 7. Multi-reference composition

- Official Qwen-Image-2.1 documentation states up to 10 reference images; verify the live EggLab request and VRAM before sending a large set.
- `<image1>` is the canvas whose framing survives. Donors come after it.
- State exactly what each donor contributes and what it must **not** contribute.
- For identity, point at the reference rather than describing the face.
- For products, preserve silhouette, component count, markings and branding unless a redesign is requested.
- Do not ask the model to copy every property from a donor when only one attribute should transfer.
- If references conflict, resolve the conflict before rendering (e.g. two different jacket designs).

Common roles:
- Virtual try-on: person canvas + garment/shoes/bag donors.
- Product placement: scene canvas + product donor.
- Material transfer: object canvas + material donor; transfer finish, not shape.
- Lighting transfer: subject canvas + lighting reference; transfer direction/softness/colour, not geometry.
- Group portrait: scene canvas + one identity donor per person; state left-to-right order.
- Interior: room canvas + furniture/material donors.

## 8. Sequential edits and identity

- Prefer one meaningful change per pass.
- Use a fresh seed for a new creative iteration unless the user explicitly wants reproducibility. Reusing a seed across chained edits has been reported to cause oversaturation/fragments.
- Keep the source and each result distinguishable; do not overwrite the approved source layer.
- After each pass, check identity, object count, product geometry, text, pose, framing and untouched regions.
- If unrelated areas drift, tighten the target instruction or use a region/mask edit; do not just add more prose.

## 9. Capability boundaries

- No pixel-perfect preservation guarantee; inspect and use PhotoCraft compositing/masks for exact invariants.
- No strict ControlNet/pose/depth/edge control through the current EggLab integration; do not claim it.
- No guaranteed exact typography/logo reproduction; finish exact text with editable type in PhotoCraft.
- Do not assume Turbo is active; check live status/settings before quoting steps.
- The Qwen research documents are capability references, not runtime guarantees. Verify model/backend behavior in the live panel.

## 10. QA before reporting

- Requested change visible and correctly scoped.
- Identity, pose, framing, object count and background preserved where requested.
- Product geometry, logos and markings intact.
- Marked/masked region clean; no annotation/mask visible; boundary convincing at native size.
- Sketch structure respected without invented contradictions.
- Transparency/alpha verified when the deliverable requires it.
- Report what was actually checked; do not claim fidelity you have not inspected.

Load `references/reference-editing/reference-mapping.md` and
`references/reference-editing/local-edit-and-seam-control.md`, plus the Qwen
feature and seamless-local-edit research when making Qwen edit decisions.
