import type {
    PipelineAuthor,
    PipelineNode,
    PipelineNodeKind,
    PipelineNodeRunState,
    PipelineRunState,
    PipelineRunTrigger,
    PipelineSchema,
} from "happy-desktop-state";
import { elapsedTimeFormat } from "../../elapsedTimeFormat";
import type { IconName } from "../../Icon";

/** How the pipeline surfaces name moments, people, and other pipelines, supplied by the app. */
export interface PipelineLabels {
    readonly time: (at: number) => string;
    readonly author: (author: PipelineAuthor | null) => string;
    /** Another pipeline's name, for a `pipeline` node. */
    readonly pipeline: (pipelineId: string) => string;
    /** An agent's name, for who started a run. */
    readonly agent: (agentId: string) => string;
}

export const PIPELINE_KIND_ICON: Record<PipelineNodeKind, IconName> = {
    code: "code",
    agent: "agents",
    pipeline: "pipeline",
};

export const PIPELINE_KIND_LABEL: Record<PipelineNodeKind, string> = {
    code: "Code",
    agent: "Agent",
    pipeline: "Pipeline",
};

/** The second line of a node's card: what kind of step it is. */
export function pipelineNodeSummary(node: PipelineNode, labels: PipelineLabels): string {
    switch (node.kind) {
        case "code":
            return "Code";
        case "agent":
            return node.model === null ? "Agent" : `Agent · ${node.model}`;
        case "pipeline":
            return `Runs ${labels.pipeline(node.pipelineId)}`;
    }
}

export const PIPELINE_RUN_STATE_LABEL: Record<PipelineRunState, string> = {
    queued: "Queued",
    running: "Running",
    succeeded: "Succeeded",
    failed: "Failed",
    aborted: "Aborted",
    superseded: "Superseded",
};

/** A state's colour role: the CSS reads it from `data-tone`. */
export type PipelineTone = "neutral" | "active" | "success" | "danger";

export const PIPELINE_RUN_STATE_TONE: Record<PipelineRunState, PipelineTone> = {
    queued: "neutral",
    running: "active",
    succeeded: "success",
    failed: "danger",
    aborted: "neutral",
    superseded: "neutral",
};

export const PIPELINE_NODE_STATE_LABEL: Record<PipelineNodeRunState, string> = {
    pending: "Waiting",
    running: "Running",
    succeeded: "Succeeded",
    failed: "Failed",
    skipped: "Skipped",
    aborted: "Aborted",
};

export const PIPELINE_NODE_STATE_TONE: Record<PipelineNodeRunState, PipelineTone> = {
    pending: "neutral",
    running: "active",
    succeeded: "success",
    failed: "danger",
    skipped: "neutral",
    aborted: "neutral",
};

/** How long something took, or has taken so far while it runs. */
export function pipelineDurationOf(
    startedAt: number | null,
    endedAt: number | null,
    now: number,
): string | null {
    if (startedAt === null) return null;
    return elapsedTimeFormat((endedAt ?? now) - startedAt);
}

/** Who started a run, in words. */
export function pipelineTriggerText(
    trigger: PipelineRunTrigger | null,
    labels: PipelineLabels,
): string {
    if (trigger === null) return "Unknown";
    return trigger.kind === "agent"
        ? labels.agent(trigger.agentId)
        : `Node ${trigger.nodeId} of a parent run`;
}

/** A JSON value as it reads indented; `null` for nothing. */
export function pipelineValueText(value: unknown): string {
    try {
        return JSON.stringify(value, null, 2) ?? "null";
    } catch {
        return String(value);
    }
}

/** A state as a dot and its word. */
export function PipelineStateMark(props: { readonly tone: PipelineTone; readonly label: string }) {
    return (
        <span
            className="happy-pipeline-state"
            data-happy-desktop-ui="pipeline-state"
            data-tone={props.tone}
        >
            <span aria-hidden className="happy-pipeline-state__dot" />
            <span className="happy-pipeline-state__label">{props.label}</span>
        </span>
    );
}

const INLINE_LIMIT = 48;

function literalText(value: string | number | boolean | null): string {
    return typeof value === "string" ? JSON.stringify(value) : String(value);
}

/**
 * A type as one reads it in TypeScript: `{ sha: string; branch?: string }`,
 * `string[]`, `"a" | "b"`, `T | null`. An object too long for one line puts
 * each property on its own, indented.
 */
export function pipelineSchemaText(schema: PipelineSchema, indent = ""): string {
    const nullable = (text: string, isNullable: boolean): string =>
        isNullable ? `${text} | null` : text;
    switch (schema.type) {
        case "null":
            return "null";
        case "array": {
            const items = pipelineSchemaText(schema.items, indent);
            const wrapped = /[ |]/.test(items) && !items.startsWith("{") ? `(${items})` : items;
            return nullable(`${wrapped}[]`, schema.nullable);
        }
        case "object": {
            if (schema.properties.length === 0) return nullable("{}", schema.nullable);
            const inner = `${indent}  `;
            const parts = schema.properties.map(
                (property) =>
                    `${property.name}${property.required ? "" : "?"}: ${pipelineSchemaText(property.schema, inner)}`,
            );
            const inline = `{ ${parts.join("; ")} }`;
            const text =
                inline.length <= INLINE_LIMIT && !inline.includes("\n")
                    ? inline
                    : `{\n${parts.map((part) => `${inner}${part};`).join("\n")}\n${indent}}`;
            return nullable(text, schema.nullable);
        }
        default: {
            const base =
                schema.values === null ? schema.type : schema.values.map(literalText).join(" | ");
            return nullable(base, schema.nullable);
        }
    }
}

/** Seconds as the largest whole unit that fits: `10 min`, `1 h`, `90 s`. */
export function pipelineDurationText(seconds: number): string {
    if (seconds % 3600 === 0) return `${String(seconds / 3600)} h`;
    if (seconds % 60 === 0) return `${String(seconds / 60)} min`;
    return `${String(seconds)} s`;
}
