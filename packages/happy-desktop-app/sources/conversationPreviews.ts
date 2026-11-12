import { useSyncExternalStore } from "react";
import type {
    ConversationEntry,
    HappyAgentPreviewsSnapshot,
    HappyAgentWorkspaceStore,
} from "happy-desktop-state";
import type { ConversationInlinePages } from "happy-desktop-ui";

const EMPTY: HappyAgentPreviewsSnapshot = new Map();
const emptyGet = () => EMPTY;

/** One subscription for the conversation, fanned out to its preview rows as props. */
export function useConversationPreviews(input: {
    readonly workspace: HappyAgentWorkspaceStore;
    readonly entries: readonly ConversationEntry[];
    readonly onOpen: (previewId: string) => void;
}): ConversationInlinePages["previews"] {
    const ids = input.entries.flatMap((entry) => {
        if (entry.kind !== "agentActivity" || entry.activity.kind !== "tool") return [];
        const presentation = entry.activity.tool.presentation;
        return presentation?.type === "preview" ? [presentation.previewId] : [];
    });
    const store = ids.length > 0 ? input.workspace.previews() : undefined;
    const states = useSyncExternalStore(
        (listener) => store?.subscribe(listener, ids) ?? (() => undefined),
        store?.get ?? emptyGet,
        store?.get ?? emptyGet,
    );
    return store ? { states, previewOpen: input.onOpen } : undefined;
}

/** The host's external-browser capability is reused without a native-shell change. */
export function conversationPreviewOpen(input: {
    readonly workspace: HappyAgentWorkspaceStore;
    readonly previewId: string;
    readonly platform: "desktop" | "web" | undefined;
    readonly externalOpen: (url: string) => void;
}): void {
    const store = input.workspace.previews();
    if (!store) return;
    // A browser only allows a new tab during this click, before the API awaits.
    // The blank document has no remote content and loses its opener immediately.
    const target = input.platform === "desktop" ? undefined : window.open("about:blank", "_blank");
    if (target) target.opener = null;
    void store.previewLaunch(input.previewId).then(
        (url) => {
            if (target) {
                if (!target.closed) target.location.replace(url);
            } else input.externalOpen(url);
        },
        // The owning store already exposes the failure beside Open preview.
        () => target?.close(),
    );
}
