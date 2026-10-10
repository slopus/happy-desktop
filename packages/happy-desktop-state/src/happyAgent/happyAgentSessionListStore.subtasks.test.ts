import { expect, it, vi } from "vitest";
import type { MutationRejectedDelta } from "../happyAgentConnection/types.js";
import {
    happyAgentSessionListStoreCreate,
    type HappyAgentSessionListDeps,
} from "./happyAgentSessionListStore.js";
import type {
    HappyAgentBot,
    HappyAgentBotId,
    HappyAgentSessionId,
    HappyAgentWorktreeId,
} from "./happyAgentTypes.js";

const conversation = (id: string, title: string) => ({
    id,
    title,
    subtitle: "~/Bots/builder",
    updatedAt: 1_763_999_000_000,
    activity: "idle" as const,
    participants: [],
});

const BOT: HappyAgentBot = {
    id: "bot_builder" as HappyAgentBotId,
    workspaceId: "ws_builder" as HappyAgentWorktreeId,
    conversation: conversation("ses_builder", "Builder"),
    name: "Builder",
    username: "builder",
    orderKey: "a",
    path: "/Users/happy/Bots/builder",
    displayPath: "~/Bots/builder",
    subtasks: [
        {
            workspaceId: "ws_builder" as HappyAgentWorktreeId,
            path: "/Users/happy/Bots/builder",
            conversation: conversation("ses_task", "Research the new API"),
            subtasks: [],
        },
    ],
};

function listCreate(
    setSessionArchived: (sessionId: string, archived: boolean) => string,
    rejections?: { emit?: (rejection: MutationRejectedDelta) => void },
) {
    const deps = {
        client: {},
        catalogSource: {
            read: () =>
                Promise.resolve({
                    catalog: { bots: [BOT], projects: [], tasks: [], worktrees: [] },
                    sessions: [],
                    archivedSessions: [],
                }),
            subscribe: () => () => undefined,
            [Symbol.dispose]: () => undefined,
        },
        connectActions: { setSessionArchived },
        connectMutationSubscribe: (listener: (rejection: MutationRejectedDelta) => void) => {
            if (rejections) rejections.emit = listener;
            return () => undefined;
        },
    } as unknown as HappyAgentSessionListDeps;
    return happyAgentSessionListStoreCreate(deps);
}

it("keeps the host's reason for a refused subtask archive until it is asked again", async () => {
    const rejections: { emit?: (rejection: MutationRejectedDelta) => void } = {};
    const list = listCreate(
        vi.fn(() => "mut_archive"),
        rejections,
    );
    const unsubscribe = list.subscribe(() => undefined);
    await vi.waitFor(() => expect(list.get().bots).toHaveLength(1));

    await list.subtaskArchive("ses_task" as HappyAgentSessionId);
    rejections.emit!({
        type: "mutation_rejected",
        action: "set_session_archived",
        message: "The host is busy.",
        mutationId: "mut_archive",
    });
    expect(list.get().subtaskFailures.get("ses_task" as HappyAgentSessionId)?.error.message).toBe(
        "The host is busy.",
    );

    await list.subtaskArchive("ses_task" as HappyAgentSessionId);
    expect(list.get().subtaskFailures.size).toBe(0);

    unsubscribe();
    list[Symbol.dispose]();
});

it("archives a bot subtask through the session archive mutation, leaving the tree to the host", async () => {
    const setSessionArchived = vi.fn(() => "mut_archive");
    const list = listCreate(setSessionArchived);
    const unsubscribe = list.subscribe(() => undefined);
    await vi.waitFor(() => expect(list.get().bots).toHaveLength(1));

    await list.subtaskArchive("ses_task" as HappyAgentSessionId);
    expect(setSessionArchived).toHaveBeenCalledWith("ses_task", true);
    // Not optimistic: the task stays in its bot until the host says otherwise.
    expect(list.get().bots[0]?.subtasks.map((task) => task.conversation.id)).toEqual(["ses_task"]);

    // A conversation that is not one of the bots' subtasks is not archived here.
    await list.subtaskArchive("ses_builder" as HappyAgentSessionId);
    expect(setSessionArchived).toHaveBeenCalledTimes(1);

    unsubscribe();
    list[Symbol.dispose]();
});

