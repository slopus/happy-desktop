# Demo-video research

## August 25 addendum — the stories and the polish

### Update/restart pain (X, June–August 2026)

The `resume` demo answers a documented complaint stream, not a hunch:

- Steve Ruiz (tldraw, ~55k): "How do you avoid the thrash of 'please restart to
  update' in the desktop app? I feel like I get far more update prompts in
  cursor etc than in Linear" —
  <https://x.com/steveruizok/status/2085256297847366073> (15.6K views).
- jack friks: Claude desktop's nightly Squirrel auto-update "is killing my
  overnight agent workflows … the workaround is chowning the app bundle to
  root so the updater can't touch it" —
  <https://x.com/jackfriks/status/2090790861252575427> (16.5K views).
- Neil Lu (Navide): "The biggest problem with AI coding today isn't the model.
  It's losing context. Close the wrong terminal. Restart your machine." —
  <https://x.com/LuYuHao_Neil/status/2078598093780758936>.
- The praise-side bar to clear: people leave Warp for Ghostty+tmux because
  "the terminal just lives" —
  <https://x.com/dimabytes/status/2090076013438910470>; Warp's own
  session-restore pitch to Karpathy's agent-command-center thread —
  <https://x.com/zachlloydtweets/status/2031859639877583248> (38.4K views).
- A whole OSS category (Fazm, Atrium, Hillnote, Navide) exists because CLI
  agent sessions do not survive restarts —
  <https://x.com/m13v_/status/2063377329918026149>.

### Demo-as-code chatter (X, July–August 2026)

