# Team demo: Kirill starts a task, and Steve has it before Kirill looks up

Status: **r3, approved by Kirill** with two changes, applied here: on camera
he picks Claude → Opus 5.5 (not OpenAI → GPT-6.1 Terra), and Steve finds the
task in his sidebar, not in a Feed. Times are targets until the first take.

The take opens on Kirill's "Create a new task" screen with the model menu
already open, on a busy team server where Steve's task is fanning out across
three repositories. Kirill picks the provider, Claude, then Opus 5.5, and
asks for an animated waveform in the voice agent. Nothing exists until he
sends. On Send the task is created, and at that moment it is in Steve's
sidebar on his phone, with Kirill's face. Opus works and puts up a live
preview; Steve opens the task from his sidebar, checks the design, and answers
in the same task. The take ends on his feedback arriving on Kirill's screen.

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
tasks. No other people, and no generated faces.

## The opening frame (set dressing)

Kirill's desktop, dark appearance.

- **Server rail**: exactly two servers. On top, Kirill's personal server (his
  own machine, wearing his photo). Below the divider, the team server **Happy
  Core**, wearing the Happy Core icon, selected.
- **Bots** on Happy Core, each with its real face from the real installation:
  Chief of Staff, Disk Sweeper, iOS Production Train, Product Health.
- **Tasks**, each with its owner's face; subtasks carry their repository's real
  project icon and their diff stats:
    - Steve, **Team servers**, working now. Its conversation is running, and
      three subtasks under it are working at once in three repositories, their
      diff stats climbing for the whole take:
        - ↳ _Agent sign-in_ (happy-agent) `+412 −38`
        - ↳ _Desktop sign-in_ (happy-desktop) `+268 −51`
        - ↳ _iOS server codes_ (happy) `+190 −12`
    - Kirill, _iOS overlay layout_ ↳ _iOS send fixes_ `+921 −122` (happy)
    - Steve, _Activity feed design_
    - Kirill, _11labs mobile_ ↳ _Mobile voice_ `+8k −12` (happy)
    - Kirill, _Landing page rebrand_ ↳ _Landing rebrand_ `+1.3k −134`
      (slopus.github.io)
- **Main pane**: "Create a new task", its composer below, and the model menu
  open on its list: Claude, Codex, Grok and Antigravity, each with its models;
  the current pick is Codex's GPT-6.1 Terra. This is the poster frame.

## Beats

Seconds are the cut's (take 4: 38 s at 60 fps, after the 2× typing and the
cut freezes). Composition: the live homepage player's 1618×1000 at 60 fps,
captions in the band above the window.

| s    | Cue                           | On screen                                                                                                                                                              | Caption                                |
| ---- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 0    | `open`                        | The poster: new-task screen, model menu open (Claude, Codex, Grok, Antigravity). In the sidebar Steve's _Team servers_ and its three subtasks spin, diff stats moving. | Any provider                           |
| 3.9  | `provider-chosen`             | Kirill opens **Claude**'s account list and picks _Kirill's Max_; the menu stays on Claude's models.                                                                    |                                        |
| 4.9  | `model-chosen`                | Then **Opus 5.5**. The menu closes; the chip reads Opus 5.5.                                                                                                           | any model                              |
| 6.6  | `typing-started`              | He types _"Add an animated waveform to the voice agent."_ No task row exists anywhere yet.                                                                             | Just say what you want done            |
| 9.9  | `sent` / `task-created`       | Enter. Now the task exists: its row arrives at the top of Tasks with Kirill's face and names itself **Voice waveform**.                                                |                                        |
| 10.3 | `phone-enter`                 | **Steve's phone** rises beside the window, which slides left to make room. In his sidebar, _Voice waveform_ has just arrived under Tasks with Kirill's face.           | Steve sees it the moment it starts     |
| 11.7 | `working`                     | Desktop: Opus reads the voice files.                                                                                                                                   |                                        |
| 13.4 | `phone-open`                  | Steve taps it in his sidebar: the task's conversation, live on his phone. Opus builds the waveform; both screens follow along.                                         | Opus gets to work                      |
| 17.3 | `preview`                     | An inline live preview in the task: the waveform speaking (animated bars) and silent, on both screens.                                                                 | and shows a live preview               |
| 26.2 | `phone-typing` / `phone-sent` | On the iOS keyboard Steve types _"Love it. Narrower though, five bars max."_ and sends (his typing plays 2×, both screens).                                            | Steve checks the design from his phone |
| 32.5 | `steve-feedback`              | His message lands in Kirill's conversation with Steve's face; Opus answers _"Five bars it is."_                                                                        | and answers in the same task           |
| 35.4 | `outro`                       | Hold on both screens.                                                                                                                                                  | Happy. Work together.                  |

