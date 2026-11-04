import type { ConversationMediaLayout } from "happy-desktop-state";
import { thumbhashAspectRatio } from "./thumbhashDataUrl";

/**
 * Where pictures shown together go, and how big each one is. Nothing here
 * crops: every picture keeps its own shape, and one too tall for its box is
 * letterboxed inside it instead of being cut down.
 *
 * This is the single source of that geometry. A layout is decided once, from
 * the pictures' shapes alone, as a `MediaFlowPlan`: which pictures share a row
 * and what bounds each one. The plan does not depend on the width it is drawn
 * at, so `MediaFlow` paints it with ordinary flexbox (each tile's width from
 * the row's width, its height from its aspect ratio) and `mediaFlowGeometry`
 * runs the same arithmetic at a given measure. The row model reserves
 * `mediaFlowHeight`; the browser lays out the same boxes; neither needs the
 * other's measurement to agree.
 *
 * Two kinds of row:
 *
 * - `cells`: equal columns. Each picture is drawn at its column's width at
 *   its own shape, never wider than its own point size, and never taller than the
 *   row's cap — past it the picture narrows to the cap, down to
 *   `MEDIA_FLOW_MIN_WIDTH`, and below that keeps that width and letterboxes.
 *   A row is as tall as its tallest picture; shorter ones sit at its top.
 * - `justified`: pictures share one height and fill the width together, each
 *   at its true shape, unless that height would pass the row's cap or blow a
 *   picture up past its own point size, in which case the row stops short.
 */

/** What the layout knows about one picture before its bytes arrive. */
export type MediaFlowImage = {
    /** Intrinsic pixel size, when the producer stated it. */
    readonly width?: number;
    readonly height?: number;
    /** Pixels per point: 2 for a Retina capture, which is never drawn past half its pixels. */
    readonly scale?: number;
    /** The placeholder hash, whose header carries an approximate shape when the size is absent. */
    readonly thumbhash?: string;
};

export type MediaFlowTile = {
    /** The picture's position in the list the plan was made from. */
    readonly index: number;
    /** Width over height. */
    readonly ratio: number;
    /** The widest this tile is ever drawn: its own point size, or the width its row's height cap leaves it. */
    readonly maxWidth: number;
};

export type MediaFlowRow =
    | {
          readonly type: "cells";
          readonly columns: number;
          /** The tallest a tile is drawn; past it the tile narrows, then letterboxes. */
          readonly maxHeight: number;
          readonly tiles: readonly MediaFlowTile[];
      }
    | {
          readonly type: "justified";
          /** The tallest the shared row height may be. */
          readonly maxHeight: number;
          readonly tiles: readonly MediaFlowTile[];
      };

export type MediaFlowPlan = { readonly rows: readonly MediaFlowRow[] };

/** One tile's box at a measure, relative to the whole layout. */
export type MediaFlowBox = {
    readonly index: number;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
};

export type MediaFlowGeometry = {
    readonly height: number;
    readonly tiles: readonly MediaFlowBox[];
};

/** The gap between neighbouring tiles and between rows. */
export const MEDIA_FLOW_GAP = 8;
/**
 * The narrowest a picture is drawn because its height is capped. A page-tall
 * capture scaled whole would arrive as an unreadable sliver; past this it
 * keeps this width and letterboxes, and the click that opens it is right there.
 */
export const MEDIA_FLOW_MIN_WIDTH = 160;
/**
 * Past these ratios a picture is too extreme to share a row: a header strip
 * would flatten its neighbours, and a page capture would stretch them tall.
 * It takes a row of its own instead.
 */
const EXTREME_WIDE = 3;
const EXTREME_NARROW = 0.4;
/**
 * Justified rows are chosen once, at this reference measure, aiming each row
 * at `JUSTIFIED_TARGET_HEIGHT`. The same choice is drawn at every width, so a
 * window resize scales the rows rather than reshuffling them.
 */
const JUSTIFIED_REFERENCE_WIDTH = 720;
const JUSTIFIED_TARGET_HEIGHT = 300;
const JUSTIFIED_MAX_PER_ROW = 4;
/** The shape assumed for a picture that states neither a size nor a ThumbHash: 4:3. */
const FALLBACK_RATIO = 4 / 3;

/** The bounds one surface draws its pictures within. */
export type MediaFlowLimits = {
    /** A picture on a row of its own, and a one-column grid. */
    readonly singleMaxHeight: number;
    /** A two-column grid's cells. */
    readonly cellMaxHeight: number;
    /** A justified row's shared height. */
    readonly rowMaxHeight: number;
};

