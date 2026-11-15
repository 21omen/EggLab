param([string]$ProcessName = 'electron', [string]$Out = 'D:\neww\EggLab\panel\tmp\shot.png', [int]$Pad = 0)

Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class ShotWin {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int cmd);
}
"@

$p = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue |
     Where-Object { $_.MainWindowTitle -ne '' } |
     Select-Object -First 1
if (-not $p) { Write-Error "No window for $ProcessName"; exit 1 }

[void][ShotWin]::ShowWindow($p.MainWindowHandle, 9)
[void][ShotWin]::SetForegroundWindow($p.MainWindowHandle)
Start-Sleep -Milliseconds 500

$r = New-Object ShotWin+RECT
[void][ShotWin]::GetWindowRect($p.MainWindowHandle, [ref]$r)
$w = $r.Right - $r.Left
$h = $r.Bottom - $r.Top
$bmp = New-Object System.Drawing.Bitmap($w, $h)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($r.Left, $r.Top, 0, 0, $bmp.Size)
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Out) | Out-Null
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output "$Out ${w}x${h}"
