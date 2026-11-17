# Review fixes — 0.3.8

All five confirmed issues were fixed and covered by the new agent gate.

## P1 — failed model downloads could report success

**Cause:** `modelStatus()` only returned download records whose persisted status
was `running`. A download that had not started yet was invisible, so
`download_models` saw no active transfer and returned `ok: true` while the file
was missing. Terminal errors were hidden too.

**Fix:**
- Downloads are registered in the live map synchronously as `queued`, before
  the transfer starts, and `modelStatus()` now returns live queued/running/
  error states (plus persisted errors when the file is missing).
- Persisted running/queued records from a killed app are surfaced as
  `Download interrupted. Press Retry.` instead of disappearing.
- `download_models` now checks the **requested variant's** installed flag, not
  the active checkpoint. Downloading Q4_K_M while FP8 is active can no longer
  look successful just because FP8 exists. It also returns `ok: false` with the
  real error when a transfer failed or the file is missing; a 60-minute wait
  returns `pending: true` instead of a bare timeout.
- Stale terminal errors are suppressed once that variant's file is on disk.
- Installed variants are not re-downloaded by the MCP tool.

**Verification:** `tools/mcp-contract-test.mjs` runs the real MCP server against
a fake panel: failed download → `ok:false`, completed → `ok:true`, running →
waits for completion. A live missing-model cancel test showed `queued` →
`running` → `error: Canceled` → error cleared after restore.

## P2 — stale standalone AGENT.md

**Cause:** root `AGENT.md` still described `egglab_ping`; the MCP server has not
registered that tool since the bridge was replaced.

**Fix:** removed root `AGENT.md`; root `opencode.json` now points at the
canonical prompt `{file:./panel/AGENT.md}`. The agent gate fails if
`egglab_ping` reappears or if any `egglab_*` reference does not match a
registered MCP tool.

## P3 — MCP timeout shorter than download_models

**Cause:** generated and root OpenCode configs used a 30-minute MCP timeout,
while `download_models` waits up to 60 minutes.

**Fix:** MCP timeout **70 min** (`4_200_000 ms`) in root and generated configs;
agent turn timeout **70 min** (`4200 s`); download deadline stays **60 min**.
Existing configs with the old 1800 s default are migrated to 4200 s.

**Verification:** the agent gate parses all three values and fails if the
timeout chain is ever shortened below the download deadline.

## P4 — no automated agent gate

**Added:**
- `tools/agent-regression.mjs`: validates all **24** benchmark cases, unique
  IDs, required fields, every `must_load`/`conditional` skill, every
  `egglab_*` tool reference in `AGENT.md`/`ROUTER.md`/manifest/evals and MCP
  instructions, the root prompt path, the timeout chain and stale
  `egglab_ping` references.
- `tools/mcp-contract-test.mjs`: functional download success/failure/running
  semantics and recent-project limit forwarding.
- `npm run test:agent` runs both.
- `.github/workflows/agent-gate.yml` runs it on every panel push/PR.
- `.github/workflows/release.yml` runs it before building the installer.

The gate is static/contract-level because CI has no model-provider
credentials; full visual/LLM benchmark runs still require a configured provider
and human review. The case suite and its skill/tool contracts can no longer rot
silently.

## P5 — photocraft_recent_projects ignored limit

**Cause:** the MCP schema accepted `limit`, but the handler called
`GET /api/photocraft/project/recent` without it; the HTTP route also read the
empty GET body instead of the query string.

**Fix:** the handler forwards `?limit=N`; the HTTP route reads
`url.searchParams.get('limit')` (with body fallback).

**Verification:** contract test asserts `limit=7` reaches the server; live API
returned exactly 1 and 3 projects for `limit=1` and `limit=3`.

## UI follow-up

A canceled download is a terminal state, not a failure. It now renders as a
neutral **“Canceled”** with **Retry** instead of a red error, and opening the
Models drawer re-reads model state from disk so a canceled record cannot stick
after the file is repaired or restored.

