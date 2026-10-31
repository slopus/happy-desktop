# Stable layout while resizing and moving

## Where we are going

People can resize Happy's desktop window and sidebars roughly as they want
without making the interface unstable. Sensible narrow and wide desktop layouts
remain usable without mobile breakpoints or unnecessary large minimum sizes.

Every moving, resized, or transformed piece of custom UI keeps its intended
geometry and visual weight: text, font icons, existing sanctioned SVG artwork,
controls, dividers, and compound components. A dragged item or subtree moves as
one object, including its rows, content, connectors, and spacing, and does not
jump or change weight when it is released.

## How we get there

First, keep the supported window and sidebar widths usable and let content adapt
to the available space.

Then preserve the internal geometry of moving objects throughout pickup, travel,
release, and settling. Preserve fractional measurements in a consistent
coordinate space. If paint needs alignment, align the object as a whole rather
than rounding its children independently. Changes required by a new parent or
indentation begin at the drop.

Finally, make equal visual roles retain consistent weight across supported
positions, widths, zooms, and display scales. Shared strokes have one paint owner.
A carried object's opaque backing, content, and connectors stay above stationary
peers until its motion finishes, including row gaps and children with opacity.
Tree stems remain visible from the first lift through settling, and their painted
thickness and visual weight match the horizontal branches. A remaining parent's
connection stays correct while its child moves.
Existing SVG artwork has an intentional bounds and scaling contract without
replacing the font icon system or imposing one global stroke-scaling rule.

## The sidebar holds still

The sidebar follows the chat surface's stability rules
([`09-chat-surface.md`](09-chat-surface.md): held space in `MessageList`, and
`messageListDisclosureAnchor` for disclosures). These are invariants:

- The top of the sidebar never moves when a section folds or unfolds,
  including the bottom-most one while scrolled to the bottom, or when a row
  near the end leaves.
- Shrinking content leaves held space behind. That space is let go only as
  the person scrolls away from it.
- Unfolding the bottom-most section shows its rows on screen.
- Foundational elements — a row's fold, icon and the start of its title — never
  shift and never change order. Transient things (hover controls, the +) take
  the space left, left of the fold, and overlay the title with a fade rather
  than push anything.
- `Sidebar.floor.test.tsx` and `Sidebar.ribbon.test.tsx` enforce these in all
  three engines.

## How we know it is done

- People can choose sensible desktop window and sidebar widths, including odd
  widths, without losing content or controls.
- Moving objects retain the relative geometry and alignment of every member
  through motion and settling at native 80%, 100%, 125%, and 150% zoom.
- Equal-role strokes keep consistent perpendicular painted profiles and visual
  weight. Neither shared edges nor overlapping paint make one position heavier.
- Every carried stem stays visible from the first lifted commit through holding,
  movement, release, and settling. Native vertical and horizontal profiles have
  matching painted thickness and peak contrast against the same local background.
- Stationary peers do not show through a carried object, its row gaps, or its
  connectors while it is moving or settling.
- Evidence uses real intended movement and state changes. Measured coordinates
  and native pixels describe the same verified pose; resized previews, stationary
  frames, equal DOM bounds, or equal total pixel coverage alone are insufficient.
