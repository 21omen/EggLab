# PhotoCraft: filters, transform and export

## Filters
Use Gaussian/lens/motion blur, unsharp mask, noise, high-pass, tilt-shift, grain, dust/scratches, pattern overlay, duotone and halftone only when the live command catalogue confirms availability. Apply filters on a duplicate or smart/non-destructive equivalent when supported. Verify radius, strength and scope from the live schema; do not invent values.

## Transform and canvas operations
Distinguish image crop, canvas size and image size: they have different effects on content and resolution. Confirm the requested outcome before changing any of them. Use perspective crop/content-aware fill only when required and inspect boundaries after execution.

## Save and export
- Save the editable project to the job/project destination before final export.
- Export the appropriate flat format and color/dimension profile for delivery.
- Export layered outputs only when required; confirm layer naming and order.
- Re-open or inspect exported files where possible to verify dimensions, alpha, text and file presence.
- Keep source files, working project, preview and final export distinct.

## Legacy workflow references
The original EggLab tool list includes `egglab_photocraft_launch`, `egglab_photocraft_canvas`, `egglab_photocraft_audit`, `egglab_photocraft_new_document`, `egglab_photocraft_place`, `egglab_photocraft_edit_active`, `egglab_photocraft_layers`, `egglab_photocraft_project`, `egglab_photocraft_save`, `egglab_photocraft_export_flat`, `egglab_photocraft_export_layers` and `egglab_photocraft_export_layer`. Confirm each against the live EggLab tool registry before calling.
