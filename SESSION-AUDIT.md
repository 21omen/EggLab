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
| Session list | **7 real conversations** (was 15 mixed rows) |
| Empty/test threads removed | eval + skin test threads deleted |
| New thread on a doc with history | created `<doc>#2` |
| Active-document send binding | chat created under `egglab-logo-directions`, not the previous doc |
| Static agent/MCP/setup gate | all pass |
| Filename collision unit test | 9 ids, 9 unique names, max 70 chars |

Backups made before migration:
`%APPDATA%\EggLab\_backup-session-fix-20261118-180805\`.

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
