---
name: blueprint-screens
description: Use when iterating on the look of a Happy desktop screen or flow (onboarding, setup, settings, any full-window page) and the person wants to see screenshots fast — render the screens in the Blueprint, capture them in one browser at a couple of window sizes, and show them for feedback.
---

# Blueprint screens for design review

The fastest loop for reviewing UI: render the real `happy-desktop-ui` components
in the Blueprint, capture them as PNGs, show the person, take feedback, repeat.
This is a design-review loop, not a test. It does not replace the rendering
contracts in `DESIGN.md`, and it is not a reason to write tests.

## Rules

- **One browser.** Chromium only. No Firefox/WebKit passes while iterating.
- **Two window sizes.** The window Happy opens at, 1100 × 760, and its minimum,
  720 × 640 (`packages/happy-desktop-electron/sources/main/main.ts`). Add a size
  only when the person asks for one.
- **One happy path.** Show the screens in the order a person meets them. Add an
  error or edge state only when it is what is being reviewed.
- **Real components, fixture props.** Blueprint pages compose the shipped
  components with props only; never bootstrap the app. If a screen does not
  exist in the Blueprint yet, add it — that is the change the app will import.
- **Show results early.** Capture the current state before changing anything,
  so every iteration can be compared with a "before".

## Steps

1. Find or add the flow page. A flow page lives in
   `packages/happy-desktop-ui/dev/pages/<Name>Page.tsx`, exports a
   `componentNumber` (`P-…` for product pages), and renders each screen in a
   `FullScreenSpecimen` with `window={{ width, height }}` and a
   `screen="<NN>-<step>-<width>x<height>"` name. `OnboardingFlowPage.tsx`
   (`#onboarding-flow`) is the reference.
2. Capture. Chromium needs reviewed full-access execution on macOS:

    ```sh
    pnpm blueprint:screens onboarding-flow --out .context/screens/onboarding-flow/before
    ```

    Options: `--only 1100x760` (substring filter on screen names), `--scale 1`
    (default 2× retina), `--settle 1500` (ms to let scenes and fades land).
    Output: one folder per window size (`1100x760/`, `720x640/`), each holding
    that size's screens in flow order, plus an `index.html` contact sheet. A
    full run takes about 20 seconds.

3. Look at the PNGs yourself before showing them; fix anything obviously broken.
4. Show the person: `open <out>/index.html` (full access), and list what changed.
5. Iterate on the components, then capture to a new folder (`after-1`,
   `after-2`, …) so each round can be compared with the previous one.

## When the person approves

Keep the flow page; it is the Blueprint coverage for those screens. Then follow
the normal workflow: `pnpm --filter happy-desktop-ui typecheck`, build what you
touched, `pnpm format`, and sync to main only when asked.
