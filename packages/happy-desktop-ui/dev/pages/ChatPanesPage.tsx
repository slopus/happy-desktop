import { useState } from "react";
import {
    agentAuthor,
    happyAgentOwnerAuthor,
    type ComposerSnapshot,
    type ConversationMessageEntry,
} from "happy-desktop-state";
import { AppShell } from "../../src/AppShell";
import { Button } from "../../src/Button";
import { ChannelHeader } from "../../src/ChannelHeader";
import { ChatPanes } from "../../src/ChatPanes";
import { ChatProjectPicker } from "../../src/ChatProjectPicker";
import { CommandPalette } from "../../src/CommandPalette";
import { CommandPaletteResults } from "../../src/CommandPaletteResults";
import { ConversationView } from "../../src/ConversationView";
import { ModalOverlay } from "../../src/ModalOverlay";
import { Sidebar } from "../../src/Sidebar";
import { TabbedPane } from "../../src/TabbedPane";
import { ThemeScope } from "../../src/ThemeScope";
import { commandShortcut } from "../../src/keyboardShortcut";
import { ComponentPage, FullScreenSpecimen } from "../kit";

export const componentNumber = "P-019";
const noop = () => {};
const newChat = commandShortcut("t", { shift: true });
const previous = commandShortcut("arrowleft", { alt: true });
const next = commandShortcut("arrowright", { alt: true });
const composer: ComposerSnapshot = {
    agentUserIds: [],
    attachments: [],
    capabilities: { commands: [], mentions: false, shellMode: false },
    focused: false,
    mentionCandidates: [],
    revision: 0,
    scopeId: "chat-pane",
    submission: { status: "idle" },
    text: "",
};
const projects = [
    {
        id: "atlas",
        title: "Atlas Website",
        detail: "This Mac · ~/examples/atlas",
        chatTitle: "Polish the pricing page",
        prompt: "Make the pricing cards easier to compare. Keep the current visual style.",
        response:
            "The cards now share one layout, so the differences are easier to scan.\n\n- Aligned prices and billing periods\n- Grouped features in the same order\n- Kept the existing colors and type\n\nThe layout also holds up when a plan has a longer description.",
        draft: "Can you show the annual prices too?",
    },
    {
        id: "orbit",
        title: "Orbit API",
        detail: "This Mac · ~/examples/orbit",
        chatTitle: "Speed up search",
        prompt: "Search gets slow with a large catalog. Find the bottleneck and suggest a fix.",
        response:
            'Each result was fetching its category separately. I replaced those calls with a single query.\n\n```ts\nawait catalog.search({\n  query,\n  include: ["category"],\n});\n```\n\nThe response shape stays the same. I’m checking pagination next.',
        draft: "Check empty results as well.",
    },
    {
        id: "fieldnotes",
        title: "Field Notes",
        detail: "This Mac · ~/examples/field-notes",
        chatTitle: "Write the quickstart",
        prompt: "Write a short quickstart for someone trying the project for the first time.",
        response:
            "The draft walks through one complete example:\n\n1. Install the dependencies\n2. Start the local app\n3. Create your first notebook\n\nEach step includes the command to run and what you should see. The optional configuration is linked at the end.",
        draft: "Add an example screenshot.",
    },
];

/** Fictional content for a shareable preview; never reads a user's workspace. */
function sampleMessage(
    projectId: string,
    author: "you" | "agent",
    text: string,
): ConversationMessageEntry {
    return {
        kind: "message",
        source: "server",
        delivery: "sent",
        message: {
            id: `${projectId}-${author}`,
            chatId: projectId,
            sequence: author === "you" ? "1" : "2",
            changePts: author === "you" ? "1" : "2",
            sender: author === "you" ? happyAgentOwnerAuthor : agentAuthor,
            text,
            attachments: [],
            reactions: [],
            createdAt: "2026-10-14T09:00:00.000Z",
        },
    };
}

