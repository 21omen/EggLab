# EggLab agent â€” deep research and diagnosis

**Date:** 18 November 2026  
**Measured build:** 0.3.16
**Fix shipped:** 0.3.17 (see §7)
**Agent model:** `opencode-go/deepseek-v4.1-flash` (free tier)  
**Scope:** agent quality for image generation, Qwen-Image 2.1 editing and
PhotoCraft production. This report does **not** blame the image model first; it
separates agent/harness failures from image-model limitations.

---

## 1. Executive summary

The agent is not primarily failing because DeepSeek V4.1 Flash is weak. It is
failing because **the harness hides most of the EggLab tool surface from the
model**.

In a clean measured session the agent saw:

- **27 EggLab tools, but only 4 were shown**:
  `cancel`, `check_alpha`, `download_models`, `edit`.
- **Hidden:** `status`, `generate`, `photocraft_edit_active`,
  `read_knowledge`, `photocraft_layers`, all layout/export tools â€” the tools the
  agent prompt tells it to use.
- It also saw unrelated direct tools: `experimental_image_generate`, `glob`,
  `grep`, `read`, `question`, `skill`, `execute`, plus `gh_grep` and OpenCode
  worktree/session tools.

That is the OpenCode 2 Code Mode catalog: it inlines only a token budget of tool
signatures, shows only the **first 120 characters** of each inline description,
and says the catalog is partial. Entry-point tools that happen to be long are
left out. The model then reaches for the easiest direct tools â€” `read`, `glob`,
or OpenCodeâ€™s own `experimental_image_generate` â€” instead of the hidden EggLab
tools. Knowledge files are skipped for the same reason.

A direct-tools experiment fixes the core visibility problem:

- Switching the MCP server to the **new `mcp.servers` shape with
  `codemode: false`** exposed **all 27 EggLab tools directly, with full
  descriptions, on the first request**.
- An allowlist of `{"*": false, "egglab_*": true, "read": true}` plus explicit
  denials removed Context7, gh_grep, OpenCode session/worktree tools,
  `experimental_image_generate`, shell, glob, grep, edit/write and Code Mode.
- Remaining: 27 EggLab tools + `read` + the OpenCode `skill` tool (29).

Tool visibility is the **primary P0**. Tool overload, context size, skill
loading and image fidelity are secondary but real.

---

## 2. What I measured

### 2.1 Current harness

| Item | Measured |
|---|---|
| Generated agent prompt | 20,640 characters (~5,200 tokens) â€” AGENT + ROUTER + live index + runtime snapshot |
| Base source prompt | AGENT 8,672 + ROUTER 9,193 + manifest 5,692 bytes (~5,900 tokens) before skill bodies |
| Skill bodies | 29,879 bytes total; reference-editing alone 11,065 (~2,800 tokens) |
| MCP tools registered | 27 |
| Prompt attachments | current turn text + reference images; history held by OpenCode session |
| Permission denies in packaged config | `edit`, `bash`, `webfetch`, `websearch`, `task` |
| Not denied | `read`, `glob`, `grep`, `list`, `execute`, `experimental_image_generate`, `skill`, question tools |

The generated AGENT file includes ROUTER, a knowledge index and a runtime
snapshot. It does **not** include the skill bodies; those require
`egglab_read_knowledge`, which is one of the hidden Code Mode tools.

### 2.2 Clean meta-test (actual model)

I created a clean thread and asked the model, without calling any tool, which
tools it could see. It answered (abridged):

> **Callable directly:** `experimental_image_generate`, `glob`, `grep`, `read`,
> `question`, `skill`, `execute`.
>
> **Only through `execute`:** `search`, `egglab.cancel`, `egglab.check_alpha`,
> `egglab.download_models`, `egglab.edit`, plus gh_grep and OpenCode tools.
>
> â€œThe `egglab` namespace is listed as **27 tools, 4 shown**. Only the four
> above have visible schemas; the other 23 names are not shown to me â€” I'd have
> to call `search` to discover them.â€

The missing four are the important ones: `generate`, `status`,
`photocraft_edit_active`, `read_knowledge`. The model is being asked to follow a
prompt that references tools it cannot see.

### 2.3 Direct-tools experiment

I created a minimal OpenCode config using the **new MCP shape**:

