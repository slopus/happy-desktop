import { useState } from "react";
import { SearchField, WindowDragRegion } from "../../src/TitleBar";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-007";
const column: Record<string, string> = {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
};
export function SearchFieldPage() {
    const [value, setValue] = useState("");
    return (
        <ComponentPage
            number={componentNumber}
            summary="The search well, and the transparent drag target full-window screens put under the native title bar."
            title="SearchField + WindowDragRegion"
        >
            <Specimen
                detail="Transparent overlay for full-window states with no controls in the top lane"
                label="WindowDragRegion — authentication"
                number="01"
                stage="chrome"
            >
                <div
                    style={{
                        background: "var(--groupped-background)",
                        height: "120px",
                        position: "relative",
                        width: "720px",
                    }}
                >
                    <WindowDragRegion />
                    <DimensionRule label="720 × 38 px · transparent drag target" />
                </div>
            </Specimen>

            <Specimen
                detail="26px well · radius 6 · inset bg + hairline · 14px icon · 12px text · KeyCap hint"
                label="SearchField — fixed 420"
                number="02"
                stage="chrome"
            >
                <div style={column}>
                    <SearchField
                        onChange={setValue}
                        placeholder="Search messages, issues, runs…"
                        value={value}
                        width={420}
                    />
                    <SearchField
                        onChange={() => {}}
                        value="ENG-482 flaky auth refresh"
                        width={420}
                    />
                    <DimensionRule label="420 × 26 px" />
                </div>
            </Specimen>

            <Specimen
                detail="Fills its container by default; custom shortcutHint"
                label="SearchField — fluid + custom hint"
                number="03"
                stage="chrome"
            >
                <div style={{ ...column, width: "280px" }}>
                    <SearchField
                        onChange={setValue}
                        placeholder="Jump to…"
                        shortcutHint="⇧⌘P"
                        value={value}
                    />
                    <DimensionRule label="280 px container → 280 px field" />
                </div>
            </Specimen>

            <Specimen
                detail="Focus swaps the hairline for border-strong plus the accent focus ring — click to try"
                label="SearchField — focus"
                number="04"
                stage="chrome"
            >
                <SearchField
                    onChange={setValue}
                    placeholder="Click to focus"
                    value={value}
                    width={420}
                />
            </Specimen>

            <Specimen
                detail="200px field: long values and placeholders clip inside the well; the KeyCap keeps its 5px inset"
                label="SearchField — long-content truncation"
                number="05"
                stage="chrome"
            >
                <div style={column}>
                    <SearchField
                        onChange={() => {}}
                        value="Umbrella incident retrospective action items for Q3"
                        width={200}
                    />
                    <SearchField
                        onChange={setValue}
                        placeholder="Search every message, issue, agent run, and document…"
                        value={value}
                        width={200}
                    />
                    <DimensionRule label="200 × 26 px" />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
