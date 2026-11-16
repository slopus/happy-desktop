import { UserError } from "../types.js";
import type {
    PipelineAuthor,
    PipelineCompute,
    PipelineDefinition,
    PipelineDefinitionLoad,
    PipelineDetail,
    PipelineEdge,
    PipelineGrant,
    PipelineLease,
    PipelineLeaseAcquire,
    PipelineLogEntry,
    PipelineLogPage,
    PipelineModelUsage,
    PipelineNode,
    PipelineNodeRun,
    PipelineNodeRunState,
    PipelinePermissions,
    PipelineRun,
    PipelineRunEntry,
    PipelineRunListEntry,
    PipelineRunState,
    PipelineRunSummary,
    PipelineRunTrigger,
    PipelineSchema,
    PipelineSchemaLiteral,
    PipelineStatusLine,
    PipelineSummary,
    PipelineVersion,
} from "./pipelineTypes.js";

/*
 * Readers for the cluster's pipeline routes. Each takes what a route answered
 * and returns the typed value, or undefined when the answer is not that shape.
 * This file and `pipelineTypes.ts` are the whole wire contract.
 */

type Fields = Record<string, unknown>;

function recordOf(value: unknown): Fields | undefined {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Fields)
        : undefined;
}

function textOrNull(value: unknown): string | null {
    return typeof value === "string" && value !== "" ? value : null;
}

function numberOrNull(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function texts(value: unknown): string[] {
    return Array.isArray(value)
        ? value.filter((entry): entry is string => typeof entry === "string")
        : [];
}

/** Reads every entry of a list that is the right shape, dropping the rest. */
function listOf<T>(value: unknown, read: (entry: unknown) => T | undefined): T[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry: unknown) => {
        const item = read(entry);
        return item === undefined ? [] : [item];
    });
}

const RUN_STATES: readonly PipelineRunState[] = [
    "queued",
    "running",
    "succeeded",
    "failed",
    "aborted",
    "superseded",
];

export function pipelineRunStateRead(value: unknown): PipelineRunState | undefined {
    return RUN_STATES.find((state) => state === value);
}

const TYPES = ["string", "number", "integer", "boolean", "object", "array", "null"] as const;
type SchemaTypeName = (typeof TYPES)[number];

function typeNameOf(value: unknown): SchemaTypeName | undefined {
    return TYPES.find((type) => type === value);
}

function literalOf(value: unknown): PipelineSchemaLiteral | undefined {
    return value === null ||
        typeof value === "string" ||
        typeof value === "boolean" ||
        (typeof value === "number" && Number.isFinite(value))
        ? value
        : undefined;
}

/** A type in the definition's schema subset; a `[type, "null"]` pair is nullable. */
export function pipelineSchemaRead(value: unknown): PipelineSchema | undefined {
    const schema = recordOf(value);
    if (!schema) return undefined;
    let nullable = false;
    let name: SchemaTypeName | undefined;
    if (Array.isArray(schema.type)) {
        if (schema.type.length !== 2 || schema.type[1] !== "null") return undefined;
        nullable = true;
        name = typeNameOf(schema.type[0]);
    } else name = typeNameOf(schema.type);
    if (name === undefined) return undefined;
    if (name === "null") return { type: "null" };
    if (name === "object") {
        const properties = recordOf(schema.properties) ?? {};
        const required = new Set(texts(schema.required));
        const read: PipelineSchema[] = [];
        const names = Object.keys(properties);
        for (const key of names) {
            const property = pipelineSchemaRead(properties[key]);
            if (!property) return undefined;
            read.push(property);
        }
        return {
            type: "object",
            nullable,
            properties: names.map((key, index) => ({
                name: key,
                schema: read[index]!,
                required: required.has(key),
            })),
        };
    }
    if (name === "array") {
        const items = pipelineSchemaRead(schema.items);
        return items ? { type: "array", nullable, items } : undefined;
    }
    const values = Array.isArray(schema.enum) ? listOf(schema.enum, literalOf) : null;
    return { type: name, nullable, values };
}

function accessOf(value: unknown): PipelineGrant["access"] | undefined {
    return value === "read" || value === "write" ? value : undefined;
}

function grantRead(value: unknown): PipelineGrant | undefined {
    const grant = recordOf(value);
    const access = accessOf(grant?.access);
    return grant && typeof grant.id === "string" && access ? { id: grant.id, access } : undefined;
}

