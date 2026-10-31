# happy-desktop-gym

`happy-desktop-gym` contains the reusable browser-rendering harness and an
isolated, host-native Electron performance gym for Happy Agent.

## Electron Happy Agent gym

### Hidden windows

Gyms run with a real window that is hidden and non-interactive for the person
at the machine. It is never visible, never focused, cannot be clicked, and has
no Dock tile, Cmd-Tab entry, or Mission Control presence, while it still
renders, lays out, composites, takes input, and produces screenshots and video.

- Launch the app only through `gymElectronLaunch`
  (`sources/electron/launch.ts`, exported from `happy-desktop-gym/electron`). It
  sets `HAPPY_DESKTOP_WINDOWS_HIDDEN=1`, requires an owned `--user-data-dir`,
  and refuses a build that has no hidden-window mode.
- A packaged build refuses every debugger (its Electron fuses and
  `sources/main/main.ts` reject `--inspect*` and `--remote-debugging-*`), so
  Playwright cannot drive it. The `smoke` command instead runs it through
  `gymElectronProcessRun`, with the same hidden mode and owned user data, and
  reads the report the app writes for `HAPPY_DESKTOP_SMOKE_REPORT`
  (`happy-desktop-electron` `sources/main/desktopSmokeReport.ts`).
- Record video with `gymElectronVideoRecord(page, { path, scale })`: it writes
  the hidden window's own compositor frames (CDP screencast) to WebM. Never
  pass Playwright `recordVideo`.
- Never call `page.bringToFront()`, `open`, osascript, `screencapture`, or any
  other desktop capture. Screenshots come from `page.screenshot()` or
  `webContents.capturePage()`.

The app side is `happy-desktop-electron/sources/main/hiddenWindows.ts`. Hidden
mode turns on for `HAPPY_DESKTOP_WINDOWS_HIDDEN`, for any
`HAPPY_DESKTOP_GYM_PROFILE`, and for any launch through Playwright's Electron
loader, so an ad-hoc `_electron.launch` is hidden even without the flag. The
process becomes an accessory application before launch finishes; windows are
created with `show: false`, keep painting (`paintWhenInitiallyHidden`, no
background throttling), and every API that would show, focus, raise, maximize
or full-screen a window, open a dialog, or hand a link or file to another
application is replaced. A window that becomes visible or focused anyway is
hidden and the process exits with code 87.

Measured on macOS with Electron 45: a never-shown window runs
requestAnimationFrame at the display rate (≈120/s), lays out, keeps
`-webkit-app-region`, reports `visibilityState: "visible"`, delivers ≈90
screencast frames/s, captures at device resolution, and takes CDP and
`sendInputEvent` clicks and typing. Offscreen rendering (`offscreen: true`)
was rejected: it renders at 1× and 60 frames/s through a different
compositor. Positioning a window off every display was rejected: the window
server still orders it in, and macOS may constrain it back on screen.

The `hidden-window` workload (first in `all`) proves the contract on a seeded
session: it samples the main process every 20ms and, on macOS, the window
server every 25ms (`windowServer.swift`, built with `swiftc` on first use; it
must run with window-server access, and refuses to pass when it sees no
windows at all), while requiring frames, layout, clicks, typing, a screenshot,
`capturePage`, and a video. It then asks the app to show, focus, raise, and
maximize its window and to open a dialog, and requires it to stay hidden.
Every run also asserts invisibility after launch and after each workload.

An agent's recording script against a prepared run root:

```ts
const app = await gymElectronLaunch({
    args: [`--user-data-dir=${paths.electronUserData}`, entrypoint.main],
    cwd: paths.workspaceRoot,
    env: runtime.environment,
    executablePath: entrypoint.executable,
});
const page = await app.firstWindow();
const video = await gymElectronVideoRecord(page, { path: "/abs/out.webm", scale: 2 });
// …drive the page with Playwright…
await video.stop();
await gymElectronInvisibleAssert(app);
await app.close();
```

### Windows and public-repository load

