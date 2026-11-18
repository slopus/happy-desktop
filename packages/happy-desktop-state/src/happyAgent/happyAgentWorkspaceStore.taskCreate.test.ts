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
    HappyAgentTaskCreating,
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
 * own. Sending its first message turns the window to the task at once, before
 * the host answers; a refusal brings the draft back with the host's reason.
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

/** What the list answers a creation with: its address at once, the host's answers later. */
function creating(
    created: Promise<void> = Promise.resolve(),
    ids: { taskId: string; groupId: string; sessionId: string } = {
        taskId: "task_new",
        groupId: "ws_new",
        sessionId: "ses_new",
    },
): HappyAgentTaskCreating {
    void created.catch(() => undefined);
    return {
        taskId: ids.taskId as HappyAgentTaskId,
        location: {
            groupId: ids.groupId as HappyAgentGroupId,
            sessionId: ids.sessionId as HappyAgentSessionId,
        },
        created,
        ready: created,
    };
}

function deferred(): {
    promise: Promise<void>;
    resolve: () => void;
    reject: (error: Error) => void;
} {
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<void>((done, fail) => {
        resolve = done;
        reject = fail;
    });
    return { promise, resolve, reject };
}

function store(
    taskCreate: (input: HappyAgentTaskCreateInput) => HappyAgentTaskCreating,
    taskRename: (taskId: HappyAgentTaskId, name: string) => Promise<void> = () => Promise.resolve(),
    models?: HappyAgentModelStore,
    overrides: Record<PropertyKey, unknown> = {},
    listOverrides: Record<PropertyKey, unknown> = {},
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
                        ...listOverrides,
                    },
                    {
                        get: (target, property) =>
                            property in target ? target[property as keyof typeof target] : inert(),
                    },
                ),
            chat: () => new Promise(() => undefined),
            openInTargetsRead: () => new Promise(() => undefined),
            workspaceFilesSubscribe: () => () => undefined,
            globalSkills: () => ({
                get: () => ({ skills: [] }),
                subscribe: () => () => undefined,
            }),
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

it("keeps the draft and its text when optimistic creation throws synchronously", async () => {
    const { workspace, outputs, unsubscribe } = store(() => {
        throw new Error("Creation refused before publication");
    });
    workspace.taskCreateOpen();
    workspace.taskCreateMessageUpdate("Keep this first message");
    workspace.taskCreateMessageSend();
    await vi.waitFor(() =>
        expect(workspace.get().taskCreate?.composer.get().submission).toMatchObject({
            status: "failed",
            error: { message: "Creation refused before publication" },
        }),
    );
    expect(workspace.get().taskCreate?.composer.get().text).toBe("Keep this first message");
    expect(outputs).not.toContainEqual(
        expect.objectContaining({ type: "conversationOpenRequested" }),
    );
    expect(workspace.get().list.tasks.map((task) => task.id)).toEqual([TASK.id]);
    unsubscribe();
});

