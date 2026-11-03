import { useVirtualizer } from "@tanstack/react-virtual";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ScrollArea } from "../../Scrollbar";
import { Spinner } from "../../Spinner";

/** The space between two rows. */
const ROW_GAP = 4;
/**
 * The space above the first row inside the scrolled content, which the content
 * wrapper's padding in `happy-agent-feed.css` makes. The virtualizer is told
 * of it so the rows it draws are the ones on screen.
 */
const LIST_INSET = 4;
/** How close to the end of what is held the reader may scroll before older rows are read. */
const LOAD_AHEAD = 8;

export interface FeedVirtualListProps<Item extends { readonly id: string }> {
    items: readonly Item[];
    /** Every row's height; the list never measures one. */
    rowHeight: number;
    renderRow: (item: Item) => ReactNode;
    /** Older rows exist beyond the last one held. */
    hasMore: boolean;
    loadingMore: boolean;
    /** Reads older rows; called as the reader nears the end of what is held. */
    onLoadMore?: () => void;
    /** Drawn in place of the rows when there are none. */
    empty?: ReactNode;
    "aria-label": string;
}

/**
 * The scrolled column of a feed: every row the same height, only the ones on
 * screen drawn, and older ones read as the reader comes near the end.
 *
 * Rows are keyed by their own id, so a row that takes a new place keeps its
 * element. While the reader is at the top, a row that moves glides to its new
 * slot and the rows it passes glide aside. Once they have scrolled down into
 * the list, they are reading something: a row arriving or moving above them
 * then leaves what is on screen exactly where it was, and the list grows above
 * it instead.
 */
export function FeedVirtualList<Item extends { readonly id: string }>(
    props: FeedVirtualListProps<Item>,
) {
    const scrollElement = useRef<HTMLDivElement | null>(null);
    // Whether the reader has scrolled into the list, kept from their own
    // scrolling so the rows of the next render already know whether to glide.
    const [parked, parkedSet] = useState(false);
    const stride = props.rowHeight + ROW_GAP;
    const count = props.items.length;
    const loadNear = (last: number | undefined) => {
        if (last === undefined || !props.hasMore || props.loadingMore) return;
        if (last >= count - LOAD_AHEAD) props.onLoadMore?.();
    };
    // TanStack Virtual deliberately owns mutable measurement functions. Keep
    // this leaf outside compiler memoization while the row components remain
    // normal compiler-eligible React children.
    // eslint-disable-next-line react-hooks/incompatible-library
    const virtualizer = useVirtualizer({
        count,
        estimateSize: () => props.rowHeight,
        gap: ROW_GAP,
        getItemKey: (index) => props.items[index]?.id ?? index,
        getScrollElement: () => scrollElement.current,
        initialRect: { width: 0, height: 640 },
        overscan: 6,
        scrollMargin: LIST_INSET,
        onChange: (instance) => loadNear(instance.getVirtualItems().at(-1)?.index),
        useFlushSync: false,
    });
    /*
     * Holds what the reader is looking at while rows arrive or move above it.
     * The rows are positioned rather than in the document's flow, so the
     * browser's own scroll anchoring cannot see them; this is that anchoring,
     * done against the list's ids. It runs after the new positions are in the
     * document and before they are painted, so the frame in between is never
     * seen.
     */
    const held = useRef<readonly string[]>([]);
    // eslint-disable-next-line happy-react/no-layout-effect -- Scroll anchoring for positioned rows must correct scrollTop after the new offsets commit and before they paint; no declarative boundary sees both.
    useLayoutEffect(() => {
        const before = held.current;
        held.current = props.items.map((item) => item.id);
        const element = scrollElement.current;
        if (element === null || element.scrollTop <= 0 || before.length === 0) return;
        const top = Math.max(0, Math.floor((element.scrollTop - LIST_INSET) / stride));
        const after = new Map(held.current.map((id, index) => [id, index]));
        // The first row on screen that is still in the list and did not itself
        // move to the top: that one stays put, and everything else follows it.
        for (let index = top; index < Math.min(before.length, top + 16); index++) {
            const now = after.get(before[index]!);
            if (now === undefined || (now === 0 && index !== 0)) continue;
            if (now !== index) element.scrollTop += (now - index) * stride;
            return;
        }
    }, [props.items, stride]);
    const rows = virtualizer.getVirtualItems();
    return (
        <ScrollArea
            className="happy-agent-feed__scroll"
            data-happy-desktop-ui="happy-agent-feed-scroll"
            viewportClassName="happy-agent-feed__scroll-viewport"
            viewportProps={{
                onScroll: (event) => parkedSet(event.currentTarget.scrollTop > 0),
            }}
            viewportRef={scrollElement}
        >
            <div className="happy-agent-feed__content">
                {count === 0 && !props.hasMore ? (
                    props.empty
                ) : (
                    <div
                        aria-label={props["aria-label"]}
                        className="happy-agent-feed__list"
                        data-glide={parked ? undefined : ""}
                        data-happy-desktop-ui="happy-agent-feed-list"
                        role="list"
                        style={{ height: virtualizer.getTotalSize() }}
                    >
                        {rows.map((row) => {
                            const item = props.items[row.index];
                            if (item === undefined) return null;
                            return (
                                <div
                                    className="happy-agent-feed__item"
                                    data-index={row.index}
                                    key={row.key}
                                    role="listitem"
                                    style={{
                                        height: props.rowHeight,
                                        transform: `translateY(${String(row.start - LIST_INSET)}px)`,
                                    }}
                                >
                                    {props.renderRow(item)}
                                </div>
                            );
                        })}
                    </div>
                )}
                {props.loadingMore ? (
                    <div className="happy-agent-feed__more">
                        <Spinner label="Reading older entries" />
                    </div>
                ) : null}
            </div>
        </ScrollArea>
    );
}
