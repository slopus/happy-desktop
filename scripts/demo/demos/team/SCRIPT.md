# Team demo: Kirill starts a task, and Steve has it before Kirill looks up

Status: **r5**, Kirill's take 10 changes to r4: a smaller window (840×588
instead of 1000×700), drawn as large in the cut, so it shows less of the app
and everything in it reads about a fifth larger; Kirill's sidebar a tenth
narrower, with every name still whole beside its diff stats; and only one of
Steve's subtasks working, _iOS server codes_, under _Team Servers_, while
_Agent sign-in_ and _Desktop sign-in_ are done and rest idle. Times are
take 10's.

r4, Kirill's take 9 changes to r3: the phone is labelled as a teammate's, not
by name; Steve's sidebar is his own, not a mirror of Kirill's; he does not
open the task until its first version is ready, and goes back to his sidebar
after answering; the phone steps aside while the agent takes his note; and
plain-sentence narration at the bottom replaces the captions above the window.

The take opens on Kirill's "Create a new task" screen with the model menu
already open, on a busy team server where Steve's task across three
repositories is still working on its last part. Kirill's pointer goes up the list past every provider's
models to Opus 5.5 under Claude, and he asks for an animated waveform in the
voice agent. As he finishes typing, his teammate's phone rises beside the
window on Steve's own sidebar. Nothing exists until Kirill sends; on Send the
task is created, and at that moment it arrives in Steve's sidebar, with
Kirill's face. Steve leaves it there while Opus works. When the first version
is ready, a live preview, Steve opens the task, checks the preview, answers in
the same task, and goes back to his sidebar. The phone steps aside while Opus
takes his note: the preview goes to five bars and it says so. The result
rests, and the cut eases back into its first frame, so the homepage can loop
it.

The brief is [BRIEF.md](./BRIEF.md). This replaces the stem take
(`origin/archive/stem-cell-demo`, `scripts/demo/demos/stem`), keeping its
recorder, in-app hints, phone choreography and composition, and dropping stem
cells, Focus filing and the Spaces sidebar.

## Cast

| Who        | Where                                       | Face                               |
| ---------- | ------------------------------------------- | ---------------------------------- |
| **Kirill** | the desktop; owner of the team server       | `https://github.com/bra1ndump.png` |
| **Steve**  | his phone: the real iPhone "Steve's iPhone" | `https://github.com/ex3ndr.png`    |

Both are real members of one team-mode daemon, each signed in with their own
token. Steve's phone is paired to it as Steve, so its sidebar shows his
tasks. No other people, and no generated faces. On screen the phone is
labelled "Your teammate's phone"; Steve's name shows only where his own
message does.

## The opening frame (set dressing)

Kirill's desktop, dark appearance.

- **Server rail**: exactly two servers. On top, Kirill's personal server (his
  own machine, wearing his photo). Below the divider, the team server **Happy
  Core**, wearing the Happy desktop app's icon as its picture, selected. The
  phone's server pill wears the same picture.
- **Bots** on Happy Core, each with its real face from the real installation:
  Chief of Staff, Disk Sweeper, iOS Production Train, Product Health.
- **Sidebar width**: Kirill keeps his sidebar at 259 px, a tenth narrower than
  the app's 288 px, dragged there with its own resize handle before the take.
  No name is cut short by the diff stats beside it; the take measures every
  row at its opening and at its highest counts (`filmed.json`'s
  `sidebarFit`).
- **Tasks**, each with its owner's face; on the desktop, subtasks carry their
  repository's real project icon and their diff stats. happy wears the Happy
  iOS app's icon, happy-desktop the desktop app's, happy-agent the agent's
  logo. The phone's sidebar draws no icon on a subtask row, as the current iOS
  app does:
    - Steve, **Team servers**, working now. Its conversation is running,
      coordinating three subtasks in three repositories. Two are done and
      idle, no working mark, their diff stats final; one is still working,
      its diff stats climbing for the whole take:
        - ↳ _iOS server codes_ (happy) `+190 −12`, working
        - ↳ _Desktop sign-in_ (happy-desktop) `+268 −51`, done
        - ↳ _Agent sign-in_ (happy-agent) `+412 −38`, done
    - Kirill, _iOS overlay layout_ ↳ _iOS send fixes_ `+921 −122` (happy)
    - Steve, _Activity feed design_
    - Kirill, _11labs mobile_ ↳ _Mobile voice_ `+8k −12` (happy)
    - Kirill, _Landing page rebrand_ ↳ _Landing rebrand_ `+1.3k −134`
      (slopus.github.io)
