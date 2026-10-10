import { expect, it, vi } from "vitest";
import type { HappyAgentWorkspaceClient } from "./happyAgentClient.js";
import type {
    HappyAgentSessionListSnapshot,
    HappyAgentTaskCreateInput,
    HappyAgentTaskCreation,
} from "./happyAgentSessionListStore.js";
import type {
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
 * A task is made the way a bot is: a draft with a name, over a composer of its
 * own. Create makes it and turns the window to its conversation; a refusal
 * keeps the draft with the host's reason on it.
 */

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

const TASK = {
    id: "task_alpha" as HappyAgentTaskId,
    workspaceId: "ws_alpha" as HappyAgentWorktreeId,
    name: "Alpha",
    conversation: {
        id: "ses_alpha",
        title: "Alpha",
        subtitle: "",
        updatedAt: 1,
        activity: "idle",
        participants: [],
    },
    subtasks: [],
    owner: null,
    path: "/tasks/alpha",
    displayPath: "~/tasks/alpha",
    createdAt: 1,
    archived: false,
    canArchive: false,
    membership: { orderKey: "a1" },
} as HappyAgentTask;

function store(
    taskCreate: (input: HappyAgentTaskCreateInput) => Promise<HappyAgentTaskCreation>,
    taskRename: (taskId: HappyAgentTaskId, name: string) => Promise<void> = () => Promise.resolve(),
) {
    const list = {
        projects: { type: "ready", value: [] },
        bots: [],
        botsCreating: [],
        archivedSessions: [],
        catalogRevision: 1,
        sessionCreateFailures: new Map(),
        worktreeCreateFailures: new Map(),
        projectCreateFailures: new Map(),
        subtaskFailures: new Map(),
        tasks: [TASK],
        taskDirectory: [TASK],
        tasksJoining: new Set(),
        taskFailures: new Map(),
    } as unknown as HappyAgentSessionListSnapshot;
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
                        subscribe: () => () => undefined,
                        taskCreate,
                        taskRename,
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
    return { workspace, outputs, unsubscribe };
}

it("opens a task draft of its own, and Create turns the window to the new task", async () => {
    const taskCreate = vi.fn(() =>
        Promise.resolve({
            taskId: "task_new" as HappyAgentTaskId,
            location: {
                groupId: "ws_new" as HappyAgentGroupId,
                sessionId: "ses_new" as HappyAgentSessionId,
            },
        }),
    );
    const { workspace, outputs, unsubscribe } = store(taskCreate);

    workspace.taskCreateOpen();
    expect(workspace.get().taskCreate).toMatchObject({ name: "", submitting: false });
    // A task draft is not a bot draft: the bot surface has nothing to show.
    expect(workspace.get().botCreate).toBeUndefined();

    workspace.taskCreateNameUpdate("Invoice rounding");
    await workspace.taskCreateSubmit();

    expect(taskCreate).toHaveBeenCalledWith({ name: "Invoice rounding" });
    expect(outputs).toContainEqual({
        type: "conversationOpenRequested",
        location: { groupId: "ws_new", sessionId: "ses_new" },
    });
    // Put down once made, so the next arrival starts a fresh draft.
    expect(workspace.get().taskCreate).toBeUndefined();
    unsubscribe();
});

it("keeps the draft with the host's reason when the task could not be made", async () => {
    const { workspace, outputs, unsubscribe } = store(() =>
        Promise.reject(new Error("The task's folder could not be created.")),
    );

    workspace.taskCreateOpen();
    workspace.taskCreateNameUpdate("Invoice rounding");
    await workspace.taskCreateSubmit();

    expect(workspace.get().taskCreate).toMatchObject({
        name: "Invoice rounding",
        submitting: false,
        error: "The task's folder could not be created.",
    });
    expect(outputs.some((event) => event.type === "conversationOpenRequested")).toBe(false);
    unsubscribe();
});

it("renames a task through the same dialog a bot uses", async () => {
    const taskRename = vi.fn(() => Promise.resolve());
    const { workspace, unsubscribe } = store(() => new Promise(() => undefined), taskRename);

    workspace.taskRenameOpen(TASK.id);
    expect(workspace.get().rename).toMatchObject({
        kind: "task",
        taskId: TASK.id,
        currentName: "Alpha",
        draft: "Alpha",
    });
    workspace.renameDraftUpdate("Alpha prime");
    await workspace.renameSubmit();

    expect(taskRename).toHaveBeenCalledWith(TASK.id, "Alpha prime");
    expect(workspace.get().rename).toBeUndefined();
    unsubscribe();
});
