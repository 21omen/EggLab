# Local editing and seam control

## Decide the scope
First decide whether the request is a localized edit or a new image inspired by the source. If the user asks to preserve the original photograph, do not regenerate the whole image unless the tool cannot make the requested edit and you explain the trade-off.

## Protect unchanged regions
Name what may change and what must remain unchanged. Use a preservation clause referencing position, object identity, geometry, light, texture and crop. Change one variable per revision where practical.

## Local region preparation
- Use a crop around the target when the edit needs detailed local context; retain enough surrounding context for lighting and geometry.
- Use inpainting/selection when the live tool supports it and the target can be isolated reliably.
- Ensure the region boundary is clear on all four sides and includes transition context.
- Original v1 describes feathering values 48, 96 and 160 and strength around 0.25–0.5 as working suggestions. These values depend on tool units and must be checked against the actual current schema. Do not blindly copy them into a different API.

## Seam prevention
- Match camera perspective, scale, light direction, color temperature, sharpness, grain and depth of field.
- Include contact shadow, cast shadow, reflected light and occlusion only when physically appropriate.
- Avoid halos, doubled edges, repeated patterns, mismatched blur and abrupt texture changes.
- Inspect every transition at native size and at a reduced view.
- If seam persists, make the edit region/context better before simply increasing strength.

## Iteration and provenance
Keep original input untouched. Record source image, crop/selection, prompt, strength/settings, seed, model version and output. Review after each pass; do not chain many edits without checking drift. Prefer the strongest source and the fewest passes that solve the task.
