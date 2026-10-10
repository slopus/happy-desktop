import { expect, it, vi } from "vitest";
import type { MutationRejectedDelta } from "../happyAgentConnection/types.js";
import {
    happyAgentSessionListStoreCreate,
    type HappyAgentSessionListDeps,
} from "./happyAgentSessionListStore.js";
import type { HappyAgentTask, HappyAgentTaskId, HappyAgentWorktreeId } from "./happyAgentTypes.js";

/* The reader's own task list: joined tasks in membership order, leaving as an
 * optimistic act a refusal undoes, and archiving offered only to the people
 * the host says may do it. */

const task = (
    id: string,
    options: { readonly orderKey?: string; readonly canArchive?: boolean } = {},
): HappyAgentTask => ({
    id: id as HappyAgentTaskId,
    workspaceId: `ws_${id}` as HappyAgentWorktreeId,
    name: id,
    conversation: {
        id: `ses_${id}`,
        title: id,
        subtitle: "",
        updatedAt: 1,
        activity: "idle",
        participants: [],
    },
    subtasks: [],
    owner: {},
    path: `/tasks/${id}`,
    displayPath: `~/tasks/${id}`,
    createdAt: 1,
    archived: false,
    canArchive: options.canArchive === true,
    ...(options.orderKey === undefined ? {} : { membership: { orderKey: options.orderKey } }),
});

function listCreate(initial: readonly HappyAgentTask[]) {
    let hostTasks = initial;
    let catalogChanged = (): void => undefined;
    let rejected = (_rejection: MutationRejectedDelta): void => undefined;
    let mutation = 0;
    const actions = {
        archiveTask: vi.fn(() => `mut_${String(++mutation)}`),
        createTask: vi.fn(
            (): {
                taskId: string;
                workspaceId: string;
                agentId: string;
                task: Promise<unknown>;
            } => {
                throw new Error("No create was expected.");
            },
        ),
        renameTask: vi.fn(() => `mut_${String(++mutation)}`),
        joinTask: vi.fn(() => `mut_${String(++mutation)}`),
        leaveTask: vi.fn(() => `mut_${String(++mutation)}`),
        reorderTask: vi.fn(() => `mut_${String(++mutation)}`),
        unarchiveTask: vi.fn(() => `mut_${String(++mutation)}`),
    };
    const deps = {
        client: {},
        catalogSource: {
            read: () =>
                Promise.resolve({
                    catalog: { bots: [], projects: [], tasks: hostTasks, worktrees: [] },
                    sessions: [],
                    archivedSessions: [],
                }),
            subscribe: (listener: () => void) => {
                catalogChanged = listener;
                return () => undefined;
            },
            [Symbol.dispose]: () => undefined,
        },
        connectActions: actions,
        connectMutationSubscribe: (listener: (rejection: MutationRejectedDelta) => void) => {
            rejected = listener;
            return () => undefined;
        },
    } as unknown as HappyAgentSessionListDeps;
    const list = happyAgentSessionListStoreCreate(deps);
    const unsubscribe = list.subscribe(() => undefined);
    return {
        list,
        actions,
        hostAnswers(next: readonly HappyAgentTask[]) {
            hostTasks = next;
            catalogChanged();
        },
        reject: (rejection: MutationRejectedDelta) => rejected(rejection),
        [Symbol.dispose]() {
            unsubscribe();
            list[Symbol.dispose]();
        },
    };
}

const ids = (tasks: readonly HappyAgentTask[]) => tasks.map((entry) => entry.id);

it("lists the joined tasks in the reader's membership order and keeps every active one browsable", async () => {
    using harness = listCreate([
        task("b", { orderKey: "a2" }),
        task("open"),
        task("a", { orderKey: "a1" }),
    ]);
    await vi.waitFor(() => expect(harness.list.get().tasks).toHaveLength(2));
    expect(ids(harness.list.get().tasks)).toEqual(["a", "b"]);
    expect(ids(harness.list.get().taskDirectory)).toEqual(["b", "open", "a"]);
});

it("leaves at once, and brings the row back with the host's reason when it refuses", async () => {
    using harness = listCreate([task("a", { orderKey: "a1" }), task("b", { orderKey: "a2" })]);
    await vi.waitFor(() => expect(harness.list.get().tasks).toHaveLength(2));

    await harness.list.taskLeave("a" as HappyAgentTaskId);
    expect(harness.actions.leaveTask).toHaveBeenCalledWith("a");
    expect(ids(harness.list.get().tasks)).toEqual(["b"]);
    // Still in the catalog for browsing: leaving is the reader's list only.
    expect(ids(harness.list.get().taskDirectory)).toContain("a");

    harness.reject({
        type: "mutation_rejected",
        action: "leave_task",
        message: "The host is busy.",
        mutationId: "mut_1",
    });
    expect(ids(harness.list.get().tasks)).toEqual(["a", "b"]);
    expect(harness.list.get().taskFailures.get("a" as HappyAgentTaskId)).toMatchObject({
        action: "leave",
        error: { message: "The host is busy." },
    });

    // Asked again and answered: the host's catalog settles it.
    await harness.list.taskLeave("a" as HappyAgentTaskId);
    expect(harness.list.get().taskFailures.size).toBe(0);
    harness.hostAnswers([task("a"), task("b", { orderKey: "a2" })]);
    await vi.waitFor(() => expect(ids(harness.list.get().tasks)).toEqual(["b"]));
});

