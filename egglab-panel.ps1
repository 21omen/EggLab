#requires -Version 5.1
<#
  EggLab panel launcher.

  Starts the Electron companion window that drives PhotoCraft and hosts the
  OpenCode chat agent.

    .\egglab-panel.cmd              start the panel
    .\egglab-panel.cmd -Dev         start with devtools

  Note: Electron must be started WITHOUT -WindowStyle Hidden. PowerShell's
  hidden window flag propagates SW_HIDE to the first BrowserWindow, so the
  panel would run invisibly with no way to reach it.
#>
[CmdletBinding()]
param(
  [switch]$Dev,
  [switch]$Wait
)

$ErrorActionPreference = 'Stop'
$root   = Split-Path -Parent $MyInvocation.MyCommand.Path
$panel  = Join-Path $root 'panel'
$electron = Join-Path $panel 'node_modules\electron\dist\electron.exe'

if (-not (Test-Path $electron)) {
  throw "Electron not found at $electron.`nRun install.ps1 (or cd panel && npm install) first."
}
if (-not (Test-Path (Join-Path $panel 'main.mjs'))) {
  throw "EggLab panel not found at $panel"
}

# Already running? Electron's single-instance lock handles this, but a quick
# check avoids spawning a second copy that immediately exits.
$running = Get-Process -Name 'electron' -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -and $_.Path.StartsWith($panel, [StringComparison]::OrdinalIgnoreCase) }
if ($running -and -not $Dev) {
  Write-Host 'EggLab panel is already running.' -ForegroundColor Yellow
  $running | Select-Object -First 1 | ForEach-Object { $_.MainWindowTitle } | Where-Object { $_ } | Write-Host
  return
}

$args = @('.')
if ($Dev) { $args += '--dev' }

Write-Host "Starting EggLab panel..." -ForegroundColor Cyan
Write-Host "  panel : $panel"
Write-Host "  electron: $electron"

# Start-Process without -WindowStyle: the panel draws its own frameless window.
$proc = Start-Process -FilePath $electron -ArgumentList $args -WorkingDirectory $panel -PassThru
Write-Host "  pid   : $($proc.Id)" -ForegroundColor Green

if ($Wait) {
  Write-Host 'Waiting for the panel to exit (Ctrl+C detaches)...'
  try { $proc.WaitForExit() } catch { Write-Host 'Detached.' }
}
