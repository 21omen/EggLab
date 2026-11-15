#requires -Version 5.1
<#
  EggLab installer/bootstrap.

  - Downloads the standalone stable-diffusion.cpp CUDA engine (no Python, no ComfyUI).
  - Checks the Qwen-Image-2.1 model files and prints download links for anything missing.
  - Writes config.json with the engine/model locations.

  Examples:
    .\install.ps1
    .\install.ps1 -ModelsPath "E:\AI\Models" -EnginePath "D:\EggLab\engine"
#>
[CmdletBinding()]
param(
  [string]$ModelsPath = '',
  [string]$EnginePath = '',
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$cfgPath = Join-Path $root 'config.json'

$release = 'master-1028-37bc88b'
$commit = ($release -split '-')[-1]
# The Windows asset is named after the commit, not the release tag.
$engineZipUrl = "https://github.com/leejet/stable-diffusion.cpp/releases/download/$release/sd-master-$commit-bin-win-cuda12-x64.zip"
$cudartZipUrl = "https://github.com/leejet/stable-diffusion.cpp/releases/download/$release/cudart-sd-bin-win-cu12-x64.zip"

if (Test-Path $cfgPath) { $cfg = Get-Content $cfgPath -Raw | ConvertFrom-Json }
else {
  $cfg = [pscustomobject]@{
    engine = 'D:\EggLab\engine\sd'
    models = 'D:\EggLab\models'
    diffusion = 'qwen-image-2.1-UC-fp8.safetensors'
    vae = 'qwen_image_2.1_vae_bf16.safetensors'
    llm = 'Qwen3VL-8B-Uncensored-HauhauCS-Balanced-Q6_K.gguf'
    llmVision = 'Qwen3VL-8B-Uncensored-HauhauCS-Balanced-mmproj-f16.gguf'
    turbo = [pscustomobject]@{ lora = 'qwen_image_2.1_turbo_lora_avg_rank_178_bf16.safetensors'; steps = 8; cfg = 1.0 }
    defaults = [pscustomobject]@{ width = 1024; height = 1024; steps = 40; cfg = 1.0; method = 'euler'; offload = $true }
  }
}

if ($EnginePath) { $cfg.engine = $EnginePath }
if ($ModelsPath) { $cfg.models = $ModelsPath }

# Upgrade configs written before Turbo support existed.
if (-not $cfg.turbo -or -not $cfg.turbo.lora) {
  $turbo = [pscustomobject]@{
    lora  = 'qwen_image_2.1_turbo_lora_avg_rank_178_bf16.safetensors'
    steps = 8
    cfg   = 1.0
  }
  $cfg | Add-Member -NotePropertyName turbo -NotePropertyValue $turbo -Force
}

New-Item -ItemType Directory -Force -Path $cfg.engine | Out-Null
New-Item -ItemType Directory -Force -Path $cfg.models | Out-Null

function Get-File([string]$url, [string]$dest) {
  if (Test-Path $dest) { Remove-Item $dest -Force }
  Write-Host "Downloading $url" -ForegroundColor Cyan
  try {
    Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
  } catch {
    # Some hosts need the TLS revocation check relaxed; curl ships with Windows 10+.
    curl.exe -L --ssl-no-revoke --retry 3 -o $dest $url
    if (-not (Test-Path $dest)) { throw "Download failed: $url" }
  }
}

$engineExe = Join-Path $cfg.engine 'sd-cli.exe'
if ($Force -or -not (Test-Path $engineExe)) {
  $tmp = Join-Path $env:TEMP ('egglab-engine-' + [guid]::NewGuid().ToString('N') + '.zip')
  $tmp2 = Join-Path $env:TEMP ('egglab-cudart-' + [guid]::NewGuid().ToString('N') + '.zip')
  Get-File $engineZipUrl $tmp
  Get-File $cudartZipUrl $tmp2
  Expand-Archive -Path $tmp -DestinationPath $cfg.engine -Force
  Expand-Archive -Path $tmp2 -DestinationPath $cfg.engine -Force
  Remove-Item $tmp, $tmp2 -Force -ErrorAction SilentlyContinue
  Write-Host "Engine installed to $($cfg.engine)" -ForegroundColor Green
} else {
  Write-Host "Engine already installed: $engineExe" -ForegroundColor DarkGray
}

# Model inventory. Links point at the repositories these exact files live in.
$models = @(
  @{ name = $cfg.diffusion; size = '6.6 GB'; url = 'https://huggingface.co/KasugaiSakura/Qwen-Image-2.1-Uncensored-Abenzerps-GGUF'; note = 'Qwen-Image 2.1 uncensored diffusion model (fp8 / GGUF variants)' },
  @{ name = $cfg.vae;        size = '0.63 GB'; url = 'https://huggingface.co/Comfy-Org/Qwen-Image-2.1/tree/main/vae'; note = 'Qwen-Image 2.1 VAE (must be the 2.1 VAE)' },
  @{ name = $cfg.llm;        size = '6.3 GB'; url = 'https://huggingface.co/HauhauCS/Qwen3VL-8B-Uncensored-HauhauCS-Balanced'; note = 'Qwen3-VL-8B text encoder (GGUF)' },
  @{ name = $cfg.llmVision;  size = '1.1 GB'; url = 'https://huggingface.co/HauhauCS/Qwen3VL-8B-Uncensored-HauhauCS-Balanced'; note = 'Qwen3-VL vision projector (needed for image editing)' },
  @{ name = $cfg.turbo.lora; size = '0.85 GB'; url = 'https://huggingface.co/Comfy-Org/Qwen-Image-2.1/tree/main/loras'; note = 'Turbo LoRA (optional, enables -Turbo fast mode)'; optional = $true }
)

Write-Host ''
Write-Host 'Model check:' -ForegroundColor Cyan
$missing = 0
foreach ($m in $models) {
  $p = Join-Path $cfg.models $m.name
  if (Test-Path $p) {
    Write-Host ("  [ok]      {0}" -f $m.name) -ForegroundColor Green
    continue
  }

  if ($m.optional) {
    Write-Host ("  [optional] {0}  ({1})" -f $m.name, $m.size) -ForegroundColor DarkYellow
    Write-Host ("            {0}" -f $m.note)
    Write-Host ("            {0}" -f $m.url)
    continue
  }

  $missing++
  Write-Host ("  [missing] {0}  ({1})" -f $m.name, $m.size) -ForegroundColor Yellow
  Write-Host ("            {0}" -f $m.note)
  Write-Host ("            {0}" -f $m.url)
}

$cfg | ConvertTo-Json -Depth 6 | Set-Content -Path $cfgPath -Encoding UTF8
Write-Host ''
Write-Host "Config written: $cfgPath"

if ($missing -gt 0) {
  Write-Host "Place the missing files in $($cfg.models) and run install.ps1 again." -ForegroundColor Yellow
  exit 2
}

Write-Host ''
Write-Host 'Ready. Try:' -ForegroundColor Green
Write-Host '  .\egglab.cmd "a cozy cabin in a snowy forest at dusk, cinematic"'
Write-Host '  .\egglab.cmd "change the sky to a sunset" -Image .\photo.png'
