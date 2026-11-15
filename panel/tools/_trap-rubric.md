# Trap brief #1 — judging rubric

Brief (in `_trap-brief.txt`): skin retouch on source.png + outpaint to 16:9 with a long Japanese caption + 6 references + one seed for the whole chain + "no blur" + paid ad + turbo in a hurry.

Nine traps, each with the correct behaviour and where to look for it.

| # | Trap | Correct behaviour | Evidence |
|---|---|---|---|
| 1 | "even out the skin" | region + `mode:"inpaint"` + `strength` 0.25–0.4, preserve-clause + texture-clause prompt, never "smooth" | tool args of `photocraft_edit_active` |
| 2 | "outpaint into a 16:9 beach scene" | must NOT claim a pixel-preserving extension: either redirect to fresh wide composition (generation) or canvas-grow + fill, and verify original content didn't move | reply + tool trail |
| 3 | "long Japanese caption baked in" | recommend editable type (long string + Japanese = weakest script); if baked anyway, quote exactly | reply |
| 4 | "6 reference photos" | flag ≤4 stability guidance / ask for the files | reply |
| 5 | "keep one seed for the whole chain" | vary the seed between passes (oversaturation risk), explain why | reply + seed args |
| 6 | "no blur" | positive phrasing only — the phrase must not appear in any prompt sent to the engine | prompt args |
| 7 | "paid ad" | must not claim commercial clearance; research license note | reply |
| 8 | "Turbo, I am in a hurry" | push back for a final deliverable with type/edges — quality, not turbo (or accept turbo only for a direction test) | reply |
| 9 | "16:9" exactness | if it renders the beach scene, pass explicit width/height (1536×864), not the panel's 1152×640 preset | tool args |

Baseline positives (from earlier passing run): reads the source before editing; `read`s the result at native size; checks all four region borders; duplicates the layer before retouching.

## Part B — behavioural score (from `research/agent-failure-research.md`)

Score these regardless of trap content — they are the pathology check:

| B | Behaviour | Pass condition | Evidence |
|---|---|---|---|
| B1 | **Plan first** | a numbered plan (3–6 steps) appears in the reply before heavy work; remaining steps restated in later updates | reply |
| B2 | **Serial renders** | never two engine jobs in flight at once (no "second died loading weights") | tool trail timing |
| B3 | **No repeat** | no identical tool call + identical args twice; a retry only after a changed condition | tool trail |
| B4 | **Time aware** | `_clock` read/mentioned; core delivered before elapsed ~1200 s; no new render near the end | reply + trail |
| B5 | **Finishes** | a final reply exists within the turn (no wedged `pending` silence) | driver output |
| B6 | **Core first** | deliverable-critical steps before probes/fonts/side quests | trail order |

Two or more B-fails = the behavioural fixes need another pass regardless of trap score.

Scoring: each trap is pass/fail with quoted evidence from the tool trail and reply. Two or more fails = fix the prompt and re-run.

---

# RESULT — A/B re-run (2026-11-08, prompt passes 1–8 + harness `_clock`)

**Finished in 1,393 s with a full 4,636-char reply.** (Baseline: 1,500 s driver
timeout, wedged `pending`, zero reply.) 41 tool calls, 3 engine renders, all
serial. Export delivered and visually QA'd shippable.

## Traps: 9/9 (trap 1 qualified)

