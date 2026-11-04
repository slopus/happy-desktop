/** Where one mention sits in a draft, as UTF-16 offsets: `[start, end)`. */
export interface ComposerMentionRange {
    readonly start: number;
    readonly end: number;
}

const WORD = /[\p{L}\p{N}_]/u;

/**
 * Finds every `@Name` in a draft whose name is one of `names`, longest name
 * first so `@Bob Martin` wins over `@Bob`. A mention starts the draft or
 * follows something that is not part of a word, and ends where a word does,
 * so `alice@Bob` and `@Bobby` are not mentions of Bob.
 *
 * One pass over the `@` signs, each tried against the names: the cost is the
 * number of `@` signs times the number of names, not the length of the draft.
 */
export function composerMentionRanges(
    text: string,
    names: readonly string[],
): readonly ComposerMentionRange[] {
    if (names.length === 0) return [];
    const sorted = [...names].sort((a, b) => b.length - a.length);
    const ranges: ComposerMentionRange[] = [];
    let at = text.indexOf("@");
    while (at !== -1) {
        let end = -1;
        if (at === 0 || !WORD.test(text[at - 1]!)) {
            for (const name of sorted) {
                if (name.length === 0 || !text.startsWith(name, at + 1)) continue;
                const after = text[at + 1 + name.length];
                if (after !== undefined && WORD.test(after)) continue;
                end = at + 1 + name.length;
                break;
            }
        }
        if (end !== -1) ranges.push({ start: at, end });
        at = text.indexOf("@", end === -1 ? at + 1 : end);
    }
    return ranges;
}
