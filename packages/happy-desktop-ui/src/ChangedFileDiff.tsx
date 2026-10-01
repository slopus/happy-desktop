import { parseDiffFromFile, type SelectedLineRange } from "@pierre/diffs";
import { FileDiff, useStableCallback } from "@pierre/diffs/react";
import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Button } from "./Button";
import { CodeEditor } from "./CodeEditor";
import { DiffFileTitle } from "./DiffFileTitle";
import { CODE_BLOCK_HIGHLIGHT_CACHE_MAX_TEXT_LENGTH } from "./CodeBlock";
import { ScrollArea } from "./Scrollbar";
import { PIERRE_DIFF_HEADER_CSS, PIERRE_PANE_CSS } from "./pierreCodeSurface";
import { ReviewComment } from "./ReviewComment";
import { SegmentedControl } from "./SegmentedControl";

/**
 * How a changed file is being looked at.
 *
 * - `file` — the file as it now stands rather than the change to it: the
 *   document rendered, the picture shown, the text read and written. What the
 *   result reads like, which is the one question a diff cannot answer.
 * - `unified` — additions and deletions interleaved in one column.
 * - `split` — old and new side by side.
 *
 * There is no separate editing face. Reading a file and writing it were two
 * choices showing the same characters, one of which refused to accept any: a
 * reader who noticed a typo had to find the other tab to fix it.
 */
export type ChangedFileDiffMode = "file" | "unified" | "split";

export const CHANGED_FILE_DIFF_MODES: readonly ChangedFileDiffMode[] = ["file", "unified", "split"];

const MODE_LABELS: Record<ChangedFileDiffMode, string> = {
    file: "File",
    unified: "Unified",
    split: "Split",
};

export type ChangedFileDiffProps = {
    appearance: "dark" | "light";
    className?: string;
    "data-testid"?: string;
    loading?: boolean;
    newContent: string;
    oldContent: string;
    oldPath?: string;
    /** Stable identity for the saved/base side of the diff, when known. */
    oldCacheKey?: string;
    path: string;
    /** Stable loaded-document identity used by the edit mode's bounded state cache. */
    documentKey?: string;
    /** Stable identity for the working-tree side of the diff, when clean. */
    newCacheKey?: string;
    style?: CSSProperties;
    /** Which view is showing. Defaults to the unified diff. */
    mode?: ChangedFileDiffMode;
    onModeChange?: (mode: ChangedFileDiffMode) => void;
    /**
     * Whether long lines wrap to the pane instead of scrolling out of it, in
     * the diff and the editor alike. Defaults to scrolling, which keeps the
     * shape of the code.
     */
    wrap?: boolean;
    /**
     * Receives the reader's wrap choice. Without it there is nobody to hand
     * the choice to, so the toggle is not offered at all rather than offered
     * and silently inert.
     */
    onWrapChange?: (wrap: boolean) => void;
    /**
     * Receives edits to the working-tree text. Without it there is nobody to
     * hand an edit to, so the mode is not offered at all rather than offered
     * and silently inert.
     */
    onContentChange?: (content: string) => void;
    /** True while an edit is being written back; the field stays up and inert. */
    saving?: boolean;
    /** Keeps the edit draft available while disabling persistence. */
    saveDisabled?: boolean;
    /** Writes the pending edit back. */
    onSave?: () => void;
    /**
     * The file as it now stands, drawn by whatever the product opens a file
     * into. It is the caller's because a preview is a whole viewer — a rendered
     * document, a picture on its stage, a recording that plays — and this
     * component knows only about text and about diffs of text. Without one
     * there is nothing to show, so the mode is not offered at all rather than
     * offered over an empty pane; that is the honest answer for a file the
     * change deleted, which no longer has a copy to look at.
     */
    preview?: ReactNode;
    /**
     * Review notes to draw under the lines they are about, and the one being
     * written. Without `onCommentDraftOpen` there is nobody to hand a new note
     * to, so the gutter offers none and the diff reads exactly as it does now.
     */
    comments?: readonly ChangedFileDiffComment[];
    commentDraft?: ChangedFileDiffCommentDraft;
    onCommentDraftOpen?: (lineNumber: number, side: ChangedFileDiffCommentSide) => void;
    onCommentDraftUpdate?: (text: string) => void;
    onCommentDraftCancel?: () => void;
    onCommentDraftSubmit?: () => void;
    onCommentRemove?: (commentId: string) => void;
    /** Who the notes are from, for the line they are stated on. */
    commentAuthorInitials?: string;
    commentAuthorName?: string;
};