it("moves a bot subtask among its own siblings only, then asks the host to keep the order", async () => {
    let mutation = 0;
    const reorderSubtask = vi.fn(() => `mut_reorder_${String(++mutation)}`);
    const sibling = (id: string, children: HappyAgentBot["subtasks"] = []) => ({
        workspaceId: "ws_builder" as HappyAgentWorktreeId,
        path: "/Users/happy/Bots/builder",
        conversation: conversation(id, id),
        subtasks: children,
    });
    const bot: HappyAgentBot = {
        ...BOT,
        subtasks: [sibling("ses_a", [sibling("ses_a1"), sibling("ses_a2")]), sibling("ses_b")],
    };
    // What the host lists, and how to tell the list it changed.
    let hostBots: readonly HappyAgentBot[] = [bot];
    let catalogChanged = (): void => undefined;
    let rejected = (_rejection: MutationRejectedDelta): void => undefined;
    const deps = {
        client: {},
        catalogSource: {
            read: () =>
                Promise.resolve({
                    catalog: { bots: hostBots, projects: [], tasks: [], worktrees: [] },
                    sessions: [],
                    archivedSessions: [],
                }),
            subscribe: (listener: () => void) => {
                catalogChanged = listener;
                return () => undefined;
            },
            [Symbol.dispose]: () => undefined,
        },
        connectActions: { reorderSubtask },
        connectMutationSubscribe: (listener: (rejection: MutationRejectedDelta) => void) => {
            rejected = listener;
            return () => undefined;
        },
    } as unknown as HappyAgentSessionListDeps;
    const list = happyAgentSessionListStoreCreate(deps);
    const unsubscribe = list.subscribe(() => undefined);
    await vi.waitFor(() => expect(list.get().bots).toHaveLength(1));
    const order = () =>
        list
            .get()
            .bots[0]!.subtasks.map((task) => [
                task.conversation.id,
                task.subtasks.map((child) => child.conversation.id),
            ]);

    await list.subtaskReorder("ses_a2" as HappyAgentSessionId, null);
    expect(order()).toEqual([
        ["ses_a", ["ses_a2", "ses_a1"]],
        ["ses_b", []],
    ]);
    expect(reorderSubtask).toHaveBeenLastCalledWith("ses_a2", null);

    await list.subtaskReorder("ses_a" as HappyAgentSessionId, "ses_b" as HappyAgentSessionId);
    expect(order()).toEqual([
        ["ses_b", []],
        ["ses_a", ["ses_a2", "ses_a1"]],
    ]);

    // A task is never placed after a row that is not one of its siblings.
    await list.subtaskReorder("ses_a1" as HappyAgentSessionId, "ses_b" as HappyAgentSessionId);
    expect(order()).toEqual([
        ["ses_b", []],
        ["ses_a", ["ses_a2", "ses_a1"]],
    ]);
    expect(reorderSubtask).toHaveBeenCalledTimes(2);

    // A catalog published for something else while the moves are in flight
    // does not put the rows back under the hand that moved them.
    catalogChanged();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(order()).toEqual([
        ["ses_b", []],
        ["ses_a", ["ses_a2", "ses_a1"]],
    ]);

    // A refused move lets go of its order and says why; the host's stands.
    rejected({
        type: "mutation_rejected",
        action: "reorder_subtask",
        message: "Not a sibling.",
        mutationId: "mut_reorder_2",
    });
    await vi.waitFor(() =>
        expect(order()).toEqual([
            ["ses_a", ["ses_a2", "ses_a1"]],
            ["ses_b", []],
        ]),
    );
    const failure = list.get().subtaskFailures.get("ses_a" as HappyAgentSessionId);
    expect([failure?.action, failure?.error.message]).toEqual(["reorder", "Not a sibling."]);

    // Once the host lists the first move, its order is the host's own.
    hostBots = [
        {
            ...bot,
            subtasks: [sibling("ses_a", [sibling("ses_a2"), sibling("ses_a1")]), sibling("ses_b")],
        },
    ];
    catalogChanged();
    await new Promise((resolve) => setTimeout(resolve, 20));
    hostBots = [bot];
    catalogChanged();
    await vi.waitFor(() =>
        expect(order()).toEqual([
            ["ses_a", ["ses_a1", "ses_a2"]],
            ["ses_b", []],
        ]),
    );

    unsubscribe();
    list[Symbol.dispose]();
});
