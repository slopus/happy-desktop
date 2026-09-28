import { render } from "@testing-library/react";
import { expect, it } from "vitest";
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
    HAPPY_AGENT_GROUP_UNLISTED_REFUSAL,
} from "happy-desktop-state";
import {
    AppHappyAgentView,
    type AppHappyAgentDirectorySnapshot,
    type AppHappyAgentDirectoryStore,
} from "../../sources/AppHappyAgentView";

/* The local workspace renders the shared cloud components with local product
 * state. These tests pin the parts of that contract the app layer owns: which
 * shared component it composes and which props it supplies. The stores are
 * inert stubs because this boundary is a pure projection — no store here starts
 * transport, timers, or authentication work. */

/* `useSyncExternalStore` requires a cached snapshot, so every stub `get()`
 * returns one stable object rather than a fresh literal per call. */
const CONNECTED = { connection: "connected", daemon: "ready", attempt: 0 } as const;

function connection(): HappyAgentConnectionStore {
    return {
        get: () => CONNECTED,
        subscribe: () => () => undefined,
        retry: () => undefined,
        [Symbol.dispose]: () => undefined,
    } as unknown as HappyAgentConnectionStore;
}

function clock(): HappyAgentClockStore {
    return {
        get: () => 1_764_000_000_000,
        subscribe: () => () => undefined,
        [Symbol.dispose]: () => undefined,
    } as unknown as HappyAgentClockStore;
}

/* The right panel starts hidden, so these projections render the workspace
 * without it and never reach a terminal. */
const PANEL_CLOSED = { open: false, tabs: [] } as const;

function panel(): HappyAgentPanelStore {
    return {
        get: () => PANEL_CLOSED,
        subscribe: () => () => undefined,
        panelToggle: () => undefined,
        terminalAdd: () => undefined,
        tabSelect: () => undefined,
        tabClose: () => undefined,
        terminal: () => undefined,
        conversationApply: () => undefined,
        [Symbol.dispose]: () => undefined,
    } as unknown as HappyAgentPanelStore;
}

function workspace(): HappyAgentWorkspaceStore {
    const snapshot = {
        list: {
            bots: [],
            projects: {
                type: "ready" as const,
                value: [
                    {
                        id: "prj_one",
                        path: "/Users/happy/happy",
                        displayPath: "~/happy",
                        name: "happy",
                        kind: "regular" as const,
                        lifecycle: { phase: "ready" as const },
                        worktrees: [],
                        activity: "idle" as const,
                        updatedAt: 1_763_999_000_000,
                        conversations: [
                            {
                                id: "ses_one",
                                title: "Fix token rotation race",
                                subtitle: "~/happy",
                                updatedAt: 1_763_999_000_000,
                                activity: "idle" as const,
                            },
                        ],
                    },
                ],
            },
        },
        conversation: { type: "unloaded" as const },
        /* The stub addresses nothing, and that is exactly the case the store
         * publishes the unlisted refusal for: an id the catalog does not
         * describe is never permission to write into it. Every snapshot carries
         * an access, so this one does too. */
        address: {},
        groupAccess: happyAgentGroupAccessRefused(HAPPY_AGENT_GROUP_UNLISTED_REFUSAL),
        fileTabs: [],
        tabOrder: [],
        openInTargets: [],
        fileViewMode: "unified" as const,
        fileScope: "changed" as const,
        slices: [],
        fileLayout: "flat" as const,
        fileTreeExpanded: new Set<string>(),
        fileTreeCollapsed: new Set<string>(),
        workspaceFilesLoading: false,
    };
    return {
        get: () => snapshot,
        panel: panel(),
        subscribe: () => () => undefined,
        conversationOpen: () => undefined,
        conversationClose: () => undefined,
        conversationListRetry: () => undefined,
        conversationRetry: () => undefined,
        [Symbol.dispose]: () => undefined,
    } as unknown as HappyAgentWorkspaceStore;
}

/* The catalog is only read by the settings window, so this projection needs
 * nothing more than a store that never resolves. */
function modelStore(): HappyAgentModelStore {
    return {
        get: () => MODELS_LOADING,
        subscribe: () => () => undefined,
        load: () => Promise.resolve(),
        [Symbol.dispose]: () => undefined,
    } as unknown as HappyAgentModelStore;
}

