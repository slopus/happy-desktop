import type { CSSProperties } from "react";
import {
    pipelineRunAbortable,
    type PipelineNodeLogSnapshot,
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
import { PipelineDetailSection, PipelineFacts, PipelineNodeHeading } from "./PipelineNodeDetail";
import { PipelineNodeLog } from "./PipelineNodeLog";
import { PipelineNodeRunFacts, PipelineValue } from "./PipelineNodeRunDetail";
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
    /**
     * The log the page shows, and whose: the node the reader picked, or the one
     * working now (or that failed). Absent before any node has run.
     */
    readonly log?: { readonly nodeId: string; readonly snapshot: PipelineNodeLogSnapshot };
    readonly labels: PipelineLabels;
    /** Now, for how long running work has taken so far. */
    readonly now: number;
    readonly onBack?: () => void;
    readonly onNodeSelect: (nodeId: string | null) => void;
    readonly onAbort: () => void;
    /** Opens another run: a child, or the parent that started this one. */
    readonly onRunOpen: (runId: string) => void;
    readonly onPipelineOpen: (pipelineId: string) => void;
    readonly className?: string;
    readonly "data-testid"?: string;
    readonly style?: CSSProperties;
}

/** What a node's row says beside its name in a run. */
function nodeLine(node: PipelineNodeRun | undefined, fallback: string): string {
    if (node === undefined) return fallback;
    if (node.failure) return `${node.failure.code}: ${node.failure.message}`;
    if (node.status) return node.status.text;
    return node.state === "pending" ? fallback : PIPELINE_NODE_STATE_LABEL[node.state];
}

/**
 * HappyAgentPipelineRunPage — one run of a pipeline, live. A strip on top
 * draws the graph of the version it pinned, each node one row in its state.
 * Below it the shown node's log takes most of the page, beside a narrow column
 * of the run's facts and that node's input, output or failure, status history
 * and computers. Abort is the only control, live while the run is queued or
 * running.
 */
export function HappyAgentPipelineRunPage(props: HappyAgentPipelineRunPageProps) {
    const snapshot = props.run;
    const run = snapshot.run;
    const definition =
        snapshot.definition?.state === "loaded" ? snapshot.definition.definition : undefined;
    const nodeRuns = new Map(run?.nodes.map((node) => [node.nodeId, node]));
    const shownId = props.log?.nodeId ?? snapshot.nodeSelected;
    const shown = shownId === null ? undefined : nodeRuns.get(shownId);
    const shownDefinition = definition?.nodes.find((entry) => entry.id === shownId);
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
    const shownKind = shown?.kind ?? shownDefinition?.kind;
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
                <div className="happy-pipeline-page__stack">
                    <div className="happy-pipeline-page__strip">
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
                                onNodeSelect={(nodeId) => {
                                    // The node already shown by default stays shown when pressed.
                                    if (nodeId === null && snapshot.nodeSelected === null) return;
                                    props.onNodeSelect(nodeId);
                                }}
                                root={definition.root}
                                selectedNodeId={shownId}
                                variant="run"
                            />
                        ) : (
                            <p className="happy-pipeline-page__strip-note">
                                {snapshot.definition?.state === "failed"
                                    ? `The graph is unavailable: ${snapshot.definition.error.message}`
                                    : "Reading the version this run pinned…"}
                            </p>
                        )}
                    </div>
                    <div className="happy-pipeline-page__lower">
                        <section className="happy-pipeline-pane">
                            {shownId !== null && shownKind !== undefined ? (
                                <PipelineNodeHeading
                                    id={shownId}
                                    kind={shownKind}
                                    {...(snapshot.nodeSelected === null
                                        ? {}
                                        : { onClose: () => props.onNodeSelect(null) })}
                                >
                                    <PipelineStateMark
                                        label={PIPELINE_NODE_STATE_LABEL[shown?.state ?? "pending"]}
                                        tone={PIPELINE_NODE_STATE_TONE[shown?.state ?? "pending"]}
                                    />
                                    <span className="happy-pipeline-pane__subtitle">
                                        {shown
                                            ? (pipelineDurationOf(
                                                  shown.startedAt,
                                                  shown.endedAt,
                                                  props.now,
                                              ) ?? "")
                                            : ""}
                                    </span>
                                </PipelineNodeHeading>
                            ) : null}
                            {props.log &&
                            shown?.state !== "pending" &&
                            shown?.state !== "skipped" ? (
                                <PipelineNodeLog
                                    aria-label={`Log of ${props.log.nodeId}`}
                                    // A new node's log is a new reading position.
                                    key={props.log.nodeId}
                                    live={shown?.state === "running"}
                                    log={props.log.snapshot}
                                    startedAt={shown?.startedAt ?? null}
                                />
                            ) : (
                                <p className="happy-pipeline-log__empty">
                                    {shown?.state === "skipped"
                                        ? "This node was skipped; it did nothing."
                                        : shown?.state === "pending"
                                          ? "This node has not started."
                                          : "No node has started yet."}
                                </p>
                            )}
                        </section>
                        <aside className="happy-pipeline-page__side">
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
                                                ["Group", run.group ?? ""],
                                                ["Queued", props.labels.time(run.createdAt)],
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
                                    {shown ? (
                                        <div className="happy-pipeline-detail__group">
                                            <h3 className="happy-pipeline-detail__group-title">
                                                {shown.nodeId}
                                            </h3>
                                            <PipelineNodeRunFacts
                                                definition={shownDefinition}
                                                labels={props.labels}
                                                leases={run.leases}
                                                node={shown}
                                                onRunOpen={props.onRunOpen}
                                            />
                                        </div>
                                    ) : null}
                                    <div className="happy-pipeline-detail__group">
                                        <h3 className="happy-pipeline-detail__group-title">
                                            The run
                                        </h3>
                                        <PipelineDetailSection title="Input">
                                            <PipelineValue value={run.input} />
                                        </PipelineDetailSection>
                                        {run.result ? (
                                            <PipelineDetailSection title="Result">
                                                <PipelineValue value={run.result.outputs} />
                                            </PipelineDetailSection>
                                        ) : null}
                                        {run.childRunIds.length > 0 ? (
                                            <PipelineDetailSection title="Child runs">
                                                <div className="happy-pipeline-detail__actions">
                                                    {run.childRunIds.map((childRunId) => {
                                                        const parentNode = run.nodes.find(
                                                            (node) =>
                                                                node.childRunId === childRunId,
                                                        );
                                                        return (
                                                            <Button
                                                                icon="pipeline"
                                                                key={childRunId}
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
                                </div>
                            </ScrollArea>
                        </aside>
                    </div>
                </div>
            )}
        </div>
    );
}
