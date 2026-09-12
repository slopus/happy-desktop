# Demo gym

Records polished product demos of the real Happy desktop UI, in an isolated
gym, on completely scripted data — and treats every take as an integration
test.

See [RESEARCH.md](./RESEARCH.md) for the OSS survey behind the recorder and the
X research behind the stories the demos tell.

The selected v13 take is committed as
[uninterrupted-update-demo.mp4](./demos/resume/uninterrupted-update-demo.mp4).
It is a copy of the original `demos/resume/artifacts/v13/resume.mp4`; the
original and other generated takes remain gitignored. Recording a new take
does not overwrite this selected video.

## The shape of it

```
scripts/demo/
├── record.mjs      the front door: record, probe, list, reset
├── scenario/
│   ├── world.mjs      project files, worktrees, conversations
│   ├── inference.mjs  the inference gateway: screenplay | live | replay
│   └── runtime.mjs    scenario seeding and restart choreography
├── lib/            capture → compose → mix → encode
├── demos/
│   └── resume/
│       ├── demo.mjs
│       ├── uninterrupted-update-demo.mp4  selected take, committed
│       ├── assets/rocket-dino.png
│       ├── patches/sticker.patch
│       └── artifacts/             generated and gitignored
├── patches/        reusable literal patches
└── assets/         shared project icons and sticker palette
```

## The gym

There is one reusable gym boundary: `packages/happy-desktop-gym`. The demo
scenario imports its installed-agent resolver and typed authenticated Unix-
socket client transport from that package. `scripts/demo/scenario` is not a
second generic gym; it contains only video-specific world data, the capturable
inference screenplay, and the mid-turn restart choreography.

Every take runs against a **live Happy Agent daemon** in a private root under
`.d`: its own `HAPPY_HOME_DIR`, home directory, temp directory, Unix
socket, and token. The daemon executable comes from the selected local Happy
Agent installation. Rebase the desktop onto current `origin/main` and resolve
the latest stable Happy Agent release before filming. If it is newer than the
local installation, stage and checksum-verify its binary under `.context/`, then
set `HAPPY_DESKTOP_AGENT_EXECUTABLE` to that absolute path. This selects the gym's
binary without updating or restarting the user's daemon.
Nothing points at the real daemon, database, or
sessions in `~/.happy`; the inventory is read only to locate the executable.
The app is served by Vite in browser-local mode, told about exactly this daemon
through `HAPPY_AGENT_SERVER_SOCKET_PATH`/`_TOKEN_PATH`.

