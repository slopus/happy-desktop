import {
    MAX_CHAT_ACTION_BLOCKS,
    chatActionBlocksOf,
    parseChatActionBlock,
    splitChatActionBlocks,
    stripChatActionBlocks,
    type ActionChoice,
    type ChatAction,
    type ChatActionBlock,
    type ChatActionBlockSegment,
} from "@slopus/happy-agent-client";

export type {
    ActionChoice as ChatActionChoice,
    ChatAction,
    ChatActionBlock,
    ChatActionButton,
    ChatActionId,
    ChatActionMark,
    ChatChecklistOption,
    ChatFigure,
    ChatStatusTone,
    ChatStepStatus,
    ChatTreeNode,
    OnboardingFlow,
    ProviderCli,
} from "@slopus/happy-agent-client";

/**
 * Inline actions an agent writes into its reply: a closed subset of HTML that
 * `@slopus/happy-agent-client` finds and parses into a typed tree. The desktop
 * never parses the HTML itself and never puts it into the page: it draws the
 * tree, and an action block the client does not accept stays the inert text it
 * was written as.
 *
 * Every parse here is guarded: the text is the agent's, so whatever it does to
 * the parser, the reply is still its Markdown.
 */

/** One stretch of a reply: Markdown, or an action block as written. */
export type ConversationActionSegment = ChatActionBlockSegment;

/** A reply's text cut around its action blocks; the whole text as Markdown if the cut fails. */
export function conversationActionSegments(text: string): readonly ConversationActionSegment[] {
    if (!text.includes("<")) return [{ type: "markdown", text }];
    try {
        return splitChatActionBlocks(text);
    } catch {
        return [{ type: "markdown", text }];
    }
}

/**
 * The block one complete segment draws, by its index across the whole message;
 * nothing when the client refuses it or throws, or when the message has more
 * blocks than the client reads.
 */
export function conversationActionBlockParse(
    html: string,
    blockIndex: number,
): ChatActionBlock | undefined {
    if (blockIndex >= MAX_CHAT_ACTION_BLOCKS) return undefined;
    try {
        return parseChatActionBlock(html);
    } catch {
        return undefined;
    }
}

/**
 * How many action blocks a text block holds, valid or not: what the daemon's
 * block indexes count across a message's text blocks.
 */
export function conversationActionBlockCount(text: string): number {
    if (!text.includes("<")) return 0;
    try {
        return chatActionBlocksOf(text).length;
    } catch {
        return 0;
    }
}

/**
 * An agent's text for a surface that draws no inline actions: a preview, a
 * copy, a voice call's context. A block the client does not accept is text
 * anyway, so it stays.
 */
export function conversationTextPlain(text: string): string {
    if (!text.includes("<")) return text;
    try {
        return stripChatActionBlocks(text);
    } catch {
        return text;
    }
}

/**
 * One press or submit in a reply's action block, as the block reports it. The
 * values a code field submits travel only here, to the send, and are never
 * held in the choice, the transcript, or any local copy.
 */
export type ChatActionInvocation = {
    /** The durable agent message the block was written in. */
    readonly messageId: string;
    /** The block's index across that whole message. */
    readonly blockIndex: number;
    /**
     * The control pressed: a menu's buttons in order; in a checklist or a code
     * field the submit is 0 and a checklist's other buttons follow it.
     */
    readonly controlIndex: number;
    /** What the block shows as chosen while the press is on its way. */
    readonly choice: ActionChoice;
    readonly action: ChatAction;
    /** The words on the control pressed, as the person read them. */
    readonly label: string;
    /** A checklist's ticked values, or a code field's text. */
    readonly values: readonly string[];
};

/** The key a block's pending press is kept under in its conversation. */
export function chatActionBlockKey(messageId: string, blockIndex: number): string {
    return `${messageId}:${String(blockIndex)}`;
}
