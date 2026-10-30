import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { sequenceDiff, sequenceDiffMatches } from "./sequenceDiff";

/*
 * A Markdown diff compares what two documents render as, not their bytes.
 *
 * Both documents are parsed with the same remark/GFM syntax `MarkdownDocument`
 * renders with, and their blocks are aligned with a Myers diff over a
 * normalized key of each block: the key ignores source positions, how blank
 * lines spread a list, and runs of whitespace in prose, so reflowing a
 * paragraph or switching `*` for `-` changes nothing a reader sees and is not a
 * change. Blocks that fall between two aligned ones are paired by similarity
 * when they are the same kind of block, and a paired block is diffed inside:
 * prose word by word with its formatting kept, code line by line, lists by
 * item, tables by row and then cell, quotes by their own blocks. A block that
 * left one place and arrived unchanged at another is a move.
 */

const markdownDiffParser = unified().use(remarkParse).use(remarkGfm);

/** A parsed Markdown document, in the syntax tree the renderer shares. */
export type MarkdownDiffRoot = ReturnType<typeof markdownDiffParser.parse>;
type MarkdownNode = MarkdownDiffRoot["children"][number];
type MarkdownBlockquote = Extract<MarkdownNode, { type: "blockquote" }>;
/** A block a document, quote, or list item is made of. */
export type MarkdownDiffFlow = MarkdownBlockquote["children"][number];
type MarkdownParagraph = Extract<MarkdownDiffFlow, { type: "paragraph" }>;
type MarkdownHeading = Extract<MarkdownDiffFlow, { type: "heading" }>;
type MarkdownCode = Extract<MarkdownDiffFlow, { type: "code" }>;
type MarkdownList = Extract<MarkdownDiffFlow, { type: "list" }>;
type MarkdownListItem = MarkdownList["children"][number];
type MarkdownTable = Extract<MarkdownDiffFlow, { type: "table" }>;
type MarkdownTableRow = MarkdownTable["children"][number];
/** Inline Markdown content: text, emphasis, links, code spans, and the rest. */
export type MarkdownDiffPhrasing = MarkdownParagraph["children"][number];
export type MarkdownDiffHeadingDepth = MarkdownHeading["depth"];
export type MarkdownDiffTableAlign = MarkdownTable["align"];

/**
 * What happened to a block. `changed` is a block present on both sides whose
 * content differs; its parts carry their own statuses.
 */
export type MarkdownDiffStatus = "unchanged" | "added" | "removed" | "changed";

/** What happened to a run of inline content or a line of code. */
export type MarkdownDiffChange = "equal" | "inserted" | "deleted";

/**
 * A run of inline content that is the same on both sides, only in the new
 * document, or only in the old one. Its content keeps the formatting it had
 * there: a word inserted inside a link is a run whose content is that link.
 */
export type MarkdownDiffInlineRun = {
    readonly change: MarkdownDiffChange;
    readonly content: readonly MarkdownDiffPhrasing[];
};

/**
 * Whether an added or removed block is one half of a move: the same block
 * removed from one place and added at another. Always false otherwise.
 */
type MarkdownDiffEntry = {
    readonly status: MarkdownDiffStatus;
    readonly moved: boolean;
};

export type MarkdownDiffParagraph = MarkdownDiffEntry & {
    readonly type: "paragraph";
    readonly inline: readonly MarkdownDiffInlineRun[];
};

export type MarkdownDiffHeading = MarkdownDiffEntry & {
    readonly type: "heading";
    readonly depth: MarkdownDiffHeadingDepth;
    /** The level the heading had before; equal to `depth` unless it changed level. */
    readonly depthBefore: MarkdownDiffHeadingDepth;
    readonly inline: readonly MarkdownDiffInlineRun[];
};

/** One line of a fenced block, numbered on each side it appears on. */
export type MarkdownDiffCodeLine = {
    readonly change: MarkdownDiffChange;
    readonly text: string;
    readonly numberBefore: number | undefined;
    readonly numberAfter: number | undefined;
};

export type MarkdownDiffCode = MarkdownDiffEntry & {
    readonly type: "code";
    readonly lang: string | undefined;
    /** The fence's language before; equal to `lang` unless it changed. */
    readonly langBefore: string | undefined;
    readonly meta: string | undefined;
    readonly lines: readonly MarkdownDiffCodeLine[];
};

