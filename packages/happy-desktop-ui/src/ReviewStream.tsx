import { parseDiffFromFile, type SelectedLineRange } from "@pierre/diffs";
import { CodeView, useStableCallback, type CodeViewHandle } from "@pierre/diffs/react";
import { useCallback, useMemo, useRef, useState, type CSSProperties } from "react";
import { Banner } from "./Banner";
import { Button } from "./Button";
import { DiffFileTitle } from "./DiffFileTitle";
import {
    PIERRE_DIFF_HEADER_CLICK_CSS,
    PIERRE_DIFF_HEADER_CSS,
    PIERRE_PANE_CSS,
} from "./pierreCodeSurface";
import { ReviewComment } from "./ReviewComment";
import { SegmentedControl } from "./SegmentedControl";
import { ReviewStreamFileActions } from "./ReviewStreamFileActions";
import type { ChangedFileDiffCommentSide } from "./ChangedFileDiff";

/** One changed file, as the stream needs it: both sides and where it came from. */
export type ReviewStreamFile = {
    readonly path: string;
    /** The path before a rename, when Git reports one. */
    readonly oldPath?: string;
    readonly oldContent: string;
    readonly newContent: string;
    /** Identity of each side, when the content is known to be unmodified since. */
    readonly oldCacheKey?: string;
    readonly newCacheKey?: string;
};

/** A note in the stream. Unlike one file's notes, this one says which file. */
export type ReviewStreamComment = {
    readonly id: string;
    readonly path: string;
    readonly lineNumber: number;
    readonly side: ChangedFileDiffCommentSide;
    readonly text: string;
    readonly stale?: boolean;
};

export type ReviewStreamCommentDraft = {
    readonly path: string;
    readonly lineNumber: number;
    readonly side: ChangedFileDiffCommentSide;
    readonly text: string;
};

/** Which file of a too-large change is on screen, and how to leave it. */
export type ReviewStreamSingleFile = {
    /** Where this file sits in the change, counting from one. */
    readonly index: number;
    readonly onPrevious: () => void;
    readonly onNext: () => void;
};

export type ReviewStreamProps = {
    appearance: "dark" | "light";
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    /**
     * Every changed file, in the order the review should read them. The stream
     * renders one scroll for all of them rather than one pane per file, so a
     * change that spans four files is read the way it was made.
     */
    files: readonly ReviewStreamFile[];
    /**
     * How many files the change has in total. The same as the number of files
     * given, except where the change is read one file at a time and the count
     * belongs to the change rather than to what is on screen.
     */
    total?: number;
    /**
     * Set when the change is too large to draw in one scroll and is being read
     * a file at a time. `files` then holds that one file, and this says which
     * of the change's files it is and what the steps either side of it do.
     */
    singleFile?: ReviewStreamSingleFile;
    /**
     * Files the checkout would not give up, by path. A file that failed to read
     * has no diff to draw, and a stream that simply leaves it out is a review
     * quietly missing part of its own change.
     */
    failures?: readonly string[];
    /** Reads the failed files again. */
    onFailuresRetry?: () => void;
    /** Files shown as a header only, by path. */
    collapsed?: ReadonlySet<string>;
    /** Files the reviewer has said they are done with, by path. */
    viewed?: ReadonlySet<string>;
    /** Closes an open file or opens a closed one. */
    onFileCollapsedToggle?: (path: string) => void;
    /**
     * Marks a file reviewed or takes the mark off. Whoever answers decides what
     * that does to the file being open, which is not the same in both
     * directions.
     */
    onFileViewedToggle?: (path: string) => void;
    /** Opens one file of the change on its own, away from the stream. */
    onFileOpen?: (path: string) => void;
    /** Closes every file at once, or opens every one. */
    onFilesCollapsedSet?: (collapsed: boolean) => void;
    /** How every diff in the stream is drawn. */
    view?: "unified" | "split";
    onViewChange?: (view: "unified" | "split") => void;
    /** Whether long lines wrap to the pane instead of scrolling out of it. */
    wrap?: boolean;
    onWrapChange?: (wrap: boolean) => void;
    /** Notes already written, and the one being written. */
    comments?: readonly ReviewStreamComment[];
    commentDraft?: ReviewStreamCommentDraft;
    onCommentDraftOpen?: (
        path: string,
        lineNumber: number,
        side: ChangedFileDiffCommentSide,
    ) => void;
    onCommentDraftUpdate?: (text: string) => void;
    onCommentDraftCancel?: () => void;
    onCommentDraftSubmit?: () => void;
    onCommentRemove?: (commentId: string) => void;
    commentAuthorInitials?: string;
    commentAuthorName?: string;
};

