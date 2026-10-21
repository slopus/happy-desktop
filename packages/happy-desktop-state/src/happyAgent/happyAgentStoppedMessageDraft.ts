import type { ConversationEntry } from "../conversation/conversationEntry.js";

/** What the reader sent to open a turn that was stopped, ready to be written again. */
export interface HappyAgentStoppedMessageDraft {
    /** Their words, one message to a paragraph, in the order they were sent. */
    readonly text: string;
    /** The pictures that went with them, as they travelled inline. */
    readonly images: readonly { readonly mediaType: string; readonly data: string }[];
}

/**
 * Gathers the messages a stopped turn's footer names from the transcript it
 * sits in. `undefined` when the entry is not such a footer, or when none of
 * its messages has anything left to write again.
 */
export function happyAgentStoppedMessageDraft(
    entries: readonly ConversationEntry[],
    entryId: string,
): HappyAgentStoppedMessageDraft | undefined {
    const status = entries.find((entry) => entry.kind === "turnStatus" && entry.id === entryId);
    if (status?.kind !== "turnStatus" || status.stoppedMessageIds === undefined) return undefined;
    const stopped = new Set(status.stoppedMessageIds);
    const texts: string[] = [];
    const images: { readonly mediaType: string; readonly data: string }[] = [];
    for (const entry of entries) {
        if (entry.kind !== "message" || !stopped.has(entry.message.id)) continue;
        if (entry.message.text.trim().length > 0) texts.push(entry.message.text);
        for (const attachment of entry.message.attachments)
            if (attachment.kind === "inlineImage")
                images.push({ mediaType: attachment.mediaType, data: attachment.data });
    }
    if (texts.length === 0 && images.length === 0) return undefined;
    return { text: texts.join("\n\n"), images };
}
