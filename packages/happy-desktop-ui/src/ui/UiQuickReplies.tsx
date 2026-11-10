import type { CSSProperties, ReactNode } from "react";
import type { ConversationQuickReplies, ReplyProviderId } from "happy-desktop-state";
import { AssistantMark } from "../AssistantMark";
import { Ionicon } from "../vectorIcons/VectorIcon";
import { uiProviderMark } from "./UiProviderSignInRow";

/**
 * The live notes reply components wear, drawn by the conversation's owner
 * from its own stores: a provider option's "2 accounts". A note's text may
 * change; its room is reserved, so nothing moves when it does.
 */
export type ChatUiReplyNotes = {
    readonly provider?: (provider: ReplyProviderId) => ReactNode;
};

export type UiQuickRepliesProps = {
    readonly replies: ConversationQuickReplies;
    /**
     * Every pill's width, from `conversationQuickRepliesLayout` at the row's
     * width. Absent, the stack is as wide as its widest pill.
     */
    readonly pillWidth?: number;
    /**
     * Sends one option as the person's message. Absent, or the suggestion is
     * no longer the newest one nobody has answered, the replies take no tap.
     */
    readonly onSend?: (index: number) => void;
    readonly notes?: ChatUiReplyNotes;
    readonly className?: string;
    readonly style?: CSSProperties;
};

/**
 * Suggested replies: the agent's offer of what the person might say. They are
 * its output, so they stand on its text's edge, one under another, every pill
 * as wide as the widest of the stack, in a fainter fill of the person's own
 * bubble. A tap sends the option at once. The option a person's message sent
 * (`chosen`, read back from its `quickReply`) takes the bubble's own fill and
 * a tick, and the others' words go quiet; the tick's room is always kept, so
 * nothing moves. The stack stays for good, and only the newest one nobody has
 * answered takes a tap.
 *
 * An option about an AI wears its mark before the words and, while the stack
 * takes a tap, a quiet note at the end on how that AI stands now.
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
            <div
                aria-label="Suggested replies"
                className="happy-chat-replies__stack"
                role="group"
                style={props.pillWidth === undefined ? undefined : { width: props.pillWidth }}
            >
                {replies.options.map((option, index) => {
                    const about = replies.ui?.[index];
                    const note =
                        about && replies.live
                            ? props.notes?.provider?.(about.props.provider)
                            : null;
                    return (
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
                            {about ? (
                                <span aria-hidden="true" className="happy-chat-replies__mark">
                                    <AssistantMark
                                        name={uiProviderMark(about.props.provider)}
                                        size={16}
                                    />
                                </span>
                            ) : null}
                            <span className="happy-chat-replies__label">{option}</span>
                            {note ? <span className="happy-chat-replies__note">{note}</span> : null}
                            <span aria-hidden="true" className="happy-chat-replies__tick">
                                <Ionicon name="checkmark" size={16} />
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
