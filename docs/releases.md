# Requested previews

Release requests default to preview; production must be explicit. An agent chooses
an unused `X.Y.Z-preview.N` version from release history and writes user-facing
Markdown notes covering every included commit. Do not ask the person to type a
version. Merging to `main` no longer deploys the hosted renderer; all previews
are explicitly requested.

Validation uses one depth flag for the same stability tests and gyms. Before a
preview, run `pnpm --dir packages/happy-desktop-ui test --depth=cheap` and
`pnpm --dir packages/happy-desktop-gym test:playwright --depth=cheap`. Before
production, run both commands with `--depth=full`. Cheap is the local default;
full runs all three browser engines, the certified interaction seed matrix and
20 repetitions of its concurrent stress schedule. Neither command changes the
remote CI skip or dispatches a release. Electron gym commands read the same
`HAPPY_TEST_DEPTH=cheap|full` environment variable; use cheap for previews and
full for production when running the affected workloads.

Before choosing production, check that the user explicitly requested a production or stable
release for this product in the current task. A generic "release" or "ship" request defaults to
preview; permission to push does not authorize production. An existing explicit request is
sufficient, so do not ask for redundant confirmation.

Use the candidate ourselves in the affected workflows for at least a brief soak before releasing
it to production. Passing tests or CI alone does not count as that use. If it has not been used,
keep it in preview and explain what still needs to be tried. No fixed soak duration or previously
published preview is required.

For Agent/native versions, inspect GitHub releases and tags. Renderer previews
have no release tag: inspect `gh run list --workflow local-web-pages.yml`; run
names contain their versions and successful deployments identify what shipped.

| Request                  | Dispatch from `main`                                                                  | Delivery                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Happy Agent preview      | Agent repository's `release-happy-agent.yml`: version, release_notes, prerelease=true | Agent binaries for Nightly                                                                                                      |
| Desktop native preview   | `desktop-release.yml`: version, release_notes, prerelease=true                        | Signed macOS arm64/x64 and Windows x64 standard and Nightly apps and updater manifests, plus standard Linux x64/arm64 AppImages |
| Nightly native preview   | `desktop-release.yml`: as above, plus nightly_only=true                               | Signed macOS and Windows Nightly apps, `nightly-mac.yml` and `nightly.yml` only                                                 |
| Desktop renderer preview | `local-web-pages.yml`: version, release_notes                                         | Hosted renderer at `https://local.app.happy.engineering` only                                                                   |

Each workflow validates and builds the requested source, then publishes in the same
run. No prepare/publish coordinator, bump-after-build commit, or artifact promotion
is needed. Preview versions are embedded without changing source manifests. Native
previews keep signing, notarization, verification, and checksum manifests; they do
not replace GitHub's latest stable release. Existing release tags/assets must not
be overwritten. Renderer metadata contains the version and full source SHA; notes
and identity are recorded in the workflow summary. A renderer request never ships
a native app or switches the Agent binary.