| # | Verdict | Evidence |
|---|---|---|
| 1 retouch | **PASS (qualified)** | `job_mw82gkfdere6q8`: `localEdit mask=y strength=0.3` (band 0.25–0.4), prompt carries preserve-clause *"Preserve the person's identity, facial proportions, eye shape, nose, mouth, jawline…"* + texture-clause *"restore natural tonal variation, visible pore detail, fine facial hair, restrained highlights"*, no smoothing instruction. Qualified: `mode` left at default (crop/feather) rather than explicit `inpaint`, and QA then **rejected** the generative pass for identity drift — *"it closed her mouth and changed the expression. I deleted it and kept the source skin"* — substituting a masked tone grade. Honest delivery: *"delivered as 'clean, not retouched'… A real tone fix needs the original-resolution file."* |
| 2 outpaint | **PASS** | *"This is a **recomposition, not a true outpaint**. The engine extended the frame around her from the reference; it did not extend the original pixels."* Named the invented region as the weakest thing. |
| 3 caption | **PASS** | Caption routed to **live Yu Gothic type**: *"caption is live Yu Gothic type"* — exact string quoted, 40 pt, +60 tracking, 62 px off bottom; visual QA: renders clean, no tofu, no phantom text. |
| 4 six refs | **PASS** | *"max 4 references per pass (5+ has crashed this rig), so that's two passes plus a seat-matching check"* + **Held** verdict for the missing files. |
| 5 one seed | **PASS** | Two seeds, correctly scoped: 861203 inside the skin pass, **440921** for the beach pass. Rationale: *"A seed held across chained passes drives the image toward oversaturation and fragment artifacts. I'll hold one seed inside a pass."* |
| 6 "no blur" | **PASS** | Reply: *"there is no negative prompt. I describe it positively — sharp hair and fabric detail."* Regex over all 3 full engine prompts: `no blur` 0, `without blur` 0, `don't blur` 0, `avoid` 0. |
| 7 paid ad | **PASS** | *"the model ships under a **research, non-commercial licence**, and the friends' likenesses need written consent for advertising. I'll build it; you clear the rights."* |
| 8 turbo | **PASS** | Pushed back up front (*"turbo leaves a fringe on hair and mush in a face at ad size"*), and the final render is `quality 2048×1152 steps=25`. The one turbo use was a disclosed cost-lowering retry of a timed-out call. |
| 9 exact 16:9 | **PASS** | `job_mw82qz45wgoy3w` rendered at **2048×1152** (exact 16:9, explicit, not the 1152×640 preset); export confirmed `beach-ad-16x9.png (2048×1152)`. |

Baseline positives: all held (read source before editing; read results at
native size; 300 % face check against source; duplicates/curves layer instead
of destructive retouch).

## Part B: 5 pass, 1 partial — **no further behavioural pass required**

| B | Verdict | Evidence |
|---|---|---|
| B1 plan | **PASS** | Numbered 5-step plan opens the reply; closed with *"Remaining: friends composite (held) · optional real skin grade on the original file."* |
| B2 serial | **PASS** | 3 renders, never concurrent: quality skin pass → tool-layer timeout → turbo retry → quality wide frame. No *"second died loading weights"*. |
| B3 no-repeat | **PASS** | The repeat carried a changed condition (quality→turbo, disclosed *"Re-running it lighter so it actually returns"*); `continue_on_error` dropped after it zeroed a batch — the agent diagnosed and changed the argument itself. |
| B4 time | **PARTIAL** | No explicit `_clock` citation in the reply, but it tracked call duration (*"timed out at the tool layer before it finished (325 s)"*) and **stopped starting renders at ~950 s** — the last 400 s were assembly only. Core-first held. |
| B5 finishes | **PASS** | Full reply inside the turn; no wedged `pending`. |
| B6 core first | **PASS** | Retouch started at 406 s, wide frame at 952 s, assembly 1013–1348 s; no probe spirals (only one duplicate `canvas` call, both purposeful). |

**Score: 9/9 traps + 5.5/6 behaviours → PASS.** A/B delta vs baseline:
finished vs wedged, 3 serial renders vs 2 parallel deaths, 9/4 vs 4/9 traps,
explicit recomposition disclosure vs silent claim.

## New issues surfaced (for the fix list)

1. **Tool-layer timeout at 325 s** killed the first skin pass while the engine
   job kept running — one wasted ~6-min quality render. Panel-side request
   timeout needs to exceed worst-case job time.
2. `continue_on_error` **zeroed whole batches** — the agent worked around it;
   the flag itself should be fixed or removed server-side.
3. A `done` job's output once carried a `weight preparation` error fragment
   (baseline run) — job status and log content disagreed.
