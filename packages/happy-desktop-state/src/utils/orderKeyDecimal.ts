const ORDER_DIGITS = "0123456789";

/**
 * The key between two decimal fractional order keys, compared with plain
 * string comparison; `null` means either end of the range.
 *
 * This is Happy Agent's own `orderKeyBetween`, ported unchanged, so a key the
 * client mints optimistically for a move is exactly the key the daemon mints
 * for the same neighbours, and confirming the move changes nothing on screen.
 * It is a different format from the base-62 keys in `fractionalIndexing.ts`:
 * the daemon's catalogs (Surfaces, todos, tasks, bots) all use this one.
 */
export function orderKeyDecimalBetween(before: string | null, after: string | null): string {
    const lower = before ?? "";
    if (after !== null && lower >= after) throw new Error("Order keys are out of order.");
    let prefix = "";
    for (let index = 0; ; index += 1) {
        const low = index < lower.length ? lower.charCodeAt(index) - 48 : 0;
        const high = after !== null && index < after.length ? after.charCodeAt(index) - 48 : 10;
        if (high - low > 1) return `${prefix}${ORDER_DIGITS[low + Math.floor((high - low) / 2)]!}`;
        if (high - low === 1)
            return `${prefix}${ORDER_DIGITS[low]!}${orderKeyAbove(lower.slice(index + 1))}`;
        prefix += ORDER_DIGITS[low]!;
    }
}

/**
 * A key that sorts before `first` in plain code-unit order, whichever host
 * minted it, for a row placed at the top of a list ahead of the host's answer.
 *
 * Ahead of a Happy Agent's decimal key it is the key that daemon mints there,
 * so its answer changes nothing. A Happy Cloud server mints base-62 keys (`a0`,
 * `Zz`), where the decimal port reads letters as digits past nine and returns
 * `"undefined"`, which sorts the row last; ahead of one of those it is the
 * first character lowered by one, a placeholder the server's own key replaces.
 */
export function orderKeyBefore(first: string | null): string {
    if (first === null || /^[0-9]+$/u.test(first)) return orderKeyDecimalBetween(null, first);
    const head = first.charCodeAt(0);
    return Number.isNaN(head) || head === 0 ? "" : String.fromCharCode(head - 1);
}

function orderKeyAbove(rest: string): string {
    let prefix = "";
    for (let index = 0; ; index += 1) {
        const digit = index < rest.length ? rest.charCodeAt(index) - 48 : 0;
        if (digit < 9) return `${prefix}${ORDER_DIGITS[digit + Math.floor((10 - digit) / 2)]!}`;
        prefix += "9";
    }
}

/** Plain code-unit order, never locale collation: order keys and IDs are compared this way. */
export function stringCompare(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}
