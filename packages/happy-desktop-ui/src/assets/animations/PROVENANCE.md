# Animation provenance

## Spider catching a bug

`spider-catching-bug.json` was supplied by the project owner as
`spider catch bug.tgs`. The JSON is the original TGS payload decompressed without
editing or retiming. It is Lottie 5.5.2, 512×512, 60fps, frames 120–300 (three
seconds), 39 vector layers, and has no raster or external image assets. The
decompressed file is 363,723 bytes; its SHA-256 is
`565ab5c14c9aab8f216daaf594bfc846296bd61ee73c6c83ad405848ef84ca32`.
The replacement upload from the owner's Mac Desktop was verified as 48,638 bytes
with TGS SHA-256
`d674652f3166098021fe3e06ee234d758b1d37ce4667c21b46408c61f457f80d`.
Its decompressed payload is byte-identical to this JSON.
The supplied file records no author or upstream license metadata.

The scene means **a safety net helps catch unintended agent actions**. Windows
sandbox setup plays it once on appearance through source frame 250 (relative
frame 130, because the source in-point is 120), then holds the spider down with
the bug still caught and its wings folded. Both wing rotations are at their 0°
keyframe, before the bug's departure begins at source frame 254.
The existing worker renderer clips playback with a segment;
replays and reduced-motion holds use the same end frame. The asset is unchanged.

## Crow eating a worm

`crow-eating-worm.json` was supplied by the project owner as
`crow eating worm.tgs` on 11 November 2026. The JSON is the original TGS
payload decompressed without editing or retiming. It is Lottie 5.6.3, 512×512,
60fps, frames 0–180 (three seconds), 40 layers, and has no raster or external
image assets. The TGS is 40,545 bytes with SHA-256
`3af7040f0912cf393b8f964435ef7cac46451361b91d39da66946fb465d68c55`; the
decompressed file is 298,275 bytes with SHA-256
`552afcb2eb6c648a6ba5356acdea938c11fb9d21df521230fe7b868a72e4e322`.
The supplied file records no author or upstream license metadata.

The scene means **a bug is being reported, so it can be eaten**. It heads the
sidebar's bug report card and plays once each time the card opens.

## Tickets

`tickets.json` was supplied by the project owner on 7 November 2026. The JSON is
the supplied TGS-derived payload copied without editing or retiming, including
its `tgs` key, which the renderer ignores like every other file's here. It is
Lottie 5.5.2, 512×512, 60fps, frames 60–240 (three seconds), 18 layers, and has
no raster or external image assets. Like the spider, its in-point is not 0; the
renderer plays from the in-point, so no segment is needed and the scene ends and
holds on its own last frame. The supplied file records no author or upstream
license metadata.

The scene means **finished work is kept here, and none has been kept yet**. It
belongs to the settled empty artifacts list, on the page and in the side panel.
While the catalog is still loading, and when filters match nothing, the list
keeps its plain glyph.

## Clapper board

`clapper-board.json` was supplied by the project owner on 11 November 2026 as
`action for tasks.tgs` (36,870 bytes, SHA-256
`764ae6522784fb6ed9dcc7a40674216b79f11756046e2fc625f3df03c84868ad`). The JSON
is that file gunzipped and nothing else: no editing, retiming, or
re-exporting, and it keeps its `tgs` key, which the renderer ignores. It is
Lottie 5.5.2, 512×512, 60fps, frames 0–151, 36 layers, and has no raster or
external image assets. The supplied file records no author or upstream license
metadata.

The scene means **a piece of work is about to begin**. It stands over the title
of the page a new task is made on.

## Where these came from

The original five files were copied from `happy-list` (the Happy Coder React
Native app), `sources/assets/animations/`, on 2 August 2026 — `sparkles.json`
first, the other four on the same day the vocabulary was widened.
`alien-monster.json` followed on 22 August 2026 from that directory's
`game.json`. Each is byte-identical to its source: none was re-exported,
re-drawn, re-timed, or otherwise modified. `cat-face.json`, `closed-lock.json`,
`confetti-ball.json`, `fox.json`, `hatching-chick.json`, `llama.json`,
`party.json`, and `unicorn.json` were supplied by the project owner on 22
August 2026. `disguised-face.json` was supplied by the project owner on 23
August 2026. `cherry-blossom.json`, `front-facing-baby-chick.json`,
`mirror-ball.json`, and `open-hands.json` were supplied by the project owner on
26 August 2026, and `cloud-variation.json` and `monkey-hear-no-evil.json` on 27
August 2026. `seedling.json`, `sprig.json`, and `tree.json` were supplied by the
project owner on 9 November 2026 (as `seeding.json`, `spring.json`, and
`tree.json`) and copied unchanged under these names. Their upstream sources are
not recorded in the files.