What lands: "I asked Claude to record the demo with Playwright" (
<https://x.com/yenkel/status/2080093076513583510>), tests-become-demos
(middlewright, <https://x.com/mmkalmmkal/status/2084544876851401159>), and
dual-CDP no-mouse shoots (<https://x.com/TezaApps/status/2090147280238018670>).
What does not: another Screen Studio clone, or "we killed Loom" claims —
the backlash is instructive
(<https://x.com/rexan_wong/status/2092370659339010203>).

The tweetable angle this pipeline earns honestly: **the integration test is
the changelog entry** — the same take that demos the feature asserts it works,
against a live daemon, and the product-focused change's main reviewable output
is its video.

### Production-quality findings applied here

- Naive encoded-space fades are why intros look cheap; a multiplicative fade
  done in linear light is `t^(1/2.2)` on encoded pixels (power law commutes
  with multiplication). Applied in the composer's intro/outro.
- App JS animation must ride the capture clock or it plays several times fast;
  Playwright's clock API or an rAF/`performance.now` shim is the current
  practice (timecut/timesnap pioneered it and are unmaintained). Applied as a
  drive/release shim so live streaming still runs at real speed off the clock.
- Telegram's own animated packs are not license-safe for marketing use;
  Google Noto Animated Emoji (CC BY 4.0) is, and Kenney's Interface Sounds
  pack is CC0. This pipeline synthesizes its own cues instead, and uses a
  user-supplied sticker asset.
- Remotion is source-available, not OSS for a 4+ person company; Motion Canvas
  and Revideo are MIT. None are needed while Sharp+FFmpeg carries the load.

Research window: **May 25–August 25, 2026**. The requirement was an OSS-only
pipeline that an agent can regenerate, with no visible recorder or application
window taking focus from the person using the Mac.

## What people are doing now

The current automated pattern is consistent across recent tools and write-ups:

1. drive the real product with Playwright;
2. record an interaction timeline with target bounds, not only pixels;
3. render a synthetic cursor because headless Chromium has no OS cursor;
4. derive zoom and pan keyframes from those explicit target bounds;
5. cut waits and hold important states on a narrative timeline;
6. use FFmpeg for H.264/GIF delivery.

Eric Mono's July 13 write-up is the clearest recent implementation report. It
used Claude Code to choose real persisted product states, Playwright to navigate
them, one short BrowserContext per beat for reliable capture, and FFmpeg to
trim, label, concatenate, and export a 1280×720 30 fps H.264 video. The central
idea is useful here: the browser flow is code, product state is deterministic,
and the video is a reproducible software artifact.

Source: [How I Made a Product Demo with Claude Code, Playwright, and
FFmpeg](https://dev.to/earthwalker17/how-i-made-a-product-demo-with-claude-code-playwright-and-ffmpeg-2ach)
(published July 13, updated August 20, 2026).

Recent X posts are mostly recommendations for Recordly, OpenScreen, Cap, and
similar Screen Studio replacements: smooth cursor overlays, click-follow zoom,
styled backgrounds, captions, and timeline export. The more relevant new branch
is demo-as-code: Playwright or an MCP agent performs the flow and the renderer
rebuilds the result after a UI change. Representative August posts:

- [OpenScreen used for a Framer demo](https://x.com/andrew_silvaux/status/2086178363756925116)
- [Recordly recommendation](https://x.com/mahima_thacker/status/2090428384870543645)
- [Open-source recorder roundup](https://x.com/abhishek__AI/status/2091022694829678843)

The in-window Reddit search did not produce a serious technical implementation
thread. The relevant July discussion asked what Loom, Screen Studio, Supademo,
and Arcade still miss; replies emphasized shorter demos and viewer/drop-off
analytics rather than another set of recording effects. That supports keeping
each Happy feature story short, but it does not supply a capture architecture.

Source: [What's missing from Loom, Screen Studio, Supademo or
Arcade?](https://www.reddit.com/r/SaaS/comments/1un3c5e/whats_missing_from_loom_screen_studio_supademo_or/)

## OSS options evaluated

| Project                                                                | License  | What it gets right                                                                                                                                        | Why it is not the Happy recorder                                                                                                                                                                                    |
| ---------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [playwright-recast](https://github.com/ThePatriczek/playwright-recast) | MIT      | Turns Playwright traces/video into cursor motion, click ripples, action-aware zoom, speed ramps, subtitles, and FFmpeg output.                            | Excellent reference and the closest packaged option, but Happy already owns the exact interaction targets and can render deterministic full-resolution frames directly instead of reconstructing them from a trace. |
| [Pagecast](https://github.com/mcpware/pagecast)                        | MIT      | MCP prompt → Playwright actions → timeline JSON → tooltip or cinematic FFmpeg export; supports `--headless`.                                              | Closest interaction model, but its generic red-dot pointer and 2.5× cinematic crop are weaker than a Happy-owned arrow and a zoom budget that never invents pixels.                                                 |
| [OpenScreen](https://github.com/getopenscreen/openscreen)              | MIT      | The strongest full recorder/editor: native capture, cursor-follow zoom, smoothing, captions, annotations, backgrounds, aspect ratios, and a headless CLI. | It still records an OS screen/window and macOS requires Screen Recording and Accessibility permission. Driving that real window is the focus-interference boundary this task forbids.                               |
| [Recordly](https://github.com/webadderallorg/Recordly)                 | AGPL-3.0 | Automatic zoom suggestions, cursor smoothing/blur/bounce, styled frames, timeline editing, and MP4/GIF export.                                            | It is a manual native recorder/editor, not a deterministic prompt-to-demo runner, and its visible app/window workflow cannot guarantee zero focus interference.                                                     |

All four are free and open source. Recordly is **AGPL-3.0**, not MIT; its own
README is authoritative on that point.

## Decision for Happy

Use the real shared Happy renderer in headless Chromium, connected through the
existing browser-local bridge. Inject a pointer and click feedback into that
page; drive it through the design system's semantic hooks; capture Retina frames
on a virtual narrative clock; compose camera crops, captions, and framing with
Sharp; and encode with FFmpeg.

This keeps the best current ideas while satisfying the one requirement a native
screen recorder cannot guarantee: **there is no OS window to raise, focus, or
place over the person's work**. It also keeps zoom geometry explicit and capped
at the captured pixel budget, rather than inferring it after the fact.