The native runner supports Windows named pipes, an isolated `USERPROFILE` and
AppData, native PowerShell tool commands, and hidden background Git/daemon
helpers. Set `HAPPY_DESKTOP_AGENT_EXECUTABLE` to an absolute built agent `.exe`;
`HAPPY_DESKTOP_ELECTRON_EXECUTABLE` can select an installed Electron binary.
The Windows runner uses that agent executable directly, without a symlink or
`.cmd` wrapper. Desktop navigation clicks the actual sidebar and conversation
tabs: connection routers do not follow arbitrary URL-hash changes.

Build and run from PowerShell at the repository root:

```powershell
$env:HAPPY_DESKTOP_PROFILE = '1'
$env:HAPPY_DESKTOP_PROFILE_MODE = 'optimized'
# Only when testing a local source daemon reporting 0.0.0:
$env:HAPPY_ALLOW_SOURCE_AGENT = '1'
pnpm --dir packages/happy-desktop-electron build
node --import tsx packages/happy-desktop-gym/sources/electron/cli.ts prepare --profile realistic
# Use the root printed by prepare and a previously checked-out public repository:
node --import tsx packages/happy-desktop-gym/sources/electron/cli.ts attach-repository --root C:\path\to\hdg\g-RUNID --repository C:\path\to\public-checkout
node --import tsx packages/happy-desktop-gym/sources/electron/cli.ts run --root C:\path\to\hdg\g-RUNID --workload public-repository
```

`attach-repository` makes a separate local clone, checks out the source HEAD,
records its commit and tracked-file count in the manifest, and seeds four
40-turn conversations through real Agent APIs. Prompts include checked-out
source excerpts and file paths; responses use the profile's deterministic long
history lane. It verifies persistence after restarting the daemon. The source
checkout stays untouched, and no repository scripts or dependencies are run.
The additive counts remain distinct from the original versioned dataset.
Run this workload on `realistic` or `stress` for substantial transcript load.

Set `HAPPY_DESKTOP_GYM_AGENT_PROFILE=1` to additionally request Bun CPU profiles
in the owned artifacts directory. Bun writes those on process exit; renderer
Chromium traces and React profiles still come from the app's native profiler.
Use identical fixtures and profiler settings for before/after comparisons.
Deterministic inference makes performance repeatable; it does not replace a
separate test with an authenticated real provider.

The public-repository scroll lane hydrates its long transcript before starting
the concurrent streams. Trusted upward wheel input releases follow mode before
each deterministic position jump; the measured position must reach its target
within eight pixels. A run pinned at the latest message fails this check.

`--workload background-drafts` opens a seeded long conversation and applies 100
real API draft updates to another conversation, then restores its original draft.
It verifies that the visible conversation stays selected and captures the native
profile and screenshot. This lane preserves history for repeated comparisons.
History preparation waits on durable run-completion events rather than repeatedly
downloading transcripts. Its `seed-progress.json` records completed turns; the
catalog check verifies all seeded identities from one authoritative bootstrap.

The gym creates one disposable run under `<system-temp>/hdg/g-<run-id>` by
default. Every mutable path belongs to that one short root: `HOME`, `TMPDIR`,
`HAPPY_HOME_DIR`, the Happy Agent socket and token, Electron user data,
deterministic Git repositories, real Happy Agent worktrees, and profiler
artifacts. A stopped, prepared run has this representative shape:

```text
<system-temp>/hdg/g-1234abcd/
├── .happy/
│   ├── agent/
│   │   ├── agent.sqlite{,-shm,-wal,.lock}
│   │   ├── auto-agent.sqlite{,-shm,-wal,.lock}
│   │   ├── daemon.log
│   │   ├── observation/agent.log
│   │   ├── runtime.toml
│   │   └── token
├── Happy/
│   ├── Config/
│   │   ├── AGENTS.md
│   │   ├── SECURITY.md
│   │   └── happy.toml
│   └── Generated/
├── home/
│   ├── .cache/
│   ├── .config/
│   ├── .local/
│   ├── .bash_profile
│   └── .zprofile
├── tmp/
├── projects/
│   └── gym-project-01/
├── workspaces/
│   └── gym-project-01/gym-project-01-work-02/
├── bin/
│   └── happy-agent -> <selected installed Happy Agent>
├── artifacts/
├── electron-user-data/
├── electron-user-data-<build>/
├── .happy-desktop-gym-owner.json
├── manifest.json
├── inference.ndjson
├── stream-events.ndjson
├── session-cluster.json
├── achieved.json
└── prepared.json
```

