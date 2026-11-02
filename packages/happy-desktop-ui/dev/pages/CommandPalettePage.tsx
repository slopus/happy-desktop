import { type ReactNode } from "react";
import { AppShell } from "../../src/AppShell";
import { Banner } from "../../src/Banner";
import { CommandPalette } from "../../src/CommandPalette";
import {
    CommandPaletteResults,
    type CommandPaletteResultsSection,
} from "../../src/CommandPaletteResults";
import { EmptyState } from "../../src/EmptyState";
import { FormRow } from "../../src/FormRow";
import { commandShortcut } from "../../src/keyboardShortcut";
import { ModalOverlay } from "../../src/ModalOverlay";
import { SearchResults, type SearchResultGroup } from "../../src/SearchResults";
import { SegmentedControl } from "../../src/SegmentedControl";
import { Sidebar, type SidebarSection } from "../../src/Sidebar";
import { Switch } from "../../src/Switch";
import { ThemeScope } from "../../src/ThemeScope";
import { ComponentPage, DimensionRule, FullScreenSpecimen, Specimen } from "../kit";
import { happyLogoBlackUrl as happyMark } from "../../src/assets";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-060";

const PLACEHOLDER = "Search work, documents, todos, and artifacts…";
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
                id: "task-release",
                avatar: { icon: "tasks", initials: "", type: "agent" },
                meta: "Task",
                shortcut: NUMBERS[1],
                title: "Release desktop",
            },
            {
                kind: "command",
                id: "project-infra",
                avatar: { initials: "S", type: "agent" },
                meta: "~/Developer/search-infra",
                shortcut: NUMBERS[2],
                title: "search-infra",
            },
            {
                kind: "command",
                id: "task-onboarding",
                avatar: { initials: "KS", type: "agent" },
                meta: "Task · Kirill",
                shortcut: NUMBERS[3],
                title: "Onboarding copy pass",
            },
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

/** What “launch” finds across the machine: work, documents, todos, artifacts, a calendar. */
const mixed: CommandPaletteResultsSection[] = [
    {
        id: "work",
        caption: "Work",
        rows: [
            {
                kind: "command",
                id: "task-launch",
                avatar: { icon: "tasks", initials: "", type: "agent" },
                meta: "Task · Steve",
                shortcut: NUMBERS[0],
                title: "Launch the desktop beta",
            },
        ],
    },
    {
        id: "documents",
        caption: "Documents",
        rows: [
            {
                kind: "command",
                id: "doc-plan",
                icon: "doc",
                meta: "Document",
                shortcut: NUMBERS[1],
                title: "Launch plan",
            },
            {
                kind: "command",
                id: "doc-notes",
                icon: "doc",
                meta: "Document · not joined",
                shortcut: NUMBERS[2],
                title: "Launch retro notes",
            },
        ],
    },
    {
        id: "todos",
        caption: "Todos",
        rows: [
            {
                kind: "command",
                id: "list-launch",
                icon: "tasks",
                meta: "Todo list · 12 open",
                shortcut: NUMBERS[3],
                title: "Launch checklist",
            },
            {
                kind: "command",
                id: "todo-email",
                icon: "check",
                meta: "Marketing",
                shortcut: NUMBERS[4],
                title: "Write the launch email",
            },
        ],
    },
    {
        id: "artifacts",
        caption: "Artifacts",
        rows: [
            {
                kind: "command",
                id: "artifact-deck",
                icon: "globe",
                meta: "Web page",
                shortcut: NUMBERS[5],
                title: "Launch deck",
            },
            {
                kind: "command",
                id: "artifact-hero",
                icon: "image",
                meta: "Image",
                shortcut: NUMBERS[6],
                title: "Launch hero image",
            },
        ],
    },
    {
        id: "shared",
        caption: "Shared",
        rows: [
            {
                kind: "command",
                id: "calendar-launch",
                icon: "calendar",
                meta: "Calendar",
                shortcut: NUMBERS[7],
                title: "Launch week",
            },
        ],
    },
];

const actions: CommandPaletteResultsSection[] = [
    {
        id: "actions",
        caption: "Actions",
        rows: [
            {
                kind: "command",
                id: "sidebar-toggle",
                icon: "sidebar-collapse",
                shortcut: commandShortcut("b"),
                title: "Hide sidebar",
            },
        ],
    },
];

const typed: CommandPaletteResultsSection[] = [
    {
        id: "settings",
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
        ],
    },
    {
        id: "settings-jump",
        caption: "Settings sections",
        rows: [
            {
                kind: "command",
                id: "settings-general",
                icon: "settings",
                meta: "Settings › General",
                title: "General",
            },
        ],
    },
];

