# Setup / install audit — 0.3.15

Checked the NSIS installer, the first-run wizard, engine/OpenCode downloads and
the legacy `install.ps1` bootstrap.

## Fixed

1. **Legacy `install.ps1` pinned a different engine.**
   It downloaded `master-1028-37bc88b` CUDA-only, with no hashes, while the app
   and installer use `master-1091-b9d7176`. It now calls the shared
   `panel/build/engine-install.ps1` (same hash-verified release, auto
   CUDA/Vulkan/CPU ladder).

2. **`install.ps1` hardcoded `D:\EggLab` paths.**
   Defaults now follow the checkout layout (engine next to the repo, sibling
   `Models` when present), otherwise the per-user packaged locations. Empty
   config engine/model fields fall back to the same defaults.

3. **Successful engine install could leave a stale config path.**
   `setup.installEngine` installs into `ENGINE_DIR`, but if `config.json` still
   pointed at an old/missing custom engine folder, setup kept saying “engine
   missing.” A successful install now re-points config to
   `<ENGINE_DIR>\sd`.

4. **OpenCode v1 could be marked “found” and skip the v2 install.**
   Setup now requires a known v2+ binary; v1/unknown-version shims are treated
   as missing and the wizard installs the pinned v2 release.

5. **OpenCode download used Node `fetch` on GitHub assets.**
   This network resets that TLS path. Setup now falls back to
   `curl --ssl-no-revoke --fail` with resume and a stall guard; a stalled fetch
   aborts after 120 s instead of hanging the wizard.

6. **Replacing a running OpenCode install could fail.**
   The wizard extracts into a fresh versioned folder, switches the configured
   executable, then cleans old folders best-effort.

7. **Installer free-space check was too low.**
   Raised from 1.5 GB to 3 GB for the app + CUDA engine + staging/extraction
   peak. Uninstall now also kills `sd-cli.exe`/`sd-server.exe` before removing
   the engine, so a running render cannot lock files.

8. **No model-download disk-space check.**
   The downloader now checks free space for the remaining bytes plus 512 MB
   before starting, so a 6+ GB model fails immediately with a clear message
   instead of halfway through.

9. **Re-scan did not refresh the agent workspace.**
   Setup “detect” now rebuilds the OpenCode workspace after PhotoCraft is
   found, so permission roots match the new install.

## Verification

- `npm run test:agent` includes `tools/setup-regression.mjs`:
  installer/engine pins, auto variant, hashes, free-space threshold, engine
  kill on uninstall, stale-config repair, v2 OpenCode rules, curl/stall
  fallback, packaged resources, and PowerShell parsing of both `.ps1` files.
- PowerShell parser: `install.ps1` and `engine-install.ps1` parse cleanly.
- NSIS build compiles with the new installer hooks.
- Installed app setup status remains `ready: true` after upgrade.
- Engine stale-config repair test: set config to a missing engine path, run the
  setup engine action; the existing hashed engine is recognized and config is
  re-pointed to it.

## Not changed

- No new PhotoCraft/UI flow.
- OpenCode and model downloads still use their pinned URLs; the OpenCode zip
  does not yet have a hardcoded SHA-256 (the release API was unavailable during
  this audit). The installer’s engine downloads remain hash-verified.
- Models are still optional at install time and downloaded by the wizard; the
  installer never bundles multi-GB weights.
