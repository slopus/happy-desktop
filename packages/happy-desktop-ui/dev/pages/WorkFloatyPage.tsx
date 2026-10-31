import { useState } from "react";
import { TabbedPane } from "../../src/TabbedPane";
import { WorkFloaty, type WorkFloatyProps, type WorkFloatyRow } from "../../src/WorkFloaty";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

export const componentNumber = "C-299";

const folder: WorkFloatyRow = {
    id: "folder",
    label: "redesign",
    mark: { type: "folder" },
    trailing: { type: "changes", added: 24, deleted: 0 },
};
const desktop: WorkFloatyRow = {
    id: "desktop",
    label: "redesign-experimental",
    mark: { type: "project", label: "Project: happy-desktop", initials: "D" },
    trailing: { type: "changes", added: 186, deleted: 41 },
};
const agent: WorkFloatyRow = {
    id: "agent",
    label: "sync-api",
    mark: { type: "project", label: "Project: happy-agent", initials: "A" },
    trailing: { type: "changes", added: 1240, deleted: 312 },
};
const spec: WorkFloatyRow = {
    id: "spec",
    label: "Sidebar tree spec",
    mark: { type: "icon", icon: "doc" },
};
const running: WorkFloatyRow = {
    id: "icon-pilot",
    label: "Icon pilot",
    mark: { type: "icon", icon: "agents" },
    trailing: { type: "working", label: "Icon pilot is working" },
};
const done: WorkFloatyRow = {
    id: "astra",
    label: "Astra UX review",
    mark: { type: "icon", icon: "agents" },
    trailing: { type: "tokens", count: 12_400 },
};
const history: readonly WorkFloatyRow[] = [
    { id: "research", label: "Team agents research", mark: { type: "icon", icon: "agents" } },
    {
        id: "blueprints",
        label: "Blueprint replacement",
        mark: { type: "icon", icon: "agents" },
        trailing: { type: "tokens", count: 3_800 },
    },
    { id: "round-three", label: "Round-3 checkpoint", mark: { type: "icon", icon: "doc" } },
];
const everything = {
    changes: [folder, desktop, agent],
    artifacts: [spec],
    agents: [running, done],
    history,
} satisfies Pick<WorkFloatyProps, "changes" | "artifacts" | "agents" | "history">;

/** One card as the workspace docks it: interactive, so History opens in place. */
function Card(
    props: Pick<WorkFloatyProps, "changes" | "artifacts" | "agents" | "history"> & {
        readonly expanded?: boolean;
        readonly selectedId?: string;
    },
) {
    const [expanded, setExpanded] = useState(props.expanded ?? false);
    const [selected, setSelected] = useState(props.selectedId);
    return (
        <WorkFloaty
            open
            agents={props.agents}
            artifacts={props.artifacts}
            changes={props.changes}
            history={props.history}
            historyExpanded={expanded}
            onHistoryExpandedChange={setExpanded}
            onRowOpen={setSelected}
            selectedId={selected}
        />
    );
}

/** The 280px card in a column standing in for the pane, whose 60% it may fill. */
function Column(props: { readonly children: React.ReactNode; readonly height?: number }) {
    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: 8,
                width: 312,
                height: props.height ?? 420,
                padding: 16,
                boxSizing: "border-box",
            }}
        >
            {props.children}
        </div>
    );
}

export function WorkFloatyPage() {
    return (
        <ComponentPage
            number={componentNumber}
            title="Work floaty"
            summary="What a chat changed, published and has working, as sidebar rows on a fixed 280px card. Changes and artifacts first; agents and their history a half row below. Every row ends in one right-aligned column, and the card grows with its rows up to 60% of the pane before scrolling."
            width={1100}
        >
            <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
                <Specimen
                    number="01"
                    label="Changes only"
                    stage="surface"
                    detail="The chat's own folder · muted totals at rest"
                >
                    <Column height={140}>
                        <DimensionRule label="280" />
                        <Card changes={[folder]} artifacts={[]} agents={[]} history={[]} />
                    </Column>
                </Specimen>
                <Specimen
                    number="02"
                    label="Everything, History shut"
                    stage="surface"
                    detail="Folder · two projects · artifact · running and finished agents"
                >
                    <Column height={600}>
                        <DimensionRule label="280" />
                        <Card {...everything} />
                    </Column>
                </Specimen>
                <Specimen
                    number="03"
                    label="History open"
                    stage="surface"
                    detail="Past agents and artifacts, muted · chevron turned"
                >
                    <Column height={720}>
                        <DimensionRule label="280" />
                        <Card {...everything} expanded />
                    </Column>
                </Specimen>
                <Specimen
                    number="04"
                    label="Selected, with its tab beside"
                    stage="surface"
                    detail="The chat's own folder, whose Changes the right pane is showing"
                >
                    <div style={{ display: "flex", height: 600 }}>
                        <Column height={600}>
                            <Card {...everything} selectedId="folder" />
                        </Column>
                        <TabbedPane
                            activeId="files"
                            closePresentation="overlay"
                            onSelect={() => undefined}
                            style={{ width: 340, borderLeft: "1px solid var(--divider)" }}
                            tabSizing="content"
                            tabs={[
                                { id: "files", label: "Files", icon: "files", closable: false },
                                { id: "spec", label: "Sidebar tree spec", icon: "package" },
                            ]}
                        >
                            <div />
                        </TabbedPane>
                    </div>
                </Specimen>
                <Specimen
                    number="05"
                    label="Long titles"
                    stage="surface"
                    detail="Truncated against the right column"
                >
                    <Column height={320}>
                        <Card
                            changes={[
                                {
                                    ...desktop,
                                    label: "redesign-blueprints-replacement-round-4-with-keyboard-audit",
                                },
                            ]}
                            artifacts={[
                                {
                                    ...spec,
                                    label: "Sidebar tree spec, with the fold and connector rules",
                                },
                            ]}
                            agents={[
                                {
                                    ...running,
                                    label: "Prove every connector in the spaces tree at two zooms",
                                },
                            ]}
                            history={[]}
                        />
                    </Column>
                </Specimen>
                <Specimen
                    number="06"
                    label="Capped"
                    stage="surface"
                    detail="60% of a 360px pane · scrolls inside"
                >
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            height: 360,
                            width: 312,
                            padding: 16,
                            boxSizing: "border-box",
                        }}
                    >
                        <Card {...everything} expanded />
                    </div>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
