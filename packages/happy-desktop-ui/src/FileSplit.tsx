import { partitionComponentProps } from "./componentProps";
import { useState, type CSSProperties, type ReactNode } from "react";
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
     * Which file `preview` is showing. Where the split is too narrow for both
     * columns the preview replaces the listing, with a way back; picking
     * another file brings its preview forward again.
     */
    previewKey?: string;
    /** Listing width in CSS pixels; `FILE_SPLIT_LIST_DEFAULT_WIDTH` where nobody chose one. */
    listWidth?: number;
    /** Reports the settled width after a drag or keyboard step. */
    onListWidthChange?: (width: number) => void;
    emptyTitle?: string;
    emptyDescription?: string;
    /** Names the way back from a stacked preview to the listing. */
    backLabel?: string;
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
        "previewKey",
        "listWidth",
        "onListWidthChange",
        "emptyTitle",
        "emptyDescription",
        "backLabel",
    ]);
    const [width, setWidth] = useState(0);
    const [dragWidth, setDragWidth] = useState<number>();
    // The preview the reader stepped back from, while stacked. Comparing it to
    // the preview now on screen is what lets the next pick come forward without
    // anything having to reset this.
    const [listShownFor, setListShownFor] = useState<string | null>();
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
    const previewKey = local.previewKey ?? null;
    const showing: "list" | "preview" | "both" = !stacked
        ? "both"
        : local.preview !== undefined && listShownFor !== previewKey
          ? "preview"
          : "list";
    return (
        <div
            className={["happy-file-split", local.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="file-split"
            data-showing={showing}
            data-testid={local["data-testid"]}
            ref={rootRef}
            style={local.style}
        >
            <div
                className="happy-file-split__list"
                data-happy-desktop-ui="file-split-list"
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
            <div className="happy-file-split__preview" data-happy-desktop-ui="file-split-preview">
                {showing === "preview" ? (
                    <div className="happy-file-split__back" data-happy-desktop-ui="file-split-back">
                        <Button
                            icon="chevron-left"
                            onClick={() => setListShownFor(previewKey)}
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
