import type { CSSProperties } from "react";
import type { ConversationQuickReplies } from "happy-desktop-state";
import { Ionicon } from "../vectorIcons/VectorIcon";
import { chatUiMeasure } from "./UiDocumentView";

export type UiQuickRepliesProps = {
    readonly replies: ConversationQuickReplies;
    /**
     * Sends one option as the person's message. Absent, or the suggestion is
     * no longer the newest one nobody has answered, the replies take no tap.
     */
    readonly onSend?: (index: number) => void;
    readonly className?: string;
    readonly style?: CSSProperties;
};

/**
 * Suggested replies: the agent's offer of what the person might say, drawn as
 * their own bubbles would be — one under another, each as wide as a person's
 * widest bubble, against the right, in a fainter fill. A tap sends the option
 * at once. The option a person's message sent (`chosen`, read back from its
 * `quickReply`) takes the bubble's own fill and a tick, and the others' words go
 * quiet; the tick's room is always kept, so nothing moves. The stack stays for
 * good, and only the newest one nobody has answered takes a tap.
 *
 * It is a conversation row of its own, with the own message's insets.
 */
export function UiQuickReplies(props: UiQuickRepliesProps) {
    const replies = props.replies;
    const send = replies.live ? props.onSend : undefined;
    return (
        <div
            className={["happy-chat-replies", props.className].filter(Boolean).join(" ")}
            data-chosen={replies.chosen === undefined ? undefined : ""}
            data-happy-desktop-ui="chat-ui-quick-replies"
            data-live={send ? "" : undefined}
            style={props.style}
        >
            <div aria-label="Suggested replies" className="happy-chat-replies__stack" role="group">
                {replies.options.map((option, index) => (
                    <button
                        aria-pressed={replies.chosen === index}
                        className="happy-chat-replies__reply"
                        data-chosen={replies.chosen === index ? "" : undefined}
                        disabled={send === undefined}
                        key={`${String(index)}:${option}`}
                        onClick={() => send?.(index)}
                        title={option}
                        type="button"
                    >
                        <span className="happy-chat-replies__label">{option}</span>
                        <span aria-hidden="true" className="happy-chat-replies__tick">
                            <Ionicon name="checkmark" size={16} />
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );
}

/** The row's height at the conversation's `width`: one line per reply, whatever is chosen. */
export function uiQuickRepliesHeight(replies: ConversationQuickReplies, width: number): number {
    return chatUiMeasure(replies.options, "row", width, () => (
        <UiQuickReplies replies={{ ...replies, live: false }} />
    ));
}
