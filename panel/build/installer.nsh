; ---------------------------------------------------------------------------
; EggLab installer customization.
;
; electron-builder picks this file up automatically from the build resources
; folder (build/installer.nsh), and includes it in both the installer and the
; uninstaller compilation - hence the include guard and the BUILD_UNINSTALLER
; guard around the installer-only checks.
;
; The image engine (stable-diffusion.cpp) is NEVER packed into the installer:
; customInstall downloads the pinned release with engine-install.ps1 after the
; app files are copied. Requirement checks abort before anything is written.
; ---------------------------------------------------------------------------

!ifndef EGGLAB_INSTALLER_NSH
!define EGGLAB_INSTALLER_NSH

; Drive letter of the profile drive, resolved in preInit and reused for the
; free-space message. (A user Var, so nsExec cannot clobber it.) Declared only
; for the installer build: the uninstaller has no preInit checks, and an unused
; variable is a compile warning - which electron-builder treats as an error.
!ifndef BUILD_UNINSTALLER
  Var EggLabDriveLetter
!endif

!macro preInit
  ; The uninstaller is built from the same template and runs this same .onInit
  ; body. It must never be blocked from running: skip every check there.
  !ifndef BUILD_UNINSTALLER
    ; --- Requirement 1: Windows 10 or newer (Electron 33 baseline) ---------
    ; Read the registry instead of WinVer.nsh: its GetVersionEx probe depends
    ; on manifest supportedOS entries and otherwise reports Windows 10 as 8.1.
    ReadRegDWORD $R0 HKLM "SOFTWARE\Microsoft\Windows NT\CurrentVersion" "CurrentMajorVersionNumber"
    StrCmp $R0 "" _egglab_osLegacy
    IntCmp $R0 10 _egglab_osOk _egglab_osLegacy _egglab_osOk
  _egglab_osLegacy:
    ReadRegStr $R1 HKLM "SOFTWARE\Microsoft\Windows NT\CurrentVersion" "CurrentVersion"
    StrCpy $R2 $R1 3
    StrCmp $R2 "10." _egglab_osOk
    StrCmp $R2 "11." _egglab_osOk
    MessageBox MB_OK|MB_ICONSTOP "EggLab requires Windows 10 or newer. This version of Windows is not supported." /SD IDOK
    Abort
  _egglab_osOk:

    ; --- Requirement 2: free space on the profile drive -------------------
    ; A fresh install stages the engine (CUDA zip + extracted tree), so it
    ; needs ~3 GB. An update with an existing engine only replaces the app and
    ; needs ~1.5 GB; do not block small-disk updates unnecessarily.
    StrCpy $EggLabDriveLetter $LOCALAPPDATA 1
    StrCpy $R9 3221225472
    IfFileExists "$LOCALAPPDATA\EggLab\engine\sd\sd-cli.exe" _egglab_spaceHaveEngine
    Goto _egglab_spaceProbe
  _egglab_spaceHaveEngine:
    StrCpy $R9 1610612736
  _egglab_spaceProbe:
    nsExec::ExecToStack `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -Command "(Get-PSDrive -Name $EggLabDriveLetter).Free -gt $R9"`
    Pop $R8 ; exit code (unused)
    Pop $R7 ; probe output: True / False / empty on error
    StrCpy $R7 $R7 5
    StrCmp $R7 "False" _egglab_lowSpace
    Goto _egglab_spaceOk
  _egglab_lowSpace:
    MessageBox MB_OK|MB_ICONSTOP "EggLab needs more free disk space on drive $EggLabDriveLetter:. Free some space and run the installer again." /SD IDOK
    Abort
  _egglab_spaceOk:

    ; --- Close a previous EggLab before the install section runs -----------
    ; The one-click flow has no "please close the app" page. A running app (or
    ; a leftover Electron renderer with the same exe name) keeps the program
    ; files locked, and the old-uninstaller step then aborts with "file is
    ; busy" (shown as "Failed to uninstall old application files"). Closing it
    ; here is safe: the update restarts the app, and chat data is written as it
    ; changes. taskkill exits 128 on a fresh install (nothing to kill).
    nsExec::Exec 'taskkill /IM "EggLab.exe" /T /F'
    Pop $R8
    Sleep 500
  !endif
