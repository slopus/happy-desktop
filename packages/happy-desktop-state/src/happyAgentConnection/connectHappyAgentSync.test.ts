import { afterEach, expect, it, vi } from "vitest";
import { connectHappyAgent } from "./connectHappyAgent.js";
import { MessageRefusedError } from "./errors.js";
import { happyAgentChatStoreCreate } from "../happyAgent/happyAgentChatStore.js";
import { happyAgentModelCatalogProject } from "../happyAgent/happyAgentProject.js";
import type { HappyAgentSessionId } from "../happyAgent/happyAgentTypes.js";
import { MINIMUM_HAPPY_AGENT_VERSION } from "./compatibility.js";
import {
    HAPPY_AGENT_PROTOCOL_VERSION,
    HappyAgentApiError,
    HappyAgentClient,
    type Message,
    type MessageMode,
    type Question,
} from "@slopus/happy-agent-client";
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

function harnessOpen(
    daemon = fakeHappyAgentDaemonCreate(),
    options: { readonly memberProfileRequired?: boolean; readonly preloadedSessions?: number } = {},
): Harness {
    const waits: number[] = [];
    const rejections: MutationRejectedDelta[] = [];
    const connection = connectHappyAgent({
        ...options,
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

it("shows a delegated session's own speed choices while history and activity are still loading", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    const config = daemon.configGet();
    const selectedModel = config.defaults.modelId;
    const selectedProvider = config.defaults.providerId;
    daemon.configSet({
        ...config,
        defaults: { ...config.defaults, modelId: "regular-only" },
        models: {
            ...config.models,
            [selectedModel]: {
                ...config.models[selectedModel]!,
                serviceTierOptions: [
                    { id: null, label: "Regular" },
                    { id: "priority", label: "Fast" },
                ],
            },
            "regular-only": {
                ...config.models[selectedModel]!,
                name: "Regular only",
                serviceTierOptions: [{ id: null, label: "Regular" }],
            },
        },
        providers: {
            ...config.providers,
            [selectedProvider]: {
                ...config.providers[selectedProvider]!,
                models: [
                    ...config.providers[selectedProvider]!.models,
                    { id: "regular-only", enabled: true },
                ],
            },
        },
    });
    const project = daemon.projectSeed({ id: "project-speed" });
    const parent = daemon.agentSeed(project.id, { id: "parent-speed" });
    const child = daemon.agentSeed(project.id, {
        id: "child-speed",
        parentAgentId: parent.id,
    });
    daemon.modeSeed(child.id, {
        ...config.defaults,
        modelId: selectedModel,
        providerId: selectedProvider,
        serviceTier: "priority",
    });
    const releaseHistory = daemon.pause("getMessages");
    const releaseActivity = daemon.pause("getAgentActivity");
    const releaseQuestion = daemon.pause("getPendingQuestion");
    const { connection } = harnessOpen(daemon);
    const groups = groupsWatch(connection);
    const chat = happyAgentChatStoreCreate(child.id as HappyAgentSessionId, {
        catalog: happyAgentModelCatalogProject(daemon.configGet()),
        connectActions: connection,
        connectMutationSubscribe: () => () => undefined,
        transcriptConnect: ({ sessionId, onChange, onError }) => {
            const transcript = connection.connectSession({
                sessionId,
                onChange: (elements, session) => onChange(elements, session, []),
                onError,
            });
            return {
                close: () => transcript.close(),
                loadMore: (token) => transcript.loadMore(token),
            };
        },
    });
    const unsubscribe = chat.subscribe(() => undefined);
    try {
        expect(chat.get().menus).toBeUndefined();
        await vi.waitFor(() => {
            expect(chat.get().menus?.currentModelId).toBe(selectedModel);
            expect(chat.get().menus?.serviceTierOptions).toEqual([
                { tier: null, label: "Regular", current: false },
                { tier: "priority", label: "Fast", current: true },
            ]);
        });
        expect(chat.get().ready).toBe(false);
        expect(chat.get().modelLocked).toBe(false);
        expect(chat.get().entries).toEqual([]);
        expect(chat.get().menus?.currentProviderId).toBe(selectedProvider);
        expect(chat.get().menus?.currentPermissionMode).toBe(config.defaults.permissionMode);
        expect(
            groups.projects[0]?.sessions.find((session) => session.id === child.id)
                ?.parentSessionId,
        ).toBe(parent.id);
        releaseHistory();
        releaseActivity();
        releaseQuestion();
        await vi.waitFor(() => expect(chat.get().ready).toBe(true));
        expect(chat.get().menus?.currentServiceTier).toBe("priority");
        expect(chat.get().modelLocked).toBe(false);
    } finally {
        releaseHistory();
        releaseActivity();
        releaseQuestion();
        unsubscribe();
        chat[Symbol.dispose]();
    }
});

it("keeps local speed edits through stale bootstrap and deferred history snapshots", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    const project = daemon.projectSeed({ id: "project-speed-race" });
    const agent = daemon.agentSeed(project.id, { id: "agent-speed-race" });
    const getBootstrap = daemon.client.getAgentBootstrap.bind(daemon.client);
    let releaseBootstrap!: () => void;
    const bootstrapGate = new Promise<void>((resolve) => {
        releaseBootstrap = resolve;
    });
    let bootstrapCaptured!: () => void;
    const captured = new Promise<void>((resolve) => {
        bootstrapCaptured = resolve;
    });
    vi.spyOn(daemon.client, "getAgentBootstrap").mockImplementation(async (...args) => {
        const snapshot = await getBootstrap(...args);
        bootstrapCaptured();
        await bootstrapGate;
        return snapshot;
    });
    const releaseHistory = daemon.pause("getMessages");
    const { connection } = harnessOpen(daemon);
    const groups = groupsWatch(connection);
    const chat = sessionWatch(connection, agent.id);
    await captured;
    await vi.waitFor(() => expect(groups.state.connection).toBe("live"));
    connection.setServiceTier(agent.id, "ultrafast");
    await vi.waitFor(() => {
        expect(chat.session?.serviceTier).toBe("ultrafast");
        expect(daemon.callCount("saveAgentDraft")).toBe(1);
    });
    releaseBootstrap();
    await vi.waitFor(() => expect(chat.session?.selectionKnown).toBe(true));
    expect(chat.session?.historyLoading).toBe(true);
    expect(chat.session?.serviceTier).toBe("ultrafast");
    releaseHistory();
    await vi.waitFor(() => expect(chat.session?.historyLoading).not.toBe(true));
    expect(chat.session?.serviceTier).toBe("ultrafast");
});

// --- startup and SSE reconnection ---------------------------------------

it("sends the selected Ultrafast wire tier with the user message, then clears it for Regular", async () => {
    const { connection, daemon, chat, sessionId } = await liveHarness();
    connection.setServiceTier(sessionId, "ultrafast");
    expect(chat.session?.serviceTier).toBe("ultrafast");
    connection.sendMessage(sessionId, "first");
    await vi.waitFor(() => expect(daemon.callCount("sendMessage")).toBe(1));
    expect(daemon.calls.find((call) => call.method === "sendMessage")?.args[1]).toMatchObject({
        mode: { serviceTier: "ultrafast" },
    });
    connection.setServiceTier(sessionId, undefined);
    connection.sendMessage(sessionId, "second");
    await vi.waitFor(() => expect(daemon.callCount("sendMessage")).toBe(2));
    expect(daemon.calls.filter((call) => call.method === "sendMessage")[1]?.args[1]).toMatchObject({
        mode: { serviceTier: null },
    });
});

it("steers a send that names no delivery, queues one that asks to, and shows each as still waiting", async () => {
    const { connection, daemon, chat, sessionId } = await liveHarness();
    connection.sendMessage(sessionId, "steer by default");
    connection.sendMessage(sessionId, { text: "wait for the run", delivery: "queue" });
    await vi.waitFor(() => expect(daemon.callCount("sendMessage")).toBe(2));
    // The two sends are not awaited, so they may reach the daemon in either order.
    const sent = daemon.calls
        .filter((call) => call.method === "sendMessage")
        .map((call) => call.args[1]);
    expect(sent).toContainEqual(
        expect.objectContaining({ text: "steer by default", delivery: "steer" }),
    );
    expect(sent).toContainEqual(
        expect.objectContaining({ text: "wait for the run", delivery: "queue" }),
    );
    // The fake daemon holds both pending, as a running agent would.
    await vi.waitFor(() =>
        expect(
            new Map(userMessages(chat.elements).map((message) => [message.text, message.delivery])),
        ).toEqual(
            new Map([
                ["steer by default", "pending_steering"],
                ["wait for the run", "pending_queued"],
            ]),
        ),
    );
});

it("keeps 523 untouched catalog sessions identical when one session changes", async () => {
    const { connection, daemon } = harnessOpen();
    const project = daemon.projectSeed({ id: "project-large" });
    for (let index = 0; index < 524; index += 1) {
        daemon.agentSeed(project.id, { id: `agent-${index}`, title: `Conversation ${index}` });
    }
    const groups = groupsWatch(connection);
    await vi.waitFor(() => expect(groups.projects[0]?.sessions.length).toBe(524));
    const before = new Map(groups.projects[0]!.sessions.map((session) => [session.id, session]));
    const current = daemon.agentGet("agent-0");
    daemon.eventEmit("agent.updated", {
        agentId: current.id,
        previousVersion: current.version,
        version: daemon.versionNext(),
        changes: { title: "Changed conversation", status: "working", updatedAt: 42_000 },
    });
    await vi.waitFor(() =>
        expect(groups.projects[0]?.sessions.find((s) => s.id === current.id)?.title).toBe(
            "Changed conversation",
        ),
    );
    for (const session of groups.projects[0]!.sessions) {
        if (session.id === current.id) {
            expect(session).not.toBe(before.get(session.id));
            expect(session.status).toBe("running");
            expect(session.updatedAt).toBe(42_000);
        } else expect(session).toBe(before.get(session.id));
    }
});

it("starts in one round trip: the bootstrap is read beside the feed, and nothing else", async () => {
    const { connection, daemon } = harnessOpen();
    daemon.projectSeed({ id: "project-a" });
    const groups = groupsWatch(connection);

    await vi.waitFor(() => expect(groups.state.connection).toBe("live"));
    expect(groups.state.sessionsComplete).toBe(true);
    expect(groups.projects.map((project) => project.id)).toEqual(["project-a"]);
    // The feed opened at the same time as the bootstrap, from the journal's head, and the
    // bootstrap was the health check: no health, onboarding, profile, or config read.
    expect(daemon.calls.slice(0, 2).map((call) => call.method)).toEqual([
        "getDesktopBootstrap",
        "streamEvents",
    ]);
    expect(daemon.streamOpens).toEqual([undefined]);
    expect(daemon.callCount("getHealth")).toBe(0);
    expect(daemon.callCount("getOnboarding")).toBe(0);
    expect(daemon.callCount("getProfile")).toBe(0);
    expect(daemon.callCount("getConfig")).toBe(0);
    expect(connection.compatibility().status).toBe("compatible");
    expect(connection.sync.health()).toMatchObject({ ready: true });
    expect(connection.config()).toEqual(daemon.configGet());
});

/**
 * The browser's HTTP/1.1 connections to the one proxy origin every connection of a window
 * shares: a few at a time, taken by requests in the order they were sent. A response holds its
 * connection until its body ends, so an event stream holds one for as long as it is open.
 */
function connectionSlotsCreate(slots: number): {
    /** A fetch answering from one fake daemon through these shared connections. */
    readonly fetch: (daemon: FakeHappyAgentDaemon) => typeof globalThis.fetch;
    readonly open: () => { readonly streams: number; readonly waiting: readonly string[] };
    /** Takes one connection for good, as a terminal's stream on the same origin does. */
    readonly hold: () => void;
} {
    let busy = 0;
    let streams = 0;
    const waiting: { readonly path: string; readonly start: () => void }[] = [];
    const release = (): void => {
        busy -= 1;
        const nextUp = waiting.shift();
        if (nextUp === undefined) return;
        busy += 1;
        nextUp.start();
    };
    const take = (path: string, signal: AbortSignal | null | undefined): Promise<void> =>
        new Promise((resolve, reject) => {
            if (busy < slots) {
                busy += 1;
                resolve();
                return;
            }
            const entry = { path, start: resolve };
            waiting.push(entry);
            signal?.addEventListener(
                "abort",
                () => {
                    const index = waiting.indexOf(entry);
                    if (index < 0) return;
                    waiting.splice(index, 1);
                    reject(signal.reason);
                },
                { once: true },
            );
        });
    const sse = (name: string, data: unknown, id?: string): string =>
        `${id === undefined ? "" : `id: ${id}\n`}event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
    return {
        fetch: (daemon) => async (input, init) => {
            const path = new URL(String(input)).pathname;
            const signal = init?.signal;
            // Queued as it is sent, before anything else here awaits.
            await take(path, signal);
            if (path.endsWith("/v0/events/stream")) {
                streams += 1;
                const after = new URL(String(input)).searchParams.get("after") ?? undefined;
                const controller = new AbortController();
                const frames = daemon.client
                    .streamEvents({
                        ...(after === undefined ? {} : { after }),
                        signal: AbortSignal.any([controller.signal, ...(signal ? [signal] : [])]),
                    })
                    [Symbol.asyncIterator]();
                let ended = false;
                const end = (): void => {
                    if (ended) return;
                    ended = true;
                    streams -= 1;
                    controller.abort();
                    release();
                };
                signal?.addEventListener("abort", end, { once: true });
                const encoder = new TextEncoder();
                const body = new ReadableStream<Uint8Array>({
                    async pull(stream) {
                        const step = await frames.next();
                        if (step.done === true || ended) {
                            end();
                            stream.close();
                            return;
                        }
                        const frame = step.value;
                        stream.enqueue(
                            encoder.encode(
                                frame.kind === "hello"
                                    ? sse("hello", frame.hello)
                                    : frame.kind === "event"
                                      ? sse(frame.event.type, frame.event, frame.cursor)
                                      : sse(frame.frame.type, frame.frame.data),
                            ),
                        );
                    },
                    cancel: end,
                });
                return new Response(body, { headers: { "content-type": "text/event-stream" } });
            }
            try {
                if (path.endsWith("/v0/bootstrap/desktop")) {
                    await new Promise((resolve) => setTimeout(resolve, 10));
                    return Response.json(await daemon.client.getDesktopBootstrap());
                }
                if (path.endsWith("/v0/health"))
                    return Response.json(await daemon.client.getHealth());
                return Response.json(
                    { error: { code: "not_found", message: "Not found." } },
                    { status: 404 },
                );
            } finally {
                release();
            }
        },
        open: () => ({ streams, waiting: waiting.map((entry) => entry.path) }),
        hold: () => {
            busy += 1;
        },
    };
}

function slotHarnessOpen(
    slots: ReturnType<typeof connectionSlotsCreate>,
    index: number,
): { readonly connection: HappyAgentConnection; readonly groups: GroupsWatch } {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.projectSeed({ id: `project-${String(index)}` });
    const endpoint = `http://proxy.test/connections/${String(index)}/`;
    const connection = connectHappyAgent({
        endpoint,
        token: "token",
        client: new HappyAgentClient({ endpoint, token: "token", fetch: slots.fetch(daemon) }),
        wait: () => new Promise((resolve) => setTimeout(resolve, 0)),
        now: () => 1_000,
    });
    openConnections.push(connection);
    return { connection, groups: groupsWatch(connection) };
}

it("gets every bootstrap through when the connections starting together share six HTTP connections", async () => {
    const slots = connectionSlotsCreate(6);
    const started = Array.from({ length: 6 }, (_, index) => slotHarnessOpen(slots, index));

    await vi.waitFor(() =>
        expect(started.map(({ groups }) => groups.state.connection)).toEqual(
            Array.from({ length: 6 }, () => "live"),
        ),
    );
    await vi.waitFor(() => expect(slots.open().streams).toBe(6));
    // Six feeds fill all six connections, so whatever is sent after them waits for one to
    // close, but no bootstrap was ever left behind them.
    expect(slots.open().waiting.filter((path) => !path.endsWith("/v0/git/watch"))).toEqual([]);
    expect(started.map(({ groups }) => groups.projects.map((project) => project.id))).toEqual(
        started.map((_, index) => [`project-${String(index)}`]),
    );
});

it("gets every bootstrap through when a stream of another kind already holds one of the six", async () => {
    const slots = connectionSlotsCreate(6);
    slots.hold();
    const started = Array.from({ length: 5 }, (_, index) => slotHarnessOpen(slots, index));

    await vi.waitFor(() =>
        expect(started.map(({ groups }) => groups.state.connection)).toEqual(
            Array.from({ length: 5 }, () => "live"),
        ),
    );
    await vi.waitFor(() => expect(slots.open().streams).toBe(5));
    expect(slots.open().waiting.filter((path) => !path.endsWith("/v0/git/watch"))).toEqual([]);
});

it("asks an older daemon whose bootstrap carries no health for it apart, after the bootstrap", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.bootstrapHealthSet(false);
    daemon.projectSeed({ id: "project-a" });
    const { connection } = harnessOpen(daemon);
    const groups = groupsWatch(connection);

    await vi.waitFor(() => expect(groups.state.connection).toBe("live"));
    expect(groups.projects.map((project) => project.id)).toEqual(["project-a"]);
    const methods = daemon.calls.map((call) => call.method);
    expect(methods.indexOf("getHealth")).toBeGreaterThan(methods.indexOf("getDesktopBootstrap"));
    expect(daemon.callCount("getHealth")).toBe(1);
    expect(daemon.callCount("getDesktopBootstrap")).toBe(1);
    expect(daemon.callCount("getOnboarding")).toBe(0);
    expect(daemon.streamOpens).toEqual([undefined]);
    expect(connection.compatibility().status).toBe("compatible");
});

