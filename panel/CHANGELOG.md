# Changelog

## 2.1.0 — 2026-11-12 (panel integration)
- Version aligned with the v2.1 setup drop. Its knowledge files are byte-identical to 2.0.0 (42/42 unmodified files matched), so 2.1.0 is the panel-integrated build rather than a new knowledge revision.
- The panel now builds `agent/AGENT.md` from `AGENT.md` + `ROUTER.md` + the manifest skill index + a live runtime snapshot: 14,977 B / 171 lines instead of the 65,933 B v1 manual.
- Added `egglab_read_knowledge`: read-only, allowlisted, symlink-safe MCP loader for `skills/`, `references/`, `templates/`, `config/` and `evals/` (512 KB cap, compact errors).
- Removed `agent-prompt.md`. A settings change now rebuilds only the runtime snapshot; skill bodies and references stay on disk and load on demand.
- Installed the eight original local style cards and three local research documents into `references/`, byte-identical to the source copies.
- Generated `config/paths.yaml` and `config/runtime-profile.yaml` from live panel settings at startup.

## 2.0.0 — 2026-11-12
- Reorganized one monolithic agent specification into one always-loaded core, a router, eight skills and on-demand references.
- Preserved the original named EggLab tools and PhotoCraft command families as an inventory.
- Preserved L0–L7 asset planning, prompt construction, reference mapping, local edit, alpha, PhotoCraft, scenario, design and QA knowledge.
- Introduced manifest-based routing, runtime capability profiles, allowlisted knowledge retrieval contract, job-state template and delivery report.
- Added benchmark suite, weighted quality rubric and regression log.
- Made print richness and stylistic devices conditional by design profile.
- Marked legacy engine facts, timings, parameter values and license claims for local verification.
- Documented missing Pastebin-linked local research files and unbundled exact v1 backup.