function ChatPanesDemo(props: {
    count: number;
    picker?: boolean;
    search?: boolean;
    baseline?: boolean;
    narrow?: boolean;
}) {
    const [panes, setPanes] = useState(
        projects.slice(0, props.count).map((project) => ({
            ...project,
            weight: 1,
            text: props.count === 3 ? project.draft : "",
        })),
    );
    const [activeId, setActiveId] = useState(projects[props.count === 3 ? 1 : 0]!.id);
    const [picker, setPicker] = useState(props.picker ?? false);
    const [search, setSearch] = useState(props.search ?? false);
    const [query, setQuery] = useState("");
    const [index, setIndex] = useState(0);
    const results = projects.filter((project) =>
        `${project.title} ${project.chatTitle}`.toLowerCase().includes(query.toLowerCase()),
    );
    const searchCommit = (beside: boolean, selected = index) => {
        const project = results[Math.min(selected, results.length - 1)];
        if (!project) return;
        const existing = panes.find((pane) => pane.id === project.id);
        if (!existing) {
            const pane = { ...project, weight: 1, text: project.draft };
            setPanes(
                beside
                    ? [...panes, pane]
                    : panes.map((entry) => (entry.id === activeId ? pane : entry)),
            );
        }
        setActiveId(project.id);
        setSearch(false);
    };
    const surface = (pane: (typeof panes)[number]) => (
        <AppShell embedded>
            <ChannelHeader
                title={pane.title}
                icon="inbox"
                actions={
                    props.baseline ? undefined : (
                        <>
                            <Button
                                aria-label="New chat beside"
                                icon="plus"
                                iconOnly
                                size="small"
                                variant="ghost"
                                shortcut={newChat}
                                onClick={() => setPicker(true)}
                            />
                            {panes.length > 1 ? (
                                <Button
                                    aria-label="Close chat pane"
                                    icon="close"
                                    iconOnly
                                    size="small"
                                    variant="ghost"
                                    onClick={() => {
                                        setPanes(panes.filter((item) => item.id !== pane.id));
                                        if (activeId === pane.id)
                                            setActiveId(
                                                panes.find((item) => item.id !== pane.id)!.id,
                                            );
                                    }}
                                />
                            ) : null}
                        </>
                    )
                }
            />
            <TabbedPane
                activeId="chat"
                onSelect={noop}
                tabs={[
                    {
                        id: "chat",
                        label: pane.chatTitle,
                        closable: true,
                    },
                ]}
            >
                <ConversationView
                    agentAuthor={agentAuthor}
                    viewerId={happyAgentOwnerAuthor.id}
                    entries={[
                        sampleMessage(pane.id, "you", pane.prompt),
                        sampleMessage(pane.id, "agent", pane.response),
                    ]}
                    composer={{ ...composer, scopeId: pane.id, text: pane.text }}
                    composerPlaceholder={`Message Happy in “${pane.title}”…`}
                    composerFocusOnType
                    onComposerValueChange={(text) =>
                        setPanes((current) =>
                            current.map((item) => (item.id === pane.id ? { ...item, text } : item)),
                        )
                    }
                    onComposerSend={noop}
                    motion="calm-typed"
                />
            </TabbedPane>
        </AppShell>
    );
    return (
        <div style={{ display: "flex", width: "100%", height: "100%", contain: "layout paint" }}>
            <ThemeScope mode="light">
                <AppShell
                    sidebarCollapsible
                    sidebarDefaultCollapsed={props.narrow}
                    sidebarDefaultWidth={240}
                    sidebar={
                        <Sidebar
                            onItemSelect={noop}
                            title="Happy"
                            activeItemId={activeId}
                            sections={[
                                {
                                    id: "projects",
                                    label: "Projects",
                                    items: projects.map((project) => ({
                                        id: project.id,
                                        label: project.title,
                                        kind: "view",
                                        icon: "inbox",
                                    })),
                                },
                            ]}
                        />
                    }
                >
                    {props.baseline ? (
                        surface(panes[0]!)
                    ) : (
                        <ChatPanes
                            activeId={activeId}
                            onFocus={setActiveId}
                            onResize={(id, nextId, weight, nextWeight) =>
                                setPanes((current) =>
                                    current.map((pane) =>
                                        pane.id === id
                                            ? { ...pane, weight }
                                            : pane.id === nextId
                                              ? { ...pane, weight: nextWeight }
                                              : pane,
                                    ),
                                )
                            }
                            previousShortcut={previous}
                            nextShortcut={next}
                            panes={panes.map((pane) => ({
                                id: pane.id,
                                label: pane.title,
                                weight: pane.weight,
                                content: surface(pane),
                            }))}
                        />
                    )}
                    {picker ? (
                        <ChatProjectPicker
                            autoFocus={false}
                            projects={projects.filter((project) =>
                                project.title.toLowerCase().includes(query.toLowerCase()),
                            )}
                            query={query}
                            activeIndex={index}
                            onQueryChange={(value) => {
                                setQuery(value);
                                setIndex(0);
                            }}
                            onActiveIndexChange={setIndex}
                            onClose={() => setPicker(false)}
                            onSelect={(id) => {
                                const project = projects.find((item) => item.id === id)!;
                                const unique = `${id}-${panes.length}`;
                                setPanes([
                                    ...panes,
                                    { ...project, id: unique, text: "", weight: 1 },
                                ]);
                                setActiveId(unique);
                                setPicker(false);
                            }}
                        />
                    ) : null}
                    {search ? (
                        <ModalOverlay placement="top" onDismiss={() => setSearch(false)}>
                            <CommandPalette
                                autoFocus={false}
                                query={query}
                                placeholder="Search chats, workspaces, and settings…"
                                onQueryChange={(value) => {
                                    setQuery(value);
                                    setIndex(0);
                                }}
                                onClose={() => setSearch(false)}
                                onSelectionMove={(direction) =>
                                    setIndex(
                                        (index + direction + results.length) %
                                            (results.length || 1),
                                    )
                                }
                                onSelectionCommit={() => searchCommit(false)}
                                selectionCommitLabel="Open here"
                                alternateAction={
                                    results.length > 0
                                        ? {
                                              label: "Open beside",
                                              onSelect: () => searchCommit(true),
                                          }
                                        : undefined
                                }
                            >
                                <CommandPaletteResults
                                    activeIndex={index}
                                    onActiveIndexChange={setIndex}
                                    onSelect={(_id, selected) => searchCommit(false, selected)}
                                    sections={[
                                        {
                                            id: "chats",
                                            caption: "Chats",
                                            rows: results.map((project) => ({
                                                kind: "command",
                                                id: project.id,
                                                title: project.chatTitle,
                                                meta: project.title,
                                                icon: "chat",
                                            })),
                                        },
                                    ]}
                                />
                            </CommandPalette>
                        </ModalOverlay>
                    ) : null}
                </AppShell>
            </ThemeScope>
        </div>
    );
}

