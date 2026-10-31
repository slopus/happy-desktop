import { afterEach, expect, it, vi } from "vitest";
import {
    HappyAgentApiError,
    type Message,
    type MessageMode,
    type ServiceMessage,
} from "@slopus/happy-agent-client";
import { connectHappyAgent } from "./connectHappyAgent.js";
import type {
    HappyAgentConnection,
    MutationRejectedDelta,
    SessionState,
    TaskGroup,
} from "./types.js";
import {
    fakeAgentMessage,
    fakeHappyAgentDaemonCreate,
    fakeRun,
    type FakeHappyAgentDaemon,
} from "../testing/fakeHappyAgentDaemon.js";

/* Tasks reach the window through the same groups subscription bots do: the
 * bootstrap lists them with the viewer's memberships, the realtime events keep
 * both current, and in team mode each task carries its owner's face through the
 * user directory. A standalone daemon's tasks are all the viewer's own and
 * carry no owner. */

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

it("shows no owner for a standalone task, since every task there is the viewer's own", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.profileSet({ name: "Steve", photo: { thumbhash: "me-hash" } });
    daemon.taskSeed({ id: "task_mine", ownerUserId: null, joinedKey: "a1" });
    const { watch } = harnessOpen(daemon);

    await vi.waitFor(() => expect(taskIn(watch.tasks, "task_mine")).toBeDefined());
    expect(taskIn(watch.tasks, "task_mine")?.owner).toBeNull();
    // No face is resolved for anyone: neither the directory nor a photo route.
    expect(daemon.callCount("getUsers")).toBe(0);
    expect(JSON.stringify(watch.tasks)).not.toContain("/photo");
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

it("creates a task under the ids it chose, joined at the top of the viewer's list", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.taskSeed({ id: "task_a", joinedKey: "a1" });
    const { connection, watch } = harnessOpen(daemon);
    await vi.waitFor(() => expect(watch.tasks).toHaveLength(1));

    const creation = connection.createTask("Invoice rounding");
    const task = await creation.task;
    expect(task).toMatchObject({
        id: creation.taskId,
        name: "Invoice rounding",
        workspaceId: creation.workspaceId,
    });
    expect(task.agent.id).toBe(creation.agentId);
    // The task's own id is the retry key, so a resent create makes nothing new.
    expect(daemon.calls.find((call) => call.method === "createTask")?.args[0]).toMatchObject({
        agentId: creation.agentId,
        id: creation.taskId,
        mutationId: creation.taskId,
        name: "Invoice rounding",
        workspaceId: creation.workspaceId,
    });
    await vi.waitFor(() => expect(taskIn(watch.tasks, creation.taskId)?.membership).toBeDefined());
    expect(taskIn(watch.tasks, creation.taskId)!.membership!.orderKey < "a1").toBe(true);

    // Without a name the host gives one, and names it again from its first message.
    const unnamed = connection.createTask();
    expect((await unnamed.task).name).toBe("New Task");
    expect(
        daemon.calls.filter((call) => call.method === "createTask")[1]?.args[0],
    ).not.toHaveProperty("name");
});

it("rejects a refused create with the host's reason and lists nothing", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.failOnce("createTask", new Error("The task's folder could not be created."));
    const { connection, watch } = harnessOpen(daemon);
    await vi.waitFor(() => expect(daemon.streamLiveCount()).toBe(1));

    await expect(connection.createTask("Nope").task).rejects.toThrow(
        "The task's folder could not be created.",
    );
    expect(watch.tasks).toHaveLength(0);
});

it("renames against the task's version and says so when the version moved", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.taskSeed({ id: "task_a", name: "Alpha", joinedKey: "a1" });
    const { connection, rejections, watch } = harnessOpen(daemon);
    await vi.waitFor(() => expect(watch.tasks).toHaveLength(1));

    const before = daemon.taskGet("task_a");
    connection.renameTask("task_a", "Alpha prime");
    await vi.waitFor(() => expect(taskIn(watch.tasks, "task_a")?.name).toBe("Alpha prime"));
    expect(daemon.calls.find((call) => call.method === "renameTask")?.args).toMatchObject([
        "task_a",
        { name: "Alpha prime" },
        { ifMatch: before.version },
    ]);

    // Stale: the 409 reads the task again and asks for another try.
    daemon.taskReplace({ ...daemon.taskGet("task_a"), version: daemon.versionNext() });
    connection.renameTask("task_a", "Alpha again");
    await vi.waitFor(() => expect(rejections).toHaveLength(1));
    expect(rejections[0]).toMatchObject({ action: "rename_task" });
    expect(rejections[0]!.message).toContain("changed while you were renaming it");
    expect(taskIn(watch.tasks, "task_a")?.name).toBe("Alpha prime");
});