| File                           | SHA-256                                                            | Format                                        | Size              |
| ------------------------------ | ------------------------------------------------------------------ | --------------------------------------------- | ----------------- |
| `alien-monster.json`           | `e0875ef4ae4aa214a3d9de567ea39e9429465addabc91d177ea883302146ae89` | Lottie 5.5.2, 512×512, 60fps, 180f, 14 layers | 66 KB / 5 KB gz   |
| `cat-face.json`                | `21d629ce58ad92bf140bfb7f5534e553232376a56c6bdddd0e527523a89c4d90` | Lottie 5.5.2, 512×512, 60fps, 180f, 17 layers | 367 KB / 66 KB gz |
| `cherry-blossom.json`          | `4b6c31349911d268c4509e184aac61d877269d7e57745a32c750c851d8a25153` | Lottie 5.5.2, 512×512, 60fps, 180f, 30 layers | 309 KB / 42 KB gz |
| `clapper-board.json`           | `321f9dfe9e03985a6da6168300fcea7f1d9f886bc111c38fd78043f4fc2244ae` | Lottie 5.5.2, 512×512, 60fps, 151f, 36 layers | 263 KB / 38 KB gz |
| `closed-lock.json`             | `f6087f51de1ccc7dea5cfb9853292bc14271e86e9390a8fbc9514b31b32a0ad8` | Lottie 5.5.2, 512×512, 60fps, 180f, 14 layers | 146 KB / 14 KB gz |
| `cloud-variation.json`         | `4833ea8c714e353818667d8c8e39ce807273e86c79c2d473f2331a00526600aa` | Lottie 5.5.2, 512×512, 60fps, 180f, 39 layers | 143 KB / 12 KB gz |
| `confetti-ball.json`           | `65e82eafe12ac295ce747336f8453e3c500d3c130f77db97581431bf1c7d9fc5` | Lottie 5.5.2, 512×512, 60fps, 180f, 41 layers | 193 KB / 20 KB gz |
| `disguised-face.json`          | `2f4aa4452a5b785882bee5435a26774443b1a8232bfaa79136c22f2f4a2fa0d1` | Lottie 5.5.2, 512×512, 60fps, 180f, 17 layers | 281 KB / 41 KB gz |
| `fox.json`                     | `7206bf1b9c34fd7d149e79747b48f7c9a1f51fd42ca92f4f344dee53eed0cd70` | Lottie 5.5.2, 512×512, 60fps, 180f, 20 layers | 368 KB / 38 KB gz |
| `front-facing-baby-chick.json` | `27eaed25a9691b7f2e882e41ed2db6972b17d0a612089ac958da4af400eb9f45` | Lottie 5.5.2, 512×512, 60fps, 180f, 20 layers | 182 KB / 15 KB gz |
| `hatching-chick.json`          | `1a693cca609409e3bf79c3c997801346bc083fd9ef2e6fa90689a1288be901dd` | Lottie 5.5.2, 512×512, 60fps, 180f, 3 layers  | 309 KB / 25 KB gz |
| `llama.json`                   | `ff16ee4b8a19a782b5e5b12dbe103d145410f16b8801af5723b6636c56a0a0ff` | Lottie 5.5.2, 512×512, 60fps, 180f, 27 layers | 462 KB / 60 KB gz |
| `mirror-ball.json`             | `58f32f20c8ac9d81f1cc403f6a473e1ff4480cd6aff986d1327efcc95d060a81` | Lottie 5.5.2, 512×512, 60fps, 180f, 36 layers | 836 KB / 41 KB gz |
| `monkey-hear-no-evil.json`     | `ac6eb10983eba058156d8ec1b34e5a1239a6378fb83a8ad11f7a5d61cb61634b` | Lottie 5.5.2, 512×512, 60fps, 137f, 15 layers | 143 KB / 17 KB gz |
| `open-hands.json`              | `7b5b9d98156057d2fb4cb895f0a462e943942be190dd0a302935e2ef306420b4` | Lottie 5.5.2, 512×512, 60fps, 179f, 3 layers  | 331 KB / 36 KB gz |
| `owl.json`                     | `95402270d116a310aa4b1606f88a2bbc79d2b4d947b5d84181c0b126c7aaba59` | Lottie 5.5.2, 512×512, 60fps, 131f, 18 layers | 284 KB / 47 KB gz |
| `party.json`                   | `de4ac9e38f2c7c3bc1e4022be841ec0c26b9b75cca51df43aaf9c0e97aaa1492` | Lottie 5.5.2, 512×512, 60fps, 180f, 40 layers | 131 KB / 15 KB gz |
| `robot.json`                   | `eeabc392ba20328ce97452eb826dddf3e306129e360ce4847c3b48470ffc053b` | Lottie 5.5.2, 512×512, 60fps, 180f, 13 layers | 343 KB / 30 KB gz |
| `seedling.json`                | `7502aa8d2b1d6741d9232115fe575298865de93d0c6a223c2d6f40bcb55652f9` | Lottie 5.5.2, 512×512, 60fps, 120f, 11 layers | 244 KB / 54 KB gz |
| `snail.json`                   | `6a9c7b648681ae9d15b31455a76f7d47c5f53d6d72da10b8e43ba134fbd47a2c` | Lottie 5.5.2, 512×512, 60fps, 180f, 19 layers | 368 KB / 42 KB gz |
| `sparkles.json`                | `b14e504ce3467a6ba1c519348dee9fc4e05286b9e4f058f33df9175865bde4b9` | Lottie 5.5.2, 512×512, 60fps, 180f, 23 layers | 104 KB / 8 KB gz  |
| `sprig.json`                   | `c85b8dd18781f0b6af739999a88c3d6864c5c3cfe825d629d75e744a278decc0` | Lottie 5.5.2, 512×512, 60fps, 180f, 11 layers | 329 KB / 49 KB gz |
| `tickets.json`                 | `8715ac66cadbd7cba548b81f7366e190592a7c515811c0df69d65ac8e9db51d4` | Lottie 5.5.2, 512×512, 60fps, 180f, 18 layers | 597 KB / 61 KB gz |
| `tree.json`                    | `cb7c9a130992909adba37c6032799c130fe455cdc5a93e16e50f89c3eaba0eee` | Lottie 5.5.2, 512×512, 60fps, 178f, 36 layers | 250 KB / 32 KB gz |
| `unicorn.json`                 | `1e250cde4b49782d9c3140faaf50bee1bfbe88478ac794bf0c92402ff9b01b60` | Lottie 5.5.2, 512×512, 60fps, 180f, 31 layers | 463 KB / 60 KB gz |
| `wand.json`                    | `8de70508fe1ebdeb08fc7005820329696f28ec84adc94f3cc4362cf7d3e72870` | Lottie 5.5.2, 512×512, 60fps, 176f, 30 layers | 193 KB / 16 KB gz |

