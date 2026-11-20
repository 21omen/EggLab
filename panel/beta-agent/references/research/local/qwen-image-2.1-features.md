# Qwen-Image-2.1 — Deep Feature Research

**Purpose:** URL-cited reference for EggLab's PhotoCraft agent. Every feature row says whether the EggLab wrapper can actually reach it, so the agent is never taught a capability it cannot invoke.

**Research date:** 2026-11-05 · **Local stack verified:** `D:\neww\EggLab` (egglab.ps1 / mcp-server.mjs / engine.mjs / sd-cli.exe)

## Verification labels

| Label | Meaning |
|---|---|
| **[V]** | Read directly from the cited official page/repo/binary this session |
| **[C]** | Real third-party source (community/blog/review), not official Qwen docs |
| **[L]** | Verified against the local binary or source tree (`sd-cli --help`, wrapper source) |
| **[?]** | Could not confirm — do not treat as fact |

## Reachability labels (the EggLab boundary)

| Label | Meaning |
|---|---|
| **REACH** | Agent can do it now through an MCP tool |
| **LOW** | Engine/wrapper supports it, but no MCP tool exposes it (agent cannot reach it) |
| **NO** | Not exposed anywhere in EggLab — teaching it would make the agent hallucinate |

---

## 1. Identity and timeline