const ANTIGRAVITY_FLASH_MODE: MessageMode = {
    effort: "high",
    modelId: "antigravity/gemini-3.8-flash",
    permissionMode: "auto",
    providerId: "antigravity",
    serviceTier: null,
};

function antigravityCatalogSeed(daemon: FakeHappyAgentDaemon): void {
    const base = daemon.configGet();
    daemon.configSet({
        ...base,
        models: {
            ...base.models,
            "antigravity/gemini-3.8-flash": {
                autoCompactWindow: 800_000,
                contextWindow: 1_000_000,
                defaultEffort: "high",
                efforts: ["low", "medium", "high"],
                name: "Gemini 3.8 Flash",
                serviceTiers: [],
                serviceTierOptions: [{ id: null, label: "Regular" }],
            },
        },
        providers: {
            ...base.providers,
            antigravity: {
                enabled: true,
                models: [{ enabled: true, id: "antigravity/gemini-3.8-flash" }],
                type: "antigravity",
            },
            antigravity_alias: {
                enabled: true,
                models: [{ enabled: true, id: "antigravity/gemini-3.8-flash" }],
                type: "antigravity",
            },
        },
    });
}

function configurationServiceMessage(
    id: string,
    after: MessageMode,
    beforeMessageId: string | null = null,
): ServiceMessage {
    return {
        content: [
            {
                after,
                before: null,
                beforeMessageId,
                type: "configuration",
            },
        ],
        createdAt: 2,
        id,
        metadata: {},
        role: "service",
    };
}

function sessionWatch(connection: HappyAgentConnection, sessionId: string) {
    const state: { current: SessionState | undefined } = { current: undefined };
    const subscription = connection.connectSession({
        sessionId,
        onChange(_elements, session) {
            state.current = session;
        },
    });
    return {
        close: () => subscription.close(),
        session: () => state.current ?? subscription.session(),
    };
}

