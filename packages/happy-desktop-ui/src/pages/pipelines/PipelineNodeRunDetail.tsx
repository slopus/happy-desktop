import type {
    PipelineLease,
    PipelineModelUsage,
    PipelineNode,
    PipelineNodeRun,
} from "happy-desktop-state";
import { Button } from "../../Button";
import { PipelineDetailSection, PipelineFacts } from "./PipelineNodeDetail";
import {
    pipelineCostText,
    pipelineFailureTitle,
    pipelineTokensText,
    pipelineValueText,
    type PipelineLabels,
} from "./pipelinePresentation";

/** A JSON value in a block that scrolls both ways rather than wrapping. */
export function PipelineValue(props: { readonly value: unknown }) {
    return (
        <div className="happy-pipeline-detail__value" data-happy-desktop-ui="pipeline-value">
            <pre className="happy-pipeline-detail__value-text">
                {pipelineValueText(props.value)}
            </pre>
        </div>
    );
}

/** Tokens in and out, and from the cache when there were any. */
function tokensText(usage: Omit<PipelineModelUsage, "provider" | "model" | "costUsd">): string {
    return [
        `${pipelineTokensText(usage.input)} in`,
        `${pipelineTokensText(usage.output)} out`,
        usage.cacheRead + usage.cacheWrite > 0
            ? `${pipelineTokensText(usage.cacheRead + usage.cacheWrite)} cached`
            : "",
        usage.reasoning > 0 ? `${pipelineTokensText(usage.reasoning)} reasoning` : "",
    ]
        .filter(Boolean)
        .join(" · ");
}

