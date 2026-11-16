import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { expect, it } from "vitest";
import {
    happyAgentWorkspaceStoreCreate,
    type ConversationEntry,
    type HappyAgentChatSnapshot,
    type HappyAgentChatStore,
    type HappyAgentGroupId,
    type HappyAgentSessionId,
    type HappyAgentSessionListSnapshot,
    type HappyAgentWorkspaceClient,
} from "happy-desktop-state";
import "./styles.css";
import { ConversationView } from "./ConversationView";
import { RetainedViews } from "./RetainedViews";
import type { MessageListScrollPosition } from "./Message";
import { createRenderer } from "./testing";
import { regressionFrames } from "./testing/conversationRegressionHarness";
import { messageListEndOffset } from "./testing/messageListEnd";

const sessionId = (id: string) => id as HappyAgentSessionId;
const group = "disclosure-project" as HappyAgentGroupId;
const entries: ConversationEntry[] = [
    ...Array.from(
        { length: 40 },
        (_, index): ConversationEntry => ({
            kind: "notice",
            id: `history:${index}`,
            sequence: String(index),
            variant: "notice",
            level: "info",
            text: `History ${index}. A completed message stays where the reader left it.`,
        }),
    ),
    {
        kind: "agentActivity",
        id: "shell",
        sequence: "shell",
        activity: {
            kind: "shell",
            command: "cat build.log",
            output: "Build passed\n".repeat(6),
            exitCode: 0,
            running: false,
            timedOut: false,
        },
    },
];

// Only the client transport is inert; retention and scroll positions belong to
// the real workspace store, including its synchronous cached stand-in path.
function inert(): unknown {
    return new Proxy(() => undefined, {
        get: (_target, property) => (property === "then" ? undefined : inert()),
        apply: () => undefined,
    });
}
function workspaceCreate(cached: boolean) {
    const loading = { type: "loading" } as const;
    const list = {
        projects: {
            type: "ready",
            value: [
                {
                    id: group,
                    path: "/work/disclosure",
                    displayPath: "~/disclosure",
                    name: "disclosure",
                    orderKey: "a",
                    kind: "regular",
                    lifecycle: { phase: "ready" },
                    worktrees: [],
                    activity: "idle",
                    updatedAt: 1,
                    conversations: ["a", "b"].map((id) => ({
                        id,
                        title: id,
                        subtitle: "~/disclosure",
                        updatedAt: 1,
                        activity: "idle",
                        participants: [],
                    })),
                },
            ],
        },
        bots: [],
        botsCreating: [],
        archivedSessions: [],
        catalogRevision: 1,
        sessionCreateFailures: new Map(),
        worktreeCreateFailures: new Map(),
        projectCreateFailures: new Map(),
        subtaskFailures: new Map(),
        tasks: [],
        taskDirectory: [],
        tasksArchived: [],
        tasksJoining: new Set(),
        taskFailures: new Map(),
    } as unknown as HappyAgentSessionListSnapshot;
    const chats = new Map(
        ["a", "b"].map((id) => {
            const snapshot = {
                sessionId: id,
                ready: true,
                session: loading,
                entries: id === "a" ? entries : entries.slice(0, 2),
                slashCommands: [],
                runStatus: "idle",
                workingPhase: "working",
                transcriptComplete: true,
                loadingMore: false,
                queuedMessages: [],
                requestSubmissions: [],
                requestSelections: new Map(),
                tasks: [],
                subagents: [],
                backgroundProcesses: [],
                detachedBackgroundProcessIds: new Set(),
                showReasoning: false,
                expandedTurnIds: new Set(),
                usageLoading: false,
                activityPanelOpen: false,
                modelLocked: false,
            } as unknown as HappyAgentChatSnapshot;
            const store = new Proxy(
                { get: () => snapshot, subscribe: () => () => undefined },
                {
                    get: (target, property) =>
                        property in target ? target[property as keyof typeof target] : inert(),
                },
            ) as unknown as HappyAgentChatStore;
            return [id, store] as const;
        }),
    );
    const client = new Proxy(
        {
            models: {
                get: () => loading,
                load: () => new Promise(() => undefined),
                subscribe: () => () => undefined,
            },
            sessionList: () =>
                new Proxy(
                    { get: () => list, subscribe: () => () => undefined },
                    {
                        get: (target, property) =>
                            property in target ? target[property as keyof typeof target] : inert(),
                    },
                ),
            chat: async (id: string) => ({ store: chats.get(id)!, [Symbol.dispose]() {} }),
            openInTargetsRead: () => new Promise(() => undefined),
            workspaceFilesSubscribe: () => () => undefined,
        },
        {
            get: (target, property) =>
                property in target ? target[property as keyof typeof target] : inert(),
        },
    ) as unknown as HappyAgentWorkspaceClient;
    return happyAgentWorkspaceStoreCreate(client, {
        conversationRetention: { count: cached ? 2 : 0, size: 100_000 },
    });
}

