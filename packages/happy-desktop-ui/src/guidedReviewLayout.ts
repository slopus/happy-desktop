import { changedFileListShown } from "./ChangedFileList";
import { flowGraphLayout, flowMarks, flowPaintedHeight, flowParse } from "./flowDiagramLayout";
import { flowSequenceLayout } from "./sequenceDiagramLayout";
import { reviewDiffRows } from "./reviewDiffLayout";
import {
    guidedReviewFenceParse,
    type GuidedReviewDocument,
    type GuidedReviewFenceLabel,
} from "./guidedReview";
import {
    HAPPY_UI_COVERAGE_PENDING,
    happyUiCoverage,
    happyUiCoverageSummary,
    happyUiChangedFilesOf,
    happyUiDiffDisplayLines,
    happyUiQuoteRange,
    happyUiFilesSelect,
    happyUiGroundingOf,
    type HappyUiGrounding,
} from "./happyUiGrounding";

/*
 * Painted height of each Happy fence, resolved before it mounts.
 *
 * Every constant mirrors the component stylesheets: `review-diff.css`,
 * `changed-file-list.css`, `flow-diagram.css`, `review-finding.css`, and
 * `guided-review.css`. They are duplicated deliberately: reading them from the
 * cascade needs a mounted element, which is the thing the row model exists to
 * avoid. Change one and change the other.
 */

/** The line a fence shows while it is still being written. */
export const GUIDED_REVIEW_WRITING_LINE = 24;
/** A one-line state in place of a component: coverage, a file list not read yet. */
const NOTE_SIZE = 13;
const NOTE_LINE = 20;
/** `.happy-review-invalid`: its reason above the fence's source. */
const REASON_SIZE = 14;
const REASON_LINE = 20;
const REASON_GAP = 8;
/** `ReviewDiff`: border, header, code padding, row. */
const DIFF_BORDER = 2;
const DIFF_HEADER = 36;
const DIFF_PADDING = 12;
const DIFF_LINE = 20;
/** `ChangedFileList`: summary, gap, and a folder's or a file's row. */
const FILES_SUMMARY = 20;
const FILES_GAP = 4;
const FILES_ROW = 28;
/** `FlowDiagram`: legend and gap above the drawing. */
const FLOW_LEGEND = 16;
const FLOW_GAP = 8;
/** `ReviewFinding`: severity line, the gaps inside it. */
const FINDING_SEVERITY = 16;
const FINDING_HEADER_GAP = 2;
const FINDING_TITLE_SIZE = 16;
const FINDING_TITLE_LINE = 24;
const FINDING_GAP = 8;
/** `ReviewVerdict`: the row of counts, then the words. */
const VERDICT_COUNTS = 20;
const VERDICT_GAP = 6;
/** Before/after: two frames 12px apart, each labelled, 16:10. */
const PICTURE_GAP = 12;
const PICTURE_LABEL = 16;
const PICTURE_LABEL_GAP = 4;
const PICTURE_RATIO = 10 / 16;
const PICTURE_TEXT_GAP = 8;

export interface GuidedReviewMeasure {
    /** Wrapped height of plain UI-font text. */
    text(text: string, size: number, weight: number, lineHeight: number, width: number): number;
    /** Height of Markdown drawn as a message body at `width`. */
    markdown(text: string, width: number): number;
    /** Height of the fence's source drawn as an ordinary code block. */
    code(source: string): number;
    /**
     * Rows one line of 12px code takes as `pre-wrap` breaks it: its first row
     * `first` wide, every later row `rest` wide.
     */
    codeRows(text: string, first: number, rest: number): number;
    readonly grounding?: HappyUiGrounding;
    readonly document: GuidedReviewDocument;
}

export function reviewDiffHeight(rows: number): number {
    return DIFF_BORDER + DIFF_HEADER + DIFF_PADDING + rows * DIFF_LINE;
}

/** A row for each folder and one for each file under it. */
export function changedFileListHeight(files: readonly { readonly path: string }[]): number {
    // As it first draws: folded, when it is long.
    const shown = changedFileListShown(files, false);
    const rows = shown.groups.reduce((sum, group) => sum + 1 + group.files.length, 0);
    // The row that opens the rest follows the rows, the list's gap apart.
    const more = shown.hidden === 0 ? 0 : FILES_GAP + FILES_ROW;
    return FILES_SUMMARY + FILES_GAP + rows * FILES_ROW + more;
}

