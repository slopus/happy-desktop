import type { ReactNode } from "react";
import { Spinner } from "../Spinner";
import { Ionicon } from "../vectorIcons/VectorIcon";

/** A row's height, and the hairline frame's 1px over and under its rows. */
export const UI_ROW_HEIGHT = 58;
export const UI_ROWS_BORDER = 1;
/**
 * A stacked row's height: the words' 58px, the 36px controls under them, and
 * as much under the controls as the frame leaves beside them (11px + its 1px).
 */
export const UI_ROW_STACKED_HEIGHT = UI_ROW_HEIGHT + 36 + 11;

/**
 * The frame a chat UI component sits in: a hairline group standing out from
 * the reply's column by its padding, so what it holds starts on the reply's
 * left edge.
 */
export function UiRows(props: {
    readonly children: ReactNode;
    readonly label: string;
    readonly "data-happy-desktop-ui": string;
}) {
    return (
        <div
            aria-label={props.label}
            className="happy-chat-rows"
            data-happy-desktop-ui={props["data-happy-desktop-ui"]}
            role="group"
        >
            {props.children}
        </div>
    );
}

/** How a row's line reads: as it is, working, or refused. */
export type UiRowTone = "quiet" | "busy" | "error";

/**
 * One row: a mark, a name, one line about it, and the controls it needs now.
 * A state changes the line and the controls, never the box. Where the column
 * is too narrow for the words beside the controls, the caller stacks the row:
 * the controls take their own line under the words, at the column's width.
 */
export function UiRow(props: {
    readonly mark: ReactNode;
    readonly name: string;
    readonly line: string;
    readonly tone?: UiRowTone;
    readonly controls?: ReactNode;
    /** The controls sit under the words, not beside them. */
    readonly stacked?: boolean;
    /** Pins the spinner on one frame, for a still fixture. */
    readonly spinnerFrame?: number;
}) {
    const tone = props.tone ?? "quiet";
    return (
        <div
            className="happy-chat-row"
            data-happy-desktop-ui="chat-ui-row"
            data-stacked={props.stacked ? "" : undefined}
            data-tone={tone}
        >
            <span className="happy-chat-row__head">
                <span className="happy-chat-row__mark">{props.mark}</span>
                <span className="happy-chat-row__words">
                    <span className="happy-chat-row__name">{props.name}</span>
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
                                ) : (
                                    <Ionicon name="alert-circle" size={14} />
                                )}
                            </span>
                        )}
                        <span className="happy-chat-row__line-text">{props.line}</span>
                    </span>
                </span>
            </span>
            {props.controls ? (
                <span className="happy-chat-row__controls">{props.controls}</span>
            ) : null}
        </div>
    );
}
