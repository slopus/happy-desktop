# Recorded take 02

Take 02 is a continuous 26.416667-second capture of released Happy Agent
`0.4.86` upgrading to `0.4.87-preview.7` through the production installer in
the private demo world. The source scaffold is
`f85f98f5bd35523070874e5c885917543f801efc`, based on product fixes
`21139b0e0883b274d845fa0750cf93276f3f390d`. Those fixes shipped in renderer
preview `0.0.94-preview.8` through
[run 38100166448](https://github.com/slopus/happy-desktop/actions/runs/38100166448).
The recorder builds the checked-out product source rather than loading that
hosted renderer.

Final files live in the gitignored `.context/demo-out/` folder:

- `seamless-update-x.mp4`: silent H.264 High, 1600×1000, 60 fps, yuv420p,
  fast-start, 1,223,090 bytes, 1,585 frames.
- `seamless-update-poster.png`: the unobscured draft and two waiting-agent
  links at 6.916667 seconds, with the pointer hidden.
- `take-02/seamless-update.mp4`, `.srt`, and `.evidence.json`: continuous source
  video, caption timing, and complete capture evidence.
- `export.json`: encoded stream and file metadata.

Finder has been opened to this folder. The square delivery was dropped by
the parent. Superseded take 01 derivatives remain under
`review-only-take-01/`; they are not final delivery files.

## What the evidence proves

The real daemon health version changes from `0.4.86` to `0.4.87-preview.7`,
and its PID changes from `78286` to `78787`. Both original durable runs are
still running after the new daemon reconnects, then both complete:

| Session                 | Original run ID            | Completed turn shown |
| ----------------------- | -------------------------- | -------------------- |
| Animate voice waveform  | `mc6f7c6f69cc74190a6f86dc` | 23.400s              |
| Preserve message scroll | `m8ca57f76c3d947b582adb3b` | 20.417s              |

The full 64-character draft survives:
`Also keep the waveform quiet while I am reading another session.`
Twenty-four characters are entered from 7.300 to 8.183 seconds while both
the actual installer and the mounted card report `starting`. During the
update, the app shell and composer retain their DOM identity, focus and
selection. The later explicit visits to both completed sessions may remount
their composers; returning to the waveform session still shows the same draft.

Observed mounted phase starts are draining at 0.667s, stopping at 7.133s,
starting at 7.233s, reconnecting at 12.883s, and done at 13.567s. The first
draining report precedes the card's reveal animation; these are DOM timestamps,
not claims that every phase was already fully visible. The production success
card says “Took 13s” and clears with the footer indicator at 16.567s.

All measured card/composer intersections have zero height and zero area at
the default 288px sidebar width. No transcript error, full-screen update
takeover, or disconnected replacement is observed. After capture, the director
visits both sessions and scrolls each entire virtualized transcript in the DOM;
both have zero conversation error cards. Encoded source contact frames, the
final poster, the restart typing frame, and the final draft frame were visually
inspected. The final product hold lasts at least three seconds.

## Real and scripted boundaries

Production code downloads both GitHub release archives, verifies their
published digests, selects the target binary, drains, stops, starts, checks
health and reconnects. The genuine browser Install action invokes that
controller. Browser bindings replace native IPC delivery only; installer
snapshots and renderer connection/catalog readiness are actual observations.
No phase timing holds or synthetic success reports are injected.

Inference replies and read-only Node tool fixtures are scripted. Both tools
execute through the actual Agent API in separate private worktrees, with file
gates controlling when they finish. Post-tool inference is held until the
new daemon has recovered both original runs, then released. This is evidence
of update continuity, not a claim of live vendor inference or successful
implementation of the fictional engineering tasks.

| Release            | Archive bytes | Verified archive SHA-256                                           | Unpacked executable SHA-256                                        |
| ------------------ | ------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `0.4.86`           | 155510673     | `a022381997a5c1a538cea079a1f36abbb8484b46851cbecaeec866ae74368ff3` | `1f413a8a8001c235438328599acf762352da9789fe2a8ba92fe478a58c8a6091` |
| `0.4.87-preview.7` | 155645712     | `cc194a63bdb3e7a8d4c2a060356716e7fb507a7c321e4d9fee701c0eabd9e762` | `36a5cd9c4a4710d1dc214a9e41e5dd292712ec4d2f64aa6495c1478d47dd6345` |

The exact archive URLs, private paths, controller timeline, health reports and
run histories are retained in the evidence JSON. The installed Electron host,
human daemon, account and keychain were untouched. This work does not release,
push, post or publish anything.

## Validation and review

The demo loads through `pnpm demo list`. Targeted formatting, Node syntax and
script lint pass. The disposable patched renderer builds, and its source mirror
typechecks after syncing the lockfile's Agent client dependency. No test suite
was added or run.

Listener-free director dry runs pass for fresh and acknowledged welcome states
with 53 and 52 actions respectively, each 22.01 virtual seconds. Their labelled
traces at `.context/director-dry-run/{trace,trace-welcomed}.json` use fixture
transport, daemon, DOM and clocks. They verify choreography only. The actual
take and its evidence provide the update, rendering and reconnection result.

The initial sandbox preflight could not listen locally (`EPERM`), and the
service tool requires Linux support unavailable on this macOS host. The user
explicitly allowed one reviewed capture plus one code-fix retry; both stopped
before filming on preparation defects. The user then allowed up to three more
scoped recorder runs. The first produced take 01; the second produced this
actual version upgrade after production and demo fixes. All reviewed runs were
allowed. One recorder run remains, only after a demo-code fix. This exception
does not authorize touching the installed host or changing the master plan.

Take 01 used a same-binary private restart and exposed card/composer overlap
and an Action not applied notice. It remains review-only. The new production
fixes, stricter director checks and take 02 resolve those observed issues.

Opus and Grok review of the final encoded take is arranged by the parent.
Independent reviewer sign-off and publication are not claimed here.
