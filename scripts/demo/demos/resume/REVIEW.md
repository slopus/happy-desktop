# Portrait take 02

The selected take is 18.016667 seconds, recorded from scaffold
`cc6eb36bb651ada2535d5eaab96c3717642e4917`, on main containing product commit
`36f103e1` / renderer preview `0.0.94-preview.9`. It uses the current production
sidebar card, corrected snail aspect and Happy Engineering wordmark. The app is
captured at 720×900 CSS, 2×, with a genuinely resized 220px sidebar, right panel
closed, no camera moves, and exactly three captions inside the frame.

The selected silent 1080×1350 H.264 MP4 and poster are
`.context/demo-out/seamless-update-x.mp4` and `seamless-update-poster.png`.
The root SRT is `seamless-update.srt`. Source video, SRT and evidence remain in
`portrait-take-02/resume.*`; `export.json` verifies the final stream, dimensions,
duration and lack of audio. The export copies the existing video stream, so it
does not alter playback timing. Generated files remain gitignored.

## Native and visible evidence

- Actual daemon versions: `0.4.86` → `0.4.87-preview.7`.
- Actual daemon PIDs: `78505` → `78997`.
- Original run: `m2074f9aea52f43f3a59a98f`, still `running` after reconnect.
- After reconnect at 12.133s, fresh reply text is visible at 12.550s and the
  new `node scripts/verify.mjs` tool is visible at 12.567s. This tool is absent
  before restart and belongs to the same original durable run. It executes
  through the Agent, emits four stdout lines over two seconds, and completes.
- The original turn completes with one `Completed in 15s`, matching its actual
  start/end timestamps. The preceding seeded conversation's `Completed in 0s`
  remains ordinary history; it is a separate earlier turn.
- The on-screen running clock advances `0s` → `4s` → `5s` → `11s` → `12s`
  through the update, then settles. DOM observations are monotonic and within
  one clock tick of video elapsed time.
- Thirteen characters are entered from 5.600s to 6.333s while the actual
  installer reports stopping/starting. The final draft is
  `Keep it quiet while I read.`
- Every observed card rectangle remains inside the 220px sidebar. The snail
  box is square, and the production animation preserves its intrinsic aspect.
  The app shell and composer keep their exact DOM identities and typing focus.
- No conversation error, app replacement or full-screen install is observed.
  The success card clears before the final product hold.
- The take contains 1,081 video frames at 60 fps and 18,017.353ms of wall time,
  with 918 distinct compositor source frames. No work is time-compressed.

Mounted DOM phase starts are draining at 1.917s, stopping at 5.550s, starting
at 5.667s, reconnecting at 8.933s, and done at 12.000s; the card clears at
15.000s. These record actual DOM transitions rather than an invented phase
envelope. The genuine success duration reads “Took 10s”.

The production downloader verifies both released archive digests, selects the
new binary, drains, stops, starts and checks health. Browser bindings replace
native IPC only; actual installer snapshots and renderer connection/catalog
readiness drive progress. Inference text and two Node tools are screenplay
fixtures. The first tool is allowed to finish at a real durable edge; held
post-tool inference is released only after the original run has recovered.
No “Restart now” action is clicked.

Current production chat renders a tool as a compact command row and sends
stdout to its tool preview panel. With the panel closed, the take shows the
new command, Running tools, elapsed clock and streamed reply; it does not
present stdout as an inline product feature. The real streamed output is
retained in durable run evidence. No recording patch changes that UI behavior.

## Verification

Node syntax, targeted formatting and script lint pass. The real browser take
passes the director's native/DOM assertions; the encoded 1fps contact sheet
and final poster were inspected. No test suite was added or run. Portrait
take 01 reached the final frame but failed its typing evidence assertion
because the director callback was named incorrectly; take 02 corrects this.

The user rejected the previous 1600×1000 take 02. Its derivatives now live in
`review-only-take-02/`, alongside the earlier `review-only-take-01/` folder.
They are historical review files and are not current delivery.

The user authorized repeated private recorder runs for this task. All executed
reviewed actions were allowed. The installed Electron host, human daemon,
accounts and keychain were untouched. No push, release, posting or publication
was performed. Independent media review is handled by the parent; reviewer
approval is not claimed here.
