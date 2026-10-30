import { partitionComponentProps } from "./componentProps";
import { useCallback, useId, useRef, type CSSProperties } from "react";
import { Icon, type IconName } from "./Icon";
import { ScrollbarTracks, useScrollbarController } from "./Scrollbar";
import { useFocusOnType } from "./useFocusOnType";
import { imeCompositionHandlers, imeKeyboardEvent } from "./imeComposition";
export type TextFieldType = "text" | "email" | "password" | "search";
export type TextFieldSize = "small" | "medium" | "large";
export type TextFieldProps = {
    "aria-label"?: string;
    /**
     * Takes the focus as the field mounts. It exists so a surface whose whole
     * purpose is this one field — a dialog asking for a folder — puts the caret
     * where a reader is about to type instead of on the control that closes it.
     * Declared rather than done through a handle, so the field exposes no element.
     */
    autoFocus?: boolean;
    className?: string;
    "data-testid"?: string;
    /**
     * Makes this field the surface's last resort for typing, as the chat's
     * composer is: a character typed while no control that wants it has focus
     * lands here. Turn it on for at most one field on screen.
     */
    focusOnType?: boolean;
    /** Puts the caret here whenever it changes; see `useFocusOnType`. */
    focusKey?: string;
    style?: CSSProperties;
    value?: string;
    onValueChange?: (value: string) => void;
    /** Fires when the field loses focus, for commit-on-blur controls. */
    onBlur?: () => void;
    /** Fires on Enter in a single-line field, for commit-on-submit controls. */
    onSubmit?: () => void;
    label?: string;
    placeholder?: string;
    type?: TextFieldType;
    multiline?: boolean;
    rows?: number;
    size?: TextFieldSize;
    hint?: string;
    error?: string;
    disabled?: boolean;
    required?: boolean;
    leadingIcon?: IconName;
    fullWidth?: boolean;
    id?: string;
    name?: string;
    autoComplete?: string;
};
/** Leading-icon glyph box by control size (matches Button's 14/16/18 ramp). */
const iconSizes: Record<TextFieldSize, 14 | 16 | 18> = {
    small: 14,
    medium: 16,
    large: 18,
};
/*
 * Multiline line box. The textarea is given an explicit height of
 * rows × MULTILINE_LINE_HEIGHT so its box is deterministic across engines
 * (native `rows` sizing drifts a pixel or two between Blink/Gecko/WebKit).
 */
const MULTILINE_LINE_HEIGHT = 20;
/**
 * C-018 TextField — labeled text input / textarea on the Happy inset well.
 * Three contract heights (28/36/44), optional label with required marker,
 * leading icon, hint, and error message. Props-only and fully controlled.
 */
