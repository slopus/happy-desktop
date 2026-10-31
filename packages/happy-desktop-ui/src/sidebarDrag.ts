/** Pointer travel, in px, before a press becomes a drag instead of a selection. */
export const SIDEBAR_DRAG_THRESHOLD = 4;

/**
 * How long a drop holds the geometry it captured while it waits for the render
 * that rearranges the rows. Long enough for a reorder to come back through the
 * store, short enough that a move which never lands lets the row go rather than
 * leaving it lit and replaying it much later from coordinates that have expired.
 */
export const SIDEBAR_SETTLE_WAIT_MS = 500;

/** The landing slot nearest the pointer, both read in one coordinate space. */
export function sidebarDropSlotNearest<Slot extends { readonly y: number }>(
    slots: readonly Slot[],
    y: number,
): Slot | undefined {
    let best: Slot | undefined;
    for (const slot of slots)
        if (best === undefined || Math.abs(slot.y - y) < Math.abs(best.y - y)) best = slot;
    return best;
}
