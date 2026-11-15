# EggLab Agent v2.1 — modular creative production system

**Version:** 2.1.0 · **Prepared:** 2026-11-12 · **Original:** https://pastebin.com/2EtM2uTL

EggLab v2 is one central creative operator with a compact always-loaded core and eight task skills. Skill procedures load when activated; technical references load only when a concrete decision requires them. A structured job-state template, runtime profile and evaluation set improve continuity and reliability without turning the prompt into a growing encyclopedia.

**v2.1 note:** the knowledge files are unchanged from the 2.0.0 package; 2.1.0 is the panel-integrated build with the native lazy loader, the original local style cards and the three local research documents.

## Quick start
1. Back up your current agent prompt and knowledge directory.
2. Copy this folder to a versioned `egglab-agent-v2/` directory.
3. Load `AGENT.md` as the always-loaded system instruction.
4. Implement the allowlisted read-only loader in `integration/runtime-contract.md`; a file split alone does not create lazy loading.
5. Register skills using `manifest.yaml`. At startup expose only skill name/description; load selected `SKILL.md` files after routing; load individual references on demand.
6. Map actual EggLab tools to `config/tool-registry.yaml`. Use live tool definitions and `egglab_photocraft_commands` for exact schemas. Do not invent parameters.
7. Populate the runtime profile from live EggLab status and engine configuration.
8. Run `evals/benchmark-cases.yaml` against v1 and v2. Keep v1 untouched until all critical cases pass.

## Required host capability
The runtime must provide one of: native Agent Skills loading; host-side retrieval that injects selected files; or a restricted read-only tool such as `egglab_read_knowledge(path)`. That resolver must only read allowlisted text files under this package. A model cannot read files just because paths appear in its prompt. If the host still injects every file into every turn, the context-saving goal has not been achieved.

## Package contents
- `AGENT.md`: compact core identity, universal policy and operating loop.
- `ROUTER.md`, `manifest.yaml`: routing and loading metadata.
- `skills/`: eight focused `SKILL.md` files.
- `references/`: engine facts, design, asset planning, PhotoCraft, scenarios, styles, QA and research.
- `config/`: runtime profile, paths, policies and tool-name registry.
- `templates/`: job state, asset plan, delivery report.
- `evals/`: 24 benchmark cases, rubric and regression log.
- `migration/`: original-section mapping and transparent source notes.
- `integration/`: safe loader contract.

## Source limitation (important)
Pastebin reports 1,132 lines / 65.52 KB. The raw source was inspected in browser text, but a byte-for-byte local download was unavailable in this build runtime. This ZIP does not falsely claim to include an exact archival copy of v1. It includes a detailed migration map, the recoverable tool names and source-derived technical information. Keep the original Pastebin or your local v1 file as the immutable archive. The three research files and eight local style cards mentioned by v1 are not embedded in Pastebin; see `references/research/README.md` and `references/styles/README.md`.

## Non-goals
- Do not turn EggLab into eight separate agents.
- Do not let the model rewrite permanent rules autonomously.
- Do not treat model capabilities, license, fonts or tool schemas as timeless facts.
- Do not expose arbitrary shell, scripts or unrestricted file access to the creative agent.
