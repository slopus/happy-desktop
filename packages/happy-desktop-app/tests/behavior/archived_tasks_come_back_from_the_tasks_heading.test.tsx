import { act, fireEvent, render } from "@testing-library/react";
import { beforeAll, expect, it, vi } from "vitest";
import type {
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
    type AppHappyAgentEntry,
} from "../../sources/AppHappyAgentView";

/* An archived task has no row. The Tasks heading lists the ones the reader may
 * bring back, newest first; choosing one unarchives it and opens it once the
 * host lists it again, joining it first when the reader is not in it. */

const CONNECTED = { connection: "connected", daemon: "ready", attempt: 0 } as const;
const PANEL_CLOSED = { open: false, tabs: [] } as const;
const MODELS_LOADING = { type: "loading" } as const;

beforeAll(() => {
    // jsdom lays nothing out, so it has nothing to scroll into view.
    Element.prototype.scrollIntoView ??= () => undefined;
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

const task = (
    id: string,
    name: string,
    options: {
        readonly archived?: boolean;
        readonly canArchive?: boolean;
        readonly joined?: boolean;
    } = {},
): HappyAgentTask => ({
    id: id as HappyAgentTaskId,
    workspaceId: `ws_${id}` as HappyAgentWorktreeId,
    name,
    conversation: {
        id: `ses_${id}`,
        title: name,
        subtitle: "",
        updatedAt: 1_763_999_000_000,
        activity: "idle" as const,
        participants: [],
    },
    subtasks: [],
    owner: null,
    path: `/Users/happy/Tasks/${id}`,
    displayPath: `~/Tasks/${id}`,
    createdAt: 1,
    archived: options.archived === true,
    canArchive: options.canArchive !== false,
    ...(options.joined === false ? {} : { membership: { orderKey: id } }),
});

const LAUNCH = task("launch", "Ship the launch");
// Oldest first, as the session list keeps them.
const NOTES = task("notes", "Draft the release notes", { archived: true });
const LEDGER = task("ledger", "Audit the ledger", { archived: true, canArchive: false });
const UPLOAD = task("upload", "Fix the flaky upload test", { archived: true });

const unarchived = (archived: HappyAgentTask): HappyAgentTask => ({ ...archived, archived: false });

interface Listing {
    readonly tasks: readonly HappyAgentTask[];
    /** Every active task, joined or not; the joined ones alone when absent. */
    readonly taskDirectory?: readonly HappyAgentTask[];
    readonly tasksArchived: readonly HappyAgentTask[];
    readonly tasksJoining?: ReadonlySet<string>;
    readonly taskFailures?: AppHappyAgentEntry["taskFailures"];
}

interface TaskActions {
    taskJoin: (taskId: string) => Promise<void>;
    taskUnarchive: (taskId: string) => Promise<void>;
}

/** A workspace whose list the test moves on, as the host's answers would. */
function workspace(actions: TaskActions, initial: Listing) {
    const snapshotOf = (listing: Listing) => ({
        list: {
            bots: [],
            tasks: listing.tasks,
            taskDirectory: listing.taskDirectory ?? listing.tasks,
            tasksArchived: listing.tasksArchived,
            archivedSessions: [],
            tasksJoining: listing.tasksJoining ?? new Set(),
            taskFailures: listing.taskFailures ?? new Map(),
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
    });
    let listing = initial;
    let snapshot = snapshotOf(listing);
    const listeners = new Set<() => void>();
    const store = {
        get: () => snapshot,
        deviceBridgeSupport: () => undefined,
        panel: {
            get: () => PANEL_CLOSED,
            subscribe: () => () => undefined,
            [Symbol.dispose]: () => undefined,
        } as unknown as HappyAgentPanelStore,
        subscribe: (listener: () => void) => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        // Looked up when called, so a test can put its own act in after this is made.
        taskJoin: (taskId: string) => actions.taskJoin(taskId),
        taskUnarchive: (taskId: string) => actions.taskUnarchive(taskId),
        [Symbol.dispose]: () => undefined,
    } as unknown as HappyAgentWorkspaceStore;
    const update = (next: Partial<Listing>) => {
        listing = { ...listing, ...next };
        snapshot = snapshotOf(listing);
        for (const listener of [...listeners]) listener();
    };
    return { store, update, listing: () => listing };
}

function view(
    options: {
        listing?: Listing;
        status?: AppHappyAgentEntry["status"];
        actions?: (update: (next: Partial<Listing>) => void) => Partial<TaskActions>;
        onChatSelect?: (happyAgentId: string, groupId: string, chatId?: string) => void;
    } = {},
) {
    const listing = options.listing ?? {
        tasks: [LAUNCH],
        tasksArchived: [NOTES, LEDGER, UPLOAD],
    };
    const actions: TaskActions = {
        taskJoin: vi.fn(() => Promise.resolve()),
        taskUnarchive: vi.fn(() => Promise.resolve()),
    };
    const fake = workspace(actions, listing);
    Object.assign(actions, options.actions?.(fake.update));
    const entry: AppHappyAgentEntry = {
        bots: [],
        tasks: listing.tasks,
        tasksArchived: listing.tasksArchived,
        ...(listing.taskFailures ? { taskFailures: listing.taskFailures } : {}),
        version: "0.4.87-preview.6",
        id: "local",
        label: "local",
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
            workspace: fake.store,
        },
        status: options.status ?? "connected",
    };
    const snapshot: AppHappyAgentDirectorySnapshot = { happyAgents: [entry] };
    const directory: AppHappyAgentDirectoryStore = {
        get: () => snapshot,
        subscribe: () => () => undefined,
        happyAgentActivate: () => undefined,
    };
    const rendered = render(
        <AppHappyAgentView
            appearance={appearanceStoreCreate({ mode: "light" })}
            onChatSelect={options.onChatSelect ?? (() => undefined)}
            onFileClose={() => undefined}
            onFileSelect={() => undefined}
            onSettingsOpen={() => undefined}
            happyAgentId="local"
            happyAgents={directory}
        />,
    );
    return { ...rendered, actions, update: fake.update, listing: fake.listing };
}

const archivedControl = (container: HTMLElement) =>
    container.querySelector<HTMLButtonElement>('[aria-label="Archived tasks"]');

const menuLabels = () =>
    [
        ...document.querySelectorAll(
            '[data-happy-desktop-ui="sidebar-item-menu"] [data-happy-desktop-ui="menu-item-label"]',
        ),
    ].map((item) => item.textContent);

const unarchiveChoose = (container: HTMLElement, taskId: string) => {
    fireEvent.click(archivedControl(container)!);
    fireEvent.click(
        document.querySelector(
            `[data-happy-desktop-ui="sidebar-item-menu"] [data-item-id="unarchive:${taskId}"]`,
        )!,
    );
};

/** Lets the unarchive the menu asked for answer, as the store's promise does. */
const answered = () => act(async () => undefined);

it("offers no way back while no archived task may come back", () => {
    const { container } = view({ listing: { tasks: [LAUNCH], tasksArchived: [LEDGER] } });
    expect(archivedControl(container)).toBeNull();
});

it("names the archived tasks the reader may bring back, newest first", () => {
    const { container } = view();
    const control = archivedControl(container)!;
    expect(control.disabled).toBe(false);
    fireEvent.click(control);
    // The one only its owner may unarchive is left out.
    expect(menuLabels()).toEqual([
        "Unarchive Fix the flaky upload test",
        "Unarchive Draft the release notes",
    ]);
});

it("brings a task back and opens it once the host lists it again", async () => {
    const onChatSelect = vi.fn();
    const { container, actions, update } = view({ onChatSelect });
    unarchiveChoose(container, "notes");
    expect(actions.taskUnarchive).toHaveBeenCalledExactlyOnceWith("notes");
    await answered();
    // Still archived until the host says otherwise, so nothing opens yet.
    expect(onChatSelect).not.toHaveBeenCalled();

    act(() =>
        update({
            tasks: [unarchived(NOTES), LAUNCH],
            taskDirectory: [LAUNCH, unarchived(NOTES)],
            tasksArchived: [LEDGER, UPLOAD],
        }),
    );
    expect(onChatSelect).toHaveBeenCalledExactlyOnceWith("local", "ws_notes", "ses_notes");
    expect(actions.taskJoin).not.toHaveBeenCalled();
});

it("joins a task the reader is not in before opening it", async () => {
    const left = task("draft", "Write the launch post", { archived: true, joined: false });
    const onChatSelect = vi.fn();
    const { container, actions, update } = view({
        onChatSelect,
        listing: { tasks: [LAUNCH], tasksArchived: [left] },
        // Asking to join marks the task joining at once, as the session list does.
        actions: (move) => ({
            taskJoin: vi.fn((taskId: string) => {
                move({ tasksJoining: new Set([taskId]) });
                return Promise.resolve();
            }),
        }),
    });
    unarchiveChoose(container, "draft");
    await answered();
    // Back, but not in the reader's own list: it is joined first.
    act(() => update({ taskDirectory: [LAUNCH, unarchived(left)], tasksArchived: [] }));
    await answered();
    expect(actions.taskJoin).toHaveBeenCalledExactlyOnceWith("draft");
    expect(onChatSelect).not.toHaveBeenCalled();

    const joined = { ...unarchived(left), membership: { orderKey: "0" } };
    act(() =>
        update({
            tasks: [joined, LAUNCH],
            taskDirectory: [LAUNCH, joined],
            tasksJoining: new Set(),
        }),
    );
    expect(onChatSelect).toHaveBeenCalledExactlyOnceWith("local", "ws_draft", "ses_draft");
});

it("opens nothing when the host refuses to bring the task back", async () => {
    const onChatSelect = vi.fn();
    const { container, update } = view({ onChatSelect });
    unarchiveChoose(container, "upload");
    await answered();
    act(() =>
        update({
            taskFailures: new Map([
                [
                    "upload",
                    { action: "unarchive" as const, error: { message: "Not yours to restore." } },
                ],
            ]),
        }),
    );
    // A later restore from somewhere else does not pull the reader to it.
    act(() =>
        update({
            tasks: [LAUNCH, unarchived(UPLOAD)],
            taskDirectory: [LAUNCH, unarchived(UPLOAD)],
            tasksArchived: [NOTES, LEDGER],
        }),
    );
    expect(onChatSelect).not.toHaveBeenCalled();
});

it("states a refused unarchive in the sidebar's error notice", () => {
    const { container } = view({
        listing: {
            tasks: [LAUNCH],
            tasksArchived: [NOTES],
            taskFailures: new Map([
                [
                    "notes",
                    { action: "unarchive" as const, error: { message: "The host is busy." } },
                ],
            ]),
        },
    });
    const notices = [
        ...container.querySelectorAll(
            '[data-happy-desktop-ui="sidebar-error-notice"] .happy-sidebar-error-notice__text',
        ),
    ].map((node) => node.textContent);
    expect(notices).toEqual(["Could not unarchive “Draft the release notes”. The host is busy."]);
});

it("keeps the control in place but disabled while the machine is away", () => {
    const { container, actions } = view({ status: "disconnected" });
    const control = archivedControl(container)!;
    expect(control.disabled).toBe(true);
    fireEvent.click(control);
    expect(actions.taskUnarchive).not.toHaveBeenCalled();
});
