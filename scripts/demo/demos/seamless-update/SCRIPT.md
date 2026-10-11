# Seamless update — one continuous desktop take

Target 20–40 seconds, normal playback speed. Two sessions are already working
when the first frame appears. There is no title card or workspace setup.

| Target | Product action                                                                                                                          | Caption below the app                         |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| 0–2s   | Two sessions are working, with a genuine unsent draft already present. Click Install immediately.                                       | Updates without losing your place.            |
| 2–8s   | Follow both real waiting-agent links and keep typing while Finishing work is shown.                                                     | Your agents finish. You keep working.         |
| 8–12s  | Release the actual tools at their durable edge. Type more characters during the real stopping/starting interval of the version upgrade. | No reload. Same sessions. Same draft.         |
| 12–18s | Updated · Took … shows the real observed duration; both original runs resume and finish. The card and footer clear after three seconds. | Updated. Right where you left off.            |
| 18–25s | Visit both completed turns, then return to the full preserved draft and hold for at least three seconds.                                | Clear the caption for the final product hold. |

Preparation happens off camera; its complete gate audit is in
[`PREPARATION.md`](PREPARATION.md). Seed real private projects and sessions with
the original core-demo project artwork. Keep the default Chief of Staff bot;
do not substitute its name or avatar. Both agents run the declared Node tool
in their own fixture worktree. A file gate lets the director release that
tool while filming the actual drain. Both agents' post-tool inference is held
through the restart, following the existing resume demo's method. The shared
gateway retains one independent gate per session; releasing resumes both.

The production downloader fetches checksum-verified released Agent 0.4.86 and
0.4.87-preview.7 inside the approved recorder command, off camera. The private
world starts on stable; the real Install action invokes the production
DesktopDaemonController, binary selection and restart sequence to move onto
the preview. Browser bindings replace native IPC only. Installer snapshots and
renderer connection/catalog readiness are real; no progress envelope is driven.

Capture validation records source SHA, both Agent versions and archive hashes, two agent/run
IDs, health reports, old/new daemon PIDs, observed DOM phase timestamps, retained
draft, card geometry, app-shell and composer DOM identity, focus while typing,
and any disconnect or full-screen takeover. Reject a take that loses a draft,
replaces the shell, fabricates a waiting agent, covers the composer, displays
any transcript error, misses typing during the restart, or fails to resume both runs.
Do not add a test suite as part of this demo.

The success duration is measured by production UI; never inject `1m 42s` or
accelerate the recording to make a duration fit. Follow real phases only, even
when short. DOM phase-start reports carry actual frame/time observations;
per-character evidence records the UI and real installer phases while typing.

Run after rebasing onto the feature's main commit:

```sh
pnpm demo reset
pnpm demo record seamless-update --out .context/demo-out/take-02 --keep-frames
node scripts/demo/demos/seamless-update/export.mjs .context/demo-out/take-02 .context/demo-out
```

The recorder needs local listeners and a headless browser. The master demo
plan prohibits filming escalation by default. The current task received an
explicit exception for one reviewed run and one code-fix retry, then three
more runs. The first later run produced review-only take 01; the second captured
the actual version upgrade as take 02 after production and demo fixes. One
approved retry remains, only after a demo-code fix. See [`REVIEW.md`](REVIEW.md)
for the capture evidence and delivery files. Do not edit the master plan or
bypass review.

Inspect encoded playback, not just screenshots: the opening, two waiting
links, typing through the phases, three-second success hold, preserved draft, and
both completed replies. Review the actual video with the parent agent's
Opus/Grok reviewers. Recording evidence and reviewer decisions are distinct;
this scaffold does not imply publication.
