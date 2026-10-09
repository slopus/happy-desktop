import { type CSSProperties } from "react";
import { SegmentedProgress } from "../../src/SegmentedProgress";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-271";

const column: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
    width: "400px",
    maxWidth: "100%",
};

const RESTART_LABEL = "Restart progress";

export function SegmentedProgressPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="A sequence of named steps, drawn as one bar broken into one track per step. It says which part of a sequence is happening, which a single bar cannot: the steps are not interchangeable, and 40% of one continuous bar answers nothing. Every segment is the same width because the steps take wildly different times and are not comparable. A step that counts something reports its position inside itself; a step that cannot sweeps and claims nothing. 4px tracks, 8px between segments, 8px between a track and its label."
            title="Segmented progress"
        >
            <Specimen
                detail="Nothing counted yet, and counted at zero · both sweep"
                label="Opening"
                number="01"
                stage="surface"
            >
                <div style={column}>
                    <SegmentedProgress
                        label={RESTART_LABEL}
                        segments={[
                            { id: "drain", label: "Finishing work", state: "running" },
                            { id: "shutdown", label: "Shutting down", state: "pending" },
                            { id: "start", label: "Starting", state: "pending" },
                        ]}
                    />
                    <SegmentedProgress
                        label={RESTART_LABEL}
                        segments={[
                            {
                                fraction: 0,
                                id: "drain",
                                label: "Finishing work",
                                state: "running",
                            },
                            { id: "shutdown", label: "Shutting down", state: "pending" },
                            { id: "start", label: "Starting", state: "pending" },
                        ]}
                    />
                    <DimensionRule label="Equal thirds · 4px track · 8px gaps · empty never holds still" />
                </div>
            </Specimen>

            <Specimen
                detail="The running step counts itself · three of five operations left"
                label="Measured"
                number="02"
                stage="surface"
            >
                <div style={column}>
                    <SegmentedProgress
                        label={RESTART_LABEL}
                        segments={[
                            {
                                fraction: 0.4,
                                id: "drain",
                                label: "Finishing work",
                                state: "running",
                            },
                            { id: "shutdown", label: "Shutting down", state: "pending" },
                            { id: "start", label: "Starting", state: "pending" },
                        ]}
                    />
                    <DimensionRule label="Fill is the share provably done · eased, never backwards" />
                </div>
            </Specimen>

            <Specimen
                detail="A finished step stays full behind the one now running"
                label="Middle step"
                number="03"
                stage="surface"
            >
                <div style={column}>
                    <SegmentedProgress
                        label={RESTART_LABEL}
                        segments={[
                            { id: "drain", label: "Finishing work", state: "done" },
                            { id: "shutdown", label: "Shutting down", state: "running" },
                            { id: "start", label: "Starting", state: "pending" },
                        ]}
                    />
                </div>
            </Specimen>

            <Specimen
                detail="Last step running · everything before it complete"
                label="Last step"
                number="04"
                stage="surface"
            >
                <div style={column}>
                    <SegmentedProgress
                        label={RESTART_LABEL}
                        segments={[
                            { id: "drain", label: "Finishing work", state: "done" },
                            { id: "shutdown", label: "Shutting down", state: "done" },
                            { id: "start", label: "Starting", state: "running" },
                        ]}
                    />
                </div>
            </Specimen>

            <Specimen
                detail="Where the sequence stopped · the track carries the mark, not the fill"
                label="Failed"
                number="05"
                stage="surface"
            >
                <div style={column}>
                    <SegmentedProgress
                        label={RESTART_LABEL}
                        segments={[
                            { id: "drain", label: "Finishing work", state: "done" },
                            { id: "shutdown", label: "Shutting down", state: "done" },
                            { id: "start", label: "Starting", state: "failed" },
                        ]}
                    />
                    <DimensionRule label="A filled bar would claim the step completed" />
                </div>
            </Specimen>

            <Specimen
                detail="Two steps, and five · the segments divide whatever width they are given"
                label="Other sequences"
                number="06"
                stage="surface"
            >
                <div style={column}>
                    <SegmentedProgress
                        label="Export progress"
                        segments={[
                            { fraction: 0.7, id: "collect", label: "Collecting", state: "running" },
                            { id: "write", label: "Writing", state: "pending" },
                        ]}
                    />
                    <SegmentedProgress
                        label="Build progress"
                        segments={[
                            { id: "fetch", label: "Fetch", state: "done" },
                            { id: "install", label: "Install", state: "done" },
                            { id: "compile", label: "Compile", state: "running" },
                            { id: "bundle", label: "Bundle", state: "pending" },
                            { id: "sign", label: "Sign", state: "pending" },
                        ]}
                    />
                    <DimensionRule label="Labels ellipsize rather than wrap · rows never change height" />
                </div>
            </Specimen>

            <Specimen
                detail="User-paced sequence · current track is full-width at the median colour between completed and untouched"
                label="Onboarding steps"
                number="07"
                stage="surface"
            >
                <div
                    style={{
                        ...column,
                        background: "var(--button-primary-background)",
                        padding: "24px",
                    }}
                >
                    <SegmentedProgress
                        label="Onboarding steps"
                        mode="steps"
                        segments={[
                            { id: "setup", label: "Setup", state: "done" },
                            {
                                fraction: 1,
                                id: "subscriptions",
                                label: "Subscriptions",
                                state: "running",
                            },
                            { id: "get-app", label: "Get Mobile App", state: "pending" },
                        ]}
                        tone="inverse"
                    />
                    <DimensionRule label="complete 100% white · current 60% white · pending 20% white" />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
