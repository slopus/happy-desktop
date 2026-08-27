import { afterEach, expect, it, vi } from "vitest";
import { connectHappyAgent } from "./connectHappyAgent.js";
import { HAPPY_AGENT_PROTOCOL_VERSION, HappyAgentApiError } from "@slopus/happy-agent-client";
import type {
    ChatDelta,
    ChatElement,
    GroupsState,
    MutationRejectedDelta,
    ProjectGroup,
    HappyAgentConnection,
    SessionState,
} from "./types.js";
import {
    fakeAgentMessage,
    fakeHappyAgentDaemonCreate,
    fakeRun,
    fakeUserMessage,
    type FakeHappyAgentDaemon,
} from "../testing/fakeHappyAgentDaemon.js";

interface Harness {
    daemon: FakeHappyAgentDaemon;
    connection: HappyAgentConnection;
    waits: number[];
    rejections: MutationRejectedDelta[];
}

const openConnections: HappyAgentConnection[] = [];

afterEach(() => {
    for (const connection of openConnections.splice(0)) connection.close();
});

function harnessOpen(daemon = fakeHappyAgentDaemonCreate()): Harness {
    const waits: number[] = [];
    const rejections: MutationRejectedDelta[] = [];
    const connection = connectHappyAgent({
        endpoint: "http://happy-agent.test/",
        token: "token",
        client: daemon.client,
        // Record every backoff but never actually sleep; a macrotask hop keeps
        // the reconnect loop from starving the test.
        wait: (milliseconds) => {
            waits.push(milliseconds);
            return new Promise((resolve) => setTimeout(resolve, 0));
        },
        now: () => 1_000,
        onMutationRejected: (rejection) => rejections.push(rejection),
    });
    openConnections.push(connection);
    return { connection, daemon, rejections, waits };
}

interface GroupsWatch {
    projects: readonly ProjectGroup[];
    state: GroupsState;
    errors: unknown[];
}

function groupsWatch(connection: HappyAgentConnection): GroupsWatch {
    const watch: GroupsWatch = {
        projects: [],
        state: { connection: "connecting", sessionsComplete: false },
        errors: [],
    };
    connection.connectGroups({
        onChange(projects, state) {
            watch.projects = projects;
            watch.state = state;
        },
        onError(error) {
            watch.errors.push(error);
        },
    });
    return watch;
}

interface SessionWatch {
    elements: readonly ChatElement[];
    session: SessionState | undefined;
    errors: unknown[];
    deltas: ChatDelta[];
}

function sessionWatch(connection: HappyAgentConnection, sessionId: string): SessionWatch {
    const watch: SessionWatch = { elements: [], session: undefined, errors: [], deltas: [] };
    connection.connectSession({
        sessionId,
        onChange(elements, session) {
            watch.elements = elements;
            watch.session = session;
        },
        onDelta(delta) {
            watch.deltas.push(delta);
        },
        onError(error) {
            watch.errors.push(error);
        },
    });
    return watch;
}

const userMessages = (
    elements: readonly ChatElement[],
): readonly Extract<ChatElement, { kind: "user_message" }>[] =>
    elements.filter((element) => element.kind === "user_message");

const agentTexts = (
    elements: readonly ChatElement[],
): readonly Extract<ChatElement, { kind: "agent_text" }>[] =>
    elements.filter((element) => element.kind === "agent_text");

async function liveHarness(): Promise<
    Harness & { groups: GroupsWatch; chat: SessionWatch; sessionId: string }
> {
    const harness = harnessOpen();
    const project = harness.daemon.projectSeed({ id: "project-a" });
    const agent = harness.daemon.agentSeed(project.id, { id: "agent-a" });
    const groups = groupsWatch(harness.connection);
    const chat = sessionWatch(harness.connection, agent.id);
    await vi.waitFor(() => {
        expect(groups.state.connection).toBe("live");
        expect(chat.session?.connection).toBe("live");
    });
    return { ...harness, groups, chat, sessionId: agent.id };
}

// --- startup and SSE reconnection ---------------------------------------

it("connects through health and bootstrap, then streams from the bootstrap cursor", async () => {
    const { connection, daemon } = harnessOpen();
    daemon.projectSeed({ id: "project-a" });
    const bootstrapCursor = daemon.cursorLatest();
    const groups = groupsWatch(connection);

    await vi.waitFor(() => expect(groups.state.connection).toBe("live"));
    expect(groups.state.sessionsComplete).toBe(true);
    expect(groups.projects.map((project) => project.id)).toEqual(["project-a"]);
    expect(daemon.callCount("getHealth")).toBe(1);
    expect(daemon.callCount("getDesktopBootstrap")).toBe(1);
    expect(daemon.streamOpens).toEqual([bootstrapCursor]);
});