While the daemon is live it creates `.happy/agent/server.sock`, its PID file,
and its internal module sockets beneath the same agent directory; shutdown
removes the live socket. Electron first creates the empty `electron-user-data/`
launch base, then the development app selects `electron-user-data-<build>/` for
its actual profile. The installed Agent adds extracted runtime assets beneath
`tmp`, but nothing gets a parallel external root.

`HAPPY_HOME_DIR=<run>/.happy` is the authoritative Agent boundary. The Agent
derives its socket and token there; the launcher also names those same two paths
explicitly to tell Electron this particular daemon is owned by Gym, not by the
desktop's install/update lifecycle. All three values remain within the one run
root. The launcher supplies an exact allowlisted environment and uses the
run-owned `Happy/Config/happy.toml` with
`settings.happy_integration = false`, and supplies no Happy credentials.
Consequently a local desktop Gym does not start the optional Happy account/mobile
session mirror or pollute the developer's production account.

The gym writes an ownership marker, then seeds agents and durable transcripts
through the Happy Agent `/v0` API.
It never writes daemon storage directly. Preparation proves the exact
project/worktree catalog, durable agent transcript, and seeded-turn invariants
through that public API. The live event journal drives the streaming workloads;
it is intentionally treated as bounded delivery, not durable history. The run
root retains `achieved.json` before validation, including failed
realistic/stress preparations, so no unprepared host snapshot is claimed as
seeded history. The fixture manifest also validates the regular-repository shape:
smoke is 38 files with 9 changed records, 1,120 large-text lines, and 101,280
large-text bytes; realistic and stress scale those same nested modified,
added, renamed, and deleted paths to their declared file/byte/line targets.

Measured Electron stays host-native on macOS. Docker is intentionally not used
for the measured app; it remains an optional place to isolate a backend/tool
fixture if a workload needs one.

Build the app once, then prepare and run:

```sh
pnpm --dir packages/happy-desktop-electron build:profile:optimized
pnpm --dir packages/happy-desktop-gym gym:electron prepare --profile smoke
pnpm --dir packages/happy-desktop-gym gym:electron run --root <printed-run-root> --workload all
```

`build:profile:optimized` enables the checked-in React DevTools profiling bridge
with the production-shaped renderer. The `gym:electron:run` script rebuilds this
optimized flavor, then launches the built `dist/main.js` through host Electron
with `HAPPY_DESKTOP_PROFILE_MODE=optimized`; it never launches `pnpm dev`,
`dev:electron`, or a Vite server. Runs invoke the app's native profiler bridge
at each workload boundary and record the returned app-owned artifact manifest,
alongside workload timing/context and Playwright action traces under the owned
run root. The app owns React/DevTools, heap/DOM/process, and native trace
collection and artifact writing; Gym only starts/stops that bridge and records
its returned paths. Playwright UI traces are disabled by default and can be
requested with `--ui-trace`; they are debugging aids, not profiler artifacts.
Each workload sample references its unchanged manifest, Chromium trace, raw
metrics, and any React DevTools 6.1.5 backend profile payloads the bridge produced;
scenario timestamps and browser marks are the only Gym metadata added beside
them. An empty React-profile list remains an explicit bridge-capability result,
never a Gym replacement or re-serialization. If the profile build or bridge is
unavailable, Gym falls back to bounded heap/DOM/process snapshots and reports
the capability honestly.

