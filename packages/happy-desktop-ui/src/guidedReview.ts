import { messageMarkdownParse } from "./messageMarkdownAst";
import { type ReviewSeverity } from "./ReviewFinding";

/*
 * A guided review is an ordinary Markdown reply with a few small fences Happy
 * draws with its own components. A fence is flat: `key: value` lines, then,
 * after a blank line, free text. Nothing nests and nothing is JSON, so a
 * fence reads the same to the model writing it, to a person reading the raw
 * reply, and to this parser.
 *
 *   ```happy-diff
 *   path: packages/app/src/store.ts
 *   lines: 40-52
 *   ```
 *
 * Code, line numbers, counts, and statuses never come from a fence: Happy
 * reads them from the real change.
 */

/** Lines counted from 1, both ends included, the way every editor counts. */
export interface HappyUiLineRange {
    readonly startLine: number;
    readonly endLine: number;
}

/** Two commits a committed change lies between, as full hashes. */
export interface HappyUiRange {
    readonly base: string;
    readonly head: string;
}

/**
 * A picture published as an artifact, by its id and the version that holds
 * it. A version never changes once published, so the picture a review shows
 * is the one its author looked at.
 */
export interface HappyUiImage {
    readonly artifact: string;
    readonly version: number;
}

export const GUIDED_REVIEW_FENCE_LABELS = [
    "happy-review",
    "happy-diff",
    "happy-files",
    "happy-flow",
    "happy-sequence",
    "happy-finding",
    "happy-verdict",
    "happy-before-after",
] as const;

export type GuidedReviewFenceLabel = (typeof GUIDED_REVIEW_FENCE_LABELS)[number];

export function guidedReviewFenceLabel(
    lang: string | null | undefined,
): GuidedReviewFenceLabel | undefined {
    const label = lang?.trim().toLowerCase();
    return GUIDED_REVIEW_FENCE_LABELS.find((candidate) => candidate === label);
}

/**
 * Fences that can stand beside a chapter's words in a wide column. A sequence
 * reads across, one column per part, so it takes the whole width below them.
 */
const ASIDE_LABELS: ReadonlySet<GuidedReviewFenceLabel> = new Set([
    "happy-diff",
    "happy-files",
    "happy-flow",
]);

export type GuidedReviewFence =
    /**
     * What the reply is about: this branch's live change, two commits, or —
     * for an explanation — the code as it is at one commit.
     */
    | {
          readonly type: "review";
          readonly base?: string;
          readonly range?: HappyUiRange;
          readonly commit?: string;
      }
    | { readonly type: "diff"; readonly path: string; readonly lines: HappyUiLineRange }
    /** Every changed file, or the ones under the paths and folders named. */
    | { readonly type: "files"; readonly paths: readonly string[] }
    /** One syntax, two drawings: how parts connect, or what happens in order. */
    | { readonly type: "flow"; readonly layout: "graph" | "sequence"; readonly source: string }
    | {
          readonly type: "finding";
          readonly severity: ReviewSeverity;
          readonly title: string;
          readonly path?: string;
          readonly lines?: HappyUiLineRange;
          readonly body: string;
      }
    | { readonly type: "verdict"; readonly body: string }
    | {
          readonly type: "beforeAfter";
          readonly before?: HappyUiImage;
          readonly after?: HappyUiImage;
          readonly body: string;
      };

export type GuidedReviewFenceParsed =
    | { readonly type: "ready"; readonly fence: GuidedReviewFence }
    | { readonly type: "invalid"; readonly reason: string };

const SEVERITIES: readonly ReviewSeverity[] = ["high", "medium", "low"];

/** A full SHA-1 or SHA-256 object name, lower-case as Git prints it. */
const OBJECT_NAME = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const FIELD = /^([a-z]+):\s*(.*)$/u;

class FenceError extends Error {}

function fail(reason: string): never {
    throw new FenceError(reason);
}

/** The leading `key: value` lines a fence allows, then the text after them. */
function fieldsRead(
    source: string,
    allowed: readonly string[],
): { readonly fields: ReadonlyMap<string, string>; readonly body: string } {
    const lines = source.split("\n");
    const fields = new Map<string, string>();
    let at = 0;
    for (; at < lines.length; at += 1) {
        const match = FIELD.exec(lines[at]!.trim());
        if (match === null || !allowed.includes(match[1]!)) break;
        if (fields.has(match[1]!)) fail(`"${match[1]!}" is given twice.`);
        fields.set(match[1]!, match[2]!.trim());
    }
    return { fields, body: lines.slice(at).join("\n").trim() };
}

