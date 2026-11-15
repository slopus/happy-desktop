import type { CSSProperties } from "react";
import {
    pipelineRunAbortable,
    type PipelineNodeRun,
    type PipelineRunSnapshot,
} from "happy-desktop-state";
import { Banner } from "../../Banner";
import { Button } from "../../Button";
import { EmptyState } from "../../EmptyState";
import { ScrollArea } from "../../Scrollbar";
import { Ionicon } from "../../vectorIcons/VectorIcon";
import { ArtifactHeader } from "../artifacts/ArtifactHeader";
import { PipelineGraph, PipelineGraphLegend, type PipelineGraphNode } from "./PipelineGraph";
import { PipelineDetailSection, PipelineFacts } from "./PipelineNodeDetail";
import { PipelineNodeRunDetail, PipelineValue } from "./PipelineNodeRunDetail";
import {
    PIPELINE_NODE_STATE_LABEL,
    PIPELINE_NODE_STATE_TONE,
    PIPELINE_RUN_STATE_LABEL,
    PIPELINE_RUN_STATE_TONE,
    PipelineStateMark,
    pipelineDurationOf,
    pipelineNodeStateMuted,
    pipelineNodeSummary,
    pipelineTriggerText,
    type PipelineLabels,
} from "./pipelinePresentation";

export interface HappyAgentPipelineRunPageProps {
    readonly run: PipelineRunSnapshot;
    readonly labels: PipelineLabels;
    /** Now, for how long running work has taken so far. */
    readonly now: number;
    readonly onBack?: () => void;
    readonly onNodeSelect: (nodeId: string | null) => void;
    readonly onAbort: () => void;
    /** Opens the transcript of the agent that ran an agent node. */
    readonly onAgentOpen: (agentId: string) => void;
    /** Opens another run: a child, or the parent that started this one. */
    readonly onRunOpen: (runId: string) => void;
    readonly onPipelineOpen: (pipelineId: string) => void;
    readonly className?: string;
    readonly "data-testid"?: string;
    readonly style?: CSSProperties;
}

/** What a node's card says on its second line in a run. */
function nodeLine(node: PipelineNodeRun | undefined, fallback: string): string {
    if (node === undefined) return fallback;
    if (node.failure) return `${node.failure.code}: ${node.failure.message}`;
    if (node.status) return node.status.text;
    return node.state === "pending" ? fallback : PIPELINE_NODE_STATE_LABEL[node.state];
}

/**
 * HappyAgentPipelineRunPage — one run of a pipeline, live: the graph of the
 * version it pinned with each node in its state, saying what it last reported
 * and how far along it is, beside the run's overview or one node's execution.
 * Abort is the only control, live while the run is queued or running.
 */