it("takes nothing from an older daemon of an unsupported version found by its health after the bootstrap", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.bootstrapHealthSet(false);
    daemon.healthSet({ daemon: "0.0.1" });
    daemon.projectSeed({ id: "project-a" });
    const { connection } = harnessOpen(daemon);
    const groups = groupsWatch(connection);

    await vi.waitFor(() =>
        expect(connection.compatibility()).toMatchObject({ status: "server_outdated" }),
    );
    await vi.waitFor(() => expect(daemon.streamLiveCount()).toBe(0));
    expect(groups.state.connection).toBe("connecting");
    expect(groups.projects).toEqual([]);
    expect(connection.config()).toBeUndefined();
});

it("holds updates that arrive before the bootstrap and applies only the ones past its cursor", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    const project = daemon.projectSeed({ id: "project-a" });
    const agent = daemon.agentSeed(project.id, { id: "agent-a", title: "First" });
    const releaseBootstrap = daemon.pause("getDesktopBootstrap");
    const { connection } = harnessOpen(daemon);
    const groups = groupsWatch(connection);
    const titled = (title: string, previousVersion: string) => {
        const version = daemon.versionNext();
        daemon.agentReplace({ ...daemon.agentGet(agent.id), title, version });
        daemon.eventEmit("agent.updated", {
            agentId: agent.id,
            previousVersion,
            version,
            changes: { title },
        });
    };

    // The feed is open while the bootstrap is out, and changes arrive on it meanwhile.
    await vi.waitFor(() => expect(daemon.streamLiveCount()).toBe(1));
    titled("Second", agent.version);
    titled("Third", daemon.agentGet(agent.id).version);
    await new Promise((resolve) => setTimeout(resolve, 5));
    // Nothing the feed brought is applied, or even announced, before the snapshot is.
    expect(groups.projects).toEqual([]);
    expect(groups.state.connection).toBe("connecting");

    // The snapshot already holds both changes. Applying either again would break the
    // version chain and read the agent again.
    releaseBootstrap();
    await vi.waitFor(() => expect(groups.state.connection).toBe("live"));
    expect(groups.projects[0]?.sessions[0]?.title).toBe("Third");

    titled("Fourth", daemon.agentGet(agent.id).version);
    await vi.waitFor(() => expect(groups.projects[0]?.sessions[0]?.title).toBe("Fourth"));
    expect(daemon.callCount("getAgent")).toBe(0);
    expect(daemon.streamOpens).toEqual([undefined]);
});

