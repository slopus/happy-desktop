# The update story — experience brief

This file is the authoritative requirements contract for `resume.mp4`. Every
render is reviewed against this brief, beat by beat, before it counts. The
pipeline (`scripts/demo/`) is a means; this document describes the artifact.

## The premise

> **Updates don't phase your agent — if it's Happy.**

Cold open, two cards, verbatim:

1. `"F***. My agent stopped because of a Claude update."`
2. `"Never with Happy."`

That is the whole argument. Everything on screen exists to prove card 2.

## The user experience being sold

You ask your agent for real work. It starts a turn: reasoning, then tool
calls, output streaming live. **While a tool is still running**, an update
arrives. You click Install. Nothing pauses. The update takes a _cooperative
wait_: it waits for the running operation to reach a durable edge — every
operation in Happy is durable — then the whole harness restarts under a new
PID and a new version. And the **same turn keeps going**: the app comes back,
the turn is still Working, its elapsed clock continues from where it was, the
_next tool call starts under the new version_, streams its output, and the
turn completes — one unbroken `Completed in …` that _spans the update_.

The user did nothing to protect their work, defer the update, or resume
anything. Restart is a non-event.

## Why this is desired

Restart is treated as data loss everywhere else, and people say so in public:

- jack friks: Claude desktop's nightly auto-update "is killing my overnight
  agent workflows" — his workaround is `chown`ing the app bundle so the
  updater can't touch it.
- Steve Ruiz (tldraw): "How do you avoid the thrash of 'please restart to
  update' in the desktop app?"
- "Even if you had a task running for 6 hours … they all died, everything
  they did died with them and you start again." (on Claude Code resume)
- A whole product category (Fazm, Atrium, Hillnote, Navide) exists only to
  checkpoint what these tools lose on restart.

Happy's answer is architectural, not a checkpointing bolt-on: operations are
durable, so the harness process is disposable. This video is the proof.

## The exact example, beat by beat

All live-work beats play in real time. Prompt typing may accelerate with the
explicit 3× marker described below. Target 50–70 seconds total;
do not pad a good shorter take to meet the old 80–100 second target.
Times are illustrative; the shape and the on-screen evidence are mandatory.

| Time      | On screen                                                                                                                                       | The viewer must be able to read                                                           |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 0:00–0:05 | Cold-open cards 1 and 2                                                                                                                         | The two premise lines, nothing else                                                       |
| 0:06–0:22 | Existing conversation, then prompt typing with real keyboard sound; send                                                                        | A person asking an agent for work — no caption explaining the set dressing                |
| 0:22–0:28 | Thinking, then tool 1 starts; elapsed clock counting                                                                                            | The agent is mid-task when the update arrives                                             |
| 0:28–0:39 | Download → ready → Install; pull back before the full-window install screen appears; hold the complete slug animation and the running-tool wait | Your tool gets to finish. The whole slug, heading, and progress bar stay inside the frame |
| 0:39–0:44 | Daemon stops; **new PID**; starting → reconnect                                                                                                 | A real restart, with the current product's retained app underneath                        |
| 0:44–0:49 | The app is back, the same turn still Working. Fresh response text starts within 2.5 seconds; a brief tool 2 follows                             | The response picks up where it left off, without a long empty post-reload wait            |
| 0:49–1:02 | Final answer streams; one `Completed in …`; inline sticker result                                                                               | The promised work arrives without sending “continue”                                      |
| 1:02–1:07 | Close card: `Updates don't phase your agent — if it's Happy.`                                                                                   | The premise, restated as a conclusion                                                     |

## The parts that matter, in priority order

**1. The same turn visibly continues after the reload.** This is the thesis
shot and the previous cuts missed it: they drained the turn to completion
_before_ the restart, so the reload revealed a finished transcript — which
reads as "the update ended the turn", the exact opposite of the premise. The
restart must land at a mid-turn durable edge with work remaining, and after
the harness reloads the viewer must watch, live: Working state → elapsed
clock continuing from its pre-restart value → a **new tool call starting and
streaming** → the answer → one settled `Completed in …`. If a viewer could
believe a new turn started after the update, the video has failed.