export function pipelinePermissionsRead(value: unknown): PipelinePermissions {
    const permissions = recordOf(value) ?? {};
    const compute = recordOf(permissions.compute);
    return {
        tools: texts(permissions.tools),
        vaults: listOf(permissions.vaults, grantRead),
        secrets: texts(permissions.secrets),
        repositories: listOf(permissions.repositories, grantRead),
        agents: texts(permissions.agents),
        pipelines: texts(permissions.pipelines),
        egressHosts: texts(recordOf(permissions.egress)?.hosts),
        compute: compute
            ? {
                  pools: texts(compute.pools),
                  computers: texts(compute.computers),
                  maxLeases: numberOrNull(compute.maxLeases),
              }
            : null,
    };
}

function acquireRead(value: unknown): PipelineLeaseAcquire | undefined {
    const acquire = recordOf(value);
    if (!acquire || typeof acquire.name !== "string") return undefined;
    if (typeof acquire.pool === "string") return { name: acquire.name, pool: acquire.pool };
    if (typeof acquire.computer === "string")
        return { name: acquire.name, computer: acquire.computer };
    return undefined;
}

function computeRead(value: unknown): PipelineCompute | null {
    const compute = recordOf(value);
    if (!compute) return null;
    return {
        acquire: listOf(compute.acquire, acquireRead),
        use: texts(compute.use),
        pass: texts(compute.pass),
    };
}

/** Optional on the wire; present but unreadable fails the whole definition. */
function optionalSchema(value: unknown): PipelineSchema | null | undefined {
    return value === undefined ? null : pipelineSchemaRead(value);
}

const DEFAULT_TIMEOUT_SECONDS = 3600;

function nodeRead(id: string, value: unknown): PipelineNode | undefined {
    const node = recordOf(value);
    if (!node) return undefined;
    const input = optionalSchema(node.input);
    const output = optionalSchema(node.output);
    if (input === undefined || output === undefined) return undefined;
    const shared = {
        id,
        input,
        output,
        permissions:
            node.permissions === undefined ? null : pipelinePermissionsRead(node.permissions),
        compute: computeRead(node.compute),
        timeoutSeconds: numberOrNull(node.timeoutSeconds) ?? DEFAULT_TIMEOUT_SECONDS,
        join: node.join === "any" ? ("any" as const) : ("all" as const),
    };
    switch (node.kind) {
        case "code":
            return typeof node.source === "string"
                ? { ...shared, kind: "code", source: node.source }
                : undefined;
        case "agent":
            return {
                ...shared,
                kind: "agent",
                model: textOrNull(node.model),
                effort: textOrNull(node.effort),
                instructions: typeof node.instructions === "string" ? node.instructions : "",
            };
        case "pipeline":
            return typeof node.pipeline === "string"
                ? { ...shared, kind: "pipeline", pipelineId: node.pipeline }
                : undefined;
        default:
            return undefined;
    }
}

function edgeRead(value: unknown): PipelineEdge | undefined {
    const edge = recordOf(value);
    if (!edge || typeof edge.from !== "string" || typeof edge.to !== "string") return undefined;
    if (edge.on !== "success" && edge.on !== "failure") return undefined;
    return { from: edge.from, to: edge.to, on: edge.on };
}

/**
 * A version's definition. The cluster refuses to store one that does not
 * type-check, so anything unreadable here is a contract this client does not
 * know yet, and the whole definition is refused rather than half drawn.
 */
export function pipelineDefinitionRead(value: unknown): PipelineDefinition | undefined {
    const definition = recordOf(value);
    if (!definition || typeof definition.root !== "string") return undefined;
    const input = pipelineSchemaRead(definition.input);
    const nodesValue = recordOf(definition.nodes);
    if (!input || !nodesValue) return undefined;
    const nodes: PipelineNode[] = [];
    for (const [id, entry] of Object.entries(nodesValue)) {
        const node = nodeRead(id, entry);
        if (!node) return undefined;
        nodes.push(node);
    }
    if (!nodes.some((node) => node.id === definition.root)) return undefined;
    const ids = new Set(nodes.map((node) => node.id));
    const edges = listOf(definition.edges, edgeRead);
    if (edges.some((edge) => !ids.has(edge.from) || !ids.has(edge.to))) return undefined;
    const concurrency = recordOf(definition.concurrency) ?? {};
    return {
        input,
        concurrency: {
            group: textOrNull(concurrency.group),
            mode:
                concurrency.mode === "supersede" || concurrency.mode === "queue"
                    ? concurrency.mode
                    : "independent",
            batch: concurrency.batch === true,
        },
        triggerAgents: texts(recordOf(definition.triggers)?.agents),
        permissions: pipelinePermissionsRead(definition.permissions),
        root: definition.root,
        nodes,
        edges,
    };
}