/** What a tool call presents, under its line at the transcript's full measure. */
export const TOOL_MEDIA_LIMITS: MediaFlowLimits = {
    singleMaxHeight: 640,
    cellMaxHeight: 480,
    rowMaxHeight: 480,
};
/** Photos attached to a message, in a box at most `MESSAGE_MEDIA_MAX_WIDTH` wide. */
export const MESSAGE_MEDIA_LIMITS: MediaFlowLimits = {
    singleMaxHeight: 360,
    cellMaxHeight: 320,
    rowMaxHeight: 280,
};
/** The most photos a message shows inline. */
export const MESSAGE_MEDIA_MAX = 4;
/** A message's photos stay a bubble's width, not the transcript's. */
export const MESSAGE_MEDIA_MAX_WIDTH = 560;

/** A picture's width-to-height ratio: its stated size, else its ThumbHash, else 4:3. */
export function mediaFlowRatio(image: MediaFlowImage): number {
    if (image.width && image.height) return image.width / image.height;
    const hashed = image.thumbhash ? thumbhashAspectRatio(image.thumbhash) : undefined;
    return hashed ?? FALLBACK_RATIO;
}

/**
 * The largest a picture is ever drawn: its pixel size over its density, so a
 * 2× capture shows at the size it had on the screen it was taken from.
 * Undefined when the producer stated no size.
 */
export function mediaFlowPointSize(
    image: MediaFlowImage,
): { readonly width: number; readonly height: number } | undefined {
    if (!image.width || !image.height) return undefined;
    const scale = image.scale && image.scale > 0 ? image.scale : 1;
    return { width: image.width / scale, height: image.height / scale };
}

/** The tile of a picture drawn on its own, or in a cell, under `maxHeight`. */
function cellTile(image: MediaFlowImage, index: number, maxHeight: number): MediaFlowTile {
    const ratio = mediaFlowRatio(image);
    const native = mediaFlowPointSize(image)?.width ?? Number.POSITIVE_INFINITY;
    return {
        index,
        ratio,
        maxWidth: Math.min(native, Math.max(maxHeight * ratio, MEDIA_FLOW_MIN_WIDTH)),
    };
}

/**
 * An equal-column grid: the pictures in order, `columns` to a row. One column
 * is a stack of full-width pictures.
 */
export function mediaColumnsPlan(
    images: readonly MediaFlowImage[],
    columns: number,
    limits: MediaFlowLimits = TOOL_MEDIA_LIMITS,
): MediaFlowPlan {
    const maxHeight = columns === 1 ? limits.singleMaxHeight : limits.cellMaxHeight;
    const rows: MediaFlowRow[] = [];
    for (let start = 0; start < images.length; start += columns)
        rows.push({
            type: "cells",
            columns,
            maxHeight,
            tiles: images
                .slice(start, start + columns)
                .map((image, offset) => cellTile(image, start + offset, maxHeight)),
        });
    return { rows };
}

/**
 * Pictures the producer did not arrange: justified rows, chosen by linear
 * partition. A picture of extreme shape takes a row of its own; the runs
 * between them are each cut into the rows whose heights, at the reference
 * measure, land closest to the target in total squared error. A lone picture
 * is drawn on its own.
 */
export function mediaJustifiedPlan(
    images: readonly MediaFlowImage[],
    limits: MediaFlowLimits = TOOL_MEDIA_LIMITS,
): MediaFlowPlan {
    if (images.length === 1)
        return {
            rows: [
                {
                    type: "cells",
                    columns: 1,
                    maxHeight: limits.singleMaxHeight,
                    tiles: [cellTile(images[0]!, 0, limits.singleMaxHeight)],
                },
            ],
        };
    const rows: MediaFlowRow[] = [];
    let run: number[] = [];
    const flush = () => {
        for (const row of justifiedPartition(run.map((index) => mediaFlowRatio(images[index]!))))
            rows.push(
                justifiedRow(
                    images,
                    row.map((offset) => run[offset]!),
                    limits,
                ),
            );
        run = [];
    };
    images.forEach((image, index) => {
        const ratio = mediaFlowRatio(image);
        if (ratio <= EXTREME_WIDE && ratio >= EXTREME_NARROW) {
            run.push(index);
            return;
        }
        flush();
        rows.push({
            type: "cells",
            columns: 1,
            maxHeight: limits.singleMaxHeight,
            tiles: [cellTile(image, index, limits.singleMaxHeight)],
        });
    });
    flush();
    return { rows };
}

