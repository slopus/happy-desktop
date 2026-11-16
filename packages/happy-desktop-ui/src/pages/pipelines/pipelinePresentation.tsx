import type {
    PipelineAuthor,
    PipelineNode,
    PipelineNodeKind,
    PipelineNodeRunState,
    PipelineRunRelative,
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

/** How a child run is tied to the run on screen: the nodes waiting on it. */
export function pipelineChildVia(nodeIds: readonly string[]): string {
    if (nodeIds.length === 0) return "Started by this run";
    if (nodeIds.length === 1) return `From its node ${nodeIds[0]!}`;
    // A batch run several nodes joined.
    return `Shared by its nodes ${nodeIds.slice(0, -1).join(", ")} and ${nodeIds.at(-1)!}`;
}

/**
 * Where a child run stands: `short` for the pipeline node's card on the
 * timeline, `text` for a row with room for its newest status line, and how far
 * through its nodes it is when that is known.
 */
export function pipelineRunRelativeProgress(relative: PipelineRunRelative): {
    readonly short: string;
    readonly text: string;
    readonly progress: number | null;
} {
    if (relative.state === "queued")
        return { short: "Child queued", text: "Queued behind its group", progress: null };
    if (relative.state !== "running") {
        const state = PIPELINE_RUN_STATE_LABEL[relative.state];
        return { short: `Child ${state.toLowerCase()}`, text: state, progress: null };
    }
    const total = relative.nodesTotal;
    const count =
        total === null
            ? `${String(relative.nodesEnded)} ${relative.nodesEnded === 1 ? "node" : "nodes"} done`
            : `${String(relative.nodesEnded)} of ${String(total)} nodes`;
    return {
        short: count,
        text: relative.status === null ? count : `${count} · ${relative.status.text}`,
        progress: total === null || total === 0 ? null : relative.nodesEnded / total,
    };
}

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

/** What the cluster's failure codes mean, in a few words. */
const PIPELINE_FAILURE_TITLE: Readonly<Record<string, string>> = {
    exception: "Raised an exception",
    type_error: "Didn't fit its type",
    invalid_output: "Returned an invalid output",
    output_too_large: "Output over 1 MiB",
    timeout: "Ran out of time",
    compute_unavailable: "Computer unavailable",
    permission_denied: "Not permitted",
    unsupported: "Not supported on this cluster",
    internal_error: "The cluster failed",
    no_output: "Ended without an output",
    agent_error: "The agent's turn failed",
    model_unavailable: "Model unavailable",
    child_failed: "Its child run failed",
    child_aborted: "Its child run was aborted",
    child_superseded: "Its child run was superseded",
    child_unavailable: "Child run unavailable",
    cycle: "Would run a pipeline already running above it",
    too_deep: "Child runs nested too deep",
};

/**
 * A failure code in words. Agent nodes may fail with a code of their own,
 * which reads as its words: `tests_failed` is "Tests failed".
 */
export function pipelineFailureTitle(code: string): string {
    const known = PIPELINE_FAILURE_TITLE[code];
    if (known) return known;
    const words = code.replaceAll("_", " ").trim();
    return words ? words[0]!.toUpperCase() + words.slice(1) : "Failed";
}

/** A token count at a glance: `840`, `12.4k`, `3.1M`. */
export function pipelineTokensText(count: number): string {
    if (count < 1_000) return String(Math.round(count));
    if (count < 1_000_000) return `${(count / 1_000).toFixed(count < 10_000 ? 1 : 0)}k`;
    return `${(count / 1_000_000).toFixed(1)}M`;
}

/** US dollars to the cent, and a hint below a cent. */
export function pipelineCostText(usd: number): string {
    if (usd === 0) return "$0.00";
    if (usd < 0.01) return "< $0.01";
    return `$${usd.toFixed(2)}`;
}
