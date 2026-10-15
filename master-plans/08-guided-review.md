# Guided review in the chat

## Where we are going

We need to be able to do what Capy Guided Reviews does, but you ask for the
tour in the chat and it is drawn right in the conversation, not in a sidebar.

The general approach is intelligent UI: the model does not write raw code. It
writes an intermediate format, and Happy draws it with its own components so it
looks like Happy and not like an embedded site. A guided review is a prompt, a
skill, and a small set of standard components on top of that, not a separate
review mode and not a second review interface. A chapter may link into the
file or diff view that already exists.

What to copy from Capy: a big diff in file order makes you jump between files
for half an hour to understand what the PR even does. The guide does that for
you.

- Overview: one sentence of context, the steps of the PR, and before/after as
  "show me", so the change is understandable at a high level.
- Files are gathered into chapters. A chapter is one idea in ordinary words,
  not a folder.
- Order by importance: the essence first, then the groundwork; tests and
  generated files at the end.

Inline Mermaid already exists and stays as it is. The lesson from t3code is not
"add Mermaid" but how to put a visualization into a stream at all: draw only a
closed block, do not rebuild on every token, load heavy renderers lazily, and
never let arbitrary HTML in as the main path.

The first version does not build a JavaScript execution bridge. It is the most
expensive and dangerous part, and the tour does not depend on it.

## References

- Capy Guided Reviews: https://x.com/0xluffy/status/2107593041519501477 and
  the 0.4.4 changelog https://capy.ai/changelog/0.4.4.
- t3code inline visualizations: https://github.com/pingdotgg/t3code,
  discussion https://github.com/pingdotgg/t3code/discussions/6812,
  PR https://github.com/pingdotgg/t3code/pull/14721,
  PR https://github.com/pingdotgg/t3code/pull/15067.
- Rabi Guha on DIL: https://x.com/rabi_guha/status/2108238432355123572 and
  why not HTML in an iframe:
  https://x.com/rabi_guha/status/2108620161611903258.
- Open format: https://github.com/thesysdev/openui, the write-up in PR
  https://github.com/thesysdev/openui/pull/1330 ("How ChatGPT Intelligent UI
  works"). Thesys sells its own generative UI, so take the idea, not the text
  as a specification.

## How we get there

First, keep these references here.

Then the smallest native path, and a couple of versions of it. Evaluate them
on real data: real PRs, including the PR of this feature itself, and not only
PRs — look at how people make visualizations in general. The same fixtures for
every version.

## How we know it is done

- A tour of a real change shows, in the chat, an overview, before/after, and
  chapters, and every statement rests on the actual diff.
- The same mechanism can explain something that is not a PR.
- Mermaid keeps working.
- There is no separate review mode.