export type MarkdownDiffListItem = MarkdownDiffEntry & {
    /** A task item's box, `undefined` for an ordinary item. */
    readonly checked: boolean | undefined;
    readonly checkedBefore: boolean | undefined;
    readonly spread: boolean;
    readonly children: readonly MarkdownDiffBlock[];
};

export type MarkdownDiffList = MarkdownDiffEntry & {
    readonly type: "list";
    readonly ordered: boolean;
    /** The first number of an ordered list. */
    readonly start: number | undefined;
    readonly startBefore: number | undefined;
    readonly spread: boolean;
    readonly items: readonly MarkdownDiffListItem[];
};

export type MarkdownDiffTableCell = {
    readonly status: MarkdownDiffStatus;
    readonly inline: readonly MarkdownDiffInlineRun[];
};

export type MarkdownDiffTableRow = MarkdownDiffEntry & {
    readonly cells: readonly MarkdownDiffTableCell[];
};

export type MarkdownDiffTable = MarkdownDiffEntry & {
    readonly type: "table";
    readonly align: MarkdownDiffTableAlign;
    /** The header row first, then the body rows. */
    readonly rows: readonly MarkdownDiffTableRow[];
};

export type MarkdownDiffBlockquote = MarkdownDiffEntry & {
    readonly type: "blockquote";
    readonly children: readonly MarkdownDiffBlock[];
};

/**
 * A block with nothing inside it to compare — a rule, raw HTML, a link
 * definition, a footnote — so it is either unchanged, added, or removed.
 */
export type MarkdownDiffOpaque = MarkdownDiffEntry & {
    readonly type: "opaque";
    readonly node: MarkdownDiffFlow;
};

export type MarkdownDiffBlock =
    | MarkdownDiffParagraph
    | MarkdownDiffHeading
    | MarkdownDiffCode
    | MarkdownDiffList
    | MarkdownDiffTable
    | MarkdownDiffBlockquote
    | MarkdownDiffOpaque;

/** Two Markdown documents compared as rendered documents. */
export type MarkdownDiffModel = {
    /** Every block of both documents, in reading order. */
    readonly blocks: readonly MarkdownDiffBlock[];
    /** Whether the two documents render the same. */
    readonly identical: boolean;
};

/** Compares two Markdown documents by what they render as. */
export function markdownDiffCompute(before: string, after: string): MarkdownDiffModel {
    const blocks = blocksDiff(markdownFlow(before), markdownFlow(after));
    return { blocks, identical: blocks.every((block) => block.status === "unchanged") };
}

const FLOW_TYPES = new Set<string>([
    "blockquote",
    "code",
    "definition",
    "footnoteDefinition",
    "heading",
    "html",
    "list",
    "paragraph",
    "table",
    "thematicBreak",
]);

function flowIs(node: MarkdownNode): node is MarkdownDiffFlow {
    return FLOW_TYPES.has(node.type);
}

function markdownFlow(source: string): readonly MarkdownDiffFlow[] {
    return markdownDiffParser.parse(source).children.filter(flowIs);
}

// ---- Keys and similarity --------------------------------------------------

/**
 * A key that two nodes share exactly when they render the same. Source
 * positions, renderer data, and list spread are dropped; prose collapses its
 * whitespace; code ignores trailing whitespace, which a reader cannot see.
 */
