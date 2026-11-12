import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { RouterProvider } from "@tanstack/react-router";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import type {
    HappyAgentArtifacts,
    HappyAgentClockStore,
    HappyAgentConnectionStore,
    HappyAgentHost,
    HappyAgentModelStore,
    HappyAgentPanelStore,
    HappyAgentSurface,
    HappyAgentSurfaceCatalogSnapshot,
    HappyAgentSurfaceCatalogStore,
    HappyAgentSurfaceId,
    HappyAgentSurfaces,
    HappyAgentWorkspaceStore,
} from "happy-desktop-state";
import {
    appearanceStoreCreate,
    composerSourceOf,
    composerStoreCreate,
    experimentsStoreCreate,
    happyAgentArtifactCatalogStoreNoop,
    happyAgentGroupAccessRefused,
    happyAgentHostNoop,
    happyAgentPanelStoreCreate,
    happyAgentSettingsStoreCreate,
    happyAgentSurfaceSupportStoreNone,
    mobilePairingMethodStoreCreate,
    HAPPY_AGENT_GROUP_UNLISTED_REFUSAL,
    HAPPY_AGENT_RETAINED_CONVERSATIONS_NONE,
} from "happy-desktop-state";
import type {
    AppHappyAgentDirectorySnapshot,
    AppHappyAgentDirectoryStore,
} from "../../sources/AppHappyAgentView";
import { APP_SHORTCUTS } from "../../sources/appShortcuts";
import {
    happyAgentMemoryHistoryCreate,
    happyAgentRouterCreate,
    type HappyAgentRouterContext,
} from "../../sources/navigation/happyAgentRouter";

// jsdom has no canvas; the spinner settings draws while it loads is unrelated here.
vi.mock("../../../happy-desktop-ui/src/Spinner", () => ({ Spinner: () => null }));

/*
 * Two things the window owes the reader wherever they are.
 *
 * The sidebar marks the row for what is in front. A bot added to the top of the
 * sidebar keeps its row under Bots as well, and that list row is the one marked
 * while it is open, never the row at the top. An artifact added to the top has
 * no other row, so its added row is the one marked — never the Artifacts
 * page's row.
 *
 * Command-W closes what is in front: a page steps back to where the reader was,
 * and a view that has just come forward beside a conversation closes before the
 * conversation does. With nothing in the window left to close it closes the
 * window, where the shell offers that, and otherwise does nothing; it never
 * offers to archive the project the reader is standing in.
 */

const NOW = 1_764_000_000_000;
const CONNECTED = { connection: "connected", daemon: "ready", attempt: 0 } as const;
const MODELS_LOADING = { type: "loading" } as const;

const PROJECTS = [
    {
        id: "prj_one",
        path: "/Users/happy/happy",
        displayPath: "~/happy",
        name: "happy",
        kind: "regular",
        lifecycle: { phase: "ready" },
        worktrees: [],
        activity: "idle",
        updatedAt: NOW,
        conversations: [
            { id: "ses_one", title: "Fix", subtitle: "~/happy", updatedAt: NOW, activity: "idle" },
        ],
    },
] as unknown as AppHappyAgentDirectorySnapshot["happyAgents"][number]["projects"];

/** The same machine with a second project nobody has started a chat in. */
const PROJECTS_WITH_EMPTY = [
    ...PROJECTS,
    {
        id: "prj_bare",
        path: "/Users/happy/bare",
        displayPath: "~/bare",
        name: "bare",
        kind: "regular",
        lifecycle: { phase: "ready" },
        worktrees: [],
        activity: "idle",
        updatedAt: NOW,
        conversations: [],
    },
] as unknown as typeof PROJECTS;

/** The same machine with a second chat in its project. */
const PROJECTS_WITH_TWO_CHATS = [
    {
        ...(PROJECTS[0] as object),
        conversations: [
            { id: "ses_one", title: "Fix", subtitle: "~/happy", updatedAt: NOW, activity: "idle" },
            { id: "ses_two", title: "Ship", subtitle: "~/happy", updatedAt: NOW, activity: "idle" },
        ],
    },
] as unknown as typeof PROJECTS;

/** The same machine with a workspace under its project. */
const PROJECTS_WITH_WORKTREE = [
    {
        ...(PROJECTS[0] as object),
        worktrees: [
            {
                id: "wt_one",
                projectId: "prj_one",
                name: "fix-tabs",
                creatorAgentId: null,
                orderKey: "wt_one",
                path: "/Users/happy/happy-worktrees/fix-tabs",
                displayPath: "~/happy-worktrees/fix-tabs",
                lifecycle: { phase: "ready" },
                conversations: [],
                activity: "idle",
                updatedAt: NOW,
            },
        ],
    },
] as unknown as typeof PROJECTS;

const BOT = {
    id: "bot_one",
    name: "Scout",
    shortName: "Scout",
    workspaceId: "grp_bot",
    conversation: {
        id: "ses_bot",
        title: "Scout",
        updatedAt: NOW,
        activity: "idle",
        unread: true,
    },
    subtasks: [
        {
            workspaceId: "grp_bot",
            conversation: { id: "ses_sub", title: "Survey", updatedAt: NOW, activity: "idle" },
            subtasks: [],
        },
    ],
} as never;

