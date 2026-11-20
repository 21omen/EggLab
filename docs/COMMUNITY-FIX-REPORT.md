# EggLab Community Fix Report â€” revised

**Status:** implemented on master; no version bump or release.
**Scope:** the two confirmed community requests only:

1. In Setup (or later in Settings), choose an **existing model folder**, or
   download the models into a folder.
2. In Setup (or later in Settings), choose an **existing `opencode.exe`**, or
   download the OpenCode CLI. EggLab must read the **activated providers and
   models** from that exact binary.

**Explicitly out of scope:**

- identifying what a model file is;
- validating Qwen vs SDXL/Flux/anything;
- other apps' specific paths, presets or layout files;
- scanning or classifying folders;
- copying multi-GB files.

If the user points at files that work with Qwen-Image-2.1, they work. If they
donâ€™t, the engine reports the failure. EggLab does not need to decide.

---

# 1. Existing model folder

## 1.1 Current behavior

- `config.json` has one `models` folder and the expected file names:
  `diffusion`, `vae`, `llm`, `llmVision`, `turbo.lora`.
- Setup downloads into `%LOCALAPPDATA%\EggLab\models`.
- â€œAdd from fileâ€ only accepts curated names and **copies** the file there.
- There is no â€œuse this folderâ€ action in Setup or Settings.
- Changing `settings.modelsDir` does not change an existing `config.json`â€™s
  `models` value, so users cannot redirect it from the UI.

## 1.2 What users need

A single, obvious choice:

> **Models folder:** `D:\AI\Models`  [Change] [Open]  
> Found: diffusion, VAE, text encoder, mmproj, turbo LoRA  
> Missing: â€”  
> [Download missing]

or:

> **Models folder:** `C:\Users\me\AppData\Local\EggLab\models`  
> Missing: diffusion, VAE, text encoder, mmproj  
> [Download missing]

No scanning, no â€œwhat model is thisâ€, no copy.

## 1.3 Design

### Setup and Settings

Add a **Models folder** row to both:

- **Use existing folderâ€¦** â†’ native folder picker â†’ write the chosen path to
  `config.json` (`models`) and mirror it to `settings.modelsDir`.
- **Download missing** â†’ download the expected files into the current folder.
- **Open folder** â†’ Explorer.
- **Choose files (advanced)** â†’ five file pickers (diffusion, VAE, text
  encoder, vision projector, turbo LoRA). Each stores an absolute path in
  `config.json`. This is for users whose files have different names or live in
  different folders. No validation; just existence.

### Folder layout

The managed default folder is created with one subfolder per role:

```text
%LOCALAPPDATA%\EggLab\models\
  diffusion\
  vae\
  text_encoder\
  vision\
  lora\
```

Downloads go into the matching subfolder. A user-selected existing folder is
left as-is: the dropdown lists the role subfolder and the root, so a flat
folder keeps working. Files inside the root are stored relatively
(`diffusion/file.gguf`); files on another drive stay absolute.

### File names

The default config already names the files EggLab expects. The folder picker
checks only whether those names exist:

| Role | Default file |
|---|---|
| Diffusion | `qwen-image-2.1-UC-fp8.safetensors` (or the selected variant) |
| VAE | `qwen_image_2.1_vae_bf16.safetensors` |
| Text encoder | `Qwen3VL-8B-Uncensored-HauhauCS-Balanced-Q6_K.gguf` |
| Vision projector | `Qwen3VL-8B-Uncensored-HauhauCS-Balanced-mmproj-f16.gguf` |
| Turbo LoRA | `qwen_image_2.1_turbo_lora_avg_rank_178_bf16.safetensors` |

If a file is missing, show â€œMissingâ€; do not classify or reject the folder. The
user can download it, pick another folder, or use **Choose files**.

### Downloads

- Download into the currently selected models folder.
- If that folder is read-only or on a disconnected drive, show the real error
  and offer â€œChoose another folderâ€.
- Do not overwrite an existing file unless the user explicitly chooses
  â€œRe-downloadâ€.
- Downloads still use the existing resumable `.part` logic.

### Config

Keep backward compatibility:

```jsonc
{
  "models": "D:\\AI\\Models",
  "diffusion": "qwen-image-2.1-Q4_K_M.gguf",
  "vae": "qwen_image_2.1_vae_bf16.safetensors",
  "llm": "Qwen3VL-8B-Uncensored-HauhauCS-Balanced-Q6_K.gguf",
  "llmVision": "Qwen3VL-8B-Uncensored-HauhauCS-Balanced-mmproj-f16.gguf",
  "turbo": {
    "lora": "qwen_image_2.1_turbo_lora_avg_rank_178_bf16.safetensors"
  }
}
```

