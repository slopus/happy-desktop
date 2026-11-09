import { useState } from "react";
import { Button } from "../Button";
import { TextField } from "../TextField";
import { UiStatusLine, uiControlUsable, type UiControlState } from "./UiStatusLine";

/** The longest answer the server takes. */
export const UI_TEXT_FIELD_MAX = 2_000;

export type UiTextFieldProps = {
    readonly label: string;
    readonly placeholder?: string;
    readonly submitLabel: string;
    /** What was submitted: accepted on the server, or on its way from here. */
    readonly answer?: string;
    readonly state?: UiControlState;
    /** Submits the text. Absent, the field is shown but cannot be used. */
    readonly onSubmit?: (text: string) => void;
};

/**
 * Chat UI `text_field`: one labelled single-line field and its submit, such as
 * a nickname. The text becomes the person's message, so once submitted the
 * field keeps showing it, locked.
 */
export function UiTextField(props: UiTextFieldProps) {
    const [text, setText] = useState("");
    const answered = props.answer !== undefined;
    const usable = !answered && uiControlUsable(props.state) && props.onSubmit !== undefined;
    const trimmed = text.trim();
    const sendable = usable && trimmed !== "" && trimmed.length <= UI_TEXT_FIELD_MAX;
    const send = () => {
        if (sendable) props.onSubmit?.(trimmed);
    };
    return (
        <div
            className="happy-chat-ui happy-chat-ui__control"
            data-happy-desktop-ui="chat-ui-text-field"
            data-locked={usable ? undefined : ""}
        >
            <span className="happy-chat-ui__field-label">{props.label}</span>
            <div className="happy-chat-ui__field-row">
                <TextField
                    aria-label={props.label}
                    className="happy-chat-ui__field"
                    disabled={!usable}
                    onSubmit={send}
                    onValueChange={(value) => setText(value.slice(0, UI_TEXT_FIELD_MAX))}
                    {...(props.placeholder ? { placeholder: props.placeholder } : {})}
                    size="medium"
                    value={props.answer ?? text}
                />
                <Button
                    aria-pressed={answered ? true : undefined}
                    className="happy-chat-ui__button"
                    data-chosen={answered ? "" : undefined}
                    disabled={!sendable && !answered}
                    onClick={send}
                    size="medium"
                    variant="outline"
                >
                    {props.submitLabel}
                </Button>
            </div>
            <UiStatusLine state={props.state} />
        </div>
    );
}