it("reports reconnecting after a server drop and resumes from the last applied cursor", async () => {
    const { daemon, groups, chat, sessionId } = await liveHarness();
    const event = daemon.eventEmit("message.created", {
        agentId: sessionId,
        message: fakeUserMessage({ id: "m1" }),
        runId: null,
    });
    await vi.waitFor(() => expect(userMessages(chat.elements)).toHaveLength(1));

    daemon.streamDropAll();
    await vi.waitFor(() => expect(daemon.streamOpens).toHaveLength(2));
    await vi.waitFor(() => expect(groups.state.connection).toBe("live"));
    expect(daemon.streamOpens[1]).toBe(event.cursor);
    // The transcript survived the reconnect untouched.
    expect(userMessages(chat.elements)).toHaveLength(1);
});

it("retries an unreachable daemon with exponential backoff and surfaces the error", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.projectSeed({ id: "project-a" });
    daemon.failOnce("getHealth", new Error("down"));
    daemon.failOnce("getHealth", new Error("down"));
    daemon.failOnce("getHealth", new Error("down"));
    const { connection, waits } = harnessOpen(daemon);
    const groups = groupsWatch(connection);

    await vi.waitFor(() => expect(groups.state.connection).toBe("live"));
    expect(waits.slice(0, 3)).toEqual([250, 500, 1_000]);
    expect(groups.errors.length).toBeGreaterThanOrEqual(3);
});

it("polls health until the daemon is ready before opening the stream", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.projectSeed({ id: "project-a" });
    daemon.healthSet({ ready: false });
    const { connection, waits } = harnessOpen(daemon);
    const groups = groupsWatch(connection);

    await vi.waitFor(() => expect(waits.length).toBeGreaterThanOrEqual(2));
    expect(daemon.callCount("streamEvents")).toBe(0);
    expect(groups.state.connection).toBe("connecting");

    daemon.healthSet({ ready: true });
    await vi.waitFor(() => expect(groups.state.connection).toBe("live"));
});

it("accepts a newer additive protocol", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.healthSet({ protocol: HAPPY_AGENT_PROTOCOL_VERSION + 1 });
    const { connection } = harnessOpen(daemon);
    const groups = groupsWatch(connection);

    await vi.waitFor(() => expect(groups.state.connection).toBe("live"));
    expect(connection.compatibility().status).toBe("compatible");
    expect(daemon.callCount("streamEvents")).toBe(1);
    expect(daemon.callCount("getDesktopBootstrap")).toBeGreaterThan(0);
});

it("close() severs the live stream and stops the reconnect loop", async () => {
    const { connection, daemon } = await liveHarness();
    expect(daemon.streamLiveCount()).toBe(1);
    connection.close();
    await vi.waitFor(() => expect(daemon.streamLiveCount()).toBe(0));
    const streamsOpened = daemon.callCount("streamEvents");
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(daemon.callCount("streamEvents")).toBe(streamsOpened);
});

it("propagates connection state into open session snapshots", async () => {
    const { daemon, chat } = await liveHarness();
    expect(chat.session?.connection).toBe("live");
    daemon.pause("getHealth");
    daemon.streamDropAll();
    await vi.waitFor(() => expect(chat.session?.connection).toBe("reconnecting"));
});

// --- duplicated events ---------------------------------------------------

it("applies a redelivered message.created only once", async () => {
    const { daemon, chat, sessionId } = await liveHarness();
    const event = daemon.eventEmit("message.created", {
        agentId: sessionId,
        message: fakeUserMessage({ id: "m1", content: [{ type: "text", text: "once" }] }),
        runId: null,
    });
    await vi.waitFor(() => expect(userMessages(chat.elements)).toHaveLength(1));

    daemon.eventRedeliver(event);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(userMessages(chat.elements)).toHaveLength(1);
    expect(userMessages(chat.elements)[0]?.text).toBe("once");
});

