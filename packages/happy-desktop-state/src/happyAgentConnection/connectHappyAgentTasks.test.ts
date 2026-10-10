import { afterEach, expect, it, vi } from "vitest";
import { connectHappyAgent } from "./connectHappyAgent.js";
import type { HappyAgentConnection, MutationRejectedDelta, TaskGroup } from "./types.js";
import {
    fakeHappyAgentDaemonCreate,
    type FakeHappyAgentDaemon,
} from "../testing/fakeHappyAgentDaemon.js";

/* Tasks reach the window through the same groups subscription bots do: the
 * bootstrap lists them with the viewer's memberships, the realtime events keep
 * both current, and each task carries its owner's face — a team member's photo
 * route in team mode, the viewer's own profile photo when standalone. */

const openConnections: HappyAgentConnection[] = [];

afterEach(() => {
    for (const connection of openConnections.splice(0)) connection.close();
});

function harnessOpen(daemon: FakeHappyAgentDaemon) {
    const rejections: MutationRejectedDelta[] = [];
    const connection = connectHappyAgent({
        endpoint: "http://happy-agent.test/",
        token: "token",
        client: daemon.client,
        wait: () => new Promise((resolve) => setTimeout(resolve, 0)),
        now: () => 1_000,
        onMutationRejected: (rejection) => rejections.push(rejection),
    });
    openConnections.push(connection);
    const watch: { tasks: readonly TaskGroup[] } = { tasks: [] };
    connection.connectGroups({
        onChange(_projects, _state, _bots, tasks) {
            watch.tasks = tasks;
        },
        onError: () => undefined,
    });
    return { connection, rejections, watch };
}

const taskIn = (tasks: readonly TaskGroup[], id: string) => tasks.find((task) => task.id === id);

it("lists every task from the bootstrap with the viewer's membership and archive right", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.taskSeed({ id: "task_joined", name: "Launch", canArchive: true, joinedKey: "a1" });
    daemon.taskSeed({ id: "task_other", name: "Docs" });
    const { watch } = harnessOpen(daemon);

    await vi.waitFor(() => expect(watch.tasks).toHaveLength(2));
    expect(taskIn(watch.tasks, "task_joined")).toMatchObject({
        name: "Launch",
        canArchive: true,
        archived: false,
        membership: { orderKey: "a1" },
        workspaceId: "taskws-task_joined",
    });
    expect(taskIn(watch.tasks, "task_other")?.membership).toBeUndefined();
    expect(taskIn(watch.tasks, "task_other")?.canArchive).toBe(false);
});

it("gives a team task its owner's name and photo route, read through getUsers", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.profileSet({ userId: "usr_me", name: "Me" });
    daemon.userSeed({
        id: "usr_ann",
        name: "Ann Lee",
        photo: { thumbhash: "ann-hash" },
        updatedAt: 1,
        version: "u1",
    });
    daemon.userSeed({ id: "usr_bo", name: "Bo", photo: null, updatedAt: 1, version: "u1" });
    daemon.taskSeed({ id: "task_ann", ownerUserId: "usr_ann", joinedKey: "a1" });
    daemon.taskSeed({ id: "task_bo", ownerUserId: "usr_bo", joinedKey: "a2" });
    daemon.taskSeed({ id: "task_nobody", ownerUserId: null, joinedKey: "a3" });
    const { watch } = harnessOpen(daemon);

    await vi.waitFor(() =>
        expect(taskIn(watch.tasks, "task_ann")?.owner).toEqual({
            userId: "usr_ann",
            name: "Ann Lee",
            avatar: {
                url: "http://happy-agent.test/v0/users/usr_ann/photo",
                thumbhash: "ann-hash",
            },
        }),
    );
    // A member without a photo is named, and their initials stand in.
    await vi.waitFor(() =>
        expect(taskIn(watch.tasks, "task_bo")?.owner).toEqual({ userId: "usr_bo", name: "Bo" }),
    );
    // Team mode with nobody identified: no face at all, so the row falls back
    // to the generated mark rather than borrowing the viewer's.
    expect(taskIn(watch.tasks, "task_nobody")?.owner).toEqual({});
    expect(daemon.calls.find((call) => call.method === "getUsers")?.args[0]).toEqual(
        expect.arrayContaining(["usr_ann", "usr_bo"]),
    );
});

it("gives a standalone task the viewer's own name and profile photo", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.profileSet({ name: "Steve", photo: { thumbhash: "me-hash" } });
    daemon.taskSeed({ id: "task_mine", ownerUserId: null, joinedKey: "a1" });
    const { watch } = harnessOpen(daemon);

    await vi.waitFor(() =>
        expect(taskIn(watch.tasks, "task_mine")?.owner).toEqual({
            name: "Steve",
            avatar: { url: "http://happy-agent.test/v0/profile/photo", thumbhash: "me-hash" },
        }),
    );
    expect(daemon.callCount("getUsers")).toBe(0);
});

