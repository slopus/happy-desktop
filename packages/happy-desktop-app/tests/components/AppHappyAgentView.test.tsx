import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type {
    HappyAgentClockStore,
    HappyAgentConnectionStore,
    HappyAgentHost,
    HappyAgentModelStore,
    HappyAgentPanelSnapshot,
    HappyAgentPanelStore,
    HappyAgentPanelTabId,
    HappyAgentWorkspaceStore,
    HappyAgentFileTabSnapshot,
    HappyAgentGroupId,
    HappyAgentWorkspaceSnapshot,
} from "happy-desktop-state";
import {
    appearanceStoreCreate,
    happyAgentGroupAccessRefused,
    HAPPY_AGENT_RETAINED_CONVERSATIONS_NONE,
    happyAgentHostNoop,
    HAPPY_AGENT_GROUP_UNLISTED_REFUSAL,
    HAPPY_AGENT_GROUP_ACCESS_OPEN,
} from "happy-desktop-state";
import {
    workspaceCloseTargetFind,
    workspacePathRelative,
    AppHappyAgentView,
    type AppHappyAgentDirectorySnapshot,
    type AppHappyAgentDirectoryStore,
} from "../../sources/AppHappyAgentView";

// The projection must retain the actual editor node and FileEditor's local
// Source face. A textarea supplies selection/focus in jsdom; the independent
// hidden-app check exercises CodeMirror's browser integration itself.
vi.mock("../../../happy-desktop-ui/src/CodeEditor", () => ({
    CodeEditor: (props: {
        name: string;
        value: string;
        readOnly?: boolean;
        onValueChange?: (value: string) => void;
    }) => (
        <textarea
            aria-label={props.name}
            onChange={(event) => props.onValueChange?.(event.currentTarget.value)}
            readOnly={props.readOnly}
            value={props.value}
        />
    ),
}));

it("shortens contained Changes paths only at a directory boundary and retains external attribution", () => {
    const root = "/Users/steve/Happy/Tasks/task_66";
    expect(workspacePathRelative(`${root}/.context/task-status.md`, root)).toBe(
        ".context/task-status.md",
    );
    const neighboringTask = "/Users/steve/Happy/Tasks/task_660/report.md";
    expect(workspacePathRelative(neighboringTask, root)).toBe(neighboringTask);
    expect(workspacePathRelative("/tmp/report.md", root)).toBe("/tmp/report.md");
    expect(workspacePathRelative("~/a/report.md", root)).toBe("~/a/report.md");
    expect(workspacePathRelative(`${root}/report.md`, undefined)).toBe(`${root}/report.md`);
    expect(workspacePathRelative(`${root}/a\\b.txt`, root)).toBe("a\\b.txt");
    expect(workspacePathRelative("C:\\task\\src\\same.txt", "C:\\task")).toBe("src/same.txt");
});

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
            tasks: [],
            taskDirectory: [],
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
        panel: panel(),
        subscribe: () => () => undefined,
        conversationOpen: () => undefined,
        sidebarRowsUpdate: () => undefined,
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
    workspaceStore = workspace(),
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
                    workspace: workspaceStore,
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
        workspace?: HappyAgentWorkspaceStore;
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
            happyAgents={directory(options.host ?? happyAgentHostNoop, projects, options.workspace)}
        />,
    );
}

