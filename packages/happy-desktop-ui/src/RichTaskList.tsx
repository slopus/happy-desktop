import {
    useLayoutEffect,
    useRef,
    useState,
    type PointerEvent as ReactPointerEvent,
    type ReactNode,
} from "react";
import { Avatar, type ToneName } from "./Avatar";
import { Icon } from "./Icon";
import { ClayIcon } from "./ClayIcon";
import { ContextMenu } from "./ContextMenu";
import { SIDEBAR_SETTLE } from "./Sidebar";
import {
    SIDEBAR_DRAG_THRESHOLD,
    SIDEBAR_SETTLE_WAIT_MS,
    sidebarDropSlotNearest,
} from "./sidebarDrag";
import { Spinner } from "./Spinner";
import { StoryRing, type StoryRingSegments } from "./StoryRing";
import { Ionicon, type IoniconName } from "./vectorIcons/VectorIcon";

/** Someone whose message is waiting in the task's conversation. */
export type RichTaskFace = {
    readonly id: string;
    readonly label: string;
    /** Drawn when there is no picture; the label's first letter otherwise. */
    readonly initials?: string;
    readonly imageUrl?: string;
    readonly tone?: ToneName;
};

export type RichTaskSubRowModel = {
    /** Unique in the list: one workspace can stand under two tasks. */
    readonly id: string;
    /** The 18px mark: a project's picture or a glyph on a quiet tile. */
    readonly mark:
        | { readonly kind: "image"; readonly src: string }
        | { readonly kind: "glyph"; readonly icon: IoniconName };
    readonly label: string;
    /** Quieter words after the label, such as the question a subtask is asking. */
    readonly detail?: string;
    /** A workspace's line totals over main, or "merged" once nothing is left over. */
    readonly changes?: { readonly added: number; readonly removed: number } | "merged";
    readonly working?: boolean;
    /** Sub-work the task chose to hide, drawn faded while its card is expanded. */
    readonly dimmed?: boolean;
};

export type RichTaskCardModel = {
    readonly id: string;
    readonly title: string;
    /** When the task last moved, already worded ("now", "4m", "1h"). */
    readonly time: string;
    readonly status: string | null;
    readonly iconSlug: string | null;
    /** The story ring around the disc. */
    readonly ring?: boolean;
    /** The agent's live stories: the ring drawn in segments, and the disc opens them. */
    readonly story?: StoryRingSegments;
    readonly faces: readonly RichTaskFace[];
    /** What the corner reports: the agent is working, or something is unread. */
    readonly signal: "working" | "unread" | null;
    readonly subRows: readonly RichTaskSubRowModel[];
    /** Sub-work not drawn, behind "+k more". */
    readonly more: number;
    readonly expanded: boolean;
};

export type RichTaskListRow =
    | {
          readonly kind: "section";
          readonly id: string;
          readonly name: string;
          readonly collapsed: boolean;
      }
    | { readonly kind: "task"; readonly card: RichTaskCardModel };

/** Where a dropped card lands: after a card (`null`: first of all), or first under a header. */
export type RichTaskMoveAnchor =
    | { readonly afterId: string | null }
    | { readonly afterSectionId: string };

export type RichTaskListProps = {
    readonly rows: readonly RichTaskListRow[];
    /** A card's or a sub-row's id. */
    readonly selectedId: string | null;
    /** `inset` starts a sub-row's highlight at its mark; `full` runs it across the row. */
    readonly selection?: "inset" | "full";
    /** Holds every working spinner on one frame, for fixtures. */
    readonly workingFrame?: number;
    readonly onSelect: (id: string) => void;
    readonly onSectionCollapseToggle: (sectionId: string) => void;
    readonly onMoreToggle: (taskId: string) => void;
    /** Offers "Hide" on a sub-row's context menu; left out, sub-rows have no menu. */
    readonly onSubRowHide?: (id: string) => void;
    /** Lets cards be dragged; a drop reports where the card now stands. Left out, nothing drags. */
    readonly onTaskMove?: (taskId: string, anchor: RichTaskMoveAnchor) => void;
    /** Opens a card's stories from its ringed disc. */
    readonly onStoryOpen?: (taskId: string) => void;
};

const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Plays the sidebar's settle glide from `from` to where the node stands. */
const settle = (node: HTMLElement, from: Keyframe, to: Keyframe) =>
    node.animate([from, to], {
        duration: SIDEBAR_SETTLE.durationMs,
        easing: SIDEBAR_SETTLE.easing,
    });

