import { useSyncExternalStore } from "react";
import { entryKey } from "happy-desktop-state";
import type {
    ConversationEntry,
    HappyAgentPreviewsSnapshot,
    HappyAgentWorkspaceStore,
    HappyAgentTraceViewer,
} from "happy-desktop-state";
import type { ConversationInlinePages } from "happy-desktop-ui";

const EMPTY: HappyAgentPreviewsSnapshot = new Map();
const emptyGet = () => EMPTY;

export interface ConversationPreviewContext {
    readonly workspace: Pick<HappyAgentWorkspaceStore, "previews">;
    readonly platform: "desktop" | "web" | undefined;
    readonly externalOpen: (url: string) => void;
}

interface ConversationPreviews {
    readonly pages?: ConversationInlinePages["previews"];
    entriesSeen(viewer: HappyAgentTraceViewer, entryIds: ReadonlySet<string>): void;
}

/** One subscription for the conversation, fanned out to its preview rows as props. */
export function useConversationPreviews(input: {
    readonly workspace: Pick<HappyAgentWorkspaceStore, "previews">;
    readonly entries: readonly ConversationEntry[];
    readonly onOpen: (previewId: string) => void;
}): ConversationPreviews {
    const ids = input.entries.flatMap((entry) => {
        if (entry.kind !== "agentActivity" || entry.activity.kind !== "tool") return [];
        const presentation = entry.activity.tool.presentation;
        return presentation?.type === "preview" ? [presentation.previewId] : [];
    });
    // Construction is inert. Keeping this binding when the next chat has no
    // previews lets its visibility report retire the previous chat's IDs.
    const store = input.workspace.previews();
    const states = useSyncExternalStore(
        store?.subscribe ?? (() => () => undefined),
        store?.get ?? emptyGet,
        store?.get ?? emptyGet,
    );
    return {
        ...(store && ids.length > 0 ? { pages: { states, previewOpen: input.onOpen } } : {}),
        entriesSeen(viewer, entryIds) {
            store?.previewVisibilityUpdate(
                viewer,
                input.entries.flatMap((entry) => {
                    if (
                        !entryIds.has(entryKey(entry)) ||
                        entry.kind !== "agentActivity" ||
                        entry.activity.kind !== "tool"
                    )
                        return [];
                    const presentation = entry.activity.tool.presentation;
                    return presentation?.type === "preview" ? [presentation.previewId] : [];
                }),
            );
        },
    };
}

/** The host's external-browser capability is reused without a native-shell change. */
export function conversationPreviewOpen(
    input: ConversationPreviewContext & { readonly previewId: string },
): void {
    const store = input.workspace.previews();
    if (!store) return;
    // A browser only allows a new tab during this click, before the API awaits.
    // The blank document has no remote content and loses its opener immediately.
    const target = input.platform === "desktop" ? undefined : window.open("about:blank", "_blank");
    if (input.platform !== "desktop" && !target) {
        store.previewOpenBlock(input.previewId);
        return;
    }
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
