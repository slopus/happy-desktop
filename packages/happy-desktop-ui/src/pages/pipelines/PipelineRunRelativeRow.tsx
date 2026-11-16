import type { PipelineRunRelative } from "happy-desktop-state";
import { Icon } from "../../Icon";
import {
    PIPELINE_RUN_STATE_LABEL,
    PIPELINE_RUN_STATE_TONE,
    PipelineStateMark,
    pipelineDurationOf,
    pipelineRunRelativeProgress,
    type PipelineLabels,
} from "./pipelinePresentation";

export interface PipelineRunRelativeRowProps {
    readonly runId: string;
    /** Null until it has been read. */
    readonly relative: PipelineRunRelative | null;
    /** Its pipeline, when known before the run is read: a pipeline node names it. */
    readonly pipelineId: string | null;
    /** How it is tied to the run on screen, when the place it is shown does not say. */
    readonly via: string | null;
    readonly labels: PipelineLabels;
    /** Now, for how long a running run has taken so far. */
    readonly now: number;
    readonly onRunOpen: (runId: string) => void;
}

/**
 * PipelineRunRelativeRow — a run beside the one on screen, its parent or a
 * child, as one row that opens it: its pipeline, how it is tied to this run,
 * its state, and while it runs how far through its nodes it is.
 */
export function PipelineRunRelativeRow(props: PipelineRunRelativeRowProps) {
    const relative = props.relative;
    const pipelineId = relative?.pipelineId ?? props.pipelineId;
    const progress = relative ? pipelineRunRelativeProgress(relative) : null;
    return (
        <button
            className="happy-pipeline-relative"
            data-happy-desktop-ui="pipeline-run-relative"
            data-state={relative?.state}
            onClick={() => props.onRunOpen(props.runId)}
            type="button"
        >
            <span className="happy-pipeline-relative__glyph">
                <Icon name="pipeline" size={14} />
            </span>
            <span className="happy-pipeline-relative__body">
                <span className="happy-pipeline-relative__head">
                    <span className="happy-pipeline-relative__name">
                        {pipelineId === null ? "A run" : props.labels.pipeline(pipelineId)}
                    </span>
                    <span className="happy-pipeline-relative__duration">
                        {relative
                            ? (pipelineDurationOf(
                                  relative.startedAt,
                                  relative.endedAt,
                                  props.now,
                              ) ?? "")
                            : ""}
                    </span>
                </span>
                {props.via === null ? null : (
                    <span className="happy-pipeline-relative__via">{props.via}</span>
                )}
                <span className="happy-pipeline-relative__state">
                    {relative ? (
                        <PipelineStateMark
                            label={PIPELINE_RUN_STATE_LABEL[relative.state]}
                            tone={PIPELINE_RUN_STATE_TONE[relative.state]}
                        />
                    ) : (
                        <span className="happy-pipeline-relative__note">Reading…</span>
                    )}
                    {relative?.state === "running" && progress ? (
                        <span className="happy-pipeline-relative__note">{progress.text}</span>
                    ) : null}
                </span>
                {relative?.state === "running" ? (
                    <span
                        aria-hidden
                        className="happy-pipeline-relative__progress"
                        data-empty={progress?.progress === null ? "" : undefined}
                    >
                        <span
                            className="happy-pipeline-relative__progress-fill"
                            style={{ transform: `scaleX(${String(progress?.progress ?? 0)})` }}
                        />
                    </span>
                ) : null}
            </span>
        </button>
    );
}
