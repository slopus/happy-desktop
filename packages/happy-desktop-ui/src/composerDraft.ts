import { parseHappyLinks } from "happy-desktop-state";

/**
 * One mention in the draft the reader sees: `[start, end)` of its text reads
 * `@Name`, and `source` is the Markdown it is sent and saved as, such as
 * `[Name](happy://users/…)`. The source carries the identity, so two
 * teammates with the same name stay two different people.
 */
export interface ComposerTag {
    readonly start: number;
    readonly end: number;
    readonly source: string;
}

/** A draft as the textarea shows it: the words, and where its mentions sit in them. */
export interface ComposerDraft {
    readonly text: string;
    /** In order, never overlapping. */
    readonly tags: readonly ComposerTag[];
}

/** A Markdown label read as the words it shows. */
function labelWords(label: string): string {
    return label
        .replace(/\s+/gu, " ")
        .trim()
        .replace(/\\([!-/:-@[-`{-~])/gu, "$1");
}

/**
 * The draft a stored Markdown value reads as: every `happy://` or
 * `happy-file://` link with a label becomes `@label`, everything else stays
 * exactly as written, so `composerDraftMarkdown` gives the same Markdown back.
 */
export function composerDraftParse(markdown: string): ComposerDraft {
    // Most drafts name nothing; they need no parse at all.
    if (!markdown.includes("](happy")) return { text: markdown, tags: [] };
    let text = "";
    const tags: ComposerTag[] = [];
    for (const segment of parseHappyLinks(markdown)) {
        if (segment.type === "text") {
            text += segment.text;
            continue;
        }
        const name = labelWords(segment.label).replace(/^@/u, "");
        if (
            segment.syntax !== "link" ||
            segment.image ||
            segment.link === undefined ||
            name.length === 0
        ) {
            text += segment.source;
            continue;
        }
        const shown = `@${name}`;
        tags.push({ start: text.length, end: text.length + shown.length, source: segment.source });
        text += shown;
    }
    return { text, tags };
}

/** The Markdown a draft is sent and saved as: each mention written as its source. */
export function composerDraftMarkdown(draft: ComposerDraft): string {
    if (draft.tags.length === 0) return draft.text;
    let markdown = "";
    let at = 0;
    for (const tag of draft.tags) {
        markdown += draft.text.slice(at, tag.start) + tag.source;
        at = tag.end;
    }
    return markdown + draft.text.slice(at);
}

/** The mention whose text holds `position`, counting its end but not its start. */
export function composerTagBefore(draft: ComposerDraft, position: number): ComposerTag | undefined {
    return draft.tags.find((tag) => tag.start < position && position <= tag.end);
}

/** The mention whose text holds `position`, counting its start but not its end. */
export function composerTagAfter(draft: ComposerDraft, position: number): ComposerTag | undefined {
    return draft.tags.find((tag) => tag.start <= position && position < tag.end);
}

/**
 * A range widened to take in every mention it cuts into, so deleting it never
 * leaves half a name behind.
 */
export function composerTagsCovered(
    draft: ComposerDraft,
    start: number,
    end: number,
): { readonly start: number; readonly end: number } {
    let from = start;
    let to = end;
    for (const tag of draft.tags) {
        if (tag.end <= start || tag.start >= end) continue;
        from = Math.min(from, tag.start);
        to = Math.max(to, tag.end);
    }
    return { start: from, end: to };
}

const WORD = /[\p{L}\p{N}_]/u;

/**
 * The draft after its text changed to `text`, by typing, pasting, deleting,
 * undoing, or anything else the textarea did.
 *
 * The change is found as the one run that differs between the two texts,
 * ending at `caret` when it is known: without it, typing a letter that repeats
 * the one beside it could be read as typed one place earlier. Mentions before
 * the change stay, mentions after it move with it, and a mention the change
 * cut into is plain text from then on. Where the inserted text touches an
 * `@Name` that `recall` knows — one just deleted, coming back with undo, or
 * one copied from elsewhere in the draft — it is a mention again. The composer
 * passes `recall` only for undo, redo, paste, and drop: a name typed out by
 * hand stays the words it was typed as.
 */
export function composerDraftEdit(
    previous: ComposerDraft,
    text: string,
    options: {
        readonly caret?: number;
        /** The source of each `@Name` that reads as a mention when it comes back. */
        readonly recall?: ReadonlyMap<string, string>;
    } = {},
): { readonly draft: ComposerDraft; readonly dropped: readonly ComposerTag[] } {
    const old = previous.text;
    if (text === old) return { draft: previous, dropped: [] };
    const limit = Math.min(old.length, text.length);
    const suffixLimit =
        options.caret === undefined ? limit : Math.min(limit, text.length - options.caret);
    let suffix = 0;
    while (
        suffix < suffixLimit &&
        old.charCodeAt(old.length - 1 - suffix) === text.charCodeAt(text.length - 1 - suffix)
    )
        suffix++;
    let prefix = 0;
    while (prefix < limit - suffix && old.charCodeAt(prefix) === text.charCodeAt(prefix)) prefix++;
    const removedEnd = old.length - suffix;
    const insertedEnd = text.length - suffix;
    const shift = text.length - old.length;
    const tags: ComposerTag[] = [];
    const dropped: ComposerTag[] = [];
    let moved = false;
    for (const tag of previous.tags) {
        if (tag.end <= prefix) tags.push(tag);
        else if (tag.start >= removedEnd) {
            tags.push({ start: tag.start + shift, end: tag.end + shift, source: tag.source });
            moved ||= shift !== 0;
        } else dropped.push(tag);
    }
    const recall = options.recall;
    if (recall !== undefined && recall.size > 0 && insertedEnd > prefix) {
        // Longest first, so `@Bob Martin` is found before `@Bob`.
        const shownByLength = [...recall.keys()].sort((a, b) => b.length - a.length);
        // A name the inserted text touches, wherever it starts: redo puts back
        // a picked mention as only the letters past the `@Bo` it replaced.
        const found: ComposerTag[] = [];
        let at = text.indexOf("@", Math.max(0, prefix - shownByLength[0]!.length));
        while (at !== -1 && at < insertedEnd) {
            let end = -1;
            if (at === 0 || !WORD.test(text[at - 1]!))
                for (const shown of shownByLength) {
                    const candidateEnd = at + shown.length;
                    if (candidateEnd <= prefix || !text.startsWith(shown, at)) continue;
                    const after = text[candidateEnd];
                    if (after !== undefined && WORD.test(after)) continue;
                    if (tags.some((tag) => tag.start < candidateEnd && at < tag.end)) continue;
                    found.push({ start: at, end: candidateEnd, source: recall.get(shown)! });
                    end = candidateEnd;
                    break;
                }
            at = text.indexOf("@", end === -1 ? at + 1 : end);
        }
        if (found.length > 0) {
            tags.push(...found);
            tags.sort((a, b) => a.start - b.start);
            moved = true;
        }
    }
    // Typing past every mention leaves them where they were, and the same list
    // says so to whatever draws them.
    const unchanged = !moved && dropped.length === 0;
    return { draft: { text, tags: unchanged ? previous.tags : tags }, dropped };
}

/**
 * The draft with `[start, end)` of its text replaced by `insert`: what the
 * composer itself writes, a picked mention or an emoji. Mentions the range
 * cut into are dropped; `tag`, given, covers the start of what was inserted.
 */
export function composerDraftReplace(
    previous: ComposerDraft,
    start: number,
    end: number,
    insert: string,
    tag?: { readonly length: number; readonly source: string },
): ComposerDraft {
    const shift = insert.length - (end - start);
    const tags: ComposerTag[] = [];
    for (const kept of previous.tags) {
        if (kept.end <= start) tags.push(kept);
        else if (kept.start >= end)
            tags.push({ start: kept.start + shift, end: kept.end + shift, source: kept.source });
    }
    if (tag !== undefined) {
        tags.push({ start, end: start + tag.length, source: tag.source });
        tags.sort((a, b) => a.start - b.start);
    }
    return {
        text: previous.text.slice(0, start) + insert + previous.text.slice(end),
        tags,
    };
}