const pinned = (id: string, target: unknown, kind: string): HappyAgentSurface =>
    ({
        id: id as HappyAgentSurfaceId,
        type: { kind },
        name: id,
        image: null,
        members: [{ userId: null, orderKey: id, joinedAt: NOW }],
        creatorUserId: null,
        chatAgentId: null,
        version: "1",
        updatedAt: NOW,
        target,
    }) as unknown as HappyAgentSurface;

const ART = pinned(
    "srf_art",
    {
        state: "available",
        kind: "artifact",
        id: "art_one",
        name: "Deck",
        hasImage: false,
        version: "1",
    },
    "artifact",
);
const BOTPIN = pinned(
    "srf_bot",
    {
        state: "available",
        kind: "bot",
        id: "bot_one",
        name: "Scout",
        hasImage: false,
        version: "1",
    },
    "bot",
);

const CATALOG = {
    availability: "available",
    surfaces: [ART, BOTPIN],
    joined: [ART, BOTPIN],
    viewer: { userId: null },
    users: new Map(),
    membershipPending: new Set(),
    activeTodoCounts: new Map(),
    activeTodos: new Map(),
    create: { phase: "closed" },
    createsRefused: new Map(),
    chatsOpening: new Map(),
    chats: new Map(),
    chatActivity: new Map(),
    chatsShown: new Set(),
    expanded: new Set(),
} as unknown as HappyAgentSurfaceCatalogSnapshot;

const calls: string[] = [];
const lenient = <T extends object>(known: T) =>
    new Proxy(known as Record<PropertyKey, unknown>, {
        get: (target, key) =>
            key in target
                ? target[key]
                : (...input: unknown[]) => {
                      if (typeof key === "string" && /Archive|Close|close|Leave/.test(key))
                          calls.push(key + "(" + JSON.stringify(input) + ")");
                      return undefined;
                  },
    });
const quiet = <T,>(value: T) => lenient({ get: () => value, subscribe: () => () => undefined });

const panels: HappyAgentPanelStore[] = [];
function workspace(
    address: object,
    projects: typeof PROJECTS,
    // Fields a test keeps live, read on every render: given as getters.
    live: object = {},
    // Actions a test watches, in place of the ones that do nothing here.
    actions: object = {},
): HappyAgentWorkspaceStore {
    const snapshot = {
        list: {
            bots: [BOT],
            tasks: [],
            taskDirectory: [],
            tasksArchived: [],
            archivedSessions: [
                { id: "ses_shut", title: "Earlier", projectId: "prj_one", archivedAt: NOW - 1 },
            ],
            projects: { type: "ready" as const, value: projects },
        },
        conversation: { type: "unloaded" as const },
        address,
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
    Object.defineProperties(snapshot, Object.getOwnPropertyDescriptors(live));
    const panel = happyAgentPanelStoreCreate({
        terminalOpen: () => ({}) as never,
    });
    const scope = address as { groupId?: string; conversationId?: string };
    panel.scopeApply(scope.groupId as never, scope.conversationId as never);
    panels.push(panel);
    return lenient({
        get: () => snapshot,
        conversationRestore: (conversationId: string) => {
            calls.push(`conversationRestore(${conversationId})`);
            return Promise.resolve();
        },
        deviceBridgeSupport: () => undefined,
        conversationsRetained: HAPPY_AGENT_RETAINED_CONVERSATIONS_NONE,
        panel,
        subscribe: () => () => undefined,
        ...actions,
    }) as unknown as HappyAgentWorkspaceStore;
}

/** What a test puts on the machine besides its projects. */
interface MachineExtras {
    readonly workspaceLive?: object;
    readonly workspaceActions?: object;
    // Actions on the Surfaces catalog a test watches.
    readonly surfaceActions?: object;
    // The artifact the viewer holds; loading when absent.
    readonly artifactViewer?: object;
}

function directory(
    address: object,
    live: boolean,
    catalog: HappyAgentSurfaceCatalogSnapshot,
    projects: typeof PROJECTS,
    extras: MachineExtras = {},
): AppHappyAgentDirectoryStore {
    const titles = new Map([
        [
            "art_one",
            {
                type: "ready",
                status: "active",
                title: "Deck",
                latestVersion: 1,
                live: live ? { url: "https://x.test", networkId: "n" } : null,
            },
        ],
    ]);
    const catalogSnapshot = {
        ...happyAgentArtifactCatalogStoreNoop.get(),
        availability: "available",
        loading: false,
    };
    const catalogStore = { ...happyAgentArtifactCatalogStoreNoop, get: () => catalogSnapshot };
    const titlesStore = quiet(titles);
    const peopleStore = quiet(new Map());
    const viewerStore = quiet(
        extras.artifactViewer ?? { artifactId: undefined, artifact: { type: "loading" } },
    );
    const creationStore = quiet({});
    const artifacts = lenient({
        catalog: () => catalogStore,
        panel: () => happyAgentArtifactCatalogStoreNoop,
        search: () => happyAgentArtifactCatalogStoreNoop,
        creation: () => creationStore,
        titles: () => titlesStore,
        people: () => peopleStore,
        viewer: () => viewerStore,
        panelViewer: () => viewerStore,
        tabViewer: () => viewerStore,
        inline: () => quiet(new Map()),
        liveRead: () => Promise.resolve(undefined),
    }) as unknown as HappyAgentArtifacts;
    const surfaceCatalogStore = lenient({
        get: () => catalog,
        subscribe: () => () => undefined,
        ...extras.surfaceActions,
    }) as unknown as HappyAgentSurfaceCatalogStore;
    const surfaces = {
        catalog: () => surfaceCatalogStore,
        support: () => happyAgentSurfaceSupportStoreNone,
    } as unknown as HappyAgentSurfaces;
    const snapshot = {
        happyAgents: [
            {
                bots: [BOT],
                id: "local",
                label: "This Mac",
                projects,
                projectsStatus: "ready",
                session: {
                    clock: quiet(NOW) as unknown as HappyAgentClockStore,
                    connection: quiet(CONNECTED) as unknown as HappyAgentConnectionStore,
                    host: happyAgentHostNoop as HappyAgentHost,
                    models: quiet(MODELS_LOADING) as unknown as HappyAgentModelStore,
                    workspace: workspace(
                        address,
                        projects,
                        extras.workspaceLive,
                        extras.workspaceActions,
                    ),
                    surfaces,
                    artifacts,
                },
                status: "connected",
            },
        ],
    } as unknown as AppHappyAgentDirectorySnapshot;
    return {
        get: () => snapshot,
        subscribe: () => () => undefined,
        happyAgentActivate: () => undefined,
    };
}

async function windowOpen(
    address: string,
    wsAddress: object = {},
    live = false,
    catalog: HappyAgentSurfaceCatalogSnapshot = CATALOG,
    // What the shell around the window supplies, and the machine's projects.
    host: MachineExtras & {
        readonly onWindowClose?: () => void;
        readonly projects?: typeof PROJECTS;
    } = {},
) {
    const router = happyAgentRouterCreate(happyAgentMemoryHistoryCreate(address));
    onTestFinished(() => router.history.destroy());
    const context: HappyAgentRouterContext = {
        appearance: appearanceStoreCreate({ mode: "light" }),
        happyAgents: directory(wsAddress, live, catalog, host.projects ?? PROJECTS, host),
        settings: happyAgentSettingsStoreCreate(),
        experiments: experimentsStoreCreate(),
        mobilePairingMethod: mobilePairingMethodStoreCreate({ defaultMethod: "direct" }),
        ...(host.onWindowClose ? { onWindowClose: host.onWindowClose } : {}),
    };
    router.update({ context });
    await router.load();
    const view = render(<RouterProvider context={context} router={router} />);
    const row = (id: string) =>
        view.container.querySelector<HTMLElement>(
            `[data-happy-desktop-ui="sidebar-item"][data-item-id="${id}"]`,
        );
    const rows = () =>
        [...view.container.querySelectorAll('[data-happy-desktop-ui="sidebar-item"]')].map((n) =>
            n.getAttribute("data-item-id"),
        );
    const active = () =>
        [
            ...view.container.querySelectorAll(
                '[data-happy-desktop-ui="sidebar-item"][data-active]',
            ),
        ].map((n) => n.getAttribute("data-item-id"));
    return { router, row, rows, active, view };
}

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 50)));