export function HappyAgentPipelineRunPage(props: HappyAgentPipelineRunPageProps) {
    const snapshot = props.run;
    const run = snapshot.run;
    const definition =
        snapshot.definition?.state === "loaded" ? snapshot.definition.definition : undefined;
    const nodeRuns = new Map(run?.nodes.map((node) => [node.nodeId, node]));
    const selected =
        snapshot.nodeSelected === null ? undefined : nodeRuns.get(snapshot.nodeSelected);
    const abortable = run !== null && pipelineRunAbortable(run.state);
    const back = props.onBack ? (
        <Button
            aria-label="Back"
            iconOnly
            onClick={props.onBack}
            size="small"
            title="Back"
            variant="ghost"
        >
            <Ionicon name="arrow-back" size={14} />
        </Button>
    ) : undefined;
    const graphNodes: PipelineGraphNode[] = (definition?.nodes ?? []).map((entry) => {
        const node = nodeRuns.get(entry.id);
        const state = node?.state ?? "pending";
        return {
            id: entry.id,
            kind: entry.kind,
            detail: nodeLine(node, pipelineNodeSummary(entry, props.labels)),
            state: {
                tone: PIPELINE_NODE_STATE_TONE[state],
                label: PIPELINE_NODE_STATE_LABEL[state],
                muted: pipelineNodeStateMuted(state),
            },
            progress: node?.state === "running" ? (node.status?.progress ?? null) : null,
        };
    });
    return (
        <div
            className={["happy-pipeline-page", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="happy-agent-pipeline-run"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            <ArtifactHeader
                className="happy-pipeline-page__header"
                {...(back ? { leading: back } : {})}
                {...(run ? { subtitle: `Run of version ${String(run.version)}` } : {})}
                title={
                    run
                        ? props.labels.pipeline(run.pipelineId)
                        : snapshot.loading
                          ? "Run"
                          : "Run not found"
                }
                {...(run
                    ? {
                          trailing: (
                              <Button
                                  disabled={!abortable}
                                  loading={snapshot.abort.state === "sending"}
                                  onClick={props.onAbort}
                                  size="small"
                                  {...(abortable
                                      ? {}
                                      : { title: "Only a queued or running run can be aborted." })}
                                  variant="danger"
                              >
                                  Abort
                              </Button>
                          ),
                      }
                    : {})}
            />
            {run === null ? (
                <div className="happy-pipeline-page__empty">
                    <EmptyState
                        description={
                            snapshot.loading
                                ? "Reading this run."
                                : snapshot.missing
                                  ? "This server has no such run."
                                  : (snapshot.error?.message ?? "This run could not be read.")
                        }
                        icon={snapshot.loading ? "clock" : "pipeline"}
                        size="panel"
                        title={snapshot.loading ? "Loading run…" : "Run not found"}
                    />
                </div>
            ) : (
                <div className="happy-pipeline-page__body">
                    <div className="happy-pipeline-page__main">
                        <div className="happy-pipeline-page__bar">
                            <PipelineStateMark
                                label={PIPELINE_RUN_STATE_LABEL[run.state]}
                                tone={PIPELINE_RUN_STATE_TONE[run.state]}
                            />
                            <span className="happy-pipeline-page__version">
                                {[
                                    props.labels.time(run.createdAt),
                                    pipelineDurationOf(run.startedAt, run.endedAt, props.now),
                                ]
                                    .filter(Boolean)
                                    .join(" · ")}
                            </span>
                            <span className="happy-pipeline-page__bar-end">
                                <PipelineGraphLegend />
                            </span>
                        </div>
                        {definition ? (
                            <PipelineGraph
                                aria-label={`Run of ${props.labels.pipeline(run.pipelineId)}`}
                                edges={definition.edges}
                                nodes={graphNodes}
                                onNodeSelect={props.onNodeSelect}
                                root={definition.root}
                                selectedNodeId={selected ? selected.nodeId : null}
                                variant="run"
                            />
                        ) : (
                            <div className="happy-pipeline-page__empty">
                                <EmptyState
                                    description={
                                        snapshot.definition?.state === "failed"
                                            ? snapshot.definition.error.message
                                            : "Reading the version this run pinned."
                                    }
                                    icon={
                                        snapshot.definition?.state === "failed" ? "alert" : "clock"
                                    }
                                    size="panel"
                                    title={
                                        snapshot.definition?.state === "failed"
                                            ? "Graph unavailable"
                                            : "Loading graph…"
                                    }
                                />
                            </div>
                        )}
                    </div>
                    <aside className="happy-pipeline-page__inspector">
                        {selected ? (
                            <PipelineNodeRunDetail
                                definition={definition?.nodes.find(
                                    (entry) => entry.id === selected.nodeId,
                                )}
                                labels={props.labels}
                                leases={run.leases}
                                node={selected}
                                now={props.now}
                                onAgentOpen={props.onAgentOpen}
                                onClose={() => props.onNodeSelect(null)}
                                onRunOpen={props.onRunOpen}
                            />
                        ) : (
                            <ScrollArea
                                className="happy-pipeline-page__inspector-scroll"
                                viewportClassName="happy-pipeline-page__inspector-viewport"
                            >
                                <div className="happy-pipeline-detail__body">
                                    {snapshot.abort.state === "failed" ? (
                                        <Banner tone="danger" title="The run was not aborted">
                                            {snapshot.abort.error.message}
                                        </Banner>
                                    ) : null}
                                    {snapshot.error ? (
                                        <Banner tone="danger" title="This run may be out of date">
                                            {snapshot.error.message}
                                        </Banner>
                                    ) : null}
                                    <PipelineDetailSection title="Run">
                                        <PipelineFacts
                                            empty=""
                                            facts={[
                                                [
                                                    "Started by",
                                                    pipelineTriggerText(run.trigger, props.labels),
                                                ],
                                                ["Version", String(run.version)],
                                                ["Group", run.group ?? ""],
                                                ["Queued", props.labels.time(run.createdAt)],
                                                [
                                                    "Started",
                                                    run.startedAt === null
                                                        ? ""
                                                        : props.labels.time(run.startedAt),
                                                ],
                                                [
                                                    "Ended",
                                                    run.endedAt === null
                                                        ? ""
                                                        : props.labels.time(run.endedAt),
                                                ],
                                            ]}
                                        />
                                        <div className="happy-pipeline-detail__actions">
                                            <Button
                                                onClick={() => props.onPipelineOpen(run.pipelineId)}
                                                size="small"
                                                variant="secondary"
                                            >
                                                Open pipeline
                                            </Button>
                                            {run.parentRunId !== null ? (
                                                <Button
                                                    onClick={() =>
                                                        props.onRunOpen(run.parentRunId!)
                                                    }
                                                    size="small"
                                                    variant="secondary"
                                                >
                                                    Open parent run
                                                </Button>
                                            ) : null}
                                        </div>
                                    </PipelineDetailSection>
                                    <PipelineDetailSection title="Input">
                                        <PipelineValue value={run.input} />
                                    </PipelineDetailSection>
                                    {run.result ? (
                                        <PipelineDetailSection title="Result">
                                            <PipelineValue value={run.result.outputs} />
                                        </PipelineDetailSection>
                                    ) : null}
                                    {run.leases.length > 0 ? (
                                        <PipelineDetailSection title="Computers">
                                            <PipelineFacts
                                                empty=""
                                                facts={run.leases.map((lease) => [
                                                    lease.name,
                                                    `${lease.computerId} · ${lease.releasedAt === null ? "held" : "released"}`,
                                                ])}
                                            />
                                        </PipelineDetailSection>
                                    ) : null}
                                    {run.childRunIds.length > 0 ? (
                                        <PipelineDetailSection title="Child runs">
                                            <div className="happy-pipeline-detail__actions">
                                                {run.childRunIds.map((childRunId) => {
                                                    const parentNode = run.nodes.find(
                                                        (node) => node.childRunId === childRunId,
                                                    );
                                                    return (
                                                        <Button
                                                            key={childRunId}
                                                            icon="pipeline"
                                                            onClick={() =>
                                                                props.onRunOpen(childRunId)
                                                            }
                                                            size="small"
                                                            variant="secondary"
                                                        >
                                                            {parentNode
                                                                ? `From ${parentNode.nodeId}`
                                                                : "Child run"}
                                                        </Button>
                                                    );
                                                })}
                                            </div>
                                        </PipelineDetailSection>
                                    ) : null}
                                </div>
                            </ScrollArea>
                        )}
                    </aside>
                </div>
            )}
        </div>
    );
}