it("follows from the bootstrap's cursor when the feed beside it opened past it", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    const project = daemon.projectSeed({ id: "project-a" });
    const agent = daemon.agentSeed(project.id, { id: "agent-a", title: "First" });
    const releaseStream = daemon.pause("streamEvents");
    const { connection } = harnessOpen(daemon);
    const groups = groupsWatch(connection);

    // The snapshot is taken while the feed is still opening...
    await vi.waitFor(() => expect(groups.projects[0]?.sessions[0]?.title).toBe("First"));
    const bootstrapCursor = daemon.cursorLatest();
    // ...and a change lands between the snapshot and the feed's hello.
    const version = daemon.versionNext();
    daemon.agentReplace({ ...daemon.agentGet(agent.id), title: "Between", version });
    daemon.eventEmit("agent.updated", {
        agentId: agent.id,
        previousVersion: agent.version,
        version,
        changes: { title: "Between" },
    });
    releaseStream();

    await vi.waitFor(() => expect(groups.state.connection).toBe("live"));
    await vi.waitFor(() => expect(groups.projects[0]?.sessions[0]?.title).toBe("Between"));
    // The change was in neither, so the feed was opened again from the snapshot's cursor.
    expect(daemon.streamOpens).toEqual([undefined, bootstrapCursor]);
    expect(daemon.callCount("getDesktopBootstrap")).toBe(1);
    expect(daemon.callCount("getAgent")).toBe(0);
});

