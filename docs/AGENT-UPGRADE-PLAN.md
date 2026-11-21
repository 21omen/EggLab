# EggLab agent — total upgrade plan (v2)

Fresh research: Anthropic *Code execution with MCP* (progressive tool
disclosure, `search_tools` with detail levels), *Equipping agents with Agent
Skills* (3-level progressive disclosure), *Building effective agents* /
*Context engineering*, 2026 image-agent papers, and the official Qwen-Image-2.1
+ PhotoCraft documentation. CFG 1 stays (user decision).

## 0. Concept — Generate-First, two workflows

EggLab is a **Generate-First** product powered by Qwen-Image-2.1.

- Generation is the primary creative engine: every visual element is generated
  (including transparent assets).
- PhotoCraft is the **assembly and refinement studio**: composes, typesets,
  masks and adjusts generated assets into the final deliverable.
- There are exactly **two top-level jobs**:
  1. **IMAGE EDITING** — change, add, remove, transform an existing image.
  2. **DESIGNING** — build a new piece from generated assets in PhotoCraft.
- Never one-shot a design; never re-render what the editor can fix; never hand
  a flat render where an editable project is expected.

## 1. IMAGE EDITING — four input modes (one tool, explicit contracts)

All modes share: prompt grammar, preserve clause, fresh seed, inspect before
claiming done. Roles: `<image1>` = canvas/composition reference.

| Mode | Inputs | Contract |
|---|---|---|
| A. Reference-based | 1–10 images + short brief | assign each image exactly one role (canvas, identity, product, material/style, scene); state what each contributes and must not |
| B. Prompt-based | 1 image + prompt (+ optional refs) | imperative change + detailed result state + one preserve clause; no one-liners |
| C. Mask-guided | image1 original + image2 mask (+ refs) | mask same dimensions/aspect as original; region = different background color OR transparency; panel normalizes mismatch and can invert; white/alpha = editable by default; masked inpaint `--init-img --mask --strength`; mask never a donor |
| D. Annotation-guided | annotated image (+ refs) | circles: one color = one instruction (user order); paint: region for add/replace; name each mark and its result, marks must be removed, unmarked areas preserved; donors named `<image2>+` and tied to a mark ("hat from <image2> on the girl in the blue circle") |

Deliverables of an edit: new asset asset record + (if on a canvas) placed layer;
never overwrite the source.

## 2. DESIGNING — the generate→compose pipeline

1. **Understand** the request, audience, placement, constraints; choose one
   creative direction (anti-default pass).
2. **Plan assets**: list every visual element (subject cut-outs, plates,
   textures, lettering) with size/transparency/role.
3. **Generate assets** with Qwen-2.1 (transparent where needed; inspect each).
4. **Compose** in PhotoCraft: layers, groups, editable type, shapes, placement.
5. **Refine**: adjustment layers, masks, styles, spacing, hierarchy.
6. **Deliver**: saved editable project + requested exports; report evidence.

Rule: if a piece needs 4 assets, the agent generates 4 and composes them — it
does not write one mega-prompt and stop.

## 3. Capability architecture — know everything, load only what is needed

The core problem: PhotoCraft exposes hundreds of commands; loading all schemas
is wasteful and distracts the model.

**Design (from Anthropic's progressive tool disclosure):**

- **Level 0 — Capability index (always loaded, ~1 screen):** grouped catalog:
  documents, layers & masks, selections, type, shapes/vectors, adjustments,
  layer styles, transforms, smart objects, export, data sets — with one routing
  line per group. Generated from the live catalog at startup.
- **Level 1 — Search (names only by default):** `egl_capabilities(query,
  detail: "names" | "brief" | "full")`; names first, brief on request, full
  schema only for the chosen command(s).
- **Level 2 — Docs on demand:** per-command docs (params, ranges, examples,
  gotchas) fetched only when the command is about to be used.
- **Level 3 — Execute:** `egl_photocraft_command` / `batch` (existing), with
  preflight validation and recovery boundaries.

**Bridge widening:** expose the full command catalog to search/describe/
execute; keep curated high-level tools for generation and the production loop.
Add the missing essentials first: layer masks (pixel/vector), adjustment
layers, groups/clipping, text editing, layer styles, selections, export
formats, data sets.

**Tool surface v2:**
- always loaded: status, read_knowledge, inspect, job_state, generate, edit,
  cancel, check_alpha, capabilities (search), command, batch, layers, place,
  canvas, save, export_flat, audit.
- edit_active stays for PhotoCraft-layer masks (legacy path, keep).
- no per-command schema in the prompt; discovery handles breadth.

## 4. Knowledge restructure (skills with 3-level disclosure)

Replace the current overlapping set with task-shaped skills:

1. `edit-reference` — mode A/B (roles, prompt grammar, preservation)
2. `edit-mask` — mode C (mask conventions, strength table, normalization)
3. `edit-annotation` — mode D (color→instruction mapping, paint regions, donors)
4. `design-pipeline` — generate→compose→refine→deliver, asset planning
5. `photocraft-capabilities` — capability index + when-to-use routing (not per-command docs)
6. `qa-delivery` — rubric, evidence, export checks

- Every skill: name/description only at startup; body on demand; bundled
  references (command docs, examples) only when needed.
- One source of truth per protocol (mask semantics, annotation colors,
  strengths, prompt order); other files link, never duplicate.
- ROUTER: Edit (A–D) / Design → skill; explicit "when NOT to use".

## 5. Prompt discipline (Qwen-Image-2.1, verified usage)

- Sentences, not tags: medium+subject → setting → light with direction →
  framing → materials/palette → restrictions → quoted text with placement.
- Restrictions live in the prompt when CFG = 1; say "no lettering" on facades.
- Agent-side prompt expansion before every render (no PE model shipped).
- Resolution: choose final size before the seed (composition changes with
  size); preview sizes vs final sizes; 2K grid caveat.
- Text: quoted + placed is reliable; lettering-as-artwork may be generated and
  inspected; UI copy stays editable type in PhotoCraft.

## 6. Harness upgrades

- Job classification (Edit mode A–D / Design) + 3–6 line plan + job_state
  schema (inputs, assets, QA).
- Completion contract: deliverable, checks, saved, exported — echoed to user.
- QA rubric with accept gate (max 2 repairs, evidence per dimension).
- Inspect nudge (shipped for beta).
- Outcome evals: files exist, sizes correct, project saved, assets recorded.

## 7. Phases and acceptance

**P0 (foundation, ~1 week of work)**
1. Capability index generated from live catalog + `egl_capabilities` search
   with detail levels.
2. Bridge widening for masks/adjustments/groups/text/styles/selections.
3. Edit modes A–D contracts in AGENT.md + three edit skills.
4. Prompt grammar + restriction/no-lettering rules in every generation path.
Acc: agent can find and use an untaught command from a natural request;
mask edit works from two attached images; annotation example works.

**P1**
5. Design pipeline skill + asset planning; design job uses ≥2 generated assets
   and editable type on a real piece.
6. Completion contract + QA rubric loop.
7. Resolution policy + prompt-expansion pass wired into generate/edit.

**P2**
8. Outcome smoke evals + capability/regression suites.
9. Knowledge consolidation; engine doc rename; model-tier guidance.
10. Promotion gate: beta → official only after evals pass.

## 8. Open questions (for the user's later findings)
- Which PhotoCraft commands matter most in real use?
- Preferred mask convention (alpha vs colored background) in practice?
- Annotation color palette/mapping UX (fixed color→role? free mapping?).
- Target resolutions per use case (screen vs print).
