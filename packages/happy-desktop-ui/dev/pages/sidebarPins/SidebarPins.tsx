import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import "./sidebar-pins.css";

/** What a pin opens. A pin is a second way into a destination the list may also draw. */
export type SidebarPinKind =
    | "conversation"
    | "subtask"
    | "todo-list"
    | "document"
    | "calendar"
    | "chat"
    | "artifact"
    | "bot";

export interface SidebarPin {
    /** The pin's own identity, stable across reorders. */
    readonly id: string;
    /** The destination it opens; the same ID a list row for it carries. */
    readonly targetId: string;
    readonly kind: SidebarPinKind;
    readonly title: string;
    readonly iconUrl: string;
}

/**
 * `stacked` centres the icon over a one-line title; `inline` sets the icon
 * before a one-line title; `wrap` sets it before a title that may take two
 * lines. Every tile in a grid is the same box, so a long title never changes a
 * tile's height.
 */
export type SidebarPinsLayout = "stacked" | "inline" | "wrap";

export interface SidebarPinsProps {
    readonly pins: readonly SidebarPin[];
    readonly layout: SidebarPinsLayout;
    /** The open destination. Every pin pointing at it shows as selected. */
    readonly activeTargetId: string;
    readonly onOpen: (targetId: string) => void;
    /** The pins in their new order, after a drag or keyboard move settles. */
    readonly onReorder: (pinIds: readonly string[]) => void;
}

/** The pointer must travel this far before a press becomes a drag. */
const DRAG_THRESHOLD = 4;
/** How long the dropped tile takes to glide into its slot; matches the CSS transition. */
const SETTLE_MS = 180;

interface PinDrag {
    readonly id: string;
    readonly pointerId: number;
    readonly from: number;
    readonly over: number;
    readonly startX: number;
    readonly startY: number;
    readonly dx: number;
    readonly dy: number;
    readonly moved: boolean;
    /** Released: the tile is gliding into `over` and takes no more input. */
    readonly settling: boolean;
    /** Every tile's box at the press, by its index, relative to the grid. */
    readonly slots: readonly DOMRect[];
}

function moved<T>(list: readonly T[], from: number, to: number): T[] {
    const next = [...list];
    const [entry] = next.splice(from, 1);
    next.splice(to, 0, entry!);
    return next;
}

/** Where the tile at `index` sits while the dragged tile hovers `over`. */
function previewIndex(index: number, from: number, over: number): number {
    if (index === from) return over;
    if (from < over && index > from && index <= over) return index - 1;
    if (from > over && index >= over && index < from) return index + 1;
    return index;
}

/**
 * Arc-style pinned destinations at the top of the sidebar: a grid of
 * rectangular tiles that rearrange only among themselves. A drag lifts the
 * tile under the pointer, the others glide once into the slots they will
 * occupy, and the release glides the tile into its own; the order is reported
 * only after that, so nothing moves when it lands.
 */
