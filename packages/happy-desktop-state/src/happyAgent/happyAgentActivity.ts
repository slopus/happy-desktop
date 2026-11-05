import type { ConversationFailureKind } from "../conversation/conversationEntry.js";
import type { HappyAgentActionResult } from "./happyAgentSupport.js";
import type { HappyAgentThinkingLevel } from "./happyAgentTypes.js";

/**
 * Where the reader asked for a new conversation. `workspace` is any control
 * inside an open project or worktree: the tab strip's +, the empty group's
 * new-session button, or the first message typed into an empty group.
 */
export type HappyAgentConversationSource = "workspace" | "command_palette" | "shortcut" | "voice";

/** The model a conversation started on or a message was sent with, as the host names it. */
export interface HappyAgentActivityModel {
    /** The catalog provider's `type` (`claude`, `codex`, `bedrock`, …). */
    readonly providerType?: string;
    readonly modelId?: string;
    /** Absent when the session runs at its model's default effort. */
    readonly effort?: HappyAgentThinkingLevel;
}

/** Who a message went to, and how far below a top-level conversation it sits. */
export interface HappyAgentActivityAddress {
    readonly target: "chief_of_staff" | "bot" | "session";
    /** The addressed bot's `systemKey`; null for the reader's own bots and any other conversation. */
    readonly botSystemKey: string | null;
    /**
     * 0 for a bot's own conversation or any project session, 1 for a task a
     * bot delegated, 2 for that task's own subtask; null when the conversation
     * is not in the list.
     */
    readonly taskDepth: number | null;
}

/**
 * One reader-initiated act a workspace completed or failed, reported to its
 * owner. Only enums, counts, and host-reported model identifiers: never a
 * name, path, or any text the reader wrote.
 */
export type HappyAgentActivity =
    | {
          readonly kind: "conversationCreated";
          readonly source: HappyAgentConversationSource;
          readonly model: HappyAgentActivityModel;
      }
    | (HappyAgentActivityAddress & {
          readonly kind: "messageSent";
          /** `new_session` is the message that started its conversation. */
          readonly source: "chat" | "new_session" | "voice";
          readonly model: HappyAgentActivityModel;
          readonly hasAttachment: boolean;
          /** Sent while the conversation's agent was still working. */
          readonly steering: boolean;
      })
    | {
          readonly kind: "projectAdded";
          readonly source: "open_folder" | "clone_github";
          readonly result: HappyAgentActionResult;
      }
    | { readonly kind: "workspaceCreated"; readonly result: HappyAgentActionResult }
    | { readonly kind: "taskCreated"; readonly result: HappyAgentActionResult }
    | {
          readonly kind: "failureActionClicked";
          /** Retry, Switch to another account, New chat, or Ask Chief of Staff. */
          readonly action: "retry" | "switch" | "newChat" | "assistance";
          /** The failure's typed kind; absent for a failure that came without one. */
          readonly failure?: ConversationFailureKind;
      }
    | {
          readonly kind: "botCreated";
          readonly source: "sidebar" | "voice";
          readonly result: HappyAgentActionResult;
      };