export function ChatPanesPage() {
    return (
        <ComponentPage
            number={componentNumber}
            title="Chat panes"
            summary="Independent chats, a project picker, and keyboard navigation in the existing workspace shell."
        >
            {[
                { width: 1100, height: 760 },
                { width: 720, height: 640 },
            ].map((window) => (
                <div
                    key={window.width}
                    style={{ display: "flex", flexDirection: "column", gap: "24px" }}
                >
                    <FullScreenSpecimen
                        number="01"
                        label="Current single chat"
                        detail="The existing layout before opening another chat."
                        window={window}
                        screen={`01-before-${window.width}x${window.height}`}
                    >
                        <ChatPanesDemo baseline count={1} narrow={window.width === 720} />
                    </FullScreenSpecimen>
                    <FullScreenSpecimen
                        number="02"
                        label="Two projects"
                        detail="Drag the divider; Option-Command-Left/Right focus the neighboring composer."
                        window={window}
                        screen={`02-two-chats-${window.width}x${window.height}`}
                    >
                        <ChatPanesDemo count={2} narrow={window.width === 720} />
                    </FullScreenSpecimen>
                    <FullScreenSpecimen
                        number="03"
                        label="Choose a project"
                        detail="Shift-Command-T starts a new chat beside the current ones."
                        window={window}
                        screen={`03-project-picker-${window.width}x${window.height}`}
                    >
                        <ChatPanesDemo count={2} picker narrow={window.width === 720} />
                    </FullScreenSpecimen>
                    <FullScreenSpecimen
                        number="04"
                        label="Three chats · sample data"
                        detail="Fictional projects and conversations, safe to share. The sidebar is collapsed to give each chat more room."
                        window={window}
                        screen={`04-three-chats-${window.width}x${window.height}`}
                    >
                        <ChatPanesDemo count={3} narrow />
                    </FullScreenSpecimen>
                    <FullScreenSpecimen
                        number="05"
                        label="Find a chat"
                        detail="Enter opens the result here; Shift-Enter opens it beside the current chats."
                        window={window}
                        screen={`05-find-chat-${window.width}x${window.height}`}
                    >
                        <ChatPanesDemo count={2} search narrow={window.width === 720} />
                    </FullScreenSpecimen>
                </div>
            ))}
        </ComponentPage>
    );
}