it("opens a task draft of its own, and sending turns the window to the new task", async () => {
    const taskCreate = vi.fn(() => creating());
    const { workspace, outputs, unsubscribe } = store(taskCreate);

    workspace.taskCreateOpen();
    expect(workspace.get().taskCreate).toMatchObject({ name: "", submitting: false });
    // A task draft is not a bot draft: the bot surface has nothing to show.
    expect(workspace.get().botCreate).toBeUndefined();

    workspace.taskCreateNameUpdate("Invoice rounding");
    workspace.taskCreateMessageUpdate("Fix rounding");
    workspace.taskCreateMessageSend();

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
        return creating();
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

/** A store whose chats take every message, recording each send. */
function sendingStore(taskCreate: (input: HappyAgentTaskCreateInput) => HappyAgentTaskCreating) {
    const messageSend = vi.fn((..._args: unknown[]) => Promise.resolve());
    const opened = store(taskCreate, undefined, undefined, {
        chat: () =>
            Promise.resolve({
                store: new Proxy({ messageSend } as Record<PropertyKey, unknown>, {
                    get: (target, property) => (property in target ? target[property] : inert()),
                }),
                [Symbol.dispose]: () => undefined,
            }),
    });
    return { ...opened, messageSend };
}

it("offers the global skills in a task's composer and runs one as its first turn", async () => {
    const skill = {
        name: "guided-review",
        description: "Review a change.",
        hasArguments: true,
        kind: "skill" as const,
    };
    const messageSend = vi.fn((..._args: unknown[]) => Promise.resolve());
    const slashCommandInvoke = vi.fn((..._args: unknown[]) => Promise.resolve());
    const sessionCreationWait = vi.fn((_sessionId: HappyAgentSessionId) =>
        Promise.resolve([skill]),
    );
    const { workspace, unsubscribe } = store(
        () => creating(),
        undefined,
        undefined,
        {
            globalSkills: () => ({
                get: () => ({ skills: [{ name: skill.name, description: skill.description }] }),
                subscribe: () => () => undefined,
            }),
            chat: () =>
                Promise.resolve({
                    store: new Proxy(
                        { messageSend, slashCommandInvoke } as Record<PropertyKey, unknown>,
                        {
                            get: (target, property) =>
                                property in target ? target[property] : inert(),
                        },
                    ),
                    [Symbol.dispose]: () => undefined,
                }),
        },
        { sessionCreationWait },
    );

    workspace.taskCreateOpen();
    expect(workspace.get().taskCreate?.composer.get().capabilities.commands).toEqual([
        {
            id: "guided-review",
            label: "/guided-review",
            description: "Review a change.",
            hasArguments: true,
            kind: "skill",
        },
    ]);
    workspace.taskCreateMessageUpdate("/guided-review the last commit");
    workspace.taskCreateMessageSend();

    // Resolved against the catalog the task's own agent offers, then invoked
    // the way an open conversation invokes it.
    await vi.waitFor(() => expect(slashCommandInvoke).toHaveBeenCalledTimes(1));
    expect(sessionCreationWait).toHaveBeenCalledWith("ses_new");
    expect(slashCommandInvoke).toHaveBeenCalledWith(skill, "the last commit");
    expect(messageSend).not.toHaveBeenCalled();
    unsubscribe();
});

it("turns the window to the new task and sends its first message before the host answers", async () => {
    const host = deferred();
    const taskCreate = vi.fn(() => creating(host.promise));
    const { workspace, outputs, messageSend, unsubscribe } = sendingStore(taskCreate);

    workspace.taskCreateOpen();
    workspace.taskCreateMessageUpdate("Fix the invoice rounding");
    workspace.taskCreateMessageSend();

    // In the call that sent it: asked for, turned to, and the surface put away.
    expect(taskCreate).toHaveBeenCalledTimes(1);
    expect(outputs).toEqual([
        {
            type: "conversationOpenRequested",
            location: { groupId: "ws_new", sessionId: "ses_new" },
        },
    ]);
    expect(workspace.get().taskCreate).toBeUndefined();
    // The words go to the conversation without waiting for the host.
    await vi.waitFor(() => expect(messageSend).toHaveBeenCalledTimes(1));
    expect(messageSend.mock.calls[0]?.[0]).toBe("Fix the invoice rounding");

    host.resolve();
    await vi.waitFor(() =>
        expect(outputs).toContainEqual({
            type: "activityRecorded",
            activity: { kind: "taskCreated", result: { ok: true } },
        }),
    );
    // The host's answer moves nothing: no second turn, no removal, no surface.
    expect(
        outputs.filter(
            (event) => event.type === "conversationOpenRequested" || event.type === "groupRemoved",
        ),
    ).toHaveLength(1);
    expect(workspace.get().taskCreate).toBeUndefined();
    // The next arrival on the New task page meets a fresh draft.
    workspace.taskCreateOpen();
    expect(workspace.get().taskCreate?.composer.get().text).toBe("");
    unsubscribe();
});

it("brings the draft back with the host's refusal", async () => {
    const host = deferred();
    const { workspace, messageSend, unsubscribe } = sendingStore(() => creating(host.promise));

    workspace.taskCreateOpen();
    workspace.taskCreateNameUpdate("Invoice rounding");
    workspace.taskCreateMessageUpdate("Fix the invoice rounding");
    workspace.taskCreateMessageSend();
    await vi.waitFor(() => expect(messageSend).toHaveBeenCalledTimes(1));
    expect(workspace.get().taskCreate).toBeUndefined();

    host.reject(new Error("The task's folder could not be created."));
    await vi.waitFor(() => expect(workspace.get().taskCreate).toBeDefined());
    // Back as it was sent, with the host's reason on its composer.
    expect(workspace.get().taskCreate).toMatchObject({ name: "Invoice rounding" });
    await vi.waitFor(() =>
        expect(workspace.get().taskCreate?.composer.get().submission).toMatchObject({
            status: "failed",
            error: { message: "The task's folder could not be created." },
        }),
    );
    expect(workspace.get().taskCreate?.composer.get().text).toBe("Fix the invoice rounding");
    // The page the reader steps back onto opens on that draft, not a new one.
    workspace.taskCreateOpen();
    expect(workspace.get().taskCreate).toMatchObject({ name: "Invoice rounding" });
    expect(workspace.get().taskCreate?.composer.get().text).toBe("Fix the invoice rounding");
    unsubscribe();
});

it("puts up a Happy Cloud file that could not be downloaded, under its name and the reason", async () => {
    const attachmentDownload = vi.fn(() =>
        Promise.reject(new UserError("No such attachment.", "not_found")),
    );
    const { workspace, unsubscribe } = store(
        () => creating(new Promise(() => undefined)),
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
        () => creating(new Promise(() => undefined)),
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
        creating(Promise.reject(new Error("The task's folder could not be created."))),
    );

    workspace.taskCreateOpen();
    workspace.taskCreateNameUpdate("Invoice rounding");
    workspace.taskCreateMessageUpdate("Fix rounding");
    workspace.taskCreateMessageSend();
    await vi.waitFor(() => expect(workspace.get().taskCreate).toBeDefined());

    expect(workspace.get().taskCreate).toMatchObject({
        name: "Invoice rounding",
        submitting: false,
    });
    expect(outputs.some((event) => event.type === "conversationOpenRequested")).toBe(true);
    unsubscribe();
});

it("renames a task through the same dialog a bot uses", async () => {
    const taskRename = vi.fn(() => Promise.resolve());
    const { workspace, unsubscribe } = store(
        () => creating(new Promise(() => undefined)),
        taskRename,
    );

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
    const taskCreate = vi.fn(() => creating());
    const { workspace, unsubscribe } = store(taskCreate, undefined, models);

    workspace.taskCreateOpen();
    await vi.waitFor(() => expect(workspace.get().taskCreate?.menus).toBeDefined());
    expect(workspace.get().taskCreate?.menus).toMatchObject({
        currentProviderId: "test-provider",
        currentModelId: "test-model",
    });
    workspace.taskCreateModelUpdate({ providerId: "other-provider", modelId: "second-model" });
    workspace.taskCreateEffortUpdate("xhigh");
    workspace.taskCreateMessageUpdate("Hello");
    workspace.taskCreateMessageSend();

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
