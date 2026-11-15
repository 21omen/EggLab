# Original v1 → v2 migration map

Original source: https://pastebin.com/2EtM2uTL  
Original title: EggLab agent specification  
Source size and line count previously surfaced by Pastebin: approximately 65.52 KB / 1,132 lines.  
Migration package date: 2026-11-12.

## Preservation note
The Pastebin source was inspected through its text view in sections. Directly downloading the raw source into the build environment was blocked. Consequently, this package does **not** claim to contain an exact byte-for-byte original backup. Save your own original as `archive/agent-v1-original.md` before installation. Where the Pastebin only references local research documents/style cards without embedding their contents, this package preserves their names and provides clearly labeled starter equivalents, not fabricated originals.

## Section mapping
| Original section/content | v2 destination | Migration treatment |
|---|---|---|
| 1. Identity, operating principles and hard constraints | `AGENT.md`, `config/policies.yaml`, `skills/qa-delivery/SKILL.md` | Core behavior retained; universal rules centralized |
| 2. Design thinking and visual direction | `skills/design-direction/SKILL.md`, `references/design/*` | Principles preserved; universal decoration rules made conditional |
| 3. Asset decomposition / L0–L7 | `skills/asset-planning/SKILL.md`, `references/asset-planning/asset-stack.md` | Stack preserved and task-aware |
| 4. Engine/model operation | `skills/image-generation/SKILL.md`, `references/engine/qwen-image-2.1-legacy-facts.md`, `config/runtime-profile.example.yaml` | Values tagged legacy/live-verify |
| 5. Prompt construction | `skills/image-generation/SKILL.md`, `references/image-generation/prompt-blueprint.md` | Long prompt profile retained for complex composition; no padding simple prompts |
| 6. Reference-image strategy | `skills/reference-editing/SKILL.md`, `references/reference-editing/reference-mapping.md` | Role mapping and source preservation retained |
| 7. Editing/local edits | `skills/reference-editing/SKILL.md`, `references/reference-editing/local-edit-and-seam-control.md` | Region/seam/edit-scope rules retained; tool-unit values live-verify |
| 8. Text and exact copy | `skills/image-generation/SKILL.md`, `skills/photocraft-production/SKILL.md`, `references/image-generation/prompt-blueprint.md` | Exact string, editable type and phantom-text checks retained |
| 9. Transparency/alpha | `skills/transparency/SKILL.md`, `references/transparency/alpha-workflow.md` | Alpha generation and export verification retained |
| 10. PhotoCraft operations | `skills/photocraft-production/SKILL.md`, `references/photocraft/*` | Tool names and command families inventoried; schemas must be live-discovered |
| 11. Scenario recipes | `skills/scenario-recipes/SKILL.md`, `references/scenarios/scenario-recipes.md` | All identifiable scenario families consolidated |
| 12. Richness, finishing and style cards | `references/design/finishing-and-support.md`, `references/styles/*`, `skills/qa-delivery/SKILL.md` | Style-aware, not universal; named styles retained as starter cards |
| 13. QA | `skills/qa-delivery/SKILL.md`, `references/qa/audit-metrics-and-profiles.md` | 11 categories retained with profile-specific gating |
| 14. Research references and paths | `references/research/README.md`, `config/paths.example.yaml` | Filenames/path variables retained; missing local contents not invented |
| 15. Hard rules | `AGENT.md`, `config/policies.yaml`, `integration/runtime-contract.md` | Safety, preservation, honesty and approval boundaries centralized |
| Original tool list | `config/tool-registry.yaml`, `references/photocraft/command-catalog.md` | Names retained; actual schemas require local discovery |

## Preserved named EggLab tools
- `egglab_status`
- `egglab_generate`
- `egglab_edit`
- `egglab_models`
- `egglab_download_models`
- `egglab_check_alpha`
- `egglab_photocraft_launch`
- `egglab_photocraft_canvas`
- `egglab_photocraft_audit`
- `egglab_photocraft_new_document`
- `egglab_photocraft_command`
- `egglab_photocraft_commands`
- `egglab_photocraft_batch`
- `egglab_photocraft_place`
- `egglab_photocraft_edit_active`
- `egglab_photocraft_layers`
- `egglab_photocraft_project`
- `egglab_photocraft_save`
- `egglab_photocraft_export_flat`
- `egglab_photocraft_export_layers`
- `egglab_photocraft_export_layer`

Original explicit instruction: PhotoCraft state is available from `egglab_status`; do not call `photocraft_status`.

## Preserved PhotoCraft command families
Document/file; type; shape; layer; selection/mask; adjustments; transform/image; blur/sharpen/noise/other filters; layer styles; finishing/image-adjustment families. Exact names are in `references/photocraft/command-catalog.md`.

## Three unbundled local research files
1. `qwen-seamless-local-edit.md`
2. `qwen-image-2.1-features.md`
3. `agent-failure-research.md`

They are mentioned by the original, but their full content was not embedded in the Pastebin. Copy the actual local files into `references/research/local/` and add their paths to `manifest.yaml` if needed.

## Original named style cards
`blue-note`, `riso`, `swiss`, `bauhaus`, `memphis`, `midcentury-travel`, `editorial-luxury`, `grunge-print`. The package includes starter interpretations only. Replace with exact local style cards if the original cards exist separately.

## V2 behavior changes (deliberate)
1. Visual richness, grain, three supporting devices, forced headline intersection and bleed are conditional by style/medium, not universal QA gates.
2. The 400–500-word prompt rule is retained as a complex-composition profile, not a target for every prompt.
3. Render budget and timing are driven by actual runtime measurements and task uncertainty.
4. Model, VRAM, architecture, license and engine claims are marked legacy and require live verification.
5. PhotoCraft batches require preflight and partial-success inspection after failure.
6. Add job state, run traces, benchmark cases and regression testing.
7. Add allowlisted read-only knowledge retrieval without permitting arbitrary shell/file/script execution.
8. Destructive/irreversible operations require safe copy or explicit approval.

## Completion criteria for a truly lossless local migration
- Place exact v1 original into `archive/agent-v1-original.md`.
- Copy the three referenced research files and any original style cards into the designated folders.
- Compare all original paragraphs and tool schemas against this map.
- Run `egglab_photocraft_commands` and save the exact current command/schema output.
- Run benchmark cases on v1 and v2 before switching production routing.