const MODELS_LOADING = { type: "loading" } as const;

/** One connected host Happy Agent holding the project above. */
function directory(
    host: HappyAgentHost,
    projects: AppHappyAgentDirectorySnapshot["happyAgents"][number]["projects"],
) {
    const snapshot: AppHappyAgentDirectorySnapshot = {
        happyAgents: [
            {
                bots: [],
                id: "local",
                label: "This Mac",
                projects,
                projectsStatus: "ready",
                session: {
                    clock: clock(),
                    connection: connection(),
                    host,
                    models: modelStore(),
                    workspace: workspace(),
                },
                status: "connected",
            },
        ],
    };
    const store: AppHappyAgentDirectoryStore = {
        get: () => snapshot,
        subscribe: () => () => undefined,
        happyAgentActivate: () => undefined,
    };
    return store;
}

function view(
    options: {
        chatId?: string;
        groupId?: string;
        host?: HappyAgentHost;
        onChatSelect?: (happyAgentId: string, groupId: string | undefined, chatId?: string) => void;
    } = {},
) {
    const projects = (
        workspace().get() as unknown as {
            list: {
                projects: {
                    value: AppHappyAgentDirectorySnapshot["happyAgents"][number]["projects"];
                };
            };
        }
    ).list.projects.value;
    return render(
        <AppHappyAgentView
            appearance={appearanceStoreCreate({ mode: "light" })}
            chatId={options.chatId}
            groupId={options.groupId}
            onChatSelect={options.onChatSelect ?? (() => undefined)}
            onFileClose={() => undefined}
            onFileSelect={() => undefined}
            onSettingsOpen={() => undefined}
            happyAgentId="local"
            happyAgents={directory(options.host ?? happyAgentHostNoop, projects)}
        />,
    );
}

it("heads the local sidebar with the shared brand mark, not a local-only title", () => {
    const { container } = view();

    // Local renders the same mark-only brand heading the cloud surface does, so
    // the two modes stay one component rendered twice rather than a local variant.
    const logo = container.querySelector('[data-happy-desktop-ui="sidebar-brand-logo"]');
    expect(logo).not.toBeNull();
    expect(logo?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector('[data-happy-desktop-ui="sidebar-title"]')).toBeNull();

    // The plain title row and its chevron affordance are gone.
    expect(container.textContent).not.toContain("Local");
    expect(container.querySelector(".happy-sidebar__title-chevron")).toBeNull();
});

it("highlights the addressed project and asks to navigate into it when it is picked", () => {
    const selected: (string | undefined)[][] = [];
    const { container } = view({
        groupId: "prj_one",
        onChatSelect: (happyAgentId, groupId, chatId) =>
            selected.push([happyAgentId, groupId, chatId]),
    });

    const row = container.querySelector('[data-item-id="local/prj_one"]');
    expect(row?.getAttribute("aria-current")).toBe("page");

    // Picking a row is a navigation request into the project's most recent
    // session; this surface never selects a conversation in the store itself.
    row?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(selected).toEqual([["local", "prj_one", "ses_one"]]);
});

it("lists one row per project and its sessions as tabs", () => {
    const { container } = view({ groupId: "prj_one" });

    // The sidebar list contains projects only; creating a session is an app-level
    // action rather than another project-shaped row.
    const rows = [...container.querySelectorAll('[data-happy-desktop-ui="sidebar-item"]')];
    // The Blueprint workbench row is offered only to a window that hands the
    // View somewhere to open it, and this one does not, so it is absent here
    // rather than depending on which mode the test runner happens to build in.
    expect(rows.map((row) => row.getAttribute("data-item-id"))).toEqual(["local/prj_one"]);
    // The row is the project's name alone; its path would crowd the name out,
    // and the heading over the open project states it in full.
    expect(rows[0]?.textContent).toContain("happy");
    expect(rows[0]?.textContent).not.toContain("~/happy");

    // The sessions inside the addressed project are its tabs.
    const tabs = [...container.querySelectorAll('[data-happy-desktop-ui="tab"]')];
    expect(tabs.map((tab) => tab.getAttribute("data-tab-id"))).toEqual(["ses_one"]);
    expect(tabs[0]?.textContent).toContain("Fix token rotation race");
});
