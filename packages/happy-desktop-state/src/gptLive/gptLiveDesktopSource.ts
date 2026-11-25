import type { HappyAgentModelStore } from "../happyAgent/happyAgentModelStore.js";
import type { HappyAgentWorkspaceStore } from "../happyAgent/happyAgentWorkspaceStore.js";

/** Window-owned composition. Connections are namespaced; no daemon URLs or credentials. */
export interface GptLiveDesktopConnection {
    readonly id: string;
    readonly name: string;
    /** The agent hosting the call, or another one the window reaches. */
    readonly kind: "local" | "remote";
    readonly online: boolean;
    readonly workspace?: HappyAgentWorkspaceStore;
    /** The models this connection's session pickers offer. */
    readonly models?: HappyAgentModelStore;
}

export type GptLiveNavigationTarget =
    | {
          readonly kind: "project";
          readonly connectionId: string;
          readonly projectId: string;
          readonly groupId: string;
      }
    | {
          readonly kind: "workspace";
          readonly connectionId: string;
          readonly projectId: string;
          readonly workspaceId: string;
          readonly groupId: string;
      }
    | {
          readonly kind: "session";
          readonly connectionId: string;
          readonly groupId: string;
          readonly sessionId: string;
      }
    | {
          readonly kind: "bot";
          readonly connectionId: string;
          readonly groupId: string;
          readonly sessionId: string;
          readonly botId: string;
      }
    | {
          readonly kind: "task";
          readonly connectionId: string;
          readonly groupId: string;
          readonly sessionId: string;
          readonly taskId: string;
      };

export interface GptLiveDesktopSource {
    get(): {
        readonly activeConnectionId: string | null;
        readonly connections: readonly GptLiveDesktopConnection[];
    };
    /** Directory/focus changes only. The call additionally retains each materialized workspace. */
    subscribe(listener: () => void): () => void;
    targetOpen(target: GptLiveNavigationTarget): void | Promise<void>;
    /**
     * Resolves once the window has painted what it was just told, so a voice
     * highlight is on screen before the hold that follows it starts counting.
     * Absent outside a browser, where there is nothing to paint.
     */
    paint?(): Promise<void>;
}
