# Scenario recipes — migrated decision guidance

Load only the recipe matching the user's request. These are workflow patterns, not guarantees about what the current model can do.

## 1. Background replacement
- Decide whether the subject is fixed and only environment changes.
- Preserve subject silhouette, identity, pose, product label and original crop unless asked otherwise.
- Generate/choose a background matching camera angle, horizon, lens, perspective, palette and light direction.
- Composite subject, contact/cast shadow, reflections and atmospheric integration as separate layers where practical.
- Inspect hair/fine edges, occlusion, floor contact and seams.

## 2. Product in a scene
- Lock the product's geometry, label, logo, colors, cap/closure and material.
- Build scene/camera/light around the product rather than changing the product to fit.
- Record placement, relative scale, ground plane, contact point and reflection requirements.
- Keep label typography editable or sourced from the actual product image where exactness matters.
- Check shadow direction, reflections, perspective, scale and edge quality.

## 3. Person relight or restyle
- Identify which attributes may change: lighting, wardrobe, environment, pose or color grade.
- Preserve identity attributes specified by the brief.
- Separate lighting/grade changes from face or body reconstruction.
- Avoid age changes, facial drift, anatomy changes or identity blending.
- Obtain appropriate consent for likeness use.

## 4. Object removal
- Preserve the rest of the canvas and its perspective/texture.
- Remove only the named target and reconstruct underlying context from visible evidence.
- Check repeated patterns, lines, shadows, reflections and object intersections.
- If the missing content is not inferable, avoid fabricating a specific factual detail; use a conservative continuation or ask for a source.

## 5. Skin retouch
- Preserve identity, facial structure, natural texture, pores, fine lines and age presentation.
- Remove only specified temporary distractions/blemishes.
- Prefer subtle local retouch, duplicate base and reversible layer/mask workflow.
- Do not turn skin into plastic or apply a global beauty filter without request.

## 6. Label or text change
- Establish exact new wording and which existing text is being replaced.
- Preserve package geometry, label plane, material, fold/curve and lighting.
- Use editable PhotoCraft type/vector when precise spelling matters.
- Inspect perspective warp, baseline, tracking, safe area and label boundaries.

## 7. Mood/grade change
- Preserve composition, subject identity, product colors and exact copy unless change is requested.
- State target mood in terms of palette, contrast, saturation, temperature, black level and lighting.
- Apply global grade on a reversible adjustment layer when possible; use local masks for selective changes.
- Check skin tones and brand colors after grading.

## 8. Outpaint/reframe
- First inspect whether the current engine actually supports outpainting/canvas expansion. Original v1 described the base model as not having reliable canvas control/outpainting support; verify current local models and tools.
- If unsupported, use a dedicated supported workflow or rebuild the expanded environment with source preserved.
- Protect subject scale/position and ensure the new region matches perspective, texture and lighting.
- Do not pretend a resized canvas is the same as generated outpainting.

## 9. New broad scene
- Develop one coherent world line, camera, subject scale, palette and lighting design.
- Generate background and hero separately when independent control is useful.
- Avoid adding unrequested signage, text, props or brand marks.
- Check object count and spatial relationships.

## 10. Product alternate angle
- Confirm whether the task requests a true new view or a stylized variation.
- Preserve identifiable product geometry and branding; do not claim exact CAD accuracy from generative approximation.
- Use multiple real reference views if available and map their roles.
- Inspect silhouette, perspective, label continuity, closures and material response.

## 11. Multi-person/group composite
- Map every person to a source reference and intended position.
- Preserve identity separately; do not merge faces, clothing or body features.
- Define scale, eye line, camera perspective, overlap, ground contact and lighting for each person.
- Inspect person count, anatomy, hands, occlusions and identity drift.

## 12. Upscale/enhancement
- Decide whether the goal is larger dimensions, denoising, sharpening, restoration or detail reconstruction.
- Preserve important details and avoid inventing text, marks or facial features.
- Keep the original file and compare at 100% and fit-to-view.
- Report when an enhancement synthesizes plausible detail rather than recovering true source information.

## 13. Text-led design
- Use editable type as the default for exact copy.
- Establish reading order, hierarchy, font availability, line breaks, spacing and safe zones.
- Use a restrained visual field; do not generate a decorative background or texture when the brief asks for type-only work.
- Verify every word and punctuation mark.

## 14. Infographic/storyboard/turnaround
- Structure the information before styling it.
- Use accurate data and clear labels; distinguish facts, assumptions and illustration.
- Build charts, tables, grids, labels and arrows as editable elements.
- Keep repeated panels consistent in scale, framing and visual language.
- Check sequence, panel count, numbering, reading order and source attribution.

## 15. Photo restoration
- Separate restoration (repair known damage) from enhancement (synthesizing plausible detail).
- Preserve historical/identity details where visible; do not add undocumented objects or details.
- Repair dust, scratches, fading, tears and local defects conservatively.
- Label uncertainty when the source is too damaged to recover exact content.

## 16. Flat label on package
- Treat package surface as a plane or curved surface with perspective and material response.
- Keep artwork/text exact; warp to surface without altering wording.
- Add appropriate highlights/shadows/reflections without reducing legibility.

## 17. Logo/vector reconstruction
- Preserve exact brand spelling and distinctive geometry.
- Rebuild with editable vector paths/shapes where possible.
- Do not invent brand marks or approximate a trademark when exact source is available.
- Verify silhouette, negative spaces, proportion and color.

## 18. Cut-out sticker/icon
- Decide whether the requested style includes a white border or shadow; do not add these automatically.
- Generate/compose a clean silhouette with margin and transparent background where required.
- Check exported alpha and fringe; preserve vector source if appropriate.

## 19. Chart/data graphic
- Use only supplied or verified data. Clearly label units, time range, geography and methodology.
- Do not distort axes to exaggerate a trend. Mark illustrative data as illustrative.
- Keep chart construction editable where possible and verify numeric values against source.

## 20. General fallback
If no recipe exactly fits, return to the core task classifier, identify fixed vs flexible constraints, select the least destructive supported method, and create a small test only where it materially reduces risk.
