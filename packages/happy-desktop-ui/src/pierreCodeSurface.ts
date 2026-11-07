import scrollbarCss from "./styles/scrollbar.css?inline";

/**
 * The correction Pierre Diffs' shadow-DOM stylesheet needs wherever Happy owns
 * the scrollport around it — the working-tree diff and the file viewer's source
 * face. Both hand the renderer a whole pane and scroll it from outside, so both
 * need the same things, written once here rather than drifting apart.
 *
 * Pierre reserves a classic scrollbar gutter inside every code column. On a pane
 * whose vertical scrollport belongs to Happy, that gutter is only an unpainted
 * lane down the right of every row: an addition's green and a deletion's red
 * stop short of the edge, and the lane comes and goes with the file's length, so
 * the same code sits at different coordinates depending on how much of it there
 * is. Releasing it lets each row reach the pane edge.
 *
 * The horizontal scrollport inside each code column is Pierre's own, and a
 * shadow root does not inherit the page's rules, so the shared scrollbar sheet
 * is carried in whole. Pierre layers its own rules beneath `unsafe`, so the
 * shared sheet's plain selectors win over its `[data-code]` thumb.
 */
export const PIERRE_PANE_CSS = `
    [data-code] {
        padding-bottom: var(--diffs-gap-block, var(--diffs-gap-fallback));
        scrollbar-gutter: auto;
    }
    [data-code]:last-of-type [data-line],
    [data-code]:last-of-type [data-no-newline] {
        padding-inline-end: var(--happy-code-trailing-clearance, 1ch);
    }
${scrollbarCss}
`;

/**
 * What a diff header stops drawing once Happy draws the name itself.
 *
 * The renderer's header leads with a mark for the kind of change and then one
 * flat run of path text. `DiffFileTitle` replaces both — a glyph for what the
 * file is, and a name whose directories give way before the file name does —
 * through the prefix slot the renderer leaves ahead of them. These are the
 * originals standing down; without this both would be drawn twice.
 *
 * Separate from `PIERRE_PANE_CSS` because a surface with no header, or one that
 * keeps the renderer's own, must not inherit this.
 */
export const PIERRE_DIFF_HEADER_CSS = `
    /* Whether the pointer is on this header. Only the shadow root can know it —
       the controls slotted into the header are light DOM, and a page rule
       cannot ask about an element it cannot see. Inherited properties do cross
       into slotted content, so the answer is left here for them to read. */
    [data-diffs-header] {
        --happy-header-pointer: 0;
    }
    [data-diffs-header]:hover {
        --happy-header-pointer: 1;
    }
    [data-change-icon],
    [data-header-content] [data-title],
    [data-header-content] [data-prev-name],
    [data-rename-icon] {
        display: none;
    }
`;

/**
 * Says a header row opens and closes its own file.
 *
 * Only a surface that actually answers a click on the header adds this — the
 * pointer is a promise, and a diff of one file has nothing to fold.
 */
export const PIERRE_DIFF_HEADER_CLICK_CSS = `
    [data-diffs-header] {
        cursor: pointer;
    }
`;
