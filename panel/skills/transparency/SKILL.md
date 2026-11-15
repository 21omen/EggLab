---
name: transparency
description: Produce, extract, edit and verify true-alpha RGBA assets, including transparent cut-outs and mask-based fallbacks.
---
# Transparency and RGBA

1. Classify source: new subject, user-photo extraction or edit of existing RGBA.
2. Use transparent mode only if live tool schema confirms support; do not hand-write undocumented engine templates.
3. State edge needs; avoid “sticker/outline/die-cut” for a bare cut-out. Specify whether floor/shadow is needed.
4. Use quality mode for edge-critical assets according to current runtime profile.
5. Read returned alpha verdict, percentages, bounds and edge-touch fields before placement.
6. If opaque/empty/fringed, change method or prompt, or use PhotoCraft selection/layer mask.
7. Verify exported PNG with `egglab_check_alpha`; checkerboard canvas is not proof.
8. Inspect at 100%; glass, water, smoke and wispy hair are harder than hard silhouettes. Disclose limitations.

Load `references/transparency/alpha-workflow.md`.
