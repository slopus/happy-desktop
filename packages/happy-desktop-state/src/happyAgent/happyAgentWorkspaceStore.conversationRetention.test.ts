import { expect, it, vi } from "vitest";
import { entryKey, type ConversationEntry } from "../conversation/conversationEntry.js";
import { connectHappyAgent } from "../happyAgentConnection/connectHappyAgent.js";
import {
    fakeHappyAgentDaemonCreate,
    fakeRun,
    fakeUserMessage,
} from "../testing/fakeHappyAgentDaemon.js";
import {
    happyAgentChatStoreCreate,
    type HappyAgentChatSnapshot,
    type HappyAgentChatStore,
} from "./happyAgentChatStore.js";
import type { HappyAgentChatHandle, HappyAgentWorkspaceClient } from "./happyAgentClient.js";
import { happyAgentModelCatalogProject } from "./happyAgentProject.js";
import {
    happyAgentConversationRetentionFor,
    type HappyAgentConversationRetention,
} from "./happyAgentConversationRetention.js";
import type { HappyAgentSessionListSnapshot } from "./happyAgentSessionListStore.js";
import type {
    HappyAgentGroupId,
    HappyAgentProjectId,
    HappyAgentSessionId,
} from "./happyAgentTypes.js";
import { happyAgentWorkspaceStoreCreate } from "./happyAgentWorkspaceStore.js";

/**
 * Leaving a conversation keeps it, so a window can keep its view mounted and
 * show it again at once. The workspace keeps the ones left most recently while
 * they fit the count and the size its host gave it, lets the rest go oldest
 * first, and drops any the list stops listing. A kept conversation holds no
 * lease and follows nothing while it is out of sight.
 */

const PROJECT = "prj_retention" as HappyAgentProjectId;
const GROUP = PROJECT as unknown as HappyAgentGroupId;

const summary = (id: string) => ({
    id,
    title: id,
    subtitle: "~/retention",
    updatedAt: 1_763_999_000_000,
    activity: "idle" as const,
    participants: [],
});

function inert(): unknown {
    return new Proxy(() => undefined, {
        get: (_target, property) =>
            property === "then"
                ? undefined
                : property === Symbol.iterator
                  ? function* () {}
                  : inert(),
        apply: () => undefined,
    });
}

function entry(id: string): ConversationEntry {
    return { kind: "notice", id, level: "info", sequence: id, text: id, variant: "notice" };
}

