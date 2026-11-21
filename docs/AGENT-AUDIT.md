# Agent audit — instructions vs PhotoCraft + Qwen-Image-2.1

Method: full read of the beta agent package (AGENT.md, ROUTER.md, 8 skills,
engine reference, evals); live PhotoCraft command catalog (47 commands);
official Qwen-Image-2.1 docs and 2026 image-agent papers; measured engine
experiments (mask polarity, strength, circle editing, noise replay).

## What we get wrong

### 1. Instruction ↔ PhotoCraft capability gap (biggest)
PhotoCraft exposes **47 commands**; our skills teach roughly a dozen. The agent
therefore tends to **re-render pixels for jobs the editor should do**:
- Editable type changes are often "fixed" by regenerating instead of editing
  the text layer — violating our own non-destructive rule.
- Layer masks, groups, adjustment layers and transforms exist but are barely
  taught; the agent improvises with renders.
- The generic `egl_photocraft_command(s)` bridge is documented as "look up when
  unknown", so capability discovery is reactive, not planned.
**Need:** a capability map (the 47 commands grouped by job: text, shape, layer,
mask, group, adjust, transform, export) with one routing rule per group, and a
"fix in the canvas first" rule before any re-render.

### 2. Qwen-Image-2.1 usage mismatches
- **Resolution:** official model is native 2K with trained aspect buckets; we
  cap t2i at 1024 and inpaint at 1536, so finals are softer than the model can
  deliver. Need a preview/final policy (e.g. previews at 1024, finals at
  1536–2048 buckets with VRAM checks; ≤1536 when the 2K grid bug matters).
- **Prompt depth:** official edit usage relies on long, detailed prompts (their
  PE rewriter); parts of our generation guidance still read as one-liners.
  Need "describe the target state richly; one preserve clause" everywhere, not
  only in reference-editing.
- **Text rendering:** Qwen's headline strength is typography; our rules push
  nearly all text to PhotoCraft type. Lettering that IS the artwork should be
  rendered and inspected; UI copy stays editable. We lack that decision rule
  and the official long-text prompt format.
- **Confirmed correct:** CFG 1.0 (official ComfyUI edit template), no negative
  prompt, fresh seed per edit (noise replay), RGBA prompt format, annotation
  (circle) editing, latent-mask semantics.
- **Multi-reference roles** are taught only in reference-editing; generation
  and photocraft skills don't repeat them, so composition requests drift.

### 3. Protocol gaps (harness)
- Job state is optional and unvalidated; no completion contract, so "done"
  claims aren't checked against saved/exported/QA evidence.
- No QA rubric with pass/fail per dimension (text, hierarchy, seams, identity,
  alpha) — quality still depends on the model's mood.
- Evals are routing contracts, not outcomes; behavior regressions (like the
  inspect nudge or mask path) aren't covered.
- Document lifecycle is implicit: naming (now guarded), when to save vs export,
  where deliverables go. The rename guard + naming exception are new.

### 4. Knowledge organization
- Marked-edit and mask guidance now lives in **three places** (AGENT.md,
  reference-editing, engine facts) — already caused drift (the chat-attachment
  path was missing until now). One source of truth per protocol is required.
- The engine doc is still named `-legacy-facts` though its content is the
  verified profile.
- Eight skills overlap (image-generation / reference-editing /
  photocraft-production); ROUTER lacks sharp "when NOT to use" lines.

## What we need (priority)

**P0 — next**
1. Capability map + routing table for the 47 commands ("fix in canvas first").
2. Resolution policy (preview vs final; aspect buckets; 2K-caveat).
3. Text decision rule (render baked lettering vs editable type) + long-text
   prompt format.
4. Single-source local-edit protocol (mask image / PhotoCraft mask / marked
   photo / sketch) referenced from one place.

**P1**
5. Completion contract in `egl_job_state` (deliverable, checks, saved, exported)
   echoed to the user.
6. QA rubric loop with accept gate (max 2 repairs, evidence per dimension).
7. Outcome-based smoke evals (files, sizes, project saved) + capability evals.

**P2**
8. Prompt-expansion discipline (target detail; one preserve clause) across all
   generation skills.
9. Model-tier guidance in the panel.
10. Consolidate duplicate knowledge; rename the engine doc.

## UI note
The render preview under the composer stays as-is — no removal needed.
