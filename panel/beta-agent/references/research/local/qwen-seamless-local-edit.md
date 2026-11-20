# Qwen-Image-2.1 / Qwen-Image-Edit — Seamless Local Editing Research

**Purpose:** actionable, URL-cited reference for an AI image agent that must perform *local (region) edits with no visible rectangular seam*, plus a texture-preserving skin-retouch prompt bank.

**Verification labels used below:**
- **[VERIFIED]** — read directly from the cited page/repo during this research session.
- **[COMMUNITY]** — real published source, but a third-party workflow/blog, not official Qwen documentation.
- **[UNVERIFIED]** — could not be confirmed; do not treat as fact.

**Search-method note:** the mandated DuckDuckGo HTML route (`duckduckgo.com/html/?q=...`) was serving an outage page for this entire session, and `websearch` returns HTTP 403. Working substitutes were **Yahoo** (`https://search.yahoo.com/search?p=...`), direct fetches, `https://r.jina.ai/<url>` mirrors, and GitHub code search. This affects *how sources were found*, not the sources themselves.

---

## 1. Capability table (one source per row)

| # | Capability | Detail | Status | Source |
|---|---|---|---|---|
| 1 | Architecture | 7B, 32-layer single-stream DiT; Qwen3-VL 8B text/vision encoder; 64-channel VAE, 16× compression | Official | https://huggingface.co/Qwen/Qwen-Image-2.1 |
| 2 | Text-to-image generation | Native T2I mode | Official | https://qwen.ai/blog?id=qwen-image-2.1 |
| 3 | Reference / multi-reference edit | 1–10 reference images conditioning the edit | Official | https://github.com/QwenLM/Qwen-Image-2.1 |
| 4 | **Local (region) edit** | Region specified by **circles, painted annotations, or a separate mask image passed as a second input** | Official | https://qwen.ai/blog?id=qwen-image-2.1 |
| 5 | Identity preservation | Portrait / product identity kept across edits | Official | https://qwen.ai/blog?id=qwen-image-2.1 |
| 6 | Native transparency | Generate / edit / extract subject as RGBA directly | Official | https://huggingface.co/Qwen/Qwen-Image-2.1 |
| 7 | Text rendering & editing | In-image text edit supported | Official | https://github.com/QwenLM/Qwen-Image-2.1 |
| 8 | Other modes | Panorama, infographic, storyboard; 2K-native resolutions (1:1 2048², 4:3 2400×1792, 3:2 2528×1696, 16:9 2752×1536, 9:16, etc.) | Official | https://qwen.ai/blog?id=qwen-image-2.1 |
| 9 | Sampling defaults | 40 steps, CFG = 1; **Turbo = 8 steps** | Official | https://huggingface.co/Qwen/Qwen-Image-2.1 |
| 10 | Prompt-rewrite (PE) models | `Qwen/Qwen-Image-2.1-PE-T2I` and `Qwen/Qwen-Image-2.1-PE-I2I` | Official | https://huggingface.co/Qwen/Qwen-Image-2.1 |
| 11 | Qwen-Image-Edit (20B) | Original instruction-based editor | Official | https://huggingface.co/Qwen/Qwen-Image-Edit |
| 12 | Qwen-Image-Edit-2509 | Multi-image 1–3 (best), person/product/text consistency incl. font/color/material, native ControlNet depth/edge/keypoint/sketch | Official | https://huggingface.co/Qwen/Qwen-Image-Edit-2509 |
| 13 | Qwen-Image-Edit-2511 | Reduced image drift, stronger character consistency, built-in LoRAs, industrial design, geometric reasoning | Official | https://huggingface.co/Qwen/Qwen-Image-Edit-2511 |
| 14 | Edit API feature list | Multi-image fusion, subject consistency, sketch, depth/keypoint-driven generation, text editing, add/delete, viewpoint change, old-photo restore/colorize, style transfer, detail enhancement | Official | https://www.alibabacloud.com/help/en/model-studio/qwen-image-edit-guide |
| 15 | Edit API params | `n`, `size` (512²–2048², AR 1:8–8:1), `prompt_extend`, `seed`; **no `mask` field** | Official | https://www.alibabacloud.com/help/en/model-studio/qwen-image-edit-guide |
| 16 | `qwen-image-2.1-pro` / `-turbo` API | Up to 10 reference images, automatic transparent output, **no `negative_prompt` support** | Official | https://www.alibabacloud.com/help/en/model-studio/qwen-image-edit-guide |
| 17 | diffusers: 2.1 pipeline | `QwenImage21Pipeline.__call__` has **no `mask_image` argument** | Verified in code | https://github.com/huggingface/diffusers/blob/main/src/diffusers/pipelines/qwenimage21/pipeline_qwenimage21.py |
| 18 | diffusers: Edit inpaint | **`QwenImageEditInpaintPipeline` exists upstream** with `mask_image=` + `strength=` | Verified in code | https://github.com/huggingface/diffusers/blob/main/src/diffusers/pipelines/qwenimage/pipeline_qwenimage_edit_inpaint.py |
| 19 | diffusers: no 2.1 inpaint variant | Only `QwenImage21Pipeline` is exported from `qwenimage21` | Verified in code | https://github.com/huggingface/diffusers/blob/main/src/diffusers/pipelines/__init__.py |
| 20 | ComfyUI 2.1 text encode | `TextEncodeQwenImage21` accepts `images.image_1..image_16` (Autogrow) only — **no MASK input** | Verified in code | https://github.com/Comfy-Org/ComfyUI/blob/master/comfy_extras/nodes_qwen.py |
| 21 | ComfyUI official 2.1 template | `image_qwen_image_2_1_image_edit.json` wires no mask | Verified | https://github.com/Comfy-Org/workflow_templates/blob/main/templates/image_qwen_image_2_1_image_edit.json |
| 22 | ComfyUI Edit inpaint workflow | LoadImage MASK → `SetLatentNoiseMask` → KSampler (denoise 1.0), `TextEncodeQwenImageEdit` pos/neg, `ModelSamplingAuraFlow` shift 3, `CFGNorm` 1 | Community | https://stable-diffusion-art.com/qwen-image-edit-inpaint/ (workflow JSON: `https://stable-diffusion-art.com/wp-content/uploads/2025/10/qwen_image_edit_inpaint.json`) |
| 23 | 2.1 in-place edit tips | Don't enable `custom_size` for in-place edits (canvas must follow `image_1`); `resolution=0` keeps native size; 25 steps euler/simple, CFG 1; ~16 GB VRAM | Community | https://stable-diffusion-art.com/qwen-image-2-1/ |
| 24 | Known mask limitation | Model overfills the mask and content clips at the mask edge; prompt containment instructions don't fully fix it | Issue report | https://github.com/QwenLM/Qwen-Image/issues/137 |
| 25 | 2.1 edit guide / PE app | Rewriter system prompt + old-photo restoration template; "expression changes must be natural and subtle, never exaggerated" | Verified in code | https://huggingface.co/spaces/linoyts/Qwen-Image-Edit-Inpaint |