The data is a screenplay. `scenario/world.mjs` holds a presentable Happy
Desktop checkout, three background projects, two worktrees, and realistic
engineering conversations. Seeding sends each scripted user turn through the daemon's
public API; the daemon runs real runs, executes real tool calls (the update
take's soak check genuinely runs), and persists real durable history. The
screenplay is _inspired by_ the shape of real sessions but contains no real
session data — that is the contract. The private world also completes the normal
owner-profile setup with a fictional identity before the current app connects.

### Demo-local patches and assets, full app

A demo declares each patch with an explicit scope:

```js
patches: [
    { scope: "shared", source: "browser-daemon.patch" },
    { scope: "demo", source: "patches/sticker.patch" },
];
```

`demo` paths resolve from that demo's directory; `shared` paths resolve from
`scripts/demo/patches`. Demo assets always resolve from the demo directory.
Before Vite starts, the stage rsyncs the real application packages into
`.context/demo-app`, links that mirror to the existing pnpm installation, and
applies the ordinary unified patches. Vite runs the full application from that
patched mirror. Stages are reused only for consecutive demos with the same
resolved inputs, so one take cannot inherit another take's source. The timeline
and outside drivers stay in `scripts/demo`; the production tree never acquires
demo conditionals, and a future artifact can patch any owned package without
building a fixture application.

`resume` uses this boundary for the browser-only daemon lifecycle source. The
patch makes the real daemon store and restart surface addressable in a
headless browser; the update surface, retained app, reconnection, durable session,
tool execution, and daemon PID transition remain their production paths.

### All outside IO is captured

The daemon's only outside dependency is inference, and the gym owns that
boundary. Every request/response pair — seeding, scripted turns, live ad-libs —
is appended to `.d/io.ndjson`. Three gateway modes:

- `--inference screenplay` (default): answers from the world's script,
  streamed at a believable pace. Deterministic.
- `--inference replay --replay-io <io.ndjson>`: answers verbatim from a
  captured run — proof that a take's outside IO is complete.
- `--inference live`: forwards to the Anthropic API (`ANTHROPIC_API_KEY`),
  still capturing everything, so a by-hand live take becomes replayable.

### A take is an integration test

A demo may export `assert(page, gym)`. It runs after the shot against the same
live page and daemon, and a failed assertion fails the recording — `resume`
asserts the daemon is healthy _after its mid-take restart_, that the seeded
transcript is still on screen, and that the post-restart live reply actually
arrived. The changelog entry and the regression test are the same artifact.
When an assertion returns evidence, the recorder keeps it beside the video as
`<id>.evidence.json`, including the update take's actual daemon version, PID
transition, durable run identity, clock samples, and reconnect-to-response delay.

## Running it

    pnpm demo list
    pnpm demo probe
    pnpm demo record resume
    pnpm demo record --all
    pnpm demo reset            # forget the world; next run seeds a fresh one

For a pristine final take, `reset` first: live sends accumulate in the durable
world between runs, which is realistic but not deterministic.

Useful flags: `--fps <n>`, `--appearance dark|light`, `--out <dir>`,
`--keep-frames`, `--verbose`, `--inference <mode>`, `--replay-io <path>`.

By default a finished video lands in its own gitignored
`demos/<id>/artifacts/` directory. `--out <dir>` deliberately collects one or
more takes elsewhere. On this machine the recorder needs sandbox-exempt
execution: the daemon, the inference gateway, Vite, and the browser all bind
loopback listeners.

## Writing a demo

A demo is one directory in `demos/` with a `demo.mjs` exporting
`{ id, title, subtitle, run, assert }`. Keep its one-off patches, assets, and
gitignored generated artifacts beside it. `run(demo, gym)` speaks the director vocabulary; `gym` exposes the world,
the daemon client, and `daemonRestart()` — the primitive behind the update
story. Navigate to the opening shot **off camera** (raw `demo.page` calls
before the first frame-rendering primitive), so the video starts on the work.

| Call                           | What it does                                                    |
| ------------------------------ | --------------------------------------------------------------- |
| `settle(selector)`             | waits live once the take starts; preparation is off camera      |
| `hold(ms)`                     | holds the shot for a real wall-time duration                    |
| `moveTo/click/clickText`       | eased pointer, press ripple, real events                        |
| `type(text)` / `press(chord)`  | human-cadence typing, key-cap badge                             |
| `type(text, { speed: 3 })`     | faster prompt typing with a visible 3× badge, cleared afterward |
| `zoomTo(target)` / `zoomOut()` | eased camera, capped at real pixels                             |
| `caption(text)`                | caption pill; `caption(undefined)` clears it                    |
| `sticker(name, target)`        | pops an animated sticker that rides the content                 |
| `sound(name)`                  | palette cue: `click, key, key2, key3, chime, arrive`            |

## How a frame is made

1. **Capture** — headless Chromium, no OS window, so recording can never steal
   focus. A continuous CDP compositor stream supplies full-resolution images,
   sampled on one wall-time timeline even between scenario calls. The page's
   rAF, `performance.now`, CSS animation, and inference clocks remain native.
   macOS uses Metal; per-frame screenshots no longer stall live animation.
   Recorded source timestamps and frame-cadence summaries accompany the take.
2. **Compose** — Sharp lays each frame into a rounded window on a gradient
   backdrop, crops to the camera, burns in captions, stickers, and any explicit
   typing-speed badge. The intro
   fades up from black _in linear light_ (a power law commutes with
   multiplication, so encoded pixels are multiplied by `t^(1/2.2)`) with a
   gentle push-in; the outro mirrors it. No encoder-side fades.
3. **Mix** — the director's cue list becomes one sample-exact WAV: clicks on
   clicks, recorded mechanical keys under typing, a chime on send, a low arrival
   note on completion. Keypresses use the vendored CC0 sample library documented
   in `assets/sounds/mechanical/README.md`; the other cues are synthesized.
4. **Encode** — ffmpeg, H.264 + AAC, 1920×1080, faststart.

The compact desktop viewport is 1224×664 CSS at deviceScaleFactor 2.5,
delivered from a 3200×1800 scene. It keeps controls legible while retaining
real image detail for close-ups.

## Recording in a VM (Tart)

The headless recorder needs no VM: there is no OS window, so there is nothing
to isolate visually. Tart becomes worth it the day we record the **packaged
Electron app with native chrome** — real traffic lights, menu bar, dock. The
shape of that pipeline: `tart clone ghcr.io/cirruslabs/macos-sequoia-base` →
mount the repo directory → run this same gym inside the guest → record the
guest display via `tart vnc`/`ffmpeg avfoundation`. The gym's isolation story
is identical inside the VM; only the capture pass changes. Not wired up yet —
install Tart (`brew install cirruslabs/cli/tart`, free/OSS for this use) and
budget ~40GB for the base image when we want it.
