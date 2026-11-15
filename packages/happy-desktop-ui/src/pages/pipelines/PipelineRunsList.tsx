import type { PipelineRuns } from "happy-desktop-state";
import { Banner } from "../../Banner";
import { Button } from "../../Button";
import {
    PIPELINE_RUN_STATE_LABEL,
    PIPELINE_RUN_STATE_TONE,
    PipelineStateMark,
    pipelineDurationOf,
    pipelineTriggerText,
    type PipelineLabels,
} from "./pipelinePresentation";

export interface PipelineRunsListProps {
    readonly runs: PipelineRuns;
    readonly labels: PipelineLabels;
    /** Now, for how long a running run has taken so far. */
    readonly now: number;
    readonly onRunOpen: (runId: string) => void;
    readonly onRunsMore: () => void;
}

/** PipelineRunsList — a pipeline's runs, newest first: state, version, who started it, when. */
export function PipelineRunsList(props: PipelineRunsListProps) {
    const runs = props.runs;
    return (
        <div className="happy-pipeline-runs" data-happy-desktop-ui="pipeline-runs">
            {runs.error ? (
                <Banner tone="danger" title="Runs may be out of date">
                    {runs.error.message}
                </Banner>
            ) : null}
            {runs.loading ? (
                <p className="happy-pipeline-detail__note">Reading the runs…</p>
            ) : runs.entries.length === 0 ? (
                <p className="happy-pipeline-detail__note">
                    Not run yet. Agents allowed to start it run it with run_pipeline.
                </p>
            ) : (
                <div className="happy-pipeline-versions" role="list">
                    {runs.entries.map((run) => {
                        const duration = pipelineDurationOf(run.startedAt, run.endedAt, props.now);
                        return (
                            <div
                                className="happy-pipeline-versions__item"
                                key={run.id}
                                role="listitem"
                            >
                                <button
                                    className="happy-pipeline-version"
                                    data-happy-desktop-ui="pipeline-run-row"
                                    onClick={() => props.onRunOpen(run.id)}
                                    type="button"
                                >
                                    <span className="happy-pipeline-version__head">
                                        <PipelineStateMark
                                            label={PIPELINE_RUN_STATE_LABEL[run.state]}
                                            tone={PIPELINE_RUN_STATE_TONE[run.state]}
                                        />
                                        <span className="happy-pipeline-version__meta">
                                            Version {String(run.version)}
                                        </span>
                                    </span>
                                    <span className="happy-pipeline-version__meta">
                                        {[
                                            pipelineTriggerText(run.trigger, props.labels),
                                            props.labels.time(run.createdAt),
                                            duration,
                                        ]
                                            .filter(Boolean)
                                            .join(" · ")}
                                    </span>
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
            {runs.nextCursor !== null ? (
                <Button
                    loading={runs.loadingMore}
                    onClick={props.onRunsMore}
                    size="small"
                    variant="ghost"
                >
                    Older runs
                </Button>
            ) : null}
        </div>
    );
}
