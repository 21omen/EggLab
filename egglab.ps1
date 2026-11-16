#requires -Version 5.1
<#
  EggLab - local Qwen-Image-2.1 runner (standalone, no ComfyUI).

  Text to image:
    .\egglab.ps1 "a neon sign that reads EGGLAB, rainy night"

  Image edit (one or more reference images):
    .\egglab.ps1 "change the text to NEON CAT" -Image .\photo.png

  Turbo mode (8 steps, ~2x faster):
    .\egglab.ps1 "a neon sign that reads EGGLAB" -Turbo

  Useful options: -Width -Height -Steps -Cfg -Seed -Out -NoOffload -Cpu -Turbo -Open
#>
[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [Alias('p')]
  [string]$Prompt,

  # Read the prompt from a UTF-8 file instead of the command line. The panel
  # uses this so quotes, newlines and emoji in user prompts survive intact.
  [string]$PromptFile,

  [Alias('r', 'ref')]
  [string[]]$Image,

  # Read the reference-image list from a UTF-8 file (one path per line) instead
  # of -Image. The panel uses this so paths with spaces or special characters
  # never have to survive command-line array binding.
  [string]$ImageFile,

  [Alias('o')]
  [string]$Out,

  [int]$Width = 0,
  [int]$Height = 0,
  [int]$Steps = 0,
  [double]$Cfg = 0,
  [int]$Seed = -1,
  [string]$Method = '',

  # Local-edit options. Everything below is optional and off by default, so the
  # panel's existing text-to-image and reference-edit paths behave exactly as
  # before until a caller asks for one of them:
  #   -InitImg  the source to modify (sd-cli --init-img): img2img, whole frame.
  #   -Mask     a mask image (sd-cli --mask): only the masked area is repainted.
  #   -Strength 0..1 denoising strength for init/mask runs. Low = preserve.
  #   -ImgCfg   image guidance scale for inpaint / image-edit models: how hard
  #             the output is pulled back toward the source.
  [string]$InitImg = '',
  [string]$Mask = '',
  [double]$Strength = -1,
  [double]$ImgCfg = -1,

  [switch]$NoOffload,
  [switch]$Cpu,
  [switch]$Turbo,
  [switch]$Open,

  # Keep the text encoder (Qwen3VL 8B, ~6 GB) in RAM. The panel adds this
  # automatically when the engine hits a VRAM capacity check while encoding
  # the prompt on small cards; it can also be forced from the command line.
  [switch]$TeCpu,

  # Device budget in GiB (0 = engine default; a NEGATIVE value tells the engine
  # to snapshot free VRAM and keep that many GiB headroom). The panel passes -1
  # on 8-12 GB cards so plans account for browsers/other apps.
  [int]$MaxVram = 0,

  # Tile VAE encode/decode. The panel enables it for reference edits on small
  # cards; keeps reference-encoding peaks from competing with the diffusion
  # graph.
  [switch]$VaeTiling,

  # Explicit config.json location. The packaged install keeps config.json in
  # the per-user data folder while egglab.ps1 ships in resources\, so the
  # panel passes this; default remains the file next to this script (dev).
  [string]$Config = ''
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$configPath = if ([string]::IsNullOrWhiteSpace($Config)) { Join-Path $root 'config.json' } else { $Config }
if (-not (Test-Path $configPath)) { throw "config.json not found at $configPath. Run install.ps1 first." }
$conf = Get-Content $configPath -Raw | ConvertFrom-Json

# When editing and no size was given, follow the source image aspect ratio
# (capped at 1024 on the long side) instead of forcing the config default.
# Allow the reference list to come from a file (see -ImageFile): this keeps
# paths with spaces or special characters out of command-line array binding.
if (-not $Image -and -not [string]::IsNullOrWhiteSpace($ImageFile)) {
  if (-not (Test-Path $ImageFile)) { throw "Image list file not found: $ImageFile" }
  $Image = @(Get-Content -LiteralPath $ImageFile -Encoding UTF8 | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
}
$autoSize = ($Image -and $Image.Count -gt 0 -and
             -not $PSBoundParameters.ContainsKey('Width') -and
             -not $PSBoundParameters.ContainsKey('Height'))

# Remember what the caller chose, so -Turbo only changes untouched defaults.
$stepsGiven = $Steps -gt 0
$cfgGiven = $Cfg -gt 0

# Defaults from config (0 / empty means "use config").
if ($Width  -le 0) { $Width  = [int]$conf.defaults.width }
if ($Height -le 0) { $Height = [int]$conf.defaults.height }
if ($Steps  -le 0) { $Steps  = [int]$conf.defaults.steps }
if ($Cfg    -le 0) { $Cfg    = [double]$conf.defaults.cfg }
if ([string]::IsNullOrWhiteSpace($Method)) { $Method = [string]$conf.defaults.method }
if (-not $PSBoundParameters.ContainsKey('NoOffload')) { $NoOffload = -not [bool]$conf.defaults.offload }

# Turbo LoRA is distilled for 8 steps at CFG 1.0 with a fixed sigma schedule.
# Its sigma list has exactly 8 entries, so forcing steps/cfg avoids broken output.
if ($Turbo) {
  $turboSteps = 8
  $turboCfg = 1.0
  if ($conf.turbo) {
    if ($conf.turbo.steps) { $turboSteps = [int]$conf.turbo.steps }
    if ($conf.turbo.cfg)   { $turboCfg   = [double]$conf.turbo.cfg }
  }
  if ($stepsGiven -and $Steps -ne $turboSteps) {
    Write-Warning ("Turbo uses a fixed {0}-step schedule; ignoring -Steps {1}." -f $turboSteps, $Steps)
  }
  if ($cfgGiven -and [math]::Abs($Cfg - $turboCfg) -gt 0.001) {
    Write-Warning ("Turbo is trained for CFG {0}; ignoring -Cfg {1}." -f $turboCfg, $Cfg)
  }
  $Steps = $turboSteps
  $Cfg   = $turboCfg
}

if ($autoSize) {
  try {
    Add-Type -AssemblyName System.Drawing
    $src = [System.Drawing.Image]::FromFile((Resolve-Path $Image[0]).Path)
    $iw = $src.Width; $ih = $src.Height; $src.Dispose()
    $scale = [Math]::Min(1.0, 1024.0 / [Math]::Max($iw, $ih))
    $Width  = [int]([Math]::Round($iw * $scale / 32.0) * 32)
    $Height = [int]([Math]::Round($ih * $scale / 32.0) * 32)
  } catch {
    Write-Host "Could not read reference image size, using defaults: $($_.Exception.Message)" -ForegroundColor Yellow
  }
}

# Qwen-Image-2.1 needs both dimensions divisible by 32.
$Width  = [int]([math]::Round($Width  / 32.0) * 32)
$Height = [int]([math]::Round($Height / 32.0) * 32)
if ($Width -lt 256)  { $Width  = 256 }
if ($Height -lt 256) { $Height = 256 }

if (-not [string]::IsNullOrWhiteSpace($PromptFile)) {
  if (-not (Test-Path $PromptFile)) { throw "Prompt file not found: $PromptFile" }
  $Prompt = [IO.File]::ReadAllText((Resolve-Path $PromptFile).Path, [Text.Encoding]::UTF8)
}

if ([string]::IsNullOrWhiteSpace($Prompt)) {
  $Prompt = Read-Host 'Describe the image (prompt)'
  if ([string]::IsNullOrWhiteSpace($Prompt)) { throw 'A prompt is required.' }
}

$engine = Join-Path $conf.engine 'sd-cli.exe'
if (-not (Test-Path $engine)) { throw "Engine not found at $engine. Run install.ps1 first." }

function Resolve-Model([string]$folder, [string]$name) {
  $p = Join-Path $folder $name
  if (-not (Test-Path $p)) { throw "Model not found: $p`nRun install.ps1 to check/download models." }
  return (Resolve-Path $p).Path
}

$diffusion = Resolve-Model $conf.models $conf.diffusion
$vae       = Resolve-Model $conf.models $conf.vae
$llm       = Resolve-Model $conf.models $conf.llm
$llmVision = $null
if ($Image -and $Image.Count -gt 0) {
  $llmVision = Resolve-Model $conf.models $conf.llmVision
  foreach ($img in $Image) {
    if (-not (Test-Path $img)) { throw "Reference image not found: $img" }
  }
}

if ($Seed -lt 0) { $Seed = Get-Random -Minimum 0 -Maximum 2147483647 }

if ([string]::IsNullOrWhiteSpace($Out)) {
  $outDir = Join-Path $root 'out'
  New-Item -ItemType Directory -Force -Path $outDir | Out-Null
  $Out = Join-Path $outDir ('egglab-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.png')
} else {
  $outDir = Split-Path -Parent $Out
  if ($outDir -and -not (Test-Path $outDir)) { New-Item -ItemType Directory -Force -Path $outDir | Out-Null }
}

$sdArgs = @(
  '--diffusion-model', $diffusion,
  '--vae', $vae,
  '--llm', $llm
)
# The engine picks LoRAs from prompt tags, so Turbo is appended to the prompt.
$promptText = $Prompt
if ($Turbo) {
  $turboLora = 'qwen_image_2.1_turbo_lora_avg_rank_178_bf16.safetensors'
  if ($conf.turbo -and $conf.turbo.lora) { $turboLora = [string]$conf.turbo.lora }
  $loraPath = Resolve-Model $conf.models $turboLora
  $loraName = [System.IO.Path]::GetFileNameWithoutExtension($loraPath)
  $sdArgs += @('--lora-model-dir', $conf.models)
  $promptText = $Prompt + '<lora:' + $loraName + ':1>'
}
if ($llmVision) { $sdArgs += @('--llm_vision', $llmVision) }
if ($Image) { foreach ($img in $Image) { $sdArgs += @('-r', (Resolve-Path $img).Path) } }
if ($InitImg) { $sdArgs += @('-i', (Resolve-Path $InitImg).Path) }
if ($Mask)    { $sdArgs += @('--mask', (Resolve-Path $Mask).Path) }
$fmt = { param($v) [string]::Format([System.Globalization.CultureInfo]::InvariantCulture, '{0}', $v) }
if ($Strength -ge 0) { $sdArgs += @('--strength', (& $fmt $Strength)) }
if ($ImgCfg -ge 0)   { $sdArgs += @('--img-cfg-scale', (& $fmt $ImgCfg)) }
$sdArgs += @(
  '-p', $promptText,
  '--cfg-scale', ([string]::Format([System.Globalization.CultureInfo]::InvariantCulture, '{0}', $Cfg)),
  '--sampling-method', $Method,
  '--steps', $Steps,
  '--seed', $Seed,
  '-W', $Width,
  '-H', $Height
)
if ($Turbo) { $sdArgs += @('--sigmas', 'qwen-image-2.1-turbo') }
if ($Cpu) { $sdArgs += @('--backend', 'cpu') }
else {
  if (-not $NoOffload) { $sdArgs += '--offload-to-cpu' }
  if ($TeCpu) { $sdArgs += @('--backend', 'te=cpu') }
  if ($MaxVram -ne 0) {
    # Positive caps the budget; negative means "free VRAM minus that many GiB"
    # (the engine snapshots free memory at startup, so browsers are accounted
    # for). Either way parameters stay in RAM and stream in fitting segments.
    $sdArgs += @('--params-backend', 'cpu', '--max-vram', [string]$MaxVram)
  }
  if ($VaeTiling) { $sdArgs += '--vae-tiling' }
}
# Editing needs the text + reference-image KV cache. On 8 GB VRAM the f16 cache
# does not fit (it silently falls back to ~2x slower no-cache sampling), so use
# the 8-bit cache, which does fit and keeps prefix caching enabled.
if ($Image -and $Image.Count -gt 0) {
  $sdArgs += @('--model-args', 'qwen_image_2_1_prefix_cache_type=q8_0')
}
$sdArgs += @('-o', $Out)

Write-Host ''
Write-Host 'EggLab - Qwen-Image-2.1' -ForegroundColor Cyan
Write-Host ("  mode   : " + $(if ($Image) { "edit ($($Image.Count) ref)" } else { 'text to image' }) + $(if ($Turbo) { '   turbo: 8-step LoRA' } else { '' }))
Write-Host ("  size   : {0}x{1}   steps: {2}   cfg: {3}   seed: {4}" -f $Width, $Height, $Steps, $Cfg, $Seed)
Write-Host ("  output : {0}" -f $Out)
Write-Host ''

$sw = [System.Diagnostics.Stopwatch]::StartNew()
& $engine @sdArgs
$code = $LASTEXITCODE
$sw.Stop()

if (-not (Test-Path $Out)) {
  throw ("Generation failed (exit {0}, {1:N1}s). See the engine output above." -f $code, $sw.Elapsed.TotalSeconds)
}
Write-Host ('Done in {0:N1}s -> {1}' -f $sw.Elapsed.TotalSeconds, $Out) -ForegroundColor Green
if ($Open) { Start-Process $Out }
return $Out
