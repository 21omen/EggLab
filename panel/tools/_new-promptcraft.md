# Prompt craft — generation (Qwen-Image-2.1)

Qwen-Image-2.1 ships an official prompt-rewrite model (PE-T2I, Qwen3.5-VL 9B) because
the renderer wants a *description of the finished picture*, not a wish. Reproduce that
pass yourself, every time. This is the single highest-leverage skill you have.

**Length: 400–500 words, about 20 sentences, ~25 words each.** A three-word brief and
a three-hundred-word brief both become a description of the same size — a short brief
means you invent most of the frame, not that you write less. Long is correct for
layouts, posters and text-heavy frames. Keep one paragraph, unless the image is
genuinely built from stacked regions (panels, cards, sections), then one paragraph per
region, each opening on where that region sits.

## The eight steps, in order — a later step never revises an earlier one

1. **Split the brief.**
   - *Fixed* — every string, named object, count, stated colour, stated position,
     stated ratio. Copy strings character for character, in their own script.
   - *Job rules* — "keep it editable", "no text", "quick draft", "stronger". These are
     not content: obey them silently and never echo them into the description.
   - *Open* — everything else. You decide it.
2. **Fix the frame.** Ratio comes from the use case and lives only in the tool
   parameters, never in a sentence. Defaults: 3:2 horizontal, 2:3 vertical, 1:1 emblem
   or icon, 16:9 screen, 9:16 phone.
3. **Opening sentence, ~20 words.** Medium + style + subject + background/palette,
   usually orientation: *"A vertical photographic gig poster of a jazz trio in a
   basement club, deep teal shadows and warm amber practicals."* The medium noun is
   never omitted.
4. **Inventory before prose.** List every element with a place in the frame
   (upper-left, across the top, lower third, centred, behind, tucked into a corner) and
   every legible string in reading order.
5. **Walk the frame.** Background first, immediately after the opening — never at the
   end. Then the top band, then left → centre → right through the body, then the bottom
   band. For a single subject, walk the subject instead: background falloff, pose,
   head and face, body and garments, what it holds, the edges.
   **Use 8–14 positional phrases (~10), reaching the corners, edges and centre — not
   clustered in the middle — and open about a third of your sentences on one**
   ("On the right side of the frame, …", "In the upper-left corner, …").
6. **Set every string** — see `# Prompt craft — text in the image`.
7. **Light gets its own sentence**: source, direction, quality, colour temperature,
   and what it does to the surfaces.
8. **Close with one sentence on the whole frame** — composition, palette, style, mood.
   Exactly one; never a second summary.

## Register — what separates a prompt from a word list

- **Observe, don't instruct.** Present tense, third person, declarative. No "you", no
  "create", no "make sure", no "the AI should". Never mention prompts, steps, CFG, seeds.
- **Hedge naturally.** "appears to be", "likely", "suggesting", or an honest pair
  ("a notebook or a tablet"). Be flatly definite only about what the user fixed.
- **Colour almost never bare.** Deep navy, muted olive, pale cream, warm terracotta,
  soft dusty rose, blue-grey, charcoal, off-white. Hex only if the user gave one.
- **Material, not just the noun.** Brushed metal, matte plastic, glossy ceramic, coarse
  linen, weathered wood, frosted glass, paper fibre, condensation, scuffs, visible
  brush strokes.
- **Enumerate, never summarise.** "Several items" is not a description. Say what each
  thing is; small counts as words (three, five, twelve); if something is partly
  hidden, say so and describe the visible part.
- **People get observable surface**: build, posture, gaze, expression, hair, skin tone,
  each garment with colour and material. Age is a life stage, never a number. If a face
  is turned away or cropped, say that instead of describing it.
- **Objects by class, not brand** — "a mirrorless camera", "a compact hatchback" —
  unless the user named the brand.
- **Everything holds together physically**: shadows fall away from the light,
  reflections match what sits in front of the surface, scale is consistent between
  neighbours, surfaces react to what rests on them.
- **Photographic and design vocabulary is welcome**: shallow depth of field, bokeh,
  backlit, negative space, grid, drop shadow, letterpress, risograph, paper stock.
- **No quality boosters.** "masterpiece", "8K", "highly detailed", "award-winning" are
  officially discouraged and buy nothing.
- **Language**: the description is always English; only the text *inside the image*
  keeps its own script.

## What this engine actually runs — and why the paragraph must work harder

Quality is 40 steps at CFG 1; Turbo is 8 steps at CFG 1; **this engine has no negative
prompt at all** — the sampler ignores it. Three consequences:

- **Restrictions must be visible facts.** "the wall is bare", "an unmarked surface",
  "the table is empty". A closing guard is fine ("no text anywhere in the frame"), but
  never build a plan out of negatives.
- **Unstated detail is invented detail.** At 40 steps, invented micro-detail is where
  mush comes from: fewer, better-described elements beat many vaguely-described ones.
- **Baked text is still the least reliable thing.** Prefer editable type in PhotoCraft
  unless the lettering *is* the picture.

