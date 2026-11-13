import { act, fireEvent, render } from "@testing-library/react";
import { beforeAll, expect, it, vi } from "vitest";
import type {
    HappyAgentBot,
    HappyAgentBotId,
    HappyAgentClockStore,
    HappyAgentConnectionStore,
    HappyAgentModelStore,
    HappyAgentPanelStore,
    HappyAgentProjectGroup,
    HappyAgentProjectId,
    HappyAgentTask,
    HappyAgentTaskId,
    HappyAgentWorkspaceStore,
    HappyAgentWorktreeId,
    ProjectsVisibilityStore,
} from "happy-desktop-state";
import {
    appearanceStoreCreate,
    commandPaletteStoreCreate,
    happyAgentGroupAccessRefused,
    happyAgentHostNoop,
    HAPPY_AGENT_GROUP_UNLISTED_REFUSAL,
    projectsVisibilityStoreCreate,
} from "happy-desktop-state";
import { avatarPlaceholderIndex } from "happy-desktop-ui";
import { APP_SHORTCUTS } from "../../sources/appShortcuts";
import { commandPaletteSuggestionSections } from "../../sources/commandPaletteResults";
import {
    AppHappyAgentView,
    type AppHappyAgentDirectorySnapshot,
    type AppHappyAgentDirectoryStore,
    type AppHappyAgentEntry,
} from "../../sources/AppHappyAgentView";

/* The reader's joined tasks sit under the bots, in the reader's own order, as
 * bot-style rows wearing their owner's face. Leaving is the row's control,
 * archiving waits in its menu for the people allowed to, and the Projects
 * section can be left out of the whole window from settings — team and local
 * connections alike. */

const CONNECTED = { connection: "connected", daemon: "ready", attempt: 0 } as const;
const PANEL_CLOSED = { open: false, tabs: [] } as const;
const MODELS_LOADING = { type: "loading" } as const;
const PHOTO = "data:image/png;base64,iVBORw0KGgo=";

beforeAll(() => {
    // jsdom lays nothing out, so it has nothing to scroll into view.
    Element.prototype.scrollIntoView ??= () => undefined;
});

const conversation = (id: string, title: string) => ({
    id,
    title,
    subtitle: "",
    updatedAt: 1_763_999_000_000,
    activity: "idle" as const,
    participants: [],
});

const PROJECTS: readonly HappyAgentProjectGroup[] = [
    {
        id: "prj_one" as HappyAgentProjectId,
        path: "/Users/happy/happy",
        displayPath: "~/happy",
        name: "happy",
        orderKey: "a",
        kind: "regular",
        lifecycle: { phase: "ready" },
        worktrees: [],
        activity: "idle",
        updatedAt: 1_763_999_000_000,
        conversations: [],
    },
];

const BOTS: readonly HappyAgentBot[] = [
    {
        id: "bot_helper" as HappyAgentBotId,
        workspaceId: "ws_helper" as HappyAgentWorktreeId,
        conversation: conversation("ses_helper", "Helper"),
        name: "Helper",
        username: "helper",
        orderKey: "a",
        path: "/Users/happy/Bots/helper",
        displayPath: "~/Bots/helper",
        subtasks: [],
    },
];

const task = (
    id: string,
    name: string,
    owner: HappyAgentTask["owner"],
    options: { readonly canArchive?: boolean; readonly subtasks?: HappyAgentTask["subtasks"] } = {},
): HappyAgentTask => ({
    id: id as HappyAgentTaskId,
    workspaceId: `ws_${id}` as HappyAgentWorktreeId,
    name,
    conversation: conversation(`ses_${id}`, name),
    subtasks: options.subtasks ?? [],
    owner,
    path: `/Users/happy/Tasks/${id}`,
    displayPath: `~/Tasks/${id}`,
    createdAt: 1,
    archived: false,
    canArchive: options.canArchive === true,
    membership: { orderKey: id },
});

