# Image-generation prompt blueprint

Use this blueprint when the job benefits from detailed image prompting. Do not force its full length on a simple isolated prop.

## Long-form composition prompt
The original complex-composition profile aimed at 400–500 words and around 20 sentences. Preserve this as a legacy target for complex multi-zone editorial compositions and benchmark shorter prompts for simpler assets. Never pad prompts merely to hit a word count.

Recommended sequence:
1. Output intent and overall image type.
2. Main concept and communication objective.
3. Camera/viewpoint, framing, lens character and perspective.
4. Primary subject identity and pose/form.
5. Subject material, surface and key visual features.
6. Environment and spatial relationships.
7. Supporting props and their positions.
8. Palette and contrast hierarchy.
9. Key/fill/rim light direction and shadow logic.
10. Atmospheric depth and background behavior.
11. Negative-space zones reserved for type.
12. Explicit exclusions expressed as positive scene constraints where negative prompting is unsupported.
13. Output framing and edge/crop requirements.

## Spatial precision
Use explicit positional relationships (left/right/foreground/background/behind/in front of/overlapping/contacting), relative scale and perspective. Name which item touches, occludes or casts a shadow on another. Do not describe spatial relationships vaguely when layout matters.

## Zone-by-zone construction
For complex layouts, describe each visual zone separately in the prompt: top/header, hero zone, side elements, lower information area, background and reserved text zones. Keep one coherent art direction across zones.

## Text
- Preserve exact user-provided strings, punctuation, capitalization and script.
- Put exact text in quotation marks and specify location, orientation and hierarchy.
- Do not invent extra signage, labels, logos, watermarks or pseudo-copy.
- For dense or exact typography, prefer editable PhotoCraft type rather than image generation.
- Original v1 asks for English scene descriptions while retaining in-image copy in the requested script. Preserve that as a useful prompt-writing convention, not as permission to translate or alter the text.
- Scan for phantom microtext and misspellings after generation.

## Background and atmosphere
If assets are separately composited, prompt the background without the hero or foreground props. Keep atmosphere isolated where independent adjustment is needed. Reserve quiet space for typography; do not let generated details fill every gap.

## Iteration
Change one variable per revision where possible. Keep a record of prompt, seed, model version and reference ordering. If the result fails conceptually, revise the direction rather than adding random adjectives.
