# PhotoCraft command catalogue — source-derived inventory

This inventory preserves command families referenced by the original specification. It is not a substitute for live API discovery. Before calling a command, obtain the current schema through `egglab_photocraft_commands` and use the exact supported command and parameter names. Wildcards below are families, not literal command IDs.

## EggLab tool boundary
- `egglab_status` — primary runtime status; original says PhotoCraft status is included.
- Do not call `photocraft_status` (explicit original prohibition).
- `egglab_photocraft_commands` — discover current command catalogue/schema.
- `egglab_photocraft_command` — execute one supported PhotoCraft command.
- `egglab_photocraft_batch` — execute supported batch; source reports batch stops on first error, so preflight and inspect partial success.

## Document and file
`document.activate`, `file.close`, `document.inspect`.

## Typography
`type.create`, `type.setStyle`, `type.edit`, `type.info`.

## Shapes
`shape.create`, `shape.edit`, `shape.rasterize`.

## Layers
`layer.moveTo`, `layer.delete`, `layer.duplicate`, `layer.setProps`, `layer.new.group`, `layer.groupLayers`, `layer.align.*`, `layer.stampVisible`, `layer.select`, `layer.list`, `layer.copyToDocument`.

## Masks and selections
`select.subject`, `select.refineEdge`, `select.rect`, `select.lasso`, `select.object`, `select.modify.*`, `layer.layerMask.revealSelection`, `layer.layerMask.hideSelection`, `layer.layerMask.apply`, `layer.vectorMask.add`.

## Adjustments
`layer.newAdjustmentLayer.curves`, `layer.newAdjustmentLayer.hueSaturation`, `layer.newAdjustmentLayer.gradientMap`, `layer.setAdjustment`, `layer.createClippingMask`.

## Transform and image
`edit.transform`, `layer.translate`, `image.crop`, `image.canvasSize`, `image.imageSize`, `image.perspectiveCrop`, `edit.contentAwareFill`.

## Filters
`filter.blur.gaussianBlur`, `filter.blur.lensBlur`, `filter.blur.motionBlur`, `filter.sharpen.unsharpMask`, `filter.noise.addNoise`, `filter.other.highPass`, `filter.blurGallery.tiltShift`.

## Layer styles
`layer.layerStyle.dropShadow`, `layer.layerStyle.stroke`, `layer.layerStyle.innerShadow`, `layer.layerStyle.outerGlow`.

## Finishing and image adjustments
`filter.gallery.filmGrain`, `filter.gallery.grain`, `filter.noise.dustAndScratches`, `layer.layerStyle.patternOverlay`, `image.mode.duotone`, `filter.pixelate.colorHalftone`, `filter.gallery.halftonePattern`, `image.adjustments.*`.

## Required discovery workflow
1. Query `egglab_status` and confirm PhotoCraft/document state.
2. Query `egglab_photocraft_commands` for the relevant command, exact arguments and constraints.
3. Inspect active document before mutating it.
4. Build a small batch of logically related, preflighted operations.
5. If batch returns an error, inspect document/layers to identify partial success before retrying.
6. Save project and export only after audit.

Do not infer missing subcommands from `*` notation. The live catalogue is authoritative.
