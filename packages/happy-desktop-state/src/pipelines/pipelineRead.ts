import type {
    PipelineAuthor,
    PipelineCompute,
    PipelineDefinition,
    PipelineDetail,
    PipelineEdge,
    PipelineGrant,
    PipelineLeaseAcquire,
    PipelineNode,
    PipelinePermissions,
    PipelineRunState,
    PipelineRunSummary,
    PipelineSchema,
    PipelineSchemaLiteral,
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
    if (typeof schema.$ref === "string") return { type: "ref", ref: schema.$ref };
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

function authorRead(value: unknown): PipelineAuthor | null {
    const author = recordOf(value);
    if (author?.kind === "agent" && typeof author.agentId === "string")
        return { kind: "agent", agentId: author.agentId };
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
