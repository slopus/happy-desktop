import { partitionComponentProps } from "./componentProps";
import { type ButtonHTMLAttributes, type CSSProperties } from "react";
import { KeyCap } from "./Badge";
import type { Dimension } from "./dimensions";
import { toCssDimension } from "./dimensions";
import { Icon, type IconName } from "./Icon";
import type { KeyboardShortcut } from "./keyboardShortcut";
import { Spinner } from "./Spinner";
export type ButtonSize = "small" | "medium" | "large";
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "style"> & {
    fullWidth?: boolean;
    icon?: IconName;
    iconOnly?: boolean;
    /**
     * The button's own work is running: a spinner takes the icon's place and the
     * button stops accepting presses, while the label stays put. The work a
     * button started belongs on that button — replacing the surface around it
     * would throw away whatever the person was reading when they pressed it.
     */
    loading?: boolean;
    /**
     * Work the button leads to is running somewhere else — the chat it opens,
     * say: a spinner takes the icon's place, but unlike `loading` the button
     * still presses, because the work is not this button's own.
     */
    working?: boolean;
    /**
     * Command-key hint. It floats below the unchanged button after the ordinary
     * hover delay, or immediately when an ancestor carries
     * `data-shortcut-hints` after AppShell's deliberate Command hold.
     */
    shortcut?: KeyboardShortcut;
    size?: ButtonSize;
    style?: CSSProperties;
    variant?: ButtonVariant;
    width?: Dimension;
};
const iconSizes: Record<ButtonSize, 14 | 16 | 18> = {
    small: 14,
    medium: 16,
    large: 18,
};
export function Button(props: ButtonProps) {
    const [local, rest] = partitionComponentProps(props, [
        "children",
        "className",
        "fullWidth",
        "icon",
        "iconOnly",
        "loading",
        "shortcut",
        "size",
        "style",
        "type",
        "variant",
        "width",
        "working",
    ]);
    const size = () => local.size ?? "medium";
    const variant = () => local.variant ?? "primary";
    return (
        <button
            {...rest}
            aria-keyshortcuts={local.shortcut?.aria ?? rest["aria-keyshortcuts"]}
            className={["happy-button", local.className].filter(Boolean).join(" ")}
            data-icon-only={local.iconOnly ? "" : undefined}
            data-happy-desktop-ui="button"
            data-loading={local.loading ? "" : undefined}
            data-working={local.working && !local.loading ? "" : undefined}
            data-shortcut-hint={local.shortcut ? "" : undefined}
            disabled={rest.disabled === true || local.loading === true}
            data-size={size()}
            data-variant={variant()}
            style={{
                ...local.style,
                ...(local.fullWidth
                    ? { width: "100%" }
                    : local.width === undefined
                      ? {}
                      : { width: toCssDimension(local.width) }),
            }}
            type={local.type ?? "button"}
        >
            <span className="happy-button__content" data-happy-desktop-ui="button-content">
                {local.loading || local.working ? (
                    <span className="happy-button__icon" data-happy-desktop-ui="button-icon">
                        <Spinner
                            size={iconSizes[size()]}
                            tone={
                                variant() === "secondary" || variant() === "ghost"
                                    ? "default"
                                    : "inverse"
                            }
                        />
                    </span>
                ) : local.icon ? (
                    ((name) => (
                        <span className="happy-button__icon" data-happy-desktop-ui="button-icon">
                            <Icon name={name} size={iconSizes[size()]} />
                        </span>
                    ))(local.icon)
                ) : local.iconOnly ? (
                    <span className="happy-button__icon" data-happy-desktop-ui="button-icon">
                        {local.children}
                    </span>
                ) : null}
                {!local.iconOnly ? (
                    <span className="happy-button__label" data-happy-desktop-ui="button-label">
                        {local.children}
                    </span>
                ) : null}
            </span>
            {local.shortcut ? (
                <KeyCap
                    className="happy-button__shortcut-hint happy-shortcut-hint--floating"
                    decorative
                    keys={local.shortcut.caps}
                />
            ) : null}
        </button>
    );
}
