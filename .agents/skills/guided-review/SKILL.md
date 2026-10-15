---
name: guided-review
description: Use whenever someone asks to review, tour, walk through, or explain a change (a PR, a branch, commits, the work in this worktree), in any language and however it is phrased ("review this", "ревью", "что мы тут поменяли"), or asks to have a subsystem explained with a picture rather than prose. Writes an ordinary Markdown reply with small Happy fences that the transcript draws as native components.
---

# Guided review in the chat

A big diff in file order makes a reader jump between files for half an hour
to learn what the change even does. A guided review does that work for them in
a minute: what the change is, how control now flows through it, what
changed in its contracts — types, signatures, endpoints — and then its ideas
in chapters, most important first, each beside the code that shows it. A
reader learns a change from its calls and its contracts, not from its list of
files; the diff viewer already has that list.

Write it as an ordinary Markdown reply. Where a component helps, put a small
**Happy fence** in the reply; Happy draws each one with its own component, in
place, from the real change. No panel, no file, no HTML, no JSON.

## The components

Every fence is flat: `key: value` lines, then, after a blank line, free text
where a fence takes it. Never write code, diff text, line counts, or file
statuses into a fence — Happy reads all of them from the change.

**`happy-review`** — what the reply is about. First thing in the reply; it
also prints one quiet line saying how many of the changed files the reply
walks through, or which commit an explanation reads. Give exactly one of:

````
```happy-review
base: <full merge-base hash>
```
````

````
```happy-review
range: <full base hash>..<full head hash>
```
````

````
```happy-review
commit: <full hash from git rev-parse HEAD>
```
````

`base` is this branch's live change, `range` a committed one, and `commit` is
for an explanation: its `happy-diff` quotes are the code as it is at that
commit, drawn without change marks.

**`happy-files`** — the files the change touched, grouped under their
folders, each with its `+N −M` and status; a long list shows its first rows
and a button for the rest. Empty lists every changed file; otherwise one
path or folder per line lists just those (a folder lists everything under
it).

````
```happy-files
```
````

````
```happy-files
packages/app/src/store
packages/app/tests/store.test.ts
```
````

**`happy-diff`** — a few real lines of the change, with the file's name,
status, and whole-file counts in a header; clicking it opens the file's diff
at those lines. `lines` are numbers in the file as it now stands; Happy
shows at most twelve.

````
```happy-diff
path: packages/app/src/store.ts
lines: 40-52
```
````

**Two diagrams, one syntax.** Both take one arrow per line,
`From -> To: what passes`, and a part on its own line when nothing points at
it. Mark a part `[new]`, `[changed]`, or `[gone]` and add the number of the
chapter about it: `[new 2]`; clicking that number goes to the chapter. Mark
an arrow the change added or changed after its label: `: lookup [new]`.
Everything unmarked is drawn quiet, as context. Pick the one that answers the
change's question:

**`happy-sequence`** — _what happens_: the calls in the order they happen,
each part a column, each call an arrow between them. Use it when the change
is about behaviour — a request's path, what a click sets off, a lifecycle, an
event handled, a retry or an error path. Write the calls in order, starting
where it starts (a click, a request, an event); an answer back to an earlier
caller is drawn dashed; a part calling itself is `Part -> Part: what it does`.

````
```happy-sequence
Transcript -> ChatStore [changed 2]: sender ids
ChatStore -> AgentIdentities [new 1]: lookup [new]
AgentIdentities -> getAgent [new 1]: unknown id [new]
getAgent -> AgentIdentities: agent
AgentIdentities -> ChatStore: name
```
````

**`happy-flow`** — _how parts connect_: each part once, top to bottom, an
arrow from each part to what it feeds or depends on. Use it when the change
is about structure — a new module and where it sits, who owns which data,
what now depends on what, a part removed or replaced. Order does not matter
here; each part appears once however many arrows it has.

````
```happy-flow
Transcript -> ChatStore [changed 2]: sender ids
ChatStore -> AgentIdentities [new 1]: lookup [new]
AgentIdentities -> SessionList: index
OldResolver [gone]
```
````

When both questions matter, open with the one that matters more and put the
other in the chapter it explains. Never draw the same thing twice.

**`happy-finding`** — one problem a review found. `severity` is `high` (must
be fixed before it goes in), `medium` (should be fixed), or `low` (worth
knowing). `path` and `lines` point at the wrong lines, together or not at
all; Happy quotes them. After a blank line: why it matters and what to do, in
Markdown.

````
```happy-finding
severity: medium
title: A failed lookup is never retried
path: packages/app/src/identities.ts
lines: 118-124

The agent is marked as asked before the call and stays marked when it fails,
so one network blip leaves it unnamed until reload. Delete the entry on failure.
```
````

**`happy-verdict`** — where a review comes down, in a sentence or two of
Markdown. Happy counts the findings by severity above it; never count them
yourself.

````
```happy-verdict
Safe to merge after the retry fix.
```
````

**`happy-before-after`** — screenshots of a change someone can see, each a
published image artifact named `<artifact id>@<version>`; a side may be left
out (a new dialog has no before). The text after them says what changed in
behaviour.

````
```happy-before-after
before: <artifact id>@1
after: <artifact id>@1

Upload photo used to send the file as picked; now a crop dialog opens first.
```
````

Mermaid fences still work for anything that is not a change's parts.

## How to mix them

