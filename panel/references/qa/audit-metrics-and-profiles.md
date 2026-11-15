# Audit metrics and profile selection

## Core QA checks
The original EggLab QA checklist contains the following eleven categories. Preserve them, but apply checks according to the artifact type.

1. **Canvas** — dimensions, aspect ratio, crop, color space/profile where specified, safe margins.
2. **Measure** — use actual measured dimensions, position, spacing and edge distances where available.
3. **Brief** — every hard requirement present; no forbidden element; right object/person/product counts.
4. **Text and copy truth** — exact words, punctuation, language, reading order; no phantom microtext or invented factual copy.
5. **Assets** — correct identity, source, alpha, silhouette, edges, seams, shadows, reflections and occlusion.
6. **Hierarchy** — clear focal point and reading order; squint/thumbnail/two-second tests.
7. **Palette** — coherent palette and contrast. Original 60/30/10 split and 2–3 dominant colors plus neutrals are useful editorial starting points, not mandatory mathematical targets.
8. **Edges** — intended bleed distinguished from accidental edge touches, clipping, halos and tangencies.
9. **Realism** — perspective, scale, material, lighting, anatomy, hands, repeated geometry and object count where relevant.
10. **Craft** — grid, spacing, baselines, alignment, typography, finish and non-destructive editing.
11. **Richness/workspace** — profile-appropriate support/detail; tidy working document; project saved and export verified.

## Suggested QA profiles
| Profile | Emphasis | Checks not automatically required |
|---|---|---|
| `print_editorial` | Grain/print character if concept supports it, rich hierarchy, support devices, bleed/crop | Fixed count of ornaments if concept is minimal |
| `screen_digital` | Sharpness, pixel alignment, responsive legibility, contrast | Print grain, simulated paper |
| `minimal` | Restraint, whitespace, precise hierarchy, material quality | Three support devices, forced overlap, decorative richness |
| `vector_mark` | Geometry, curves, negative space, scalable paths, color | Photo realism, grain, atmosphere |
| `photographic` | Identity, anatomy, perspective, lighting, texture, seams | Editorial marginalia unless requested |
| `identity_sensitive` | Source fidelity, consent, identity invariants, conservative edits | Unrequested face/body changes |
| `data_structured` | Numeric accuracy, source traceability, labeling, chart integrity | Decorative type treatments that compromise clarity |
| `text_led` | Exact copy, font availability, legibility, line breaks | Generated texture/background unless requested |

## Metrics policy
Read tool-provided metrics such as width/height, bounds, edge-touch flags, alpha verdict, layer count and file status. Record metric names and values exactly. If a metric is unavailable, mark `not_measured`; never fabricate a score.

## Verdict
- ACCEPT: every applicable critical check passes.
- REVISE: concrete defect is fixable.
- HOLD: missing source, consent, fact, capability or decision blocks completion.

A high aggregate score must not hide a critical failure such as wrong text, wrong identity, missing alpha or incorrect data.