const CHAT = "/chats/local/prj_one/ses_one";
const CHAT_ADDRESS = { groupId: "prj_one", conversationId: "ses_one" };

/** The close chord as this platform types it, sent to the window as a key press is. */
const closeChord = () =>
    act(() => {
        const meta = APP_SHORTCUTS.tabClose.modifier === "Meta";
        window.dispatchEvent(
            new KeyboardEvent("keydown", {
                key: "w",
                code: "KeyW",
                metaKey: meta,
                ctrlKey: !meta,
                bubbles: true,
                cancelable: true,
            }),
        );
    });

describe("the sidebar marks the row for what is in front", () => {
    it("lists a bot added to the top there and under Bots, and marks the list row", async () => {
        const opened = await windowOpen(CHAT, CHAT_ADDRESS);
        await waitFor(() => expect(opened.row("local/prj_one")).not.toBeNull());

        // Two rows: the one added to the top, and the bot's own under Bots.
        expect(opened.rows()).toEqual([
            "feed",
            "artifacts",
            "local/surface:srf_art",
            "local/surface:srf_bot",
            "local/grp_bot",
            "local/ses_sub",
            "local/prj_one",
        ]);
        expect(opened.active()).toEqual(["local/prj_one"]);

        // Opened from its row at the top, the bot's list row is lit, not that one.
        fireEvent.click(opened.row("local/surface:srf_bot")!);
        await settle();
        expect(opened.router.state.location.pathname).toBe("/chats/local/grp_bot/ses_bot");
        expect(opened.active()).toEqual(["local/grp_bot"]);

        // Opened from its list row, the same.
        fireEvent.click(opened.row("local/prj_one")!);
        await settle();
        fireEvent.click(opened.row("local/grp_bot")!);
        await settle();
        expect(opened.router.state.location.pathname).toBe("/chats/local/grp_bot/ses_bot");
        expect(opened.active()).toEqual(["local/grp_bot"]);
    });

    it("opens an added artifact on its Surface, drawn as the artifact itself, and marks its row", async () => {
        const opened = await windowOpen(CHAT, CHAT_ADDRESS);
        await waitFor(() => expect(opened.row("local/prj_one")).not.toBeNull());

        fireEvent.click(opened.row("local/surface:srf_art")!);
        await settle();

        expect(opened.router.state.location.pathname).toBe("/surfaces/local/srf_art");
        expect(opened.active()).toEqual(["local/surface:srf_art"]);
        // The Surface's page is the artifact's own viewer, not a page offering to open it.
        expect(
            document.querySelector('[data-happy-desktop-ui="happy-agent-artifact-viewer"]'),
        ).not.toBeNull();
    });

    it("marks an added live artifact's row while it is in front beside the chat", async () => {
        const opened = await windowOpen(CHAT, CHAT_ADDRESS, true);
        await waitFor(() => expect(opened.row("local/prj_one")).not.toBeNull());
        const panel = panels.at(-1)!;

        // A live artifact is a page, so it opens as a tab beside the chat and
        // the address stays the chat's.
        fireEvent.click(opened.row("local/surface:srf_art")!);
        await settle();
        expect(opened.router.state.location.pathname).toBe(CHAT);
        expect(panel.get().open).toBe(true);
        expect(opened.active()).toEqual(["local/surface:srf_art", "local/prj_one"]);

        // Once something else is in front there, the row stops claiming it.
        act(() => panel.filesSelect());
        await settle();
        expect(opened.active()).toEqual(["local/prj_one"]);
    });
});

