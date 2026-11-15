# Why the EggLab agent performs badly — deep research

URL-cited investigation into agent failure modes, grounded in our own trap-test
autopsy. Every claim carries a source; the final table maps each finding to the
fix it produced in `agent-prompt.md` (and, where the fault is harness-side, in
the panel).

---

## 1. The autopsy — our own evidence

Trap test #1 (`tools/_trap-brief.txt`, 9 judgment traps), run against the panel
agent. Observed tool trail and session transcript:

| t | event |
|---|---|
| 0 s | brief received (skin retouch + outpaint 16:9 + Japanese caption + 6 refs + one seed + "no blur" + paid ad + turbo) |
| 256 s | `egglab_status`, `egglab_settings`, `photocraft_commands`, `read` |
| 331 s | `egglab_check_alpha` on `before-after.png`, `type.fonts` |
| 501 s | `egglab_edit` — extract subject as transparent cut-out |
| 551 s | `egglab_generate` — 16:9 beach plate (turbo) |
| 751 s | `egglab_check_alpha` — second probe of the same plate |
| 922 s | `egglab_edit` — extract the subject **again** |
| 1500 s | driver timeout. **No final reply. Turn still `pending: true` — wedged.** |

Agent's own words from the transcript:

> "the two engine jobs ran in parallel and **the second died loading weights**.
> I'll retry the cut-out alone…"

> "Seed locked at **861203** for the whole chain…"

> "the read attachment looks stale… let me probe the plate's real dimensions and
> test whether reads recover on a fresh path"

**Diagnosis:**

1. **No cost arithmetic.** Two heavy renders were fired in parallel on an 8 GB
   card; one died. Each render costs minutes, not milliseconds, and the agent
   planned as if it had unlimited time.
2. **It lost the trap on purpose-tied behaviour** — one seed locked for the whole
   chain, with no pushback (rubric trap 5: fail).
3. **Verification spiral.** Stale `read` attachments made the agent distrust its
   own eyes, spending calls re-probing the same file (751 s) instead of working.
4. **No termination.** The turn wedged with an empty `pending` message and never
   delivered a partial answer — the user got silence after 25 minutes.
5. *(What it did get right: no false outpaint claim, caption routed to editable
   type, 6 references deferred, phantom-text awareness. The prompt teaches
   knowledge; the failures are **behavioural** — knowledge did not prevent them.)*

That last point is the thesis: **this is not a knowledge problem. The literature
says these failures are structural and predictable.**

---

## 2. Failure mode A — loops and repeated work

