import { type CSSProperties } from "react";
import { TurnSummary } from "../../src/TurnSummary";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-164";

const column: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    width: "640px",
};

export function TurnSummaryPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="The neutral settled footer for a turn: total duration, token detail on hover, steering boundary, final-message copy confirmation, and the edit action that gives a stopped request back to the composer. Failure detail belongs to ConversationErrorCard above it."
            title="Turn summary"
        >
            <Specimen
                detail="Message-sized type · hover reveals used tokens and final context · copy changes to a check after success"
                label="Completed"
                number="01"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div style={column}>
                        <TurnSummary
                            copyText="The migration completed successfully."
                            durationMs={104_000}
                            finalContextTokens={184_320}
                            status="complete"
                            usedTokens={42_781}
                        />
                        <TurnSummary copyText="Done." durationMs={7_000} status="complete" />
                    </div>
                    <DimensionRule label="640 px wide · 16/24 message type" />
                </div>
            </Specimen>
            <Specimen
                detail="A failed turn uses the same neutral completion wording; its error card carries the outcome"
                label="After an error"
                number="02"
                stage="surface"
            >
                <div style={column}>
                    <TurnSummary
                        copyText="The provider connection failed."
                        durationMs={41_000}
                        status="complete"
                    />
                    <TurnSummary copyText="The run stopped." status="complete" />
                    <TurnSummary durationMs={18_000} status="steered" />
                </div>
            </Specimen>
            <Specimen
                detail="A stopped turn leads with an edit action that puts the reader's message back in the composer · with no message of theirs to give back, it reads as the outcome alone"
                label="Stopped"
                number="03"
                stage="surface"
            >
                <div style={column}>
                    <TurnSummary
                        durationMs={4_000}
                        onEdit={() => undefined}
                        reason="abort"
                        status="failed"
                    />
                    <TurnSummary durationMs={96_000} reason="abort" status="failed" />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
