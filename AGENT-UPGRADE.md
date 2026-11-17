# Qwen-Image 2.1 agent upgrade — implementation status

This implements the 17 November 2026 specification in the EggLab agent
knowledge layer, with one integration addition required by the spec's
"existing separate-mask data path" check. No new PhotoCraft UI was added.

## What changed

### Knowledge and routing
- `panel/manifest.yaml`: image-generation, reference-editing and transparency
  now load the Qwen 2.1 research directly; reference-editing also loads the
  seamless-local-edit research. Manifest version 2.2.0.
- `panel/skills/image-generation/SKILL.md`: task gate (new image only),
  Qwen 2.1 model/Turbo distinction, prompt construction, multi-reference,
  transparency, typography/storyboard/panorama, capability boundaries.
- `panel/skills/reference-editing/SKILL.md`: task classification, canvas/donor
  roles, direct edit prompts, PhotoCraft annotations, separate mask layer,
  sketch guidance, multi-reference, sequential edits, QA.
- `panel/skills/transparency/SKILL.md`: native RGBA generation/edit, subject
  extraction, alpha preservation and validation, compositing edge checks.
- `panel/ROUTER.md`: explicit routes for marked photos, separate masks,
  sketches, multi-reference and transparent assets; states that the existing
  PhotoCraft drawing/mask features are used as-is.
- `panel/AGENT.md`: image-task classification in the production loop.
- `panel/references/research/local/qwen-image-2.1-features.md`: corrected the
  stale "painted annotation = NO" row; the existing PhotoCraft marks/mask are
  now reachable.

### Existing PhotoCraft workflows, no new UI
- **Marks drawn on the active photo**: `photocraft_edit_active` exports the
  marked active layer. The skill tells the agent to name each mark, remove the
  annotation from the final image, and preserve unmarked areas. If marks are on
  a separate layer, the agent exports a flat marked composite and uses
  `egglab_edit`, then places the result back.
- **Separate painted mask layer**: added `mask_layer` and `mask_invert` to
  `photocraft_edit_active` (MCP + HTTP + `editActive`). The active layer is the
  canvas; `exportLayerByName` exports the named mask; `layerMask()` in
  `pngfeather.mjs` aligns it to the active layer bounds and converts
  luminance/alpha to an opaque black/white mask. The engine runs the existing
  `--init-img --mask --strength` path. The mask is never sent as a donor
  reference.
- MCP descriptions for `generate`, `edit`, `photocraft_edit_active` and
  `photocraft_layers` now state the routing and mask rules.

### Regression gate
- `panel/evals/agent-upgrade-cases.yaml`: 16 routing/prompt cases covering
  generation, instruction edit, marked photo, separate mask, sketch,
  transparency, multi-reference, typography, storyboard, panorama, material
  transfer and product placement.
- `tools/agent-regression.mjs`: parses both case files, validates the
  24 benchmark + 16 upgrade cases, task → tool chains, skills, prompt evidence,
  `mask_layer` arguments, manifest references and the timeout/config chain.
- `tools/mcp-contract-test.mjs`: download success/failure/running plus
  recent-project limit forwarding.
- `tools/mask-layer-test.mjs`: luminance, alpha, offset and invert mask
  conversion unit tests.
- `npm run test:agent` runs all three; release workflow and the new
  `agent-gate` workflow run it.

## Verification

- Mask normalization unit test: 7/7 (opaque black/white, offset, invert,
  transparent brush alpha, opaque output).
- Live dev mask edit: active 512x512 canvas + separate `MaskTest` layer produced
  `localEdit.mask` at 512x512; the engine log shows
  `preprocess mask[0]: 512x512` and the job completed in 18 s. Placement in dev
  was blocked by the dev out-dir not being inside the packaged PhotoCraft
  automation root; this is an environment path mismatch, not the mask path.
- Packaged end-to-end placement: to be verified in the release build with a
  scratch PhotoCraft document; update this line with the result after the
  packaged test.
- Full visual/LLM execution of the 24 benchmark and 16 upgrade briefs still
  requires a configured provider and human review; CI has no model credentials.

## Still out of scope

- No new drawing, annotation, mask-paint, canvas or editor UI.
- No ControlNet/depth/pose/IP-Adapter claim.
- No prompt-rewriter model dependency.
- No change to reference resizing/pipeline beyond the existing rules.
- Qwen weights remain under the Qwen Research License; commercial use needs a
  separate license from Qwen.