- **Steve's sidebar** on his phone is his own list on the same server, not
  Kirill's. Everyone joins every new task automatically, so the two differ by
  what each has done with theirs (world.mjs's `sidebars`):
    - Bots: Chief of Staff and iOS Production Train. He hid Disk Sweeper and
      Product Health.
    - Tasks, in his order: Steve's _Android Push Fixes_, _Activity Feed
      Design_, _Team Servers_ with its three subtasks, Kirill's _iOS Overlay
      Layout_ ↳ _iOS Send Fixes_, and _Sync Benchmarks_. He left Kirill's
      _11labs Mobile_ and _Landing Page Rebrand_. Kirill left Steve's _Android
      Push Fixes_ and _Sync Benchmarks_, so the window's list is unchanged.
- **Main pane**: "Create a new task", its composer below, and the model menu
  open on its list: Claude, Codex, Grok and Antigravity, each with its models
  and each under the account Kirill's own app shows for it, Current CLI (no
  "Team" accounts, no account panel); the current pick is Codex's GPT-6.1
  Terra. Kirill's pointer rests on the Model row that opened the list. This is
  the poster frame.

## Beats

Seconds are the cut's (take 10: 40.9 s at 60 fps, after the 2× typing and the
cut freezes). Composition: the live homepage player's 1618×1000 at 60 fps,
the window raised to leave a band below it for the narration, plain sentences
in subtitle style. The narration is not in the split tracks. The cut loops on
the homepage.

| s    | Cue                             | On screen                                                                                                                                                                                                                                                                      | Narration                                      |
| ---- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| 0    | `open`                          | The poster: new-task screen, the model list open (Claude, Codex, Grok, Antigravity, each under Current CLI), Kirill's pointer on the Model row that opened it. In the sidebar Steve's _Team servers_ and _iOS server codes_ spin, its diff stats climbing; the other two rest. | Pick any model from any provider.              |
| 1.6  | `model-scan`                    | The pointer has glided into the list at Gemini 3.8 Flash and goes up it, past Grok 4.7 and Codex's models, to **Opus 5.5** under Claude.                                                                                                                                       |                                                |
| 4.0  | `model-chosen`                  | He clicks Opus 5.5; the menu closes and the chip reads Opus 5.5.                                                                                                                                                                                                               |                                                |
| 5.2  | `typing-started`                | He types _"Add an animated waveform to the voice agent."_ No task row exists anywhere yet.                                                                                                                                                                                     | Describe the work and send.                    |
| 8.0  | `phone-enter`                   | **Your teammate's phone** rises beside the window, which slides left to make room: Steve's own sidebar, which has no such task.                                                                                                                                                |                                                |
| 9.0  | `sent` / `task-created`         | Enter. Now the task exists: its row arrives at the top of Kirill's Tasks and, at once, at the top of Steve's, with Kirill's face, and names itself **Voice waveform**. Steve does not open it.                                                                                 | Your teammate sees the new task right away.    |
| 10.6 | `working`                       | Desktop: Opus reads the voice files. The phone stays on Steve's sidebar, where the task is working.                                                                                                                                                                            |                                                |
| 16.3 | `preview`                       | An inline live preview in the task on the desktop: the waveform speaking (animated bars) and silent; then Opus asks _"Steve, how does it look?"_                                                                                                                               | When the first version is ready, they jump in. |
| 19.5 | `steve-open` / `phone-open`     | Now Steve taps the task in his sidebar: its conversation, the preview and the question, on his phone.                                                                                                                                                                          |                                                |
| 25.8 | `phone-typing`                  | On the iOS keyboard Steve types _"Love it. Narrower though, five bars max."_ (his typing plays 2×, both screens).                                                                                                                                                              | They review the preview and reply.             |
| 32.0 | `phone-sent` / `steve-feedback` | He sends; his message lands in Kirill's conversation with Steve's face.                                                                                                                                                                                                        |                                                |
| 35.1 | `phone-home`                    | Steve goes back to his sidebar.                                                                                                                                                                                                                                                |                                                |
| 35.7 | `phone-exit`                    | The phone steps down and the window slides back.                                                                                                                                                                                                                               | The agent picks up the feedback.               |
| 36.9 | `five-bars`                     | Opus rewrites the page and shows it open again under Steve's note: five bars.                                                                                                                                                                                                  |                                                |
| 37.8 | `outro`                         | Opus: _"Five bars it is."_ The result rests.                                                                                                                                                                                                                                   |                                                |
| 40.3 | `settled`                       | The narration has gone; the last 0.6 s dissolve into the first frame.                                                                                                                                                                                                          |                                                |

