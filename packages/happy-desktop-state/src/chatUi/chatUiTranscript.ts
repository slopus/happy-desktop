import type { Message, UiActionBlock, UiDocument } from "@slopus/happy-agent-client";
import {
    chatUiActionDefinition,
    type ConversationUi,
    type ConversationUiAttempt,
    type UiActionInput,
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
    /** Each component's accepted `once` answer, by the same key. */
    readonly answers: ReadonlyMap<string, UiActionInput>;
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

/** Whether a message carries chat UI or answers it, so its projection depends on the transcript. */
export function chatUiMessage(message: Message): boolean {
    return chatUiDocumentsOf(message).length > 0 || chatUiRecordOf(message) !== undefined;
}

/** Reads `messages`, in transcript order. */
export function chatUiTranscriptRead(messages: Iterable<Message>): ChatUiTranscript {
    const components = new Map<string, UiComponent>();
    const attempts = new Map<string, ConversationUiAttempt>();
    const answers = new Map<string, UiActionInput>();
    for (const message of messages) {
        for (const document of chatUiDocumentsOf(message))
            for (const component of document.components)
                components.set(key(message.id, document.id, component.id), component);
        const record = chatUiRecordOf(message);
        if (record === undefined) continue;
        const at = key(record.messageId, record.uiId, record.componentId);
        attempts.set(at, { action: record.action, outcome: record.outcome });
        if (
            record.outcome.status === "accepted" &&
            chatUiActionDefinition(record.action.type)?.once === true
        )
            answers.set(at, record.action);
    }
    return { components, attempts, answers };
}

/** The component an attempt record answered, when the transcript still holds its offer. */
export function chatUiRecordComponent(
    transcript: ChatUiTranscript,
    record: UiActionBlock,
): UiComponent | undefined {
    return transcript.components.get(key(record.messageId, record.uiId, record.componentId));
}

/** One document as a message entry shows it, with what the transcript recorded about it. */
export function chatUiConversation(
    transcript: ChatUiTranscript,
    messageId: string,
    document: UiDocument,
    media: ConversationUi["media"],
    open: boolean,
): ConversationUi {
    const attempts = new Map<string, ConversationUiAttempt>();
    const answers = new Map<string, UiActionInput>();
    for (const component of document.components) {
        const at = key(messageId, document.id, component.id);
        const attempt = transcript.attempts.get(at);
        if (attempt !== undefined) attempts.set(component.id, attempt);
        const answer = transcript.answers.get(at);
        if (answer !== undefined) answers.set(component.id, answer);
    }
    return { offer: { messageId, uiId: document.id }, document, media, attempts, answers, open };
}

/** Whether two projections of one document say the same thing. */
export function chatUiEqual(left: ConversationUi | undefined, right: ConversationUi | undefined) {
    if (left === right) return true;
    if (left === undefined || right === undefined) return false;
    return (
        left.offer.messageId === right.offer.messageId &&
        left.offer.uiId === right.offer.uiId &&
        left.document === right.document &&
        left.open === right.open &&
        left.media.length === right.media.length &&
        left.media.every((item, index) => item.url === right.media[index]?.url) &&
        mapsEqual(
            left.attempts,
            right.attempts,
            (a, b) => a.action === b.action && outcomeSame(a, b),
        ) &&
        mapsEqual(left.answers, right.answers, (a, b) => a === b)
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
