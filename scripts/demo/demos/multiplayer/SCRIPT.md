# Multiplayer

Five short takes of one world for the multiplayer video, cut together by
`scripts/demo/compositions/multiplayer/` into a 1920×1080 cut and a
1080×1080 one.

Recorded against Desktop v2026.11.1-preview.10 (`HAPPY_DEMO_APP_SOURCE`
pointing at a `git archive v2026.11.1-preview.10` tree with its own
`pnpm install`) and the Happy Agent v2026.11.5 release binary (`HAPPY_DESKTOP_AGENT_EXECUTABLE`), dark, at
`HAPPY_DEMO_DEVICE_SCALE=2.5` so the camera can push in to 2.2 output pixels
per CSS pixel and still only scale down, in the gym's isolated `.d` world.
`HAPPY_DEMO_LOCAL_HOUR=10.5` sets the browser's time zone so the clock reads
late morning.

```sh
for shot in aware activity bots artifacts step-in; do
    rm -rf .d && MULTIPLAYER_SHOT=$shot pnpm demo record multiplayer --appearance dark --out <wide>/$shot
    # the square cut's takes: a 420 px session pane
    rm -rf .d && MULTIPLAYER_VIEWPORT=764x700 MULTIPLAYER_SHOT=$shot pnpm demo record multiplayer --appearance dark --out <square>/$shot
done

# the backdrop: the App Store video's marbled shader, as a seamless loop
bash scripts/demo/compositions/multiplayer/make-backdrop.sh <backdrop.mp4>

node scripts/demo/compositions/multiplayer/compose.mjs \
    scripts/demo/compositions/multiplayer/cut.mjs --backdrop <backdrop.mp4> \
    --take aware=<wide>/aware/multiplayer.mp4 ... --take step-in=<wide>/step-in/multiplayer.mp4 \
    --out <dir> [--stills 5.4,...] [--poster 5.4]
# the same with cut-square.mjs and the <square> takes
```

Each take needs a fresh `.d`. The cuts read each take's `cues.json`, so a
re-recorded take needs no retiming in `chapters.mjs`.

## The takes

1. **aware**, "See who's working on what". Kirill is in his own task and
   touches nothing. Scoteezy starts Android Push Fixes, Maya Docs Search and
   Emma Launch Email, each through their own sign-in; each row arrives at the
   top of Kirill's TASKS with its owner's face, and Activity counts it.
2. **activity**, "Catch up on what shipped". Kirill opens Activity. On top is
   the Launch checklist, a shared todo list Steve made and each teammate added
   to from their own sign-in (the entry stacks their faces), then the cold sync
   benchmark Maya's agent published, drawn as a post with its summary and
   cover.
3. **bots**, "Shared bots for the standing jobs". Kirill opens Desktop
   Releases, where his own request is already answered. Steve writes in it
   through his own sign-in while Kirill looks; it answers him by name, then waits
   on the Windows build with the daemon's own `wait`.
4. **artifacts**, "Share what your agents make". Kirill opens Artifacts, where
   his teammates' agents' pages are listed under the tasks they came from, and
   opens the cold sync benchmark.
5. **step-in**, "Step in when it's your call". Kirill is in Steve's task, in
   Auto. Its subtask reports, and the agent asks Kirill by his user mention and
   ends its turn on the question. Kirill types a short answer; the agent takes
   it, and the hand leaves the composer.

## What is staged

- People: Kirill and Steve wear the team demo's pictures, and every message,
  mention and exchange on camera is between the two of them. Emma, Maya and
  Sam are fictional teammates; Scoteezy is one of Happy's open-source
  contributors, cast at Kirill's request in his public GitHub picture
  (`assets/scoteezy.jpg`). Those four only own tasks that arrive in the
  sidebar and show as faces in Activity; what they do here is the
  screenplay's. First names only. The cast lives in `world.mjs`; swapping a
  person is one entry and one picture, then one re-record per chapter.
- Stock photographs: the fictional teammates wear free Unsplash photos under
  the Unsplash License (free for commercial use, no attribution required),
  each cropped to a 460 px square headshot:
  - `assets/emma.jpg`: Vitaly Gariev, https://unsplash.com/photos/s3aDHKxHZSc
  - `assets/maya.jpg`: alex starnes, https://unsplash.com/photos/WYE2UhXsU1Y
  - `assets/sam.jpg`: Christian Buehner, https://unsplash.com/photos/DItYlc26zVI
- Bots: Desktop Releases, Mobile Releases, Alerts and Growth are created in the
  gym. Each wears one of the app's own placeholder pictures, the still the app
  being filmed ships (`avatar-placeholders/`), pinned by number so a bot looks
  the same in every take. The Chief of Staff keeps its picture. Nothing is read
  from any real server or bot.
- Words: every agent and bot reply is the screenplay's (`world.mjs`). The
  daemon's own tools run: subtasks and their reports, `create_artifact` for
  the three artifacts, each with a summary and a cover (published off camera
  by the tasks they belong to; the pages and their covers are `artifacts/`,
  the covers rendered by `artifacts/render.mjs`), the bot's `wait`, and the
  mentions, which are real `happy://users/<id>` links the app draws.
- The Launch checklist and its todos are made off camera through each
  person's own client, as the app would make them.
- Earlier work runs off camera in full access so nothing waits on a review;
  every task whose composer is on camera is in Auto.
- Activity is kept read for the length of the takes it is not the subject of
  (every take but aware and activity),
  as the team demo keeps its Feed read, so no badge counts up off topic.
- **Slow-motion arrivals.** The sidebar's insert glide is 160 ms, five frames
  at 60 fps. While a row or a message arrives, the recorder sets the page's
  animation playback rate to 0.33 through the DevTools Animation domain, holds
  for 560 ms, and sets it back to 1. The app, its code and its animation curve
  are untouched and nothing is redrawn; any working indicator on screen runs
  slow for that half second too. Only arrivals are slowed. Each take's
  `filmed.json` lists them under `slowMotion`.
- The composition draws the backdrop, the window buttons, the camera's push
  (the whole window scaled up, running past the frame), the captions and their
  pill, and the cards. Chapter 1 opens on its take's first frame held still
  while the camera moves in, and a chapter whose take ends on a settled window
  may hold that last frame; both are the take's own pixels. None of it is the
  app.