it("does not hold the live feed for the git watch", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.projectSeed({ id: "project-a" });
    const releaseWatch = daemon.pause("watchGit");
    const { connection } = harnessOpen(daemon);
    const groups = groupsWatch(connection);

    await vi.waitFor(() => expect(groups.state.connection).toBe("live"));
    expect(groups.projects.map((project) => project.id)).toEqual(["project-a"]);
    expect(daemon.callCount("watchGit")).toBe(1);
    releaseWatch();
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

it("reads a replacement daemon's health and reports its version after reconciling", async () => {
    const { connection, daemon } = harnessOpen();
    daemon.projectSeed({ id: "project-a" });
    const groups = groupsWatch(connection);
    await vi.waitFor(() => expect(groups.state.connection).toBe("live"));
    expect(connection.compatibility()).toMatchObject({
        status: "compatible",
        serverVersion: MINIMUM_HAPPY_AGENT_VERSION,
    });

    // The same endpoint now answers from another process on another version.
    daemon.daemonReplace({ version: "0.4.75" });

    await vi.waitFor(() =>
        expect(connection.compatibility()).toMatchObject({
            status: "compatible",
            serverVersion: "0.4.75",
        }),
    );
    await vi.waitFor(() => expect(groups.state.connection).toBe("live"));
    // The first process's health came with its bootstrap; only the replacement's is read.
    expect(daemon.callCount("getHealth")).toBe(1);
    expect(daemon.callCount("getDesktopBootstrap")).toBe(2);
    expect(groups.projects.map((project) => project.id)).toEqual(["project-a"]);
});

it("takes nothing from an incompatible replacement until its health admits it", async () => {
    const { connection, daemon } = harnessOpen();
    const groups = groupsWatch(connection);
    await vi.waitFor(() => expect(groups.state.connection).toBe("live"));

    daemon.daemonReplace({ version: "0.0.1" });
    await vi.waitFor(() =>
        expect(connection.compatibility()).toMatchObject({
            status: "server_outdated",
            serverVersion: "0.0.1",
        }),
    );
    await vi.waitFor(() => expect(daemon.callCount("getHealth")).toBeGreaterThanOrEqual(3));
    expect(groups.state.connection).toBe("reconnecting");
    expect(daemon.callCount("getDesktopBootstrap")).toBe(1);
    expect(daemon.callCount("streamEvents")).toBe(2);

    daemon.healthSet({ daemon: "0.4.75" });
    await vi.waitFor(() => expect(groups.state.connection).toBe("live"));
    expect(connection.compatibility()).toMatchObject({
        status: "compatible",
        serverVersion: "0.4.75",
    });
    expect(daemon.callCount("getDesktopBootstrap")).toBe(2);
});

it("does not read health again when the same daemon's feed only reconnects", async () => {
    const { connection, daemon } = harnessOpen();
    const groups = groupsWatch(connection);
    await vi.waitFor(() => expect(groups.state.connection).toBe("live"));

    daemon.streamDropAll();
    await vi.waitFor(() => expect(daemon.streamOpens).toHaveLength(2));
    await vi.waitFor(() => expect(groups.state.connection).toBe("live"));
    expect(daemon.callCount("getHealth")).toBe(0);
    expect(daemon.callCount("getDesktopBootstrap")).toBe(1);
});

it("retries an unreachable daemon with exponential backoff and surfaces the error", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.projectSeed({ id: "project-a" });
    // Each attempt's bootstrap fails, and so does the health asked why.
    for (let attempt = 0; attempt < 3; attempt += 1) {
        daemon.failOnce("getDesktopBootstrap", new Error("down"));
        daemon.failOnce("getHealth", new Error("down"));
    }
    const { connection, waits } = harnessOpen(daemon);
    const groups = groupsWatch(connection);

    await vi.waitFor(() => expect(groups.state.connection).toBe("live"));
    expect(waits.slice(0, 3)).toEqual([250, 500, 1_000]);
    expect(groups.errors.length).toBeGreaterThanOrEqual(3);
});

it("asks health why a failed bootstrap failed, then polls it until the daemon is ready", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.projectSeed({ id: "project-a" });
    daemon.healthSet({ ready: false });
    const { connection, waits } = harnessOpen(daemon);
    const groups = groupsWatch(connection);

    await vi.waitFor(() => expect(waits.length).toBeGreaterThanOrEqual(2));
    // Each attempt's bootstrap is refused, health says why, and the feed opened beside it is
    // closed again: nothing of a starting daemon is taken.
    expect(daemon.callCount("getHealth")).toBe(daemon.callCount("getDesktopBootstrap"));
    expect(daemon.callCount("getOnboarding")).toBe(0);
    expect(daemon.streamLiveCount()).toBe(0);
    expect(groups.state.connection).toBe("connecting");

    daemon.healthSet({ ready: true });
    await vi.waitFor(() => expect(groups.state.connection).toBe("live"));
    expect(groups.projects.map((project) => project.id)).toEqual(["project-a"]);
});

it("starts step by step when a refused bootstrap turns out to come from a healthy daemon", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.projectSeed({ id: "project-a" });
    daemon.failOnce(
        "getDesktopBootstrap",
        new HappyAgentApiError(401, "Unauthorized", "unauthorized", null),
    );
    const { connection } = harnessOpen(daemon);
    const groups = groupsWatch(connection);

    await vi.waitFor(() => expect(groups.state.connection).toBe("live"));
    expect(groups.projects.map((project) => project.id)).toEqual(["project-a"]);
    // Health explains the refusal, then the start goes the way it always went.
    expect(
        daemon.calls
            .map((call) => call.method)
            .filter((method) => method !== "streamEvents" && method !== "watchGit"),
    ).toEqual([
        "getDesktopBootstrap",
        "getHealth",
        "getOnboarding",
        "getProfile",
        "getDesktopBootstrap",
    ]);
    expect(daemon.streamOpens).toEqual([undefined, daemon.cursorLatest()]);
});

it("takes nothing from a daemon whose bootstrap health names an unsupported version", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.healthSet({ daemon: "0.0.1" });
    daemon.projectSeed({ id: "project-a" });
    const { connection } = harnessOpen(daemon);
    const groups = groupsWatch(connection);

    await vi.waitFor(() =>
        expect(connection.compatibility()).toMatchObject({
            status: "server_outdated",
            serverVersion: "0.0.1",
        }),
    );
    await vi.waitFor(() => expect(daemon.callCount("getHealth")).toBeGreaterThanOrEqual(1));
    expect(daemon.streamLiveCount()).toBe(0);
    expect(groups.state.connection).toBe("connecting");
    expect(groups.projects).toEqual([]);

    daemon.healthSet({ daemon: MINIMUM_HAPPY_AGENT_VERSION });
    await vi.waitFor(() => expect(groups.state.connection).toBe("live"));
    expect(groups.projects.map((project) => project.id)).toEqual(["project-a"]);
});

const freshMachineOnboarding = {
    completed: false,
    steps: {
        profile: { done: false },
        project: { done: false },
        providers: { done: true, signedIn: ["claude"] },
    },
};

it("holds a team member without a profile before bootstrap and the stream", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.onboardingSet(freshMachineOnboarding);
    const { connection } = harnessOpen(daemon);
    const groups = groupsWatch(connection);

    await vi.waitFor(() => expect(daemon.callCount("getOnboarding")).toBeGreaterThanOrEqual(2));
    // Only the bootstrap tried beside the feed, which said a profile is still owed; the feed
    // opened beside it is closed and nothing of it is applied.
    expect(daemon.callCount("getDesktopBootstrap")).toBe(1);
    expect(daemon.streamLiveCount()).toBe(0);
    expect(groups.state.connection).toBe("connecting");
    expect(groups.projects).toEqual([]);
});

