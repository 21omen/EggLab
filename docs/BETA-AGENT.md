# The EggLab beta agent

EggLab ships two agents:

| | Official agent | Beta agent |
| --- | --- | --- |
| OpenCode agent id | `egglab` | `egglab-beta` |
| Runtime workspace (packaged) | `%APPDATA%\EggLab\agent` | `%APPDATA%\EggLab\agent-beta` |
| Knowledge package (dev) | `panel/` | `panel/beta-agent/` |
| Knowledge package (packaged) | `resources/knowledge/` | `resources/knowledge-beta/` |
| MCP toolset profile | `EGGLAB_TOOLSET=agent` | `EGGLAB_TOOLSET=agent-beta` |
| Setting | default | `opencode.betaAgent: true` (Settings → Beta agent → *Enable beta agent*) |

The official agent is the product. The beta agent is the same creative
director running the **next** version of the agent behavior: changes are tuned,
evaluated and hardened there first, then promoted to the official agent. The
roadmap lives in `docs/AGENT-IMPROVEMENT-PLAN.md`.

## How a beta run differs from an official run

- Chat runs `opencode run --agent egglab-beta` with cwd `agent-beta`, so
  OpenCode treats it as a separate project: separate sessions, separate
  session lineage. Switching the toggle forks the thread's OpenCode session
  (`sessions.bind` tracks which agent drove each thread).
- The beta workspace's `AGENT.md` is generated from
  `panel/beta-agent/AGENT.md` + its own `ROUTER.md` + its own skill manifest —
  not the official package.
- `egl_read_knowledge` inside beta chats serves the beta package: the panel's
  MCP config passes `EGGLAB_KNOWLEDGE_ROOT` so the shared `mcp-server.mjs`
  reads beta skills/references instead of duplicating the server file.
- The beta toolset profile starts identical to the official one
  (`agent-beta` → same 21 `egl_*` tools). Tool-surface changes for beta land
  behind that profile without touching the official surface.

## Iterating on the beta agent

1. Edit `panel/beta-agent/` (AGENT.md, ROUTER.md, skills/, evals/…) — never
   the official package when the change is beta-only.
2. Restart the panel (or trigger any settings change): `buildWorkspace()`
   regenerates both workspaces from their packages on every startup.
3. Enable **Settings → Beta agent → Enable beta agent**, then chat. The
   status box shows `Agent: beta (egglab-beta)`.
4. Turn the toggle off any time; official-agent sessions are untouched.

## Promoting a beta change to official

Promotion is deliberate: port the change into the official package
(`panel/AGENT.md`, `panel/skills/…`, `panel/mcp-server.mjs` agent profile),
update the regression gates (`panel/tools/agent-regression.mjs`, evals), verify
the official agent still passes them, and only then delete the beta-only copy.
Never promote implicitly by editing both packages with the same edit.
