import { act, fireEvent, render } from "@testing-library/react";
import { beforeAll, expect, it, vi } from "vitest";
import type {
    HappyAgentArtifact,
    HappyAgentArtifactCatalogSnapshot,
    HappyAgentArtifactCatalogStore,
    HappyAgentArtifactId,
    HappyAgentArtifacts,
    HappyAgentClockStore,
    HappyAgentConnectionStore,
    HappyAgentModelStore,
    HappyAgentPanelStore,
    HappyAgentSurface,
    HappyAgentSurfaceActiveTodo,
    HappyAgentSurfaceCatalogSnapshot,
    HappyAgentSurfaceCatalogStore,
    HappyAgentSurfaceId,
    HappyAgentSurfaces,
    HappyAgentSurfaceTodoId,
    HappyAgentWorkspaceStore,
} from "happy-desktop-state";
import {
    appearanceStoreCreate,
    commandPaletteStoreCreate,
    happyAgentArtifactCatalogStoreNoop,
    happyAgentGroupAccessRefused,
    HAPPY_AGENT_GROUP_UNLISTED_REFUSAL,
    HAPPY_AGENT_RETAINED_CONVERSATIONS_NONE,
    happyAgentHostNoop,
    happyAgentSurfaceSupportStoreNone,
} from "happy-desktop-state";
import {
    AppHappyAgentView,
    type AppHappyAgentDirectorySnapshot,
    type AppHappyAgentDirectoryStore,
} from "../../sources/AppHappyAgentView";

/* The sidebar has no search field of its own: ⌘K is the one search. A typed
 * query there finds the machine's documents, the open todos of the reader's
 * lists, and its artifacts, and opening one goes where its own row would. */

const NOW = 1_764_000_000_000;
const CONNECTED = { connection: "connected", daemon: "ready", attempt: 0 } as const;
const PANEL_CLOSED = { open: false, tabs: [] } as const;
const MODELS_LOADING = { type: "loading" } as const;

beforeAll(() => {
    // jsdom lays nothing out, so it has nothing to scroll into view.
    Element.prototype.scrollIntoView ??= () => undefined;
});

const surface = (id: string, name: string, kind: "document" | "todo"): HappyAgentSurface => ({
    id: id as HappyAgentSurfaceId,
    type: { kind },
    name,
    image: null,
    members: [{ userId: null, orderKey: id, joinedAt: NOW }],
    creatorUserId: null,
    chatAgentId: null,
    version: "1",
    updatedAt: NOW,
});

const PLAN = surface("srf_plan", "Launch plan", "document");
const CHECKLIST = surface("srf_checklist", "Release checklist", "todo");

const EMAIL: HappyAgentSurfaceActiveTodo = {
    id: "todo_email" as HappyAgentSurfaceTodoId,
    surfaceId: CHECKLIST.id,
    text: "Write the launch email",
    authorUserId: null,
    createdAt: NOW,
    updatedAt: NOW,
    version: "1",
    status: "active",
    orderKey: "a",
    completedAt: null,
    deletedAt: null,
};

const CATALOG: HappyAgentSurfaceCatalogSnapshot = {
    availability: "available",
    surfaces: [PLAN, CHECKLIST],
    joined: [PLAN, CHECKLIST],
    viewer: { userId: null },
    users: new Map(),
    membershipPending: new Set(),
    activeTodoCounts: new Map([[CHECKLIST.id, 1]]),
    activeTodos: new Map([[CHECKLIST.id, [EMAIL]]]),
    create: { phase: "closed" },
    createsRefused: new Map(),
    chatsOpening: new Map(),
    chats: new Map(),
    chatActivity: new Map(),
    chatsShown: new Set(),
    expanded: new Set(),
};

const DECK = {
    id: "art_deck" as HappyAgentArtifactId,
    type: "html",
    title: "Launch deck",
    status: "active",
    updatedAt: NOW,
} as HappyAgentArtifact;

const ARTIFACTS: HappyAgentArtifactCatalogSnapshot = {
    ...happyAgentArtifactCatalogStoreNoop.get(),
    availability: "available",
    loading: false,
    artifacts: [DECK],
};

function workspace(): HappyAgentWorkspaceStore {
    const snapshot = {
        list: {
            bots: [],
            tasks: [],
            tasksArchived: [],
            archivedSessions: [],
            projects: { type: "ready" as const, value: [] },
        },
        conversation: { type: "unloaded" as const },
        address: {},
        groupAccess: happyAgentGroupAccessRefused(HAPPY_AGENT_GROUP_UNLISTED_REFUSAL),
        recentTabs: [],
        fileTabs: [],
        tabOrder: [],
        openInTargets: [],
        fileViewMode: "unified" as const,
        fileScope: "changed" as const,
        fileLayout: "flat" as const,
        fileTreeExpanded: new Set<string>(),
        fileTreeCollapsed: new Set<string>(),
        fileSearch: { query: "", searching: false },
        workspaceFilesLoading: false,
        fileComments: { comments: [] },
        reviews: new Map(),
    };
    return {
        get: () => snapshot,
        deviceBridgeSupport: () => undefined,
        conversationsRetained: HAPPY_AGENT_RETAINED_CONVERSATIONS_NONE,
        panel: {
            get: () => PANEL_CLOSED,
            subscribe: () => () => undefined,
            [Symbol.dispose]: () => undefined,
        } as unknown as HappyAgentPanelStore,
        subscribe: () => () => undefined,
        sidebarRowsUpdate: () => undefined,
        conversationPrefetch: () => undefined,
        [Symbol.dispose]: () => undefined,
    } as unknown as HappyAgentWorkspaceStore;
}

