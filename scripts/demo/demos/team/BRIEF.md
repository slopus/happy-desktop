# Team — homepage demo brief

The homepage movie for the current app. It replaces the stem-cell take
(v29–v40), whose Spaces sidebar, stem cells and Focus filing are gone from the
product. The story is the team: people working side by side, each seeing the
others' work as it starts, and answering it from wherever they are.

Owner: Kirill. Script: [SCRIPT.md](./SCRIPT.md).

## What it must say

1. **Any provider, any model.** The take opens on Kirill's new-task screen
   with the model list already open, every provider's models in it. His
   pointer goes up the list, past Antigravity's, Grok's and Codex's models,
   and picks Opus 5.5 under Claude; he types the waveform request. No account
   is picked: each service shows its own account as Kirill's app does,
   Current CLI.
2. **This is a busy, real workspace.** Around it: two servers in the rail
   (Kirill's personal one and the team server Happy Core), bots with their
   real faces, tasks owned by Kirill and Steve with subtasks and diff stats.
   Steve's own task spans three repositories: two parts are done, and the
   iOS part is still running, its diff stats climbing.
3. **Nothing exists until Send.** On Send the task is created, and at that
   moment it is in Steve's sidebar on his phone, with Kirill's face. Nobody
   forwards it. Steve's sidebar is his own, not a mirror of Kirill's.
4. **The agent does real work.** Opus hands the code to a subtask in a
   worktree of the repository, and the subtask's row counts the lines as its
   edits land, while Steve's phone waits, tucked aside.
5. **The team answers.** When its first version is ready, the agent asks
   Steve by name. His phone comes forward; he opens the task, checks the
   preview, gives feedback in the same task, and goes back to his sidebar. The
   phone tucks aside again while Opus acts on it: the preview goes to five
   bars and it says _"Five bars it is."_ The result rests, and the cut eases
   back into its first frame, because the homepage loops it.

## Rules carried over from earlier takes

- Real product, real data paths. Everything on screen is the current app and
  the current daemon. What is scripted (inference text and timing, the
  fictional teammates, fixture repositories) is disclosed in the take's
  evidence and never presented as something else.
- Real faces: Kirill and Steve wear their GitHub avatars, projects their real
  icons, bots their faces from the real installation.
- The phone is the real native Happy iOS app, built from `happy` main and run
  in the iOS Simulator on Kirill's Mac mini, inside the composition's iPhone
  frame. The desktop is recorded on that Mac too, at 60 fps. The phone is
  first-class but not the flagship surface: it rises beside the desktop as
  the task reaches Steve, the window stepping back to make room; it tucks
  aside, smaller and partly past the frame's edge, while the agent works, and
  comes forward again while Steve answers. It is labelled as a teammate's
  phone, without a name.
- No black intro, no full-screen title cards, no stickers, no confetti, no
  spoken narration. Written narration, plain sentences saying what happens,
  sits as subtitles in the band below the window.
- One continuous 1× clock for desktop and phone. Only Steve's typing may play
  faster, on both screens at once, and the moments the desktop capture
  stalled are cut from both screens at once.
- Two deliveries from one cut: the composed movie, and the window and phone
  screen as separate tracks on the same clock for the homepage hero.
- No permission prompts are scripted; the take runs in Auto.

## Out of scope

- Stem cells, Focus, the Spaces sidebar, chat onboarding: removed from the app.
- The new task does not fan out across repositories; it has one subtask, in
  happy, for its code. The several repositories are Steve's task.
- Shipping, CI, archiving, loop-ins: the take ends on the five-bar preview.
- More than two servers, other people, generated or placeholder faces.
