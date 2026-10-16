import { Fragment, useLayoutEffect, useRef, type ReactNode } from "react";
import { ChatPaneFocusContext } from "./ChatPaneFocus";
import { ScrollArea } from "./Scrollbar";
import { WindowShortcuts } from "./WindowShortcuts";
import { windowShortcutBlocked, type CommandShortcut } from "./keyboardShortcut";

export interface ChatPanesProps {
    readonly panes: readonly {
        readonly id: string;
        readonly label: string;
        readonly weight: number;
        readonly content: ReactNode;
    }[];
    readonly activeId?: string;
    readonly onFocus: (id: string) => void;
    readonly onResize: (id: string, nextId: string, weight: number, nextWeight: number) => void;
    readonly previousShortcut?: CommandShortcut;
    readonly nextShortcut?: CommandShortcut;
}

/** Independent desktop columns. Stable pane keys preserve drafts, selection and scroll while resizing. */
export function ChatPanes(props: ChatPanesProps) {
    const elements = useRef(new Map<string, HTMLElement>());
    const focusedId = useRef(props.activeId);
    // eslint-disable-next-line happy-react/no-layout-effect -- programmatic pane navigation must hand DOM focus to its existing composer after the active pane commits
    useLayoutEffect(() => {
        if (focusedId.current === props.activeId) return;
        focusedId.current = props.activeId;
        const pane = props.activeId ? elements.current.get(props.activeId) : undefined;
        if (!pane || pane.contains(document.activeElement) || windowShortcutBlocked()) return;
        pane.scrollIntoView({ block: "nearest", inline: "nearest" });
        const composer = pane.querySelector<HTMLTextAreaElement>(
            '[data-happy-desktop-ui="composer"] textarea:not([disabled])',
        );
        (composer ?? pane).focus({ preventScroll: true });
    }, [props.activeId]);
    const drag = useRef<
        | { x: number; width: number; nextWidth: number; weight: number; nextWeight: number }
        | undefined
    >(undefined);
    const step = (direction: 1 | -1) => {
        const index = props.panes.findIndex((pane) => pane.id === props.activeId);
        const next = props.panes[(index + direction + props.panes.length) % props.panes.length];
        if (next) props.onFocus(next.id);
    };
    const resize = (
        index: number,
        delta: number,
        width: number,
        nextWidth: number,
        weight: number,
        nextWeight: number,
    ) => {
        const pane = props.panes[index];
        const next = props.panes[index + 1];
        if (!pane || !next) return;
        const total = width + nextWidth;
        const left = Math.max(320, Math.min(total - 320, width + delta));
        const sum = weight + nextWeight;
        props.onResize(pane.id, next.id, (sum * left) / total, (sum * (total - left)) / total);
    };
    return (
        <>
            <ScrollArea
                axes="horizontal"
                className="happy-chat-panes"
                viewportClassName="happy-chat-panes__viewport"
            >
                <div className="happy-chat-panes__row" data-happy-desktop-ui="chat-panes">
                    {props.panes.map((pane, index) => {
                        const next = props.panes[index + 1];
                        return (
                            <Fragment key={pane.id}>
                                <section
                                    aria-label={pane.label}
                                    className="happy-chat-panes__pane"
                                    data-active={props.activeId === pane.id ? "true" : "false"}
                                    data-chat-pane={pane.id}
                                    data-happy-desktop-ui="chat-pane"
                                    onFocusCapture={() => props.onFocus(pane.id)}
                                    onPointerDownCapture={() => props.onFocus(pane.id)}
                                    ref={(element) => {
                                        if (element) elements.current.set(pane.id, element);
                                        else elements.current.delete(pane.id);
                                    }}
                                    style={{ flexGrow: pane.weight }}
                                    tabIndex={-1}
                                >
                                    <ChatPaneFocusContext value={props.activeId === pane.id}>
                                        {pane.content}
                                    </ChatPaneFocusContext>
                                </section>
                                {next ? (
                                    <div
                                        aria-label={`Resize ${pane.label}`}
                                        aria-orientation="vertical"
                                        aria-valuemin={0}
                                        aria-valuemax={100}
                                        aria-valuenow={Math.round(
                                            (100 * pane.weight) / (pane.weight + next.weight),
                                        )}
                                        className="happy-chat-panes__resize"
                                        data-happy-desktop-ui="chat-pane-resize"
                                        onDoubleClick={() =>
                                            props.onResize(
                                                pane.id,
                                                next.id,
                                                (pane.weight + next.weight) / 2,
                                                (pane.weight + next.weight) / 2,
                                            )
                                        }
                                        onKeyDown={(event) => {
                                            if (
                                                event.key !== "ArrowLeft" &&
                                                event.key !== "ArrowRight"
                                            )
                                                return;
                                            event.preventDefault();
                                            const left = elements.current
                                                .get(pane.id)
                                                ?.getBoundingClientRect().width;
                                            const right = elements.current
                                                .get(next.id)
                                                ?.getBoundingClientRect().width;
                                            if (left && right)
                                                resize(
                                                    index,
                                                    event.key === "ArrowLeft" ? -32 : 32,
                                                    left,
                                                    right,
                                                    pane.weight,
                                                    next.weight,
                                                );
                                        }}
                                        onPointerDown={(event) => {
                                            if (event.button !== 0) return;
                                            const left = elements.current
                                                .get(pane.id)
                                                ?.getBoundingClientRect().width;
                                            const right = elements.current
                                                .get(next.id)
                                                ?.getBoundingClientRect().width;
                                            if (!left || !right) return;
                                            event.preventDefault();
                                            event.currentTarget.setPointerCapture(event.pointerId);
                                            drag.current = {
                                                x: event.clientX,
                                                width: left,
                                                nextWidth: right,
                                                weight: pane.weight,
                                                nextWeight: next.weight,
                                            };
                                        }}
                                        onPointerMove={(event) => {
                                            const current = drag.current;
                                            if (
                                                current &&
                                                event.currentTarget.hasPointerCapture(
                                                    event.pointerId,
                                                )
                                            )
                                                resize(
                                                    index,
                                                    event.clientX - current.x,
                                                    current.width,
                                                    current.nextWidth,
                                                    current.weight,
                                                    current.nextWeight,
                                                );
                                        }}
                                        onLostPointerCapture={() => {
                                            drag.current = undefined;
                                        }}
                                        onPointerUp={(event) => {
                                            if (
                                                event.currentTarget.hasPointerCapture(
                                                    event.pointerId,
                                                )
                                            )
                                                event.currentTarget.releasePointerCapture(
                                                    event.pointerId,
                                                );
                                            drag.current = undefined;
                                        }}
                                        role="separator"
                                        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable resize separator
                                        tabIndex={0}
                                    />
                                ) : null}
                            </Fragment>
                        );
                    })}
                </div>
            </ScrollArea>
            <WindowShortcuts
                actions={[
                    ...(props.previousShortcut
                        ? [{ shortcut: props.previousShortcut, run: () => step(-1) }]
                        : []),
                    ...(props.nextShortcut
                        ? [{ shortcut: props.nextShortcut, run: () => step(1) }]
                        : []),
                ]}
            />
        </>
    );
}