/** What an agent node's agent spent: in total, and by model when it used several. */
export function PipelineUsage(props: { readonly usage: readonly PipelineModelUsage[] }) {
    const sum = (field: "input" | "output" | "cacheRead" | "cacheWrite" | "reasoning") =>
        props.usage.reduce((total, entry) => total + entry[field], 0);
    const priced = props.usage.filter((entry) => entry.costUsd !== null);
    const cost = priced.reduce((total, entry) => total + entry.costUsd!, 0);
    const total = {
        input: sum("input"),
        output: sum("output"),
        cacheRead: sum("cacheRead"),
        cacheWrite: sum("cacheWrite"),
        reasoning: sum("reasoning"),
    };
    const single = props.usage.length === 1 ? props.usage[0]! : null;
    return (
        <>
            <PipelineFacts
                empty=""
                facts={[
                    [
                        "Cost",
                        priced.length === 0
                            ? "Not priced"
                            : `${pipelineCostText(cost)}${priced.length < props.usage.length ? " (some unpriced)" : ""}`,
                    ],
                    ["Tokens", tokensText(total)],
                    ["Model", single ? `${single.provider}/${single.model}` : ""],
                ]}
            />
            {single ? null : (
                <ul className="happy-pipeline-usage">
                    {props.usage.map((entry) => (
                        <li
                            className="happy-pipeline-usage__model"
                            key={`${entry.provider}/${entry.model}`}
                        >
                            <span className="happy-pipeline-usage__name">
                                {entry.provider}/{entry.model}
                            </span>
                            <span className="happy-pipeline-usage__spend">
                                {[
                                    entry.costUsd === null ? "" : pipelineCostText(entry.costUsd),
                                    tokensText(entry),
                                ]
                                    .filter(Boolean)
                                    .join(" · ")}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </>
    );
}

export interface PipelineNodeRunFactsProps {
    readonly node: PipelineNodeRun;
    /** The node as the run's version defines it, when that has been read. */
    readonly definition: PipelineNode | undefined;
    /** Every lease of the run; those this node held or names are shown. */
    readonly leases: readonly PipelineLease[];
    readonly labels: PipelineLabels;
    readonly onRunOpen: (runId: string) => void;
}

/**
 * PipelineNodeRunFacts — one node's execution, for the side column beside its
 * log: why it failed, what it produced and received, every status line it
 * reported, the computers it held, and the child run a pipeline node started.
 */
export function PipelineNodeRunFacts(props: PipelineNodeRunFactsProps) {
    const node = props.node;
    const compute = props.definition?.compute;
    const names = new Set([
        ...(compute?.acquire.map((lease) => lease.name) ?? []),
        ...(compute?.use ?? []),
        ...(compute?.pass ?? []),
    ]);
    const leases = props.leases.filter(
        (lease) => lease.holders.includes(node.nodeId) || names.has(lease.name),
    );
    return (
        <>
            {node.childRunId !== null ? (
                <div className="happy-pipeline-detail__actions">
                    <Button
                        icon="pipeline"
                        onClick={() => props.onRunOpen(node.childRunId!)}
                        size="small"
                        variant="secondary"
                    >
                        Open child run
                    </Button>
                </div>
            ) : null}
            {node.failure ? (
                <PipelineDetailSection title="Failure">
                    <div className="happy-pipeline-detail__failure">
                        <span className="happy-pipeline-detail__failure-title">
                            <span className="happy-pipeline-detail__failure-name">
                                {pipelineFailureTitle(node.failure.code)}
                            </span>
                            <span className="happy-pipeline-detail__failure-code">
                                {node.failure.code}
                            </span>
                        </span>
                        {node.failure.message.includes("\n") ? (
                            // A traceback: its lines and their alignment are the message.
                            <pre className="happy-pipeline-detail__failure-text">
                                {node.failure.message}
                            </pre>
                        ) : (
                            <p className="happy-pipeline-detail__prose">
                                {node.failure.message || "No message."}
                            </p>
                        )}
                    </div>
                </PipelineDetailSection>
            ) : null}
            {node.usage ? (
                <PipelineDetailSection title="Usage">
                    <PipelineUsage usage={node.usage} />
                </PipelineDetailSection>
            ) : node.kind === "agent" && node.state !== "pending" && node.state !== "skipped" ? (
                <PipelineDetailSection title="Usage">
                    <p className="happy-pipeline-detail__note">No inference yet.</p>
                </PipelineDetailSection>
            ) : null}
            {node.output !== null ? (
                <PipelineDetailSection title="Output">
                    <PipelineValue value={node.output} />
                </PipelineDetailSection>
            ) : null}
            {node.input !== null ? (
                <PipelineDetailSection title="Input">
                    <PipelineValue value={node.input} />
                </PipelineDetailSection>
            ) : null}
            <PipelineDetailSection title="Status history">
                {node.statuses.length === 0 ? (
                    <p className="happy-pipeline-detail__note">It has said nothing yet.</p>
                ) : (
                    <ol className="happy-pipeline-statuses">
                        {node.statuses
                            .map((status, order) => ({ status, order }))
                            .reverse()
                            .map(({ status, order }) => (
                                <li
                                    className="happy-pipeline-statuses__item"
                                    // Status lines carry no ID. Counted from the oldest
                                    // with their time, a new line leaves the rest's keys alone.
                                    key={`${String(status.at)}-${String(order)}`}
                                >
                                    <span className="happy-pipeline-statuses__text">
                                        {status.text}
                                        {status.progress === null
                                            ? ""
                                            : ` · ${String(Math.round(status.progress * 100))}%`}
                                    </span>
                                    <span className="happy-pipeline-statuses__time">
                                        {props.labels.time(status.at)}
                                    </span>
                                </li>
                            ))}
                    </ol>
                )}
            </PipelineDetailSection>
            {leases.length > 0 ? (
                <PipelineDetailSection title="Computers">
                    <PipelineFacts
                        empty=""
                        facts={leases.map((lease) => [
                            lease.name,
                            `${lease.computerId} · ${lease.releasedAt === null ? `held by ${lease.holders.join(", ") || "nobody"}` : `released ${props.labels.time(lease.releasedAt)}`}`,
                        ])}
                    />
                </PipelineDetailSection>
            ) : null}
        </>
    );
}
