# EggLab agent improvement plan (for the beta agent)

Status: approved direction, to be implemented on the **beta agent** only. The
official main agent stays unchanged until the beta agent is proven and promoted.

## Sources studied

- Panel agent as shipped: `panel/AGENT.md`, `panel/ROUTER.md`, the 8 skill
  packages, `panel/mcp-server.mjs` tool surface + server instructions,
  `panel/evals/benchmark-cases.yaml` (26 cases), `panel/evals/agent-upgrade-cases.yaml` (18 cases).
- Anthropic, *Building effective agents* — simple composable patterns (routing,
  chaining, parallelization, orchestrator, evaluator–optimizer) and Appendix 2:
  invest as much effort in the agent–computer interface (ACI) as in prompts;
  poka-yoke tools; test how the model uses them.
- Anthropic, *Effective harnesses for long-running agents* — the four classic
  failure modes (one-shotting, leaving a mess, declaring victory early, skipping
  end-to-end verification) and their fixes: structured checklist, incremental
  progress, progress notes, explicit verification tooling.
- Anthropic, *Effective context engineering for AI agents* — context rot, the
  "right altitude" system prompt, few canonical examples instead of rule
  laundry-lists, just-in-time context, structured note-taking.

## Why the current agent underperforms

The architecture (single agent, 21 curated `egl_*` tools, progressive skills,
real-pixel inspection, persistent job state) is correct. The weakness is that
almost everything is enforced by prompt compliance only:

1. **No harness enforcement of the loop.** `AGENT.md` says "inspect the pixels
   after a render", but nothing in the panel checks. Weak/flash models drift,
   skip `egl_inspect`, and declare victory — Anthropic's #1 observed failure
   mode.
2. **No evaluator loop.** Visual QA is one unstructured look. No rubric, no
   pass/fail verdicts, no "fix one named failure → re-inspect" cycle with a
   budget. Visual quality is the product, yet nothing scores it.
3. **Tool descriptions are terse.** No canonical examples, few edge cases, no
   "when NOT to use" boundaries; errors arrive as raw message strings, so the
   agent cannot distinguish "retry once" from "change method" from "ask the
   user".
4. **`egl_job_state` is free-form.** Any patch shape is accepted, nothing
   validates it, nothing panel-side reads it to verify completion claims.
   Memory without structure — the opposite of structured note-taking.
5. **No completion contract.** "Completion criteria" is prose; there is no
   structured checklist the panel can echo back so the user sees evidence
   versus claims.
6. **Evals test routing, not behavior.** They verify which skills *should*
   load — not whether the agent actually inspects after rendering, refuses to
   fake claims, recovers from tool errors, or finishes with a verified export.
   Behavior regressions ship silently.
7. **Context pressure.** `egl_inspect` returns real images into the turn; long
   jobs pile up images and tool output with no clearing. Free/flash tiers
   suffer most from context rot.
8. **Model-tier sensitivity.** Part of "dumb" is simply weak free-tier models.
   Stronger scaffolding helps exactly those tiers.

## Phased improvements

### Phase 1 — ACI hardening (tool surface) — highest ROI
- Rewrite every `egl_*` description: purpose, when to use / when not, one
  canonical example, edge cases, boundary versus neighboring tools.
- Structured error envelope: tools return `ok / errorKind (transient | content
  | user | budget) / next_action` instead of raw thrown text, so the retry
  policy becomes executable instead of memorized.
- Poka-yoke: server-side absolute-path resolution with echo-back, enum
  validation, and a clear rejection when a tool is called again with identical
  args ("result already known").
- Token efficiency: compact `egl_status` mode, downscale inspect payloads
  before attaching, consistent `warnings` field.

### Phase 2 — Harness-enforced production loop
- Turn state machine in the panel: render happened → no `egl_inspect` call →
  inject one short reminder ("You rendered X but never inspected it") before
  the answer finalizes. Nudge, not block.
- **Completion contract:** `egl_job_state` gains a panel-managed checklist
  (deliverable, checks, saved, exported). When the agent says "done", the
  panel appends the checklist status so users see evidence versus claims.
- Anti-victory rule: "done" with no save/export tool result this job → panel
  appends what is missing.

### Phase 3 — Structured visual QA (evaluator–optimizer loop)
- Fixed rubric in `qa-delivery`: text accuracy, hierarchy, edges/seams,
  identity consistency, alpha, margins — each pass/fail from actual pixels.
- Fix → re-inspect loop: one named failure per fix, one changed condition, max
  2 fix cycles by default; verdicts recorded in job state and cited in the
  report.

### Phase 4 — Continuity and memory
- Schema-tighten `egl_job_state`: validate patches, reject unknown keys,
  versioned checklist.
- "Get up to speed" routine: on a resumed multi-step job the agent must read
  job state first and restate remaining work (long-running-agent pattern
  applied to our threads).

### Phase 5 — Evals that test behavior
- Extend `benchmark-cases.yaml` with tool-sequence contracts (must call
  `egl_inspect` after `egl_generate`; must not finish without export when the
  brief demands one; must classify marked-photo versus mask correctly).
- Live smoke eval: 3–5 canonical jobs (text-to-image, edit, cutout, poster)
  against the real engine, asserting tool sequence plus artifacts — optional
  gate, skipped when the runtime is absent.

### Phase 6 — Model-tier guidance
- Agent-model panel hint for stronger vision-capable models; docs note that
  free/flash tiers rely on this scaffolding. No new model identification logic,
  no ComfyUI coupling.

### Phase 7 — Release
- Ship everything plus the already-committed provider fixes as 0.3.29 (pending
  approval; public v0.3.28 predates commit `7396c22`).

## Explicitly unchanged
- Single-agent architecture, 21 curated `egl_*` tools, Qwen-Image-2.1 only,
  progressive skill loading, fail-closed security. No multi-agent system: the
  bottleneck is enforcement, not orchestration.
