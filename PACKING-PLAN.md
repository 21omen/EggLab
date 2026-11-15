# EggLab — Packaging & Distribution Plan (v2)

> Goal: EggLab is **open source and free** (MIT). Windows only. **One-click `.exe` install** that needs
> nothing else installed — it detects PhotoCraft + OpenCode CLI and asks to install/locate them if missing.
> **The engine (sd-cli + CUDA/Vulkan DLLs) downloads DURING installation — never packed.** Models download
> from inside the app **or** manually. No ComfyUI involvement anywhere. Easy to install.

Decisions locked: **MIT license** · **engine downloaded at install time, not bundled** · **auto-update deferred to Phase 4**.

---

## 1. What we are packaging (inventory)

| Piece | Size | Packaged how |
|---|---|---|
| `panel\` (Electron app, pure ESM JS, **no native node modules**) | ~30 MB code | Inside `app.asar` |
| Electron runtime | ~230 MB (≈110–130 MB compressed in NSIS) | Bundled by electron-builder |
| `egglab.ps1` (runner spawned via `powershell.exe -File`) | 10 KB | `extraResources` (spawn needs a real path, cannot be inside ASAR) |
| **Engine: sd-cli.exe + backend DLLs** | CUDA ≈ 887 MB · **Vulkan ≈ 29 MB** · CPU ≈ 17 MB | **NOT in the installer — downloaded during installation** (§3) |
| Models (diffusion 6.63 + VAE 0.63 + LLM 6.26 + mmproj 1.08 = **14.6 GB**, turbo LoRA +0.85 optional) | 15.5 GB | **Never bundled** — in-app resumable download or manual placement (§4) |
| PhotoCraft | external | Detect + launch only, never bundled (redistribution rights unknown) |
| OpenCode CLI | ~50 MB | Detect existing → if missing, in-app download of the official standalone zip |
| Node / Python / ComfyUI / CUDA toolkit | — | **Not required at all** (Electron ships Node; engine is a prebuilt exe; PowerShell ships with Windows; CUDA runtime DLLs come with the engine zip) |

**Installer size: ~120 MB** (`EggLab-Setup-<ver>.exe`) — small enough that the install-time engine download
is the only long step, and for Vulkan users that step is 29 MB.

---

## 2. Research findings (round 2, with sources)

### 2.1 Downloading files DURING an NSIS install
- The standard tool is the **Inetc plugin** (successor of InetLoad/NSISdl): HTTPS support, an **embedded progress
  bar on the installer's progress page**, `/RESUME "Retry?"` auto-resume on dropped connections, cancel handling,
  multi-URL pairs. Run it inside the install section → real progress where the user already looks.
  — https://nsis.sourceforge.io/Inetc_plug-in , examples: https://github.com/DigitalMediaServer/NSIS-INetC-plugin
- Builtin `NSISdl` is **HTTP-only** and known to trigger AV false positives ("generic downloader trojan") — avoid it.
  — https://nsis.sourceforge.io/Builtin_NSISdl_plug-in
- Async plugins (InetBgDL) exist but integrate poorly; the community answer for "progress inside the install page"
  is Inetc (synchronous, in the Section). — https://stackoverflow.com/questions/53589622
- **Plugin delivery with electron-builder:** supply Inetc's DLL through electron-builder's custom NSIS resources /
  `buildResources` plugin dir; if that fights the toolchain, guaranteed fallback = Windows 10+'s built-in
  **`curl.exe -L -C - -o …`** invoked via `nsExec::ExecToLog` (resume-capable, zero bytes added, output visible in
  the installer's details pane). Phase 1 gate picks one and proves it.
- Extraction without bundling anything: Windows 10+ ships **`tar.exe` (bsdtar, extracts zip)** and PowerShell
  `Expand-Archive`; checksum via `Get-FileHash`. All present on any target machine — the installer adds no bytes.

### 2.2 Engine variants — real release data (leejet/stable-diffusion.cpp, `master-1091-b9d7176`, 12 Nov 2026)
Each asset ships with a **published SHA-256** on the release page (perfect for install-time verification):

| Asset | Size | For |
|---|---|---|
| `sd-master-<sha>-bin-win-cuda12-x64.zip` + `cudart-sd-bin-win-cu12-x64.zip` | 350 + 537 MB ≈ **887 MB** | NVIDIA — max throughput (what EggLab runs today) |
| `sd-master-<sha>-bin-win-vulkan-x64.zip` | **28.6 MB** | **Any GPU** (NVIDIA/AMD/Intel) — universal |
| `sd-master-<sha>-bin-win-cpu-x64.zip` | 17.4 MB | No GPU / fallback |
| `sd-master-<sha>-bin-win-rocm-10.1.0-x64.zip` | 254 MB | AMD (skip in v1 — Vulkan covers AMD) |
| `cudart-sd-bin-win-cu12-x64.zip` (standalone) | 537 MB | CUDA runtime (part of the CUDA path) |
— https://github.com/leejet/stable-diffusion.cpp/releases
- Precedent for **auto-provisioning sd-cli at install/run time instead of bundling**: studio-worker downloads the
  Vulkan build (~37 MB) on first job, verifies `sd-cli --version` against a pinned tag, and states the reason —
  bundling would ship 30+ MB in every artifact or fragment the GPU matrix. We adopt the same pattern at install time.
  — https://github.com/webbertakken/studio-worker
- Vulkan-on-NVIDIA is a verified real path (5–9 s/1024px/8-steps on an RTX 4090 in their tests); no backend flags
  are needed — sd-cli uses the backend its binary was compiled with. Local check: `egglab.ps1` only ever passes
  `--backend cpu` (for `-Cpu`) or `--offload-to-cpu`, never `--cuda/--vulkan` — so **variant zips are drop-in**.

### 2.3 What carries over from round 1 (unchanged conclusions)
- **electron-builder v26, NSIS `oneClick`, per-user** (no admin) — the consumer default; Forge has no edge for us.
  — https://www.electron.build/v26/docs/nsis/
- **`extraResources`, never ASAR, for anything spawned** (`spawn` cannot execute inside ASAR).
  — https://www.electronjs.org/docs/latest/tutorial/asar-archives
- **SmartScreen reality**: unsigned → "More info → Run anyway" (~15–25% drop-off, halved by documenting it on the
  download page); EV no longer bypasses (2024 change); free **SignPath OSS** signing once trust signals exist;
  electron-updater updates bypass SmartScreen after first install (Phase 4).
  — https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation ,
  https://zenn.dev/harness/articles/electron-smartscreen-oss-distribution , https://crawlix.app/blog/electron-unsigned-app-2026
- **Model manager patterns**: first-run gate, HTTP `Range` resume → `.part` → verify → atomic rename,
  progress/cancel UI, manual drag-drop as equal citizen.
  — https://github.com/lacerbi/genai-electron , https://github.com/fzlzjerry/ohmyhf
- **CLI detection on Windows**: `where.exe` (never `which`), prefer `.exe/.cmd` matches, `shell:true` for `.cmd`
  shims (Node CVE-2024-27980), plus a common-paths table (`%APPDATA%\npm`, `%USERPROFILE%\.opencode\bin`, scoop/choco).
  — https://github.com/diegosouzapw/OmniRoute/issues/7279 , https://skillmd.ai/skills/electron-cli-integration
- **OpenCode routes (Nov 2026)**: V2 = standalone `opencode-windows-x64.zip` (no PATH editing needed if we point
  `settings.opencode.exe` at it); V1 = npm/choco/scoop. Detect either; install V2 zip ourselves if missing.
  — https://vibeide.dev/blog/opencode-windows/ , https://github.com/anomalyco/opencode

---

## 3. Install-time engine download (the core of this plan)

NSIS installer flow (`oneClick`, per-user, ~120 MB payload):

```
1. Copy app files (EggLab.exe, resources\…)           ← fast, local
2. Query GPU:  powershell "(Get-CimInstance Win32_VideoController).Name"
     NVIDIA  → cuda12 zip + cudart zip   (887 MB)     ← what we test today, max speed
     AMD/Intel/no discrete             → vulkan zip   (29 MB, any GPU)
     (tiny machines / user opt-out)     → cpu zip      (17 MB)
