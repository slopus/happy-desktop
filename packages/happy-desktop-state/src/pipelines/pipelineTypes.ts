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

/** Whether a run in this state can still be aborted. */
export function pipelineRunAbortable(state: PipelineRunState): boolean {
    return state === "queued" || state === "running";
}
