# Inline artifacts

## Where we are going

An agent can show UI right in the chat, and that one mechanism is how we try
out lightweight UI inside conversations. We hardcode as little as we can: a
couple of core components we know look good and are useful, and nothing else.
Models keep getting better, and every special-purpose component we build is
something they cannot outgrow. Guided reviews and anything like them are built
on this mechanism, not on a set of special fences that each turn into a
restricted component.

The few standard components we do provide are available to every artifact,
not only to reviews: a diff, a list of changed files, and diagrams. Diagrams
are not only Mermaid; an artifact can show clean charts too, such as bar
charts. We are not opinionated in general about how an artifact makes its
diagrams.

Code review stays a skill: a skill for creating and streaming these artifacts
for a review. It uses the same standard components every artifact already
has, and explains more about how to use them, and how to use them well, for
code review specifically. That is where we can be more opinionated about
diagrams. The level of detail in the current guided-review skill is about
right, and the new skill keeps it.

What we prefer an artifact to show: clean visualizations, code examples and
quotes, and file trees.

The mechanism is an artifact shown inline. An agent writes an artifact's
files with dedicated artifact tools that work straight on the artifact
catalog. There is one copy, the catalog, and nothing to sync or keep in step.
The tools are the same for every agent, whichever model or harness runs it,
including agents whose tool execution we do not control, and they match the
file tools agents already know as closely as possible: write a whole file,
edit part of a file, read a file. The agent patches an artifact the same way
it patches any other file, so a small change is a small edit rather than a
rewrite. An artifact holds several files: its HTML, CSS, JavaScript, and
assets. Writing to an artifact the agent did not create is reviewed.

Letting agents edit artifacts as ordinary files on their machine, through a
directory or paths their own file tools understand, is something we will
likely want later. It is a can of worms today: copies on many machines need
syncing, and we do not control the file tools of every agent.

Creating an artifact is still its own tool, `create_artifact`. It issues the
artifact's id; that part is not something the model controls.

An artifact says how it wants to be shown with a display preference: inline
compact, inline expanded, or open to the side. Artifacts meant for inline
display come with their own guidance in the prompt.

An inline artifact's content is laid out as if it were laid on the chat
itself. Usually there is no frame and no background colour of its own: one
clean surface, usually one set of cards for whatever it is showing. No double
nesting and no double scrolling. The prompt guidance says this, and Happy's
baseline styles make it the default.

The prompt also says what we hate: the default, smelly Claude-style UI, with
many cards, rounded corners, and a highlighted left-hand edge. We absolutely
do not want it.

Inline artifacts can use the APIs artifacts already have, including their
state management, so a small interactive UI keeps its state the same way an
artifact page does today.

Inline means inline. The chat shows the content at its full height and never
caps it. Nothing scrolls inside it; nested scrolling is almost always a bad
experience, and content that needs its own scrolling belongs in an artifact
opened separately.

The artifact is not drawn as a highlighted surface or a card, and it has no
separate header. Its title sits inline in the reply, the way the chat already
shows other things, such as a Happy Agent's title: no background, no border,
no colour of its own. Beside the title are two buttons:

- Expand/collapse. The button is a fixed point: when the content collapses or
  expands, the button does not move.
- Open to the side, with an "open in new tab" style icon. It opens the
  artifact in the right panel and collapses it in the chat. Closing the panel
  leaves it collapsed; it can be expanded again inline.

Whether an artifact is collapsed is local to each viewer.

The client measures an artifact's height and re-measures whenever its layout
changes. It measures in a second, invisible frame first, at the exact width
the artifact is shown at, so the visible artifact never overlaps the content
below it and nothing shifts afterwards.

Any URL can be shown inline the same way. An artifact is just one such
address: a URL that points at its `happy-artifact://` path.

Pages may use the network for now. This is a potential vulnerability: it is
marked as one here and in the code.

### Streaming, once the basics work

Streaming comes after everything above works. If it does not look good, or it
introduces issues, we postpone it. The reason to want it: an artifact that is
large, or holds several different visualizations, should not make the reader
wait for all of it to finish before seeing any of it.

For streaming to be possible, an artifact is written in a fixed order, and
the prompt for creating one says so:

