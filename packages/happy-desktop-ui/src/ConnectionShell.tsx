import { Fragment, useState, type CSSProperties, type ReactNode } from "react";
import { Avatar } from "./Avatar";
import { ContextMenu } from "./ContextMenu";
import { Icon } from "./Icon";
import type { MenuItem } from "./Menu";
import { ScrollArea } from "./Scrollbar";
import { thumbhashDataUrl } from "./thumbhashDataUrl";
import { useConnectionReorder } from "./useConnectionReorder";
import { WindowCoverHostContext } from "./WindowOverlay";

export interface ConnectionShellItem {
    readonly id: string;
    readonly label: string;
    readonly local: boolean;
    readonly status: "connecting" | "connected" | "disconnected" | "error";
    /** Unread conversations on this connection, independent of selection and connectivity. */
    readonly unread?: boolean;
    /** At least one conversation on this connection is running. */
    readonly working?: boolean;
    /** A voice call is pointing at something on this connection while another is shown. */
    readonly voiceFocus?: boolean;
    /**
     * The picture the Happy Agent itself wears. It outranks the home glyph and
     * the generated tile alike; the thumbhash stands in until the bytes arrive.
     */
    readonly avatar?: { readonly url: string; readonly thumbhash: string };
}

function ConnectionShellTile(props: { readonly item: ConnectionShellItem }) {
    const { item } = props;
    if (item.avatar) {
        const placeholder = thumbhashDataUrl(item.avatar.thumbhash);
        return (
            <img
                // A new picture is a new element, so the browser fetches it
                // rather than keeping the old bytes under an unchanged address.
                key={item.avatar.thumbhash}
                className="happy-connections__image"
                src={item.avatar.url}
                alt=""
                draggable={false}
                style={placeholder ? { backgroundImage: `url(${placeholder})` } : undefined}
            />
        );
    }
    if (item.local) return <Icon name="home" size={20} />;
    return (
        <Avatar
            initials={item.label.slice(0, 1).toUpperCase()}
            size="md"
            style={{ width: 36, height: 36, borderRadius: 10 }}
            type="agent"
        />
    );
}