/** Height of one Happy fence drawn `width` wide. */
export function guidedReviewFenceHeight(
    label: GuidedReviewFenceLabel,
    source: string,
    open: boolean,
    /** The reply is still arriving, so what it covers is not known yet. */
    streaming: boolean,
    width: number,
    measure: GuidedReviewMeasure,
): number {
    if (open) return GUIDED_REVIEW_WRITING_LINE;
    const parsed = guidedReviewFenceParse(label, source);
    if (parsed.type === "invalid")
        return (
            measure.text(
                `This block could not be drawn: ${parsed.reason}`,
                REASON_SIZE,
                400,
                REASON_LINE,
                width,
            ) +
            REASON_GAP +
            measure.code(source)
        );
    const document = measure.document;
    const grounding = happyUiGroundingOf(document, measure.grounding);
    const note = (text: string, at = width) => measure.text(text, NOTE_SIZE, 400, NOTE_LINE, at);
    const diff = (path: string, lines: { startLine: number; endLine: number }, at = width) =>
        reviewDiffHeight(
            reviewDiffRows(
                happyUiDiffDisplayLines(
                    grounding?.diff(path, lines, happyUiQuoteRange(document)),
                    document.commit !== undefined,
                ),
                at,
                measure.codeRows,
            ),
        );
    const fence = parsed.fence;
    switch (fence.type) {
        case "review":
            return note(
                streaming
                    ? HAPPY_UI_COVERAGE_PENDING
                    : happyUiCoverageSummary(happyUiCoverage(document, measure.grounding)),
            );
        case "diff":
            return diff(fence.path, fence.lines);
        case "files": {
            const files = happyUiChangedFilesOf(document, grounding);
            if (files?.type !== "ready") return note(changedFilesNote(files));
            return changedFileListHeight(happyUiFilesSelect(files.files, fence.paths));
        }
        case "flow": {
            const flow = flowParse(fence.source);
            if (flow.type === "invalid")
                return measure.text(
                    `This flow could not be drawn: ${flow.reason}`,
                    REASON_SIZE,
                    400,
                    REASON_LINE,
                    width,
                );
            const marked = flowMarks(flow.graph).length > 0;
            return (
                (marked ? FLOW_LEGEND + FLOW_GAP : 0) +
                flowPaintedHeight(
                    fence.layout === "graph"
                        ? flowGraphLayout(flow.graph)
                        : flowSequenceLayout(flow.graph),
                    width,
                )
            );
        }
        case "finding": {
            let height =
                FINDING_SEVERITY +
                FINDING_HEADER_GAP +
                measure.text(fence.title, FINDING_TITLE_SIZE, 600, FINDING_TITLE_LINE, width);
            if (fence.body.length > 0) height += FINDING_GAP + measure.markdown(fence.body, width);
            if (fence.path !== undefined && fence.lines !== undefined)
                height += FINDING_GAP + diff(fence.path, fence.lines);
            return height;
        }
        case "verdict":
            return (
                VERDICT_COUNTS +
                (fence.body.length > 0 ? VERDICT_GAP + measure.markdown(fence.body, width) : 0)
            );
        case "beforeAfter": {
            const side = (width - PICTURE_GAP) / 2;
            return (
                PICTURE_LABEL +
                PICTURE_LABEL_GAP +
                side * PICTURE_RATIO +
                (fence.body.length > 0 ? PICTURE_TEXT_GAP + measure.markdown(fence.body, width) : 0)
            );
        }
    }
}

/** The line a file list shows while it cannot list anything. */
export function changedFilesNote(
    files: ReturnType<HappyUiGrounding["changedFiles"]> | undefined,
): string {
    if (files === undefined) return "No change to list files from.";
    switch (files.type) {
        case "ready":
            return "";
        case "loading":
            return "Reading the change…";
        case "unchecked":
            switch (files.reason) {
                case "range":
                    return "This Happy Agent cannot list the files between these two commits.";
                case "truncated":
                    return "The change has more files than the checkout lists.";
                case "unavailable":
                    return "This checkout's changes cannot be listed.";
            }
    }
}
