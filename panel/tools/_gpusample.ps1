# Sample GPU utilisation while a render runs, so we can prove whether CUDA is used.
param([int]$Seconds = 300, [string]$Out = 'D:\neww\EggLab\panel\tools\_gpu.csv')
$rows = @()
$end = (Get-Date).AddSeconds($Seconds)
while ((Get-Date) -lt $end) {
  $q = nvidia-smi --query-gpu=utilization.gpu,memory.used,power.draw,temperature.gpu --format=csv,noheader,nounits
  $rows += "$(Get-Date -Format HH:mm:ss) $q"
  Start-Sleep -Seconds 3
  if (Test-Path 'D:\neww\EggLab\panel\tools\_gpu.stop') { break }
}
$rows | Set-Content -Path $Out -Encoding utf8
