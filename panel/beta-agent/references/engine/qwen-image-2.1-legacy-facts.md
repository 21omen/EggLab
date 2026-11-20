# Qwen-Image-2.1 engine profile — verified against the live EggLab runtime

This replaces the old legacy guesswork with facts measured on the actual EggLab
engine (stable-diffusion.cpp build, Qwen-Image-2.1 GGUF + Qwen3-VL text encoder
+ 2.1 VAE + community Turbo LoRA). Cross-checked against the official
`QwenLM/Qwen-Image-2.1` model card (Sep 2026) and `stable-diffusion.cpp` docs.
Still verify live state with `egl_status` before model-sensitive work.

## What this model is
- **Unified model**: one checkpoint does text-to-image AND reference editing.
  Editing is native, not a bolt-on. Text encoder: Qwen3-VL-8B (sees reference
  images directly — visual instructions in the image are first-class inputs).
- **Native local editing (official capability)**: the model was trained to
  follow **circles, painted annotations and separate masks drawn ON the image**
  as region selectors. Showcased officially: circle-guided multi-region editing
  (remove watch, change hair, replace clothing in one pass).
- Up to 10 reference images; `<image1>`'s framing/aspect survives by default.
- Native RGBA transparency, decided by the prompt (see Transparency below).

## Verified local-edit paths (measured on this engine, 768×512 Turbo)

### Path 1 — drawn circle/marks on the photo (BEST for most local edits)
Send the marked photo as a normal reference edit. No mask, no init, no
strength tuning. Measured result: replaced the object inside a drawn red ring
exactly, removed the ring completely, left everything outside untouched.

Prompt shape that works (measured):
`Inside the red circle, replace the <object> with <detailed result description>
matching the lighting. Keep <the rest> exactly the same. Remove the red circle
from the image and keep everything outside the circle unchanged.`
- Name each mark's color/shape and its target; multi-mark maps are supported.
- This is the FIRST choice for "circle / drawn area" requests.

### Path 2 — pixel mask via init image + strength (for painted masks, no visible annotation)
Engine flags: `--init-img` + `--mask` + `--strength`. **Mask semantics
(measured): WHITE area = repainted, BLACK area = kept.**
- **Strength is the make-or-break knob (measured)**:
  - 0.4 (the old default) — verified to leave the object almost unchanged. Too
    weak for any real replacement. Do not use it for content changes.
  - 0.75–0.95 — replace/add/remove an object or rewrite a feature.
  - 0.4–0.6 — recolor, retouch, material/texture or lighting change.
  - 0.25–0.35 — subtle skin/blemish/tonal pass only.
- Prompt must describe the **final state of the masked area** ("the masked
  area shows a small green potted fern…"), plus one preserve clause for the
  unmasked content. The mask itself never appears in the output.
- A full replacement wants high strength AND high quality preset; turbo is
  acceptable for tests but check seams at native size.

### Path 3 — region crop edit (rectangle)
Edits a tight crop and feathers it back. Use only for subjects that carry
their own context (an isolated product on a plain surface). A tight crop of a
flat or contextual area makes the model guess the surroundings — prefer Path 1
or Path 2. If you do crop, EXPAND the rectangle well beyond the object so the
model keeps context, and let the feather band do the blending.

## Prompt style for edits (official guidance)
- The official prompt-rewriter for edits produces **long, detailed, imperative
  prompts** that name the change, describe the resulting state concretely, and
  reference `<image1>`/`<image2>` roles. Short one-liners underperform.
- Be generous about the TARGET of the change (what it should look like
  afterwards, materials, lighting integration); keep preserved content named by
  role, not described in detail.
- Edit output inherits `<image1>`'s aspect by default; say otherwise explicitly.

## Sketch input (verified official pattern)
Sketch → photo is a trained behavior. The official example turns a yacht line
sketch into a photorealistic render by **translating the sketch structure into
words exhaustively** ("Build the vessel with the structure shown in the input
sketch: a long low hull; one tall mast stepped forward; … one small square
window at the bow, an upper line of five round portholes…"). Do that:
enumerate every structural element the sketch shows (hull/body shape, counts,
openings, placements, camera angle), then describe materials, lighting and
photorealism. Inspect against the sketch and fix named mismatches.

## Engine facts and limits
- Steps/CFG: panel presets are quality 40 steps @ CFG 1.0, turbo 8 steps @ 1.0
  (Turbo = fixed 8-sigma schedule, `--sigmas qwen-image-2.1-turbo`). The
  official ComfyUI edit template also uses CFG 1 — do not hand-tune CFG.
- **Seed rule (verified upstream bug)**: reusing the exact seed that generated
  a reference image reproduces its starting noise → oversaturated/over-sharpened
  edits ("noise replay"). EggLab forces a fresh seed on every edit; never pass a
  fixed seed equal to the source's seed into an edit.
- Resolutions are multiples of 32. Periodic 8px/4px grid artifacts have been
  reported at native 2K sizes on this engine — for critical work prefer ≤1536
  long side or inspect for grid patterns before shipping.
- RGBA prompt format (official, applies to edits too): "This is an RGBA image
  with transparency. <description>. The image has alpha channel and the
  background is transparent." Alpha survives only in PNG/WebP output.
- Edits need vision weights (`--llm_vision` mmproj) and the q8_0 prefix cache
  on 8 GB VRAM; the panel wires both automatically.