it.each([false, true])(
    "restores a disclosure parked immediately before switching (cached=%s)",
    async (cached) => {
        const workspace = workspaceCreate(cached);
        const view = createRenderer();
        const contents = new Map<string, React.ReactNode>();
        const reports: MessageListScrollPosition[] = [];
        const release = workspace.subscribe(() => undefined);
        const open = (id: string) =>
            flushSync(() => workspace.conversationOpen(sessionId(id), group));
        function Harness() {
            const snapshot = useSyncExternalStore(workspace.subscribe, workspace.get);
            const kept = useSyncExternalStore(
                workspace.conversationsRetained.subscribe,
                workspace.conversationsRetained.get,
            );
            const current =
                snapshot.conversation.type === "ready" ? snapshot.conversation.value : undefined;
            if (current)
                contents.set(
                    current.conversationId,
                    <ConversationView
                        conversationId={current.conversationId}
                        entries={current.entries}
                        motion="calm"
                        scrollPosition={current.scrollPosition}
                        onScrollPositionChange={(position) => {
                            if (current.conversationId === "a") reports.push(position);
                            workspace.conversationScrollUpdate(current.conversationId, position);
                        }}
                    />,
                );
            const ids = new Set([
                ...kept.conversationIds,
                ...(current ? [current.conversationId] : []),
            ]);
            return (
                <div style={{ display: "flex", height: 600, width: 820 }}>
                    <RetainedViews
                        activeId={current?.conversationId}
                        views={[...ids].map((id) => ({ id, content: contents.get(id) }))}
                        onViewHide={(id, size) =>
                            workspace.conversationViewSizeUpdate(sessionId(id), size)
                        }
                    />
                </div>
            );
        }
        view.render(Harness, { height: 1000, width: 1000 });
        try {
            open("a");
            await view.ready();
            await regressionFrames();
            const viewport = () =>
                view.container.querySelector<HTMLElement>(
                    '[data-view-id="a"] .happy-message-list__viewport',
                )!;
            const button = () =>
                viewport().querySelector<HTMLButtonElement>("button[aria-expanded]")!;
            expect(button().getAttribute("aria-expanded")).toBe("true");
            const top = button().getBoundingClientRect().top;
            expect(top).toBeGreaterThanOrEqual(viewport().getBoundingClientRect().top);
            const original = viewport();
            // No frame or native scroll report may intervene between these gestures.
            flushSync(() => button().click());
            // The fold shortened the end of the transcript. Nothing blank is
            // held under it to keep the control where it was pressed: the
            // transcript comes down to its real end, and that is the place
            // the reader left.
            expect(messageListEndOffset(viewport())).toBeLessThanOrEqual(1);
            const parked = button().getBoundingClientRect().top;
            open("b");
            expect(
                reports.at(-1)?.type,
                "hiding reports the parked point before another scroll",
            ).toBe("row");
            await regressionFrames();
            open("a");
            await regressionFrames();
            expect(viewport() === original).toBe(cached);
            expect(button()).toBeDefined();
            expect(Math.abs(button().getBoundingClientRect().top - parked)).toBeLessThanOrEqual(1);
            expect(messageListEndOffset(viewport())).toBeLessThanOrEqual(1);
            expect(workspace.get().conversation.type).toBe("ready");
        } finally {
            view.destroy();
            release();
            workspace[Symbol.dispose]();
        }
    },
);
