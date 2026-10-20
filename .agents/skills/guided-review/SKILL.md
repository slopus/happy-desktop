---
name: guided-review
description: Use whenever someone asks to review, tour, walk through, or explain a change (a PR, a branch, commits, the work in this worktree), in any language and however it is phrased ("review this", "ревью", "что мы тут поменяли"), or asks to have a subsystem explained with a picture rather than prose. Builds the review as an HTML artifact shown inline in the chat, from Happy's standard diff, file-tree, chart, and diagram components.
---

# Guided review as an inline artifact

A big diff in file order makes a reader jump between files for half an hour
to learn what the change even does. A guided review does that work for them in
a minute: what the change is, how control now flows through it, what changed
in its contracts — types, signatures, endpoints — and then its ideas in
chapters, most important first, each beside the code that shows it. A reader
learns a change from its calls and its contracts, not from its list of files;
the diff viewer already has that list.

Build it as one **html artifact shown inline**: the chat draws it right in your
reply at its full height, laid on the chat's own surface. You write its files
with the artifact tools, patching them with `edit_artifact_file` as you would
any other file, and every tool call that changes it makes a new version the
chat follows in place. Everything it quotes
comes from the real change, through Happy's standard components; you never
copy code into it by hand.

## The pieces

Make the artifact first, then give it two files.

