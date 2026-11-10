import { Type } from "@sinclair/typebox";
import {
    defineUiComponent,
    HappyAgentApiError,
    UiSecret,
    type Message,
    type UiActionRequest,
    type UiDocument,
} from "@slopus/happy-agent-client";
import { afterEach, expect, it, vi } from "vitest";
import {
    chatUiActionAllowed,
    chatUiComponentKey,
    defaultModelComponent,
    quickRepliesKey,
    type ConversationUi,
} from "../chatUi/chatUi.js";
import type { ChatUiGrantedFollow } from "../chatUi/chatUiGranted.js";
import type { ConversationEntry } from "../conversation/conversationEntry.js";
import { connectHappyAgent } from "../happyAgentConnection/connectHappyAgent.js";
import type { HappyAgentConnection } from "../happyAgentConnection/types.js";
import { fakeHappyAgentDaemonCreate, fakeRun } from "../testing/fakeHappyAgentDaemon.js";
import { happyAgentChatStoreCreate, type HappyAgentChatStore } from "./happyAgentChatStore.js";
import { happyAgentModelCatalogProject } from "./happyAgentProject.js";
import type { HappyAgentSessionId } from "./happyAgentTypes.js";

/* Chat UI from the wire to the store and back: a document on its message's
 * entry, a click as one `/actions` request under one ID, what the control
 * shows meanwhile and afterwards, and suggested replies sent as messages. */

const openConnections: HappyAgentConnection[] = [];
const disposers: (() => void)[] = [];

afterEach(() => {
    for (const dispose of disposers.splice(0)) dispose();
    for (const connection of openConnections.splice(0)) connection.close();
});

const document: UiDocument = {
    id: "ui1",
    components: [
        { id: "tree", type: "file_tree", fallback: "src/app.ts", props: { paths: ["src/app.ts"] } },
        { id: "model", type: "default_model", fallback: "The default model", props: {} },
    ],
};
const offer = { messageId: "m1", uiId: "ui1" };
const modelKey = chatUiComponentKey(offer, "model");
const choice = { providerId: "claude", modelId: "opus", effort: "high" };

const offered: Message = {
    id: "m1",
    role: "agent",
    createdAt: 2,
    metadata: {},
    content: [
        { type: "text", text: "Pick a model." },
        { type: "ui", ui: document },
    ],
};

const suggested: Message = {
    id: "m2",
    role: "agent",
    createdAt: 3,
    metadata: {},
    content: [
        { type: "text", text: "Shall I merge?" },
        {
            type: "tool_call",
            id: "call7",
            name: "suggest_replies",
            status: "completed",
            arguments: {},
            presentation: { type: "quick_replies", options: ["Merge it", "Not now"] },
        },
    ],
};

async function chatOpen(
    messages: Message[],
    options: {
        uiGrantedFollow?: ChatUiGrantedFollow;
        onTopLevelSessionFinished?: (sessionId: string) => void;
    } = {},
) {
    const daemon = fakeHappyAgentDaemonCreate();
    const project = daemon.projectSeed({ id: "project-a" });
    daemon.agentSeed(project.id, { id: "agent-a" });
    daemon.historySet("agent-a", [fakeRun({ id: "run-1", endedAt: 5, messages })]);
    const connection = connectHappyAgent({
        endpoint: "http://happy-agent.test/",
        token: "token",
        client: daemon.client,
        wait: () => new Promise((resolve) => setTimeout(resolve, 0)),
        now: () => 1_000,
        ...(options.onTopLevelSessionFinished
            ? { onTopLevelSessionFinished: options.onTopLevelSessionFinished }
            : {}),
    });
    openConnections.push(connection);
    connection.connectGroups({ onChange: () => undefined, onError: () => undefined });
    const rejections = new Set<(rejection: { mutationId: string; message: string }) => void>();
    const store: HappyAgentChatStore = happyAgentChatStoreCreate("agent-a" as HappyAgentSessionId, {
        catalog: happyAgentModelCatalogProject(daemon.configGet()),
        transcriptConnect: (connect) => {
            const session = connection.connectSession({
                sessionId: connect.sessionId,
                onChange: (elements, state) => connect.onChange(elements, state, []),
                onError: connect.onError,
            });
            return { close: () => session.close(), loadMore: (token) => session.loadMore(token) };
        },
        connectActions: connection,
        connectMutationSubscribe: (listener) => {
            rejections.add(listener as never);
            return () => rejections.delete(listener as never);
        },
        ...(options.uiGrantedFollow ? { uiGrantedFollow: options.uiGrantedFollow } : {}),
    });
    disposers.push(store.subscribe(() => undefined));
    await vi.waitFor(() => expect(store.get().ready).toBe(true));
    return {
        daemon,
        store,
        reject: (mutationId: string) => {
            for (const listener of rejections) listener({ mutationId, message: "Refused." });
        },
    };
}

