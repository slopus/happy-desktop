import type { DaemonConfig } from "@slopus/happy-agent-client";
import { expect, it, vi } from "vitest";
import { fakeHappyAgentDaemonCreate } from "../testing/fakeHappyAgentDaemon.js";
import { UserError } from "../types.js";
import type { HappyAgentWorkspaceClient } from "./happyAgentClient.js";
import {
    happyAgentModelStoreCreate,
    type HappyAgentModelPreferenceDocument,
    type HappyAgentModelStore,
} from "./happyAgentModelStore.js";
import { happyAgentModelCatalogProject } from "./happyAgentProject.js";
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
    models?: HappyAgentModelStore,
    overrides: Record<PropertyKey, unknown> = {},
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
        tasksArchived: [],
        tasksJoining: new Set(),
        taskFailures: new Map(),
    } as unknown as HappyAgentSessionListSnapshot;
    const loading = { type: "loading" } as const;
    const client = new Proxy(
        {
            models: models ?? {
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
            ...overrides,
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

it("uploads a Happy Cloud task's first file once the task exists, then sends it", async () => {
    const order: string[] = [];
    const taskCreate = vi.fn(() => {
        order.push("taskCreate");
        return Promise.resolve({
            taskId: "task_new" as HappyAgentTaskId,
            location: {
                groupId: "ws_new" as HappyAgentGroupId,
                sessionId: "ses_new" as HappyAgentSessionId,
            },
        });
    });
    const attachmentUpload = vi.fn((agentId: string, attachment: { readonly name: string }) => {
        order.push(`upload:${agentId}`);
        return Promise.resolve({
            type: "file" as const,
            attachment: "att_1",
            name: attachment.name,
        });
    });
    let sent!: (args: unknown[]) => void;
    const delivered = new Promise<unknown[]>((resolve) => (sent = resolve));
    const messageSend = vi.fn((...args: unknown[]) => {
        order.push("messageSend");
        sent(args);
        return Promise.resolve();
    });
    const { workspace, unsubscribe } = store(taskCreate, undefined, undefined, {
        attachmentUpload,
        attachmentSourcePath: () => undefined,
        chat: () =>
            Promise.resolve({
                store: new Proxy({ messageSend } as Record<PropertyKey, unknown>, {
                    get: (target, property) => (property in target ? target[property] : inert()),
                }),
                [Symbol.dispose]: () => undefined,
            }),
    });

    workspace.taskCreateOpen();
    workspace.taskCreateMessageUpdate("Read this");
    workspace.taskCreateAttachmentsAdd([new File(["hello"], "notes.txt", { type: "text/plain" })]);
    workspace.taskCreateMessageSend();

    const [text, images, , files] = await delivered;
    // Made first, so the upload has an agent to go to; sent last, naming it.
    expect(order).toEqual(["taskCreate", "upload:ses_new", "messageSend"]);
    expect(attachmentUpload).toHaveBeenCalledWith(
        "ses_new",
        expect.objectContaining({ name: "notes.txt", mediaType: "text/plain", size: 5 }),
    );
    expect(text).toBe("Read this");
    expect(images).toEqual([]);
    expect(files).toEqual([{ type: "file", attachment: "att_1", name: "notes.txt" }]);
    unsubscribe();
});

it("puts up a Happy Cloud file that could not be downloaded, under its name and the reason", async () => {
    const attachmentDownload = vi.fn(() =>
        Promise.reject(new UserError("No such attachment.", "not_found")),
    );
    const { workspace, unsubscribe } = store(
        () => new Promise(() => undefined),
        undefined,
        undefined,
        {
            attachmentDownload,
        },
    );
    workspace.conversationOpen(TASK.conversation.id as HappyAgentSessionId, TASK.workspaceId);

    await expect(workspace.attachmentDownload("digest", "notes ü.txt")).rejects.toThrow(
        "No such attachment.",
    );

    expect(attachmentDownload).toHaveBeenCalledWith(TASK.conversation.id, "digest");
    expect(workspace.get().fileOpenFailure).toEqual({
        path: "notes ü.txt",
        message: "No such attachment.",
    });
    unsubscribe();
});

it("takes down a Happy Cloud file's failure once that file arrives, and on dismiss", async () => {
    const blob = new Blob(["notes"]);
    const attachmentDownload = vi
        .fn<(agent: string, attachment: string) => Promise<Blob>>()
        .mockRejectedValueOnce(new UserError("You're offline.", "network"))
        .mockResolvedValueOnce(blob)
        .mockRejectedValueOnce(new UserError("No such attachment.", "not_found"))
        .mockResolvedValueOnce(blob);
    const { workspace, unsubscribe } = store(
        () => new Promise(() => undefined),
        undefined,
        undefined,
        {
            attachmentDownload,
        },
    );
    workspace.conversationOpen(TASK.conversation.id as HappyAgentSessionId, TASK.workspaceId);

    await expect(workspace.attachmentDownload("digest", "notes ü.txt")).rejects.toThrow(
        "You're offline.",
    );
    expect(workspace.get().fileOpenFailure?.path).toBe("notes ü.txt");
    await expect(workspace.attachmentDownload("digest", "notes ü.txt")).resolves.toBe(blob);
    expect(workspace.get().fileOpenFailure).toBeUndefined();

    // Another file arriving leaves this one's failure up until it is dismissed.
    await expect(workspace.attachmentDownload("other", "missing.txt")).rejects.toThrow(
        "No such attachment.",
    );
    await expect(workspace.attachmentDownload("digest", "notes ü.txt")).resolves.toBe(blob);
    expect(workspace.get().fileOpenFailure).toEqual({
        path: "missing.txt",
        message: "No such attachment.",
    });
    workspace.fileOpenFailureDismiss();
    expect(workspace.get().fileOpenFailure).toBeUndefined();
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

/** The fake daemon's model on two accounts, beside a second model on one of them. */
function twoAccountConfig(): DaemonConfig {
    const config = fakeHappyAgentDaemonCreate().configGet();
    return {
        ...config,
        models: {
            ...config.models,
            "second-model": {
                ...config.models["test-model"]!,
                name: "Second Model",
                efforts: ["low", "medium", "high", "xhigh"],
            },
        },
        providers: {
            ...config.providers,
            "other-provider": {
                enabled: true,
                models: [
                    { enabled: true, id: "test-model" },
                    { enabled: true, id: "second-model" },
                ],
                type: "claude",
            },
        },
    };
}

it("opens the next task on the model, effort, and account the last one started on", async () => {
    let document: HappyAgentModelPreferenceDocument = { preferences: {} };
    const models = happyAgentModelStoreCreate({
        catalogRead: async () => happyAgentModelCatalogProject(twoAccountConfig()),
        preferencePersistence: {
            read: () => document,
            write: (next) => {
                document = next;
            },
        },
    });
    await models.load();
    const taskCreate = vi.fn(() =>
        Promise.resolve({
            taskId: "task_new" as HappyAgentTaskId,
            location: {
                groupId: "ws_new" as HappyAgentGroupId,
                sessionId: "ses_new" as HappyAgentSessionId,
            },
        }),
    );
    const { workspace, unsubscribe } = store(taskCreate, undefined, models);

    workspace.taskCreateOpen();
    await vi.waitFor(() => expect(workspace.get().taskCreate?.menus).toBeDefined());
    expect(workspace.get().taskCreate?.menus).toMatchObject({
        currentProviderId: "test-provider",
        currentModelId: "test-model",
    });
    workspace.taskCreateModelUpdate({ providerId: "other-provider", modelId: "second-model" });
    workspace.taskCreateEffortUpdate("xhigh");
    await workspace.taskCreateSubmit();

    expect(taskCreate).toHaveBeenCalledWith({
        selection: expect.objectContaining({
            providerId: "other-provider",
            modelId: "second-model",
            effort: "xhigh",
        }),
    });
    // Each part is kept on its own, so a later model can still take the effort.
    expect(document).toMatchObject({
        defaultModelId: "second-model",
        defaultEffort: "xhigh",
        lastPickedProviderId: "other-provider",
    });

    workspace.taskCreateOpen();
    await vi.waitFor(() => expect(workspace.get().taskCreate?.menus).toBeDefined());
    expect(workspace.get().taskCreate?.menus).toMatchObject({
        currentProviderId: "other-provider",
        currentModelId: "second-model",
        currentEffort: "xhigh",
    });
    unsubscribe();
    models[Symbol.dispose]();
});
