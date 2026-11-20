# Chat & document management — redesign plan

Status: proposal for user approval. Written after a full audit of
`panel/service/sessions.mjs`, `chat.mjs`, `http.mjs` and `main.mjs` doc/chat
wiring, plus outside research (sources at the end).

## 1. What the current design is

- A PhotoCraft **document is the scope**; chats are **threads inside it**.
  The primary thread's id **is the document key** (`untitled:<name>:<w>x<h>`
  or a file path); extra threads are `<docKey>#2`, `<docKey>#3`…
- Switching the active PhotoCraft document **silently switches the current
  chat** (`threadFor` + `activeThreads` + a watcher that restores the working
  document when "the agent leaves it").
- A web of repair systems keeps it alive: `migrateKey` (untitled → saved path),
  `retarget` (move thread to another doc), `ensureEntry`, `repairCurrent`,
  `repairDeadSessions`, `purgeDeletedThreads`, tombstones with TTL, registry
  backups, legacy-shape migration, `_trash` sweeps, transient render paths
  folded into a "Generated images" group.

## 2. Why it keeps producing errors (concept audit)

1. **Chat identity is derived from an unstable document identity.** A document
   changes id when it is first saved; renders opened as documents create
   **transient doc keys that are file paths in `out/`/`tmp/`**. Chat ids inherit
   all of that instability, which is why `migrateKey`/`retarget`/tombstones and
   their edge cases exist at all. Tombstones even carry a TTL comment about
   "a document path reused months later" — identity reuse actually happened.
2. **The canvas owns the chat (ideology error).** Tab focus silently switches
   conversations. The user can never answer "which chat am I in?"; history
   appears to disappear when a tab changes; a chat "belongs" to whichever
   document was last active instead of to the task the user is driving.
3. **Two sources of truth for the current chat.** `registry.currentKey` is
   global while `activeThreads` is per-document; every switch has to keep them
   consistent, and every repair has to guess which one the user meant.
4. **The agent's document-ownership rules fight the workflow.** Attached chats
   are blocked from creating a new document, and AGENT.md forbids leaving the
   canvas — but a new piece legitimately needs a new canvas. This produces
   blocked-tool errors, transient-doc workarounds, and "agent left document"
   watcher fights.
5. **Silent context forks.** Changing model/vision/agent quietly starts a fresh
   OpenCode session on the next message; the agent "forgets everything" with no
   explanation (the fork chain `forkedFrom` exists but is never surfaced).
6. **Repair-heavy design.** Six repair/repair-adjacent functions plus a backup
   plus a trash sweep are symptoms of wrong invariants, not missing patches.

## 3. What the reference products do

- **Claude Code** (Anthropic best practices): one session = one focused task;
  `/clear` between unrelated tasks is routine; sessions are cheap, explicitly
  named and resumable (`/rename`, `--resume`); `/rewind` rolls conversation
  back explicitly. Nothing silently swaps your session — you choose it.
- **ChatGPT/Claude branching** (2026 UX): conversations branch explicitly from
  any message into a new thread; the original is never destroyed; branches are
  first-class UI, not hidden `#2` suffixes.
- **Creative tools (Figma/Canva/Firefly)**: generations are **assets/variants**
  placed into the document as non-destructive layers; the chat is a driver
  surface; document history lives in the document (layers/versions), not in
  chat threads. No design tool reassigns your conversation when you switch
  tabs.
- **Long-running agent research**: structured notes + explicit "get up to
  speed" beat implicit state; clean-state handoffs beat magic continuity.

## 4. The new concept

Three entities, one rule: **the chat is the driver; the canvas is a target the
user points it at.**

| Entity | Identity | Rules |
|---|---|---|
| **Chat** | stable `chat_<uid>`, minted at first message | belongs to the user; carries title, agent, model lineage, OpenCode session lineage, transcript |
| **Document (workspace)** | stable `doc_<uid>`, assigned at creation, **kept through save-as**; the path is just an attribute | may exist without a chat; may host several chats via explicit links |
| **Asset** | stable `asset_<uid>` per render/export | immutable record (job, prompt, seed, parents); can be placed into any canvas; tray is per chat |

Rules:
1. **Explicit canvas linking.** A chat shows its linked canvas in the header
   with actions: *Link to current canvas / Unlink / Open linked canvas*.
   Switching PhotoCraft tabs **never** changes the current chat.
2. **Stable ids everywhere.** No id is ever derived from a mutable path. Save-as
   updates the document's path attribute; chats/assets/links are untouched.
   `migrateKey` and the transient-doc-key machinery disappear.
3. **Renders are assets, not documents.** Opening a render shows a preview, not
   a chat scope. The "Generated images" pseudo-group and `isTransientDocKey`
   disappear; the asset tray replaces them.
4. **Forks are visible.** Changing model/vision/agent announces "context resets
   on the next message"; a *New context* button forks explicitly; transcripts
   are always kept.
5. **The agent can create a canvas when the piece needs one.** The linked
   canvas remains the default target; creating/opening another canvas is
   allowed and reported. Ownership rules move from "forbidden" to
   "explicit and visible" (beta agent first).
6. **One chat panel, explicit switching.** The chat list is a flat list of
   chats (with canvas badges); the user clicks to switch. `currentKey` is the
   single source of truth.

## 5. Migration and compatibility

- Keep transcript files and formats; add `chatId` to records. Registry v2 keys
  threads by `chat_<uid>`; every legacy entry migrates by minting a uid and
  keeping the old id as `legacyKey` (dedupe + tombstones re-keyed).
- Document uids: minted lazily; `docKey` (path/untitled key) becomes an
  attribute `docRef` so existing OpenCode/history flows keep working while the
  migration completes.
- No behaviour change for OpenCode: sessions remain project-scoped per agent;
  the chat↔session lineage just stops being reachable through mutable doc keys.

## 6. Phases

- **Phase A — stop the bleeding (current architecture, small diffs):**
  1. Tab switch no longer auto-switches the chat; the chat header shows the
     current linked canvas and a "Switch to <canvas> chat" affordance instead.
  2. Renders/exports open as previews, never as chat scopes.
  3. Model/vision/agent changes emit a visible "context resets" note and the
     `bind` fork reason is returned to the UI (also fixes `switched` ignoring
     `agentChanged`).
  4. Beta session export/delete use the correct project scope (both currently
     hardcode the official `agent/` cwd — beta recovery/deletion silently fail).
- **Phase B — stable identities:** chat/doc uids + migration + tombstone
  re-key; delete `migrateKey`; retarget becomes "relink canvas".
- **Phase C — linking UX + agent rules:** link/unlink actions, canvas badges in
  the chat list, ownership rules rewritten in the beta agent (official agent
  keeps the current wording until promotion).
- **Phase D — assets:** asset records for every render/export; asset tray per
  chat; place-back flows reference assets; job history per asset.
- **Phase E — session UX polish:** named sessions, explicit fork history view,
  "resume by chat" everywhere.

## 7. Sources

- Anthropic, *Claude Code best practices* — `/clear`, `/rename`, `--resume`,
  `/rewind`, one task per session, worktree-per-parallel-task.
- ChatGPT/Claude conversation-branching UX (aiuxplayground "Thread Branching",
  shapeof.ai "Branches", ChatGPT "Branch in new chat", 2026).
- Creative-tool patterns: generations as non-destructive variants in a document
  (Adobe Firefly/generative fill, Canva Magic Studio, Figma AI coverage 2026).
- Anthropic, *Effective context engineering for AI agents* and *Effective
  harnesses for long-running agents* (structured state beats implicit state).