function uiOf(store: HappyAgentChatStore): ConversationUi {
    const entry = store
        .get()
        .entries.find((candidate) => candidate.kind === "message" && candidate.ui !== undefined);
    if (entry?.kind !== "message" || entry.ui === undefined) throw new Error("No document.");
    return entry.ui;
}

function repliesOf(store: HappyAgentChatStore) {
    return store
        .get()
        .entries.filter(
            (entry): entry is Extract<ConversationEntry, { kind: "quickReplies" }> =>
                entry.kind === "quickReplies",
        );
}

function requestsOf(daemon: ReturnType<typeof fakeHappyAgentDaemonCreate>): UiActionRequest[] {
    return daemon.calls
        .filter((call) => call.method === "sendUiAction")
        .map((call) => call.args[1] as UiActionRequest);
}

const setModel = (store: HappyAgentChatStore) =>
    store.uiAction(offer, "model", defaultModelComponent, "set", choice);

it("shows a document on its message's entry, under the words before it", async () => {
    const { store } = await chatOpen([offered]);
    const entries = store.get().entries.filter((entry) => entry.kind === "message");
    expect(entries).toHaveLength(1);
    const entry = entries[0]!;
    expect(entry.kind === "message" && entry.message.text).toBe("Pick a model.");
    const ui = uiOf(store);
    expect(ui.offer).toEqual(offer);
    expect(ui.document).toEqual(document);
    expect(ui.attempts.size).toBe(0);
});

it("takes a click's standalone run as no turn: nothing finishes and no turn ends", async () => {
    const finished = vi.fn();
    const { store } = await chatOpen([offered], { onTopLevelSessionFinished: finished });
    const before = store.get();
    const statuses = (entries: readonly ConversationEntry[]) =>
        entries.filter((entry) => entry.kind === "turnStatus").map((entry) => entry.id);
    await setModel(store);
    await vi.waitFor(() => expect(uiOf(store).attempts.get("model")).toBeDefined());
    // The answer carries the record; give the stream's own `run.finished` time to land too.
    await new Promise((resolve) => setTimeout(resolve, 30));
    const after = store.get();
    expect(finished).not.toHaveBeenCalled();
    expect(after.runStatus).toBe("idle");
    expect(after.turnElapsedMs).toBe(before.turnElapsedMs);
    expect(statuses(after.entries)).toEqual(statuses(before.entries));
});

it("sends a click as one typed request and shows its record on the component", async () => {
    const { daemon, store } = await chatOpen([offered]);
    const respond = daemon.pause("sendUiAction:respond");
    const sent = setModel(store);
    // The control shows the click the moment it is made.
    expect(store.get().uiPending.get(modelKey)).toEqual({
        type: "default_model.set",
        payload: choice,
    });
    await vi.waitFor(() => expect(daemon.callCount("sendUiAction")).toBe(1));
    const [request] = requestsOf(daemon);
    expect(request).toMatchObject({
        messageId: "m1",
        uiId: "ui1",
        componentId: "model",
        action: { type: "default_model.set", payload: choice },
    });
    expect(request!.id).toMatch(/^[a-z][a-z0-9]+$/u);
    // A second click on the same control waits for the first.
    await expect(setModel(store)).rejects.toThrow("still on its way");
    respond();
    await expect(sent).resolves.toBeUndefined();
    expect(store.get().uiPending.has(modelKey)).toBe(false);
    await vi.waitFor(() =>
        expect(uiOf(store).attempts.get("model")).toEqual({
            action: { type: "default_model.set", payload: choice },
            outcome: { status: "accepted" },
        }),
    );
    // The record is never a row of its own.
    expect(store.get().entries.filter((entry) => entry.kind === "message")).toHaveLength(1);
    expect(store.get().entries.some((entry) => entry.kind === "notice")).toBe(false);
});