describe("a closed chat comes back", () => {
    it("reopens the chat last closed in the workspace on Shift-Command-T, and goes to it", async () => {
        const opened = await windowOpen(CHAT, CHAT_ADDRESS);
        await waitFor(() => expect(opened.row("local/prj_one")).not.toBeNull());

        calls.length = 0;
        await act(() => {
            const meta = APP_SHORTCUTS.chatReopen.modifier === "Meta";
            window.dispatchEvent(
                new KeyboardEvent("keydown", {
                    key: "T",
                    code: "KeyT",
                    shiftKey: true,
                    metaKey: meta,
                    ctrlKey: !meta,
                    bubbles: true,
                    cancelable: true,
                }),
            );
        });
        await settle();

        // Restored by the host first, addressed only once it is back.
        expect(calls).toEqual(["conversationRestore(ses_shut)"]);
        expect(opened.router.state.location.pathname).toBe("/chats/local/prj_one/ses_shut");
    });

    /** The strip's chats menu, opened as a reader opens it. */
    const chatsMenuOpen = async (opened: Awaited<ReturnType<typeof windowOpen>>) => {
        const trigger = opened.view.baseElement.querySelector<HTMLElement>(
            'button[aria-label="Show chats"]',
        )!;
        fireEvent.click(trigger);
        await settle();
        const menu = () => opened.view.baseElement.querySelector<HTMLElement>('[role="menu"]');
        const rows = () =>
            [...(menu()?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])].map((row) => ({
                id: row.getAttribute("data-item-id"),
                title: row.querySelector('[data-happy-desktop-ui="menu-item-label"]')?.textContent,
                when: row.querySelector('[data-happy-desktop-ui="menu-item-detail"]')?.textContent,
            }));
        const row = (id: string) =>
            menu()!.querySelector<HTMLElement>(`[role="menuitem"][data-item-id="${id}"]`)!;
        return { menu, row, rows, trigger };
    };

    it("lists the workspace's chats in the strip's menu, the closed one apart, each with when", async () => {
        const opened = await windowOpen(CHAT, CHAT_ADDRESS);
        await waitFor(() => expect(opened.row("local/prj_one")).not.toBeNull());

        const chats = await chatsMenuOpen(opened);

        expect(chats.menu()).not.toBeNull();
        expect(
            [...chats.menu()!.querySelectorAll('[data-happy-desktop-ui="menu-label"]')].map(
                (label) => label.textContent,
            ),
        ).toEqual(["Open", "Closed"]);
        expect(chats.rows()).toEqual([
            { id: "chat:ses_one", title: "Fix", when: "now" },
            { id: "chat:ses_shut", title: "Earlier", when: "now" },
        ]);
    });

    it("reopens a closed chat chosen from the strip's menu, and goes to it", async () => {
        const opened = await windowOpen(CHAT, CHAT_ADDRESS);
        await waitFor(() => expect(opened.row("local/prj_one")).not.toBeNull());
        const chats = await chatsMenuOpen(opened);

        calls.length = 0;
        fireEvent.click(chats.row("chat:ses_shut"));
        await settle();

        // The same way back as the chord: restored by the host, then addressed.
        expect(calls).toEqual(["conversationRestore(ses_shut)"]);
        expect(opened.router.state.location.pathname).toBe("/chats/local/prj_one/ses_shut");
        expect(chats.menu()).toBeNull();
    });

    it("goes to an open chat chosen there without asking the host for anything", async () => {
        const opened = await windowOpen("/chats/local/prj_one", { groupId: "prj_one" });
        await waitFor(() => expect(opened.row("local/prj_one")).not.toBeNull());
        const chats = await chatsMenuOpen(opened);

        calls.length = 0;
        fireEvent.click(chats.row("chat:ses_one"));
        await settle();

        expect(calls).toEqual([]);
        expect(opened.router.state.location.pathname).toBe(CHAT);
    });

    it("closes the menu on Command-W or Escape, and leaves the chat behind it alone", async () => {
        const opened = await windowOpen(CHAT, CHAT_ADDRESS);
        await waitFor(() => expect(opened.row("local/prj_one")).not.toBeNull());

        for (const press of ["close chord", "Escape"] as const) {
            const chats = await chatsMenuOpen(opened);
            expect(chats.menu(), press).not.toBeNull();
            // The menu takes the keyboard when it opens.
            expect(chats.menu()!.contains(document.activeElement), press).toBe(true);

            calls.length = 0;
            const meta = APP_SHORTCUTS.tabClose.modifier === "Meta";
            fireEvent.keyDown(
                document.activeElement!,
                press === "Escape"
                    ? { key: "Escape", code: "Escape" }
                    : { key: "w", code: "KeyW", metaKey: meta, ctrlKey: !meta },
            );
            await settle();

            expect(chats.menu(), press).toBeNull();
            expect(document.activeElement, press).toBe(chats.trigger);
            // Nothing was archived, asked about, or restored behind the menu.
            expect(calls, press).toEqual([]);
            expect(opened.router.state.location.pathname, press).toBe(CHAT);
        }

        // With the menu gone the chord is the chat's again.
        calls.length = 0;
        await closeChord();
        await settle();
        expect(calls.some((call) => call.includes("Archive"))).toBe(true);
    });

    it("offers no chats menu on a bot's one conversation", async () => {
        const opened = await windowOpen("/chats/local/grp_bot/ses_bot", {
            groupId: "grp_bot",
            conversationId: "ses_bot",
        });
        await waitFor(() => expect(opened.row("local/grp_bot")).not.toBeNull());
        await settle();

        expect(opened.view.baseElement.querySelector('button[aria-label="Show chats"]')).toBeNull();
    });
});

