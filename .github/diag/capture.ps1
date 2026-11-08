# Throwaway diagnostics for the Windows update repro: what is running, what holds
# files under the Agent home, and what the Agent home contains, at one moment.
param([Parameter(Mandatory)][string]$Label, [Parameter(Mandatory)][string]$Out)
$ErrorActionPreference = 'Continue'
New-Item -ItemType Directory -Force -Path $Out | Out-Null
$happyHome = Join-Path $env:USERPROFILE '.happy'
$file = Join-Path $Out "capture-$Label.txt"
function Section([string]$Title, [scriptblock]$Body) {
    "===== $Title =====" | Out-File -Append -Encoding utf8 $file
    try { & $Body 2>&1 | Out-String -Width 400 | Out-File -Append -Encoding utf8 $file }
    catch { "failed: $_" | Out-File -Append -Encoding utf8 $file }
}
Section 'processes' {
    Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'happy' } |
        Select-Object ProcessId, ParentProcessId, Name, CreationDate, ExecutablePath, CommandLine | Format-List
}
Section 'handles under .happy' { & "$env:RUNNER_TEMP\handle\handle64.exe" -accepteula -nobanner $happyHome }
Section 'handles held by happy-agent' { & "$env:RUNNER_TEMP\handle\handle64.exe" -accepteula -nobanner -p happy-agent }
Section '.happy tree (depth 3)' {
    if (Test-Path $happyHome) {
        Get-ChildItem -LiteralPath $happyHome -Recurse -Force -Depth 3 -ErrorAction SilentlyContinue |
            Select-Object @{ n = 'Path'; e = { $_.FullName.Substring($happyHome.Length) } }, Length, Attributes, LastWriteTime |
            Format-Table -AutoSize
    } else { 'no .happy' }
}
Section 'dist/config.json' { Get-Content -Raw (Join-Path $happyHome 'dist\config.json') }
Section 'dist/install.lock' { Get-Content -Raw (Join-Path $happyHome 'dist\install.lock') }
Section 'desktop/config.json' { Get-Content -Raw (Join-Path $happyHome 'desktop\config.json') }
Section 'ACL dist' { icacls (Join-Path $happyHome 'dist') /T /C | Select-Object -First 40 }
Section 'daemon.log tail' { Get-Content -Tail 120 (Join-Path $happyHome 'agent\daemon.log') }
Section 'other logs under .happy' {
    Get-ChildItem -LiteralPath $happyHome -Recurse -Force -Include *.log -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -ne 'daemon.log' } |
        ForEach-Object { "--- $($_.FullName)"; Get-Content -Tail 40 $_.FullName }
}
Section 'userData' {
    foreach ($dir in @("$env:APPDATA\Happy", "$env:APPDATA\happy-desktop")) {
        if (Test-Path $dir) { Get-ChildItem -LiteralPath $dir -Force | Format-Table Name, Length, LastWriteTime -AutoSize }
    }
    Get-ChildItem -LiteralPath "$env:APPDATA\Happy\logs" -Recurse -ErrorAction SilentlyContinue |
        ForEach-Object { "--- $($_.FullName)"; Get-Content -Tail 60 $_.FullName }
}
Section 'installed app' {
    Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall' -ErrorAction SilentlyContinue |
        ForEach-Object { Get-ItemProperty $_.PSPath } | Where-Object { $_.DisplayName -match 'Happy' } |
        Select-Object DisplayName, DisplayVersion, InstallLocation, UninstallString | Format-List
}
# The short version goes to the job log.
Write-Host "::group::capture $Label"
Get-Content $file | Select-Object -First 400 | Write-Host
Write-Host '::endgroup::'
$global:LASTEXITCODE = 0
