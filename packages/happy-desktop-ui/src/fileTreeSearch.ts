/**
 * Matching a typed query against a path, for a listing that is already whole in
 * memory and can answer for itself.
 *
 * Subsequence rather than substring, because that is what the checkout's own
 * ranked search does and a reader should not have to know which listing they
 * are typing into. `wsps` finds `workspaceStore.ts`, and `state/ws` finds
 * `sources/state/workspaceStore.ts`, which is how anyone who has used a
 * go-to-file field expects to reach a path without typing all of it.
 *
 * Ranking is deliberately absent. A whole-checkout search has thousands of
 * candidates and has to say which few matter; a list of changed files has a
 * handful, and reordering them by match quality would move rows around under
 * the reader for no gain over simply hiding the ones that do not match.
 */
export function filePathMatches(path: string, query: string): boolean {
    if (query === "") return true;
    const haystack = path.toLowerCase();
    const needle = query.toLowerCase();
    let at = 0;
    for (const character of needle) {
        // Spaces separate what the reader typed rather than being part of it,
        // so "ws store" reads as two things to find in order.
        if (character === " ") continue;
        const found = haystack.indexOf(character, at);
        if (found === -1) return false;
        at = found + 1;
    }
    return true;
}