const overflowGroups: SearchResultGroup[] = (["channel", "user", "message", "file"] as const).map(
    (type) => ({
        type,
        results: Array.from({ length: 5 }, (_, index) => ({
            id: `${type}-${index + 1}`,
            title: `${type} result ${index + 1} for calm`,
            meta: `Workspace match ${index + 1}`,
        })),
    }),
);

/** The sidebar behind the window specimens: Search heads it, and opens the palette. */
const WINDOW_SECTIONS: SidebarSection[] = [
    {
        id: "top",
        items: [
            { icon: "package", id: "artifacts", kind: "action", label: "Artifacts" },
            { icon: "tasks", id: "groceries", kind: "project", label: "Launch checklist" },
            { icon: "doc", id: "plan", kind: "project", label: "Launch plan" },
        ],
    },
    {
        id: "bots",
        label: "Bots",
        items: [{ id: "happy", imageUrl: happyMark, kind: "project", label: "Happy" }],
    },
    {
        id: "tasks",
        label: "Tasks",
        items: [
            { icon: "tasks", id: "launch", kind: "project", label: "Launch the desktop beta" },
            { icon: "tasks", id: "release", kind: "project", label: "Release desktop" },
        ],
    },
];

function noop() {}

function PaletteFrame(props: { children: ReactNode; query: string }) {
    return (
        <CommandPalette
            autoFocus={false}
            onClose={noop}
            onQueryChange={noop}
            onSelectionCommit={noop}
            onSelectionMove={noop}
            placeholder={PLACEHOLDER}
            query={props.query}
        >
            {props.children}
        </CommandPalette>
    );
}

function PaletteSpecimen(props: {
    children: ReactNode;
    detail: string;
    label: string;
    number: string;
    query: string;
}) {
    return (
        <Specimen detail={props.detail} label={props.label} number={props.number} stage="app">
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <DimensionRule label="640 × 461 fixed frame · 56px field · 40px rows · 36px key footer" />
                <PaletteFrame query={props.query}>{props.children}</PaletteFrame>
            </div>
        </Specimen>
    );
}

/**
 * The palette as the window shows it: hung from the top gutter over a soft dim,
 * in front of the window's own sidebar — which offers Search beside its toggle
 * and at the head of its rows, and no search field of its own.
 */
function PaletteWindow(props: { children: ReactNode; mode: "light" | "dark"; query: string }) {
    return (
        <ThemeScope mode={props.mode}>
            <div style={{ display: "flex", height: "100%", position: "relative", width: "100%" }}>
                <AppShell
                    navigationChrome="integrated"
                    sidebar={
                        <Sidebar
                            activeItemId="launch"
                            brand={false}
                            onCompose={noop}
                            onItemSelect={noop}
                            searchRow={{
                                label: "Search",
                                onOpen: noop,
                                shortcut: commandShortcut("k"),
                            }}
                            sections={WINDOW_SECTIONS}
                        />
                    }
                    sidebarSearchAction={{ label: "Search", onClick: noop }}
                    windowControls
                >
                    <div style={{ alignItems: "center", display: "flex", flex: "1 1 0%" }}>
                        <EmptyState
                            description="The conversation stays where it is behind the palette."
                            icon="chat"
                            size="panel"
                            title="Launch the desktop beta"
                        />
                    </div>
                </AppShell>
                <ModalOverlay
                    backdrop="soft"
                    onDismiss={noop}
                    placement="top"
                    style={{ position: "absolute" }}
                >
                    <PaletteFrame query={props.query}>{props.children}</PaletteFrame>
                </ModalOverlay>
            </div>
        </ThemeScope>
    );
}

