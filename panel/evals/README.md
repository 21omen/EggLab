# EggLab evaluation suite

Run the same brief, same references and same runtime/model configuration against v1 and v2. Where model nondeterminism exists, repeat generation-based cases and compare distributions or reviewer judgments rather than treating one seed as absolute truth.

## Evaluation loop
1. Freeze the test brief, inputs, model version, profile and expected constraints.
2. Capture the full run trace: skills loaded, references opened, tool calls, parameters, seeds, timing, errors, edits and QA output.
3. Grade intent understanding, skill selection, tool selection, constraint satisfaction, artifact quality, recovery behavior and delivery accuracy.
4. Compare against a human-reviewed expected outcome or rubric.
5. Add every material failure to regression-log.md.
6. Change one module or rule at a time and rerun affected cases plus the full critical set.

## Do not optimize only for token count
Track both context efficiency and actual outcome quality. A missing relevant skill is a worse failure than reading one extra small reference. Measure skill precision, skill recall, unnecessary loads, omitted required checks, tool success, revision count and final artifact quality.

## Suggested release gate
- 100% of critical hard constraints respected in the test set.
- No unauthorized destructive operation.
- No false claims that a tool/action succeeded.
- Every benchmark test loads required skill(s) or explicitly identifies why no skill is needed.
- No regression in required original command/workflow coverage.
- Human review accepts visual quality and task-specific QA.

## Automated gate

`npm run test:agent` (also run by `.github/workflows/agent-gate.yml` on every
panel push/PR and by the release workflow before building) validates:

- all 26 benchmark cases plus the 18 agent-upgrade routing cases;
- unique IDs and required fields;
- every `must_load` / `conditional` / `primary_skill` / `supporting_skills`
  skill exists in `skills/`;
- every `egl_*` reference in the prompt, router, manifest, evals and MCP
  instructions maps to a registered MCP tool (bare MCP name + `egl_` prefix);
- each upgrade case's task â†’ expected tool chain (generate / edit /
  photocraft_edit_active) and its required prompt evidence, including
  `mask_layer` for separate-mask cases;
- the root OpenCode prompt points at the canonical `panel/AGENT.md`;
- MCP/turn timeouts exceed the 60-minute `download_models` wait;
- the MCP download tool reports failures as failures (via a fake panel), and
  recent-project limits are forwarded;
- the user-painted mask layer is normalized to the active canvas, including
  luminance, alpha and invert conventions.

The gate is deterministic and needs no GPU, model provider or PhotoCraft.

## Measured runs

- **2026-11-18, 0.3.19:** `npm run test:live` â€” 6 production tasks, **31/31
  checks** on `opencode-go/deepseek-v4.1-flash`: text effect, transparent
  cut-out, multi-reference, editable-type poster/save/export, annotated photo,
  separate mask.
- **2026-11-18, 0.3.20:** session recovery â€” 10 old transcript files migrated,
  5+2 transcripts recovered from OpenCode, real skin-retouch chat restored.
- **Not yet measured:** the full 26 benchmark briefs and 18 upgrade briefs have
  not all been executed against real jobs. The regression log records the
  subset that has evidence; do not cite the full suite as measured.


