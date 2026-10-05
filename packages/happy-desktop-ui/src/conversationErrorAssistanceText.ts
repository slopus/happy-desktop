import type { ConversationErrorAssistance } from "happy-desktop-state";

/** Shared by the card and its exact virtual-row text geometry. */
export function conversationErrorAssistanceText(assistance: ConversationErrorAssistance): {
    readonly label: string;
    readonly detail?: string;
    readonly disabled: boolean;
} {
    switch (assistance.status) {
        case "ready":
            return { label: "Have Chief of Staff take care of it", disabled: false };
        case "pending":
            return { label: "Sending to Chief of Staff…", disabled: true };
        case "sent":
            return { label: "Open Chief of Staff conversation", disabled: false };
        case "failed":
            return {
                label: "Retry Chief of Staff handoff",
                detail: `Handoff failed: ${assistance.reason}`,
                disabled: false,
            };
        case "unavailable":
            return {
                label: "Have Chief of Staff take care of it",
                detail: assistance.reason,
                disabled: true,
            };
    }
}
