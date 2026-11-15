# EggLab measurement baselines

Numbers this codebase has actually produced, so a future change can be judged
against a known state instead of an impression. Measured with the tools in this
folder; re-run the same command to compare.

## Region edit — the seam fix

Brief: retouch `out/retouch-test/source.png`, region `[300, 350, 420, 500]`,
quality workflow. Command: `node tools/seam-fix-test.mjs both`.

| | before | after (crop, feather 48) | after (inpaint) |
|---|---|---|---|
| worst border jump | **2.19** absolute, outside level **0.00** | 0.48x own noise | 1.80x own noise |
| pixels untouched | 67.3% | **85.0%** | 4.7% |
| region core delta | — | 20.98 | 9.80 |
| far outside mask+halo | — | **0.00** | 2.81 (VAE round-trip) |
| render size | 416x512 stretched to fit | native | `output=1024x1280` |

Before = crop -> edit -> `placeAtBounds` with no alpha ramp: a hard 520x839
rectangle. That step at the boundary is the "I can see the seam" complaint.

## Retouch verdict

`node tools/retouch-verdict.mjs <source> <result>` — three gates: texture >= 85%
retained, redness improved ~3% in level or spread, seam < 2.5x own noise.

| run | texture | redness | seam | verdict |
|---|---|---|---|---|
| first agent run (hard rect) | 96% | 54.57 -> 55.77 not reduced | **4.19x** | **FAIL** |
| crop + feather (seed A) | 93% | 54.57 -> 50.81, sd -17% | 0.60x | PASS |
| inpaint (seed B) | 102% | 58.15 not reduced | 1.17x | FAIL on tone |
| agent run after the fix | 87% | 54.57 -> **51.95** | 1.61x **NONE** | **PASS** |

Note: inpaint is seam-proof but its *tone* result is seed-dependent; the crop
path did both jobs in one of the two runs. Texture ~85-88% is the floor a
resampled patch sits at (420x500 -> 416x512 -> back), not a sign of smoothing.

## Richness (poster work)

`node tools/richness-check.mjs <png>` — grain / detail load / zone ratio.

| | before | after |
|---|---|---|
| grain | 1.43 | 11.94 |
| detail load | 1.75% | 31.61% |
| zone ratio | 32.3 | 1.4 |
| shapes / layers | 4 / 13 | 7 / 18 |

## Engine

- Quality: 25 steps @ CFG 1. Turbo: 8 steps @ CFG 1.
- RTX 4060 Ti 8 GB; 14.4 GB of params live in RAM, so every job does ~74
  offload loads. A **cold first job** reads the model pages from disk and costs
  ~348 s; warm jobs are ~120 s (quality, 416x512).
- `undici`'s default 300 s headers timeout kills `fetch` on a cold render while
  the server finishes for nobody — test drivers use raw `node:http`.