it("bootstraps a fresh solo machine that has no profile", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.onboardingSet(freshMachineOnboarding);
    daemon.projectSeed({ id: "project-a" });
    const { connection } = harnessOpen(daemon, { memberProfileRequired: false });
    const groups = groupsWatch(connection);

    await vi.waitFor(() => expect(groups.state.connection).toBe("live"));
    expect(groups.projects.map((project) => project.id)).toEqual(["project-a"]);
    expect(daemon.callCount("getDesktopBootstrap")).toBe(1);
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

it("preserves configuration and diagnostic identities from live delivery through history reload", async () => {
    const { daemon, connection, chat, sessionId } = await liveHarness();
    const before: MessageMode = {
        providerId: "claude",
        providerType: "claude",
        account: { id: "work", label: "Work" },
        modelId: "opus",
        effort: "high",
        serviceTier: null,
        permissionMode: "auto",
    };
    const after: MessageMode = {
        ...before,
        providerId: "claude_extra",
        account: { id: "personal", label: "Personal" },
    };
    const messages: Message[] = [
        {
            id: "baseline",
            role: "service",
            createdAt: 1,
            metadata: {},
            content: [
                { type: "configuration", before: null, after: before, beforeMessageId: null },
            ],
        },
        {
            id: "configuration",
            role: "service",
            createdAt: 2,
            metadata: {},
            content: [{ type: "configuration", before, after, beforeMessageId: "baseline" }],
        },
        {
            id: "opaque-durable-history-id",
            role: "service",
            createdAt: 3,
            metadata: {},
            content: [{ type: "text", text: "Authentication failed\n  preserved details" }],
            error: {
                code: "authentication_failed",
                mode: after,
                credentialSource: {
                    kind: "native_login",
                    location: "Claude Code sign-in",
                    host: "Agent host",
                },
                recovery: { steps: ["Retry first."], actions: ["ask_chief"] },
            },
        },
    ];
    const run = fakeRun({ id: "configuration-run", status: "running", messages });
    daemon.historySet(sessionId, [run]);
    daemon.eventEmit("run.started", { agentId: sessionId, run, acceptedMessageIds: [] });
    for (const message of messages) {
        const event = daemon.eventEmit("message.created", {
            agentId: sessionId,
            message,
            runId: run.id,
        });
        daemon.eventRedeliver(event);
    }
    const diagnosticElements = (elements: readonly ChatElement[]) =>
        elements.filter(
            (element) => element.kind === "configuration" || element.kind === "failure",
        );
    await vi.waitFor(() => expect(diagnosticElements(chat.elements)).toHaveLength(2));
    const live = diagnosticElements(chat.elements);
    expect(live[1]).toMatchObject({
        kind: "failure",
        messageId: "opaque-durable-history-id",
        error: { mode: after },
    });
    expect(chat.elements.some((element) => element.id.includes("baseline"))).toBe(false);
    connection.close();
    const reloaded = harnessOpen(daemon);
    groupsWatch(reloaded.connection);
    const replay = sessionWatch(reloaded.connection, sessionId);
    await vi.waitFor(() => expect(diagnosticElements(replay.elements)).toEqual(live));
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

it("voice acceptance waits for authority and preserves the optimistic row identity", async () => {
    const { connection, daemon, chat, sessionId } = await liveHarness();
    const release = daemon.pause("sendMessage");
    let accepted = false;
    const sent = connection.sendMessageConfirmed(sessionId, "Reviewed voice text").then(() => {
        accepted = true;
    });
    const optimistic = userMessages(chat.elements)[0]!;
    expect(optimistic.authority).toBe("local");
    await Promise.resolve();
    expect(accepted).toBe(false);
    release();
    await sent;
    expect(accepted).toBe(true);
    const authoritative = userMessages(chat.elements)[0]!;
    expect(authoritative.authority).toBe("server");
    expect(authoritative.id).toBe(optimistic.id);
    expect(authoritative.messageId).toBe(optimistic.messageId);
    expect(daemon.callCount("sendMessage")).toBe(1);
});

it("voice acceptance resolves from an authoritative event before the HTTP response", async () => {
    const { connection, daemon, chat, sessionId } = await liveHarness();
    const release = daemon.pause("sendMessage:respond");
    try {
        await connection.sendMessageConfirmed(sessionId, "Exact confirmed text");
        expect(userMessages(chat.elements)).toHaveLength(1);
        expect(userMessages(chat.elements)[0]?.authority).toBe("server");
        expect(daemon.callCount("sendMessage")).toBe(1);
    } finally {
        release();
    }
});

it("voice acceptance rejects a delayed daemon refusal without claiming delivery or retrying", async () => {
    const { connection, daemon, chat, sessionId } = await liveHarness();
    daemon.failOnce("sendMessage", new HappyAgentApiError(400, "refused", "invalid_request", null));
    const sent = connection.sendMessageConfirmed(sessionId, "Do not claim this was sent");
    expect(userMessages(chat.elements)[0]?.authority).toBe("local");
    await expect(sent).rejects.toThrow("not accepted");
    expect(userMessages(chat.elements)).toEqual([]);
    expect(daemon.callCount("sendMessage")).toBe(1);
});

it("fails a send a draining daemon refuses at once, and says the daemon takes nothing new", async () => {
    const { connection, daemon, chat, groups, sessionId } = await liveHarness();
    expect(groups.state.admitting).toBeUndefined();
    daemon.failOnce(
        "sendMessage",
        new HappyAgentApiError(503, "Happy Agent is draining.", "draining", null),
    );
    const mutationId = connection.sendMessage(sessionId, "Racing the start of a drain");
    expect(userMessages(chat.elements)).toHaveLength(1);
    await expect(connection.sendAcceptanceWait(mutationId)).rejects.toBeInstanceOf(
        MessageRefusedError,
    );
    // Refused for good rather than retried for minutes, and its one row gone.
    expect(daemon.callCount("sendMessage")).toBe(1);
    expect(userMessages(chat.elements)).toEqual([]);
    expect(groups.state.admitting).toBe(false);
});

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

it("starts sends without waiting for draft persistence or another send", async () => {
    const { connection, daemon, sessionId } = await liveHarness();
    const releaseDraft = daemon.pause("saveAgentDraft");
    const release = daemon.pause("sendMessage");
    connection.setDraft(sessionId, "");
    await vi.waitFor(() => expect(daemon.callCount("saveAgentDraft")).toBe(1));
    connection.sendMessage(sessionId, "first");
    connection.sendMessage(sessionId, "second");
    await vi.waitFor(() => expect(daemon.callCount("sendMessage")).toBe(2));
    const texts = daemon.calls
        .filter((call) => call.method === "sendMessage")
        .map((call) => (call.args[1] as { text: string }).text);
    expect(texts).toEqual(["first", "second"]);
    release();
    releaseDraft();
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

it("reopens a session that streamed while unwatched without reading its history again", async () => {
    const { connection, daemon } = harnessOpen();
    const project = daemon.projectSeed({ id: "project-a" });
    const agent = daemon.agentSeed(project.id, { id: "agent-a" });
    const groups = groupsWatch(connection);
    const first: SessionWatch = { elements: [], session: undefined, errors: [], deltas: [] };
    const handle = connection.connectSession({
        sessionId: agent.id,
        onChange(elements, session) {
            first.elements = elements;
            first.session = session;
        },
    });
    await vi.waitFor(() => {
        expect(groups.state.connection).toBe("live");
        expect(first.session?.connection).toBe("live");
    });
    handle.close();
    const loads = daemon.callCount("getMessages");

    // The reader is elsewhere while the whole turn streams.
    daemon.eventEmit("run.started", {
        agentId: agent.id,
        run: fakeRun({ id: "r1", status: "running" }),
        acceptedMessageIds: [],
    });
    daemon.eventEmit("message.created", {
        agentId: agent.id,
        message: fakeAgentMessage({ id: "a1", content: [{ type: "text", text: "Hel" }] }),
        runId: "r1",
    });
    daemon.eventEmit("message.delta", {
        agentId: agent.id,
        runId: "r1",
        messageId: "a1",
        blockIndex: 0,
        offset: 3,
        append: "lo",
    });
    await vi.waitFor(() => expect(daemon.streamOpens.length).toBeGreaterThan(0));
    await new Promise((resolve) => setTimeout(resolve, 5));

    // Coming back shows the streamed text at once, without a history read.
    const reopened = sessionWatch(connection, agent.id);
    expect(agentTexts(reopened.elements).map((element) => element.text)).toEqual(["Hello"]);

    daemon.eventEmit("run.finished", {
        agentId: agent.id,
        run: fakeRun({ id: "r1", status: "completed", endedAt: 2 }),
    });
    await vi.waitFor(() => expect(reopened.session?.status).toBe("idle"));
    expect(daemon.callCount("getMessages")).toBe(loads);
});

it("opens a prefetched session with its transcript already there, reading history once", async () => {
    const { connection, daemon } = harnessOpen();
    const project = daemon.projectSeed({ id: "project-a" });
    const agent = daemon.agentSeed(project.id, { id: "agent-a" });
    daemon.historySet(agent.id, [
        fakeRun({
            id: "r1",
            status: "completed",
            endedAt: 2,
            messages: [fakeUserMessage({ id: "m1", content: [{ type: "text", text: "earlier" }] })],
        }),
    ]);
    const groups = groupsWatch(connection);
    await vi.waitFor(() => expect(groups.state.connection).toBe("live"));

    connection.prefetchSession(agent.id);
    connection.prefetchSession(agent.id);
    await vi.waitFor(() => expect(daemon.callCount("getMessages")).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 5));

    // The first snapshot a reader gets is the loaded transcript, not a loading one.
    const reopened = sessionWatch(connection, agent.id);
    expect(reopened.session?.historyLoading).not.toBe(true);
    expect(userMessages(reopened.elements).map((element) => element.text)).toEqual(["earlier"]);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(daemon.callCount("getMessages")).toBe(1);
});

it("reads the most recent sessions ahead once the sidebar is live, so opening one shows its transcript", async () => {
    const { connection, daemon } = harnessOpen(undefined, { preloadedSessions: 2 });
    const project = daemon.projectSeed({ id: "project-a" });
    const old = daemon.agentSeed(project.id, { id: "agent-old", updatedAt: 1 });
    const recent = daemon.agentSeed(project.id, { id: "agent-recent", updatedAt: 3 });
    const newest = daemon.agentSeed(project.id, { id: "agent-newest", updatedAt: 4 });
    daemon.historySet(recent.id, [
        fakeRun({
            id: "r1",
            status: "completed",
            endedAt: 2,
            messages: [fakeUserMessage({ id: "m1", content: [{ type: "text", text: "earlier" }] })],
        }),
    ]);
    const groups = groupsWatch(connection);
    await vi.waitFor(() => expect(groups.state.connection).toBe("live"));
    await vi.waitFor(() => expect(daemon.callCount("getMessages")).toBe(2));
    await new Promise((resolve) => setTimeout(resolve, 5));

    const reopened = sessionWatch(connection, recent.id);
    expect(reopened.session?.historyLoading).not.toBe(true);
    expect(userMessages(reopened.elements).map((element) => element.text)).toEqual(["earlier"]);
    sessionWatch(connection, newest.id);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(daemon.callCount("getMessages")).toBe(2);
    // An older session was not read ahead, so opening it reads it.
    sessionWatch(connection, old.id);
    await vi.waitFor(() => expect(daemon.callCount("getMessages")).toBe(3));
});

it("keeps an open session's question current while another loads in the background", async () => {
    const { connection, daemon } = harnessOpen();
    const project = daemon.projectSeed({ id: "project-a" });
    const open = daemon.agentSeed(project.id, { id: "agent-open", pendingQuestionId: "q1" });
    const background = daemon.agentSeed(project.id, { id: "agent-background" });
    const question: Question = {
        id: "q1",
        agentId: open.id,
        runId: "r1",
        status: "pending",
        questions: [],
        autoResolveAt: null,
        answers: null,
        version: daemon.versionNext(),
        createdAt: 1,
        answeredAt: null,
    };
    daemon.questionSet(open.id, question);
    const groups = groupsWatch(connection);
    await vi.waitFor(() => expect(groups.state.connection).toBe("live"));
    const watched = sessionWatch(connection, open.id);
    await vi.waitFor(() => expect(watched.session?.historyLoading).not.toBe(true));
    const questionReads = daemon.callCount("getPendingQuestion");

    const releaseHistory = daemon.pause("getMessages");
    connection.prefetchSession(background.id);
    await vi.waitFor(() => expect(daemon.callCount("getMessages")).toBe(2));
    daemon.eventEmit("question.updated", {
        questionId: "q1",
        previousVersion: daemon.versionNext(),
        version: daemon.versionNext(),
        changes: { updatedAt: 2 } as never,
    });
    // The open session reads its changed question at once, not when the other load lands.
    await vi.waitFor(() => expect(daemon.callCount("getPendingQuestion")).toBe(questionReads + 1));

    releaseHistory();
    await new Promise((resolve) => setTimeout(resolve, 5));
    // The background session's snapshot may predate that update, so opening it reads it again,
    // behind the transcript it already has.
    const reopened = sessionWatch(connection, background.id);
    expect(reopened.session?.historyLoading).not.toBe(true);
    await vi.waitFor(() => expect(daemon.callCount("getMessages")).toBe(3));
});

it("lets held question updates through once the session that held them is closed mid-load", async () => {
    const { connection, daemon } = harnessOpen();
    const project = daemon.projectSeed({ id: "project-a" });
    const open = daemon.agentSeed(project.id, { id: "agent-open", pendingQuestionId: "q1" });
    const other = daemon.agentSeed(project.id, { id: "agent-other" });
    daemon.questionSet(open.id, {
        id: "q1",
        agentId: open.id,
        runId: "r1",
        status: "pending",
        questions: [],
        autoResolveAt: null,
        answers: null,
        version: daemon.versionNext(),
        createdAt: 1,
        answeredAt: null,
    });
    const groups = groupsWatch(connection);
    await vi.waitFor(() => expect(groups.state.connection).toBe("live"));
    const watched = sessionWatch(connection, open.id);
    await vi.waitFor(() => expect(watched.session?.historyLoading).not.toBe(true));
    const openQuestionReads = () =>
        daemon.calls.filter(
            (call) => call.method === "getPendingQuestion" && call.args[0] === open.id,
        ).length;
    const questionReads = openQuestionReads();

    const releaseHistory = daemon.pause("getMessages");
    const otherSession = connection.connectSession({
        sessionId: other.id,
        onChange: () => undefined,
    });
    await vi.waitFor(() => expect(daemon.callCount("getMessages")).toBe(2));
    daemon.eventEmit("question.updated", {
        questionId: "q1",
        previousVersion: daemon.versionNext(),
        version: daemon.versionNext(),
        changes: { updatedAt: 2 } as never,
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    // Held while someone reads the loading session.
    expect(openQuestionReads()).toBe(questionReads);

    otherSession.close();
    await vi.waitFor(() => expect(openQuestionReads()).toBe(questionReads + 1));
    releaseHistory();
});

it("keeps only the newest few prefetched sessions that were never opened", async () => {
    const { connection, daemon } = harnessOpen();
    const project = daemon.projectSeed({ id: "project-a" });
    const ids = Array.from(
        { length: 8 },
        (_, index) => daemon.agentSeed(project.id, { id: `agent-${String(index)}` }).id,
    );
    const groups = groupsWatch(connection);
    await vi.waitFor(() => expect(groups.state.connection).toBe("live"));

    for (const [index, id] of ids.entries()) {
        connection.prefetchSession(id);
        await vi.waitFor(() => expect(daemon.callCount("getMessages")).toBe(index + 1));
        await new Promise((resolve) => setTimeout(resolve, 2));
    }
    // The oldest were dropped, so opening one reads it again; a recent one is still cached.
    sessionWatch(connection, ids[0]!);
    await vi.waitFor(() => expect(daemon.callCount("getMessages")).toBe(ids.length + 1));
    sessionWatch(connection, ids.at(-1)!);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(daemon.callCount("getMessages")).toBe(ids.length + 1);
});

it("keeps a prefetched session whose read is still loading when older ones are loading too", async () => {
    const { connection, daemon } = harnessOpen();
    const project = daemon.projectSeed({ id: "project-a" });
    const ids = Array.from(
        { length: 7 },
        (_, index) => daemon.agentSeed(project.id, { id: `agent-${String(index)}` }).id,
    );
    const groups = groupsWatch(connection);
    await vi.waitFor(() => expect(groups.state.connection).toBe("live"));
    const releaseHistory = daemon.pause("getMessages");

    for (const id of ids) connection.prefetchSession(id);
    await vi.waitFor(() => expect(daemon.callCount("getMessages")).toBe(ids.length));
    // Opening the newest joins its read instead of starting another.
    sessionWatch(connection, ids.at(-1)!);
    releaseHistory();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(daemon.callCount("getMessages")).toBe(ids.length);
});

it("lets go of the prefetched sessions it kept while they loaded once their reads land", async () => {
    const { connection, daemon } = harnessOpen();
    const project = daemon.projectSeed({ id: "project-a" });
    const ids = Array.from(
        { length: 12 },
        (_, index) => daemon.agentSeed(project.id, { id: `agent-${String(index)}` }).id,
    );
    const groups = groupsWatch(connection);
    await vi.waitFor(() => expect(groups.state.connection).toBe("live"));
    const releaseHistory = daemon.pause("getMessages");

    for (const id of ids) connection.prefetchSession(id);
    await vi.waitFor(() => expect(daemon.callCount("getMessages")).toBe(ids.length));
    releaseHistory();
    await new Promise((resolve) => setTimeout(resolve, 10));
    // Only the newest six stay; opening each of the rest reads it again.
    for (const id of ids) sessionWatch(connection, id);
    await vi.waitFor(() => expect(daemon.callCount("getMessages")).toBe(ids.length + 6));
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(daemon.callCount("getMessages")).toBe(ids.length + 6);
});

it("updates a session's sidebar row while its transcript is still being read", async () => {
    const { connection, daemon } = harnessOpen();
    const project = daemon.projectSeed({ id: "project-a" });
    const agent = daemon.agentSeed(project.id, { id: "agent-a", title: "Before" });
    const groups = groupsWatch(connection);
    await vi.waitFor(() => expect(groups.state.connection).toBe("live"));
    const releaseHistory = daemon.pause("getMessages");
    connection.prefetchSession(agent.id);
    await vi.waitFor(() => expect(daemon.callCount("getMessages")).toBe(1));

    daemon.eventEmit("agent.updated", {
        agentId: agent.id,
        previousVersion: agent.version,
        version: daemon.versionNext(),
        changes: { title: "After", status: "working", updatedAt: 2 },
    });
    const row = () => groups.projects[0]?.sessions.find((session) => session.id === agent.id);
    await vi.waitFor(() => expect(row()?.title).toBe("After"));

    // The load landing with its older snapshot does not put the old title back.
    releaseHistory();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(row()?.title).toBe("After");
    expect(sessionWatch(connection, agent.id).session?.title).toBe("After");
});

it("keeps only the latest page of a session that streams while nobody reads it", async () => {
    const { connection, daemon } = harnessOpen();
    const project = daemon.projectSeed({ id: "project-a" });
    const agent = daemon.agentSeed(project.id, { id: "agent-a" });
    const groups = groupsWatch(connection);
    await vi.waitFor(() => expect(groups.state.connection).toBe("live"));
    let firstLoading: boolean | undefined = true;
    const first = connection.connectSession({
        sessionId: agent.id,
        onChange(_elements, session) {
            firstLoading = session.historyLoading;
        },
    });
    await vi.waitFor(() => expect(firstLoading).not.toBe(true));
    first.close();
    const loads = daemon.callCount("getMessages");

    const runs = [];
    for (let index = 0; index < 150; index += 1) {
        const runId = `r${String(index)}`;
        const message = fakeAgentMessage({
            id: `a${String(index)}`,
            createdAt: index + 1,
            content: [{ type: "text", text: `answer ${String(index)}` }],
        });
        daemon.eventEmit("run.started", {
            agentId: agent.id,
            run: fakeRun({ id: runId, status: "running", startedAt: index + 1 }),
            acceptedMessageIds: [],
        });
        daemon.eventEmit("message.created", { agentId: agent.id, message, runId });
        const finished = {
            id: runId,
            status: "completed",
            startedAt: index + 1,
            endedAt: index + 2,
        } as const;
        runs.push(fakeRun({ ...finished, messages: [message] }));
        daemon.eventEmit("run.finished", { agentId: agent.id, run: fakeRun(finished) });
    }
    daemon.historySet(agent.id, runs);
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Reopening shows the newest hundred at once, without a read, and the rest are a scroll away.
    const reopened = sessionWatch(connection, agent.id);
    const answers = agentTexts(reopened.elements).map((element) => element.text);
    expect(answers).toHaveLength(100);
    expect(answers.at(-1)).toBe("answer 149");
    expect(answers[0]).toBe("answer 50");
    expect(reopened.session?.transcriptComplete).toBe(false);
    expect(reopened.session?.loadMoreToken).toBe("r50");
    expect(daemon.callCount("getMessages")).toBe(loads);
});

it("lets a session on screen shed its oldest page only while its reader follows the newest", async () => {
    const { connection, daemon } = harnessOpen();
    const project = daemon.projectSeed({ id: "project-a" });
    const agent = daemon.agentSeed(project.id, { id: "agent-a" });
    const groups = groupsWatch(connection);
    await vi.waitFor(() => expect(groups.state.connection).toBe("live"));
    let elements: readonly ChatElement[] = [];
    let session: SessionState | undefined;
    const reader = connection.connectSession({
        sessionId: agent.id,
        onChange(next, state) {
            elements = next;
            session = state;
        },
    });
    await vi.waitFor(() => expect(session?.historyLoading).not.toBe(true));
    let next = 0;
    const stream = async (count: number): Promise<void> => {
        for (const end = next + count; next < end; next += 1) {
            const runId = `r${String(next)}`;
            const message = fakeAgentMessage({
                id: `a${String(next)}`,
                createdAt: next + 1,
                content: [{ type: "text", text: `answer ${String(next)}` }],
            });
            daemon.eventEmit("run.started", {
                agentId: agent.id,
                run: fakeRun({ id: runId, status: "running", startedAt: next + 1 }),
                acceptedMessageIds: [],
            });
            daemon.eventEmit("message.created", { agentId: agent.id, message, runId });
            daemon.eventEmit("run.finished", {
                agentId: agent.id,
                run: fakeRun({
                    id: runId,
                    status: "completed",
                    startedAt: next + 1,
                    endedAt: next + 2,
                }),
            });
        }
        await vi.waitFor(() =>
            expect(agentTexts(elements).at(-1)?.text).toBe(`answer ${String(next - 1)}`),
        );
    };

    // A reader who never said they follow, or who scrolled back, keeps everything.
    await stream(250);
    expect(agentTexts(elements)).toHaveLength(250);
    reader.followingSet?.(false);
    await stream(10);
    expect(agentTexts(elements)).toHaveLength(260);

    // Following again, the next finished run leaves the newest page, and the rest a scroll away.
    reader.followingSet?.(true);
    await stream(1);
    const answers = agentTexts(elements).map((element) => element.text);
    expect(answers).toHaveLength(100);
    expect(answers[0]).toBe("answer 161");
    expect(session?.transcriptComplete).toBe(false);
    expect(session?.loadMoreToken).toBe("r161");

    // It grows to two pages before it sheds again.
    await stream(99);
    expect(agentTexts(elements)).toHaveLength(199);
    reader.close();
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

it("reopens the feed after a gap without waiting for an open chat to be read again", async () => {
    const { daemon, groups, chat, sessionId } = await liveHarness();
    daemon.historySet(sessionId, [
        fakeRun({
            id: "r1",
            status: "completed",
            endedAt: 2,
            messages: [fakeUserMessage({ id: "m1", content: [{ type: "text", text: "missed" }] })],
        }),
    ]);
    const releaseHistory = daemon.pause("getMessages");
    daemon.gapOnNextStream();
    daemon.streamDropAll();

    // The catalog is reconciled and the feed is live while the chat is still being read.
    await vi.waitFor(() => {
        expect(daemon.streamOpens).toHaveLength(3);
        expect(groups.state.connection).toBe("live");
    });
    expect(userMessages(chat.elements)).toHaveLength(0);
    releaseHistory();
    await vi.waitFor(() => expect(userMessages(chat.elements)).toHaveLength(1));
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

it("preserves unavailable Git scans and recovers from the next live snapshot", async () => {
    const { daemon, connection } = harnessOpen();
    daemon.projectSeed({ id: "project-git" });
    const groups = groupsWatch(connection);
    await vi.waitFor(() => expect(groups.state.connection).toBe("live"));
    const git = {
        facts: {
            branch: null,
            detached: false,
            head: "abc123",
            upstream: null,
            ahead: 0,
            behind: 0,
        },
        comparison: "unavailable" as const,
        base: null,
        changedFiles: 0,
        insertions: 0,
        deletions: 0,
        countsExact: false,
        conflicted: false,
        files: [],
        filesTruncated: false,
        scannedAt: 1000,
    };
    daemon.eventEmit("git.updated", { workspaceId: "project-git", git });
    await vi.waitFor(() => expect(groups.projects[0]?.git?.comparison).toBe("unavailable"));
    daemon.eventEmit("git.updated", {
        workspaceId: "project-git",
        git: {
            ...git,
            comparison: "ready",
            base: "abc123",
            changedFiles: 1,
            insertions: 1,
            countsExact: true,
            scannedAt: 2000,
            files: [
                {
                    path: "lol.txt",
                    status: "untracked",
                    staged: false,
                    unstaged: true,
                    binary: false,
                    insertions: 1,
                    deletions: 0,
                },
            ],
        },
    });
    await vi.waitFor(() =>
        expect(groups.projects[0]?.git).toMatchObject({
            comparison: "ready",
            changedFiles: 1,
            files: [{ path: "lol.txt" }],
        }),
    );
});

it("retains the last successful Git comparison through failed scans and clears it after a real clean scan", async () => {
    const { daemon, connection } = harnessOpen();
    daemon.projectSeed({ id: "project-git-stale" });
    const groups = groupsWatch(connection);
    await vi.waitFor(() => expect(groups.state.connection).toBe("live"));
    const git = {
        facts: {
            branch: "main",
            detached: false,
            head: "head1",
            upstream: null,
            ahead: 0,
            behind: 0,
        },
        comparison: "ready" as const,
        base: "base1",
        changedFiles: 1,
        insertions: 1,
        deletions: 0,
        countsExact: true,
        conflicted: false,
        files: [
            {
                path: "lol.txt",
                status: "untracked" as const,
                staged: false,
                unstaged: true,
                binary: false,
                insertions: 1,
                deletions: 0,
            },
        ],
        filesTruncated: false,
        scannedAt: 1000,
    };
    daemon.eventEmit("git.updated", { workspaceId: "project-git-stale", git });
    await vi.waitFor(() => expect(groups.projects[0]?.git?.comparison).toBe("ready"));
    const files = groups.projects[0]!.git!.files;
    daemon.eventEmit("git.updated", {
        workspaceId: "project-git-stale",
        git: {
            ...git,
            comparison: "unavailable",
            base: null,
            files: [],
            changedFiles: 0,
            insertions: 0,
            countsExact: false,
            scannedAt: 2000,
        },
    });
    await vi.waitFor(() => expect(groups.projects[0]?.git?.comparison).toBe("stale"));
    expect(groups.projects[0]!.git).toMatchObject({
        changedFiles: 1,
        insertions: 1,
        baseRevision: "base1",
        version: 1000,
    });
    expect(groups.projects[0]!.git!.files).toBe(files);

    // Reconnect hydration must preserve the same cache when the new scan fails.
    vi.spyOn(daemon.client, "watchGit").mockResolvedValueOnce({
        snapshots: {
            "project-git-stale": {
                ...git,
                comparison: "unavailable",
                files: [],
                changedFiles: 0,
                insertions: 0,
                scannedAt: 2500,
            },
        },
    });
    daemon.gapOnNextStream();
    daemon.streamDropAll();
    await vi.waitFor(() => {
        expect(daemon.callCount("getDesktopBootstrap")).toBe(2);
        expect(groups.state.connection).toBe("live");
    });
    expect(groups.projects[0]!.git).toMatchObject({ comparison: "stale", changedFiles: 1 });
    expect(groups.projects[0]!.git!.files).toBe(files);

    // Losing the watch response entirely must not erase the list either.
    vi.spyOn(daemon.client, "watchGit").mockRejectedValueOnce(new Error("watch unavailable"));
    daemon.gapOnNextStream();
    daemon.streamDropAll();
    await vi.waitFor(() => {
        expect(daemon.callCount("getDesktopBootstrap")).toBe(3);
        expect(groups.state.connection).toBe("live");
    });
    expect(groups.projects[0]!.git).toMatchObject({ comparison: "stale", changedFiles: 1 });
    expect(groups.projects[0]!.git!.files).toBe(files);
    daemon.eventEmit("git.updated", {
        workspaceId: "project-git-stale",
        git: { ...git, files: [], changedFiles: 0, insertions: 0, scannedAt: 3000 },
    });
    await vi.waitFor(() =>
        expect(groups.projects[0]?.git).toMatchObject({
            comparison: "ready",
            changedFiles: 0,
            files: [],
            version: 3000,
        }),
    );

    vi.spyOn(daemon.client, "watchGit").mockRejectedValueOnce(new Error("watch unavailable"));
    daemon.gapOnNextStream();
    daemon.streamDropAll();
    await vi.waitFor(() => {
        expect(daemon.callCount("getDesktopBootstrap")).toBe(4);
        expect(groups.state.connection).toBe("live");
    });
    expect(groups.projects[0]!.git).toMatchObject({ comparison: "stale", changedFiles: 0 });
    // A successful refresh of the same scan restores freshness, even at the same timestamp.
    daemon.eventEmit("git.updated", {
        workspaceId: "project-git-stale",
        git: { ...git, files: [], changedFiles: 0, insertions: 0, scannedAt: 3000 },
    });
    await vi.waitFor(() => expect(groups.projects[0]?.git?.comparison).toBe("ready"));
});
