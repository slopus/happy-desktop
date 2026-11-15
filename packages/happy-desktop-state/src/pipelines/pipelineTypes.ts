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
    | { readonly type: "null" }
    /** A pointer into the definition, such as `#/input`. */
    | { readonly type: "ref"; readonly ref: string };

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

/** Who published a version. */
export type PipelineAuthor =
    | { readonly kind: "agent"; readonly agentId: string }
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
