import { useVirtualizer } from "@tanstack/react-virtual";
import {
    useCallback,
    useLayoutEffect,
    useRef,
    useState,
    useSyncExternalStore,
    type ReactNode,
} from "react";
import {
    messageTextLayoutFontGenerationGet,
    messageTextLayoutFontGenerationSubscribe,
} from "../../messageTextLayout";
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

/**
 * Where the reader is in a list: the slot the top of the screen is in, by
 * its id, and how far into it they have scrolled.
 */
export interface FeedScrollPosition {
    readonly rowId: string;
    readonly offset: number;
}

export interface FeedVirtualListProps<Slot extends { readonly id: string }> {
    slots: readonly Slot[];
    /**
     * Every slot's height at the list's width, known ahead: the list measures
     * its own width, never a slot. A height may follow text laid out with
     * `messageTextLayout`, which the list lays out again when a font arrives.
     */
    slotHeight: (slot: Slot, width: number) => number;
    /** Draws a slot at the list's width, the one its height was given for. */
    renderSlot: (slot: Slot, width: number) => ReactNode;
    /** Older slots exist beyond the last one held. */
    hasMore: boolean;
    loadingMore: boolean;
    /** Reads older slots; called as the reader nears the end of what is held. */
    onLoadMore?: () => void;
    /** Drawn in place of the slots when there are none. */
    empty?: ReactNode;
    /**
     * Where the reader left this list, which it opens at: read once, as
     * it appears, and applied as soon as that slot is held.
     */
    scrollPosition?: FeedScrollPosition | null;
    /**
     * Reports where the reader left the list, `null` at the top: once, as the
     * list goes away, such as when an entry they opened takes its place.
     */
    onScrollPositionChange?: (position: FeedScrollPosition | null) => void;
    "aria-label": string;
}

/** Where each slot starts, and how tall it is, by id, in the list's own coordinates. */
function placesOf<Slot extends { readonly id: string }>(
    slots: readonly Slot[],
    height: (slot: Slot) => number,
): { starts: Map<string, number>; heights: Map<string, number> } {
    const starts = new Map<string, number>();
    const heights = new Map<string, number>();
    let at = 0;
    for (const slot of slots) {
        const size = height(slot);
        starts.set(slot.id, at);
        heights.set(slot.id, size);
        at += size;
    }
    return { starts, heights };
}

/**
 * The scrolled column of a feed: every slot of a height known ahead from the
 * column's width, only the ones on screen drawn, and older ones read as the
 * reader comes near the end.
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
    // The list's own width, which a slot's height may follow, such as a
    // picture's at its aspect ratio. Read as the list appears, before it is
    // painted, and again whenever the column is resized.
    const [width, widthSet] = useState(0);
    // Stable so the observer is made once for the list's element rather than
    // again at every render.
    const listMeasure = useCallback((element: HTMLDivElement | null) => {
        if (element === null) return;
        widthSet(element.clientWidth);
        const observer = new ResizeObserver(() => widthSet(element.clientWidth));
        observer.observe(element);
        return () => observer.disconnect();
    }, []);
    // A slot's height may follow its text, which a webfont arriving lays out
    // again: read so the list lays itself out again then too.
    const fonts = useSyncExternalStore(
        messageTextLayoutFontGenerationSubscribe,
        messageTextLayoutFontGenerationGet,
    );
    const heightAt = props.slotHeight;
    const slotHeight = (slot: Slot): number => heightAt(slot, width);
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
            return slot === undefined ? 0 : slotHeight(slot);
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
     * moved unlike its neighbours, and is not followed. A slot on screen that
     * grew or shrank where it stands, such as a post the reader opened up, is
     * the anchor itself: it stays, and only what is below it moves. It runs
     * after the new positions are in the document and before they are
     * painted, so the frame in between is never seen.
     */
    const held = useRef<{
        readonly order: readonly string[];
        readonly starts: ReadonlyMap<string, number>;
        readonly heights: ReadonlyMap<string, number>;
    }>({ order: [], starts: new Map(), heights: new Map() });
    // Where the list opens, until it has been put there or cannot be.
    const restore = useRef(props.scrollPosition ?? null);
    // How far the reader has scrolled, kept here as they scroll and reported
    // only as the list goes away, so scrolling never writes to the owner.
    const scrolled = useRef(0);
    const leave = props.onScrollPositionChange;
    // eslint-disable-next-line happy-react/no-layout-effect -- Where the reader left the list must be read as it unmounts, before the next surface mounts; no event marks a list leaving the screen.
    useLayoutEffect(
        () => () => {
            if (!leave || restore.current !== null) return;
            const top = scrolled.current - LIST_INSET;
            if (scrolled.current <= 0) {
                leave(null);
                return;
            }
            const { order, starts, heights } = held.current;
            const rowId = order.find((id) => (starts.get(id) ?? 0) + (heights.get(id) ?? 0) > top);
            leave(
                rowId === undefined
                    ? null
                    : { rowId, offset: Math.round(top - (starts.get(rowId) ?? 0)) },
            );
        },
        [leave],
    );
    // eslint-disable-next-line happy-react/no-layout-effect -- Scroll anchoring for positioned slots must correct scrollTop after the new offsets commit and before they paint; no declarative boundary sees both.
    useLayoutEffect(() => {
        const before = held.current;
        const { starts, heights } = placesOf(props.slots, (slot) => heightAt(slot, width));
        held.current = { order: props.slots.map((slot) => slot.id), starts, heights };
        const element = scrollElement.current;
        // Coming back to the list puts the reader where they left it, once
        // the slots and the width their heights follow are known. A slot
        // that is no longer here leaves the list at its top.
        const leftAt = restore.current;
        if (leftAt !== null && element !== null && width > 0 && props.slots.length > 0) {
            restore.current = null;
            const start = starts.get(leftAt.rowId);
            if (start !== undefined) element.scrollTop = start + leftAt.offset + LIST_INSET;
            scrolled.current = element.scrollTop;
            return;
        }
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
        const resized = (id: string | undefined): boolean =>
            id !== undefined && delta(id) === 0 && before.heights.get(id) !== heights.get(id);
        // The slot the top of the screen cuts through, if one does.
        const cut = before.order[first - 1];
        if (
            cut !== undefined &&
            (before.starts.get(cut) ?? 0) + (before.heights.get(cut) ?? 0) > top &&
            resized(cut)
        )
            return;
        let fallback: number | undefined;
        const end = Math.min(before.order.length, first + ANCHOR_SPAN);
        for (let index = first; index < end; index++) {
            const moved = delta(before.order[index]);
            if (moved === undefined) continue;
            if (resized(before.order[index])) return;
            fallback ??= moved;
            if (moved !== delta(before.order[index + 1])) continue;
            if (moved !== 0) element.scrollTop += moved;
            return;
        }
        if (fallback) element.scrollTop += fallback;
    }, [props.slots, heightAt, width, fonts]);
    const drawn = virtualizer.getVirtualItems();
    return (
        <ScrollArea
            className="happy-agent-feed__scroll"
            data-happy-desktop-ui="happy-agent-feed-scroll"
            viewportClassName="happy-agent-feed__scroll-viewport"
            viewportProps={{
                onScroll: (event) => {
                    const scrollTop = event.currentTarget.scrollTop;
                    scrolled.current = scrollTop;
                    parkedSet(scrollTop > 0);
                },
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
                        ref={listMeasure}
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
                                    {props.renderSlot(slot, width)}
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