export function SidebarPins(props: SidebarPinsProps) {
    const grid = useRef<HTMLDivElement>(null);
    const [drag, dragSet] = useState<PinDrag>();
    /* The release of a drag also clicks; that click must not open the pin. */
    const swallowClick = useRef(false);

    const settle = (current: PinDrag) => {
        dragSet({ ...current, settling: true, dx: 0, dy: 0 });
        window.setTimeout(() => {
            if (current.from !== current.over)
                props.onReorder(moved(props.pins, current.from, current.over).map((pin) => pin.id));
            dragSet(undefined);
        }, SETTLE_MS);
    };

    const pointerDown = (event: PointerEvent<HTMLButtonElement>, index: number) => {
        if (event.button !== 0 || drag !== undefined || grid.current === null) return;
        const origin = grid.current.getBoundingClientRect();
        const slots = [...grid.current.querySelectorAll<HTMLElement>("[data-pin-tile]")].map(
            (tile) => {
                const box = tile.getBoundingClientRect();
                return new DOMRect(box.x - origin.x, box.y - origin.y, box.width, box.height);
            },
        );
        event.currentTarget.setPointerCapture(event.pointerId);
        dragSet({
            id: props.pins[index]!.id,
            pointerId: event.pointerId,
            from: index,
            over: index,
            startX: event.clientX,
            startY: event.clientY,
            dx: 0,
            dy: 0,
            moved: false,
            settling: false,
            slots,
        });
    };

    const pointerMove = (event: PointerEvent<HTMLButtonElement>) => {
        if (drag === undefined || drag.settling || event.pointerId !== drag.pointerId) return;
        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;
        const started = drag.moved || Math.hypot(dx, dy) >= DRAG_THRESHOLD;
        if (!started) return;
        const home = drag.slots[drag.from]!;
        const centerX = home.x + home.width / 2 + dx;
        const centerY = home.y + home.height / 2 + dy;
        let over = drag.over;
        let best = Number.POSITIVE_INFINITY;
        drag.slots.forEach((slot, index) => {
            const distance = Math.hypot(
                slot.x + slot.width / 2 - centerX,
                slot.y + slot.height / 2 - centerY,
            );
            if (distance < best) {
                best = distance;
                over = index;
            }
        });
        dragSet({ ...drag, dx, dy, moved: true, over });
    };

    const pointerUp = (event: PointerEvent<HTMLButtonElement>) => {
        if (drag === undefined || drag.settling || event.pointerId !== drag.pointerId) return;
        if (!drag.moved) {
            dragSet(undefined);
            return;
        }
        swallowClick.current = true;
        settle(drag);
    };

    const pointerCancel = (event: PointerEvent<HTMLButtonElement>) => {
        if (drag === undefined || drag.settling || event.pointerId !== drag.pointerId) return;
        if (!drag.moved) {
            dragSet(undefined);
            return;
        }
        settle({ ...drag, over: drag.from });
    };

    /* Option-arrows move the focused pin one slot, as a drag would. */
    const keyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
        if (!event.altKey || drag !== undefined) return;
        const step =
            event.key === "ArrowLeft" || event.key === "ArrowUp"
                ? -1
                : event.key === "ArrowRight" || event.key === "ArrowDown"
                  ? 1
                  : 0;
        const to = index + step;
        if (step === 0 || to < 0 || to >= props.pins.length) return;
        event.preventDefault();
        props.onReorder(moved(props.pins, index, to).map((pin) => pin.id));
    };

    return (
        <div className="sidebar-pins" data-layout={props.layout}>
            <div
                ref={grid}
                aria-label="Pinned"
                className="sidebar-pins__grid"
                data-dragging={drag?.moved ? "" : undefined}
                role="list"
            >
                {props.pins.map((pin, index) => {
                    const lifted = drag?.moved === true && drag.id === pin.id;
                    let transform: string | undefined;
                    if (drag?.moved) {
                        const home = drag.slots[index]!;
                        const target = drag.slots[previewIndex(index, drag.from, drag.over)]!;
                        transform =
                            lifted && !drag.settling
                                ? `translate(${String(drag.dx)}px, ${String(drag.dy)}px)`
                                : `translate(${String(target.x - home.x)}px, ${String(target.y - home.y)}px)`;
                    }
                    return (
                        <div className="sidebar-pins__cell" key={pin.id} role="listitem">
                            <button
                                aria-current={
                                    pin.targetId === props.activeTargetId ? "page" : undefined
                                }
                                className="sidebar-pins__tile"
                                data-lifted={lifted ? "" : undefined}
                                data-pin-tile=""
                                data-selected={
                                    pin.targetId === props.activeTargetId ? "" : undefined
                                }
                                data-settling={lifted && drag?.settling ? "" : undefined}
                                onClick={() => {
                                    if (swallowClick.current) {
                                        swallowClick.current = false;
                                        return;
                                    }
                                    props.onOpen(pin.targetId);
                                }}
                                onKeyDown={(event) => keyDown(event, index)}
                                onPointerCancel={pointerCancel}
                                onPointerDown={(event) => pointerDown(event, index)}
                                onPointerMove={pointerMove}
                                onPointerUp={pointerUp}
                                style={transform ? { transform } : undefined}
                                title={pin.title}
                                type="button"
                            >
                                <img alt="" className="sidebar-pins__icon" src={pin.iconUrl} />
                                <span className="sidebar-pins__title">{pin.title}</span>
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
