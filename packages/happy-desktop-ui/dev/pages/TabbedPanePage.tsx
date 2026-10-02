import { Button } from "../../src/Button";
import { EmptyState } from "../../src/EmptyState";
import { commandShortcut } from "../../src/keyboardShortcut";
import { MenuButton } from "../../src/MenuButton";
import { type MenuItem } from "../../src/Menu";
import { TabbedPane } from "../../src/TabbedPane";
import { type TabItem } from "../../src/Tabs";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-160";
const sessionShortcut = commandShortcut("t");

const sessionTabs: TabItem[] = [
    { id: "one", label: "Refactor the router" },
    { id: "two", label: "Fix the flaky upload test", busy: true },
    { id: "three", label: "workspace.ts", icon: "doc", preview: true },
];

const longTabs: TabItem[] = [
    { id: "one", label: "Collapse the session list into one screen per folder" },
    { id: "two", label: "Address local sessions by URL through a cloud-shaped router" },
    { id: "three", label: "Rebuild the composer model control" },
    { id: "four", label: "Untitled session" },
];

const historyItems: MenuItem[] = [
    { id: "a", kind: "item", label: "Rebuild the composer model control", icon: "chat" },
    { id: "b", kind: "item", label: "Address sessions by URL", icon: "history" },
];

function Body(props: { title: string }) {
    return (
        <EmptyState
            description="The active tab's content fills the rest of the pane."
            icon="chat"
            size="panel"
            title={props.title}
        />
    );
}

function Pane(props: {
    active: string;
    withShortcut?: boolean;
    tabs: TabItem[];
    withAction?: boolean;
    withClose?: boolean;
    withReorder?: boolean;
    withTrailing?: boolean;
}) {
    return (
        <div
            style={{
                border: "1px solid var(--divider)",
                display: "flex",
                height: "260px",
                width: "560px",
            }}
        >
            <TabbedPane
                actions={
                    props.withAction ? (
                        <Button
                            aria-label="New tab"
                            icon="plus"
                            iconOnly
                            onClick={() => {}}
                            shortcut={props.withShortcut ? sessionShortcut : undefined}
                            size="small"
                            variant="ghost"
                        />
                    ) : undefined
                }
                activeId={props.active}
                closeLabel="Close session"
                onClose={props.withClose ? () => {} : undefined}
                onReorder={props.withReorder ? () => {} : undefined}
                onSelect={() => {}}
                tabs={props.tabs}
                trailing={
                    props.withTrailing ? (
                        <MenuButton
                            align="end"
                            icon="history"
                            iconSize={12}
                            items={historyItems}
                            label="Show recent sessions"
                            menuLabel="Recent sessions"
                            menuWidth={240}
                            onSelect={() => {}}
                        />
                    ) : undefined
                }
            >
                <Body title="Active tab body" />
            </TabbedPane>
        </div>
    );
}

export function TabbedPanePage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="A Tabs bar over a body that takes the remaining height — peer documents inside one surface, with optional trailing bar actions and truncating tab labels."
            title="Tabbed pane"
        >
            <div className="specimen-grid">
                <Specimen
                    detail="32px bar · body fills the rest"
                    label="Tabs over a body"
                    number="T-01"
                    stage="app"
                >
                    <div style={{ padding: "24px" }}>
                        <Pane active="one" tabs={sessionTabs} />
                        <DimensionRule label="bar 32 · every tab 160 wide · body flex 1 · min-height 0" />
                    </div>
                </Specimen>
                <Specimen
                    detail="trailing add-tab control on the bar hairline"
                    label="Bar actions"
                    number="T-02"
                    stage="app"
                >
                    <div style={{ padding: "24px" }}>
                        <Pane active="two" tabs={sessionTabs} withAction />
                        <DimensionRule label="actions pad 0 8 · gap 4" />
                    </div>
                </Specimen>
                <Specimen
                    detail="the tabs shrink together down to the minimum, then the strip scrolls; the active tab is revealed at the trailing edge and the action stays visible outside the clip"
                    label="Many long tabs"
                    number="T-03"
                    stage="app"
                >
                    <div style={{ padding: "24px" }}>
                        <Pane active="four" tabs={longTabs} withAction withTrailing />
                        <DimensionRule label="tab 160 shrinking to 88 · equal widths · label ellipsis · active revealed · strip scrolls" />
                    </div>
                </Specimen>
                <Specimen
                    detail="the trailing control holds the bar's far edge whether the strip is short or overflowing, on the 16px header gutter"
                    label="Pinned trailing control"
                    number="T-07"
                    stage="app"
                >
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "16px",
                            padding: "24px",
                        }}
                    >
                        <Pane active="one" tabs={sessionTabs} withAction withTrailing />
                        <Pane active="one" tabs={longTabs} withAction withTrailing />
                        <DimensionRule label="trailing margin-left auto · pad 0 16 0 8 · gap 4" />
                    </div>
                </Specimen>
                <Specimen
                    detail="close shows on the active tab and on hover of any other"
                    label="Closable and preview tabs"
                    number="T-04"
                    stage="app"
                >
                    <div style={{ padding: "24px" }}>
                        <Pane active="two" tabs={sessionTabs} withAction withClose />
                        <DimensionRule label="preview title italic · close 16 × 16 at the tab's far edge" />
                    </div>
                </Specimen>
                <Specimen
                    detail="drag a tab to rearrange; the cursor stays a pointer until the tab is actually carried, neighbours slide, and the drag reports once"
                    label="Draggable tabs"
                    number="T-05"
                    stage="app"
                >
                    <div style={{ padding: "24px" }}>
                        <Pane active="one" tabs={sessionTabs} withAction withClose withReorder />
                        <DimensionRule label="cursor pointer → grabbing · threshold 4 · shift = dragged width · ease 140ms" />
                    </div>
                </Specimen>
                <Specimen
                    detail="The add-session action stays the same square plus button at rest, on hover, and while Command is held; its Cmd-T cap floats below without moving the strip."
                    label="Bar-action shortcut — stable geometry"
                    number="T-06"
                    stage="app"
                >
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "16px",
                            padding: "24px",
                        }}
                    >
                        {[
                            { held: false, label: "REST" },
                            { held: true, label: "COMMAND HELD" },
                        ].map((state) => (
                            <div
                                data-shortcut-hints={state.held ? "" : undefined}
                                key={state.label}
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "8px",
                                }}
                            >
                                <span
                                    style={{
                                        color: "var(--text-secondary)",
                                        font: "var(--font-caption)",
                                    }}
                                >
                                    {state.label}
                                </span>
                                <Pane active="one" tabs={sessionTabs} withAction withShortcut />
                            </div>
                        ))}
                        <DimensionRule label="action 28 square in every state · cap floats below" />
                    </div>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
