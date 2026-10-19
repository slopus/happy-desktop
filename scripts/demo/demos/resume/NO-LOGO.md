# No-logo re-record

The selected fresh capture is `.context/demo-out/no-logo-take-02/`. Its exported
MP4, poster, SRT and export metadata are in `.context/demo-out/`, using the
existing `seamless-update-x.mp4`, `seamless-update-poster.png`,
`seamless-update.srt` and `export.json` names. The original recording remains
untouched in its original workspace and in the earlier review history.

Only the recording hides `[data-happy-desktop-ui="sidebar-brand-logo"]` with
`visibility: hidden`. The ordinary header, trailing control, app dimensions,
360px sidebar, conversation and update card retain their geometry. Every DOM
sample asserts that the wordmark stays hidden. No product or Electron host
source changes are needed.

## Reproduce

Use this scaffold's locked dependencies (`pnpm install --frozen-lockfile`). A
newer installed Agent client can reject the original published releases before
the sidebar mounts. The first local attempt caught that mismatch and produced
no selected footage; take 02 uses the matching lockfile.

```sh
pnpm demo reset
HAPPY_DEMO_AGENT_CACHE=.context/shared-agent-cache pnpm demo record resume --out .context/demo-out/no-logo-take-02 --keep-frames
node scripts/demo/demos/resume/export.mjs .context/demo-out/no-logo-take-02
```

Real-browser recording on macOS requires reviewed full-access execution. It
uses only the private `.d` Agent world and headless browser, with no installed
Electron host or human daemon changes.

The optional explicit cache contains `<version>/happy-agent` and an
`artifacts.json` array copied from the original capture's verified artifact
evidence. Entries carry `version`, `archiveUrl`, `archiveSha256`, `archiveBytes`
and `executableSha256`. The helper checks URL, digest and size against the live
published release metadata, independently hashes each cached executable, and
copies it into the fresh private world's version cache. The production
installer then performs its ordinary selection, drain, stop, start and
reconnect path. Without this input, the existing production downloader runs.
This capture reused verified extracted binaries; it did not redownload their
compressed archives. The transferred `provenance.json` records their source.

## Selected take evidence

The MP4 is silent H.264 yuv420p, 1080×1080 at 60 fps, 1,081 frames and
18.016667 seconds, 809,121 bytes. Fast-start `moov` precedes `mdat`. Its poster
is at 4.766667 seconds. The continuous capture covers 18,015.894ms of wall
time and 921 distinct compositor frames.

Agent `0.4.87-preview.6` → `0.4.87-preview.7` changed PID `22432` → `26007`.
Run `ma3e4b3d1a86641ceabe56c8` remained running across restart and completed
after 15,605ms, displaying `Completed in 15s`. The updated card shows `Took 10s`.
Scripted inference and two real Node fixture tools remain the original story;
`node verify.mjs` starts only after recovery and emits `Both states verified.`
The private database's durable `tool.started` / `tool.completed` events give
exact bounds relative to the turn: `node check.mjs` runs at 0.307–5.582s
(5.275s), and `node verify.mjs` at 13.059–15.122s (2.063s). A read-only
extraction is retained in `no-logo-take-02/tool-timings.json` beside the main
recording evidence.

| DOM phase    | Video seconds | Seconds since original turn began |
| ------------ | ------------: | --------------------------------: |
| Draining     |      1.866667 |                             2.235 |
| Stopping     |      5.500000 |                             5.871 |
| Starting     |      5.600000 |                             5.993 |
| Reconnecting |      9.033333 |                             9.407 |
| Updated      |     11.916667 |                            12.293 |
| Card clears  |     14.916667 |                            15.293 |

The same running turn is sampled after recovery at video 12.200s. Fresh text
appears at 12.650s and the next tool at 12.666667s. The visible final completion
is sampled at 15.433333s. Caption intervals are 0–2.250s, 5.600–12.317s and
15.433–18.017s; their wording remains unchanged.

The native/DOM recording assertions pass, including version/PID change,
original run identity, capability/chrome equality, monotonic clock, empty
composer, retained shell/composer nodes and zero errors. The encoded contact
sheet covers opening, drain, start, reconnect, resumed tool and completion;
those frames and the poster were visually inspected as logo-free. Node syntax,
targeted formatting and script lint pass. No test suite was added or run, and
nothing was pushed or published.