If the user picks a file outside the folder, store an absolute path:

```jsonc
"diffusion": "E:\\Other\\qwen-image-2.1-Q4_K_M.gguf"
```

`egglab.ps1` must handle that:

```powershell
function Resolve-Model([string]$folder, [string]$name) {
  $p = if ([IO.Path]::IsPathRooted($name)) { $name } else { Join-Path $folder $name }
  if (-not (Test-Path $p)) { throw "Model not found: $p" }
  return (Resolve-Path $p).Path
}
```

This tiny change is required for advanced per-file paths. It is low risk.

### Engine/panel changes

- `settings.mjs`: add `modelsFolder()` / `setModelsFolder()`, use absolute-path
  resolution in `engineConfig`/`setEngineModel`.
- `models.mjs`: `modelStatus`, `useVariant`, `downloadOne` resolve the role
  path; downloads go to `cfg.models`.
- `engine.mjs`: readiness checks use the same resolver.
- `setup.mjs`: setup status shows the folder and per-role found/missing.
- `main.mjs`/`http.mjs`/`preload.cjs`: folder picker + set folder IPC/API.
- `renderer/app.js`: Setup and Settings rows.
- `egglab.ps1`: absolute `Resolve-Model`; turbo `--lora-model-dir` uses the
  LoRAâ€™s parent folder if it is outside `models`.

### Edge cases

- Any drive letter, UNC path, spaces, non-ASCII, OneDrive.
- External drive missing â†’ show â€œFolder not availableâ€ and keep the path; offer
  â€œLocateâ€¦â€.
- Read-only folder â†’ downloads fail with a clear message.
- Existing files with different names â†’ advanced file pickers.
- Multiple users â†’ `%APPDATA%`/`%LOCALAPPDATA%` per user.
- No admin, no Python, no copying.

### Acceptance

- User picks a folder; existing files show Found; a render starts.
- â€œDownload missingâ€ writes into the chosen folder.
- Changing the folder later in Settings works without restarting the app.
- Absolute per-file paths work on any drive.
- No model classification, no third-party layout code, no scan.

---

# 2. Existing OpenCode binary

## 2.1 Current behavior

- `resolveOpenCode()` picks the **newest** installed binary; an explicit user
  path can be ignored.
- Setup only detects or installs; there is no â€œuse this `opencode.exe`â€.
- The model list exists in Settings, but Setup does not show providers/models.
- v1 is rejected with â€œnot foundâ€, not a clear upgrade message.

## 2.2 What users need

> **OpenCode:** `C:\Tools\opencode\opencode.exe` (v2.3.0)  [Change] [Test]  
> Providers: 6 Â· Models: 459  
> Model: `zro/deepseek-v4.1-flash`  [Choose]  
> [Download OpenCode CLI]

## 2.3 Exact discovery from the selected binary

Run the **selected** `opencode.exe`, never the newest fallback:

### 1. Version

```text
opencode.exe --version
```

- `>= 2` â†’ use it.
- `1.x` â†’ show â€œOpenCode 1.x found at <path>; EggLab needs v2â€ and offer the
  download.
- Failure/timeout â†’ â€œThis file did not start as OpenCode.â€

### 2. Paths

```text
opencode.exe debug paths
```

Parse `home`, `data`, `cache`, `config`, `state`, `db`. Do not hardcode
`~/.config` or `~/.local/share`.

### 3. Providers

```text
opencode.exe auth list
```

Show provider account rows (stored / environment). Do **not** read
`auth.json` or `opencode.db`; never print tokens.

### 4. Models

Run the same mode the chat uses:

```text
opencode.exe --standalone models
```

Local test: plain `models` and `--standalone models` returned the **same 459
models** and the same `auth list`; standalone took ~1.3 s, plain ~0.4 s.
Use `--standalone` for truth; fall back to plain if standalone fails.

Group by `provider/model`. Do not filter by provider names.

### 5. Active model and provider status

- Parse the global config `opencode.json(c)` from the `config` path:
  - `model` (string or `{providerID, model}`) â†’ preselect if it exists;
  - `providers.*.models.*.capabilities.input` â†’ mark vision-capable models if
    the data exists;
  - `providers.*` â†’ show custom provider names.
