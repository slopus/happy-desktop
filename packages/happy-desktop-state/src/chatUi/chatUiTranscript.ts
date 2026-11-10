import type {
    Message,
    ReplyUi as WireReplyUi,
    UiActionBlock,
    UiDocument,
} from "@slopus/happy-agent-client";
import {
    replyUiRead,
    type ConversationQuickReplies,
    type ConversationUi,
    type ConversationUiAttempt,
    type ReplyUi,
    type UiComponent,
} from "./chatUi.js";

/**
 * What a transcript recorded about its chat UI, read once per projection: the
 * documents its messages offer, and the attempt records answering them. The
 * daemon stores every click as a service message with one `action` block,
 * secrets left out; a record is never drawn itself, only what it says about
 * its offer.
 */
export type ChatUiTranscript = {
    /** Each offered component, by `messageId`, `uiId` and `componentId`. */
    readonly components: ReadonlyMap<string, UiComponent>;
    /** Each component's last attempt, by the same key. */
    readonly attempts: ReadonlyMap<string, ConversationUiAttempt>;
};

const key = (messageId: string, uiId: string, componentId: string): string =>
    `${messageId}\u0000${uiId}\u0000${componentId}`;

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

/** Whether a message carries chat UI or a record of it, so its projection depends on the transcript. */
export function chatUiMessage(message: Message): boolean {
    return chatUiDocumentsOf(message).length > 0 || chatUiRecordOf(message) !== undefined;
}

/** Reads `messages`, in transcript order. */
export function chatUiTranscriptRead(messages: Iterable<Message>): ChatUiTranscript {
    const components = new Map<string, UiComponent>();
    const attempts = new Map<string, ConversationUiAttempt>();
    for (const message of messages) {
        for (const document of chatUiDocumentsOf(message))
            for (const component of document.components)
                components.set(key(message.id, document.id, component.id), component);
        const record = chatUiRecordOf(message);
        if (record === undefined) continue;
        const at = key(record.messageId, record.uiId, record.componentId);
        attempts.set(key(record.messageId, record.uiId, record.componentId), {
            action: record.action,
            outcome: record.outcome,
        });
    }
    return { components, attempts };
}

/** One document as a message entry shows it, with what the transcript recorded about it. */
export function chatUiConversation(
    transcript: ChatUiTranscript,
    messageId: string,
    document: UiDocument,
    media: ConversationUi["media"],
): ConversationUi {
    const attempts = new Map<string, ConversationUiAttempt>();
    for (const component of document.components) {
        const attempt = transcript.attempts.get(key(messageId, document.id, component.id));
        if (attempt !== undefined) attempts.set(component.id, attempt);
    }
    return { offer: { messageId, uiId: document.id }, document, media, attempts };
}

/**
 * The suggestion a message makes: its own `quick_replies` block, or its last
 * `suggest_replies` call's presentation.
 */
export function quickRepliesOf(message: Message): readonly ConversationQuickReplies[] {
    if (message.role !== "agent") return [];
    const found: ConversationQuickReplies[] = [];
    for (const block of message.content) {
        if (block.type === "quick_replies" && block.options.length > 0)
            found.push({
                messageId: message.id,
                options: block.options,
                ...replyUiOf(block),
                live: false,
            });
        else if (
            block.type === "tool_call" &&
            block.presentation?.type === "quick_replies" &&
            block.presentation.options.length > 0
        )
            found.push({
                messageId: message.id,
                toolCallId: block.id,
                options: block.presentation.options,
                ...replyUiOf(block.presentation),
                live: false,
            });
    }
    return found;
}

/** The options' reply components this build draws, when the suggestion carries any. */
function replyUiOf(carrier: {
    readonly ui?: readonly (WireReplyUi | null)[];
}): { readonly ui: readonly (ReplyUi | null)[] } | Record<string, never> {
    const read = carrier.ui?.map(replyUiRead);
    return read?.some((entry) => entry !== null) ? { ui: read } : {};
}

/** The key one suggestion and every `quickReply` naming it share. */
export function quickRepliesKey(replies: {
    readonly messageId: string;
    readonly toolCallId?: string;
}): string {
    return `${replies.messageId}\u0000${replies.toolCallId ?? ""}`;
}

/** Whether two suggestions are the same one. */
export function quickRepliesEqual(
    left: ConversationQuickReplies | undefined,
    right: ConversationQuickReplies | undefined,
): boolean {
    if (left === right) return true;
    if (left === undefined || right === undefined) return false;
    return (
        left.messageId === right.messageId &&
        left.toolCallId === right.toolCallId &&
        left.chosen === right.chosen &&
        left.live === right.live &&
        left.options.length === right.options.length &&
        left.options.every((option, index) => option === right.options[index]) &&
        (left.ui?.length ?? 0) === (right.ui?.length ?? 0) &&
        (left.ui ?? []).every(
            (entry, index) =>
                entry?.type === right.ui?.[index]?.type &&
                entry?.props.provider === right.ui?.[index]?.props.provider,
        )
    );
}

/** Whether two projections of one document say the same thing. */
export function chatUiEqual(left: ConversationUi | undefined, right: ConversationUi | undefined) {
    if (left === right) return true;
    if (left === undefined || right === undefined) return false;
    return (
        left.offer.messageId === right.offer.messageId &&
        left.offer.uiId === right.offer.uiId &&
        left.document === right.document &&
        left.media.length === right.media.length &&
        left.media.every((item, index) => item.url === right.media[index]?.url) &&
        mapsEqual(
            left.attempts,
            right.attempts,
            (a, b) => a.action === b.action && outcomeSame(a, b),
        )
    );
}

function outcomeSame(left: ConversationUiAttempt, right: ConversationUiAttempt): boolean {
    return (
        left.outcome.status === right.outcome.status &&
        left.outcome.code === right.outcome.code &&
        left.outcome.reason === right.outcome.reason
    );
}

function mapsEqual<T>(
    left: ReadonlyMap<string, T>,
    right: ReadonlyMap<string, T>,
    same: (left: T, right: T) => boolean,
): boolean {
    if (left.size !== right.size) return false;
    for (const [id, value] of left) {
        const other = right.get(id);
        if (other === undefined || !same(value, other)) return false;
    }
    return true;
}
