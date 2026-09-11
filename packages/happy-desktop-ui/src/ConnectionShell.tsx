import { Fragment, type ReactNode } from "react";
import { AvatarBrutalist } from "./AvatarBrutalist";
import { Icon } from "./Icon";
import { ScrollArea } from "./Scrollbar";
import { thumbhashDataUrl } from "./thumbhashDataUrl";
import { useConnectionReorder } from "./useConnectionReorder";

export interface ConnectionShellItem {
    readonly id: string;
    readonly label: string;
    readonly local: boolean;
    readonly status: "connecting" | "connected" | "disconnected" | "error";
    /** Unread conversations on this connection, independent of selection and connectivity. */
    readonly unread?: boolean;
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
    return <AvatarBrutalist id={item.id} size={36} style={{ borderRadius: "10px" }} />;
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
    readonly windowControls?: boolean;
    /**
     * The window's left side is folded away. The rail stands beside the
     * sidebar and goes with it, so the active connection takes the whole
     * width and its own reveal control brings both back.
     */
    readonly collapsed?: boolean;
    readonly error?: string;
}) {
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
                >
                    <ScrollArea placement="overlay">
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
                                        aria-label={`${item.label}, ${item.status}${item.unread ? ", unread activity" : ""}`}
                                        aria-current={
                                            props.selectedId === item.id ? "page" : undefined
                                        }
                                        title={`${item.label} · ${item.status}${!item.local && reorderable ? " · Drag or use Alt+↑/↓ to reorder" : ""}`}
                                        aria-description={
                                            !item.local && reorderable
                                                ? "Drag or use Alt+Arrow Up or Alt+Arrow Down to reorder."
                                                : undefined
                                        }
                                        onClick={() => {
                                            if (clickAllowed()) props.onSelect(item.id);
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
                                    >
                                        <ConnectionShellTile item={item} />
                                        {item.unread ? (
                                            <span
                                                aria-hidden="true"
                                                className="happy-connections__unread"
                                                data-happy-desktop-ui="connection-unread"
                                            />
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
                {props.children}
            </div>
        </div>
    );
}