it.each(["README.md", "package.json"])(
    "keeps %s source, exact editor node, focus and selection through accepted save and Git revalidation",
    async (path) => {
        const base = workspace();
        const document = {
            path,
            content: path.endsWith(".md") ? "# Fixture\n" : "{}\n",
            hash: "before",
        };
        const id = `file:${path}`;
        const file: HappyAgentFileTabSnapshot = {
            id,
            groupId: "prj_one" as HappyAgentGroupId,
            path,
            kind: "file",
            placement: "main",
            preview: false,
            revision: "",
            presentationId: "read-before",
            displayedPresentationId: "read-before",
            displayedKind: "file",
            displayedPath: path,
            displayedDocument: document,
            document: { type: "ready", value: document },
            loading: false,
            revalidating: false,
            saving: false,
        };
        let snapshot: HappyAgentWorkspaceSnapshot = {
            ...base.get(),
            address: { groupId: file.groupId },
            groupAccess: HAPPY_AGENT_GROUP_ACCESS_OPEN,
            activeMainViewId: id,
            displayedMainViewId: id,
            fileTabs: [file],
            fileScope: "all",
        };
        const listeners = new Set<() => void>();
        const publish = (next: HappyAgentFileTabSnapshot) => {
            snapshot = { ...snapshot, fileTabs: [next] };
            for (const listener of listeners) listener();
        };
        const writes: string[] = [];
        const store: HappyAgentWorkspaceStore = {
            ...base,
            get: () => snapshot,
            subscribe: (listener) => {
                listeners.add(listener);
                return () => {
                    listeners.delete(listener);
                };
            },
            fileDraftUpdate: (_id, draft) => publish({ ...snapshot.fileTabs[0]!, draft }),
            fileDraftSave: async () => {
                const current = snapshot.fileTabs[0]!;
                writes.push(current.draft!);
                publish({ ...current, saving: true });
                await Promise.resolve();
                const saved = { ...document, content: current.draft!, hash: "after" };
                publish({
                    ...current,
                    saving: false,
                    draft: undefined,
                    document: { type: "ready", value: saved },
                    displayedDocument: saved,
                });
                // The read generation changes again when the Git watcher and
                // fresh authoritative read reconcile the accepted bytes.
                publish({
                    ...snapshot.fileTabs[0]!,
                    revision: "modified",
                    presentationId: "read-after",
                    displayedPresentationId: "read-after",
                });
            },
        };
        const rendered = view({ groupId: "prj_one", workspace: store });
        if (path.endsWith(".md")) fireEvent.click(rendered.getByRole("button", { name: "Source" }));
        const editor = rendered.getByRole("textbox", { name: path }) as HTMLTextAreaElement;
        const text = `${document.content}saved marker\n`;
        fireEvent.change(editor, { target: { value: text } });
        await waitFor(() => expect(editor.value).toBe(text));
        editor.focus();
        editor.setSelectionRange(2, 7);
        await act(async () => {
            fireEvent.keyDown(editor, { key: "s", metaKey: true });
        });
        await waitFor(() =>
            expect(
                rendered.container
                    .querySelector('[data-happy-desktop-ui="file-editor"]')
                    ?.hasAttribute("data-dirty"),
            ).toBe(false),
        );
        expect(writes).toEqual([text]);
        expect(rendered.getByRole("textbox", { name: path })).toBe(editor);
        expect(globalThis.document.activeElement).toBe(editor);
        expect([editor.selectionStart, editor.selectionEnd]).toEqual([2, 7]);
        expect(editor.value).toBe(text);
        fireEvent.change(editor, { target: { value: `${text}continued typing` } });
        expect(snapshot.fileTabs[0]?.draft).toBe(`${text}continued typing`);
        rendered.unmount();
    },
);

it("leaves the sidebar head to the window band, with no local-only title", () => {
    const { container } = view();

    // The integrated band holds the sidebar toggle and search in this lane, so
    // the product mark stands down and no local title takes its place.
    expect(container.querySelector('[data-happy-desktop-ui="sidebar-brand-logo"]')).toBeNull();
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
    expect(rows.map((row) => row.getAttribute("data-item-id"))).toEqual([
        "feed",
        "artifacts",
        "local/prj_one",
    ]);
    // The row is the project's name alone; its path would crowd the name out,
    // and the heading over the open project states it in full.
    expect(rows[2]?.textContent).toContain("happy");
    expect(rows[2]?.textContent).not.toContain("~/happy");

    // The sessions inside the addressed project are its tabs.
    const tabs = [...container.querySelectorAll('[data-happy-desktop-ui="tab"]')];
    expect(tabs.map((tab) => tab.getAttribute("data-tab-id"))).toEqual(["ses_one"]);
    expect(tabs[0]?.textContent).toContain("Fix token rotation race");
});

/* Command-W follows the keyboard: a tab of the right pane while focus is in
 * the pane, the main content's tab everywhere else. */
it("routes Command-W to the focused pane", () => {
    const terminal = "tab_1" as HappyAgentPanelTabId;
    const pane = {
        open: true,
        filesViewOpen: true,
        activeViewId: terminal,
        tabs: [{ id: terminal, kind: "terminal", label: "Terminal 1", placement: "panel" }],
    } as unknown as HappyAgentPanelSnapshot;

    expect(workspaceCloseTargetFind("panel", pane, false)).toEqual({
        type: "view",
        viewId: terminal,
    });
    expect(workspaceCloseTargetFind("workspace", pane, false)).toEqual({ type: "main" });
    expect(workspaceCloseTargetFind("panel", { ...pane, activeViewId: "files" }, false)).toEqual({
        type: "view",
        viewId: "files",
    });
    expect(
        workspaceCloseTargetFind("panel", { ...pane, activeViewId: "artifacts" }, false),
    ).toEqual({ type: "pane" });
    // A closed pane, or one whose checkout is gone, leaves Command-W to the main content.
    expect(workspaceCloseTargetFind("panel", { ...pane, open: false }, false)).toEqual({
        type: "main",
    });
    expect(workspaceCloseTargetFind("panel", pane, true)).toEqual({ type: "main" });
});
