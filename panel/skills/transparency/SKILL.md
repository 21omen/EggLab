---
name: transparency
description: Produce, extract, edit and verify true-alpha RGBA assets with Qwen-Image-2.1, including transparent cut-outs and mask-based fallbacks.
---
# Transparency and RGBA

Qwen-Image-2.1 has native RGBA generation/editing. Use it rather than a white-background render plus guessed removal when the deliverable is a real alpha asset.

## 1. Classify the alpha task

| Task | Route |
|---|---|
| New subject/object cut-out | `egglab_generate` with `transparent: true` (quality for edges) |
| Extract a subject from a photo | `egglab_edit` with `transparent: true`, or PhotoCraft selection/mask + reference edit |
| Edit an existing transparent asset | `egglab_edit` with `transparent: true`; preserve alpha |
| Reusable layer for compositing | Transparent generation/edit + `egglab_check_alpha` |
| White-background render that only looks transparent | Not an alpha asset; re-render with transparent mode |

## 2. Native RGBA generation

- Use `transparent: true`; the panel supplies the official RGBA prompt template, so describe the subject rather than saying “white background”.
- Quality mode for edges/fine detail; Turbo only for composition tests.
- State whether a floor/contact shadow belongs in the asset or will be added in PhotoCraft. A cut-out usually has no baked background or cast shadow.
- Avoid “sticker/outline/die-cut” language unless the user actually wants a graphic outline.
- Prompt the subject with edge-relevant detail: hair, fur, glass, smoke, translucent fabric, thin straps, product highlights.

Official Qwen alpha prompt shape (the panel wraps this):
> This is an RGBA image with transparency. `<subject/scene>`. The image has alpha channel and the background is transparent.

## 3. Subject extraction from a photo

- Prefer a reference edit with `transparent: true` and a prompt that removes the background while preserving the subject.
- For a precise local extraction, use PhotoCraft's existing selection/layer-mask tools, then export the masked layer; do not claim the model performed a pixel-perfect selection it did not.
- Preserve identity, product silhouette, component count and markings.
- Inspect hair, fur, semi-transparent edges, reflections and halos at 100%.

## 4. Editing an existing transparent asset

- Keep `transparent: true`; say “preserve the existing alpha channel” in the prompt.
- Do not add a background or flatten the asset.
- After the edit, verify alpha still exists; a visually checkered preview is not proof.
- If the model returns an opaque result, retry with a clearer alpha instruction or restore the alpha with PhotoCraft rather than shipping an opaque file.

## 5. Validation

1. Read the tool's alpha verdict/percentages/bounds/edge-touch fields.
2. Run `egglab_check_alpha` on the actual exported PNG.
3. Confirm the file format preserves alpha (PNG/WebP; JPEG does not).
4. Inspect edges at 100%: fringe, halo, matte, cut hair/fur, transparent holes, semitransparent glass.
5. Compare the subject bounds with the intended placement; check no unintended crop.
6. For compositing, place the asset on a contrasting background and inspect the edge again.

Do not report a cut-out as successful just because the preview shows a checkerboard. The alpha channel and edge pixels are the evidence.

## 6. Fallbacks and limits

- If native alpha fails, use PhotoCraft selection/layer masks and export the masked layer.
- Do not promise perfect hair/fur/glass extraction; disclose limitations and plan manual finishing.
- Do not use a mask layer as a visual donor; a mask selects a region, it is not texture or style.
- Qwen weights are under the Qwen Research License; do not assert commercial rights.

Load `references/transparency/alpha-workflow.md` and
`references/research/local/qwen-image-2.1-features.md`.
