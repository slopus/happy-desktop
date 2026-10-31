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
import { happyLogoBlackUrl as happyMark } from "../../src/assets";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-273";

/* The width the list has inside the palette card: 384 − 2 borders − the card's
   own 8px body inset on each side. Every specimen is measured at it. */
const BODY_WIDTH = 366;

const SESSION_SHORTCUT = commandShortcut("t");
const SIDEBAR_SHORTCUT = commandShortcut("b");
const PANEL_SHORTCUT = commandShortcut("j");
/** Every row that opens something wears the ⌘-number that opens it, counted down the list. */
const NUMBERS = Array.from({ length: 9 }, (_, index) => commandShortcut(String(index + 1)));

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
            // The sidebar's rows lead, last opened first, each in the mark its
            // sidebar row wears: a bot's picture, a project's, the tasks glyph.
            {
                kind: "command",
                id: "bot-happy",
                imageMark: { src: happyMark },
                meta: "Bot",
                shortcut: NUMBERS[0],
                title: "Happy",
            },
            {
                kind: "command",
                id: "project-infra",
                avatar: { initials: "S", type: "agent" },
                meta: "~/Developer/search-infra",
                shortcut: NUMBERS[1],
                title: "search-infra",
            },
            {
                kind: "command",
                id: "task-release",
                avatar: { icon: "tasks", initials: "", type: "agent" },
                meta: "Task",
                shortcut: NUMBERS[2],
                title: "Release desktop",
            },
            {
                kind: "command",
                id: "task-onboarding",
                avatar: { initials: "KS", type: "agent" },
                meta: "Task · Kirill",
                shortcut: NUMBERS[3],
                title: "Onboarding copy pass",
            },
            // Then other work, such as a chat inside a project. Archived work
            // is left out while anything live remains.
            {
                kind: "command",
                id: "chat-index",
                icon: "chat",
                meta: "search-infra",
                shortcut: NUMBERS[4],
                title: "Index rebuild",
            },
        ],
    },
];

/** A typed query: live work first, the archived answers last however well they match. */
const searched: CommandPaletteResultsSection[] = [
    {
        id: "work",
        caption: "Work",
        rows: [
            {
                kind: "command",
                id: "project-infra",
                avatar: { initials: "S", type: "agent" },
                meta: "~/Developer/search-infra",
                shortcut: NUMBERS[0],
                title: "search-infra",
            },
            {
                kind: "command",
                id: "task-cmdk",
                avatar: { icon: "tasks", initials: "", type: "agent" },
                meta: "Task",
                shortcut: NUMBERS[1],
                title: "Fix Cmd K search",
            },
        ],
    },
    {
        id: "archived",
        caption: "Archived",
        rows: [
            {
                kind: "command",
                id: "task-old",
                avatar: { icon: "tasks", initials: "", type: "agent" },
                meta: "Archived task",
                shortcut: NUMBERS[2],
                title: "Search experiment, take one",
            },
            {
                kind: "command",
                id: "chat-closed",
                icon: "history",
                meta: "Closed · happy-desktop",
                shortcut: NUMBERS[3],
                title: "Search ranking notes",
            },
        ],
    },
];

/** What a typed query finds among the window's acts: each row wears its chord. */
const actions: CommandPaletteResultsSection[] = [
    {
        id: "actions",
        caption: "Actions",
        rows: [
            {
                kind: "command",
                id: "sidebar-toggle",
                icon: "sidebar-collapse",
                shortcut: SIDEBAR_SHORTCUT,
                title: "Hide sidebar",
            },
            {
                kind: "command",
                id: "panel-toggle",
                icon: "panel-expand",
                shortcut: PANEL_SHORTCUT,
                title: "Show secondary pane",
            },
            {
                kind: "command",
                id: "chat-new",
                icon: "plus",
                shortcut: SESSION_SHORTCUT,
                title: "New chat",
            },
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
                icon: "sun",
                label: "Theme",
                description: "Match the system appearance or pin one",
                control: (
                    <FormRow
                        density="compact"
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
                icon: "zap",
                label: "Shimmer active titles",
                description: "Animates running session, project, and workspace names",
                control: (
                    <FormRow
                        density="compact"
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
                icon: "settings",
                label: "Enable experimental features",
                description: "Unfinished surfaces, on your own recognizance",
                control: (
                    <FormRow
                        density="compact"
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
            summary="The ⌘K palette's body: captioned sections of one-line 44px command rows — title, then muted secondary text — and live settings rows at the settings page's compact 56px, with one rounded highlighted row that Enter commits. Props only — the owner holds the flat index and moves it."
            title="Command palette results"
        >
            <div className="specimen-grid">
                <BodySpecimen
                    detail="empty query · the waiting update, then the sidebar's tasks, bots, and projects in their sidebar marks, last opened first, then other live work · no subtasks or archived work · ⌘1…⌘9 on the rows · highlight on the first row"
                    label="Suggestions"
                    number="PR-01"
                    rule="366px body width · 44px one-line rows · 20px sidebar marks · 28px captions"
                >
                    <CommandPaletteResults activeIndex={0} sections={suggestions} />
                </BodySpecimen>
            </div>

            <div className="specimen-grid">
                <BodySpecimen
                    detail="the flat index counts across sections: row 3 is the third recent row"
                    label="Highlight across sections"
                    number="PR-02"
                    rule="index 3 of 6 · captions are not rows"
                >
                    <CommandPaletteResults activeIndex={3} sections={suggestions} />
                </BodySpecimen>
            </div>

            <div className="specimen-grid">
                <BodySpecimen
                    detail="a typed query such as “search” · live work first, archived tasks and closed sessions last however well they match · ⌘1…⌘9 count on across sections"
                    label="Work and archived"
                    number="PR-07"
                    rule="44px rows · ⌘-number caps on rows that open something"
                >
                    <CommandPaletteResults activeIndex={0} sections={searched} />
                </BodySpecimen>
            </div>

            <div className="specimen-grid">
                <BodySpecimen
                    detail="a typed query such as “fold sidebar” finds the window's acts, each with the chord that does the same"
                    label="Actions"
                    number="PR-06"
                    rule="44px rows · trailing cap"
                >
                    <CommandPaletteResults activeIndex={0} sections={actions} />
                </BodySpecimen>
            </div>

            <div className="specimen-grid">
                <BodySpecimen
                    detail="the same FormRow + SegmentedControl the settings page renders · highlighted, the chosen segment still reads as chosen"
                    label="Settings in place"
                    number="PR-03"
                    rule="compact FormRow · 56px, the one taller row · no hairlines"
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
