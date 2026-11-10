import type { Message, UiActionBlock, UiDocument } from "@slopus/happy-agent-client";
import {
    chatUiComponentKey,
    quickRepliesKey,
    type ConversationQuickReplies,
    type ConversationUi,
    type ConversationUiAttempt,
} from "./chatUi.js";

/**
 * What a transcript recorded about its chat UI, read once per projection. The
 * daemon stores every click as a service message with one `action` block,
 * secrets left out; a record is never drawn itself, only what it says about
 * the component it answers. A suggestion's chosen option and whether it still
 * takes a tap are read back the same way, from the person's messages.
 */
export type ChatUiTranscript = {
    /** Each component's last attempt, by `chatUiComponentKey`. */
    readonly attempts: ReadonlyMap<string, ConversationUiAttempt>;
    /** The option a person's message sent, by `quickRepliesKey`. */
    readonly chosen: ReadonlyMap<string, number>;
    /** The newest suggestion with no person's message after it, by `quickRepliesKey`. */
    readonly liveKey: string | undefined;
};

/** The documents a message offers: its own `ui` blocks, and its `show_ui` calls'. */
export function chatUiDocumentsOf(message: Message): readonly UiDocument[] {
    if (message.role !== "agent") return [];
    const documents: UiDocument[] = [];
    for (const block of message.content) {
        if (block.type === "ui") documents.push(block.ui);
        else if (block.type === "tool_call" && block.presentation?.type === "ui")
            documents.push(block.presentation.ui);
    }
    return documents;
}

/** The attempt a service record holds, when it is one. */
export function chatUiRecordOf(message: Message): UiActionBlock | undefined {
    if (message.role !== "service") return undefined;
    for (const block of message.content) if (block.type === "action") return block;
    return undefined;
}

/**
 * The suggestions a message makes, in order: its own `quick_replies` blocks
 * and its `suggest_replies` calls' presentations. None is live or chosen yet;
 * `chatUiQuickReplies` says so against the transcript.
 */
export function quickRepliesOf(message: Message): readonly ConversationQuickReplies[] {
    if (message.role !== "agent") return [];
    const found: ConversationQuickReplies[] = [];
    for (const block of message.content) {
        if (block.type === "quick_replies" && block.options.length > 0)
            found.push({ messageId: message.id, options: block.options, live: false });
        else if (
            block.type === "tool_call" &&
            block.presentation?.type === "quick_replies" &&
            block.presentation.options.length > 0
        )
            found.push({
                messageId: message.id,
                toolCallId: block.id,
                options: block.presentation.options,
                live: false,
            });
    }
    return found;
}

/**
 * Whether a message's projection depends on the rest of the transcript: it
 * offers a document, whose components show the records answering them.
 */
export function chatUiMessage(message: Message): boolean {
    return chatUiDocumentsOf(message).length > 0;
}

/** Reads `messages`, in transcript order. */
export function chatUiTranscriptRead(messages: Iterable<Message>): ChatUiTranscript {
    const attempts = new Map<string, ConversationUiAttempt>();
    const chosen = new Map<string, number>();
    let liveKey: string | undefined;
    for (const message of messages) {
        if (message.role === "user") {
            liveKey = undefined;
            if (message.quickReply)
                chosen.set(quickRepliesKey(message.quickReply), message.quickReply.index);
            continue;
        }
        const last = quickRepliesOf(message).at(-1);
        if (last) liveKey = quickRepliesKey(last);
        const record = chatUiRecordOf(message);
        if (record !== undefined)
            attempts.set(chatUiComponentKey(record, record.componentId), {
                action: record.action,
                outcome: record.outcome,
            });
    }
    return { attempts, chosen, liveKey };
}

/** One document as a message entry shows it, with what the transcript recorded about it. */
export function chatUiConversation(
    transcript: ChatUiTranscript,
    messageId: string,
    document: UiDocument,
    media: ConversationUi["media"],
): ConversationUi {
    const offer = { messageId, uiId: document.id };
    const attempts = new Map<string, ConversationUiAttempt>();
    for (const component of document.components) {
        const attempt = transcript.attempts.get(chatUiComponentKey(offer, component.id));
        if (attempt !== undefined) attempts.set(component.id, attempt);
    }
    return { offer, document, media, attempts };
}

/** One suggestion as the transcript stands: the option sent from it, and whether it takes a tap. */
export function chatUiQuickReplies(
    transcript: ChatUiTranscript,
    replies: ConversationQuickReplies,
): ConversationQuickReplies {
    const key = quickRepliesKey(replies);
    const sent = transcript.chosen.get(key);
    return {
        ...replies,
        ...(sent === undefined || sent >= replies.options.length ? {} : { chosen: sent }),
        live: key === transcript.liveKey,
    };
}

/** Whether two suggestions are the same one, in the same state. */
export function quickRepliesEqual(
    left: ConversationQuickReplies,
    right: ConversationQuickReplies,
): boolean {
    if (left === right) return true;
    return (
        left.messageId === right.messageId &&
        left.toolCallId === right.toolCallId &&
        left.chosen === right.chosen &&
        left.live === right.live &&
        left.options.length === right.options.length &&
        left.options.every((option, index) => option === right.options[index])
    );
}

/** Whether two projections of one document say the same thing. */
export function chatUiEqual(
    left: ConversationUi | undefined,
    right: ConversationUi | undefined,
): boolean {
    if (left === right) return true;
    if (left === undefined || right === undefined) return false;
    if (
        left.offer.messageId !== right.offer.messageId ||
        left.offer.uiId !== right.offer.uiId ||
        left.document !== right.document ||
        left.media.length !== right.media.length ||
        !left.media.every((item, index) => item.url === right.media[index]?.url) ||
        left.attempts.size !== right.attempts.size
    )
        return false;
    for (const [id, attempt] of left.attempts) {
        const other = right.attempts.get(id);
        if (
            other === undefined ||
            attempt.action !== other.action ||
            attempt.outcome.status !== other.outcome.status ||
            attempt.outcome.code !== other.outcome.code ||
            attempt.outcome.reason !== other.outcome.reason
        )
            return false;
    }
    return true;
}
