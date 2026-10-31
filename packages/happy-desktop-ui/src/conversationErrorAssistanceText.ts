import type { ConversationErrorAssistance } from "happy-desktop-state";

/** Shared by the card and its exact virtual-row text geometry. */
export function conversationErrorAssistanceText(assistance: ConversationErrorAssistance): {
    readonly label: string;
    readonly detail?: string;
    readonly disabled: boolean;
} {
    const name = assistance.chiefName ?? "Chief of Staff";
    switch (assistance.status) {
        case "ready":
            return { label: `Ask ${name}`, disabled: false };
        case "pending":
            return { label: `Preparing ${name} draft…`, disabled: true };
        case "prepared":
            return { label: `Draft prepared in ${name}`, disabled: true };
        case "failed":
            return {
                label: `Ask ${name}`,
                detail: `Could not prepare the draft: ${assistance.reason}`,
                disabled: false,
            };
        case "unavailable":
            return {
                label: `Ask ${name}`,
                detail: assistance.reason,
                disabled: true,
            };
    }
}
