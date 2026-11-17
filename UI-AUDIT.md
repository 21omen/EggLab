# UI / function audit — 0.3.7

Scope: the live panel (CDP + HTTP API), model drawer, download pipeline, job
logs and the chat/stop path. This round focused on the model area because the
new Q4_K_M beta exposed several assumptions that only show up when more than
one variant is installed.

## Fixed

1. **Download dropdown reset itself every 400 ms.**
   Model progress events repainted the whole row, recreating the variant
   `<select>` and forcing it back to the first option. A user who picked
   Q4_K_M could watch the UI jump back to FP8 mid-download. The selected
   `row.dataset.variant` is now preserved across repaints.
   Verified with a live repaint test: selection `b` stayed `b`, option label
   rendered `B · Beta`.

2. **Retry downloaded the wrong variant.**
   `retryDownload(id)` called `startDownloads([id])`, which always picked
   `variants[0]`. A failed Q4_K_M download retried FP8 instead. The failed
   variant id is now stored on the download state and reused.

3. **A failed download had no Retry button.**
   The row showed a red error but the only way forward was to guess that the
   Download button still worked. Error state now shows an explicit **Retry**
   action wired through a new `models:retry` IPC handler.

4. **Error styling leaked into later states.**
   `paintDownload` set `note.className = 'model-err'` on failure but never
   reset it, so a resumed download stayed red. The class is reset for running
   and complete states.

5. **Installing a variant silently switched the active model.**
   Finishing any download called `setEngineModel`, even when a working model
   was configured. With a beta variant that is surprising and can change the
   next render. Auto-select now happens only when the configured file is
   missing (first install / broken install); otherwise the new variant appears
   in the installed-model picker and the user switches explicitly.

6. **Q4_K_M was invisible to the app.**
   The file existed on disk but the registry did not know it, so the Models
   drawer ignored it and `useVariant` rejected it. It is now a first-class
   **BETA** variant with the Unsloth source URL, size, trade-off note and an
   installed-file check. Live app verification: current model switched to
   `qwen-image-2.1-Q4_K_M.gguf`, generation completed in 20 s at 512×512.

7. **No way to add a variant once a model was installed.**
   With FP8 present, the Models row only offered installed variants, so a user
   could not download Q4_K_M at all. The row now has a second, compact
   variant picker (missing downloadable variants only) and an **Install**
   button. The picker is limited to the three curated diffusion variants and
   disappears entirely when all three are installed. Wiring verified:
   selecting Q4_K_M and pressing Install calls the downloader with
   `diffusion` + `q4km-beta` (the test transfer was canceled immediately).

8. **First render after a model switch could fail once.**
   Switching Q4_K_M → FP8 and rendering immediately exited 1 during weight
   preparation; the identical job succeeded on retry. The next launch now
   waits up to 2.5 s when the diffusion file changes, so the old engine has
   time to release VRAM/RAM. Rapid Q4 ↔ FP8 cycles are 5/5 clean, and a job
   canceled during the settle window does not wedge the queue.

## Verified end-to-end this round

- Q4_K_M T2I through the panel API: `done`, output written, 20 s at 512×512
  (8-step Turbo).
- Model-switch propagation: switched to Q4_K_M, ran a manual job and an agent
  (`egglab_generate`) job; both engine logs showed
  `loading diffusion model from ...qwen-image-2.1-Q4_K_M.gguf`. Switched back
  to FP8 and a manual job loaded the FP8 file. Job cards now carry a small
  FP8 / Q4_K_M / Q5_K_M tag, recorded from the actual job.
- Non-ASCII prompt (`“EggLab” — 中文 test`) arrived byte-exact in the job
  object; Chinese glyphs appeared in the render, so the prompt path is not
  mangling UTF-8.
- Models drawer: BETA badge, three installed variants, Q4 selected, Retry
  bridge present.
- Existing stop behavior (cancel running job, reject in-flight agent jobs,
  kill engine, release VRAM) is unchanged; no session/chat code was touched.
- Auto-update path is unchanged; 0.3.7 uses the same verified installer flow.

## Stop regression — 0.3.12–0.3.13

**Cause:** OpenCode v2 defaults to a shared background service. Killing the CLI
child on Stop could leave the turn and its MCP server running in that service;
the panel could also wait forever if the CLI never emitted its exit event. In
addition, a turn can be alive **between retry attempts** with no child process:
`active` was null, so Stop returned false and the retry loop kept starting new
runs. The agent therefore looked like it was still working after Stop.

**Fix:**
- v2 runs with `--standalone`, so each turn owns a private server under the
  child; `taskkill /T` now kills the whole turn/MCP tree.
- Stop has a 3-second settle watchdog that resolves the turn and clears the UI
  even if a process stubbornly survives.
- A turn-level `turnRunning`/`turnStopped` state covers the retry/backoff gap:
  Stop aborts the retry wait, blocks a second send/new chat/thread switch, and
  `isBusy()` stays true while the turn is alive even with no child process.
- Stream/error handlers ignore late data after the turn is settled.
- Stop also cancels model downloads started by the agent (`source:"agent"`),
  while manual downloads keep running.

**Verified:** clean-thread agent render → Stop canceled the running job, chat
resolved with “Stopped.”, UI busy cleared, no new jobs after 12–20 s, no
`sd-cli.exe`, VRAM released. Packaged 0.3.13 clean-thread render reproduced the
same result; the test thread was removed and the previous chat restored.
Agent-started model download → Stop canceled it (`downloads:1`, error
`Canceled`); manual downloads are unaffected.

The original `AGENT-UPGRADE` behavior is unchanged; this only fixes the stop
path.

## Known limitations (documented, not fixed)

- **No backend switch in the UI.** The installer picks CUDA on NVIDIA; the
  test machine is Vulkan. Both work. A future Settings action could reinstall
  the other backend, but it needs a download/verification flow.
- **Switching the model while a render is running** only affects the next job
  (the current process already has its paths). The UI does not warn; a
  “current job uses X” note would be clearer.
- **Per-step estimates are per workflow, not per model.** Q4_K_M is faster, so
  the first Q4 render’s progress bar is pessimistic; the learned estimate
  catches up after a run. Splitting the estimate by model family would fix it.
- **No persistent engine.** Every render pays model load (roughly 10–20 s on
  this machine). Keeping `sd-server` alive is the largest remaining speed win
  but a larger architectural change.
