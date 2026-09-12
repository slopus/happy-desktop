# Requested previews

Release requests default to preview; production must be explicit. An agent chooses
an unused `X.Y.Z-preview.N` version from release history and writes user-facing
Markdown notes covering every included commit. Do not ask the person to type a
version. Merging to `main` no longer deploys the hosted renderer; all previews
are explicitly requested.

For Agent/native versions, inspect GitHub releases and tags. Renderer previews
have no release tag: inspect `gh run list --workflow local-web-pages.yml`; run
names contain their versions and successful deployments identify what shipped.

| Request                  | Dispatch from `main`                                                                  | Delivery                                                      |
| ------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Happy Agent preview      | Agent repository's `release-happy-agent.yml`: version, release_notes, prerelease=true | Agent binaries for Nightly                                    |
| Desktop native preview   | `desktop-release.yml`: version, release_notes, prerelease=true                        | Signed arm64/x64 Nightly apps and updater manifests           |
| Desktop renderer preview | `local-web-pages.yml`: version, release_notes                                         | Hosted renderer at `https://local.app.happy.engineering` only |

Each workflow validates and builds the requested source, then publishes in the same
run. No prepare/publish coordinator, bump-after-build commit, or artifact promotion
is needed. Preview versions are embedded without changing source manifests. Native
previews keep signing, notarization, verification, and checksum manifests; they do
not replace GitHub's latest stable release. Existing release tags/assets must not
be overwritten. Renderer metadata contains the version and full source SHA; notes
and identity are recorded in the workflow summary. A renderer request never ships
a native app or switches the Agent binary.

Use `gh workflow run ... --ref main` with `-f version=<chosen-version>` and
`-F release_notes=@.context/release-notes.md` (the `@` reads the file contents).
For Agent/native previews also pass `-F prerelease=true`; renderer has no such input.
Watch with `gh run watch`, and read back the
release notes, version, and assets before reporting success. For renderer previews,
verify Pages succeeded and the deployed `local-web-version.json` matches the build.
Do not create native release tags locally, push, restart an app, or deploy merely
because release tooling was changed.

Production needs no prior preview. Native production uses the same workflow with
`prerelease=false` and stable `X.Y.Z`, shipping both app flavors. Preserve its existing
requirement that root and Electron manifests match that stable version: update them
before dispatch under normal Git authorization. Standard bundles its renderer, so
production renderer delivery requires explicit native-release scope.

Nightly accepts supported stable and numbered preview Agent/native versions;
standard offers stable updates only. Existing Agent activation/drain controls,
native install-on-quit/install action, and compatibility guards remain unchanged.
Ship an initial stable native update so older Nightly hosts gain preview support;
a hosted renderer refresh cannot update Electron host code.
