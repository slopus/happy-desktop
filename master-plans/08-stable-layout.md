# Stable layout and motion

## Where we are going

People can resize or zoom Happy and move its interface without the interface
changing shape under them. Text, icons, existing SVG artwork, controls,
dividers, and compound components keep their intended geometry, relative
alignment, and visual or stroke weight across supported positions and scales.

A dragged task tree is one example of this rule, not its boundary. Its parts do
not shift relative to one another while moving or jump when the motion ends.

## How we get there

First, keep every supported window width, zoom, and desktop display scale usable
and visually coherent.

Then preserve the intended geometry and relative alignment of anything that
moves, resizes, or transforms. Intended changes happen deliberately through the
transition; for a drag, the destination layout begins at the handoff.

Finally, keep custom UI geometry, alignment, and visual weight consistent across
representative positions, scales, and transitions.

## How we know it is done

- People can choose any supported size and scale without losing content,
  controls, or alignment.
- Moving components retain their relative layout and intended visual weight.
- Motion and resizing end without a delayed resize, shift, jump, or correction
  frame, while intentional geometry changes remain coherent through the
  transition.