describe("Command-W closes what is in front", () => {
    it("steps back from a page to where the reader was", async () => {
        const opened = await windowOpen(CHAT, CHAT_ADDRESS);
        await waitFor(() => expect(opened.row("local/prj_one")).not.toBeNull());
        for (const address of [
            "/artifacts/local",
            "/artifacts/local/art_one",
            "/feed/local",
            "/tasks/new/local",
            "/bots/new/local",
            "/settings/general",
        ]) {
            await act(() => opened.router.history.push(address));
            await settle();
            expect(opened.router.state.location.pathname).toBe(address);

            await closeChord();
            await settle();
            expect(opened.router.state.location.pathname, address).toBe(CHAT);
        }
    });

    it("closes a view that has just come forward beside the chat before the chat", async () => {
        const opened = await windowOpen(CHAT, CHAT_ADDRESS);
        await waitFor(() => expect(opened.row("local/prj_one")).not.toBeNull());
        const panel = panels.at(-1)!;
        const conversation = opened.view.container.querySelector<HTMLElement>(
            '[data-happy-desktop-ui="app-shell"][data-embedded] [data-app-shell-pane="workspace"]',
        )!;
        const conversationTouch = () =>
            fireEvent.pointerDown(conversation.querySelector("*") ?? conversation);
        const archiveAsked = () => calls.some((call) => call.includes("Archive"));

        // The reader follows a link in the conversation; the artifact opens
        // beside it while the keyboard is still in the conversation.
        conversationTouch();
        act(() => panel.artifactViewOpen("art_one" as never));
        await settle();
        expect(panel.get()).toMatchObject({ open: true, activeViewId: "artifact" });

        // The first press closes what just opened, and the pane it opened.
        calls.length = 0;
        await closeChord();
        await settle();
        expect(panel.get().open).toBe(false);
        expect(archiveAsked()).toBe(false);

        // Only the next one reaches the conversation.
        await closeChord();
        await settle();
        expect(archiveAsked()).toBe(true);

        // A reader who has gone back to the conversation means the conversation.
        act(() => panel.artifactViewOpen("art_one" as never));
        conversationTouch();
        calls.length = 0;
        await closeChord();
        await settle();
        expect(panel.get()).toMatchObject({ open: true, activeViewId: "artifact" });
        expect(archiveAsked()).toBe(true);
    });
});

