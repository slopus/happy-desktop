import type { CSSProperties } from "react";
import { Button } from "./Button";

export type InvalidMessageLineProps = {
    /** Opens the bug report for this message; absent, the line only says what happened. */
    onReport?: () => void;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
};

/**
 * InvalidMessageLine — a message this build could not read, in the place it
 * would have taken: one muted italic line and a way to report it. The
 * messages around it draw as they always do.
 */
export function InvalidMessageLine(props: InvalidMessageLineProps) {
    return (
        <div
            className={["happy-invalid-message", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="invalid-message"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            <span className="happy-invalid-message__text">
                Hey, this message failed to display.
            </span>
            {props.onReport === undefined ? null : (
                <Button icon="bug" onClick={props.onReport} size="small" variant="ghost">
                    Report bug
                </Button>
            )}
        </div>
    );
}
