import type { SendMessageRequest } from "@slopus/happy-agent-client";
import { afterEach, expect, it, vi } from "vitest";
import { connectHappyAgent } from "../happyAgentConnection/connectHappyAgent.js";
import type { HappyAgentConnection } from "../happyAgentConnection/types.js";
import {
    fakeHappyAgentDaemonCreate,
    fakeRun,
    fakeUserMessage,
} from "../testing/fakeHappyAgentDaemon.js";
import { happyAgentChatStoreCreate, type HappyAgentChatStore } from "./happyAgentChatStore.js";
import { happyAgentModelCatalogProject } from "./happyAgentProject.js";
import type { HappyAgentSessionId, HappyCloudFileBlock } from "./happyAgentTypes.js";

/* A file uploaded to a Happy Cloud conversation travels in its message as a
 * block naming the upload; the words stay as they were written. */

const openConnections: HappyAgentConnection[] = [];
const disposers: (() => void)[] = [];

afterEach(() => {
    for (const dispose of disposers.splice(0)) dispose();
    for (const connection of openConnections.splice(0)) connection.close();
});

async function chatOpen(
    seed: (daemon: ReturnType<typeof fakeHappyAgentDaemonCreate>) => void = () => undefined,
) {
    const daemon = fakeHappyAgentDaemonCreate();
    const project = daemon.projectSeed({ id: "project-a" });
    daemon.agentSeed(project.id, { id: "agent-a" });
    seed(daemon);
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

const FILE: HappyCloudFileBlock = { type: "file", attachment: "digest-notes", name: "notes.txt" };

function sent(daemon: ReturnType<typeof fakeHappyAgentDaemonCreate>): SendMessageRequest {
    const call = daemon.calls.find((entry) => entry.method === "sendMessage");
    return call!.args[1] as SendMessageRequest;
}

it("names an uploaded file in the message it is sent with, keeping the words as written", async () => {
    const { daemon, store } = await chatOpen();
    await store.messageSend("Read this", [], undefined, [FILE]);
    await vi.waitFor(() => expect(daemon.callCount("sendMessage")).toBe(1));

    expect(sent(daemon)).toMatchObject({
        text: "Read this",
        content: [{ type: "file", attachment: "digest-notes", name: "notes.txt" }],
    });
    // One row for the message, before and after the server holds it.
    await vi.waitFor(() =>
        expect(
            store
                .get()
                .entries.filter(
                    (entry) => entry.kind === "message" && entry.message.text === "Read this",
                ),
        ).toHaveLength(1),
    );
});

it("gives a file-only message the file's name as its text", async () => {
    const { daemon, store } = await chatOpen();
    await store.messageSend("", [], undefined, [FILE]);
    await vi.waitFor(() => expect(daemon.callCount("sendMessage")).toBe(1));

    expect(sent(daemon)).toMatchObject({ text: "[file:notes.txt]", content: [FILE] });
});

function fileCards(store: HappyAgentChatStore) {
    return store
        .get()
        .entries.flatMap((entry) =>
            entry.kind === "message"
                ? entry.message.attachments.filter((attachment) => attachment.kind === "linked")
                : [],
        );
}

it("shows a sent file as its card, from the moment it is sent", async () => {
    const { store } = await chatOpen();
    await store.messageSend("Read this", [], undefined, [FILE]);
    await vi.waitFor(() =>
        expect(fileCards(store)).toEqual([
            expect.objectContaining({
                kind: "linked",
                attachmentKind: "file",
                name: "notes.txt",
                source: "digest-notes",
            }),
        ]),
    );
});

it("shows a file from history as its card with the size the server recorded, and no stand-in text", async () => {
    const { store } = await chatOpen((daemon) =>
        daemon.historySet("agent-a", [
            fakeRun({
                id: "run-1",
                messages: [
                    fakeUserMessage({
                        id: "message-1",
                        status: "accepted",
                        content: [
                            { type: "text", text: "[file:report.pdf]" },
                            {
                                type: "file",
                                attachment: "digest-report",
                                name: "report.pdf",
                                mimeType: "application/pdf",
                                size: 2048,
                            },
                        ] as never,
                    }),
                ],
            }),
        ]),
    );
    await vi.waitFor(() => expect(fileCards(store)).toHaveLength(1));
    expect(fileCards(store)[0]).toMatchObject({
        attachmentKind: "file",
        name: "report.pdf",
        source: "digest-report",
        mediaType: "application/pdf",
        bytes: 2048,
    });
    const row = store.get().entries.find((entry) => entry.kind === "message");
    expect(row?.kind === "message" ? row.message.text : undefined).toBe("");
});