For combined releases, follow the [cross-project sequence in Happy Agent's release
master plan](https://github.com/slopus/happy-agent/blob/main/master-plans/25-releases.md).
After any required SDK is published and pinned, prepare and dispatch requested
Agent, native Desktop, and renderer previews independently in parallel. Desktop
does not bundle the Agent binary, so its macOS and Windows previews do not wait for Agent
publication or artifact verification. Windows still installs, signature-checks, and
boots the newest Agent on the release's channel: stable for a stable Desktop, the
newest stable or preview for a preview. Report completion of a combined release after each
requested workflow and any required matching Agent version are verified.

When a fix in the release came from someone outside the team, end the notes with a
`## Thanks` section: one line per person, their linked `@login`, what they gave, and the
issue or pull request. GitHub notifies everyone a release mentions, so include it only when
the person who asked for the release has approved those names. Happy Agent's short notes files
carry the same people for the update card; see its release-agent skill.

Use `gh workflow run ... --ref main` with `-f version=<chosen-version>` and
`-F release_notes=@.context/release-notes.md` (the `@` reads the file contents).
For Agent/native previews also pass `-F prerelease=true`; renderer has no such input.
A request for Happy Nightly alone also passes `-F nightly_only=true`: the run then
builds, signs, notarizes, and publishes only the macOS and Windows Nightly apps and
their manifests, with no Linux AppImages, and refuses to start unless it is a
preview. Standard installs skip such a release, because their update feed only considers releases carrying their
platform's manifest (`latest-mac.yml` on macOS, `latest.yml` on Windows).
Watch with `gh run watch`, and read back the
release notes, version, and assets before reporting success. For renderer previews,
verify Pages succeeded and the deployed `local-web-version.json` matches the build.
Do not create native release tags locally, push, restart an app, or deploy merely
because release tooling was changed.

Before a production release, run the session gym's leak mode on the candidate. It takes about
45 minutes: 20 minutes of measurement after the warm-up. It passes only when its last line says
`leak verdict: PASS`. See ["Session gym leak mode"](../packages/happy-desktop-gym/README.md#session-gym-leak-mode).
It is not part of `pnpm test`, `pnpm check`, CI, or any release workflow, and previews do not need
it.

Immediately before dispatching production, verify both the explicit user request for this product
and our actual use of this candidate. Native production uses the same workflow with
`prerelease=false` and stable `X.Y.Z`, shipping both app flavors on macOS and Windows.
Windows installers are always Azure-signed (see `windows-release-ci.md`) and retain
their installed-app and Agent checks. Windows previews run only the Electron host's
tests, since the macOS verify job runs the full suite on the same commit first; stable
Windows runs the full suite. Native previews ship both app flavors on macOS and Windows unless `nightly_only` is set. Preserve the existing
requirement that root and Electron manifests match that stable version: update them
before dispatch under normal Git authorization. Standard bundles its renderer, so
production renderer delivery requires explicit native-release scope.

Every app flavor defaults to stable Agent/native updates. Settings → General →
Updates → Preview updates explicitly opts into supported numbered preview releases
as well as stable releases. The preference is persisted on this machine and takes
effect without a restart. Turning it off removes preview offers, disarms pending
native installs, and does not downgrade an installed version. Native updates retain
the installed app flavor; the setting does not change Nightly's hosted renderer.
Existing Agent activation/drain controls,
native install-on-quit/install action, and compatibility guards remain unchanged.
Ship an initial stable native update so older Nightly hosts gain preview support;
a hosted renderer refresh cannot update Electron host code.

## Homebrew and Linux

The standard desktop app is also distributed through `slopus/homebrew-tap`:

```sh
brew install --cask slopus/tap/happy
```

Stable and preview native releases additionally build standard Linux x64 and arm64
AppImages on native Ubuntu runners, named `Happy-<version>-<arch>.AppImage` with
the release version embedded, as on Windows. A Nightly-only preview builds none,
because Linux has no Nightly flavor. `build-linux.yml` boots each actual AppImage
with a disposable profile and asserts that its packaged Electron renderer reaches
the welcome screen, saving a screenshot. Publishing is gated on both checks. Linux
Nightly and native Linux auto-updates are not shipped: the packaged updater only
checks on macOS and Windows, so a Linux preview is installed by downloading its
AppImage, and stable installations upgrade through Homebrew. All macOS signing and
Windows checks remain unchanged.

The tap's scheduled/manual update workflow reads the latest stable GitHub release,
pins each artifact's SHA-256, and tests Homebrew installation, packaged app boot,
and uninstall on every supported OS/architecture before committing the new cask.
It uses only the tap's own workflow token, with no cross-repository secret. To
update the tap immediately after a stable release:

```sh
gh workflow run update-happy.yml --repo slopus/homebrew-tap --ref main
```

Check that workflow and the resulting cask version before reporting Homebrew
distribution complete. Never disable Gatekeeper or remove quarantine to make a
cask pass. Linux CI's Chromium sandbox override is test-runner-only, not part of
the cask or shipped app.
