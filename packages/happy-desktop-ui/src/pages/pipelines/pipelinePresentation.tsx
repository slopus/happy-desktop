import type {
    PipelineAuthor,
    PipelineNode,
    PipelineNodeKind,
    PipelineRunState,
    PipelineSchema,
} from "happy-desktop-state";
import type { IconName } from "../../Icon";

/** How the pipeline surfaces name moments, people, and other pipelines, supplied by the app. */
export interface PipelineLabels {
    readonly time: (at: number) => string;
    readonly author: (author: PipelineAuthor | null) => string;
    /** Another pipeline's name, for a `pipeline` node. */
    readonly pipeline: (pipelineId: string) => string;
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
