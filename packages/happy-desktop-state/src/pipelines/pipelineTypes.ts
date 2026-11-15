import type { UserError } from "../types.js";

/*
 * Pipelines on Happy Cloud: a fixed, versioned graph of work the cluster runs
 * to completion. Desktop reads them and nothing else; agents author and
 * trigger them. Every shape the cluster's `/v0/pipelines` routes answer with
 * is read here, in one place, so a change to that contract is one edit.
 */

/** What one node does: Monty Python, a model with tools, or a child run of another pipeline. */
export type PipelineNodeKind = "code" | "agent" | "pipeline";

/** Which outcome of its source an edge is taken on. */
export type PipelineEdgeOutcome = "success" | "failure";

/** The JSON Schema subset a pipeline's input and its nodes' inputs and outputs are written in. */
export type PipelineSchema =
    | {
          readonly type: "object";
          readonly nullable: boolean;
          readonly properties: readonly PipelineSchemaProperty[];
      }
    | { readonly type: "array"; readonly nullable: boolean; readonly items: PipelineSchema }
    | {
          readonly type: "string" | "number" | "integer" | "boolean";
          readonly nullable: boolean;
          /** The only values it takes, when it is an enumeration. */
          readonly values: readonly PipelineSchemaLiteral[] | null;
      }
    | { readonly type: "null" };

export type PipelineSchemaLiteral = string | number | boolean | null;

export interface PipelineSchemaProperty {
    readonly name: string;
    readonly schema: PipelineSchema;
    readonly required: boolean;
}

export type PipelineAccess = "read" | "write";

export interface PipelineGrant {
    readonly id: string;
    readonly access: PipelineAccess;
}

/** What a pipeline, or one node within its ceiling, may reach. Everything else is denied. */
export interface PipelinePermissions {
    readonly tools: readonly string[];
    readonly vaults: readonly PipelineGrant[];
    readonly secrets: readonly string[];
    readonly repositories: readonly PipelineGrant[];
    /** Agents it may send a message to. */
    readonly agents: readonly string[];
    /** Pipelines it may run as a child. */
    readonly pipelines: readonly string[];
    readonly egressHosts: readonly string[];
    readonly compute: {
        readonly pools: readonly string[];
        readonly computers: readonly string[];
        readonly maxLeases: number | null;
    } | null;
}

/** A computer a node acquires under a lease name, from a pool or by ID. */
export type PipelineLeaseAcquire =
    | { readonly name: string; readonly pool: string }
    | { readonly name: string; readonly computer: string };

/** The computers a node holds: acquired here, handed down by predecessors, and handed on. */
export interface PipelineCompute {
    readonly acquire: readonly PipelineLeaseAcquire[];
    readonly use: readonly string[];
    readonly pass: readonly string[];
}

interface PipelineNodeShared {
    readonly id: string;
    /** Absent where the definition leaves it to the edge that feeds the node. */
    readonly input: PipelineSchema | null;
    readonly output: PipelineSchema | null;
    /** Null for a node that may compute and nothing else. */
    readonly permissions: PipelinePermissions | null;
    readonly compute: PipelineCompute | null;
    readonly timeoutSeconds: number;
    /** How several incoming edges combine; meaningless with one. */
    readonly join: "all" | "any";
}

export type PipelineNode = PipelineNodeShared &
    (
        | { readonly kind: "code"; readonly source: string }
        | {
              readonly kind: "agent";
              readonly model: string | null;
              readonly effort: string | null;
              readonly instructions: string;
          }
        | { readonly kind: "pipeline"; readonly pipelineId: string }
    );

export interface PipelineEdge {
    readonly from: string;
    readonly to: string;
    readonly on: PipelineEdgeOutcome;
}

export type PipelineConcurrencyMode = "independent" | "supersede" | "queue";

/** One immutable version's graph and the rules it runs by. */
export interface PipelineDefinition {
    readonly input: PipelineSchema;
    readonly concurrency: {
        /** A template over the input; one group for the whole pipeline when null. */
        readonly group: string | null;
        readonly mode: PipelineConcurrencyMode;
        readonly batch: boolean;
    };
    /** Agents or bots that may run it. */
    readonly triggerAgents: readonly string[];
    /** The ceiling every node's permissions sit under. */
    readonly permissions: PipelinePermissions;
    readonly root: string;
    /** In the order the definition lists them. */
    readonly nodes: readonly PipelineNode[];
    readonly edges: readonly PipelineEdge[];
}