/** The list's rows, each with its key, in document order. */
const rowNodes = (root: HTMLElement) =>
    [...root.children].filter(
        (node): node is HTMLElement =>
            node instanceof HTMLElement && node.dataset.rowKey !== undefined,
    );

/** Whether a row starts a unit a card moves among: a header, or a card with its rows. */
const unitHead = (node: HTMLElement) => /^(task|section):/u.test(node.dataset.rowKey!);

const unitOrder = (root: HTMLElement): string =>
    rowNodes(root)
        .filter(unitHead)
        .map((node) => node.dataset.rowKey)
        .join(" ");

type RowLayout = { readonly order: readonly string[]; readonly tops: ReadonlyMap<string, number> };

/**
 * A reorder glides: every row that changed place travels from where it was
 * painted to its new slot. Folding, expanding, and rows coming or going stay
 * instant, as in the sidebar. Positions are read relative to the list, so
 * content moving above it is not a reorder.
 */
function rowsGlide(root: HTMLElement, previous: RowLayout | undefined): RowLayout {
    const origin = root.getBoundingClientRect().top;
    const nodes = rowNodes(root);
    const order = nodes.map((node) => node.dataset.rowKey!);
    // Whether the rows both orders share now stand in a different sequence.
    const shared = previous?.order.filter((key) => order.includes(key)) ?? [];
    const after = order.filter((key) => shared.includes(key));
    const glide = shared.some((key, index) => after[index] !== key) && !still();
    const tops = new Map<string, number>();
    for (const node of nodes) {
        const key = node.dataset.rowKey!;
        // A row mid-glide is painted at its offset; its slot is the layout under it.
        const offset = Number.parseFloat(getComputedStyle(node).top) || 0;
        const layout = node.getBoundingClientRect().top - origin - offset;
        tops.set(key, layout);
        const first = previous?.tops.get(key);
        if (!glide || first === undefined) continue;
        const delta = first + offset - layout;
        if (Math.abs(delta) < 0.001) continue;
        node.getAnimations().forEach((animation) => animation.cancel());
        settle(node, { top: `${delta}px` }, { top: "0px" });
    }
    return { order, tops };
}

/** A landing place for a carried card, in the list's own coordinates; none is its own place. */
type RichTaskSlot = { readonly anchor?: RichTaskMoveAnchor; readonly y: number };

type RichTaskCarry = {
    readonly taskId: string;
    readonly pointerId: number;
    /** Where the card's top stood, and where the pointer took hold, from the list's top. */
    readonly top: number;
    readonly startY: number;
    /** The card's rows: the card, its sub-rows and its "+k more", carried as one. */
    readonly nodes: readonly HTMLElement[];
    readonly slots: readonly RichTaskSlot[];
    /** The cards' and headers' order when it began; any other means the list moved under it. */
    readonly order: string;
    deltaY: number;
    moved: boolean;
    target?: RichTaskSlot;
    /** Set once dropped, until the new order renders or the wait runs out. */
    settling?: ReturnType<typeof setTimeout>;
};

/**
 * The list as laid out now, in units, and every place the card can land among
 * them: each gap between units, said by what it follows. A gap just under a
 * folded header is not offered, since the card would vanish into it.
 */
function carryOf(
    root: HTMLElement,
    taskId: string,
    pointerId: number,
    startY: number,
): RichTaskCarry | undefined {
    const origin = root.getBoundingClientRect().top;
    const units: HTMLElement[][] = [];
    for (const node of rowNodes(root))
        if (unitHead(node) || units.length === 0) units.push([node]);
        else units.at(-1)!.push(node);
    const at = units.findIndex((unit) => unit[0]!.dataset.rowKey === `task:${taskId}`);
    if (at < 0) return undefined;
    const top = (unit: readonly HTMLElement[]) => unit[0]!.getBoundingClientRect().top - origin;
    const slots: RichTaskSlot[] = [{ y: top(units[at]!) }];
    for (let gap = 0; gap <= units.length; gap += 1) {
        const before = units[gap - 1]?.[0];
        if (gap === at || gap === at + 1 || before?.dataset.collapsed !== undefined) continue;
        const key = before?.dataset.rowKey ?? "";
        slots.push({
            anchor: key.startsWith("section:")
                ? { afterSectionId: key.slice(8) }
                : { afterId: key.startsWith("task:") ? key.slice(5) : null },
            y:
                gap < units.length
                    ? top(units[gap]!)
                    : units.at(-1)!.at(-1)!.getBoundingClientRect().bottom - origin,
        });
    }
    const order = unitOrder(root);
    return {
        taskId,
        pointerId,
        top: slots[0]!.y,
        startY,
        nodes: units[at]!,
        slots,
        order,
        deltaY: 0,
        moved: false,
    };
}

