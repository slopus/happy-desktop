import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Menu, type MenuItem } from "./Menu";

export interface ContextMenuPlacement {
    /** Viewport coordinates of the gesture that opened the menu. */
    readonly x: number;
    readonly y: number;
}

export type ContextMenuDismissReason = "escape" | "outside" | "resize" | "select";

/** Returning feedback keeps the menu open and briefly confirms that item. */
export interface ContextMenuSelectionFeedback {
    readonly feedback: string;
}

export type ContextMenuSelectionResult = ContextMenuSelectionFeedback | void;

export interface ContextMenuProps {
    readonly items: readonly MenuItem[];
    readonly placement: ContextMenuPlacement;
    readonly onSelect: (
        actionId: string,
    ) => ContextMenuSelectionResult | Promise<ContextMenuSelectionResult>;
    readonly onDismiss: (reason: ContextMenuDismissReason) => void;
    readonly width?: number;
}

/** Kept clear of the viewport edge so a clamped menu never sits flush. */
const EDGE_INSET = 8;
const FEEDBACK_MS = 1_600;

/** Every enabled command in visual order. */
function menuCommands(root: HTMLElement | null): HTMLButtonElement[] {
    return [
        ...(root?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []),
    ];
}

/**
 * ContextMenu — one Menu positioned at a pointer or keyboard-invoked row,
 * clamped into the viewport, focused on arrival, and dismissed by selection,
 * an outside press, Escape, or a resize.
 *
 * A selection may return brief feedback. That keeps the menu open, turns the
 * chosen row into a check, and leaves a failed promise unchanged and retryable.
 */
export function ContextMenu(props: ContextMenuProps) {
    const root = useRef<HTMLDivElement>(null);
    const feedbackTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const selection = useRef(0);
    const focused = useRef(false);
    const dismiss = useRef(props.onDismiss);
    const [placement, placementSet] = useState(props.placement);
    const [feedback, feedbackSet] = useState<
        { readonly id: string; readonly label: string } | undefined
    >(undefined);
    // eslint-disable-next-line happy-react/no-layout-effect -- global listeners need the newest owner callback without restarting the menu lifecycle or its feedback timer
    useLayoutEffect(() => {
        dismiss.current = props.onDismiss;
    });
    // eslint-disable-next-line happy-react/no-layout-effect -- the popover must measure its drawn height before clamping to the viewport, then owns global dismissal listeners for exactly its mounted lifetime
    useLayoutEffect(() => {
        const bounds = root.current?.getBoundingClientRect();
        if (bounds) {
            const x = Math.max(
                EDGE_INSET,
                Math.min(placement.x, window.innerWidth - bounds.width - EDGE_INSET),
            );
            const y = Math.max(
                EDGE_INSET,
                Math.min(placement.y, window.innerHeight - bounds.height - EDGE_INSET),
            );
            if (x !== placement.x || y !== placement.y) {
                placementSet({ x, y });
                return;
            }
        }
        if (!focused.current) {
            focused.current = true;
            menuCommands(root.current)[0]?.focus();
        }
        const close = (event: Event) => {
            if (!root.current?.contains(event.target as Node)) dismiss.current("outside");
        };
        const closeOnEscape = (event: globalThis.KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            dismiss.current("escape");
        };
        const dismissOnResize = () => dismiss.current("resize");
        document.addEventListener("pointerdown", close);
        document.addEventListener("keydown", closeOnEscape);
        window.addEventListener("resize", dismissOnResize);
        return () => {
            document.removeEventListener("pointerdown", close);
            document.removeEventListener("keydown", closeOnEscape);
            window.removeEventListener("resize", dismissOnResize);
            if (feedbackTimer.current !== undefined) clearTimeout(feedbackTimer.current);
        };
    }, [placement]);

    const keyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
        if (
            event.key !== "ArrowDown" &&
            event.key !== "ArrowUp" &&
            event.key !== "Home" &&
            event.key !== "End"
        )
            return;
        const commands = menuCommands(root.current);
        if (commands.length === 0) return;
        event.preventDefault();
        const current = commands.indexOf(document.activeElement as HTMLButtonElement);
        const index =
            event.key === "Home"
                ? 0
                : event.key === "End"
                  ? commands.length - 1
                  : event.key === "ArrowDown"
                    ? current < 0
                        ? 0
                        : (current + 1) % commands.length
                    : current < 0
                      ? commands.length - 1
                      : (current - 1 + commands.length) % commands.length;
        commands[index]?.focus();
    };

    const items = props.items.map((item): MenuItem => {
        if (item.kind !== "item" || item.id !== feedback?.id) return item;
        const { iconUrl: _iconUrl, ...rest } = item;
        return { ...rest, icon: "check", label: feedback.label };
    });
    return (
        <div
            className="happy-context-menu"
            data-feedback={feedback ? "" : undefined}
            data-happy-desktop-ui="context-menu"
            onContextMenu={(event) => event.preventDefault()}
            onKeyDown={keyDown}
            ref={root}
            style={{ left: placement.x, top: placement.y }}
        >
            <Menu
                items={items}
                onSelect={(actionId) => {
                    const current = selection.current + 1;
                    selection.current = current;
                    let result: ContextMenuSelectionResult | Promise<ContextMenuSelectionResult>;
                    try {
                        result = props.onSelect(actionId);
                    } catch {
                        return;
                    }
                    void Promise.resolve(result).then(
                        (result) => {
                            if (!root.current || selection.current !== current) return;
                            if (result === undefined) {
                                dismiss.current("select");
                                return;
                            }
                            feedbackSet({ id: actionId, label: result.feedback });
                            if (feedbackTimer.current !== undefined)
                                clearTimeout(feedbackTimer.current);
                            feedbackTimer.current = setTimeout(() => {
                                feedbackTimer.current = undefined;
                                feedbackSet(undefined);
                            }, FEEDBACK_MS);
                        },
                        () => {
                            // Clipboard and native-host failures leave the item retryable.
                        },
                    );
                }}
                width={props.width ?? 224}
            />
            <span aria-live="polite" className="happy-visually-hidden" role="status">
                {feedback?.label ?? ""}
            </span>
        </div>
    );
}
