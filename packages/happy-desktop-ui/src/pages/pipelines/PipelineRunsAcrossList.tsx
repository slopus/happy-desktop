import type { PipelineRunListEntry, PipelinesRuns } from "happy-desktop-state";
import { pipelineRunAbortable } from "happy-desktop-state";
import { Banner } from "../../Banner";
import { Button } from "../../Button";
import { Ionicon } from "../../vectorIcons/VectorIcon";
import {
    PIPELINE_RUN_STATE_LABEL,
    PIPELINE_RUN_STATE_TONE,
    PipelineStateMark,
    pipelineDurationOf,
    pipelineTriggerText,
    type PipelineLabels,
} from "./pipelinePresentation";

export interface PipelineRunsAcrossListProps {
    readonly runs: PipelinesRuns;
    readonly labels: PipelineLabels;
    /** Now, for how long a running run has taken so far. */
    readonly now: number;
    readonly onRunOpen: (runId: string) => void;
    readonly onPipelineOpen: (pipelineId: string) => void;
    readonly onRunsMore: () => void;
}

/**
 * PipelineRunsAcrossList — every pipeline's runs together, newest first, one
 * dense row each: state, which pipeline, version, who started it, when, and
 * how long it took or has taken so far. The row opens the run; the
 * pipeline's name opens the pipeline, unless it was archived.
 *
 * Child runs keep their place in time, so nothing moves when a parent pages
 * in: each is marked as a child, and says which run it came from when that
 * run is on the page.
 */
export function PipelineRunsAcrossList(props: PipelineRunsAcrossListProps) {
    const runs = props.runs;
    const byId = new Map(runs.entries.map((run) => [run.id, run]));
    /** Who started a run: an agent, or for a child the run and node it came from. */
    const startedBy = (run: PipelineRunListEntry): string => {
        if (run.trigger?.kind !== "pipeline")
            return run.parentRunId === null
                ? pipelineTriggerText(run.trigger, props.labels)
                : "A parent run";
        const parent = byId.get(run.trigger.runId);
        return parent
            ? `From ${parent.pipelineName} · ${run.trigger.nodeId}`
            : `Child of a run, from its node ${run.trigger.nodeId}`;
    };
    return (
        <div className="happy-pipeline-runs" data-happy-desktop-ui="pipeline-runs-across">
            {runs.error ? (
                <Banner tone="danger" title="Runs may be out of date">
                    {runs.error.message}
                </Banner>
            ) : null}
            {!runs.listed ? (
                <p className="happy-pipeline-detail__note">
                    {
                        "This server lists runs on each pipeline's own page. Open a pipeline to see its runs."
                    }
                </p>
            ) : runs.loading ? (
                <p className="happy-pipeline-detail__note">Reading the runs…</p>
            ) : runs.entries.length === 0 ? (
                <p className="happy-pipeline-detail__note">
                    No runs yet. Agents allowed to start a pipeline run it with run_pipeline.
                </p>
            ) : (
                <div className="happy-pipeline-runs__list" role="list">
                    {runs.entries.map((run) => {
                        const live = pipelineRunAbortable(run.state);
                        const state = PIPELINE_RUN_STATE_LABEL[run.state];
                        const trigger = startedBy(run);
                        const child = run.parentRunId !== null;
                        return (
                            <div
                                className="happy-pipeline-runs__item happy-pipeline-run-across"
                                data-archived={run.pipelineArchived ? "" : undefined}
                                data-child={child ? "" : undefined}
                                data-live={live ? "" : undefined}
                                key={run.id}
                                role="listitem"
                            >
                                {/* Covers the row, under the pipeline's own button. */}
                                <button
                                    aria-label={`${run.pipelineName}, ${state}, started by ${trigger}, ${props.labels.time(run.createdAt)}`}
                                    className="happy-pipeline-run-across__open"
                                    data-happy-desktop-ui="pipeline-run-across"
                                    onClick={() => props.onRunOpen(run.id)}
                                    type="button"
                                />
                                <span className="happy-pipeline-run-row__state">
                                    <PipelineStateMark
                                        label={state}
                                        tone={PIPELINE_RUN_STATE_TONE[run.state]}
                                    />
                                </span>
                                <span className="happy-pipeline-run-across__pipeline">
                                    {child ? (
                                        <span
                                            className="happy-pipeline-run-across__child"
                                            title="A child run, started by a pipeline node"
                                        >
                                            <Ionicon name="return-down-forward-outline" size={12} />
                                        </span>
                                    ) : null}
                                    {run.pipelineArchived ? (
                                        <span
                                            className="happy-pipeline-run-across__pipeline-name"
                                            title={`${run.pipelineName} was archived`}
                                        >
                                            {run.pipelineName}
                                        </span>
                                    ) : (
                                        <button
                                            className="happy-pipeline-run-across__pipeline-name"
                                            onClick={() => props.onPipelineOpen(run.pipelineId)}
                                            title={`Open ${run.pipelineName}`}
                                            type="button"
                                        >
                                            {run.pipelineName}
                                        </button>
                                    )}
                                </span>
                                <span className="happy-pipeline-run-row__version">
                                    v{String(run.version)}
                                </span>
                                <span className="happy-pipeline-run-row__trigger">{trigger}</span>
                                <span className="happy-pipeline-run-row__time">
                                    {props.labels.time(run.createdAt)}
                                </span>
                                <span className="happy-pipeline-run-row__duration">
                                    {pipelineDurationOf(run.startedAt, run.endedAt, props.now) ??
                                        ""}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}
            {runs.listed && runs.nextCursor !== null ? (
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