---

# Prompt craft — editing

Two different jobs. Do not write them the same way.

**A. Change this picture** — remove, replace, recolour, retouch, swap, relight. Short
imperative plus a preservation clause. One logical change per pass.

**B. A new picture of this subject** — place the person in a scene, build a poster from
a product, a photoshoot, a composite. Construct actively: design the scene, light,
composition and layout to a professional standard, then anchor identity to the
reference. These prompts look like generation prompts with an identity lock.

## The governing principle — attribute disentanglement

Edit exactly what was named, push it to an unmistakable degree, and hold everything
else at input fidelity. Both failure modes are real:

- **Leakage** — you touched what was not named: a relight re-grades the skin, an outfit
  swap drops an accessory, a background change "tidies" the room.
- **Under-editing** — a viewer could mistake the result for the input.

**A preserve clause locks content; it never weakens the edit.** Recognisability comes
from naming what stays fixed, not from holding the effect back.

## Rules

- **Preserve by role and position, never by re-describing appearance.** Describing
  something you meant to keep reads as a generation instruction and makes it drift.
  One blanket clause ("keep everything else unchanged") beats a walk through the frame.
- **Identity is the hardest invariant.** A face, the accessories that make a person
  recognisable, a product's design/markings/count, and the input medium (photograph,
  anime, illustration, sketch, 3D) survive unless explicitly targeted. Point at the
  reference image rather than describing features — words degrade likeness.
- **Resolve, then commit.** Turn vague intent into observable properties: "better
  light" → "soft key from camera-left, gentle falloff, 4500 K". Where the brief is
  ambiguous, pick the most reasonable reading and state it as a decision.
- **Only what was asked.** Do not clean up unmentioned defects, overlays or clutter.
  When an edit removes or reveals something, describe what fills the gap so the result
  stays physically coherent.
- **Affirmative phrasing.** "Keep the background unchanged", not "don't change it".
- **Chain small edits — but keep chains short.** Every pass re-encodes the whole image,
  so identity and label fidelity erode as passes pile up. Two or three passes maximum,
  and re-verify identity and text between them.

## Multi-reference composites (2–10 images)

- **Tag every reference `<image1>`, `<image2>`, …** Never "the first image", "image A",
  "图1". With a single reference, do **not** use tags — refer to it naturally.
- **Assign roles explicitly**: which image is the *canvas* (its composition and
  untargeted content survive) and which are *donors* (person, product, background,
  style) — and exactly what is taken from each. Describe each image individually;
  never compress several into "the references".
- Canonical shapes:
  - Person into scene — "Place `<image1>`'s character in the forest camp of
    `<image2>`. Keep hairstyle, clothing and facial features identical."
  - Product into setting — "Put the product from `<image2>` onto the marble counter in
    `<image1>`. Preserve its shape, materials and label text exactly."
  - Background replace — "Replace the background of `<image1>` with the scenery from
    `<image2>`. Keep the subject, pose and lighting direction unchanged."
  - Style transfer — "Re-render `<image1>` in the art style of `<image2>`. Preserve
    subject identity, clothing and layout."
- **Local edits**: circle, paint over or mask the region, then scope the instruction to
  it — "Within the red box, replace … Leave everything else unchanged."

## Output size

- Default: **follow the input image's ratio.** Choose a new ratio only when the output
  is a new composition (poster, ad, scene, outpaint).
- Outpaint: name it outpainting explicitly, infer the new ratio from the direction
  (expect 30–50% more area), and describe what continues into the new space.

---

# Prompt craft — text in the image

Legible text is Qwen-Image's signature strength and its most common failure. Quoting
discipline is the whole game.

- **Quote every string that must be read**, exactly as it should render — case,
  punctuation, spacing. Measured on this family: ~65% accurate unquoted, ~85% quoted,
  ~96% quoted with more steps. Never paraphrase, translate or "fix" a user's string.
- **Describe the presentation**: weight, colour, case, relative size, medium.
  `a heavy cream headline across the upper third reads "MIDNIGHT SET"`.
- **One block at a time, in reading order**, each with its own position. A line break
  is "a second line reading …", never a real newline inside the string.
- **Do not let the model invent signage.** If a facade, shelf or screen appears, say
  what is on it, or say it is blurred, indistinct or too small to read. Close
  text-bearing prompts with "No other text appears in the image."
- **Charts and tables**: axes, tick labels, legends, series and cell values are text
  too — write them out or accept gibberish.
- **Fragile strings**: slash dates, long digit/symbol mixes and dense numerics garble.
  Commit the user's string; if it garbles, set it as editable type in PhotoCraft
  instead of re-rolling the render.
- **Monolingual.** Never mix scripts inside one string, and never emit a bilingual pair
  unless the user asked for one.
- **Japanese is the weakest script** — kanji lose strokes, kana distort. The reliable
  route is editable type, or generating the text as a flat black-on-white asset and
  tracing it in an edit pass. Do not demand it directly and hope.
