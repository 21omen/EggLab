# Asset planning reference

## L0–L7 stack
| Layer | Role | Typical content | Checks |
|---|---|---|---|
| L0 | Format/grid | Canvas, crop, grid, safe zones | Dimensions, ratio, margins |
| L1 | Background/field | Environment, gradient, paper, backdrop | No unwanted hero/props if planned separately |
| L2 | Hero subject | Product, person, main object | Identity, silhouette, scale, alpha |
| L3 | Supporting props | Secondary objects, platforms, packaging | Count, contact, perspective |
| L4 | Atmosphere | Haze, particles, light effects, depth | Not obscuring required content |
| L5 | Vector graphics | Shapes, lines, icons, diagrams | Editable, aligned, consistent |
| L6 | Typography | Headline, body, CTA, labels | Exact text, correct font, legibility |
| L7 | Finishing | Grade, texture, grain, edge polish | Profile-appropriate, non-destructive |

This is an organizational stack, not a requirement that every design contains all eight layers.

## Asset-mode decision
- Generate a complete scene when the subject/environment relationship is complex and the image model can reliably produce it.
- Generate separate assets when independent placement, reuse, editability, identity preservation or transparent compositing is important.
- Build text, charts, labels, logos and precise geometry as editable vector/type elements when possible.
- Use an existing source image as canvas when the task is a targeted edit; do not regenerate the whole image unnecessarily.
- For identity-sensitive subject work, prefer the strongest available source reference and limit unrelated changes.

## World line and identity anchor
For a multi-asset composition, write a 15–30 word world line describing the shared visual world: setting, time, material language, palette and lighting. Then write a short identity anchor for each fixed subject: the features that must not change. These are planning aids; avoid filler when the job is simple.

## Asset plan fields
For each asset record role, source, generation/edit method, placement, scale, overlap/contact, lighting, alpha need, required reference, editability, render cost and verification. Decide whether the asset is background, hero, prop, atmosphere, vector, type or finish.

## Assembly
Plan bottom-up: background, depth/atmosphere, distant elements, hero, props, contact/shadow, graphics, typography, finishing. Preserve separate layers and original source content. Do not flatten or merge the user's editable source as a shortcut.

## Render budgeting
Original v1 often used a hero render plus one additional asset render as a baseline. Treat that as a planning heuristic, not a target. A text-led, vector-led or simple task may need zero image generations. Allocate renders to the highest uncertainty or highest visual impact. Record actual timing and avoid rendering merely to consume a budget.