it("archives only a task the host says the reader may archive, and never optimistically", async () => {
    using harness = listCreate([
        task("mine", { orderKey: "a1", canArchive: true }),
        task("theirs", { orderKey: "a2" }),
    ]);
    await vi.waitFor(() => expect(harness.list.get().tasks).toHaveLength(2));

    await harness.list.taskArchive("theirs" as HappyAgentTaskId);
    expect(harness.actions.archiveTask).not.toHaveBeenCalled();

    await harness.list.taskArchive("mine" as HappyAgentTaskId);
    expect(harness.actions.archiveTask).toHaveBeenCalledWith("mine");
    expect(ids(harness.list.get().tasks)).toEqual(["mine", "theirs"]);

    harness.reject({
        type: "mutation_rejected",
        action: "archive_task",
        message: "“mine” changed while you were looking at it. Try again.",
        mutationId: "mut_1",
    });
    expect(harness.list.get().taskFailures.get("mine" as HappyAgentTaskId)?.action).toBe("archive");
});

it("moves a task in the reader's own list until the host's order agrees", async () => {
    using harness = listCreate([
        task("a", { orderKey: "a1" }),
        task("b", { orderKey: "a2" }),
        task("c", { orderKey: "a3" }),
    ]);
    await vi.waitFor(() => expect(harness.list.get().tasks).toHaveLength(3));

    await harness.list.taskReorder("c" as HappyAgentTaskId, null);
    expect(harness.actions.reorderTask).toHaveBeenCalledWith("c", null);
    expect(ids(harness.list.get().tasks)).toEqual(["c", "a", "b"]);

    // A catalog published for something else meanwhile does not undo the move.
    harness.hostAnswers([
        task("a", { orderKey: "a1" }),
        task("b", { orderKey: "a2" }),
        task("c", { orderKey: "a3" }),
    ]);
    await Promise.resolve();
    expect(ids(harness.list.get().tasks)).toEqual(["c", "a", "b"]);

    harness.hostAnswers([
        task("a", { orderKey: "a1" }),
        task("b", { orderKey: "a2" }),
        task("c", { orderKey: "a0" }),
    ]);
    await vi.waitFor(() => expect(ids(harness.list.get().tasks)).toEqual(["c", "a", "b"]));
});

it("joins once, marking the task as joining until the host lists the membership", async () => {
    using harness = listCreate([task("open")]);
    await vi.waitFor(() => expect(harness.list.get().taskDirectory).toHaveLength(1));

    await harness.list.taskJoin("open" as HappyAgentTaskId);
    await harness.list.taskJoin("open" as HappyAgentTaskId);
    expect(harness.actions.joinTask).toHaveBeenCalledTimes(1);
    expect(harness.list.get().tasksJoining.has("open" as HappyAgentTaskId)).toBe(true);

    harness.hostAnswers([task("open", { orderKey: "a0" })]);
    await vi.waitFor(() => expect(ids(harness.list.get().tasks)).toEqual(["open"]));
    expect(harness.list.get().tasksJoining.size).toBe(0);
});

it("creates a task, answering with its conversation once the host lists it at the top", async () => {
    using harness = listCreate([task("a", { orderKey: "a1" })]);
    await vi.waitFor(() => expect(harness.list.get().tasks).toHaveLength(1));
    harness.actions.createTask.mockImplementation(() => ({
        taskId: "new",
        workspaceId: "ws_new",
        agentId: "ses_new",
        task: Promise.resolve({ id: "new", workspaceId: "ws_new", agent: { id: "ses_new" } }),
    }));

    let settled = false;
    const creation = harness.list.taskCreate({ name: "  Invoice rounding  " }).then((value) => {
        settled = true;
        return value;
    });
    expect(harness.actions.createTask).toHaveBeenCalledWith("Invoice rounding");
    // Not answered until the list carries it: the window must not turn to a
    // conversation the sidebar does not have yet.
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);

    harness.hostAnswers([task("new", { orderKey: "a0" }), task("a", { orderKey: "a1" })]);
    await expect(creation).resolves.toEqual({
        taskId: "new",
        location: { groupId: "ws_new", sessionId: "ses_new" },
    });
    expect(ids(harness.list.get().tasks)).toEqual(["new", "a"]);

    // A blank name is left out, for the host to name the task from its first message.
    harness.actions.createTask.mockImplementation(() => ({
        taskId: "other",
        workspaceId: "ws_other",
        agentId: "ses_other",
        task: Promise.reject(new Error("The task's folder could not be created.")),
    }));
    await expect(harness.list.taskCreate({ name: "   " })).rejects.toThrow(
        "The task's folder could not be created.",
    );
    expect(harness.actions.createTask).toHaveBeenLastCalledWith(undefined);
    expect(harness.list.get().mutationError?.message).toBe(
        "The task's folder could not be created.",
    );
});

it("renames at once, and states the host's refusal under the task", async () => {
    using harness = listCreate([task("a", { orderKey: "a1" })]);
    await vi.waitFor(() => expect(harness.list.get().tasks).toHaveLength(1));

    await harness.list.taskRename("a" as HappyAgentTaskId, "Alpha");
    expect(harness.actions.renameTask).toHaveBeenCalledWith("a", "Alpha");
    expect(harness.list.get().tasks[0]?.name).toBe("Alpha");

    harness.reject({
        type: "mutation_rejected",
        action: "rename_task",
        message: "“a” changed while you were renaming it. Try again.",
        mutationId: "mut_1",
    });
    expect(harness.list.get().taskFailures.get("a" as HappyAgentTaskId)).toMatchObject({
        action: "rename",
        error: { message: "“a” changed while you were renaming it. Try again." },
    });
});
