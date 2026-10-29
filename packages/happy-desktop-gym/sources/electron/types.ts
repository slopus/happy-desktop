import type { ChildProcess } from "node:child_process";

export type GymProfile = "smoke" | "realistic" | "stress";

export type GymWorkloadName =
    | "hidden-window"
    | "background-drafts"
    | "public-repository"
    | "boot"
    | "catalog-switch"
    | "long-transcript"
    | "long-chat-scroll"
    | "session-switch-load"
    | "file-switch-warm"
    | "highlight-warm"
    | "changed-files-warm"
    | "panel-file-edit"
    | "streaming"
    | "mixed-replay"
    | "memory-idle"
    | "window-edge-resize"
    | "archive-reconcile"
    | "sidebar-drag"
    | "stop-shimmer"
    | "nested-row-menus"
    | "section-create"
    | "mobile-direct-experiment"
    | "jump-shimmer"
    | "new-work-reuse"
    | "row-removal"
    | "sidebar-read-ahead"
    | "window-zoom"
    | "all";

export interface GymTargetCounts {
    readonly totalProjects: number;
    readonly regularProjects: number;
    readonly totalWorktrees: number;
    readonly readyWorktrees: number;
    readonly archivedWorktrees: number;
    readonly sessions: number;
    readonly primarySessions: number;
    readonly subagentShapedSessions: number;
    readonly turns: number;
    /** Durable counts are observed, not host-snapshot invariants. */
    readonly messageRange: readonly [number, number];
    readonly fileCount: number;
    readonly changedFileCount: number;
    readonly largeFileBytes: number;
    readonly largeFileLines: number;
}

export interface GymSeedPlan {
    readonly projectWorktreeDistribution: readonly number[];
    readonly historySessions: number;
    readonly historyTurnsPerSession: number;
    readonly clusterSessionCount: number;
    readonly clusterTurnsPerSession: number;
    readonly longChatSessionCount: number;
    readonly longChatTurnsPerSession: number;
    readonly longChatResponseLines: number;
    readonly longTranscriptLines: number;
    readonly toolHeavyTurns: number;
    readonly exactSubagentRows: false;
    readonly limitation: string;
}

export interface GymDurableHostSnapshot {
    readonly messages: number;
}

export interface GymManifest {
    readonly schemaVersion: 1;
    readonly datasetVersion: string;
    readonly profile: GymProfile;
    readonly label: string;
    readonly target: GymTargetCounts;
    /** Measured local-host scale; it is informational until a real prepare observes it. */
    readonly hostSnapshot: GymDurableHostSnapshot;
    readonly seed: GymSeedPlan;
    /** Optional, additive real repository fixture; all histories use public Agent APIs. */
    readonly publicRepository?: {
        readonly commit: string;
        readonly source: string;
        readonly checkout: string;
        readonly trackedFiles: number;
        readonly projectId: string;
        readonly sessionIds: readonly string[];
    };
}

export interface GymRunPaths {
    readonly workspaceRoot: string;
    readonly root: string;
    /** The isolated Happy root passed to the daemon as `HAPPY_HOME_DIR`. */
    readonly happyHome: string;
    readonly home: string;
    readonly tmp: string;
    readonly projects: string;
    readonly workspaces: string;
    /** `<happyHome>/agent`, containing only this run's daemon state. */
    readonly agentHome: string;
    readonly socketPath: string;
    readonly tokenPath: string;
    readonly electronUserData: string;
    /**
     * The actual ready worktree mounted as `/workspace` for JustBash. It is
     * selected after Happy Agent creates the worktrees and persisted with the run so
     * tool mutations exercise a managed checkout rather than a fixture copy.
     */
    readonly happyAgentWorkspacePath: string;
    readonly bin: string;
    readonly artifacts: string;
    readonly marker: string;
    readonly manifest: string;
    readonly inferenceLog: string;
    readonly streamLog: string;
    readonly cluster: string;
}

export interface GymOwnerMarker {
    readonly kind: "happy-desktop-gym-run";
    readonly schemaVersion: 1;
    readonly runId: string;
    readonly profile: GymProfile;
    readonly createdAt: string;
    readonly artifactDirectory?: string;
}