function linesRead(value: string): HappyUiLineRange {
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/u.exec(value);
    if (match === null) fail(`lines must read like 40-52, not "${value}".`);
    const startLine = Number(match[1]);
    const endLine = match[2] === undefined ? startLine : Number(match[2]);
    if (startLine < 1 || endLine < startLine) fail(`lines ${value} is not a range counted from 1.`);
    return { startLine, endLine };
}

function imageRead(value: string, field: string): HappyUiImage {
    const match = /^(\S+)@(\d+)$/u.exec(value);
    if (match === null) fail(`${field} must read like <artifact id>@<version>.`);
    const version = Number(match[2]);
    if (version < 1) fail(`${field} names version ${match[2]!}; versions count from 1.`);
    return { artifact: match[1]!, version };
}

function fenceRead(label: GuidedReviewFenceLabel, source: string): GuidedReviewFence {
    switch (label) {
        case "happy-review": {
            const { fields } = fieldsRead(source, ["base", "range", "commit"]);
            const base = fields.get("base");
            const range = fields.get("range");
            const commit = fields.get("commit");
            if ([base, range, commit].filter((value) => value !== undefined).length !== 1)
                fail(
                    'A review names one of "base" (this branch), "range" (two commits), or "commit" (code it explains).',
                );
            if (commit !== undefined) {
                if (!OBJECT_NAME.test(commit))
                    fail('commit must be a full hash from "git rev-parse HEAD".');
                return { type: "review", commit };
            }
            if (base !== undefined) {
                if (!OBJECT_NAME.test(base))
                    fail('base must be the full merge-base hash from "git merge-base".');
                return { type: "review", base };
            }
            const [from, to] = range!.split("..");
            if (from === undefined || to === undefined || !OBJECT_NAME.test(from))
                fail('range must read <full hash>..<full hash>, from "git rev-parse".');
            if (!OBJECT_NAME.test(to))
                fail('range must read <full hash>..<full hash>, from "git rev-parse".');
            if (from === to) fail("range names the same commit twice.");
            return { type: "review", range: { base: from, head: to } };
        }
        case "happy-diff": {
            const { fields } = fieldsRead(source, ["path", "lines"]);
            const path = fields.get("path");
            const lines = fields.get("lines");
            if (!path) fail('A diff names a "path".');
            if (!lines) fail('A diff names its "lines".');
            return { type: "diff", path, lines: linesRead(lines) };
        }
        case "happy-files":
            return {
                type: "files",
                paths: source
                    .split("\n")
                    .map((line) => line.trim().replace(/\/+$/u, ""))
                    .filter((line) => line.length > 0),
            };
        case "happy-flow":
            return { type: "flow", layout: "graph", source };
        case "happy-sequence":
            return { type: "flow", layout: "sequence", source };
        case "happy-finding": {
            const { fields, body } = fieldsRead(source, ["severity", "title", "path", "lines"]);
            const severity = fields.get("severity") as ReviewSeverity | undefined;
            const title = fields.get("title");
            const path = fields.get("path");
            const lines = fields.get("lines");
            if (severity === undefined || !SEVERITIES.includes(severity))
                fail("A finding's severity is high, medium, or low.");
            if (!title) fail('A finding has a "title".');
            if ((path === undefined) !== (lines === undefined))
                fail('A finding names "path" and "lines" together, or neither.');
            return {
                type: "finding",
                severity,
                title,
                ...(path === undefined || lines === undefined
                    ? {}
                    : { path, lines: linesRead(lines) }),
                body,
            };
        }
        case "happy-verdict":
            return { type: "verdict", body: source.trim() };
        case "happy-before-after": {
            const { fields, body } = fieldsRead(source, ["before", "after"]);
            const before = fields.get("before");
            const after = fields.get("after");
            if (before === undefined && after === undefined)
                fail('A before/after names a "before" picture, an "after" one, or both.');
            return {
                type: "beforeAfter",
                ...(before === undefined ? {} : { before: imageRead(before, "before") }),
                ...(after === undefined ? {} : { after: imageRead(after, "after") }),
                body,
            };
        }
    }
}

