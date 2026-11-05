/**
 * One search answer drawn from two: what this window found at
 * keystroke speed among the snapshots it already holds, and what the Happy
 * Agent's search found, which arrives later and may be missing.
 *
 * Both are ranked best first and name each thing by its search key,
 * `<type>:<id>`, so the same chat, document, or file found by both is one
 * row. The order is the client's `fuseSearchResults`, the Reciprocal
 * Rank Fusion every platform shares; what is this window's own is only that
 * rows the reader has already looked at stay put.
 */
import { fuseSearchResults } from "@slopus/happy-agent-client";

/** One ranked thing, by its search key. */
export interface SearchEntry<Row> {
    readonly key: string;
    readonly row: Row;
}

/** One thing the Happy Agent found, at its 1-based place in its own answer. */
export interface SearchRemoteEntry<Row> extends SearchEntry<Row> {
    readonly rank: number;
}

/** Where one fused result's fields come from. */
export type SearchFrom = "local" | "remote";

/**
 * The fused order of two answers, each key once, saying which answer's
 * fields it carries: the Happy Agent's whenever it found the thing too.
 */
export function searchOrder(
    remote: readonly { readonly key: string; readonly rank: number }[],
    local: readonly { readonly key: string }[],
): { readonly key: string; readonly from: SearchFrom }[] {
    const remoteKeys = new Set(remote.map((entry) => entry.key));
    return fuseSearchResults(remote, local).map((entry) => ({
        key: entry.key,
        from: remoteKeys.has(entry.key) ? "remote" : "local",
    }));
}

export interface SearchFuseInput<Row> {
    /** This window's own answer, best first. */
    readonly local: readonly SearchEntry<Row>[];
    /** The Happy Agent's answer to the same query; absent until it arrives. */
    readonly remote?: readonly SearchRemoteEntry<Row>[];
    /**
     * The keys of the rows the reader has seen from the top through the
     * highlighted one, in the order shown. Those rows keep their places when
     * the other answer arrives; everything new goes below them.
     */
    readonly held: readonly string[];
    /** The one row for a thing both found: the local row, with what the Happy Agent says of it. */
    readonly merge: (local: Row, remote: Row) => Row;
}

/**
 * The rows the palette shows for one query.
 *
 * Until the Happy Agent answers, that is the local answer as it ranked
 * itself. Once it does, the two are fused, except that the rows the reader
 * has already seen down to the highlight stay where they were: with nothing
 * highlighted past the top, that is the top row. A thing both found is one
 * row, keyed as before, so the local row it was keeps its identity.
 */
export function searchFuse<Row>(input: SearchFuseInput<Row>): SearchEntry<Row>[] {
    const local = new Map<string, Row>();
    for (const entry of input.local) if (!local.has(entry.key)) local.set(entry.key, entry.row);
    const remote = new Map<string, Row>();
    for (const entry of input.remote ?? [])
        if (!remote.has(entry.key)) remote.set(entry.key, entry.row);
    const rowOf = (key: string): Row | undefined => {
        const mine = local.get(key);
        const theirs = remote.get(key);
        if (mine === undefined) return theirs;
        return theirs === undefined ? mine : input.merge(mine, theirs);
    };
    const order =
        input.remote === undefined
            ? [...local.keys()]
            : searchOrder(
                  input.remote,
                  [...local.keys()].map((key) => ({ key })),
              ).map((entry) => entry.key);
    const first = input.local[0]?.key;
    const held = input.held.length > 0 ? input.held : first === undefined ? [] : [first];
    const shown: SearchEntry<Row>[] = [];
    const placed = new Set<string>();
    const place = (key: string): void => {
        if (placed.has(key)) return;
        const row = rowOf(key);
        if (row === undefined) return;
        placed.add(key);
        shown.push({ key, row });
    };
    // A held row that neither answer still finds is gone, and the rows under it close up.
    for (const key of held) place(key);
    for (const key of order) place(key);
    return shown;
}