export interface GymProject {
    readonly id: string;
    readonly name: string;
    readonly path: string;
    readonly worktreeIds: readonly string[];
}

export interface GymCatalogSnapshot {
    readonly projectCount: number;
    readonly worktreeCount: number;
    readonly readyWorktreeCount: number;
    readonly archivedWorktreeCount: number;
    /** Active Happy Agent conversations visible through desktop bootstrap. */
    readonly sessionCount: number;
}

export interface GymFixtureCounts {
    /** Aggregate regular-repository files; worktrees share this Git shape. */
    readonly fileCount: number;
    /** Aggregate `git status` records in the seeded working trees. */
    readonly changedFileCount: number;
    /** UTF-8 bytes in the large text fixtures in one copy of each repository. */
    readonly largeFileBytes: number;
    /** Newline-delimited lines in the large text fixtures in one copy of each repository. */
    readonly largeFileLines: number;
}

export interface GymDurableCounts {
    readonly messages: number;
    readonly sessions: number;
    readonly turns: number;
}

export interface GymInferenceRequest {
    readonly context: unknown;
    readonly modelId: string;
    readonly options: Record<string, unknown>;
    readonly providerSessionGeneration: number;
    readonly providerId: string;
}

export type GymContentBlock =
    | { readonly type: "text"; readonly text: string }
    | { readonly type: "thinking"; readonly thinking: string }
    | {
          readonly type: "toolCall";
          readonly name: string;
          readonly arguments: Record<string, unknown>;
      };

export interface GymInferenceResponse {
    readonly content: readonly GymContentBlock[];
    readonly compactionContext?: unknown;
    readonly compactionSummary?: string;
    readonly stopReason?: string;
    readonly usage?: Record<string, unknown>;
    readonly contextTokens?: number;
    readonly responseModel?: string;
    readonly errorMessage?: string;
    readonly providerError?: Record<string, unknown>;
    readonly delayMs?: number;
    readonly completionDelayMs?: number;
    readonly textDeltaChunkSize?: number;
    readonly textDeltaDelayMs?: number;
    readonly thinkingDeltaChunkSize?: number;
    readonly thinkingDeltaDelayMs?: number;
    readonly toolCallDeltaDelayMs?: number;
}

export interface GymInferenceServer {
    readonly url: string;
    readonly token: string;
    start(): Promise<void>;
    stop(): Promise<void>;
}

export interface HappyAgentRuntime {
    readonly command: string;
    readonly environment: Record<string, string>;
    readonly socketPath: string;
    readonly tokenPath: string;
    readonly token: string;
    readonly process?: ChildProcess;
    start(): Promise<void>;
    stop(): Promise<void>;
}

export interface GymProfilerArtifactReference {
    readonly manifestPath: string;
    readonly reportPath: string;
    readonly metricsPath: string;
    readonly reactBackendProfilePaths: readonly string[];
    readonly tracePath: string;
}

export interface GymScenarioMark {
    readonly elapsedMs: number;
    readonly name: string;
    readonly timestamp: string;
}

export interface ElectronRunResult {
    readonly workload: GymWorkloadName;
    readonly startedAt: string;
    readonly finishedAt: string;
    readonly samples: readonly GymMeasurement[];
    readonly artifacts: readonly string[];
}

export interface GymMeasurement {
    readonly startedAt: string;
    readonly finishedAt: string;
    readonly name: string;
    readonly durationMs: number;
    readonly marks: readonly GymScenarioMark[];
    readonly profilerArtifacts: readonly GymProfilerArtifactReference[];
    readonly details?: Readonly<Record<string, unknown>>;
}

export interface GymRunSummary {
    readonly root: string;
    readonly profile: GymProfile;
    readonly manifest: GymManifest;
    readonly catalog: GymCatalogSnapshot;
    readonly fixture: GymFixtureCounts;
    readonly history: {
        readonly seededSessions: number;
        readonly seededTurns: number;
        readonly clusterWorkspaceId?: string;
        readonly clusterSessionIds: readonly string[];
        readonly durableCounts: GymDurableCounts;
        readonly persistedAfterRestart: boolean;
        readonly streamArtifact: string;
    };
    readonly electron?: ElectronRunResult;
}
