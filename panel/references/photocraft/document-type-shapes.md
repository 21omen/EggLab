# PhotoCraft: documents, type and shapes

## Document creation
The original examples included these canvas sizes. Use the user's brief first; these are starting presets, not mandatory dimensions.

| Use | Example dimensions (px) |
|---|---:|
| Poster | 1024 × 1536 |
| Feed portrait | 1080 × 1350 or 1024 × 1280 |
| Story | 1080 × 1920 |
| Square | 1080 × 1080 |
| Landscape/banner | 1920 × 1080 |
| A4 at 300 ppi | approximately 2480 × 3508 |

Use appropriate print resolution/color profile only when supported by the application and specified by the job. New document creation returns document index/activation status in the original workflow; inspect the live tool output.

## Font selection
The original source lists these font names as candidates: Impact, Oswald, Roboto Condensed, AktivGrotesk, Neue Haas Grotesk, Inter, Montserrat, Bodoni MT, Baskerville, Garamond, Georgia and IBM Plex. Verify actual installed fonts before using one. Do not silently substitute a font if its design role is important; report the substitution.

## Type workflow
- Use editable text layers for precise copy whenever available.
- Verify exact string, punctuation, capitalization, language/script and reading order.
- Define family, weight, size, tracking, leading, alignment, color, position and text box.
- Ensure line breaks are intentional and the text remains inside safe zones.
- Inspect at actual delivery scale; avoid rasterizing until necessary.

## Shapes and vectors
Use editable vector shapes for logos, icons, labels, charts and precise geometry where possible. Preserve source vector geometry and stroke behavior. Rasterize only when required by a specific effect or unsupported operation and retain the editable source when possible.

## Existing documents
Inspect active document, canvas dimensions, layer list and save state before editing. Never assume the currently active file is the intended project. Activate the intended document explicitly when supported. A chat that already owns a document must keep working in that document — do not create a second document or switch to another project during the turn. Only a chat with no document may create its first canvas.
