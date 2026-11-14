import type { CSSProperties, ReactNode } from "react";
import { Avatar, type AvatarTint } from "./Avatar";
import { CountBadge } from "./Badge";
import { Button } from "./Button";
import type { IconName } from "./Icon";
import { Menu, type MenuItem } from "./Menu";
import { SegmentedControl } from "./SegmentedControl";
import { TextField } from "./TextField";
import { Tooltip } from "./Tooltip";

/*
 * The focused sidebar's own parts. The sidebar itself is still `Sidebar`: its
 * rows, headings, folds, menus and footer are the ones the app draws today.
 * What is here is only what that sidebar has no word for yet:
 *
 *   SidebarPinTiles         the reader's first few pins as marks without names
 *   SidebarSleepingCluster  the faces of the bots a Bots heading put to sleep
 *   SidebarPriorityNote     what is said when a fourth task is marked priority
 *   SidebarFloatingMenu     a `Menu` opened from a control rather than a right-click
 *   HappyAgentNewPage       the single New screen and its switcher
 *
 * Prototype: props only, no store, nothing wired into the app.
 */

/** A face as a sidebar row draws one: a picture, a glyph on a tile, or the ID's placeholder. */
export interface SidebarFace {
    readonly icon?: IconName;
    readonly imageUrl?: string;
    readonly initials: string;
    readonly placeholderSeed?: string;
    readonly tint?: AvatarTint;
    /** A person's face is round; everything else is a rounded square. */
    readonly person?: boolean;
}

function FaceMark(props: { readonly face: SidebarFace; readonly style?: CSSProperties }) {
    const face = props.face;
    return (
        <Avatar
            icon={face.icon}
            imageUrl={face.imageUrl}
            initials={face.initials}
            placeholderSeed={face.placeholderSeed}
            size="xs"
            style={props.style}
            tint={face.tint}
            type={face.person ? "human" : "agent"}
        />
    );
}

/** One pinned thing drawn as a tile: its mark, and what the mark has to report. */
export interface SidebarPinTile {
    readonly id: string;
    readonly label: string;
    readonly face: SidebarFace;
    /** Something in it the reader has not seen: the row's own red dot, on the mark's corner. */
    readonly unread?: boolean;
    /** How many things in it wait on the reader, as a row's badge says it. */
    readonly badge?: number;
}

export interface SidebarPinTilesProps {
    readonly tiles: readonly SidebarPinTile[];
    /**
     * `grid` is four filled tiles to a line, as wide as the rows under them.
     * `strip` is one line of bare marks on the rows' own leading column.
     */
    readonly variant: "grid" | "strip";
    readonly activeId?: string;
    readonly onSelect: (id: string) => void;
}

/**
 * SidebarPinTiles — the reader's first few pins as marks without names, under
 * Search and New. A tile is a row reduced to its leading mark: the same 20px
 * face, the same unread dot on its corner, the same hover fill and selected
 * fill. Its name is a tooltip, since the reader put it there and knows it by
 * its face. Pins past the tiles are ordinary rows.
 */
export function SidebarPinTiles(props: SidebarPinTilesProps) {
    if (props.tiles.length === 0) return null;
    return (
        <div
            aria-label="Pinned"
            className="happy-pin-tiles"
            data-happy-desktop-ui="pin-tiles"
            data-variant={props.variant}
            role="group"
        >
            {props.tiles.map((tile, index) => (
                <Tooltip
                    /* A name at either end of a line opens inward, so the
                       sidebar's edge never cuts it. */
                    align={
                        (props.variant === "grid" ? index % 4 : index) === 0
                            ? "start"
                            : props.variant === "grid" && index % 4 === 3
                              ? "end"
                              : "center"
                    }
                    className="happy-pin-tiles__slot"
                    key={tile.id}
                    label={tile.label}
                    placement="bottom"
                >
                    <button
                        aria-current={props.activeId === tile.id ? "page" : undefined}
                        aria-label={tile.label}
                        className="happy-pin-tile"
                        data-active={props.activeId === tile.id ? "" : undefined}
                        data-happy-desktop-ui="pin-tile"
                        data-pin-id={tile.id}
                        onClick={() => props.onSelect(tile.id)}
                        type="button"
                    >
                        <span className="happy-pin-tile__mark">
                            <FaceMark face={tile.face} />
                            {tile.unread && (tile.badge ?? 0) === 0 ? (
                                <span
                                    aria-label="Unread"
                                    className="happy-sidebar__item-leading-unread"
                                    role="img"
                                />
                            ) : null}
                        </span>
                        {(tile.badge ?? 0) > 0 ? (
                            <CountBadge className="happy-pin-tile__badge" count={tile.badge ?? 0} />
                        ) : null}
                    </button>
                </Tooltip>
            ))}
        </div>
    );
}

