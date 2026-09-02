import { type CSSProperties } from "react";
import { KeyCap } from "./Badge";
import { Icon, type IconName } from "./Icon";
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
          /** Why a visible command cannot run, announced and shown as its tooltip. */
          disabledReason?: string;
          shortcut?: string;
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
    width?: number;
};
/**
 * C-027 Menu — dropdown / context-menu popover on the raised surface. Renders
 * as a static card (no open/close animation): a 4px-padded list of 28px item
 * rows, optional mono section labels, and 1px separators. When any item carries
 * an icon the whole menu reserves a 16px leading gutter so every label aligns.
 * Shortcuts reuse the tuned KeyCap primitive; danger items use Happy's direct
 * destructive role.
 */
export function Menu(props: MenuProps) {
    const { className, items, label, onSelect, style, width, ...rest } = props;
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
                        return (
                            <button
                                aria-label={
                                    item.disabled && item.disabledReason
                                        ? `${item.label}. ${item.disabledReason}`
                                        : undefined
                                }
                                aria-disabled={item.disabled ? "true" : undefined}
                                className="happy-menu__item"
                                data-danger={item.danger ? "" : undefined}
                                data-item-id={item.id}
                                data-happy-desktop-ui="menu-item"
                                disabled={item.disabled}
                                key={item.id}
                                onClick={() => {
                                    if (!item.disabled) onSelect?.(item.id);
                                }}
                                role="menuitem"
                                title={item.disabled ? item.disabledReason : undefined}
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
                                {item.shortcut ? (
                                    <KeyCap
                                        className="happy-menu__item-shortcut"
                                        keys={item.shortcut}
                                    />
                                ) : null}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
