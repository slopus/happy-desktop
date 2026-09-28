import { useCallback, useId, useRef, useState } from "react";
import { Button, type ButtonSize, type ButtonVariant } from "./Button";
import { Icon, type IconName, type IconProps } from "./Icon";
import { Menu, type MenuItem } from "./Menu";
import { WindowOverlay } from "./WindowOverlay";

export interface MenuButtonProps {
    readonly label: string;
    readonly icon: IconName;
    /** Shown beside the glyph, for a trigger that names itself on the surface. */
    readonly text?: string;
    /**
     * Optical size of the trigger glyph, for a name backed by the heavier of the
     * two families. An Octicons glyph is drawn across the full 16 box where an
     * Ionicons outline uses a 14 × 12 ink box, so at the button's own 14px it
     * paints visibly larger than the Ionicons buttons beside it; 12px is where
     * the two inks match. Defaults to the button's size for its own family.
     */
    readonly iconSize?: IconProps["size"];
    /** Static rows, or a catalog materialized only when the menu opens. */
    readonly items: readonly MenuItem[] | (() => readonly MenuItem[]);
    readonly onSelect: (id: string) => void;
    readonly align?: "start" | "end";
    /** Which edge of the trigger the popover opens from. */
    readonly placement?: "above" | "below";
    /**
     * Hangs the popover off the window's overlay lane, fixed beside the
     * trigger, instead of inside the trigger's own box. For a trigger in a pane
     * that would clip or seal the card — a narrow sidebar, a layered panel —
     * where a popover drawn in place is cut off at the pane's edge or painted
     * under the chrome beside it. The card is pushed back inside the window
     * when the trigger sits too near an edge for it to fit.
     */
    readonly overlay?: boolean;
    readonly disabled?: boolean;
    /** Caps a long menu to a scrollable viewport while keeping its trigger fixed. */
    readonly menuMaxHeight?: number;
    /** Fixed heading above the menu's scrollable rows. */
    readonly menuLabel?: string;
    /** Keeps large catalogs in bounded DOM pages while leaving every row reachable. */
    readonly menuPageSize?: number;
    readonly menuWidth?: number;
    readonly size?: ButtonSize;
    readonly variant?: ButtonVariant;
    readonly className?: string;
    readonly "data-testid"?: string;
}

/** How close to the window's edge an overlaid popover may sit before it is pushed back in. */
const VIEWPORT_MARGIN = 8;

/** The trigger's box at the moment the menu opened, in viewport pixels. */
interface TriggerBounds {
    readonly top: number;
    readonly bottom: number;
    readonly left: number;
    readonly right: number;
}

const TRIGGER_UNMEASURED: TriggerBounds = { top: 0, bottom: 0, left: 0, right: 0 };

/**
 * A compact icon action with a corner-anchored Menu. It owns only whether its
 * popover is open; the caller owns every item and what choosing one means.
 */
