/**
 * The one layout rule every Happy client gives the chat UI `media` component,
 * so all of them agree and know its height before a byte arrives:
 *
 * - Justified rows at a target height H (220px on desktop), 6px apart.
 * - A row takes items while it still fits the width at height H, then scales
 *   to fill the width exactly, never taller than 1.5×H. It also takes the next
 *   item when the row filled with it comes nearer H than without it (so it
 *   may end up a little under H): without that, two 16:9 screenshots never
 *   share a row on a desktop measure. A last row that ran out of items stays
 *   at H, on the left, or shrinks to fit the width.
 * - A single item is min(the width, 2×H × its aspect) wide, on the left.
 * - Aspects are clamped to [0.4, 3] for layout only; the picture covers its box.
 * - A label is one 18px line 4px under its item; a row with any label gives
 *   every item in it that line.
 *
 * Sizes come from the media snapshots alone: an item that states none is
 * laid out as 4:3, or 16:9 for a recording.
 */

export const UI_MEDIA_ROW_HEIGHT = 220;
export const UI_MEDIA_GAP = 6;
export const UI_MEDIA_LABEL_GAP = 4;
export const UI_MEDIA_LABEL_LINE = 18;
const ROW_STRETCH_MAX = 1.5;
const SINGLE_HEIGHT_MAX = 2;
const ASPECT_MIN = 0.4;
const ASPECT_MAX = 3;

/** What layout reads of one item: its snapshot's size and whether it carries a label. */
export type UiMediaLayoutInput = {
    /** `video` defaults to 16:9 where no size is stated; anything else to 4:3. */
    readonly kind: string;
    readonly width?: number;
    readonly height?: number;
    readonly labelled: boolean;
};

export type UiMediaLayoutItem = {
    /** The item's position in the input. */
    readonly index: number;
    /** The picture's box. */
    readonly width: number;
    readonly height: number;
};

export type UiMediaLayoutRow = {
    readonly items: readonly UiMediaLayoutItem[];
    /** The picture's height, the same for every item in the row. */
    readonly pictureHeight: number;
    /** Whether the row carries a label line under its pictures. */
    readonly labelled: boolean;
    /** Picture plus label line. */
    readonly height: number;
};

export type UiMediaLayout = {
    readonly rows: readonly UiMediaLayoutRow[];
    readonly height: number;
};

/** An item's aspect for layout: its own, clamped; a default where its snapshot states none. */
export function uiMediaAspect(item: UiMediaLayoutInput): number {
    const aspect =
        item.width !== undefined && item.height !== undefined && item.width > 0 && item.height > 0
            ? item.width / item.height
            : item.kind === "video"
              ? 16 / 9
              : 4 / 3;
    return Math.min(ASPECT_MAX, Math.max(ASPECT_MIN, aspect));
}

/** Lays `items` out across `width`, with target row height `rowHeight`. */
export function uiMediaLayout(
    items: readonly UiMediaLayoutInput[],
    width: number,
    rowHeight: number = UI_MEDIA_ROW_HEIGHT,
): UiMediaLayout {
    const available = Math.max(1, Math.floor(width));
    const aspects = items.map(uiMediaAspect);
    const rows: UiMediaLayoutRow[] = [];
    if (items.length === 1) {
        const aspect = aspects[0]!;
        const pictureWidth = Math.round(
            Math.min(available, SINGLE_HEIGHT_MAX * rowHeight * aspect),
        );
        rows.push(
            row([{ index: 0, width: pictureWidth }], Math.round(pictureWidth / aspect), items),
        );
    } else {
        let start = 0;
        while (start < items.length) {
            let sum = aspects[start]!;
            let end = start + 1;
            while (end < items.length) {
                const next = sum + aspects[end]!;
                const gapsNext = UI_MEDIA_GAP * (end - start);
                /* It fits at H; or, filled, the row with it comes nearer H than without. */
                const fits = next * rowHeight + gapsNext <= available;
                const without = (available - gapsNext + UI_MEDIA_GAP) / sum;
                const nearer =
                    Math.abs((available - gapsNext) / next - rowHeight) <
                    Math.abs(without - rowHeight);
                if (!fits && !nearer) break;
                sum = next;
                end += 1;
            }
            const gaps = UI_MEDIA_GAP * (end - start - 1);
            /* Filled when another item was waiting for room; the last row keeps H. */
            const filled = end < items.length;
            const fit = (available - gaps) / sum;
            const height = Math.min(filled ? ROW_STRETCH_MAX * rowHeight : rowHeight, fit);
            const stretched = filled && height === fit;
            /* Whole pixels: a filled row's edges are rounded from running totals so its
               widths add up to the width exactly. */
            const placed: { index: number; width: number }[] = [];
            let edge = 0;
            for (let index = start; index < end; index += 1) {
                const after = edge + aspects[index]! * height;
                const right = stretched && index === end - 1 ? available - gaps : Math.round(after);
                placed.push({ index, width: right - Math.round(edge) });
                edge = after;
            }
            rows.push(row(placed, Math.round(height), items));
            start = end;
        }
    }
    const height =
        rows.reduce((total, each) => total + each.height, 0) +
        UI_MEDIA_GAP * Math.max(0, rows.length - 1);
    return { rows, height };
}

function row(
    placed: readonly { readonly index: number; readonly width: number }[],
    pictureHeight: number,
    items: readonly UiMediaLayoutInput[],
): UiMediaLayoutRow {
    const labelled = placed.some((item) => items[item.index]!.labelled);
    return {
        items: placed.map((item) => ({ ...item, height: pictureHeight })),
        pictureHeight,
        labelled,
        height: pictureHeight + (labelled ? UI_MEDIA_LABEL_GAP + UI_MEDIA_LABEL_LINE : 0),
    };
}
