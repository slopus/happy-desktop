param(
    [Parameter(Mandatory = $true)][int]$ScreenX,
    [Parameter(Mandatory = $true)][int]$ScreenY,
    [Parameter(Mandatory = $true)][int]$Delta,
    [int]$Count = 1,
    [int]$IntervalMs = 75,
    [switch]$WaitForSignal,
    [switch]$PrepareUp
)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ScrollReproNative {
    [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT {
        public int dx; public int dy; public uint mouseData; public uint dwFlags;
        public uint time; public UIntPtr dwExtraInfo;
    }
    [StructLayout(LayoutKind.Explicit)] public struct InputUnion {
        [FieldOffset(0)] public MOUSEINPUT mouse;
    }
    [StructLayout(LayoutKind.Sequential)] public struct INPUT {
        public uint type; public InputUnion data;
    }
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
    [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT point);
    [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT point);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32.dll", SetLastError = true)] public static extern uint SendInput(uint count, INPUT[] input, int size);
}
'@
$window = Get-Process -Name chrome -ErrorAction Stop | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $window) { throw 'No visible Chromium window was found for native wheel input.' }
if (-not [ScrollReproNative]::SetForegroundWindow($window.MainWindowHandle)) { throw 'Could not foreground the Chromium window.' }
if (-not [ScrollReproNative]::SetCursorPos($ScreenX, $ScreenY)) { throw 'Could not move the pointer over the transcript.' }
$point = [ScrollReproNative+POINT]::new()
[void][ScrollReproNative]::GetCursorPos([ref]$point)
$targetWindow = [ScrollReproNative]::WindowFromPoint($point)
$targetPid = [uint32]0
[void][ScrollReproNative]::GetWindowThreadProcessId($targetWindow, [ref]$targetPid)
Write-Output "NATIVE_WHEEL_TARGET requested=$ScreenX,$ScreenY actual=$($point.X),$($point.Y) foreground=$([ScrollReproNative]::GetForegroundWindow()) selected=$($window.MainWindowHandle) target=$targetWindow targetPid=$targetPid delta=$Delta"
if ($PrepareUp) {
    $up = [ScrollReproNative+MOUSEINPUT]::new()
    $up.dwFlags = 0x0800
    $up.mouseData = 120
    $upUnion = [ScrollReproNative+InputUnion]::new()
    $upUnion.mouse = $up
    $upEvent = [ScrollReproNative+INPUT]::new()
    $upEvent.type = 0
    $upEvent.data = $upUnion
    if ([ScrollReproNative]::SendInput(1, @($upEvent), [Runtime.InteropServices.Marshal]::SizeOf($upEvent)) -ne 1) { throw 'Native setup wheel failed.' }
    Start-Sleep -Milliseconds 300
}
if ($WaitForSignal) {
    [Console]::Out.WriteLine('NATIVE_WHEEL_READY')
    [Console]::Out.Flush()
    if ($null -eq [Console]::In.ReadLine()) { throw 'Native wheel signal pipe closed.' }
}
$inputEvent = [ScrollReproNative+INPUT]::new()
$inputEvent.type = 0
$mouse = [ScrollReproNative+MOUSEINPUT]::new()
$mouse.dwFlags = 0x0800
$mouse.mouseData = [BitConverter]::ToUInt32([BitConverter]::GetBytes($Delta), 0)
$union = [ScrollReproNative+InputUnion]::new()
$union.mouse = $mouse
$inputEvent.data = $union
for ($i = 0; $i -lt $Count; $i++) {
    if ([ScrollReproNative]::SendInput(1, @($inputEvent), [Runtime.InteropServices.Marshal]::SizeOf($inputEvent)) -ne 1) {
        throw "SendInput failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
    }
    if ($i -lt $Count - 1) { Start-Sleep -Milliseconds $IntervalMs }
}