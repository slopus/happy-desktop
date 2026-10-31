# Chat surface

## Where we are going

The chat is where people spend most of their time with an agent. Its first job
is stability: the transcript holds still unless the person moves it. Reading,
typing, sending, and watching an agent work must never make content jump,
slide, shrink, or settle on its own.

A good chat with an AI follows a few principles:

- **The reader owns the scroll position.** Nothing programmatically scrolls the
  chat in the opposite direction of the person, under any condition. The only
  movement the app may start on its own is following the bottom while the
  person is already at the bottom.
- **The draft never hides the conversation.** A draft that grows carries the
  transcript up with it in the same frame, so the newest lines stay in view; a
  docked question does the same. A draft that shrinks, or empties on send,
  leaves space behind that holds still. Typing on one line moves nothing.
- **Sending gives the reply room.** A send from the bottom lifts the sent
  message once, in the commit that adds it, until its top edge sits 30% down
  the viewport: the turn before it stays in view and the reply has the rest.
  The space under it is added in that same frame. No animation, no pin to the
  top edge. A send made while the agent is still working joins the queue below
  its live status without a lift; a reader near the bottom follows the queued
  message into view. The queue also holds room below it for the live status
  the agent's next turn will show under those messages once it takes them up:
  in the user's words, "we know that when they go out of queue, the processing
  thing should appear underneath it. So we should anticipate that and preserve
  exactly that amount of space for them. So when we queue them up, if there's
  not enough space, we would add that spacer." Taking up the queue then moves
  nothing, and the live status never sits under the composer. A reader
  scrolled up into history stays put.
- **Returning to a chat is invisible.** A chat opened again is where it was
  left: following the bottom if the reader was following it, holding the same
  row if they had scrolled up, with whatever arrived meanwhile already in
  place. It appears at that point in its first frame and does not move after.
  A chat out of sight does no work to stay placed; it is placed once, in the
  commit that shows it, and not shown until its content is current.
- **Space that exists stays put.** Blank space added to keep content still —
  under a send, under a shrinking draft, below a grown window — belongs to the
  end of the transcript. It keeps its size wherever the reader scrolls, moves
  with the end when history above changes, and is only ever taken up by new
  content growing into it; once that content outgrows it, the transcript grows
  as usual. A window, composer, or dock shrinking the viewport uses held blank
  space first, one pixel for one pixel, before the transcript moves; zoom
  preserves its physical size within 70% of the viewport. Enlarging the viewport
  may add the blank needed to keep a parked row fixed, without applying the
  shrink cap again or letting the viewport become entirely blank. Resizing the
  window vertically, from its bottom edge or its top edge, behaves like the
  draft growing: "if there's space to take, the resize should probably take that
  space", and the transcript moves with the edge at the same rate however fast
  or slow it is dragged. Blank space a resize added goes once it has fully
  scrolled off screen. Space never
  decays with time, scrolling, or
  streaming, and never animates or disappears on its own.
- **Work folds away out of sight.** A finished turn's steps fold behind
  "View traces", but never while any row of it is on screen: a turn the reader
  watched finish, or steered, stays open until all of it has scrolled away, and
  only then folds — nothing visible moves. "If you switch from this chat to a
  different chat and then return, then all of the already completed turns' tools
  should be collapsed." History and turns finished before the chat was opened
  arrive folded. A turn left open this way keeps every row
  exactly as it ran — no header appears, nothing regroups — and offers "Hide
  traces" at its first step and on the footer its end brought. A turn the reader
  opens offers it on the answer, where "View traces" was, so opening and closing
  it again is two clicks in one place. With the chat in several views, a turn
  folds only once none of them shows any of it.
- **Order is truthful and readable.** Messages appear in the order they
  happened, never reorder or briefly disappear, and a message sent while the
  agent is still working is visibly distinct from the reply that continues
  after it. Stopping a turn and accepting its queue preserve each message's
  row identity: the stopped status, dequeue, and next stream never remount a
  visible message or move content down. A parked reader keeps the same row.
- **A long send stays compact.** A sent message taller than 10 lines shows
  its first 10, with the fold control and "Show full" to open the rest in
  place. In the user's words: "when sending a very large message, we should not
  send it as a huge block. We should allow expanding it ... show the first 10
  lines ... use the ribbon to expand and then also ... just show full." Opening
  it expands below, "not push content up": the message's top and everything
  above it stay where they are, and everything after it moves down.
- **One text column.** Prose, tool rows, questions, and every other card share
  the transcript's left edge, width, and type rhythm. Nothing looks pasted in.
  A framed element — a card, a banner, an error, an approval, a tool block —
  keeps its content on that same left edge, and only its frame stands out
  beyond the column, on the left and on the right, by the frame's own padding:
  the content sits as far from the frame's edge on every side (see
  `11-design.md`). In the user's words:
  "the frame should actually stick out a bit on the left / right - but the
  content inside should remain aligned with content on the rest of the page."
  These special elements also keep consistent spacing: they sit as far from
  the author line above them, and from the content around them, as every
  other element does.
- **Performance is not traded away.** Scrolling and streaming stay at frame rate
  on long conversations. Stability is achieved without per-scroll work.

## How we get there

First, remove behavior that fights the reader: the pin-to-top send and its
shrinking tail reserve are gone, and the transcript follows only a reader who is
at the bottom. A send lifts once, to 30%, into space that only the reply takes up.

Then make every geometry change preserve what the reader sees: composer
resizing, window and pane resizing, browser zoom, late-loading images and code
blocks, expanding tool rows, docked questions, and model-switch rows.

Then make switching between chats invisible: a kept chat waits, out of sight,
until it is read back, and is shown in the same commit that draws it current,
so the reader never sees it as it was left and then watches it catch up.

Then make ordering and alignment correct: atomic acceptance of sent messages,
stable ordering, a clear marker for messages sent mid-turn, and one shared text
column for every kind of row.

Later, not started: streaming shows nothing half-formed. In the user's words,
"we probably should not be streaming links. If we detect something that doesn't
have a closing and it's a pretty simple, clear case, we should probably not even
render it", and the standard HTML fragments put into the DOM "should only show
up when they get to a reasonable point."

## How we know it is done

- Instrumented stress runs in Chromium, Firefox, and WebKit try to break it:
  realistic typing and editing, sending from the bottom and from history,
  steering mid-turn, rapid sends, momentum scrolling while streaming, browser
  zoom from 50% to 200%, window and pane resizing, fractional display scales,
  and very short, very long, and empty conversations. They find no programmatic
  scroll against the person and no visible row moving 1px or more without a
  gesture.
- After a send from the bottom, the sent message's top edge is 30% down the
  viewport in the frame that first shows it, the turn before it is visible
  above, and nothing moves until the reply fills the space below and the
  transcript follows the bottom again — also after scrolling away and back.
- New work's first send lands, in place of the intro's options, with its top
  edge at the same height as a later send's lifted top edge, within half a
  pixel, and the intro's mark does not move.
- The live status line's loader, clock, separator, and phase share one
  baseline.
- Switching away from a chat that keeps streaming and back to it shows it, in
  its first painted frame, at the bottom if the reader was following and at
  the same row if they were not, and no visible row moves in the frames after.
- Question cards and every other row align with assistant prose within half a
  pixel at every width. In a framed element it is the content that aligns, and
  every frame stands out from the column by its padding, the same amount on
  both sides.
- Every framed or special element sits the same distance from the author line
  above it, and from its neighbours, as the other elements do.
- Scrolling and streaming a conversation of several hundred turns keep frame
  times within the display's frame budget with no long tasks, measured before
  and after each change.
