# Square take 02, revised captions

The selected take is 18.016667 seconds, recorded from scaffold
`70bcd4bc223ecd8f21ed270ee8932c1b4be2108b`, based on main containing product commit
`36f103e1` / renderer preview `0.0.94-preview.9`. It uses the current production
sidebar card, corrected snail aspect and Happy Engineering wordmark. The app is
captured at 720×640 CSS, 2×, with a genuinely resized 360px sidebar and 360px
chat. The app is delivered at 1080×960, preserving 1.5 output pixels per CSS
pixel and the previous product text scale. A dedicated 120px bottom strip
completes the 1080×1080 frame. Its three captions are centered in 40px type
and never overlap app content. The right panel is closed,
there are no camera moves or typing beats, and the composer stays empty.
The clock, new compact tool row
and final completion remain readable.

The selected silent 1080×1080 H.264 MP4 and poster are
`.context/demo-out/seamless-update-x.mp4` and `seamless-update-poster.png`.
The root SRT is `seamless-update.srt`. The original capture and native evidence
remain in `square-take-02/`. The revised video, SRT, copied native evidence and
caption revision record are in `square-take-02-captions-02/`; `export.json`
verifies the final stream, dimensions, duration and lack of audio.
The H.264 yuv420p MP4 is 839,590 bytes, with its
`moov` atom preceding `mdat` for fast-start playback. The export copies the
existing video stream, so it does not alter timing. Generated files remain
gitignored.

## Native and visible evidence

- Actual daemon versions: `0.4.87-preview.6` → `0.4.87-preview.7`.
- Actual daemon PIDs: `5053` → `5379`.
- Original run: `ma1be99ec471441728da80bd`, still `running` after reconnect.
- Both releases use protocol 26. Tasks list and task creation are already
  supported at the opening; both artifact catalog endpoints return 404.
  Their task/API and run-recovery source is unchanged. Desktop Tasks appear
  from preview `.5`, creation from `.6`; artifacts use endpoint detection.
- Native capability snapshots match before/after. DOM snapshots match before
  upgrade, after reconnect and at completion: Bots, Tasks and Projects with
  the same heading actions; the same main-pane title, header controls, selected
  tab and tab controls. The video adds no capability or navigation surface.
- After reconnect at 12.117s, fresh reply text is visible at 12.600s and the
  new `node verify.mjs` tool is visible at 12.617s. This tool is absent
  before restart and belongs to the same original durable run. It executes
  through the Agent, emits four stdout lines over two seconds, and completes.
- The original turn completes with one `Completed in 15s`, matching its actual
  start/end timestamps. The preceding seeded conversation's `Completed in 0s`
  remains ordinary history; it is a separate earlier turn.
- The on-screen running clock advances `0s` → `4s` → `11s` → `12s`
  through the update, then settles. DOM observations are monotonic and within
  one clock tick of video elapsed time.
- There are no keystrokes or draft-preservation beats. The composer is empty
  in every sample throughout the take.
- Every observed sidebar is exactly 360px, half the app width. The 336px card
  remains inside it with the ordinary 12px side insets. The snail
  box is square, and the production animation preserves its intrinsic aspect.
  The app shell and composer keep their exact DOM identities.
- No conversation error, app replacement or full-screen install is observed.
  The success card clears before the final product hold.
- The take contains 1,081 video frames at 60 fps and 18,016.967ms of wall time,
  with 914 distinct compositor source frames. No work is time-compressed.

Mounted DOM phase starts are draining at 1.850s, stopping at 5.483s, starting
at 5.600s, reconnecting at 11.367s, and done at 11.917s; the card clears at
14.917s. These record actual DOM transitions rather than an invented phase
envelope. The genuine success duration reads “Took 10s”. The poster at 4.767s
shows the Finishing work card, actual waiting agent and running clock.
Caption intervals are 0–2.233s, 5.600–12.250s and 15.367–18.017s.
Their exact text is “Update ready. Agent mid-task.”, “Wrapping up the current
turn, then restarting.” and “Picks up exactly where it left off. No reload.”
The installer drains current work before restarting; recovery of the same
durable turn and unchanged UI are the demonstrated behavior.

The production downloader verifies both released archive digests, selects the
new binary, drains, stops, starts and checks health. Browser bindings replace
native IPC only; actual installer snapshots and renderer connection/catalog
readiness drive progress. Inference text and two Node tools are screenplay
fixtures. The first tool is allowed to finish at a real durable edge; held
post-tool inference is released only after the original run has recovered.
No “Restart now” action is clicked.

Current production chat renders a tool as a compact command row and sends
stdout to its tool preview panel. The user accepted this presentation. With
the panel closed, the take shows the
new command, Running tools, elapsed clock and streamed reply; it does not
present stdout as an inline product feature. The real streamed output is
retained in durable run evidence. No recording patch changes that UI behavior.

## Verification

Node syntax, targeted formatting and script lint pass. The real browser take
passes the director's native/DOM assertions; the encoded 1fps contact sheet,
poster, new-tool frame at 13.5s and completed-turn frame at 17s were inspected.
No test suite was added or run. This square take passed on its first run.
The caption correction was recomposed from its retained raw capture, without
another recording. All 1,081 frame references and noncaption fields match the
original timeline, with the same cue presence and intervals. App pixels match
exactly at seven composed frames across caption intervals and work stages.
The two longer captions were inspected in the encoded video; they stay centered
in the bottom strip, at the same 40px size. New subtitle and export metadata
contain no claim that execution continues during restart.

The user rejected the previous 1600×1000 take 02. Its derivatives now live in
`review-only-take-02/`, alongside the earlier `review-only-take-01/` folder.
They are historical review files and are not current delivery. The preceding
4:5 capture remains in `portrait-take-02/`, with its root derivatives preserved
in `review-only-portrait-take-02/`. The preceding wider square take remains in
`square-take-01/`, with its root derivatives preserved in
`review-only-square-take-01/`. The preceding caption revision's root files
are preserved in `review-only-square-take-02/`. Current root files contain
the corrected equal-width, square, no-typing take with captions below the app.
Finder was opened to the
final output folder.

The user authorized repeated private recorder runs for this task. All executed
reviewed actions were allowed. The installed Electron host, human daemon,
accounts and keychain were untouched. No push, release, posting or publication
was performed. Independent media review is handled by the parent; reviewer
approval is not claimed here.
