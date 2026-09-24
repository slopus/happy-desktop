import { type CSSProperties } from "react";
import { KeyCap } from "./Badge";
import { Icon, type IconName } from "./Icon";

/**
 * A second act a row offers besides being chosen — removing the thing it
 * names, say. It is drawn as a small glyph at the row's trailing edge that
 * shows on hover or focus, so the list reads as a list until a hand is on it.
 */
export type MenuItemAction = {
    readonly icon: IconName;
    /** Names the act for assistive technology; the row's label is appended. */
    readonly label: string;
};
export type MenuItem =
    | {
          kind: "item";
          id: string;
          label: string;
          icon?: IconName;
          /**
           * An image to show instead of a house glyph, for a row that stands for
           * something outside our vocabulary — an installed application, for
           * instance, which brings its own artwork.
           */
          iconUrl?: string;
          danger?: boolean;
          disabled?: boolean;
          shortcut?: string;
          /** Quiet trailing text: when a thing was made, how many it holds. */
          detail?: string;
          action?: MenuItemAction;
      }
    | {
          kind: "separator";
      }
    | {
          kind: "label";
          label: string;
      };
export type MenuProps = {
    className?: string;
    id?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    /** A fixed heading above the scrollable menu rows. */
    label?: string;
    items: MenuItem[];
    onSelect?: (id: string) => void;
    /** A row's trailing act was taken; the row's own `onSelect` is not fired. */
    onAction?: (id: string) => void;
    width?: number;
};
/**
 * C-027 Menu — dropdown / context-menu popover on the raised surface. Renders
 * as a static card (no open/close animation): a 4px-padded list of 28px item
 * rows, optional mono section labels, and 1px separators. When any item carries
 * an icon the whole menu reserves a 16px leading gutter so every label aligns.
 * Shortcuts reuse the tuned KeyCap primitive; danger items use Happy's direct
 * destructive role. A row with an action keeps its own button whole and puts
 * the act beside it, so nothing nests one button in another.
 */
export function Menu(props: MenuProps) {
    const { className, items, label, onAction, onSelect, style, width, ...rest } = props;
    const hasIcons = items.some(
        (item) => item.kind === "item" && (item.icon !== undefined || item.iconUrl !== undefined),
    );
    return (
        <div
            {...rest}
            className={["happy-menu", className].filter(Boolean).join(" ")}
            data-has-icons={hasIcons ? "" : undefined}
            data-happy-desktop-ui="menu"
            role="menu"
            style={{
                ...style,
                ...(width === undefined ? {} : { width: `${width}px` }),
            }}
        >
            {label ? (
                <div className="happy-menu__header" data-happy-desktop-ui="menu-header">
                    {label}
                </div>
            ) : null}
            <div className="happy-menu__list" data-happy-desktop-ui="menu-list">
                <div className="happy-menu__rows" data-happy-desktop-ui="menu-rows">
                    {items.map((item, index) => {
                        if (item.kind === "separator") {
                            return (
                                <div
                                    aria-hidden="true"
                                    className="happy-menu__separator"
                                    data-happy-desktop-ui="menu-separator"
                                    key={`separator-${index}`}
                                    role="separator"
                                />
                            );
                        }
                        if (item.kind === "label") {
                            return (
                                <div
                                    className="happy-menu__label"
                                    data-happy-desktop-ui="menu-label"
                                    key={`label-${item.label}-${index}`}
                                >
                                    {item.label}
                                </div>
                            );
                        }
                        const row = (
                            <button
                                aria-disabled={item.disabled ? "true" : undefined}
                                className="happy-menu__item"
                                data-danger={item.danger ? "" : undefined}
                                data-has-action={item.action ? "" : undefined}
                                data-item-id={item.id}
                                data-happy-desktop-ui="menu-item"
                                disabled={item.disabled}
                                key={item.id}
                                onClick={() => {
                                    if (!item.disabled) onSelect?.(item.id);
                                }}
                                role="menuitem"
                                type="button"
                            >
                                {hasIcons ? (
                                    <span
                                        className="happy-menu__item-icon"
                                        data-happy-desktop-ui="menu-item-icon"
                                    >
                                        {item.iconUrl ? (
                                            <img
                                                alt=""
                                                className="happy-menu__item-image"
                                                data-happy-desktop-ui="menu-item-image"
                                                src={item.iconUrl}
                                            />
                                        ) : item.icon ? (
                                            <Icon name={item.icon} size={16} />
                                        ) : null}
                                    </span>
                                ) : null}
                                <span
                                    className="happy-menu__item-label"
                                    data-happy-desktop-ui="menu-item-label"
                                >
                                    {item.label}
                                </span>
                                {item.detail ? (
                                    <span
                                        className="happy-menu__item-detail"
                                        data-happy-desktop-ui="menu-item-detail"
                                    >
                                        {item.detail}
                                    </span>
                                ) : null}
                                {item.shortcut ? (
                                    <KeyCap
                                        className="happy-menu__item-shortcut"
                                        keys={item.shortcut}
                                    />
                                ) : null}
                            </button>
                        );
                        if (!item.action) return row;
                        /* The act sits beside the row, not inside it: a button
                           cannot hold another, and the row's own hit area stays
                           whole. It is positioned over the row's reserved
                           trailing edge and shown only when a hand or focus is
                           on the row. */
                        return (
                            <div
                                className="happy-menu__row"
                                data-happy-desktop-ui="menu-row"
                                key={item.id}
                            >
                                {row}
                                <button
                                    aria-label={`${item.action.label}: ${item.label}`}
                                    className="happy-menu__item-action"
                                    data-happy-desktop-ui="menu-item-action"
                                    data-item-id={item.id}
                                    disabled={item.disabled}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        if (!item.disabled) onAction?.(item.id);
                                    }}
                                    title={item.action.label}
                                    type="button"
                                >
                                    <Icon name={item.action.icon} size={14} />
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
