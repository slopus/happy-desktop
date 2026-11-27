import { act, fireEvent, render } from "@testing-library/react";
import { beforeAll, expect, it, vi } from "vitest";
import type {
    HappyAgentBot,
    HappyAgentBotId,
    HappyAgentBotSettingsSnapshot,
    HappyAgentClockStore,
    HappyAgentConnectionStore,
    HappyAgentModelStore,
    HappyAgentPanelStore,
    HappyAgentSurface,
    HappyAgentSurfaceCatalogSnapshot,
    HappyAgentSurfaceCatalogStore,
    HappyAgentSurfaceId,
    HappyAgentSurfaces,
    HappyAgentWorkspaceStore,
    HappyAgentWorktreeId,
} from "happy-desktop-state";
import {
    appearanceStoreCreate,
    happyAgentAttentionStoreCreate,
    happyAgentGroupAccessRefused,
    happyAgentHostNoop,
    happyAgentSurfaceSupportStoreNone,
    happyAgentSurfaceTabsStoreCreate,
    HAPPY_AGENT_GROUP_UNLISTED_REFUSAL,
} from "happy-desktop-state";
import {
    AppHappyAgentView,
    type AppHappyAgentDirectoryStore,
    type AppHappyAgentEntry,
} from "../../sources/AppHappyAgentView";

/* Happy Cloud places each bot by its kind. A shared bot is a destination of
 * the sidebar's first group, after everything else in it, and is not under
 * Bots; a personal bot is under Bots and opens the reader's own conversation.
 * Nobody makes a bot from the sidebar there, and only a bot the host reports
 * editable offers its settings. A Happy Agent daemon sends no kind, and its
 * bots are listed and offered exactly as before. */

const CONNECTED = { connection: "connected", daemon: "ready", attempt: 0 } as const;
const PANEL_CLOSED = { open: false, tabs: [] } as const;
const MODELS_LOADING = { type: "loading" } as const;

beforeAll(() => {
    // jsdom lays nothing out, so it has nothing to scroll into view.
    Element.prototype.scrollIntoView ??= () => undefined;
});

function bot(id: string, name: string, fields: Partial<HappyAgentBot> = {}): HappyAgentBot {
    return {
        id: id as HappyAgentBotId,
        workspaceId: `ws_${id}` as HappyAgentWorktreeId,
        conversation: {
            id: `ses_${id}`,
            title: name,
            subtitle: "",
            updatedAt: 1_763_999_000_000,
            activity: "idle",
            participants: [],
        },
        subtasks: [],
        name,
        username: id,
        orderKey: id,
        path: `/bots/${id}`,
        displayPath: `/bots/${id}`,
        ...fields,
    };
}

const CHIEF_SHARED = bot("chief", "Chief of Staff", {
    kind: "shared",
    editable: false,
    systemKey: "chief_of_staff",
});
const WRITER = bot("writer", "Writer", {
    kind: "personal",
    editable: true,
    instructions: "Write release notes.",
    revision: 2,
});
const READER = bot("reader", "Reader", { kind: "personal", editable: false });
const CHIEF_LEGACY = bot("chief", "Chief of Staff", { systemKey: "chief_of_staff" });
const HELPER = bot("helper", "Helper");

interface BotActions {
    botSettingsOpen: (botId: string) => void;
    botSettingsInstructionsUpdate: (value: string) => void;
    botSettingsNameUpdate: (value: string) => void;
    botSettingsSubmit: () => Promise<void>;
    botSettingsCancel: () => void;
}

function workspace(
    bots: readonly HappyAgentBot[],
    actions: BotActions,
    botSettings?: HappyAgentBotSettingsSnapshot,
): HappyAgentWorkspaceStore {
    const snapshot = {
        ...(botSettings ? { botSettings } : {}),
        list: {
            bots,
            tasks: [],
            taskDirectory: [],
            tasksArchived: [],
            archivedSessions: [],
            tasksJoining: new Set(),
            taskFailures: new Map(),
            projects: { type: "ready" as const, value: [] },
        },
        conversation: { type: "unloaded" as const },
        address: {},
        groupAccess: happyAgentGroupAccessRefused(HAPPY_AGENT_GROUP_UNLISTED_REFUSAL),
        fileTabs: [],
        tabOrder: [],
        recentTabs: [],
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
        panel: {
            get: () => PANEL_CLOSED,
            subscribe: () => () => undefined,
            [Symbol.dispose]: () => undefined,
        } as unknown as HappyAgentPanelStore,
        subscribe: () => () => undefined,
        ...actions,
        [Symbol.dispose]: () => undefined,
    } as unknown as HappyAgentWorkspaceStore;
}

const PLAN: HappyAgentSurface = {
    id: "srf_plan" as HappyAgentSurfaceId,
    // A document or a todo list is listed in its section rather than as a
    // row, so the joined Surface that keeps a row is a calendar.
    type: { kind: "calendar" },
    name: "Launch plan",
    image: null,
    members: [{ userId: null, orderKey: "a", joinedAt: 1 }],
    creatorUserId: null,
    chatAgentId: null,
    version: "1",
    updatedAt: 1,
};