it("ignores a redelivered message.delta instead of appending its text twice", async () => {
    const { daemon, chat, sessionId } = await liveHarness();
    daemon.eventEmit("run.started", {
        agentId: sessionId,
        run: fakeRun({ id: "r1", status: "running" }),
        acceptedMessageIds: [],
    });
    daemon.eventEmit("message.created", {
        agentId: sessionId,
        message: fakeAgentMessage({ id: "a1", content: [{ type: "text", text: "Hel" }] }),
        runId: "r1",
    });
    const delta = daemon.eventEmit("message.delta", {
        agentId: sessionId,
        runId: "r1",
        messageId: "a1",
        blockIndex: 0,
        offset: 3,
        append: "lo",
    });
    await vi.waitFor(() => expect(agentTexts(chat.elements)[0]?.text).toBe("Hello"));

    daemon.eventRedeliver(delta);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(agentTexts(chat.elements)).toHaveLength(1);
    expect(agentTexts(chat.elements)[0]?.text).toBe("Hello");
});

it("drops an event replayed from before the bootstrap cursor", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    const project = daemon.projectSeed({ id: "project-a" });
    daemon.agentSeed(project.id, { id: "agent-a" });
    // Journaled before the client ever connected: bootstrap already covers it.
    const stale = daemon.eventEmit("message.created", {
        agentId: "agent-a",
        message: fakeUserMessage({ id: "old", content: [{ type: "text", text: "stale" }] }),
        runId: null,
    });
    const { connection } = harnessOpen(daemon);
    const groups = groupsWatch(connection);
    const chat = sessionWatch(connection, "agent-a");
    await vi.waitFor(() => {
        expect(groups.state.connection).toBe("live");
        expect(chat.session?.connection).toBe("live");
    });

    daemon.eventRedeliver(stale);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(userMessages(chat.elements)).toHaveLength(0);
});

it("keeps one run group when run.started is redelivered", async () => {
    const { daemon, chat, sessionId } = await liveHarness();
    const started = daemon.eventEmit("run.started", {
        agentId: sessionId,
        run: fakeRun({ id: "r1", status: "running" }),
        acceptedMessageIds: [],
    });
    await vi.waitFor(() => expect(chat.session?.status).toBe("running"));

    daemon.eventRedeliver(started);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(chat.elements.filter((element) => element.kind === "inference")).toHaveLength(1);
});

it("refetches on an out-of-order agent.updated instead of clobbering newer state", async () => {
    const { daemon, chat, sessionId } = await liveHarness();
    const fresh = daemon.versionNext();
    const current = { ...daemon.agentGet(sessionId), title: "Fresh", version: fresh };
    daemon.agentReplace(current);
    daemon.eventEmit("agent.updated", {
        agentId: sessionId,
        previousVersion: daemon.agentGet(sessionId).version,
        version: fresh,
        changes: { title: "Fresh" },
    });
    await vi.waitFor(() => expect(chat.session?.title).toBe("Fresh"));

    // A late event from an older lineage: its previousVersion matches nothing
    // the client holds, so the truth must come from a refetch.
    daemon.eventEmit("agent.updated", {
        agentId: sessionId,
        previousVersion: "version-000000000000",
        version: "version-000000000001",
        changes: { title: "Stale" },
    });
    await vi.waitFor(() => expect(daemon.callCount("getAgent")).toBeGreaterThanOrEqual(2));
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(chat.session?.title).toBe("Fresh");
});

it("does not duplicate the session row when agent.created is redelivered", async () => {
    const { daemon, groups } = await liveHarness();
    const created = daemon.eventEmit("agent.created", {
        agent: daemon.agentSeed("project-a", { id: "agent-b" }),
    });
    await vi.waitFor(() =>
        expect(groups.projects[0]?.sessions.map((session) => session.id)).toContain("agent-b"),
    );

    daemon.eventRedeliver(created);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const ids = groups.projects[0]?.sessions.map((session) => session.id) ?? [];
    expect(ids.filter((id) => id === "agent-b")).toHaveLength(1);
});

// --- sent message reconciliation ------------------------------------------