function view() {
    const palette = commandPaletteStoreCreate();
    const onSurfaceOpen = vi.fn();
    const onArtifactOpen = vi.fn();
    const artifactsRead = vi.fn();
    const surfaces = {
        catalog: () =>
            ({
                get: () => CATALOG,
                subscribe: () => () => undefined,
                [Symbol.dispose]: () => undefined,
            }) as unknown as HappyAgentSurfaceCatalogStore,
        support: () => happyAgentSurfaceSupportStoreNone,
    } as unknown as HappyAgentSurfaces;
    const search = {
        ...happyAgentArtifactCatalogStoreNoop,
        get: () => ARTIFACTS,
        // Subscribing is what reads the catalog: only while the palette is open.
        subscribe: () => {
            artifactsRead();
            return () => undefined;
        },
    } as HappyAgentArtifactCatalogStore;
    const artifacts = {
        catalog: () => happyAgentArtifactCatalogStoreNoop,
        panel: () => happyAgentArtifactCatalogStoreNoop,
        search: () => search,
    } as unknown as HappyAgentArtifacts;
    const snapshot: AppHappyAgentDirectorySnapshot = {
        happyAgents: [
            {
                bots: [],
                id: "local",
                label: "This Mac",
                projects: [],
                projectsStatus: "ready",
                session: {
                    clock: {
                        get: () => NOW,
                        subscribe: () => () => undefined,
                        [Symbol.dispose]: () => undefined,
                    } as unknown as HappyAgentClockStore,
                    connection: {
                        get: () => CONNECTED,
                        subscribe: () => () => undefined,
                        [Symbol.dispose]: () => undefined,
                    } as unknown as HappyAgentConnectionStore,
                    host: happyAgentHostNoop,
                    models: {
                        get: () => MODELS_LOADING,
                        subscribe: () => () => undefined,
                        [Symbol.dispose]: () => undefined,
                    } as unknown as HappyAgentModelStore,
                    workspace: workspace(),
                    surfaces,
                    artifacts,
                },
                status: "connected",
            },
        ],
    };
    const directory: AppHappyAgentDirectoryStore = {
        get: () => snapshot,
        subscribe: () => () => undefined,
        happyAgentActivate: () => undefined,
    };
    const rendered = render(
        <AppHappyAgentView
            appearance={appearanceStoreCreate({ mode: "light" })}
            commandPalette={palette}
            onArtifactOpen={onArtifactOpen}
            onChatSelect={() => undefined}
            onFileClose={() => undefined}
            onFileSelect={() => undefined}
            onSettingsOpen={() => undefined}
            onSurfaceOpen={onSurfaceOpen}
            happyAgentId="local"
            happyAgents={directory}
        />,
    );
    return { ...rendered, palette, onSurfaceOpen, onArtifactOpen, artifactsRead };
}

const rowIds = () =>
    [...document.querySelectorAll('[data-happy-desktop-ui="command-palette-results-row"]')].map(
        (row) => row.getAttribute("data-row-id"),
    );

const rowClick = (id: string) =>
    fireEvent.click(
        document.querySelector(
            `[data-happy-desktop-ui="command-palette-results-row"][data-row-id="${id}"]`,
        )!,
    );

it("offers ⌘K as the sidebar's one search, with no field of its own", () => {
    const { container, artifactsRead } = view();
    expect(container.querySelector('[data-happy-desktop-ui="sidebar-search"]')).toBeNull();
    expect(container.querySelector('input[type="search"]')).toBeNull();
    // Search heads the sidebar and opens the palette; a closed palette reads nothing.
    expect(container.querySelector('[data-item-id="search"]')?.textContent).toContain("Search");
    expect(artifactsRead).not.toHaveBeenCalled();
});

it("finds documents, open todos, and artifacts, and opens each where its own row would", () => {
    const { palette, onSurfaceOpen, onArtifactOpen, artifactsRead } = view();
    act(() => palette.paletteOpen());
    expect(artifactsRead).toHaveBeenCalled();
    act(() => palette.queryUpdate("launch"));
    // Sections follow their best match: two titles start with the query, the todo only contains it.
    expect(rowIds()).toEqual(["surface:srf_plan", "artifact:art_deck", "todo:todo_email"]);
    expect(
        [
            ...document.querySelectorAll(
                '[data-happy-desktop-ui="command-palette-results-caption"]',
            ),
        ].map((caption) => caption.textContent),
    ).toEqual(["Documents", "Artifacts", "Todos"]);

    rowClick("artifact:art_deck");
    expect(onArtifactOpen).toHaveBeenCalledExactlyOnceWith("local", "art_deck");
    expect(palette.get().open).toBe(false);

    act(() => palette.paletteOpen());
    act(() => palette.queryUpdate("email"));
    rowClick("todo:todo_email");
    // A todo opens the list it is in.
    expect(onSurfaceOpen).toHaveBeenCalledExactlyOnceWith("local", "srf_checklist");

    act(() => palette.paletteOpen());
    act(() => palette.queryUpdate("plan"));
    rowClick("surface:srf_plan");
    expect(onSurfaceOpen).toHaveBeenLastCalledWith("local", "srf_plan");
});