---

## 2. Native mask / inpainting support — YES or NO?

### Qwen-Image-2.1 — **NO latent mask inpainting. YES mask-as-a-condition-image.**

**Answer: the model does not have a masked-denoise (inpaint) path anywhere in the open tooling. Its "mask" is a second *image* the VLM reads as a condition, and the model still regenerates the whole canvas.**

Evidence:
- Official blog: local editing accepts "the original image and a separate mask as two inputs" — i.e. a mask **image**, not a latent noise mask. https://qwen.ai/blog?id=qwen-image-2.1 **[VERIFIED]**
- diffusers `QwenImage21Pipeline.__call__` signature contains **no mask parameter**; `grep mask` over the `qwenimage21` pipeline folder returns nothing. https://github.com/huggingface/diffusers/blob/main/src/diffusers/pipelines/qwenimage21/pipeline_qwenimage21.py **[VERIFIED]**
- Only `QwenImage21Pipeline` is exported for 2.1 — there is no `QwenImage21InpaintPipeline`. https://github.com/huggingface/diffusers/blob/main/src/diffusers/pipelines/__init__.py **[VERIFIED]**
- ComfyUI `TextEncodeQwenImage21` has no MASK input (`grep mask` on `nodes_qwen.py` → no results), and the official 2.1 edit template wires no mask. https://github.com/Comfy-Org/ComfyUI/blob/master/comfy_extras/nodes_qwen.py · https://github.com/Comfy-Org/workflow_templates/blob/main/templates/image_qwen_image_2_1_image_edit.json **[VERIFIED]**
- DashScope / Model Studio API `content` = images + one text instruction; no mask field. https://www.alibabacloud.com/help/en/model-studio/qwen-image-edit-guide **[VERIFIED]**

