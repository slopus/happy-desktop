import { parseDiffFromFile } from "@pierre/diffs";
import type { DiffLine } from "./DiffSnippet";
import {
    guidedReviewDocument,
    type GuidedReviewDocument,
    type HappyUiImage,
    type HappyUiLineRange,
    type HappyUiRange,
} from "./guidedReview";
import { type ReviewDiffStatus } from "./ReviewDiff";

/**
 * What one quoted diff shows, read from the real change.
 *
 * - `ready` — the lines of the change inside the named range, at most
 *   `HAPPY_UI_DIFF_MAX_LINES` of them; `hidden` counts the rest. `added` and
 *   `removed` count the changed ones across the whole range; both zero means
 *   the agent pointed at lines that did not change, which the diff says out
 *   loud.
 * - `loading` — the file's change is still being read.
 * - `missing` — the file is not part of this change at all.
 * - `moved` — the reply was written about a live change measured from a base
 *   the checkout has moved past, so the lines are not checked against it.
 * - `error` — the change could not be read.
 */
export type HappyUiDiffView =
    | {
          readonly type: "ready";
          readonly lines: readonly DiffLine[];
          readonly hidden: number;
          readonly added: number;
          readonly removed: number;
      }
    | { readonly type: "loading" }
    | { readonly type: "missing" }
    | { readonly type: "moved" }
    | { readonly type: "error"; readonly message: string };

/**
 * What a before/after picture shows. `ready` is an image the artifact serves;
 * every other answer is said in the picture's place, which keeps its size so
 * the row never moves when the answer arrives.
 */
export type HappyUiImageView =
    | { readonly type: "ready"; readonly url: string }
    | { readonly type: "loading" }
    | { readonly type: "missing" }
    | { readonly type: "notImage" }
    | { readonly type: "deleted" };

/** The words a picture frame shows when it has no picture to show. */
export function happyUiImageMessage(view: HappyUiImageView | undefined): string | undefined {
    switch (view?.type) {
        case undefined:
            return "No picture can be shown here.";
        case "ready":
            return undefined;
        case "loading":
            return "Loading the picture…";
        case "missing":
            return "This picture is not among the artifacts.";
        case "notImage":
            return "That artifact is not a picture.";
        case "deleted":
            return "This picture was deleted.";
    }
}

/**
 * One changed file as the change lists it. Counts are absent where they are
 * not known — a binary file, or a list that carries paths alone.
 */
export interface HappyUiListedFile {
    readonly path: string;
    readonly status?: ReviewDiffStatus;
    readonly added?: number;
    readonly removed?: number;
}

/**
 * Every file the change behind a reply touches. `unchecked` says why the list
 * cannot be had: the reply names two commits this Happy Agent cannot list the
 * files between; the list was capped; or the checkout cannot be compared.
 */
export type HappyUiChangedFiles =
    | { readonly type: "ready"; readonly files: readonly HappyUiListedFile[] }
    | { readonly type: "loading" }
    | { readonly type: "unchecked"; readonly reason: "range" | "truncated" | "unavailable" };

/**
 * The merge base the checkout's live change is measured from now. `base` is
 * absent when the change is empty, which leaves nothing measured at all.
 */
export type HappyUiBaseView =
    | { readonly type: "ready"; readonly base: string | undefined }
    | { readonly type: "loading" }
    | { readonly type: "unavailable" };

/**
 * The real change behind a guided review, supplied by the surface that owns
 * the workspace. Every read is asked while rendering and while sizing rows,
 * so each must be a pure read of the owner's current snapshot; recording that
 * something is wanted is fine, publishing in the same call is not.
 *
 * `range` is the reply's own: two commits for a change already committed,
 * absent for the checkout's live change.
 *
 * Without a grounding every quoted diff reads as unknown: a transcript with
 * no checkout behind it has no change to show.
 */
export interface HappyUiGrounding {
    diff(path: string, lines: HappyUiLineRange, range: HappyUiRange | undefined): HappyUiDiffView;
    changedFiles(range: HappyUiRange | undefined): HappyUiChangedFiles;
    base(): HappyUiBaseView;
    image(image: HappyUiImage): HappyUiImageView;
}

/** The change a reply names, as its `happy-review` fence names it. */
export type HappyUiChange = Pick<GuidedReviewDocument, "base" | "range" | "commit">;

/**
 * Where a reply's quotes are read: two commits for a committed change, one
 * commit on both sides for an explanation of the code as it is there, or
 * nothing for this branch's live change.
 */
export function happyUiQuoteRange(change: HappyUiChange): HappyUiRange | undefined {
    if (change.commit !== undefined) return { base: change.commit, head: change.commit };
    return change.range;
}