```json
"mcp": {
  "servers": {
    "egglab": {
      "type": "local",
      "command": ["node", "panel/mcp-server.mjs"],
      "codemode": false,
      "environment": { "EGGLAB_URL": "...", "EGGLAB_TOKEN": "..." }
    }
  }
}
```

Result on the **first** `opencode run --standalone` request:

- 27 `egglab_*` tools visible directly, with full descriptions.
- `egglab_generate`, `egglab_edit`, `egglab_status`,
  `egglab_photocraft_edit_active`, `egglab_read_knowledge` all visible.
- Also visible: 14 unrelated built-ins/global tools (40 total).
- Input tokens for a tiny prompt: 12,728 (includes tool schemas); output 2,187,
  reasoning 3,371. This is a real but acceptable cost.

A second experiment added:

```json
"agent": {
  "test": {
    "tools": {
      "*": false,
      "egglab_*": true,
      "read": true
    }
  }
}
```

plus permission denials for `execute`, `shell`, `glob`, `grep`, `list`,
`edit`, `skill`, `question`, `task`, `subagent`, `webfetch`, `websearch`,
`experimental_image_generate`.

Result: **29 tools** â€” 27 EggLab tools + `read` + `skill`. Context7, gh_grep,
OpenCode session/worktree tools, `experimental_image_generate`, shell, glob,
grep, edit/write, web and subagent tools were gone. The OpenCode `skill` tool
survived the allowlist (likely a system tool); it is not an EggLab knowledge
tool and should be ignored or separately blocked.

This local test also contradicts the remote-MCP first-request bug (#60893) for
this local stdio server on OpenCode 2.3.0: tools were present in the first
request. That bug may affect remote MCP servers only.

---

## 3. Why the current agent looks bad

### 3.1 Hidden entry tools (primary)

OpenCode Code Mode inlines a **2,000-token** catalog of signatures, selected by
path/size, and truncates each inline description to **120 characters**. For an
MCP server with 27 tools, only a few fit. The model is told the catalog is
partial and can use `search()`, but in practice it often does not search unless
the user asks.

Consequences:

- The model cannot see `egglab_generate`/`edit`/`status`/`read_knowledge`.
- The full mask/annotation/region rules in `photocraft_edit_active` are beyond
  the 120-character inline preview.
- The model sees `experimental_image_generate`, `read`, `glob`, `execute`, so it
  uses those instead. `experimental_image_generate` is an OpenCode image tool,
  not the EggLab engine/PhotoCraft pipeline.
- `read_knowledge` hidden means skills are not loaded; editing prompts fall back
  to generic text-to-image prose. This explains â€œnot like the original facesâ€
  and weak local edits.

Evidence: OpenCode issues #63603 (inline 120-char truncation), #62316 (catalog
budget omits entry tools; models skip knowledge), #59115 (`codemode: false`
silently dropped from legacy `mcp.<name>` entries), #60893 (remote MCP direct
tools missing on first request; not reproduced locally). The current generated
EggLab config uses the **legacy** `mcp.<name>` shape, so simply adding
`codemode: false` there would be dropped.

### 3.2 Tool overload and unrelated tools

Even in direct mode, 27 EggLab tools is a lot. The model also sees unrelated
global tools. Research on tool selection consistently finds accuracy degrades as
the number and semantic overlap of tools grows; RAG-MCP and tool-filtering work
show that exposing a smaller, task-relevant set improves selection.

`experimental_image_generate` is the worst offender: it offers a plausible
image path outside EggLab, so the model can satisfy â€œgenerate an imageâ€ without
using the engine, PhotoCraft or the appâ€™s model settings.

### 3.3 Skills are not reliably loaded

The skill router is a manual instruction: â€œread ROUTER, load a skill.â€ The only
way to load a skill body is `egglab_read_knowledge`, which is hidden behind
Code Mode and omitted from the catalog. The model has to discover it with
`search`; issue #62316 documents that models often skip a knowledge base unless
the user explicitly asks. The generated prompt includes a skill **index**, not
the skill bodies.

For editing, this is critical: the reference-editing skill contains the
identity-preservation, annotation, mask and multi-reference rules. If it is not
loaded, the model writes generic prose and loses faces/accessories.

### 3.4 Prompt and context size

The generated prompt is ~20.6 KB (~5.2k tokens) before the tool catalog and chat
history. Skill bodies add 1â€“3k tokens each. This is not a context-window problem
for a 200k/1M model, but it is enough for **context rot** and â€œlost in the
middleâ€: long instruction stacks reduce adherence, especially in a flash/free
model with high latency and many tools. Research consistently shows performance
degrades with longer, structured inputs and that more context is not free.

