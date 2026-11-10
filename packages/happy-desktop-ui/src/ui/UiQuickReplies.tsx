import type { CSSProperties } from "react";
import { replyUiNote, type ConversationQuickReplies } from "happy-desktop-state";
import { AssistantMark } from "../AssistantMark";
import type { ConversationQuickRepliesLayout } from "../conversationRowHeight";
import { Ionicon } from "../vectorIcons/VectorIcon";
import { uiProviderMark } from "./UiProviderSignInRow";

export type UiQuickRepliesProps = {
    readonly replies: ConversationQuickReplies;
    /**
     * Every pill's width and each pill's height, from
     * `conversationQuickRepliesLayout` at the row's width. Absent, the stack
     * is as wide as its widest pill and each pill as tall as its words.
     */
    readonly layout?: ConversationQuickRepliesLayout;
    /**
     * Sends one option as the person's message. Absent, or the suggestion is
     * no longer the newest one nobody has answered, the replies take no tap.
     */
    readonly onSend?: (index: number) => void;
    readonly className?: string;
    readonly style?: CSSProperties;
};

/**
 * Suggested replies: plain, static options the agent offered, drawn from what
 * was stored with them and never from live state. They are its output, so
 * they stand on its text's edge, one under another, every pill
 * as wide as the widest of the stack, in a fainter fill of the person's own
 * bubble. A tap sends the option at once. The option a person's message sent
 * (`chosen`, read back from its `quickReply`) takes the bubble's own fill and
 * a tick, and the others' words go quiet; the tick's room is always kept, so
 * nothing moves. The stack stays for good, and only the newest one nobody has
 * answered takes a tap.
 *
 * An option about an AI wears its mark before the words and, under them, the
 * note its component was stored with. Words wrap to two lines at most, then
 * ellipsize; each pill's height is the layout's. Once shown, only the chosen
 * fill and tick change, and the stack stops taking taps.
 */
export function UiQuickReplies(props: UiQuickRepliesProps) {
    const replies = props.replies;
    const send = replies.live ? props.onSend : undefined;
    const layout = props.layout;
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
                style={layout === undefined ? undefined : { width: layout.pillWidth }}
            >
                {replies.options.map((option, index) => {
                    const about = replies.ui?.[index];
                    const note = replyUiNote(about);
                    return (
                        <button
                            aria-pressed={replies.chosen === index}
                            className="happy-chat-replies__reply"
                            data-chosen={replies.chosen === index ? "" : undefined}
                            disabled={send === undefined}
                            key={`${String(index)}:${option}`}
                            onClick={() => send?.(index)}
                            style={
                                layout === undefined
                                    ? undefined
                                    : { height: layout.pillHeights[index] }
                            }
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
                            <span className="happy-chat-replies__words">
                                <span className="happy-chat-replies__label">{option}</span>
                                {note === undefined ? null : (
                                    <span className="happy-chat-replies__note">{note}</span>
                                )}
                            </span>
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