export function CommandPalettePage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="The ⌘K palette in Linear's and Slack's proportions — a fixed 640 × 461 card on the 14px shell radius, opaque, with a hairline edge and a soft dissolving shadow. A 56px borderless search field, a hairline, the scrolling results in compact 40px rows under sentence-case captions, a hairline, and a 36px footer naming the keys: ↑↓ navigate, ↵ open, ESC close. Closed by Escape, ⌘K again, or a press outside it; ⌘1…⌘9 open the numbered rows. Renders the card only; ModalOverlay hangs it from the top gutter over a soft dim."
            title="Command palette"
        >
            <FullScreenSpecimen
                detail="What ⌘K opens on, in the window: the waiting update, then the work the reader opened last. The sidebar has no search field — Search sits beside its toggle and heads its rows, and both open this."
                label="Window, suggestions, light"
                number="W-01"
                screen="01-suggestions-light-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <PaletteWindow mode="light" query="">
                    <CommandPaletteResults activeIndex={0} sections={suggestions} />
                </PaletteWindow>
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="The same, dark."
                label="Window, suggestions, dark"
                number="W-02"
                screen="02-suggestions-dark-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <PaletteWindow mode="dark" query="">
                    <CommandPaletteResults activeIndex={0} sections={suggestions} />
                </PaletteWindow>
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="“launch” across the machine: work, documents joined or not, a todo list and an open todo in another, artifacts, and a calendar — each section numbered on for ⌘1…⌘9."
                label="Window, mixed results, light"
                number="W-03"
                screen="03-mixed-light-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <PaletteWindow mode="light" query="launch">
                    <CommandPaletteResults activeIndex={1} sections={mixed} />
                </PaletteWindow>
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="The same, dark."
                label="Window, mixed results, dark"
                number="W-04"
                screen="04-mixed-dark-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <PaletteWindow mode="dark" query="launch">
                    <CommandPaletteResults activeIndex={1} sections={mixed} />
                </PaletteWindow>
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="At the window's 720 × 640 minimum the card keeps its size and its 128px top gutter."
                label="Window, mixed results, minimum"
                number="W-05"
                screen="03-mixed-light-720x640"
                window={{ width: 720, height: 640 }}
            >
                <PaletteWindow mode="light" query="launch">
                    <CommandPaletteResults activeIndex={1} sections={mixed} />
                </PaletteWindow>
            </FullScreenSpecimen>

            <div className="specimen-grid">
                <PaletteSpecimen
                    detail="what ⌘K opens on: a waiting update, then the sidebar's tasks, bots, and projects, last opened first · ⌘1…⌘9 open the numbered rows"
                    label="Suggestions"
                    number="CP-06"
                    query=""
                >
                    <CommandPaletteResults activeIndex={0} sections={suggestions} />
                </PaletteSpecimen>
            </div>

            <div className="specimen-grid">
                <PaletteSpecimen
                    detail="a typed query finds work, documents, todos, artifacts, and other shared Surfaces, each under its own caption"
                    label="Mixed results"
                    number="CP-09"
                    query="launch"
                >
                    <CommandPaletteResults activeIndex={1} sections={mixed} />
                </PaletteSpecimen>
            </div>

            <div className="specimen-grid">
                <PaletteSpecimen
                    detail="a typed act finds the window's own action, wearing the chord that does the same"
                    label="Actions"
                    number="CP-08"
                    query="fold sidebar"
                >
                    <CommandPaletteResults activeIndex={0} sections={actions} />
                </PaletteSpecimen>
            </div>

            <div className="specimen-grid">
                <PaletteSpecimen
                    detail="settings rows are the settings page's own FormRows, live and highlighted in place"
                    label="Typed query"
                    number="CP-07"
                    query="the"
                >
                    <CommandPaletteResults activeIndex={0} sections={typed} />
                </PaletteSpecimen>
            </div>

            <div className="specimen-grid">
                <PaletteSpecimen
                    detail="genuinely overflowing grouped results · the shared scrollbar over the body's inset · the footer stays put"
                    label="Overflowing results"
                    number="CP-01"
                    query="calm"
                >
                    <SearchResults groups={overflowGroups} query="calm" variant="flush" />
                </PaletteSpecimen>
            </div>

            <div className="specimen-grid">
                <PaletteSpecimen
                    detail="empty query · inline state stays near the top of the result body"
                    label="Idle"
                    number="CP-02"
                    query=""
                >
                    <EmptyState
                        description="Find work, documents, todos, and artifacts on this machine."
                        icon="search"
                        size="inline"
                        title="Search Happy"
                    />
                </PaletteSpecimen>
                <PaletteSpecimen
                    detail="in-flight query · inline state preserves the top visual target"
                    label="Searching"
                    number="CP-03"
                    query="relay"
                >
                    <EmptyState
                        description="Searching for “relay”."
                        icon="search"
                        size="inline"
                        title="Searching…"
                    />
                </PaletteSpecimen>
            </div>

            <div className="specimen-grid">
                <PaletteSpecimen
                    detail="completed query without matches · compact inline state"
                    label="No results"
                    number="CP-04"
                    query="cobalt"
                >
                    <CommandPaletteResults
                        activeIndex={0}
                        emptyDescription="Try a different search."
                        emptyLabel="No results"
                        sections={[]}
                    />
                </PaletteSpecimen>
                <PaletteSpecimen
                    detail="terminal search failure · error remains at the top of the body"
                    label="Error"
                    number="CP-05"
                    query="relay"
                >
                    <Banner tone="danger" title="Search unavailable">
                        The search could not be reached.
                    </Banner>
                </PaletteSpecimen>
            </div>
        </ComponentPage>
    );
}