// Already in the reader's order, which the session list establishes.
const TASKS: readonly HappyAgentTask[] = [
    task(
        "launch",
        "Ship the launch",
        { userId: "usr_ann", name: "Ann Lee", avatar: { url: PHOTO, thumbhash: "h" } },
        {
            canArchive: true,
            subtasks: [
                {
                    workspaceId: "ws_launch" as HappyAgentWorktreeId,
                    path: "/Users/happy/Tasks/launch",
                    conversation: conversation("ses_checklist", "Write the checklist"),
                    subtasks: [],
                },
            ],
        },
    ),
    task("billing", "Fix invoice rounding", { userId: "usr_bo", name: "Bo Diaz" }),
    task("orphan", "Triage nightly failures", {}),
];

interface TaskActions {
    taskJoin: (taskId: string) => Promise<void>;
    taskLeave: (taskId: string) => Promise<void>;
    taskArchive: (taskId: string) => Promise<void>;
    taskReorder: (taskId: string, afterId: string | null) => Promise<void>;
    taskBrowseOpen: () => void;
    taskRename: (taskId: string, name: string) => Promise<void>;
}

interface Listing {
    readonly tasks: readonly HappyAgentTask[];
    /** Every active task, joined or not; the joined ones alone when absent. */
    readonly taskDirectory?: readonly HappyAgentTask[];
    readonly browseOpen?: boolean;
}

