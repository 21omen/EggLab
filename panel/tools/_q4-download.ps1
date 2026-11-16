#requires -Version 5.1
<#
  Sequential chunked download for the Q4_K_M test model.

  The HF CDN here serves a single range request at ~3 MB/s but stalls long
  connections after ~150 MB and refuses parallel connections. So: pull 200 MB
  ranges one at a time (each short-lived and resumable), concatenate in order,
  verify the LFS sha256, then publish the final filename.
#>
param(
  [string]$Url = 'https://huggingface.co/unsloth/Qwen-Image-2.1-GGUF/resolve/main/qwen-image-2.1-Q4_K_M.gguf',
  [string]$Out = 'D:\neww\Models\qwen-image-2.1-Q4_K_M.gguf',
  [int64]$ChunkBytes = 209715200
)

$ErrorActionPreference = 'Stop'
$dir = Join-Path (Split-Path -Parent $Out) 'q4-chunks'
New-Item -ItemType Directory -Force -Path $dir | Out-Null

$head = curl.exe -sSI -L --ssl-no-revoke --max-time 30 -- $Url 2>&1
$size = 0
$sha = ''
foreach ($line in $head) {
  if ($line -match '(?im)^content-length:\s*(\d+)') { $size = [int64]$Matches[1] }
  if ($line -match '(?im)^x-linked-etag:\s*"?([0-9a-f]{64})') { $sha = $Matches[1].ToLower() }
  if ($line -match '(?im)^etag:\s*"?([0-9a-f]{64})') { $sha = $Matches[1].ToLower() }
}
if (-not $size) { throw 'could not read content-length' }
$count = [int][Math]::Ceiling($size / $ChunkBytes)
Write-Host "size=$size chunks=$count chunkBytes=$ChunkBytes sha=$sha"

for ($i = 0; $i -lt $count; $i++) {
  $start = [int64]$i * $ChunkBytes
  $end = [Math]::Min($size - 1, $start + $ChunkBytes - 1)
  $expect = $end - $start + 1
  $file = Join-Path $dir ('part{0:D3}' -f $i)
  $have = 0
  if (Test-Path $file) { $have = (Get-Item $file).Length }
  if ($have -ge $expect) {
    Write-Host ("chunk {0}/{1} already complete" -f $i, $count)
    continue
  }
  $ok = $false
  for ($attempt = 1; $attempt -le 6 -and -not $ok; $attempt++) {
    $have = 0
    if (Test-Path $file) { $have = (Get-Item $file).Length }
    if ($have -ge $expect) { $ok = $true; break }
    $from = $start + $have
    $range = '{0}-{1}' -f $from, $end
    $tmp = "$file.tmp"
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    curl.exe -sS -L --ssl-no-revoke --retry 3 --retry-all-errors --connect-timeout 20 --speed-limit 1024 --speed-time 45 -r $range -o $tmp -- $Url 2>&1 | Out-Null
    if (Test-Path $tmp) {
      $dest = [IO.File]::Open($file, [IO.FileMode]::Append)
      try {
        $src = [IO.File]::OpenRead($tmp)
        try { $src.CopyTo($dest) } finally { $src.Dispose() }
      } finally { $dest.Dispose() }
      Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    }
    $have = (Get-Item $file -ErrorAction SilentlyContinue).Length
    if ($have -ge $expect) { $ok = $true }
    else { Write-Host ("chunk {0} attempt {1}: {2:N1}/{3:N1} MB" -f $i, $attempt, ($have / 1MB), ($expect / 1MB)) }
  }
  if (-not $ok) { throw "chunk $i failed after retries" }
  Write-Host ("chunk {0}/{1} ok ({2:N1} MB)" -f $i, $count, ($expect / 1MB))
}

$assembled = "$Out.assembling"
$stream = [IO.File]::Create($assembled)
try {
  for ($i = 0; $i -lt $count; $i++) {
    $file = Join-Path $dir ('part{0:D3}' -f $i)
    $fs = [IO.File]::OpenRead($file)
    try { $fs.CopyTo($stream) } finally { $fs.Dispose() }
  }
} finally { $stream.Dispose() }

$got = (Get-FileHash $assembled -Algorithm SHA256).Hash.ToLower()
if ($sha -and $got -ne $sha) {
  Remove-Item $assembled -Force
  throw "sha256 mismatch: got $got expected $sha"
}
Move-Item $assembled $Out -Force
Remove-Item $dir -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "$Out.part" -Force -ErrorAction SilentlyContinue
Write-Host "DONE $Out $((Get-Item $Out).Length) bytes sha256=$got"