/** One version's definition, as far as it has been read. Versions never change, so a read one is kept. */
export type PipelineDefinitionLoad =
    | { readonly state: "loading" }
    | { readonly state: "loaded"; readonly definition: PipelineDefinition }
    | { readonly state: "failed"; readonly error: UserError };

/** Who published a version: a member, or an agent and the member it acted for, if any. IDs only. */
export type PipelineAuthor =
    | { readonly kind: "agent"; readonly agentId: string; readonly userId: string | null }
    | { readonly kind: "user"; readonly userId: string };

/** One entry in a pipeline's history: a commit of its definition. */
export interface PipelineVersion {
    readonly number: number;
    readonly digest: string;
    readonly parent: number | null;
    readonly message: string;
    readonly author: PipelineAuthor | null;
    readonly createdAt: number;
}

export type PipelineRunState =
    | "queued"
    | "running"
    | "succeeded"
    | "failed"
    | "aborted"
    | "superseded";

/** The newest run of a pipeline, as its list row shows it. */
export interface PipelineRunSummary {
    readonly id: string;
    readonly state: PipelineRunState;
    readonly createdAt: number;
    readonly endedAt: number | null;
}

/** One row of the pipelines list. */
export interface PipelineSummary {
    readonly id: string;
    readonly name: string;
    readonly description: string | null;
    readonly headVersion: number;
    readonly enabled: boolean;
    readonly lastRun: PipelineRunSummary | null;
}

/** One pipeline as its page reads it, with its head version's number. */
export interface PipelineDetail {
    readonly id: string;
    readonly name: string;
    readonly description: string | null;
    readonly enabled: boolean;
    readonly head: PipelineVersion;
}

/** How a run came to be: an agent's `run_pipeline`, or a `pipeline` node of a parent run. */
export type PipelineRunTrigger =
    | { readonly kind: "agent"; readonly agentId: string }
    | { readonly kind: "pipeline"; readonly runId: string; readonly nodeId: string };

/** One entry in a pipeline's runs, newest first. */
export interface PipelineRunEntry {
    readonly id: string;
    readonly version: number;
    readonly state: PipelineRunState;
    readonly trigger: PipelineRunTrigger | null;
    readonly parentRunId: string | null;
    readonly createdAt: number;
    readonly startedAt: number | null;
    readonly endedAt: number | null;
}

/** One run among every pipeline's runs: its entry, and which pipeline it ran. */
export interface PipelineRunListEntry extends PipelineRunEntry {
    readonly pipelineId: string;
    readonly pipelineName: string;
    /** Its pipeline was archived: the run still reads, the pipeline's page does not. */
    readonly pipelineArchived: boolean;
}

/**
 * A page of runs read again on top of what is already kept, newest first. A
 * reader who paged past the first page keeps the older runs they read, below
 * the fresh page; one who did not takes the page as it is.
 */
export function pipelineRunsMerge<T extends PipelineRunEntry>(
    previous: readonly T[],
    page: readonly T[],
    pageComplete: boolean,
): T[] {
    if (pageComplete) return [...page];
    const fresh = new Set(page.map((run) => run.id));
    const oldest = page.at(-1)?.createdAt ?? Number.POSITIVE_INFINITY;
    return [...page, ...previous.filter((run) => !fresh.has(run.id) && run.createdAt <= oldest)];
}

export type PipelineNodeRunState =
    | "pending"
    | "running"
    | "succeeded"
    | "failed"
    | "skipped"
    | "aborted";

/** What a node said about itself last: a line of text and, optionally, how far along it is. */
export interface PipelineStatusLine {
    readonly text: string;
    /** From 0 to 1, when the node said. */
    readonly progress: number | null;
    readonly at: number;
}