it("shows a record's refusal from the transcript, and a refusal that stored nothing as an error", async () => {
    const { daemon, store } = await chatOpen([offered]);
    daemon.uiActionAnswerSet({
        outcome: { status: "rejected", code: "unknown_model", reason: "No such model." },
    });
    await setModel(store);
    await vi.waitFor(() =>
        expect(uiOf(store).attempts.get("model")?.outcome).toEqual({
            status: "rejected",
            code: "unknown_model",
            reason: "No such model.",
        }),
    );
    expect(store.get().uiErrors.has(modelKey)).toBe(false);

    daemon.failOnce(
        "sendUiAction",
        new HappyAgentApiError(403, "You can't change that.", "forbidden", null),
    );
    await expect(setModel(store)).rejects.toThrow("You can't change that.");
    expect(store.get().uiErrors.get(modelKey)).toBe("You can't change that.");
    expect(store.get().uiPending.has(modelKey)).toBe(false);
    // A refusal is not retried.
    expect(daemon.callCount("sendUiAction")).toBe(2);
    // The next click clears it, and is a new attempt.
    await setModel(store);
    expect(store.get().uiErrors.has(modelKey)).toBe(false);
    const ids = requestsOf(daemon).map((request) => request.id);
    expect(new Set(ids).size).toBe(3);
});

it("retries a click that may have landed under one ID, and reuses it when clicked again", async () => {
    const { daemon, store } = await chatOpen([offered]);
    for (let attempt = 0; attempt < 3; attempt += 1)
        daemon.failOnce("sendUiAction", new Error("The network is down."));
    await expect(setModel(store)).rejects.toThrow();
    // Three automatic attempts, one ID.
    expect(daemon.callCount("sendUiAction")).toBe(3);
    const first = requestsOf(daemon).map((request) => request.id);
    expect(new Set(first).size).toBe(1);
    expect(store.get().uiErrors.has(modelKey)).toBe(true);

    // The same click again goes out under the same ID, so a first attempt
    // that did land is replayed rather than made twice.
    await setModel(store);
    expect(requestsOf(daemon).at(-1)!.id).toBe(first[0]);

    // Once its outcome is known, the next click is a new attempt.
    await setModel(store);
    expect(requestsOf(daemon).at(-1)!.id).not.toBe(first[0]);
});

it("sends a different click under a new ID even while the last one's outcome is unknown", async () => {
    const { daemon, store } = await chatOpen([offered]);
    for (let attempt = 0; attempt < 3; attempt += 1)
        daemon.failOnce("sendUiAction", new HappyAgentApiError(503, "Busy.", "unavailable", null));
    await expect(setModel(store)).rejects.toThrow();
    await store.uiAction(offer, "model", defaultModelComponent, "set", {
        ...choice,
        effort: "low",
    });
    const ids = requestsOf(daemon).map((request) => request.id);
    expect(ids.at(-1)).not.toBe(ids[0]);
});

it("keeps a secret out of what is held for a click on its way", async () => {
    const secretComponent = defineUiComponent({
        type: "test_secret",
        description: "A test component whose action carries a secret.",
        props: Type.Object({}),
        actions: {
            submit: {
                payload: Type.Object({ token: UiSecret(Type.String()), label: Type.String() }),
                result: Type.Object({ connected: Type.Boolean() }),
            },
        },
    });
    const { daemon, store } = await chatOpen([offered]);
    daemon.uiActionAnswerSet({ result: { connected: true } });
    const respond = daemon.pause("sendUiAction:respond");
    const sent = store.uiAction(offer, "tree", secretComponent, "submit", {
        token: "sk-secret",
        label: "Work",
    });
    await vi.waitFor(() => expect(daemon.callCount("sendUiAction")).toBe(1));
    // The request carries the secret; nothing kept does.
    expect(requestsOf(daemon)[0]!.action.payload).toEqual({ token: "sk-secret", label: "Work" });
    expect(JSON.stringify([...store.get().uiPending])).not.toContain("sk-secret");
    expect(store.get().uiPending.get(chatUiComponentKey(offer, "tree"))?.type).toBe(
        "test_secret.submit",
    );
    respond();
    // The typed result reaches the caller alone.
    await expect(sent).resolves.toEqual({ connected: true });
    expect(JSON.stringify(store.get())).not.toContain("sk-secret");
});

