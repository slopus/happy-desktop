/**
 * The longest common subsequence of two key sequences, found with Myers'
 * O(ND) algorithm in its linear-space form: each step finds the middle snake
 * of the remaining edit script and recurses on either side of it, so memory
 * stays proportional to the inputs however different they are.
 *
 * Returns the matched index pairs in order. Everything not matched is a
 * deletion from `before` or an insertion into `after`.
 */
export function sequenceDiffMatches(
    before: readonly string[],
    after: readonly string[],
): readonly (readonly [number, number])[] {
    // Interned keys compare as integers in the hot loops.
    const ids = new Map<string, number>();
    const intern = (key: string) => {
        let id = ids.get(key);
        if (id === undefined) {
            id = ids.size;
            ids.set(key, id);
        }
        return id;
    };
    const a = Int32Array.from(before, intern);
    const b = Int32Array.from(after, intern);
    const matches: [number, number][] = [];
    diffRange(a, b, 0, a.length, 0, b.length, matches);
    return matches;
}

function diffRange(
    a: Int32Array,
    b: Int32Array,
    aStart: number,
    aEnd: number,
    bStart: number,
    bEnd: number,
    matches: [number, number][],
): void {
    while (aStart < aEnd && bStart < bEnd && a[aStart] === b[bStart]) {
        matches.push([aStart, bStart]);
        aStart += 1;
        bStart += 1;
    }
    let suffix = 0;
    while (
        aEnd - suffix > aStart &&
        bEnd - suffix > bStart &&
        a[aEnd - suffix - 1] === b[bEnd - suffix - 1]
    )
        suffix += 1;
    aEnd -= suffix;
    bEnd -= suffix;
    if (aStart < aEnd && bStart < bEnd) {
        // With the common prefix and suffix gone, both ends differ, so a split
        // point on an optimal path always leaves two strictly smaller problems.
        const split = bisect(a, b, aStart, aEnd, bStart, bEnd);
        if (split !== undefined) {
            diffRange(a, b, aStart, aStart + split[0], bStart, bStart + split[1], matches);
            diffRange(a, b, aStart + split[0], aEnd, bStart + split[1], bEnd, matches);
        }
    }
    for (let offset = suffix; offset > 0; offset -= 1)
        matches.push([aEnd + suffix - offset, bEnd + suffix - offset]);
}

/**
 * A point, relative to the range, where the forward and backward searches of
 * an optimal edit script meet — or `undefined` when the two sides share
 * nothing. This is the bounded bisection diff-match-patch uses: a diagonal
 * that runs off either side of the grid stops being explored.
 */
function bisect(
    a: Int32Array,
    b: Int32Array,
    aStart: number,
    aEnd: number,
    bStart: number,
    bEnd: number,
): readonly [number, number] | undefined {
    const n = aEnd - aStart;
    const m = bEnd - bStart;
    const maxD = Math.ceil((n + m) / 2);
    const offset = maxD;
    const length = 2 * maxD + 2;
    // The furthest x reached on each diagonal, forward from the start and
    // backward from the end; -1 where a diagonal has not been reached.
    const forward = new Int32Array(length).fill(-1);
    const backward = new Int32Array(length).fill(-1);
    forward[offset + 1] = 0;
    backward[offset + 1] = 0;
    const delta = n - m;
    // With an odd delta the forward search reaches the overlap first.
    const front = delta % 2 !== 0;
    let k1Start = 0;
    let k1End = 0;
    let k2Start = 0;
    let k2End = 0;
    for (let d = 0; d < maxD; d += 1) {
        for (let k1 = -d + k1Start; k1 <= d - k1End; k1 += 2) {
            const k1Offset = offset + k1;
            let x1 =
                k1 === -d || (k1 !== d && forward[k1Offset - 1]! < forward[k1Offset + 1]!)
                    ? forward[k1Offset + 1]!
                    : forward[k1Offset - 1]! + 1;
            let y1 = x1 - k1;
            while (x1 < n && y1 < m && a[aStart + x1] === b[bStart + y1]) {
                x1 += 1;
                y1 += 1;
            }
            forward[k1Offset] = x1;
            if (x1 > n) k1End += 2;
            else if (y1 > m) k1Start += 2;
            else if (front) {
                const k2Offset = offset + delta - k1;
                if (k2Offset >= 0 && k2Offset < length && backward[k2Offset] !== -1) {
                    if (x1 >= n - backward[k2Offset]!) return [x1, y1];
                }
            }
        }
        for (let k2 = -d + k2Start; k2 <= d - k2End; k2 += 2) {
            const k2Offset = offset + k2;
            let x2 =
                k2 === -d || (k2 !== d && backward[k2Offset - 1]! < backward[k2Offset + 1]!)
                    ? backward[k2Offset + 1]!
                    : backward[k2Offset - 1]! + 1;
            let y2 = x2 - k2;
            while (x2 < n && y2 < m && a[aEnd - 1 - x2] === b[bEnd - 1 - y2]) {
                x2 += 1;
                y2 += 1;
            }
            backward[k2Offset] = x2;
            if (x2 > n) k2End += 2;
            else if (y2 > m) k2Start += 2;
            else if (!front) {
                const k1Offset = offset + delta - k2;
                if (k1Offset >= 0 && k1Offset < length && forward[k1Offset] !== -1) {
                    const x1 = forward[k1Offset]!;
                    const y1 = offset + x1 - k1Offset;
                    if (x1 >= n - x2) return [x1, y1];
                }
            }
        }
    }
    return undefined;
}

/** One step of an edit script: an element kept on both sides, or one side's alone. */
export type SequenceDiffOperation =
    | { readonly kind: "equal"; readonly before: number; readonly after: number }
    | { readonly kind: "delete"; readonly before: number }
    | { readonly kind: "insert"; readonly after: number };

/**
 * The edit script turning `before` into `after`, in reading order. Between two
 * kept elements, deletions come before insertions, so a replaced run reads as
 * the old words and then the new ones.
 */
export function sequenceDiff(
    before: readonly string[],
    after: readonly string[],
): readonly SequenceDiffOperation[] {
    const operations: SequenceDiffOperation[] = [];
    let i = 0;
    let j = 0;
    const flush = (untilBefore: number, untilAfter: number) => {
        for (; i < untilBefore; i += 1) operations.push({ kind: "delete", before: i });
        for (; j < untilAfter; j += 1) operations.push({ kind: "insert", after: j });
    };
    for (const [matchBefore, matchAfter] of sequenceDiffMatches(before, after)) {
        flush(matchBefore, matchAfter);
        operations.push({ kind: "equal", before: i, after: j });
        i += 1;
        j += 1;
    }
    flush(before.length, after.length);
    return operations;
}