1. `create_artifact` with `type: "html"`, a short title ("Review: crop before
   upload"), and `display: "inline_expanded"`. It returns the artifact's id.
2. **`changes.diff`** — the change itself, written by git, never by hand. Write
   it to a scratch file inside your working directory with the shell, then
   publish it with `update_artifact` and
   `files: [{ "fromPath": ".context/changes.diff", "path": "changes.diff" }]`:

   ```sh
   mkdir -p .context && git diff <base> > .context/changes.diff
   # New files are part of the change too.
   git ls-files --others --exclude-standard -z \
     | xargs -0 -I{} git diff --no-index /dev/null {} >> .context/changes.diff
   ```

   For a committed range use `git diff <base> <head>` and nothing else. For an
   explanation of code that did not change, skip the diff and quote the code
   in `<pre><code>` exactly as it is in the file.
3. **`index.html`** — the review, written with `write_artifact_file`, in this
   order: the standard styles, your few lines of CSS, the HTML, and the
   components script last.

Every component reads `changes.diff`, so a quote can never drift from the
change.

**`<happy-files src="changes.diff">`** — the changed files as a tree under their
folders, each with its status and `+N −M`. To show just some of them, give it a
JSON list instead:

```html
<happy-files><script type="application/json">
[{ "path": "packages/app/src/store.ts", "status": "modified", "added": 12, "removed": 3 }]
</script></happy-files>
```

**`<happy-diff src="changes.diff" path="…" lines="40-52">`** — a few real lines
of one file of the change, with the file's path, status, and whole-file counts
in a header. `lines` are numbers in the file as it now stands; leave `lines` out
only for a file that is short in full.

**`<happy-diagram>`** — the control flow, as a Mermaid sequence diagram in a
`<script type="text/x-mermaid">` child. See "Drawing the flow" below.

**`<happy-chart type="bar|hbar|line|area">`** — numbers the change moved: a
benchmark before and after, bundle sizes, query counts. Only real numbers you
measured.

## Drawing the flow

A review has exactly one diagram, the control flow: the calls the change runs
through, in the order they happen, as a sequence — each part a column, each
call an arrow between them with what it passes over it.

```html
<happy-diagram><script type="text/x-mermaid">
sequenceDiagram
  participant T as Transcript
  participant S as ChatStore · changed
  participant A as AgentIdentities · new
  participant G as getAgent
  T->>S: sender ids
  S->>A: lookup · new
  A->>G: unknown id · new
  G-->>A: agent
  A-->>S: name
</script></happy-diagram>
```

- Start where the flow starts: a click, a request, an event.
- `->>` is a call, `-->>` the answer back to an earlier caller.
- Mark a part the change added, changed, or removed in its label:
  `AgentIdentities · new`, `ChatStore · changed`, `OldResolver · gone`. Mark a
  call the same way after its label. Everything unmarked is the context the
  change runs through.
- At most five parts and eight calls. A part is a name from the code — a
  component, a store, a function, an endpoint — never a file or a folder. A
  label is what passes, one to three words.
- Use a `flowchart` only when the change is about structure rather than calls
  (what now depends on what), and a `stateDiagram-v2` only for a state machine
  the change adds or reshapes. Never both, and never as decoration.

## The page

```html
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="/api/v1/style.css">
<style>
  .meta { color: var(--happy-muted); font-size: 13px; }
  .chapter { display: flex; flex-wrap: wrap; gap: 8px 24px; margin: 32px 0 0; }
  .chapter > h2 { flex: 1 0 100%; margin: 0; }
  .words { flex: 1 1 220px; }
  .quote { flex: 3 1 420px; min-width: 0; }
  .finding { margin: 16px 0 0; padding: 16px 0 0; border-top: 1px solid var(--happy-border); }
  .severity { font-size: 13px; font-weight: 600; }
  .high { color: var(--happy-removed); }
  .medium { color: var(--happy-accent); }
  .low { color: var(--happy-muted); }
  .before-after { display: flex; flex-wrap: wrap; gap: 16px; }
  .before-after figure { flex: 1 1 280px; margin: 0; }
</style>
</head>
<body>
<p class="meta">Review of 7 changed files against a1b2c3d · main</p>
<p>Uploading a photo now opens a crop dialog first, so avatars are always square.</p>
<p><strong>Safe to merge after the retry fix.</strong> One medium finding.</p>

<happy-diagram><script type="text/x-mermaid">…</script></happy-diagram>

<section class="chapter">
  <h2>1. The upload contract takes a crop</h2>
  <div class="words"><p><code>uploadPhoto</code> now takes a <code>crop</code>; callers pass the dialog's result.</p></div>
  <happy-diff class="quote" src="changes.diff" path="packages/app/src/upload.ts" lines="12-19"></happy-diff>
</section>
<section class="finding">
  <span class="severity medium">Medium</span>
  <h3>A failed lookup is never retried</h3>
  <happy-diff src="changes.diff" path="packages/app/src/identities.ts" lines="118-124"></happy-diff>
  <p>The agent is marked as asked before the call and stays marked when it fails. Delete the entry on failure.</p>
</section>

<script src="/api/v1/components.js"></script>
</body>
</html>
```

Copy that skeleton and keep its look: it is laid on the chat with no frame or
background, hierarchy comes from type, spacing, and hairlines. Never put a
chapter, finding, or verdict in a card or a tinted box, never give anything a
coloured stripe down its left edge, never round corners for decoration, and
never set a height or `overflow` on anything: the chat shows the whole page,
and nothing scrolls inside it.

A chapter is a `##`-level heading, one or two sentences in `.words`, and the
**one** component that shows it in `.quote`. In a wide chat the quote sits
beside the words; in a narrow one it wraps under them. Anything after it in
the chapter (a finding, a second quote) comes below, full width.

## Recipe: review of a change

1. The meta line: how many changed files, against which base or range.
2. One or two sentences: what changes for whoever uses this code — its
   behaviour or its contract — and why, in ordinary words.
3. The verdict, in bold, with how many findings of each severity — only when
   asked to review rather than to explain.
4. The flow diagram, its new and changed parts and calls marked. Skip it only
   for a change inside one function.
5. Two to four chapters, most important first:
   - **Contracts first.** A chapter per contract that changed — an exported
     type, a function's signature, an endpoint's request or response, a
     store's actions or events, a component's props. Quote the declaration
     with `<happy-diff>` on exactly those lines, and say in a sentence what a
     caller passes or gets now that it did not before.
   - **Then the behaviour** that serves it: the few lines where the flow
     turns, each quoted with `<happy-diff>`.
   - **Groundwork, tests, and generated files last**, briefly; a
     `<happy-files>` list is right only for a chapter that really is a group
     of files (tests, fixtures, pages).
6. Each finding right after the chapter whose lines it is about: severity
   `High` (must be fixed before it goes in), `Medium` (should be fixed), or
   `Low` (worth knowing), a title, the wrong lines quoted, then why it matters
   and what to do. A problem with the change as a whole goes after the last
   chapter, without a quote.
7. Before/after screenshots, when the change is visible, right after the
   opening sentences: add both PNGs to the artifact as `fromPath` files and show
   them in a `.before-after` row of two `<figure>`s with a `<figcaption>`.

Do not open with a file list. `<happy-files src="changes.diff">` belongs only
at the very end, and only when the reader asked what the change touches.

## Recipe: explanation (not a change)

The meta line names the commit you read (`git rev-parse --short HEAD`). One
sentence on what is being explained, a flow diagram of its calls in order with
no marks, then chapters on its contracts and the lines where the flow turns,
each quoting the code in `<pre><code>` exactly as the file has it, with its
path and line numbers in a `.meta` line above. There is no diff, no file list,
and no verdict.

## Short is the point

A review is read in place, in one or two screens of a chat column.

- Every sentence at most twenty words; a chapter's words one or two
  sentences.
- Two to four chapters. Never one per file: a chapter is an idea, and "where a
  session opens" is a chapter where "packages/state" is not.
- A quoted range is the few lines that are the idea, eight at most; a
  finding's range is the wrong lines themselves, one to five.
- Only real problems as findings, four at most, no nitpicks, no praise. What is
  good goes in the verdict, briefly.
- Skip the routine: imports, plumbing, renames, formatting, lockfiles.
- After the last chapter, at most one sentence, only for what you could not
  check (tests you did not run, a screen you did not open).

A narrow question about one bug or one file is answered directly in the chat,
without an artifact.

## Writing it

- **Write it in the language the person asked in**: a review asked for in
  Russian is written in Russian, code and paths as they are.
- **Write `index.html` in one whole-file write, top to bottom**, with
  `write_artifact_file`, in the order above: styles, then the HTML
  in reading order, then the components script. The chat shows the page from
  the version that write makes, and a page that arrives in order is never
  drawn half-styled.
- **Change it by patching.** A finding fixed, a chapter reworded: edit those
  lines of `index.html` with `edit_artifact_file`, or regenerate `changes.diff`
  with the same command after the code changed and publish it again. The chat's copy follows each new version in place.
- **Your chat reply is one sentence at most.** The user sees the review inline;
  never repeat its verdict, chapters, or findings in the reply, and never
  paste its path.

## Rules that make it trustworthy

- **Read the real diff first.** For this branch's work list every changed
  file with `git diff --name-only <base>` and `git status --porcelain -uall`
  (new files count), and read them with `git diff <base>` and the new files
  themselves; for other commits use `git diff <base> <head>`. Every statement
  must be visible in that diff, and nothing important may be left out.
- **This branch's work is against its merge base**: take it from
  `git merge-base origin/main HEAD` (the repository's default branch; without
  an `origin` copy, the local one), and include uncommitted and new files as
  the commands above do.
- **Line numbers are current-file numbers.** `lines` counts lines of the file
  as it now stands, not the old version or the hunk header; check each range
  against the file. A deleted file is counted by its old lines.
- **Point, do not reprint.** Never write code into the page to show the
  change; quote it with `<happy-diff>` from `changes.diff`.
- **Screenshots are real.** Capture both sides of the same place at the same
  size: the after from the change as it runs, the before from a worktree at
  the base. Never draw, mock, or generate a picture of a UI.
- **Look at it.** Open the artifact once you have written it, or read its
  page's logs with `read_artifact_logs`: a component that cannot show what it
  was given says why in its own place, such as a path the diff does not change.

## Before you send it

- Does `changes.diff` come from git, with new files included, against a base
  from `git merge-base` or a range from `git rev-parse`?
- Is it one or two screens: two to four chapters, each one idea with one
  component beside it?
- Does it show how control flows and which contracts changed, rather than
  which files?
- Is it a review? Then is there a verdict, and is every real problem a finding
  after its chapter, on its exact lines?
- Is every line range checked against the current file, and every statement
  visible in the diff?
- Is the page flat on the chat: no cards, tinted boxes, left-edge stripes,
  fixed heights, or inner scrolling?
- Is the change visible? Then are there real before/after screenshots?
