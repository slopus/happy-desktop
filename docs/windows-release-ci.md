# Windows releases and signing

The shared `build-windows.yml` workflow produces Windows x64 NSIS installers for
Happy and Happy Nightly, their blockmaps, and `latest.yml` / `nightly.yml` for
Electron's updater. Both distributions use `scripts/desktopFlavors.mjs` so their
application identities, updater caches, and channels agree. It runs typechecks and the
tests its `test_scope` asks for, installs the actual `.exe` on a disposable hosted Windows
runner, then launches that installed `Happy.exe` through Playwright and verifies
the welcome screen. The screenshot is uploaded with the run.

Every Windows build is signed; there are no unsigned Windows builds. Azure's
GitHub federation trusts only `main`, so the Windows build refuses to run from any
other ref. To validate without publishing a release:

```sh
gh workflow run desktop-validate.yml --ref main -f platform=windows
```

Download `happy-desktop-windows-installer-standard` or
`happy-desktop-windows-installer-local-web` from the completed run and run its
`.exe`. The Agent is downloaded separately by Desktop; public
onboarding requires a Happy Agent release containing its signed Windows x64 archive.

The existing manual `desktop-release.yml` workflow still publishes from `main`
after validating the release version and notes. It now waits for this Windows
build and includes its installer and updater files beside the signed macOS
artifacts. The release additionally exercises Desktop's real GitHub release
lookup, checksum-verified Agent installation, saved binary selection, the Agent's
signature and version, daemon startup, and authenticated named-pipe health with a
fresh Happy home. It installs the newest Agent on the release's update channel:
stable for a stable Desktop, and for a preview the newest stable or preview release
that has a Windows archive, so a preview never waits for a new Agent. Publish the
Windows Agent before dispatching a stable Desktop release. Previews build, sign,
install-test, and publish Windows too, with the preview version embedded in the
installer and its manifest, and a Nightly-only preview builds the Nightly installer
alone. Apple signing and notarization remain unchanged.

| Windows check                                      | Stable (`test_scope: full`) | Preview (`test_scope: preview`) |
| -------------------------------------------------- | --------------------------- | ------------------------------- |
| Electron, app, and gym typechecks                  | Yes                         | Yes                             |
| `happy-desktop-electron` tests                     | Yes                         | Yes                             |
| App, state, UI, and gym tests (`pnpm test`)        | Yes                         | No; macOS verify runs them      |
| Agent download, install, signature, and boot       | Stable channel              | Preview channel                 |
| Signed installer, install verification, and launch | Yes                         | Yes                             |

Previews skip only the platform-independent product suites: `desktop-release.yml`'s
macOS verify job runs the full `pnpm test` on the same commit, and the Windows build
starts only after it passes. `desktop-validate.yml` keeps the full set.

Installed Windows apps update themselves as macOS does: Desktop picks the newest
release allowed by the Preview updates setting that carries `latest.yml` (or
`nightly.yml` for Nightly), and electron-updater installs it only after confirming
the downloaded installer is signed by the publisher pinned in `app-update.yml`.

## Azure Artifact Signing

A missing setting, failed signature, or unexpected publisher fails the build;
there is no unsigned fallback.

Configure these GitHub Actions repository variables:

| Variable                    | Value                                                                 |
| --------------------------- | --------------------------------------------------------------------- |
| `AZURE_CLIENT_ID`           | Application/client ID for the GitHub signing identity                 |
| `AZURE_TENANT_ID`           | Azure tenant ID                                                       |
| `AZURE_SUBSCRIPTION_ID`     | Subscription containing the signing account                           |
| `WINDOWS_SIGNING_ENDPOINT`  | Regional signing endpoint, e.g. `https://wus2.codesigning.azure.net/` |
| `WINDOWS_SIGNING_ACCOUNT`   | Artifact Signing account name                                         |
| `WINDOWS_SIGNING_PROFILE`   | Approved Public Trust certificate profile name                        |
| `WINDOWS_SIGNING_PUBLISHER` | Exact certificate common name or full subject, as approved by Azure   |

The Azure application needs a federated credential with issuer
`https://token.actions.githubusercontent.com`, audience `api://AzureADTokenExchange`,
and subject `repo:slopus/happy-desktop:ref:refs/heads/main`. Assign it **Artifact
Signing Certificate Profile Signer**, scoped to the certificate profile. No
client secret, PFX, or private key is stored in GitHub. Human identity verification
uses a separate **Artifact Signing Identity Verifier** role.

Electron Builder signs the application, native files, uninstaller, and NSIS
installer before generating the blockmap and updater manifest. CI verifies the
timestamped signatures and publisher on the installer and installed native files,
the updater's publisher pin, and the final installer's SHA-512 and size. The
release also refuses a published Agent that is not validly signed.

A certificate renewal under the same publisher can use the existing updater pin.
Changing the publisher later needs an updater migration: ship a bridge accepting
both identities first and account for users who skip that bridge release.

Signing establishes a verified publisher; SmartScreen reputation accrues to that
identity across releases, but is not guaranteed immediately. Happy's sandbox setup still
has its own one-time Windows administrator approval.