None embeds a raster asset and none references an external image, so a scene is
one JSON fetch and nothing else. `monkey-hear-no-evil.json` is the only one with
an `assets` entry at all, and it is a precomposition — vector layers inside the
same file, not a picture fetched from somewhere. Each is imported by URL, so a screen only
downloads the animation it actually shows.

The repository formatter is told to leave this directory's JSON alone
(`ignorePatterns` in `.oxfmtrc.json`); without that it pretty-prints the files to
several times their size and the hashes above stop matching, which is the whole
point of recording them.

- **Licence for the six Happy Coder files** MIT, `Copyright (c) 2024 Happy Coder
Contributors`. That is a
  different copyright line from this repository's own
  (`Copyright (c) 2026 Happy (2) Contributors`), so the MIT requirement to carry
  the notice does apply. The complete, unabridged notice sits next to the files
  it covers, in `LICENSE` in this directory.
- **Upstream of upstream** unknown. `happy-list` records no attribution for
  these files and the JSON carries no author metadata, so this note can only
  vouch for the copy: where the artwork originally came from before it entered
  that repository has not been established here.
- **Licence for `cat-face.json`, `closed-lock.json`, `confetti-ball.json`,
  `disguised-face.json`, `fox.json`, `hatching-chick.json`, `llama.json`,
  `party.json`, `unicorn.json`, `cherry-blossom.json`,
  `front-facing-baby-chick.json`, `mirror-ball.json`, `open-hands.json`,
  `cloud-variation.json`, `monkey-hear-no-evil.json`, `seedling.json`,
  `sprig.json`, and `tree.json`** not
  recorded in the supplied files. Their upstream licensing has not been
  independently established here.

### Why they were not converted to `.lottie` containers

A `.lottie` is a zip around the same JSON. These gzip to 8–47 KB over the wire
already, so there is little left for the container to win, and it would cost a
build step, a binary blob in review, and a second thing to keep reproducible.
Plain JSON stays diffable and needs no tooling.

## What each one means

The complete source set is twenty-three glossy 3D emoji: 👾 game, 🐱 cat face, 🌸
cherry blossom, 🔒 closed lock, ☁️ cloud, 🎊 confetti ball, 🥸 disguised face, 🦊
fox, 🐥 front-facing baby chick, 🐣 hatching chick, 🦙 llama, 🪩 mirror ball, 🙉
hear-no-evil monkey, 👐 open hands, 🦄 unicorn, 🦉 owl, 🎉 party, 🍿 popcorn, 🤖
robot, 🐌 snail, ✨ sparkles, 🗿 stone, 🪄 wand. Eighteen carry a meaning Happy
actually needs, and each is used for that one meaning and nothing else:

