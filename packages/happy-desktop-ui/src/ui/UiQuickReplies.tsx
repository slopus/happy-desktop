import type { ConversationQuickReplies } from "happy-desktop-state";
import { Button } from "../Button";
import { chatUiMeasure } from "./UiDocumentView";

export type UiQuickRepliesProps = {
    readonly replies: ConversationQuickReplies;
    /** Sends one option as the person's message. Absent, the pills are drawn disabled. */
    readonly onSend?: (index: number) => void;
};

/**
 * Suggested replies: one outline pill per option, in a wrapping row. A tap
 * sends the option as the person's message straight away; the row goes once
 * a person's message stands after it.
 */
export function UiQuickReplies(props: UiQuickRepliesProps) {
    const send = props.onSend;
    return (
        <div
            className="happy-chat-ui happy-chat-ui__quick-replies"
            data-happy-desktop-ui="chat-ui-quick-replies"
            role="group"
            aria-label="Suggested replies"
        >
            {props.replies.options.map((option, index) => (
                <Button
                    className="happy-chat-ui__pill"
                    data-happy-desktop-ui="chat-ui-quick-reply"
                    disabled={send === undefined}
                    key={`${String(index)}:${option}`}
                    onClick={() => send?.(index)}
                    size="medium"
                    title={option}
                    variant="outline"
                >
                    {option}
                </Button>
            ))}
        </div>
    );
}

/** The row's height at `width`, as it wraps there. */
export function uiQuickRepliesHeight(replies: ConversationQuickReplies, width: number): number {
    return chatUiMeasure(replies, "", width, () => <UiQuickReplies replies={replies} />);
}