The agent has no visible context compaction policy in the panel. Long creative
threads accumulate tool outputs, screenshots and prompts; the session can rot.

### 3.5 Model and tier

DeepSeek V4.1 Flash is a 284B model with strong agentic benchmarks (1M context;
free tier reportedly 200K). It is not a weak model in principle. The meta-test
was coherent, followed â€œdo not call tools,â€ and accurately reported the
catalog. The failure is the harness. The free tier does add latency/capacity
stalls and a 200K context cap; use a paid/stronger model only after the tool
surface is fixed.

### 3.6 Image-model limitations are real but separate

Qwen-Image 2.1 preserves identity better than older Qwen Image, but official
guidance still treats identity as the hardest invariant. The current agent may
use Q4_K_M, quality 25 steps and references downscaled to 768 px; that is a
speed/VRAM trade-off, not an agent bug. For face-critical work, use quality 40,
FP8/uncensored weights, and the reference-editing prompt rules. The agent
currently cannot pass `imgCfg` because the MCP tool schema does not expose it
(research F17), removing a useful identity/local-edit control.

The model should say what it verified; it should not claim â€œidentity preservedâ€
without inspecting the result.

---

## 4. What the research says

### Agent/tool design

- **Anthropic, Building effective agents:** start with the simplest workflow,
  invest in agent-computer interfaces, and keep tool surfaces legible.
  https://www.anthropic.com/engineering/building-effective-agents
- **Anthropic, Writing effective tools for agents:** tool names, descriptions
  and schemas are part of the prompt; design them for the model, not only for a
  human API.
  https://www.anthropic.com/engineering/writing-tools-for-agents
- **RAG-MCP (2025):** prompt bloat and overloaded tool menus reduce selection
  accuracy; retrieve/filter a smaller tool set.
  https://arxiv.org/abs/2505.03275
- **Tool-selection research (2026):** more tools and semantically similar tools
  cause confusion; reducing to the right tools beats simply top-k filtering.
  https://arxiv.org/html/2606.06284

### Context

- **Lost in the Middle (Liu et al., 2023):** performance is best when relevant
  information is at the beginning/end and degrades in the middle of long
  contexts. https://arxiv.org/abs/2307.03172
- **Chroma Context Rot (2025):** across 18 models, longer inputs degrade
  performance even on simple retrieval; structured haystacks can be harder than
  shuffled ones. https://research.trychroma.com/context-rot
- **Anthropic, Effective context engineering:** context is a finite resource;
  use compaction, progressive disclosure and minimal high-signal tokens.
  https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

### OpenCode Code Mode

- **Tools / Code Mode:** MCP tools are exposed through `execute` by default;
  `codemode: false` exposes them directly with full descriptions.
  https://opencode.ai/docs/tools/
  https://opencode.ai/docs/mcp-servers/
- **Permissions:** keys can deny `execute`, `read`, `glob`, `grep`, `list`,
  `shell`, `skill`, `question`, `experimental_image_generate`, etc.
  https://opencode.ai/docs/permissions
- **#63603:** inline Code Mode descriptions are first-line/120-char cuts; rules
  further down are never read. Direct tools carry the full description.
  https://github.com/anomalyco/opencode/issues/63603
- **#62316:** the 2,000-token catalog budget can omit the very entry tools the
  agent needs; knowledge bases are skipped in practice.
  https://github.com/anomalyco/opencode/issues/62316
- **#59115:** `codemode: false` is silently dropped from legacy `mcp.<name>`
  entries; use the new `mcp.servers` shape.
  https://github.com/anomalyco/opencode/issues/59115
- **#60893:** remote MCP direct tools can be missing from the first request;
  local stdio direct tools worked in this measurement.
  https://github.com/anomalyco/opencode/issues/60893

### Model

- DeepSeek V4.1 Flash: 284B, 1M context, strong agentic/coding benchmarks; free
  OpenCode tier reportedly 200K context.
  https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash
  https://www.deepseek.com/en/news/deepseek-v4-1-flash/
- Model capability is not the bottleneck in the meta-test; harness is.

### Image quality

- Qwen-Image 2.1 blog: editing improves identity, multiple references, local
  edits and fidelity, but does not guarantee pixel-perfect preservation.
  https://qwen.ai/blog?id=qwen-image-2.1
