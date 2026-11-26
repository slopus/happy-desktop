import { afterEach, describe, expect, it, vi } from "vitest";
import type { Agent } from "@slopus/happy-agent-client";
import { connectHappyAgent } from "../happyAgentConnection/connectHappyAgent.js";
import type { GroupSession, HappyAgentConnection } from "../happyAgentConnection/types.js";
import {
    fakeHappyAgentDaemonCreate,
    type FakeHappyAgentDaemon,
} from "../testing/fakeHappyAgentDaemon.js";
import { happyAgentChatStoreCreate, type HappyAgentChatOutput } from "./happyAgentChatStore.js";
import { happyAgentModelCatalogProject } from "./happyAgentProject.js";
import type { HappyAgentSessionId } from "./happyAgentTypes.js";

/* A conversation whose own turn has ended keeps a Stop while the agents it
 * delegated to are working, and that Stop aborts each working child — never
 * the conversation itself. */

const openConnections: HappyAgentConnection[] = [];

afterEach(() => {
    for (const connection of openConnections.splice(0)) connection.close();
});

function harness(seed: (daemon: FakeHappyAgentDaemon, projectId: string) => void) {
    const daemon = fakeHappyAgentDaemonCreate();
    const project = daemon.projectSeed({ id: "project-a" });
    daemon.agentSeed(project.id, { id: "agent-a" });
    seed(daemon, project.id);
    const connection = connectHappyAgent({
        endpoint: "http://happy-agent.test/",
        token: "token",
        client: daemon.client,
        wait: () => new Promise((resolve) => setTimeout(resolve, 0)),
        now: () => 1_000,
    });
    openConnections.push(connection);
    connection.connectGroups({ onChange: () => undefined, onError: () => undefined });
    const outputs: HappyAgentChatOutput[] = [];
    const store = happyAgentChatStoreCreate("agent-a" as HappyAgentSessionId, {
        catalog: happyAgentModelCatalogProject(daemon.configGet()),
        transcriptConnect: (options) => {
            const session = connection.connectSession({
                sessionId: options.sessionId,
                onChange: (elements, state) => options.onChange(elements, state, []),
                onError: options.onError,
            });
            return { close: () => session.close(), loadMore: (token) => session.loadMore(token) };
        },
        connectActions: connection,
        connectMutationSubscribe: (listener) =>
            connection.connectGroups({
                onChange: () => undefined,
                onError: () => undefined,
                onDelta: (delta) => {
                    if (delta.type === "mutation_rejected") listener(delta);
                },
            }).close,
        output: (event) => outputs.push(event),
    });
    const unsubscribe = store.subscribe(() => undefined);
    const dispose = () => {
        store[Symbol.dispose]();
        unsubscribe();
    };
    return { daemon, connection, store, outputs, dispose };
}

/** Publishes an agent change the way the daemon's event stream does. */
function agentUpdate(daemon: FakeHappyAgentDaemon, agentId: string, changes: Partial<Agent>) {
    const previous = daemon.agentGet(agentId);
    const version = daemon.versionNext();
    daemon.agentReplace({ ...previous, ...changes, version });
    daemon.eventEmit("agent.updated", {
        agentId,
        previousVersion: previous.version,
        version,
        changes,
    });
}

function child(
    daemon: FakeHappyAgentDaemon,
    projectId: string,
    id: string,
    overrides: Partial<Agent> = {},
): Agent {
    return daemon.agentSeed(projectId, {
        id,
        parentAgentId: "agent-a",
        orderKey: null,
        ...overrides,
    });
}

