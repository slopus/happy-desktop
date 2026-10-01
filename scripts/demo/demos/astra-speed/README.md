# Astra: Regular → Ultrafast

The accepted take is [selected/astra-speed.mp4](./selected/astra-speed.mp4), with
[subtitles](./selected/astra-speed.srt), sanitized
[run and editorial evidence](./selected/astra-speed.evidence.json),
[revision](./selected/revision.json), [framing](./selected/framing.json),
[ffprobe metadata](./selected/ffprobe.json), and
[provenance](./selected/provenance.json). It is 19.316667 seconds,
1950 × 1800, 60 fps, H.264/AAC, 1,159 frames. SHA-256:
`bfdef42b875a6b5945a906f145fc3bd25b2085b01e208eb3b4bfadd3dc893d40`.

This take measured Regular at **64.867 seconds** and Ultrafast at
**9.202 seconds**, using Astra with Low effort and the same prompt. Its isolated
runtime used Happy Agent `0.4.80-preview.2`, Codex provider `0.0.33`, and the real
Codex CLI `0.159.2`. Client changes committed alongside this recipe carry
Ultrafast through wire projection, preferences, menus, and model/account
capability validation.

A short fork of the current core experience demo. This uses `record.mjs`, the
full built Desktop renderer, core's actual repository/worktree fixtures, the
normal composer and turn summary, and the existing continuous capture, director,
subtitle, sound and encoding pipeline. No standalone scene or product-source
patch is used. The previous `astra-ultrafast` component replay is superseded.

The two fresh conversations send the same prompt to native GPT-6 Astra, Low:

> Count from 1 to 1000 internally, then reply with exactly done and nothing else.

Regular runs first. The pointer hovers over Astra without opening the model
dialog, then the ordinary hover speed menu changes Regular to Ultrafast. Both
runs and raw capture remain at real time. Thinking waits in the delivered video
use the pipeline's visible 4× badge, symmetrically for both speeds; typing,
selection and completed results stay at 1×. The normal UI displays its completion
footer; captions show exact milliseconds expressed as seconds from the same daemon run's
`endedAt - startedAt`. This includes run overhead, not just provider latency.
The subtitle strip is outside the app so it cannot cover the speed control.
The recorder also exports the same subtitles as SRT.

The selected short cut starts on the submitted Regular prompt and omits repetitive
waiting, setup and typing. It retains the real Astra hover, speed menu, Ultrafast
selection, second submission and both completion footers. Waiting captions say
“Wait shortened”; the exact run timings stay unchanged. The delivery's
`revision.json` records every retained raw frame range and the final result holds,
which show the actual Regular and Ultrafast completion frames consecutively.

This is one live sample per speed, not a general benchmark. The prompt requests
internal counting; neither the recording nor its evidence verifies private
reasoning. Evidence records requested tiers, not a provider-served-tier claim.

## Runtime

Use an explicitly selected preview Happy Agent binary that advertises native
Astra Ultrafast for the selected account. `--inference native` refuses seeded
fictional turns, scripted inference, missing account identity, or a catalog
without Ultrafast. It never participates in `--all`.

The built renderer is delivered in-process through Playwright routing. The
browser-development transport carries real daemon HTTP/SSE bytes over the
private `.d` Unix socket; it opens no HTTP listener. Other browser network and
WebSocket requests are blocked. No installed app or daemon is restarted.
Local UI preferences are private recording preferences; profile/repositories
are the core demo's fictional world. Inference and run state are real.

The native auth source must be an explicit absolute path with an explicit account
email. A private `.d/home/.codex/auth.json` copy contains access/id/account fields,
never the refresh token. The original login stays read-only. Normal teardown and
startup failure stop the private daemon and remove that copy. A forced kill may
require explicit cleanup of this disposable `.d` world before another take.

Native provider setup is written to `.d/Happy/Config/happy.toml` with
`providers.default_enable = false`, one enabled Codex provider,
`credential_isolation = true`, and the exact private `auth_file`. Cloud integration
is disabled. `.d/h/agent/runtime.toml` is daemon-owned and is not seeded in native
mode. The isolated home is `.d/h`, keeping all generated configuration and sockets
inside `.d`.

Build the full browser renderer from this checkout with
`VITE_HAPPY_BROWSER_LOCAL=1 pnpm --dir packages/happy-desktop-electron exec vite build`.
The resulting `packages/happy-desktop-electron/dist/renderer` directory is the built app
input; this builds the renderer without starting Electron or changing a host
process. Reset an old disposable demo world first if it belongs to another
scenario, using `pnpm demo reset`.

Example arguments for the existing front door, with the runtime and native login
explicitly selected:

```sh
node --import tsx scripts/demo/record.mjs record astra-speed \
  --inference native --appearance dark --fps 60 --keep-frames \
  --built-app packages/happy-desktop-electron/dist/renderer \
  --native-auth /absolute/path/to/verified/native/auth.json \
  --native-account account@example.com \
  --native-codex /absolute/path/to/installed/codex --out .context/astra-speed/new-take
```

Set `HAPPY_DESKTOP_AGENT_EXECUTABLE` to the selected isolated preview executable.
Pass `--native-codex` the actual installed Codex CLI executable.
The private bin directory exposes it through a read-only symlink so the provider
obtains the genuine native client version for its capability request. An unknown
version is rejected by that endpoint; no version or capability is fabricated.
The native daemon runs as an owned foreground child of the recorder.
The repository's no-escalation filming rule still applies: a Mac runtime that
cannot film under Auto needs a fresh explicit human exception. This command does
not authorize that exception, release, publication, or installed-host changes.

## Re-editing a retained capture

The portable editor uses the same composer, timeline, sound mixer and encoder:

```sh
node scripts/demo/demos/astra-speed/recompose.mjs \
  /absolute/path/to/retained/raw-take \
  scripts/demo/demos/astra-speed/selected/revision.json \
  .context/astra-speed/recomposed
```

It requires the raw take's `framing.json`, `.work/astra-speed/timeline.json`,
`.work/astra-speed/sounds.json`, and referenced images under
`.work/astra-speed/capture/`, created by `--keep-frames`. It does no inference or
daemon work. The committed revision contains zero-based, end-exclusive source
frame ranges and explicit result holds; the editor checks its source frame count.
Output belongs in scratch or the gitignored `artifacts/` directory; it refuses to
overwrite `selected/`.

The original raw footage is **not archived in this repository**. The selected
MP4, captions, frame selections and sanitized measurements are preserved, but
the selected revision alone cannot regenerate its exact pixels. Keep a retained
raw take separately to recompose it. A fresh native recording has different
timings and frame ranges: create a new revision with its `sourceFrames`, `fps`,
`appearance`, and `revision.segments`/`revision.resultHolds`, and use that take's
measured durations in its captions. Never apply the selected timing claims to a
new capture.
