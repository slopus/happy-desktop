import type { CSSProperties } from "react";

/**
 * Where one step of a sequence has got to.
 *
 * `running` is deliberately two things — a step that can measure itself and one
 * that cannot — because most steps of a real sequence cannot. A step draws its
 * fraction once it has one to draw, and sweeps while it has none or none of it
 * is done. `failed` is where a sequence stopped, not a step that finished badly.
 */
export type SegmentedProgressState = "pending" | "running" | "done" | "failed";

/** One step of the sequence, as one segment of the bar. */
export interface SegmentedProgressSegment {
    readonly id: string;
    readonly label: string;
    readonly state: SegmentedProgressState;
    /**
     * The share of this step provably done, 0 to 1. Present only on a `running`
     * step that genuinely counts something; a step that cannot measure itself
     * leaves it out. Zero is honest and worth reporting, and it draws the same
     * as absent: nothing has finished either way, so the segment sweeps until
     * there is a share of it to show.
     */
    readonly fraction?: number;
    /**
     * Returns to this step. Present only on a step the sequence can actually go
     * back to; the track and its label become one button, because they name one
     * place and two hit targets for one destination is two chances to miss.
     */
    onSelect?(): void;
}

export interface SegmentedProgressProps {
    /** User-paced steps highlight the current stage without implying background work. */
    readonly mode?: "progress" | "steps";
    readonly tone?: "default" | "inverse";
    /**
     * Whether each step names itself under its track. `hidden` is for a host that
     * already names the live step in its own words; the tracks keep their names
     * for a screen reader either way. Defaults to `visible`.
     */
    readonly labels?: "visible" | "hidden";
    readonly className?: string;
    readonly "data-testid"?: string;
    readonly style?: CSSProperties;
    /** Names the whole sequence for a screen reader; each segment names itself. */
    readonly label: string;
    readonly segments: readonly SegmentedProgressSegment[];
}

/**
 * C-271 SegmentedProgress — a sequence of named steps, as one bar broken into
 * one track per step.
 *
 * A single bar can only say how far along something is; this says which part of
 * it is happening. That matters when the steps are not interchangeable — someone
 * watching an agent restart cares whether their work is still finishing or the
 * process is already gone, and one continuous bar at 40% answers neither.
 *
 * Every segment is the same width, because the steps are not comparable in
 * duration and pretending otherwise would make the bar a schedule it cannot
 * keep. The bar reports the sequence's shape and which step of it is live; only
 * a step that counts something reports a position inside itself.
 *
 * A live step with nothing in it yet sweeps, whether or not it can count. The
 * bar is watched while it advances on its own, and an empty track holding still
 * is read as one that has died — which is the wrong thing to say at the exact
 * moment the step has only just begun.
 *
 * Props only: which steps exist and where each one stands belong to whatever is
 * running them.
 */
export function SegmentedProgress(props: SegmentedProgressProps) {
    return (
        <div
            aria-label={props.label}
            className={["happy-segmented-progress", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="segmented-progress"
            data-mode={props.mode}
            data-labels={props.labels === "hidden" ? "hidden" : undefined}
            data-tone={props.tone}
            data-testid={props["data-testid"]}
            role={props.mode === "steps" ? "list" : "group"}
            style={props.style}
        >
            {props.segments.map((segment) => {
                const fraction = segmentFraction(segment);
                const Segment = segment.onSelect ? "button" : "div";
                return (
                    <Segment
                        className="happy-segmented-progress__segment"
                        {...(segment.onSelect
                            ? { onClick: segment.onSelect, type: "button" as const }
                            : {})}
                        data-selectable={segment.onSelect ? "" : undefined}
                        data-happy-desktop-ui="segmented-progress-segment"
                        // Whether this segment has any ink in it, which is what
                        // decides between a position and a sweep. Zero counts as
                        // empty: a measured step that has not finished anything
                        // yet has exactly as much to show as an unmeasured one,
                        // and a bar drawn at a hard zero reads as stopped rather
                        // than as started. It is a fact about the step rather
                        // than a style, so the CSS reads it here instead of
                        // inferring it from the fill's width.
                        data-empty={(fraction ?? 0) === 0 ? "true" : "false"}
                        data-state={segment.state}
                        role={props.mode === "steps" ? "listitem" : undefined}
                        aria-current={
                            props.mode === "steps" &&
                            (segment.state === "running" || segment.state === "failed")
                                ? "step"
                                : undefined
                        }
                        aria-label={
                            props.mode === "steps"
                                ? `${segment.label}: ${segment.state === "done" ? "complete" : segment.state === "pending" ? "upcoming" : segment.state === "failed" ? "needs attention" : "current step"}${segment.onSelect ? ", go back to this step" : ""}`
                                : undefined
                        }
                        key={segment.id}
                    >
                        <span
                            aria-hidden={props.mode === "steps" ? true : undefined}
                            aria-label={props.mode === "steps" ? undefined : segment.label}
                            aria-valuemax={props.mode === "steps" ? undefined : 100}
                            aria-valuemin={props.mode === "steps" ? undefined : 0}
                            // Absent exactly where nothing is known: a step that
                            // is running without counting, and a step the
                            // sequence stopped on. Either way a number here
                            // would be invented.
                            aria-valuenow={
                                props.mode === "steps" || fraction === undefined
                                    ? undefined
                                    : Math.round(fraction * 100)
                            }
                            className="happy-segmented-progress__track"
                            data-happy-desktop-ui="segmented-progress-track"
                            role={props.mode === "steps" ? undefined : "progressbar"}
                        >
                            <span
                                className="happy-segmented-progress__fill"
                                data-happy-desktop-ui="segmented-progress-fill"
                                style={
                                    { "--happy-progress": String(fraction ?? 0) } as CSSProperties
                                }
                            />
                        </span>
                        <span
                            className="happy-segmented-progress__label"
                            data-happy-desktop-ui="segmented-progress-label"
                        >
                            {segment.label}
                        </span>
                    </Segment>
                );
            })}
        </div>
    );
}

/**
 * How much of one segment is filled, or nothing when no share is known.
 *
 * A failed step fills nothing: the fill is what has been done, and the segment
 * says the sequence ended here through its colour instead. Filling it would
 * claim the step completed, which is the one thing that did not happen.
 */
function segmentFraction(segment: SegmentedProgressSegment): number | undefined {
    switch (segment.state) {
        case "pending":
            return 0;
        case "done":
            return 1;
        case "failed":
            return undefined;
        case "running":
            return segment.fraction === undefined
                ? undefined
                : Math.min(1, Math.max(0, segment.fraction));
    }
}