/** One node's execution inside a run. Values are JSON as the node produced or received them. */
export interface PipelineNodeRun {
    readonly nodeId: string;
    readonly kind: PipelineNodeKind;
    readonly state: PipelineNodeRunState;
    readonly status: PipelineStatusLine | null;
    /** The last 50, oldest first as the server keeps them. */
    readonly statuses: readonly PipelineStatusLine[];
    readonly input: unknown;
    readonly output: unknown;
    readonly failure: { readonly code: string; readonly message: string } | null;
    /** The agent that ran an `agent` node. */
    readonly agentId: string | null;
    /** The child run a `pipeline` node started. */
    readonly childRunId: string | null;
    readonly startedAt: number | null;
    readonly endedAt: number | null;
    /**
     * What an agent node's agent spent so far, one entry per provider and
     * model, in that order; null on other nodes and before the first inference.
     */
    readonly usage: readonly PipelineModelUsage[] | null;
}

/** Tokens and cost one model spent on one node. */
export interface PipelineModelUsage {
    readonly provider: string;
    /** The model's full ID, provider included, as definitions name it: `openai/gpt-6.1-terra`. */
    readonly model: string;
    readonly input: number;
    readonly output: number;
    readonly cacheRead: number;
    readonly cacheWrite: number;
    readonly reasoning: number;
    /** In US dollars; null when the provider did not price it. */
    readonly costUsd: number | null;
}

/** A named computer a run holds, handed from node to node. */
export interface PipelineLease {
    readonly name: string;
    readonly computerId: string;
    /** The nodes holding it now. */
    readonly holders: readonly string[];
    readonly releasedAt: number | null;
}

/** One run, with every node's execution, its leases, and the child runs it started. */
export interface PipelineRun extends PipelineRunEntry {
    readonly pipelineId: string;
    readonly rootRunId: string;
    readonly group: string | null;
    readonly input: unknown;
    /** By node, the outputs of the leaves the run reached; null until it ends. */
    readonly result: { readonly outputs: Readonly<Record<string, unknown>> } | null;
    readonly nodes: readonly PipelineNodeRun[];
    readonly leases: readonly PipelineLease[];
    readonly childRunIds: readonly string[];
}

/**
 * A run beside the one on screen, its parent or a child, as far as a run page
 * shows it: what it runs, how it stands, and how far through its nodes it is.
 */
export interface PipelineRunRelative {
    readonly id: string;
    readonly pipelineId: string;
    readonly version: number;
    readonly state: PipelineRunState;
    readonly startedAt: number | null;
    readonly endedAt: number | null;
    /** Nodes that have ended, whatever their outcome. */
    readonly nodesEnded: number;
    readonly nodesRunning: number;
    /** The nodes its version defines; null until that version is read. */
    readonly nodesTotal: number | null;
    /** The newest status line among its running nodes. */
    readonly status: PipelineStatusLine | null;
}

/** Whether a run in this state can still be aborted. */
export function pipelineRunAbortable(state: PipelineRunState): boolean {
    return state === "queued" || state === "running";
}

/** Whether a run has reached the end it keeps: nothing about it changes after. */
export function pipelineRunEnded(state: PipelineRunState): boolean {
    return !pipelineRunAbortable(state);
}

/**
 * The runs a run's pipeline nodes made or joined, each once, oldest first. A
 * batch run several of its nodes joined is one run; a node's child shows from
 * the moment the node names it.
 */
export function pipelineRunChildIds(run: PipelineRun): string[] {
    return [
        ...new Set([
            ...run.childRunIds,
            ...run.nodes.flatMap((node) => (node.childRunId === null ? [] : [node.childRunId])),
        ]),
    ];
}

/** The runs a run page reads beside its own: its parent, then its children. */
export function pipelineRunRelativeIds(run: PipelineRun): string[] {
    return [
        ...new Set([
            ...(run.parentRunId === null ? [] : [run.parentRunId]),
            ...pipelineRunChildIds(run),
        ]),
    ];
}

/** A read run as a run page shows it beside another. */
export function pipelineRunRelativeOf(
    run: PipelineRun,
    nodesTotal: number | null,
): PipelineRunRelative {
    const running = run.nodes.filter((node) => node.state === "running");
    const status =
        running
            .flatMap((node) => (node.status === null ? [] : [node.status]))
            .sort((left, right) => right.at - left.at)[0] ?? null;
    return {
        id: run.id,
        pipelineId: run.pipelineId,
        version: run.version,
        state: run.state,
        startedAt: run.startedAt,
        endedAt: run.endedAt,
        nodesEnded: run.nodes.filter((node) => node.state !== "pending" && node.state !== "running")
            .length,
        nodesRunning: running.length,
        nodesTotal,
        status,
    };
}

