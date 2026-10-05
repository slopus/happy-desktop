import type { HappyAgentWorkspaceStore } from "../happyAgent/happyAgentWorkspaceStore.js";

/** Window-owned composition. Connections are namespaced; no daemon URLs or credentials. */
export interface GptLiveDesktopConnection {
    readonly id: string;
    readonly name: string;
    readonly online: boolean;
    readonly workspace?: HappyAgentWorkspaceStore;
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
      };

export interface GptLiveDesktopSource {
    get(): {
        readonly activeConnectionId: string | null;
        readonly connections: readonly GptLiveDesktopConnection[];
    };
    /** Directory/focus changes only. The call additionally retains each materialized workspace. */
    subscribe(listener: () => void): () => void;
    targetOpen(target: GptLiveNavigationTarget): void | Promise<void>;
}
