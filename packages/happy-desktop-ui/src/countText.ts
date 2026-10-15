/**
 * A count as it is read in a dense row: exact while it is small enough to read
 * as a number, abbreviated once it is only a magnitude.
 *
 * `842` → `842`, `1200` → `1.2k`, `4238` → `4.2k`, `4038` → `4k`,
 * `5300` → `5k`, `12800` → `13k`
 *
 * The tenth is only worth its width while the leading digit is small, and only
 * while it says something: a tenth of nothing is dropped rather than printed as
 * `4.0k`. Once the count is into the thousands several times over it is a
 * magnitude rather than a number anyone will hold precisely, so from 5k up it
 * rounds to whole thousands and the column stops growing.
 *
 * The input is a count of lines or files, so it is expected to be a
 * non-negative integer; anything else is rounded and floored into one rather
 * than printed as `-1` or `4.5` in the middle of a row.
 *
 * This is display text, and it is deliberately lossy. Where the exact number is
 * part of what is being said — a diff stat, which is read down a column and
 * compared — the abbreviation is hidden from the accessibility tree and the
 * count is spoken in full instead; see `changeCountLabel`. Where the number is
 * only the size of a listing, the magnitude is the whole fact and the
 * abbreviation stands on its own.
 */
export function compactCount(value: number): string {
    const count = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
    if (count < 1_000) return String(count);
    if (count < 5_000) {
        // Rounded to a tenth. 4950 and up round to `5k`, which is written the
        // way every other whole thousand is rather than as `5.0k`.
        const thousands = Math.round(count / 100) / 10;
        return `${String(thousands)}k`;
    }
    return `${String(Math.round(count / 1_000))}k`;
}

/**
 * What a diff stat is called when it is being read out rather than looked at:
 * the exact counts, in words, with the side that changed nothing left unsaid.
 *
 * Every surface that prints an abbreviated stat renders this beside it in a
 * visually hidden span and hides the abbreviation from the accessibility tree.
 * That way round rather than an `aria-label` on the visible element, because
 * the element carrying these numbers is an ordinary `span`: its implicit role
 * is `generic`, which prohibits an author name, so a label there is free to be
 * dropped and the reader would be told "plus four point two k" instead.
 */
export function changeCountLabel(added: number, deleted: number): string {
    const lines = (count: number) => `${String(count)} ${count === 1 ? "line" : "lines"}`;
    return [
        added > 0 ? `${lines(added)} added` : undefined,
        deleted > 0 ? `${lines(deleted)} deleted` : undefined,
    ]
        .filter(Boolean)
        .join(", ");
}
