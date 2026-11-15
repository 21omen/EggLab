# Reference mapping and identity protection

## Assign each reference one job
For every image, label its role: canvas/base, subject identity, pose, clothing, product design, material, style, lighting, environment, color or layout. Do not leave role ambiguous.

## Canvas and donor
- **Canvas/base**: image whose composition and structure should be retained.
- **Donor/reference**: image supplying a subject, object, texture, pose or other specific attribute.
- State what transfers from donor and what remains fixed in canvas.
- Use `<imageN>` tags only in the format required by the live EggLab tool schema; preserve the mapping between tag and actual reference ordering.

## Attribute disentanglement
A single reference can contain several attributes, but the task should specify exactly which attributes transfer. Example: take the object identity and material from image 2, the lighting mood from image 3, and preserve the composition from image 1. Never imply that the whole reference should be copied unless that is the intention.

## Identity invariants
For a person, protect facial structure, age presentation, skin tone, hairline, distinctive marks and other user-designated identity characteristics. For a product, protect silhouette, dimensions, label artwork, color, logo, cap/closure, material and distinctive details. List only the attributes actually required by the brief.

## Composition and grouping
Describe foreground/background order, overlap, relative size, orientation, spacing, contact and occlusion. For group composites, map each person/object to a position and identify the source image for each. Do not merge identities or duplicate subjects.

## Consent and rights
Do not create deceptive or harmful identity transformations. For likeness work, follow the source's consent requirement: obtain the necessary written consent where required, and comply with applicable platform policy and local law. Do not infer permission from possession of an image.
