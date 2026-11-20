# Transparency and alpha workflow

## When to request transparent output
Use transparent generation when the output is an extracted/isolated subject intended for compositing or when the input is explicitly alpha-bearing. Do not assume a checkerboard preview proves the file has transparency.

## Source-derived prompt guidance
The original workflow specifies a transparent output request (e.g. `transparent: true` where supported), centered subject with generous margin, no floor or cast shadow when a clean cut-out is needed, and a clear silhouette. Quality mode is preferred for intricate edges when available. Confirm the current tool schema first.

## Alpha semantics
Alpha should describe the subject's actual silhouette and physically meaningful translucency, not create an arbitrary glow or soft halo. Thin hair, glass, smoke and fabric may have partial alpha; opaque product edges should remain clean.

## Common failures
- White fringe/matte halo from a white outline or sticker treatment.
- Shadow or floor baked into an asset that should be isolated.
- Clipped silhouette or insufficient margin.
- Opaque checkerboard pixels masquerading as transparency.
- Unwanted transparent holes or semi-transparent product body.

## Verification
1. Inspect the image against light, dark and checkerboard backgrounds.
2. Read alpha verdict, subject bounds and edge flags when returned.
3. Use PhotoCraft subject selection/refinement when appropriate and supported.
4. Export PNG and run `egglab_check_alpha` against that exact exported file.
5. Inspect the edge at native scale; check thin details and fringe.
6. Record measured results; do not invent alpha metrics.

If alpha verification fails, fix the asset or extraction method before treating it as deliverable.