it("keeps tasks and memberships current from the realtime events", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.taskSeed({ id: "task_a", name: "Alpha", joinedKey: "a1" });
    daemon.taskSeed({ id: "task_b", name: "Beta", joinedKey: "a2" });
    const { watch } = harnessOpen(daemon);
    await vi.waitFor(() => expect(watch.tasks).toHaveLength(2));
    await vi.waitFor(() => expect(daemon.streamLiveCount()).toBe(1));

    // Created: listed at once, then read whole for the caller's archive right
    // the event leaves out.
    const created = daemon.taskSeed({ id: "task_c", name: "Gamma", canArchive: true });
    const { canArchive: _omitted, ...broadcast } = created;
    daemon.eventEmit("task.created", { task: broadcast });
    await vi.waitFor(() => expect(taskIn(watch.tasks, "task_c")?.name).toBe("Gamma"));
    await vi.waitFor(() => expect(taskIn(watch.tasks, "task_c")?.canArchive).toBe(true));
    expect(
        daemon.calls.some((call) => call.method === "getTask" && call.args[0] === "task_c"),
    ).toBe(true);

    // Updated: a rename applied on the version chain.
    const before = daemon.taskGet("task_a");
    const version = daemon.versionNext();
    daemon.taskReplace({ ...before, name: "Alpha prime", version });
    daemon.eventEmit("task.updated", {
        taskId: "task_a",
        previousVersion: before.version,
        version,
        changes: { name: "Alpha prime" },
    });
    await vi.waitFor(() => expect(taskIn(watch.tasks, "task_a")?.name).toBe("Alpha prime"));

    // Joined, reordered, left: the viewer's own list, member-scoped events.
    daemon.eventEmit("task.joined", {
        membership: { joinedAt: 2, orderKey: "a0", taskId: "task_c", userId: null },
    });
    await vi.waitFor(() =>
        expect(taskIn(watch.tasks, "task_c")?.membership).toEqual({ orderKey: "a0", joinedAt: 2 }),
    );
    daemon.eventEmit("task.reordered", {
        membership: { joinedAt: 1, orderKey: "a9", taskId: "task_a", userId: null },
    });
    await vi.waitFor(() => expect(taskIn(watch.tasks, "task_a")?.membership?.orderKey).toBe("a9"));
    daemon.eventEmit("task.left", {
        membership: { joinedAt: 1, orderKey: "a2", taskId: "task_b", userId: null },
    });
    await vi.waitFor(() => expect(taskIn(watch.tasks, "task_b")?.membership).toBeUndefined());
    // Leaving takes the task off the viewer's list, not out of the catalog.
    expect(taskIn(watch.tasks, "task_b")?.name).toBe("Beta");
});

it("joins, moves, and leaves through the task routes, putting a join at the top", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.taskSeed({ id: "task_a", joinedKey: "a1" });
    daemon.taskSeed({ id: "task_b", joinedKey: "a2" });
    daemon.taskSeed({ id: "task_new" });
    const { connection, watch } = harnessOpen(daemon);
    await vi.waitFor(() => expect(watch.tasks).toHaveLength(3));

    connection.joinTask("task_new");
    await vi.waitFor(() => expect(taskIn(watch.tasks, "task_new")?.membership).toBeDefined());
    expect(taskIn(watch.tasks, "task_new")!.membership!.orderKey < "a1").toBe(true);

    connection.reorderTask("task_new", "task_b");
    await vi.waitFor(() =>
        expect(taskIn(watch.tasks, "task_new")!.membership!.orderKey > "a2").toBe(true),
    );
    expect(daemon.calls.find((call) => call.method === "reorderTask")?.args[1]).toMatchObject({
        afterId: "task_b",
    });

    connection.leaveTask("task_a");
    await vi.waitFor(() => expect(taskIn(watch.tasks, "task_a")?.membership).toBeUndefined());
});

it("archives against the task's version and states a refusal or a stale version plainly", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.taskSeed({ id: "task_owned", name: "Owned", canArchive: true, joinedKey: "a1" });
    daemon.taskSeed({ id: "task_theirs", name: "Theirs", joinedKey: "a2" });
    const { connection, rejections, watch } = harnessOpen(daemon);
    await vi.waitFor(() => expect(watch.tasks).toHaveLength(2));

    // Forbidden: the host's 403 becomes a sentence about who may archive.
    connection.archiveTask("task_theirs");
    await vi.waitFor(() => expect(rejections).toHaveLength(1));
    expect(rejections[0]).toMatchObject({ action: "archive_task" });
    expect(rejections[0]!.message).toContain("Only its owner or the team owner can");

    // Stale: the version moved without the client hearing, so the 409 reads
    // the task again and says to retry.
    const stale = daemon.taskGet("task_owned");
    const fresh = { ...stale, name: "Owned (renamed)", version: daemon.versionNext() };
    daemon.taskReplace(fresh);
    connection.archiveTask("task_owned");
    await vi.waitFor(() => expect(rejections).toHaveLength(2));
    expect(rejections[1]!.message).toContain("changed while you were looking at it");
    expect(
        daemon.calls.find((call) => call.method === "archiveTask" && call.args[0] === "task_owned")
            ?.args[1],
    ).toMatchObject({ ifMatch: stale.version });
    await vi.waitFor(() => expect(taskIn(watch.tasks, "task_owned")?.name).toBe("Owned (renamed)"));

    // Against the current version it goes through and the task reads archived.
    connection.archiveTask("task_owned");
    await vi.waitFor(() => expect(taskIn(watch.tasks, "task_owned")?.archived).toBe(true));
    expect(rejections).toHaveLength(2);
});