/** The files a reply's change lists; an explanation is about no change. */
export function happyUiChangedFilesOf(
    change: HappyUiChange,
    grounding: HappyUiGrounding | undefined,
): HappyUiChangedFiles | undefined {
    if (grounding === undefined || change.commit !== undefined) return undefined;
    return grounding.changedFiles(change.range);
}

/**
 * Whether the live change a reply was written about is still the one the
 * checkout holds. `undefined` when the reply names no base or nothing grounds
 * it, so there is nothing to compare. An empty change has moved too: the
 * branch was merged or reset, and the files a reply names are no longer in it.
 */
export function happyUiBaseState(
    change: HappyUiChange,
    grounding: HappyUiGrounding | undefined,
): "current" | "moved" | "loading" | undefined {
    if (change.base === undefined || grounding === undefined) return undefined;
    const view = grounding.base();
    if (view.type === "loading") return "loading";
    if (view.type === "unavailable") return undefined;
    return view.base === change.base ? "current" : "moved";
}

/**
 * The grounding a reply's own fences read through. A reply whose live change
 * has moved claims nothing about files and lines any more: each diff says the
 * change moved on, and pictures, which are artifacts, still show.
 */
export function happyUiGroundingOf(
    change: HappyUiChange,
    grounding: HappyUiGrounding | undefined,
): HappyUiGrounding | undefined {
    if (grounding === undefined || happyUiBaseState(change, grounding) !== "moved")
        return grounding;
    return {
        diff: () => ({ type: "moved" }),
        changedFiles: () => ({ type: "unchecked", reason: "unavailable" }),
        base: () => grounding.base(),
        image: (image) => grounding.image(image),
    };
}

/**
 * How much of its change a review quotes lines from: every changed file, or
 * some of them.
 */
export type HappyUiCoverageView =
    | { readonly type: "covered"; readonly total: number }
    | {
          readonly type: "uncovered";
          readonly total: number;
          /** How many of the changed files the review quotes. */
          readonly shown: number;
      }
    | { readonly type: "loading" }
    | { readonly type: "moved" }
    | { readonly type: "ungrounded" }
    /** An explanation: the code as it is at one commit, not a change. */
    | { readonly type: "explained"; readonly commit: string }
    | Extract<HappyUiChangedFiles, { type: "unchecked" }>;

export function happyUiCoverage(
    document: GuidedReviewDocument,
    grounding: HappyUiGrounding | undefined,
): HappyUiCoverageView {
    if (document.commit !== undefined) return { type: "explained", commit: document.commit };
    if (grounding === undefined) return { type: "ungrounded" };
    const base = happyUiBaseState(document, grounding);
    if (base === "moved") return { type: "moved" };
    if (base === "loading") return { type: "loading" };
    const files = grounding.changedFiles(document.range);
    if (files.type !== "ready") return files;
    const shown = files.files.filter((file) => document.paths.has(file.path)).length;
    if (shown === files.files.length) return { type: "covered", total: files.files.length };
    return { type: "uncovered", total: files.files.length, shown };
}

/** What the coverage line says while the reply is still being written. */
export const HAPPY_UI_COVERAGE_PENDING = "Reviewing the change…";

/** The coverage line's words; the fence and the row model share them. */
export function happyUiCoverageSummary(view: HappyUiCoverageView): string {
    switch (view.type) {
        case "covered":
            return view.total === 1
                ? "Walks through the one changed file."
                : view.total === 2
                  ? "Walks through both changed files."
                  : `Walks through all ${String(view.total)} changed files.`;
        case "uncovered":
            return `Walks through ${String(view.shown)} of the ${String(view.total)} changed files.`;
        case "loading":
            return "Checking which changed files this review walks through…";
        case "moved":
            return "Not checked any more: this branch has been merged, rebased, or synced since the review was written.";
        case "ungrounded":
            return "Not checked against a change.";
        case "explained":
            return `Code as it is at ${view.commit.slice(0, 7)}.`;
        case "unchecked":
            switch (view.reason) {
                case "range":
                    return "Coverage not checked: this Happy Agent cannot list the files between the two commits this review names.";
                case "truncated":
                    return "Coverage not checked: the change has more files than the checkout lists.";
                case "unavailable":
                    return "Coverage not checked: this checkout's changes cannot be listed.";
            }
    }
}

/**
 * The files a `happy-files` fence lists: every changed file when it names
 * none, else each file that is or sits under a path it names.
 */