Throughout, Steve's _Team servers_ keeps working in both sidebars: the
several repositories at once are his, two parts already done and _iOS server
codes_ under way when the take opens, its counts climbing, one edit every
three seconds.
Neither screen scrolls the conversation beyond keeping its latest message in
view. The window is too short to keep the first preview in view above Steve's
note and the answer, so the agent shows the page open again in its answer,
through `update_artifact` with its display, and that one starts open there
while the first folds to its title. Steve's part, which the homepage hero brings forward, runs from
`phone-enter` to `phone-exit`.

## What is real and what is a fixture

Disclosed in `team.evidence.json` beside every take.

- **App and daemon.** Current `happy-desktop` main against the latest stable
  Happy Agent (v0.4.111), in the isolated demo gym, recorded on Kirill's Mac
  mini at 60 fps. Nothing touches anyone's real `~/.happy`.
- **Servers.** Two isolated gym daemons: Kirill's personal (standalone) one,
  which the window runs on, and the team-mode **Happy Core**, which it reaches
  through a real server connection by URL. The desktop's sign-in to Happy Core
  is a gym-minted token for Kirill instead of the browser sign-in page.
- **Team.** Kirill and Steve are seeded members of Happy Core. Steve has the
  new task in his sidebar through the daemon's own automatic task membership.
  Nobody adds him. The two sidebars differ through each member's own real
  actions, made off camera through their own clients: tasks they left
  (`POST /v0/tasks/:id/leave`), their own order (`/reorder`), and the bots
  Steve hid, with the same per-person setting the apps write.
- **Inference.** Screenplay inference: the agent's words, tool calls and timing
  are scripted so every take lands the same beats. Opus 5.5 is the model
  picked on camera; the background work is recorded as GPT-6.1 Terra. No live
  model answers on camera.
- **Tools.** Reads, edits, `create_artifact`, `write_artifact_file`,
  `update_artifact`, and the background task's `create_subtask` calls are the
  daemon's real tools. The subtasks are real
  workspace-bound subtasks in real Git worktrees; every diff stat is the
  daemon's live Git count.