| Fact | Detail | Label | Source |
|---|---|---|---|
| Release | Open-sourced 2026-09-20/21 (license release date Sept 20, 2026) | [V] | [HF model card](https://huggingface.co/Qwen/Qwen-Image-2.1), [LICENSE](https://huggingface.co/Qwen/Qwen-Image-2.1/raw/main/LICENSE) |
| Size | **7B** visual generation component, **32 Single-Stream DiT** layers | [V] | [HF model card](https://huggingface.co/Qwen/Qwen-Image-2.1) |
| Positioning | "most balanced and cost-effective image generation model in the Qwen-Image series" | [V] | [Qwen LinkedIn](https://www.linkedin.com/posts/qwen_meet-qwen-image-21-the-most-balanced-and-cost-effective-image-generation-model-in-the-qwen-image-series-now-open-weights-activity-750763342716538880) |
| Ancestors | Qwen-Image (Aug 2025) → Qwen-Image-Layered (Dec 2025, transparency) → 2.1 integrates Layered into one model | [V] | [Alibaba Cloud blog](https://www.alibabacloud.com/blog/603586) |
| Turbo | 8-step distilled checkpoint released **2026-10-09** | [V] | [GitHub repo](https://github.com/QwenLM/Qwen-Image-2.1) |
| Hosted API | `qwen-image-2.1-pro` / `qwen-image-2.1-turbo` on Model Studio (also a **3.0** series exists) | [V] | [Aliyun API reference](https://help.aliyun.com/en/model-studio/qwen-image-generation-and-editing-api-reference) |
| Press | Tom's Hardware, Sept 23 2026 — "beats Nano Banana 2.0 … on its own internal benchmark … we'd like to see additional testing" | [C] | [Tom's Hardware](https://www.tomshardware.com/tech-industry/artificial-intelligence/alibaba-claims-new-qwen-image-2-1-ai-model-beats-google-nano-banana-2-0-with-minuscule-7b-parameter-model-benchmarks-show-open-weight-contender-is-competitive-with-openai-and-meta-image-models) |

---

## 2. Architecture and efficiency

| Fact | Detail | Label | Source |
|---|---|---|---|
| Attention | **Mixed-granularity**: text (system prefix + edit instructions) uses token-level causal mask; image generation uses chunk-level mask | [V] | [Alibaba Cloud blog](https://www.alibabacloud.com/blog/603586) |
| KV cache | **Prefix KV cache reuse** — input images + edit instructions computed once in step 1, reused as static context (cuts memory and latency on multi-image edits) | [V] | same |
| Text encoder | **Qwen3-VL 8B** encoder (separate from the 7B generator) | [V] | [Unsloth docs](https://unsloth.ai/docs/models/qwen-image-2.1) |
| VAE | 64-channel **RGBA** VAE, 16× spatial compression — decodes alpha natively | [V] | [HF model card](https://huggingface.co/Qwen/Qwen-Image-2.1), [ausboss](https://huggingface.co/ausboss/Qwen-Image-2.1-Outpaint-LoRA) ("the Qwen 2.1 VAE decodes RGBA") |
| Sampling | FlowMatch / Euler, **CFG 1 (no guidance)** as the specified default, 40 steps, 2048² | [V] | [HF model card](https://huggingface.co/Qwen/Qwen-Image-2.1) |
| ComfyUI base template | 25 steps, cfg 1, euler/simple — **at cfg 1 the negative conditioning pass is skipped** | [V] | [docs.comfy.org](https://docs.comfy.org/tutorials/image/qwen/qwen-image-2-1) |
| Divergent advice | Unsloth's table: diffusers baseline **40 steps**, sd.cpp CLI default **20 steps / CFG 6.0** (upstream sd.cpp example) vs CFG 1.0 + blank negative for the pipeline default | [V] | [Unsloth docs](https://unsloth.ai/docs/models/qwen-image-2.1) |
| Diffusers API | `QwenImage21Pipeline.__call__` has **no `mask_image`**; `negative_prompt` only takes effect when `true_cfg_scale > 1` | [V] | [HF diffusers docs](https://huggingface.co/docs/diffusers/api/pipelines/qwenimage21) |
| Local args | stable-diffusion.cpp exposes `--model-args qwen_image_2_1_prefix_cache`, `qwen_image_2_1_prefix_cache_type` and a **`qwen-image-2.1-turbo` sigma preset** for `--sigmas` | [L] | `sd-cli --help` |

---

## 3. Feature catalogue (with reachability)

| # | Feature | What it does | Reach? | How / why not | Label | Source |
|---|---|---|---|---|---|---|
| F1 | **Text-to-image** | Full-frame generation, native up to 2048² | **REACH** | `egglab_generate` (prompt, width/height, steps, seed, workflow) | [V] | [HF model card](https://huggingface.co/Qwen/Qwen-Image-2.1) |
| F2 | **Instruction editing (I2I)** | Same weights serve editing instructions; no checkpoint swap | **REACH** | `egglab_edit` / `photocraft_edit_active` | [V] | [docs.comfy.org](https://docs.comfy.org/tutorials/image/qwen/qwen-image-2-1) |
| F3 | **Up to 10 reference images** | Multi-subject composition, virtual try-on, group portraits, identity donors | **REACH** | `egglab_edit images:[…]` (schema says 1–10, `<image1>` canvas + `<image2>`+ donors) | [V] | [Alibaba blog](https://www.alibabacloud.com/blog/603586) — note: ComfyUI's page says "up to 16" [?] conflict |
| F4 | **Local edit — circles** | Coloured circles mark regions; prompt names the colours ("remove the watch in the blue circle…") | **NO** | Requires painting marks onto the input first; no tool does that. *Workaround exists — see §5.* | [V] | [Alibaba blog](https://www.alibabacloud.com/blog/603586) |
| F5 | **Local edit — painted annotations** | Brush a region white, prompt names the mark | **NO** | same as F4 | [V] | same |
| F6 | **Local edit - separate mask** | Original image + mask as two inputs; model edits only the masked region | **REACH** | `photocraft_edit_active` `region`+`mode:"inpaint"` or `mask_layer` (user-painted layer) → `sd-cli --init-img --mask --strength` (measured working) | [V]+[L] | [Alibaba blog](https://www.alibabacloud.com/blog/603586); local proof in `tools/BASELINE.md` |
| F7 | **Transparent RGBA generation** | Prompt decides opaque vs alpha output; official RGBA wording | **REACH** | `egglab_generate transparent=true` — engine wraps the official RGBA template and verifies with `alphaStats` | [V] | [HF model card](https://huggingface.co/Qwen/Qwen-Image-2.1) |
| F8 | **Transparent layer editing / subject extraction** | Edit a cut-out while keeping alpha; extract a subject from a photo as RGBA | **REACH** | `egglab_edit transparent=true` | [V] | [Alibaba blog](https://www.alibabacloud.com/blog/603586) |
| F9 | **Identity preservation** | Portrait identity + product consistency held across edits | **REACH** | prompt discipline (PE rules, §6) | [V] | [Alibaba blog](https://www.alibabacloud.com/blog/603586) |
| F10 | **Text rendering / typography** | Dense small text, layouts, infographics, posters; short text/logos reliable | **REACH** | prompt only | [V] | [HF model card](https://huggingface.co/Qwen/Qwen-Image-2.1); long text fails — see §8 |
| F11 | **Panorama / infographic / storyboard** | Selfie→panorama; photo→infographic; 3-view→storyboard | **REACH** (prompt-driven) | `egglab_generate` / `egglab_edit` | [V] | [Alibaba blog](https://www.alibabacloud.com/blog/603586) |
| F12 | **Sequential local edits** | Successive region edits assemble into simple animation frames | **REACH** | repeated `photocraft_edit_active` region passes | [V] | [Alibaba blog](https://www.alibabacloud.com/blog/603586) |
| F13 | **Turbo 8-step** | Distilled schedule, fixed sigma, CFG 1.0 forced, no negative prompt | **REACH** | `workflow:"turbo"` — wrapper forces 8 steps/CFG 1.0, appends the LoRA tag, passes `--sigmas qwen-image-2.1-turbo` | [L] | `egglab.ps1` lines 82–98, 168–192 |
| F14 | **Prompt rewriter (PE)** | Official DPE/APE rewriters turn vague asks into precise directives | **REACH (emulated)** | The agent *is* the rewriter if taught §6; hosted API's `prompt_extend` is not local | [V] | [PE-I2I system prompt](https://huggingface.co/Qwen/Qwen-Image-2.1-PE-I2I/raw/main/system_prompt.txt), [t2i system prompt](https://github.com/QwenLM/Qwen-Image-2.1/blob/main/prompt_rewrite/prompts/system_prompt_t2i.txt) |
| F15 | **Negative prompt** | Describe what not to draw | **NO** | No `-n` in wrapper, no field in MCP schema. *Moot at CFG 1* (negative pass skipped) | [L]+[V] | `egglab.ps1` param block; [docs.comfy.org](https://docs.comfy.org/tutorials/image/qwen/qwen-image-2-1) |
| F16 | **Scheduler choice** | beta / bong_tangent / Karras etc. | **NO** | wrapper maps `-Method` → `--sampling-method` only; `--scheduler` never passed | [L] | `egglab.ps1` line 186 |
| F17 | **Image guidance (`imgCfg`)** | How hard output is pulled toward the source on inpaint/edit | **LOW** | `engine.mjs` → `-ImgCfg` exists and `http.mjs` accepts `body.imgCfg`, but `mcp-server.mjs` does **not** forward it | [L] | `mcp-server.mjs` `photocraft_edit_active` case (~line 606) |
| F18 | **Outpainting** | Canvas expansion | **NO** | Base model *reframes/rescales* instead; needs `ausboss/Qwen-Image-2.1-Outpaint-LoRA` — **not in `D:\neww\Models`** | [C] | [ausboss LoRA card](https://huggingface.co/ausboss/Qwen-Image-2.1-Outpaint-LoRA) |
| F19 | **ControlNet / IP-Adapter / ADetailer / upscaler modes** | Structural control, face detailer, ESRGAN upscale | **NO** | sd-cli supports `--control-net`, `--ip-adapter`, `-M adetailer|upscale`; wrapper exposes none, and **no such models exist** in `D:\neww\Models` | [L] | `sd-cli --help`; `Get-ChildItem D:\neww\Models` |
| F20 | **Multi-turn same-seed iteration** | Works but degrades — see §8 | **REACH** (with caveat) | fixed `seed` + repeated edits | [C] | GitHub issue #9 |

**Model files actually present (`D:\neww\Models`):** `qwen-image-2.1-UC-fp8.safetensors`, `qwen-image-2.1-UC-Q5_K_M.gguf`, `Qwen3VL-8B-Uncensored-*` text encoder, `qwen_image_2.1_turbo_lora_avg_rank_178_bf16.safetensors`, `qwen_image_2.1_vae_bf16.safetensors`. (UC = uncensored quants — user's own choice, affects nothing in this doc.)

---

## 4. Generation settings

### Official / ecosystem defaults

| Source | Steps | CFG | Sampler/scheduler | Notes |
|---|---|---|---|---|
| HF model card (specified default) | 40 | 1 (no guidance) | FlowMatch Euler | 2048² default canvas [V] |
| ComfyUI base template | 25 | 1 | euler / simple | negative pass **skipped at cfg 1** [V] |
| Unsloth (diffusers) | 40 | 1.0 | pipeline scheduler | blank negative [V] |
| Unsloth (sd.cpp CLI) | 20 | **6.0** | Euler | upstream sd.cpp example; blank negative [V] |
| **EggLab live (settings.json)** | **25 quality / 8 turbo** | **1** | euler | `DEFAULTS` in code still says 40 (stale comment) [L] |

### Resolution tables (both tiers, [V] [Unsloth](https://unsloth.ai/docs/models/qwen-image-2.1) + [docs.comfy.org](https://docs.comfy.org/tutorials/image/qwen/qwen-image-2-1))

| Ratio | 1024-class | 2048-class (official) | EggLab `ASPECTS` |
|---|---|---|---|
| 1:1 | 1024×1024 | 2048×2048 | 1024×1024 ✓ |
| 4:3 | 1152×864 | 2400×1792 | 1152×864 ✓ |
| 3:4 | 864×1152 | 1792×2400 | 864×1152 ✓ |
| 3:2 | 1248×832 | 2528×1696 | 1152×768 (≈, not official) |
| 2:3 | 832×1248 | 1696×2528 | 768×1152 (≈) |
| 16:9 | 1536×864 | **2752×1536** | 1152×640 (1.8:1, **not** 16:9) |
| 9:16 | 864×1536 | 1536×2752 | 640×1152 |
| 4:5 / 5:4 | — | — | 1024×1280 / 1280×1024 |
| 2:1 / 1:2 | — | — | 1280×640 / 640×1280 |

> **Gap:** the panel's `16:9` is 1152×640 (= 1.8) and `3:2` is 1152×768 (= 1.5, correct ratio but not the recommended pixel pair). The official 16:9 pair is 1536×864 (1024-class) / 2752×1536 (2K-class). Agent may pass explicit `width`/`height` to hit official pairs.

---

## 5. Editing mechanics — how the model actually wants to be edited

**Three official channels** ([Alibaba blog](https://www.alibabacloud.com/blog/603586), [V]):

1. **Coloured circles** — draw circles of different colours on the input; the prompt names them: *"Remove the metal watch in the blue circle, change the hair in the red circle to black…"* — edits up to 3 regions in one pass.
2. **Painted annotations** — brush a region (e.g. white); prompt names the mark: *"add a diver to the area marked in white"*.
3. **Separate mask** — pass the untouched original **plus a mask image** as two inputs; the model repaints only the masked region. This is the channel that preserves the complete input (circles/brushes obscure what they cover).

**Why the agent can't use channels 1–2 directly:** no tool paints marks onto an image first. **Workaround (reachable):** the agent can *compose* the annotated input itself — but EggLab exposes no image-drawing tool either, so in practice the agent must use **channel 3** (`region` + `mode:"inpaint"`) for a rectangle it defines.

> **Update 2026-11-17:** PhotoCraft already provides the drawing/annotation layer and a separate painted-mask layer. The agent does not need to draw anything itself: it uses the user's existing marks via `photocraft_edit_active`, or passes the separate mask layer with `mask_layer`. This is why the old "painted-annotation = NO" row below is now **REACH via PhotoCraft UI**, not via a model-drawing tool. The mask data path is documented in `reference-editing/SKILL.md`.

**Critical divergence — "2.1 cannot inpaint" is FALSE locally:**
- In **diffusers** this is true: `QwenImage21Pipeline.__call__` has no `mask_image` ([HF docs](https://huggingface.co/docs/diffusers/api/pipelines/qwenimage21) [V]).
- In **ComfyUI** the equivalent is a latent noise mask — and the community found it **draws a visible rectangle at the seam** ([ausboss](https://huggingface.co/ausboss/Qwen-Image-2.1-Outpaint-LoRA): *"Do not pin the known area with Set Latent Noise Mask: on Qwen 2.1 that draws a visible rectangle at the seam"* [C]).
- **Locally (sd-cli)** `--init-img --mask --strength` works and was measured: seam-fix-test PASS (crop mode: 0.95 mean delta, 85% untouched pixels, worst border 0.48× own noise floor; inpaint mode: 4.42 / 4.7% / 1.80×) — see `D:\neww\EggLab\panel\tools\BASELINE.md` [L].

**EggLab's two region modes** (both shipped, both gated):

| Mode | Mechanism | Best for | Measured |
|---|---|---|---|
| `crop` (default) | Tight crop → edit → paste back with smoothstep alpha ramp; feather band grows *outside* the box; byte-identical outside the band | Small objects, labels, anything on textured ground | 85% untouched, worst border **0.48×** noise |
| `inpaint` | Whole layer + soft mask → model repaints one continuous canvas; no paste step | Flat areas (sky, wall, **skin**) where a blend line would show | 4.7% untouched, **1.80×** noise, native output size |

**Corroboration:** the ausboss outpaint LoRA's own numbers show the same failure mode we fixed — without pinning, base Qwen-Image-2.1 leaves a **+2.2 mean colour step at the seam** and a kept-area PSNR of 23.6 dB; their stitch technique reaches 33.6 dB / −0.8 [C].

---

## 6. Prompt engineering — the official PE rules (gold for teaching)

Two official system prompts were captured verbatim:

### 6a. Edit Prompt Enhancer (`Qwen/Qwen-Image-2.1-PE-I2I`) [V]
[system_prompt.txt](https://huggingface.co/Qwen/Qwen-Image-2.1-PE-I2I/raw/main/system_prompt.txt)

- **Two separate language decisions, never conflated:**
  - **(A)** Language of the *descriptive prose* (outside quotes): follow the user's language; any other language → English.
  - **(B)** Language of the *text rendered into the image* (inside quotes): exact user string > dominant language of the image's existing text > user's language. Rendered text must be **monolingual**; genre never overrides input language.
- **Governing principle — attribute disentanglement at full strength:** edit exactly what was named, push it to an unmistakable degree, hold everything else at input fidelity. Two symmetric failure modes: **leakage** (touching what wasn't named) and **under-editing** (change too faint to notice).
- **Preservation locks content, never edit strength.** Name untargeted content *by type, position, role* — never describe its appearance (a concrete preservation description reads as a generation instruction and makes it drift).
- **Identity is the hardest invariant:** face, recognisable accessories, product markings/count, and rendering medium survive every edit. When identity comes from a reference, *point at the reference* — verbal descriptions degrade the likeness.
- **Text in the image is literal:** commit to exact characters inside quotes, or don't add text at all.
- **Multi-image tagging:** with N≥2 inputs the rewrite MUST use per-image tags (never "图1"/"image A"); state each image's role (canvas vs donor). Single image → natural reference, no tags.
- Output carries `wh_ratio` + `ratio_follow` (mutually exclusive).

### 6b. T2I Prompt Rewriter (`prompt_rewrite/prompts/system_prompt_t2i.txt`) [V]
[GitHub raw](https://raw.githubusercontent.com/QwenLM/Qwen-Image-2.1/main/prompt_rewrite/prompts/system_prompt_t2i.txt)

- Turn the request into **one long English paragraph describing the finished image as seen**, plus the aspect ratio — *as an observer reporting what is in the frame*, not talking to the user or renderer.
- **Eight ordered steps; each commits one decision, later steps never revise earlier ones.**
- **Fixed vs open:** every text string, named object, count, colour, stated position and given aspect ratio must survive **character-for-character** (own script, punctuation, spacing). Everything else is the rewriter's to decide.
- **Job instructions are not content:** "use double quotes", "no hard-edged blocks", "4K, sharp" — obey silently, never echo them into the description.

**Practical translation for the agent:** lead with the operation; give one blanket preservation clause; describe appearance concretely *only* for what changes; quote every rendered string exactly; don't echo QA instructions into the prompt.

---

## 7. Benchmarks — with the necessary caveats

| Claim | Number | Label | Source |
|---|---|---|---|
| **Qwen-Image-Bench (Qwen's own chart)** | **Qwen-Image-2.1 = 60.28 overall**, above Nano Banana 2.0 (59.82) and every listed open-weight model; FLUX 2 Max 32B = 55.33; **6 closed models higher**, led by GPT Image 2.5 Sunburst (67.01) | [C] | [MarkTechPost](https://www.marktechpost.com/2026/09/21/alibaba-qwen-releases-qwen-image-2-1/) reading Qwen's chart |
| **Artificial Analysis open-weights T2I Elo (independent)** | **Qwen-Image-2.1 = 1044±12, rank #1** of open-weight models (5,875 samples, Sep 2026) — above FLUX 3 Image Klein (1043), Fibo 2.0 (1040), Ideogram 4.0 (1026), FLUX.2 [dev] anchor (1000); original Qwen Image = 903 | [C] | [Artificial Analysis leaderboard](https://artificialanalysis.ai/image/leaderboard/text-to-image/open-weights) |
| **Qwen-Image-Bench official leaderboard** | Lists **18 models without Qwen-Image-2.1**: GPT Image 2 64.69, Nano Banana 2.0 59.82, GPT Image 1.5 59.65, Nano Banana Pro 59.45, Qwen Image 2.0 Pro 57.84 | [V] | [QwenLM/Qwen-Image-Bench README](https://github.com/QwenLM/Qwen-Image-Bench/blob/main/README.md) |
| Press framing | "beats Google Nano Banana 2.0 … competitive with OpenAI and Meta" — but *on its own internal benchmark* | [C] | [Tom's Hardware](https://www.tomshardware.com/tech-industry/artificial-intelligence/alibaba-claims-new-qwen-image-2-1-ai-model-beats-google-nano-banana-2-0-with-minuscule-7b-parameter-model-benchmarks-show-open-weight-contender-is-competitive-with-openai-and-meta-image-models) |
| Benchmark provenance | Qwen-Image-Bench paper, EMNLP 2026 main | [V] | [aclanthology.org/2026.emnlp-main.988.pdf](https://aclanthology.org/2026.emnlp-main.988.pdf) |

> **Hard rule for the agent:** never quote a "Qwen-Image-Bench score" *from the leaderboard* as 2.1's score — 2.1 is not on that table. The 60.28 figure comes from Qwen's own chart as reported by MarkTechPost; the independent figure is Artificial Analysis' Elo 1044 (#1 open-weights).

---

## 8. Known issues and community findings

### Official GitHub issues (`QwenLM/Qwen-Image-2.1`, [V])

| # | Title | State | Relevance |
|---|---|---|---|
| 21 | **No official local-edit inference examples** (circles/paint/mask) | OPEN | The official blog shows examples but ships no code — matches our finding that local edit mechanics are under-documented |
| 12 | **Hands break often** | OPEN | Don't promise anatomically perfect hands |
| 14 | **GGUF produces persistent line artifacts** | OPEN | We run Q5_K_M GGUF + fp8 — watch for line artifacts |
| 9 | **Same seed in multi-round edits → oversaturation + fragments** | OPEN | Change seed between successive region passes |
| 25 | Text encoder takes **25–60 s/image** on torch 2.9.1 (slow_conv_dilated3d fallback) | OPEN | Explains slow cold jobs |
| 23 | Prompt rewriter too slow | OPEN | — |
| 20 | VRAM: "single 4090 can't run it" | OPEN | Unoptimized; ours offloads ~74×/job |
| 13 / 10 / 15 | Research License → "revert to Apache"; commercial contact address **bounces**; "can I use commercially?" | OPEN | See §10 |
| 6 | MPS VAE corruption at H×W ≥ 65536 | OPEN | Mac-only |
| — | VAE checkerboard texture → community fix `madebyollin/texture-fix-vae-for-qwen-image-2.1` | [C] | not in our stack |

### Large-scale independent review — 310 images ([C] [yasue](https://en.yasue.org/article/qwen-image-2-1-codex-310-image-review))
- Average **84.2/100**; mean pure generation **21.0 s** (median 18.8 s, INT8).
- *"Very strong at making images. But do not place too much trust in it yet for long text, precise local edits, or OpenPose reliability."*
- **Long text breaks** in every language; looks like a magazine but body copy isn't readable.
- **Edits leak:** *"change only this part and preserve everything else perfectly"* regularly touches other areas.
- **Outpainting = 56/100** — "no dedicated canvas control"; prompting the canvas is impractical.
- **5 reference images → CUDA driver error**; standardized on ≤4 (stable to the end at 4).
- Colour/style changes strong; "IT2I" close to real editing.

### Reddit sentiment (via Exa; direct Reddit HTML/JSON is 403 this session) [C]
| Thread | Takeaway |
|---|---|
| [A Brief Review](https://www.reddit.com/r/StableDiffusion/comments/1wlo06m/a_brief_review_after_trying_out_qwen_image_21/) | Quality decent, runs well locally; common ratios feel **synthetic — yellowish tone + grain, "GPT Image look"**; the edit model is "closer to editing than reference" |
| [Is it worth it?](https://www.reddit.com/r/StableDiffusion/comments/1wnq6nb/is_qwen_image_21_worth_it/) | *"For editing, it is great. If you input a high-quality image with great skin/texture…"* — input quality determines output quality |
| [Seems amazing but…](https://www.reddit.com/r/StableDiffusion/comments/1wouvog/qwen_image_21_seems_amazing_but/) | *"a dumb edit model"* — placed a purse without rescaling it; instruction-style prompting ("make a new image with the character from X wearing the outfit from Y…") fixes a lot |
| [Demo workflow problem](https://www.reddit.com/r/StableDiffusion/comments/1wtdeb0/the_big_problem_with_qwen_21_t2i_is_their_demo/) (89 pts) | Defaults (CFG=1, steps=20) **put people off**; suggested **CFG 3, steps 12, dpmpp_m3, beta scheduler**; still misses text and fuses limbs; more detail than Krea 2 above 2K |
| [Not Bad](https://www.reddit.com/r/StableDiffusion/comments/1wnr5u8/qwen_image_21_not_bad/) | **CFG > 1 is the key**, plus abnorsett_3m / beta_57 / shift 16, 30 steps, 2.5 MP, *"Don't forget to use negative prompt, helps immensely"* |
| [Best settings?](https://www.reddit.com/r/StableDiffusion/comments/1wq4wke/whats_the_best_settings_and_enhancements_for_qwen/) | euler/bongtangent, CFG 3.5 + FreSca 15 steps then CFG 1 for 10 steps, official t2i prompt enhancer with thinking, 8192 token limit |

> **Interpretation:** the community's "CFG 1 is bad" complaints are about **t2i aesthetics**, achieved with negative prompts and samplers our wrapper doesn't expose (F15/F16). Our stack runs CFG 1 per the official spec. Do **not** silently start raising CFG — it would activate the negative-prompt path we can't control. Treat CFG>1 recipes as *unreachable* until the wrapper grows a `-Negative`/`-Scheduler`.

### Hardware / local run [C]
| Source | Fact |
|---|---|
| [Unsloth](https://unsloth.ai/docs/models/qwen-image-2.1) | **11 GB VRAM with GGUFs, 24 GB with INT8/FP8** as the rule of thumb; FP8 can run on **6 GB with offloading at <2× slowdown**; **INT8 has the best LPIPS (0.064) — better than FP8 (0.112)**, so Unsloth defaults to INT8 |
| [toyhank 8GB](https://github.com/toyhank/qwen-image-2.1-8gb) | Measured on RTX 2080 SUPER 8 GB: Q4_K_M, 768×768, 12 steps = **213.31 s**, peak **7623 MiB**; 32 GB system RAM is the practical target; "8 GB is a target profile, not a claim that all weights total 8 GB" |
| Our stack (4060 Ti 8 GB) | ~74 offload loads/job; cold first job ≈348 s, warm ≈120 s [L] |

---

## 9. Hosted API surface (for completeness — EggLab runs locally, not via API)

From the [Aliyun Model Studio API reference](https://help.aliyun.com/en/model-studio/qwen-image-generation-and-editing-api-reference) [V]:

| Parameter | Behaviour on `qwen-image-2.1-*` |
|---|---|
| `model` | `qwen-image-2.1-pro`, `qwen-image-2.1-turbo` (3.0 series is separate) |
| `size` | DashScope: `"1024*1024"` (**asterisk**); OpenAI-compatible: `"1024x1024"` (**letter x**). 512²–2048², AR 1:8–8:1. Omitted → model picks from prompt |
| `image` (I2I) | **1–10 images** for the 2.1 series (1–3 for 3.0); JPG/PNG/BMP/TIFF/WEBP/GIF; ≤8000 px/side (best 384–2048); AR ≤10:1; ≤10 MB |
| `n` | 1–6, default 1 |
| `prompt_extend` | default **true** (DPE `direct` / APE `agent` — APE is **T2I-only**, 400 on I2I) |
| `enable_thinking` | default **true**, requires `prompt_extend` |
| `negative_prompt` | **Only the 3.0 series** — not 2.1 |
| `seed` | 0–2147483647 |
| `watermark` | default false |
| steps / guidance | **Not exposed by the API at all** |

(Third-party mirror of these quirks: [laozhang blog](https://blog.laozhang.ai/en/posts/qwen-image-2-1-turbo-api) [C].)

---

## 10. License — non-commercial

**Qwen RESEARCH LICENSE AGREEMENT**, release date September 20, 2026 ([full text](https://huggingface.co/Qwen/Qwen-Image-2.1/raw/main/LICENSE) [V]):

- Licensor: **Hangzhou Tongyi Laboratory Technology Co., Ltd.** (Qwen).
- **Research / non-commercial use**; commercial use requires a separate grant — contact `model-business@notice.qwencloud.com` (issue [#10](https://github.com/QwenLM/Qwen-Image-2.1/issues) reports this address **bounces**; issue [#13](https://github.com/QwenLM/Qwen-Image-2.1/issues) asks Qwen to return to Apache 2.0; both still open).
- Governing law / jurisdiction: **Hangzhou**.
- Contrast: earlier Qwen-Image models were Apache 2.0 — this is a deliberate change and the community is annoyed about it.

> **Practical note for EggLab:** outputs of a non-commercial model used in a commercial PhotoCraft deliverable is a *user* decision, not the agent's. The agent should not assert "free for commercial use."

---

## 11. Reachability matrix — the one table the agent must be taught from

| Capability | MCP tool today | Wrapper/engine support | Verdict |
|---|---|---|---|
| Text-to-image, any width/height/steps/seed | `egglab_generate` | ✅ | **REACH** |
| Reference edit, 1–10 images | `egglab_edit images:[…]` | ✅ `-r` | **REACH** |
| Region edit (crop / inpaint, feather, strength) | `photocraft_edit_active region/mode/feather/strength` | ✅ `-InitImg -Mask -Strength` | **REACH** |
| Transparent RGBA generate/edit + verification | `transparent=true` + `egglab_check_alpha` | ✅ official RGBA template wrapper | **REACH** |
| Turbo 8-step | `workflow:"turbo"` | ✅ forced 8/CFG1 + sigma preset + LoRA tag | **REACH** |
| Quality 25-step | `workflow:"quality"` | ✅ settings.json | **REACH** |
| Aspect presets / explicit size | `settings {aspect}` / `width,height` | ⚠️ panel table ≠ official table (§4) | **REACH** (use explicit px for official pairs) |
| Image guidance `imgCfg` | ❌ not in MCP schema | ✅ engine `-ImgCfg`, http `body.imgCfg` | **LOW** (needs a one-line schema+forward addition) |
| Negative prompt | ❌ | ❌ never passed | **NO** |
| Scheduler (beta/bong_tangent/…) | ❌ | ❌ only `--sampling-method` | **NO** |
| CFG > 1 recipes from Reddit | `settings {cfg}` **does** accept it | ✅ `-Cfg` | **REACH but discouraged** — activates negative path we can't populate; official spec is CFG 1 |
| Painted-annotation / circle local edit (F4/F5) | `photocraft_edit_active` on the user's marked active layer | PhotoCraft annotation UI (already exists); prompt removes marks | **REACH via PhotoCraft UI** |
| Separate painted mask layer | `photocraft_edit_active mask_layer:"name"` (+ `mask_invert`) | PhotoCraft mask layer + `--init-img --mask --strength` | **REACH via PhotoCraft UI** |
| Outpaint LoRA | ❌ | ❌ LoRA not downloaded | **NO** |
| ControlNet / IP-Adapter / ADetailer / upscale modes | ❌ | ❌ no models present | **NO** |
| Hosted `prompt_extend` / APE | ❌ local only | — | **NO** (agent emulates §6 instead) |
| LoRA via prompt tag `<lora:…>` | prompt passes through | ✅ sd-cli parses `<lora:` (verified in binary); only the Turbo LoRA file exists | **LOW** (works only for files in `D:\neww\Models`) |

---

## 12. Source index

**Official Qwen / Alibaba**
1. https://huggingface.co/Qwen/Qwen-Image-2.1 — model card
2. https://github.com/QwenLM/Qwen-Image-2.1 — repo README, prompt_rewrite, issues
3. https://www.alibabacloud.com/blog/603586 — official blog (full text captured)
4. https://qwen.ai/blog?id=qwen-image-2.1 — original blog (JS-rendered; content mirrored at #3)
5. https://huggingface.co/Qwen/Qwen-Image-2.1/raw/main/LICENSE — Research License
6. https://huggingface.co/Qwen/Qwen-Image-2.1-PE-I2I/raw/main/system_prompt.txt — edit PE prompt
7. https://raw.githubusercontent.com/QwenLM/Qwen-Image-2.1/main/prompt_rewrite/prompts/system_prompt_t2i.txt — t2i PE prompt
8. https://help.aliyun.com/en/model-studio/qwen-image-generation-and-editing-api-reference — hosted API params

**Ecosystem docs**
9. https://docs.comfy.org/tutorials/image/qwen/qwen-image-2-1 — ComfyUI tutorial + tuning table
10. https://huggingface.co/docs/diffusers/api/pipelines/qwenimage21 — diffusers API (no mask_image)
11. https://unsloth.ai/docs/models/qwen-image-2.1 — memory/quant/settings tables
12. https://github.com/QwenLM/Qwen-Image-Bench — official leaderboard (no 2.1)
13. https://aclanthology.org/2026.emnlp-main.988.pdf — Qwen-Image-Bench paper

**Benchmarks / press**
14. https://artificialanalysis.ai/image/leaderboard/text-to-image/open-weights — independent Elo (#1 open-weights)
15. https://www.marktechpost.com/2026/09/21/alibaba-qwen-releases-qwen-image-2-1/ — 60.28 overall reading Qwen's chart
16. https://www.tomshardware.com/…qwen-image-2-1… — press coverage with the internal-benchmark caveat

**Community / hardware**
17. https://github.com/QwenLM/Qwen-Image-2.1/issues — #6, #9, #10, #12, #13, #14, #15, #20, #21, #23, #25
18. https://en.yasue.org/article/qwen-image-2-1-codex-310-image-review — 310-image review
19. https://huggingface.co/ausboss/Qwen-Image-2.1-Outpaint-LoRA — outpaint LoRA + seam-rectangle warning
20. https://github.com/toyhank/qwen-image-2.1-8gb — measured 8 GB run
21. Reddit threads (Exa-extracted): 1wlo06m, 1wnq6nb, 1wouvog, 1wtdeb0, 1wnr5u8, 1wq4wke, 1wsdnjs (r/StableDiffusion)

**Local files (reachability evidence)**
22. `D:\neww\EggLab\egglab.ps1` — param block, sdArgs assembly (lines 160–205)
23. `D:\neww\EggLab\panel\mcp-server.mjs` — tool schemas (no imgCfg/negative/scheduler)
24. `D:\neww\EggLab\panel\service\engine.mjs` — `-InitImg -Mask -Strength -ImgCfg`, `transparentPrompt`
25. `D:\neww\EggLab\panel\service\settings.mjs` — `ASPECTS`, `DEFAULTS`
26. `D:\neww\EggLab\engine\sd\sd-cli.exe --help` — full flag surface (`-M` modes, `--scheduler`, `-n`, `--sigmas qwen-image-2.1-turbo`)
27. `D:\neww\EggLab\panel\tools\BASELINE.md` — our seam/retouch measurements

---

*Research method note: `websearch` returns 403 and Reddit HTML/JSON is blocked (403/bot-challenge) this session; discovery used **Exa via mcporter** (`exa.web_search_exa`) and **google-surf `extract`** for known URLs, Jina Reader as fallback, `gh` for issues. All captures saved under `%TEMP%\qwen-research\q01..q32.txt`.*