const parsedFences = new Map<string, GuidedReviewFenceParsed>();
const PARSED_MAX = 256;

/** Reads one fence; a fence it cannot read says why. */
export function guidedReviewFenceParse(
    label: GuidedReviewFenceLabel,
    source: string,
): GuidedReviewFenceParsed {
    const key = `${label}\u0000${source}`;
    const cached = parsedFences.get(key);
    if (cached !== undefined) return cached;
    let parsed: GuidedReviewFenceParsed;
    try {
        parsed = { type: "ready", fence: fenceRead(label, source) };
    } catch (error) {
        if (!(error instanceof FenceError)) throw error;
        parsed = { type: "invalid", reason: error.message };
    }
    parsedFences.set(key, parsed);
    if (parsedFences.size > PARSED_MAX) parsedFences.delete(parsedFences.keys().next().value!);
    return parsed;
}

/**
 * Whether the fence ending at `endOffset` is still being written: the reply
 * is streaming, the fence runs to the end of what has arrived, and its
 * closing line has not arrived yet. A fence before another block is closed.
 */
export function guidedReviewFenceOpen(
    text: string,
    endOffset: number,
    streaming: boolean,
): boolean {
    if (!streaming || endOffset < text.trimEnd().length) return false;
    const raw = text.slice(0, endOffset).trimEnd();
    const last = raw.slice(raw.lastIndexOf("\n") + 1);
    return !/^[ \t]{0,3}(?:`{3,}|~{3,})[ \t]*$/u.test(last);
}

/** What the fences of one reply say about the reply as a whole. */
export interface GuidedReviewDocument {
    readonly base?: string;
    readonly range?: HappyUiRange;
    /** An explanation's commit: its quotes are code as it is there, not a change. */
    readonly commit?: string;
    /** Every finding's severity, so a verdict counts rather than claims. */
    readonly severities: readonly ReviewSeverity[];
    /** Files the reply quotes lines from. */
    readonly paths: ReadonlySet<string>;
    /** Every Happy fence, readable or not, in order. */
    readonly fences: readonly {
        readonly label: GuidedReviewFenceLabel;
        readonly parsed: GuidedReviewFenceParsed;
    }[];
}

type SearchNode = {
    readonly type: string;
    readonly lang?: string | null | undefined;
    readonly value?: string;
    readonly children?: readonly SearchNode[];
};

const EMPTY: GuidedReviewDocument = { severities: [], paths: new Set(), fences: [] };
const documents = new Map<string, GuidedReviewDocument>();
const DOCUMENTS_MAX = 64;

/**
 * Reads every Happy fence of a reply from the same remark tree the reply is
 * drawn from, so a fence the transcript draws is a fence counted here.
 */
export function guidedReviewDocument(text: string): GuidedReviewDocument {
    if (!text.includes("happy-")) return EMPTY;
    const cached = documents.get(text);
    if (cached !== undefined) return cached;
    const fences: { label: GuidedReviewFenceLabel; parsed: GuidedReviewFenceParsed }[] = [];
    const visit = (node: SearchNode) => {
        const label = node.type === "code" ? guidedReviewFenceLabel(node.lang) : undefined;
        if (label !== undefined)
            fences.push({ label, parsed: guidedReviewFenceParse(label, node.value ?? "") });
        for (const child of node.children ?? []) visit(child);
    };
    visit(messageMarkdownParse(text));
    let base: string | undefined;
    let range: HappyUiRange | undefined;
    let commit: string | undefined;
    const severities: ReviewSeverity[] = [];
    const paths = new Set<string>();
    for (const { parsed } of fences) {
        if (parsed.type !== "ready") continue;
        const fence = parsed.fence;
        if (
            fence.type === "review" &&
            base === undefined &&
            range === undefined &&
            commit === undefined
        ) {
            base = fence.base;
            range = fence.range;
            commit = fence.commit;
        }
        if (fence.type === "diff") paths.add(fence.path);
        if (fence.type === "finding") {
            severities.push(fence.severity);
            if (fence.path !== undefined && fence.lines !== undefined) paths.add(fence.path);
        }
    }
    const document: GuidedReviewDocument = {
        ...(base === undefined ? {} : { base }),
        ...(range === undefined ? {} : { range }),
        ...(commit === undefined ? {} : { commit }),
        severities,
        paths,
        fences,
    };
    documents.set(text, document);
    if (documents.size > DOCUMENTS_MAX) documents.delete(documents.keys().next().value!);
    return document;
}

/*
 * Chapters. In a reply with Happy fences, every `##` heading opens a chapter
 * that runs to the next `##`, `#`, or rule. Happy numbers the chapters in
 * order — a flow's chips point at those numbers — and lays each out as its
 * heading and leading words, then the one diff, flow, or file list right
 * after them (side by side once the column is wide), then anything else.
 */

type MdNode = {
    type: string;
    depth?: number;
    lang?: string | null;
    children?: MdNode[];
    data?: Record<string, unknown>;
};

/** The parts of one chapter, kept on its node for the row model to read. */
export interface GuidedReviewSectionParts {
    readonly number: number;
    readonly heading: MdNode;
    readonly prose: readonly MdNode[];
    readonly aside?: MdNode;
    readonly rest: readonly MdNode[];
}

export const GUIDED_REVIEW_SECTION = "guidedReviewSection";

const PROSE_TYPES = new Set(["paragraph", "list", "blockquote"]);

function element(type: string, tagName: string, className: string, children: MdNode[]): MdNode {
    return {
        type,
        data: { hName: tagName, hProperties: { className: [className] } },
        children,
    };
}

function sectionCreate(parts: GuidedReviewSectionParts): MdNode {
    const number: MdNode = {
        type: "guidedReviewNumber",
        data: {
            hName: "span",
            hProperties: { className: ["happy-review-section__number"], ariaHidden: "true" },
            hChildren: [{ type: "text", value: String(parts.number) }],
        },
    };
    const words = element("guidedReviewWords", "div", "happy-review-section__words", [
        element("guidedReviewHeading", "div", "happy-review-section__heading", [
            number,
            parts.heading,
        ]),
        ...parts.prose,
    ]);
    const layout = element("guidedReviewLayout", "div", "happy-review-section__layout", [
        words,
        ...(parts.aside === undefined
            ? []
            : [element("guidedReviewAside", "div", "happy-review-section__aside", [parts.aside])]),
    ]);
    const section = element(GUIDED_REVIEW_SECTION, "section", "happy-review-section", [
        layout,
        ...parts.rest,
    ]);
    // The number a flow's chip names, for the chip to find its chapter by.
    section.data = {
        ...section.data,
        hProperties: { className: ["happy-review-section"], dataChapter: String(parts.number) },
        guidedReview: parts,
    };
    return section;
}

/** Groups a reply's chapters in place; a reply without Happy fences is left alone. */
export function guidedReviewSectionsApply(tree: { children: MdNode[] }): void {
    const hasFence = (node: MdNode): boolean =>
        (node.type === "code" && guidedReviewFenceLabel(node.lang) !== undefined) ||
        (node.children ?? []).some(hasFence);
    if (!tree.children.some(hasFence)) return;
    const out: MdNode[] = [];
    let number = 0;
    for (let at = 0; at < tree.children.length; ) {
        const node = tree.children[at]!;
        if (node.type !== "heading" || node.depth !== 2) {
            out.push(node);
            at += 1;
            continue;
        }
        let end = at + 1;
        while (end < tree.children.length) {
            const next = tree.children[end]!;
            if (next.type === "thematicBreak") break;
            if (next.type === "heading" && (next.depth ?? 0) <= 2) break;
            end += 1;
        }
        const content = tree.children.slice(at + 1, end);
        let proseEnd = 0;
        while (proseEnd < content.length && PROSE_TYPES.has(content[proseEnd]!.type)) proseEnd += 1;
        const next = content[proseEnd];
        const label = next?.type === "code" ? guidedReviewFenceLabel(next.lang) : undefined;
        const aside = label !== undefined && ASIDE_LABELS.has(label) ? next : undefined;
        number += 1;
        out.push(
            sectionCreate({
                number,
                heading: node,
                prose: content.slice(0, proseEnd),
                ...(aside === undefined ? {} : { aside }),
                rest: content.slice(proseEnd + (aside === undefined ? 0 : 1)),
            }),
        );
        at = end;
    }
    tree.children = out;
}

/** The same grouping as a remark plugin, for the render pipeline. */
export function remarkGuidedReviewSections() {
    return (tree: { children: MdNode[] }) => {
        guidedReviewSectionsApply(tree);
    };
}