it("keeps an Antigravity task's selected model before and after a first agent-role message across open, reopen, and reconnect", async () => {
    for (const teamMode of [false, true]) {
        const daemon = fakeHappyAgentDaemonCreate();
        antigravityCatalogSeed(daemon);
        if (teamMode) daemon.profileSet({ userId: "usr_me", name: "Me" });

        // Case (a): task created with an explicit Antigravity Flash creation draft.
        // At ebb73c25, first agent-role acceptance writes lastMode and clears internal
        // initialMode, while the creation draft itself persists.
        const taskWithDraft = daemon.taskSeed({
            id: "task_ag_draft",
            name: "Antigravity Task With Draft",
            ownerUserId: teamMode ? "usr_me" : null,
            joinedKey: "a1",
        });
        const draftAgentId = taskWithDraft.agent.id;
        daemon.modeSeed(draftAgentId, null);
        const creationDraft = {
            value: { ...ANTIGRAVITY_FLASH_MODE, text: "" },
            updatedAt: 100,
        } as const;
        daemon.draftSeed(draftAgentId, creationDraft);

        // Case (b): task with no draft (no model chosen at creation, or legacy) where
        // bootstrap.mode starts null and the daemon writes lastMode = Flash on the
        // first agent-role delivery.
        const taskWithoutDraft = daemon.taskSeed({
            id: "task_ag_nodraft",
            name: "Antigravity Task Without Draft",
            ownerUserId: teamMode ? "usr_me" : null,
            joinedKey: "a2",
        });
        const noDraftAgentId = taskWithoutDraft.agent.id;
        daemon.modeSeed(noDraftAgentId, null);
        daemon.draftSeed(noDraftAgentId, { value: null, updatedAt: null });

        const { connection, watch } = harnessOpen(daemon);
        await vi.waitFor(() => expect(taskIn(watch.tasks, "task_ag_draft")).toBeDefined());
        await vi.waitFor(() => expect(taskIn(watch.tasks, "task_ag_nodraft")).toBeDefined());
        await vi.waitFor(() => expect(daemon.streamLiveCount()).toBe(1));

        if (teamMode) {
            // Team creation transactionally emits the owner's creation draft.
            daemon.eventEmit("agent.draft.updated", {
                agentId: draftAgentId,
                draft: creationDraft,
            });
            await vi.waitFor(() =>
                expect(taskIn(watch.tasks, "task_ag_draft")?.session).toMatchObject({
                    effort: "high",
                    modelId: "antigravity/gemini-3.8-flash",
                    providerId: "antigravity",
                }),
            );
        }

        // Open both tasks while idle (before first message).
        const openWithDraft = sessionWatch(connection, draftAgentId);
        const openWithoutDraft = sessionWatch(connection, noDraftAgentId);
        await vi.waitFor(() => expect(openWithDraft.session().historyLoading).not.toBe(true));
        await vi.waitFor(() => expect(openWithoutDraft.session().historyLoading).not.toBe(true));
        expect(openWithDraft.session()).toMatchObject({
            effort: "high",
            modelId: "antigravity/gemini-3.8-flash",
            providerId: "antigravity",
            selectionKnown: true,
        });
        expect(taskIn(watch.tasks, "task_ag_draft")?.session).toMatchObject({
            effort: "high",
            modelId: "antigravity/gemini-3.8-flash",
            providerId: "antigravity",
        });

        // Deliver first accepted message in role: "agent" (e.g. Chief of Staff) to both tasks.
        // The daemon writes lastMode = ANTIGRAVITY_FLASH_MODE on acceptance; on taskWithDraft
        // the creation draft persists (no agent.draft.updated { value: null }).
        for (const [agentId, taskId] of [
            [draftAgentId, "task_ag_draft"],
            [noDraftAgentId, "task_ag_nodraft"],
        ] as const) {
            const inbound = fakeAgentMessage({
                content: [{ type: "text", text: "Run on Antigravity Flash" }],
                id: `msg_inbound_${taskId}`,
                metadata: { senderAgentId: "agent_chief" },
            });
            const reply = fakeAgentMessage({
                content: [{ type: "text", text: "Done on Flash." }],
                id: `msg_reply_${taskId}`,
            });
            const run = fakeRun({
                id: `run_${taskId}`,
                messages: [inbound, reply],
                status: "completed",
            });
            daemon.modeSeed(agentId, ANTIGRAVITY_FLASH_MODE);
            daemon.historySet(agentId, [run]);

            daemon.eventEmit("run.started", {
                acceptedMessageIds: [inbound.id],
                agentId,
                run: { ...run, endedAt: null, status: "running" },
            });
            daemon.eventEmit("message.created", { agentId, message: inbound, runId: run.id });
            daemon.eventEmit("message.created", { agentId, message: reply, runId: run.id });
            daemon.eventEmit("run.finished", { agentId, run });
        }

        // Both open sessions and the task list must show Antigravity Flash (not "test-model").
        await vi.waitFor(() =>
            expect(openWithoutDraft.session()).toMatchObject({
                effort: "high",
                modelId: "antigravity/gemini-3.8-flash",
                providerId: "antigravity",
                selectionKnown: true,
            }),
        );
        expect(openWithDraft.session()).toMatchObject({
            effort: "high",
            modelId: "antigravity/gemini-3.8-flash",
            providerId: "antigravity",
            selectionKnown: true,
        });
        expect(taskIn(watch.tasks, "task_ag_draft")?.session).toMatchObject({
            effort: "high",
            modelId: "antigravity/gemini-3.8-flash",
            providerId: "antigravity",
        });
        expect(taskIn(watch.tasks, "task_ag_nodraft")?.session).toMatchObject({
            effort: "high",
            modelId: "antigravity/gemini-3.8-flash",
            providerId: "antigravity",
        });

        // Close and reopen without a new bootstrap fetch: cached entries retain Antigravity Flash.
        openWithDraft.close();
        openWithoutDraft.close();
        const reopenedWithDraft = sessionWatch(connection, draftAgentId);
        const reopenedWithoutDraft = sessionWatch(connection, noDraftAgentId);
        expect(reopenedWithDraft.session()).toMatchObject({
            effort: "high",
            modelId: "antigravity/gemini-3.8-flash",
            providerId: "antigravity",
            selectionKnown: true,
        });
        expect(reopenedWithoutDraft.session()).toMatchObject({
            effort: "high",
            modelId: "antigravity/gemini-3.8-flash",
            providerId: "antigravity",
            selectionKnown: true,
        });

        // Reconnect with a stream gap: full reconciliation preserves Antigravity Flash for both.
        daemon.gapOnNextStream();
        daemon.streamDropAll();
        await vi.waitFor(() =>
            expect(
                daemon.calls.filter(
                    (call) =>
                        call.method === "getAgentBootstrap" && call.args[0] === noDraftAgentId,
                ).length,
            ).toBeGreaterThanOrEqual(2),
        );
        await vi.waitFor(() => expect(reopenedWithDraft.session().historyLoading).not.toBe(true));
        await vi.waitFor(() =>
            expect(reopenedWithoutDraft.session().historyLoading).not.toBe(true),
        );
        expect(reopenedWithDraft.session()).toMatchObject({
            effort: "high",
            modelId: "antigravity/gemini-3.8-flash",
            providerId: "antigravity",
            selectionKnown: true,
        });
        expect(reopenedWithoutDraft.session()).toMatchObject({
            effort: "high",
            modelId: "antigravity/gemini-3.8-flash",
            providerId: "antigravity",
            selectionKnown: true,
        });
        reopenedWithDraft.close();
        reopenedWithoutDraft.close();
        connection.close();
    }
});

