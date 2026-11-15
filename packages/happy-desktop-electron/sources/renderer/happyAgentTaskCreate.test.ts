// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { fakeHappyAgentDaemonCreate } from "happy-desktop-state/testing";
import type { HappyAgentSessionId, HappyAgentSessionLocation } from "happy-desktop-state";
import { happyAgentConnectionOpen, type HappyAgentConnectionHandle } from "./happyAgentConnection";

/* A new task through the whole window stack — connection, catalog, list, and
 * workspace — against the fake daemon: the row, the turn to it, and its first
 * message all come before the host answers, and the answer moves nothing. */

vi.mock("happy-desktop-app", () => ({ terminalDriverCreate: () => undefined }));
const handles: HappyAgentConnectionHandle[] = [];
const subscriptions: (() => void)[] = [];
afterEach(() => {
    for (const unsubscribe of subscriptions.splice(0)) unsubscribe();
    for (const handle of handles.splice(0)) handle.dispose();
});

async function windowOpen() {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.profileSet({ userId: "reader", name: "Reader" });
    daemon.taskSeed({ id: "task_old", name: "Old", joinedKey: "05" });
    const opened: HappyAgentSessionLocation[] = [];
    const forgotten: string[] = [];
    const handle = happyAgentConnectionOpen({
        client: daemon.client,
        cloudHost: {
            cloudAuthCallbackSubscribe: () => () => {},
            cloudAuthCallbackTake: async () => undefined,
            cloudAuthConfigurationGet: () => new Promise(() => {}),
            cloudAuthOpen: async () => {},
        },
        deps: {
            changed: () => {},
            conversationOpen: (location) => {
                opened.push(location);
                handle.get()?.workspace.conversationOpen(location.sessionId, location.groupId);
            },
            groupForget: (groupId) => forgotten.push(groupId),
            subtasksForget: () => {},
            groupOpen: () => {},
        },
        happyAgentHttpUrl: "http://happy-agent.test",
        happyAgentId: "task-create",
        memberProfileRequired: true,
        host: { applicationMenuOpen: () => {}, directoryPick: async () => undefined },
        modelPreferencePersistence: { read: () => undefined, write: () => {} },
        terminalColorScheme: () => "light",
    });
    handles.push(handle);
    await vi.waitFor(() => expect(handle.get()).toBeDefined());
    const workspace = handle.get()!.workspace;
    subscriptions.push(workspace.subscribe(() => {}));
    await vi.waitFor(() => expect(workspace.get().list.tasks).toHaveLength(1));
    workspace.taskCreateOpen();
    await vi.waitFor(() => expect(workspace.get().taskCreate?.menus).toBeDefined());
    return { daemon, workspace, opened, forgotten };
}

it("stands the new task first, turns to it, and shows its message before the host answers", async () => {
    const { daemon, workspace, opened } = await windowOpen();
    const release = daemon.pause("createTask");
    // Every list the reader is shown from the send on, in order.
    const shown: string[][] = [];
    subscriptions.push(
        workspace.subscribe(() => shown.push(workspace.get().list.tasks.map((task) => task.id))),
    );

    workspace.taskCreateMessageUpdate("Fix the invoice rounding");
    workspace.taskCreateMessageSend();
    expect(opened).toHaveLength(1);
    const location = opened[0]!;
    await vi.waitFor(() => expect(workspace.get().list.tasks).toHaveLength(2));
    const created = workspace.get().list.tasks[0]!;
    expect(created).toMatchObject({ name: "New Task", workspaceId: location.groupId });
    expect(created.conversation.id).toBe(location.sessionId);
    await vi.waitFor(() =>
        expect(JSON.stringify(workspace.get().conversation)).toContain("Fix the invoice rounding"),
    );
    expect(daemon.callCount("sendMessage")).toBe(0);

    release();
    await vi.waitFor(() => expect(daemon.callCount("sendMessage")).toBe(1));
    await vi.waitFor(() =>
        expect(workspace.get().list.tasks[0]?.path).toBe(`/tmp/tasks/${created.id}`),
    );
    // From its first frame on, the row stood first and never left or moved.
    const first = shown.findIndex((ids) => ids.includes(created.id));
    for (const ids of shown.slice(first)) expect(ids).toEqual([created.id, "task_old"]);
    // One turn, to the address the host kept.
    expect(opened).toEqual([location]);
    expect(workspace.get().address).toMatchObject({
        groupId: location.groupId,
        conversationId: location.sessionId,
    });
});

it("takes a refused task back out, moves the reader off it, and returns the draft", async () => {
    const { daemon, workspace, opened, forgotten } = await windowOpen();
    daemon.failOnce("createTask", new Error("The task's folder could not be created."));
    const release = daemon.pause("createTask");

    workspace.taskCreateNameUpdate("Invoice rounding");
    workspace.taskCreateMessageUpdate("Fix the invoice rounding");
    workspace.taskCreateMessageSend();
    const location = opened[0]!;
    await vi.waitFor(() => expect(workspace.get().list.tasks).toHaveLength(2));

    release();
    await vi.waitFor(() => expect(forgotten).toEqual([location.groupId]));
    await vi.waitFor(() =>
        expect(workspace.get().list.tasks.map((task) => task.id)).toEqual(["task_old"]),
    );
    expect(workspace.get().taskCreate).toMatchObject({ name: "Invoice rounding" });
    expect(workspace.get().taskCreate?.composer.get()).toMatchObject({
        text: "Fix the invoice rounding",
        submission: { status: "failed" },
    });
    expect(daemon.callCount("sendMessage")).toBe(0);
});

