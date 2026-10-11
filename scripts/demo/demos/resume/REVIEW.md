# Square take 01

The selected take is 18.016667 seconds, recorded from scaffold
`829e7c88f94b4f0e07efa4e0b29d063cd95bd21e`, on main containing product commit
`36f103e1` / renderer preview `0.0.94-preview.9`. It uses the current production
sidebar card, corrected snail aspect and Happy Engineering wordmark. The app is
captured at 720×720 CSS, 2×, with a genuinely resized 428px sidebar. Its 404px
card occupies 56.1% of the frame width, leaving 292px for the conversation.
This size needs no letterboxing or taller fallback. The right panel is closed,
there are no camera moves or typing beats, and the composer stays empty.
Exactly three captions sit inside the frame. The clock, new compact tool row
and final completion remain readable.

The selected silent 1080×1080 H.264 MP4 and poster are
`.context/demo-out/seamless-update-x.mp4` and `seamless-update-poster.png`.
The root SRT is `seamless-update.srt`. Source video, SRT and evidence remain in
`square-take-01/resume.*`; `export.json` verifies the final stream, dimensions,
duration and lack of audio. The H.264 yuv420p MP4 is 796,806 bytes, with its
`moov` atom preceding `mdat` for fast-start playback. The export copies the
existing video stream, so it does not alter timing. Generated files remain
gitignored.

## Native and visible evidence

- Actual daemon versions: `0.4.86` → `0.4.87-preview.7`.
- Actual daemon PIDs: `84264` → `84709`.
- Original run: `md46449f2e2464d259238d4c`, still `running` after reconnect.
- After reconnect at 12.100s, fresh reply text is visible at 12.550s and the
  new `node verify.mjs` tool is visible at 12.567s. This tool is absent
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
- Every observed card rectangle remains inside the 428px sidebar and occupies
  at least 55% of the frame width. The snail
  box is square, and the production animation preserves its intrinsic aspect.
  The app shell and composer keep their exact DOM identities.
- No conversation error, app replacement or full-screen install is observed.
  The success card clears before the final product hold.
- The take contains 1,081 video frames at 60 fps and 18,017.109ms of wall time,
  with 909 distinct compositor source frames. No work is time-compressed.

Mounted DOM phase starts are draining at 1.833s, stopping at 5.467s, starting
at 5.567s, reconnecting at 8.800s, and done at 11.883s; the card clears at
14.883s. These record actual DOM transitions rather than an invented phase
envelope. The genuine success duration reads “Took 10s”. The poster at 4.767s
shows the large Finishing work card, actual waiting agent and running clock.

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
No test suite was added or run. Portrait
take 01 reached the final frame but failed its typing evidence assertion
because the director callback was named incorrectly; take 02 corrects this.

The user rejected the previous 1600×1000 take 02. Its derivatives now live in
`review-only-take-02/`, alongside the earlier `review-only-take-01/` folder.
They are historical review files and are not current delivery. The preceding
4:5 capture remains in `portrait-take-02/`, with its root derivatives preserved
in `review-only-portrait-take-02/`. Current root files contain this wider,
square, no-typing take. Finder was opened to the final output folder.

The user authorized repeated private recorder runs for this task. All executed
reviewed actions were allowed. The installed Electron host, human daemon,
accounts and keychain were untouched. No push, release, posting or publication
was performed. Independent media review is handled by the parent; reviewer
approval is not claimed here.
