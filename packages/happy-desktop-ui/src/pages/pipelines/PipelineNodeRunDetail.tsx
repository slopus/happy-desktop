import type { PipelineLease, PipelineNode, PipelineNodeRun } from "happy-desktop-state";
import { Button } from "../../Button";
import { PipelineDetailSection, PipelineFacts } from "./PipelineNodeDetail";
import { pipelineValueText, type PipelineLabels } from "./pipelinePresentation";

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
                        <span className="happy-pipeline-detail__failure-code">
                            {node.failure.code}
                        </span>
                        <p className="happy-pipeline-detail__prose">
                            {node.failure.message || "No message."}
                        </p>
                    </div>
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