it("re-reads stored mode via getAgentMode on non-user acceptance and never overwrites stored mode or routing aliases from configuration blocks or stale mode reads", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    antigravityCatalogSeed(daemon);
    const task = daemon.taskSeed({ id: "task_cfg_isolation", joinedKey: "a1" });
    const agentId = task.agent.id;
    daemon.modeSeed(agentId, null);
    daemon.draftSeed(agentId, { value: null, updatedAt: null });

    const { connection, watch } = harnessOpen(daemon);
    await vi.waitFor(() => expect(taskIn(watch.tasks, "task_cfg_isolation")).toBeDefined());
    await vi.waitFor(() => expect(daemon.streamLiveCount()).toBe(1));

    const opened = sessionWatch(connection, agentId);
    await vi.waitFor(() => expect(opened.session().historyLoading).not.toBe(true));

    // 1. Non-user message accepted on run.boundary updates stored mode via getAgentMode.
    const inbound = fakeAgentMessage({
        content: [{ type: "text", text: "Subtask instruction" }],
        id: "msg_agent_in_1",
        metadata: { senderAgentId: "agent_chief" },
    });
    const run0 = fakeRun({ id: "run_0", messages: [], status: "completed" });
    const run1 = fakeRun({ id: "run_1", messages: [inbound], status: "running", endedAt: null });
    daemon.modeSeed(agentId, ANTIGRAVITY_FLASH_MODE);
    daemon.eventEmit("run.boundary", {
        acceptedMessageIds: [inbound.id],
        agentId,
        finishedRun: run0,
        startedRun: run1,
    });
    await vi.waitFor(() =>
        expect(opened.session()).toMatchObject({
            effort: "high",
            modelId: "antigravity/gemini-3.8-flash",
            providerId: "antigravity",
            selectionKnown: true,
        }),
    );

    // 2. A user message whose providerId is a routing alias ("antigravity_alias") followed by
    // a service configuration row with the concrete providerId ("antigravity") keeps the alias.
    const aliasMode: MessageMode = {
        ...ANTIGRAVITY_FLASH_MODE,
        providerId: "antigravity_alias",
    };
    const userAliasMsg: Message = {
        content: [{ text: "Use alias route", type: "text" }],
        createdAt: 10,
        delivery: "steer",
        id: "msg_user_alias",
        metadata: {},
        mode: aliasMode,
        role: "user",
        runId: run1.id,
        status: "accepted",
    };
    daemon.modeSeed(agentId, aliasMode);
    daemon.eventEmit("message.created", { agentId, message: userAliasMsg, runId: run1.id });
    const concreteConfigMsg = configurationServiceMessage(
        "msg_cfg_concrete",
        ANTIGRAVITY_FLASH_MODE,
        userAliasMsg.id,
    );
    daemon.eventEmit("message.created", { agentId, message: concreteConfigMsg, runId: run1.id });
    const postConcreteReply = fakeAgentMessage({
        content: [{ type: "text", text: "Routed via concrete provider" }],
        id: "msg_reply_concrete",
    });
    daemon.eventEmit("message.created", { agentId, message: postConcreteReply, runId: run1.id });
    await vi.waitFor(() =>
        expect(opened.session()).toMatchObject({
            effort: "high",
            modelId: "antigravity/gemini-3.8-flash",
            providerId: "antigravity_alias",
            selectionKnown: true,
        }),
    );
    expect(taskIn(watch.tasks, "task_cfg_isolation")?.session).toMatchObject({
        effort: "high",
        modelId: "antigravity/gemini-3.8-flash",
        providerId: "antigravity_alias",
    });

    // 3. A mid-run configuration row (beforeMessageId: null, e.g. account/fallback switch)
    // does not move the picker.
    const fallbackConfigMsg = configurationServiceMessage(
        "msg_cfg_fallback",
        {
            effort: "medium",
            modelId: "test-model",
            permissionMode: "auto",
            providerId: "test-provider",
            serviceTier: null,
        },
        null,
    );
    daemon.eventEmit("message.created", { agentId, message: fallbackConfigMsg, runId: run1.id });
    const postFallbackReply = fakeAgentMessage({
        content: [{ type: "text", text: "Continued after mid-run config" }],
        id: "msg_reply_fallback",
    });
    daemon.eventEmit("message.created", { agentId, message: postFallbackReply, runId: run1.id });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(opened.session()).toMatchObject({
        effort: "high",
        modelId: "antigravity/gemini-3.8-flash",
        providerId: "antigravity_alias",
        selectionKnown: true,
    });

    // 4. Stale getAgentMode response in flight does not overwrite a newer user message mode.
    const releaseModeRead = daemon.pause("getAgentMode");
    const run2 = fakeRun({ id: "run_2", messages: [], status: "running", endedAt: null });
    daemon.modeSeed(agentId, ANTIGRAVITY_FLASH_MODE);
    daemon.eventEmit("run.boundary", {
        acceptedMessageIds: ["msg_agent_in_2"],
        agentId,
        finishedRun: { ...run1, endedAt: 15, status: "completed" },
        startedRun: run2,
    });
    await vi.waitFor(() =>
        expect(daemon.calls.filter((call) => call.method === "getAgentMode").length).toBe(2),
    );
    const newerUserMode: MessageMode = {
        effort: "medium",
        modelId: "test-model",
        permissionMode: "auto",
        providerId: "test-provider",
        serviceTier: null,
    };
    daemon.modeSeed(agentId, newerUserMode);
    daemon.eventEmit("message.created", {
        agentId,
        message: {
            content: [{ text: "Switch to test-model", type: "text" }],
            createdAt: 20,
            delivery: "steer",
            id: "msg_user_newer",
            metadata: {},
            mode: newerUserMode,
            role: "user",
            runId: run2.id,
            status: "accepted",
        },
        runId: run2.id,
    });
    await vi.waitFor(() =>
        expect(opened.session()).toMatchObject({
            modelId: "test-model",
            providerId: "test-provider",
        }),
    );
    // Re-seed the stale mode before releasing the paused read so the in-flight response
    // resolves with ANTIGRAVITY_FLASH_MODE; modeRevisions must reject it.
    daemon.modeSeed(agentId, ANTIGRAVITY_FLASH_MODE);
    releaseModeRead();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(opened.session()).toMatchObject({
        modelId: "test-model",
        providerId: "test-provider",
    });

    opened.close();
    connection.close();
});

