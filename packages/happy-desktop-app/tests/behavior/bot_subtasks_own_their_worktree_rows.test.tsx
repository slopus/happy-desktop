import { fireEvent, render } from "@testing-library/react";
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
    HappyAgentSidebarCollapseStore,
    HappyAgentWorkspaceStore,
    HappyAgentWorktreeId,
} from "happy-desktop-state";
import {
    appearanceStoreCreate,
    happyAgentSidebarCollapseStoreCreate,
    happyAgentGroupAccessRefused,
    happyAgentHostNoop,
    HAPPY_AGENT_GROUP_UNLISTED_REFUSAL,
} from "happy-desktop-state";
import {
    AppHappyAgentView,
    type AppHappyAgentDirectorySnapshot,
    type AppHappyAgentDirectoryStore,
} from "../../sources/AppHappyAgentView";

/* A bot's subtask that works in a worktree of its own is that worktree's one
 * row: it sits under its bot with the worktree's line delta, the Projects
 * section no longer lists the same checkout a second time, and its menu
 * archives the task through the workspace without navigating. */

const CONNECTED = { connection: "connected", daemon: "ready", attempt: 0 } as const;
const PANEL_CLOSED = { open: false, tabs: [] } as const;
const MODELS_LOADING = { type: "loading" } as const;

const conversation = (id: string, title: string) => ({
    id,
    title,
    subtitle: "~/happy",
    updatedAt: 1_763_999_000_000,
    activity: "idle" as const,
    participants: [],
});

const worktree = (
    id: string,
    name: string,
    lines: { added: number; deleted: number },
): HappyAgentProjectGroup["worktrees"][number] => ({
    id: id as HappyAgentWorktreeId,
    projectId: "prj_one" as HappyAgentProjectId,
    name,
    orderKey: id,
    path: `/Users/happy/happy-worktrees/${name}`,
    displayPath: `~/happy-worktrees/${name}`,
    lifecycle: { phase: "ready" },
    conversations: [],
    activity: "idle",
    updatedAt: 1_763_999_000_000,
    addedLines: lines.added,
    deletedLines: lines.deleted,
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
        worktrees: [
            worktree("wt_flicker", "windows-console-flicker", { added: 81, deleted: 1 }),
            worktree("wt_free", "changes-comparison-base", { added: 40, deleted: 2 }),
        ],
        activity: "idle",
        updatedAt: 1_763_999_000_000,
        conversations: [],
        addedLines: 99,
        deletedLines: 0,
    },
];

const BOTS: readonly HappyAgentBot[] = [
    {
        id: "bot_debugger" as HappyAgentBotId,
        workspaceId: "ws_debugger" as HappyAgentWorktreeId,
        conversation: conversation("ses_debugger", "Session Debugger"),
        name: "Session Debugger",
        username: "session_debugger",
        orderKey: "a",
        path: "/Users/happy/Bots/session_debugger",
        displayPath: "~/Bots/session_debugger",
        subtasks: [
            {
                workspaceId: "wt_flicker" as HappyAgentWorktreeId,
                path: "/Users/happy/happy-worktrees/windows-console-flicker",
                conversation: conversation("ses_flicker", "Windows console flicker"),
                subtasks: [
                    {
                        // Shares its bot's folder, so it has no checkout of its
                        // own to report a delta for.
                        workspaceId: "ws_debugger" as HappyAgentWorktreeId,
                        path: "/Users/happy/Bots/session_debugger",
                        conversation: conversation("ses_notes", "Collect notes"),
                        subtasks: [],
                    },
                ],
            },
            {
                workspaceId: "ws_debugger" as HappyAgentWorktreeId,
                path: "/Users/happy/Bots/session_debugger",
                conversation: conversation("ses_dedupe", "Sidebar dedupe"),
                subtasks: [],
            },
        ],
    },
];

