import type { CSSProperties } from "react";
import type { PipelineSummary, PipelinesSnapshot } from "happy-desktop-state";
import { Banner } from "../../Banner";
import { EmptyState } from "../../EmptyState";
import { Icon } from "../../Icon";
import { ScrollArea } from "../../Scrollbar";
import { ArtifactHeader } from "../artifacts/ArtifactHeader";
import { PipelineRunsAcrossList } from "./PipelineRunsAcrossList";
import {
    PIPELINE_RUN_STATE_LABEL,
    PIPELINE_RUN_STATE_TONE,
    PipelineStateMark,
    type PipelineLabels,
} from "./pipelinePresentation";

export interface HappyAgentPipelinesPageProps {
    readonly pipelines: PipelinesSnapshot;
    readonly labels: PipelineLabels;
    /** Now, for how long running runs have taken so far. */
    readonly now: number;
    readonly onPipelineOpen: (pipelineId: string) => void;
    readonly onRunOpen: (runId: string) => void;
    readonly onRunsMore: () => void;
    readonly className?: string;
    readonly "data-testid"?: string;
    readonly style?: CSSProperties;
}

/**
 * HappyAgentPipelinesPage — the team's pipelines on top, one compact row each
 * with its latest version and how its last run went; beneath them every run
 * of them, newest first, the running ones live. Read only; agents create and
 * run pipelines.
 */
export function HappyAgentPipelinesPage(props: HappyAgentPipelinesPageProps) {
    const snapshot = props.pipelines;
    const count = snapshot.pipelines.length;
    return (
        <div
            className={["happy-pipelines", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="happy-agent-pipelines"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            <ArtifactHeader
                className="happy-pipelines__header"
                subtitle={
                    snapshot.loading
                        ? "Loading…"
                        : `${String(count)} ${count === 1 ? "pipeline" : "pipelines"}`
                }
                title="Pipelines"
            />
            {snapshot.error ? (
                <div className="happy-pipelines__banner">
                    <Banner tone="danger" title="Pipelines may be out of date">
                        {snapshot.error.message}
                    </Banner>
                </div>
            ) : null}
            {snapshot.loading || count === 0 ? (
                <div className="happy-pipelines__empty">
                    <EmptyState
                        description={
                            snapshot.loading
                                ? "Reading this server's pipelines."
                                : "Agents create pipelines and run them. Ask an agent to set one up and it appears here."
                        }
                        icon={snapshot.loading ? "clock" : "pipeline"}
                        size="panel"
                        title={snapshot.loading ? "Loading pipelines…" : "No pipelines yet"}
                    />
                </div>
            ) : (
                <div className="happy-pipelines__stack">
                    <ScrollArea
                        className="happy-pipelines__strip"
                        viewportClassName="happy-pipelines__strip-viewport"
                    >
                        <div className="happy-pipelines__list" role="list">
                            {snapshot.pipelines.map((pipeline) => (
                                <PipelineRow
                                    key={pipeline.id}
                                    labels={props.labels}
                                    onOpen={props.onPipelineOpen}
                                    pipeline={pipeline}
                                />
                            ))}
                        </div>
                    </ScrollArea>
                    <section className="happy-pipeline-pane">
                        <header className="happy-pipeline-pane__header">
                            <span className="happy-pipeline-pane__title">Runs</span>
                        </header>
                        <ScrollArea
                            className="happy-pipeline-pane__scroll"
                            viewportClassName="happy-pipeline-pane__viewport"
                        >
                            <PipelineRunsAcrossList
                                labels={props.labels}
                                now={props.now}
                                onPipelineOpen={props.onPipelineOpen}
                                onRunOpen={props.onRunOpen}
                                onRunsMore={props.onRunsMore}
                                runs={snapshot.runs}
                            />
                        </ScrollArea>
                    </section>
                </div>
            )}
        </div>
    );
}

function PipelineRow(props: {
    readonly pipeline: PipelineSummary;
    readonly labels: PipelineLabels;
    readonly onOpen: (pipelineId: string) => void;
}) {
    const pipeline = props.pipeline;
    const run = pipeline.lastRun;
    return (
        <div className="happy-pipelines__item" role="listitem">
            <button
                className="happy-pipeline-row"
                data-happy-desktop-ui="pipeline-row"
                onClick={() => props.onOpen(pipeline.id)}
                title={pipeline.description ?? undefined}
                type="button"
            >
                <span aria-hidden className="happy-pipeline-row__glyph">
                    <Icon name="pipeline" size={14} />
                </span>
                <span className="happy-pipeline-row__name">{pipeline.name}</span>
                <span className="happy-pipeline-row__version">v{String(pipeline.headVersion)}</span>
                {pipeline.enabled ? null : (
                    <span className="happy-pipeline-row__disabled">Disabled</span>
                )}
                <span className="happy-pipeline-row__run">
                    {run === null ? (
                        <span className="happy-pipeline-row__never">Never run</span>
                    ) : (
                        <>
                            <PipelineStateMark
                                label={PIPELINE_RUN_STATE_LABEL[run.state]}
                                tone={PIPELINE_RUN_STATE_TONE[run.state]}
                            />
                            <span className="happy-pipeline-row__time">
                                {props.labels.time(run.endedAt ?? run.createdAt)}
                            </span>
                        </>
                    )}
                </span>
            </button>
        </div>
    );
}
