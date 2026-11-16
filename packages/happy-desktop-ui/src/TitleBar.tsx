import { partitionComponentProps } from "./componentProps";
import { type CSSProperties, type HTMLAttributes } from "react";
import { KeyCap } from "./Badge";
import type { Dimension } from "./dimensions";
import { toCssDimension } from "./dimensions";
import { Icon } from "./Icon";
import { commandShortcut } from "./keyboardShortcut";
type SearchFieldSharedProps = {
    placeholder?: string;
    /**
     * The key that reaches this field, shown as a cap at its trailing edge.
     * `false` is for a field with no shortcut behind it — a filter that lives
     * inside the surface it filters — where a cap would promise a key that does
     * nothing.
     */
    shortcutHint?: string | false;
    value: string;
    width?: Dimension;
};
/** Editable well: reports typing through `onChange` and Enter through `onSubmit`. */
export type SearchFieldEditableProps = SearchFieldSharedProps & {
    onChange: (value: string) => void;
    onSubmit?: (value: string) => void;
    onOpen?: never;
};
/**
 * Opener well: read-only chrome that opens a palette. A click or Enter/Space
 * invokes `onOpen` instead of editing in place; it never reports typing.
 */
export type SearchFieldOpenerProps = SearchFieldSharedProps & {
    onOpen: () => void;
    onChange?: never;
    onSubmit?: never;
};
/**
 * The well is either editable (`onChange`, no `onOpen`) or an opener (`onOpen`,
 * no `onChange`). The two modes are mutually exclusive at the type level.
 */
export type SearchFieldProps = SearchFieldEditableProps | SearchFieldOpenerProps;
export type WindowDragRegionProps = Omit<HTMLAttributes<HTMLDivElement>, "children" | "style"> & {
    height?: Dimension;
    style?: CSSProperties;
};
/** Transparent window-drag overlay for full-window states without a TitleBar. */
export function WindowDragRegion(props: WindowDragRegionProps) {
    const [local, rest] = partitionComponentProps(props, ["className", "height", "style"]);
    return (
        <div
            {...rest}
            aria-hidden="true"
            className={["happy-window-drag-region", local.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="window-drag-region"
            style={{ height: toCssDimension(local.height ?? 56), ...local.style }}
        />
    );
}
/**
 * Global search well: 32px inset field with a leading search icon and a
 * trailing shortcut KeyCap. Fills its container unless `width` is given.
 */
export function SearchField(props: SearchFieldProps) {
    return (
        <div
            className="happy-search-field"
            data-happy-desktop-ui="search-field"
            style={props.width === undefined ? undefined : { width: toCssDimension(props.width) }}
        >
            <span
                aria-hidden="true"
                className="happy-search-field__icon"
                data-happy-desktop-ui="search-field-icon"
            >
                <Icon name="search" size={14} />
            </span>
            <input
                aria-label={props.placeholder ?? "Search"}
                className="happy-search-field__input"
                data-happy-desktop-ui="search-field-input"
                onClick={() => props.onOpen?.()}
                onInput={(event) => {
                    if (!props.onOpen) props.onChange?.(event.currentTarget.value);
                }}
                onKeyDown={(event) => {
                    if (props.onOpen) {
                        if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            props.onOpen();
                        }
                        return;
                    }
                    if (event.key === "Enter") props.onSubmit?.(event.currentTarget.value);
                }}
                placeholder={props.placeholder ?? "Search"}
                readOnly={props.onOpen !== undefined}
                type="text"
                value={props.value}
            />
            {props.shortcutHint === false ? null : (
                <KeyCap
                    className="happy-search-field__hint"
                    keys={props.shortcutHint ?? commandShortcut("k").caps}
                />
            )}
        </div>
    );
}