`window-edge-resize` reuses the prepared profile's first durable long-chat
session; it does not submit messages or manufacture another fixture. The
workload refuses to run until the seeded long-chat marker is visible and the
message list is hydrated, virtualized, scrollable, and nonempty. With the right
panel open, it drives fixed-origin and moving-origin 380px round trips in 2px
updates every 5ms. Animation-frame gaps are calibrated against idle frames
captured immediately around each sweep and reported with estimated dropped
frames, long frames, browser long tasks, delivered viewport widths, and panel
geometry. Every sampled frame must keep rendered transcript rows mounted. The
window is resized while hidden (see [Hidden windows](#hidden-windows)), and the
workload never controls the system cursor.

Run it repeatedly against one already-prepared root:

```sh
pnpm --dir packages/happy-desktop-gym gym:electron run \
  --root <printed-run-root> \
  --workload window-edge-resize
```

`stop-shimmer` starts a slow turn, presses the composer's Stop, and requires
every sidebar row the turn made `working` to settle within a second. It runs
on a project conversation. The inference server streams any turn opened by
`GYM_STOP_SHIMMER_PROMPT` for about a minute. The run writes
`stop-shimmer-classic.json` with the rows sampled every 50ms after Stop,
before/after screenshots, and a video. Prepare a fresh root for it: a daemon
restart resumes a turn that was stopped mid-stream.

`jump-shimmer` starts the same slow turn in the seeded long chat, scrolls the
transcript up, and requires the jump-to-latest button to shimmer while the
agent works and to show the plain arrow, on the same pixels, after Stop. It
writes `jump-shimmer.json`, working/idle screenshots, and a video.

`window-zoom` sweeps the window's zoom over 80, 90, 100, 110, 125 and 150%,
each reached as the View menu does it and again after a reload (which keeps the
zoom but not the menu's report of it), with the sidebar open and folded, in a
window and in full screen (the app's own window-state report; a hidden window
never really goes full screen). In a window the sidebar toggle must start at
84pt, 16pt past the traffic lights, at every zoom. Every title-band control
with a shortcut is hovered, and what it reveals must hang under it, inside the
window. Screenshots of each step land in the run's artifacts.

The Gym selects the Happy Agent installation recorded by the current Happy home.
To use another installed executable, set
`HAPPY_DESKTOP_AGENT_EXECUTABLE=/absolute/path/to/happy-agent`.

`mixed-replay` is the end-to-end lane. It reads the existing
`gold-five-minute-session.v1.json` recording for its real submitted-message
patterns, submits those prompts concurrently to several durable Happy Agent conversations,
and starts one real isolated `exec_command` turn that appends deterministic
large-file lines through the mounted fixture checkout. A single promise-
coordinated UI lane then switches repeatedly among foreground sessions while
all streams and the Git watcher are live, scrolls a virtualized long transcript
through large jumps, and exercises changed-file, document, and syntax
A→B→A sequences. The live Happy Agent event stream, the exact virtual
changed-file row/stat pair for `src/changes/modified/deep/large-modified.md`,
and a host-side fixture read are the event/UI barriers; the row is remounted after the real tool
completes and must report the profile's expected insertions plus `−16`
deletions. The lane does not use fixed sleeps as stream or file-arrival
barriers; the selection diagnostic deliberately holds a native range for two
seconds after the cold worker replacement has settled. SSE collectors
attach before submissions, and each run barrier is keyed by its returned run
ID. Every stream,
session switch, scroll, and file interaction has an ISO timestamp and latency,
alongside per-interaction buffered `PerformanceObserver` long-task observations,
before/after performance capture, and cache-oriented cold/warm timing evidence.
The same UI lane also measures transcript scroll stability directly in the
renderer: it samples message-list scrollTop, bottom distance, the first visible
virtual row, the lowest visible row's bottom-edge offset, row rectangles, and
client/scroll heights on every animation frame while dragging the real left-edge
panel and sidebar splitters, folding each panel away and restoring it, resizing the
native window, and growing and shrinking the multiline composer.
Following readers must stay within 8px of the bottom without a temporary
break-and-recovery correction or overlapping virtual rows; parked readers must
retain the same authoritative model-space row and offset through splitter drags in
both directions, panel/sidebar toggles, and window resizing. That is the product's
one-observer width-reflow contract: text naturally rewraps inside the stable row
without DOM-range tracking or per-row measurement. Composer height changes do not
rewrap text, so they retain the exact lowest visible text glyph and bottom-edge
offset. The recorded `scrollStability` phases name the contract they enforce and
distinguish natural text rewrap from a lost scroll anchor.
The standalone `streaming` workload submits through the real composer six times. A
following send must remain exactly pinned while the working status and response
stream grow, including a stable status-to-composer gap; a parked send must retain
the same glyph while the same durable SSE path appends below it, including when
the cleared composer changes the viewport's raw scrollTop. A
third send wheels away from the tail while SSE is active and requires the reader's
new glyph to remain fixed for the rest of the stream. A fourth slow-chunk response
forms a real GFM table over SSE. The prospective header must remain progressively
visible as text before it becomes a table; its own columns may reflow as rows arrive.
Every painted frame must nevertheless keep the completed prefix node, the transcript
at the bottom, and the status-to-composer gap stable. The capture continues through
the settled `Completed in` row and separately requires its 32px activity slot, 24px
composer gap, 14px/20px typography, and color to stay stable without a correction
frame. The explicit live-status to settled-summary structural transition is not
treated as a same-node resize.
A fifth response executes a real `apply_patch` in the mounted worktree and measures
the painted generic-running → settled-file-diff transition. The 32px activity row
and its 20px text/stats line must stay equal while unchanged visible-row spacing
remains rigid. A sixth response applies a trusted 4px upward wheel gesture during
active SSE. That smallest possible escape must take ownership immediately; raw
scrollTop, the first visible row, and every stable visible-row pair must then remain
fixed while the transcript continues growing below the reader.
The Happy Agent JustBash gym mount is the
actual ready managed worktree at `/workspace`; the live tool mutates that same
worktree while clustered sessions stream and switch in the same run. The
changed-file lane establishes a native browser text range only after the
highlight-first viewer reveals its final diff DOM. `changedFileSelection` then
records the exact native selection at 0, 100, 500, 1,000, and 2,000 milliseconds
while the concurrent streams continue.
Every sample must retain the same text, length, connected endpoints, and diff
mode, and Pierre's settled shadow DOM must not mutate at all. This proves stable
file/options identity prevents unrelated store notifications from rebuilding
an unchanged diff; the product does not bookmark or restore native selections.
highlight lane opens `README.md` → `src/long-transcript.md` → `README.md`
through MarkdownDocument/Pierre, requires the fenced-code completion barrier,
and records the Pierre Markdown A→B→A warm cycle. The mixed document lane uses
non-fenced Markdown paths for transport/file-loading timing separately.
The standalone `long-chat-scroll`, `session-switch-load`, and
`changed-files-warm` workloads expose those dimensions independently; `all`
runs them together with the existing boot/catalog/streaming/memory lanes. The
gold protocol frames are not
fabricated into the server: only the recording's submitted user text is reused
through real `submitMessage` calls, and the result records that limitation.
The launcher uses the workspace's Electron binary; when a package install has
not downloaded it yet, point `HAPPY_DESKTOP_ELECTRON_EXECUTABLE` at an installed
host Electron executable. The measured app is never moved into Docker.

Profiles are deterministic and versioned: `smoke`, `realistic`, and `stress`.
An explicit `--root` must be a direct child of `<system-temp>/hdg`; omitting it
is the simplest and safest option. `--artifact-dir` is the sole intentional
escape hatch: artifacts may stay in the run root or be written to the
workspace's `.context` directory.

```sh
pnpm --dir packages/happy-desktop-gym gym:electron prepare --profile realistic
pnpm --dir packages/happy-desktop-gym gym:electron run --root <printed-run-root> --workload mixed-replay
pnpm --dir packages/happy-desktop-gym gym:electron clean --root <printed-run-root>
```

`clean` refuses paths outside the system temporary Gym directory and paths
without the Gym ownership marker. Keep a run for inspection, or clean it
explicitly after collecting the artifacts.

## Session gym leak mode

`perf/sessionGym.ts` drives the production renderer in Chromium against a perf
daemon over a copied installation. `PERF_MODE=leak` turns it into a long memory
and correctness test that nobody has to watch in DevTools. It is the check to run
before a production release (see `docs/releases.md`). It is opt-in only: it is
not part of `pnpm test`, `pnpm check`, CI or the normal gym runs.
`perf/leakGym.sh` clones the fixture, starts the daemon and the web host with
`perf/leakProbe.ts` preloaded, and runs it:

```sh
PERF_FIXTURE=/path/to/data PERF_AGENT_REPO=/path/to/happy-agent \
PERF_RENDERER_DIR=/path/to/renderer-build PERF_RUN_DIR=$PWD/.context/lk/a \
PERF_PORT=5741 PERF_SEED=424242 \
  packages/happy-desktop-gym/perf/leakGym.sh
```

`PERF_FIXTURE` holds `pristine/` (the two SQLite files), `home/`, `fakefs/` and
`browser-profile/`. Build the renderer with `perf/vite.names.config.ts`, which
keeps component names. Keep `PERF_RUN_DIR` short, because the daemon socket
lives in it.

For a release, the duration is fixed: the defaults give 20 minutes of measurement
(`PERF_LEAK_MINUTES`) after a warm-up of about 25 minutes. The run passes when
every line is `PASS` or `PLATEAU` and the last line reads
`leak verdict: PASS`. The script exits non-zero otherwise.

- **Warm-up.** Growth is judged only once every bounded store is full. Otherwise
  a cache filling to its bound looks like a leak. The warm-up fills each store
  with the same kind of content the mix produces:
    - it reloads the page and restarts the daemon
    - it replays 105 recorded runs into each stream target, past the 100 runs a
      session nobody reads keeps, which also turns over the daemon's event buffer
    - it tours every heavy session, which evicts the kept views
    - it fills the home chat's prepared-text cache to its budget with paragraphs
      seen once each
    - it sends 230 runs into the home chat, past the 200 at which a followed chat
      sheds its oldest
    - it runs three minutes of the mix
- **Load.** A seeded mix weighted like a person working in one main chat:
    - follow bursts into the open chat
    - composer sends and rapid sends with replayed recorded runs
    - drafts kept across switches
    - glances by sidebar, palette and direct click
    - flicks through history up to the top
    - streams out of sight, and returns to them
    - rapid switching

    Every action ends in the home chat, so the layout cache of the chat a reader
    keeps open is never evicted. The seed fixes the action sequence and is printed
    first, so a failing run can be replayed exactly. Replies are real recorded text
    plus a unique marker.

- **Samples.** One sample every 30 s. Each one waits for every run to finish and
  walks a fixed route through seven empty peers and the home chat. That route also
  evicts kept views each time, and it leaves the same views and layout caches at
  every sample. It then collects garbage and reads:
    - the renderer's JS heap, DOM nodes, listeners and React fibers
    - the home chat's settled Markdown trees
    - RSS, heap and handles for the daemon and the web host, from their probes

    The probe also caps the gym's scripted-inference request log. Otherwise that
    log keeps every inference context, and the daemon verdict measures the harness
    instead of the product.

- **Verdict.** There is one line per component. Its slope is a Theil–Sen
  estimate with a 95% interval, in units per hour and per 1,000 actions, plus
  the start and end values. A slope above its limit (`PERF_LEAK_LIMIT_*`) fails
  unless the last 40% of the run is flat (`PLATEAU`). The run also fails on any
  of these:
    - the daemon restarts after measuring, and the open chat does not show its
      newest reply again
    - the persistence audit, read from the restarted daemon, finds a marked prompt
      or reply stored other than exactly once, or a reply outside its prompt's run
    - a draft is lost or a sent prompt is never shown
    - a page error or a 5xx response
- **Cause.** For each process that grew, the gym compares the heap snapshot taken
  as measuring starts with one taken at the end, object by object. The first
  snapshot comes before the first sample, because a process keeps the memory a
  snapshot took. It prints:
    - the constructors that grew
    - the deepest objects whose retained size grew by a share of the total, each
      with the path that keeps it alive. A buffer whose contents only turn over
      does not show up.
    - the allocation sites of what was allocated and is still alive, from the
      sampling heap profiler

## Real GPT-Live call

The opt-in `live-voice` command launches a separate owned daemon and Electron
window, enables voice through Settings, chooses an explicit Codex subscription,
and clicks the normal Start/End controls. It uses real provider inference and
WebRTC; no deterministic inference server or voice transport fixture is started.
The existing Codex sign-in file is referenced by path, never copied or printed.
This lane uses the selected subscription and currently requires macOS speech tools.

```sh
# The source-agent flag is a renderer build-time setting, needed only for a 0.0.0 daemon.
HAPPY_ALLOW_SOURCE_AGENT=1 pnpm --dir packages/happy-desktop-electron build
HAPPY_DESKTOP_AGENT_EXECUTABLE=/absolute/path/to/patched/happy-agent \
node --import tsx packages/happy-desktop-gym/sources/electron/cli.ts live-voice \
  --auth-file /absolute/path/to/codex/auth.json \
  --artifact-dir "$PWD/.context/live-voice"
```

After the app and provider both confirm the call is active, a controllable virtual
microphone plays: “Hello. Say hi and tell me what you are capable of and what you
see.” The gym requires the real provider's user transcript, a greeting and
capabilities in its assistant transcript, a randomly named project from the
visible desktop (not named in the spoken prompt), and nonzero inbound RTP audio
energy. Media recorders capture the actual sent microphone track and received
speaker track. The artifact folder contains the source WAV, input/output WebM,
Settings/desktop/call screenshots, typed control events, and `result.json`, whose
stage distinguishes setup failures from call failures. SDP, socket URLs and
credentials are excluded from the capture. `--pool-default` exercises a smart
controller default backed by a hidden concrete Codex account; the voice credential
remains that concrete account.

## Browser rendering harness

`gym/playwright` owns the reusable real-browser measurement harness. A consumer
supplies only a framework-specific mount callback; the harness supplies
independently sized surfaces, rendered border-box coordinates, computed CSS,
DOM text-baseline metrics, Retina screenshots, and visible-pixel analysis.

Visible pixels are reconstructed by capturing the integer-aligned render surface
against both black and white, then scanning the selected element's region on
that shared backing-pixel grid. For each backing pixel,
`Cwhite - Cblack = 255 * (1 - alpha)`, so the harness recovers coverage without
assuming a foreground color. `visibleMetrics()` reports exact raster bounds,
nonzero backing-pixel count, total alpha mass, and alpha-weighted optical center
relative to the selected element.

`textMetrics().baseline.fromElementTop` and `.fromSurfaceTop` report the live
DOM first-line baseline. `ink.baseline` and `verticalOffset` remain compatibility
aliases. The baseline comes from a temporary zero-size inline probe and is not
inferred from canvas. `textMetrics().fontMetrics` separately exposes the
browser's raw Canvas `TextMetrics` values.

`renderer.visibleMetrics([first, second])` measures independent elements on one
render surface from one black/white screenshot pair. Elements in one batch
cannot contain one another because changing ancestor backgrounds would otherwise
alter a second measurement's paint. `renderer.screenshot()` writes inspection
PNGs only when `VITE_HAPPY_DESKTOP_WRITE_SCREENSHOTS=1`; use
`pnpm --filter happy-desktop-gym test:playwright:artifacts` for a deliberate
artifact refresh.

### Transcript streaming layout regression

The browser gym's `ConversationStreamingGeometry.test.tsx` consumer mounts the
real `ConversationView` with streamed prose, an Edit activity, and the working
status. Run it from the repository root (with reviewed full access on macOS):

```sh
VITE_HAPPY_DESKTOP_WRITE_SCREENSHOTS=1 pnpm --dir packages/happy-desktop-ui test src/ConversationStreamingGeometry.test.tsx
```

Commit `1d1f9f7e` replaced live Markdown/font layout with character-count height
estimates to avoid retaining streamed prefixes. Those estimates became
authoritative virtual-row offsets: excess height left blank gaps, and insufficient
height overlapped following rows. Before the fix, even the two-paragraph repro
painted 209px but reserved 225px in all three engines.

The regression checks live and settled row bounds, rich Markdown, width changes,
stable row/focus identity, bottom following, and growing expanded shell output.
It also checks that each streamed prefix uses the settled layout algorithm while
leaving the retained history cache unchanged. Chromium, Firefox, and WebKit run
at 2×; inspection PNGs are saved beside the test.

The rich-table fixture preserves a second user-reported payload verbatim and
streams it through ordinary chunks and Markdown delimiters at 800px, 560px, and
360px. This catches the syntax-only stages that complete-message fixtures miss:
an empty table row has padding but no text line, an empty heading has a box and
collapsing margins but no line, and an empty list item still has its marker line.
The model distinguishes an empty rendered element from omitted definitions/HTML;
it never repairs row sizes from DOM measurements.

Known separate limitation: Pretext 0.0.8 and Gecko disagree on narrow URL line
breaks even for settled text. The 360px Firefox replay and an isolated settled
prefix are executable expected failures (not skipped or given a larger tolerance).
The 800px/560px Firefox replays, empty-block cases in every engine, and all
Chromium/WebKit widths must pass. Happy Desktop uses Chromium. This change does
not claim to fix the independent Gecko line-breaking model.