function workspace(actions: TaskActions, listing: Listing): HappyAgentWorkspaceStore {
    const snapshot = {
        ...(listing.browseOpen ? { taskBrowseOpen: true as const } : {}),
        list: {
            bots: BOTS,
            tasks: listing.tasks,
            taskDirectory: listing.taskDirectory ?? listing.tasks,
            tasksArchived: [],
            archivedSessions: [],
            tasksJoining: new Set(),
            taskFailures: new Map(),
            projects: { type: "ready" as const, value: PROJECTS },
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

function entry(
    id: string,
    actions: TaskActions,
    extra: Partial<AppHappyAgentEntry> = {},
    listing: Listing = { tasks: extra.tasks ?? TASKS },
): AppHappyAgentEntry {
    return {
        bots: BOTS,
        tasks: listing.tasks,
        version: "0.4.87-preview.5",
        id,
        label: id,
        projects: PROJECTS,
        projectsStatus: "ready",
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
            workspace: workspace(actions, listing),
        },
        status: "connected",
        ...extra,
    };
}

function view(
    options: {
        actions?: Partial<TaskActions>;
        entries?: (actions: TaskActions) => readonly AppHappyAgentEntry[];
        projectsVisibility?: ProjectsVisibilityStore;
        onTaskCreateOpen?: (happyAgentId: string) => void;
        onChatSelect?: (happyAgentId: string, groupId: string, chatId?: string) => void;
        palette?: true;
    } = {},
) {
    const palette = commandPaletteStoreCreate();
    const actions: TaskActions = {
        taskJoin: vi.fn(() => Promise.resolve()),
        taskLeave: vi.fn(() => Promise.resolve()),
        taskArchive: vi.fn(() => Promise.resolve()),
        taskReorder: vi.fn(() => Promise.resolve()),
        taskBrowseOpen: vi.fn(),
        taskRename: vi.fn(() => Promise.resolve()),
        ...options.actions,
    };
    const snapshot: AppHappyAgentDirectorySnapshot = {
        happyAgents: options.entries?.(actions) ?? [entry("local", actions)],
    };
    const directory: AppHappyAgentDirectoryStore = {
        get: () => snapshot,
        subscribe: () => () => undefined,
        happyAgentActivate: () => undefined,
    };
    const rendered = render(
        <AppHappyAgentView
            appearance={appearanceStoreCreate({ mode: "light" })}
            {...(options.palette ? { commandPalette: palette } : {})}
            onChatSelect={options.onChatSelect ?? (() => undefined)}
            onFileClose={() => undefined}
            onFileSelect={() => undefined}
            onSettingsOpen={() => undefined}
            happyAgentId="local"
            happyAgents={directory}
            {...(options.projectsVisibility
                ? { projectsVisibility: options.projectsVisibility }
                : {})}
            {...(options.onTaskCreateOpen ? { onTaskCreateOpen: options.onTaskCreateOpen } : {})}
        />,
    );
    return { ...rendered, actions, palette };
}

const rowIds = (container: HTMLElement): (string | null)[] =>
    [...container.querySelectorAll('[data-happy-desktop-ui="sidebar-item"]')].map((row) =>
        row.getAttribute("data-item-id"),
    );

const sectionLabels = (container: HTMLElement): (string | null)[] =>
    [...container.querySelectorAll('[data-happy-desktop-ui="sidebar-section-label"]')].map(
        (label) => label.textContent,
    );

const row = (container: HTMLElement, id: string) =>
    container.querySelector<HTMLElement>(`[data-item-id="local/${id}"]`)!;

const menuLabels = () =>
    [
        ...document.querySelectorAll(
            '[data-happy-desktop-ui="sidebar-item-menu"] [data-happy-desktop-ui="menu-item-label"]',
        ),
    ].map((item) => item.textContent);

it("lists the joined tasks under the bots, in the reader's order, with their subtasks nested", () => {
    const { container } = view();
    expect(sectionLabels(container)).toEqual(["Bots", "Tasks", "Projects"]);
    expect(rowIds(container)).toEqual([
        "feed",
        "artifacts",
        "local/ws_helper",
        "local/ws_launch",
        "local/ses_checklist",
        "local/ws_billing",
        "local/ws_orphan",
        "local/prj_one",
    ]);
});

it("wears the owner's photo, then the owner's placeholder, then the task's own", () => {
    const { container } = view();
    const launch = row(container, "ws_launch");
    expect(
        launch.querySelector('[data-happy-desktop-ui="avatar-image"]')?.getAttribute("src"),
    ).toBe(PHOTO);
    const placeholder = (id: string) =>
        row(container, id)
            .querySelector('[data-happy-desktop-ui="avatar-placeholder"]')
            ?.getAttribute("data-placeholder-index");
    // Picked by the owner's user id, as every place pictures them, and by the
    // task's own id where nobody was identified.
    expect(placeholder("ws_billing")).toBe(String(avatarPlaceholderIndex("usr_bo")));
    expect(placeholder("ws_orphan")).toBe(String(avatarPlaceholderIndex("orphan")));
    // A bot without a picture wears the placeholder its id picks.
    expect(placeholder("ws_helper")).not.toBeUndefined();
});

it("leaves a task from the row's own control", () => {
    const { container, actions } = view();
    const leave = row(container, "ws_billing").querySelector<HTMLElement>(
        '[data-happy-desktop-ui="sidebar-item-action"]',
    )!;
    expect(leave.getAttribute("aria-label")).toBe("Leave Fix invoice rounding");
    fireEvent.click(leave);
    expect(actions.taskLeave).toHaveBeenCalledWith("billing");
    expect(actions.taskArchive).not.toHaveBeenCalled();
});

it("puts a task the reader left back in their list when they open it from search", () => {
    const { membership: _, ...left } = task("left", "Review the roadmap", {});
    const onChatSelect = vi.fn();
    const { actions, palette } = view({
        onChatSelect,
        palette: true,
        entries: (taskActions) => [
            entry("local", taskActions, {}, { tasks: TASKS, taskDirectory: [...TASKS, left] }),
        ],
    });
    act(() => palette.paletteOpen());
    act(() => palette.queryUpdate("roadmap"));
    fireEvent.click(
        document.querySelector(
            '[data-happy-desktop-ui="command-palette-results-row"][data-row-id="task:left"]',
        )!,
    );
    expect(actions.taskJoin).toHaveBeenCalledExactlyOnceWith("left");
    // It opens at once, while the join is on its way.
    expect(onChatSelect).toHaveBeenCalledExactlyOnceWith("local", "ws_left", "ses_left");

    // One already in the list only opens.
    act(() => palette.paletteOpen());
    act(() => palette.queryUpdate("invoice"));
    fireEvent.click(
        document.querySelector(
            '[data-happy-desktop-ui="command-palette-results-row"][data-row-id="task:billing"]',
        )!,
    );
    expect(actions.taskJoin).toHaveBeenCalledOnce();
    expect(onChatSelect).toHaveBeenLastCalledWith("local", "ws_billing", "ses_billing");
});

it("offers Archive in the context menu only for a task the reader may archive", () => {
    const { container, actions } = view();

    fireEvent.contextMenu(row(container, "ws_billing"), { clientX: 40, clientY: 40 });
    expect(menuLabels()).toEqual(["Leave task"]);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    fireEvent.contextMenu(row(container, "ws_launch"), { clientX: 40, clientY: 40 });
    expect(menuLabels()).toEqual(["Leave task", "Archive task"]);
    fireEvent.click(
        document.querySelector(
            '[data-happy-desktop-ui="sidebar-item-menu"] [data-item-id="archive"]',
        )!,
    );
    expect(actions.taskArchive).toHaveBeenCalledWith("launch");
    expect(actions.taskLeave).not.toHaveBeenCalled();
});

it("moves a task within the reader's own list with Alt+Arrow", () => {
    // jsdom has no media queries; the move skips its settle animation.
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const { container, actions } = view();
    fireEvent.keyDown(row(container, "ws_launch"), { key: "ArrowDown", altKey: true });
    expect(actions.taskReorder).toHaveBeenLastCalledWith("launch", "billing");
    vi.unstubAllGlobals();
});

it("leaves browsing tasks off the Tasks heading", () => {
    const { container } = view();
    expect(container.querySelector('[aria-label="Browse tasks"]')).toBeNull();
});

it("hides each connection's Projects section the moment its setting changes", () => {
    const projectsVisibility = projectsVisibilityStoreCreate();
    const { container } = view({
        projectsVisibility,
        entries: (actions) => [
            entry("local", actions),
            entry("team", actions, { remoteId: "team-connection", label: "Team" }),
        ],
    });
    expect(sectionLabels(container)).toEqual([
        "Bots",
        "Tasks",
        "Projects",
        "Bots",
        "Tasks",
        "Projects",
    ]);
    expect(rowIds(container)).toContain("team/prj_one");

    act(() => projectsVisibility.projectsHiddenUpdate("local", true));
    expect(sectionLabels(container)).toEqual(["Bots", "Tasks", "Bots", "Tasks", "Projects"]);
    expect(rowIds(container)).not.toContain("local/prj_one");
    expect(rowIds(container)).toContain("team/prj_one");
    // Bots and tasks stay listed on both connections.
    expect(rowIds(container)).toContain("local/ws_launch");
    expect(rowIds(container)).toContain("team/ws_launch");

    act(() => projectsVisibility.projectsHiddenUpdate("local", false));
    expect(rowIds(container)).toContain("local/prj_one");
    expect(rowIds(container)).toContain("team/prj_one");
});

const STANDALONE_TASKS: readonly HappyAgentTask[] = TASKS.map((entry) => ({
    ...entry,
    owner: null,
}));

it("shows no owner face on a standalone machine, only the placeholder each task's id picks", () => {
    const { container } = view({
        entries: (actions) => [entry("local", actions, { tasks: STANDALONE_TASKS })],
    });
    for (const id of ["launch", "billing", "orphan"]) {
        const face = row(container, `ws_${id}`);
        expect(face.querySelector('[data-happy-desktop-ui="avatar-image"]')).toBeNull();
        expect(face.querySelector('[data-happy-desktop-ui="avatar-initials"]')).toBeNull();
        expect(
            face
                .querySelector('[data-happy-desktop-ui="avatar-placeholder"]')
                ?.getAttribute("data-placeholder-index"),
        ).toBe(String(avatarPlaceholderIndex(id)));
    }
});

it("lists tasks in Browse without a face or name on a standalone machine, and with them in a team", () => {
    const browse = (tasks: readonly HappyAgentTask[]) => {
        const { unmount } = view({
            entries: (actions) => [entry("local", actions, {}, { tasks, browseOpen: true })],
        });
        const rows = [
            ...document.querySelectorAll(
                '[data-happy-desktop-ui="happy-agent-task-browse-dialog-row"]',
            ),
        ];
        const read = rows.map((node) => ({
            text: node.textContent,
            faces: node.querySelectorAll('[data-happy-desktop-ui="avatar"]').length,
        }));
        unmount();
        return read;
    };

    const standalone = browse(STANDALONE_TASKS);
    expect(standalone).toHaveLength(3);
    for (const entry of standalone) expect(entry.faces).toBe(0);
    expect(standalone.map((entry) => entry.text).join(" ")).not.toContain("Ann Lee");

    const team = browse(TASKS);
    expect(team.map((entry) => entry.faces)).toEqual([1, 1, 1]);
    expect(team[0]!.text).toContain("Ann Lee");
    expect(team[1]!.text).toContain("Bo Diaz");
});

/** The quiet row an empty section shows in place of its rows. */
const EMPTY_ROW = '[data-happy-desktop-ui="sidebar-item"][data-item-id="empty"]';

it("offers a quiet Browse row when nothing is joined", () => {
    const { container, actions } = view({
        entries: (actions) => [entry("local", actions, { tasks: [] })],
    });
    expect(sectionLabels(container)).toEqual(["Bots", "Tasks", "Projects"]);
    const empty = container.querySelector<HTMLButtonElement>(EMPTY_ROW)!;
    expect(empty.querySelector('[data-happy-desktop-ui="sidebar-item-label"]')!.textContent).toBe(
        "Browse",
    );
    fireEvent.click(empty);
    expect(actions.taskBrowseOpen).toHaveBeenCalledTimes(1);
});

it("leaves the Tasks section out entirely on a Happy Agent from before tasks", () => {
    const { container } = view({
        entries: (actions) => [entry("local", actions, { tasks: [], version: "0.4.86" })],
    });
    expect(sectionLabels(container)).toEqual(["Bots", "Projects"]);
    expect(container.querySelector('[aria-label="Browse tasks"]')).toBeNull();
});

/** A Happy Agent that makes and renames tasks, not only lists them. */
const CREATES = "0.4.87-preview.6";

/** The New task row directly under Search, the sidebar's one way to make a task. */
const NEW_TASK_ROW = '[data-happy-desktop-ui="sidebar-item"][data-item-id="new-chat"]';

it("makes a task from the New task row under Search", () => {
    const onTaskCreateOpen = vi.fn();
    const { container, actions } = view({
        onTaskCreateOpen,
        entries: (actions) => [entry("local", actions, { version: CREATES })],
    });
    const create = container.querySelector<HTMLButtonElement>(NEW_TASK_ROW)!;
    expect(create).not.toBeNull();
    expect(create.textContent).toContain("New task");
    expect(container.querySelector('[aria-label="Browse tasks"]')).toBeNull();

    fireEvent.click(create);
    expect(onTaskCreateOpen).toHaveBeenCalledWith("local");
    expect(actions.taskBrowseOpen).not.toHaveBeenCalled();
});

it("makes a task from the hover-revealed + on the Tasks heading", () => {
    const onTaskCreateOpen = vi.fn();
    const { container, actions } = view({
        onTaskCreateOpen,
        entries: (actions) => [entry("local", actions, { version: CREATES })],
    });
    const plus = container.querySelector<HTMLButtonElement>(
        '[aria-label="New task"][data-happy-desktop-ui="sidebar-section-action"]',
    )!;
    expect(plus).not.toBeNull();
    expect(plus.getAttribute("data-reveal")).toBe("hover");
    // The chord belongs to the row under Search, not the heading's +.
    expect(plus.getAttribute("aria-keyshortcuts")).toBeNull();

    fireEvent.click(plus);
    expect(onTaskCreateOpen).toHaveBeenCalledWith("local");
    expect(actions.taskBrowseOpen).not.toHaveBeenCalled();
});

it("offers a quiet New row in the empty Tasks section on a Happy Agent that makes them", () => {
    const onTaskCreateOpen = vi.fn();
    const { container } = view({
        onTaskCreateOpen,
        entries: (actions) => [entry("local", actions, { tasks: [], version: CREATES })],
    });
    const empty = container.querySelector<HTMLButtonElement>(EMPTY_ROW)!;
    expect(empty.querySelector('[data-happy-desktop-ui="sidebar-item-label"]')!.textContent).toBe(
        "New",
    );
    expect(empty.disabled).toBe(false);
    fireEvent.click(empty);
    expect(onTaskCreateOpen).toHaveBeenCalledWith("local");
});

it("keeps the New row in place but unavailable while the machine is away", () => {
    const onTaskCreateOpen = vi.fn();
    const { container } = view({
        onTaskCreateOpen,
        entries: (actions) => [
            entry("local", actions, { status: "disconnected", tasks: [], version: CREATES }),
        ],
    });
    const empty = container.querySelector<HTMLButtonElement>(EMPTY_ROW)!;
    expect(empty.disabled).toBe(true);
    fireEvent.click(empty);
    expect(onTaskCreateOpen).not.toHaveBeenCalled();
});

it("drops the New row once the Tasks section has rows", () => {
    const { container } = view({
        entries: (actions) => [entry("local", actions, { version: CREATES })],
    });
    expect(container.querySelector(EMPTY_ROW)).toBeNull();
});

it("renames a task from its context menu on a Happy Agent that renames them", () => {
    const { container, actions } = view({
        entries: (actions) => [entry("local", actions, { version: CREATES })],
    });
    fireEvent.contextMenu(row(container, "ws_billing"), { clientX: 40, clientY: 40 });
    expect(menuLabels()).toEqual(["Rename task", "Leave task"]);
    fireEvent.click(
        document.querySelector(
            '[data-happy-desktop-ui="sidebar-item-menu"] [data-item-id="rename"]',
        )!,
    );
    const input = container.querySelector<HTMLElement>(".happy-sidebar__item-rename")!;
    expect(document.activeElement).toBe(input);
    expect(input.textContent).toBe("Fix invoice rounding");
    expect(window.getSelection()?.toString()).toBe("Fix invoice rounding");
    input.textContent = "Fix rounding";
    fireEvent.input(input);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(actions.taskRename).toHaveBeenCalledWith("billing", "Fix rounding");
    expect(actions.taskLeave).not.toHaveBeenCalled();
});

const commandHeld =
    APP_SHORTCUTS.taskCreate.modifier === "Meta" ? { metaKey: true } : { ctrlKey: true };

const commandN = (target: Element | Window = window) =>
    fireEvent.keyDown(target, { key: "n", code: "KeyN", ...commandHeld });

it("opens New task on the machine on screen with Command-N, and shows the chord on its row", () => {
    const onTaskCreateOpen = vi.fn();
    const { container } = view({
        onTaskCreateOpen,
        entries: (actions) => [entry("local", actions, { version: CREATES })],
    });
    const create = container.querySelector<HTMLButtonElement>(NEW_TASK_ROW)!;
    expect(create.getAttribute("aria-keyshortcuts")).toBe(APP_SHORTCUTS.taskCreate.aria);
    expect(create.querySelector('[data-happy-desktop-ui="key-cap"]')).not.toBeNull();

    commandN();
    expect(onTaskCreateOpen).toHaveBeenCalledWith("local");
    // Shift-Command-N is the new workspace's chord now, not this one.
    fireEvent.keyDown(window, { key: "N", code: "KeyN", ...commandHeld, shiftKey: true });
    expect(onTaskCreateOpen).toHaveBeenCalledTimes(1);

    // Typing does not hold it back, as with every window chord: a chord is not text.
    const field = document.createElement("textarea");
    document.body.append(field);
    field.focus();
    commandN(field);
    expect(onTaskCreateOpen).toHaveBeenCalledTimes(2);
    field.remove();
});

it("leaves Command-N alone on a Happy Agent that cannot make tasks", () => {
    const onTaskCreateOpen = vi.fn();
    const { container } = view({
        onTaskCreateOpen,
        entries: (actions) => [entry("local", actions)],
    });
    commandN();
    expect(onTaskCreateOpen).not.toHaveBeenCalled();
    expect(
        container.querySelector(`[aria-keyshortcuts="${APP_SHORTCUTS.taskCreate.aria}"]`),
    ).toBeNull();
});

it("offers New task in the command palette with its chord, only where a task can be made", () => {
    const context = {
        archivedSessions: [],
        bots: [],
        tasks: [],
        sidebarListing: {
            botsHidden: new Set<string>(),
            projectsHidden: false,
        },
        visits: [],
        happyAgentId: "local",
        projects: [],
        sessionCreateAvailable: false,
        tabs: [],
        workspaceCreateAvailable: false,
    };
    const rows = commandPaletteSuggestionSections({
        ...context,
        taskCreateAvailable: true,
    }).flatMap((section) => section.rows);
    const task = rows.find((candidate) => candidate.id === "action:task-create");
    expect(task).toMatchObject({
        title: "New task",
        shortcut: { caps: APP_SHORTCUTS.taskCreate.caps },
        command: { kind: "taskCreate" },
    });
    expect(
        commandPaletteSuggestionSections({ ...context, taskCreateAvailable: false })
            .flatMap((section) => section.rows)
            .some((candidate) => candidate.id === "action:task-create"),
    ).toBe(false);
});
