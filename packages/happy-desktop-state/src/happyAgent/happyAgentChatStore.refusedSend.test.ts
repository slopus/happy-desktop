import { HappyAgentApiError } from "@slopus/happy-agent-client";
import { afterEach, expect, it, vi } from "vitest";
import { connectHappyAgent } from "../happyAgentConnection/connectHappyAgent.js";
import type { HappyAgentConnection } from "../happyAgentConnection/types.js";
import { fakeHappyAgentDaemonCreate } from "../testing/fakeHappyAgentDaemon.js";
import type { UserError } from "../types.js";
import { happyAgentChatStoreCreate, type HappyAgentChatStore } from "./happyAgentChatStore.js";
import { happyAgentModelCatalogProject } from "./happyAgentProject.js";
import type { HappyAgentSessionId } from "./happyAgentTypes.js";

/* One client message ID is one row in the conversation, whatever the daemon
 * does with it: taken, redelivered, or refused because it started draining. */

const openConnections: HappyAgentConnection[] = [];
const disposers: (() => void)[] = [];

afterEach(() => {
    for (const dispose of disposers.splice(0)) dispose();
    for (const connection of openConnections.splice(0)) connection.close();
});

async function chatOpen() {
    const daemon = fakeHappyAgentDaemonCreate();
    const project = daemon.projectSeed({ id: "project-a" });
    daemon.agentSeed(project.id, { id: "agent-a" });
    const connection = connectHappyAgent({
        endpoint: "http://happy-agent.test/",
        token: "token",
        client: daemon.client,
        wait: () => new Promise((resolve) => setTimeout(resolve, 0)),
        now: () => 1_000,
    });
    openConnections.push(connection);
    connection.connectGroups({ onChange: () => undefined, onError: () => undefined });
    const store: HappyAgentChatStore = happyAgentChatStoreCreate("agent-a" as HappyAgentSessionId, {
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
        connectMutationSubscribe: () => () => undefined,
    });
    disposers.push(store.subscribe(() => undefined));
    await vi.waitFor(() => expect(store.get().ready).toBe(true));
    return { daemon, store };
}

function rows(store: HappyAgentChatStore, text: string) {
    return store
        .get()
        .entries.filter((entry) => entry.kind === "message" && entry.message.text === text);
}

it("keeps one row for one message through its event, a reconnect, and its response", async () => {
    const { daemon, store } = await chatOpen();
    const respond = daemon.pause("sendMessage:respond");
    await store.messageSend("Exactly once");
    await vi.waitFor(() => expect(daemon.callCount("sendMessage")).toBe(1));
    expect(rows(store, "Exactly once")).toHaveLength(1);

    // The stream drops while the response is still out, so the transcript is
    // read again from the daemon with the send already in it.
    daemon.streamDropAll();
    await vi.waitFor(() => expect(daemon.streamLiveCount()).toBeGreaterThan(0));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(rows(store, "Exactly once")).toHaveLength(1);
    respond();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(rows(store, "Exactly once")).toHaveLength(1);
});

it("removes a send a draining daemon refused, hands it back, and keeps a resend to one row", async () => {
    const { daemon, store } = await chatOpen();
    daemon.failOnce(
        "sendMessage",
        new HappyAgentApiError(503, "Happy Agent is draining.", "draining", null),
    );
    const refused = vi.fn<(error: UserError) => void>();
    await store.messageSend("Racing the drain", [], refused);
    await vi.waitFor(() => expect(refused).toHaveBeenCalledTimes(1));
    // The refused row is gone rather than left behind as a ghost.
    expect(rows(store, "Racing the drain")).toEqual([]);
    expect(daemon.callCount("sendMessage")).toBe(1);

    await store.messageSend("Racing the drain");
    await vi.waitFor(() => expect(daemon.callCount("sendMessage")).toBe(2));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(rows(store, "Racing the drain")).toHaveLength(1);
});

it("hands the daemon the delivery a send asked for, steering when it names none", async () => {
    const { daemon, store } = await chatOpen();
    await store.messageSend("Steer by default");
    await store.messageSend("Wait for the run", [], undefined, "queue");
    await store.messageSend("Steer on purpose", [], undefined, "steer");
    await vi.waitFor(() => expect(daemon.callCount("sendMessage")).toBe(3));
    expect(
        daemon.calls.filter((call) => call.method === "sendMessage").map((call) => call.args[1]),
    ).toMatchObject([
        { text: "Steer by default", delivery: "steer" },
        { text: "Wait for the run", delivery: "queue" },
        { text: "Steer on purpose", delivery: "steer" },
    ]);
});