describe("what the reader opens from the pane beside the chat", () => {
    const SECOND = "/chats/local/prj_one/ses_two";
    const CHILD = "/chats/local/prj_one/ses_child";
    const CHILD_ROUTE = {
        to: "/chats/$happyAgentId/$groupId/$chatId",
        params: { happyAgentId: "local", groupId: "prj_one", chatId: "ses_child" },
    } as const;
    const two = { projects: PROJECTS_WITH_TWO_CHATS };
    const archiveAsked = () => calls.some((call) => call.includes("Archive"));
    const pane = (opened: Awaited<ReturnType<typeof windowOpen>>, name: "panel" | "workspace") =>
        opened.view.container.querySelector<HTMLElement>(
            `[data-happy-desktop-ui="app-shell"][data-embedded] [data-app-shell-pane="${name}"]`,
        )!;
    /**
     * A workspace that stands where the window's address says, as the real one
     * does: the conversation is the one in the address, and it is a subagent's
     * exactly while that address is the child's.
     */
    const following = () => {
        const at = { path: (): string => SECOND };
        const address = {
            groupId: "prj_one",
            get conversationId() {
                return at.path().split("/")[4];
            },
        };
        const workspaceLive = {
            get conversationDelegated() {
                return address.conversationId === "ses_child";
            },
        };
        return { address, at, workspaceLive };
    };
    // The pane itself, not its first child: that is the resize handle, which
    // moves the boundary and is nobody's keyboard.
    const touch = (element: HTMLElement) => fireEvent.pointerDown(element);

    it("is what Command-W closes, not the pane it was opened from", async () => {
        // The reader is in the project's second chat, with a view of the pane's
        // own in front beside it, and their hand in the pane.
        const { address, at, workspaceLive } = following();
        const opened = await windowOpen(SECOND, address, false, CATALOG, { ...two, workspaceLive });
        at.path = () => opened.router.state.location.pathname;
        await waitFor(() => expect(opened.row("local/prj_one")).not.toBeNull());
        const panel = panels.at(-1)!;
        act(() => panel.artifactViewOpen("art_one" as never));
        await settle();
        touch(pane(opened, "panel"));

        // With the hand in the pane and nothing new in the main content, the
        // chord is the pane's: its view closes, and the chat is not asked about.
        calls.length = 0;
        await closeChord();
        await settle();
        expect(panel.get().open).toBe(false);
        expect(archiveAsked()).toBe(false);

        // Again, and this time a row in the pane opens a tab of its own in the
        // main content: a subagent's conversation.
        act(() => panel.artifactViewOpen("art_one" as never));
        await settle();
        touch(pane(opened, "panel"));
        await act(() => opened.router.navigate(CHILD_ROUTE));
        await settle();
        expect(opened.router.state.location.pathname).toBe(CHILD);

        // The chord closes what was opened, and leaves the pane as it was.
        await closeChord();
        await settle();
        expect(opened.router.state.location.pathname).toBe(SECOND);
        expect(panel.get()).toMatchObject({ open: true, activeViewId: "artifact" });
        expect(archiveAsked()).toBe(false);

        // And the reader is in the main content now: the next press is the
        // chat's, not the pane's.
        await closeChord();
        await settle();
        expect(panel.get()).toMatchObject({ open: true, activeViewId: "artifact" });
        expect(archiveAsked()).toBe(true);
    });

    it("leaves a subagent's tab for the chat the reader came from, not the project's first", async () => {
        const { address, at, workspaceLive } = following();
        const opened = await windowOpen(SECOND, address, false, CATALOG, { ...two, workspaceLive });
        at.path = () => opened.router.state.location.pathname;
        await waitFor(() => expect(opened.row("local/prj_one")).not.toBeNull());

        // From the second chat, into a subagent's conversation: an address of
        // its own, with no place in the project's list.
        await act(() => opened.router.navigate(CHILD_ROUTE));
        await settle();
        const tabs = () =>
            [...opened.view.container.querySelectorAll('[data-happy-desktop-ui="tab"]')].map(
                (tab) => tab.getAttribute("data-tab-id"),
            );
        // It stands alone in the strip, and it is pinned there: a subagent's
        // tab carries no close control of its own, so the chord is how it goes.
        expect(tabs()).toEqual(["ses_child"]);
        expect(
            opened.view.container.querySelector(
                '[data-happy-desktop-ui="tab"][data-tab-id="ses_child"] [data-happy-desktop-ui="tab-close"]',
            ),
        ).toBeNull();

        calls.length = 0;
        await closeChord();
        await settle();

        // Back in the second chat, where they were, not the project's first;
        // and nothing was archived or asked about on the way.
        expect(opened.router.state.location.pathname).toBe(SECOND);
        expect(archiveAsked()).toBe(false);
    });
});

describe("Command-W with nothing left to close", () => {
    const BARE = "/chats/local/prj_bare";
    const BARE_ADDRESS = { groupId: "prj_bare" };
    const bare = { projects: PROJECTS_WITH_EMPTY };
    const archiveAsked = () => calls.some((call) => call.includes("Archive"));
    const dialogs = (opened: Awaited<ReturnType<typeof windowOpen>>) =>
        opened.view.baseElement.querySelectorAll('[role="dialog"], [role="alertdialog"]').length;

    it("closes the window from a project with no chat open, and does not offer to archive it", async () => {
        const onWindowClose = vi.fn();
        const opened = await windowOpen(BARE, BARE_ADDRESS, false, CATALOG, {
            ...bare,
            onWindowClose,
        });
        await waitFor(() => expect(opened.row("local/prj_bare")).not.toBeNull());
        expect(opened.active()).toEqual(["local/prj_bare"]);

        calls.length = 0;
        await closeChord();
        await settle();

        expect(onWindowClose).toHaveBeenCalledTimes(1);
        // The project is where it was, and nothing asked what to do with it.
        expect(archiveAsked()).toBe(false);
        expect(dialogs(opened)).toBe(0);
        expect(opened.router.state.location.pathname).toBe(BARE);
    });

    it("does nothing there under a shell that cannot close its window", async () => {
        const opened = await windowOpen(BARE, BARE_ADDRESS, false, CATALOG, bare);
        await waitFor(() => expect(opened.row("local/prj_bare")).not.toBeNull());

        calls.length = 0;
        await closeChord();
        await settle();

        expect(calls).toEqual([]);
        expect(dialogs(opened)).toBe(0);
        expect(opened.router.state.location.pathname).toBe(BARE);
    });

    it("closes the window when no project is open at all", async () => {
        const onWindowClose = vi.fn();
        const opened = await windowOpen("/chats/local", {}, false, CATALOG, { onWindowClose });
        await waitFor(() => expect(opened.row("local/prj_one")).not.toBeNull());
        expect(opened.active()).toEqual([]);

        calls.length = 0;
        await closeChord();
        await settle();

        expect(onWindowClose).toHaveBeenCalledTimes(1);
        expect(calls).toEqual([]);
    });

    it("closes the window from a page it opened straight onto", async () => {
        const onWindowClose = vi.fn();
        const opened = await windowOpen("/feed/local", CHAT_ADDRESS, false, CATALOG, {
            onWindowClose,
        });
        await waitFor(() => expect(opened.row("local/prj_one")).not.toBeNull());

        await closeChord();
        await settle();

        expect(onWindowClose).toHaveBeenCalledTimes(1);
        expect(opened.router.state.location.pathname).toBe("/feed/local");
    });

    it("leaves the window open while there is still something in it to close", async () => {
        const onWindowClose = vi.fn();
        const opened = await windowOpen(CHAT, CHAT_ADDRESS, false, CATALOG, { onWindowClose });
        await waitFor(() => expect(opened.row("local/prj_one")).not.toBeNull());

        // A chat is in front: the chord is about the chat.
        calls.length = 0;
        await closeChord();
        await settle();
        expect(archiveAsked()).toBe(true);

        // A page with somewhere behind it: the chord steps back.
        await act(() => opened.router.history.push("/feed/local"));
        await settle();
        await closeChord();
        await settle();
        expect(opened.router.state.location.pathname).toBe(CHAT);

        expect(onWindowClose).not.toHaveBeenCalled();
    });
});

