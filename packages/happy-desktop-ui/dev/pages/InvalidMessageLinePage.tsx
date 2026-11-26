import { type CSSProperties } from "react";
import { InvalidMessageLine } from "../../src/InvalidMessageLine";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-353";

const column: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    width: "640px",
};

export function InvalidMessageLinePage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="A message the server sent that this build could not read, in the place it would have taken: one muted italic line and Report bug, which opens the bug report prefilled with the message and what was wrong with it."
            title="Invalid message line"
        >
            <Specimen
                detail="36px row · transcript inset · 14/20 italic secondary text · small ghost button"
                label="With Report bug"
                number="01"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div style={column}>
                        <InvalidMessageLine onReport={() => undefined} />
                    </div>
                    <DimensionRule label="640 px wide · 36 px tall" />
                </div>
            </Specimen>
            <Specimen
                detail="No Happy Agent to report to: the line alone"
                label="Without a report"
                number="02"
                stage="surface"
            >
                <div style={column}>
                    <InvalidMessageLine />
                </div>
            </Specimen>
            <Specimen
                detail="A narrow transcript ends the sentence in an ellipsis; the button keeps its size"
                label="Narrow"
                number="03"
                stage="surface"
            >
                <div style={{ ...column, width: "280px" }}>
                    <InvalidMessageLine onReport={() => undefined} />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
