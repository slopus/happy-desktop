import { useState, type ReactNode } from "react";
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
import { ModalOverlay, ModalOverlayPresence } from "../../src/ModalOverlay";
import { SearchResults, type SearchResultGroup } from "../../src/SearchResults";
import { SegmentedControl } from "../../src/SegmentedControl";
import { Sidebar, type SidebarSection } from "../../src/Sidebar";
import { Switch } from "../../src/Switch";
import { TabbedPane } from "../../src/TabbedPane";
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

/** What “plan” finds: a few rows, so the card ends right under them. */
const few: CommandPaletteResultsSection[] = [
    {
        id: "artifacts",
        caption: "Artifacts",
        rows: [
            {
                kind: "command",
                id: "artifact-overview",
                icon: "doc",
                meta: "Markdown",
                shortcut: NUMBERS[0],
                title: "Plan overview",
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
        ],
    },
    {
        id: "todos",
        caption: "Todos",
        rows: [
            {
                kind: "command",
                id: "todo-recap",
                icon: "check",
                meta: "Launch checklist",
                shortcut: NUMBERS[2],
                title: "Write the plan recap",
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
                <DimensionRule label="640 wide · fits its rows up to 461 · 56px field · 40px rows · 36px key footer" />
                <PaletteFrame query={props.query}>{props.children}</PaletteFrame>
            </div>
        </Specimen>
    );
}

/**
 * The window as the app draws it: integrated chrome whose band holds the
 * sidebar toggle and New task beside the traffic lights (or at the window's
 * edge without them), the sidebar headed by its Search row, and the palette
 * hung from the top gutter over a soft dim when it is open.
 */
function PaletteWindow(props: {
    children?: ReactNode;
    mode: "light" | "dark";
    query?: string;
    trafficLights?: boolean;
}) {
    return (
        <ThemeScope mode={props.mode}>
            <div style={{ display: "flex", height: "100%", position: "relative", width: "100%" }}>
                <WindowBehind onSearchOpen={noop} trafficLights={props.trafficLights !== false} />
                {props.children ? (
                    <ModalOverlay
                        backdrop="soft"
                        onDismiss={noop}
                        placement="top"
                        style={{ position: "absolute" }}
                    >
                        <PaletteFrame query={props.query ?? ""}>{props.children}</PaletteFrame>
                    </ModalOverlay>
                ) : null}
            </div>
        </ThemeScope>
    );
}

/** The window behind the palette, its Search row opening it. */
function WindowBehind(props: { onSearchOpen: () => void; trafficLights: boolean }) {
    return (
        <AppShell
            navigationChrome="integrated"
            onSidebarCollapsedChange={noop}
            sidebar={
                <Sidebar
                    activeItemId="launch"
                    brand={false}
                    onCompose={noop}
                    onItemSelect={noop}
                    searchRow={{
                        label: "Search",
                        onOpen: props.onSearchOpen,
                        shortcut: commandShortcut("k"),
                    }}
                    sections={WINDOW_SECTIONS}
                />
            }
            sidebarCollapsed={false}
            sidebarCollapsedAction={{ label: "New task (⌘N)", onClick: noop }}
            sidebarCollapsedLayout="overlay"
            sidebarCollapsible
            windowControls={props.trafficLights}
        >
            <TabbedPane
                activeId="launch"
                closePresentation="overlay"
                onClose={noop}
                onSelect={noop}
                tabSizing="content"
                tabs={[{ id: "launch", label: "Launch the desktop beta", closable: true }]}
            >
                <div style={{ alignItems: "center", display: "flex", flex: "1 1 0%" }}>
                    <EmptyState
                        description="The conversation stays where it is behind the palette."
                        icon="chat"
                        size="panel"
                        title="Launch the desktop beta"
                    />
                </div>
            </TabbedPane>
        </AppShell>
    );
}

/** The rows of `mixed` whose titles hold the query, under their own captions. */
function mixedMatching(query: string): CommandPaletteResultsSection[] {
    const needle = query.trim().toLowerCase();
    if (needle === "") return suggestions;
    return mixed
        .map((section) => ({
            ...section,
            rows: section.rows.filter(
                (row) => row.kind === "command" && row.title.toLowerCase().includes(needle),
            ),
        }))
        .filter((section) => section.rows.length > 0);
}

/**
 * The palette live, as the window runs it: Search in the sidebar opens it, it
 * arrives and leaves through ModalOverlayPresence, typing narrows the rows, and
 * Escape, ⌘K, a press outside it, or choosing a row closes it. It starts
 * closed, so the page itself still shows nothing moving.
 */
function LivePaletteWindow(props: { mode: "light" | "dark" }) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [active, setActive] = useState(0);
    const sections = mixedMatching(query);
    const count = sections.reduce((sum, section) => sum + section.rows.length, 0);
    return (
        <ThemeScope mode={props.mode}>
            <div style={{ display: "flex", height: "100%", position: "relative", width: "100%" }}>
                <WindowBehind
                    onSearchOpen={() => {
                        setQuery("");
                        setActive(0);
                        setOpen(true);
                    }}
                    trafficLights
                />
                <ModalOverlayPresence open={open}>
                    <ModalOverlay
                        backdrop="soft"
                        onDismiss={() => setOpen(false)}
                        placement="top"
                        style={{ position: "absolute" }}
                    >
                        <CommandPalette
                            onClose={() => setOpen(false)}
                            onQueryChange={(value) => {
                                setQuery(value);
                                setActive(0);
                            }}
                            onSelectionCommit={() => setOpen(false)}
                            onSelectionMove={(direction) =>
                                setActive((index) =>
                                    count === 0 ? 0 : (index + direction + count) % count,
                                )
                            }
                            placeholder={PLACEHOLDER}
                            query={query}
                        >
                            <CommandPaletteResults
                                activeIndex={active}
                                emptyDescription="Try a different search."
                                emptyLabel="No results"
                                onActiveIndexChange={setActive}
                                onSelect={() => setOpen(false)}
                                sections={sections}
                            />
                        </CommandPalette>
                    </ModalOverlay>
                </ModalOverlayPresence>
            </div>
        </ThemeScope>
    );
}

export function CommandPalettePage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="The ⌘K palette in Linear's and Slack's proportions — a 640px card on the 14px shell radius that fits its rows — its results scroll only past 365px, a 461px card, opaque, with a hairline edge and a soft dissolving shadow. A 56px borderless search field, a hairline, the scrolling results in compact 40px rows under sentence-case captions, a hairline, and a 36px footer naming the keys: ↑↓ navigate, ↵ open, ESC close. Closed by Escape, ⌘K again, or a press outside it; ⌘1…⌘9 open the numbered rows. Renders the card only; ModalOverlay hangs it from the top gutter over a soft dim."
            title="Command palette"
        >
            <FullScreenSpecimen
                detail="What ⌘K opens on: the waiting update, then the work the reader opened last. The card ends under its last row."
                label="Window, empty query, light"
                number="W-01"
                screen="01-empty-light-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <PaletteWindow mode="light" query="">
                    <CommandPaletteResults activeIndex={0} sections={suggestions} />
                </PaletteWindow>
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="The same, dark."
                label="Window, empty query, dark"
                number="W-02"
                screen="02-empty-dark-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <PaletteWindow mode="dark" query="">
                    <CommandPaletteResults activeIndex={0} sections={suggestions} />
                </PaletteWindow>
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="Three rows for “plan”: the card is only as tall as they are."
                label="Window, few results, light"
                number="W-03"
                screen="03-few-light-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <PaletteWindow mode="light" query="plan">
                    <CommandPaletteResults activeIndex={0} sections={few} />
                </PaletteWindow>
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="The same, dark."
                label="Window, few results, dark"
                number="W-04"
                screen="04-few-dark-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <PaletteWindow mode="dark" query="plan">
                    <CommandPaletteResults activeIndex={0} sections={few} />
                </PaletteWindow>
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="“launch” across the machine: work, documents joined or not, a todo list and an open todo in another, artifacts, and a calendar. Past 365px of rows the list scrolls under a still card."
                label="Window, many results, light"
                number="W-05"
                screen="05-many-light-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <PaletteWindow mode="light" query="launch">
                    <CommandPaletteResults activeIndex={1} sections={mixed} />
                </PaletteWindow>
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="The same, dark."
                label="Window, many results, dark"
                number="W-06"
                screen="06-many-dark-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <PaletteWindow mode="dark" query="launch">
                    <CommandPaletteResults activeIndex={1} sections={mixed} />
                </PaletteWindow>
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="Nothing found is one row's height."
                label="Window, no results, light"
                number="W-07"
                screen="07-no-results-light-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <PaletteWindow mode="light" query="cobalt">
                    <CommandPaletteResults
                        activeIndex={0}
                        emptyDescription="Try a different search."
                        emptyLabel="No results"
                        sections={[]}
                    />
                </PaletteWindow>
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="The same, dark."
                label="Window, no results, dark"
                number="W-08"
                screen="08-no-results-dark-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <PaletteWindow mode="dark" query="cobalt">
                    <CommandPaletteResults
                        activeIndex={0}
                        emptyDescription="Try a different search."
                        emptyLabel="No results"
                        sections={[]}
                    />
                </PaletteWindow>
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="The band beside the traffic lights holds the sidebar toggle and New task; Search is the sidebar's first row and nothing else."
                label="Window, sidebar header, macOS, light"
                number="W-09"
                screen="09-header-macos-light-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <PaletteWindow mode="light" />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="The same, dark."
                label="Window, sidebar header, macOS, dark"
                number="W-10"
                screen="10-header-macos-dark-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <PaletteWindow mode="dark" />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="Without traffic lights the toggle starts at the window's edge."
                label="Window, sidebar header, Windows and Linux, light"
                number="W-11"
                screen="11-header-other-light-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <PaletteWindow mode="light" trafficLights={false} />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="The same, dark."
                label="Window, sidebar header, Windows and Linux, dark"
                number="W-12"
                screen="12-header-other-dark-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <PaletteWindow mode="dark" trafficLights={false} />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="Live: Search in the sidebar opens the palette, which arrives and leaves through ModalOverlayPresence; type to narrow the rows, then Escape, ⌘K, a press outside, or a row closes it."
                label="Window, live, light"
                number="W-14"
                screen="14-live-light-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <LivePaletteWindow mode="light" />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="The same, dark."
                label="Window, live, dark"
                number="W-15"
                screen="15-live-dark-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <LivePaletteWindow mode="dark" />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="At the window's 720 × 640 minimum the card keeps its width and its top gutter."
                label="Window, many results, minimum"
                number="W-13"
                screen="05-many-light-720x640"
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
                    detail="empty query · a plain state, before results arrive"
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
                    detail="completed query without matches · one row’s height"
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