export function happyUiFilesSelect(
    files: readonly HappyUiListedFile[],
    paths: readonly string[],
): readonly HappyUiListedFile[] {
    if (paths.length === 0) return files;
    return files.filter((file) =>
        paths.some((path) => file.path === path || file.path.startsWith(`${path}/`)),
    );
}

/** The most lines one diff node shows; a review points, it does not reprint. */
export const HAPPY_UI_DIFF_MAX_LINES = 12;

/** The two sides of one changed file, as the workspace holds them. */
export interface HappyUiChangedFile {
    readonly path: string;
    readonly oldContent: string;
    readonly newContent: string;
}

type Ordered = { readonly anchor: number; readonly order: number; readonly line: DiffLine };

/** One file's change parsed once, before any range is cut from it. */
interface ParsedChange {
    /** Every line the hunks hold, anchored where it reads in the current file. */
    readonly entries: readonly Ordered[];
    /** Current line numbers the hunks already hold. */
    readonly covered: ReadonlySet<number>;
    /** The current file, one line per entry, without newlines. */
    readonly current: readonly string[];
    readonly deleted: boolean;
}

type ReadyDiffView = Extract<HappyUiDiffView, { type: "ready" }>;

/*
 * Parsing a change costs a full diff of both sides, and every diff node, row
 * sizing pass, and grounding rebuild asks again. A grounding hands over the
 * same immutable file object for as long as it holds that read, so both the
 * parse and each range's view are kept against it and released with it.
 */
const parsedChanges = new WeakMap<HappyUiChangedFile, ParsedChange>();
const rangeViews = new WeakMap<HappyUiChangedFile, Map<string, ReadyDiffView>>();

// The parser keeps each line's newline; the snippet draws one row per line.
const lineText = (text: string | undefined): string => (text ?? "").replace(/\r?\n$/u, "");

function changeParse(file: HappyUiChangedFile): ParsedChange {
    const cached = parsedChanges.get(file);
    if (cached !== undefined) return cached;
    const meta = parseDiffFromFile(
        { name: file.path, contents: file.oldContent },
        { name: file.path, contents: file.newContent },
    );
    const deleted = file.newContent.length === 0 && file.oldContent.length > 0;
    const entries: Ordered[] = [];
    const covered = new Set<number>();
    for (const hunk of meta.hunks) {
        for (const segment of hunk.hunkContent) {
            if (segment.type === "context") {
                for (let index = 0; index < segment.lines; index += 1) {
                    const number = segment.additionLineIndex + index + 1;
                    covered.add(number);
                    entries.push({
                        anchor: number,
                        order: 1,
                        line: {
                            kind: "context",
                            number,
                            text: lineText(meta.additionLines[segment.additionLineIndex + index]),
                        },
                    });
                }
                continue;
            }
            const insertion = segment.additionLineIndex + 1;
            for (let index = 0; index < segment.deletions; index += 1) {
                const number = segment.deletionLineIndex + index + 1;
                entries.push({
                    anchor: deleted ? number : insertion,
                    order: 0,
                    line: {
                        kind: "del",
                        number,
                        text: lineText(meta.deletionLines[segment.deletionLineIndex + index]),
                    },
                });
            }
            for (let index = 0; index < segment.additions; index += 1) {
                const number = segment.additionLineIndex + index + 1;
                covered.add(number);
                entries.push({
                    anchor: number,
                    order: 1,
                    line: {
                        kind: "add",
                        number,
                        text: lineText(meta.additionLines[segment.additionLineIndex + index]),
                    },
                });
            }
        }
    }
    const parsed: ParsedChange = {
        entries,
        covered,
        current: meta.additionLines.map(lineText),
        deleted,
    };
    parsedChanges.set(file, parsed);
    return parsed;
}

/**
 * The lines of a change inside a range of the file as it now stands:
 * additions and unchanged lines by their current number, deletions by their
 * old number, placed where they were taken out. A deleted file is read by its
 * old numbers, since it has no current ones.
 *
 * The same file object and range give back the same view, so a caller that
 * keeps its file object for as long as the read stands parses it once.
 */
