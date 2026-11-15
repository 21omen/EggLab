---
name: photocraft-production
description: Build/edit PhotoCraft documents with editable type, vector shapes, separate layers, masks, non-destructive adjustments, audits and verified exports.
---
# PhotoCraft Production

## Before touching canvas
1. Call `egglab_status`; do not call `photocraft_status` (v1 says it is included).
2. If PhotoCraft is down, call `egglab_photocraft_launch` and wait for connected status.
3. For new jobs create a new document at requested output size; do not inherit unrelated open art file size.
4. If response says `activated:false`, activate returned document before other commands.
5. For existing project inspect canvas/project state and preserve source layers.
6. Discover unknown command IDs/params with `egglab_photocraft_commands`.

## Build
- `type.create`/`type.edit` for editable copy; `shape.create` for flat graphics.
- Keep generated assets on independent named layers.
- Prefer non-destructive masks/adjustments. Applying masks or deleting layers is destructive.
- Use clipped adjustment layers to grade; do not re-render approved pixels for color changes.
- Transform/crop approved assets before re-rendering.
- Preflight batches; they may stop at first failure. Split large batches at recoverable boundaries.
- Never flatten/merge/delete source layers without explicit permission.

## Audit, save, export
1. Inspect canvas; use `egglab_photocraft_audit` when available.
2. Fix named defects; re-audit once, not endlessly.
3. Close scratch docs and exclude proof layers from export.
4. Check `egglab_photocraft_project` state.
5. Save editable project with `egglab_photocraft_save`.
6. Choose one path: `egglab_photocraft_export_flat` for flat final PNG, or `egglab_photocraft_export_layers` for explicitly requested layer handoff. Do not export both “just in case”.
7. Verify paths/status with tool results.

Load command-catalog always; document/type/shapes for layout; layers/masks/adjustments for layer work; filters/transform/export for finishing and delivery.