/** Carries the card's rows with the pointer once past the threshold; false while they sit. */
function carryFollow(carry: RichTaskCarry, y: number): boolean {
    carry.deltaY = y - carry.startY;
    if (!carry.moved && Math.abs(carry.deltaY) < SIDEBAR_DRAG_THRESHOLD) return false;
    carry.moved = true;
    for (const node of carry.nodes) {
        node.style.transform = `translateY(${carry.deltaY}px)`;
        node.dataset.carried = "";
    }
    carry.target = sidebarDropSlotNearest(carry.slots, carry.top + carry.deltaY);
    return true;
}

/** Whether the pointer is more than a card's height outside the list, where nothing lands. */
function carryOutside(carry: RichTaskCarry, list: HTMLElement, x: number, y: number): boolean {
    const box = list.getBoundingClientRect();
    const reach = carry.nodes[0]!.offsetHeight;
    return (
        y < box.top - reach ||
        y > box.bottom + reach ||
        x < box.left - reach ||
        x > box.right + reach
    );
}

/** Puts a carried card's rows down where they stand, gliding them home when it went nowhere. */
function carryRelease(carry: RichTaskCarry, home: boolean): void {
    clearTimeout(carry.settling);
    for (const node of carry.nodes) {
        node.style.removeProperty("transform");
        delete node.dataset.carried;
        if (home && carry.deltaY !== 0 && !still())
            settle(node, { transform: `translateY(${carry.deltaY}px)` }, { transform: "none" });
    }
}

/** 1.2k, as the sidebar abbreviates line totals. */
const lines = (count: number): string =>
    count >= 1000 ? `${(count / 1000).toFixed(1).replace(/\.0$/u, "")}k` : String(count);

/**
 * The rich task list: section headers, cards, and each card's sub-rows and
 * "+k more", as one flat run of rows keyed by id, so a card or sub-row keeps
 * its node, focus and selection when the list reorders or a section folds.
 */