**How to get an equivalent effect with 2.1 (both verified as available mechanisms):**
1. **Visual markup route (officially recommended):** draw a red circle/arrow on the photo and prompt *"Replace the object inside the red circle in `<image1>` … and remove the red circle"*. The model repaints the full canvas, so there is **no paste-back seam by construction**. https://stable-diffusion-art.com/qwen-image-2-1/ **[COMMUNITY, mirrors official "painted annotation" feature]**
2. **Separate mask image as second input:** pass mask as an input image so the VLM knows the target region — but you still get a full-canvas regeneration, which changes global pixels slightly. **[VERIFIED mechanism, [UNVERIFIED] how strictly it confines changes]**

### Qwen-Image-Edit (20B / 2509 / 2511) — **YES, real inpainting exists.**

- **diffusers:** `QwenImageEditInpaintPipeline` is exported from upstream `huggingface/diffusers` (including `auto_pipeline` mapping `"qwenimage-edit" → QwenImageEditInpaintPipeline` and the API docs page). Call signature verified:
  ```python
  image = pipe(prompt=prompt, negative_prompt=" ", image=source,
               mask_image=mask, strength=1.0, num_inference_steps=50).images[0]
  ```
  Sources: https://github.com/huggingface/diffusers/blob/main/src/diffusers/pipelines/qwenimage/pipeline_qwenimage_edit_inpaint.py · https://github.com/huggingface/diffusers/blob/main/docs/source/en/api/pipelines/qwenimage.md **[VERIFIED]**
- **ComfyUI (no dedicated pipeline needed):** `LoadImage` (MASK) → **`SetLatentNoiseMask`** → `KSampler` with **denoise 1.0**, text encode via `TextEncodeQwenImageEdit`, `ModelSamplingAuraFlow` shift 3, `CFGNorm` 1. Workflow JSON: https://stable-diffusion-art.com/wp-content/uploads/2025/10/qwen_image_edit_inpaint.json (guide: https://stable-diffusion-art.com/qwen-image-edit-inpaint/) **[COMMUNITY]**
- **Instruct-only API:** no mask at all — https://www.alibabacloud.com/help/en/model-studio/qwen-image-edit-guide **[VERIFIED]**

**Caveat (real bug):** https://github.com/QwenLM/Qwen-Image/issues/137 — the model overfills the mask and clips content at the mask boundary; adding "keep everything outside the mask unchanged" style instructions helps only partially. Plan for an expand+feather mask (technique 1/5 below). **[VERIFIED issue exists]**

---

## 3. Ranked seam-free local-edit techniques

Ranked best → worst for the specific problem *"crop → edit → paste back leaves a visible rectangle."*

### #1 — Redraw-then-restore paste-back (expanded + feathered mask) — best fix for the current crop/paste pipeline
- **What:** isolate region → **grow the mask** beyond the edit box → **feather** its edges → let the model redraw the *grown* region (with surrounding context) → paste back using the saved pad/scale info → inspect with a compar/preview node.
- **Why it works:** the model sees context on all sides and the composite transition is a gradient, not a rectangle; growing past the crop box moves the cut line away from the edited content.
- **Exact tooling (ComfyUI):**
  ```
  LoadImage (MASK) → GrowMask {expand: +16…64, tapered_corners: true}
                   → FeatherMask {left/top/right/bottom: 32…128 px}
                   → [your Qwen edit node] → paste-back/restore-crop-box
  ```
  - `GrowMask` docs: https://docs.comfy.org/built-in-nodes/GrowMask **[VERIFIED node + params]**
  - `FeatherMask` docs: https://docs.comfy.org/built-in-nodes/FeatherMask **[VERIFIED node + params]**
  - Full workflow pattern ("redraw first, then restore", MaskGrow expand+soften, crop with pad info, scale back, paste-back, comparer to check blend): https://civitai.com/models/2612587/qwen-image-edit-2511-seamless-head-swap-redraw-and-paste-back-master-workflow (read via `https://r.jina.ai/...`) **[COMMUNITY — node naming "MaskGrow" vs built-in "GrowMask" [UNVERIFIED]]**