- 👾 **alien monster** — _people and agents are together in one live session._
  Multiplayer is a shared working room, not a transcript handed around after
  the work is finished.
- 🌸 **cherry blossom** — _a new friendship has begun._ It marks the settled
  connection, not a request that still needs an answer.
- 🔒 **closed lock** — _access is secured._ It is the settled state after a
  private boundary has been established, not a warning or an access error.
- 🎬 **clapper board** — _a piece of work is about to begin._ It stands over
  the page a new task is made on, before the first message is sent.
- ☁️ **cloud** — _work runs on hardware that is not this machine._ An agent
  hosted for you, or one on a machine of your own that others can reach. It is
  about where the work happens, never about a sync or an upload.
- 🎊 **confetti ball** — _one milestone has just completed._ It marks the
  specific completion rather than a group celebration.
- 🥸 **disguised face** — _this machine's identity is being defined._ It belongs
  to profile creation, where the person names the identity Happy Agent will use
  for authored work and messages.
- 🐥 **front-facing baby chick** — _a new social identity is ready to meet
  people._ Unlike the hatching chick's creation moment, this is the person now
  present and ready to connect.
- 🐣 **hatching chick** — _something new has been created._ It belongs to the
  first successful appearance of a new project, session, or document.
- 🦙 **llama** — _several models are being combined on one job._ One harness
  turns an unusual mix of Claude, Codex, Grok, or anything else into one
  coherent workflow.
- 🪩 **mirror ball** — _one thing shared across a whole circle at once._ A ball
  of many mirrors throwing the same light everywhere in the room: one session,
  one channel, one moment that a circle of people is in together rather than
  each on their own. Not a completion — the party and the confetti ball own
  those.
- 🙉 **hear-no-evil monkey** — _nobody outside can listen to this._ It belongs
  beside a promise about privacy that is actually kept, never beside a warning
  that something is exposed.
- 👐 **open hands** — _a social invitation is waiting for a response._ It belongs
  to an incoming friend request, where accepting or declining is the next act.
- 🎉 **party** — _a group is celebrating a shared completion._ It is the social
  counterpart to the confetti ball's single milestone.
- 🤖 **robot** — _an agent is ready, and waiting to be told what to do._ The
  screen with no session open, a conversation with nothing in it yet, and the
  page a new bot is made on.
- 🐌 **snail** — _something is being read right now, and it is taking a moment._
  Every panel-wide wait, with no exceptions worth explaining: a session, a file,
  the documents list, the shared files, the inbox, the
  activity list, the calls list, provider usage. It is deliberately
  self-deprecating: a wait is a wait,
  and pretending otherwise while someone stares at a blank screen is worse.
- 🪄 **wand** — _the missing thing is one you can make right here._ Only beside
  a button that makes it: the first document, the first note. Where the same
  screen is composed without that button it drops back to a plain glyph, because
  the wand's whole claim is that the reader can act.
- 🦉 **owl** — _we are watching, and nothing has been found yet._ A search box
  nobody has typed in.
- ✨ **sparkles** — _the absence is the good outcome._ A caught-up inbox, an
  activity list with nothing unread, a quiet home.

Each animation ends on the pose it was drawn to return to — the robot facing
front, the owl upright and alert, the snail at rest, the wand mid-sparkle, the
sparkle cluster full — so the frame a scene stops and holds is a frame worth
holding. That is why no hand-picked "rest frame" index appears in the code: the
last frame is the picture.

### The five that are not used

- 🍿 **popcorn** would be a second way of saying "wait", competing with the
  snail on the same screens. One waiting picture, used consistently, is a
  vocabulary; two is decoration.
- 🗿 **stone** is a deadpan internet joke. Happy should not smirk at someone who
  found nothing.
- 🦄 **unicorn** duplicates the llama's model-mixing role without reading as
  clearly as a model reference.
- 🐱 **cat face** and 🦊 **fox** are mascots without distinct product-state
  meanings. They stay available as source candidates without entering the typed
  scene vocabulary as decoration.

### Where a scene is deliberately absent

Artwork is for a state a reader sits in, not for every blank rectangle:

- **Errors and destructive states** keep their plain glyph. An animation next to
  "Session unavailable" would be levity in the wrong place.
- **A search or filter that matched nothing** keeps its glyph. It is a miss, not
  a settled absence, and it re-renders on every keystroke — art that replayed
  each time would be noise.
- **Small inline placeholders and repeated rows** keep their glyph. A scene is
  128px of artwork and a worker player; dozens at once would be neither.
- **Screens whose two halves are both empty** get one scene, on the half where
  the reader can act — the notes list, not the note editor beside it.

See `LottieScene.tsx` for how a scene plays, rests, and replays.