it("holds a pre-bootstrap draft save past the 300ms debounce window while loading, flushes on bootstrap failure + view close or drain recovery, and sends the reconciled creation mode", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    antigravityCatalogSeed(daemon);
    const task = daemon.taskSeed({ id: "task_draft_race", joinedKey: "a1" });
    const agentId = task.agent.id;
    daemon.modeSeed(agentId, null);
    daemon.draftSeed(agentId, {
        value: { ...ANTIGRAVITY_FLASH_MODE, text: "" },
        updatedAt: 100,
    });
    const failedTask = daemon.taskSeed({ id: "task_draft_fail", joinedKey: "a2" });
    const failedAgentId = failedTask.agent.id;
    daemon.modeSeed(failedAgentId, null);
    const retryTask = daemon.taskSeed({ id: "task_draft_retry", joinedKey: "a3" });
    const retryAgentId = retryTask.agent.id;
    daemon.modeSeed(retryAgentId, null);
    daemon.draftSeed(retryAgentId, {
        value: { ...ANTIGRAVITY_FLASH_MODE, text: "" },
        updatedAt: 100,
    });

    const { connection, watch } = harnessOpen(daemon);
    await vi.waitFor(() => expect(taskIn(watch.tasks, "task_draft_race")).toBeDefined());
    await vi.waitFor(() => expect(taskIn(watch.tasks, "task_draft_fail")).toBeDefined());
    await vi.waitFor(() => expect(taskIn(watch.tasks, "task_draft_retry")).toBeDefined());
    await vi.waitFor(() => expect(daemon.streamLiveCount()).toBe(1));

    // Hold getAgentBootstrap past the 300ms debounce window while the user types a draft.
    const releaseBootstrap = daemon.pause("getAgentBootstrap");
    const opened = sessionWatch(connection, agentId);
    const saveMutationId = connection.setDraft(agentId, {
        draft: "User words typed early",
        updatedAt: 500,
    });
    expect(opened.session().draft).toBe("User words typed early");

    await new Promise((resolve) => setTimeout(resolve, 360));
    // While bootstrap is still in flight and mode is unhydrated, saveAgentDraft must not
    // be sent with the default mode even after the 300ms debounce timer fires.
    expect(daemon.calls.filter((call) => call.method === "saveAgentDraft")).toHaveLength(0);

    // If the first saveAgentDraft after hydration hits a 503 draining refusal, the reconciled
    // save is held (never dropped or sent twice) and flushed once with the same mutationId.
    daemon.failOnce(
        "saveAgentDraft",
        new HappyAgentApiError(503, "Happy Agent is draining.", "draining", null),
    );

    // Release bootstrap: the held draft save is reconciled to Antigravity Flash and attempted.
    releaseBootstrap();
    await vi.waitFor(() => expect(opened.session().historyLoading).not.toBe(true));
    await vi.waitFor(() =>
        expect(daemon.calls.filter((call) => call.method === "saveAgentDraft")).toHaveLength(1),
    );

    // Reconnect after the draining refusal: the held reconciled save flushes once.
    daemon.daemonReplace({ version: "0.4.75" });
    await vi.waitFor(() =>
        expect(daemon.calls.filter((call) => call.method === "saveAgentDraft")).toHaveLength(2),
    );
    const draftSaveCalls = daemon.calls.filter((call) => call.method === "saveAgentDraft");
    for (const call of draftSaveCalls) {
        expect(call.args[0]).toBe(agentId);
        expect(call.args[1]).toMatchObject({
            draft: {
                ...ANTIGRAVITY_FLASH_MODE,
                text: "User words typed early",
            },
            mutationId: saveMutationId,
            updatedAt: 500,
        });
    }
    expect(opened.session()).toMatchObject({
        draft: "User words typed early",
        draftUpdatedAt: 500,
        effort: "high",
        modelId: "antigravity/gemini-3.8-flash",
        providerId: "antigravity",
        selectionKnown: true,
    });

    // Stale creation draft event (updatedAt: 100 < 500) must not overwrite the newer user draft.
    daemon.eventEmit("agent.draft.updated", {
        agentId,
        draft: {
            value: { ...ANTIGRAVITY_FLASH_MODE, text: "" },
            updatedAt: 100,
        },
    });
    expect(opened.session().draft).toBe("User words typed early");

    // Explicit user model change (intended -> draft) wins over stored mode and survives reopen.
    connection.switchModel(agentId, { modelId: "test-model", providerId: "test-provider" });
    await vi.waitFor(() =>
        expect(opened.session()).toMatchObject({
            draft: "User words typed early",
            modelId: "test-model",
            providerId: "test-provider",
        }),
    );
    opened.close();
    const reopened = sessionWatch(connection, agentId);
    expect(reopened.session()).toMatchObject({
        draft: "User words typed early",
        modelId: "test-model",
        providerId: "test-provider",
    });
    reopened.close();

    // D4: If getAgentBootstrap fails once with the view still open, the held draft save
    // must keep waiting for the scheduled retry rather than flushing the default mode and
    // overwriting the task's Flash creation draft on the daemon.
    const releaseFirstAttempt = daemon.pause("getAgentBootstrap");
    daemon.failOnce(
        "getAgentBootstrap",
        new HappyAgentApiError(500, "Bootstrap failed once.", null, null),
    );
    const retryOpen = sessionWatch(connection, retryAgentId);
    connection.setDraft(retryAgentId, {
        draft: "Words typed before transient bootstrap failure",
        updatedAt: 600,
    });
    await new Promise((resolve) => setTimeout(resolve, 360));
    expect(
        daemon.calls.filter(
            (call) => call.method === "saveAgentDraft" && call.args[0] === retryAgentId,
        ),
    ).toHaveLength(0);
    releaseFirstAttempt();
    const releaseRetryAttempt = daemon.pause("getAgentBootstrap");
    await vi.waitFor(() =>
        expect(
            daemon.calls.filter(
                (call) => call.method === "getAgentBootstrap" && call.args[0] === retryAgentId,
            ),
        ).toHaveLength(2),
    );
    expect(
        daemon.calls.filter(
            (call) => call.method === "saveAgentDraft" && call.args[0] === retryAgentId,
        ),
    ).toHaveLength(0);
    releaseRetryAttempt();
    await vi.waitFor(() => expect(retryOpen.session().historyLoading).not.toBe(true));
    await vi.waitFor(() =>
        expect(
            daemon.calls.filter(
                (call) => call.method === "saveAgentDraft" && call.args[0] === retryAgentId,
            ),
        ).toHaveLength(1),
    );
    const retrySaveCall = daemon.calls.find(
        (call) => call.method === "saveAgentDraft" && call.args[0] === retryAgentId,
    );
    expect(retrySaveCall?.args[1]).toMatchObject({
        draft: {
            ...ANTIGRAVITY_FLASH_MODE,
            text: "Words typed before transient bootstrap failure",
        },
        updatedAt: 600,
    });
    expect(retryOpen.session()).toMatchObject({
        draft: "Words typed before transient bootstrap failure",
        draftUpdatedAt: 600,
        effort: "high",
        modelId: "antigravity/gemini-3.8-flash",
        providerId: "antigravity",
        selectionKnown: true,
    });
    retryOpen.close();

    // D2: If getAgentBootstrap rejects and the reader closes the view, the held draft save
    // is still flushed with the user's text rather than lost.
    const releaseFailedBootstrap = daemon.pause("getAgentBootstrap");
    daemon.failOnce(
        "getAgentBootstrap",
        new HappyAgentApiError(500, "Bootstrap failed.", null, null),
    );
    const failedOpen = sessionWatch(connection, failedAgentId);
    connection.setDraft(failedAgentId, {
        draft: "Words typed before bootstrap failed",
        updatedAt: 700,
    });
    await new Promise((resolve) => setTimeout(resolve, 360));
    expect(
        daemon.calls.filter(
            (call) => call.method === "saveAgentDraft" && call.args[0] === failedAgentId,
        ),
    ).toHaveLength(0);
    releaseFailedBootstrap();
    failedOpen.close();
    await vi.waitFor(() =>
        expect(
            daemon.calls.filter(
                (call) => call.method === "saveAgentDraft" && call.args[0] === failedAgentId,
            ),
        ).toHaveLength(1),
    );
    const failedSaveCall = daemon.calls.find(
        (call) => call.method === "saveAgentDraft" && call.args[0] === failedAgentId,
    );
    expect(failedSaveCall?.args[1]).toMatchObject({
        draft: {
            modelId: "test-model",
            providerId: "test-provider",
            text: "Words typed before bootstrap failed",
        },
        updatedAt: 700,
    });

    connection.close();
});