!macroend

!macro customInstall
  ; --- Engine: downloaded now, never packed -------------------------------
  IfFileExists "$LOCALAPPDATA\EggLab\engine\sd\sd-cli.exe" _egglab_engineSkip
  DetailPrint "EggLab: downloading the local image engine (one time only)..."
  ; /SD IDOK keeps silent installs (CI, unattended) downloading the engine.
  MessageBox MB_OKCANCEL|MB_ICONINFORMATION "EggLab runs a local Stable Diffusion engine that is not bundled in this installer.$\r$\n$\r$\nIt will now be downloaded and verified (about 900 MB for NVIDIA GPUs, far less for other graphics cards). Keep this window open until it finishes." /SD IDOK IDOK _egglab_engineDownload IDCANCEL _egglab_engineSkipped
_egglab_engineDownload:
  nsExec::ExecToLog `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\engine-install.ps1" -EngineDir "$LOCALAPPDATA\EggLab\engine"`
  Pop $R0
  StrCmp $R0 "0" _egglab_engineOk
  DetailPrint "EggLab: engine download failed (exit $R0)."
  MessageBox MB_OK|MB_ICONEXCLAMATION "The local image engine could not be downloaded right now (no internet, or the download was interrupted).$\r$\n$\r$\nEggLab itself is installed and will start normally. Once you are online, open EggLab and retry the engine download from its settings." /SD IDOK
  Goto _egglab_engineDone
_egglab_engineOk:
  DetailPrint "EggLab: engine installed."
  Goto _egglab_engineDone
_egglab_engineSkipped:
  DetailPrint "EggLab: engine download skipped."
  Goto _egglab_engineDone
_egglab_engineSkip:
  DetailPrint "EggLab: engine already present, skipping the download."
_egglab_engineDone:
!macroend

!macro customUnInstall
  ; Never let a running EggLab hold the program files. A one-click installer has
  ; no "please close the app" page, and a silent update runs this uninstaller
  ; while the previous app may still be shutting down; the template then aborts
  ; with "file is busy" (surfaced as "Failed to uninstall old application
  ; files"). Closing it here is safe: transcripts/settings are written as they
  ; change, and an update restarts the app right after.
  nsExec::Exec 'taskkill /IM "EggLab.exe" /T /F'
  Pop $R9
  ; The image engine can still be rendering during an uninstall and would lock
  ; its DLLs/exe. Kill only our engine binaries before removing the folder.
  nsExec::Exec 'taskkill /IM "sd-cli.exe" /T /F'
  Pop $R9
  nsExec::Exec 'taskkill /IM "sd-server.exe" /T /F'
  Pop $R9
  Sleep 600
  ; An upgrade runs the OLD uninstaller first with --updated: it must not
  ; delete the engine (still valid, would have to be re-downloaded every
  ; update) and must not prompt about models. Only a real uninstall cleans up.
  ${IfNot} ${isUpdated}
    ; --- Large per-user artifacts live outside $INSTDIR -------------------
    ; Engine binaries and the bin cache are disposable: remove them with the app.
    RMDir /r "$LOCALAPPDATA\EggLab\engine"
    RMDir /r "$LOCALAPPDATA\EggLab\bin"
    ; Models are several GB and often shared/reused: ask, default NO (also the
    ; /SD answer, so a silent uninstall always keeps them).
    IfFileExists "$LOCALAPPDATA\EggLab\models\*.*" _egglab_modelsPrompt _egglab_modelsDone
  _egglab_modelsPrompt:
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Also delete the downloaded image models?$\r$\n$\r$\nThey can take several GB and would have to be downloaded again later." /SD IDNO IDYES _egglab_modelsDelete IDNO _egglab_modelsDone
  _egglab_modelsDelete:
    RMDir /r "$LOCALAPPDATA\EggLab\models"
  _egglab_modelsDone:
    ; Chats, settings and logs in %APPDATA%\EggLab are intentionally kept.
    RMDir "$LOCALAPPDATA\EggLab"
  ${EndIf}
!macroend

!endif
