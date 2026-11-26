/*
 * How a table shares its measure between columns, from each column's
 * one-line extents. Markdown tables take the extents from the text layout
 * model; Gen UI grids take them from the browser's own min- and max-content
 * widths. Both draw the widths this returns.
 */

/** The narrowest a wrapping column gets (padding included): about 13
 * characters of body copy, so no column collapses into a strip of single
 * words. A table whose columns cannot all have this scrolls instead. */
const TABLE_MIN_COLUMN = 136;
/** A prose column's width (padding included) in a table that scrolls anyway:
 * about 28 characters of body copy per line. */
const TABLE_READABLE_COLUMN = 240;
/** The widest a single word holds a column open (padding included) in a
 * table that scrolls anyway; a longer URL or identifier breaks. */
const TABLE_SCROLL_WORD_COLUMN = 400;

/**
 * Column widths at one whole-pixel measure, from each column's widest word
 * (`min`), widest unwrapped line (`max`) and widest run that must not break
 * (`hard`). A table whose cells all fit on one line keeps that natural width
 * rather than stretching. Otherwise every column gets a floor: its one-line
 * width when that is narrow, else at least `TABLE_MIN_COLUMN` and its widest
 * word, but a word holds its column open only up to an equal share of the
 * measure — a longer identifier or URL breaks the way it does in a paragraph
 * instead of starving its neighbours. Only a word that must not break
 * (`hard`) floors its column at full width. Above the floors, every column
 * that wants more gets the same width (a water level), so the last column is
 * not left with whatever remains. When even the floors are too wide, the
 * table scrolls at readable widths.
 */
export function tableColumnWidths(
    min: readonly number[],
    max: readonly number[],
    hard: readonly number[],
    target: number,
): number[] {
    const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
    if (sum(max) <= target) return [...max];
    const share = Math.floor(target / Math.max(1, max.length));
    const floor = max.map((width, index) =>
        Math.min(width, Math.max(hard[index]!, TABLE_MIN_COLUMN, Math.min(min[index]!, share))),
    );
    if (sum(floor) > target)
        return max.map((width, index) =>
            Math.max(
                floor[index]!,
                Math.min(
                    width,
                    Math.max(
                        hard[index]!,
                        TABLE_READABLE_COLUMN,
                        Math.min(min[index]!, TABLE_SCROLL_WORD_COLUMN),
                    ),
                ),
            ),
        );
    const at = (level: number) =>
        max.map((width, index) => Math.min(width, Math.max(floor[index]!, level)));
    /* The highest whole-pixel level that fits; the pixels it leaves go one
       each to the columns still growing at that level, first to last. */
    let low = 0;
    let high = Math.max(...max);
    while (low < high) {
        const level = Math.ceil((low + high) / 2);
        if (sum(at(level)) <= target) low = level;
        else high = level - 1;
    }
    const widths = at(low);
    let remainder = target - sum(widths);
    for (const [index, width] of widths.entries()) {
        if (remainder <= 0) break;
        if (width === low && width < max[index]!) {
            widths[index] = width + 1;
            remainder -= 1;
        }
    }
    return widths;
}
