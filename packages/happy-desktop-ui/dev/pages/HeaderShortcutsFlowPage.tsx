import { AppShell } from "../../src/AppShell";
import { CommandPalette } from "../../src/CommandPalette";
import { CommandPaletteResults } from "../../src/CommandPaletteResults";
import { ConnectionShell, type ConnectionShellItem } from "../../src/ConnectionShell";
import { ConnectionSurface } from "../../src/ConnectionSurface";
import { HappyAgentCreateBotPage } from "../../src/HappyAgentCreateBotPage";
import { HappyAgentCreateTaskPage } from "../../src/HappyAgentCreateTaskPage";
import { commandShortcut } from "../../src/keyboardShortcut";
import { ModalOverlay } from "../../src/ModalOverlay";
import { Sidebar } from "../../src/Sidebar";
import { TabbedPane } from "../../src/TabbedPane";
import { ThemeScope } from "../../src/ThemeScope";
import { WindowCover } from "../../src/WindowOverlay";
import { ComponentPage, FullScreenSpecimen } from "../kit";
import { botCreationSpecimen } from "./HappyAgentCreateBotBlueprintPage";
import { taskCreationSpecimen } from "./HappyAgentCreateTaskBlueprintPage";

export const componentNumber = "P-029";
const noop = () => {};
const windows = [
    { width: 1100, height: 760 },
    { width: 720, height: 640 },
];
const screens = ["task", "bot", "palette"] as const;
const labels: Record<(typeof screens)[number], string> = {
    task: "New task",
    bot: "New bot",
    palette: "Command palette",
};
const connections: ConnectionShellItem[] = [
    { id: "home", label: "This Mac", local: true, status: "connected" },
    { id: "studio", label: "Studio", local: false, status: "connected", working: true },
    { id: "lab", label: "Lab", local: false, status: "connected" },
];

/**
 * The window as the app assembles it — connection rail, connection surface,
 * shell, sidebar — so the creation screens wear the workspace's own tab strip,
 * as every other screen does, and the palette's dim reaches the rail as well
 * as the sidebar.
 */
export function HeaderShortcutsFlowPage() {
    return (
        <ComponentPage
            number={componentNumber}
            title="Creation headers and window palette"
            contract="Props only"
            summary="Both creation screens head their content with the workspace's tab strip, one tab naming what is being made; header controls name their chords in a tooltip, and the palette's dim covers the whole window, connection rail included."
        >
            {windows.flatMap((window) =>
                screens.map((screen, index) => (
                    <FullScreenSpecimen
                        key={`${screen}-${window.width}`}
                        number={String(index + 1)}
                        label={labels[screen]}
                        detail="The window's own rail, sidebar, and integrated chrome"
                        window={window}
                        screen={`${String(index + 1).padStart(2, "0")}-${screen}-${window.width}x${window.height}`}
                    >
                        {/* The viewport stands in for the window: fixed layers
                        resolve against it rather than against the page. */}
                        <div style={{ display: "flex", transform: "translateZ(0)" }}>
                            <ThemeScope mode="dark">
                                <ConnectionShell
                                    items={connections}
                                    selectedId="home"
                                    onSelect={noop}
                                    windowControls
                                >
                                    <ConnectionSurface active>
                                        <AppShell
                                            sidebarCollapsible
                                            sidebarShortcut
                                            windowControls
                                            navigationChrome="integrated"
                                            sidebarCollapsedLayout="overlay"
                                            sidebarDefaultWidth={250}
                                            sidebarCollapsedAction={{
                                                label: "New task",
                                                onClick: noop,
                                                shortcut: commandShortcut("n"),
                                            }}
                                            sidebar={
                                                <Sidebar
                                                    activeItemId=""
                                                    onItemSelect={noop}
                                                    searchRow={{
                                                        label: "Search",
                                                        shortcut: commandShortcut("k"),
                                                        onOpen: noop,
                                                    }}
                                                    sections={[
                                                        {
                                                            id: "bots",
                                                            label: "Bots",
                                                            items: [
                                                                {
                                                                    id: "chief",
                                                                    kind: "agent",
                                                                    label: "Chief of Staff",
                                                                    icon: "spark",
                                                                },
                                                            ],
                                                        },
                                                        {
                                                            id: "tasks",
                                                            label: "Tasks",
                                                            items: [
                                                                {
                                                                    id: "release",
                                                                    kind: "agent",
                                                                    label: "Release desktop",
                                                                    icon: "tasks",
                                                                },
                                                            ],
                                                        },
                                                        {
                                                            id: "projects",
                                                            label: "Projects",
                                                            items: [
                                                                {
                                                                    id: "happy",
                                                                    kind: "project",
                                                                    label: "happy-desktop",
                                                                    icon: "branch",
                                                                },
                                                            ],
                                                        },
                                                    ]}
                                                />
                                            }
                                        >
                                            <TabbedPane
                                                activeId="create"
                                                onSelect={noop}
                                                size="medium"
                                                tabSizing="content"
                                                tabs={[
                                                    {
                                                        id: "create",
                                                        label: labels[
                                                            screen === "bot" ? "bot" : "task"
                                                        ],
                                                        closable: false,
                                                    },
                                                ]}
                                            >
                                                {screen === "bot"
                                                    ? botCreationSpecimen(
                                                          <HappyAgentCreateBotPage
                                                              name=""
                                                              faceSlot={0}
                                                              faces={[
                                                                  "blueprint1",
                                                                  "blueprint2",
                                                                  "blueprint3",
                                                                  "blueprint4",
                                                              ]}
                                                              onNameChange={noop}
                                                              onSubmit={noop}
                                                              onCreditOpen={noop}
                                                              onFacePick={noop}
                                                              onFacesRoll={noop}
                                                          />,
                                                          "",
                                                      )
                                                    : taskCreationSpecimen(
                                                          <HappyAgentCreateTaskPage
                                                              name=""
                                                              onNameChange={noop}
                                                              onSubmit={noop}
                                                          />,
                                                          "",
                                                      )}
                                            </TabbedPane>
                                        </AppShell>
                                        {screen === "palette" ? (
                                            <WindowCover>
                                                <ModalOverlay
                                                    backdrop="soft"
                                                    placement="top"
                                                    onDismiss={noop}
                                                >
                                                    <CommandPalette
                                                        query=""
                                                        onQueryChange={noop}
                                                        onClose={noop}
                                                        placeholder="Search work, documents, todos, and artifacts…"
                                                    >
                                                        <CommandPaletteResults
                                                            activeIndex={0}
                                                            onSelect={noop}
                                                            sections={[
                                                                {
                                                                    id: "recent",
                                                                    caption: "Recent",
                                                                    rows: [
                                                                        {
                                                                            id: "release",
                                                                            kind: "command",
                                                                            title: "Release desktop",
                                                                            icon: "tasks",
                                                                            meta: "Task",
                                                                        },
                                                                    ],
                                                                },
                                                            ]}
                                                        />
                                                    </CommandPalette>
                                                </ModalOverlay>
                                            </WindowCover>
                                        ) : null}
                                    </ConnectionSurface>
                                </ConnectionShell>
                            </ThemeScope>
                        </div>
                    </FullScreenSpecimen>
                )),
            )}
        </ComponentPage>
    );
}
