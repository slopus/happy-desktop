import type { ConversationServiceNoticeEntry } from "happy-desktop-state";

/** One heading shared by the error renderer and its unmounted row-height model. */
export function conversationErrorTitle(entry: ConversationServiceNoticeEntry): string {
    if (entry.retry === undefined) return entry.title ?? "Error";
    return entry.retry.attempt === undefined || entry.retry.attempt === 1
        ? "Connection Error"
        : `Connection Error (Attempt ${String(entry.retry.attempt)})`;
}
