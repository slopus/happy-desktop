import { expect, it } from "vitest";
import type { HappyAgentWorkspaceClient } from "./happyAgentClient.js";
import type { HappyAgentSessionListSnapshot } from "./happyAgentSessionListStore.js";
import type {
    HappyAgentBot,
    HappyAgentBotId,
    HappyAgentGroupId,
    HappyAgentSessionId,
    HappyAgentWorktreeId,
} from "./happyAgentTypes.js";
import {
    happyAgentWorkspaceStoreCreate,
    type HappyAgentWorkspaceOutput,
} from "./happyAgentWorkspaceStore.js";

/**
 * Archiving a bot subtask keeps its workspace, so the group-removal report
 * never moves a reader off it. The workspace reports every subtask the host's
 * tree stops listing — archived here, in another window, or by its parent —
 * and names the nearest listed conversation above a reader who stood in one.
 */

const conversation = (id: string) => ({
    id,
    title: id,
    subtitle: "~/Bots/builder",
    updatedAt: 1_763_999_000_000,
    activity: "idle" as const,
    participants: [],
});

const task = (id: string, workspaceId: string, subtasks: HappyAgentBot["subtasks"] = []) => ({
    workspaceId: workspaceId as HappyAgentWorktreeId,
    path: `/work/${workspaceId}`,
    conversation: conversation(id),
    subtasks,
});

const BOT = (subtasks: HappyAgentBot["subtasks"]): HappyAgentBot => ({
    id: "bot_builder" as HappyAgentBotId,
    workspaceId: "ws_builder" as HappyAgentWorktreeId,
    conversation: conversation("ses_builder"),
    name: "Builder",
    username: "builder",
    orderKey: "a",
    path: "/work/ws_builder",
    displayPath: "~/Bots/builder",
    subtasks,
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
                        subscribe: (listener: () => void) => {
                            listeners.add(listener);
                            return () => listeners.delete(listener);
                        },
                        subtaskArchive: () => Promise.resolve(),
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
        outputs,
        unsubscribe,
        hostAnswers(next: Partial<HappyAgentSessionListSnapshot>) {
            list = { ...list, ...next, catalogRevision: list.catalogRevision + 1 };
            for (const listener of listeners) listener();
        },
    };
}

const removals = (outputs: readonly HappyAgentWorkspaceOutput[]) =>
    outputs.flatMap((event) => (event.type === "subtasksRemoved" ? [event] : []));

it("reports an archived subtask and its descendants, sending a reader inside to the nearest listed parent", () => {
    const before = [BOT([task("ses_task", "wt_task", [task("ses_child", "ws_builder")])])];
    const { workspace, outputs, unsubscribe, hostAnswers } = store(before);
    workspace.conversationOpen(
        "ses_child" as HappyAgentSessionId,
        "ws_builder" as HappyAgentGroupId,
    );

    // Nothing is reported while the host still lists the task.
    hostAnswers({ bots: before });
    expect(removals(outputs)).toEqual([]);

    // The host drops it — archived here or anywhere else; the report is the same.
    hostAnswers({ bots: [BOT([])] });
    expect(removals(outputs)).toEqual([
        {
            type: "subtasksRemoved",
            removed: [
                { groupId: "wt_task", sessionId: "ses_task" },
                { groupId: "ws_builder", sessionId: "ses_child" },
            ],
            open: { groupId: "ws_builder", sessionId: "ses_builder" },
        },
    ]);
    unsubscribe();
});

it("sends a reader in a descendant to the surviving parent task, and leaves a reader elsewhere", () => {
    const before = [
        BOT([
            task("ses_task", "wt_task", [task("ses_child", "wt_task")]),
            task("ses_other", "wt_other"),
        ]),
    ];
    const inside = store(before);
    inside.workspace.conversationOpen(
        "ses_child" as HappyAgentSessionId,
        "wt_task" as HappyAgentGroupId,
    );
    inside.hostAnswers({
        bots: [BOT([task("ses_task", "wt_task"), task("ses_other", "wt_other")])],
    });
    expect(removals(inside.outputs)).toEqual([
        {
            type: "subtasksRemoved",
            removed: [{ groupId: "wt_task", sessionId: "ses_child" }],
            open: { groupId: "wt_task", sessionId: "ses_task" },
        },
    ]);
    inside.unsubscribe();

    const elsewhere = store(before);
    elsewhere.workspace.conversationOpen(
        "ses_other" as HappyAgentSessionId,
        "wt_other" as HappyAgentGroupId,
    );
    elsewhere.hostAnswers({ bots: [BOT([task("ses_other", "wt_other")])] });
    expect(removals(elsewhere.outputs).map((event) => event.open)).toEqual([undefined]);
    elsewhere.unsubscribe();
});