### #2 — Latent noise-mask inpaint with Qwen-Image-Edit (eliminates paste-back entirely)
- **What:** keep the full image, attach a mask to the latent, and let the sampler rewrite only the masked area at `denoise 1.0`.
- **Why it works:** there is no paste step — the VAE decodes a single continuous canvas, so no compositing seam can exist; the unmasked latent is preserved by `SetLatentNoiseMask`.
- **Exact command/workflow:** https://stable-diffusion-art.com/wp-content/uploads/2025/10/qwen_image_edit_inpaint.json
  Nodes: `LoadImage` (MASK out) → `SetLatentNoiseMask` → `KSampler` (denoise **1.0**), `TextEncodeQwenImageEdit` (positive + negative), `ModelSamplingAuraFlow` **shift 3**, `CFGNorm` 1. Guide: https://stable-diffusion-art.com/qwen-image-edit-inpaint/ **[COMMUNITY]**

### #3 — `QwenImageEditInpaintPipeline` (one-line Python, official code path)
- **What:** upstream diffusers pipeline with `mask_image` + `strength`.
- **Why:** official, supported in `AutoPipeline` mapping; `strength < 1.0` gives partial renoising for gentle local changes (a soft lever for blending).
- **Exact command:**
  ```python
  from diffusers import QwenImageEditInpaintPipeline
  pipe = QwenImageEditInpaintPipeline.from_pretrained("Qwen/Qwen-Image-Edit", torch_dtype=torch.bfloat16).to("cuda")
  out = pipe(prompt=prompt, negative_prompt=" ", image=source, mask_image=mask,
             strength=1.0, num_inference_steps=50).images[0]
  ```
  Source: https://github.com/huggingface/diffusers/blob/main/src/diffusers/pipelines/qwenimage/pipeline_qwenimage_edit_inpaint.py **[VERIFIED]**

### #4 — Visual markup instead of crop (best for 2.1 when you can't inpaint)
- **What:** draw a red circle/arrow on the photo; prompt the model to replace the circled object *and remove the annotation*; regenerate the full canvas at native resolution.
- **Why:** no crop, no paste — the seam problem never arises; identity is held by `<image1>`…`<image10>` references and the 3-part prompt formula.
- **Exact prompt pattern:**
  ```
  Replace the object inside the red circle in <image1> with a <new object>,
  keeping everything else unchanged; remove the red circle.
  ```
  Settings: do **not** enable `custom_size` (canvas must follow `image_1`), `resolution = 0` (native size), 25 steps, euler/simple, CFG 1. Source: https://stable-diffusion-art.com/qwen-image-2-1/ **[COMMUNITY]**
- Prompt structure: *lock what stays unchanged → state the transfer → describe lighting/integration*. Same source.

### #5 — Feathered paste-back compositor (when paste-back is unavoidable)
- **What:** composite original + edited region with an alpha mask whose **interior is 100 % replacement** and only the boundary band blends.
- **Why:** a hard binary mask degrades to a cut line; a feathered band hides it. Interior must stay opaque or you get ghosting (two half-visible subjects).
- **Exact tooling:**
  - Built-in: `FeatherMask` (per-edge distance, px) — https://docs.comfy.org/built-in-nodes/FeatherMask
  - `Soft Inpaint Composite` (Umbra): inputs `original`, `generated`, `mask`; params `preservation` (0–1, default 0.5), `transition_contrast` (0.25–8, default 2), `mask_influence` (default 0); outputs `image` + `blend_mask`. Install: `git clone https://github.com/Nocturne-Ai-Labs/Umbra-Nodes`. Source: https://comfy.icu/node/UmbraSoftInpaintComposite **[COMMUNITY]**
  - Gotcha (same source): a fully hard-edged mask makes this a hard cut — feather upstream first; and a replacement with wrong lighting/perspective still "looks pasted" even with a perfect blend.