**2. Live work stays real-time; only typing may accelerate visibly.** Start
typing at normal speed, then show a small “3×” marker during faster typing.
Remove the marker when typing finishes and hold the completed, unsent prompt
for at least a second before Send. Typing sounds retain their original pitch.
Do not accelerate the thinking, tool, install, restart, or response beats.
Video time equals wall time throughout those beats: no off-clock gaps,
compressed inference, or time-lapse. The
previous cut compressed minutes of live work into 44 seconds and was hard to
watch. Pacing is achieved by _scenario design_ — scripted tools that take a
few seconds, the inference gate holding hand-offs until the camera is ready —
never by manipulating time in capture or post. Verifiable: the on-screen
elapsed clock advances 1:1 with video time for the entire video.

Capture must preserve fluid animation, not merely encode a low-cadence image
sequence in a 60fps container. Use continuous compositor capture, retain its
source timestamps, and inspect the slug, spinner, pointer, and camera motion.

**3. The typing must sound real.** Real recorded mechanical-keyboard
samples (license-clean), or a simulator indistinguishable from a recording —
the standard is a speed-typing-trainer's clickity, not a synthesized tick.
Concretely: many distinct per-key samples (no two presses with an identical
transient), distinct spacebar and Enter sounds, human cadence with jitter,
bursts, and micro-pauses. The current three-variant synthesized palette in
`sounds.mjs` is rejected.

**4. Every caption speaks to the viewer.** The opening conversation needs no
caption. Never narrate our requirements (“real workspaces”, “new PID”, “durable
edge”, fixture dressing, or implementation claims). The emotional sequence is:
an update at an inconvenient moment → permission to install anyway → the tool
gets to finish → the response picks up → no lost work or need to say “continue”.
Leave breathing room; do not caption every state transition. A viewer with the
sound off must still understand the benefit.

**5. Frame the subject, not the last click.** Leave the update-menu crop before
Install. Keep the full slug and all restart progress visible for the whole
install sequence. On reconnect, the response is the subject: no sidebar crop,
no long held Working shot, and no prolonged second-tool wait. Shorten the
scripted inference/tool delays, never speed up the footage.

## Truthfulness (non-negotiable)

The updater envelope (download/install surface data) is scripted because a
browser has no Electron updater. Everything below it is the real product:
real daemon, real drain and cooperative wait, real stop/start under a new
PID, real durable continuation of the same run. Inference is a screenplay and
the displayed updater version envelope is scripted; the daemon executable is
the latest released Happy Agent. Desktop is rebased onto current `origin/main`.
The continuation must never
be faked or reordered in the edit — the take _is_ the integration proof, and
`assert()` must keep proving every claim, including: the run was still
unsettled when the app reconnected, a tool call became visible only after the
restart, and the restart changed the PID.

## Acceptance checklist (reviewed EVERY render)

- [ ] Cold open shows the two premise cards; close card restates the premise.
- [ ] A tool is visibly streaming when the update arrives and when Install is
      clicked.
- [ ] The install surface visibly waits on the running work.
- [ ] The complete slug animation, heading, and progress stay in frame throughout
      install; no leftover update-menu crop.
- [ ] The harness visibly restarts (shutdown → starting → reconnect). The
      recorded PID changes; raw process IDs need not be narrated or shown in
      the video. Current Desktop retains its app tree during this sequence.
- [ ] After the reload: same turn Working, elapsed clock continuous with its
      pre-restart value, then a new tool call starts and streams, then the
      answer, then one `Completed in …` spanning the whole turn. Fresh response
      text begins within 2.5s of the conversation returning.
- [ ] Live work is 1:1 with wall time, including initial inference; typing
      acceleration alone is labelled “3×”, removed before a readable unsent pause.
- [ ] Animations are fluid, with continuous source-frame delivery rather than
      long repeated screenshots inside a nominal 60fps video.
- [ ] Typing sounds like a real keyboard: distinct per-key transients, human
      cadence; send/arrive cues present; levels comfortable.
- [ ] Captions connect to the viewer's experience, with no requirements or
      implementation narration; no caption is needed for the opening workspace.
- [ ] Total length roughly 55–75s (50–85s allowance), without padded waits.
- [ ] Latest Desktop main and latest released Happy Agent are used in isolation.
- [ ] `assert()` proves the durable-continuation claims listed above.