function nodeKey(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(nodeKey).join(",")}]`;
    if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "~";
    const node = value as Readonly<Record<string, unknown>>;
    const fields: string[] = [];
    for (const name of Object.keys(node).sort()) {
        if (name === "position" || name === "data" || name === "spread") continue;
        const field = node[name];
        fields.push(
            `${name}:${nodeKey(name === "value" && typeof field === "string" ? valueNormalize(node["type"], field) : field)}`,
        );
    }
    return `{${fields.join(",")}}`;
}

function valueNormalize(type: unknown, value: string): string {
    if (type === "text") return value.replace(/\s+/gu, " ");
    if (type === "code") return codeLines(value).map(codeLineKey).join("\n");
    if (type === "html") return value.trim();
    return value;
}

function codeLines(value: string): string[] {
    return value.length === 0 ? [] : value.split("\n");
}

function codeLineKey(line: string): string {
    return line.trimEnd();
}

const WORD = /[\p{L}\p{N}_]+/gu;

/** The words a node shows, for judging whether two blocks are versions of each other. */
function nodeWords(node: unknown): string[] {
    const words: string[] = [];
    const collect = (value: unknown) => {
        if (Array.isArray(value)) {
            for (const item of value) collect(item);
            return;
        }
        if (value === null || typeof value !== "object") return;
        const record = value as Readonly<Record<string, unknown>>;
        for (const field of ["value", "alt"] as const) {
            const text = record[field];
            if (typeof text === "string") words.push(...(text.match(WORD) ?? []));
        }
        collect(record["children"]);
    };
    collect(node);
    return words;
}

/** Dice similarity of two word multisets: 1 when they share every word, 0 when none. */
function wordSimilarity(before: readonly string[], after: readonly string[]): number {
    if (before.length === 0 && after.length === 0) return 1;
    const counts = new Map<string, number>();
    for (const word of before) counts.set(word, (counts.get(word) ?? 0) + 1);
    let shared = 0;
    for (const word of after) {
        const count = counts.get(word) ?? 0;
        if (count > 0) {
            shared += 1;
            counts.set(word, count - 1);
        }
    }
    return (2 * shared) / (before.length + after.length);
}

/** How alike two blocks must be before one reads as an edit of the other. */
const PAIR_SIMILARITY = 0.4;

function similarity(before: unknown, after: unknown): number {
    return wordSimilarity(nodeWords(before), nodeWords(after));
}

function leafScore(before: unknown, after: unknown): number {
    const score = similarity(before, after);
    return score >= PAIR_SIMILARITY ? score : 0;
}

/**
 * How well a removed block pairs with an added one, from 0 (they are
 * unrelated) up. A paragraph or fence pairs only with a similar one. A
 * heading at the same level pairs even when renamed, since a section keeps its
 * place. A container pairs with any of its kind, preferring the most similar,
 * because its parts are compared one by one anyway.
 */
function blockScore(before: MarkdownDiffFlow, after: MarkdownDiffFlow): number {
    if (before.type === "paragraph" && after.type === "paragraph") return leafScore(before, after);
    if (before.type === "code" && after.type === "code") return leafScore(before, after);
    if (before.type === "heading" && after.type === "heading") {
        const score = leafScore(before, after);
        return score > 0 ? score : before.depth === after.depth ? 0.1 : 0;
    }
    if (before.type === "list" && after.type === "list")
        return before.ordered === after.ordered ? 0.5 + similarity(before, after) / 2 : 0;
    if (
        (before.type === "table" && after.type === "table") ||
        (before.type === "blockquote" && after.type === "blockquote")
    )
        return 0.5 + similarity(before, after) / 2;
    return 0;
}

// ---- Alignment ------------------------------------------------------------

type Aligned<T> =
    | { readonly kind: "equal"; readonly before: T; readonly after: T }
    | { readonly kind: "paired"; readonly before: T; readonly after: T }
    | { readonly kind: "removed"; readonly before: T; readonly moved: boolean }
    | { readonly kind: "added"; readonly after: T; readonly moved: boolean };

/** Above this many candidate pairs between two aligned blocks, the rest is left unpaired. */
const PAIRING_LIMIT = 250_000;

/**
 * Aligns two sequences: equal elements by a Myers diff of their keys, moves by
 * equal keys left over on both sides, and the remaining elements between two
 * aligned ones paired in order to maximize their total score.
 */
function sequenceAlign<T>(
    before: readonly T[],
    after: readonly T[],
    key: (node: T) => string,
    score: (before: T, after: T) => number,
): Aligned<T>[] {
    const beforeKeys = before.map(key);
    const afterKeys = after.map(key);
    const matches = sequenceDiffMatches(beforeKeys, afterKeys);
    const beforeMatched = new Set(matches.map(([index]) => index));
    const afterMatched = new Set(matches.map(([, index]) => index));
    const waiting = new Map<string, number[]>();
    for (let index = 0; index < before.length; index += 1) {
        if (beforeMatched.has(index)) continue;
        const queue = waiting.get(beforeKeys[index]!);
        if (queue) queue.push(index);
        else waiting.set(beforeKeys[index]!, [index]);
    }
    const beforeMoved = new Set<number>();
    const afterMoved = new Set<number>();
    for (let index = 0; index < after.length; index += 1) {
        if (afterMatched.has(index)) continue;
        const source = waiting.get(afterKeys[index]!)?.shift();
        if (source === undefined) continue;
        beforeMoved.add(source);
        afterMoved.add(index);
    }

    const aligned: Aligned<T>[] = [];
    let beforeAt = 0;
    let afterAt = 0;
    const gap = (beforeEnd: number, afterEnd: number) => {
        const beforeFree: number[] = [];
        const afterFree: number[] = [];
        for (let index = beforeAt; index < beforeEnd; index += 1)
            if (!beforeMoved.has(index)) beforeFree.push(index);
        for (let index = afterAt; index < afterEnd; index += 1)
            if (!afterMoved.has(index)) afterFree.push(index);
        const pairs = gapPairs(beforeFree, afterFree, (b, a) => score(before[b]!, after[a]!));
        const emitUntil = (beforeUntil: number, afterUntil: number) => {
            for (; beforeAt < beforeUntil; beforeAt += 1)
                aligned.push({
                    kind: "removed",
                    before: before[beforeAt]!,
                    moved: beforeMoved.has(beforeAt),
                });
            for (; afterAt < afterUntil; afterAt += 1)
                aligned.push({
                    kind: "added",
                    after: after[afterAt]!,
                    moved: afterMoved.has(afterAt),
                });
        };
        for (const [b, a] of pairs) {
            emitUntil(b, a);
            aligned.push({ kind: "paired", before: before[b]!, after: after[a]! });
            beforeAt = b + 1;
            afterAt = a + 1;
        }
        emitUntil(beforeEnd, afterEnd);
    };
    for (const [b, a] of matches) {
        gap(b, a);
        aligned.push({ kind: "equal", before: before[b]!, after: after[a]! });
        beforeAt = b + 1;
        afterAt = a + 1;
    }
    gap(before.length, after.length);
    return aligned;
}

/**
 * The order-preserving pairing of two index lists with the greatest total
 * score, where a score of zero forbids the pair.
 */
function gapPairs(
    before: readonly number[],
    after: readonly number[],
    score: (before: number, after: number) => number,
): (readonly [number, number])[] {
    const rows = before.length;
    const columns = after.length;
    if (rows === 0 || columns === 0 || rows * columns > PAIRING_LIMIT) return [];
    const scores = new Float64Array(rows * columns);
    for (let i = 0; i < rows; i += 1)
        for (let j = 0; j < columns; j += 1) scores[i * columns + j] = score(before[i]!, after[j]!);
    // best[i][j]: the best total pairing the first i with the first j.
    const width = columns + 1;
    const best = new Float64Array((rows + 1) * width);
    for (let i = 1; i <= rows; i += 1)
        for (let j = 1; j <= columns; j += 1) {
            const pair = scores[(i - 1) * columns + (j - 1)]!;
            best[i * width + j] = Math.max(
                best[(i - 1) * width + j]!,
                best[i * width + (j - 1)]!,
                pair > 0 ? best[(i - 1) * width + (j - 1)]! + pair : 0,
            );
        }
    const pairs: [number, number][] = [];
    let i = rows;
    let j = columns;
    while (i > 0 && j > 0) {
        const here = best[i * width + j]!;
        if (here === best[(i - 1) * width + j]) i -= 1;
        else if (here === best[i * width + (j - 1)]) j -= 1;
        else {
            pairs.push([before[i - 1]!, after[j - 1]!]);
            i -= 1;
            j -= 1;
        }
    }
    return pairs.reverse();
}

// ---- Blocks ---------------------------------------------------------------

function blocksDiff(
    before: readonly MarkdownDiffFlow[],
    after: readonly MarkdownDiffFlow[],
): MarkdownDiffBlock[] {
    return sequenceAlign(before, after, nodeKey, blockScore).flatMap((entry) => {
        switch (entry.kind) {
            case "equal":
                return [blockAs(entry.after, "unchanged", false)];
            case "removed":
                return [blockAs(entry.before, "removed", entry.moved)];
            case "added":
                return [blockAs(entry.after, "added", entry.moved)];
            case "paired":
                return [blockPair(entry.before, entry.after)];
        }
    });
}

type SideStatus = "unchanged" | "added" | "removed";

function sideChange(status: SideStatus): MarkdownDiffChange {
    if (status === "added") return "inserted";
    if (status === "removed") return "deleted";
    return "equal";
}

function runsAs(
    content: readonly MarkdownDiffPhrasing[],
    change: MarkdownDiffChange,
): MarkdownDiffInlineRun[] {
    return content.length === 0 ? [] : [{ change, content }];
}

/** One side's block, whole: every part of it shares its status. */
function blockAs(node: MarkdownDiffFlow, status: SideStatus, moved: boolean): MarkdownDiffBlock {
    const change = sideChange(status);
    switch (node.type) {
        case "paragraph":
            return { type: "paragraph", status, moved, inline: runsAs(node.children, change) };
        case "heading":
            return {
                type: "heading",
                status,
                moved,
                depth: node.depth,
                depthBefore: node.depth,
                inline: runsAs(node.children, change),
            };
        case "code":
            return {
                type: "code",
                status,
                moved,
                lang: node.lang ?? undefined,
                langBefore: node.lang ?? undefined,
                meta: node.meta ?? undefined,
                lines: codeLines(node.value).map((text, index) => ({
                    change,
                    text,
                    numberBefore: status === "added" ? undefined : index + 1,
                    numberAfter: status === "removed" ? undefined : index + 1,
                })),
            };
        case "list":
            return {
                type: "list",
                status,
                moved,
                ordered: node.ordered === true,
                start: node.start ?? undefined,
                startBefore: node.start ?? undefined,
                spread: node.spread === true,
                items: node.children.map((item) => itemAs(item, status, false)),
            };
        case "table":
            return {
                type: "table",
                status,
                moved,
                align: node.align,
                rows: node.children.map((row) => rowAs(row, status, false)),
            };
        case "blockquote":
            return {
                type: "blockquote",
                status,
                moved,
                children: node.children.map((child) => blockAs(child, status, false)),
            };
        default:
            return { type: "opaque", status, moved, node };
    }
}

function itemAs(item: MarkdownListItem, status: SideStatus, moved: boolean): MarkdownDiffListItem {
    return {
        status,
        moved,
        checked: item.checked ?? undefined,
        checkedBefore: item.checked ?? undefined,
        spread: item.spread === true,
        children: item.children.map((child) => blockAs(child, status, false)),
    };
}

function rowAs(row: MarkdownTableRow, status: SideStatus, moved: boolean): MarkdownDiffTableRow {
    const change = sideChange(status);
    return {
        status,
        moved,
        cells: row.children.map((cell) => ({ status, inline: runsAs(cell.children, change) })),
    };
}

/** Two versions of one block, compared part by part. */
function blockPair(before: MarkdownDiffFlow, after: MarkdownDiffFlow): MarkdownDiffBlock {
    if (before.type === "paragraph" && after.type === "paragraph")
        return {
            type: "paragraph",
            status: "changed",
            moved: false,
            inline: inlineDiff(before.children, after.children),
        };
    if (before.type === "heading" && after.type === "heading")
        return {
            type: "heading",
            status: "changed",
            moved: false,
            depth: after.depth,
            depthBefore: before.depth,
            inline: inlineDiff(before.children, after.children),
        };
    if (before.type === "code" && after.type === "code") return codeDiff(before, after);
    if (before.type === "list" && after.type === "list") return listDiff(before, after);
    if (before.type === "table" && after.type === "table") return tableDiff(before, after);
    if (before.type === "blockquote" && after.type === "blockquote")
        return {
            type: "blockquote",
            status: "changed",
            moved: false,
            children: blocksDiff(before.children, after.children),
        };
    // `blockScore` pairs only blocks of one kind.
    throw new Error(`Cannot pair a ${before.type} with a ${after.type}.`);
}

function codeDiff(before: MarkdownCode, after: MarkdownCode): MarkdownDiffCode {
    const beforeLines = codeLines(before.value);
    const afterLines = codeLines(after.value);
    const lines = sequenceDiff(beforeLines.map(codeLineKey), afterLines.map(codeLineKey)).map(
        (operation): MarkdownDiffCodeLine => {
            switch (operation.kind) {
                case "equal":
                    return {
                        change: "equal",
                        text: afterLines[operation.after]!,
                        numberBefore: operation.before + 1,
                        numberAfter: operation.after + 1,
                    };
                case "delete":
                    return {
                        change: "deleted",
                        text: beforeLines[operation.before]!,
                        numberBefore: operation.before + 1,
                        numberAfter: undefined,
                    };
                case "insert":
                    return {
                        change: "inserted",
                        text: afterLines[operation.after]!,
                        numberBefore: undefined,
                        numberAfter: operation.after + 1,
                    };
            }
        },
    );
    return {
        type: "code",
        status: "changed",
        moved: false,
        lang: after.lang ?? undefined,
        langBefore: before.lang ?? undefined,
        meta: after.meta ?? undefined,
        lines,
    };
}

function itemScore(before: MarkdownListItem, after: MarkdownListItem): number {
    return leafScore(before, after);
}

function listDiff(before: MarkdownList, after: MarkdownList): MarkdownDiffList {
    const items = sequenceAlign(before.children, after.children, nodeKey, itemScore).map(
        (entry): MarkdownDiffListItem => {
            switch (entry.kind) {
                case "equal":
                    return itemAs(entry.after, "unchanged", false);
                case "removed":
                    return itemAs(entry.before, "removed", entry.moved);
                case "added":
                    return itemAs(entry.after, "added", entry.moved);
                case "paired":
                    return {
                        status: "changed",
                        moved: false,
                        checked: entry.after.checked ?? undefined,
                        checkedBefore: entry.before.checked ?? undefined,
                        spread: entry.after.spread === true,
                        children: blocksDiff(entry.before.children, entry.after.children),
                    };
            }
        },
    );
    return {
        type: "list",
        status: "changed",
        moved: false,
        ordered: after.ordered === true,
        start: after.start ?? undefined,
        startBefore: before.start ?? undefined,
        spread: after.spread === true,
        items,
    };
}

function rowScore(before: MarkdownTableRow, after: MarkdownTableRow): number {
    return leafScore(before, after);
}

/** Two versions of one row, compared cell by cell in column order. */
function rowPair(before: MarkdownTableRow, after: MarkdownTableRow): MarkdownDiffTableRow {
    if (nodeKey(before) === nodeKey(after)) return rowAs(after, "unchanged", false);
    const cells: MarkdownDiffTableCell[] = [];
    const count = Math.max(before.children.length, after.children.length);
    for (let index = 0; index < count; index += 1) {
        const beforeCell = before.children[index];
        const afterCell = after.children[index];
        if (beforeCell === undefined)
            cells.push({ status: "added", inline: runsAs(afterCell!.children, "inserted") });
        else if (afterCell === undefined)
            cells.push({ status: "removed", inline: runsAs(beforeCell.children, "deleted") });
        else if (nodeKey(beforeCell) === nodeKey(afterCell))
            cells.push({ status: "unchanged", inline: runsAs(afterCell.children, "equal") });
        else
            cells.push({
                status: "changed",
                inline: inlineDiff(beforeCell.children, afterCell.children),
            });
    }
    return { status: "changed", moved: false, cells };
}

function tableDiff(before: MarkdownTable, after: MarkdownTable): MarkdownDiffTable {
    const [beforeHead, ...beforeBody] = before.children;
    const [afterHead, ...afterBody] = after.children;
    const rows: MarkdownDiffTableRow[] = [];
    // The header is always the first row of both tables, so it pairs by place.
    if (beforeHead !== undefined && afterHead !== undefined)
        rows.push(rowPair(beforeHead, afterHead));
    for (const entry of sequenceAlign(beforeBody, afterBody, nodeKey, rowScore)) {
        switch (entry.kind) {
            case "equal":
                rows.push(rowAs(entry.after, "unchanged", false));
                break;
            case "removed":
                rows.push(rowAs(entry.before, "removed", entry.moved));
                break;
            case "added":
                rows.push(rowAs(entry.after, "added", entry.moved));
                break;
            case "paired":
                rows.push(rowPair(entry.before, entry.after));
                break;
        }
    }
    return { type: "table", status: "changed", moved: false, align: after.align, rows };
}

// ---- Inline ---------------------------------------------------------------

type MarkdownPhrasingParent = Extract<MarkdownDiffPhrasing, { children: unknown }>;

/** Formatting a token sits inside — emphasis, strong, strikethrough, a link. */
type InlineMark = { readonly key: string; readonly node: MarkdownPhrasingParent };

/**
 * One comparable piece of inline content: a word, a punctuation mark, or an
 * atomic node such as a code span or an image. Its key includes its
 * formatting, so making a word bold is a change to that word.
 *
 * Whitespace is glue, not a piece: it rides on the piece before it and is not
 * compared, so the diff aligns words rather than the spaces between them, and
 * reflowed whitespace is no change. Only whitespace with no piece before it
 * in its text stands alone.
 */
type InlineToken = {
    readonly key: string;
    readonly marks: readonly InlineMark[];
    readonly leaf: string | MarkdownDiffPhrasing;
};

const INLINE_PIECE = /\s+|[\p{L}\p{N}_]+\s*|[^\s\p{L}\p{N}_]\s*/gu;
const TRAILING_SPACE = /\s+$/u;
const PUNCTUATION_ONLY = /^[^\p{L}\p{N}_]*$/u;

function inlineTokens(content: readonly MarkdownDiffPhrasing[]): InlineToken[] {
    const tokens: InlineToken[] = [];
    const walk = (nodes: readonly MarkdownDiffPhrasing[], marks: readonly InlineMark[]) => {
        const prefix = marks.map((mark) => mark.key).join(">");
        for (const node of nodes) {
            if (node.type === "text") {
                for (const piece of node.value.match(INLINE_PIECE) ?? [])
                    tokens.push({
                        key: `${prefix}|${piece.trimEnd() || " "}`,
                        marks,
                        leaf: piece,
                    });
            } else if ("children" in node) {
                const { children, ...mark } = node;
                walk(children, [...marks, { key: nodeKey(mark), node }]);
            } else tokens.push({ key: `${prefix}|${nodeKey(node)}`, marks, leaf: node });
        }
    };
    walk(content, []);
    return tokens;
}

/** Whether a token is only spacing or punctuation, too slight to stand between two changes. */
function inlineTokenSlight(token: InlineToken): boolean {
    return typeof token.leaf === "string" && PUNCTUATION_ONLY.test(token.leaf);
}

/** The trailing whitespace of a token, or the empty string. */
function inlineTokenTrailing(token: InlineToken | undefined): string {
    return typeof token?.leaf === "string" ? (TRAILING_SPACE.exec(token.leaf)?.[0] ?? "") : "";
}

/** The tokens without the last one's trailing whitespace. */
function inlineTokensTrimmed(tokens: readonly InlineToken[]): InlineToken[] {
    const last = tokens[tokens.length - 1];
    if (typeof last?.leaf !== "string") return [...tokens];
    const leaf = last.leaf.replace(TRAILING_SPACE, "");
    return leaf.length === 0 ? tokens.slice(0, -1) : [...tokens.slice(0, -1), { ...last, leaf }];
}

/** Inline content rebuilt from one side's tokens, nesting each mark once. */
function inlineBuild(tokens: readonly InlineToken[]): MarkdownDiffPhrasing[] {
    const root: MarkdownDiffPhrasing[] = [];
    const open: { mark: InlineMark; children: MarkdownDiffPhrasing[] }[] = [];
    for (const token of tokens) {
        let shared = 0;
        while (
            shared < open.length &&
            shared < token.marks.length &&
            open[shared]!.mark.node === token.marks[shared]!.node
        )
            shared += 1;
        open.length = shared;
        for (let depth = shared; depth < token.marks.length; depth += 1) {
            const mark = token.marks[depth]!;
            const children: MarkdownDiffPhrasing[] = [];
            const { position: _position, ...node } = mark.node;
            (depth === 0 ? root : open[depth - 1]!.children).push({
                ...node,
                children,
            } as MarkdownPhrasingParent);
            open.push({ mark, children });
        }
        const target = open.length === 0 ? root : open[open.length - 1]!.children;
        if (typeof token.leaf === "string") {
            const last = target[target.length - 1];
            if (last?.type === "text")
                target[target.length - 1] = { ...last, value: last.value + token.leaf };
            else target.push({ type: "text", value: token.leaf });
        } else target.push(token.leaf);
    }
    return root;
}

type InlineSpan =
    | { kind: "equal"; before: InlineToken[]; after: InlineToken[] }
    | { kind: "change"; before: InlineToken[]; after: InlineToken[] };

/**
 * Two versions of inline content, word by word. A stretch of only spaces or
 * punctuation between two changes joins them, so a rewritten phrase reads as
 * the old phrase and then the new one rather than as alternating words.
 */
function inlineDiff(
    before: readonly MarkdownDiffPhrasing[],
    after: readonly MarkdownDiffPhrasing[],
): MarkdownDiffInlineRun[] {
    const beforeTokens = inlineTokens(before);
    const afterTokens = inlineTokens(after);
    const spans: InlineSpan[] = [];
    const span = (kind: InlineSpan["kind"]) => {
        const last = spans[spans.length - 1];
        if (last?.kind === kind) return last;
        const next: InlineSpan = { kind, before: [], after: [] };
        spans.push(next);
        return next;
    };
    for (const operation of sequenceDiff(
        beforeTokens.map((token) => token.key),
        afterTokens.map((token) => token.key),
    )) {
        if (operation.kind === "equal") {
            const equal = span("equal");
            equal.before.push(beforeTokens[operation.before]!);
            equal.after.push(afterTokens[operation.after]!);
        } else if (operation.kind === "delete")
            span("change").before.push(beforeTokens[operation.before]!);
        else span("change").after.push(afterTokens[operation.after]!);
    }
    const joined: InlineSpan[] = [];
    for (let index = 0; index < spans.length; index += 1) {
        const current = spans[index]!;
        const previous = joined[joined.length - 1];
        const next = spans[index + 1];
        if (
            current.kind === "equal" &&
            previous?.kind === "change" &&
            next?.kind === "change" &&
            current.after.every(inlineTokenSlight)
        ) {
            previous.before.push(...current.before, ...next.before);
            previous.after.push(...current.after, ...next.after);
            index += 1;
        } else if (current.kind === "change" && previous?.kind === "change") {
            previous.before.push(...current.before);
            previous.after.push(...current.after);
        } else
            joined.push({
                kind: current.kind,
                before: [...current.before],
                after: [...current.after],
            });
    }
    // An unchanged token shows its new spacing. Where the old text had a space
    // the new one lacks just before a deletion, the deletion carries it, so
    // the old words read as they were written.
    const runs: MarkdownDiffInlineRun[] = [];
    const push = (change: MarkdownDiffChange, content: MarkdownDiffPhrasing[]) => {
        if (content.length === 0) return;
        const last = runs[runs.length - 1];
        if (last?.change !== change) {
            runs.push({ change, content });
            return;
        }
        const joined = [...last.content];
        for (const node of content) {
            const tail = joined[joined.length - 1];
            if (
                tail?.type === "text" &&
                node.type === "text" &&
                tail.data === undefined &&
                node.data === undefined
            )
                joined[joined.length - 1] = { type: "text", value: tail.value + node.value };
            else joined.push(node);
        }
        runs[runs.length - 1] = { change, content: joined };
    };
    const text = (value: string): MarkdownDiffPhrasing[] =>
        value.length === 0 ? [] : [{ type: "text", value }];
    let afterEndsInSpace = false;
    let carry = "";
    for (const entry of joined) {
        const beforeSpace = inlineTokenTrailing(entry.before[entry.before.length - 1]);
        const afterSpace = inlineTokenTrailing(entry.after[entry.after.length - 1]);
        if (entry.kind === "equal") {
            push("equal", inlineBuild(entry.after));
            afterEndsInSpace = afterSpace.length > 0;
            carry = afterEndsInSpace ? "" : beforeSpace;
            continue;
        }
        // The space after a changed phrase belongs to the sentence, not to the
        // change, so it is set outside the marks.
        let space = "";
        let before = entry.before;
        let after = entry.after;
        if (
            after.length > 0 &&
            afterSpace.length > 0 &&
            (before.length === 0 || beforeSpace.length > 0)
        ) {
            space = afterSpace;
            before = inlineTokensTrimmed(before);
            after = inlineTokensTrimmed(after);
        } else if (after.length === 0 && beforeSpace.length > 0) {
            space = afterEndsInSpace ? "" : beforeSpace;
            before = inlineTokensTrimmed(before);
        }
        if (before.length > 0) push("deleted", [...text(carry), ...inlineBuild(before)]);
        push("inserted", inlineBuild(after));
        push("equal", text(space));
        afterEndsInSpace =
            space.length > 0 || (after.length > 0 ? afterSpace.length > 0 : afterEndsInSpace);
        carry = "";
    }
    return runs;
}
