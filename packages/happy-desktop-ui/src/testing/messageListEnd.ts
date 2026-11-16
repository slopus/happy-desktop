/**
 * Where a message list's end sits against its scrollport, read from what is
 * drawn. `scrollHeight - clientHeight - scrollTop` cannot tell a transcript
 * whose last row rests on the lower edge from one held above blank space the
 * scroll range also counts, so nothing here reads the scroll range.
 */

/** The clearance (px) `ConversationView` leaves under a transcript's last row. */
export const CONVERSATION_END_PADDING = 24;

function rowsOf(viewport: HTMLElement) {
    return [...viewport.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row")];
}

/**
 * The distance (px) from the bottom of the lowest row drawn to the scrollport's
 * lower edge. At the end of a transcript it is the list's end padding; more
 * than that is blank under the last row, and less (or negative) means rows
 * continue below the fold.
 */
export function messageListEndClearance(viewport: HTMLElement): number {
    const rows = rowsOf(viewport);
    if (rows.length === 0) throw new Error("The message list has drawn no rows.");
    return (
        viewport.getBoundingClientRect().bottom -
        Math.max(...rows.map((row) => row.getBoundingClientRect().bottom))
    );
}

/**
 * How far (px) the transcript's end is from resting on the scrollport's lower
 * edge with exactly `padding` under its last row: positive is blank below the
 * end, negative is content left below the fold.
 */
export function messageListEndOffset(
    viewport: HTMLElement,
    padding = CONVERSATION_END_PADDING,
): number {
    return messageListEndClearance(viewport) - padding;
}
