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

/**
 * PipelineRunsList — a pipeline's runs, newest first, one dense row each:
 * state, version, who started it, when, and how long it took.
 */
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
                <div className="happy-pipeline-runs__list" role="list">
                    {runs.entries.map((run) => (
                        <div className="happy-pipeline-runs__item" key={run.id} role="listitem">
                            <button
                                className="happy-pipeline-run-row"
                                data-happy-desktop-ui="pipeline-run-row"
                                onClick={() => props.onRunOpen(run.id)}
                                type="button"
                            >
                                <span className="happy-pipeline-run-row__state">
                                    <PipelineStateMark
                                        label={PIPELINE_RUN_STATE_LABEL[run.state]}
                                        tone={PIPELINE_RUN_STATE_TONE[run.state]}
                                    />
                                </span>
                                <span className="happy-pipeline-run-row__version">
                                    v{String(run.version)}
                                </span>
                                <span className="happy-pipeline-run-row__trigger">
                                    {pipelineTriggerText(run.trigger, props.labels)}
                                </span>
                                <span className="happy-pipeline-run-row__time">
                                    {props.labels.time(run.createdAt)}
                                </span>
                                <span className="happy-pipeline-run-row__duration">
                                    {pipelineDurationOf(run.startedAt, run.endedAt, props.now) ??
                                        ""}
                                </span>
                            </button>
                        </div>
                    ))}
                </div>
            )}
            {runs.nextCursor !== null ? (
                <span className="happy-pipeline-runs__more">
                    <Button
                        loading={runs.loadingMore}
                        onClick={props.onRunsMore}
                        size="small"
                        variant="ghost"
                    >
                        Older runs
                    </Button>
                </span>
            ) : null}
        </div>
    );
}
