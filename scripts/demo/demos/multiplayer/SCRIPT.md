# Multiplayer demo — cut 9

The approved narrative is revision 6 of the task's `STORY.md`. Capture uses the
isolated gym account and preview renderer, with separate wide and square takes.
Do not operate the person's installed desktop app or change Electron's host.

## Chapter 1: Keep your whole team in view

Start on Kirill's conversation, with the team portraits, bots, and task sidebar
visible. Hold the opening long enough to read it. Open Android Push Fixes and
Offline Drafts, showing work arriving from teammates. Visit the teammate's task,
then return to Kirill's conversation.

Open the Android Push Fixes row's real context menu and choose **Leave task**.
The task disappears from Kirill's sidebar while remaining active for its owner.
The brief caption reads “Not interested? Leave it.” This is a membership action,
not an archive, deletion, or fabricated sidebar animation. The capture records
both the sidebar disappearance and the owner's still-active task as evidence.

## Chapter 2: Follow the work as it happens

Watch the release subtask progress and status dot change, followed by the
Activity badge. Open Activity through the real control. Keep the feed still for
2.5 seconds in the wide cut, with the top report and following rows readable.
There is no feed scroll. The square cut trims the resting hold slightly.

Publication times come from real isolated-gym requests staged ten minutes apart.
The composition removes waiting time around publication and loading, while
preserving the visible progress, dot, badge, click, and settled report.

## Chapter 3: Shared bots own the recurring work

Open these three bot conversations in order, allowing roughly 2–3 seconds each:

- **Desktop Releases:** the macOS release is signed and notarized, Windows is
  building, and Linux checks passed. Show the release receipt.
- **Growth:** 1,284 signups this week, up 18%, with a daily chart and channel
  totals. Show the weekly growth report.
- **Product Health:** 99.94% crash-free sessions, with two concrete issues and
  their owners. Show the health report.

Each conversation is created through the bot's real message flow. Reports are
original graphics rendered from `artifacts/bot-reports.mjs`, delivered through
`present_files`, and displayed by the application's existing media renderer.
Keep the bot list visible. Replies provide the headline in readable text as well
as in the report graphic.

## Ending

Fade the desktop out over 0.7 seconds. Fade a centered phone in over the gradient
with “On all platforms” and platform icons. The phone is alone during this beat.
Its screen is a continuous native recording: task updates move while the phone
is visible. It then glides into the existing Happy homepage composition, with
“One place”, free/open-source copy, and the GitHub count.

`phone/native-running.mp4` is a ten-second excerpt of the previously approved
native capture. Its recording provenance is documented in `phone/README.md`.
It belongs to the earlier demo world; it does not claim live synchronization
with the newly captured desktop account. The same decoder continues through
the platforms and Happy beats, avoiding a reset at the transition.

## Capture and composition

Capture `aware`, `activity`, and `bots` separately at 1133×800 for the wide cut
and 764×800 for the square cut. `demo.mjs` emits typed cue names and a
`filmed.json` record for each take. The bot reports must be generated before
capture with `artifacts/render.mjs`.

The composition entry points are `compositions/multiplayer/cut.mjs` and
`cut-square.mjs`; `chapters.mjs` selects the source intervals from those cues.
Use the same backdrop and phone assets for both shapes. Card/app handovers
last 0.7 seconds, with the outgoing text clearing before the app is fully
visible. The main cut should remain 45–50 seconds; the square cut is shorter
and contains every narrative beat.

Deliver 1920×1080 and 1280×720 wide MP4s, a 1080×1080 square MP4, posters,
timelines, contact sheets, and selected full-resolution stills. Export silent
H.264 at 60 fps, yuv420p, BT.709 matrix/primaries with an sRGB transfer tag and
faststart. Inspect contact sheets and 10 fps transition strips from the final
encoded outputs. Verify the real Leave action, the resting Activity feed,
all three bot reports, the centered running phone, and its continuous glide.