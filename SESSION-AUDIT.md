# EggLab session, document and chat handling — audit and fix

**Date:** 18 November 2026  
**Build:** 0.3.20  
**Scope:** thread identity, transcript files, PhotoCraft document binding,
OpenCode session recovery.

---

## 1. Executive summary

The main failure was **not** the chat UI. It was a **lossy transcript filename**
that made several conversations on the same long project path resolve to one
file. The last writer won, so a real conversation was replaced by an empty
“new chat” file.

Measured on the user profile before the fix:

- the registry had **15 threads** but the chats folder had only **10 files**;
- `skin-retouch-20261118.pcraft` had **five registered threads** (primary, #2,
  #3, #4, #5) but only **one 233-byte file**, containing thread `#5` and
  **0 items**;
- the primary chat (`that not look like origima; faces`) and its #2–#4 siblings
  still existed in **OpenCode**, but their panel transcripts were gone.

Fix shipped in **0.3.20**:

1. collision-free hashed transcript filenames + migration;
2. OpenCode-session recovery for missing panel transcripts;
3. active-thread repair so an empty “new chat” cannot hide real history;
4. session-list filtering for empty threads;
5. send-time document sync to close the 2.5 s watcher gap;
6. watcher state advances only after the chat actually adopts the document.

After the fix: **10 old files migrated**, **5 + 2 transcripts recovered**, the
real skin-retouch conversation is back (2 items, 16 tool chips), and the list
shows **7 real conversations** instead of 15 mixed/dead rows.

---

## 2. Root causes

### 2.1 Filename truncation collision (primary, data loss)

Old code:

```js
`${String(key).replace(/[^a-z0-9]+/gi, '_').slice(0, 80)}.json`
```

Long Windows project paths exceed 80 characters before the `#2`/`#3` suffix, so
the primary, #2, #3, #4 and #5 all produced the same filename. `writeJson`
atomically replaced the previous thread’s transcript. The UI showed several
chats, but opening them loaded the same last-written file.

This is a data-loss bug, not a display bug.

### 2.2 Empty “new chat” remembered as the document’s active thread

`newThread()` correctly preserves siblings, but `threadFor()` returned the
remembered thread even when it had **no OpenCode session and no transcript**.
Opening the document resumed the empty chat and hid the real conversation.

### 2.3 Stale document binding at send time

The document watcher polls every 2.5 s. A message sent in that window used the
old `docKey`, so a real conversation could be appended under the previously
active canvas. The watcher then adopted the new document, but the message was
already filed under the wrong one.

### 2.4 Watcher advanced its state before adoption

`syncDocument()` set `lastDocKey`/`lastDocTab` before `chat.useDocument()`
returned. If adoption failed (busy/race), later polls saw “already synced” and
never retried.

### 2.5 Dead/empty rows in the chat list

The list included every registry thread, including empty “new chat” threads and
threads whose OpenCode session no longer existed. They appeared as `○` dead
rows and made the list look broken.

---

## 3. Research

- **OpenCode CLI sessions** are project-scoped and support:
  - `opencode session list --max-count N --format json`
  - `opencode session export <id>`
  - `opencode session import <file>`
  Source: OpenCode CLI command docs.
  The export contains `messages[]` with `user`, `assistant`, tool parts and
  timings, which is enough to rebuild a panel transcript.
- **Stable identifiers:** never derive uniqueness from a truncated
  human-readable string. Use a readable slug plus a hash of the full id.
  This is the same principle as content-addressed storage and Git object names.
- **Atomic writes:** already used by `writeJson`; the bug was the key, not the
  write.
- **Document polling:** PhotoCraft emits no active-document event, so a poll is
  required. The correct pattern is: read state → detect change → adopt → then
  update the last-seen state, with a hold window around explicit chat switches.
- **Recovery over deletion:** an OpenCode session outlives a panel transcript;
  export is the safe repair source. The product should never silently discard a
  conversation it can still reconstruct.

---

## 4. Implementation

### 4.1 Hashed transcript names

New `service/history-names.mjs`:

```js
slug = id.replace(/[^a-z0-9]+/gi, '_').slice(0, 48)
hash = sha256(id).slice(0, 16)
file = `${slug}-${hash}.json`
```

`migrateHistoryNames()` runs at startup, reads each old file’s own
`threadId`/`docKey`, writes the hashed target, merges if the target already
exists, and removes the old file. The pre-Phase-2 `default.json` maps to the
`no-document` thread.

### 4.2 OpenCode transcript recovery

`sessions.exportSession(id)` shells `opencode session export` from `AGENT_DIR`.
`chat.recoverMissingHistories()` runs in the background after startup for
registry threads with an OpenCode session and a missing/empty panel file.

`sessionToItems()` merges **all assistant messages between two user messages
into one panel turn**, so a tool-call chain becomes one answer with tool chips,
not sixteen empty bubbles. Recovered files are marked `recoveredVersion: 2`.

The repair pass also detects old recovery output (consecutive empty-text agent
items) and re-exports it once.

### 4.3 Active-thread repair

- `sessions.threadFor(docKey)` prefers the remembered thread only if it has an
  OpenCode session; otherwise it picks the newest thread that does.
- `sessions.repairCurrent()` runs before the current thread is loaded: an
  abandoned empty “new chat” is replaced by a conversation with a session.
- `sessions.list()` hides threads with no session unless they are current, so
  accidental “New chat” clicks do not fill the list.

### 4.4 Send-time document sync

Both `chat:send` IPC and `POST /api/chat` now read PhotoCraft’s active document
before appending the user message. If the active document differs from
`chat.documentKey()`, the chat adopts that document first. This closes the
polling window that filed a message under the previous canvas.

### 4.4a “Chat clears after the agent finishes”

Found in 0.3.23: an agent turn can **save a new project** (for example
`egglab-poster`) and leave PhotoCraft on it. The watcher then opened the new
project's empty thread because the post-run migration only handled
`no-document`/`untitled:` threads. The conversation stayed on the old document,
but the UI showed the new empty thread.

Fix: after a recent run, a `.pcraft` written during that run (mtime ≥ run start)
or a new untitled draft now carries the thread across. Also added
`POST /api/sessions/move` and `chat.moveThread()` so a legacy mismatch can be
repaired without deleting history. The existing `make poster design for egglab`
chat was moved from `taunggyi-team` to `egglab-poster` with its four items
intact.

### 4.4b “Deleted chats come back when the app reopens”

Found in 0.3.24. Deleting a chat was **not durable until after a slow OpenCode
call**:

1. `deleteThread()` awaited `opencode session delete` first.
2. Only then did it unbind the registry and unlink the transcript.

A quit/crash/wedged CLI in that window left all three parts intact. The startup
heal then re-registered any content-bearing transcript, so the “deleted” chat
reappeared. The same result followed a late transcript write or a Windows unlink
that failed (the error was swallowed).

Fix in 0.3.25:

- `sessions.markDeleted()` writes a tombstone (`deleted-threads.json`) **before**
  any cleanup.
- The binding is removed synchronously (`forgetThread`) and the transcript is
  unlinked; the OpenCode session cleanup runs afterwards with a 20 s timeout and
  cannot undo the deletion.
- Startup heal, OpenCode recovery, filename migration and the orphan sweep all
  honour the tombstone. A leftover file is moved to `chats/_trash`, never
  re-registered.
- `purgeDeletedThreads()` drops a binding that survived a crash, and the chat
  module refuses to restore a tombstoned current thread.
- A tombstone is cleared only by an explicit new message (`bind`) or a new chat
  on the same primary id, so the document remains usable.

### 4.4c “Main model downloads, setup still says model not found”

Found in 0.3.25. A packaged install has **no `config.json`**: the NSIS installer
only downloads the engine and `install.ps1` is a dev script. `engineConfig()`
fell back to in-memory defaults, and `setEngineModel()` returned `null` when the
file did not exist. Downloading the main Qwen checkpoint therefore finished, but
the engine config was never updated: `modelStatus()` kept checking the old
default file and setup kept reporting it missing. Manual variant switching had
the same silent no-op.

Fix: `ensureEngineConfig()` creates (and repairs) `%APPDATA%\EggLab\config.json`
on first read, `setEngineModel()` always persists and reports a write failure,
and `config.json` is the single models-folder authority (mirrored into
`settings.modelsDir`). `/api/setup` and `/api/status` now expose the config path.
A regression test (`tools/model-config-test.mjs`) proves a fresh profile, a
newly selected model and a repaired config all resolve to the same path.

### 4.4d “Agent leaves the working document and creates a new one”

Found in 0.3.25. During a group-portrait turn the agent created **seven** new
PhotoCraft documents with `egl_photocraft_new_document` (one per QA zoom pass,
then `final-fix` for the final placement). At 14:59 the watcher logged
`thread migrated -> untitled:final-fix:1088x1408`. `migrateThread` moved the
document's primary thread to the new canvas and retargeted every sibling, so
`untitled:final-fix` ended up with two chats and the original working document
lost both.

Root causes:

1. The global MCP instructions said “Assemble bottom-up in PhotoCraft (new
   document, place, …)”, and `photocraft-production` said “For new jobs create a
   new document”. `AGENT.md` also recommended “scratch documents for proof
   experiments”. The agent followed those instructions literally.
2. `egl_photocraft_new_document` had no ownership guard; it always created and
   activated a new document.
3. The 0.3.23 post-run migration treated any document created during a run as
   the chat's new home, even when the chat already owned a working document.

Fix in 0.3.26:

- `egl_photocraft_new_document` is refused (HTTP 409) when the chat owns a
  document. Only a chat with no document may create its first canvas. The same
  rule covers `doc_new`/`document.new` through the generic command bridge.
- Instructions now say the chat's document is the canvas: assemble there, never
  create a second document to escape its size or for a QA proof. Scratch-document
  advice was removed.
- The watcher no longer migrates an attached chat to a canvas created during a
  run. If the agent left its document, the watcher re-activates the working
  document and keeps the thread where it is; only a chat that started with no
  document may adopt a new canvas.
- Repaired the incident data from the 14:34 pre-run snapshot: both Untitled-1
  threads are back on `untitled:Untitled-1:1500x2100`, current thread `#2` with
  11 items, one chat per document. The seven canvases the agent created remain
  as documents, but none owns a conversation.

### 4.5 Watcher and switch races

- `syncDocument()` updates `lastDocKey`/`lastDocTab` **after** `useDocument()`
  succeeds.
- `sessions:switch` extends the watcher hold after `showDocumentForKey()`
  completes, so a slow project open cannot be pulled back by the next poll.
- The switch response includes `documentOpened` for the renderer.

---

## 5. Verification

| Check | Result |
|---|---|
| Old transcript files migrated | **10** |
| Transcripts recovered from OpenCode | **5**, then **2** repaired |
| Real skin-retouch chat | **2 items**, 16 tool chips, 2,276-char answer |
| Session list | **9 real conversations** current (was 15 mixed rows after the first cleanup) |
| Empty/test threads removed | eval + skin test threads deleted |
| New thread on a doc with history | created `<doc>#2` |
| Active-document send binding | chat created under `egglab-logo-directions`, not the previous doc |
| Static agent/MCP/setup gate | all pass |
| Filename collision unit test | 9 ids, 9 unique names, max 70 chars |
| 0.3.25 delete + late write + restart | chat stays deleted; leftover transcript moved to `chats/_trash` |
| 0.3.25 missing `config.json` | file recreated; main Q4_K_M selected; setup `ready: true` |
| 0.3.25 render after config recreation | 832×1024 turbo done in 25.7 s |
| 0.3.26 agent new-document while attached | rejected 409 (tool + `document.new`) |
| 0.3.26 agent leaves the canvas mid-turn | watcher restored `Untitled-1`, chat stayed on its thread |
| 0.3.26 repaired incident data | 9 chats; current `#2` with 11 items; one chat per document |
| 0.3.26 release pipeline | GitHub Actions built and uploaded `EggLab-Setup-0.3.26.exe`; release `latest` points to v0.3.26 |

Backups made before migration:
`%APPDATA%\EggLab\_backup-session-fix-20261118-180805\`.

### 5.1 Release pipeline

The first `v0.3.26` tag run failed the agent gate because `.gitignore`'s
`engine/` rule also matched `panel/references/engine/`. The reference file was
present locally but never committed. Changed the rule to `/engine/`, committed
the Qwen legacy-facts reference, and moved the tag to the fixed commit.

The second run built the installer but skipped publishing: electron-builder
defaults to a **draft** release, and the existing `v0.3.26` release was already
published. The workflow now builds with `--publish never` and uploads the
installer, `latest.yml` and `SHA256SUMS.txt` with
`gh release upload --clobber`, then marks the release latest. Verified: the
published `v0.3.26` has all three assets, and `/releases/latest` resolves to it.

### 5.2 Incident during the repair (must be recorded)

While validating the recovery path, I restored the **pre-fix** session backup
after some recovered transcripts had already been written. OpenCode had already
purged the old real sessions, so the restore overwrote the recovered copies.
The skin-retouch primary conversation was reconstructed from the transcript
that had been displayed during verification (2 items, 2,278 characters). The
Burmese studio primary transcript could not be reconstructed; its PhotoCraft
project and generated images remain, but that chat history is gone.

This was a test/repair mistake, not a product-code deletion. The new
`backupSessionData()` keeps three pre-prune snapshots so a future repair cannot
repeat it. Current list: **9 real conversations** (downloads, hh-beauty,
gp-taunggyi, eval-mask primary, eval-mask #2, reconstructed skin-retouch, the
moved poster chat, plus the two untitled studio conversations). The logo and the
earlier Taunggyi conversation are preserved under `eval-mask.pcraft`; the move
API can retarget them without deleting history.

---

### 5.3 First-launch audit (0.3.27)

Run with a separate `%APPDATA%`/`%LOCALAPPDATA%` so the live profile was not
touched:

- Wizard state: `firstRun: true`, `done: false`, `ready: false`.
- `config.json` created at the fresh profile root with the fresh models folder,
  the fresh engine path and the default diffusion file.
- Engine, PhotoCraft and OpenCode correctly reported missing; the four required
  model entries were missing and turbo was optional.
- Fresh settings default to `opencode-go/deepseek-v4.1-flash` (vision-capable),
  not a private/custom provider; the model ships with OpenCode v2.
- `get-pc` opens `https://getartcraft.com/`; the setup page and README now link
  the free PhotoCraft download.
- Download targets verified with HTTP 200: OpenCode v2.3.0 zip, the pinned
  stable-diffusion.cpp `master-1091-b9d7176` Windows assets, and all seven
  Hugging Face model files (sizes match the registry).
- Installing 0.3.27 over the live profile preserved its settings and chats.

The live profile has moved on since the 9-conversation repair; at audit time it
held 5 visible chats (the newest `the_thimble…` conversation with 7 items) and
still had the repaired backups under `_session-backups`.

---

## 6. Remaining work

1. **Move/rename a chat or document.** The backend can migrate identities, but
   there is no user action yet for “move this chat to the current document”.
   This is the clean way to fix a legacy mismatch without deleting history.
2. **Dead-session cleanup UI.** Threads whose OpenCode session is gone are still
   shown when they have history; expose “delete dead session” explicitly.
3. **Document rename.** `eval-mask.pcraft` contains real user work because a
   test document was left active. It should be renameable without changing the
   chat identity.
4. **Actual auto-update path** — 0.3.18 → 0.3.20 is still not exercised; the
   update check itself is current.

---

## 7. Sources

- OpenCode CLI docs: `session list`, `session export`, `session import`.
- Local evidence: `%APPDATA%\EggLab\sessions.json`, `chats/`,
  `logs/agent.log`, `logs/main.log`.
- OpenCode export schema observed from `opencode session export`.
- Stable-identifier/hash practice; existing atomic `writeJson` implementation.