/** One session's chat store as the client would lease it, recording its leases. */
function chatCreate(sessionId: string) {
    let snapshot = {
        sessionId,
        ready: true,
        session: { type: "loading" },
        entries: [entry(`${sessionId}:1`)],
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
    const listeners = new Set<() => void>();
    const store = new Proxy(
        {
            get: () => snapshot,
            subscribe(listener: () => void) {
                listeners.add(listener);
                return () => listeners.delete(listener);
            },
        } as Record<PropertyKey, unknown>,
        { get: (target, property) => (property in target ? target[property] : inert()) },
    ) as unknown as HappyAgentChatStore;
    const chat = {
        leases: 0,
        listeners,
        store,
        stream(text: string) {
            snapshot = { ...snapshot, entries: [...snapshot.entries, entry(text)] };
            for (const listener of listeners) listener();
        },
        /** The stored draft moving, as it does once per keystroke. */
        draft(text: string, updatedAt: number) {
            snapshot = { ...snapshot, draft: text, draftUpdatedAt: updatedAt };
            for (const listener of listeners) listener();
        },
    };
    return chat;
}

function workspaceCreate(retention?: HappyAgentConversationRetention, ids = "abcdef") {
    let list = {
        projects: {
            type: "ready",
            value: [
                {
                    id: PROJECT,
                    path: "/work/retention",
                    displayPath: "~/retention",
                    name: "retention",
                    orderKey: "a",
                    kind: "regular",
                    lifecycle: { phase: "ready" },
                    worktrees: [],
                    activity: "idle",
                    updatedAt: 1,
                    conversations: [...ids].map(summary),
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
    const listListeners = new Set<() => void>();
    const chats = new Map([...ids].map((id) => [id, chatCreate(id)]));
    const reads: string[] = [];
    /** Reads held back until `arrive`, while `holding` is set. */
    const held: (() => void)[] = [];
    let holding = false;
    const loading = { type: "loading" } as const;
    const client = new Proxy(
        {
            models: {
                get: () => loading,
                load: () => new Promise(() => undefined),
                subscribe: () => () => undefined,
            },
            sessionList: () =>
                new Proxy(
                    {
                        get: () => list,
                        subscribe: (listener: () => void) => {
                            listListeners.add(listener);
                            return () => listListeners.delete(listener);
                        },
                    },
                    {
                        get: (target, property) =>
                            property in target ? target[property as keyof typeof target] : inert(),
                    },
                ),
            chat: (sessionId: string): Promise<HappyAgentChatHandle> => {
                reads.push(sessionId);
                const chat = chats.get(sessionId)!;
                chat.leases += 1;
                let released = false;
                const handle: HappyAgentChatHandle = {
                    store: chat.store,
                    [Symbol.dispose]() {
                        if (released) return;
                        released = true;
                        chat.leases -= 1;
                    },
                };
                if (!holding) return Promise.resolve(handle);
                return new Promise((resolve) => held.push(() => resolve(handle)));
            },
            openInTargetsRead: () => new Promise(() => undefined),
            workspaceFilesSubscribe: () => () => undefined,
        } as Record<PropertyKey, unknown>,
        { get: (target, property) => (property in target ? target[property] : inert()) },
    ) as unknown as HappyAgentWorkspaceClient;
    const workspace = happyAgentWorkspaceStoreCreate(
        client,
        retention === undefined ? {} : { conversationRetention: retention },
    );
    const unsubscribe = workspace.subscribe(() => undefined);
    return {
        workspace,
        chats,
        reads,
        unsubscribe,
        /** Opens one conversation and lets its lease arrive. */
        async open(id: string) {
            workspace.conversationOpen(id as HappyAgentSessionId, GROUP);
            await Promise.resolve();
            await Promise.resolve();
        },
        hold() {
            holding = true;
        },
        /** Lets the reads held back arrive. */
        async arrive() {
            holding = false;
            for (const resolve of held.splice(0)) resolve();
            await Promise.resolve();
            await Promise.resolve();
        },
        kept: () => workspace.conversationsRetained.get().conversationIds,
        leased: () => [...chats].filter(([, chat]) => chat.leases > 0).map(([id]) => id),
        hostLists(remaining: string) {
            const projects = list.projects as unknown as { value: readonly object[] };
            list = {
                ...list,
                projects: {
                    type: "ready",
                    value: [{ ...projects.value[0]!, conversations: [...remaining].map(summary) }],
                },
                catalogRevision: list.catalogRevision + 1,
            } as unknown as HappyAgentSessionListSnapshot;
            for (const listener of listListeners) listener();
        },
    };
}

it("keeps the conversations just left, newest first, and lets the oldest go past the count", async () => {
    const view = workspaceCreate({ count: 2, size: 1_000 });
    for (const id of "abcd") await view.open(id);

    expect(view.kept()).toEqual(["c", "b"]);
    // Only the one on screen holds a lease: kept ones are read again when opened.
    expect(view.leased()).toEqual(["d"]);
    view.unsubscribe();
});

it("shows a kept conversation as it was left until it is read again", async () => {
    const view = workspaceCreate({ count: 3, size: 1_000 });
    for (const id of "abc") await view.open(id);
    // It went on while out of sight; the connection has the rest.
    view.chats.get("a")!.stream("a:2");
    view.hold();

    view.workspace.conversationOpen("a" as HappyAgentSessionId, GROUP);

    // Its transcript is there in the same call, never an empty one in between.
    const shown = view.workspace.get().conversation;
    expect(shown.type === "ready" && shown.value.conversationId).toBe("a");
    expect(shown.type === "ready" && shown.value.entries.map(entryKey)).toEqual(["a:1"]);
    // Opening it takes it out of the kept ones, and what was open is kept instead.
    expect(view.kept()).toEqual(["c", "b"]);

    await view.arrive();

    const read = view.workspace.get().conversation;
    expect(view.reads.filter((id) => id === "a")).toHaveLength(2);
    expect(read.type === "ready" && read.value.entries.map(entryKey)).toEqual(["a:1", "a:2"]);
    expect(view.leased()).toEqual(["a"]);
    view.unsubscribe();
});

it("shows a message sent during a stand-in once its transcript arrives", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    const project = daemon.projectSeed({ id: PROJECT });
    daemon.agentSeed(project.id, { id: "a" });
    daemon.historySet("a", [
        fakeRun({
            id: "earlier-run",
            messages: [
                fakeUserMessage({
                    id: "earlier-message",
                    status: "accepted",
                    content: [{ type: "text", text: "Earlier message" }],
                }),
            ],
        }),
    ]);
    const connection = connectHappyAgent({
        endpoint: "http://happy-agent.test/",
        token: "token",
        client: daemon.client,
        wait: () => new Promise((resolve) => setTimeout(resolve, 0)),
    });
    connection.connectGroups({ onChange: () => undefined, onError: () => undefined });
    const chat = happyAgentChatStoreCreate("a" as HappyAgentSessionId, {
        catalog: happyAgentModelCatalogProject(daemon.configGet()),
        transcriptConnect: (options) => {
            const session = connection.connectSession({
                sessionId: options.sessionId,
                onChange: (elements, state) => options.onChange(elements, state, []),
                onError: options.onError,
            });
            return { close: () => session.close(), loadMore: (token) => session.loadMore(token) };
        },
        connectActions: connection,
        connectMutationSubscribe: () => () => undefined,
    });
    const view = workspaceCreate({ count: 2, size: 1_000 });
    view.chats.get("a")!.store = chat;
    try {
        await view.open("a");
        await vi.waitFor(() => expect(chat.get().ready).toBe(true));
        await view.open("b");
        view.hold();
        await view.open("a");
        const standIn = view.workspace.get().conversation;
        expect(standIn.type === "ready" && standIn.value.standIn).toBe(true);
        view.workspace.composerTextUpdate("a", "Sent while reopening");
        view.workspace.composerTextSubmit();
        await view.arrive();
        await vi.waitFor(() => {
            const shown = view.workspace.get().conversation;
            expect(shown.type).toBe("ready");
            if (shown.type !== "ready") return;
            expect(shown.value.standIn).toBeUndefined();
            expect(
                shown.value.entries.flatMap((item) =>
                    item.kind === "message" ? [item.message.text] : [],
                ),
            ).toEqual(["Earlier message", "Sent while reopening"]);
        });
    } finally {
        view.unsubscribe();
        chat[Symbol.dispose]();
        connection.close();
    }
});

it("shows the oldest kept conversation as it was left even when keeping the one left pushes it out", async () => {
    for (const [count, ids] of [
        [1, "ab"],
        [3, "abcd"],
    ] as const) {
        const view = workspaceCreate({ count, size: 1_000 });
        for (const id of ids) await view.open(id);
        expect(view.kept().at(-1)).toBe("a");
        view.hold();

        view.workspace.conversationOpen("a" as HappyAgentSessionId, GROUP);

        const shown = view.workspace.get().conversation;
        expect(shown.type === "ready" && shown.value.conversationId).toBe("a");
        expect(shown.type === "ready" && shown.value.ready).toBe(true);
        expect(shown.type === "ready" && shown.value.entries.map(entryKey)).toEqual(["a:1"]);
        expect(view.kept()).toEqual([...ids.slice(1)].reverse());
        await view.arrive();
        view.unsubscribe();
    }
});

it("restores the latest parked position in a cached stand-in without an intervening chat update", async () => {
    const view = workspaceCreate({ count: 2, size: 1_000 });
    await view.open("a");
    const position = {
        type: "row" as const,
        rowKey: "a:1",
        offset: 240,
        viewportInset: 52,
        viewportHeight: 650,
    };
    view.workspace.conversationScrollUpdate("a" as HappyAgentSessionId, {
        ...position,
        viewportHeight: 360,
    });
    view.workspace.conversationScrollUpdate("a" as HappyAgentSessionId, position);
    await view.open("b");
    view.hold();
    await view.open("a");
    const shown = view.workspace.get().conversation;
    expect(shown.type === "ready" && shown.value.standIn).toBe(true);
    expect(shown.type === "ready" && shown.value.scrollPosition).toEqual(position);
    await view.arrive();
    view.unsubscribe();
});

it("does nothing while a kept conversation streams out of sight", async () => {
    const view = workspaceCreate({ count: 2, size: 1_000 });
    await view.open("a");
    await view.open("b");
    const kept = view.workspace.conversationsRetained.get();
    const shown = view.workspace.get();
    let notified = 0;
    const stop = view.workspace.conversationsRetained.subscribe(() => (notified += 1));
    const stopWorkspace = view.workspace.subscribe(() => (notified += 1));

    view.chats.get("a")!.stream("a:2");

    expect(view.chats.get("a")!.listeners.size).toBe(0);
    expect(notified).toBe(0);
    expect(view.workspace.conversationsRetained.get()).toBe(kept);
    expect(view.workspace.get()).toBe(shown);
    stop();
    stopWorkspace();
    view.unsubscribe();
});

it("lets the least recently left views go once the kept ones no longer fit their size", async () => {
    const view = workspaceCreate({ count: 4, size: 100 });
    for (const id of "abcde") await view.open(id);
    expect(view.kept()).toEqual(["d", "c", "b", "a"]);

    view.workspace.conversationViewSizeUpdate("d" as HappyAgentSessionId, 60);
    view.workspace.conversationViewSizeUpdate("c" as HappyAgentSessionId, 30);
    expect(view.kept()).toEqual(["d", "c", "b", "a"]);

    // Ten more than fits: the oldest go until the rest fit, whatever their own size.
    view.workspace.conversationViewSizeUpdate("b" as HappyAgentSessionId, 20);
    expect(view.kept()).toEqual(["d", "c"]);

    // A view measured while it is on screen counts once it is left.
    view.workspace.conversationViewSizeUpdate("e" as HappyAgentSessionId, 90);
    await view.open("f");
    expect(view.kept()).toEqual(["e"]);
    view.unsubscribe();
});

it("lets go of a kept conversation the list stops listing", async () => {
    const view = workspaceCreate({ count: 3, size: 1_000 });
    for (const id of "abc") await view.open(id);

    view.hostLists("bc");

    expect(view.kept()).toEqual(["b"]);
    view.unsubscribe();
});

it("keeps nothing without a retention, and nothing once nobody is looking", async () => {
    const none = workspaceCreate();
    for (const id of "abc") await none.open(id);
    expect(none.kept()).toEqual([]);
    expect(none.leased()).toEqual(["c"]);
    none.unsubscribe();

    const view = workspaceCreate({ count: 3, size: 1_000 });
    for (const id of "abc") await view.open(id);
    view.unsubscribe();
    expect(view.kept()).toEqual([]);
    expect(view.leased()).toEqual([]);
});

it("affords one kept view per gigabyte, between one and seven, and a size to match", () => {
    expect(happyAgentConversationRetentionFor(8)).toEqual({ count: 7, size: 48_000 });
    expect(happyAgentConversationRetentionFor(4)).toEqual({ count: 3, size: 24_000 });
    expect(happyAgentConversationRetentionFor(2)).toEqual({ count: 1, size: 12_000 });
    expect(happyAgentConversationRetentionFor(0.5)).toEqual({ count: 1, size: 6_000 });
    // A device that does not say is treated as a modest one.
    expect(happyAgentConversationRetentionFor(undefined)).toEqual({ count: 3, size: 24_000 });
    // Chromium caps what it reports at 8; anything larger is still eight views.
    expect(happyAgentConversationRetentionFor(32)).toEqual({ count: 7, size: 48_000 });
});

it("publishes nothing for a draft keystroke after the transcript reports the same place again", async () => {
    const view = workspaceCreate({ count: 1, size: 1_000 });
    await view.open("a");
    const conversationId = "a" as HappyAgentSessionId;
    view.workspace.conversationScrollUpdate(conversationId, { type: "bottom" });
    view.workspace.conversationScrollUpdate(conversationId, {
        type: "row",
        rowKey: "a:1",
        offset: 12,
    });
    // The first chat change after that carries the recorded place once.
    view.chats.get("a")!.draft("", 1_999);
    const before = view.workspace.get();
    let notifications = 0;
    const unsubscribe = view.workspace.subscribe(() => {
        notifications += 1;
    });

    // A streaming transcript reports where it is on every frame, each time as
    // a new object, and the reader types between those frames.
    for (const [index, text] of ["h", "hi", "hi!"].entries()) {
        view.workspace.conversationScrollUpdate(conversationId, {
            type: "row",
            rowKey: "a:1",
            offset: 12,
        });
        view.chats.get("a")!.draft(text, 2_000 + index);
    }

    expect(notifications).toBe(0);
    expect(view.workspace.get()).toBe(before);
    unsubscribe();
    view.unsubscribe();
});