export type ChangedFileDiffCommentSide = "deletions" | "additions";

export type ChangedFileDiffComment = {
    readonly id: string;
    readonly lineNumber: number;
    readonly side: ChangedFileDiffCommentSide;
    readonly text: string;
    readonly stale?: boolean;
};

export type ChangedFileDiffCommentDraft = {
    readonly lineNumber: number;
    readonly side: ChangedFileDiffCommentSide;
    readonly text: string;
};

/**
 * What one annotation carries. The renderer is generic over this and hands it
 * back verbatim, so a note travels to its own row as itself rather than being
 * looked up again by the position it was drawn at.
 */
type ChangedFileDiffAnnotation =
    | { readonly type: "comment"; readonly comment: ChangedFileDiffComment }
    | { readonly type: "draft" };

/**
 * C-237 ChangedFileDiff — a complete working-tree diff surface. Pierre Diffs
 * owns parsing, syntax highlighting, hunk expansion, and line layout; Happy owns
 * the product boundary, the view modes, and the colors.
 *
 * Preview is not one of Pierre's: the file as it now stands is a whole file, and
 * a whole file is what the product's file preview already shows. It arrives as a
 * slot so a changed Markdown document reads as the document rather than as a
 * diff against itself, which is all this renderer with nothing to compare
 * against could ever produce.
 *
 * The colors are the theme's own. Pierre derives every diff surface by mixing
 * one accent per side into the page background, so pointing those two accents
 * and that background at Happy's `--diff-*` tokens is all it takes for the
 * full-file view and the inline `DiffSnippet` to agree — rather than the
 * full-file view carrying a second palette that merely resembles the first.
 */
