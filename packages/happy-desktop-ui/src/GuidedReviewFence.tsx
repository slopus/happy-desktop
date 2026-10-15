import { type ReactNode } from "react";
import { ChangedFileList } from "./ChangedFileList";
import { diffSnippetLanguage } from "./diffSnippetHighlight";
import { type FileOpenHandler } from "./fileReference";
import { FlowDiagram } from "./FlowDiagram";
import {
    guidedReviewFenceParse,
    type GuidedReviewDocument,
    type GuidedReviewFenceLabel,
    type HappyUiImage,
    type HappyUiLineRange,
} from "./guidedReview";
import { changedFilesNote } from "./guidedReviewLayout";
import {
    HAPPY_UI_COVERAGE_PENDING,
    happyUiCoverage,
    happyUiCoverageSummary,
    happyUiChangedFilesOf,
    happyUiDiffDisplayLines,
    happyUiQuoteRange,
    happyUiFilesSelect,
    happyUiGroundingOf,
    happyUiImageMessage,
    type HappyUiGrounding,
} from "./happyUiGrounding";
import { useMessageListReveal } from "./messageListDisclosureAnchor";
import { ReviewDiff } from "./ReviewDiff";
import { ReviewFinding, ReviewVerdict } from "./ReviewFinding";
import { ShimmerText } from "./ShimmerText";

export type GuidedReviewFenceProps = {
    label: GuidedReviewFenceLabel;
    /** The fence's text. */
    source: string;
    /** The fence is still being written: one quiet line stands in for it. */
    open: boolean;
    /** The reply is still arriving, so what it covers is not said yet. */
    streaming: boolean;
    /** What the reply's fences say about the reply as a whole. */
    document: GuidedReviewDocument;
    /** The real change behind the reply; absent, nothing is claimed about files. */
    grounding?: HappyUiGrounding;
    onFileOpen?: FileOpenHandler;
    /** Opens a before/after picture full size, where its artifact opens. */
    onImageOpen?: (image: HappyUiImage) => void;
    /** Draws a fence's free text as the reply's own Markdown. */
    markdown: (text: string) => ReactNode;
    /** The fence's source as an ordinary code block, shown when it cannot be read. */
    sourceBlock: ReactNode;
    /** Freezes the writing line's shimmer, for a fixture photographed the same each time. */
    shimmerPhase?: number;
};

/** One quiet line in the flow of the reply. */
const Note = ({ children }: { children: string }) => (
    <p className="happy-review-block happy-review-note" data-happy-desktop-ui="review-note">
        {children}
    </p>
);

/**
 * One side's screenshot in a fixed 16:10 frame, the picture contained inside
 * it, so the row is sized before the picture loads and never moves after.
 */
const Picture = ({
    image,
    label,
    grounding,
    onImageOpen,
}: {
    image: HappyUiImage | undefined;
    label: string;
    grounding: HappyUiGrounding | undefined;
    onImageOpen: ((image: HappyUiImage) => void) | undefined;
}) => {
    const view = image === undefined ? undefined : grounding?.image(image);
    const openable = image !== undefined && view?.type === "ready" && onImageOpen !== undefined;
    return (
        <div className="happy-review-before-after__side">
            <span className="happy-review-before-after__label">{label}</span>
            <button
                aria-label={openable ? `Open the ${label.toLowerCase()} picture` : undefined}
                className="happy-review-before-after__picture"
                data-openable={openable ? "" : undefined}
                disabled={!openable}
                onClick={openable ? () => onImageOpen(image) : undefined}
                type="button"
            >
                {view?.type === "ready" ? (
                    <img alt={label} decoding="async" draggable={false} src={view.url} />
                ) : (
                    <span className="happy-review-before-after__message">
                        {image === undefined ? "No picture." : happyUiImageMessage(view)}
                    </span>
                )}
            </button>
        </div>
    );
};

/**
 * One Happy fence of a guided review, drawn with Happy's components and the
 * real change: every line, count, and status is read from the grounding, and
 * what the fence says is only where to look and what to say about it.
 * Mirrored by `guidedReviewFenceHeight`.
 */
