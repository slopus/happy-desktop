// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { fakeHappyAgentDaemonCreate } from "happy-desktop-state/testing";
import type { HappyAgentSessionLocation } from "happy-desktop-state";
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
    daemon.taskSeed({ id: "task_old", name: "Old", joinedKey: "a1" });
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
