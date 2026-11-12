import { expect, it } from "vitest";
import type { HappyAgentWorkspaceClient } from "./happyAgentClient.js";
import type { HappyAgentSessionListSnapshot } from "./happyAgentSessionListStore.js";
import type {
    HappyAgentBot,
    HappyAgentBotId,
    HappyAgentGroupId,
    HappyAgentSessionId,
    HappyAgentTask,
    HappyAgentTaskId,
    HappyAgentWorktreeId,
} from "./happyAgentTypes.js";
import {
    happyAgentWorkspaceStoreCreate,
    type HappyAgentWorkspaceOutput,
} from "./happyAgentWorkspaceStore.js";

/**
 * Every group the host stops listing is reported, whether or not the reader is
 * in it, so the window can take it out of its navigation: closing something
 * later must not land on a place that was archived while the reader was
 * elsewhere. A group the host never listed is still arriving and is never
 * reported gone.
 */

const bot = (name: string): HappyAgentBot => ({
    id: `bot_${name}` as HappyAgentBotId,
    workspaceId: `ws_${name}` as HappyAgentWorktreeId,
    conversation: {
        id: `ses_${name}`,
        title: name,
        subtitle: `~/Bots/${name}`,
        updatedAt: 1_763_999_000_000,
        activity: "idle" as const,
        participants: [],
    },
    name,
    username: name,
    orderKey: "a",
    path: `/work/ws_${name}`,
    displayPath: `~/Bots/${name}`,
    subtasks: [],
});

const task = (name: string, archived = false): HappyAgentTask => ({
    id: `task_${name}` as HappyAgentTaskId,
    workspaceId: `ws_${name}` as HappyAgentWorktreeId,
    name,
    conversation: {
        id: `ses_${name}`,
        title: name,
        subtitle: `~/Tasks/${name}`,
        updatedAt: 1_763_999_000_000,
        activity: "idle" as const,
        participants: [],
    },
    subtasks: [],
    owner: null,
    path: `/work/ws_${name}`,
    displayPath: `~/Tasks/${name}`,
    createdAt: 1_763_999_000_000,
    archived,
    canArchive: true,
    ...(archived ? {} : { membership: { orderKey: "a" } }),
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

function store(bots: readonly HappyAgentBot[]) {
    let list = {
        projects: { type: "ready", value: [] },
        bots,
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
    const listeners = new Set<() => void>();
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
                        taskArchive: () => Promise.resolve(true),
                        subscribe: (listener: () => void) => {
                            listeners.add(listener);
                            return () => listeners.delete(listener);
                        },
                    },
                    {
                        get: (target, property) =>
                            property in target ? target[property as keyof typeof target] : inert(),
                    },
                ),
            chat: () => new Promise(() => undefined),
            openInTargetsRead: () => new Promise(() => undefined),
            workspaceFilesSubscribe: () => () => undefined,
        } as Record<PropertyKey, unknown>,
        { get: (target, property) => (property in target ? target[property] : inert()) },
    ) as unknown as HappyAgentWorkspaceClient;
    const outputs: HappyAgentWorkspaceOutput[] = [];
    const workspace = happyAgentWorkspaceStoreCreate(client, {
        output: (event) => outputs.push(event),
    });
    const unsubscribe = workspace.subscribe(() => undefined);
    return {
        workspace,
        unsubscribe,
        removed: () => outputs.flatMap((event) => (event.type === "groupRemoved" ? [event] : [])),
        listed: () =>
            outputs.flatMap((event) => (event.type === "groupsListed" ? [event.groupIds] : [])),
        hostAnswers(next: Partial<HappyAgentSessionListSnapshot>) {
            list = { ...list, ...next, catalogRevision: list.catalogRevision + 1 };
            for (const listener of listeners) listener();
        },
    };
}

it("reports a group archived while the reader is in another one, and leaves the reader's own alone", () => {
    const { workspace, unsubscribe, removed, hostAnswers } = store([bot("a"), bot("b")]);
    workspace.conversationOpen("ses_a" as HappyAgentSessionId, "ws_a" as HappyAgentGroupId);
    hostAnswers({ bots: [bot("a"), bot("b")] });
    expect(removed()).toEqual([]);

    hostAnswers({ bots: [bot("a")] });
    expect(removed()).toEqual([{ type: "groupRemoved", groupId: "ws_b" }]);

    // Reported once: a later read of the same absence says nothing new.
    hostAnswers({ bots: [bot("a")] });
    expect(removed()).toHaveLength(1);
    unsubscribe();
});

it("reports the group the reader is in when it goes", () => {
    const { workspace, unsubscribe, removed, hostAnswers } = store([bot("a"), bot("b")]);
    workspace.conversationOpen("ses_b" as HappyAgentSessionId, "ws_b" as HappyAgentGroupId);
    hostAnswers({ bots: [bot("a"), bot("b")] });

    hostAnswers({ bots: [bot("a")] });
    expect(removed()).toEqual([{ type: "groupRemoved", groupId: "ws_b" }]);
    unsubscribe();
});

it("keeps a task archived elsewhere open and readable where the reader is", () => {
    const { workspace, unsubscribe, removed, hostAnswers } = store([bot("a")]);
    workspace.conversationOpen("ses_t" as HappyAgentSessionId, "ws_t" as HappyAgentGroupId);
    hostAnswers({ tasks: [task("t")] });

    // Another agent archives it: the row leaves the reader's list, and the
    // task is still listed as archived.
    hostAnswers({ tasks: [], tasksArchived: [task("t", true)] });
    expect(removed()).toEqual([]);
    expect(workspace.get().address).toMatchObject({ groupId: "ws_t", conversationId: "ses_t" });
    unsubscribe();
});

it("closes a task the reader archived from this window", () => {
    const { workspace, unsubscribe, removed, hostAnswers } = store([bot("a")]);
    workspace.conversationOpen("ses_t" as HappyAgentSessionId, "ws_t" as HappyAgentGroupId);
    hostAnswers({ tasks: [task("t")] });

    void workspace.taskArchive("task_t" as HappyAgentTaskId);
    hostAnswers({ tasks: [], tasksArchived: [task("t", true)] });
    expect(removed()).toEqual([{ type: "groupRemoved", groupId: "ws_t" }]);
    unsubscribe();
});

it("never reports a group the host has not listed yet", () => {
    const { workspace, unsubscribe, removed, hostAnswers } = store([bot("a")]);
    // Addressed before any read lists it — new work still arriving.
    workspace.conversationOpen("ses_new" as HappyAgentSessionId, "ws_new" as HappyAgentGroupId);
    hostAnswers({ bots: [bot("a")] });
    hostAnswers({ bots: [bot("a")] });

    expect(removed()).toEqual([]);
    unsubscribe();
});

it("lists every group the first read names, once, for a window to drop what went while it was closed", () => {
    const { unsubscribe, listed, hostAnswers } = store([bot("a"), bot("b")]);
    hostAnswers({ bots: [bot("a"), bot("b")] });
    hostAnswers({ bots: [bot("a")] });

    expect(listed().map((ids) => [...ids].sort())).toEqual([["ws_a", "ws_b"]]);
    unsubscribe();
});