/** What one annotation carries, handed back by the renderer verbatim. */
type ReviewStreamAnnotation =
    | { readonly type: "comment"; readonly comment: ReviewStreamComment }
    | { readonly type: "draft" };

/**
 * One stop on the walk through a review: a hunk, and the file it is in. The
 * addresses come from the parsed diff, which is authoritative about where its
 * own hunks begin, so travelling to one does not depend on it having been
 * drawn yet.
 */
/** How long the stream leaves the browser alone between measurements, in ms. */
const MEASURE_REST = 120;

type ReviewStreamStop = {
    readonly id: string;
    readonly lineNumber: number;
    readonly side: ChangedFileDiffCommentSide;
};

/**
 * Every changed file in one scroll, the way a review is actually read.
 *
 * A diff per pane answers "what happened to this file"; a change is rarely
 * about one file, and reading it a pane at a time makes the reader hold the
 * order in their head. This is the same renderer, given all the files at once
 * and asked to virtualize them, plus the two steps that travel between the
 * changes themselves rather than between scroll positions.
 */
/** One file's place in the stream: what it is, and the diff drawn for it. */
type ReviewStreamItem = {
    readonly id: string;
    readonly type: "diff";
    readonly fileDiff: ReturnType<typeof parseDiffFromFile>;
};

