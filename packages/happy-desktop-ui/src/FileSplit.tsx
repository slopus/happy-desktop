import { partitionComponentProps } from "./componentProps";
import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ResizeHandle } from "./AppShell";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";

/** The listing's width where nobody has dragged it. */
export const FILE_SPLIT_LIST_DEFAULT_WIDTH = 280;
const LIST_MIN_WIDTH = 200;
/**
 * The narrowest a preview is worth drawing beside the listing: a code line of
 * about forty characters, or a picture still recognisable. Below this plus the
 * listing's floor the two take turns instead of squeezing each other.
 */
const PREVIEW_MIN_WIDTH = 320;
const STACK_BELOW_WIDTH = LIST_MIN_WIDTH + PREVIEW_MIN_WIDTH;

export type FileSplitProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    /** The file listing, drawn in the leading column. */
    listing: ReactNode;
    /** The selected file, drawn beside the listing. Absent, the column says how to fill it. */
    preview?: ReactNode;
    /**
     * How many times the caller has been asked to show a file here, counting
     * a pick of the file already showing. Where the split is too narrow for
     * both columns the preview replaces the listing, with a way back; each new
     * count brings the preview forward again. Without it, the way back is final.
     */
    previewRequest?: number;
    /** Listing width in CSS pixels; `FILE_SPLIT_LIST_DEFAULT_WIDTH` where nobody chose one. */
    listWidth?: number;
    /** Reports the settled width after a drag or keyboard step. */
    onListWidthChange?: (width: number) => void;
    emptyTitle?: string;
    emptyDescription?: string;
    /** Names the way back from a stacked preview to the listing. */
    backLabel?: string;
    /**
     * Opens the previewed file as a tab of the main content: what a double
     * click on its row means. Stacked, the first click of that double click
     * brings the preview forward over the row, so the second lands on the
     * preview; the split recognises it there and says so here.
     */
    onOpenInTab?: () => void;
};

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/**
 * C-351 FileSplit — a file listing and the preview of the file picked in it,
 * side by side inside one lane.
 *
 * The preview column is always there, with a quiet "Select a file" state while
 * nothing is picked, so the first pick fills a column rather than opening one:
 * the listing never moves under the pointer that just clicked it. The divider
 * between the two is the shell's own resize handle.
 *
 * Narrower than a listing and a readable preview together, the two take turns
 * in the same box instead of squeezing: picking a file shows its preview with
 * a way back to the listing. Both stay mounted throughout, so the listing keeps
 * its scroll and the preview its state.
 *
 * Props only — the caller supplies both columns and keeps the width.
 */
export function FileSplit(props: FileSplitProps) {
    const [local] = partitionComponentProps(props, [
        "className",
        "data-testid",
        "style",
        "listing",
        "preview",
        "previewRequest",
        "listWidth",
        "onListWidthChange",
        "emptyTitle",
        "emptyDescription",
        "backLabel",
        "onOpenInTab",
    ]);
    const [width, setWidth] = useState(0);
    const [dragWidth, setDragWidth] = useState<number>();
    // The request the reader stepped back from, while stacked. The caller's next
    // request differs from it, so the next pick comes forward without anything
    // having to reset this — the same file picked again included.
    const [listShownFor, setListShownFor] = useState<number>();
    // Whether the last press landed in the listing, and whether the click it
    // ends is to be swallowed. A press on the preview that the OS counts as a
    // double click (`detail` 2) right after a press in the listing is the
    // second half of a double click on a row: the stacked swap moved the row
    // away between the two. The OS keeps the timing and distance, so nothing
    // here waits or measures.
    const pressedInList = useRef(false);
    const clickSwallowed = useRef(false);
    // React Compiler keeps this callback's identity, so the observer lives as
    // long as the node.
    const rootRef = (node: HTMLDivElement | null) => {
        if (node === null) return;
        const observer = new ResizeObserver(([entry]) => {
            if (entry) setWidth(Math.round(entry.contentRect.width));
        });
        observer.observe(node);
        return () => observer.disconnect();
    };
    const stacked = width > 0 && width < STACK_BELOW_WIDTH;
    const listMax = Math.max(LIST_MIN_WIDTH, (width || STACK_BELOW_WIDTH) - PREVIEW_MIN_WIDTH);
    const listWidth = clamp(
        dragWidth ?? local.listWidth ?? FILE_SPLIT_LIST_DEFAULT_WIDTH,
        LIST_MIN_WIDTH,
        listMax,
    );
    const previewRequest = local.previewRequest ?? 0;
    const showing: "list" | "preview" | "both" = !stacked
        ? "both"
        : local.preview !== undefined && listShownFor !== previewRequest
          ? "preview"
          : "list";
    return (
        <div
            className={["happy-file-split", local.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="file-split"
            data-showing={showing}
            data-testid={local["data-testid"]}
            // The rest of a double click taken by the preview: its click and
            // dblclick are over, whichever column is under the pointer once
            // the file has moved to its tab.
            onClickCapture={(event) => {
                if (!clickSwallowed.current) return;
                event.preventDefault();
                event.stopPropagation();
            }}
            onDoubleClickCapture={(event) => {
                if (!clickSwallowed.current) return;
                clickSwallowed.current = false;
                event.preventDefault();
                event.stopPropagation();
            }}
            onMouseDownCapture={() => {
                clickSwallowed.current = false;
            }}
            ref={rootRef}
            style={local.style}
        >
            <div
                className="happy-file-split__list"
                data-happy-desktop-ui="file-split-list"
                onMouseDownCapture={() => {
                    pressedInList.current = true;
                }}
                style={stacked ? undefined : { width: `${String(listWidth)}px` }}
            >
                {local.listing}
                {stacked ? null : (
                    <ResizeHandle
                        edge="right"
                        label="Resize file list"
                        max={listMax}
                        min={LIST_MIN_WIDTH}
                        onResize={setDragWidth}
                        onResizeEnd={(next) => {
                            local.onListWidthChange?.(next);
                            setDragWidth(undefined);
                        }}
                        value={listWidth}
                    />
                )}
            </div>
            <div
                className="happy-file-split__preview"
                data-happy-desktop-ui="file-split-preview"
                onMouseDownCapture={(event) => {
                    const second = pressedInList.current && event.detail >= 2;
                    pressedInList.current = false;
                    if (!second || !stacked || local.onOpenInTab === undefined) return;
                    // The press belongs to the row it began on, not to what
                    // the preview happens to show under the pointer.
                    event.preventDefault();
                    event.stopPropagation();
                    clickSwallowed.current = true;
                    local.onOpenInTab();
                }}
            >
                {showing === "preview" ? (
                    <div className="happy-file-split__back" data-happy-desktop-ui="file-split-back">
                        <Button
                            icon="chevron-left"
                            onClick={() => setListShownFor(previewRequest)}
                            size="small"
                            variant="ghost"
                        >
                            {local.backLabel ?? "Files"}
                        </Button>
                    </div>
                ) : null}
                {local.preview ?? (
                    <EmptyState
                        description={local.emptyDescription}
                        icon="doc"
                        size="panel"
                        title={local.emptyTitle ?? "Select a file to preview"}
                    />
                )}
            </div>
        </div>
    );
}