const UNREADABLE = new UserError("This version is written in a form this app cannot read yet.");

/** A definition as its page holds it: read, or refused with the reason to show. */
export function pipelineDefinitionLoad(value: unknown): PipelineDefinitionLoad {
    const definition = pipelineDefinitionRead(value);
    return definition ? { state: "loaded", definition } : { state: "failed", error: UNREADABLE };
}

function authorRead(value: unknown): PipelineAuthor | null {
    const author = recordOf(value);
    if (author?.kind === "agent" && typeof author.agentId === "string")
        return { kind: "agent", agentId: author.agentId, userId: textOrNull(author.userId) };
    if (author?.kind === "user" && typeof author.userId === "string")
        return { kind: "user", userId: author.userId };
    return null;
}

export function pipelineVersionRead(value: unknown): PipelineVersion | undefined {
    const version = recordOf(value);
    const number = numberOrNull(version?.number);
    if (!version || number === null) return undefined;
    return {
        number,
        digest: typeof version.digest === "string" ? version.digest : "",
        parent: numberOrNull(version.parent),
        message: typeof version.message === "string" ? version.message : "",
        author: authorRead(version.author),
        createdAt: numberOrNull(version.createdAt) ?? 0,
    };
}

function runSummaryRead(value: unknown): PipelineRunSummary | null {
    const run = recordOf(value);
    const state = pipelineRunStateRead(run?.state);
    if (!run || typeof run.id !== "string" || !state) return null;
    return {
        id: run.id,
        state,
        createdAt: numberOrNull(run.createdAt) ?? 0,
        endedAt: numberOrNull(run.endedAt),
    };
}

/** `GET /v0/pipelines` → `{ pipelines: [...] }`. */
export function pipelineSummariesRead(answer: unknown): PipelineSummary[] {
    return listOf(recordOf(answer)?.pipelines, (value) => {
        const pipeline = recordOf(value);
        const head = numberOrNull(recordOf(pipeline?.head)?.number);
        if (!pipeline || typeof pipeline.id !== "string" || head === null) return undefined;
        return {
            id: pipeline.id,
            name: textOrNull(pipeline.name) ?? pipeline.id,
            description: textOrNull(pipeline.description),
            headVersion: head,
            enabled: pipeline.enabled !== false,
            lastRun: runSummaryRead(pipeline.lastRun),
        };
    });
}

/** `GET /v0/pipelines/:id` → `{ pipeline: { ..., head: { ...version, definition } } }`. */
export function pipelineDetailRead(
    answer: unknown,
): { readonly pipeline: PipelineDetail; readonly definition: unknown } | undefined {
    const pipeline = recordOf(recordOf(answer)?.pipeline);
    const head = pipelineVersionRead(pipeline?.head);
    if (!pipeline || typeof pipeline.id !== "string" || !head) return undefined;
    return {
        pipeline: {
            id: pipeline.id,
            name: textOrNull(pipeline.name) ?? pipeline.id,
            description: textOrNull(pipeline.description),
            enabled: pipeline.enabled !== false,
            head,
        },
        definition: recordOf(pipeline.head)?.definition,
    };
}

/** `GET /v0/pipelines/:id/versions` → `{ versions: [...] }`, newest first. */
export function pipelineVersionsRead(answer: unknown): PipelineVersion[] {
    return listOf(recordOf(answer)?.versions, pipelineVersionRead).sort(
        (left, right) => right.number - left.number,
    );
}

/** `GET /v0/pipelines/:id/versions/:number` → `{ version: { ..., definition } }`. */
export function pipelineVersionDefinitionRead(answer: unknown): unknown {
    return recordOf(recordOf(answer)?.version)?.definition;
}

function triggerRead(value: unknown): PipelineRunTrigger | null {
    const trigger = recordOf(value);
    // An agent the server no longer names (its agent removed) is still an agent's run.
    if (trigger?.kind === "agent") return { kind: "agent", agentId: textOrNull(trigger.agentId) };
    if (
        trigger?.kind === "pipeline" &&
        typeof trigger.runId === "string" &&
        typeof trigger.nodeId === "string"
    )
        return { kind: "pipeline", runId: trigger.runId, nodeId: trigger.nodeId };
    return null;
}