export function happyUiDiffLines(file: HappyUiChangedFile, range: HappyUiLineRange): ReadyDiffView {
    const rangeKey = `${String(range.startLine)}:${String(range.endLine)}`;
    let views = rangeViews.get(file);
    const cached = views?.get(rangeKey);
    if (cached !== undefined) return cached;
    const { entries, covered, current, deleted } = changeParse(file);
    const inside = entries.filter(
        (entry) =>
            entry.anchor >= range.startLine &&
            entry.anchor <= (entry.order === 0 && !deleted ? range.endLine + 1 : range.endLine),
    );
    if (!deleted)
        for (let number = range.startLine; number <= range.endLine; number += 1) {
            if (covered.has(number) || number > current.length) continue;
            inside.push({
                anchor: number,
                order: 1,
                line: { kind: "context", number, text: current[number - 1] ?? "" },
            });
        }
    inside.sort((left, right) => left.anchor - right.anchor || left.order - right.order);
    let added = 0;
    let removed = 0;
    for (const entry of inside) {
        if (entry.line.kind === "add") added += 1;
        if (entry.line.kind === "del") removed += 1;
    }
    const lines = inside.slice(0, HAPPY_UI_DIFF_MAX_LINES).map((entry) => entry.line);
    const view: ReadyDiffView = {
        type: "ready",
        lines,
        hidden: inside.length - lines.length,
        added,
        removed,
    };
    if (views === undefined) {
        views = new Map();
        rangeViews.set(file, views);
    }
    views.set(rangeKey, view);
    return view;
}

/**
 * The lines a diff node paints for what the grounding answered, never fewer
 * than one: a change still loading, a file outside the change, a read that
 * failed, or a range with nothing changed in it each say so on a line of their
 * own. The block and the row model both draw from this, so they agree.
 */
export function happyUiDiffDisplayLines(
    view: HappyUiDiffView | undefined,
    /** The lines are code being explained, not a change: unchanged is the point. */
    explaining = false,
): readonly DiffLine[] {
    if (view === undefined) return [{ kind: "meta", text: "No change to show here." }];
    switch (view.type) {
        case "loading":
            return [{ kind: "meta", text: "Reading the change…" }];
        case "missing":
            return [
                {
                    kind: "meta",
                    text: explaining ? "No such file at this commit." : "Not part of this change.",
                },
            ];
        case "moved":
            return [
                { kind: "meta", text: "Not checked: the branch has moved on since the review." },
            ];
        case "error":
            return [{ kind: "meta", text: view.message }];
        case "ready": {
            if (view.lines.length === 0) return [{ kind: "meta", text: "No lines here." }];
            const lines =
                view.hidden === 0
                    ? view.lines
                    : [
                          ...view.lines,
                          {
                              kind: "meta" as const,
                              text:
                                  view.hidden === 1
                                      ? "1 more line in this range is not shown."
                                      : `${String(view.hidden)} more lines in this range are not shown.`,
                          },
                      ];
            if (view.added === 0 && view.removed === 0 && !explaining)
                return [...lines, { kind: "meta", text: "Nothing changed in these lines." }];
            return lines;
        }
    }
}
/**
 * What the grounding currently answers for every place a reply's fences
 * name, so a row is re-sized when a change finishes loading or the checkout
 * moves. Empty for a reply with no Happy fence in it.
 */
export function happyUiSignature(text: string, grounding: HappyUiGrounding | undefined): string {
    const document = guidedReviewDocument(text);
    if (document.fences.length === 0) return "";
    const own = happyUiGroundingOf(document, grounding);
    const diffPart = (path: string, lines: HappyUiLineRange): string => {
        if (own === undefined) return "unknown";
        const view = own.diff(path, lines, happyUiQuoteRange(document));
        if (view.type !== "ready") return view.type;
        // A long line wraps by its words, so the text itself is part of the
        // height; a hash keeps the key short.
        let hash = 0x811c9dc5;
        for (const line of view.lines)
            for (let at = 0; at < line.text.length; at += 1)
                hash = Math.imul(hash ^ line.text.charCodeAt(at), 0x01000193);
        return `ready:${String(view.lines.length)}:${String(view.hidden)}:${String(view.added)}:${String(view.removed)}:${(hash >>> 0).toString(36)}`;
    };
    const parts: string[] = [];
    for (const { parsed } of document.fences) {
        if (parsed.type !== "ready") continue;
        const fence = parsed.fence;
        if (fence.type === "diff") parts.push(diffPart(fence.path, fence.lines));
        if (fence.type === "finding" && fence.path !== undefined && fence.lines !== undefined)
            parts.push(diffPart(fence.path, fence.lines));
        if (fence.type === "files") {
            const files = happyUiChangedFilesOf(document, own);
            parts.push(
                files === undefined
                    ? "unknown"
                    : files.type === "ready"
                      ? `files:${happyUiFilesSelect(files.files, fence.paths)
                            .map((file) => file.path)
                            .join("\u0000")}`
                      : files.type === "unchecked"
                        ? `files:${files.reason}`
                        : files.type,
            );
        }
        if (fence.type === "review") {
            const coverage = happyUiCoverage(document, grounding);
            parts.push(happyUiCoverageSummary(coverage));
        }
    }
    return parts.join("\u0000");
}
