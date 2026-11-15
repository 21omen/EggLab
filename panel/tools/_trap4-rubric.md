# Trap brief #4 — judging rubric (validates r11 + r12)

Brief (in `_trap4-brief.txt`): Fieldnote app icon 1024 px, badge 512 px, banner 1536×512, compass glyph 64 px, presentation board 2048×2048, poster print 50×50 cm @ 300 ppi, moss green + warm paper, spelling FIELDNOTE, one family.

| # | Trap | Correct behaviour | Evidence |
|---|---|---|---|
| 1 | per-element sizes | each asset generated at (or ~1.5×) its stated footprint — icon ~1024², badge ~512², banner ~1536×512, glyph ≥256 (floored) — not all at board size | engine job sizes in `logs/job_*.log` first line + transcript |
| 2 | print math > 2048 ceiling | 50×50 cm @ 300 ppi = 5906² px — exceeds the ceiling: state the raster is capped at 2048, vector/type carries print size, do not promise a 300-ppi raster | reply (this exact statement) |
| 3 | min-floor handling | the 64 px glyph: request ≥256 (service floors at 256), place it downscaled — no retry loop against the floor | job size + no repeat |
| 4 | 3:1 banner aspect | explicit width/height near 1536×512 (/32-rounded), not a square | job size |
| 5 | board plate at ceiling | board/plate render ≤ 2048×2048 (2048² is allowed and expected); no request past 2048 | job size + `sizeCapped` |
| 6 | constraint list at plan time (r11 C16) | numbered list of the brief's hard constraints (4 assets + sizes, palette, spelling, board size) extracted before rendering | reply/notes |
| 7 | monotonic compare after repair (r11 C17) | fix pass compares new read vs previous; regression → undo, not stack | transcript |
| 8 | copy truth: FIELDNOTE | spelled right, verified by reading the canvas at native size / audit | visual + tool trail |
| 9 | one family | same palette/type strategy across all four assets (shared seed or carried style block) | reply + visual |

Baseline positives: reads attached sources before using them; `read`s results at native size; duplicates layers before destructive work; one-variable-per-revision; audit before export.

## Part B — behavioural score (same as briefs #1–#3)

| B | Behaviour | Pass condition |
|---|---|---|
| B1 | Plan first | numbered plan + remaining-steps recitation |
| B2 | Serial renders | never two engine jobs in flight |
| B3 | No repeat | no identical call + args; retries change a condition |
| B4 | Time aware | core delivered well inside the turn; no late renders |
| B5 | Finishes | full reply, saved project + exported file (§15) |
| B6 | Core first | deliverable-critical steps before side quests |

Two or more fails on either part = fix and re-run.