/** One justified row, capped so no picture is drawn past its own point size. */
function justifiedRow(
    images: readonly MediaFlowImage[],
    indexes: readonly number[],
    limits: MediaFlowLimits,
): MediaFlowRow {
    let maxHeight = limits.rowMaxHeight;
    for (const index of indexes) {
        const point = mediaFlowPointSize(images[index]!);
        if (point) maxHeight = Math.min(maxHeight, point.height);
    }
    return {
        type: "justified",
        maxHeight,
        tiles: indexes.map((index) => {
            const ratio = mediaFlowRatio(images[index]!);
            return { index, ratio, maxWidth: maxHeight * ratio };
        }),
    };
}

/**
 * The cut of `ratios`, in order, into rows of at most `JUSTIFIED_MAX_PER_ROW`
 * that minimises the summed squared distance of each row's fill height from
 * the target. Dynamic programming over the end of the last row: exact, and
 * quadratic in a count the protocol bounds at ten.
 */
function justifiedPartition(ratios: readonly number[]): number[][] {
    const count = ratios.length;
    if (count === 0) return [];
    const best: number[] = [0];
    const cut: number[] = [0];
    for (let end = 1; end <= count; end += 1) {
        best[end] = Number.POSITIVE_INFINITY;
        let sum = 0;
        for (let start = end - 1; start >= Math.max(0, end - JUSTIFIED_MAX_PER_ROW); start -= 1) {
            sum += ratios[start]!;
            const size = end - start;
            const height = (JUSTIFIED_REFERENCE_WIDTH - (size - 1) * MEDIA_FLOW_GAP) / sum;
            const cost = best[start]! + (height - JUSTIFIED_TARGET_HEIGHT) ** 2;
            if (cost < best[end]!) {
                best[end] = cost;
                cut[end] = start;
            }
        }
    }
    const rows: number[][] = [];
    for (let end = count; end > 0; end = cut[end]!)
        rows.unshift(Array.from({ length: end - cut[end]! }, (_, offset) => cut[end]! + offset));
    return rows;
}

/**
 * The plan for one call's pictures: the grid its producer asked for, or
 * justified rows when it asked for none. A tree is not a flow; it is laid out
 * by `MediaTree` and has no plan.
 */
export function conversationMediaPlan(
    images: readonly MediaFlowImage[],
    layout: ConversationMediaLayout | undefined,
): MediaFlowPlan {
    return layout?.type === "columns"
        ? mediaColumnsPlan(images, layout.columns)
        : mediaJustifiedPlan(images);
}

/**
 * Every tile's box with the plan drawn at `measure`: the same arithmetic the
 * browser runs on `MediaFlow`'s flexbox.
 */
export function mediaFlowGeometry(plan: MediaFlowPlan, measure: number): MediaFlowGeometry {
    const tiles: MediaFlowBox[] = [];
    let y = 0;
    for (const [rowIndex, row] of plan.rows.entries()) {
        if (rowIndex > 0) y += MEDIA_FLOW_GAP;
        let rowHeight = 0;
        if (row.type === "cells") {
            const column = (measure - (row.columns - 1) * MEDIA_FLOW_GAP) / row.columns;
            for (const [cell, tile] of row.tiles.entries()) {
                const width = Math.min(column, tile.maxWidth);
                const height = Math.min(width / tile.ratio, row.maxHeight);
                tiles.push({
                    index: tile.index,
                    x: cell * (column + MEDIA_FLOW_GAP),
                    y,
                    width,
                    height,
                });
                rowHeight = Math.max(rowHeight, height);
            }
        } else {
            const free = measure - (row.tiles.length - 1) * MEDIA_FLOW_GAP;
            const sum = row.tiles.reduce((total, tile) => total + tile.ratio, 0);
            rowHeight = Math.min(free / sum, row.maxHeight);
            let x = 0;
            for (const tile of row.tiles) {
                const width = rowHeight * tile.ratio;
                tiles.push({ index: tile.index, x, y, width, height: rowHeight });
                x += width + MEDIA_FLOW_GAP;
            }
        }
        y += rowHeight;
    }
    return { height: y, tiles };
}

/** The plan's painted height at `measure`. */
export function mediaFlowHeight(plan: MediaFlowPlan, measure: number): number {
    return mediaFlowGeometry(plan, measure).height;
}
