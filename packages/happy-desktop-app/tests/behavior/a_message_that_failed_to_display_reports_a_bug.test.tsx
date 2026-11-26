import { fireEvent, render } from "@testing-library/react";
import { expect, it, onTestFinished } from "vitest";
import type {
    ConversationEntry,
    HappyAgentClockStore,
    HappyAgentConnectionStore,
    HappyAgentModelStore,
    HappyAgentPanelStore,
    HappyAgentWorkspaceStore,
} from "happy-desktop-state";
import {
    appearanceStoreCreate,
    composerSourceOf,
    composerStoreCreate,
    happyAgentGroupAccessRefused,
    happyAgentHostNoop,
    HAPPY_AGENT_GROUP_UNLISTED_REFUSAL,
    HAPPY_AGENT_RETAINED_CONVERSATIONS_NONE,
} from "happy-desktop-state";
import {
    AppHappyAgentView,
    type AppHappyAgentDirectorySnapshot,
    type AppHappyAgentDirectoryStore,
} from "../../sources/AppHappyAgentView";

/*
 * A message the server sent that the protocol does not describe takes one muted
 * line in its place. Report bug on that line opens the same bug report the
 * sidebar does, already naming the server, the session, the message and what
 * was wrong with it.
 */

const CONNECTED = { connection: "connected", daemon: "ready", attempt: 0 } as const;
const PANEL_CLOSED = { open: false, tabs: [] } as const;
const MODELS_LOADING = { type: "loading" } as const;
const SESSION = "ses_review";
const ERRORS = [
    "/content/1/presentation/questions/0/header: Expected string length greater or equal to 1",
    "/content/1/presentation/answers: Expected object",
];

const ENTRIES: readonly ConversationEntry[] = [
    {
        kind: "invalidMessage",
        id: "invalid:msgclustercancelled000001",
        sequence: "00000002",
        occurredAt: 1_764_000_000_000,
        messageId: "msgclustercancelled000001",
        errors: ERRORS,
    },
];

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
        conversations: [
            {
                id: SESSION,
                title: "Review",
                subtitle: "",
                updatedAt: 1_763_999_000_000,
                activity: "idle",
                participants: [],
            },
        ],
    },
] as unknown as Projects;

function workspace() {
    const calls: string[] = [];
    const taskComposer = composerStoreCreate("task-create");
    const conversationComposer = composerStoreCreate(SESSION);
    const snapshot = {
        list: {
            bots: [],
            tasks: [],
            taskDirectory: [],
            projects: { type: "ready" as const, value: PROJECTS },
        },
        conversation: {
            type: "ready" as const,
            value: {
                conversationId: SESSION,
                ready: true,
                session: { type: "loading" },
                entries: ENTRIES,
                errorAssistance: [],
                composer: composerSourceOf(conversationComposer),
                running: false,
                subagentsRunning: false,
                workingPhase: "idle",
                transcriptComplete: true,
                loadingMore: false,
                queuedMessages: [],
                requestSubmissions: new Map(),
                requestSelections: new Map(),
                tasks: [],
                subagents: [],
                backgroundProcesses: [],
                detachedBackgroundProcessIds: new Set(),
                showReasoning: false,
                expandedTurnIds: new Set(),
                expandedMessageIds: new Set(),
                usageLoading: false,
                activityPanelOpen: false,
                modelLocked: false,
                failureSwitchSupported: false,
            },
        },
        address: { groupId: "prj_one", conversationId: SESSION },
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
        taskCreate: { composer: composerSourceOf(taskComposer) },
    };
    const store = {
        get: () => snapshot,
        deviceBridgeSupport: () => undefined,
        conversationsRetained: HAPPY_AGENT_RETAINED_CONVERSATIONS_NONE,
        panel: {
            get: () => PANEL_CLOSED,
            subscribe: () => () => undefined,
            [Symbol.dispose]: () => undefined,
        } as unknown as HappyAgentPanelStore,
        subscribe: () => () => undefined,
        bugReportCreateOpen: () => calls.push("bugReportCreateOpen"),
        taskCreateMessageUpdate: (text: string) => taskComposer.getState().textUpdate(text),
        [Symbol.dispose]: () => undefined,
    };
    const proxy = new Proxy(store, {
        get: (target, property) =>
            property in target ? target[property as keyof typeof target] : () => undefined,
    }) as unknown as HappyAgentWorkspaceStore;
    return { proxy, calls, draft: () => taskComposer.getState().text };
}

function view() {
    const space = workspace();
    const opened: string[] = [];
    const snapshot: AppHappyAgentDirectorySnapshot = {
        happyAgents: [
            {
                bots: [],
                version: "0.4.87",
                id: "connection:cloud",
                label: "Happy Cloud",
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
                    workspace: space.proxy,
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
    const rendered = render(
        <AppHappyAgentView
            appearance={appearanceStoreCreate({ mode: "light" })}
            bugReportHost={{ desktopVersion: "2026.11.3", os: "macOS 15.6.0" }}
            onBugReportCreateOpen={(id) => opened.push(id)}
            onChatSelect={() => undefined}
            onFileClose={() => undefined}
            onFileSelect={() => undefined}
            onSettingsOpen={() => undefined}
            happyAgentId="connection:cloud"
            groupId="prj_one"
            chatId={SESSION}
            happyAgents={directory}
        />,
    );
    onTestFinished(() => rendered.unmount());
    return { rendered, opened, ...space };
}

it("reports a message that failed to display with the bug report prefilled", () => {
    const { rendered, opened, calls, draft } = view();
    expect(rendered.getByText("Hey, this message failed to display.")).toBeTruthy();

    fireEvent.click(rendered.getByRole("button", { name: "Report bug" }));
    expect(calls).toEqual(["bugReportCreateOpen"]);
    expect(opened).toEqual(["connection:cloud"]);
    expect(draft()).toContain("A message failed to display.");
    expect(draft()).toContain("Server: Happy Cloud");
    expect(draft()).toContain(`Session: ${SESSION}`);
    expect(draft()).toContain("Message: msgclustercancelled000001");
    for (const error of ERRORS) expect(draft()).toContain(`- ${error}`);
    expect(draft()).toContain(`Started from: happy://agents/${SESSION}`);
});
