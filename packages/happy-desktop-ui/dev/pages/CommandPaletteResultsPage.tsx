import {
    CommandPaletteResults,
    type CommandPaletteResultsSection,
} from "../../src/CommandPaletteResults";
import { FormRow } from "../../src/FormRow";
import { commandShortcut } from "../../src/keyboardShortcut";
import { SegmentedControl } from "../../src/SegmentedControl";
import { Switch } from "../../src/Switch";
import { ComponentPage, DimensionRule, Specimen } from "../kit";
import { type ReactNode } from "react";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-273";

/* The width the list has inside the palette card: 640 − 2 borders − the card's
   own 8px body inset on each side. Every specimen is measured at it. */
const BODY_WIDTH = 622;

const SESSION_SHORTCUT = commandShortcut("t");
const WORKSPACE_SHORTCUT = commandShortcut("n", { shift: true });

const suggestions: CommandPaletteResultsSection[] = [
    {
        id: "update",
        rows: [
            {
                kind: "command",
                id: "update",
                emphasis: "update",
                meta: "Version 2.6.1 · restart to apply",
                title: "Update Happy",
            },
        ],
    },
    {
        id: "recent",
        caption: "Recent",
        rows: [
            {
                kind: "command",
                id: "chat-relay",
                avatar: { initials: "S", tone: "ocean" },
                meta: "seville · main",
                title: "Palette results list",
            },
            {
                kind: "command",
                id: "chat-gutter",
                avatar: { initials: "S", tone: "ocean" },
                meta: "seville · top-gutter",
                title: "Overlay gutter discrepancy",
            },
            {
                kind: "command",
                id: "chat-updater",
                avatar: { initials: "H", tone: "violet" },
                meta: "happy-desktop · main",
                title: "Updater restart phases",
            },
        ],
    },
    {
        id: "actions",
        caption: "Actions",
        rows: [
            {
                kind: "command",
                id: "chat-new",
                icon: "plus",
                shortcut: SESSION_SHORTCUT,
                title: "New chat",
            },
            {
                kind: "command",
                id: "workspace-new",
                icon: "branch",
                shortcut: WORKSPACE_SHORTCUT,
                title: "New workspace",
            },
            { kind: "command", id: "settings-open", icon: "settings", title: "Open settings" },
        ],
    },
];

const settings: CommandPaletteResultsSection[] = [
    {
        id: "settings-inline",
        caption: "Settings",
        rows: [
            {
                kind: "control",
                id: "theme",
                label: "Theme",
                description: "Match the system appearance or pin one",
                control: (
                    <FormRow
                        control={
                            <SegmentedControl
                                aria-label="Theme"
                                onChange={() => undefined}
                                segments={[
                                    { label: "System", value: "system" },
                                    { label: "Light", value: "light" },
                                    { label: "Dark", value: "dark" },
                                ]}
                                size="small"
                                value="system"
                            />
                        }
                        description="Match the system appearance or pin one"
                        label="Theme"
                    />
                ),
            },
            {
                kind: "control",
                id: "shimmer",
                label: "Shimmer active titles",
                description: "Animates running session, project, and workspace names",
                control: (
                    <FormRow
                        control={
                            <Switch
                                aria-label="Shimmer active titles"
                                checked
                                onChange={() => undefined}
                                size="small"
                            />
                        }
                        description="Animates running session, project, and workspace names"
                        label="Shimmer active titles"
                    />
                ),
            },
            {
                kind: "control",
                id: "experiments",
                label: "Enable experimental features",
                description: "Unfinished surfaces, on your own recognizance",
                control: (
                    <FormRow
                        control={
                            <Switch
                                aria-label="Enable experimental features"
                                checked={false}
                                onChange={() => undefined}
                                size="small"
                            />
                        }
                        description="Unfinished surfaces, on your own recognizance"
                        label="Enable experimental features"
                    />
                ),
            },
        ],
    },
    {
        id: "settings-jump",
        caption: "Settings sections",
        rows: [
            {
                kind: "command",
                id: "settings-providers",
                icon: "globe",
                meta: "Settings › Providers",
                title: "Providers",
            },
            {
                kind: "command",
                id: "settings-usage",
                icon: "zap",
                meta: "Settings › Usage",
                title: "Usage",
            },
        ],
    },
];

function BodySpecimen(props: {
    children: ReactNode;
    detail: string;
    label: string;
    number: string;
    rule: string;
}) {
    return (
        <Specimen detail={props.detail} label={props.label} number={props.number} stage="surface">
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <DimensionRule label={props.rule} />
                <div style={{ display: "flex", width: `${BODY_WIDTH}px` }}>{props.children}</div>
            </div>
        </Specimen>
    );
}

export function CommandPaletteResultsPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="The ⌘K palette's body: captioned sections of 44px command rows and live settings rows, with one highlighted row that Enter commits. Props only — the owner holds the flat index and moves it."
            title="Command palette results"
        >
            <div className="specimen-grid">
                <BodySpecimen
                    detail="empty query · update, recents, actions · highlight on the first row"
                    label="Suggestions"
                    number="PR-01"
                    rule="622px body width · 44px rows · 28px captions"
                >
                    <CommandPaletteResults activeIndex={0} sections={suggestions} />
                </BodySpecimen>
            </div>

            <div className="specimen-grid">
                <BodySpecimen
                    detail="the flat index counts across sections: row 5 is the second action"
                    label="Highlight across sections"
                    number="PR-02"
                    rule="index 5 of 7 · captions are not rows"
                >
                    <CommandPaletteResults activeIndex={5} sections={suggestions} />
                </BodySpecimen>
            </div>

            <div className="specimen-grid">
                <BodySpecimen
                    detail="the same FormRow + SegmentedControl the settings page renders · highlighted, the chosen segment still reads as chosen"
                    label="Settings in place"
                    number="PR-03"
                    rule="control rows keep FormRow's own height · hairline dropped on the last one"
                >
                    <CommandPaletteResults activeIndex={0} sections={settings} />
                </BodySpecimen>
            </div>

            <div className="specimen-grid">
                <BodySpecimen
                    detail="the highlight moved onto a Switch row · Enter toggles it and the palette stays open"
                    label="Settings, switch highlighted"
                    number="PR-04"
                    rule="index 1 · the accent-filled track carries the highlight"
                >
                    <CommandPaletteResults activeIndex={1} sections={settings} />
                </BodySpecimen>
            </div>

            <div className="specimen-grid">
                <BodySpecimen
                    detail="a query nothing matched · the inline empty state stays at the top of the body"
                    label="No results"
                    number="PR-05"
                    rule="no sections · no listbox"
                >
                    <CommandPaletteResults
                        activeIndex={0}
                        emptyDescription="No chats, workspaces, tabs, settings, or actions match “cobalt”."
                        emptyLabel="No results"
                        sections={[]}
                    />
                </BodySpecimen>
            </div>
        </ComponentPage>
    );
}