export function ChangedFileDiff(props: ChangedFileDiffProps) {
    const editable = props.onContentChange !== undefined;
    const previewable = props.preview !== undefined;
    // A change that deleted the file left no copy of it: nothing to read and
    // nothing to write, so the file itself is not offered.
    const segments = CHANGED_FILE_DIFF_MODES.filter((candidate) =>
        candidate === "file" ? previewable || editable : true,
    ).map((candidate) => ({ value: candidate, label: MODE_LABELS[candidate] }));
    // Which view is on is remembered across files, so the one that was chosen
    // may not exist for the file that is now open — a deleted file has no copy
    // left to read. It falls back to the diff, which is the only thing such a
    // file still has, rather than leaving the switch pointing at a mode this
    // pane cannot draw.
    const commenting = props.onCommentDraftOpen !== undefined;
    const requested = props.mode ?? "unified";
    const mode = segments.some((segment) => segment.value === requested) ? requested : "unified";
    const newContent = props.newContent;
    // Parsing the patch is synchronous. Keep its inputs stable across unrelated
    // workspace notifications while this diff remains mounted; switching files
    // remounts it intentionally, and Pierre cache keys cover that lifetime
    // boundary. Contents, names, and cache keys are the identity contract.
    const newCacheKey =
        newContent.length <= CODE_BLOCK_HIGHLIGHT_CACHE_MAX_TEXT_LENGTH
            ? props.newCacheKey
            : undefined;
    const oldCacheKey =
        props.oldContent.length <= CODE_BLOCK_HIGHLIGHT_CACHE_MAX_TEXT_LENGTH
            ? props.oldCacheKey
            : undefined;
    const newFile = useMemo(
        () => ({
            name: props.path,
            contents: newContent,
            ...(newCacheKey === undefined ? {} : { cacheKey: newCacheKey }),
        }),
        [newCacheKey, newContent, props.path],
    );
    const oldFile = useMemo(
        () => ({
            name: props.oldPath ?? props.path,
            contents: props.oldContent,
            ...(oldCacheKey === undefined ? {} : { cacheKey: oldCacheKey }),
        }),
        [oldCacheKey, props.oldContent, props.oldPath, props.path],
    );
    const diff = useMemo(() => {
        if (mode !== "unified" && mode !== "split") return undefined;
        const value = parseDiffFromFile(oldFile, newFile);
        // Keep unkeyed documents out of Happy's reusable warm-cache gate. Pierre
        // may assign an internal fallback key once it renders them, so this path
        // deliberately remains plain-first rather than pretending it is a
        // content-addressed saved document.
        if (oldCacheKey === undefined || newCacheKey === undefined) value.cacheKey = undefined;
        return value;
    }, [mode, newCacheKey, newFile, oldCacheKey, oldFile]);
    // The gutter button reports the line it was pressed beside as a one-line
    // selection. A note is about one line, so the range's start is its address;
    // the unified column with no side of its own is the working-tree column,
    // which is where a note left on an unchanged line belongs.
    const gutterUtilityClicked = useStableCallback((range: SelectedLineRange) => {
        props.onCommentDraftOpen?.(range.start, range.side ?? "additions");
    });
    /**
     * Which lines are marked, held here rather than inside the renderer.
     *
     * Selecting lines is how a note is aimed: dragging the line numbers, or
     * dragging the gutter button down a run of them. The renderer then keeps its
     * button on that selection rather than under the pointer — right while the
     * note is being written, wrong once it is done, because every other line
     * stops offering one until something lets go. This surface draws a diff
     * rather than a code view and so has no handle to let go with, so the
     * selection is ours to hold and ours to drop.
     */
    const [selection, selectionSet] = useState<SelectedLineRange | null>(null);
    const selectionChanged = useStableCallback((range: SelectedLineRange | null) => {
        selectionSet(range);
    });

    const diffOptions = useMemo(
        () => ({
            diffIndicators: "bars" as const,
            diffStyle: mode === "split" ? ("split" as const) : ("unified" as const),
            hunkSeparators: "line-info-basic" as const,
            // Off by default in the renderer, which leaves a long line of code
            // with nothing tying it to its own line number across the width of
            // the pane. Both, so the number and the row light up together and
            // the eye can travel between them.
            lineHoverHighlight: "both" as const,
            lineDiffType: "word-alt" as const,
            overflow: props.wrap === true ? ("wrap" as const) : ("scroll" as const),
            stickyHeader: true,
            theme: {
                dark: "pierre-dark" as const,
                light: "pierre-light" as const,
            },
            themeType: props.appearance,
            unsafeCSS: PIERRE_PANE_CSS + PIERRE_DIFF_HEADER_CSS,
            // The gutter affordance exists only where a note can actually be
            // started, so a surface with no handler shows no plus. The renderer
            // draws and places the button itself — a filled chip over the line
            // number, the way one is drawn everywhere else this gesture exists —
            // so only where it leads is ours.
            enableGutterUtility: commenting,
            onGutterUtilityClick: gutterUtilityClicked,
            // Reported while the selection is being dragged and again when it
            // settles, so what is marked on screen is what this holds.
            onLineSelectionChange: selectionChanged,
            onLineSelected: selectionChanged,
        }),
        [commenting, gutterUtilityClicked, mode, props.appearance, props.wrap, selectionChanged],
    );
    // Walking the change itself, rather than the scrollbar. A long file is
    // mostly unchanged, so scrolling it is scrolling past everything nobody
    // opened it for.
    //
    // The renderer draws the rows and owns them, so the runs of changed lines it
    // drew are read back from what is on screen rather than a position being
    // computed for a row and hoped to be where it landed. Consecutive changed
    // rows are one change: a deletion and the addition replacing it are the same
    // edit, and counting them apart would make every rewritten line two stops.
    const viewportRef = useRef<HTMLDivElement>(null);
    /** Drops the marked lines, once the note they were aimed at is done with. */
    const selectionRelease = (): void => {
        selectionSet(null);
    };
    const changeStarts = (): HTMLElement[] => {
        const host = viewportRef.current?.querySelector(".happy-changed-file-diff__renderer");
        const shadow = host?.shadowRoot;
        if (!shadow) return [];
        const starts: HTMLElement[] = [];
        let inRun = false;
        for (const row of shadow.querySelectorAll<HTMLElement>("[data-column-number]")) {
            const changed = row.getAttribute("data-line-type")?.startsWith("change-") === true;
            if (changed && !inRun) starts.push(row);
            inRun = changed;
        }
        return starts;
    };
    const changeGo = (direction: -1 | 1): void => {
        const viewport = viewportRef.current;
        if (viewport === null) return;
        // A change already at the top of the pane is the one being read, not the
        // one to travel to, so "next" is the first that begins below it.
        const edge = viewport.getBoundingClientRect().top + 4;
        const starts = changeStarts();
        const above = starts.filter((start) => start.getBoundingClientRect().top < edge - 4);
        const target =
            direction === 1
                ? starts.find((start) => start.getBoundingClientRect().top > edge + 4)
                : above[above.length - 1];
        if (target === undefined) return;
        viewport.scrollTop += target.getBoundingClientRect().top - edge;
    };
    // One annotation per note, plus the one being written. Pierre addresses
    // them by side and line, which is the same address the notes carry, so
    // nothing here reconstructs a position.
    // Where the notes go. Only their positions live here, never the text being
    // typed into one: the renderer re-places every annotation whenever this
    // array changes, so carrying the draft's characters in it would redraw the
    // whole file's annotations on each keystroke. The note itself is ordinary
    // React below, and reads the current draft straight from props.
    const draftLine = props.commentDraft?.lineNumber;
    const draftSide = props.commentDraft?.side;
    const lineAnnotations = useMemo(() => {
        if (!commenting) return undefined;
        const built = (props.comments ?? []).map((comment) => ({
            side: comment.side,
            lineNumber: comment.lineNumber,
            metadata: { type: "comment" as const, comment },
        }));
        return draftLine === undefined || draftSide === undefined
            ? built
            : [
                  ...built,
                  {
                      side: draftSide,
                      lineNumber: draftLine,
                      metadata: { type: "draft" as const },
                  },
              ];
    }, [commenting, draftLine, draftSide, props.comments]);
    return (
        <section
            aria-label={`Changes in ${props.path}`}
            className={["happy-changed-file-diff", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="changed-file-diff"
            data-mode={mode}
            data-testid={props["data-testid"]}
            style={props.style}
        >
            <div
                className="happy-changed-file-diff__bar"
                data-happy-desktop-ui="changed-file-diff-bar"
            >
                <SegmentedControl
                    aria-label="How this changed file is shown"
                    onChange={(value) => props.onModeChange?.(value as ChangedFileDiffMode)}
                    segments={segments}
                    size="compact"
                    value={mode}
                />
                <span className="happy-changed-file-diff__bar-end">
                    {props.loading || props.saving ? (
                        <span
                            aria-live="polite"
                            className="happy-changed-file-diff__updating"
                            data-happy-desktop-ui="changed-file-diff-updating"
                        >
                            {props.saving ? "Saving…" : "Updating…"}
                        </span>
                    ) : null}
                    {/* Only where there is a diff drawn to walk. Preview has no
                        rows, and the editor is being typed in rather than read
                        through. */}
                    {mode === "unified" || mode === "split" ? (
                        <span className="happy-changed-file-diff__steps">
                            <Button
                                aria-label="Previous change"
                                data-testid="changed-file-diff-previous-change"
                                icon="chevron-up"
                                iconOnly
                                onClick={() => changeGo(-1)}
                                size="small"
                                variant="ghost"
                            />
                            <Button
                                aria-label="Next change"
                                data-testid="changed-file-diff-next-change"
                                icon="chevron-down"
                                iconOnly
                                onClick={() => changeGo(1)}
                                size="small"
                                variant="ghost"
                            />
                        </span>
                    ) : null}
                    {/* Wrap is a fact about lines of source — the diff's or the
                        editor's — and the file face is mostly source, so the
                        toggle stays. A rendered document ignores it, having no
                        lines to wrap. */}
                    {props.onWrapChange !== undefined ? (
                        <SegmentedControl
                            aria-label="Whether long lines wrap"
                            data-testid="changed-file-diff-wrap"
                            onChange={(value) => props.onWrapChange?.(value === "wrap")}
                            segments={[
                                { value: "wrap", label: "Wrap" },
                                { value: "scroll", label: "No wrap" },
                            ]}
                            size="compact"
                            value={props.wrap === true ? "wrap" : "scroll"}
                        />
                    ) : null}
                </span>
            </div>

            <ScrollArea
                className="happy-changed-file-diff__body"
                data-happy-desktop-ui="changed-file-diff-body"
                placement="overlay"
                viewportClassName="happy-changed-file-diff__viewport"
                viewportRef={viewportRef}
            >
                {mode === "file" ? (
                    // The caller's preview is the whole file surface — rendered
                    // face, source, and the editor inside it — so it wins where
                    // there is one. Without it, the file is its text.
                    (props.preview ?? (
                        <CodeEditor
                            className="happy-changed-file-diff__editor"
                            documentKey={props.documentKey}
                            name={props.path}
                            // The shortcut every editor has. Without it the only way
                            // to save is to stop typing and reach for a button,
                            // which is not how anyone edits a file.
                            onSave={() => {
                                if (!props.saveDisabled) props.onSave?.();
                            }}
                            onValueChange={(content) => props.onContentChange?.(content)}
                            readOnly={props.saving === true}
                            value={props.newContent}
                            wrap={props.wrap}
                        />
                    ))
                ) : diff === undefined ? null : (
                    <FileDiff<ChangedFileDiffAnnotation>
                        className="happy-changed-file-diff__renderer happy-diff-surface"
                        fileDiff={diff}
                        options={diffOptions}
                        selectedLines={selection}
                        // The whole header name, ours, through the slot the
                        // renderer leaves ahead of its own. The renderer's mark
                        // and title stand down in `PIERRE_DIFF_HEADER_CSS`.
                        renderHeaderPrefix={() => (
                            <DiffFileTitle
                                path={props.path}
                                {...(props.oldPath === undefined || props.oldPath === props.path
                                    ? {}
                                    : { previousPath: props.oldPath })}
                            />
                        )}
                        {...(lineAnnotations === undefined ? {} : { lineAnnotations })}
                        {...(commenting
                            ? {
                                  renderAnnotation: (annotation) => {
                                      const held = annotation.metadata;
                                      const author = {
                                          // One letter, because that is what
                                          // fits an avatar and what an
                                          // initial is; the whole word is
                                          // for the line beside it.
                                          authorInitials: props.commentAuthorInitials ?? "Y",
                                          authorName: props.commentAuthorName ?? "You",
                                      };
                                      // The draft's characters are read here
                                      // rather than carried through the
                                      // annotation, so typing one redraws
                                      // this note and nothing else.
                                      if (held.type === "draft")
                                          return props.commentDraft === undefined ? null : (
                                              <ReviewComment
                                                  {...author}
                                                  draft={props.commentDraft.text}
                                                  lineNumber={props.commentDraft.lineNumber}
                                                  onCancel={() => {
                                                      selectionRelease();
                                                      props.onCommentDraftCancel?.();
                                                  }}
                                                  onDraftChange={(text) =>
                                                      props.onCommentDraftUpdate?.(text)
                                                  }
                                                  onSubmit={() => {
                                                      selectionRelease();
                                                      props.onCommentDraftSubmit?.();
                                                  }}
                                                  side={props.commentDraft.side}
                                              />
                                          );
                                      return (
                                          <ReviewComment
                                              {...author}
                                              lineNumber={held.comment.lineNumber}
                                              onRemove={() =>
                                                  props.onCommentRemove?.(held.comment.id)
                                              }
                                              side={held.comment.side}
                                              stale={held.comment.stale}
                                              text={held.comment.text}
                                          />
                                      );
                                  },
                              }
                            : {})}
                    />
                )}
            </ScrollArea>
        </section>
    );
}
