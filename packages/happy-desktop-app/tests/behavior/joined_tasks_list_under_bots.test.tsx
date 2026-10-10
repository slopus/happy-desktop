import { act, fireEvent, render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
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
    happyAgentGroupAccessRefused,
    happyAgentHostNoop,
    HAPPY_AGENT_GROUP_UNLISTED_REFUSAL,
    projectsVisibilityStoreCreate,
} from "happy-desktop-state";
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
    taskLeave: (taskId: string) => Promise<void>;
    taskArchive: (taskId: string) => Promise<void>;
    taskReorder: (taskId: string, afterId: string | null) => Promise<void>;
    taskBrowseOpen: () => void;
    taskRenameOpen: (taskId: string) => void;
}

interface Listing {
    readonly tasks: readonly HappyAgentTask[];
    readonly browseOpen?: boolean;
}

function workspace(actions: TaskActions, listing: Listing): HappyAgentWorkspaceStore {
    const snapshot = {
        ...(listing.browseOpen ? { taskBrowseOpen: true as const } : {}),
        list: {
            bots: BOTS,
            tasks: listing.tasks,
            taskDirectory: listing.tasks,
            tasksJoining: new Set(),
            taskFailures: new Map(),
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
    return {
        get: () => snapshot,
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
    } = {},
) {
    const actions: TaskActions = {
        taskLeave: vi.fn(() => Promise.resolve()),
        taskArchive: vi.fn(() => Promise.resolve()),
        taskReorder: vi.fn(() => Promise.resolve()),
        taskBrowseOpen: vi.fn(),
        taskRenameOpen: vi.fn(),
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
            onChatSelect={() => undefined}
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
    return { ...rendered, actions };
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
        "local/ws_helper",
        "local/ws_launch",
        "local/ses_checklist",
        "local/ws_billing",
        "local/ws_orphan",
        "local/prj_one",
    ]);
});

it("wears the owner's photo, then their initials, then the bot placeholder", () => {
    const { container } = view();
    const launch = row(container, "ws_launch");
    expect(
        launch.querySelector('[data-happy-desktop-ui="avatar-image"]')?.getAttribute("src"),
    ).toBe(PHOTO);
    expect(
        row(container, "ws_billing").querySelector('[data-happy-desktop-ui="avatar-initials"]')
            ?.textContent,
    ).toBe("BD");
    const orphan = row(container, "ws_orphan");
    expect(orphan.querySelector('[data-happy-desktop-ui="avatar-brutalist"]')).not.toBeNull();
    expect(orphan.querySelector('[data-happy-desktop-ui="avatar"]')).toBeNull();
    // A bot without a picture wears the same placeholder.
    expect(
        row(container, "ws_helper").querySelector('[data-happy-desktop-ui="avatar-brutalist"]'),
    ).not.toBeNull();
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

it("opens the task browser from the Tasks heading", () => {
    const { container, actions } = view();
    const browse = container.querySelector<HTMLButtonElement>(
        '[aria-label="Browse tasks"][data-happy-desktop-ui="sidebar-section-action"]',
    )!;
    fireEvent.click(browse);
    expect(actions.taskBrowseOpen).toHaveBeenCalledTimes(1);
});

it("hides the Projects section for team and local connections the moment the setting changes", () => {
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

    act(() => projectsVisibility.projectsHiddenUpdate(true));
    expect(sectionLabels(container)).toEqual(["Bots", "Tasks", "Bots", "Tasks"]);
    expect(rowIds(container).some((id) => id?.endsWith("/prj_one"))).toBe(false);
    // Bots and tasks stay listed on both connections.
    expect(rowIds(container)).toContain("local/ws_launch");
    expect(rowIds(container)).toContain("team/ws_launch");

    act(() => projectsVisibility.projectsHiddenUpdate(false));
    expect(rowIds(container)).toContain("local/prj_one");
    expect(rowIds(container)).toContain("team/prj_one");
});

const STANDALONE_TASKS: readonly HappyAgentTask[] = TASKS.map((entry) => ({
    ...entry,
    owner: null,
}));

it("shows no owner face on a standalone machine, only the plain tasks glyph", () => {
    const { container } = view({
        entries: (actions) => [entry("local", actions, { tasks: STANDALONE_TASKS })],
    });
    for (const id of ["ws_launch", "ws_billing", "ws_orphan"]) {
        const face = row(container, id);
        expect(face.querySelector('[data-happy-desktop-ui="avatar-image"]')).toBeNull();
        expect(face.querySelector('[data-happy-desktop-ui="avatar-initials"]')).toBeNull();
        expect(face.querySelector('[data-happy-desktop-ui="avatar-brutalist"]')).toBeNull();
        expect(face.querySelector('[data-happy-desktop-ui="avatar-glyph"]')).not.toBeNull();
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
            faces: node.querySelectorAll(
                '[data-happy-desktop-ui="avatar"], [data-happy-desktop-ui="avatar-brutalist"]',
            ).length,
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

it("says there are no tasks yet, offering Browse, when nothing is joined", () => {
    const { container, actions } = view({
        entries: (actions) => [entry("local", actions, { tasks: [] })],
    });
    expect(sectionLabels(container)).toEqual(["Bots", "Tasks", "Projects"]);
    const empty = container.querySelector('[data-happy-desktop-ui="sidebar-section-empty"]')!;
    expect(empty.textContent).toContain("Join a task to keep it here.");
    fireEvent.click(empty.querySelector("button")!);
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

it("makes a task from the + on the Tasks heading, with Browse beside it", () => {
    const onTaskCreateOpen = vi.fn();
    const { container, actions } = view({
        onTaskCreateOpen,
        entries: (actions) => [entry("local", actions, { version: CREATES })],
    });
    const create = container.querySelector<HTMLButtonElement>(
        '[aria-label="New task"][data-happy-desktop-ui="sidebar-section-action"]',
    )!;
    const browse = container.querySelector<HTMLButtonElement>(
        '[aria-label="Browse tasks"][data-happy-desktop-ui="sidebar-section-secondary-action"]',
    )!;
    expect(create).not.toBeNull();
    expect(browse).not.toBeNull();

    fireEvent.click(create);
    expect(onTaskCreateOpen).toHaveBeenCalledWith("local");
    expect(actions.taskBrowseOpen).not.toHaveBeenCalled();

    fireEvent.click(browse);
    expect(actions.taskBrowseOpen).toHaveBeenCalledTimes(1);
    expect(onTaskCreateOpen).toHaveBeenCalledTimes(1);
});

it("offers New task in the empty Tasks section on a Happy Agent that makes them", () => {
    const onTaskCreateOpen = vi.fn();
    const { container } = view({
        onTaskCreateOpen,
        entries: (actions) => [entry("local", actions, { tasks: [], version: CREATES })],
    });
    const empty = container.querySelector('[data-happy-desktop-ui="sidebar-section-empty"]')!;
    expect(empty.textContent).toContain("Start a task, or browse to join one.");
    const button = empty.querySelector("button")!;
    expect(button.textContent).toBe("New task");
    fireEvent.click(button);
    expect(onTaskCreateOpen).toHaveBeenCalledWith("local");
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
    expect(actions.taskRenameOpen).toHaveBeenCalledWith("billing");
    expect(actions.taskLeave).not.toHaveBeenCalled();
});
