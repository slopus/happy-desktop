import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { RouterProvider } from "@tanstack/react-router";
import { expect, it, onTestFinished } from "vitest";
import type {
    HappyAgentClockStore,
    HappyAgentConnectionStore,
    HappyAgentHost,
    HappyAgentModelStore,
    HappyAgentPanelStore,
    HappyAgentWorkspaceStore,
} from "happy-desktop-state";
import {
    appearanceStoreCreate,
    experimentsStoreCreate,
    happyAgentGroupAccessRefused,
    happyAgentHostNoop,
    happyAgentSettingsStoreCreate,
    HAPPY_AGENT_GROUP_UNLISTED_REFUSAL,
    HAPPY_AGENT_RETAINED_CONVERSATIONS_NONE,
} from "happy-desktop-state";
import type {
    AppHappyAgentDirectorySnapshot,
    AppHappyAgentDirectoryStore,
} from "../../sources/AppHappyAgentView";
import {
    happyAgentMemoryHistoryCreate,
    happyAgentRouterCreate,
    type HappyAgentRouterContext,
} from "../../sources/navigation/happyAgentRouter";

/*
 * The window's sidebar has one lifetime. Whatever a click opens — a chat, the
 * artifacts, a Surface, the inbox, a new bot — only the content beside it
 * changes: the sidebar's scroll element is the same node and stays where the
 * reader scrolled it.
 */

const CONNECTED = { connection: "connected", daemon: "ready", attempt: 0 } as const;
const PANEL_CLOSED = { open: false, tabs: [] } as const;
const MODELS_LOADING = { type: "loading" } as const;

const PROJECTS: AppHappyAgentDirectorySnapshot["happyAgents"][number]["projects"] = [
    {
        id: "prj_one",
        path: "/Users/happy/happy",
        displayPath: "~/happy",
        name: "happy",
        kind: "regular",
        lifecycle: { phase: "ready" },
        worktrees: [],
        activity: "idle",
        updatedAt: 1_763_999_000_000,
        conversations: [
            {
                id: "ses_one",
                title: "Fix token rotation race",
                subtitle: "~/happy",
                updatedAt: 1_763_999_000_000,
                activity: "idle",
            },
        ],
    },
] as unknown as AppHappyAgentDirectorySnapshot["happyAgents"][number]["projects"];

function workspace(): HappyAgentWorkspaceStore {
    const snapshot = {
        list: { bots: [], tasks: [], projects: { type: "ready" as const, value: PROJECTS } },
        conversation: { type: "unloaded" as const },
        address: {},
        groupAccess: happyAgentGroupAccessRefused(HAPPY_AGENT_GROUP_UNLISTED_REFUSAL),
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
    const panel = {
        get: () => PANEL_CLOSED,
        subscribe: () => () => undefined,
        panelToggle: () => undefined,
        conversationApply: () => undefined,
        [Symbol.dispose]: () => undefined,
    } as unknown as HappyAgentPanelStore;
    const known: Record<PropertyKey, unknown> = {
        get: () => snapshot,
        deviceBridgeSupport: () => undefined,
        conversationsRetained: HAPPY_AGENT_RETAINED_CONVERSATIONS_NONE,
        panel,
        subscribe: () => () => undefined,
    };
    // Every act the content beside the sidebar may call does nothing here.
    return new Proxy(known, {
        get: (target, key) => (key in target ? target[key] : () => undefined),
    }) as unknown as HappyAgentWorkspaceStore;
}

function directory(): AppHappyAgentDirectoryStore {
    const snapshot: AppHappyAgentDirectorySnapshot = {
        happyAgents: [
            {
                bots: [],
                id: "local",
                label: "This Mac",
                projects: PROJECTS,
                projectsStatus: "ready",
                session: {
                    clock: {
                        get: () => 1_764_000_000_000,
                        subscribe: () => () => undefined,
                    } as unknown as HappyAgentClockStore,
                    connection: {
                        get: () => CONNECTED,
                        subscribe: () => () => undefined,
                    } as unknown as HappyAgentConnectionStore,
                    host: happyAgentHostNoop as HappyAgentHost,
                    models: {
                        get: () => MODELS_LOADING,
                        subscribe: () => () => undefined,
                    } as unknown as HappyAgentModelStore,
                    workspace: workspace(),
                },
                status: "connected",
            },
        ],
    };
    return {
        get: () => snapshot,
        subscribe: () => () => undefined,
        happyAgentActivate: () => undefined,
    };
}

/** A window at an address. */
async function windowOpen(address: string) {
    const router = happyAgentRouterCreate(happyAgentMemoryHistoryCreate(address));
    onTestFinished(() => router.history.destroy());
    const experiments = experimentsStoreCreate();
    const context: HappyAgentRouterContext = {
        appearance: appearanceStoreCreate({ mode: "light" }),
        happyAgents: directory(),
        settings: happyAgentSettingsStoreCreate(),
        experiments,
    };
    router.update({ context });
    await router.load();
    const view = render(<RouterProvider context={context} router={router} />);
    const scroller = () =>
        view.container.querySelector<HTMLElement>(".happy-sidebar__body-viewport");
    const row = (id: string) =>
        view.container.querySelector<HTMLElement>(
            `[data-happy-desktop-ui="sidebar-item"][data-item-id="${id}"]`,
        );
    const rows = () =>
        [...view.container.querySelectorAll('[data-happy-desktop-ui="sidebar-item"]')].map((node) =>
            node.getAttribute("data-item-id"),
        );
    /** Scrolls the sidebar down, then proves each later step kept it there. */
    const scrolled = async () => {
        const scroll = scroller()!;
        scroll.scrollTop = 120;
        return async (pathname: string) => {
            await waitFor(() => expect(router.state.location.pathname).toBe(pathname));
            await waitFor(() => expect(scroller()).not.toBeNull());
            expect(scroller()).toBe(scroll);
            expect(scroll.scrollTop).toBe(120);
        };
    };
    return { router, row, rows, scrolled };
}

it("keeps the sidebar's scroll element and its scroll wherever a click or an address leads", async () => {
    const window = await windowOpen("/chats/local/prj_one/ses_one");
    await waitFor(() => expect(window.row("local/prj_one")).not.toBeNull());
    const kept = await window.scrolled();

    // Clicks: the artifacts, then a project's chat.
    fireEvent.click(window.row("artifacts")!);
    await kept("/artifacts/local");
    fireEvent.click(window.row("local/prj_one")!);
    await kept("/chats/local/prj_one/ses_one");

    // Every other address the sidebar opens.
    for (const address of [
        "/surfaces/local/srf_one",
        "/inbox/local",
        "/bots/new/local",
        "/tasks/new/local",
        "/artifacts/local/art_one",
        "/chats/local/prj_one",
    ]) {
        await act(() => window.router.history.push(address));
        await kept(address);
    }
});

it("leaves the sidebar as it was across a click, a hover and an address", async () => {
    const window = await windowOpen("/chats/local/prj_one/ses_one");
    await waitFor(() => expect(window.row("local/prj_one")).not.toBeNull());
    fireEvent.click(window.row("local/prj_one")!);
    fireEvent.pointerMove(window.row("local/prj_one")!);
    await act(() => window.router.history.push("/surfaces/local/srf_one"));
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));

    expect(window.rows()).toEqual(["artifacts", "local/prj_one"]);
});
