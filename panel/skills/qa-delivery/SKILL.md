---
name: qa-delivery
description: Verify artifacts against brief, source references, text, image integrity, visual profile, measurements, project state and export status.
---
# QA and Delivery

## Select profile
Use `print_editorial`, `screen_digital`, `minimal`, `vector_mark`, `photographic`, `identity_sensitive` or `data_structured`. Core truth/source checks always apply. Minimal design must not fail just because it has no grain, three ornaments or headline overlap.

## Three-way verdict
- **ACCEPT:** applicable profile checks pass.
- **REVISE:** name defect and change one relevant variable.
- **HOLD:** missing decision, consent, source, capability or fact blocks safe completion.
Never silently ship REVISE/HOLD.

## Core gate
1. Canvas/job: correct dimensions/ratio and document belongs to this job.
2. Brief constraints: exact names, counts, required objects/copy/placement/exclusions.
3. Text: exact strings, complete lines, legibility, safe area, editability; scan phantom microcopy.
4. Assets: correct alpha, no accidental clipping/seams/wrong counts, contact shadows if needed.
5. Identity/product: compare face, shape, label, color, logo and locked invariants to source.
6. Hierarchy: one focal point; headline/subhead/body/CTA; thumbnail and two-second tests.
7. Palette/light: coherent palette and physical lighting/shadow/reflection; profile-specific contrast.
8. Edges/geometry: no unintended frame collision, distortion, broken repeated geometry, anatomy defects or duplicates.
9. Craft: grid, margins, baseline, spacing, alignment, optical correction.
10. Profile finish: only applicable finish/support/density checks.
11. Workspace/delivery: scratch closed, project saved, export exists, no proof/superseded content leaks.

Use audit metrics when available; never invent measurements. `edgeTouch` is acceptable only for intended bleed. Inspect fine edges, hands, text, repeated geometry and seams at native size. Alpha verification checks exported PNG via `egglab_check_alpha`.

Repair one target, re-check affected items and compare for regressions. Revert a fix that introduces a new failure. Stop when relevant gate passes.

Use `templates/delivery-report.md`; separate verified outputs, unverified items, placeholders and weakest remaining aspect.
