# Team demo: Kirill starts a task, and Steve has it before Kirill looks up

Status: **r6**, Kirill's take 11 changes to r5:

- The window is a golden rectangle, 1133×700 CSS pixels, drawn at take 9's
  scale. The sidebar is back at the app's 288 px.
- Steve's phone tucks aside, smaller and partly past the frame's edge, while
  the agent works. It comes forward when the agent asks him by name (a real
  `@Steve` mention), and tucks aside again once he has answered.
- The new task hands its code to a subtask, _Waveform bars_, in a worktree of
  happy, whose row counts the lines as its edits land.
- Steve types faster, and the preview line of the narration is now "A
  teammate jumps in."
- Take 9's ending is back: the first preview turns to five bars in view.

Take 11's cut runs 52.0 s.

r5, Kirill's take 10 changes to r4: a smaller window (840×588), a sidebar a
tenth narrower, and only one of Steve's subtasks working, _iOS server codes_,
under _Team Servers_, while _Agent sign-in_ and _Desktop sign-in_ are done and
rest idle.

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
Kirill's face. Then the phone tucks aside while Opus works. Opus reads the
voice files and hands the code to a subtask, _Waveform bars_, whose counts
climb in the sidebar. When the subtask reports, Opus publishes a live preview
and asks _"@Steve, how does it look?"_ His phone comes forward. Steve opens the
task, checks the preview, answers in the same task, and goes back to his
sidebar. The phone tucks aside again while Opus takes his note: the preview
goes to five bars, and Opus says so. The result rests, and the cut eases back
into its first frame, so the homepage can loop it. The phone fades out only in
that dissolve.

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
- **Sidebar width**: the app's own 288 px. No name is cut short by the diff
  stats beside it; the take measures every row at its opening and at its
  highest counts (`filmed.json`'s `sidebarFit`).
- **Tasks**, each with its owner's face; on the desktop, subtasks carry their
  repository's real project icon and their diff stats. happy wears the Happy
  iOS app's icon, happy-desktop the desktop app's, happy-agent the agent's
  logo. The phone's sidebar draws no icon on a subtask row, as the current iOS
  app does:
    - Steve, **Team servers**, working now. Its conversation is running,
      coordinating three subtasks in three repositories. Two are done and
      idle, no working mark, their diff stats final; one is still working,
      its diff stats climbing for the whole take:
        - ↳ _iOS server codes_ (happy) `+41 −8`, working, `+186 −8` by the end
        - ↳ _Desktop sign-in_ (happy-desktop) `+251 −34`, done
        - ↳ _Agent sign-in_ (happy-agent) `+398 −24`, done
    - Kirill, _iOS overlay layout_ ↳ _iOS send fixes_ `+879 −80` (happy)
    - Steve, _Activity feed design_
    - Kirill, _11labs mobile_ ↳ _Mobile voice_ `+8k −8` (happy)
    - Kirill, _Landing page rebrand_ ↳ _Landing rebrand_ `+1.3k −88`
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

Seconds are take 11's cut seconds (after the 2× typing and the cut
freezes). Composition: the live homepage player's
1618×1000 at 60 fps. The window is 1303×805 at rest, centred, with a band
below it for the narration in plain sentences, subtitle style. It steps back
to 1150×710 at the left margin while the phone is forward. The narration is
not in the split tracks. The cut loops on the homepage.

| s    | Cue                             | On screen                                                                                                                                                                                                                                                                                | Narration                                   |
| ---- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 0    | `open`                          | The poster: new-task screen, the model list open (Claude, Codex, Grok, Antigravity, each under Current CLI), Kirill's pointer on the Model row that opened it. No phone. In the sidebar Steve's _Team servers_ and _iOS server codes_ spin, its diff stats climbing; the other two rest. | Pick any model from any provider.           |
| 1.8  | `model-scan`                    | The pointer glides into the list at Gemini 3.8 Flash and goes up it, past Grok 4.7 and Codex's models, to **Opus 5.5** under Claude.                                                                                                                                                     |                                             |
| 4.2  | `model-chosen`                  | He clicks Opus 5.5; the menu closes and the chip reads Opus 5.5.                                                                                                                                                                                                                         |                                             |
| 5.3  | `typing-started`                | He types _"Add an animated waveform to the voice agent."_ No task row exists anywhere yet.                                                                                                                                                                                               | Describe the work and send.                 |
| 9.5  | `phone-enter`                   | **Forward.** _Your teammate's phone_ rises beside the window, which steps back: Steve's own sidebar, which has no such task.                                                                                                                                                             |                                             |
| 10.4 | `sent` / `task-created`         | Enter. Now the task exists: its row arrives at the top of Kirill's Tasks and, at once, at the top of Steve's, with Kirill's face, and names itself **Voice waveform**.                                                                                                                   | Your teammate sees the new task right away. |
| 12.3 | `working`                       | Opus reads the voice files, `VoiceBars.tsx` and `VoiceAssistantStatusBar.tsx`.                                                                                                                                                                                                           |                                             |
| 13.0 | `phone-tuck`                    | **Tucked.** 1.6 s (1.4 s in the cut) after the task reached Steve's sidebar, the phone shrinks into the frame's right margin, partly past its edge, its label gone; the window comes back to full size.                                                                                  |                                             |
| 16.4 | `subtask`                       | Opus starts _Waveform bars_ in a worktree of happy: _"Waveform bars is writing the code; I'll put up a preview when it's in."_ The subtask's row appears under _Voice waveform_, its counts climbing edit by edit, from `+2 −2` at 19.6 s to `+87 −76` at 27.0 s.                        |                                             |
| 30.9 | `preview`                       | The subtask reports; Opus publishes an inline live preview, the waveform speaking (animated bars) and silent, and asks _"**@Steve**, how does it look?"_, a real mention of Steve.                                                                                                       |                                             |
| 33.7 | `phone-forward`                 | **Forward.** His phone comes forward again, and the window steps back. Steve taps the task in his sidebar: its conversation, the preview and the question.                                                                                                                               | A teammate jumps in.                        |
| 41.7 | `phone-typing`                  | On the iOS keyboard Steve types _"Love it. Narrower though, five bars max."_ (a word at a time, played 2×, both screens).                                                                                                                                                                | They review the preview and reply.          |
| 43.3 | `phone-sent` / `steve-feedback` | He sends; his message lands in Kirill's conversation with Steve's face.                                                                                                                                                                                                                  |                                             |
| 46.6 | `phone-home`                    | Steve goes back to his sidebar.                                                                                                                                                                                                                                                          |                                             |
| 47.2 | `phone-tuck` (2nd)              | **Tucked** again, for the rest of the take; the window comes back to full size.                                                                                                                                                                                                          | The agent picks up the feedback.            |
| 48.1 | `five-bars`                     | Opus rewrites the page: the first preview, still in view above Steve's note, turns to five bars.                                                                                                                                                                                         |                                             |
| 49.2 | `outro`                         | Opus: _"Five bars it is."_ The result rests.                                                                                                                                                                                                                                             |                                             |
| 51.3 | `settled`                       | The narration has gone; the last 0.6 s dissolve into the first frame, the tucked phone fading out with it.                                                                                                                                                                               |                                             |