### #6 — Widen the mask band, raise the feather (when a rectangle still shows)
- **What:** if the inpaint result shows a visible rectangular patch, **widen `mask_width` or raise `feather`** — "the model needs room to blend, not a surgical strip."
- **Why:** diffusion models inpaint worst at image edges and best near the center with the most context; a narrow strip gives no blending room.
- **Exact parameters:** `mask_width` 48–96 px typical (default 64), `feather` ≤ `mask_width` (default 32), 0 = hard edge. Source: https://comfy.icu/node/SeamlessOffsetForInpaint **[COMMUNITY]**

### #7 — Mask slightly inside the object + moderate denoise (edge-noise cleanup)
- **What:** dilate/adjust the mask 1–2 px over the object border and run denoise ≈ 0.5–0.6 to smooth ringing/noise at the boundary.
- Source: https://www.reddit.com/r/StableDiffusion/comments/13kufnj/how_to_remove_the_noises_around_the_product_edge/ **[COMMUNITY]**

### #8 — 50 %-offset seam trick (for seams already baked into the image)
- **What:** `torch.roll` the image 50 % so the seam lands in the center, inpaint a feathered cross mask over it, then run the exact reverse shift.
- **Exact nodes:** `SeamlessOffsetForInpaint` (mask_width/feather/offset_x/offset_y → `shifted_image`, `seam_mask`, `shift_x`, `shift_y`) → VAE Encode → KSampler (inpaint) → `SeamlessOffsetReverse`. Install: `git clone https://github.com/mikemojen/ComfyUI-seamless_latent_tiling`. Source: https://comfy.icu/node/SeamlessOffsetForInpaint **[COMMUNITY]**
- Verdict from source: slower than fixing it upstream; use as a repair tool when you already love the image.

### #9 — Conventional compositing principle (why the rectangle appears at all)
- **Adobe:** "Feathering is a way to soften the hard edges… By gradually fading between the colors of the pixels on the edge and the pixels surrounding it, feathering can help you make a newly added element blend in with the rest of your image." Also: *"If you've made changes to a single selection… you may notice a distinct or jagged edge where it stands out from the unaltered background color. Feathering smooths those edges away."* Start at **0.5–2 px**, go 5–20 px for wide blends. Source: https://www.adobe.com/products/photoshop/feather-edges.html **[VERIFIED]**
- **Shotkit:** "When a selection has hard edges instead of smooth edges, the new layer won't be successfully blended into a composite image." Source: https://shotkit.com/how-to-feather-edges-photoshop/ **[COMMUNITY]**
- **Adobe Help (feather radius mechanics):** https://helpx.adobe.com/photoshop/desktop/make-selections/refine-modify-selections/define-feathered-edges.html **[VERIFIED existence]**

