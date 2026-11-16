import { Button } from "./Button";

export interface MessageOptionsProps {
    /** The replies the agent offered, in the order it wrote them. */
    readonly options: readonly string[];
    /**
     * Sends the chosen reply as the person's next message. Without it the
     * replies are shown but cannot be chosen, as in a read-only transcript.
     */
    readonly onSelect?: (option: string) => void;
}

/** One option button: the small button's contract height. */
export const MESSAGE_OPTION_HEIGHT = 28;
/** Between two option buttons, the attachment slot's own gap. */
export const MESSAGE_OPTION_GAP = 4;

/**
 * MessageOptions — the replies an agent offered at the end of its message, one
 * button each, stacked under the text. Choosing one sends it as written.
 *
 * Each button keeps one line, so the stack is exactly as tall as its count
 * says and the row the transcript reserved for it never changes; a reply too
 * long for the column ends in an ellipsis and shows in full on hover.
 */
export function MessageOptions(props: MessageOptionsProps) {
    return (
        <div
            aria-label="Suggested replies"
            className="happy-message-options"
            data-happy-desktop-ui="message-options"
            role="group"
        >
            {props.options.map((option) => (
                <Button
                    className="happy-message-options__option"
                    disabled={props.onSelect === undefined}
                    key={option}
                    onClick={() => props.onSelect?.(option)}
                    size="small"
                    title={option}
                    variant="secondary"
                >
                    {option}
                </Button>
            ))}
        </div>
    );
}
