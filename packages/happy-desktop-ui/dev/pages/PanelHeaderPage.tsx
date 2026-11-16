import { Button } from "../../src/Button";
import { PanelHeader } from "../../src/PanelHeader";
import { TabbedPane } from "../../src/TabbedPane";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-162";

const column: Record<string, string> = {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
};

/* The two columns the band spans, so the specimen shows the alignment the
   component exists for rather than an isolated empty box. */
const columns: Record<string, string> = {
    display: "flex",
    width: "820px",
    height: "260px",
    border: "1px solid var(--divider)",
    background: "var(--surface)",
};

const workspace: Record<string, string> = {
    display: "flex",
    flex: "1",
    flexDirection: "column",
    minWidth: "0",
};

const panel: Record<string, string> = {
    display: "flex",
    flexDirection: "column",
    width: "300px",
    borderLeft: "1px solid var(--divider)",
};

const body: Record<string, string> = {
    display: "flex",
    flex: "1",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--text-secondary)",
    fontSize: "12px",
};

export function PanelHeaderPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="56px band across the top of a docked panel column, so the columns' headers read as one band and their content starts on the same line. Legitimately empty, and the window's drag lane on that edge."
            title="PanelHeader"
        >
            <Specimen
                detail="empty band · 56px · transparent · no hairline of its own"
                label="Empty"
                number="01"
                stage="app"
            >
                <div style={column}>
                    <div style={{ width: "300px", border: "1px solid var(--divider)" }}>
                        <PanelHeader />
                    </div>
                    <DimensionRule label="56 px high · 16 px x-pad · transparent" />
                </div>
            </Specimen>
            <Specimen
                detail="two columns, each under its own band: both tab strips start at y = 56"
                label="Aligned with the surface beside it"
                number="02"
                stage="app"
            >
                <div style={column}>
                    <div style={columns}>
                        <div style={workspace}>
                            <PanelHeader>happy</PanelHeader>
                            <TabbedPane
                                activeId="one"
                                onSelect={() => {}}
                                tabs={[
                                    { id: "one", label: "Session one" },
                                    { id: "two", label: "Session two" },
                                ]}
                            >
                                <div style={body}>Conversation</div>
                            </TabbedPane>
                        </div>
                        <div style={panel}>
                            <PanelHeader />
                            <TabbedPane
                                actions={
                                    <Button
                                        aria-label="New terminal"
                                        icon="plus"
                                        iconOnly
                                        size="small"
                                        variant="ghost"
                                    />
                                }
                                activeId="terminal"
                                onSelect={() => {}}
                                tabs={[{ id: "terminal", label: "Terminal 1", icon: "terminal" }]}
                            >
                                <div style={body}>Terminal</div>
                            </TabbedPane>
                        </div>
                    </div>
                    <DimensionRule label="both bands 56 px · both tab bars at y = 56" />
                </div>
            </Specimen>
            <Specimen
                detail="the band carries content when a panel has something for this row"
                label="With content"
                number="03"
                stage="app"
            >
                <div style={column}>
                    <div style={{ width: "300px", border: "1px solid var(--divider)" }}>
                        <PanelHeader>
                            <span style={{ fontSize: "15px", fontWeight: "600" }}>Tools</span>
                        </PanelHeader>
                    </div>
                    <DimensionRule label="children are centered on the 56 px band" />
                </div>
            </Specimen>
            <Specimen
                detail="edge-docked chrome uses the shared 12px panel inset"
                label="With edge control"
                number="04"
                stage="app"
            >
                <div style={column}>
                    <div style={{ width: "300px", border: "1px solid var(--divider)" }}>
                        <PanelHeader edgeControl>
                            <Button
                                aria-label="Hide panel"
                                icon="panel-collapse"
                                iconOnly
                                size="small"
                                variant="ghost"
                            />
                        </PanelHeader>
                    </div>
                    <DimensionRule label="control at x = 12 px · 28 px square" />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
