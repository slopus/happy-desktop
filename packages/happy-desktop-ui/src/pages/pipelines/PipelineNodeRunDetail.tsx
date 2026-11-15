import type { PipelineLease, PipelineNode, PipelineNodeRun } from "happy-desktop-state";
import { Button } from "../../Button";
import { Icon } from "../../Icon";
import { ScrollArea } from "../../Scrollbar";
import { PipelineDetailSection, PipelineFacts } from "./PipelineNodeDetail";
import {
    PIPELINE_KIND_ICON,
    PIPELINE_KIND_LABEL,
    PIPELINE_NODE_STATE_LABEL,
    PIPELINE_NODE_STATE_TONE,
    PipelineStateMark,
    pipelineDurationOf,
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

/** A status line's progress as a bar, with room kept for it when there is none. */
export function PipelineProgress(props: { readonly progress: number | null }) {
    return (
        <span
            aria-label={
                props.progress === null ? undefined : `${String(Math.round(props.progress * 100))}%`
            }
            className="happy-pipeline-progress"
            data-empty={props.progress === null ? "" : undefined}
            data-happy-desktop-ui="pipeline-progress"
            role={props.progress === null ? undefined : "progressbar"}
        >
            <span
                className="happy-pipeline-progress__fill"
                style={{
                    width:
                        props.progress === null
                            ? 0
                            : `${String(Math.round(props.progress * 100))}%`,
                }}
            />
        </span>
    );
}

export interface PipelineNodeRunDetailProps {
    readonly node: PipelineNodeRun;
    /** The node as the run's version defines it, when that has been read. */
    readonly definition: PipelineNode | undefined;
    /** Every lease of the run; those this node held or names are shown. */
    readonly leases: readonly PipelineLease[];
    readonly labels: PipelineLabels;
    readonly now: number;
    readonly onClose: () => void;
    readonly onAgentOpen: (agentId: string) => void;
    readonly onRunOpen: (runId: string) => void;
}

/**
 * PipelineNodeRunDetail — one node's execution in a run: what it said last
 * and how far along it is, why it failed, what it received and produced, every
 * status line it reported, the computers it held, and where its work lives —
 * the agent's transcript or the child run.
 */
export function PipelineNodeRunDetail(props: PipelineNodeRunDetailProps) {
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
    const duration = pipelineDurationOf(node.startedAt, node.endedAt, props.now);
    return (
        <div className="happy-pipeline-detail" data-happy-desktop-ui="pipeline-node-run-detail">
            <header className="happy-pipeline-detail__header">
                <span className="happy-pipeline-detail__kind" data-kind={node.kind}>
                    <Icon name={PIPELINE_KIND_ICON[node.kind]} size={16} />
                </span>
                <span className="happy-pipeline-detail__heading">
                    <span className="happy-pipeline-detail__name">{node.nodeId}</span>
                    <span className="happy-pipeline-detail__subtitle">
                        {PIPELINE_KIND_LABEL[node.kind]}
                    </span>
                </span>
                <Button
                    aria-label="Close"
                    icon="close"
                    iconOnly
                    onClick={props.onClose}
                    size="small"
                    title="Close"
                    variant="ghost"
                />
            </header>
            <ScrollArea
                className="happy-pipeline-page__inspector-scroll"
                viewportClassName="happy-pipeline-page__inspector-viewport"
            >
                <div className="happy-pipeline-detail__body">
                    <PipelineDetailSection title="State">
                        <div className="happy-pipeline-detail__state">
                            <PipelineStateMark
                                label={PIPELINE_NODE_STATE_LABEL[node.state]}
                                tone={PIPELINE_NODE_STATE_TONE[node.state]}
                            />
                            {duration ? (
                                <span className="happy-pipeline-detail__note">{duration}</span>
                            ) : null}
                        </div>
                        {node.status ? (
                            <div className="happy-pipeline-detail__status">
                                <p className="happy-pipeline-detail__prose">{node.status.text}</p>
                                <PipelineProgress progress={node.status.progress} />
                            </div>
                        ) : null}
                        {node.agentId !== null ? (
                            <Button
                                icon="chat"
                                onClick={() => props.onAgentOpen(node.agentId!)}
                                size="small"
                                variant="secondary"
                            >
                                Open transcript
                            </Button>
                        ) : null}
                        {node.childRunId !== null ? (
                            <Button
                                icon="pipeline"
                                onClick={() => props.onRunOpen(node.childRunId!)}
                                size="small"
                                variant="secondary"
                            >
                                Open child run
                            </Button>
                        ) : null}
                    </PipelineDetailSection>
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
                </div>
            </ScrollArea>
        </div>
    );
}
