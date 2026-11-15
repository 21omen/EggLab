param([int]$IntervalMs = 650)

# Streams the PhotoCraft main-window rectangle to the EggLab panel so the
# companion window can dock beside it without touching PhotoCraft itself.
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class EggLabWin {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
}
"@

while ($true) {
  $p = $null
  try {
    $p = Get-Process -Name photocraft -ErrorAction SilentlyContinue |
         Where-Object { $_.MainWindowHandle -ne 0 } |
         Select-Object -First 1
  } catch {}

  if ($p) {
    $r = New-Object EggLabWin+RECT
    $ok = [EggLabWin]::GetWindowRect($p.MainWindowHandle, [ref]$r)
    $min = [EggLabWin]::IsIconic($p.MainWindowHandle)
    if ($ok) {
      $out = @{
        pid    = $p.Id
        left   = $r.Left
        top    = $r.Top
        right  = $r.Right
        bottom = $r.Bottom
        min    = [bool]$min
      } | ConvertTo-Json -Compress
      Write-Output $out
    }
  } else {
    Write-Output '{"pid":0}'
  }
  Start-Sleep -Milliseconds $IntervalMs
}