- Official edit prompt principles: state the edit, preserve by type/role, point
  at references for identity, one blanket preservation clause.
  https://github.com/QwenLM/Qwen-Image-2.1/blob/main/prompt_rewrite/prompts/system_prompt_edit.txt
- Community prompt guide: identity is the hardest invariant; faces, signature
  accessories, product design and medium survive only when explicitly protected.
  https://github.com/kjranyone/qwen-image-2.1-prompt-guide/blob/main/skills/qwen-image-prompt-en/references/image-editing.md

### Evaluation

- Agent evaluation must be trajectory-level, not final-answer-only: tool choice,
  arguments, order, retries and recovery matter.
  https://arxiv.org/html/2603.14465v2
  https://arxiv.org/html/2610.03315v1
- The current `agent-regression.mjs` is a **static contract gate**; it cannot
  catch hidden tools, wrong tool selection or bad prompts.

---

## 5. Recommended fix plan

### P0 â€” Tool surface (highest impact)

1. **Migrate generated OpenCode config to `mcp.servers`** and set
   `codemode: false` for EggLab. Our local test shows all 27 tools direct on the
   first request. Do not add `codemode:false` to the legacy `mcp.<name>` shape;
   it is dropped.
2. **Allowlist the agent tool set**:
   ```json
   "tools": {
     "*": false,
     "egglab_*": true,
     "read": true
   }
   ```
   plus permission denies for `execute`, `shell`, `glob`, `grep`, `list`,
   `edit`, `write`, `skill`, `question`, `task`, `subagent`, `webfetch`,
   `websearch`, `experimental_image_generate`, `todowrite`.
   Keep `read` for image inspection only; restrict `external_directory` to
   render/PhotoCraft roots, not the whole home.
3. **Curate EggLab tools** to ~10â€“12 core tools: status, models, generate, edit,
   photocraft_edit_active, layers, project/canvas, place, new_document, save,
   export_flat, audit, check_alpha, read_knowledge, cancel. Hide
   `download_models`, `photocraft_command(s)`, batch, export-layer variants and
   launch/open/recent from the normal agent; keep them in a developer profile.
4. **Disable `experimental_image_generate` explicitly.** It is a bypass around
   the EggLab engine/PhotoCraft and a major source of wrong behavior.
5. **Test first-request tool visibility** in CI/live: assert core tools are
   present, `execute`/glob/shell/experimental are absent, and the modelâ€™s first
   tool call is an EggLab tool for a simple task.

### P1 â€” Prompt, skills, context

6. **Inline a one-page tool card** in AGENT.md: task â†’ tool â†’ required args,
   including mark/annotation/mask routing. Do not rely on Code Mode to reveal
   tool descriptions.
7. **Make `read_knowledge` visible and cheap**, or inline the reference-editing
   skillâ€™s core rules. The model currently has to discover it.
8. **Compact the prompt**: remove duplicated routing/index text; keep AGENT +
   one-page router + tool card. Progressive disclosure should be explicit.
9. **Context management**: summarize/compact long sessions; cap tool outputs;
   one task per thread; show a context/token indicator. Context rot is real.
10. **Expose `img_cfg`** in the MCP edit tools and use quality 40 / FP8 for
    identity-critical work; document that 768-px references and Q4 are
    speed/VRAM trade-offs.

### P1 â€” Evaluation

11. Add a **live agent eval** with 10â€“20 real tasks:
    - t2i, instruction edit, annotated photo, separate mask, sketch,
      multi-reference, transparency, poster exact text.
    - Record visible tools, first tool, args, prompt, artifact, retries, final
      report.
    - Assert tool choice, required arguments, no `experimental_image_generate`,
      no `read`/`glob` for engine work.
    - Use an LLM judge or human rubric for prompt/artifact quality.
12. Measure the current model vs a stronger paid model on the same eval; only
    switch if quality improves. Do not assume â€œflashâ€ is the problem.

### P2 â€” Product/observability

13. Add an **Agent Diagnostics** view: active model, visible tool count, hidden
    tools, prompt tokens, last tool calls, stop state.
14. Add a **read-only/debug profile** for developers (full tool set) and a
    **production profile** (core tools) so debugging does not require exposing
    everything to the creative agent.
15. Long-term: persistent planner/executor split, tool-result caching, and
    skill memory; but fix the surface first.

---

## 6. What this does and does not explain

