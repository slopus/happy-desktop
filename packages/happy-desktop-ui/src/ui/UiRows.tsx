import type { ReactNode } from "react";
import { Spinner } from "../Spinner";
import { Ionicon } from "../vectorIcons/VectorIcon";

/**
 * The frame a live chat UI widget's rows sit in: a hairline group standing
 * out from the reply's column by its padding, rows 1px apart on its hairline.
 */
export function UiRows(props: {
    readonly children: ReactNode;
    readonly label?: string;
    readonly "data-happy-desktop-ui"?: string;
}) {
    return (
        <div
            aria-label={props.label}
            className="happy-chat-rows"
            data-happy-desktop-ui={props["data-happy-desktop-ui"] ?? "chat-ui-rows"}
            role="group"
        >
            {props.children}
        </div>
    );
}

/** How a row's line reads: as it is, working, done, or refused. */
export type UiRowTone = "quiet" | "busy" | "done" | "error";

/**
 * One row: a mark, a name with anything that belongs beside it, one line
 * about it, and the controls it needs now. Its height never changes; a state
 * changes the line and the controls, never the box.
 */
export function UiRow(props: {
    readonly mark: ReactNode;
    readonly name: string;
    /** What sits beside the name, such as the accounts already signed in. */
    readonly beside?: ReactNode;
    readonly line: ReactNode;
    readonly tone?: UiRowTone;
    readonly controls?: ReactNode;
    /** Pins the spinner on one frame, for a still fixture. */
    readonly spinnerFrame?: number;
    readonly state?: string;
}) {
    const tone = props.tone ?? "quiet";
    return (
        <div
            className="happy-chat-row"
            data-happy-desktop-ui="chat-ui-row"
            data-state={props.state}
            data-tone={tone}
        >
            <span className="happy-chat-row__mark">{props.mark}</span>
            <span className="happy-chat-row__words">
                <span className="happy-chat-row__title">
                    <span className="happy-chat-row__name">{props.name}</span>
                    {props.beside}
                </span>
                <span className="happy-chat-row__line" role="status">
                    {tone === "quiet" ? null : (
                        <span className="happy-chat-row__line-mark">
                            {tone === "busy" ? (
                                /* The arc, not the braille cell: at 14px in a line of words
                                   a braille cell reads as one more character. */
                                <Spinner
                                    size={14}
                                    tone="muted"
                                    variant="arc"
                                    {...(props.spinnerFrame === undefined
                                        ? {}
                                        : { frame: props.spinnerFrame })}
                                />
                            ) : tone === "done" ? (
                                <Ionicon name="checkmark-circle" size={14} />
                            ) : (
                                <Ionicon name="alert-circle" size={14} />
                            )}
                        </span>
                    )}
                    <span className="happy-chat-row__line-text">{props.line}</span>
                </span>
            </span>
            {props.controls ? (
                <span className="happy-chat-row__controls">{props.controls}</span>
            ) : null}
        </div>
    );
}