function runEntryRead(value: unknown): PipelineRunEntry | undefined {
    const run = recordOf(value);
    const state = pipelineRunStateRead(run?.state);
    const version = numberOrNull(run?.version);
    if (!run || typeof run.id !== "string" || !state || version === null) return undefined;
    return {
        id: run.id,
        version,
        state,
        trigger: triggerRead(run.trigger),
        parentRunId: textOrNull(run.parentRunId),
        createdAt: numberOrNull(run.createdAt) ?? 0,
        startedAt: numberOrNull(run.startedAt),
        endedAt: numberOrNull(run.endedAt),
    };
}

/** `GET /v0/pipelines/:id/runs?cursor=` → `{ runs: [...], nextCursor }`, newest first. */
export function pipelineRunsRead(answer: unknown): {
    readonly runs: PipelineRunEntry[];
    readonly nextCursor: string | null;
} {
    const page = recordOf(answer);
    return { runs: listOf(page?.runs, runEntryRead), nextCursor: textOrNull(page?.nextCursor) };
}

/**
 * `GET /v0/pipeline-runs?cursor=` → `{ runs: [...], nextCursor }`, newest first
 * across every pipeline, child runs and archived pipelines' runs included, each
 * a runs entry with its `pipelineId`, `pipelineName` and `pipelineArchived`.
 */
export function pipelineRunListRead(answer: unknown): {
    readonly runs: PipelineRunListEntry[];
    readonly nextCursor: string | null;
} {
    const page = recordOf(answer);
    return {
        runs: listOf(page?.runs, (value) => {
            const run = recordOf(value);
            const entry = runEntryRead(run);
            if (!run || !entry || typeof run.pipelineId !== "string") return undefined;
            return {
                ...entry,
                pipelineId: run.pipelineId,
                pipelineName: textOrNull(run.pipelineName) ?? run.pipelineId,
                pipelineArchived: run.pipelineArchived === true,
            };
        }),
        nextCursor: textOrNull(page?.nextCursor),
    };
}

const NODE_RUN_STATES: readonly PipelineNodeRunState[] = [
    "pending",
    "running",
    "succeeded",
    "failed",
    "skipped",
    "aborted",
];

function statusRead(value: unknown): PipelineStatusLine | undefined {
    const status = recordOf(value);
    if (!status || typeof status.text !== "string") return undefined;
    const progress = numberOrNull(status.progress);
    return {
        text: status.text,
        progress: progress === null ? null : Math.min(1, Math.max(0, progress)),
        at: numberOrNull(status.at) ?? 0,
    };
}

/** `{ [provider]: { [model]: { input, output, cacheRead, cacheWrite, reasoning, costUsd? } } }`. */
function usageRead(value: unknown): PipelineModelUsage[] | null {
    const providers = recordOf(value);
    if (!providers) return null;
    const count = (field: unknown) => {
        const number = numberOrNull(field);
        return number === null || number < 0 ? 0 : number;
    };
    const usage = Object.entries(providers).flatMap(([provider, models]) =>
        Object.entries(recordOf(models) ?? {}).flatMap(([model, spent]) => {
            const fields = recordOf(spent);
            if (!fields) return [];
            const cost = numberOrNull(fields.costUsd);
            return [
                {
                    provider,
                    model,
                    input: count(fields.input),
                    output: count(fields.output),
                    cacheRead: count(fields.cacheRead),
                    cacheWrite: count(fields.cacheWrite),
                    reasoning: count(fields.reasoning),
                    costUsd: cost === null || cost < 0 ? null : cost,
                },
            ];
        }),
    );
    usage.sort(
        (left, right) =>
            left.provider.localeCompare(right.provider) || left.model.localeCompare(right.model),
    );
    return usage.length > 0 ? usage : null;
}

