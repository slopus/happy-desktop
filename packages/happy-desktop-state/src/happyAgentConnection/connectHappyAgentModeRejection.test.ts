import { afterEach, expect, it, vi } from "vitest";
import { HappyAgentApiError, type MessageMode } from "@slopus/happy-agent-client";
import { connectHappyAgent } from "./connectHappyAgent.js";
import type { HappyAgentConnection, MutationRejectedDelta, SessionState } from "./types.js";
import { fakeHappyAgentDaemonCreate } from "../testing/fakeHappyAgentDaemon.js";

/* A refused model change leaves the composer on the mode the server holds,
 * never on the one it refused. A model switch and the effort change that
 * follows it are refused together; undoing the second alone would put the
 * composer back on the first's refused model. What was typed meanwhile stays. */

const openConnections: HappyAgentConnection[] = [];

afterEach(() => {
    for (const connection of openConnections.splice(0)) connection.close();
});

const SAVED: MessageMode = {
    effort: "medium",
    modelId: "test-model",
    permissionMode: "auto",
    providerId: "test-provider",
    serviceTier: null,
};

const refusal = () =>
    new HappyAgentApiError(409, "The provider is out of usage.", "conflict", null);

async function opened() {
    const daemon = fakeHappyAgentDaemonCreate();
    const task = daemon.taskSeed({ id: "task_mode", name: "Mode", joinedKey: "a1" });
    const agentId = task.agent.id;
    daemon.modeSeed(agentId, SAVED);
    daemon.draftSeed(agentId, { value: { ...SAVED, text: "" }, updatedAt: 100 });
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
    connection.connectGroups({ onChange: () => undefined, onError: () => undefined });
    const state: { current: SessionState | undefined } = { current: undefined };
    const subscription = connection.connectSession({
        sessionId: agentId,
        onChange(_elements, session) {
            state.current = session;
        },
    });
    const session = () => state.current ?? subscription.session();
    await vi.waitFor(() =>
        expect(session()).toMatchObject({ modelId: "test-model", selectionKnown: true }),
    );
    return { daemon, connection, agentId, rejections, session };
}

it("returns to the server's mode when a model switch and its effort change are both refused", async () => {
    const { daemon, connection, agentId, rejections, session } = await opened();
    daemon.failOnce("saveAgentDraft", refusal());
    daemon.failOnce("saveAgentDraft", refusal());
    connection.switchModel(agentId, { modelId: "other-model", providerId: "other-provider" });
    connection.setEffort(agentId, "high");
    expect(session()).toMatchObject({ modelId: "other-model", providerId: "other-provider" });
    await vi.waitFor(() => expect(rejections).toHaveLength(2));
    expect(session()).toMatchObject({
        effort: "medium",
        modelId: "test-model",
        providerId: "test-provider",
    });
});

it("keeps what was typed while a refused model switch was out", async () => {
    const { daemon, connection, agentId, rejections, session } = await opened();
    const release = daemon.pause("saveAgentDraft");
    daemon.failOnce("saveAgentDraft", refusal());
    connection.switchModel(agentId, { modelId: "other-model", providerId: "other-provider" });
    connection.setDraft(agentId, { draft: "Words typed meanwhile", updatedAt: 2_000 });
    release();
    await vi.waitFor(() => expect(rejections).toHaveLength(1));
    expect(session()).toMatchObject({
        draft: "Words typed meanwhile",
        modelId: "test-model",
        providerId: "test-provider",
    });
});

it("keeps an earlier change the server accepted when a later one is refused", async () => {
    const { daemon, connection, agentId, rejections, session } = await opened();
    connection.switchModel(agentId, { modelId: "other-model", providerId: "other-provider" });
    await vi.waitFor(() => expect(daemon.callCount("saveAgentDraft")).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 10));
    daemon.failOnce("saveAgentDraft", refusal());
    connection.switchModel(agentId, { modelId: "third-model", providerId: "third-provider" });
    await vi.waitFor(() => expect(rejections).toHaveLength(1));
    expect(session()).toMatchObject({ modelId: "other-model", providerId: "other-provider" });
});

it("saves what was typed during a refused switch on the server's mode", async () => {
    const { daemon, connection, agentId, rejections, session } = await opened();
    const release = daemon.pause("saveAgentDraft");
    daemon.failOnce("saveAgentDraft", refusal());
    connection.switchModel(agentId, { modelId: "other-model", providerId: "other-provider" });
    connection.setDraft(agentId, { draft: "Words typed meanwhile", updatedAt: 2_000 });
    release();
    await vi.waitFor(() => expect(rejections).toHaveLength(1));
    await vi.waitFor(() => expect(daemon.callCount("saveAgentDraft")).toBe(2));
    const textSave = daemon.calls.filter((call) => call.method === "saveAgentDraft")[1]!;
    expect(textSave.args[1]).toMatchObject({
        draft: {
            text: "Words typed meanwhile",
            modelId: "test-model",
            providerId: "test-provider",
        },
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(session()).toMatchObject({ draft: "Words typed meanwhile", modelId: "test-model" });
});
