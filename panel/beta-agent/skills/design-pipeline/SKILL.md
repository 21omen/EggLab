---
name: design-pipeline
description: Orchestrated generate-first design production: brief, direction, asset plan, Qwen asset generation, editable PhotoCraft composition, refinement, verification and delivery.
---
# Design pipeline — from brief to editable deliverable

Use for every **Designing** job: a poster, ad, banner, packaging, key art,
social set, infographic, cover or any new composition. This skill orchestrates;
`design-direction`, `asset-planning`, `image-generation`, `photocraft-production`
and `qa-delivery` hold the details.

## 1. Brief (one screen)

Extract and record:

- Purpose, audience, placement.
- Deliverable: editable project / flat export / layered exports / variants.
- Exact dimensions, ratio, platform, bleed/safe margins.
- Exact copy: headline, body, CTA, legal lines, names, numbers.
- Brand rules: colours, fonts, logo files, exclusions.
- Tone/references, degree of creative freedom.

Infer safely; ask one question only when an essential ambiguity blocks work.
Never invent prices, claims, legal text or brand names.

## 2. Direction (one concept)

- One clear idea, one focal point.
- Hierarchy: primary → secondary → supporting → CTA.
- Composition/grid, palette with contrast roles, type direction.
- Asset style: camera, light, material, perspective, texture.
- Run the anti-default pass: name the obvious solution, why it is generic,
  then choose the specific direction with a reason.

Do not ask approval for minor decisions; state the direction and build.

## 3. Asset plan (before any render)

List every visual element. For each: id, purpose, canvas position, method
(generate / edit / native PhotoCraft), reference images + roles, size/ratio,
transparency, continuity rules, QA. Typical assets: hero subject/product,
supporting props, background plate, environment, decor/textures, foreground,
transparent cut-outs, secondary panels.

Rules:
- Generate only what this design needs; no piles of alternatives.
- Exact logos, legal copy, QR codes, serial numbers and precision text go in
  **PhotoCraft editable type/vectors**, not generated pixels.
- Reusable anchors (product/person) keep one approved reference across assets.

## 4. Generate the assets

- One prompt per asset, built with the image-generation prompt order.
- Transparent assets: request RGBA and verify with `egl_check_alpha`.
- Continuity: same light direction, palette, camera language, material finish;
  record prompt/seed for every asset in job state.
- Inspect each asset before placing it; regenerate only a named defect.

## 5. Compose in PhotoCraft

Build the actual design; PhotoCraft is not a file dump.

- Document at the requested size/ratio (mm/px), correct colour mode.
- Semantic layer names and order:
  `00_GUIDES (hidden)`, `01_BACKGROUND`, `02_ENVIRONMENT`, `03_HERO`,
  `04_SUPPORTING`, `05_DECOR`, `06_GRAPHICS_AND_SHAPES`, `07_HEADLINE`,
  `08_BODY`, `09_CTA_AND_BRAND`, `10_FINISHING_ADJUSTMENTS`.
- Place each generated asset as its own layer at true scale; crop/transform
  non-destructively.
- Editable type for all client-readable copy; shapes/paths for vectors.
- Groups for related stacks; adjustments as live layers (masked, not baked).
- Align, distribute, check margins/bleed; no accidental collisions.

Discover any non-curated operation through `egl_photocraft_commands`
(names → brief → full) and execute with `egl_photocraft_command/batch`.

## 6. Refine

- Hierarchy at thumbnail and final size; contrast and spacing.
- Integration: contact shadows, light match, colour grading, edge cleanup.
- Fix in the canvas (type, spacing, colour, layer order) before re-rendering.
- Do not flatten; the deliverable is editable unless the user asked otherwise.

## 7. Verify and deliver

- Inspect the actual canvas with `egl_inspect` / `egl_photocraft_audit`.
- Check: hierarchy, alignment/margins, typography (size, spacing, exact copy,
  no overflow), brand/product fidelity, image integration, layer organisation,
  dimensions/format, alpha when required.
- Save the project, export the requested flat/layered files, verify each path
  exists and opens.
- Report: deliverable, project path, export paths, dimensions, placeholders,
  unresolved limitations, weakest aspect.

## Failure rules
- Missing asset or tool → deliver the best safe partial and say what remains.
- A render that fails QA twice by the same defect → change method (different
  asset, native PhotoCraft fix), not another prompt.
- Never rename/save-as the working document; naming is allowed only when this
  chat creates its own canvas.
