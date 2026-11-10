import type {
    ConversationQuickReplies,
    HappyAgentConversationSnapshot,
    HappyAgentWorkspaceStore,
} from "happy-desktop-state";
import type { ConversationChatUi } from "happy-desktop-ui";

/**
 * How one conversation draws and answers its chat UI: the clicks, replies,
 * and default model its snapshot holds, and the one way a click or a
 * suggested reply leaves this window. A conversation that takes no message
 * takes no click.
 */
export function happyAgentChatUi(input: {
    readonly conversation: HappyAgentConversationSnapshot;
    readonly workspace: HappyAgentWorkspaceStore;
    /** The reader may write into this conversation now. */
    readonly writable: boolean;
    /** Reads current transport health when a Happy Agent-backed action is invoked. */
    readonly online: () => boolean;
}): ConversationChatUi {
    const { conversation, workspace } = input;
    return {
        pending: conversation.uiPending,
        errors: conversation.uiErrors,
        granted: conversation.uiGranted,
        quickRepliesSent: conversation.quickRepliesSent,
        defaultModel: conversation.uiDefaultModel,
        ...(input.writable
            ? {
                  onAction: workspace.uiAction,
                  onQuickReply: (replies: ConversationQuickReplies, index: number) => {
                      // The store puts a refused send up beside the transcript.
                      workspace.quickReplySend(replies, index).catch(() => undefined);
                  },
              }
            : {}),
        onMediaOpen: (messageId, index) => {
            if (input.online()) workspace.toolImageOpen(messageId, index);
        },
    };
}
