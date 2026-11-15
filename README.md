# EggLab

Local AI image generation and editing for Windows, powered by **Qwen-Image-2.1**.
One standalone engine, no ComfyUI, no Python, no cloud.

## What is here

```
EggLab\
  engine\sd\        stable-diffusion.cpp CUDA build (sd-cli.exe) + CUDA runtime DLLs
  out\              generated images
  config.json       engine + model locations and defaults
  install.ps1       engine download + model check
  egglab.ps1        runner (text-to-image and image editing)
  egglab.cmd        convenience wrapper for egglab.ps1
  egglab-edit.cmd   drag-and-drop edit helper
```

Models live in `D:\neww\Models` (see `config.json`):

| File | Role | Size |
|---|---|---|
| `qwen-image-2.1-UC-fp8.safetensors` | Qwen-Image-2.1 diffusion model (uncensored, fp8) | 6.6 GB |
| `qwen_image_2.1_vae_bf16.safetensors` | Qwen-Image-2.1 VAE | 0.63 GB |
| `Qwen3VL-8B-Uncensored-HauhauCS-Balanced-Q6_K.gguf` | Qwen3-VL-8B text encoder (uncensored, Q6_K) | 6.3 GB |
| `Qwen3VL-8B-Uncensored-HauhauCS-Balanced-mmproj-f16.gguf` | vision projector (image editing) | 1.1 GB |
| `qwen_image_2.1_turbo_lora_avg_rank_178_bf16.safetensors` | Turbo LoRA (optional, `-Turbo` fast mode) | 0.85 GB |

## Quick start

Text to image:

```
egglab.cmd "a neon shop sign that reads EGGLAB, rainy night, reflections"
```

Edit an image:

```
egglab.cmd "change the sign text to NEON CAT, keep the rainy mood" -Image .\photo.png
```

Or drag a PNG onto `egglab-edit.cmd`, type the instruction, press Enter.

Fast mode (8 steps, about half the time, quality holds up well):

```
egglab.cmd "a neon shop sign that reads EGGLAB, rainy night" -Turbo
```

Quick smoke test (fast, low resolution):

```
egglab.cmd "a red apple on a wooden table" -Steps 4 -Width 512 -Height 512
```

Options:

| Option | Default | Meaning |
|---|---|---|
| `-Width` / `-Height` | 1024 / 1024 | output size (multiples of 32); when editing and omitted, follows the source aspect ratio, max 1024 |
| `-Steps` | 20 | sampling steps |
| `-Cfg` | 6.0 | guidance scale |
| `-Seed` | random | reproducibility |
| `-Out` | `out\egglab-<time>.png` | output path |
| `-NoOffload` | off | keep weights in VRAM (needs more than 8 GB) |
| `-Cpu` | off | pure CPU backend |
| `-Turbo` | off | Turbo LoRA: 8 steps, CFG 1.0, fixed sigma schedule; `-Steps` / `-Cfg` still override |
| `-Open` | off | open the result when done |

Multiple references: repeat `-Image a.png -Image b.png` (up to 10).

RGBA generation: start the prompt with
`This is an RGBA image with transparency. ... The image has alpha channel and the background is transparent.`

## Performance (RTX 4060 Ti 8 GB, 1024x1024)

- text to image, 20 steps: about **93 s** (7 s load, 77 s sampling, 3.4 s VAE decode, ~3.4 s/step).
  Quality now defaults to 40 steps, so expect roughly double.
- text to image, Turbo 8 steps: about **48 s** (35 s sampling, ~2.4 s/step)
- image edit, 20 steps: about **110 s** with the q8_0 prefix cache (~4.1 s/step; without it the
  cache is disabled on 8 GB VRAM and it takes ~205 s). Quality at 40 steps is roughly double.
- image edit, 8 steps: about **62 s** end to end
- 512x512, 4 steps: ~25 s, only useful to check plumbing — the image is very rough

## Install

