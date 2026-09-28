# Slices

## Where we are going

A slice is an attention mask over files and changes that an agent builds from
the meaning of a request. The lead's phrase is "you know how no one cares about
tests": the job is not to show code but to take the noise away and leave what
actually needs reading. The user asks in words — "show the changes in the API
schema", "show the core data structures", "the top 20% of substantive changes
from the past couple of turns" — and gets a named selection.

The agent does not answer with text and does not draw a new viewer. It rewrites
the file tree for the question at hand: hides what does not matter, keeps what
does.

The input is natural language, and the agent decides what matters: tests,
generated code, and formatting are noise; core logic, schema, and persistence
are not. Ranking and cutting off ("top 20%") are the agent's work. A slice
covers both files and changes: "a slice of diffs / files". Its granularity is
the file, "maybe even chunk levels": files are required, ranges are desirable,
not a requirement of the first step. A slice can be built "from the past couple
of turns" rather than from the whole repository.

A slice lives in the same Files tab, beside Changes and All Files, as the third
option of the same control — not a separate panel, not a separate tab on the
right. A slice has a title, and it is there for understanding, "so it's easy to
understand". In the transcript it is a clickable thing; clicking opens the slice
in the sidebar. "Really think about the UX": the behavior is worked out before
the code.

Decisions taken with the user:

- A slice belongs to the checkout (project or worktree), like Changes and the
  review stream, not to one conversation. Happy Agent owns and stores it; the
  app subscribes and renders.
- A slice is a list of paths with a title, an optional note, and an optional
  per-file reason. It never carries file content. Content is read live through
  the existing file and diff readers, so a slice is a live mask over the current
  working tree, not a snapshot of the moment it was asked for.
- Line ranges are part of the contract from the start as optional data. At
  first they are used only to reveal a location when a file is opened; cutting
  a diff down to those ranges comes later.
- The ranking rules live in the tool's instructions to the model. Happy Agent
  validates and stores; it does not judge content.
- A slice is never edited. When it is no longer needed the person removes it
  from the picker; the agent may only create.

## How we get there

Happy Agent first. Its own master plan for slices specifies the resource, the
storage, the list and delete routes per workspace, the `slice.created` and
`slice.deleted` events, the common tool every model can call, and the `slice`
tool-call presentation that points at the created slice. That work happens in
the Happy Agent repository and ends with a published client.

Then the app, on top of the finished Happy Agent behavior.

State: the slices of the addressed checkout, a third file scope beside
`changed` and `all`, the selected slice remembered per checkout the way the
scope is, and the presentation projected into the transcript.

UI: the third segment in the Files control, offered only once the checkout has
at least one slice — an inert control is noise. The slice title stands on its
own row under the scope controls and becomes a compact picker when there are
several, newest first; each row shows when the slice was made (the clock today,
the date otherwise). Hovering a row reveals a cross beside the title, and the
cross removes that slice. A truthfulness note under the controls counts the
changed files the slice hides. In the transcript, a card with the slice title
and file count.

App: rows for the slice scope are the slice's paths against the live change
list. A file that is currently changed shows its status and stat and opens as a
diff; an unchanged file opens as a file; a deleted file stays listed as deleted.
Clicking the card opens the panel on Files in the slice scope with that slice
active. It is not the Preview tab: a slice is a Files mode, not a tool preview.

A new slice does not take over the screen. If the panel already shows Files in
the slice scope, the new slice becomes the active one, because it was just
asked for; otherwise nothing moves and the card is the way in. Switching
conversations changes nothing, because slices belong to the checkout.

## How we know it is done

- Asking an agent in words for a slice produces a titled slice that appears in
  the Files tab of that checkout without a reload, from every conversation in
  that checkout.
- The Files control offers Slice only when a slice exists, beside Changes and
  All Files, in the same one-layer control.
- The slice lists only its files, marks the currently changed ones with status
  and stats, opens changed files as diffs and the rest as files, and states how
  many changed files it hides.
- The transcript shows a clickable card per slice; clicking it opens the
  sidebar on Files with that slice active.
- Several slices in one checkout can be switched between, and the last choice
  is remembered per checkout.
- Each slice shows its creation time, and a slice that is no longer needed can
  be removed from the picker; it disappears from every conversation in that
  checkout without a reload, and the segment goes away with the last one.
- No file content travels with a slice; line ranges are carried and used to
  reveal a location.