export function RichTaskList(props: RichTaskListProps) {
    const root = useRef<HTMLDivElement>(null);
    const layout = useRef<RowLayout | undefined>(undefined);
    const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
    const [line, setLine] = useState<number | null>(null);
    const carry = useRef<RichTaskCarry | undefined>(undefined);
    const clickSwallow = useRef(false);
    const { onSubRowHide, onTaskMove } = props;
    const carryEnd = (held: RichTaskCarry, home: boolean) => {
        carryRelease(held, home);
        carry.current = undefined;
    };
    // eslint-disable-next-line happy-react/no-layout-effect -- a reorder glide must measure the rows laid out by the render it follows, before paint, which no declarative or event-driven boundary exposes
    useLayoutEffect(() => {
        if (!root.current) return;
        // A card put down glides from where the hand left it once its new order renders.
        if (carry.current && unitOrder(root.current) !== carry.current.order)
            carryEnd(carry.current, false);
        layout.current = rowsGlide(root.current, layout.current);
    });
    // eslint-disable-next-line happy-react/no-layout-effect -- a card still carried or settling when the list goes holds a timer that must not outlive it
    useLayoutEffect(
        () => () => {
            if (carry.current) carryEnd(carry.current, false);
        },
        [],
    );
    const select = (id: string) => {
        if (clickSwallow.current) clickSwallow.current = false;
        else props.onSelect(id);
    };
    /** A card is carried with the pointer, its rows held still around it, and dropped on a line. */
    const cardPointer = (event: ReactPointerEvent<HTMLButtonElement>, taskId: string): void => {
        const list = root.current;
        if (!list || !onTaskMove) return;
        const y = event.clientY - list.getBoundingClientRect().top;
        const held = carry.current;
        if (event.type === "pointerdown") {
            if (event.button !== 0 || held) return;
            clickSwallow.current = false;
            carry.current = carryOf(list, taskId, event.pointerId, y);
            // Scripted pointer events have no browser-owned pointer to capture.
            if (event.isTrusted) event.currentTarget.setPointerCapture(event.pointerId);
            return;
        }
        if (!held || held.pointerId !== event.pointerId || held.settling !== undefined) return;
        const outside = carryOutside(held, list, event.clientX, event.clientY);
        if (event.type === "pointermove") {
            if (!carryFollow(held, y)) return;
            if (outside) held.target = undefined;
            setLine(held.target?.anchor ? held.target.y : null);
            return;
        }
        setLine(null);
        // The release's click, if the browser fires one, comes before any timer.
        clickSwallow.current = held.moved;
        setTimeout(() => (clickSwallow.current = false));
        const anchor = event.type === "pointerup" && !outside ? held.target?.anchor : undefined;
        if (!held.moved || !anchor) return carryEnd(held, true);
        // Where the rows are painted now is where the glide to their new places starts.
        layout.current = rowsGlide(list, layout.current);
        held.settling = setTimeout(() => {
            if (carry.current === held) carryEnd(held, true);
        }, SIDEBAR_SETTLE_WAIT_MS);
        onTaskMove(taskId, anchor);
    };
    const working = (
        <span className="happy-rich-task__working" data-happy-desktop-ui="rich-task-working">
            <Spinner
                frame={props.workingFrame}
                label="Working"
                size={14}
                tone="muted"
                variant="braille-2"
            />
        </span>
    );
    /**
     * A task as a three-line card: title and time, then two status lines. The
     * corner on the last line holds "+k more" when every sub-row is hidden, the
     * faces of unread writers, and the signal, all centred on that line's x-height.
     */
    const cardRow = (card: RichTaskCardModel) => {
        const moreInCorner = !card.expanded && card.subRows.length === 0 && card.more > 0;
        const drag = onTaskMove
            ? (event: ReactPointerEvent<HTMLButtonElement>) => cardPointer(event, card.id)
            : undefined;
        // A disc with stories behind it opens them.
        const Disc = card.story ? "button" : "span";
        return (
            <div
                className="happy-rich-task-card"
                data-happy-desktop-ui="rich-task-card"
                data-row-key={`task:${card.id}`}
                data-selected={props.selectedId === card.id ? "" : undefined}
                key={`task:${card.id}`}
            >
                <button
                    aria-label={card.title}
                    aria-pressed={props.selectedId === card.id}
                    className="happy-rich-task-card__hit"
                    onClick={() => select(card.id)}
                    onLostPointerCapture={drag}
                    onPointerCancel={drag}
                    onPointerDown={drag}
                    onPointerMove={drag}
                    onPointerUp={drag}
                    type="button"
                />
                <Disc
                    aria-label={card.story ? `${card.title}: open story` : undefined}
                    className="happy-rich-task-card__disc"
                    data-happy-desktop-ui="rich-task-disc"
                    data-ring={card.ring && !card.story ? "" : undefined}
                    onClick={card.story ? () => props.onStoryOpen?.(card.id) : undefined}
                >
                    {card.story ? <StoryRing segments={card.story} size={50} /> : null}
                    <ClayIcon
                        label={card.title}
                        size={card.ring || card.story ? 34 : 40}
                        slug={card.iconSlug}
                    />
                </Disc>
                <span className="happy-rich-task-card__body">
                    <span className="happy-rich-task-card__head">
                        <span
                            className="happy-rich-task-card__title"
                            data-happy-desktop-ui="rich-task-title"
                        >
                            {card.title}
                        </span>
                        <span
                            className="happy-rich-task-card__time"
                            data-happy-desktop-ui="rich-task-time"
                        >
                            {card.time}
                        </span>
                    </span>
                    <span
                        className="happy-rich-task-card__status"
                        data-happy-desktop-ui="rich-task-status"
                    >
                        {/* A zero-width float holds line one, so the corner floats on line two. */}
                        <span className="happy-rich-task-card__strut" />
                        {moreInCorner || card.faces.length > 0 || card.signal !== null ? (
                            <span
                                className="happy-rich-task-card__corner"
                                data-happy-desktop-ui="rich-task-corner"
                            >
                                {moreInCorner ? (
                                    <button
                                        className="happy-rich-task-more-button"
                                        data-happy-desktop-ui="rich-task-more"
                                        onClick={() => props.onMoreToggle(card.id)}
                                        type="button"
                                    >
                                        {/* Status-sized, so the label stands on the status baseline. */}
                                        <span className="happy-rich-task-more-button__strut">
                                            {"\u200b"}
                                        </span>
                                        <span className="happy-rich-task-more-button__label">{`+${card.more} more`}</span>
                                    </button>
                                ) : null}
                                {card.faces.length > 0 ? (
                                    <span
                                        className="happy-rich-task-card__faces"
                                        data-happy-desktop-ui="rich-task-faces"
                                    >
                                        {card.faces.map((face) => (
                                            <Avatar
                                                aria-label={face.label}
                                                imageUrl={face.imageUrl}
                                                initials={
                                                    face.initials ??
                                                    face.label.slice(0, 1).toUpperCase()
                                                }
                                                key={face.id}
                                                size="xs"
                                                tone={face.tone}
                                            />
                                        ))}
                                    </span>
                                ) : null}
                                {card.signal === "unread" ? (
                                    <span
                                        className="happy-rich-task__dot"
                                        data-happy-desktop-ui="rich-task-dot"
                                    />
                                ) : card.signal === "working" ? (
                                    working
                                ) : null}
                            </span>
                        ) : null}
                        {card.status}
                    </span>
                </span>
            </div>
        );
    };
    /** One piece of a task's sub-work under its card: mark, name, line totals, signal. */
    const subRow = (row: RichTaskSubRowModel) => (
        <button
            aria-pressed={props.selectedId === row.id}
            className="happy-rich-task-row"
            data-dimmed={row.dimmed ? "" : undefined}
            data-happy-desktop-ui="rich-task-row"
            data-row-key={row.id}
            data-selected={props.selectedId === row.id ? "" : undefined}
            key={row.id}
            onClick={() => props.onSelect(row.id)}
            onContextMenu={(event) => {
                if (!onSubRowHide) return;
                event.preventDefault();
                setMenu({ id: row.id, x: event.clientX, y: event.clientY });
            }}
            type="button"
        >
            <span className="happy-rich-task-row__lead">
                {row.mark.kind === "image" ? (
                    <img
                        alt=""
                        className="happy-rich-task-row__mark"
                        data-happy-desktop-ui="rich-task-mark"
                        draggable={false}
                        src={row.mark.src}
                    />
                ) : (
                    <span
                        className="happy-rich-task-row__mark"
                        data-happy-desktop-ui="rich-task-mark"
                        data-kind="glyph"
                    >
                        <Ionicon name={row.mark.icon} size={12} />
                    </span>
                )}
                <span
                    className="happy-rich-task-row__label"
                    data-happy-desktop-ui="rich-task-label"
                >
                    {row.label}
                    {row.detail ? (
                        <span className="happy-rich-task-row__detail">{` · ${row.detail}`}</span>
                    ) : null}
                </span>
            </span>
            {row.changes || row.working ? (
                <span
                    className="happy-rich-task-row__trail"
                    data-happy-desktop-ui="rich-task-trail"
                >
                    {row.changes === "merged" ? (
                        <span className="happy-rich-task-row__changes">merged</span>
                    ) : row.changes ? (
                        <span className="happy-rich-task-row__changes">
                            <span className="happy-rich-task-row__added">{`+${lines(row.changes.added)}`}</span>{" "}
                            <span className="happy-rich-task-row__removed">{`\u2212${lines(row.changes.removed)}`}</span>
                        </span>
                    ) : null}
                    {row.working ? working : null}
                </span>
            ) : null}
        </button>
    );
    const rows = props.rows.flatMap((row): ReactNode[] => {
        if (row.kind === "section")
            return [
                <button
                    aria-expanded={!row.collapsed}
                    className="happy-rich-task-section"
                    data-collapsed={row.collapsed ? "" : undefined}
                    data-happy-desktop-ui="rich-task-section"
                    data-row-key={`section:${row.id}`}
                    key={`section:${row.id}`}
                    onClick={() => props.onSectionCollapseToggle(row.id)}
                    type="button"
                >
                    <span className="happy-rich-task-section__name">{row.name}</span>
                    <Icon name={row.collapsed ? "chevron-right" : "chevron-down"} size={12} />
                </button>,
            ];
        const card = row.card;
        const footer = card.expanded
            ? "hide"
            : card.subRows.length > 0 && card.more > 0
              ? `+${card.more} more`
              : null;
        return [
            cardRow(card),
            ...card.subRows.map(subRow),
            footer ? (
                <button
                    className="happy-rich-task-more"
                    data-happy-desktop-ui="rich-task-more-row"
                    data-row-key={`more:${card.id}`}
                    key={`more:${card.id}`}
                    onClick={() => props.onMoreToggle(card.id)}
                    type="button"
                >
                    <span className="happy-rich-task-more__label">{footer}</span>
                </button>
            ) : null,
        ];
    });
    return (
        <div
            className="happy-rich-tasks"
            data-happy-desktop-ui="rich-tasks"
            data-selection={props.selection ?? "inset"}
            ref={root}
        >
            {rows}
            {line === null ? null : (
                <span className="happy-rich-tasks__drop-line" style={{ top: line }} />
            )}
            {menu && onSubRowHide ? (
                <ContextMenu
                    items={[{ kind: "item", id: "hide", label: "Hide", icon: "eye-off" }]}
                    onClose={() => setMenu(null)}
                    onSelect={() => {
                        setMenu(null);
                        onSubRowHide(menu.id);
                    }}
                    x={menu.x}
                    y={menu.y}
                />
            ) : null}
        </div>
    );
}