describe("stopping a conversation's subagents", () => {
    it("reports subagent work while the conversation's own turn is idle, until it ends", async () => {
        const { daemon, store, dispose } = harness((daemon, projectId) => {
            const worker = child(daemon, projectId, "child-working", { status: "working" });
            daemon.agentReplace({
                ...daemon.agentGet("agent-a"),
                subagents: { total: 1, running: 1 },
            });
            daemon.activitySet("agent-a", { subagents: [worker], processes: [] });
        });
        await vi.waitFor(() => expect(store.get().ready).toBe(true));
        expect(store.get().runStatus).toBe("idle");
        expect(store.get().subagentsRunning).toBe(true);

        agentUpdate(daemon, "child-working", { status: "idle" });
        agentUpdate(daemon, "agent-a", { subagents: { total: 1, running: 0 } });
        await vi.waitFor(() => expect(store.get().subagentsRunning).toBe(false));
        expect(store.get().runStatus).toBe("idle");
        dispose();
    });

    it("counts a child that is idle while its own subagents still work", async () => {
        const { store, dispose } = harness((daemon, projectId) => {
            const coordinator = child(daemon, projectId, "child-coordinator", {
                status: "idle",
                subagents: { total: 1, running: 1 },
            });
            daemon.activitySet("agent-a", { subagents: [coordinator], processes: [] });
        });
        await vi.waitFor(() => expect(store.get().ready).toBe(true));
        expect(store.get().subagentsRunning).toBe(true);
        dispose();
    });

    it("reports nothing when every delegated agent is finished or archived", async () => {
        const { store, dispose } = harness((daemon, projectId) => {
            const finished = child(daemon, projectId, "child-finished");
            const archived = child(daemon, projectId, "child-archived", {
                archivedAt: 5,
                status: "working",
            });
            daemon.activitySet("agent-a", { subagents: [finished, archived], processes: [] });
        });
        await vi.waitFor(() => expect(store.get().ready).toBe(true));
        expect(store.get().subagentsRunning).toBe(false);
        dispose();
    });

    it("aborts each working child on its own and leaves the conversation alone", async () => {
        const { daemon, store, outputs, dispose } = harness((daemon, projectId) => {
            const worker = child(daemon, projectId, "child-working", { status: "working" });
            const coordinator = child(daemon, projectId, "child-coordinator", {
                subagents: { total: 1, running: 1 },
            });
            const finished = child(daemon, projectId, "child-finished");
            const archived = child(daemon, projectId, "child-archived", {
                archivedAt: 5,
                status: "working",
            });
            daemon.agentReplace({
                ...daemon.agentGet("agent-a"),
                subagents: { total: 4, running: 1 },
            });
            daemon.activitySet("agent-a", {
                subagents: [worker, coordinator, finished, archived],
                processes: [],
            });
        });
        await vi.waitFor(() => expect(store.get().subagentsRunning).toBe(true));
        // A child that started after the conversation was opened is stopped too:
        // what is working is read again when Stop is confirmed.
        const late = daemon.agentSeed("project-a", {
            id: "child-late",
            parentAgentId: "agent-a",
            orderKey: null,
            status: "thinking",
        });
        const activity = await daemon.client.getAgentActivity("agent-a");
        daemon.activitySet("agent-a", { ...activity, subagents: [...activity.subagents, late] });
        const readsBefore = daemon.callCount("getAgentActivity");

        await store.subagentsAbort();

        await vi.waitFor(() => expect(daemon.callCount("abortAgent")).toBe(3));
        expect(daemon.callCount("getAgentActivity")).toBe(readsBefore + 1);
        const aborts = daemon.calls.filter((call) => call.method === "abortAgent");
        expect(aborts.map((call) => call.args[0]).sort()).toEqual([
            "child-coordinator",
            "child-late",
            "child-working",
        ]);
        // Each abort is its own mutation, and none is guarded by a run.
        const requests = aborts.map((call) => call.args[1] as { mutationId: string });
        expect(new Set(requests.map((request) => request.mutationId)).size).toBe(3);
        for (const request of requests) expect(request).toEqual({ mutationId: expect.any(String) });
        expect(outputs).toEqual([{ type: "subagentsAborted", sessionId: "agent-a" }]);
        expect(store.get().entries.some((entry) => entry.kind === "notice")).toBe(false);
        dispose();
    });

    it("still stops the other children when one abort is refused, and says so", async () => {
        const { daemon, store, dispose } = harness((daemon, projectId) => {
            const first = child(daemon, projectId, "child-first", { status: "working" });
            const second = child(daemon, projectId, "child-second", { status: "working" });
            daemon.agentReplace({
                ...daemon.agentGet("agent-a"),
                subagents: { total: 2, running: 2 },
            });
            daemon.activitySet("agent-a", { subagents: [first, second], processes: [] });
        });
        await vi.waitFor(() => expect(store.get().subagentsRunning).toBe(true));
        daemon.failOnce("abortAgent", new Error("The agent could not be stopped."));

        await store.subagentsAbort();

        await vi.waitFor(() =>
            expect(
                store
                    .get()
                    .entries.find(
                        (entry) =>
                            entry.kind === "notice" &&
                            entry.variant === "notice" &&
                            entry.title === "Action not applied",
                    ),
            ).toMatchObject({ text: "The agent could not be stopped." }),
        );
        expect(
            daemon.calls.filter((call) => call.method === "abortAgent").map((call) => call.args[0]),
        ).toEqual(["child-first", "child-second"]);
        dispose();
    });

    it("leaves the conversation's own Stop exactly as it was", async () => {
        const { daemon, store, dispose } = harness((daemon, projectId) => {
            const worker = child(daemon, projectId, "child-working", { status: "working" });
            daemon.activitySet("agent-a", { subagents: [worker], processes: [] });
        });
        await vi.waitFor(() => expect(store.get().ready).toBe(true));

        await store.runAbort();

        await vi.waitFor(() => expect(daemon.callCount("abortAgent")).toBe(1));
        const abort = daemon.calls.find((call) => call.method === "abortAgent");
        expect(abort?.args[0]).toBe("agent-a");
        dispose();
    });
});

