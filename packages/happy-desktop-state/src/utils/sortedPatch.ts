/**
 * `after` sorted by `compare`, worked out from `sorted` — the same sort of `before` — by
 * moving only the rows that changed between `before` and `after`.
 *
 * A row is matched by identity: one replaced in place is taken out where its old
 * version sat and put back where its new one belongs, each by binary search, and a
 * row added or dropped is put in or taken out the same way. The answer is exactly
 * the stable sort of `after`; whenever a row would land beside one it compares
 * equal to, where only the order of `after` could settle it, or when so much changed
 * that moving rows one by one would cost more, `after` is simply sorted again.
 */
export function sortedPatch<T>(
    sorted: readonly T[],
    before: readonly T[],
    after: readonly T[],
    compare: (left: T, right: T) => number,
): readonly T[] {
    return sortedPatchMapped(sorted, sorted, before, after, compare, identity).sorted;
}

/**
 * `sortedPatch`, carrying `mapped` — `sorted` with `map` applied to each row —
 * along, so a list drawn from the sorted rows moves with them instead of being
 * mapped again.
 */
export function sortedPatchMapped<T, U>(
    sorted: readonly T[],
    mapped: readonly U[],
    before: readonly T[],
    after: readonly T[],
    compare: (left: T, right: T) => number,
    map: (row: T) => U,
): { readonly sorted: readonly T[]; readonly mapped: readonly U[] } {
    const unchanged = { sorted, mapped };
    if (before === after) return unchanged;
    const removed: T[] = [];
    const added: T[] = [];
    if (before.length === after.length) {
        for (let index = 0; index < after.length; index += 1) {
            const previous = before[index]!;
            const next = after[index]!;
            if (previous === next) continue;
            removed.push(previous);
            added.push(next);
        }
    }
    const resort = () => {
        const rows = [...after].sort(compare);
        return { sorted: rows, mapped: rows.map(map) };
    };
    if (before.length !== after.length) {
        const kept = new Set(after);
        const prior = new Set(before);
        // Rows in both lists must keep their order, or ties among them would
        // stay in the order `before` gave them.
        let next = 0;
        for (const row of before) {
            if (!kept.has(row)) {
                removed.push(row);
                continue;
            }
            while (!prior.has(after[next]!)) added.push(after[next++]!);
            if (after[next++] !== row) return resort();
        }
        for (; next < after.length; next += 1) added.push(after[next]!);
    }
    if (removed.length === 0 && added.length === 0) return unchanged;
    if (removed.length + added.length > 8 + sorted.length / 4) return resort();
    const rows = [...sorted];
    const drawn = [...mapped];
    for (const row of removed) {
        const at = rowFind(rows, row, compare);
        if (at === undefined) return resort();
        rows.splice(at, 1);
        drawn.splice(at, 1);
    }
    for (const row of added) {
        const at = rowPlace(rows, row, compare);
        if (at === undefined) return resort();
        rows.splice(at, 0, row);
        drawn.splice(at, 0, map(row));
    }
    return { sorted: rows, mapped: drawn };
}

function identity<T>(row: T): T {
    return row;
}

/** The first index whose row does not sort before `row`. */
function lowerBound<T>(rows: readonly T[], row: T, compare: (left: T, right: T) => number): number {
    let low = 0;
    let high = rows.length;
    while (low < high) {
        const middle = (low + high) >>> 1;
        if (compare(rows[middle]!, row) < 0) low = middle + 1;
        else high = middle;
    }
    return low;
}

/** Where `row` itself sits in `rows`. */
function rowFind<T>(
    rows: readonly T[],
    row: T,
    compare: (left: T, right: T) => number,
): number | undefined {
    for (let at = lowerBound(rows, row, compare); at < rows.length; at += 1) {
        if (rows[at] === row) return at;
        if (compare(rows[at]!, row) !== 0) return undefined;
    }
    return undefined;
}

/** Where `row` goes in `rows`, unless a row it compares equal to is already there. */
function rowPlace<T>(
    rows: readonly T[],
    row: T,
    compare: (left: T, right: T) => number,
): number | undefined {
    const at = lowerBound(rows, row, compare);
    if (at < rows.length && compare(rows[at]!, row) === 0) return undefined;
    return at;
}
