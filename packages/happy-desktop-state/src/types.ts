export type MessageAudience = "people" | "agents";

/**
 * How a message sent while the agent is working reaches it. `steer` is taken at
 * the run's next inference boundary, after the current response and its tool
 * calls; `queue` waits for the run to finish and starts the next one. To an
 * idle agent the two are the same: a run starts.
 */
export type MessageDelivery = "steer" | "queue";

export type AgentTurnTraceKind =
    | "reasoning"
    | "response"
    | "tool"
    | "subagent"
    | "terminal"
    | "status";
export type AgentTurnTraceEntryStatus = "running" | "complete" | "failed";
export type AgentTurnStatus = "pending" | "running" | "complete" | "failed";

export interface AgentTurnSubagentSummary {
    readonly id: string;
    readonly depth: number;
    readonly description: string;
    readonly status:
        | "idle"
        | "queued"
        | "running"
        | "completed"
        | "aborted"
        | "suspended"
        | "error";
    readonly latestText?: string;
    readonly startedAt: number;
    readonly totalTokens: number;
}

export interface AgentTurnBackgroundTerminalSummary {
    readonly id: string;
    readonly command: string;
    readonly cwd: string;
    readonly startedAt: number;
}

export interface AgentTurnTraceEntrySummary {
    readonly id: string;
    readonly kind: AgentTurnTraceKind;
    readonly title: string;
    readonly detail?: string;
    readonly status: AgentTurnTraceEntryStatus;
    readonly occurredAt: number;
    readonly completedAt?: number;
}

export interface AgentTurnTraceLatest {
    readonly kind: AgentTurnTraceKind;
    readonly title: string;
    readonly detail?: string;
    readonly occurredAt: number;
}

export interface AgentTurnTraceSummary {
    readonly turnId: string;
    readonly agentUserId: string;
    readonly status: AgentTurnStatus;
    readonly startedAt?: string;
    readonly completedAt?: string;
    readonly latest?: AgentTurnTraceLatest;
    readonly entryCount: number;
    readonly finalTextOffset?: number;
    readonly toolCallCount?: number;
    readonly totalTokens?: number;
    readonly subagents: readonly AgentTurnSubagentSummary[];
    readonly backgroundTerminals: readonly AgentTurnBackgroundTerminalSummary[];
}

export class UserError extends Error {
    constructor(
        message: string,
        readonly code?: string,
        readonly cause?: unknown,
    ) {
        super(message, { cause });
        this.name = "UserError";
    }
}