describe("archiving a project or workspace from its sidebar row", () => {
    const archiveChosen = async (
        opened: Awaited<ReturnType<typeof windowOpen>>,
        rowId: string,
        label: string,
    ) => {
        fireEvent.contextMenu(opened.row(rowId)!, { clientX: 40, clientY: 40 });
        await settle();
        const item = [
            ...opened.view.container.querySelectorAll<HTMLElement>(
                '[data-happy-desktop-ui="sidebar-item-menu"] [role="menuitem"]',
            ),
        ].find((candidate) => candidate.textContent?.includes(label));
        expect(item, label).toBeDefined();
        fireEvent.click(item!);
        await settle();
    };

    it("asks before archiving a project, and archives nothing on the menu item", async () => {
        const opened = await windowOpen(CHAT, CHAT_ADDRESS);
        await waitFor(() => expect(opened.row("local/prj_one")).not.toBeNull());

        calls.length = 0;
        await archiveChosen(opened, "local/prj_one", "Archive project");

        expect(calls).toEqual(['groupArchiveOpen(["prj_one"])']);
    });

    it("asks before archiving a workspace, the same way", async () => {
        const opened = await windowOpen(CHAT, CHAT_ADDRESS, false, CATALOG, {
            projects: PROJECTS_WITH_WORKTREE,
        });
        await waitFor(() => expect(opened.row("local/wt_one")).not.toBeNull());

        calls.length = 0;
        await archiveChosen(opened, "local/wt_one", "Archive workspace");

        expect(calls).toEqual(['groupArchiveOpen(["wt_one"])']);
    });
});

describe("a pinned artifact's chat", () => {
    const ENTRY = { path: "index.md", mimeType: "text/markdown", size: 7, sha256: "0" };
    const UNKNOWN = { kind: "unknown" } as const;
    // The viewer holding the artifact, as it does once it has been read.
    const DECK_READ = {
        artifactId: "art_one",
        artifact: {
            type: "ready",
            value: {
                id: "art_one",
                type: "markdown",
                title: "Deck",
                status: "active",
                latestVersion: 1,
                cover: null,
                background: null,
                thumbnail: null,
                entry: ENTRY,
                fileCount: 1,
                size: 7,
                source: null,
                createdBy: UNKNOWN,
                createdAt: NOW,
                updatedBy: UNKNOWN,
                updatedSource: null,
                updatedAt: NOW,
                deletedBy: null,
                deletedSource: null,
                deletedAt: null,
                version: "1",
            },
        },
        versions: [],
        versionsLoading: false,
        versionsHasMore: false,
        files: [],
        content: { type: "loading" },
        markdownView: "document",
        deletion: { phase: "idle" },
    };

    it("opens the chat everyone on it shares beside it from its Chat button", async () => {
        // The catalog finds the Surface's chat as the real one does: it is the
        // Surface's own, and found once asked for.
        const art = { ...ART, chatAgentId: "ses_art" } as HappyAgentSurface;
        const chats = new Map<string, object>();
        const catalog = {
            ...CATALOG,
            surfaces: [art, BOTPIN],
            joined: [art, BOTPIN],
            chats,
        } as unknown as HappyAgentSurfaceCatalogSnapshot;
        const asked: string[] = [];
        const opened = await windowOpen(CHAT, CHAT_ADDRESS, false, catalog, {
            artifactViewer: DECK_READ,
            workspaceActions: {
                conversationOpen: (sessionId: string, groupId: string) =>
                    asked.push(`conversationOpen(${sessionId}, ${groupId})`),
            },
            surfaceActions: {
                chatOpen: (surfaceId: string) => {
                    asked.push(surfaceId);
                    const location = { groupId: "grp_art", sessionId: "ses_art" };
                    chats.set(surfaceId, location);
                    return Promise.resolve(location);
                },
            },
        });
        await waitFor(() => expect(opened.row("local/prj_one")).not.toBeNull());
        fireEvent.click(opened.row("local/surface:srf_art")!);
        await settle();
        expect(opened.router.state.location.pathname).toBe("/surfaces/local/srf_art");

        const toggle = opened.view.container.querySelector<HTMLElement>(
            '[data-happy-desktop-ui="happy-agent-artifact-viewer"] [data-testid="happy-agent-surface-chat-toggle"]',
        );
        expect(toggle).not.toBeNull();
        expect(toggle!.getAttribute("aria-pressed")).toBe("false");

        asked.length = 0;
        fireEvent.click(toggle!);
        await settle();

        // The Surface is asked for its chat, which opens, and the address
        // shows it beside the artifact without a step to go back through.
        expect(asked).toContain("srf_art");
        expect(asked.filter((ask) => ask !== "srf_art")).toEqual([
            "conversationOpen(ses_art, grp_art)",
        ]);
        expect(opened.router.state.location.pathname).toBe(
            "/surfaces/local/srf_art/chat/grp_art/ses_art",
        );
        expect(toggle!.getAttribute("aria-pressed")).toBe("true");
        await act(() => opened.router.history.back());
        await settle();
        expect(opened.router.state.location.pathname).toBe(CHAT);
    });
});

