param([ValidateSet('standard', 'local-web')][string]$Flavor = 'standard')
$ErrorActionPreference = 'Stop'
# Installation changes registry entries and shortcuts. Run only on a disposable
# GitHub-hosted runner, never against a developer's existing Happy installation.
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') {
    throw 'The installer smoke requires a disposable GitHub-hosted Windows runner.'
}
$definition = & node --input-type=module -e "import { desktopFlavorRead } from './scripts/desktopFlavors.mjs'; console.log(JSON.stringify(desktopFlavorRead(process.argv[1])))" $Flavor | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Cannot resolve the desktop distribution' }
$release = Join-Path $PSScriptRoot "../packages/happy-desktop-electron/release/$($definition.output)"
$installers = @(Get-ChildItem -LiteralPath $release -Filter 'Happy-*-x64.exe')
if ($installers.Count -ne 1) { throw 'Expected exactly one Windows x64 installer.' }
$installer = $installers[0].FullName
if ((Get-AuthenticodeSignature -LiteralPath $installer).Status -ne 'NotSigned') {
    throw 'This workflow must produce an unsigned installer until signing is configured.'
}
foreach ($required in @(($definition.channel + '.yml'), ($installers[0].Name + '.blockmap'))) {
    if (-not (Test-Path -LiteralPath (Join-Path $release $required))) {
        throw "Missing updater artifact: $required"
    }
}
$temporaryRoot = [IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd('\') + '\'
$installation = [IO.Path]::GetFullPath((Join-Path $temporaryRoot 'happy-installer-smoke'))
if (-not $installation.StartsWith($temporaryRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Install destination must stay inside RUNNER_TEMP.'
}
if (Test-Path -LiteralPath $installation) { throw 'The installation must start empty.' }
# NSIS requires /D to be last and consumes the remaining text as the directory.
$process = Start-Process -FilePath $installer -ArgumentList "/S /D=$installation" -WindowStyle Hidden -PassThru
if (-not $process.WaitForExit(180000)) { throw 'The silent installer timed out.' }
if ($process.ExitCode -ne 0) { throw "Installer failed: $($process.ExitCode)" }
$executable = Join-Path $installation ($definition.productName + '.exe')
if (-not (Test-Path -LiteralPath $executable)) { throw "The installer did not install $executable." }
if ((Get-AuthenticodeSignature -LiteralPath $executable).Status -ne 'NotSigned') {
    throw 'The installed app unexpectedly has a signing identity.'
}
"HAPPY_DESKTOP_ELECTRON_EXECUTABLE=$executable" >> $env:GITHUB_ENV
'Unsigned NSIS installer completed successfully; the next step launches the installed Happy.exe.' >> $env:GITHUB_STEP_SUMMARY