it("draws a control disabled for a viewer the server did not grant its permission", async () => {
    let tell: ((granted: ReadonlySet<never> | undefined) => void) | undefined;
    const { store } = await chatOpen([offered], {
        uiGrantedFollow: (listener) => {
            tell = listener as never;
            listener(undefined);
            return () => undefined;
        },
    });
    const allowed = () =>
        chatUiActionAllowed(defaultModelComponent, "set", {}, store.get().uiGranted);
    // Nothing is drawn as allowed until the server has answered.
    expect(allowed()).toBe(false);
    tell!(new Set(["content.write"]) as never);
    expect(allowed()).toBe(false);
    tell!(new Set(["content.write", "config.manage"]) as never);
    expect(allowed()).toBe(true);
    expect(chatUiActionAllowed(defaultModelComponent, "set", {}, "all")).toBe(true);
});

it("puts suggested replies on a row of their own, live until answered", async () => {
    const { store } = await chatOpen([suggested]);
    const [row] = repliesOf(store);
    expect(row?.replies).toEqual({
        messageId: "m2",
        toolCallId: "call7",
        options: ["Merge it", "Not now"],
        live: true,
    });
    // The call that suggested them is not a step of the work.
    expect(store.get().entries.some((entry) => entry.kind === "agentActivity")).toBe(false);
    // The row follows the words of its turn.
    const kinds = store.get().entries.map((entry) => entry.kind);
    expect(kinds.indexOf("quickReplies")).toBeGreaterThan(kinds.indexOf("message"));
});

it("sends a tapped reply as a message naming its option, and takes no second tap", async () => {
    const { daemon, store } = await chatOpen([suggested]);
    const replies = repliesOf(store)[0]!.replies;
    const key = quickRepliesKey(replies);
    const sent = store.quickReplySend(replies, 1);
    // Taken from the tap itself, before anything is projected again.
    expect(store.get().quickRepliesSent.has(key)).toBe(true);
    await expect(store.quickReplySend(replies, 0)).rejects.toThrow("already on its way");
    await sent;
    await vi.waitFor(() => expect(daemon.callCount("sendMessage")).toBe(1));
    const request = daemon.calls.find((call) => call.method === "sendMessage")!.args[1];
    expect(request).toMatchObject({
        text: "Not now",
        quickReply: { messageId: "m2", toolCallId: "call7", index: 1 },
    });
    // The transcript says which option was sent, and the suggestion is over.
    await vi.waitFor(() =>
        expect(repliesOf(store)[0]?.replies).toMatchObject({ chosen: 1, live: false }),
    );
    const person = store
        .get()
        .entries.find((entry) => entry.kind === "message" && entry.message.text === "Not now");
    expect(person?.kind === "message" && person.quickReply).toEqual({
        messageId: "m2",
        toolCallId: "call7",
        index: 1,
    });
});

it("takes a tap again when the reply's send is refused", async () => {
    const { daemon, store, reject } = await chatOpen([suggested]);
    const replies = repliesOf(store)[0]!.replies;
    const key = quickRepliesKey(replies);
    await store.quickReplySend(replies, 0);
    await vi.waitFor(() => expect(daemon.callCount("sendMessage")).toBe(1));
    const sent = daemon.calls.find((call) => call.method === "sendMessage")!.args[1] as {
        id: string;
    };
    reject(sent.id);
    expect(store.get().quickRepliesSent.has(key)).toBe(false);
    await expect(store.quickReplySend(replies, 5)).rejects.toThrow("That suggestion is gone.");
});
