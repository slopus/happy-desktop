# Same turn. New version.

The current task replaces the old long update story with an approximately
18-second, silent 1080×1080 video for viewing on a phone. Capture the real
desktop app in a 720×640 CSS window at 2×, with the sidebar and chat visible
together, the right panel closed, and no camera moves. Resize the sidebar using
its ordinary control to 360px, leaving 360px for the continuing conversation.
Keep the app at 1080×960 (1.5 output pixels per CSS pixel), then append a 120px
bottom strip for large centered captions. Captions never cover app content.
Do not type or fill a
draft; keep the composer empty. Use preview
`0.0.94-preview.9`'s production source (`36f103e1`), including the sidebar-width
card, proportionate snail and Happy Engineering wordmark.

| Time   | Action                                                                                                                                    | Caption                                        |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 0–2s   | One original turn is mid-task, its tool running and clock advancing. The real update menu is already open. Click Install.                 | Update ready. Agent mid-task.                  |
| 2–6s   | The card waits inside the wide sidebar while the tool finishes.                                                                           | None                                           |
| 6–12s  | Real shutdown, start and reconnect. Keep the chat mounted throughout the actual restart.                                                  | Wrapping up the current turn, then restarting. |
| 12–16s | The same durable run is still Working, its clock continues, a new two-second tool starts, the answer streams and the turn completes once. | None                                           |
| 16–18s | Hold the completed original turn.                                                                                                         | Picks up exactly where it left off. No reload. |

Times describe the shape, not invented installer timing. The production
downloader verifies released Agent `0.4.87-preview.6` and `0.4.87-preview.7`; the real
Install action selects and upgrades the binary in the private world. Installer
reports and actual renderer connection/catalog readiness drive the UI. Native
IPC alone is replaced by browser bindings. No synthetic phases, skipped
restart, time compression or “Restart now” action is used. Both releases use
protocol 26, support Tasks and task creation, and lack the artifact catalog
endpoint. Their task/API and run-recovery source is unchanged. Native endpoint
probes and DOM snapshots must confirm unchanged capabilities, sidebar sections
and main-pane controls before and after the upgrade.

Inference is scripted. The first actual Node tool streams in its private
worktree until a file gate releases it. Post-tool inference stays held through
the update. The installer drains current work before restarting; the recording
does not claim inference or tool execution continues during restart. After the
new daemon recovers the original unsettled run, inference
is released and the same run starts the next actual Node tool, which streams
for about two seconds before the final reply. Current production chat renders
tools as single command rows; their stdout is available through the product's
tool preview panel. The recording preserves that UI behavior.

The take must prove actual old/new versions and PIDs, original run identity,
Tool 2 absent before restart and present afterward, one settled duration spanning
the turn, a visible monotonic running clock at video speed, same app shell and
composer nodes, an untouched empty composer, an exactly 50% sidebar containing
the update card, a square snail box, zero errors, and one continuous
wall-time timeline.

Caption corrections can be composed from an existing take captured with
`--keep-frames`, using `recompose.mjs <source-take> <output-directory>`. It
preserves every source frame and cue interval and changes only caption text.

The user gave standing authorization for private recorder runs and fixes for
this task. No per-run confirmation or run count applies. Auto review still
applies; a denied action stops that action. Never touch the installed Electron
host, human daemon, account or keychain. Do not push, release, post or publish.

Generated takes remain gitignored under `.context/demo-out/`. Deliver the
selected silent H.264 MP4, poster, SRT and evidence, open Finder, and commit
only the recording scaffold on this workspace branch. The historical
`uninterrupted-update-demo.mp4` is preserved as an earlier artifact, not the
current delivery.