/** The conversation's row as the connection projects it into the catalog. */
async function row(connection: HappyAgentConnection, sessionId = "agent-a"): Promise<GroupSession> {
    let found: GroupSession | undefined;
    const groups = connection.connectGroups({
        onChange: (projects) => {
            found =
                projects
                    .flatMap((project) => project.sessions)
                    .find((session) => session.id === sessionId) ?? found;
        },
        onError: () => undefined,
    });
    await vi.waitFor(() => expect(found).toBeDefined());
    groups.close();
    if (found === undefined) throw new Error(`No row for ${sessionId}.`);
    return found;
}

describe("a conversation whose only work is a background process", () => {
    it("is marked as running on that work alone", async () => {
        const { connection, dispose } = harness((daemon) => {
            daemon.agentReplace({ ...daemon.agentGet("agent-a"), processes: { running: 1 } });
        });
        const session = await row(connection);
        expect(session.activeProcesses).toBe(1);
        expect(session.backgroundOnly).toBe(true);
        dispose();
    });

    it("is ordinary work while a subtask beside the process is still running", async () => {
        const { connection, dispose } = harness((daemon, projectId) => {
            const writer = child(daemon, projectId, "child-writer", { status: "working" });
            daemon.agentReplace({
                ...daemon.agentGet("agent-a"),
                processes: { running: 1 },
                subtasks: [writer],
            });
        });
        expect((await row(connection)).backgroundOnly).toBeUndefined();
        dispose();
    });

    it("offers no Stop for a subtask whose only work is a background process", async () => {
        const { connection, store, dispose } = harness((daemon, projectId) => {
            const server = child(daemon, projectId, "child-server", { processes: { running: 1 } });
            daemon.agentReplace({ ...daemon.agentGet("agent-a"), subtasks: [server] });
            daemon.activitySet("agent-a", { subagents: [server], processes: [] });
        });
        await vi.waitFor(() => expect(store.get().ready).toBe(true));
        // Stopping delegated work kills its processes, and a dev server alone is no reason to.
        expect(store.get().subagentsRunning).toBe(false);
        // The row still shows the subtask's process as work going on.
        expect((await row(connection)).backgroundOnly).toBe(true);
        dispose();
    });
});