export function GuidedReviewFence(props: GuidedReviewFenceProps) {
    const reveal = useMessageListReveal();
    if (props.open)
        return (
            <ShimmerText
                className="happy-review-block happy-review-writing"
                data-happy-desktop-ui="review-writing"
                tone="muted"
                {...(props.shimmerPhase === undefined ? {} : { phase: props.shimmerPhase })}
            >
                Writing…
            </ShimmerText>
        );
    const parsed = guidedReviewFenceParse(props.label, props.source);
    if (parsed.type === "invalid")
        return (
            <div
                className="happy-review-block happy-review-invalid"
                data-happy-desktop-ui="review-invalid"
            >
                <p className="happy-review-invalid__reason">
                    This block could not be drawn: {parsed.reason}
                </p>
                {props.sourceBlock}
            </div>
        );
    const document = props.document;
    const grounding = happyUiGroundingOf(document, props.grounding);
    const listed = happyUiChangedFilesOf(document, grounding);
    const explaining = document.commit !== undefined;
    const quote = (path: string, lines: HappyUiLineRange, className?: string) => {
        const view = grounding?.diff(path, lines, happyUiQuoteRange(document));
        const language = diffSnippetLanguage(path);
        const file =
            listed?.type === "ready"
                ? listed.files.find((entry) => entry.path === path)
                : undefined;
        // The whole file's counts, the same the file list shows for it; the
        // quoted lines are only a part of them.
        const counted = file?.added !== undefined && file.removed !== undefined;
        const onFileOpen = props.onFileOpen;
        return (
            <ReviewDiff
                lines={happyUiDiffDisplayLines(view, explaining)}
                path={path}
                {...(className === undefined ? {} : { className })}
                {...(language === undefined ? {} : { language })}
                {...(file?.status === undefined ? {} : { status: file.status })}
                {...(counted && !explaining
                    ? { stats: { added: file.added ?? 0, removed: file.removed ?? 0 } }
                    : {})}
                {...(onFileOpen === undefined ? {} : { onOpen: () => onFileOpen(path, lines) })}
            />
        );
    };
    const fence = parsed.fence;
    switch (fence.type) {
        case "review":
            return (
                <Note>
                    {props.streaming
                        ? HAPPY_UI_COVERAGE_PENDING
                        : happyUiCoverageSummary(happyUiCoverage(document, props.grounding))}
                </Note>
            );
        case "diff":
            return quote(fence.path, fence.lines, "happy-review-block");
        case "files": {
            if (listed?.type !== "ready") return <Note>{changedFilesNote(listed)}</Note>;
            const onFileOpen = props.onFileOpen;
            return (
                <ChangedFileList
                    className="happy-review-block"
                    files={happyUiFilesSelect(listed.files, fence.paths)}
                    {...(onFileOpen === undefined
                        ? {}
                        : { onFileOpen: (path: string) => onFileOpen(path) })}
                />
            );
        }
        case "flow":
            return (
                <FlowDiagram
                    className="happy-review-block"
                    layout={fence.layout}
                    onChapterOpen={(chapter, chip) => {
                        // The chapter is in the same reply as the drawing.
                        const section = chip
                            .closest(".happy-message__body--markdown")
                            ?.querySelector<HTMLElement>(
                                `.happy-review-section[data-chapter="${String(chapter)}"]`,
                            );
                        if (section === null || section === undefined) return;
                        if (reveal === undefined) section.scrollIntoView({ block: "start" });
                        else reveal(section);
                    }}
                    source={fence.source}
                />
            );
        case "finding":
            return (
                <ReviewFinding
                    className="happy-review-block"
                    severity={fence.severity}
                    title={fence.title}
                    {...(fence.path !== undefined && fence.lines !== undefined
                        ? { quote: quote(fence.path, fence.lines) }
                        : {})}
                >
                    {fence.body.length > 0 ? props.markdown(fence.body) : undefined}
                </ReviewFinding>
            );
        case "verdict":
            return (
                <ReviewVerdict className="happy-review-block" severities={document.severities}>
                    {fence.body.length > 0 ? props.markdown(fence.body) : undefined}
                </ReviewVerdict>
            );
        case "beforeAfter":
            return (
                <div
                    className="happy-review-block happy-review-before-after"
                    data-happy-desktop-ui="review-before-after"
                >
                    <div className="happy-review-before-after__sides">
                        <Picture
                            grounding={grounding}
                            image={fence.before}
                            label="Before"
                            onImageOpen={props.onImageOpen}
                        />
                        <Picture
                            grounding={grounding}
                            image={fence.after}
                            label="After"
                            onImageOpen={props.onImageOpen}
                        />
                    </div>
                    {fence.body.length > 0 ? props.markdown(fence.body) : null}
                </div>
            );
    }
}
