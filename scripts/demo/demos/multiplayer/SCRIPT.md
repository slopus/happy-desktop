# Multiplayer

Three short takes of one world for the multiplayer video, cut together by
`scripts/demo/compositions/multiplayer/`.

Recorded against Desktop v0.0.103 (`HAPPY_DEMO_APP_SOURCE` pointing at a
`git archive v0.0.103` tree with its own `pnpm install`) and the Happy Agent
v2026.11.4 release binary (`HAPPY_DESKTOP_AGENT_EXECUTABLE`), dark, at
`HAPPY_DEMO_DEVICE_SCALE=2`, in the gym's isolated `.d` world.

```sh
MULTIPLAYER_SHOT=aware   pnpm demo record multiplayer --out <dir>
MULTIPLAYER_SHOT=bots    pnpm demo record multiplayer --out <dir>
MULTIPLAYER_SHOT=step-in pnpm demo record multiplayer --out <dir>
# the same exchange with a 420 px session pane:
MULTIPLAYER_VIEWPORT=764x700 MULTIPLAYER_SHOT=step-in pnpm demo record multiplayer --out <dir>

node scripts/demo/compositions/multiplayer/compose.mjs \
    scripts/demo/compositions/multiplayer/cut.mjs \
    --take aware=<dir>/multiplayer.mp4 --take bots=<dir>/multiplayer.mp4 \
    --take step=<dir>/multiplayer.mp4 --take phone=<take 11's phone track> --out <dir>
```

Each take needs a fresh `.d` (remove it between shots).

## The takes

1. **aware**, "See who's working on what". Kirill is in his own task and
   touches nothing. Steve starts Android Push Fixes, then Leo starts Docs
   Search, each through their own sign-in; each row arrives at the top of
   Kirill's TASKS with its owner's face and the working indicator.
2. **bots**, "Shared bots for the standing jobs". Kirill opens Desktop
   Releases. Steve asked it to cut a preview and Anna asked to hear when it is
   out, each through their own sign-in; it answers Anna by name while he
   looks, then waits on the Windows build with the daemon's own `wait`.
3. **step-in**, "Step in when it's your call". In Kirill's task the agent asks
   Steve by his user mention; Steve answers through his own sign-in, and his
   words land under his name and face; the agent takes the answer.

## What is staged

- People: Kirill and Steve wear the team demo's pictures. Anna and Leo are
  invented teammates with generated portraits (`assets/anna.jpg`,
  `assets/leo.jpg`). First names only.
- Bots: Desktop Releases, Mobile Releases, Alerts and Growth are created in the
  gym and wear generated pictures (`assets/<username>.png`). Their names follow
  the kind of standing job a team gives a bot; nothing is read from any real
  server or bot.
- Words: every agent and bot reply is the screenplay's (`world.mjs`). The
  daemon's own tools run: subtasks, the `Read`, the bot's `wait`, the agent's
  mention of Steve is a real `happy://users/<id>` link the app draws.
- Activity is kept read for the length of a take, as the team demo keeps its
  Feed read, so no badge counts up while the take's subject moves.
- **Slow-motion arrivals.** The sidebar's insert glide is 160 ms, five frames
  at 60 fps. While a row or a message arrives, the recorder sets the page's
  animation playback rate to 0.33 through the DevTools Animation domain, holds
  for 560 ms, and sets it back to 1. The app, its code and its animation curve
  are untouched and nothing is redrawn; any working indicator on screen runs
  slow for that half second too. Only arrivals are slowed. Each take's
  `filmed.json` lists them under `slowMotion`.
- The session pane's dimming in chapter 1, the window buttons, the backdrop,
  titles and cards are drawn by the composition, not by the app.