3. inetc::get  <pinned GitHub release URL>  →  %LOCALAPPDATA%\EggLab\engine\*.zip
     embedded progress bar · /RESUME on network drop · cancel allowed
4. Verify SHA-256 against the value published on the release page (Get-FileHash)
5. Extract in place (tar.exe -xf / Expand-Archive) → delete zips
6. Sanity check: sd-cli.exe exists; write engine-info.json {release, backend, sha}
```

- **Pinned release** (like `install.ps1` does today: `master-1028-37bc88b`) + pinned SHA-256s in a catalog —
  never "latest", so builds are reproducible and hashes verifiable.
- **If the download fails or the user cancels:** install still completes (app first, engine is an enhancement).
  The **first-run wizard detects the missing/invalid engine and re-runs the same downloader** with resume —
  no dead ends, no broken installs.
- Engine lives at **`%LOCALAPPDATA%\EggLab\engine`** (data dir, not `resources\`): user-writable without admin,
  and survives app updates, which replace `resources\`.
- `egglab.ps1` gains an optional `-Config <path>` parameter (reads `%APPDATA%\EggLab\config.json` when packaged;
  falls back to beside-the-script in dev). No other engine-script changes needed — no backend flags exist today.
- Settings page later: switch variant (CUDA ↔ Vulkan), re-download, verify.

## 4. Model manager (in-app download **or** manual — nothing else)

New `service/modelman.mjs` + wizard page:

- **Catalog** checked into the repo: per file — display name, HF repo+path (`huggingface.co/<repo>/resolve/main/<file>`),
  size, `required|optional`, SHA-256 (from HF LFS metadata when available), and the manual-download URL
  (same links `install.ps1` prints today).
- **In-app download:** HTTPS with `Range` resume → `*.part` → verify size/hash → **atomic rename** (same
  atomic-write discipline as `writeJson`). Progress/speed/ETA over IPC; cancel; resume across restarts;
  never re-download a verified file.
- **Manual mode (equal citizen):** [Open models folder] + drag-drop → validate filename/size/hash against the
  catalog → mark present. Plus scan a **user-chosen** folder (they point at one; we do not guess locations).
- Defaults: models dir = `%LOCALAPPDATA%\EggLab\models`, wizard lets the user pick any drive (14.6 GB is a lot
  for C:).
- **Nothing ComfyUI-related anywhere** — no scanning, no path assumptions, no reuse logic.

## 5. First-run setup wizard (dependency handling)

Blocks the main window until done (resume-on-relaunch if dismissed):

1. **Welcome + engine status** — valid engine from install → ✓; missing → in-app downloader (§3, resume).
2. **GPU/hardware check** — `nvidia-smi` / Win32_VideoController; honest "no GPU → CPU build, slow" state.
3. **PhotoCraft** — probe running process / control port / configured path / common locations.
   Found ✓ · Not found → [Locate PhotoCraft.exe…] [Download page] [Skip — direct generation still works].
4. **OpenCode CLI** — `where.exe opencode` + `.cmd`/`.exe` shim preference + common-paths table.
   Found (V1 or V2) ✓ · Not found → **[Install for me]** (official standalone V2 zip → `%LOCALAPPDATA%\EggLab\bin\`,
   no PATH edit, no admin, no Node) / [I'll install it myself] / [Skip — chat disabled, generation works].
5. **Models** — the download gate (§4). Skippable, generation stays disabled until present.
6. **Provider/API key** — verify `opencode auth` state; button opens a terminal running `opencode auth login`
   (headless opencode cannot answer interactive prompts).

## 6. Distribution & repo

- **GitHub public repo** `EggLab`, **MIT** (decided).
- **GitHub Releases**: `EggLab-Setup-<ver>.exe` (~120 MB) + `SHA256SUMS.txt`. (Optional later: portable zip.)
- **CI** (Phase 3): GitHub Actions `windows-latest` → `electron-builder --win nsis` → attach on tag; the NSIS
  install-time download needs no CI changes (it runs on the user's machine).
- **README install section**: unsigned-build disclosure + SmartScreen **More info → Run anyway** steps + SHA-256 +
  source/release-workflow link (the honest-disclosure pattern; halts ~50% of would-be bounces).
- **Auto-update (Phase 4, decided):** `electron-updater`, GitHub provider — updates skip SmartScreen entirely.

## 7. Repo hygiene before going public (blockers)

1. `.gitignore`: `node_modules\`, `engine\` (binaries + zips), `Models\`, `electron-data\`, `chats\`, `logs\`,
   `tmp\`, `out\`, `control.json` (token!), `sessions.json`, `settings.json`, `_backup-*`, `tools\_ui-*`,
   `projects\`, `dist\`.
2. Strip hardcoded user identity: `settings.mjs` `opencode.exe`, `chat.mjs` fallback path
   (`C:\Users\Ko Du Won\...`), absolute `D:\neww\...` defaults → become first-run-generated config.
3. `LICENSE` (MIT), README rewrite (§6 install section), `AGENT.md`/`opencode.json` → template copies.
4. Repo starts new → history begins clean of secrets.

## 8. Phases (each with a verification gate)

**Phase 0 — Repo hygiene & path refactor** ✅ DONE (2026-11-15)
- `.gitignore`, LICENSE (MIT), strip user paths, `paths.mjs` dual-mode (dev vs packaged), 
  writable data → `%APPDATA%\EggLab`, `egglab.ps1` `-Config` param.
- ✔ Gate passed: dev-mode path resolution byte-identical (39 assertions, incl. env-derived
  defaults reproducing the exact old values); packaged branch smoke-tested by loading the
  modules from an `app.asar` path (all `%APPDATA%`/`%LOCALAPPDATA%` routes correct);
  `node --check` + PowerShell parser clean; panel restart clean; `_ui-check` green;
  `history-switch-test` PASS; `migrate-test` PASS (real agent turn); end-to-end turbo
  engine job DONE through the new `egglab.ps1 -Config` invocation.
- One observed artifact: the first save of a transcript written by pre-thread-redesign code
  normalizes its `threadId`/`docKey` header once (items untouched); byte-stable afterwards.

**Phase 1 — Build pipeline + install-time engine download** ✅ DONE (2026-11-15)
- electron-builder v26: NSIS `oneClick` + per-user, `artifactName` `EggLab-Setup-0.1.0.exe`
  (**76.6 MB** — engine and models are never packed), `extraResources` = `egglab.ps1`,
  `engine-install.ps1`, and the knowledge package (`knowledge/`: AGENT.md, ROUTER.md,
  manifest.yaml, mcp-server.mjs, skills/, references/, templates/, evals/, config/).
- `panel/build/installer.nsh` (auto-picked as the NSIS include):
  - `preInit`: hard Windows 10+ check (registry, not WinVer's manifest-dependent
    GetVersionEx) + best-effort ~1.5 GB free-space probe; both abort before any file
    is written, and are skipped in the uninstaller compile.
  - `customInstall`: downloads the pinned stable-diffusion.cpp release via
    `engine-install.ps1` (GPU-variant auto-detect, SHA-256 verified, curl-resumable,
    cuda→vulkan→cpu degradation ladder); failures are reported and never abort the
    install. Silent installs (`/S`) download too (`/SD IDOK`).
  - `customUnInstall`: removes engine + bin cache; prompts (default NO, and the `/SD`
    answer) before deleting models; `%APPDATA%\EggLab` data is kept.
- Packaged-mode fixes folded in: `KNOWLEDGE_DIR` is the single source of truth for
  prompts/manifest/runtime config; MCP spawns `[EggLab.exe, resources\knowledge\mcp-server.mjs]`
  with `ELECTRON_RUN_AS_NODE=1`; `readJson` strips a UTF-8 BOM (PowerShell-written configs).
- ✔ Gate passed: `npm run dist` error-free (only icon/signing warnings).
  Silent install on this machine → `%LOCALAPPDATA%\Programs\egglab`, engine at
  `%LOCALAPPDATA%\EggLab\engine\sd` with `engine-info.json`; **auto variant downloaded
  the CUDA set (1.4 GB, 276 s)**; installed app started, `engine ready: true`, and a real
  turbo job rendered end-to-end (`%APPDATA%\EggLab\out\*.png`). Vulkan variant gate also
  passed (28.6 MB, job DONE in 99 s). Uninstaller: program dir + engine removed,
  `%APPDATA%\EggLab` and models kept, shortcuts removed, exit 0.
  Packaged chat turn (opencode → packaged MCP → `egglab_status`) passed earlier in the
  Phase 1 gate (with `opencode/mimo-v2.6-flash-free` while the InferX provider was down).

**Phase 2 — First-run wizard + dependency detection + model manager** (§4, §5)
- ✔ Gate A: machine without OpenCode → [Install for me] → chat works.
- ✔ Gate B: model download killed mid-transfer → resumes to verified completion; manual drag-drop validates.
- ✔ Gate C: engine download cancelled in installer → wizard detects and completes it.

**Phase 3 — Public release**
- Push repo, tag `v0.1.0`, CI builds, Release page with SHA256SUMS, README with SmartScreen instructions.
- ✔ Gate: a stranger installs from the Release following only the README.

**Phase 4 — Polish**
- electron-updater auto-update (decided: deferred here); SignPath OSS application; optional portable zip.

## 9. Risks / open questions

| Risk | Mitigation |
|---|---|
| 887 MB CUDA download at install for NVIDIA users | Progress bar + resume; Vulkan (29 MB) offered as the small/fast alternative; engine switchable in settings later |
| Install-time download fails (offline/flaky) | Install completes anyway; wizard re-runs the same resumable downloader |
| SmartScreen warning on v1 | README disclosure + SHA-256 + SignPath later; updates bypass it |
| Inetc plugin vs electron-builder friction | curl.exe fallback proven in the Phase 1 gate (both researched above) |
| Vulkan build untested locally with Qwen-Image-2.1 | Phase 1 gate ran a Vulkan-build job end-to-end (DONE, 99 s at 512²turbo) |
| PhotoCraft / model redistribution rights | Never bundled — detect/link/user-download only |
| NVIDIA CUDA redistribution | Redistributable runtime components may ship with apps (we're not shipping them — they arrive in the official engine zip the user downloads) |
| Paths breaking when packaged | Phase 0 dual-mode `paths.mjs` + gate tests before any build work |