- Provider status:
  - `stored` / `environment` from `auth list`;
  - `config` when the provider has `settings.apiKey`, `env`, or an API-key file;
  - `no credentials` when it appears only in `models` but has no auth/config.
- Do not hide â€œno credentialsâ€ models; label them. The user may still have an
  environment variable the app process does not see.

### 6. Project-scoped warning

Local test: a custom provider in a temporary project appeared only in that
project (463 models) and was absent from the home folder and EggLabâ€™s agent
workspace (462 models). Global providers were present in all three.

So:

- global providers â†’ available;
- providers defined only in another project â†’ **not** available to EggLab;
- show: â€œProvider X is defined in <project>/opencode.json. Move it to the
  global OpenCode config to use it here.â€
- never copy credentials automatically.

### 7. Environment-only auth

`auth list` can say `environment`. A GUI app launched from Explorer may not
inherit a shell variable. Show:

> This provider uses an environment variable. If EggLab was started from a
> shortcut, it may not see it. Connect it as a saved account or set the
> variable for the app.

## 2.4 UI

Setup â†’ OpenCode:

- Path + version.
- **Use existingâ€¦** (file picker).
- **Download OpenCode CLI** (existing installer).
- **Test** â†’ version, paths, auth list, model count; show errors.
- **Choose model** â†’ provider groups + search; show `provider/model`, vision
  badge when known, auth status.
- **Refresh**.

Settings â†’ Agent model: same picker, so users can change it later.

## 2.5 Code changes

- `settings.mjs`:
  - `resolveOpenCode`: explicit configured path first if v2; otherwise newest
    working v2; never v1.
  - `opencodeAt(bin, args)` helper with timeout and shell handling for
    `.cmd`/`.bat`.
  - `opencodeDebugPaths()`, `opencodeAuthList()`, `opencodeModelsAt(bin)`.
  - `setOpenCodePath(file)`.
  - `readOpenCodeConfig()` JSONC-tolerant.
- `setup.mjs`: expose path/version/providers/models/active model/warnings;
  `setOpenCode(file)`.
- `main.mjs`/`http.mjs`/`preload.cjs`: file picker, test, refresh, open
  config, open login terminal.
- `renderer/app.js`: Setup and Settings cards.
- Tests: v1 rejection, explicit v2 path, `.cmd` shim, model list, project-scope
  warning, env warning, non-ASCII path.

### Acceptance

- User selects their existing `opencode.exe`; EggLab uses it, not a newer one.
- `Test` shows version, providers, models, and errors from that binary.
- Selecting a model persists and the chat uses it.
- v1 gets an actionable message.
- Global providers work; project-scoped ones get a precise explanation.
- No secret is read or logged.

---

# 3. Is it easy?

**Yes, the core is easy.** No scanner, no model identification, no app-specific layout.

| Work | User effort | Implementation |
|---|---|---|
| Choose existing models folder | 1 folder picker | 1 day |
| Download missing into that folder | 1 click | existing code + path |
| Advanced per-role file pickers | 5 pickers | 1 day |
| Choose existing `opencode.exe` | 1 file picker | 1 day |
| Test + providers/models from that binary | 1 click | 1â€“2 days |
| Model picker in Setup/Settings | 1 selection | 1 day |
| Tests/docs | â€” | 1â€“2 days |

**Total:** ~4â€“6 working days for a solid Phase 1. Not 2â€“3 weeks.

## Verified evidence

- `Join-Path 'C:\models' 'D:\AI\qwen.gguf'` â†’ `C:\models\D:\AI\qwen.gguf`.
  Absolute-path support is a real bug; fix is small.
- Selected OpenCode binary: `--version`, `debug paths`, `auth list`,
  `--standalone models` all work and return the userâ€™s global providers.
- Plain and standalone model lists are identical (459 models); standalone is
  the chat mode.
- A project-scoped provider appears only in that project (463 vs 462); EggLabâ€™s
  workspace cannot see it. Explain, do not copy.
- `models` can list a provider that has no auth; `auth list` then has no row.
  Label it instead of hiding it.

## Risks

- Users with renamed files need the advanced file pickers; the folder picker
  alone uses the expected names.
- Read-only/disconnected folders need clear errors.
- Project-scoped OpenCode providers cannot be used without moving config;
  that is an OpenCode rule, not an EggLab scanner.
