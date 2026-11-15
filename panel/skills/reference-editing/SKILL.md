---
name: reference-editing
description: Edit existing images or compose from multiple references while preserving identity, product details, untouched regions and physical consistency.
---
# Reference Editing

Classify as **change this picture** (remove/replace/recolour/retouch/swap/relight) or **new picture of this subject** (new scene/composition anchored to a source).

1. Inspect inputs; ask for roles only when they cannot reasonably be inferred.
2. For multiple images label in supplied order `<image1>`, `<image2>`, etc.; for one image refer naturally.
3. Assign a canvas (composition/untargeted content survives) and donor roles (person, product, background, style, lighting, artwork). If no canvas, declare all identity/source references and describe relationships.
4. Name exact change target. Preserve the rest by role and position; do not re-describe what must remain.
5. Use an approved identity anchor; do not chain from latest generated output without approval.
6. Resolve vague requests into observable properties and state interpretation.
7. Prefer scoped edits; choose crop vs inpaint based on surface and live capability. Load seam-control reference.
8. Keep chains short; compare identity, exact copy and source invariants after each pass. Change one variable at a time.
9. Inspect edited region at native size and every border. Define what fills removed areas.
10. If the engine cannot preserve an invariant, use masks/layers/compositing or explain limitation.

Do not alter unrelated defects, re-roll identical prompts hoping, or chain full-image edits when masks/layers are safer. Load reference-mapping and local-edit/seam-control references, plus one matched scenario recipe.