Throughout, Steve's _Team servers_ keeps working in both sidebars: the
several repositories at once are his, two parts already done and _iOS server
codes_ under way when the take opens, its counts climbing, one edit every
three seconds.
Neither screen scrolls the conversation beyond keeping its latest message in
view. The 700-px-tall window keeps the first preview in view above Steve's
note and the answer, so the preview itself turns to five bars
(`world.fiveBarsShownAgain` is false).

The phone's states, which the homepage hero may follow, are in the split
tracks' `take.json` as `phoneStates`, in cut seconds: forward from
`phone-enter`, tucked from `phone-tuck`, forward from `phone-forward`, and
tucked from the second `phone-tuck` to the end. Steve's part (`phonePart`)
runs from `phone-enter` to the second `phone-tuck`. In take 11: forward
9.45–12.95 s, tucked 12.95–33.72 s, forward 33.72–47.22 s, tucked
47.22–52.0 s, and `phonePart` 9.45–47.22 s.

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
- **Tools.** Reads, edits, `create_artifact`, `write_artifact_file`, and the
  `create_subtask` calls are the daemon's real tools. The subtasks are real
  workspace-bound subtasks in real Git worktrees; every diff stat is the
  daemon's live Git count. _Waveform bars_ makes ten real `Edit` calls to
  `VoiceBars.tsx` and `VoiceAssistantStatusBar.tsx` (`world.voiceEdits`), and
  its last word reaches the task as its report.
- **The worktree watch.** The desktop asks Happy Core to watch a new
  worktree's Git state the moment it is announced
  (`happy-desktop-state`'s `connectHappyAgent.ts`, on `workspace.created`),
  while the worktree is still initializing. Happy Agent v0.4.111 refuses
  that whole request (409 `not_initialized`), and the desktop asks again
  only on its two-minute renewal, not when the worktree becomes ready. The
  new row would show no counts for the rest of the take. Until that is fixed,
  once the worktree is ready the director sends the same request the renewal
  sends, `POST /v0/git/watch` with every active project and workspace,
  through Kirill's own client. Everything after it is the daemon's own scan.
  The moment is in `filmed.json` (`gitWatchRenewed`) and in the cut's
  `edits.staging`.
- **Mention.** The agent mentions Steve with his real user link,
  `[Steve](happy://users/<his user ID>)`, which the desktop draws as a bold
  **@Steve**.
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
- **Edits.** Steve's typing plays at 2×, and his phone's driver types it a
  word at a time, the keyboard still pressing each key. The desktop is
  captured from Chromium's screencast, which on the Mac mini sometimes holds
  one picture for about a quarter second in the middle of motion; the take
  lists every such freeze (`freezes.json`) and the cut drops those frames
  from both screens, so motion joins up instead of hanging. A stall longer
  than half a second stays as a hold on the window instead
  (`cutFreezesLongest`, listed as `freezesHeld`): cutting it would skip that
  much of the phone's motion. The cut's last 0.6 s dissolve into its first
  frame, and each split track's into its own, so the homepage loop has no
  seam. Every edit is listed under `edits` in the cut's `team.json`, its
  `team.evidence.json` and the split tracks' `take.json`. Kirill's feed is
  marked read while he watches his own task, so no feed badge interrupts the
  take. The new subtask is kept read the same way, so its report puts no
  unread dot on the rail.
- **Background work.** The earlier tasks, Steve's own _Android Push Fixes_
  and _Sync Benchmarks_, and Steve's running _Team servers_ are made off
  camera through the same API; their transcripts and the pace of their edits
  are screenplay data. _Agent sign-in_ and _Desktop sign-in_ write all their
  edits and finish before the take; _iOS server codes_ is the one still
  working.

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

The window is 1133×700 CSS pixels at 2× (2266×1400), on React's production
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