it("shows an optimistic message immediately and keeps its identity once the daemon takes it", async () => {
    const { connection, daemon, chat, sessionId } = await liveHarness();
    const release = daemon.pause("sendMessage");
    const mutationId = connection.sendMessage(sessionId, "hello there");

    expect(userMessages(chat.elements)).toHaveLength(1);
    expect(userMessages(chat.elements)[0]?.messageId).toBe(mutationId);
    expect(userMessages(chat.elements)[0]?.text).toBe("hello there");

    release();
    // The identity is the client's own and the daemon adopts it — "reusing it
    // returns the existing message" — so a send that lands changes nothing the
    // reader can see. That is the whole point: there is no identity swap to
    // survive, and the row drawn before the request cannot be replaced by a
    // second one carrying the same message under another name.
    await vi.waitFor(() => expect(daemon.callCount("sendMessage")).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(userMessages(chat.elements)).toHaveLength(1);
    expect(userMessages(chat.elements)[0]?.messageId).toBe(mutationId);
    expect(userMessages(chat.elements)[0]?.id).toBe(`message:${mutationId}`);
    // The id the row was drawn under is the id the daemon was asked to use.
    const sent = daemon.calls.find((call) => call.method === "sendMessage");
    expect((sent?.args[1] as { id?: string } | undefined)?.id).toBe(mutationId);
});

it("does not duplicate the sent message when its event beats the HTTP response", async () => {
    const { connection, daemon, chat, sessionId } = await liveHarness();
    const release = daemon.pause("sendMessage:respond");
    const mutationId = connection.sendMessage(sessionId, "race");

    // The stream event arrives while the response is still held. It carries the
    // client's own identity, so it lands on the row already there instead of
    // adding a second one beside it.
    await vi.waitFor(() => expect(daemon.callCount("sendMessage")).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(userMessages(chat.elements)).toHaveLength(1);
    expect(userMessages(chat.elements)[0]?.messageId).toBe(mutationId);

    release();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(userMessages(chat.elements)).toHaveLength(1);
    expect(userMessages(chat.elements)[0]?.messageId).toBe(mutationId);
});

it("removes the optimistic message and reports the rejection when the send fails", async () => {
    const { connection, daemon, chat, rejections, sessionId } = await liveHarness();
    // Refused rather than lost: a send is retried through anything that might
    // be transport, so only a failure the daemon owns ends the attempt and
    // takes the message off the screen.
    daemon.failOnce(
        "sendMessage",
        new HappyAgentApiError(400, "the daemon refused", "invalid_request", null),
    );
    const mutationId = connection.sendMessage(sessionId, "doomed");
    expect(userMessages(chat.elements)).toHaveLength(1);

    await vi.waitFor(() => expect(rejections).toHaveLength(1));
    expect(rejections[0]).toMatchObject({
        action: "send_message",
        mutationId,
        type: "mutation_rejected",
    });
    expect(userMessages(chat.elements)).toHaveLength(0);
    expect(chat.deltas.filter((delta) => delta.type === "mutation_rejected")).toHaveLength(1);
});

it("retries a send the daemon never answered and reports nothing when it lands", async () => {
    const { connection, daemon, chat, rejections, sessionId } = await liveHarness();
    daemon.failOnce("sendMessage", new Error("connection reset"));
    const mutationId = connection.sendMessage(sessionId, "kept");

    await vi.waitFor(() => expect(daemon.callCount("sendMessage")).toBe(2));
    await new Promise((resolve) => setTimeout(resolve, 5));
    // The retry reuses the same identity, so the message the reader has been
    // looking at throughout is the one that landed — not a second copy of it.
    expect(rejections).toHaveLength(0);
    expect(userMessages(chat.elements)).toHaveLength(1);
    expect(userMessages(chat.elements)[0]?.messageId).toBe(mutationId);
});

it("marks pending messages accepted and moves them under the run that took them", async () => {
    const { daemon, chat, sessionId } = await liveHarness();
    daemon.eventEmit("message.created", {
        agentId: sessionId,
        message: fakeUserMessage({ id: "m1" }),
        runId: null,
    });
    await vi.waitFor(() => expect(userMessages(chat.elements)).toHaveLength(1));
    expect(userMessages(chat.elements)[0]?.groupId).toBe("pending:m1");

    daemon.eventEmit("run.started", {
        agentId: sessionId,
        run: fakeRun({ id: "r1", status: "running" }),
        acceptedMessageIds: ["m1"],
    });
    await vi.waitFor(() => expect(userMessages(chat.elements)[0]?.groupId).toBe("r1"));
    expect(userMessages(chat.elements)).toHaveLength(1);
    expect(chat.session?.status).toBe("running");
});

it("serializes concurrent sends to the same agent", async () => {
    const { connection, daemon, sessionId } = await liveHarness();
    const release = daemon.pause("sendMessage");
    connection.sendMessage(sessionId, "first");
    connection.sendMessage(sessionId, "second");
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(daemon.callCount("sendMessage")).toBe(1);

    release();
    await vi.waitFor(() => expect(daemon.callCount("sendMessage")).toBe(2));
    const texts = daemon.calls
        .filter((call) => call.method === "sendMessage")
        .map((call) => (call.args[1] as { text: string }).text);
    expect(texts).toEqual(["first", "second"]);
});

// --- streaming content reconciliation --------------------------------------

it("merges a cumulative message.updated snapshot without duplicating streamed text", async () => {
    const { daemon, chat, sessionId } = await liveHarness();
    daemon.eventEmit("run.started", {
        agentId: sessionId,
        run: fakeRun({ id: "r1", status: "running" }),
        acceptedMessageIds: [],
    });
    daemon.eventEmit("message.created", {
        agentId: sessionId,
        message: fakeAgentMessage({ id: "a1", content: [{ type: "text", text: "Hel" }] }),
        runId: "r1",
    });
    daemon.eventEmit("message.delta", {
        agentId: sessionId,
        runId: "r1",
        messageId: "a1",
        blockIndex: 0,
        offset: 3,
        append: "lo",
    });
    daemon.eventEmit("message.updated", {
        agentId: sessionId,
        runId: "r1",
        message: fakeAgentMessage({ id: "a1", content: [{ type: "text", text: "Hello" }] }),
    });
    await vi.waitFor(() => expect(agentTexts(chat.elements)[0]?.text).toBe("Hello"));
    expect(agentTexts(chat.elements)).toHaveLength(1);
});

it("keeps one tool row while its arguments stream and shows it finished at the end", async () => {
    const { daemon, chat, sessionId } = await liveHarness();
    daemon.eventEmit("run.started", {
        agentId: sessionId,
        run: fakeRun({ id: "r1", status: "running" }),
        acceptedMessageIds: [],
    });
    daemon.eventEmit("message.created", {
        agentId: sessionId,
        message: fakeAgentMessage({ id: "a1", content: [{ type: "text", text: "Running it" }] }),
        runId: "r1",
    });
    // The provider streams the call's arguments: every snapshot of the same
    // still-running block carries more of them.
    for (const args of [{ command: "ls" }, { command: "ls -la" }, { command: "ls -la /tmp" }]) {
        daemon.eventEmit("message.updated", {
            agentId: sessionId,
            runId: "r1",
            message: fakeAgentMessage({
                id: "a1",
                content: [
                    { type: "text", text: "Running it" },
                    {
                        type: "tool_call",
                        id: "tool-a1-1",
                        name: "Bash",
                        status: "running",
                        arguments: args,
                    },
                ],
            }),
        });
    }
    daemon.eventEmit("message.updated", {
        agentId: sessionId,
        runId: "r1",
        message: fakeAgentMessage({
            id: "a1",
            content: [
                { type: "text", text: "Running it" },
                {
                    type: "tool_call",
                    id: "tool-a1-1",
                    name: "Bash",
                    status: "completed",
                    arguments: { command: "ls -la /tmp" },
                    result: { output: "ok" },
                },
            ],
        }),
    });

    await vi.waitFor(() => {
        const tools = chat.elements.filter((element) => element.kind === "tool_call");
        expect(tools).toHaveLength(1);
        expect(tools[0]?.status).toBe("succeeded");
    });
    expect(agentTexts(chat.elements).map((element) => element.text)).toEqual(["Running it"]);
});

it("ignores a stale in-flight snapshot instead of appending a duplicate segment", async () => {
    const { daemon, chat, sessionId } = await liveHarness();
    daemon.eventEmit("run.started", {
        agentId: sessionId,
        run: fakeRun({ id: "r1", status: "running" }),
        acceptedMessageIds: [],
    });
    daemon.eventEmit("message.created", {
        agentId: sessionId,
        message: fakeAgentMessage({
            id: "a1",
            content: [
                { type: "text", text: "Hello world" },
                {
                    type: "tool_call",
                    id: "tool-a1-1",
                    name: "Bash",
                    status: "completed",
                    arguments: { command: "ls" },
                    result: { output: "ok" },
                },
            ],
        }),
        runId: "r1",
    });
    await vi.waitFor(() => expect(agentTexts(chat.elements)).toHaveLength(1));

    // A snapshot generated before the completion but delivered after it: its
    // text is shorter and its tool call is still running.
    daemon.eventEmit("message.updated", {
        agentId: sessionId,
        runId: "r1",
        message: fakeAgentMessage({
            id: "a1",
            content: [
                { type: "text", text: "Hello wor" },
                {
                    type: "tool_call",
                    id: "tool-a1-1",
                    name: "Bash",
                    status: "running",
                    arguments: { command: "ls" },
                },
            ],
        }),
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(agentTexts(chat.elements).map((element) => element.text)).toEqual(["Hello world"]);
    const tools = chat.elements.filter((element) => element.kind === "tool_call");
    expect(tools).toHaveLength(1);
    expect(tools[0]?.status).toBe("succeeded");
});

it("keeps streamed reasoning when a snapshot trims it while adding a tool call", async () => {
    const { daemon, chat, sessionId } = await liveHarness();
    daemon.eventEmit("run.started", {
        agentId: sessionId,
        run: fakeRun({ id: "r1", status: "running" }),
        acceptedMessageIds: [],
    });
    daemon.eventEmit("message.created", {
        agentId: sessionId,
        message: fakeAgentMessage({ id: "a1", content: [{ type: "reasoning", text: "th" }] }),
        runId: "r1",
    });
    daemon.eventEmit("message.delta", {
        agentId: sessionId,
        runId: "r1",
        messageId: "a1",
        blockIndex: 0,
        offset: 2,
        append: "inking",
    });
    // The next snapshot carries an empty reasoning block — providers trim the
    // thinking text they already streamed — plus the tool call that follows it.
    daemon.eventEmit("message.updated", {
        agentId: sessionId,
        runId: "r1",
        message: fakeAgentMessage({
            id: "a1",
            content: [
                { type: "reasoning", text: "" },
                {
                    type: "tool_call",
                    id: "tool-a1-1",
                    name: "Bash",
                    status: "running",
                    arguments: {},
                },
            ],
        }),
    });

    await vi.waitFor(() =>
        expect(chat.elements.filter((element) => element.kind === "tool_call")).toHaveLength(1),
    );
    const thinking = chat.elements.filter((element) => element.kind === "thinking");
    expect(thinking).toHaveLength(1);
    expect(thinking[0]?.kind === "thinking" && thinking[0].text).toBe("thinking");
});

it("adds a second same-named tool call as its own row without disturbing the first", async () => {
    const { daemon, chat, sessionId } = await liveHarness();
    daemon.eventEmit("run.started", {
        agentId: sessionId,
        run: fakeRun({ id: "r1", status: "running" }),
        acceptedMessageIds: [],
    });
    const first = {
        type: "tool_call" as const,
        id: "tool-a1-1",
        name: "Bash",
        status: "completed" as const,
        arguments: { command: "first" },
        result: { output: "done" },
    };
    daemon.eventEmit("message.created", {
        agentId: sessionId,
        message: fakeAgentMessage({ id: "a1", content: [first] }),
        runId: "r1",
    });
    daemon.eventEmit("message.updated", {
        agentId: sessionId,
        runId: "r1",
        message: fakeAgentMessage({
            id: "a1",
            content: [
                first,
                {
                    type: "tool_call",
                    id: "tool-a1-2",
                    name: "Bash",
                    status: "running",
                    arguments: { command: "second" },
                },
            ],
        }),
    });

    await vi.waitFor(() => {
        const tools = chat.elements.filter((element) => element.kind === "tool_call");
        expect(tools).toHaveLength(2);
    });
    const tools = chat.elements.filter((element) => element.kind === "tool_call");
    expect(tools[0]?.status).toBe("succeeded");
    expect(tools[1]?.status).toBe("running");
});

it("appends a genuinely new provider segment after a tool result", async () => {
    const { daemon, chat, sessionId } = await liveHarness();
    daemon.eventEmit("run.started", {
        agentId: sessionId,
        run: fakeRun({ id: "r1", status: "running" }),
        acceptedMessageIds: [],
    });
    daemon.eventEmit("message.created", {
        agentId: sessionId,
        message: fakeAgentMessage({ id: "a1", content: [{ type: "text", text: "Before" }] }),
        runId: "r1",
    });
    await vi.waitFor(() => expect(agentTexts(chat.elements)).toHaveLength(1));
    // The model moved on: the next live snapshot carries only the new segment.
    daemon.eventEmit("message.updated", {
        agentId: sessionId,
        runId: "r1",
        message: fakeAgentMessage({ id: "a1", content: [{ type: "text", text: "After" }] }),
    });
    await vi.waitFor(() => expect(agentTexts(chat.elements)).toHaveLength(2));
    expect(agentTexts(chat.elements).map((element) => element.text)).toEqual(["Before", "After"]);
});

it("settles a finished run on the stream alone, without refetching history", async () => {
    const { daemon, chat, sessionId } = await liveHarness();
    daemon.eventEmit("run.started", {
        agentId: sessionId,
        run: fakeRun({ id: "r1", status: "running" }),
        acceptedMessageIds: [],
    });
    daemon.eventEmit("message.created", {
        agentId: sessionId,
        message: fakeAgentMessage({ id: "a1", content: [{ type: "text", text: "final text" }] }),
        runId: "r1",
    });
    await vi.waitFor(() => expect(agentTexts(chat.elements)).toHaveLength(1));
    const loads = daemon.callCount("getMessages");

    daemon.eventEmit("run.finished", {
        agentId: sessionId,
        run: fakeRun({ id: "r1", status: "completed", endedAt: 2 }),
    });
    await vi.waitFor(() => expect(chat.session?.status).toBe("idle"));

    // The stream already carried the whole turn, so ending it reads nothing
    // back: the transcript is what the events built.
    expect(daemon.callCount("getMessages")).toBe(loads);
    expect(agentTexts(chat.elements).map((element) => element.text)).toEqual(["final text"]);
});

// --- lost cursor and full resync -------------------------------------------

it("resyncs the catalog and every open chat when the hello reports a cursor gap", async () => {
    const { daemon, groups, chat, sessionId } = await liveHarness();

    // While the client is away the server moves on: a new project appears and
    // the chat gains a run the client never saw an event for.
    daemon.projectSeed({ id: "project-b" });
    daemon.historySet(sessionId, [
        fakeRun({
            id: "r1",
            status: "completed",
            endedAt: 2,
            messages: [fakeUserMessage({ id: "m1", content: [{ type: "text", text: "missed" }] })],
        }),
    ]);
    daemon.cursorNext();
    daemon.gapOnNextStream();
    daemon.streamDropAll();

    await vi.waitFor(() => {
        expect(groups.projects.map((project) => project.id)).toEqual(["project-a", "project-b"]);
        expect(userMessages(chat.elements)).toHaveLength(1);
    });
    expect(userMessages(chat.elements)[0]?.text).toBe("missed");
    expect(daemon.callCount("getDesktopBootstrap")).toBe(2);
    // The gap stream was replaced by a fresh one resumed from the new cursor.
    await vi.waitFor(() => expect(groups.state.connection).toBe("live"));
    expect(daemon.streamOpens).toHaveLength(3);
    expect(daemon.streamOpens[2]).toBe(daemon.cursorLatest());
});

it("replaces chat history across a gap resync instead of appending to it", async () => {
    const { daemon, chat, sessionId } = await liveHarness();
    daemon.eventEmit("message.created", {
        agentId: sessionId,
        message: fakeUserMessage({ id: "m1", content: [{ type: "text", text: "kept" }] }),
        runId: null,
    });
    await vi.waitFor(() => expect(userMessages(chat.elements)).toHaveLength(1));

    // The server deleted the pending message while the client was away.
    daemon.historySet(sessionId, [], []);
    daemon.gapOnNextStream();
    daemon.streamDropAll();

    await vi.waitFor(() => expect(userMessages(chat.elements)).toHaveLength(0));
});

it("buffers events during a resync and drops the ones the bootstrap already covers", async () => {
    const { daemon, chat, sessionId } = await liveHarness();
    const releaseBootstrap = daemon.pause("getDesktopBootstrap");
    daemon.gapOnNextStream();
    daemon.streamDropAll();

    // The resync is stalled on bootstrap when a new message event arrives. Its
    // change is also part of the bootstrap snapshot, as it would be on a real
    // daemon whose snapshot cursor is taken after the event.
    await vi.waitFor(() => expect(daemon.callCount("getDesktopBootstrap")).toBe(2));
    const message = fakeUserMessage({ id: "m1", content: [{ type: "text", text: "covered" }] });
    daemon.historySet(sessionId, [], [message]);
    daemon.eventEmit("message.created", { agentId: sessionId, message, runId: null });
    releaseBootstrap();

    await vi.waitFor(() => expect(userMessages(chat.elements)).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(userMessages(chat.elements)).toHaveLength(1);
    expect(userMessages(chat.elements)[0]?.text).toBe("covered");
});

it("does not duplicate a streaming segment when a stale snapshot buffers during hydration", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    const project = daemon.projectSeed({ id: "project-a" });
    const agent = daemon.agentSeed(project.id, { id: "agent-a", status: "working" });
    daemon.historySet(agent.id, [
        fakeRun({
            id: "r1",
            status: "running",
            messages: [
                fakeAgentMessage({
                    id: "a1",
                    content: [
                        { type: "text", text: "Hello world" },
                        {
                            type: "tool_call",
                            id: "tool-a1-1",
                            name: "Bash",
                            status: "completed",
                            arguments: {},
                        },
                    ],
                }),
            ],
        }),
    ]);
    const { connection } = harnessOpen(daemon);
    const groups = groupsWatch(connection);
    await vi.waitFor(() => expect(groups.state.connection).toBe("live"));

    // Open the chat mid-run and stall its history load; a live snapshot of the
    // same still-streaming segment arrives meanwhile and buffers. It is older
    // than the history the load returns: its text is a shorter prefix and its
    // tool call is still running.
    const release = daemon.pause("getMessages");
    const chat = sessionWatch(connection, agent.id);
    await vi.waitFor(() => expect(daemon.callCount("getMessages")).toBe(1));
    daemon.eventEmit("message.updated", {
        agentId: agent.id,
        runId: "r1",
        message: fakeAgentMessage({
            id: "a1",
            content: [
                { type: "text", text: "Hello wor" },
                {
                    type: "tool_call",
                    id: "tool-a1-1",
                    name: "Bash",
                    status: "running",
                    arguments: {},
                },
            ],
        }),
    });
    daemon.agentReplace({ ...daemon.agentGet(agent.id), lastCursor: daemon.cursorLatest() });
    release();

    await vi.waitFor(() => expect(agentTexts(chat.elements).length).toBeGreaterThan(0));
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(agentTexts(chat.elements).map((element) => element.text)).toEqual(["Hello world"]);
    expect(chat.elements.filter((element) => element.kind === "tool_call")).toHaveLength(1);
});

it("does not duplicate a streaming segment when a stale snapshot buffers during a gap resync", async () => {
    const { daemon, chat, sessionId } = await liveHarness();
    daemon.eventEmit("run.started", {
        agentId: sessionId,
        run: fakeRun({ id: "r1", status: "running" }),
        acceptedMessageIds: [],
    });
    daemon.eventEmit("message.created", {
        agentId: sessionId,
        message: fakeAgentMessage({
            id: "a1",
            content: [
                { type: "text", text: "Para" },
                {
                    type: "tool_call",
                    id: "tool-a1-1",
                    name: "Bash",
                    status: "running",
                    arguments: {},
                },
            ],
        }),
        runId: "r1",
    });
    await vi.waitFor(() => expect(agentTexts(chat.elements)).toHaveLength(1));

    // The connection drops with a lost cursor. While the resync waits on the
    // chat reload, one last in-flight snapshot of the streaming segment lands;
    // the history that arrives afterwards already contains its final form.
    const release = daemon.pause("getMessages");
    daemon.gapOnNextStream();
    daemon.streamDropAll();
    await vi.waitFor(() => expect(daemon.callCount("getDesktopBootstrap")).toBe(2));
    daemon.eventEmit("message.updated", {
        agentId: sessionId,
        runId: "r1",
        message: fakeAgentMessage({
            id: "a1",
            content: [
                { type: "text", text: "Para" },
                {
                    type: "tool_call",
                    id: "tool-a1-1",
                    name: "Bash",
                    status: "running",
                    arguments: {},
                },
            ],
        }),
    });
    daemon.historySet(sessionId, [
        fakeRun({
            id: "r1",
            status: "running",
            messages: [
                fakeAgentMessage({
                    id: "a1",
                    content: [
                        { type: "text", text: "Para" },
                        {
                            type: "tool_call",
                            id: "tool-a1-1",
                            name: "Bash",
                            status: "completed",
                            arguments: {},
                            result: {},
                        },
                    ],
                }),
            ],
        }),
    ]);
    daemon.agentReplace({ ...daemon.agentGet(sessionId), lastCursor: daemon.cursorLatest() });
    release();

    await vi.waitFor(() => {
        const tools = chat.elements.filter((element) => element.kind === "tool_call");
        expect(tools.length).toBeGreaterThan(0);
        expect(tools[0]?.status).toBe("succeeded");
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(agentTexts(chat.elements).map((element) => element.text)).toEqual(["Para"]);
    expect(chat.elements.filter((element) => element.kind === "tool_call")).toHaveLength(1);
});

it("resumes the stream from the newest applied event cursor after events advanced it", async () => {
    const { daemon, chat, sessionId } = await liveHarness();
    daemon.eventEmit("message.created", {
        agentId: sessionId,
        message: fakeUserMessage({ id: "m1" }),
        runId: null,
    });
    const newest = daemon.eventEmit("message.created", {
        agentId: sessionId,
        message: fakeUserMessage({ id: "m2" }),
        runId: null,
    });
    await vi.waitFor(() => expect(userMessages(chat.elements)).toHaveLength(2));

    daemon.streamDropAll();
    await vi.waitFor(() => expect(daemon.streamOpens).toHaveLength(2));
    expect(daemon.streamOpens[1]).toBe(newest.cursor);
});