Prose is the reply's own Markdown: short paragraphs, `inline code` for names,
**bold** for the one thing that matters. Paths never go in a sentence; they
belong to `happy-diff`, `happy-files`, and `happy-finding`.

Chapters are `##` headings. Happy numbers them in order — the numbers a
diagram's parts point at — and lays each one out as its heading and the
paragraphs right under it, then the **one** `happy-diff`, `happy-flow`, or
`happy-files` that follows them. In a wide column that component takes the
left and the words a narrow column at the right; in a narrow one it goes
under them. A `happy-sequence` reads across, so it always takes the whole
width under the words. Long code lines wrap, so a quote never needs scrolling.
Anything after it in the chapter (a finding, a second diff) comes below,
full width. So a chapter is: heading, one or two sentences, one component,
then its findings.

### Recipe: review of a change

1. `happy-review` with the base or range.
2. One or two sentences: what changes for whoever uses this code — its
   behaviour or its contract — and why, in ordinary words.
3. `happy-verdict` — only when asked to review rather than to explain.
4. One diagram, marked with what the change adds and changes: a
   `happy-sequence` of the calls when the change is about what happens, a
   `happy-flow` of the parts when it is about how they connect. Skip it only
   for a change inside one function.
5. Two to four chapters, most important first:
    - **Contracts first.** A chapter per contract that changed — an exported
      type, a function's signature, an endpoint's request or response, a
      store's actions or events, a component's props. Quote the declaration
      with `happy-diff` on exactly those lines, and say in a sentence what a
      caller passes or gets now that it did not before.
    - **Then the behaviour** that serves it: the few lines where the flow
      turns, each quoted with `happy-diff`.
    - **Groundwork, tests, and generated files last**, briefly; a
      `happy-files` slice is right only for a chapter that really is a group
      of files (tests, fixtures, pages).
6. Each `happy-finding` right after the chapter whose lines it is about; a
   problem with the change as a whole goes after the last chapter, without
   lines.
7. Before/after screenshots, when the change is visible, right after the
   opening sentences.

Do not open with a file list. An empty `happy-files` (every changed file)
belongs only at the very end, and only when the reader asked what the change
touches.

### Recipe: explanation (not a change)

`happy-review` with `commit:` from `git rev-parse HEAD`, so the quotes are
the code you read. One sentence on what is being explained, then a
`happy-sequence` for how something happens or a `happy-flow` for how
something is built, then chapters on its contracts and the lines where the
flow turns, with `happy-diff` of the code where it helps. A diagram of
something that did not change has no marks, and there is no `happy-files` or
verdict.

## Short is the point

A review is read in place, in one or two screens of a chat column.

- Every sentence at most twenty words; a chapter's words one or two
  sentences.
- Two to four chapters. Never one per file: a chapter is an idea, and
  "where a session opens" is a chapter where "packages/state" is not.
- A diff range is the few lines that are the idea, eight at most; a finding's
  range is the wrong lines themselves, one to five.
- Only real problems as findings, four at most, no nitpicks, no praise. What
  is good goes in the verdict, briefly.
- A sequence has at most eight calls across at most five parts; a flow at
  most eight parts. A part is a name from the code — a component, a store, a function, an endpoint — never
  a file or a folder. A label is what passes, one to three words, never a
  sentence or a path.
- Skip the routine: imports, plumbing, renames, formatting, lockfiles.
- After the last chapter, at most one sentence, only for what you could not
  check (tests you did not run, a screen you did not open).

A narrow question about one bug or one file is answered directly, without
any of this.

## Rules that make it trustworthy

- **Read the real diff first.** For this branch's work list every changed
  file with `git diff --name-only <base>` and `git status --porcelain -uall`
  (new files count), and read them with `git diff <base>` and the new files
  themselves; for other commits use `git diff <base> <head>`. Every statement
  must be visible in that diff, and nothing important may be left out.
- **This branch's work names `base`:** take it from
  `git merge-base origin/main HEAD` (the repository's default branch; without
  an `origin` copy, the local one). Happy reads the working tree against it,
  committed and uncommitted alike. Once the branch is merged or rebased, the
  reply says it is no longer checked rather than showing another change.
- **Any other change names `range`:** two full hashes from `git rev-parse`,
  with line numbers as the files are at the head.
- **Line numbers are current-file numbers.** Check them against the file as
  it is now, not the old version or the hunk header.
- **Point, do not reprint.** Never write code into the reply as a code block
  to show the change; quote it with `happy-diff`.
- **Screenshots are real.** Capture both sides of the same place at the same
  size: the after from the change as it runs, the before from a worktree at
  the base. Never draw, mock, or generate a picture of a UI. Publish each as
  an image artifact and name it by id and version, never a URL or a path.
- **Write fences whole and in order.** Happy draws a fence once it closes and
  holds its place with one quiet line until then, so the reply builds up as
  you write it.

## Before you send it

- Is there a `happy-review` with a `base` from `git merge-base`, a `range`
  from `git rev-parse`, or, for an explanation, a `commit`?
- Is it one or two screens: two to four chapters, each one idea with one
  component beside it?
- Does it show how control flows and which contracts changed, rather than
  which files?
- Is it a review? Then is there a verdict, and is every real problem a
  finding after its chapter, on its exact lines?
- Is every line range checked against the current file, and every statement
  visible in the diff?
- Is the change visible? Then are there real screenshots in a
  `happy-before-after`?