it("forgets a task refused before its first catalog read", async () => {
    const { daemon, workspace, opened, forgotten } = await windowOpen();
    daemon.failOnce("createTask", new Error("Refused"));
    workspace.taskCreateMessageUpdate("Hello");
    workspace.taskCreateMessageSend();
    await vi.waitFor(() => expect(forgotten).toEqual([opened[0]!.groupId]));
    expect(workspace.get().taskCreate?.composer.get().text).toBe("Hello");
});

it("closes a pending task immediately and leaves only after creation succeeds", async () => {
    const { daemon, workspace, opened, forgotten } = await windowOpen();
    const release = daemon.pause("createTask");
    workspace.taskCreateMessageUpdate("Hello");
    workspace.taskCreateMessageSend();
    await vi.waitFor(() => expect(workspace.get().list.tasks).toHaveLength(2));
    const task = workspace.get().list.tasks[0]!;
    const leaving = workspace.taskLeave(task.id);
    expect(forgotten).toEqual([opened[0]!.groupId]);
    expect(workspace.get().list.tasks.map((entry) => entry.id)).toEqual(["task_old"]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(daemon.callCount("leaveTask")).toBe(0);
    release();
    await expect(leaving).resolves.toBe(true);
    await vi.waitFor(() => expect(daemon.callCount("sendMessage")).toBe(1));
    expect(workspace.get().list.tasks.map((entry) => entry.id)).toEqual(["task_old"]);
    expect(workspace.get().taskCreate).toBeUndefined();
});

it("forgets a task left from another window without a project catalog change", async () => {
    const { daemon, workspace, forgotten } = await windowOpen();
    const task = workspace.get().list.tasks[0]!;
    workspace.conversationOpen(task.conversation.id as HappyAgentSessionId, task.workspaceId);
    await daemon.client.leaveTask(task.id, { mutationId: "external-leave" });
    await vi.waitFor(() => expect(workspace.get().list.tasks).toHaveLength(0));
    expect(forgotten).toEqual([task.workspaceId]);
});

it("keeps a mode picked in the pending conversation after creation", async () => {
    const { daemon, workspace, opened } = await windowOpen();
    const release = daemon.pause("createTask");
    workspace.taskCreateMessageUpdate("Hello");
    workspace.taskCreateMessageSend();
    await vi.waitFor(() => expect(JSON.stringify(workspace.get().conversation)).toContain("Hello"));
    workspace.sessionPermissionModeUpdate("read_only");
    expect(workspace.get().conversation).toMatchObject({
        value: { menus: { currentPermissionMode: "read_only" } },
    });
    release();
    await vi.waitFor(() => expect(daemon.callCount("saveAgentDraft")).toBeGreaterThan(1));
    await vi.waitFor(async () => {
        const { draft } = await daemon.client.getAgentDraft(opened[0]!.sessionId);
        expect(draft.value?.permissionMode).toBe("read_only");
    });
});

it("keeps a newer task draft when an earlier creation fails", async () => {
    const { daemon, workspace } = await windowOpen();
    daemon.failOnce("createTask", new Error("Refused"));
    const release = daemon.pause("createTask");
    workspace.taskCreateMessageUpdate("First draft");
    workspace.taskCreateMessageSend();
    workspace.taskCreateOpen();
    workspace.taskCreateMessageUpdate("Newer draft");
    release();
    await vi.waitFor(() => expect(workspace.get().list.tasks).toHaveLength(1));
    expect(workspace.get().taskCreate?.composer.get().text).toBe("Newer draft");
});

it("keeps new task picker changes when an earlier creation fails", async () => {
    const { daemon, workspace } = await windowOpen();
    daemon.failOnce("createTask", new Error("Refused"));
    const release = daemon.pause("createTask");
    workspace.taskCreateMessageUpdate("First draft");
    workspace.taskCreateMessageSend();
    workspace.taskCreateOpen();
    await vi.waitFor(() => expect(workspace.get().taskCreate?.menus).toBeDefined());
    workspace.taskCreatePermissionModeUpdate("read_only");
    release();
    await vi.waitFor(() => expect(workspace.get().list.tasks).toHaveLength(1));
    expect(workspace.get().taskCreate?.composer.get().text).toBe("");
    expect(workspace.get().taskCreate?.menus?.currentPermissionMode).toBe("read_only");
});

it("never resurrects a closed pending task when creation fails", async () => {
    const { daemon, workspace } = await windowOpen();
    daemon.failOnce("createTask", new Error("Refused"));
    const release = daemon.pause("createTask");
    workspace.taskCreateMessageUpdate("Hello");
    workspace.taskCreateMessageSend();
    await vi.waitFor(() => expect(workspace.get().list.tasks).toHaveLength(2));
    const task = workspace.get().list.tasks[0]!;
    const leaving = workspace.taskLeave(task.id);
    release();
    await leaving;
    expect(workspace.get().list.tasks.map((entry) => entry.id)).toEqual(["task_old"]);
    expect(daemon.callCount("leaveTask")).toBe(0);
    expect(daemon.callCount("sendMessage")).toBe(0);
});

it("archives a confirmed new task and closes it in the same call", async () => {
    const { daemon, workspace, opened, forgotten } = await windowOpen();
    workspace.taskCreateMessageUpdate("Hello");
    workspace.taskCreateMessageSend();
    await vi.waitFor(() => expect(daemon.callCount("sendMessage")).toBe(1));
    await vi.waitFor(() => expect(workspace.get().list.tasks[0]?.canArchive).toBe(true));
    const task = workspace.get().list.tasks[0]!;
    const archived = workspace.taskArchive(task.id);
    expect(forgotten).toEqual([opened[0]!.groupId]);
    expect(workspace.get().list.tasks.map((entry) => entry.id)).toEqual(["task_old"]);
    await expect(archived).resolves.toBe(true);
});
