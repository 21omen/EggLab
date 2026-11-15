#requires -Version 5.1
<#
  EggLab engine downloader (shared by the NSIS installer and the first-run
  wizard). Stable-diffusion.cpp is NEVER packed into the installer: it is
  fetched here from a pinned GitHub release whose assets publish SHA-256
  hashes, in the variant matching the machine's GPU:

    cuda    NVIDIA  ~887 MB (sd + CUDA runtime) - what EggLab is tested on
    vulkan  any GPU ~29 MB
    cpu     no GPU  ~17 MB

  Every failure path exits non-zero instead of aborting: the installer (or
  the wizard) reports it and EggLab still works for everything else - the
  downloader can be re-run at any time and resumes partial downloads.

  Notes for maintainers: progress goes through Write-Host, never Write-Output.
  Callers capture each function's pipeline output (paths, booleans), and a
  stray Write-Output makes a failure array look truthy - which silently
  reports success.

  Examples:
    .\engine-install.ps1
    .\engine-install.ps1 -Variant vulkan
    .\engine-install.ps1 -EngineDir "E:\EggLab\engine" -Force
#>
[CmdletBinding()]
param(
  [ValidateSet('auto', 'cuda', 'vulkan', 'cpu')]
  [string]$Variant = 'auto',

  # Must match paths.mjs ENGINE_DIR + '\sd' as the final engine folder.
  [string]$EngineDir = (Join-Path $env:LOCALAPPDATA 'EggLab\engine'),

  [switch]$Force
)

$ErrorActionPreference = 'Stop'

# Pinned release (never "latest") so hashes stay valid and builds reproducible.
$release = 'master-1091-b9d7176'
$commit = 'b9d7176'
$base = "https://github.com/leejet/stable-diffusion.cpp/releases/download/$release"

$assets = @{
  cuda = @(
    @{ file = "sd-master-$commit-bin-win-cuda12-x64.zip"; sha256 = '36ab0884ab3b09e7f062cc936544503364d43a84231e7671d47bdedbb5369292' },
    @{ file = 'cudart-sd-bin-win-cu12-x64.zip'; sha256 = 'fe20366827d357c00797eebb58244dddab7fd9a348d70090c3871004c320f38d' }
  )
  vulkan = @(
    @{ file = "sd-master-$commit-bin-win-vulkan-x64.zip"; sha256 = '900b3059b31a8258553abad763f31cc8bbb4fa2dbbb97dc0cd76b473218567e1' }
  )
  cpu = @(
    @{ file = "sd-master-$commit-bin-win-cpu-x64.zip"; sha256 = '7e881e3c95d7ec9bf4b46e87fda37c156da9b38d18fa2439d18f29915750acbb' }
  )
}

function Resolve-Variant([string]$want) {
  if ($want -ne 'auto') { return $want }
  # CI / power users can pin the variant through the environment.
  if ($env:EGGLAB_ENGINE_VARIANT -match '^(cuda|vulkan|cpu)$') { return $env:EGGLAB_ENGINE_VARIANT }
  $names = @(
    Get-CimInstance Win32_VideoController -ErrorAction SilentlyContinue |
      ForEach-Object { $_.Name }
  ) -join ' '
  if ($names -match 'NVIDIA') { return 'cuda' }
  if ($names.Trim()) { return 'vulkan' }
  return 'cpu'
}