1. CSS first, so everything that arrives after it is already styled.
2. Then the HTML, which is what streams.
3. JavaScript last, added at the very end, and only executed once the artifact
   is fully ready. A script never runs against a page that is still arriving.

While the agent is still writing an artifact, the chat shows it building up,
the way Chromium already draws a page that is still arriving, and the client
keeps re-measuring it as it grows. Whether an artifact streams is
configurable. The tool calls the agent makes after it appear after it in the
transcript. A subagent can create an artifact while it runs, and it shows up
the same way.

Writes come through the artifact tools, so Happy Agent sees them:

- A whole file being written only grows, so it streams into the chat as it
  arrives, where the agent's tool calls reach us while they are still being
  written. This is how a new page is almost always written. Where they only
  reach us complete, the file appears when the call ends.
- An edit in the middle of a file appears all at once when the tool call
  ends. A half-applied edit is not worth showing.

Versions have two levels. Every artifact tool call that writes an artifact's
files makes a minor version. A major version marks a meaningful version, and the
agent bumps it through the tool that already updates an artifact's metadata.
Rules validate version bumps.

The client only sees an artifact's files arriving and its versions; it does
not know or care which tool produced them. With streaming turned off it shows
only the versions.

## Why not the guided-review fences

The first attempt at guided reviews (happy-desktop#52) added eight special
Markdown fences, `happy-review`, `happy-diff`, `happy-files`, `happy-flow`,
`happy-sequence`, `happy-finding`, `happy-verdict`, and `happy-before-after`,
each drawn by a component of its own. What was wrong with it:

- Each fence turns into a restricted component. The model can only fill in the
  fields a fence allows, so what it can show is capped by what we built.
- Most of them are not special. A finding, a verdict, or a before/after is
  layout, and Markdown or HTML already does layout.
- It hardcodes a lot for one use case: two diagram layout engines of its own,
  a chapter regrouping of the Markdown tree, and roughly four thousand lines
  of production code. We should hardcode the minimum and bet on models
  getting better.
- Every component's height was computed by hand from constants copied out of
  its stylesheets. Each new component is another set of constants to keep in
  step, and they drift silently.
- Chapters reflowed mid-stream: prose jumped from full width to a narrow
  column when a fence opened beside it.

What we keep from it: guided reviews are still the goal, and the diff, the
changed files, and diagrams stay as standard components. They are no longer
review-only fences: every artifact can use them, and the review skill
explains how to use them well for a review.

## Why it is shaped this way

- One mechanism. A single way to show content inline covers reviews,
  visualizations, and UI experiments, instead of a component per idea.
- HTML, not a component catalog. Models are already good at HTML and keep
  getting better; a catalog only limits them.
- A few standard components, for everyone. A diff, the changed files, and
  diagrams are useful well beyond reviews and look good when we draw them, so
  every artifact gets them. Diagrams go beyond Mermaid, to clean charts.
- Review is a skill, not a feature. It teaches how to use the same components
  for a review, and is where we are opinionated about review diagrams. The
  current skill's level of detail is already good, so we keep it.
- Clean visualizations, code, and file trees. These are what make a change or
  an idea easy to read; decoration is not.
- No default Claude look. Many cards, rounded corners, and a highlighted
  left-hand edge are exactly the UI we do not want, so the prompt says so.
- Measure on the client, in an invisible frame. Our transcript avoids
  measuring rows, but model-authored HTML cannot be sized by hand. Measuring
  at the exact width before showing it keeps the transcript from overlapping
  or shifting.
- No cap and no inner scrolling. If we render it inline, we want it inline.
  Double scrolling is almost always terrible; a page that needs it opens to
  the side.
- No header chrome. The artifact belongs to the reply, so it should read as
  part of it, not as a separate highlighted surface.
- Buttons as fixed points. Collapsing or expanding must not move the button
  out from under the pointer.
- Laid on the chat. The artifact is part of the reply, so its content uses
  the chat's own surface: no frame, no background, one set of cards, no
  nesting inside nesting.
- The artifact APIs we already have. State management and the rest already
  exist for artifact pages; inline artifacts reuse them instead of a new
  mechanism.
- CSS, then HTML, then JavaScript. Styles before markup keeps what is drawn
  from jumping; scripts last and run only when complete keep a half-arrived
  page from breaking them.
- Edits, not rewrites. Agents patch an artifact the way they patch a file,
  so a small change is a small edit.
- `create_artifact` stays. The id is issued by Happy Agent, not invented by
  the model.
- Dedicated artifact tools, the same for every agent. Copies on disk have to
  be synced, and syncing is error prone; routing agents' own file tools only
  works where we run those tools, and some agents run their own. Tools of our
  own work for every agent and keep one copy. They look like the file tools
  agents already use, so there is little new to learn.
- File-based editing later. It is likely worth having, but not before the
  basics work.
- Minor versions on every change, major versions on purpose. Every change is
  kept without the agent thinking about it; the versions that matter are the
  ones it marks.
- Any URL inline. Showing a page from somewhere else is useful, and an
  artifact is just one such address.
- Streaming later, and optional. It matters for large or multi-part
  artifacts, but it must not cost the basics.

## How we get there

1. Artifact tools: `create_artifact` issuing the id, dedicated tools to
   write, edit, and read an artifact's files straight in the catalog that
   match the existing file tools and are the same for every agent, a minor
   version for each tool call that writes an artifact, major versions bumped
   through the metadata tool with validated bumps, and the display
   preference.
2. The standard components every artifact can use: the diff, the changed
   files, and diagrams, including clean charts such as bar charts.
3. The inline artifact in the chat: the title inline with no header chrome,
   expand/collapse as a fixed point, open to the side collapsing it, full
   height with no inner scrolling.
4. Measuring: the invisible measuring frame at the exact width, re-measuring
   on every layout change, and the transcript taking those heights without
   moving what the reader is looking at.
5. Any URL inline, with artifacts as `happy-artifact://` addresses.
6. The prompt guidance for inline artifacts: the display preference; content
   laid on the chat with no frame, background, nesting, or inner scrolling;
   none of the default Claude look of many cards, rounded corners, and a
   highlighted left-hand edge; a preference for clean visualizations, code
   examples and quotes, and file trees; the standard components; the artifact APIs,
   including state management; and the write order (CSS, then HTML, then
   JavaScript).
7. The code review skill: creating and streaming review artifacts, and how to
   use the standard components well for a review, at the level of detail the
   current guided-review skill already has.
8. Streaming, once all of the above works: whole-file writes to an artifact
   building up inline as they arrive, and every other change
   appearing when its tool call ends. Baseline styles arrive first, then the
   page's own CSS, then its HTML as it streams, and its JavaScript runs only
   once the artifact is complete, so what is already drawn does not jump.
   Postponed if it does not look good or causes issues.

## How we know it is done

- An agent creates an artifact with `create_artifact`, which gives it the id,
  and then writes and patches its files with the artifact tools.
- The artifact tools are the same for every agent, including agents whose
  tool execution we do not control, and there is no copy on disk.
- Each tool call that writes an artifact makes one minor version; a major
  version is made only when the agent bumps it, and invalid bumps are
  refused.
- An inline artifact is shown at its full height with no scrolling inside it.
- The artifact's title reads as part of the reply: no background, border, or
  colour of its own.
- An inline artifact's content sits on the chat's own surface by default: no
  frame, no background, no nested scrolling.
- An inline artifact can keep state through the existing artifact APIs.
- Any artifact can use the diff, the changed files, and diagrams, including
  clean charts beyond Mermaid.
- A code review is an artifact made with the review skill, from the same
  standard components.
- The prompt rules out the default Claude look: many cards, rounded corners,
  a highlighted left-hand edge.
- Collapsing, expanding, and opening to the side never move the buttons under
  the pointer; opening to the side collapses the inline copy, and closing the
  panel leaves it collapsed.
- An artifact appearing or changing size never overlaps the content below it,
  and never moves what the reader is looking at.
- A URL and an artifact are shown inline by the same mechanism.
- The network access pages have is marked as a potential vulnerability in the
  code.
- Once streaming lands: an artifact being written streams into the chat,
  including one a subagent creates while it runs; the tool calls after it
  appear after it; an edit appears all at once when it is done; its
  JavaScript runs only once it is complete; and streaming can be turned on or
  off.