function nodeRunRead(value: unknown): PipelineNodeRun | undefined {
    const node = recordOf(value);
    const state = NODE_RUN_STATES.find((entry) => entry === node?.state);
    const kind = (["code", "agent", "pipeline"] as const).find((entry) => entry === node?.kind);
    if (!node || typeof node.nodeId !== "string" || !state || !kind) return undefined;
    const failure = recordOf(node.failure);
    return {
        nodeId: node.nodeId,
        kind,
        state,
        status: statusRead(node.status) ?? null,
        statuses: listOf(node.statuses, statusRead),
        input: node.input ?? null,
        output: node.output ?? null,
        failure:
            failure && typeof failure.code === "string"
                ? {
                      code: failure.code,
                      message: typeof failure.message === "string" ? failure.message : "",
                  }
                : null,
        agentId: textOrNull(node.agentId),
        childRunId: textOrNull(node.childRunId),
        startedAt: numberOrNull(node.startedAt),
        endedAt: numberOrNull(node.endedAt),
        usage: usageRead(node.usage),
    };
}

function leaseRead(value: unknown): PipelineLease | undefined {
    const lease = recordOf(value);
    if (!lease || typeof lease.name !== "string" || typeof lease.computerId !== "string")
        return undefined;
    return {
        name: lease.name,
        computerId: lease.computerId,
        holders: texts(lease.holders),
        releasedAt: numberOrNull(lease.releasedAt),
    };
}

/** `GET /v0/pipeline-runs/:runId` → `{ run: PipelineRun }`. */
export function pipelineRunRead(answer: unknown): PipelineRun | undefined {
    const run = recordOf(recordOf(answer)?.run);
    const entry = runEntryRead(run);
    if (!run || !entry || typeof run.pipelineId !== "string") return undefined;
    const result = recordOf(run.result);
    return {
        ...entry,
        pipelineId: run.pipelineId,
        rootRunId: textOrNull(run.rootRunId) ?? entry.id,
        group: textOrNull(run.group),
        input: run.input ?? null,
        result: result ? { outputs: recordOf(result.outputs) ?? {} } : null,
        nodes: listOf(run.nodes, nodeRunRead),
        leases: listOf(run.leases, leaseRead),
        childRunIds: texts(run.childRunIds),
    };
}

function logEntryRead(value: unknown): PipelineLogEntry | undefined {
    const entry = recordOf(value);
    const seq = numberOrNull(entry?.seq);
    if (!entry || seq === null) return undefined;
    const at = numberOrNull(entry.at) ?? 0;
    const text = typeof entry.text === "string" ? entry.text : "";
    switch (entry.kind) {
        case "output":
            return {
                seq,
                at,
                kind: "output",
                stream: entry.stream === "stderr" ? "stderr" : "stdout",
                text,
            };
        case "message":
            return { seq, at, kind: "message", text };
        case "status": {
            const progress = numberOrNull(entry.progress);
            return {
                seq,
                at,
                kind: "status",
                text,
                progress: progress === null ? null : Math.min(1, Math.max(0, progress)),
            };
        }
        case "command": {
            const state = (["running", "exited", "aborted"] as const).find(
                (s) => s === entry.state,
            );
            if (typeof entry.id !== "string" || typeof entry.command !== "string" || !state)
                return undefined;
            return {
                seq,
                at,
                kind: "command",
                id: entry.id,
                command: entry.command,
                cwd: textOrNull(entry.cwd),
                lease: textOrNull(entry.lease),
                state,
                exitCode: numberOrNull(entry.exitCode),
                durationMs: numberOrNull(entry.durationMs),
                output: typeof entry.output === "string" ? entry.output : "",
                outputTruncated: entry.outputTruncated === true,
            };
        }
        case "tool": {
            const state = (["running", "ok", "error"] as const).find((s) => s === entry.state);
            if (typeof entry.id !== "string" || typeof entry.name !== "string" || !state)
                return undefined;
            return {
                seq,
                at,
                kind: "tool",
                id: entry.id,
                name: entry.name,
                summary: typeof entry.summary === "string" ? entry.summary : "",
                state,
                durationMs: numberOrNull(entry.durationMs),
                error: textOrNull(entry.error),
            };
        }
        default:
            // A kind this app does not know yet is left out rather than guessed at.
            return undefined;
    }
}

/** `GET /v0/pipeline-runs/:runId/nodes/:nodeId/log?after=&limit=` → `{ entries, nextAfter, dropped, changed }`. */
export function pipelineLogPageRead(answer: unknown, after: number): PipelineLogPage {
    const page = recordOf(answer);
    const entries = listOf(page?.entries, logEntryRead);
    return {
        entries,
        nextAfter: numberOrNull(page?.nextAfter) ?? entries.at(-1)?.seq ?? after,
        dropped: numberOrNull(page?.dropped) ?? 0,
        changed: listOf(page?.changed, logEntryRead),
    };
}