- **Repositories.** Small fixture checkouts named happy-agent, happy-desktop,
  happy and slopus.github.io, wearing the real project icons: happy the Happy
  iOS app's (`happy-ios`'s AppIcon), happy-desktop the desktop app's
  (`happy-desktop-electron`'s app icon), happy-agent the agent's logo. Not the
  production repositories. Happy Core's own picture is the desktop app's icon,
  set through its Chief of Staff's real `set_node_avatar`.
- **Phone.** The native Happy iOS app built from `happy` main for the iOS
  Simulator (an iPhone 17 Pro on iOS 26) on the Mac mini, paired to Happy Core
  as Steve through its real mobile pairing. An XCUITest driver performs his
  taps and his typing on the Simulator's iOS keyboard; his message is authored
  by Steve's own credential. The recorder tells the driver when the first
  version is ready, and only then does it open the task.
  `simctl io recordVideo` captures the screen; the status bar reads 9:41 with
  full bars, and the composition draws the iPhone frame. The phone and the desktop are recorded in two passes of the same
  screenplay, so the Simulator does not share the Mac with the desktop's
  capture: the phone's pass writes the beat times it reached (`beats.json`),
  and the desktop's pass holds each beat to the same second, sends Steve's
  words, through his own credential, when they landed in the phone's pass, and
  takes the phone's movie conformed to its own length at a constant 60 fps.
  The phone's movie is put on the take's clock by a mark: once Steve's
  sidebar is up, just before the take, the status bar reads 9:42 for a moment
  at a noted time, and where that moment falls in the recording sets its
  clock, since a busy or just booted Simulator may write its first frame
  many seconds late. `filmed.json` reports how late each beat came;
  `phone-capture.json` the cadence the Simulator actually delivered while the
  phone moved, and how late its first frame came.
- **Edits.** Steve's typing plays at 2×. The desktop is captured from Chromium's
  screencast, which on the Mac mini sometimes holds one picture for about a
  quarter second in the middle of motion; the take lists every such freeze
  (`freezes.json`) and the cut drops those frames from both screens, so motion
  joins up instead of hanging. The cut's last 0.6 s dissolve into its first
  frame, and each split track's into its own, so the homepage loop has no
  seam. Every edit is listed under `edits` in the cut's `team.json`, its
  `team.evidence.json` and the split tracks' `take.json`. Kirill's feed is
  marked read while he watches his own task, so no feed badge interrupts the
  take.
- **Background work.** The earlier tasks, Steve's own _Android Push Fixes_
  and _Sync Benchmarks_, and Steve's running _Team servers_ are made off
  camera through the same API; their transcripts and the pace of their edits
  are screenplay data. _Agent sign-in_ and _Desktop sign-in_ write all their
  edits and finish before the take; _iOS server codes_ is the one still
  working.
- **Sidebar width.** Kirill's sidebar is 259 px, a tenth narrower than the
  app's default, dragged there with the sidebar's own resize handle off
  camera. The width is the app's own, held for the window's lifetime.

## Recording

On the Mac mini, with the Simulator visible (it renders at 60 Hz only when
on screen), in two passes and a compose. Each pass writes the demo's
`artifacts/`; copy them aside before the next. Steve's driver is built into
happy-ios's UI tests by `phone/build.sh`; build it again after changing
`phone/TeamDemoUITests.swift`.

```sh
export HAPPY_DEMO_VITE_PRODUCTION=1
# The phone's pass: Steve's Simulator, and the beats it reached.
TEAM_PHONE=1 HAPPY_DEMO_DEVICE_SCALE=1 \
  node --import tsx scripts/demo/record.mjs record team
cp -R scripts/demo/demos/team/artifacts ~/takes/phone
# The desktop's pass, on the phone's beats.
TEAM_SCHEDULE=~/takes/phone HAPPY_DEMO_DEVICE_SCALE=2 \
  node --import tsx scripts/demo/record.mjs record team
cp -R scripts/demo/demos/team/artifacts ~/takes/desktop
node --import tsx scripts/demo/record.mjs compose team \
  --desktop ~/takes/desktop/team.mp4 --phone ~/takes/desktop/phone-screen.mp4 \
  --cues ~/takes/desktop/cues.json --out ~/takes/composed
```

The window is 840×588 CSS pixels at 2× (1680×1176), on React's production
build. Composing writes the cut (`team.mp4`) and, in `split/`, the window and
the phone screen alone on the cut's clock for the homepage hero: AV1 and H.264
(level 5.1) at 60 fps, 80% 30 fps cuts, posters, `captions.vtt`, and
`take.json` with every cue and Steve's part in the cut's seconds.

## Still open

1. The uploaded faces of Chief of Staff and Disk Sweeper are exports pending
   from Kirill. Until they arrive the take uses the daemon's own defaults for
   those two. The take measures where each is drawn; dropped into `assets/` as
   `chief-of-staff.png` and `disk-sweeper.png`, they are swapped in by
   composing again, without a new take. iOS Production Train and Product
   Health wear their seeded shader faces, drawn from their real IDs.
