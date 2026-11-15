param(
  [string]$ProcessName = 'electron',
  [int]$X = 0,
  [int]$Y = 0,
  [switch]$Right,
  [int]$Wheel = 0,
  [string]$Keys = ''
)

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class ClickWin {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, IntPtr e);
}
"@

$p = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue |
     Where-Object { $_.MainWindowTitle -ne '' } | Select-Object -First 1
if (-not $p) { Write-Error "No window"; exit 1 }
[void][ClickWin]::SetForegroundWindow($p.MainWindowHandle)
$r = New-Object ClickWin+RECT
[void][ClickWin]::GetWindowRect($p.MainWindowHandle, [ref]$r)
Start-Sleep -Milliseconds 250

if ($Keys) {
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.SendKeys]::SendWait($Keys)
  Write-Output "keys sent"
  exit 0
}

if ($Wheel -ne 0) {
  [void][ClickWin]::SetCursorPos($r.Left + $X, $r.Top + $Y)
  Start-Sleep -Milliseconds 150
  [ClickWin]::mouse_event(0x0800, 0, 0, [uint32]([int64]$Wheel -band 0xffff), [IntPtr]::Zero)
  Write-Output "wheel $Wheel"
  exit 0
}

$ax = $r.Left + $X
$ay = $r.Top + $Y
[void][ClickWin]::SetCursorPos($ax, $ay)
Start-Sleep -Milliseconds 120
$down = if ($Right) { 0x0008 } else { 0x0002 }
$up = if ($Right) { 0x0010 } else { 0x0004 }
[ClickWin]::mouse_event($down, 0, 0, 0, [IntPtr]::Zero)
Start-Sleep -Milliseconds 60
[ClickWin]::mouse_event($up, 0, 0, 0, [IntPtr]::Zero)
Write-Output "clicked $ax,$ay"