Throughout, Steve's _Team servers_ keeps working in the sidebar: the several
repositories at once are his, already under way when the take opens.

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
  Nobody adds him.
- **Inference.** Screenplay inference: the agent's words, tool calls and timing
  are scripted so every take lands the same beats. Opus 5.5 is the model
  picked on camera; the background work is recorded as GPT-6.1 Terra. No live
  model answers on camera.
- **Tools.** Reads, edits, `create_artifact`, and the background task's
  `create_subtask` calls are the daemon's real tools. The subtasks are real
  workspace-bound subtasks in real Git worktrees; every diff stat is the
  daemon's live Git count.
- **Repositories.** Small fixture checkouts named happy-agent, happy-desktop,
  happy and slopus.github.io, wearing the real project icons. Not the
  production repositories.
- **Phone.** The native Happy iOS app built from `happy` main for the iOS
  Simulator (an iPhone 17 Pro on iOS 26) on the Mac mini, paired to Happy Core
  as Steve through its real mobile pairing. An XCUITest driver performs his
  taps and his typing on the Simulator's iOS keyboard; his message is authored
  by Steve's own credential. `simctl io recordVideo` captures the screen; the
  status bar reads 9:41 with full bars, and the composition draws the iPhone
  frame. The phone's movie is put on the desktop's clock by wall time and
  conformed to a constant 60 fps; `phone-capture.json` reports the cadence the
  Simulator actually delivered while the phone moved.
- **Edits.** Steve's typing plays at 2×. The desktop is captured from Chromium's
  screencast, which on the Mac mini sometimes holds one picture for about a
  quarter second in the middle of motion; the take lists every such freeze
  (`freezes.json`) and the cut drops those frames from both screens, so motion
  joins up instead of hanging. Kirill's feed is marked read while he watches
  his own task, so no feed badge interrupts the take.
- **Background work.** The earlier tasks and Steve's running _Team servers_
  are made off camera through the same API; their transcripts and the pace of
  their edits are screenplay data.

## Recording

On the Mac mini, with the Simulator visible (it renders at 60 Hz only when
on screen):

```sh
HAPPY_DEMO_VITE_PRODUCTION=1 HAPPY_DEMO_DEVICE_SCALE=2 TEAM_PHONE=1 \
  node --import tsx scripts/demo/record.mjs record team
node --import tsx scripts/demo/record.mjs compose team \
  --desktop scripts/demo/demos/team/artifacts/team.mp4 \
  --phone scripts/demo/demos/team/artifacts/phone-screen.mp4 \
  --cues scripts/demo/demos/team/artifacts/cues.json
```

The window is 1000×700 CSS pixels at 2× (2000×1400), on React's production
build. Composing writes the cut (`team.mp4`) and, in `split/`, the window and
the phone screen alone on the cut's clock for the homepage hero: AV1 and H.264
(level 5.1) at 60 fps, 80% 30 fps cuts, posters, `captions.vtt`, and
`take.json` with every cue and Steve's part in the cut's seconds.

## Still open

1. The Happy Core icon and the uploaded faces of Chief of Staff and Disk
   Sweeper are exports pending from Kirill. Until they arrive the take uses
   the daemon's own defaults for those three. The take measures where each is
   drawn; dropped into `assets/` as `happy-core.png`, `chief-of-staff.png` and
   `disk-sweeper.png`, they are swapped in by composing again, without a new
   take. iOS Production Train and Product Health wear their seeded shader
   faces, drawn from their real IDs.
