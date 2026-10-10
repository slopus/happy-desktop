import { afterEach, expect, it, vi } from "vitest";
import type { ConversationAgentIdentity } from "../conversation/conversationEntry.js";
import { connectHappyAgent } from "../happyAgentConnection/connectHappyAgent.js";
import type { HappyAgentConnection } from "../happyAgentConnection/types.js";
import {
    fakeHappyAgentDaemonCreate,
    fakeRun,
    fakeUserMessage,
} from "../testing/fakeHappyAgentDaemon.js";
import type { HappyAgentAgentIdentitySource } from "./happyAgentAgentIdentities.js";
import { happyAgentChatStoreCreate } from "./happyAgentChatStore.js";
import { happyAgentModelCatalogProject } from "./happyAgentProject.js";
import type { HappyAgentSessionId } from "./happyAgentTypes.js";

/* A conversation names the agents that write into it as soon as the window
 * can: one it cannot name yet is asked about, and the row picks up the name
 * when the answer comes, without the message text changing. */

const openConnections: HappyAgentConnection[] = [];

afterEach(() => {
    for (const connection of openConnections.splice(0)) connection.close();
});

const TEXT = "Message from agent agent_far:\n\nThe build is green.";

it("asks about an unnamed sender and names its row once the answer arrives", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    const project = daemon.projectSeed({ id: "project-a" });
    daemon.agentSeed(project.id, { id: "agent-reader" });
    daemon.historySet("agent-reader", [
        fakeRun({
            id: "run-1",
            messages: [
                fakeUserMessage({
                    id: "message-1",
                    status: "accepted",
                    content: [{ type: "text", text: TEXT }],
                    metadata: { senderAgentId: "agent_far" },
                }),
            ],
        }),
    ]);
    const connection = connectHappyAgent({
        endpoint: "http://happy-agent.test/",
        token: "token",
        client: daemon.client,
        wait: () => new Promise((resolve) => setTimeout(resolve, 0)),
        now: () => 1_000,
    });
    openConnections.push(connection);
    connection.connectGroups({ onChange: () => undefined, onError: () => undefined });

    const known = new Map<string, ConversationAgentIdentity>();
    const listeners = new Set<() => void>();
    const source: HappyAgentAgentIdentitySource = {
        lookup: (agentId) => known.get(agentId),
        request: vi.fn(),
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
    const store = happyAgentChatStoreCreate("agent-reader" as HappyAgentSessionId, {
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
        agentIdentities: source,
    });
    const unsubscribe = store.subscribe(() => undefined);
    const row = () => {
        for (const entry of store.get().entries)
            if (entry.kind === "agentActivity" && entry.activity.kind === "agentMessage")
                return entry.activity;
        return undefined;
    };

    await vi.waitFor(() => expect(row()).toBeDefined());
    expect(row()).toEqual({ kind: "agentMessage", agentId: "agent_far", text: TEXT });
    expect(source.request).toHaveBeenCalledWith("agent_far");
    expect(listeners.size).toBe(1);

    known.set("agent_far", {
        name: "Nightly triage",
        face: { kind: "generated", seed: "agent_far" },
    });
    for (const listener of listeners) listener();
    expect(row()).toEqual({
        kind: "agentMessage",
        agentId: "agent_far",
        agentName: "Nightly triage",
        agentFace: { kind: "generated", seed: "agent_far" },
        text: TEXT,
    });

    store[Symbol.dispose]();
    unsubscribe();
    expect(listeners.size).toBe(0);
});