- Environment-only auth may not be inherited; warn.
- We are **not** validating model contents. A wrong file will fail in the
  engine; that is accepted by design.

---

# 4. Global-first rules

- Any drive, UNC, spaces, non-ASCII, long path, OneDrive.
- No hardcoded `D:\`, no user name, no third-party app assumptions.
- No admin, no Python, no copy by default.
- Per-user `%APPDATA%`/`%LOCALAPPDATA%`.
- No provider/model names hardcoded.
- Never read/log OpenCode credentials.
- Keep existing `%LOCALAPPDATA%\EggLab\models` installs working.

---

# 5. Plan

**Phase 1 â€” model folder (2â€“3 days)**

1. `Resolve-Model` absolute paths.
2. `setModelsFolder()` + folder picker in Setup/Settings.
3. Models card: folder, found/missing, Download missing, Open folder.
4. Advanced five file pickers.
5. Downloads into the chosen folder; clear read-only/disconnected errors.
6. Tests: absolute path, folder change, download destination, missing drive.

**Phase 2 â€” OpenCode binary (2â€“3 days)**

1. Explicit path wins; validate v2.
2. `debug paths`, `auth list`, `--standalone models`.
3. Provider status + model list + active model; JSONC config read.
4. Setup/Settings model picker; refresh; test button.
5. v1/project-scope/env warnings.
6. Tests: explicit path, v1, `.cmd`, non-ASCII, project scope.

**Phase 3 â€” polish (1 day)**

- Docs, screenshots, error strings, a beta build for the reporters.

No version bump or commit until Phase 1 and 2 pass the tests.

---

# 6. Decisions

1. **Folder picker behavior:** use the expected file names inside the folder,
   with optional per-role file pickers for renamed files. Confirm.
2. **Downloads:** write into the chosen folder by default? (Recommend yes;
   otherwise the default `%LOCALAPPDATA%` folder.)
3. **OpenCode model list:** show all models with status, or only providers in
   `auth list`? (Recommend show all, label â€œno credentialsâ€; users may have
   env/config credentials.)
4. **Existing model folder with a different layout:** advanced file pickers
   are enough, no scan. Confirm.
5. Paste the remaining community bug reports.

---

# 7. Community bug intake

```text
EggLab version:
Windows version:
GPU + VRAM:
OpenCode version/path:
Provider/model selected:
Models folder and file names:
Steps to reproduce:
Expected:
Actual:
Logs: %APPDATA%\EggLab\logs\main.log, agent.log, job_*.log
Screenshot:
```

---

# 8. Sources

- OpenCode config locations/precedence: <https://opencode.ai/docs/config/>
- OpenCode providers/custom providers: <https://opencode.ai/docs/providers/>
- OpenCode models: <https://opencode.ai/docs/models/>
- OpenCode CLI auth/providers: <https://opencode.ai/docs/cli/providers/>
- Local tests: `opencode debug paths`, `auth list`, plain vs `--standalone
  models` (459 identical), temporary project provider (463 vs 462),
  `Join-Path` absolute-path behavior.
- Qwen-Image-2.1 engine files (for expected names only):
  <https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/models/qwen_image_2.1.md>
- Qwen-Image-2.1 model card:
  <https://huggingface.co/Qwen/Qwen-Image-2.1>

---

# 9. Implementation (this commit)

- Per-role absolute paths: `resolveModelPath()`, `setModelFile()`,
  `setModelsFolder()`; `egglab.ps1` handles rooted paths and a separate
  `turbo.dir`.
- Default folder layout with `diffusion/`, `vae/`, `text_encoder/`, `vision/`
  and `lora/`; downloads go into the role folder; five dropdowns list the files
  in each folder; flat folders still work.
- Setup/Settings: **Use existing folderâ€¦**, **Choose filesâ€¦**, folder status,
  downloads into the chosen folder, Open folder.
- OpenCode: explicit path wins; `setOpenCodePath()` rejects v1; `debug paths`,
  `auth list`, `--standalone models`; provider/model report; Setup model picker;
  Settings path picker; refresh and open-config actions.
- Tests: `model-config-test` covers absolute/relative roles; setup gate covers
  the new UI/API/CLI hooks; PowerShell parse passes.
- Runtime verified on the installed build: models folder `D:\neww\Models`,
  all five roles found, OpenCode 2.3.0 at the selected path, 7 providers /
  459 models / 6 accounts, v1 rejected without changing the selection, live
  sessions preserved.

**No version was bumped and no release was published.**

