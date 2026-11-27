import { fireEvent, render, waitFor } from "@testing-library/react";
import { RouterProvider } from "@tanstack/react-router";
import { expect, it, onTestFinished, vi } from "vitest";
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
    happyAgentGroupAccessRefused,
    happyAgentHostNoop,
    happyAgentSettingsStoreCreate,
    HAPPY_AGENT_GROUP_UNLISTED_REFUSAL,
    HAPPY_AGENT_RETAINED_CONVERSATIONS_NONE,
} from "happy-desktop-state";
import { ConnectionShell, ConnectionSurface } from "happy-desktop-ui";
import type {
    AppHappyAgentDirectorySnapshot,
    AppHappyAgentDirectoryStore,
} from "../../sources/AppHappyAgentView";
import { HappyAgentConnectionBoundary } from "../../sources/components/HappyAgentConnectionBoundary";
import {
    happyAgentMemoryHistoryCreate,
    happyAgentRouterCreate,
    type HappyAgentRouterContext,
} from "../../sources/navigation/happyAgentRouter";

/*
 * A server whose window throws while rendering — its sidebar included — shows
 * the error where that window was. The rail beside it keeps working, and Reset
 * & reconnect brings the window back, sidebar and all, against a fresh
 * connection.
 */

type Projects = AppHappyAgentDirectorySnapshot["happyAgents"][number]["projects"];

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
        updatedAt: 1_763_999_000_000,
        conversations: [],
    },
] as unknown as Projects;

function workspace(): HappyAgentWorkspaceStore {
    const snapshot = {
        list: {
            bots: [],
            tasks: [],
            taskDirectory: [],
            projects: { type: "ready" as const, value: PROJECTS },
        },
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
        get: () => ({ open: false, tabs: [] }),
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
    return new Proxy(known, {
        get: (target, key) => (key in target ? target[key] : () => undefined),
    }) as unknown as HappyAgentWorkspaceStore;
}

/** A server whose sidebar data is broken until it is reset. */
function directory() {
    let broken = true;
    const resets: string[] = [];
    const listeners = new Set<() => void>();
    const snapshotCreate = (): AppHappyAgentDirectorySnapshot => ({
        happyAgents: [
            {
                bots: [],
                id: "local",
                label: "This Mac",
                // The sidebar reads the server's projects while it renders.
                get projects(): Projects {
                    if (broken) throw new Error("Cannot read properties of null (reading 'x')");
                    return PROJECTS;
                },
                projectsStatus: "ready",
                session: {
                    clock: {
                        get: () => 1_764_000_000_000,
                        subscribe: () => () => undefined,
                    } as unknown as HappyAgentClockStore,
                    connection: {
                        get: () => ({ connection: "connected", daemon: "ready", attempt: 0 }),
                        subscribe: () => () => undefined,
                    } as unknown as HappyAgentConnectionStore,
                    host: happyAgentHostNoop as HappyAgentHost,
                    models: {
                        get: () => ({ type: "loading" }),
                        subscribe: () => () => undefined,
                    } as unknown as HappyAgentModelStore,
                    workspace: workspace(),
                },
                status: "connected",
            },
        ],
    });
    let snapshot = snapshotCreate();
    const store: AppHappyAgentDirectoryStore = {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        happyAgentActivate: () => undefined,
        happyAgentReset(id) {
            resets.push(id);
            broken = false;
            snapshot = snapshotCreate();
            for (const listener of listeners) listener();
        },
    };
    return { store, resets };
}

it("keeps a crashing server window beside a working rail, and brings it back on Reset", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { store, resets } = directory();
    const router = happyAgentRouterCreate(happyAgentMemoryHistoryCreate("/chats/local"));
    onTestFinished(() => router.history.destroy());
    const context: HappyAgentRouterContext = {
        appearance: appearanceStoreCreate({ mode: "light" }),
        happyAgents: store,
        settings: happyAgentSettingsStoreCreate(),
    };
    router.update({ context });
    await router.load();
    const selected: string[] = [];
    const view = render(
        <ConnectionShell
            items={[
                { id: "local", label: "This Mac", local: true, status: "connected" },
                { id: "connection:team", label: "Team", local: false, status: "connected" },
            ]}
            onSelect={(id) => selected.push(id)}
            selectedId="local"
        >
            <ConnectionSurface active>
                <HappyAgentConnectionBoundary
                    onReset={() => store.happyAgentReset?.("local")}
                    windowDragRegion={false}
                >
                    <RouterProvider context={context} router={router} />
                </HappyAgentConnectionBoundary>
            </ConnectionSurface>
        </ConnectionShell>,
    );
    onTestFinished(() => view.unmount());

    // The sidebar threw, and the server's whole window is the error.
    await waitFor(() => expect(view.getByTestId("happy-agent-route-failed")).toBeTruthy());
    expect(view.getByText("Cannot read properties of null (reading 'x')")).toBeTruthy();
    expect(view.container.querySelector('[data-happy-desktop-ui="sidebar-item"]')).toBeNull();

    // The rail beside it still switches servers.
    fireEvent.click(view.getByRole("button", { name: /^Team, connected/ }));
    expect(selected).toEqual(["connection:team"]);

    // Reset & reconnect starts the server over, and its sidebar comes back.
    fireEvent.click(view.getByRole("button", { name: "Reset & reconnect" }));
    expect(resets).toEqual(["local"]);
    await waitFor(() =>
        expect(
            view.container.querySelector(
                '[data-happy-desktop-ui="sidebar-item"][data-item-id="local/prj_one"]',
            ),
        ).not.toBeNull(),
    );
    expect(view.queryByTestId("happy-agent-route-failed")).toBeNull();
});

it("catches what fails around the router, beside the rail, and recovers on Reset", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    let broken = true;
    const resets: string[] = [];
    const selected: string[] = [];
    function Gate() {
        if (broken) throw new Error("The startup gate failed.");
        return <p>Server window</p>;
    }
    const view = render(
        <ConnectionShell
            items={[
                { id: "local", label: "This Mac", local: true, status: "connected" },
                { id: "connection:team", label: "Team", local: false, status: "connected" },
            ]}
            onSelect={(id) => selected.push(id)}
            selectedId="local"
        >
            <ConnectionSurface active>
                <HappyAgentConnectionBoundary
                    onReset={() => {
                        resets.push("local");
                        broken = false;
                    }}
                    windowDragRegion={false}
                >
                    <Gate />
                </HappyAgentConnectionBoundary>
            </ConnectionSurface>
        </ConnectionShell>,
    );
    onTestFinished(() => view.unmount());
    expect(view.getByTestId("happy-agent-connection-failed")).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: /^Team, connected/ }));
    expect(selected).toEqual(["connection:team"]);
    fireEvent.click(view.getByRole("button", { name: "Reset & reconnect" }));
    expect(resets).toEqual(["local"]);
    await waitFor(() => expect(view.getByText("Server window")).toBeTruthy());
});
