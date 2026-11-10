import type { CSSProperties } from "react";
import type { ConversationQuickReplies } from "happy-desktop-state";
import {
    uiTextHeight,
    uiTextNaturalWidth,
    type MessageTextLayoutCache,
} from "../messageTextLayout";
import { Ionicon } from "../vectorIcons/VectorIcon";

/*
 * `.happy-chat-replies`: 8px over and under the stack, pills 6px apart, each
 * 10px + one or two 22px lines of 15px words + 10px tall. Across a pill: 12px
 * padding either side, the words, and a 16px tick 8px after them.
 */
const REPLIES_PADDING = 8;
const REPLY_GAP = 6;
const REPLY_PADDING_Y = 10;
const REPLY_SIZE = 15;
const REPLY_LINE = 22;
const REPLY_LINES_MAX = 2;
const REPLY_CHROME = 2 * 12 + 8 + 16;
/** The row's 48px of insets, and the share of what is left a pill may take: a person's own bubble's. */
const REPLIES_INSET = 48;
const REPLY_WIDTH_CAP = 0.76;

/** A suggestion's row: its height, the one width every pill takes, and each pill's height. */
export type UiQuickRepliesLayout = {
    readonly height: number;
    readonly pillWidth: number;
    readonly pillHeights: readonly number[];
};

/**
 * Lays a suggestion out at the row's `width`, from its options' words alone:
 * every pill as wide as the widest one's words with the tick's room, and no
 * wider than the person's own widest bubble. At that width an option's words
 * wrap to at most two lines, past which they ellipsize. A reply chosen moves
 * nothing.
 */
export function uiQuickRepliesLayout(
    options: readonly string[],
    width: number,
    cache?: MessageTextLayoutCache,
): UiQuickRepliesLayout {
    let widest = 0;
    for (const option of options)
        widest = Math.max(widest, uiTextNaturalWidth(option, REPLY_SIZE, cache));
    const cap = Math.floor((width - REPLIES_INSET) * REPLY_WIDTH_CAP);
    const pillWidth = Math.min(cap, Math.ceil(REPLY_CHROME + widest + 0.5));
    const pillHeights = options.map((option) => {
        const lines = Math.round(
            uiTextHeight(option, REPLY_SIZE, REPLY_LINE, pillWidth - REPLY_CHROME, cache) /
                REPLY_LINE,
        );
        return 2 * REPLY_PADDING_Y + Math.min(REPLY_LINES_MAX, Math.max(1, lines)) * REPLY_LINE;
    });
    const height =
        2 * REPLIES_PADDING +
        pillHeights.reduce((sum, pill) => sum + pill, 0) +
        Math.max(0, pillHeights.length - 1) * REPLY_GAP;
    return { height, pillWidth, pillHeights };
}

export type UiQuickRepliesProps = {
    readonly replies: ConversationQuickReplies;
    /**
     * Every pill's width and each pill's height, from `uiQuickRepliesLayout`
     * at the row's width. Absent, the stack is as wide as its widest pill and
     * each pill as tall as its words.
     */
    readonly layout?: UiQuickRepliesLayout;
    /** A reply was sent from here and hasn't come back in the transcript yet: no pill takes a tap. */
    readonly sent?: boolean;
    /**
     * Sends one option as the person's message. Absent, or the suggestion is
     * no longer the newest one nobody has answered, the replies take no tap.
     */
    readonly onSend?: (index: number) => void;
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
 */
export function UiQuickReplies(props: UiQuickRepliesProps) {
    const replies = props.replies;
    const send = replies.live && !props.sent ? props.onSend : undefined;
    const layout = props.layout;
    return (
        <div
            className={["happy-chat-replies", props.className].filter(Boolean).join(" ")}
            data-chosen={replies.chosen === undefined ? undefined : ""}
            data-happy-desktop-ui="chat-ui-quick-replies"
            style={props.style}
        >
            <div
                aria-label="Suggested replies"
                className="happy-chat-replies__stack"
                role="group"
                style={layout === undefined ? undefined : { width: layout.pillWidth }}
            >
                {replies.options.map((option, index) => (
                    <button
                        aria-pressed={replies.chosen === index}
                        className="happy-chat-replies__reply"
                        data-chosen={replies.chosen === index ? "" : undefined}
                        disabled={send === undefined}
                        key={`${String(index)}:${option}`}
                        onClick={() => send?.(index)}
                        style={
                            layout === undefined ? undefined : { height: layout.pillHeights[index] }
                        }
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
