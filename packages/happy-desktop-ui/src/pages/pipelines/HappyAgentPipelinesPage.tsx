import type { CSSProperties } from "react";
import type { PipelineSummary, PipelinesSnapshot } from "happy-desktop-state";
import { Banner } from "../../Banner";
import { EmptyState } from "../../EmptyState";
import { Icon } from "../../Icon";
import { ScrollArea } from "../../Scrollbar";
import { ArtifactHeader } from "../artifacts/ArtifactHeader";
import {
    PIPELINE_RUN_STATE_LABEL,
    PIPELINE_RUN_STATE_TONE,
    PipelineStateMark,
    type PipelineLabels,
} from "./pipelinePresentation";

export interface HappyAgentPipelinesPageProps {
    readonly pipelines: PipelinesSnapshot;
    readonly labels: PipelineLabels;
    readonly onPipelineOpen: (pipelineId: string) => void;
    readonly className?: string;
    readonly "data-testid"?: string;
    readonly style?: CSSProperties;
}

/**
 * HappyAgentPipelinesPage — the team's pipelines: each one's name, latest
 * version, and how its last run went. Read only; agents create and run them.
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
            <ScrollArea
                className="happy-pipelines__scroll"
                viewportClassName="happy-pipelines__scroll-viewport"
            >
                <div className="happy-pipelines__content">
                    {snapshot.error ? (
                        <Banner tone="danger" title="Pipelines may be out of date">
                            {snapshot.error.message}
                        </Banner>
                    ) : null}
                    {snapshot.loading || count === 0 ? (
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
                    ) : (
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
                    )}
                </div>
            </ScrollArea>
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
                type="button"
            >
                <span aria-hidden className="happy-pipeline-row__mark">
                    <Icon name="pipeline" size={18} />
                </span>
                <span className="happy-pipeline-row__text">
                    <span className="happy-pipeline-row__name">{pipeline.name}</span>
                    <span className="happy-pipeline-row__meta">
                        {[
                            `Version ${String(pipeline.headVersion)}`,
                            pipeline.enabled ? null : "Disabled",
                            pipeline.description,
                        ]
                            .filter(Boolean)
                            .join(" · ")}
                    </span>
                </span>
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
