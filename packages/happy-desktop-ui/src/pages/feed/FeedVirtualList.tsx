import { useVirtualizer } from "@tanstack/react-virtual";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ScrollArea } from "../../Scrollbar";
import { Spinner } from "../../Spinner";

/**
 * The space above the first slot inside the scrolled content, which the
 * content wrapper's padding in `happy-agent-feed.css` makes. The virtualizer is
 * told of it so the slots it draws are the ones on screen.
 */
const LIST_INSET = 8;
/** How close to the end of what is held the reader may scroll before older slots are read. */
const LOAD_AHEAD = 8;
/** How many slots from the top of the screen are looked at to hold the reader's place. */
const ANCHOR_SPAN = 24;

export interface FeedVirtualListProps<Slot extends { readonly id: string }> {
    slots: readonly Slot[];
    /** Every slot's height, known ahead; the list never measures one. */
    slotHeight: (slot: Slot) => number;
    renderSlot: (slot: Slot) => ReactNode;
    /** Older slots exist beyond the last one held. */
    hasMore: boolean;
    loadingMore: boolean;
    /** Reads older slots; called as the reader nears the end of what is held. */
    onLoadMore?: () => void;
    /** Drawn in place of the slots when there are none. */
    empty?: ReactNode;
    "aria-label": string;
}

/** Where each slot starts, by id, in the list's own coordinates. */
function startsOf<Slot extends { readonly id: string }>(
    slots: readonly Slot[],
    height: (slot: Slot) => number,
): Map<string, number> {
    const starts = new Map<string, number>();
    let at = 0;
    for (const slot of slots) {
        starts.set(slot.id, at);
        at += height(slot);
    }
    return starts;
}

/**
 * The scrolled column of a feed: every slot of a height known ahead, only the
 * ones on screen drawn, and older ones read as the reader comes near the end.
 *
 * Slots are keyed by their own id, so a row that takes a new place keeps its
 * element. While the reader is at the top, a row that moves glides to its new
 * slot and the rows it passes glide aside. Once they have scrolled down into
 * the list, they are reading something: a row arriving or moving above them
 * then leaves what is on screen exactly where it was, and the list grows above
 * it instead.
 */
export function FeedVirtualList<Slot extends { readonly id: string }>(
    props: FeedVirtualListProps<Slot>,
) {
    const scrollElement = useRef<HTMLDivElement | null>(null);
    // Whether the reader has scrolled into the list, kept from their own
    // scrolling so the slots of the next render already know whether to glide.
    const [parked, parkedSet] = useState(false);
    const count = props.slots.length;
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
        estimateSize: (index) => {
            const slot = props.slots[index];
            return slot === undefined ? 0 : props.slotHeight(slot);
        },
        getItemKey: (index) => props.slots[index]?.id ?? index,
        getScrollElement: () => scrollElement.current,
        initialRect: { width: 0, height: 640 },
        overscan: 6,
        scrollMargin: LIST_INSET,
        onChange: (instance) => loadNear(instance.getVirtualItems().at(-1)?.index),
        useFlushSync: false,
    });
    /*
     * Holds what the reader is looking at while rows arrive or move above it.
     * The slots are positioned rather than in the document's flow, so the
     * browser's own scroll anchoring cannot see them; this is that anchoring,
     * done against the list's ids. The anchor is the first slot on screen that
     * moved as its neighbour below did: a row that itself jumped to the top
     * moved unlike its neighbours, and is not followed. It runs after the new
     * positions are in the document and before they are painted, so the frame
     * in between is never seen.
     */
    const held = useRef<{
        readonly order: readonly string[];
        readonly starts: ReadonlyMap<string, number>;
    }>({ order: [], starts: new Map() });
    // eslint-disable-next-line happy-react/no-layout-effect -- Scroll anchoring for positioned slots must correct scrollTop after the new offsets commit and before they paint; no declarative boundary sees both.
    useLayoutEffect(() => {
        const before = held.current;
        const starts = startsOf(props.slots, props.slotHeight);
        held.current = { order: props.slots.map((slot) => slot.id), starts };
        const element = scrollElement.current;
        if (element === null || element.scrollTop <= 0 || before.order.length === 0) return;
        const top = element.scrollTop - LIST_INSET;
        const first = before.order.findIndex((id) => (before.starts.get(id) ?? 0) >= top);
        if (first < 0) return;
        const delta = (id: string | undefined): number | undefined => {
            if (id === undefined) return undefined;
            const was = before.starts.get(id);
            const now = starts.get(id);
            return was === undefined || now === undefined ? undefined : now - was;
        };
        let fallback: number | undefined;
        const end = Math.min(before.order.length, first + ANCHOR_SPAN);
        for (let index = first; index < end; index++) {
            const moved = delta(before.order[index]);
            if (moved === undefined) continue;
            fallback ??= moved;
            if (moved !== delta(before.order[index + 1])) continue;
            if (moved !== 0) element.scrollTop += moved;
            return;
        }
        if (fallback) element.scrollTop += fallback;
    }, [props.slots, props.slotHeight]);
    const drawn = virtualizer.getVirtualItems();
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
                        {drawn.map((entry) => {
                            const slot = props.slots[entry.index];
                            if (slot === undefined) return null;
                            return (
                                <div
                                    className="happy-agent-feed__slot"
                                    data-index={entry.index}
                                    key={entry.key}
                                    role="listitem"
                                    style={{
                                        height: entry.size,
                                        transform: `translateY(${String(entry.start - LIST_INSET)}px)`,
                                    }}
                                >
                                    {props.renderSlot(slot)}
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