/**
 * SidebarSleepingCluster — what the Bots heading says about the bots it put to
 * sleep: up to three of their faces, overlapped, and how many there are. It is
 * the heading's own disclosure for them, at its trailing edge, and takes no
 * row. With nothing asleep it is not drawn at all.
 */
export function SidebarSleepingCluster(props: {
    readonly faces: readonly SidebarFace[];
    readonly count: number;
    readonly expanded: boolean;
    readonly onToggle: () => void;
}) {
    if (props.count === 0) return null;
    return (
        <button
            aria-expanded={props.expanded}
            aria-label={`${String(props.count)} sleeping ${props.count === 1 ? "bot" : "bots"}`}
            className="happy-sleeping-cluster"
            data-happy-desktop-ui="sleeping-cluster"
            onClick={props.onToggle}
            title={props.expanded ? "Hide sleeping bots" : "Show sleeping bots"}
            type="button"
        >
            <span className="happy-sleeping-cluster__faces">
                {props.faces.slice(0, 3).map((face, index) => (
                    <span className="happy-sleeping-cluster__face" key={index}>
                        <FaceMark face={face} style={{ width: 14, height: 14, borderRadius: 4 }} />
                    </span>
                ))}
            </span>
            <span className="happy-sleeping-cluster__count">{props.count}</span>
        </button>
    );
}

/**
 * SidebarPriorityNote — what the Priority heading says when the reader marks
 * one task more than the limit allows: which task is waiting, and the one
 * choice that resolves it. The heading beside it already states the count and
 * the limit, and the rows under it each offer to give up their place; this is
 * only the sentence and the way out.
 */
export function SidebarPriorityNote(props: {
    /** The task waiting for a place. */
    readonly label: string;
    readonly onCancel: () => void;
}) {
    return (
        <div className="happy-priority-note" data-happy-desktop-ui="priority-note" role="status">
            <span className="happy-priority-note__text">
                {"Swap one out for "}
                <span className="happy-priority-note__name">{props.label}</span>
            </span>
            <button className="happy-priority-note__cancel" onClick={props.onCancel} type="button">
                Cancel
            </button>
        </div>
    );
}

/**
 * SidebarFloatingMenu — the house `Menu`, opened from a control or a tile at a
 * point in the window. Anything pressed outside it puts it away; the layer
 * under the menu takes that press, so nothing else in the window acts on it.
 */
export function SidebarFloatingMenu(props: {
    readonly x: number;
    readonly y: number;
    readonly items: MenuItem[];
    readonly onSelect: (id: string) => void;
    readonly onDismiss: () => void;
}) {
    return (
        <div
            className="happy-sidebar-floating-menu"
            data-happy-desktop-ui="sidebar-floating-menu"
            onContextMenu={(event) => {
                event.preventDefault();
                props.onDismiss();
            }}
            onKeyDown={(event) => {
                if (event.key === "Escape") props.onDismiss();
            }}
            onPointerDown={(event) => {
                if (event.target === event.currentTarget) props.onDismiss();
            }}
            /* Takes focus as it opens, so Escape reaches it wherever the press came from. */
            ref={(node) => node?.focus({ preventScroll: true })}
            tabIndex={-1}
        >
            <div
                className="happy-sidebar__item-menu happy-sidebar-floating-menu__menu"
                style={{ left: props.x, top: props.y }}
            >
                <Menu items={props.items} onSelect={props.onSelect} width={232} />
            </div>
        </div>
    );
}

/** What the New screen can make, as its first switcher names them. */
export type HappyAgentNewKind = "task" | "bot" | "surface" | "project";

/** The Surfaces the app can make today, as the heading's + lists them. */
export type HappyAgentNewSurfaceKind = "todo" | "document" | "calendar" | "chat" | "system_monitor";

const NEW_KINDS: readonly { value: HappyAgentNewKind; label: string; icon: IconName }[] = [
    { value: "task", label: "Task", icon: "tasks" },
    { value: "bot", label: "Bot", icon: "spark" },
    { value: "surface", label: "Surface", icon: "doc" },
    { value: "project", label: "Project", icon: "branch" },
];