export function MenuButton(props: MenuButtonProps) {
    const [open, setOpen] = useState(false);
    const [materializedItems, setMaterializedItems] = useState<readonly MenuItem[]>([]);
    const [menuPage, setMenuPage] = useState(0);
    const [trigger, setTrigger] = useState<TriggerBounds>(TRIGGER_UNMEASURED);
    const root = useRef<HTMLDivElement>(null);
    // The popover's node, wherever it was drawn: in the trigger's own box, or
    // in the overlay lane where a query from the root would not find it.
    const popover = useRef<HTMLDivElement>(null);
    const menuId = useId();
    const expanded = open && !props.disabled;
    const overlay = props.overlay === true;
    const above = props.placement === "above";
    const alignEnd = props.align === "end";
    const triggerFocus = (): void => {
        root.current?.querySelector<HTMLElement>(":scope > button")?.focus();
    };
    const menuItems = (): HTMLElement[] =>
        popover.current
            ? [...popover.current.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)')]
            : [];
    // The popover's commit is the exact lifetime boundary at which its box and
    // its first menu item exist, so placement and focus do not depend on
    // React's microtask ordering.
    const popoverRef = useCallback(
        (node: HTMLDivElement | null): void => {
            popover.current = node;
            if (!node) return;
            if (overlay) {
                // Anchored to the trigger's near corner, then pushed back
                // inside the window if the card would run past an edge.
                const bounds = node.getBoundingClientRect();
                const wanted = alignEnd ? trigger.right - bounds.width : trigger.left;
                const left = Math.max(
                    VIEWPORT_MARGIN,
                    Math.min(wanted, window.innerWidth - bounds.width - VIEWPORT_MARGIN),
                );
                node.style.left = `${String(left)}px`;
                if (above) {
                    const bottom = Math.max(VIEWPORT_MARGIN, window.innerHeight - trigger.top);
                    node.style.bottom = `${String(bottom)}px`;
                } else {
                    const top = Math.max(
                        VIEWPORT_MARGIN,
                        Math.min(
                            trigger.bottom,
                            window.innerHeight - bounds.height - VIEWPORT_MARGIN,
                        ),
                    );
                    node.style.top = `${String(top)}px`;
                }
            }
            node.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus();
        },
        [above, alignEnd, overlay, trigger],
    );
    const close = (returnFocus: boolean): void => {
        setOpen(false);
        if (returnFocus) triggerFocus();
    };
    const allItems = typeof props.items === "function" ? materializedItems : props.items;
    const pageSize =
        props.menuPageSize !== undefined && props.menuPageSize > 0
            ? Math.floor(props.menuPageSize)
            : undefined;
    const pageCount =
        pageSize === undefined ? 1 : Math.max(1, Math.ceil(allItems.length / pageSize));
    const currentPage = Math.min(menuPage, pageCount - 1);
    const pageName = props.menuLabel?.toLowerCase() ?? "items";
    const pageItems =
        pageSize === undefined
            ? allItems
            : allItems.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
    const previousPageId = `${menuId}-previous-page`;
    const nextPageId = `${menuId}-next-page`;
    const visibleItems: readonly MenuItem[] = [
        ...(currentPage > 0
            ? [
                  {
                      id: previousPageId,
                      kind: "item" as const,
                      label: `Previous ${pageName} (${String(currentPage)} of ${String(pageCount)})`,
                  },
              ]
            : []),
        ...pageItems,
        ...(currentPage + 1 < pageCount
            ? [
                  {
                      id: nextPageId,
                      kind: "item" as const,
                      label: `More ${pageName} (${String(currentPage + 2)} of ${String(pageCount)})`,
                  },
              ]
            : []),
    ];
    const menuMaxHeight =
        props.menuMaxHeight === undefined
            ? undefined
            : above
              ? `max(0px, min(${String(props.menuMaxHeight)}px, calc(${String(trigger.top)}px - 8px)))`
              : `max(0px, min(${String(props.menuMaxHeight)}px, calc(100vh - ${String(trigger.bottom)}px - 8px)))`;
    const popoverContent = (
        <>
            <button
                aria-label="Close menu"
                className="happy-menu-button__backdrop"
                data-happy-desktop-ui="menu-button-backdrop"
                onClick={() => close(true)}
                tabIndex={-1}
                type="button"
            />
            <div
                className="happy-menu-button__popover"
                data-happy-desktop-ui="menu-button-popover"
                data-overlay={overlay ? "" : undefined}
                data-placement={above ? "above" : undefined}
                ref={popoverRef}
            >
                <Menu
                    id={menuId}
                    items={[...visibleItems]}
                    label={props.menuLabel}
                    onSelect={(id) => {
                        if (id === previousPageId) {
                            setMenuPage((page) => Math.max(0, page - 1));
                            requestAnimationFrame(() => menuItems()[0]?.focus());
                            return;
                        }
                        if (id === nextPageId) {
                            setMenuPage((page) => Math.min(pageCount - 1, page + 1));
                            requestAnimationFrame(() => menuItems()[0]?.focus());
                            return;
                        }
                        close(true);
                        props.onSelect(id);
                    }}
                    {...(menuMaxHeight === undefined
                        ? {}
                        : { style: { maxHeight: menuMaxHeight } })}
                    width={props.menuWidth}
                />
            </div>
        </>
    );
    return (
        <div
            className={["happy-menu-button", props.className].filter(Boolean).join(" ")}
            data-align={alignEnd ? "end" : undefined}
            data-happy-desktop-ui="menu-button"
            data-open={expanded ? "" : undefined}
            data-testid={props["data-testid"]}
            ref={root}
            // Key events from an overlaid popover still arrive here: a portal
            // is elsewhere in the document but in place in the React tree.
            onKeyDown={(event) => {
                if (!expanded) return;
                if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    close(true);
                    return;
                }
                if (event.key === "Tab") {
                    close(false);
                    return;
                }
                const items = menuItems();
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
        >
            <Button
                aria-controls={expanded ? menuId : undefined}
                aria-expanded={expanded}
                aria-haspopup="menu"
                aria-label={props.label}
                disabled={props.disabled}
                {...(props.iconSize === undefined ? { icon: props.icon } : {})}
                {...(props.text === undefined ? { iconOnly: true } : {})}
                onClick={(event) => {
                    if (expanded) close(false);
                    else {
                        setMaterializedItems(
                            typeof props.items === "function" ? props.items() : props.items,
                        );
                        setMenuPage(0);
                        const bounds = event.currentTarget.getBoundingClientRect();
                        setTrigger({
                            top: bounds.top,
                            bottom: bounds.bottom,
                            left: bounds.left,
                            right: bounds.right,
                        });
                        setOpen(true);
                    }
                }}
                size={props.size ?? "small"}
                variant={props.variant ?? "ghost"}
            >
                {props.iconSize === undefined ? null : (
                    <Icon name={props.icon} size={props.iconSize} />
                )}
                {props.text}
            </Button>
            {expanded ? (
                overlay ? (
                    <WindowOverlay>{popoverContent}</WindowOverlay>
                ) : (
                    popoverContent
                )
            ) : null}
        </div>
    );
}
