import { tableColumnWidths } from "../tableColumnWidths";
import type { GenUiGridColumn } from "./genUiRender";

/*
 * A grid's columns are shared out the way a Markdown table's are
 * (tableColumnWidths), from extents the browser measures on the grid itself:
 * a cell can hold any primitive, so only the engine knows how wide it is.
 */

/** Each column's widths on one line, padding included, independent of the measure. */
export type GenUiGridExtents = {
    /** Widest word: the narrowest the column reads well at. */
    readonly min: readonly number[];
    /** Widest cell with no wrapping at all. */
    readonly max: readonly number[];
    /** Widest run that cannot wrap even by breaking a word: a pill, a
     * header, a number kept on one line. A floor for its column. */
    readonly hard: readonly number[];
};

/** The width of each of the first `count` cells, which is their column's, at one template. */
function tracksRead(grid: HTMLElement, template: string, count: number): number[] {
    grid.style.gridTemplateColumns = template;
    const cells = [...grid.children].slice(0, count);
    return cells.map((cell) => Math.ceil(cell.getBoundingClientRect().width));
}

/**
 * Lays the grid out three times to read its columns' extents; the caller
 * draws the solved template right after, before anything is painted.
 */
export function genUiGridExtents(grid: HTMLElement, count: number): GenUiGridExtents {
    const max = tracksRead(grid, `repeat(${count}, max-content)`, count);
    const min = tracksRead(grid, `repeat(${count}, min-content)`, count);
    /* gen-ui.css lets wrapping text break anywhere while this is set, so only
       what cannot wrap at all keeps its width. */
    grid.dataset.measuring = "";
    const hard = tracksRead(grid, `repeat(${count}, min-content)`, count);
    delete grid.dataset.measuring;
    return { min, max, hard };
}

/**
 * The grid's template at its current width. Above the solved widths, the
 * room a table that fits leaves goes to its `fill` columns, or to every
 * column when none fills, so its hairlines still span the block.
 */
export function genUiGridTemplate(
    grid: HTMLElement,
    columns: readonly GenUiGridColumn[],
    extents: GenUiGridExtents,
): string {
    const gap = Number.parseFloat(getComputedStyle(grid).columnGap) || 0;
    const target = Math.max(
        0,
        Math.floor(grid.getBoundingClientRect().width - gap * (columns.length - 1)),
    );
    const widths = tableColumnWidths(extents.min, extents.max, extents.hard, target);
    const fills = columns.some((column) => column.width === "fill");
    return widths
        .map((width, index) =>
            !fills
                ? `minmax(${width}px, auto)`
                : columns[index]?.width === "fill"
                  ? `minmax(${width}px, 1fr)`
                  : `${width}px`,
        )
        .join(" ");
}