**Explains well:** agent ignores the intended EggLab tools, uses generic
`read`/`glob`/`experimental_image_generate`, forgets annotation/mask workflow,
writes generic prompts, skips skills, and feels â€œdumbâ€ despite a capable model.

**Does not fully explain:** face identity drift, low local-edit quality, and
slow renders. Those also depend on Qwen-Image 2.1 limits, Q4_K_M, 25 steps,
768-px references and the image prompt. Fix the agent surface first, then
measure image quality separately with the reference-editing skill and quality
40/FP8.

**Not changed by this report:** the runtime config at the time of measurement.
P0 was implemented in 0.3.17; see §7.

---

## 7. Implementation in 0.3.17

The P0 tool-surface fix is now in the app, not just this report.

### What changed

- `service/chat.mjs` generates **`mcp.servers.egglab`** with
  **`codemode: false`** and `EGGLAB_TOOLSET=agent`. The legacy `mcp.egglab`
  shape is gone, so OpenCode cannot silently drop the direct-tool setting.
- The generated agent gets a **hard allowlist** (`"*": false` plus 19 exact
  `egglab_*` names and `read`) and permission denies for `execute`, `glob`,
  `grep`, `list`, `edit`, `bash`, `skill`, `question`, `task`, `todowrite`,
  `webfetch`, `websearch` and `experimental_image_generate`.
- `mcp-server.mjs` filters `tools/list` and rejects `tools/call` outside the
  agent profile. The full 27-tool registry remains available when
  `EGGLAB_TOOLSET` is unset, for developers and tests.
- **19 core tools:** status, read_knowledge, generate, edit, cancel,
  check_alpha, photocraft_launch/new_document/layers/place/canvas/
  edit_active/audit/save/export_flat/export_layers/command/commands/batch.
- **8 hidden admin tools:** settings, models, download_models, photocraft_open,
  photocraft_recent_projects, photocraft_project, photocraft_export_layer,
  photocraft_export_layers_by_mentions.
- `AGENT.md` now opens with a direct tool card and explicitly forbids generic
  shell/file/web/experimental tools and the OpenCode `skill` tool. `ROUTER.md`
  and the image-generation/photocraft-production skills were updated to stop
  referencing hidden tools.
- `tools/agent-regression.mjs` now checks that the MCP profile and generated
  allowlist match, that Code Mode is off, that the agent profile is selected,
  that hidden admin tools stay hidden, and that the root dev config follows the
  same shape.

### Measured result

A clean meta-test against the generated workspace now reports **21 tools**:

| Visible | Count |
|---|---|
| EggLab core | 19 |
| `read` (image inspection) | 1 |
| OpenCode `skill` (built-in; denied by permission and forbidden in prompt) | 1 |

`experimental_image_generate`, `execute`, `glob`, `grep`, `question`, Context7,
gh_grep and the Omelette `egg_*` server are **not visible**.

A real task — “Use egglab_generate now to create a 512×512 turbo image of a
green circle on white” — completed in **55 s** with exactly one tool call,
`egglab_generate`, and no `read`/`glob`/experimental detour. The previous
agent failed or stopped on the same kind of request.

### Token reality check

| Surface | JSON size | Approx. tokens |
|---|---|---|
| Full 27-tool registry | 17,149 chars | ~4,287 |
| Agent core 19 tools | 14,556 chars | ~3,639 |

Direct core tools are **not cheaper** than Code Mode's ~2,000-token partial
catalog; they cost roughly 1.6k more per request. The win is that the model can
actually see the tools it is told to use, and the allowlist removes the much
larger unrelated surface (Context7, gh_grep, OpenCode file/shell/web tools and
`experimental_image_generate`). **“Too many tools” was a real design problem,
but token count alone was not what made the agent look dumb; hidden core tools
and visible wrong tools were.**

---

## 8. Sources

- Anthropic: Building effective agents, effective context engineering, writing
  tools for agents.
- OpenCode: tools, MCP servers, permissions; issues #63603, #62316, #59115,
  #60893.
- RAG-MCP, Lost in the Middle, Context Rot, ToolChoiceConfusion,
  AgentProcessBench/LiteTrajEval.
- DeepSeek V4.1 Flash model card/announcement.
- Qwen-Image 2.1 blog, official edit prompt, community prompt guide.
- Local measurements from EggLab 0.3.16 and OpenCode 2.3.0 (this report).