// The first group only asks whether these exist; nothing reads them.
const PLUGINS = {} as never;
const PIPELINES = {} as never;

const SURFACE_CATALOG: HappyAgentSurfaceCatalogSnapshot = {
    availability: "available",
    surfaces: [PLAN],
    joined: [PLAN],
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
};

const SURFACE_CATALOG_STORE = {
    get: () => SURFACE_CATALOG,
    subscribe: () => () => undefined,
    [Symbol.dispose]: () => undefined,
} as unknown as HappyAgentSurfaceCatalogStore;

const surfaceTabs = happyAgentSurfaceTabsStoreCreate();

/** A joined Surface, so the first group holds every kind of row it can. */
const SURFACES = {
    catalog: () => SURFACE_CATALOG_STORE,
    support: () => happyAgentSurfaceSupportStoreNone,
    tabs: () => surfaceTabs,
} as unknown as HappyAgentSurfaces;

function view(
    bots: readonly HappyAgentBot[],
    options: {
        happyCloud?: true;
        botSettings?: HappyAgentBotSettingsSnapshot;
        /** Plugins, Pipelines, and a joined Surface in the first group. */
        everyTopRow?: true;
    } = {},
) {
    const actions: BotActions = {
        botSettingsOpen: vi.fn(),
        botSettingsInstructionsUpdate: vi.fn(),
        botSettingsNameUpdate: vi.fn(),
        botSettingsSubmit: vi.fn(() => Promise.resolve()),
        botSettingsCancel: vi.fn(),
    };
    const entry: AppHappyAgentEntry = {
        bots,
        tasks: [],
        version: "0.4.87-preview.6",
        id: "local",
        label: "local",
        projects: [],
        projectsStatus: "ready",
        ...(options.happyCloud ? { happyCloud: true as const } : {}),
        session: {
            clock: {
                get: () => 1_764_000_000_000,
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
            workspace: workspace(bots, actions, options.botSettings),
            ...(options.everyTopRow
                ? {
                      plugins: () => PLUGINS,
                      pipelines: () => PIPELINES,
                      surfaces: SURFACES,
                  }
                : {}),
        },
        status: "connected",
    };
    const snapshot = { happyAgents: [entry] };
    const directory: AppHappyAgentDirectoryStore = {
        get: () => snapshot,
        subscribe: () => () => undefined,
        happyAgentActivate: () => undefined,
    };
    const onChatSelect = vi.fn();
    const rendered = render(
        <AppHappyAgentView
            appearance={appearanceStoreCreate({ mode: "light" })}
            attention={happyAgentAttentionStoreCreate()}
            onBotCreateOpen={() => undefined}
            onChatSelect={onChatSelect}
            onFileClose={() => undefined}
            onFileSelect={() => undefined}
            onSettingsOpen={() => undefined}
            happyAgentId="local"
            happyAgents={directory}
        />,
    );
    return { ...rendered, actions, onChatSelect };
}

/** Each section's heading, or null for the first group, with the rows under it. */
const sections = (container: HTMLElement) =>
    [...container.querySelectorAll('[data-happy-desktop-ui="sidebar-section"]')].map((section) => ({
        label:
            section.querySelector('[data-happy-desktop-ui="sidebar-section-label"]')?.textContent ??
            null,
        rows: [...section.querySelectorAll('[data-happy-desktop-ui="sidebar-item"]')].map((row) =>
            row.getAttribute("data-item-id"),
        ),
    }));

const row = (container: HTMLElement, id: string) =>
    container.querySelector<HTMLElement>(`[data-item-id="local/${id}"]`)!;

const menuLabels = () =>
    [
        ...document.querySelectorAll(
            '[data-happy-desktop-ui="sidebar-item-menu"] [data-happy-desktop-ui="menu-item-label"]',
        ),
    ].map((item) => item.textContent);

const menuClose = () =>
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

it("shows an owner the shared bot last in the main group, and not under Bots", () => {
    const { container, onChatSelect } = view([CHIEF_SHARED, WRITER], { happyCloud: true });
    const [first, ...rest] = sections(container);
    expect(first!.rows).toEqual(["feed", "artifacts", "local/ws_chief"]);
    const bots = rest.find((section) => section.label === "Bots");
    expect(bots?.rows).toEqual(["local/ws_writer"]);

    fireEvent.click(row(container, "ws_chief"));
    expect(onChatSelect).toHaveBeenLastCalledWith("local", "ws_chief", "ses_chief");
    fireEvent.click(row(container, "ws_writer"));
    expect(onChatSelect).toHaveBeenLastCalledWith("local", "ws_writer", "ses_writer");
});

it("closes the main group with the shared bot, after Plugins, Pipelines, Documents, TODOs, and Surfaces", () => {
    const { container } = view([CHIEF_SHARED, WRITER], { happyCloud: true, everyTopRow: true });
    expect(sections(container)[0]!.rows).toEqual([
        "feed",
        "artifacts",
        "plugins",
        "pipelines",
        "documents",
        "todos",
        "local/surface:srf_plan",
        "local/ws_chief",
    ]);
});

it("shows a member, who is sent no shared bot, only the personal bots under Bots", () => {
    const { container } = view([WRITER, READER], { happyCloud: true });
    const [first, ...rest] = sections(container);
    expect(first!.rows).toEqual(["feed", "artifacts"]);
    expect(rest.find((section) => section.label === "Bots")?.rows).toEqual([
        "local/ws_writer",
        "local/ws_reader",
    ]);
});

it("offers no new bot on Happy Cloud, and leaves out a Bots heading with nothing under it", () => {
    const { container, unmount } = view([CHIEF_SHARED, WRITER], { happyCloud: true });
    expect(container.querySelector('[aria-label="New bot"]')).toBeNull();
    unmount();

    const owner = view([CHIEF_SHARED], { happyCloud: true });
    expect(sections(owner.container).map((section) => section.label)).not.toContain("Bots");
    expect(sections(owner.container)[0]!.rows).toContain("local/ws_chief");
});

it("offers a shared bot no edits and an editable personal bot its settings", () => {
    const { container, actions } = view([CHIEF_SHARED, WRITER, READER], { happyCloud: true });

    fireEvent.contextMenu(row(container, "ws_chief"), { clientX: 40, clientY: 40 });
    const shared = menuLabels();
    expect(shared).toContain("Mute bot");
    for (const edit of ["Rename bot", "Bot settings…", "Archive bot", "Hide from sidebar"])
        expect(shared).not.toContain(edit);
    menuClose();

    fireEvent.contextMenu(row(container, "ws_reader"), { clientX: 40, clientY: 40 });
    const locked = menuLabels();
    for (const edit of ["Rename bot", "Bot settings…", "Archive bot"])
        expect(locked).not.toContain(edit);
    menuClose();

    fireEvent.contextMenu(row(container, "ws_writer"), { clientX: 40, clientY: 40 });
    expect(menuLabels()).toContain("Bot settings…");
    expect(menuLabels()).not.toContain("Rename bot");
    expect(menuLabels()).not.toContain("Archive bot");
    fireEvent.click(
        document.querySelector(
            '[data-happy-desktop-ui="sidebar-item-menu"] [data-item-id="bot-settings"]',
        )!,
    );
    expect(actions.botSettingsOpen).toHaveBeenCalledExactlyOnceWith("writer");
});

it("lists a daemon's bots, which carry no kind, under Bots with New bot and Rename as before", () => {
    const { container } = view([CHIEF_LEGACY, HELPER]);
    const [first, ...rest] = sections(container);
    expect(first!.rows).toEqual(["feed", "artifacts"]);
    expect(rest.find((section) => section.label === "Bots")?.rows).toEqual([
        "local/ws_chief",
        "local/ws_helper",
    ]);
    expect(container.querySelector('[aria-label="New bot"]')).not.toBeNull();

    fireEvent.contextMenu(row(container, "ws_helper"), { clientX: 40, clientY: 40 });
    expect(menuLabels()).toEqual(
        expect.arrayContaining(["Rename bot", "Mute bot", "Hide from sidebar", "Archive bot"]),
    );
    expect(menuLabels()).not.toContain("Bot settings…");
});

it("edits a personal bot's name and instructions in its settings and saves them", () => {
    const { actions } = view([CHIEF_SHARED, WRITER], {
        happyCloud: true,
        botSettings: {
            botId: WRITER.id,
            name: "Writer",
            instructions: "Write release notes.",
            submitting: false,
        },
    });
    const field = (id: string) =>
        document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
            `[data-testid="${id}"] input, [data-testid="${id}"] textarea, input[data-testid="${id}"], textarea[data-testid="${id}"]`,
        )!;
    expect(field("happy-agent-bot-settings-name").value).toBe("Writer");
    const instructions = field("happy-agent-bot-settings-instructions");
    expect(instructions.tagName).toBe("TEXTAREA");
    expect(instructions.value).toBe("Write release notes.");

    fireEvent.input(instructions, { target: { value: "Write short release notes." } });
    expect(actions.botSettingsInstructionsUpdate).toHaveBeenLastCalledWith(
        "Write short release notes.",
    );
    fireEvent.input(field("happy-agent-bot-settings-name"), { target: { value: "Scribe" } });
    expect(actions.botSettingsNameUpdate).toHaveBeenLastCalledWith("Scribe");

    act(() => {
        fireEvent.click(
            document.querySelector<HTMLButtonElement>(
                '[data-testid="happy-agent-bot-settings-save"]',
            )!,
        );
    });
    expect(actions.botSettingsSubmit).toHaveBeenCalledOnce();
});