describe("a file a message names opens over the conversation", () => {
    const LINK = "happy://agents/ses_one/files/notes.md";
    const AGENT = { id: "agt_happy", displayName: "Happy", username: "happy", kind: "agent" };
    const composer = composerSourceOf(composerStoreCreate("ses_one"));
    // A conversation with one of the agent's messages, which links a file.
    const CONVERSATION = {
        type: "ready",
        value: {
            conversationId: "ses_one",
            ready: true,
            session: { type: "loading" },
            title: "Fix",
            entries: [
                {
                    kind: "message",
                    source: "server",
                    delivery: "sent",
                    message: {
                        id: "msg_one",
                        chatId: "ses_one",
                        sequence: "1",
                        changePts: "1",
                        sender: AGENT,
                        text: `Wrote the [notes](${LINK}).`,
                        generationStatus: "complete",
                        reactions: [],
                        attachments: [],
                        createdAt: new Date(NOW).toISOString(),
                    },
                },
            ],
            errorAssistance: [],
            composer,
            running: false,
            subagentsRunning: false,
            workingPhase: "waiting",
            transcriptComplete: true,
            loadingMore: false,
            queuedMessages: [],
            requestSubmissions: new Map(),
            requestSelections: new Map(),
            tasks: [],
            subagents: [],
            backgroundProcesses: [],
            detachedBackgroundProcessIds: new Set(),
            activityAvailable: false,
            showReasoning: false,
            expandedTurnIds: new Set(),
            expandedMessageIds: new Set(),
            usageLoading: false,
            activityPanelOpen: false,
            modelLocked: false,
            failureSwitchSupported: false,
            uiPending: new Map(),
            uiErrors: new Map(),
            uiGranted: "all",
            quickRepliesSent: new Set(),
            uiDefaultModel: { loading: true, choices: [] },
        },
    };
    // The file as the workspace holds it once asked for, still being read.
    const NOTES = {
        id: "panel-file",
        groupId: "prj_one",
        path: "notes.md",
        kind: "file",
        placement: "panel",
        preview: true,
        revision: "0",
        document: { type: "loading" },
        presentationId: "0",
        loading: true,
        revalidating: false,
        saving: false,
    };

    it("opens the file in a modal from the message's link, and puts it away on Escape", async () => {
        // jsdom draws no text; the message lays its words out by measuring them.
        vi.stubGlobal(
            "OffscreenCanvas",
            class {
                getContext() {
                    return { measureText: (text: string) => ({ width: text.length * 7 }) };
                }
            },
        );
        onTestFinished(() => {
            vi.unstubAllGlobals();
        });
        const held: { file?: typeof NOTES } = {};
        const asked: string[] = [];
        const workspaceLive = {
            conversation: CONVERSATION,
            get panelFile() {
                return held.file;
            },
        };
        const opened = await windowOpen(CHAT, CHAT_ADDRESS, false, CATALOG, {
            workspaceLive,
            workspaceActions: {
                fileLinkOpen: (link: { path: string }, _kind: string, presentation: string) => {
                    asked.push(`${link.path} ${presentation}`);
                    held.file = NOTES;
                    panels.at(-1)!.modalFileOpen();
                },
                modalClose: () => {
                    asked.push("modalClose");
                    panels.at(-1)!.modalClose();
                },
            },
        });
        await waitFor(() => expect(opened.row("local/prj_one")).not.toBeNull());
        const modal = () =>
            opened.view.baseElement.querySelector('[data-testid="happy-agent-file-modal"]');
        const link = await waitFor(() => {
            const found = [...opened.view.container.querySelectorAll("a")].find(
                (anchor) => anchor.textContent === "notes",
            );
            expect(found).toBeDefined();
            return found!;
        });
        expect(modal()).toBeNull();

        fireEvent.click(link);
        await settle();

        // Asked for over the conversation, not in the pane beside it.
        expect(asked).toEqual(["notes.md modal"]);
        expect(modal()).not.toBeNull();
        expect(modal()!.textContent).toContain("notes.md");
        expect(panels.at(-1)!.get().open).toBe(false);

        fireEvent.keyDown(document.activeElement ?? document.body, {
            key: "Escape",
            code: "Escape",
        });
        await settle();

        // Put away through the workspace, which keeps an unsaved edit beside.
        expect(asked).toEqual(["notes.md modal", "modalClose"]);
        expect(modal()).toBeNull();
        expect(opened.router.state.location.pathname).toBe(CHAT);
    });
});