- **DeLoop** ([arXiv 2610.19376](https://arxiv.org/html/2610.19376)) defines the
  pathology precisely: *a looping action is a repeated tool call with identical
  arguments returning an observation the agent already has.* Loops appear
  natively in Qwen, Llama and Gemini agents and **become far more common once
  history is compressed** — loop rate rises from 29.0 % (full history) to 57.3 %
  (summarized), looping actions per task increase >3.5×. Looping runs fail
  **59.5 %** of the time vs 33.4 % for loop-free runs; Qwen3-8B fails 85 % of
  looping runs. Looping runs also execute **10.5 more actions** and burn **11 k
  more tokens**.
- **Infinite Agentic Loops** ([arXiv 2607.01641](https://arxiv.org/html/2607.01641))
  show the same at framework level: feedback paths without an effective bound
  (retry logic, tool re-entry, repair cycles) confirmed in **68 failures across
  47 real projects** — root cause always "the repeated path is not covered by a
  strong bound".
- **Overthinking loops via tool metadata** ([arXiv 2602.14798](https://arxiv.org/html/2602.14798)):
  cyclic call structures induced by tool descriptions/outputs inflate tokens and
  latency **up to 142.4×** without any single step looking abnormal.

**Relevance to us:** our agent's second extraction was QA-justified (hair
remnants), but the *pattern* — repeat the expensive call — is exactly the
behavior that, left unbounded, eats the turn. The literature's answer: a hard
rule bounding repeats, plus changed conditions before any retry.

## 3. Failure mode B — the step-count cliff

- **How Fast Do Agents Rot?** ([arXiv 2609.01660](https://arxiv.org/abs/2609.01660),
  9 models, 10,664 trajectories): task success follows a geometric law in
  per-step reliability. On the genuinely agentic task, **every model tested —
  including deployed proprietary systems — falls from near-perfect success to
  near zero within sixteen steps.** Degradation is driven by **step count, not
  context length**: bounding the context *steepens* decay (logit slope −0.69 vs
  −0.44), contradicting the lost-in-the-middle explanation.
- **Long-context WebAgents** ([arXiv 2512.04307](https://export.arxiv.org/pdf/2512.04307)):
  success drops 40–50 % → **<10 %** once noisy history is injected; error
  analysis: agents "get stuck in loops, repeating the same ineffective action
  until the step limit"; **breaking the instruction into sub-instructions
  helps**.
- **Context rot** ([arXiv 2606.29718](https://arxiv.org/pdf/2606.29718)): under
  long trajectories models **give up prematurely** ("inconclusive search
  failures") as failed explorations accumulate; merely prompting them to
  continue has *limited effectiveness* — the context itself must be managed.

**Relevance to us:** our 25-minute turn had already spent 9 tool calls before
the wedge. At the observed per-step cost, the job could never finish. **Fewer,
bigger steps is not an optimization, it is the difference between finishing and
not.** Batch commands, one decision per round trip, deliver core first.

## 4. Failure mode C — no time awareness

- **On the Clock** ([arXiv 2610.10833](https://arxiv.org/abs/2610.10833)):
  *stating a budget in the prompt is not enough* — agents fail to translate it
  into controlled use of time because they cannot anticipate action durations.
  The intervention that works is **harness-side timing feedback**: a per-tool
  clock showing remaining budget cut consumption from **161.4 % → 99.7 %** of
  the stated budget and raised valid submissions **78 % → 88 %** with no quality
  loss. Enforcement hooks (clamp/refuse over-long commands) tighten it further.
- **AgentTime** ([arXiv 2610.09944](https://arxiv.org/abs/2610.09944)) confirms
  agents lack temporal self-awareness: they cannot predict elapsed runtime or
  control it without explicit signals.
- **Latency budget arithmetic** ([frugal.sh](https://frugal.sh/blog/latency-budgets-agent-tool-calls/)):
  "Fourteen sequential tool calls at 700 ms each cannot fit in a 5-second
  budget, no matter how you tune providers — that's not a latency problem,
  it's an architecture problem." Sequential chains collect the tail: chain six
  calls and ~26 % of tasks eat a p95 event.
- **Hung sequential calls wedge turns** ([hermes-agent #84719](https://github.com/NousResearch/hermes-agent/issues/84719)):
  a single tool call with no deadline blocked a session for **21 hours** —
  silent, no recovery path. Matches our wedged `pending: true` turn exactly.
- **Long-running agents need queues/timeouts/status** ([apbld](https://apbld.com/blog/long-running-agents-queues-timeouts-status)):
  "a run allowed to take as long as it needs will eventually exceed the
  shortest limit between your user and your worker."

**Relevance to us:** two fixes. Prompt-side: teach render cost arithmetic
(turbo ≈ 2–4 min, quality edit ≈ 5–10 min, ~25-min turn ⇒ plan for at most two
heavy renders). Harness-side: inject elapsed/remaining time into tool results —
the single highest-evidence intervention in this whole survey.

## 5. Failure mode D — plan drift and side quests

- **Plan compliance** ([arXiv 2604.12147](https://arxiv.org/html/2604.12147v1),
  16,991 SWE-agent trajectories): without an explicit plan, agents fall back on
  internalized workflows that are "often incomplete, overfit, or inconsistently
  applied"; **periodic plan reminders mitigate plan violations and improve task
  success**; a *subpar* plan hurts more than no plan.
- **Manus context engineering** ([manus.im](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus)):
  average task = ~50 tool calls; Manus keeps a `todo.md` **rewritten at the end
  of context** — "reciting objectives into the recent attention span" to fight
  drift; the file system as restorable externalized memory (drop the page, keep
  the URL).
- **Anthropic — effective context engineering**
  ([anthropic.com](https://www.anthropic.com/research/effective-context-engineering-for-ai-agents)):
  context is a finite "attention budget" with diminishing returns; curate it.
- **Anthropic — building effective agents**
  ([anthropic.com](https://www.anthropic.com/research/building-effective-agents)):
  simplest system that works; **show planning steps explicitly**; gain ground
  truth each step; **stopping conditions (max iterations)**; checkpoints for
  human feedback.
- **ADVOCATE anticipatory reflection** ([ACL 2024](https://aclanthology.org/2024.findings-emnlp.53.pdf)):
  plan + introspect before/after each action: +3.5 pts success, **45 % fewer
  trials and plan revisions**.

**Relevance to us:** our agent opened with a one-paragraph direction (good),
then spent calls on font/alpha/dimension probes before any deliverable. Fix:
numbered plan up front, **restate remaining steps at the end of every update**
(the agent cannot write files — its own latest message is the todo), deliverable
first.

## 6. Failure mode E — knowing when to stop

- **CRAFT** ([arXiv 2512.20362](https://arxiv.org/html/2512.20362v2)): structured
  refinement for image generation — decompose the brief into dependency-structured
  visual questions, verify the image against them, apply a **targeted** prompt
  edit only where a constraint failed, compare against the incumbent, and **stop
  with an explicit criterion once all constraints pass**. Avoids redundant steps
  and regression (an incumbent can only be replaced by a better image).
- **DeLoop's** negative examples confirm the same from the other side: the
  repeated call that adds no information is *the* unit of waste.

**Relevance to us:** QA is a checklist with a stopping rule, not a mood. Run the
§13 gate once; fix only named failures (one variable each); when every check
passes — hand over. Re-rendering an image that already passes re-encodes and
degrades it.

## 7. Failure mode F — instruction overload and self-verification

- **Prompt Design at Scale** ([arXiv 2607.19257](https://arxiv.org/html/2607.19257v1),
  960 calls/model): perfect-response rate **collapses to zero by N=80
  instructions** — every model, every format, system or user placement; at N=40
  the best model already sits at 0.24. Real-world prompts average only **5.1
  guardrails**. Format does not save you; count does the killing.
- **System Prompt Robustness** ([arXiv 2502.12197](https://arxiv.org/html/2502.12197v1)):
  performance "uniformly approaches zero as the number of guardrails increases"
  even without conflicts or adversarial input — and agentic settings with many
  tool calls make it worse.
- **Error taxonomy** — [OpenAI errors & recovery](https://developers.openai.com/api/docs/guides/agents-api/errors)
  and [LangChain fault tolerance](https://docs.langchain.com/oss/python/deepagents/fault-tolerance):
  not all errors are equal — **transient** failures (timeout, busy, connection)
  are retried as-is with a limit; **content** failures are fed back with a changed
  approach; human-required failures pause. Stop retrying when the error changes
  or the limit is reached; check whether the failed action already did part of
  its work before repeating it.
- **Verification mirage** ([arXiv 2605.10850](https://arxiv.org/html/2605.10850v1)):
  a model re-checking its own answer in a fresh context is **capacity-coupled**
  with the generator — it agrees with itself, under-attends to the image ("lazy
  verifier"), and multi-turn actor-verifier loops **lock in** initially wrong
  answers. Cross-verification helps but does not eliminate the mirage.
- **Self-correction mirage in grounding** ([arXiv 2606.13156](https://arxiv.org/html/2606.13156)):
  self-verified confidence correlates with correctness at only r≈0.22; every
  confidence-gated iteration policy **lost to not iterating**; "the model can
  refine, but it cannot tell which of its own attempts is right."

**Relevance to us:**

1. Our own prompt crossed the danger zone: 108 bullet rules by the end of pass 8.
   The remedy is **distillation, not more teaching** — consolidate and cut,
   keeping behaviours measurable in tests.
2. The QA gate must lean on **numbers, not vibes**: audit figures, alpha stats,
   side-by-side against the reference, zoomed dispute areas — never "it looks
   right to me".
3. Retry rules need the transient/content split (applied to §1 in pass 8).

## 8. What the literature says works (summary)

| Intervention | Evidence | Where we apply it |
|---|---|---|
| Bound every repeat: same call twice only after changing the condition | DeLoop, IAL-Scan | §1 no-repeat rule |
| Plan up front; **restate remaining steps every update** | plan-compliance 16,991 traj.; Manus todo recitation | §1 plan discipline |
| Cost arithmetic: know each action's duration; budget the turn | On the Clock, frugal.sh | §4 render costs, serial execution |
| **Harness clock in every tool result** | On the Clock: 161.4 %→99.7 %, 78 %→88 % submissions | `mcp-server.mjs` elapsed/remaining marker |
| Fewer, bigger steps; batch calls; deliver core first | Rot law (zero by 16 steps), WebAgent loops | §1 batching + core-first |
| Stopping rule for refinement: fix named failures only, then stop | CRAFT | §13 QA verdict + stop |
| One retry per failure, changed condition, then change approach | IAL-Scan bounds, DeLoop | §1 retry rule |
| Stale tool feedback: probe once, then trust fresh reads | our autopsy + context-rot distrust spiral | §12 read quirk |
| Simplest system; show the plan; explicit stopping conditions | Anthropic ×2 | §1, §13 |
| Transient vs content error taxonomy; bounded retries | OpenAI, LangChain | §1 retry rule |
| Prefer measurements over self-approval | verification mirage, r≈0.22 | §13 evidence rule |
| **Distill the prompt — count is the enemy** | prompt-design-at-scale (0 by N=80) | **applied 2026-11-09: 72.1→65.1 KB, 1,254→1,146 lines, −~40 duplicate rule occurrences; gates green; backup kept** |
| **Visual checklist before rendering; check each item on the canvas read** | M3 checklist planner; CRAFT dependency-structured visual questions | **applied 2026-11-12 (r11): constraint list extracted at plan time (§1.3), QA step 2 judges it; +410 B, gates green; test #4 validates** |
| **After each edit, compare new canvas vs previous — monotonic improvement** | M3 verifier; IMAGAgent closed-loop reflection | **applied 2026-11-12 (r11): repair paragraph now requires before/after compare, regression → undo; test #4 validates** |
| **Escape hatch: 2 attempts per constraint, then skip the item and say so** | M3 dead-end escape (K=2) | already taught: §13 repair (one targeted change → re-check → name the failure) + §1 retry (no third attempt) |
| **Deterministic gates first, vision critique second** | design-vision-loop two-tier (Anthropic-endorsed) | already taught: §13 checklist runs Measure (audit numbers) before Brief (vision); measurements-first rule |
| **Sub-tasks must be visually perceptible — you can SEE whether each succeeded** | IMAGAgent planning constraints | already taught implicitly: §1 silent asset plan with named modes/sizes; constraint list (r11) makes it checkable |
| **Size each generation to the element's footprint, not the canvas; know the enforced envelope** | model trained buckets ~1.0–1.76 MP (QwenLM #7); 2.x curriculum to 2048p; sd.cpp /32 | **applied 2026-11-12 (r12): engine caps 256–2048 + sizeCapped report, edit auto-aspect ≤1024, schema descriptions state the envelope, prompt §3.4/§13-size folded sentences; test #4 validates** |

---

## 9. Testing the loop itself — prompt-regression methodology

The trap tests are a regression suite, and the literature on prompt-regression
testing says how to keep them honest:

- **Treat the prompt as a deployable artifact**: version it, pin a frozen set of
  cases to it, and run the set on every edit. Pass criteria assert on **facts,
  tool calls and refusals rather than exact wording** — a rephrase stays green, a
  behaviour change goes red ([Runtype](https://www.runtype.com/guides/prompt-change-regression-testing)).
  Our rubrics already score engine args, regex counts and tool trails, not prose.
- **Hard criteria pass at 100 %** — tool calls, schemas, forbidden patterns. Our
  forbidden-phrase scans (`no blur`, `not AI-generated` in engine prompts) are
  exactly this class.
- **Promote incidents to permanent cases**: "every bug someone reported becomes a
  permanent case the day it is fixed". Our trap briefs are promoted incidents —
  the wedged 25-minute turn became brief #1's nine traps.
- **Judge on the median of repeated runs, not one run**: two runs disagreeing
  with no prompt change means the case is unstable, not that the prompt
  regressed ([Runtype](https://www.runtype.com/guides/prompt-change-regression-testing)).
  Our A/B claims so far rest on one run per brief — **borderline verdicts must be
  re-run before being called a regression**. Stable evidence (log/regex counts)
  does not need this; reply-tone judgements do.
- **LLM-as-judge for rubric scoring carries real noise** even at the frontier,
  and is weakest precisely on tool-use rubrics ([RuVerBench,
  arXiv 2606.29920](https://arxiv.org/html/2606.29920v2)); task-specific rubrics
  beat static ones ([AdaRubric, arXiv 2603.21362](https://arxiv.org/html/2603.21362v3)).
  The mitigation we already use — prefer hard measurements over impressions —
  is the same rule the agent itself is taught in §13.
- **Print production traps have objective answers** (bleed = extra area on every
  side, 300 ppi at finished size, raster ceiling vs vector type), so brief-#3
  trap 1 scores on arithmetic, not taste
  ([service printers' guidelines](https://www.serviceprinters.com/help/DesignForPrint.pdf)).

---

## 10. Visual self-verification loops (round 11)

The QA gate (§13 of the manual) tells the agent to look at the canvas and check
numbers. The 2025–26 literature on agentic T2I refinement says how to structure
that look so it actually catches defects instead of producing approval vibes:

- **Checklist before pixels.** Decompose the brief into a numbered list of
  *visually checkable* constraints (colour, quantity, spatial relations, text
  rendering) while planning, then evaluate the canvas against that list —
  not against a general "does it look good"
  ([M3, arXiv 2602.06166](https://arxiv.org/html/2602.06166);
  [CRAFT, arXiv 2512.20362](https://arxiv.org/html/2512.20362v2) adds a
  dependency order and an explicit stop when all constraints pass).
- **Detection and repair in one step.** When a constraint fails, the checker
  writes the *concrete edit instruction* that would fix it — the defect becomes
  the next action, not a comment
  ([M3](https://arxiv.org/html/2602.06166)).
- **Monotonic improvement.** After every edit, compare the new canvas against
  the previous one: an edit that fixes one constraint while breaking another is
  a regression, keep the previous state and re-approach
  ([M3 verifier](https://arxiv.org/html/2602.06166); error accumulation and
  semantic drift over multi-turn editing is exactly what closed-loop reflection
  prevents — [IMAGAgent, arXiv 2603.29602](https://arxiv.org/html/2603.29602)).
- **Escape hatch, not infinite loop.** At most ~2 attempts per constraint; if it
  still fails, skip the item and report the remaining defects honestly rather
  than looping ([M3](https://arxiv.org/html/2602.06166) K=2 escape; same
  budget-and-report pattern in the
  [design-vision-loop skill](https://github.com/nguyenthienthanh/aura-frog/blob/main/aura-frog/skills/design-vision-loop/SKILL.md)).
- **Two-tier verification.** Deterministic gates first (audit numbers, alpha
  stats, console/logs) because they are cheap and strong; vision critique only
  what already passes the deterministic gate. Anthropic's agent guidance:
  screenshot after each step, evaluate, and *only when you confirm a step was
  executed correctly should you move on*
  ([design-vision-loop](https://github.com/nguyenthienthanh/aura-frog/blob/main/aura-frog/skills/design-vision-loop/SKILL.md)).
- **Verdict, not vibes.** Output `{status, defects[{element, expected, actual}]}` —
  the same shape as our §13 repair loop, and the same evidence discipline the
  verification-mirage data demands (r≈0.22 self-approval accuracy).
- **Plan units must be perceptible.** Sub-tasks should each touch one thing and
  be visually verifiable — "you can see whether it succeeded"
  ([IMAGAgent](https://arxiv.org/html/2603.29602): target singularity, semantic
  atomicity, visual perceptibility).

---

## 11. Generation size envelope (round 12)

User observation: the agent renders *every* asset at canvas size, so a 300 px
prop costs a 2048-px render. Research into what the engine and the model
actually allow, and what sizes are worth asking for:

**Engine ground truth (our code, before this round):** `round32()` floors at
256, multiples of 32, and **nothing capped the top** — `egglab.ps1`, the panel
service and the renderer all passed sizes through. `egglab.ps1` has edit
auto-size (source aspect, ≤1024 long side), but the panel always passes
`-Width/-Height`, so it never fired for panel jobs.

**What the engine requires:**
- Qwen-Image-2.1 in stable-diffusion.cpp: "Use image dimensions divisible by
  32" — and the code enforces /32 on **reference images** too
  ([sd.cpp docs](https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/qwen_image_2.1.md),
  [PR #1994](https://github.com/leejet/stable-diffusion.cpp/pull/1994)).
- DiT models: VAE needs /8; odd latent sizes render broken (positional
  encoding), so /16 is imposed in code; older SD-UNet models need /64
  ([PR #742](https://github.com/leejet/stable-diffusion.cpp/pull/742),
  [issue #44](https://github.com/leejet/stable-diffusion.cpp/issues/44)).
  Our /32 rule is the safe superset.

**What the model was trained for:**
- Qwen-Image curriculum: 256p → 640p → final stage jointly 640p + 1328p
  ([technical report, §4.1](https://arxiv.org/html/2508.02324)).
- Final-stage buckets, maintainer-confirmed: 1:1 1328², 16:9 1664×928,
  9:16 928×1664, 4:3 1472×1104, 3:4 1104×1472, 3:2 1584×1056, 2:3 1056×1584 —
  i.e. ~1.0–1.76 MP ([QwenLM issue #7](https://github.com/QwenLM/Qwen-Image/issues/7),
  [HF model card](https://huggingface.co/Qwen/Qwen-Image)).
- The 2.x lineage extends the curriculum to 512/1024/**2048**
  ([Qwen-Image-2.0 report, Table 2](https://arxiv.org/abs/2605.10730)) —
  2048 is inside the training range, hence our ceiling.
- A third-party admission profile for the same family: min 64², max ~1.8 MP,
  /16 alignment, defaults 1328²
  ([mold matrix](https://github.com/utensils/mold/blob/main/docs/model-resolution-matrix.md)).

**Policy decided (2026-11-12):** floor 256, multiples of 32, ceiling 2048;
sweet spot 1.0–1.8 MP; floor 512 for text-bearing assets (small type needs
pixels); edits without explicit size follow the source aspect capped at 1024
long side; oversized needs are met by PhotoCraft `imageSize` upscaling, not by
over-rendering. Cost rule from our own queue model: render time scales with
area — 512² ≈ ¼ of 1024².

**Applied to the harness (same day):**
- `engine.mjs`: hard clamp 256–2048 with `sizeCapped` recorded on the job (and
  in the first line of `job_*.log`); edits without explicit size now probe the
  first reference (PNG/JPEG header parse, `imageDims()`) and match its aspect
  ≤1024 long side — the "edits follow the source aspect" claim was previously
  false at service level (refs were resized to the settings size).
- `mcp-server.mjs`: `sizeCapped` in `summary()`; generate/edit width/height
  schema descriptions now state the envelope (256–2048, /32, size-to-element).
- `renderer/app.js`: settings drawer `snap()` clamps to 2048.
- Prompt amendments prepared as `_r12-pairs.txt` (two folded sentences, zero
  new bullets) — applied after test #3 completes so the r11 file stays frozen.

## 12. Source index

**Papers**
1. DeLoop: Repeated Actions as Self-Supervision for Long-Horizon Agents — https://arxiv.org/html/2610.19376
2. When Agents Do Not Stop: Infinite Agentic Loops — https://arxiv.org/html/2607.01641
3. Overthinking Loops in Agents via MCP Tools — https://arxiv.org/html/2602.14798
4. How Fast Do Agents Rot? (step-count decay law) — https://arxiv.org/abs/2609.01660
5. Diagnosing and Mitigating Context Rot in Long-horizon Search — https://arxiv.org/pdf/2606.29718
6. Evaluating Long-Context Reasoning in LLM-Based WebAgents — https://export.arxiv.org/pdf/2512.04307
7. On the Clock: Punctual Time-Budgeted AI Agents — https://arxiv.org/abs/2610.10833
8. AgentTime: Can Agents Estimate Their Own Runtime? — https://arxiv.org/abs/2610.09944
9. From Plan to Action: How Well Do Agents Follow the Plan? — https://arxiv.org/html/2604.12147v1
10. ADaPT: As-Needed Decomposition and Planning — https://aclanthology.org/2024.findings-naacl.264/
11. ADVOCATE: Anticipatory Reflection for LLM Agents — https://aclanthology.org/2024.findings-emnlp.53.pdf
12. CRAFT: Continuous Reasoning and Agentic Feedback Tuning for T2I — https://arxiv.org/html/2512.20362v2
19. Prompt Design at Scale: instruction count → adherence collapse — https://arxiv.org/html/2607.19257v1
20. A Closer Look at System Prompt Robustness — https://arxiv.org/html/2502.12197v1
21. OpenAI — Agents API: errors and recovery — https://developers.openai.com/api/docs/guides/agents-api/errors
22. LangChain — Fault tolerance (error taxonomy) — https://docs.langchain.com/oss/python/deepagents/fault-tolerance
23. Verification Mirage: self-verification in VQA — https://arxiv.org/html/2605.10850v1
24. The Self-Correction Mirage in VLM Grounding — https://arxiv.org/html/2606.13156
25. Runtype — LLM regression testing for prompt changes — https://www.runtype.com/guides/prompt-change-regression-testing
26. RuVerBench: Can LLM-as-a-Judge Reliably Verify Rubrics? — https://arxiv.org/html/2606.29920v2
27. AdaRubric: Task-Adaptive Rubrics for Agent Evaluation — https://arxiv.org/html/2603.21362v3
28. Designing for Print (bleed/300 ppi guidelines) — https://www.serviceprinters.com/help/DesignForPrint.pdf
29. M3: Multi-Modal, Multi-Agent, Multi-Round visual reasoning — https://arxiv.org/html/2602.06166
30. Maestro: Self-improving T2I via agent orchestration — https://arxiv.org/pdf/2509.10704v1
31. CRAFT: Continuous reasoning and agentic feedback tuning — https://arxiv.org/html/2512.20362v2
32. design-vision-loop skill (two-tier render→critique→iterate) — https://github.com/nguyenthienthanh/aura-frog/blob/main/aura-frog/skills/design-vision-loop/SKILL.md
33. IMAGAgent: Constraint-aware planning and reflection for multi-turn image editing — https://arxiv.org/html/2603.29602
34. stable-diffusion.cpp — Qwen Image 2.1 usage (dimensions divisible by 32) — https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/qwen_image_2.1.md
35. stable-diffusion.cpp PR #742 — DiT image-dimension requirements (/8 VAE, /16 imposed, odd latents render broken) — https://github.com/leejet/stable-diffusion.cpp/pull/742
36. stable-diffusion.cpp issue #44 — why SD-UNet needs /64 (latent /8 × U-Net /8) — https://github.com/leejet/stable-diffusion.cpp/issues/44
37. stable-diffusion.cpp PR #1994 — Qwen Image 2.1 support (reference images must be /32) — https://github.com/leejet/stable-diffusion.cpp/pull/1994
38. QwenLM/Qwen-Image issue #7 — official training buckets, maintainer-confirmed (1328², 1664×928, 1472×1104, 1584×1056 + mirrors) — https://github.com/QwenLM/Qwen-Image/issues/7
39. Qwen/Qwen-Image model card — same bucket list — https://huggingface.co/Qwen/Qwen-Image
40. Qwen-Image Technical Report — resolution curriculum 256p → 640p → 640p+1328p — https://arxiv.org/html/2508.02324
41. Qwen-Image-2.0 Technical Report — curriculum extended to 512/1024/2048 (Table 2) — https://arxiv.org/abs/2605.10730
42. mold model-resolution-matrix — third-party admission profile for qwen-image (min 64², max ~1.8 MP, /16) — https://github.com/utensils/mold/blob/main/docs/model-resolution-matrix.md

**Engineering write-ups**
13. Anthropic — Building effective agents — https://www.anthropic.com/research/building-effective-agents
14. Anthropic — Effective context engineering for AI agents — https://www.anthropic.com/research/effective-context-engineering-for-ai-agents
15. Manus — Context Engineering for AI Agents — https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus
16. frugal.sh — Latency budgets for agent tool calls — https://frugal.sh/blog/latency-budgets-agent-tool-calls/
17. apbld — Long-running AI agents: queues, timeouts, status — https://apbld.com/blog/long-running-agents-queues-timeouts-status
18. hermes-agent #84719 — sequential tool call wedges turn — https://github.com/NousResearch/hermes-agent/issues/84719

**Our own data**
19. Trap test #1 tool trail (`sh_1aca35e0f001p208Z0C7ACq23o`) and session
    transcript `chats/untitled_before_after_2048x1280.json`, 2026-11-05/06.