/** The connection switcher stays outside every connection's workspace and setup. */
export function ConnectionShell(props: {
    readonly items: readonly ConnectionShellItem[];
    readonly selectedId: string;
    readonly onSelect: (id: string) => void;
    /** Reorder remote items only; null places an item immediately below Home. */
    readonly onReorder?: (id: string, afterId: string | null) => void;
    readonly reordering?: boolean;
    readonly reorderError?: string;
    readonly children: ReactNode;
    /**
     * The rail heads a desktop window and keeps its 40px title band, in full
     * screen as well as windowed, so Home never moves to the window's top edge.
     */
    readonly windowControls?: boolean;
    /** Relinquishes the native safe area when full screen has no traffic lights. */
    readonly windowFullScreen?: boolean;
    /** Freeze the working shimmer at a loop fraction for deterministic previews. */
    readonly workingShimmerPhase?: number;
    /**
     * The window's left side is folded away. The rail stands beside the
     * sidebar and goes with it, so the active connection takes the whole
     * width and its own reveal control brings both back.
     */
    readonly collapsed?: boolean;
    readonly error?: string;
    /** The context menu one entry offers. Empty, or absent, means no menu. */
    readonly itemMenuItems?: (item: ConnectionShellItem) => MenuItem[];
    /** A row was chosen from an entry's context menu. */
    readonly onItemMenuSelect?: (id: string, actionId: string) => void;
}) {
    // Which entry's menu is open and where the pointer asked for it. The menu
    // is this rail's own passing state; what it offers belongs to the caller.
    const [menu, setMenu] = useState<{
        readonly id: string;
        readonly items: readonly MenuItem[];
        readonly x: number;
        readonly y: number;
    }>();
    // The lane a surface covering the whole window hangs from, rail and all.
    // State, not a ref: the surfaces that portal into it must be told once it exists.
    const [cover, coverSet] = useState<HTMLDivElement | null>(null);
    const local = props.items.filter((item) => item.local);
    const remotes = props.items.filter((item) => !item.local);
    const items = [...local, ...remotes];
    const reorderable = props.onReorder !== undefined && !props.reordering;
    const {
        railRef,
        dragging,
        heldId,
        shift,
        clickAllowed,
        start,
        move,
        end,
        cancel,
        keyboardMove,
    } = useConnectionReorder(
        remotes.map((item) => item.id),
        reorderable ? props.onReorder : undefined,
    );
    return (
        <div className="happy-connections" data-happy-desktop-ui="connection-shell">
            {props.items.length > 1 && !props.collapsed ? (
                <nav
                    className="happy-connections__rail"
                    aria-label="Connections"
                    data-window-controls={props.windowControls || undefined}
                    data-window-full-screen={props.windowFullScreen || undefined}
                    data-shimmer-paused={props.workingShimmerPhase !== undefined || undefined}
                    style={
                        props.workingShimmerPhase === undefined
                            ? undefined
                            : ({
                                  "--happy-connections-shimmer-offset": props.workingShimmerPhase,
                              } as CSSProperties)
                    }
                >
                    <ScrollArea>
                        <div
                            className="happy-connections__items"
                            ref={railRef}
                            data-reordering={dragging || undefined}
                        >
                            {items.map((item) => (
                                <Fragment key={item.id}>
                                    <button
                                        className="happy-connections__item"
                                        type="button"
                                        aria-label={`${item.label}, ${item.status}${item.working && item.status === "connected" ? ", agents working" : ""}${item.unread ? ", unread activity" : ""}`}
                                        aria-current={
                                            props.selectedId === item.id ? "page" : undefined
                                        }
                                        title={`${item.label} · ${item.status}${item.working && item.status === "connected" ? " · Agents working" : ""}${!item.local && reorderable ? " · Drag or use Alt+↑/↓ to reorder" : ""}`}
                                        aria-description={
                                            !item.local && reorderable
                                                ? "Drag or use Alt+Arrow Up or Alt+Arrow Down to reorder."
                                                : undefined
                                        }
                                        onClick={() => {
                                            if (clickAllowed()) props.onSelect(item.id);
                                        }}
                                        onContextMenu={(event) => {
                                            const entries = props.itemMenuItems?.(item) ?? [];
                                            if (!entries.some((entry) => entry.kind === "item"))
                                                return;
                                            event.preventDefault();
                                            setMenu({
                                                id: item.id,
                                                items: entries,
                                                x: event.clientX,
                                                y: event.clientY,
                                            });
                                        }}
                                        draggable={false}
                                        onDragStart={(event) => event.preventDefault()}
                                        onPointerDown={(event) => start(event, item.id)}
                                        onPointerMove={move}
                                        onPointerUp={end}
                                        onPointerCancel={cancel}
                                        onLostPointerCapture={cancel}
                                        onKeyDown={(event) => {
                                            if (
                                                item.local ||
                                                !reorderable ||
                                                !event.altKey ||
                                                event.ctrlKey ||
                                                event.metaKey ||
                                                event.shiftKey ||
                                                (event.key !== "ArrowUp" &&
                                                    event.key !== "ArrowDown")
                                            )
                                                return;
                                            event.preventDefault();
                                            keyboardMove(item.id, event.key === "ArrowUp" ? -1 : 1);
                                        }}
                                        data-dragging={heldId === item.id || undefined}
                                        data-connection-id={item.id}
                                        style={
                                            dragging
                                                ? {
                                                      transform: `translateY(${shift(item.id)}px)`,
                                                  }
                                                : undefined
                                        }
                                        data-local={item.local || undefined}
                                        data-status={item.status}
                                        data-working={
                                            (item.working && item.status === "connected") ||
                                            undefined
                                        }
                                        data-voice-focus={item.voiceFocus || undefined}
                                    >
                                        <ConnectionShellTile item={item} />
                                        {item.unread ? (
                                            <span
                                                aria-hidden="true"
                                                className="happy-connections__unread"
                                                data-happy-desktop-ui="connection-unread"
                                            />
                                        ) : null}
                                        {item.voiceFocus ? (
                                            <span
                                                aria-label="Voice focus on this connection"
                                                className="happy-connections__voice"
                                                data-happy-desktop-ui="connection-voice"
                                                role="img"
                                            >
                                                <Icon name="mic" size={12} />
                                            </span>
                                        ) : null}
                                    </button>
                                    {item === local.at(-1) && remotes.length > 0 ? (
                                        <div
                                            className="happy-connections__separator"
                                            role="separator"
                                        />
                                    ) : null}
                                </Fragment>
                            ))}
                        </div>
                    </ScrollArea>
                    <div className="happy-connections__footer" aria-hidden="true" />
                </nav>
            ) : null}
            <div className="happy-connections__body">
                {props.error ? (
                    <div className="happy-connections__error" role="status">
                        Connection list unavailable. Keeping known connections.
                    </div>
                ) : null}
                {props.reorderError ? (
                    <div className="happy-connections__error" role="alert">
                        {props.reorderError}
                    </div>
                ) : null}
                <WindowCoverHostContext.Provider value={cover}>
                    {props.children}
                </WindowCoverHostContext.Provider>
            </div>
            <div
                className="happy-connections__cover"
                data-happy-desktop-ui="connection-shell-cover"
                ref={coverSet}
            />
            {menu ? (
                <ContextMenu
                    data-testid="connection-menu"
                    items={menu.items}
                    onClose={() => setMenu(undefined)}
                    onSelect={(actionId) => {
                        setMenu(undefined);
                        props.onItemMenuSelect?.(menu.id, actionId);
                    }}
                    width={216}
                    x={menu.x}
                    y={menu.y}
                />
            ) : null}
        </div>
    );
}
