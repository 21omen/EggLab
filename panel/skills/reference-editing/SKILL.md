---
name: reference-editing
description: Instruction edits, marked-photo and separate-mask local edits, sketch guidance, multi-reference roles, identity/product preservation, scoped changes and seam checks.
---
# Reference Editing

Qwen-Image-2.1 is a unified generator/editor. Treat an edit as **"change this source"**, not as a new text-to-image prompt. Use `image-generation` only when there is no source canvas to preserve.

## 1. Classify before choosing a tool

| Request | Workflow | Primary tool |
|---|---|---|
| Change/replace/remove/relight/retouch an existing image | Instruction edit | `egglab_edit` (full image) or `egglab_photocraft_edit_active` (active layer) |
| Photo has circles, arrows or brush marks drawn on it | Marked-photo edit | `egglab_photocraft_edit_active` |
| A separate layer contains the painted mask | Separate-mask edit | `egglab_photocraft_edit_active` with `mask_layer` |
| A sketch supplies shape/composition | Sketch-guided edit | `egglab_edit` with the sketch as a tagged reference |
| Several images supply different attributes | Multi-reference edit | `egglab_edit` with explicit roles |
| New scene using a person/product as identity anchor | Reference-driven generation | `egglab_edit` (not `generate`) |
| Transparent cut-out or RGBA edit | Transparency workflow | `transparency` skill + `egglab_generate`/`egglab_edit` |

Do not route an edit through `egglab_generate`. `generate` has no source canvas and cannot preserve identity or untouched pixels.

## 2. Inspect inputs and assign roles

1. Call `egglab_photocraft_layers` when the work is in PhotoCraft. Identify the active canvas, annotation layer/layer marks, and any separate mask layer.
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

Write a short, imperative instruction with five parts:

1. **Action** — replace/remove/add/change/relight.
2. **Target** — object/person/material/region.
3. **Source** — which image, mark, sketch or mask defines the change.
4. **Preservation** — one blanket clause for identity, pose, framing, product geometry, background, count (only what matters).
5. **Integration** — perspective, lighting, scale, contact shadow, material response.

Do **not** expand a simple edit into a full scene description. Do **not** describe preserved content in detail; concrete descriptions of untargeted content make it drift. Name untargeted content by type/position/role.

Examples:

```text
Replace the jacket in <image1> with the jacket from <image2>.
Use the design, fabric and colour from <image2>.
Preserve the person's face, identity, pose, body proportions and background.
Fit the clothing naturally to the original lighting.
```

```text
Remove the object in the red circle from <image1>.
Reconstruct the background and floor naturally, matching perspective, texture and light.
Remove the red annotation and preserve all unmarked areas.
```

## 4. PhotoCraft annotations — marks drawn on the photo

PhotoCraft already lets the user draw directly on the reference photo. Those marks are **guidance, not final artwork**. Do not ask the user to redraw them.

1. Inspect the active layer at native size. Identify each mark's colour/shape and the object or area it targets.
2. Map each mark to one requested edit, in the user's order. Do not invent a semantic meaning for a colour unless the user assigned one.
3. Use `egglab_photocraft_edit_active` with the photo as the active layer:
   - Whole marked photo: omit `region`; the exported active layer includes the marks.
   - One marked object: pass `region:[x,y,width,height]` in document pixels and use `mode:"crop"` or `"inpaint"` depending on the surface.
4. In the prompt, name the marks and their targets, explicitly say the annotation must be removed from the final result, and protect unmarked areas.
5. If the annotations are on a **separate layer** rather than the photo layer:
   - Export a marked composite with `egglab_photocraft_export_flat` (do not pass the annotation layer alone as the canvas).
   - Run `egglab_edit` with the flat marked image as `<image1>`.
   - Place the result back with `egglab_photocraft_place` and keep the original layer as backup.
   - Still tell the model to remove the marks.

Multiple marks example:

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

1. `egglab_photocraft_layers` → find the exact mask layer name and the active source layer.
2. Activate the source/canvas layer (not the mask layer).
3. Call `egglab_photocraft_edit_active` with:
   - `mask_layer: "Mask"` (the exact layer name).
   - `mask_invert: true` only when the mask uses black/opaque as the editable area and white/transparent as keep.
   - `strength` 0.25–0.5 for a gentle retouch, higher for a full replacement.
4. The tool exports the active canvas and the named mask layer, aligns the mask to the canvas bounds, and runs the engine with `--init-img --mask --strength`. The mask is not sent as a donor image.
5. In the prompt: say the mask defines the editable region; describe what appears inside it; preserve everything outside it; the mask itself must not appear.
6. Inspect the mask boundary at native size. The model can overfill a mask; raise `strength` only when needed, or ask the user to widen the mask (do not invent a new mask UI).

Example:

```text
Use the first image as the original canvas and the separate mask as the editable region.
Replace only the masked area with a realistic potted fern.
Match the original perspective, lighting and scale.
Preserve every area outside the mask, including the table, wall and window.
The mask is region guidance only and must not appear in the result.
```

Mask conventions:
- White/opaque paint = editable; black/transparent = keep (default).
- Use `mask_invert` for an inverted black/white mask.
- The mask layer must be separate from the active canvas. A layer mask attached to the canvas is not the same input; use a `region` edit or export a separate mask layer.
- If both `region` and `mask_layer` are supplied, the mask layer wins; choose one deliberately.

## 6. Sketch-guided work

- A sketch is a **structure/composition reference**, not strict ControlNet geometry.
- State the adherence level: loose concept, composition guide, or close structural reference.
- For an edit: `<image1>` = base canvas, `<image2>` = sketch; preserve the base's identity/lighting while following the sketch's shape and arrangement.
- For generation: send the sketch as a reference and describe materials/lighting/rendering; do not promise exact line tracing.
- Translate only important structure into words: silhouette, floor count, major openings, object placement, camera angle.
- Inspect for invented floors, warped proportions or ignored openings; correct them in the next pass.

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