function workspace(actions: {
    subtaskArchive: (sessionId: string) => Promise<void>;
    subtaskReorder: (sessionId: string, afterId: string | null) => Promise<void>;
}): HappyAgentWorkspaceStore {
    const snapshot = {
        list: { bots: BOTS, tasks: [], projects: { type: "ready" as const, value: PROJECTS } },
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

function view(
    options: {
        subtaskArchive?: (sessionId: string) => Promise<void>;
        subtaskReorder?: (sessionId: string, afterId: string | null) => Promise<void>;
        subtaskFailures?: ReadonlyMap<
            string,
            { readonly action: "archive" | "reorder"; readonly error: { readonly message: string } }
        >;
        groupId?: string;
        sidebarCollapse?: HappyAgentSidebarCollapseStore;
    } = {},
) {
    const subtaskArchive = options.subtaskArchive ?? (() => Promise.resolve());
    const snapshot: AppHappyAgentDirectorySnapshot = {
        happyAgents: [
            {
                bots: BOTS,
                id: "local",
                label: "This Mac",
                projects: PROJECTS,
                projectsStatus: "ready",
                ...(options.subtaskFailures ? { subtaskFailures: options.subtaskFailures } : {}),
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
                    workspace: workspace({
                        subtaskArchive,
                        subtaskReorder: options.subtaskReorder ?? (() => Promise.resolve()),
                    }),
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
    return render(
        <AppHappyAgentView
            appearance={appearanceStoreCreate({ mode: "light" })}
            groupId={options.groupId}
            {...(options.sidebarCollapse ? { sidebarCollapse: options.sidebarCollapse } : {})}
            onChatSelect={() => undefined}
            onFileClose={() => undefined}
            onFileSelect={() => undefined}
            onSettingsOpen={() => undefined}
            happyAgentId="local"
            happyAgents={directory}
        />,
    );
}

const rowIds = (container: HTMLElement): (string | null)[] =>
    [...container.querySelectorAll('[data-happy-desktop-ui="sidebar-item"]')].map((row) =>
        row.getAttribute("data-item-id"),
    );

it("lists a subtask's worktree once, under its bot, with the worktree's line delta", () => {
    const { container } = view();

    // The bot's tree carries both subtasks; the Projects section keeps only the
    // worktree no bot owns, so the subtask's checkout is not listed twice.
    expect(rowIds(container)).toEqual([
        "local/ws_debugger",
        "local/ses_flicker",
        "local/ses_notes",
        "local/ses_dedupe",
        "local/prj_one",
        "local/wt_free",
    ]);

    const flicker = container.querySelector('[data-item-id="local/ses_flicker"]')!;
    expect(flicker.textContent).toContain("81");
    expect(flicker.textContent).toContain("1");
    // A subtask sharing its bot's folder has no checkout of its own to count.
    const notes = container.querySelector('[data-item-id="local/ses_notes"]')!;
    expect(notes.textContent).toBe("Collect notes");
    // The project row's own delta is its root checkout's and is unchanged.
    expect(container.querySelector('[data-item-id="local/prj_one"]')!.textContent).toContain("99");
});

it("archives a subtask from its row menu without navigating", async () => {
    const subtaskArchive = vi.fn(() => Promise.resolve());
    const { container } = view({ subtaskArchive });

    fireEvent.contextMenu(container.querySelector('[data-item-id="local/ses_notes"]')!, {
        clientX: 40,
        clientY: 40,
    });
    const menu = document.querySelector('[data-happy-desktop-ui="sidebar-item-menu"]')!;
    expect(
        [...menu.querySelectorAll('[data-happy-desktop-ui="menu-item-label"]')].map(
            (item) => item.textContent,
        ),
    ).toEqual(["Archive subtask"]);

    fireEvent.click(menu.querySelector('[data-item-id="archive"]')!);
    expect(subtaskArchive).toHaveBeenCalledWith("ses_notes");
});

it("selects the subtask's row for any address inside its worktree", () => {
    // The worktree has no row of its own under Projects, so the workspace
    // alone — a file, another chat there — still lands on its subtask.
    const { container } = view({ groupId: "wt_flicker" });
    expect(
        container.querySelector('[data-item-id="local/ses_flicker"]')?.getAttribute("aria-current"),
    ).toBe("page");
});

it("states a refused subtask archive under the Bots heading", () => {
    const { container } = view({
        subtaskFailures: new Map([
            [
                "ses_flicker",
                { action: "archive" as const, error: { message: "The host is busy." } },
            ],
        ]),
    });
    const errors = [
        ...container.querySelectorAll('[data-happy-desktop-ui="sidebar-section-error"]'),
    ].map((node) => node.textContent);
    expect(errors).toEqual(["Could not archive “Windows console flicker”. The host is busy."]);
});

it("hides and shows the whole Projects list from its heading, kept in the folding record", () => {
    const sidebarCollapse = happyAgentSidebarCollapseStoreCreate();
    const { container } = view({ sidebarCollapse });
    const toggle = () =>
        container.querySelector<HTMLButtonElement>(
            '[data-happy-desktop-ui="sidebar-section-secondary-action"]',
        )!;
    expect(toggle().getAttribute("aria-label")).toBe("Hide projects");

    fireEvent.click(toggle());
    // The heading stays with its controls; only the project rows go.
    expect(rowIds(container)).toEqual([
        "local/ws_debugger",
        "local/ses_flicker",
        "local/ses_notes",
        "local/ses_dedupe",
    ]);
    expect(container.textContent).toContain("Projects");
    expect(toggle().getAttribute("aria-label")).toBe("Show projects");
    expect(sidebarCollapse.get().collapsed.size).toBe(1);

    fireEvent.click(toggle());
    expect(rowIds(container)).toContain("local/wt_free");
    expect(toggle().getAttribute("aria-label")).toBe("Hide projects");
});

it("moves a subtask among its siblings with Alt+Arrow, through the subtask reorder", () => {
    // jsdom has no media queries; the move skips its settle animation.
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const subtaskReorder = vi.fn(() => Promise.resolve());
    const { container } = view({ subtaskReorder });
    const row = (id: string) => container.querySelector(`[data-item-id="local/${id}"]`)!;

    // The first of the bot's two tasks moves below the second, carrying its child.
    fireEvent.keyDown(row("ses_flicker"), { key: "ArrowDown", altKey: true });
    expect(subtaskReorder).toHaveBeenLastCalledWith("ses_flicker", "ses_dedupe");
    // A task with no sibling has nowhere to go.
    fireEvent.keyDown(row("ses_notes"), { key: "ArrowUp", altKey: true });
    expect(subtaskReorder).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
});