```
.\install.ps1
```

It downloads the pinned CUDA engine build and checks the required model files
(plus the optional Turbo LoRA). If a file is missing it searches `-ComfyUIPath`
(default `D:\ComfyUI\models`) and copies it in automatically; otherwise it prints
the official download link. Use `-ModelsPath` / `-EnginePath` to relocate, or
`-NoCopy` to only report.

## Panel (the EggLab companion window)

`egglab-panel.cmd` starts the Electron side panel that sits next to PhotoCraft
(`egglab-panel.cmd -Dev` adds devtools). It is a separate window on purpose:
PhotoCraft's WASM plug-in API is filter-only, so the panel talks to the running
app over its control port instead of modifying PhotoCraft.

The chat bubble is an **OpenCode agent** (`panel/agent/`), not a local chat
model. It drives Qwen-Image-2.1 and PhotoCraft through the `egglab` MCP server in
`panel/mcp-server.mjs`. Pick the model in **Settings → Agent model**; custom
providers can be marked as image-capable in `panel/settings.json`:

```json
"opencode": {
  "model": "inferx/deepseek-v4.1-flash-1017-basic",
  "customProviders": ["inferx"],
  "vision": true
}
```

`customProviders` lists providers whose model list comes from a live endpoint
with no capability metadata (opencode otherwise treats them as text-only and
silently drops attachments). `vision` declares image input for the selected
model; set it to `false` for a model that really cannot see.

### References — layers, text layers, and the live canvas

| Button / gesture | What it sends |
|---|---|
| **Attach** | any image file |
| **Use selected layer** | the active PhotoCraft layer, alpha preserved |
| **Pick layer** | any layer from a list with kind badges: `T` type, `P` pixel, `S` shape, `A` adjustment, `O` smart object, `F` fill, `G` group |
| `@LayerName` in the message | that layer, exported automatically on send |
| **Show canvas** | the whole flattened canvas as `@canvas` |

Text layers work exactly like pixel layers: the panel exports the rendered
glyphs (transparent background) and the agent can use them as a design
reference. For type-driven art the agent is instructed to keep PhotoCraft's
editable text layer on top rather than baking words into pixels, unless the user
wants a fully rendered poster.

**Show canvas** is the hybrid-workflow hook: `photocraft_canvas` (same route as
`photocraft_preview`) exports a flat PNG of the document via `doc.save`, so the
agent sees the real composite — not a screenshot of the app window. It is used
to match colours, check layout, and verify placements.

### Projects and sessions

- Work is autosaved after the agent places or edits a layer **when the document
  already has a file**. Untitled documents are never given a path silently; the
  panel asks with its own Save-as dialog.
- Projects live in `projects/<slug>/<slug>.pcraft` under the PhotoCraft write
  root (`D:\neww`).
- Chats are per document: switching documents switches threads; each thread is
  an OpenCode session. Changing the agent model forks a fresh session so a
  vision-blind thread is never reused. Rename, delete and prune are in the
  thread popover.

### QA probes

```
node panel\tools\canvas-text-test.mjs   # type layer export + composite canvas + MCP surface
node panel\tools\vision-e2e.mjs         # attaches both as refs and asks the agent what it sees
node panel\tools\fork-test.mjs          # model change forks the session
```

## Notes

- The engine is `stable-diffusion.cpp` (MIT). Qwen-Image-2.1 support landed 2026/09/20.
- Qwen-Image-2.1 needs **its own VAE**; Qwen-Image 1.0 and Wan 2.2 VAEs are not interchangeable.
- For image editing the vision projector (`mmproj`) must be present.
- Outputs land in `out\`; the engine also prints per-step timings when you add `-v` to the raw command.
- `-Turbo` logs many `unused lora tensor (...img_mlp.gate_up...)` warnings. They are expected:
  the Turbo LoRA has 665 tensors and the engine applies 569; the rest do not exist in this
  fp8 base and are ignored.