/** Whether two reads of a relative show the same, so the first can stay. */
export function pipelineRunRelativeSame(
    left: PipelineRunRelative,
    right: PipelineRunRelative,
): boolean {
    return (
        left.id === right.id &&
        left.pipelineId === right.pipelineId &&
        left.version === right.version &&
        left.state === right.state &&
        left.startedAt === right.startedAt &&
        left.endedAt === right.endedAt &&
        left.nodesEnded === right.nodesEnded &&
        left.nodesRunning === right.nodesRunning &&
        left.nodesTotal === right.nodesTotal &&
        left.status?.text === right.status?.text &&
        left.status?.progress === right.status?.progress &&
        left.status?.at === right.status?.at
    );
}

/** The nodes of a run that wait on one child run; several when they joined one batch run. */
export function pipelineRunChildNodes(run: PipelineRun, childRunId: string): PipelineNodeRun[] {
    return run.nodes.filter((node) => node.childRunId === childRunId);
}

/**
 * Which node's log a run page shows: the one the reader picked, else the one
 * working longest now, else the last one that failed, else the last one that ran.
 */
export function pipelineRunNodeShown(run: PipelineRun, nodeSelected: string | null): string | null {
    if (nodeSelected !== null) return nodeSelected;
    // The server lists nodes by id, so every pick is by time, ties by id.
    const byStart = (left: PipelineNodeRun, right: PipelineNodeRun) =>
        (left.startedAt ?? 0) - (right.startedAt ?? 0) || left.nodeId.localeCompare(right.nodeId);
    // The node working longest stays shown while others start beside it; a
    // run that already failed may still have one finishing.
    const running = run.nodes.filter((node) => node.state === "running").sort(byStart);
    if (running.length > 0) return running[0]!.nodeId;
    const ran = run.nodes.filter((node) => node.startedAt !== null).sort(byStart);
    return (
        ran.filter((node) => node.state === "failed").at(-1)?.nodeId ?? ran.at(-1)?.nodeId ?? null
    );
}

/**
 * One thing a node did, in the order it did it (§2.5). A command or tool call
 * is written as it starts and rewritten in place, under the same `seq`, as it
 * ends.
 */
export type PipelineLogEntry = { readonly seq: number; readonly at: number } & (
    | {
          /** A `print()` in a code node. */
          readonly kind: "output";
          readonly stream: "stdout" | "stderr";
          readonly text: string;
      }
    | {
          /** A shell command on a computer the node holds. */
          readonly kind: "command";
          readonly id: string;
          readonly command: string;
          readonly cwd: string | null;
          /** The lease it ran on. */
          readonly lease: string | null;
          readonly state: "running" | "exited" | "aborted";
          readonly exitCode: number | null;
          readonly durationMs: number | null;
          /** The last 64 KiB, so far while it runs. */
          readonly output: string;
          readonly outputTruncated: boolean;
      }
    | {
          /** `fetch()`, a granted tool, or an agent's tool call. */
          readonly kind: "tool";
          readonly id: string;
          readonly name: string;
          readonly summary: string;
          readonly state: "running" | "ok" | "error";
          readonly durationMs: number | null;
          readonly error: string | null;
      }
    | {
          /** What an agent node's model said. */
          readonly kind: "message";
          readonly text: string;
      }
    | {
          /** A status line the node set. */
          readonly kind: "status";
          readonly text: string;
          readonly progress: number | null;
      }
);

export type PipelineLogCommand = Extract<PipelineLogEntry, { kind: "command" }>;

/** One read of a node's log after a sequence number. */
export interface PipelineLogPage {
    readonly entries: readonly PipelineLogEntry[];
    /** What to read after next time. */
    readonly nextAfter: number;
    /** How many of the oldest entries the server let go. */
    readonly dropped: number;
    /** Entries already read that were rewritten since, such as a command that finished. */
    readonly changed: readonly PipelineLogEntry[];
}

/** Whether a command ended badly: aborted, or exited with anything but 0. */
export function pipelineLogCommandFailed(command: PipelineLogCommand): boolean {
    return command.state === "aborted" || (command.state === "exited" && command.exitCode !== 0);
}
