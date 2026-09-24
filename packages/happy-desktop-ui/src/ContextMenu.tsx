import { useCallback, useId } from "react";
import { Menu, type MenuItem } from "./Menu";
import { WindowOverlay } from "./WindowOverlay";

export interface ContextMenuProps {
    /** Where the pointer was when the menu was asked for, in viewport pixels. */
    readonly x: number;
    readonly y: number;
    readonly items: readonly MenuItem[];
    /** A row was chosen. The owner closes the menu; the choice does not close it by itself. */
    readonly onSelect: (id: string) => void;
    /** The menu was dismissed without a choice: a click elsewhere, Escape, or a resize. */
    readonly onClose: () => void;
    readonly width?: number;
    readonly "data-testid"?: string;
}

/** How close to the window's edge a menu may sit before it is pushed back in. */
const VIEWPORT_MARGIN = 8;

/**
 * A Menu opened at the pointer rather than off a control. It is controlled:
 * the owner decides that it is open and where, and takes it down on a choice
 * or a dismissal, so the same menu serves a link in a message and a row in a
 * list without either owning a copy of the open/close logic.
 *
 * It hangs off the window's overlay lane, so a menu asked for from inside a
 * paragraph or a layered pane resolves its z-index against the window and is
 * not sealed under the chrome beside it. The popover measures itself on
 * commit and is pushed back inside the viewport when the pointer was too near
 * an edge for the whole card to fit; the first row takes focus at the same
 * moment, so the arrow keys work without a second gesture.
 */
export function ContextMenu(props: ContextMenuProps) {
    const menuId = useId();
    const { x, y } = props;
    // The popover's commit is the exact lifetime boundary at which its box and
    // its first row exist, so clamping and focus do not depend on React's
    // microtask ordering.
    const popoverRef = useCallback(
        (node: HTMLDivElement | null): void => {
            if (!node) return;
            const bounds = node.getBoundingClientRect();
            const left = Math.max(
                VIEWPORT_MARGIN,
                Math.min(x, window.innerWidth - bounds.width - VIEWPORT_MARGIN),
            );
            const top = Math.max(
                VIEWPORT_MARGIN,
                Math.min(y, window.innerHeight - bounds.height - VIEWPORT_MARGIN),
            );
            node.style.left = `${String(left)}px`;
            node.style.top = `${String(top)}px`;
            node.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus();
        },
        [x, y],
    );
    const menuItems = (node: HTMLElement): HTMLElement[] => [
        ...node.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)'),
    ];
    return (
        <WindowOverlay>
            <button
                aria-label="Close menu"
                className="happy-context-menu__backdrop"
                data-happy-desktop-ui="context-menu-backdrop"
                onClick={(event) => {
                    event.stopPropagation();
                    props.onClose();
                }}
                onContextMenu={(event) => {
                    // A second right-click while the menu is up takes the menu
                    // down rather than asking the page for another.
                    event.preventDefault();
                    event.stopPropagation();
                    props.onClose();
                }}
                tabIndex={-1}
                type="button"
            />
            <div
                className="happy-context-menu"
                data-happy-desktop-ui="context-menu"
                data-testid={props["data-testid"]}
                onKeyDown={(event) => {
                    if (event.key === "Escape") {
                        event.preventDefault();
                        event.stopPropagation();
                        props.onClose();
                        return;
                    }
                    if (event.key === "Tab") {
                        props.onClose();
                        return;
                    }
                    const items = menuItems(event.currentTarget);
                    if (items.length === 0) return;
                    if (event.key === "Home" || event.key === "End") {
                        event.preventDefault();
                        items[event.key === "Home" ? 0 : items.length - 1]?.focus();
                        return;
                    }
                    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
                    event.preventDefault();
                    const active = document.activeElement as HTMLElement | null;
                    const at = active ? items.indexOf(active) : -1;
                    const step = event.key === "ArrowDown" ? 1 : -1;
                    const next = at < 0 ? (step > 0 ? 0 : items.length - 1) : at + step;
                    items[(next + items.length) % items.length]?.focus();
                }}
                ref={popoverRef}
                style={{ left: x, top: y }}
            >
                <Menu
                    id={menuId}
                    items={[...props.items]}
                    onSelect={props.onSelect}
                    width={props.width}
                />
            </div>
        </WindowOverlay>
    );
}
