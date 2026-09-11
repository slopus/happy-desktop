# Unsigned Windows releases

The shared `build-windows.yml` workflow produces the Windows x64 NSIS installer,
its blockmap, and `latest.yml` for Electron's updater. It runs typechecks and the
application tests, installs the actual `.exe` on a disposable hosted Windows
runner, then launches that installed `Happy.exe` through Playwright and verifies
the welcome screen. The screenshot is uploaded with the run.

To validate a branch without publishing a release:

```sh
gh workflow run desktop-validate.yml --ref <branch> -f platform=windows
```

Download `happy-desktop-windows-unsigned` from the completed run and run its
`Happy-<version>-x64.exe`. The Agent is downloaded separately by Desktop; public
onboarding requires a Happy Agent release containing its Windows x64 archive.

The existing manual `desktop-release.yml` workflow still publishes from `main`
after validating the release version and notes. It now waits for this Windows
build and includes its installer and updater files beside the signed macOS
artifacts. Apple signing and notarization remain unchanged.

Windows signing credentials are intentionally absent. Normal Windows 11 can run
the installer, but SmartScreen may warn and Smart App Control or organizational
policy may block unsigned software. No security-setting changes are made. Add a
Windows signing identity before promising installation on those restricted PCs.
Happy's sandbox setup still has its own one-time Windows administrator approval.