> **Grain / noise matching after paste-back:** no authoritative source found in this session stating "re-match grain after paste." Only adjacent evidence (uniform grain overlays do *not* look like skin texture: https://oakgen.ai/blog/fix-plastic-skin-ai-portraits). **[UNVERIFIED — treat grain-matching as a plausible practice, not a cited technique.]**

---

## 4. Texture-preserving skin-retouch prompt bank (no plastic skin)

All prompts below are copy-paste ready. Where a source used Midjourney-style suffixes (`--ar`, `--style raw`), those were stripped for Qwen use — **[UNVERIFIED] that suffix-free versions were tested on Qwen specifically.** Qwen-Image-2.1 API has **no `negative_prompt`** (https://www.alibabacloud.com/help/en/model-studio/qwen-image-edit-guide), so negatives are written inline as constraints.

**1. Portrait (Oakgen — full prompt, before→after tested pattern)**
> `Portrait of a 35-year-old woman, warm window light, unretouched editorial photograph, visible skin texture, natural pores, fine lines around the eyes, no beauty retouch, 85mm film.`
Source: https://oakgen.ai/blog/fix-plastic-skin-ai-portraits **[COMMUNITY]**

**2. Male close-up (Oakgen)**
> `Close-up photograph of a man with a beard, moody side light, visible skin pores and micro-texture, slight forehead shine, natural skin imperfections, 56mm lens, no smoothing.`
Same source.

**3. Fashion / makeup (Oakgen)**
> `A fashion portrait of a model with bold makeup, natural skin visible under the makeup, fine texture around the cheeks, editorial photography, unretouched capture, 80mm, no airbrushing.`
Same source.

**4. Minimal texture clause (Oakgen "key words" recipe)**
> `unretouched, visible pores, no beauty retouch`
Same source — add to any existing prompt; "if there is no negative prompt field, write the 'no' words into the prompt."

**5. Edit instruction for a finished image (Oakgen Fix 3 — keeps identity)**
> `Add natural skin texture, fine pores and slight unevenness to the face. Keep the face, expression, pose, lighting and background the same.`
Same source.

**6. Masked single-face edit (Oakgen Fix 4 — white = edit, black = keep)**
> `Natural skin texture with visible pores on this face. Same person, same expression, same lighting.`
Same source (mask image convention: white edits, black kept).

**7. Reference-photo skin transfer (Oakgen Fix 5)**
> `Use the skin texture and film grain from image 2. Keep the face, outfit and pose from image 1.`
Same source — works with 2.1's 1–10 reference inputs.

**8. Balanced skin block — best all-rounder (QuestStudio)**
> `natural unretouched skin with subtle pore detail at close focus, slight tonal variation across cheeks and forehead, fine facial hair, restrained highlights, soft transition from light to shadow, small believable imperfections, no waxy smoothing, no beauty-filter finish`
Source: https://queststudio.io/blog/make-it-look-real-prompt-rules **[COMMUNITY]**

**9. Face-preserving edit formula (QuestStudio — the strongest anti-drift edit prompt found)**
> `Edit the uploaded portrait only. Preserve the person's recognizable identity, facial proportions, eye shape, nose, mouth, jawline, skin tone, age, expression, hairline, and camera framing. Change only the skin rendering: restore natural tonal variation, subtle pore detail, fine facial hair, restrained highlights, and believable shadow transitions. Keep existing freckles and distinctive marks. Do not reshape the face, whiten teeth, enlarge eyes, smooth wrinkles away, or apply a beauty-filter finish.`
Same source.

**10. Realism pack with negatives (QuestStudio Pack A)**
> `photorealistic portrait of a [person] in a [setting], camera: 85mm portrait lens, shallow depth of field, sharp focus on eyes, lighting: soft window light from camera-left, gentle fill, natural shadows, realistic catchlights, natural skin texture, visible pores, subtle imperfections, fine hair detail, no heavy retouching, realistic proportions, no plastic skin, no warped hands, no text, no watermark`
Same source.

**11. Cinematic edit with pore detail (Media.io Gemini-style, suffixes stripped)**
> `A cinematic close-up portrait of the uploaded person, captured under soft golden natural light. Keep the original face, hairstyle, and expression exactly the same. Render realistic skin texture with visible pores, subtle reflections, and gentle highlights. Maintain natural tone, warm atmosphere, fine film grain, and shallow depth of field. Ultra-realistic, editorial style photo.`
Source: https://www.media.io/image-effects/realistic-ai-skin-prompt.html **[COMMUNITY]**

**12. Official Qwen old-photo / restoration rewrite template (works as a "restore natural skin" instruction)**
> `Restore old photograph, remove scratches, reduce noise, enhance details, high resolution, realistic, natural skin tones, clear facial features, no distortion, vintage photo restoration`
Rule that ships with it: **"expression changes must be natural and subtle, never exaggerated."** Sources: https://huggingface.co/spaces/linoyts/Qwen-Image-Edit-Inpaint (app.py rewriter system prompt) · https://www.alibabacloud.com/help/en/model-studio/qwen-image-edit-guide **[VERIFIED in code/docs]**

### Non-prompt workflow steps (texture preservation)

**W. Skin detailer pass (mask skin, low denoise, texture upscaler)** — mask the skin only, denoise **0.05–0.3 (start at 0.16)**, use a realism skin LoRA + `1x ITF SkinDiffDetail Lite` upscaler. Source: https://stable-diffusion-art.com/skin-detailer/ **[COMMUNITY]**

**X. Diagnose before prompting** — plastic skin usually means (a) prompt implies flawless beauty retouching, (b) flat light, or (c) the edit smoothed away source texture. Ask for natural tonal variation, restrained highlights, visible-but-subtle texture. Also: **don't** fix it with sharpening or a uniform grain overlay. Sources: https://queststudio.io/blog/make-it-look-real-prompt-rules · https://oakgen.ai/blog/fix-plastic-skin-ai-portraits **[COMMUNITY]**

**Y. Texture must match framing** — demand macro pore detail only in tight portraits; for waist-up shots say "natural skin texture" only, or it looks processed. Source: https://queststudio.io/blog/make-it-look-real-prompt-rules **[COMMUNITY]**

**Z. Reference-image route for a repeatable look** — feed a real photo whose skin you want as reference and say which image supplies what (prompt #7). Note the ethical/legal caveat: don't recreate a real person's likeness without rights/consent. Source: https://oakgen.ai/blog/fix-plastic-skin-ai-portraits **[COMMUNITY]**

---

## 5. Explicitly unverified / cautions

1. **[UNVERIFIED]** The exact node name **`MaskGrow`** in the civitai head-swap workflow — ComfyUI's built-in is **`GrowMask`** (https://docs.comfy.org/built-in-nodes/GrowMask). The civitai page was read through an `r.jina.ai` mirror; confirm node names against your install.
2. **[UNVERIFIED]** Whether a 2.1 **mask-as-second-input** strictly confines changes to the masked region. Pipeline evidence says the model regenerates the whole canvas; no official statement on drift magnitude was found.
3. **[UNVERIFIED]** Grain/noise re-matching after paste-back — no citable source found (see end of §3).
4. **[UNVERIFIED]** Whether prompt containment fixes https://github.com/QwenLM/Qwen-Image/issues/137 — the issue reports it helps only partially.
5. **[UNVERIFIED]** Prompt bank items 1–11 were authored/tested for other models (GPT Image, Gemini, general SD). Nothing here was executed against Qwen-Image-2.1 in this session.
6. **[UNVERIFIED]** Oakgen/QuestStudio pages are dated 2026 and describe their own product pricing; the *prompt text* is what's cited, not their benchmark claims (Oakgen explicitly says it did not run a skin-quality test).
7. **[VERIFIED caveat]** `qwen-image-2.1-pro`/`-turbo` API has **no `negative_prompt`** — put constraints inline.
8. **Search-route caveat:** the mandated DDG HTML route was down for this session; all sources above were reached via Yahoo, direct fetch, `r.jina.ai`, or GitHub code search. If DDG recovers, re-check nothing — sources are direct URLs, not search snippets.

---

## 6. TL;DR for the image agent

- **2.1 cannot inpaint.** Never crop→edit→paste with a hard rectangle. Either (a) annotate with a red circle and regenerate the full canvas at native size, or (b) switch the operation to **Qwen-Image-Edit + latent mask** (`SetLatentNoiseMask`, denoise 1.0 / `QwenImageEditInpaintPipeline(mask_image=..., strength=...)`).
- **If you must paste back:** `GrowMask` (expand 16–64, tapered) → `FeatherMask` (32–128 px) → composite with `Soft Inpaint Composite` (interior 100 % opaque, only the feather blends). Visible rectangle ⇒ widen the band, don't shrink it.
- **Skin:** always pair a preservation sentence (prompt #9) with a texture sentence (prompt #8), keep denoise ≤ 0.3 for detail passes, and never "fix" smoothness with sharpening or uniform grain.
