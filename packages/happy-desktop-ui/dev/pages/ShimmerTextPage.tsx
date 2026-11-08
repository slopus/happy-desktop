import { ShimmerText, type ShimmerTextTone } from "../../src/ShimmerText";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-254";

const column: Record<string, string> = {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
};

const row: Record<string, string> = {
    display: "flex",
    alignItems: "center",
    gap: "24px",
    flexWrap: "wrap",
};

const cell: Record<string, string> = {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "8px",
    minWidth: "220px",
};

const caption: Record<string, string> = {
    color: "var(--text-secondary)",
    fontFamily: "var(--happy-font-mono)",
    fontSize: "10px",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
};

const card: Record<string, string> = {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    padding: "20px 24px",
    border: "1px solid var(--divider)",
    borderRadius: "10px",
    background: "var(--surface)",
};

const TONES: readonly ShimmerTextTone[] = ["default", "muted", "accent"];

/**
 * Every frame on this page is parked. The sweep is a continuously moving
 * gradient, so a live specimen would photograph differently on every capture;
 * `phase` holds each one on a known position instead, and the filmstrip below
 * shows the travel by stepping that position rather than by waiting.
 *
 * The strip covers the half of the loop the band is actually on the line for,
 * from its arrival at the left edge to its exit past the right. The frames
 * either side of that are the label at rest, which specimen 01 already shows.
 */
const PHASES: readonly number[] = [0.25, 0.375, 0.5, 0.625, 0.75];

export function ShimmerTextPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="A band of light travelling through a line of text, for a label waiting on work whose progress cannot be counted. The glyphs are clipped out of a moving gradient, so nothing reflows and the text stays readable at every moment of the loop."
            title="Shimmer text"
        >
            <Specimen
                detail="The three tones at a parked mid-sweep position"
                label="Tones"
                number="01"
                stage="surface"
            >
                <div style={column}>
                    <div style={row}>
                        {TONES.map((tone) => (
                            <div key={tone} style={cell}>
                                <span style={caption}>{tone}</span>
                                <ShimmerText phase={0.5} tone={tone}>
                                    Preparing this workspace’s checkout
                                </ShimmerText>
                            </div>
                        ))}
                    </div>
                    <DimensionRule label="Sweep 1600ms · linear · ramp 300% of the text width" />
                </div>
            </Specimen>

            <Specimen
                detail="Which end of the tone the letters rest at: lift dims them and sweeps full strength through, sheen keeps them at full strength and sweeps pale"
                label="Sweep"
                number="02"
                stage="surface"
            >
                <div style={column}>
                    <div style={row}>
                        <div style={cell}>
                            <span style={caption}>lift · default</span>
                            <ShimmerText phase={0.5}>
                                Preparing this workspace’s checkout
                            </ShimmerText>
                        </div>
                        <div style={cell}>
                            <span style={caption}>sheen</span>
                            <ShimmerText phase={0.5} sweep="sheen">
                                Preparing this workspace’s checkout
                            </ShimmerText>
                        </div>
                    </div>
                    <span style={caption}>
                        sheen beside plain text it has to stay as legible as
                    </span>
                    <div style={row}>
                        <span>Retry policy rewrite</span>
                        <ShimmerText phase={0.5} sweep="sheen">
                            Retry policy rewrite
                        </ShimmerText>
                        <span>Shimmer text component</span>
                    </div>
                </div>
            </Specimen>

            <Specimen
                detail="One sweep stepped across the loop; each frame is parked, so the travel is visible without waiting for it"
                label="Filmstrip"
                number="03"
                stage="surface"
            >
                <div style={column}>
                    {PHASES.map((phase) => (
                        <div key={phase} style={cell}>
                            <span style={caption}>phase {phase}</span>
                            <ShimmerText phase={phase} tone="muted">
                                Creating “Retry policy rewrite”
                            </ShimmerText>
                        </div>
                    ))}
                </div>
            </Specimen>

            <Specimen
                detail="The band is a proportion of the run, so one sweep crosses a short and a long label in the same time"
                label="Text lengths"
                number="04"
                stage="surface"
            >
                <div style={column}>
                    <ShimmerText phase={0.5} tone="muted">
                        Working
                    </ShimmerText>
                    <ShimmerText phase={0.5} tone="muted">
                        Reading the repository
                    </ShimmerText>
                    <ShimmerText phase={0.5} tone="muted">
                        HappyAgent is preparing this workspace’s checkout and will run the first
                        message as soon as it is there
                    </ShimmerText>
                </div>
            </Specimen>

            <Specimen
                detail="Inherited typography: the effect paints the text it is given and changes none of its metrics"
                label="In context"
                number="05"
                stage="app"
            >
                <div style={card}>
                    <span style={{ fontSize: "15px", fontWeight: "600" }}>
                        <ShimmerText phase={0.35}>Creating “Workspace (8)”</ShimmerText>
                    </span>
                    <span style={{ fontSize: "13px", lineHeight: "18px" }}>
                        <ShimmerText phase={0.6} tone="muted">
                            Chats can be started and written into now.
                        </ShimmerText>
                    </span>
                    <span
                        style={{
                            fontFamily: "var(--happy-font-mono)",
                            fontSize: "12px",
                        }}
                    >
                        <ShimmerText phase={0.45} tone="muted">
                            /Users/steve/Happy/Workspaces/happy-desktop/workspace-8
                        </ShimmerText>
                    </span>
                </div>
            </Specimen>

            <Specimen
                detail="An inline run breaks where its words would and carries one band across every line it wraps onto, parked at the same steps as the filmstrip"
                label="Wrapping inline"
                number="06"
                stage="app"
            >
                <div style={column}>
                    {PHASES.map((phase) => (
                        <div key={phase} style={{ ...cell, width: "280px" }}>
                            <span style={caption}>phase {phase}</span>
                            <span style={{ fontSize: "14px", lineHeight: "21px" }}>
                                Packaging is running in{" "}
                                <span style={{ textDecoration: "underline" }}>
                                    <ShimmerText inline phase={phase} sweep="sheen" tone="inherit">
                                        the long release packaging task
                                    </ShimmerText>
                                </span>{" "}
                                and should finish soon.
                            </span>
                        </div>
                    ))}
                </div>
            </Specimen>

            <Specimen
                detail="Live, unparked: the only specimen on this page that animates, and the one to review cadence against"
                label="Running"
                number="07"
                stage="surface"
            >
                <div style={column}>
                    <ShimmerText tone="muted">Preparing this workspace’s checkout</ShimmerText>
                    <ShimmerText durationMs={900} tone="muted">
                        Faster — 900ms
                    </ShimmerText>
                    <ShimmerText durationMs={2600} tone="muted">
                        Slower — 2600ms
                    </ShimmerText>
                    <ShimmerText sweep="sheen">Sheen, at the sidebar’s own cadence</ShimmerText>
                </div>
            </Specimen>
        </ComponentPage>
    );
}