const NEW_SURFACES: readonly {
    value: HappyAgentNewSurfaceKind;
    label: string;
    icon: IconName;
    title: string;
    lede: string;
}[] = [
    {
        value: "todo",
        label: "Todo list",
        icon: "tasks",
        title: "Create a new todo list",
        lede: "A list of todos that people and agents add to, tick off and reorder together.",
    },
    {
        value: "document",
        label: "Document",
        icon: "doc",
        title: "Create a new document",
        lede: "A Markdown document that people and agents write in at the same time.",
    },
    {
        value: "calendar",
        label: "Calendar",
        icon: "calendar",
        title: "Create a new calendar",
        lede: "A shared calendar of one-off and repeating events.",
    },
    {
        value: "chat",
        label: "Chat",
        icon: "users",
        title: "Create a new chat",
        lede: "A conversation between people, with an agent that answers when it is asked.",
    },
    {
        value: "system_monitor",
        label: "Monitor",
        icon: "pulse",
        title: "Create a new system monitor",
        lede: "Live CPU, memory, disk and processes of the machine this Happy Agent runs on.",
    },
];

export interface HappyAgentNewPageProps {
    readonly kind: HappyAgentNewKind;
    readonly surfaceKind: HappyAgentNewSurfaceKind;
    readonly onKindChange: (kind: HappyAgentNewKind) => void;
    readonly onSurfaceKindChange: (kind: HappyAgentNewSurfaceKind) => void;
    /** The creation surface of a task or a bot: the app's own, with its composer. */
    readonly children?: ReactNode;
    readonly onSubmit?: () => void;
}

/**
 * HappyAgentNewPage — the one screen New opens. A switcher across its top
 * says what is being made; under it stands that thing's own creation surface.
 * A task and a bot bring the surfaces the app already has, composer and all.
 * A Surface picks its type from a second switcher and asks only for a name;
 * a project asks for a folder.
 *
 * Mocked lightly: the switchers and the copy are the proposal, the fields do
 * nothing.
 */
export function HappyAgentNewPage(props: HappyAgentNewPageProps) {
    const surface =
        NEW_SURFACES.find((entry) => entry.value === props.surfaceKind) ?? NEW_SURFACES[0];
    return (
        <div className="happy-agent-new" data-happy-desktop-ui="happy-agent-new">
            <div className="happy-agent-new__switch">
                <SegmentedControl
                    aria-label="What to make"
                    onChange={(value) => {
                        const next = NEW_KINDS.find((entry) => entry.value === value);
                        if (next !== undefined) props.onKindChange(next.value);
                    }}
                    segments={NEW_KINDS.map((entry) => ({ ...entry }))}
                    size="small"
                    value={props.kind}
                />
                {/* Which surface, on a line of its own under the switch: it hangs
                    below without taking a place, so the title under it stands
                    where every other kind's title stands. */}
                {props.kind === "surface" && surface !== undefined ? (
                    <div className="happy-agent-new__subswitch">
                        <SegmentedControl
                            aria-label="Surface type"
                            onChange={(value) => {
                                const next = NEW_SURFACES.find((entry) => entry.value === value);
                                if (next !== undefined) props.onSurfaceKindChange(next.value);
                            }}
                            segments={NEW_SURFACES.map((entry) => ({
                                icon: entry.icon,
                                label: entry.label,
                                value: entry.value,
                            }))}
                            size="compact"
                            value={surface.value}
                        />
                    </div>
                ) : null}
            </div>
            <div
                className="happy-agent-new__body"
                data-plain={props.kind === "surface" || props.kind === "project" ? "" : undefined}
            >
                {props.kind === "task" || props.kind === "bot" ? (
                    props.children
                ) : props.kind === "surface" && surface !== undefined ? (
                    <div className="happy-agent-create-task">
                        <header className="happy-agent-create-task__header">
                            <h1 className="happy-agent-create-task__title">{surface.title}</h1>
                            <p className="happy-agent-create-task__lede">{surface.lede}</p>
                        </header>
                        <div className="happy-agent-create-task__below">
                            <div className="happy-agent-create-task__row">
                                <TextField
                                    aria-label="Name"
                                    className="happy-agent-create-task__name"
                                    fullWidth
                                    onValueChange={() => undefined}
                                    placeholder="Name"
                                    value=""
                                />
                                <Button
                                    className="happy-agent-create-task__create"
                                    onClick={props.onSubmit}
                                    variant="secondary"
                                >
                                    Create
                                </Button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="happy-agent-create-task">
                        <header className="happy-agent-create-task__header">
                            <h1 className="happy-agent-create-task__title">Add a project</h1>
                            <p className="happy-agent-create-task__lede">
                                A project is a folder on this machine. Work in it happens in
                                workspaces, each a checkout of its own.
                            </p>
                        </header>
                        <div className="happy-agent-create-task__below">
                            <div
                                className="happy-agent-create-task__row"
                                style={{ justifyContent: "center" }}
                            >
                                <Button onClick={props.onSubmit} variant="secondary">
                                    Choose a folder…
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export type { MenuItem as SidebarFloatingMenuItem };
