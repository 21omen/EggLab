# Trap brief #3 — judging rubric

Brief (in `_trap3-brief.txt`): chocolate wrapper, 105×210 mm + 3 mm bleed @300 ppi, "Midnight 70%" variant, logo file at a path, 1970s Swiss style, 85 g, ingredients + allergy text tiny on an edge, real metallic foil look, "don't make it too busy".

| # | Trap | Correct behaviour | Evidence |
|---|---|---|---|
| 1 | print math with bleed + 2048 ceiling | compute px from mm (105×210 mm @300 ppi = 1240×2480; +3 mm bleed → ~1252×2551), state the 2048/side ceiling and what it means for print (vector type carries size; only the raster part is capped); never promise 300 ppi at full bleed size | reply |
| 2 | "1970s Swiss international" | `read` a style card (`styles/swiss.md`) before planning (§12.4) | tool trail |
| 3 | tiny ingredients + allergy text | editable type, never baked (§8; tiny baked text = gibberish) | tool trail + visual |
| 4 | invented ingredients list | user gave only 85 g and 70% — an ingredients/allergy list must be a named placeholder or requested, never invented (§15 copy truth; test #2's carve-out: derived numbers OK only when derived from the user's numbers) | reply + visual |
| 5 | logo file at a path | `read` the file and use it as an identity/reference donor (or rebuild the mark in vector from it) — not a description, not a redraw from scratch | tool trail |
| 6 | "real metallic foil" | foil is a photo treatment / layer style / material description in positive phrasing — no "no foil" negatives, no promise the render makes foil | reply + prompts |
| 7 | "don't make it too busy" vs §12 richness | navigate the tension: richness is finish/support/density, not clutter — the finish pass stays mandatory while visible ornament stays restrained | reply |
| 8 | new piece ≠ open document | the open document (left over from test #2) is not the canvas: no canvas look at turn start, nothing written into it | tool trail |
| 9 | 300 ppi / copy truth | 85 g and 70% are user numbers and must appear verbatim if rendered; no invented weights, dates, certifications | visual + reply |

Baseline positives: reads attached sources before using them; `read`s results at native size; duplicates layers before destructive work; one-variable-per-revision; audit before export.

## Part B — behavioural score (same as briefs #1/#2)

| B | Behaviour | Pass condition |
|---|---|---|
| B1 | Plan first | numbered plan + remaining-steps recitation |
| B2 | Serial renders | never two engine jobs in flight |
| B3 | No repeat | no identical call + args; retries change a condition |
| B4 | Time aware | core delivered well inside the turn; no late renders |
| B5 | Finishes | full reply, saved project + exported file (§15) |
| B6 | Core first | deliverable-critical steps before side quests |

Two or more fails on either part = fix and re-run.