export function TextField(props: TextFieldProps) {
    const scrollbarController = useScrollbarController("vertical");
    const textareaHost = useCallback(
        (element: HTMLDivElement | null) => scrollbarController.hostSet(element),
        [scrollbarController],
    );
    const controlEl = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
    const textareaAttach = useCallback(
        (element: HTMLTextAreaElement | null) => {
            controlEl.current = element;
            scrollbarController.viewportSet(element);
        },
        [scrollbarController],
    );
    const [local] = partitionComponentProps(props, [
        "aria-label",
        "autoComplete",
        "autoFocus",
        "className",
        "data-testid",
        "disabled",
        "error",
        "focusKey",
        "focusOnType",
        "fullWidth",
        "hint",
        "id",
        "label",
        "leadingIcon",
        "multiline",
        "name",
        "onBlur",
        "onSubmit",
        "onValueChange",
        "placeholder",
        "required",
        "rows",
        "size",
        "style",
        "type",
        "value",
    ]);
    const size = () => local.size ?? "medium";
    const invalid = () => local.error !== undefined && local.error !== "";
    const message = () => (invalid() ? local.error : local.hint);
    const rows = () => local.rows ?? 3;
    const generatedId = useId();
    const fallbackId = `happy-text-field-${generatedId}`;
    const fieldId = () => local.id ?? fallbackId;
    const messageId = () => `${fieldId()}-message`;
    const describedBy = () => (message() ? messageId() : undefined);
    useFocusOnType(
        controlEl,
        local.focusOnType === true && !local.disabled,
        local.disabled ? undefined : local.focusKey,
    );
    return (
        <div
            {...imeCompositionHandlers}
            className={["happy-text-field", local.className].filter(Boolean).join(" ")}
            data-disabled={local.disabled ? "" : undefined}
            data-full-width={local.fullWidth ? "" : undefined}
            data-invalid={invalid() ? "" : undefined}
            data-multiline={local.multiline ? "" : undefined}
            data-happy-desktop-ui="text-field"
            data-size={size()}
            data-testid={local["data-testid"]}
            style={local.style}
        >
            {local.label ? (
                <label
                    className="happy-text-field__label"
                    data-happy-desktop-ui="text-field-label"
                    htmlFor={fieldId()}
                >
                    {local.label}
                    {local.required ? (
                        <span
                            aria-hidden="true"
                            className="happy-text-field__required"
                            data-happy-desktop-ui="text-field-required"
                        >
                            *
                        </span>
                    ) : null}
                </label>
            ) : null}

            <div
                className="happy-text-field__control"
                data-invalid={invalid() ? "" : undefined}
                data-multiline={local.multiline ? "" : undefined}
                data-happy-desktop-ui="text-field-control"
                data-size={size()}
            >
                {local.leadingIcon
                    ? ((name) => (
                          <span
                              aria-hidden="true"
                              className="happy-text-field__icon"
                              data-happy-desktop-ui="text-field-icon"
                          >
                              <Icon name={name} size={iconSizes[size()]} />
                          </span>
                      ))(local.leadingIcon)
                    : null}

                {local.multiline ? (
                    <div
                        className="happy-text-field__textarea-scroll"
                        data-scrollbar-axes="vertical"
                        data-scrollbar-host=""
                        data-scrollbar-placement="stable-gutter"
                        ref={textareaHost}
                    >
                        <textarea
                            aria-label={local["aria-label"]}
                            aria-describedby={describedBy()}
                            aria-invalid={invalid() ? "true" : undefined}
                            className="happy-text-field__input"
                            data-happy-desktop-ui="text-field-input"
                            disabled={local.disabled}
                            id={fieldId()}
                            name={local.name}
                            onBlur={() => local.onBlur?.()}
                            onInput={(event) => local.onValueChange?.(event.currentTarget.value)}
                            placeholder={local.placeholder}
                            ref={textareaAttach}
                            required={local.required}
                            rows={rows()}
                            style={{ height: `${rows() * MULTILINE_LINE_HEIGHT}px` }}
                            value={local.value ?? ""}
                        />
                        <ScrollbarTracks controller={scrollbarController} />
                    </div>
                ) : (
                    <input
                        aria-label={local["aria-label"]}
                        aria-describedby={describedBy()}
                        aria-invalid={invalid() ? "true" : undefined}
                        autoComplete={local.autoComplete}
                        autoFocus={local.autoFocus}
                        className="happy-text-field__input"
                        data-happy-desktop-ui="text-field-input"
                        disabled={local.disabled}
                        id={fieldId()}
                        name={local.name}
                        onBlur={() => local.onBlur?.()}
                        onInput={(event) => local.onValueChange?.(event.currentTarget.value)}
                        onKeyDown={(event) => {
                            if (imeKeyboardEvent(event.nativeEvent)) return;
                            if (event.key !== "Enter" || local.onSubmit === undefined) return;
                            // The Enter is the submit's. Left to the browser, it
                            // would also reach whatever the submit puts focus in —
                            // a new document's text, opened to be written in.
                            event.preventDefault();
                            local.onSubmit();
                        }}
                        placeholder={local.placeholder}
                        ref={(element) => {
                            controlEl.current = element;
                        }}
                        required={local.required}
                        type={local.type ?? "text"}
                        value={local.value ?? ""}
                    />
                )}
            </div>

            {message() ? (
                <div
                    className="happy-text-field__message"
                    data-happy-desktop-ui={invalid() ? "text-field-error" : "text-field-hint"}
                    data-tone={invalid() ? "error" : "hint"}
                    id={messageId()}
                >
                    {message()}
                </div>
            ) : null}
        </div>
    );
}