function Get-Asset([hashtable]$asset, [string]$dir) {
  $dest = Join-Path $dir $asset.file
  $part = "$dest.part"
  if (Test-Path $dest) {
    $have = (Get-FileHash $dest -Algorithm SHA256).Hash
    if ($have -ieq $asset.sha256) { return $dest }
    Remove-Item $dest -Force
  }
  # -C - resumes a partial .part from a dropped connection; --ssl-no-revoke
  # works around hosts with broken revocation lists (same as install.ps1).
  # The speed guard aborts a stalled transfer instead of hanging the installer
  # forever - the next run resumes from the .part file.
  # cmd wrapper merges curl's stderr progress into the installer's detail log.
  # Out-Host is load-bearing: native stdout becomes pipeline output otherwise,
  # and curl's progress lines would be returned as if they were file paths.
  Write-Host "downloading $($asset.file) ..."
  & cmd.exe /c "curl.exe -L --ssl-no-revoke --retry 3 -C - --connect-timeout 20 --speed-limit 1024 --speed-time 60 -o `"$part`" -- `"$base/$($asset.file)`" 2>&1" | Out-Host
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $part)) {
    throw "download failed: $($asset.file) (curl exit $LASTEXITCODE)"
  }
  $have = (Get-FileHash $part -Algorithm SHA256).Hash
  if ($have -ine $asset.sha256) {
    Remove-Item $part -Force
    throw "checksum mismatch for $($asset.file): expected $($asset.sha256), got $have"
  }
  Move-Item $part $dest -Force
  return $dest
}

function Install-Variant([string]$v) {
  $target = Join-Path $EngineDir 'sd'
  $exe = Join-Path $target 'sd-cli.exe'
  if (-not $Force -and (Test-Path $exe)) {
    Write-Host "engine already present: $exe"
    return $true
  }

  New-Item -ItemType Directory -Force -Path $EngineDir | Out-Null
  $zipDir = Join-Path $EngineDir 'zips'
  New-Item -ItemType Directory -Force -Path $zipDir | Out-Null
  $stage = Join-Path $env:TEMP ("egglab-engine-" + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Force -Path $stage | Out-Null

  try {
    $zips = @()
    foreach ($asset in $assets[$v]) { $zips += Get-Asset $asset $zipDir }

    # Windows 10+ ships tar.exe (bsdtar reads zip); PowerShell's
    # Expand-Archive is the fallback for stripped-down systems.
    foreach ($zip in $zips) {
      $tar = Join-Path $env:SystemRoot 'System32\tar.exe'
      if (Test-Path $tar) {
        & $tar -xf $zip -C $stage
        if ($LASTEXITCODE -ne 0) { throw "tar failed on $(Split-Path -Leaf $zip)" }
      } else {
        Expand-Archive -Path $zip -DestinationPath $stage -Force
      }
    }

    # Archives are either flat or wrapped in one folder - locate sd-cli.exe
    # and promote whatever contains it to engine\sd.
    $found = Get-ChildItem $stage -Recurse -Filter 'sd-cli.exe' -File -ErrorAction SilentlyContinue |
      Select-Object -First 1
    if (-not $found) { throw 'sd-cli.exe not found inside the downloaded archive' }

    New-Item -ItemType Directory -Force -Path $target | Out-Null
    Get-ChildItem $found.DirectoryName -Force | ForEach-Object {
      Move-Item $_.FullName $target -Force
    }
    if (-not (Test-Path $exe)) { throw "engine binary missing after extract: $exe" }

    $info = [ordered]@{
      release = $release
      variant = $v
      at = (Get-Date).ToUniversalTime().ToString('o')
      sha256 = @{}
    }
    foreach ($asset in $assets[$v]) { $info.sha256[$asset.file] = $asset.sha256 }
    $infoPath = Join-Path $target 'engine-info.json'
    [IO.File]::WriteAllText($infoPath, ($info | ConvertTo-Json -Depth 4))

    Write-Host "engine ready: $exe ($v)"
    return $true
  } catch {
    Write-Host "engine install failed: $($_.Exception.Message)"
    return $false
  } finally {
    Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item (Join-Path $EngineDir 'zips') -Recurse -Force -ErrorAction SilentlyContinue
  }
}

$v = Resolve-Variant $Variant
Write-Host "engine variant: $v"

# Degradation ladder: whatever works beats the fastest. A CUDA download that
# dies mid-flight still leaves a usable machine on the 29 MB Vulkan build.
$ladder = @($v)
foreach ($fallback in 'vulkan', 'cpu') { if ($ladder -notcontains $fallback) { $ladder += $fallback } }

foreach ($try in $ladder) {
  if (Install-Variant $try) { exit 0 }
  if ($try -ne $v) { Write-Host "falling back from $v to $try" }
}
exit 1
