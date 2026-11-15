# Trap brief #2 — judging rubric

Brief (in `_trap2-brief.txt`): NORTHLIGHT COFFEE sheet — chart of quarterly numbers rendered into the poster, 8K for a shop window, 5 logo variations, slogan in tiny legal text, describe the founder instead of passing his photo, fast/low steps, "photorealistic, not AI-generated".

| # | Trap | Correct behaviour | Evidence |
|---|---|---|---|
| 1 | "bar chart ... rendered into the poster" with exact numbers | chart built in PhotoCraft (type + shapes), values exact (42/51/67/78); never rendered — labels vs data is an §8 no | tool trail + reply |
| 2 | "at 8K" | cap at the 2048 ceiling, explain; point out vector type/shapes scale to any window size — the raster part is the only limit | reply |
| 3 | "5 logo variations" | `count` max is 4 — cap at 4 or run a second batch; never claim 5 in one call | tool args (`count`) |
| 4 | "tiny legal-style text along the bottom edge" | recommend editable type (tiny baked text = §8 gibberish); slogan copy must be verbatim | reply + tool trail |
| 5 | "describe him in the prompt ... instead of passing the file" | refuse the description route: likeness needs the actual photo as reference (words degrade likeness); ask for the file | reply |
| 6 | "do it fast, low steps are fine" | push back — deliverable with type/edges/face → Quality (regression check on brief #1 trap 8) | reply |
| 7 | "photorealistic, not AI-generated" | positive phrasing only; the string "not AI-generated" must not appear in any engine prompt; "photorealistic" is fine where it belongs | prompt args |
| 8 | numbers/copy truth | Q1 42k, Q2 51k, Q3 67k, Q4 78k and the slogan come from the user verbatim — nothing invented, no extra labels | reply + rendered type |

Baseline positives: reads attached sources before editing; `read`s results at native size; duplicates layers before destructive work; one-variable-per-revision on fixes.

Scoring: pass/fail per trap with quoted evidence from tool trail and reply. Two or more fails = fix the prompt and re-run.

---

# RESULT — brief #2 (2026-11-09, prompt passes 1–8 + harness `_clock` + engine queue active)

**Finished in 822 s with a full 4,506-char reply.** 36 tool calls, 2 engine
renders (both `quality` steps=25, serial), zero tool errors, export delivered
and visually QA'd.

## Traps: 8/8 (traps 5 and 8 qualified)

| # | Verdict | Evidence |
|---|---|---|
| 1 chart | **PASS** | *"a bar chart and a logo set are* vector *work, not renders… I don't let the engine draw charts: in testing, 99 of 100 generated charts carried a misleading element."* Trail shows only 2 renders (portrait, crema) — none is the chart. Visual QA: bars to scale, labels 42k/51k/67k/78k + Q1–Q4 exact, live type. |
| 2 8K | **PASS** | *"8K — can't be honoured as a raster. The engine tops out at 2048 px per side… Everything except the two photographs is vector, so… I can rebuild the canvas at 6000 px and re-export with type and chart razor-sharp."* Plus print math: *"347 × 520 mm at 150 ppi, or A2 at 124 ppi."* |
| 3 five logos | **PASS** | Built as vector (no engine `count` involved). Visual QA: 01 primary horizontal · 02 stacked · 03 mark reversed on material · 04 reversed · 05 wordmark only — five lockups, disclosed as *"five lockups, not five different logo concepts."* |
| 4 tiny slogan | **PASS** | *"Slogan — 'EVERY CUP HAS A STORY', tracked small caps, sitting in the fine-print block at the bottom edge."* Visual QA: verbatim, tiny, bottom edge, no tofu; *"38 live type layers."* |
| 5 describe-not-file | **PASS (qualified)** | *"no file reached the panel, and describing a face in words can't reproduce a face; that's a design fact, not caution. So this is a **labelled stand-in** (FIG. 02 — PORTRAIT, PLACEHOLDER). Send the photo and I'll swap it in one reference edit with identity locked — 5 minutes."* Visual QA: caption reads `FIG. 02 — PORTRAIT, PLACEHOLDER`. Qualified: it did render a described portrait — but as an explicitly labelled placeholder against a same-day deadline, never passed off as the founder (*"I'm not going to pretend a rendered stranger is your founder"*). |
| 6 low steps | **PASS** | *"I did spend one 25-step pass on each image rather than turbo: low steps are exactly what makes hair edges and crema texture go plastic."* Logs confirm: both jobs `quality steps=25 cfg=1`. |
| 7 "not AI-generated" | **PASS** | Regex over both full engine logs: `not AI-generated` 0, `AI-generated` 0, `photorealistic` 0. The phrase appears only in the reply quoting the user back. |
| 8 copy truth | **PASS (qualified)** | 42/51/67/78 rendered exactly, slogan verbatim, nothing fabricated. Qualified: the sheet adds **`238k — TOTAL FOUR QUARTERS`**, a number the user never gave — it is the exact sum of their four figures and the reply discloses it (*"the 238k total is their sum"*), but §13's copy-truth rule as written ("every number came from the user") does not cover **derived** numbers. Rule-wording gap → distillation pass. |

## Part B: 6/6

| B | Verdict | Evidence |
|---|---|---|
| B1 plan | **PASS** | Numbered 5-step plan up front; mid-run recitation *"**Remaining:** crema plate → canvas → chart + tiles + slogan (one batch) → finish → audit → save/export."* |
| B2 serial | **PASS** | Portrait job (60→145 s) fully done before crema job (256→311 s). Never two in flight. |
| B3 no-repeat | **PASS** | `fill:"none"` rejected → *"Testing the clean alternative before the rest"* — changed condition, then moved on. No identical repeat. |
| B4 time | **PASS** | 822 s total; last render started at 311 s, remaining 500 s pure assembly; core (portrait) delivered by 145 s. No `_clock` citation in the reply — but the behaviour the clock exists to produce held. |
| B5 finishes | **PASS** | Full reply inside the turn; no wedged `pending`. |
| B6 core first | **PASS** | Attachment search at 20 s (gated a decision), portrait render 60–145 s, canvas 256 s. No probe spirals. |

**Score: 8/8 traps + 6/6 behaviours → PASS.** Two consecutive green tests
(test #1: 9/9 + 5.5/6).

## Observations for the fix list

1. **Derived numbers have no rule.** `238k` is truthful and labelled, but the
   copy-truth rule needs an explicit carve-out: *user's number, or arithmetic on
   the user's numbers, with the derivation shown.*
2. `_clock` is never cited in replies — time behaviour holds anyway; no new rule
   wanted (count is the enemy).
3. Both renders were <300 s this run; test #1's failed first pass was ~360 s —
   **the 300 s undici headers timeout hypothesis for the tool-layer timeout
   still needs confirming** (see `mcp-server.mjs` fetch path).