export function ReviewStream(props: ReviewStreamProps) {
    const view = useRef<CodeViewHandle<ReviewStreamAnnotation>>(null);
    const commenting = props.onCommentDraftOpen !== undefined;

    // Parsing a diff is work proportional to the file, and a review arrives one
    // file at a time: without this, the twenty-seventh file landing re-parses
    // the twenty-six already on screen, as does every unrelated notification
    // while the review is open. A file whose bytes have not moved keeps the
    // diff already parsed for it, which also keeps the renderer's own item
    // identity — it redraws what changed and leaves the rest alone.
    const parsed = useRef(new Map<string, { file: ReviewStreamFile; item: ReviewStreamItem }>());
    const items = useMemo(() => {
        const kept = new Map<string, { file: ReviewStreamFile; item: ReviewStreamItem }>();
        const built = props.files.map((file) => {
            const previous = parsed.current.get(file.path);
            const unchanged =
                previous !== undefined &&
                previous.file.oldContent === file.oldContent &&
                previous.file.newContent === file.newContent &&
                previous.file.oldPath === file.oldPath;
            const item = unchanged
                ? previous.item
                : {
                      id: file.path,
                      type: "diff" as const,
                      fileDiff: parseDiffFromFile(
                          {
                              name: file.oldPath ?? file.path,
                              contents: file.oldContent,
                              ...(file.oldCacheKey === undefined
                                  ? {}
                                  : { cacheKey: file.oldCacheKey }),
                          },
                          {
                              name: file.path,
                              contents: file.newContent,
                              ...(file.newCacheKey === undefined
                                  ? {}
                                  : { cacheKey: file.newCacheKey }),
                          },
                      ),
                  };
            kept.set(file.path, { file, item });
            return item;
        });
        // Files no longer in the review are dropped with it, so the map holds
        // exactly what is on screen.
        parsed.current = kept;
        return built;
    }, [props.files]);

    // Where the notes go, per file. Only positions live here, never the text
    // being typed: the renderer re-places annotations whenever this changes, so
    // carrying the draft's characters would redraw them on every keystroke.
    const draftPath = props.commentDraft?.path;
    const draftLine = props.commentDraft?.lineNumber;
    const draftSide = props.commentDraft?.side;
    const collapsedFiles = props.collapsed;
    // What was last handed to the renderer for each file, and under which
    // version. A version means nothing on its own — it only has to differ from
    // the one before it whenever the file's notes do.
    const signatures = useRef(new Map<string, { signature: string; version: number }>());
    const annotated = useMemo(() => {
        // A file the review no longer has takes its history with it.
        for (const id of signatures.current.keys())
            if (!items.some((item) => item.id === id)) signatures.current.delete(id);
        return items.map((item) => {
            const collapsed = collapsedFiles?.has(item.id) === true;
            const held = !commenting
                ? []
                : (props.comments ?? [])
                      .filter((comment) => comment.path === item.id)
                      .map((comment) => ({
                          side: comment.side,
                          lineNumber: comment.lineNumber,
                          metadata: { type: "comment" as const, comment },
                      }));
            const annotations =
                commenting &&
                draftPath === item.id &&
                draftLine !== undefined &&
                draftSide !== undefined
                    ? [
                          ...held,
                          {
                              side: draftSide,
                              lineNumber: draftLine,
                              metadata: { type: "draft" as const },
                          },
                      ]
                    : held;
            // The renderer is controlled: it keeps what it last drew for an item
            // unless the item says it changed. What can change here is which
            // notes are on the file and where — a note's characters are read
            // where it is drawn — and whether the file is closed. So the file
            // says exactly that, and a version is counted off each time the
            // answer differs from the last one drawn.
            //
            // Written out rather than folded into a number: a note submitted on
            // the line its draft was on turns one annotation into another at the
            // same address, and any arithmetic over addresses alone gives those
            // two states the same version — which leaves the composer on screen
            // over a note that has already been kept.
            const signature = [
                collapsed ? "closed" : "open",
                ...annotations.map((annotation) =>
                    annotation.metadata.type === "draft"
                        ? `draft:${annotation.side}:${String(annotation.lineNumber)}`
                        : `note:${annotation.metadata.comment.id}:${annotation.side}:${String(annotation.lineNumber)}:${annotation.metadata.comment.stale === true ? "stale" : "fresh"}`,
                ),
            ].join("|");
            const drawn = signatures.current.get(item.id);
            const version =
                drawn === undefined
                    ? 0
                    : drawn.signature === signature
                      ? drawn.version
                      : drawn.version + 1;
            signatures.current.set(item.id, { signature, version });
            return {
                ...item,
                ...(annotations.length === 0 ? {} : { annotations }),
                collapsed,
                version,
            };
        });
    }, [collapsedFiles, commenting, draftLine, draftPath, draftSide, items, props.comments]);

    // Every hunk in the review, in reading order. The parsed diff knows where
    // its hunks begin, so this is read from it rather than from whichever rows
    // happen to be on screen — which is what lets a stop far below the drawn
    // window still be somewhere to go.
    // A closed file is not on the walk: its hunks are drawn nowhere, so stepping
    // into one lands on a line the reader cannot see and the step looks like it
    // did nothing.
    const stops = useMemo<ReviewStreamStop[]>(
        () =>
            items
                .filter((item) => collapsedFiles?.has(item.id) !== true)
                .flatMap((item) =>
                    item.fileDiff.hunks.map((hunk) =>
                        hunk.additionCount > 0
                            ? {
                                  id: item.id,
                                  lineNumber: hunk.additionStart,
                                  side: "additions" as const,
                              }
                            : {
                                  id: item.id,
                                  lineNumber: hunk.deletionStart,
                                  side: "deletions" as const,
                              },
                    ),
                ),
        [collapsedFiles, items],
    );
    const fileOrder = useMemo(() => new Map(items.map((item, index) => [item.id, index])), [items]);

    /**
     * Lets go of the renderer's selected lines.
     *
     * Selecting lines is how a note is aimed: pressing the gutter button, or
     * dragging it down a run of lines, selects them. The renderer then keeps its
     * button on that selection rather than under the pointer — right while the
     * note is being written, wrong the moment it is done, because every other
     * line stops offering one until something clears it.
     */
    const selectionRelease = (): void => {
        view.current?.setSelectedLines(null);
    };

    // The renderer reports where its button was pressed as a selected range, and
    // hands back the item it belongs to — which is the file, because the
    // stream's item ids are paths.
    const gutterUtilityClicked = useStableCallback(
        (range: SelectedLineRange, context: { item: { id: string } }) => {
            props.onCommentDraftOpen?.(context.item.id, range.start, range.side ?? "additions");
        },
    );
    const options = useMemo(
        () => ({
            diffIndicators: "bars" as const,
            diffStyle: props.view === "split" ? ("split" as const) : ("unified" as const),
            hunkSeparators: "line-info-basic" as const,
            lineHoverHighlight: "both" as const,
            lineDiffType: "word-alt" as const,
            overflow: props.wrap === true ? ("wrap" as const) : ("scroll" as const),
            stickyHeader: true,
            theme: { dark: "pierre-dark" as const, light: "pierre-light" as const },
            themeType: props.appearance,
            unsafeCSS:
                PIERRE_PANE_CSS +
                PIERRE_DIFF_HEADER_CSS +
                (props.onFileCollapsedToggle === undefined ? "" : PIERRE_DIFF_HEADER_CLICK_CSS),
            enableGutterUtility: commenting,
            onGutterUtilityClick: gutterUtilityClicked,
        }),
        [
            commenting,
            gutterUtilityClicked,
            props.appearance,
            props.onFileCollapsedToggle,
            props.view,
            props.wrap,
        ],
    );

    const author = {
        authorInitials: props.commentAuthorInitials ?? "Y",
        authorName: props.commentAuthorName ?? "You",
    };

    // Which file the reader is currently inside. A stream is one scroll through
    // many files, and the header of the file being read is the one thing that
    // scrolls away underneath its own hunks — so it is said again where it
    // cannot: pinned above the stream. Read from the drawn headers rather than
    // computed from scroll arithmetic, because the renderer owns where its rows
    // actually are.
    const [reading, readingSet] = useState<string | undefined>(undefined);
    // A file's header is the whole row it occupies, so the whole row opens and
    // closes it — the chevron says what a click does, it is not the only place
    // that does it. The renderer draws that row in its own shadow tree and does
    // not say which item it belongs to, so the file is read back from the title
    // slotted into it.
    const headerClicked = useStableCallback((event: MouseEvent) => {
        const toggle = props.onFileCollapsedToggle;
        if (toggle === undefined) return;
        let header: HTMLElement | undefined;
        for (const node of event.composedPath()) {
            if (!(node instanceof HTMLElement)) continue;
            // Anything on the header that does its own thing keeps the click.
            if (node.matches("button, a, input, textarea, select, [role='button']")) return;
            if (node.hasAttribute("data-diffs-header")) {
                header = node;
                break;
            }
        }
        if (header === undefined) return;
        // Reading the path out of a header is not worth closing a file the
        // reader was only selecting text in.
        const selection = window.getSelection();
        if (selection !== null && !selection.isCollapsed) return;
        for (const slot of header.querySelectorAll("slot")) {
            for (const assigned of slot.assignedElements()) {
                const title = assigned.querySelector<HTMLElement>(
                    '[data-happy-desktop-ui="diff-file-title"]',
                );
                const path = title?.dataset.path;
                if (path !== undefined) {
                    toggle(path);
                    return;
                }
            }
        }
    });
    const readingWatch = useCallback(
        (node: HTMLDivElement | null) => {
            const port = node?.querySelector<HTMLElement>(".happy-review-stream__renderer");
            if (port == null) return;
            const ask = (): void => {
                const edge = port.getBoundingClientRect().top;
                // Nothing laid out yet reports every header at the same place,
                // and an answer read from that is not an answer.
                if (port.clientHeight === 0) return;
                // The file whose own header has gone off the top of the pane —
                // the lowest one of those, since the reader is inside the last
                // header they passed. A file whose header is still on screen
                // says its own name perfectly well, so it is not picked up:
                // that is what made the name appear twice.
                let found = Number.NEGATIVE_INFINITY;
                let inside: string | undefined;
                let measured = 0;
                for (const title of port.querySelectorAll<HTMLElement>(
                    '[data-happy-desktop-ui="diff-file-title"]',
                )) {
                    const box = title.getBoundingClientRect();
                    // A header the browser has not drawn — the pane is off
                    // screen, or the row has not been laid out — reports an
                    // empty box at the origin, which is not where it is.
                    if (box.height === 0) continue;
                    measured += 1;
                    if (box.bottom > edge || box.top <= found) continue;
                    found = box.top;
                    inside = title.dataset.path;
                }
                if (measured === 0) return;
                readingSet(inside);
            };
            // Measuring means reading the geometry of a pane the renderer has
            // just written to, which makes the browser lay the whole stream out
            // then and there. Once a frame is far more often than the answer can
            // change usefully — it is which file the reader is in, and they are
            // in one for seconds at a time — so it is asked on a leading edge
            // and then no more often than this, with the last ask always
            // honoured.
            let frame = 0;
            let timer = 0;
            let last = 0;
            const run = (): void => {
                frame = 0;
                last = performance.now();
                ask();
            };
            const soon = (): void => {
                if (frame !== 0 || timer !== 0) return;
                const since = performance.now() - last;
                if (since >= MEASURE_REST) {
                    frame = requestAnimationFrame(run);
                    return;
                }
                timer = window.setTimeout(() => {
                    timer = 0;
                    frame = requestAnimationFrame(run);
                }, MEASURE_REST - since);
            };
            // Scrolling asks through the same one-per-frame gate as everything
            // else: a scroll event arrives far more often than the screen is
            // drawn, and each answer reads layout the renderer is in the middle
            // of writing.
            port.addEventListener("scroll", soon, { passive: true });
            port.addEventListener("click", headerClicked);
            const sizes = new ResizeObserver(soon);
            sizes.observe(port);
            if (port.firstElementChild !== null) sizes.observe(port.firstElementChild);
            // The renderer draws, virtualizes, and folds rows on its own clock:
            // the pane's own box never changes for any of it, so what is where
            // is asked again whenever it has redrawn something.
            const drawn = new MutationObserver(soon);
            drawn.observe(port, { childList: true, subtree: true });
            // A pane that was off screen when it drew has nothing to measure
            // until it is on screen, which nothing else here would report.
            const shown = new IntersectionObserver(soon);
            shown.observe(port);
            soon();
            return () => {
                port.removeEventListener("scroll", soon);
                port.removeEventListener("click", headerClicked);
                sizes.disconnect();
                drawn.disconnect();
                shown.disconnect();
                if (frame !== 0) cancelAnimationFrame(frame);
                if (timer !== 0) window.clearTimeout(timer);
            };
        },
        [headerClicked],
    );
    // What the bar's controls act on: the file being read, or the first one
    // while the reader is still at the top of its own header.
    const readingPath = reading ?? props.files[0]?.path;
    // The header picked up from the file being read — the file itself, handed
    // to the same renderer closed. Not a row built to look like a header: a
    // header, so its name, its counts, and its type are drawn by whatever draws
    // every other strip in the stream, and stay that way when that changes.
    //
    // It is drawn whether or not it is showing, and hidden rather than taken
    // away: the row is a renderer of its own, and mounting one at the moment
    // the file's own header leaves the screen — and again at the moment it
    // comes back — is exactly where the reader was watching.
    const pinned = reading !== undefined;
    // The picked-up row is one strip, not a scroll of them, so the renderer's
    // own spacing around its items is not wanted here: above the strip it was
    // eight pixels of nothing lying over the stream, which the code underneath
    // showed through, and below the strip the same again.
    const pickedOptions = useMemo(
        () => ({ ...options, layout: { paddingTop: 0, paddingBottom: 0, gap: 0 } }),
        [options],
    );
    const picked = useMemo(() => {
        const item = items.find((entry) => entry.id === reading) ?? items[0];
        return item === undefined ? undefined : [{ ...item, collapsed: true, version: 0 }];
    }, [items, reading]);

    // How a file's header reads, wherever it is drawn: in the stream, and in
    // the row that picks it up once it has scrolled away. One renderer, one
    // header — the picked-up row is not a second thing that has to be kept
    // looking like the first.
    //
    // The parsed diff carries the new path as its name and the old one as
    // `prevName`, so the header reads the same here as it does on one file's
    // own diff.
    const headerPrefix = (item: ReviewStreamItem) =>
        item.type !== "diff" ? null : (
            <DiffFileTitle
                path={item.fileDiff.name}
                {...(item.fileDiff.prevName === undefined ||
                item.fileDiff.prevName === item.fileDiff.name
                    ? {}
                    : { previousPath: item.fileDiff.prevName })}
            />
        );
    // What can be done with one file of the change, beside the counts the
    // renderer already draws there.
    const headerMetadata = (item: ReviewStreamItem) => (
        <ReviewStreamFileActions
            collapsed={props.collapsed?.has(item.id) === true}
            {...(props.onFileCollapsedToggle === undefined
                ? {}
                : { onCollapsedToggle: props.onFileCollapsedToggle })}
            {...(props.onFileOpen === undefined ? {} : { onOpen: props.onFileOpen })}
            {...(props.onFileViewedToggle === undefined
                ? {}
                : { onViewedToggle: props.onFileViewedToggle })}
            path={item.id}
            viewed={props.viewed?.has(item.id) === true}
        />
    );

    // Where the last step landed. The walk is a sequence, so it has to be
    // remembered — but only as long as the reader is still where it left them:
    // once they have scrolled somewhere else, or closed the file they were in,
    // "next" means the next change from where they are now, not from a stop
    // they have long since left behind.
    const [walked, walkedSet] = useState<ReviewStreamStop | undefined>(undefined);
    const stopGo = (direction: -1 | 1): void => {
        if (stops.length === 0) return;
        const held = stops.findIndex(
            (stop) =>
                stop.id === walked?.id &&
                stop.lineNumber === walked.lineNumber &&
                stop.side === walked.side,
        );
        let next: number;
        if (held >= 0 && stops[held]?.id === readingPath) next = held + direction;
        else {
            // Re-anchored on the file the reader is inside, by position in the
            // review: the file itself may have no stops left on the walk.
            const at = fileOrder.get(readingPath ?? "") ?? 0;
            next = -1;
            for (let index = 0; index < stops.length; index += 1) {
                const stop = stops[index];
                if (stop === undefined) continue;
                const place = fileOrder.get(stop.id) ?? 0;
                if (direction === 1) {
                    if (place >= at) {
                        next = index;
                        break;
                    }
                } else if (place <= at) next = index;
            }
            if (next === -1) next = direction === 1 ? stops.length - 1 : 0;
        }
        const stop = stops[Math.min(Math.max(next, 0), stops.length - 1)];
        if (stop === undefined) return;
        walkedSet(stop);
        view.current?.scrollTo({
            type: "line",
            id: stop.id,
            lineNumber: stop.lineNumber,
            side: stop.side,
            align: "start",
            // Not animated: each step may cross files the renderer has not drawn
            // yet, and a queued animation through them arrives late and stutters
            // where the reader wanted to simply be at the next change.
            behavior: "instant",
        });
    };

    const allCollapsed =
        props.files.length > 0 && props.files.every((file) => props.collapsed?.has(file.path));

    return (
        <section
            aria-label="Changes in this workspace"
            className={["happy-review-stream", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="review-stream"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            <div className="happy-review-stream__bar" data-happy-desktop-ui="review-stream-bar">
                <span className="happy-review-stream__count">
                    {(() => {
                        const total = Math.max(
                            props.total ?? props.files.length,
                            props.files.length,
                        );
                        const counted =
                            total === 1 ? "1 changed file" : `${String(total)} changed files`;
                        // One file at a time says which one, because the count
                        // on its own would read as a stream that lost the rest.
                        return props.singleFile === undefined
                            ? counted
                            : `File ${String(props.singleFile.index)} of ${String(total)}`;
                    })()}
                </span>
                <span className="happy-review-stream__bar-end">
                    {props.singleFile === undefined ? null : (
                        <span className="happy-review-stream__steps">
                            <Button
                                aria-label="Previous file"
                                // The same chevron as the step forward, painted
                                // the other way round: one step at both ends of
                                // the change, the way the panel affordance is
                                // one control at both edges of the window.
                                className="happy-review-stream__step-back"
                                data-testid="review-stream-previous-file"
                                disabled={props.singleFile.index <= 1}
                                icon="chevron-right"
                                iconOnly
                                onClick={() => props.singleFile?.onPrevious()}
                                size="small"
                                variant="ghost"
                            />
                            <Button
                                aria-label="Next file"
                                data-testid="review-stream-next-file"
                                disabled={
                                    props.singleFile.index >=
                                    Math.max(props.total ?? props.files.length, 1)
                                }
                                icon="chevron-right"
                                iconOnly
                                onClick={() => props.singleFile?.onNext()}
                                size="small"
                                variant="ghost"
                            />
                        </span>
                    )}
                    <span className="happy-review-stream__steps">
                        <Button
                            aria-label="Previous change"
                            data-testid="review-stream-previous-change"
                            icon="chevron-up"
                            iconOnly
                            onClick={() => stopGo(-1)}
                            size="small"
                            variant="ghost"
                        />
                        <Button
                            aria-label="Next change"
                            data-testid="review-stream-next-change"
                            icon="chevron-down"
                            iconOnly
                            onClick={() => stopGo(1)}
                            size="small"
                            variant="ghost"
                        />
                    </span>
                    {readingPath === undefined ? null : (
                        <Button
                            aria-label="Back to the top of this file"
                            data-testid="review-stream-reading-locate"
                            icon="locate"
                            iconOnly
                            onClick={() =>
                                view.current?.scrollTo({
                                    type: "item",
                                    id: readingPath,
                                    align: "start",
                                    behavior: "smooth",
                                })
                            }
                            size="small"
                            variant="ghost"
                        />
                    )}
                    {props.onFilesCollapsedSet === undefined ? null : (
                        <Button
                            aria-label={allCollapsed ? "Open every file" : "Close every file"}
                            data-testid="review-stream-collapse-all"
                            icon={allCollapsed ? "unfold" : "fold"}
                            iconOnly
                            onClick={() => props.onFilesCollapsedSet?.(!allCollapsed)}
                            size="small"
                            variant="ghost"
                        />
                    )}
                    {props.onViewChange === undefined ? null : (
                        <SegmentedControl
                            aria-label="How every diff in this review is drawn"
                            data-testid="review-stream-view"
                            onChange={(value) =>
                                props.onViewChange?.(value === "split" ? "split" : "unified")
                            }
                            segments={[
                                { value: "unified", label: "Unified" },
                                { value: "split", label: "Split" },
                            ]}
                            size="compact"
                            value={props.view === "split" ? "split" : "unified"}
                        />
                    )}
                    {props.onWrapChange === undefined ? null : (
                        <Button
                            data-testid="review-stream-wrap"
                            onClick={() => props.onWrapChange?.(props.wrap !== true)}
                            size="small"
                            variant="ghost"
                        >
                            {props.wrap === true ? "Wrap" : "No wrap"}
                        </Button>
                    )}
                </span>
            </div>

            {props.singleFile === undefined ? null : (
                <Banner
                    className="happy-review-stream__oversize"
                    data-testid="review-stream-oversize"
                    icon="file-diff"
                    tone="info"
                >
                    This change is too large to read in one scroll, so its files are shown one at a
                    time.
                </Banner>
            )}

            {props.failures === undefined || props.failures.length === 0 ? null : (
                <Banner
                    className="happy-review-stream__failures"
                    data-testid="review-stream-failures"
                    icon="alert"
                    {...(props.onFailuresRetry === undefined
                        ? {}
                        : { action: { label: "Try again", onClick: props.onFailuresRetry } })}
                    title={
                        props.failures.length === 1
                            ? "One file could not be read"
                            : `${String(props.failures.length)} files could not be read`
                    }
                    tone="warning"
                >
                    {props.failures.join(", ")}
                </Banner>
            )}

            <div className="happy-review-stream__body" ref={readingWatch}>
                {picked === undefined ? null : (
                    <div
                        aria-hidden={pinned ? undefined : "true"}
                        className="happy-review-stream__reading"
                        data-clickable={props.onFileCollapsedToggle === undefined ? undefined : ""}
                        data-happy-desktop-ui="review-stream-reading"
                        data-pinned={pinned ? "" : undefined}
                        onClick={(event) => {
                            // The controls in this row keep their own clicks, the
                            // same way they do in the header it stands in for.
                            if (
                                event.target instanceof HTMLElement &&
                                event.target.closest("button, a") !== null
                            )
                                return;
                            const file = picked[0]?.id;
                            if (file !== undefined) props.onFileCollapsedToggle?.(file);
                        }}
                    >
                        <CodeView<ReviewStreamAnnotation>
                            className="happy-diff-surface"
                            items={picked}
                            options={pickedOptions}
                            renderHeaderMetadata={headerMetadata}
                            renderHeaderPrefix={headerPrefix}
                        />
                    </div>
                )}
                <CodeView<ReviewStreamAnnotation>
                    className="happy-review-stream__renderer happy-diff-surface"
                    items={annotated}
                    options={options}
                    ref={view}
                    renderHeaderMetadata={headerMetadata}
                    renderHeaderPrefix={headerPrefix}
                    {...(commenting
                        ? {
                              renderAnnotation: (annotation) => {
                                  const held = annotation.metadata;
                                  // The draft's characters are read here rather than
                                  // carried through the annotation, so typing one
                                  // redraws this note and nothing else.
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
                                          onRemove={() => props.onCommentRemove?.(held.comment.id)}
                                          side={held.comment.side}
                                          stale={held.comment.stale}
                                          text={held.comment.text}
                                      />
                                  );
                              },
                          }
                        : {})}
                />
            </div>
        </section>
    );
}
