import { afterEach, expect, it, vi } from "vitest";
import type { Message } from "@slopus/happy-agent-client";
import { connectHappyAgent } from "./connectHappyAgent.js";
import type { ChatElement, HappyAgentConnection, SessionState } from "./types.js";
import {
    fakeAgentMessage,
    fakeHappyAgentDaemonCreate,
    fakeRun,
} from "../testing/fakeHappyAgentDaemon.js";
import agentTextReasoning from "../../fixtures/protocol-messages/valid/agent-text-reasoning.json" with { type: "json" };
import userText from "../../fixtures/protocol-messages/valid/user-text.json" with { type: "json" };
import clusterCancelledQuestion from "../../fixtures/protocol-messages/invalid/cluster-cancelled-question.json" with { type: "json" };
import unknownPresentation from "../../fixtures/protocol-messages/valid/agent-presentation-unknown-type.json" with { type: "json" };
import userMissingMode from "../../fixtures/protocol-messages/invalid/user-missing-mode.json" with { type: "json" };
import contentNull from "../../fixtures/protocol-messages/invalid/content-null.json" with { type: "json" };

/*
 * Every message that reaches a session is checked against the protocol once,
 * as it arrives. One that does not match takes a placeholder in its place —
 * its ID, time and what was wrong, never its payload — and the messages
 * around it load and draw as they always do.
 */

const open: HappyAgentConnection[] = [];
afterEach(() => {
    for (const connection of open.splice(0)) connection.close();
    vi.restoreAllMocks();
});

const CARD_ID = "msgclustercancelled000001";
const CARD_ERRORS = ["/content/1/presentation/answers: Expected object"];

/** A fresh copy of one shared fixture's message, as the server would send it. */
function fixture(file: { readonly message: unknown }): Message {
    return structuredClone(file.message) as Message;
}

async function sessionOpen(
    runs: Parameters<ReturnType<typeof fakeHappyAgentDaemonCreate>["historySet"]>[1],
) {
    const daemon = fakeHappyAgentDaemonCreate();
    const project = daemon.projectSeed({ id: "project-a" });
    const agent = daemon.agentSeed(project.id, { id: "agent-a" });
    daemon.historySet(agent.id, runs);
    const connection = connectHappyAgent({
        endpoint: "http://happy-agent.test/",
        token: "token",
        client: daemon.client,
        wait: () => new Promise((resolve) => setTimeout(resolve, 0)),
        now: () => 1_000,
    });
    open.push(connection);
    const watched: { elements: readonly ChatElement[]; session?: SessionState } = {
        elements: [],
    };
    const reader = connection.connectSession({
        sessionId: agent.id,
        onChange(elements, session) {
            watched.elements = elements;
            watched.session = session;
        },
    });
    reader.followingSet?.(true);
    await vi.waitFor(() => expect(watched.session?.historyLoading).not.toBe(true));
    await vi.waitFor(() => expect(watched.elements.length).toBeGreaterThan(0));
    return { daemon, connection, agentId: agent.id, watched };
}

/** What each row is, by kind and the message it stands for. */
function rows(elements: readonly ChatElement[]): string[] {
    return elements.flatMap((element) => {
        switch (element.kind) {
            case "user_message":
            case "agent_text":
            case "invalid_message":
                return [`${element.kind}:${element.messageId}`];
            default:
                return [];
        }
    });
}

it("draws a placeholder for an unreadable message in history, and every message around it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const user = { ...fixture(userText), runId: "run-1" } as Message;
    const card = fixture(clusterCancelledQuestion);
    const reply = fixture(agentTextReasoning);
    const { watched } = await sessionOpen([
        fakeRun({ id: "run-1", status: "completed", endedAt: 2, messages: [user, card, reply] }),
    ]);

    expect(rows(watched.elements)).toEqual([
        `user_message:${user.id}`,
        `invalid_message:${CARD_ID}`,
        `agent_text:${reply.id}`,
    ]);
    const placeholder = watched.elements.find((element) => element.kind === "invalid_message");
    expect(placeholder).toEqual({
        id: `invalid:${CARD_ID}`,
        kind: "invalid_message",
        groupId: "run-1",
        runId: "run-1",
        createdAt: 1_764_100_000_000,
        messageId: CARD_ID,
        errors: CARD_ERRORS,
    });
    // Nothing of the card itself reaches the transcript.
    expect(JSON.stringify(watched.elements)).not.toContain("canceled");
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]![1]).toEqual({
        agentId: "agent-a",
        messageId: CARD_ID,
        errors: CARD_ERRORS,
    });
    // The log names the message and what failed, and carries none of it.
    expect(warn.mock.calls[0]).toHaveLength(2);
    expect(JSON.stringify(warn.mock.calls)).not.toContain("Who should review this change?");
});

it("puts a live message the protocol does not describe in its place, and the next valid snapshot over it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const user = { ...fixture(userText), runId: "run-1" } as Message;
    const { daemon, agentId, watched } = await sessionOpen([
        fakeRun({ id: "run-1", status: "running", messages: [user] }),
    ]);

    const card = fixture(clusterCancelledQuestion);
    daemon.eventEmit("message.created", { agentId, runId: "run-1", message: card });
    await vi.waitFor(() =>
        expect(rows(watched.elements)).toEqual([
            `user_message:${user.id}`,
            `invalid_message:${CARD_ID}`,
        ]),
    );

    // Text streamed into a placeholder is dropped, not read again for.
    const reads = daemon.callCount("getMessages");
    daemon.eventEmit("message.delta", {
        agentId,
        runId: "run-1",
        messageId: CARD_ID,
        blockIndex: 0,
        offset: 0,
        append: "more",
    });
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(daemon.callCount("getMessages")).toBe(reads);

    // The same message sent again whole and valid replaces the placeholder.
    daemon.eventEmit("message.updated", {
        agentId,
        runId: "run-1",
        message: fakeAgentMessage({
            id: CARD_ID,
            createdAt: 1_764_100_000_000,
            content: [{ type: "text", text: "Who should review this?" }],
        }),
    });
    await vi.waitFor(() =>
        expect(rows(watched.elements)).toEqual([
            `user_message:${user.id}`,
            `agent_text:${CARD_ID}`,
        ]),
    );

    // A message the server deletes takes its placeholder with it.
    daemon.eventEmit("message.updated", {
        agentId,
        runId: "run-1",
        message: fixture(contentNull),
    });
    await vi.waitFor(() =>
        expect(rows(watched.elements)).toContain("invalid_message:msgcontentnull0000000001"),
    );
    daemon.eventEmit("message.deleted", {
        agentId,
        runId: "run-1",
        messageId: "msgcontentnull0000000001",
    });
    await vi.waitFor(() =>
        expect(rows(watched.elements)).toEqual([
            `user_message:${user.id}`,
            `agent_text:${CARD_ID}`,
        ]),
    );
    expect(warn).toHaveBeenCalledTimes(2);
});

it("shows a tool call whose presentation this build does not know as a plain call, its type noted once at debug level", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    const call = fixture(unknownPresentation);
    const { daemon, agentId, watched } = await sessionOpen([
        fakeRun({ id: "run-1", status: "running", messages: [call] }),
    ]);
    const tool = () =>
        watched.elements.find(
            (element) =>
                element.kind === "tool_call" && element.toolCallId === "toolunknownpresent000001",
        );
    expect(tool()).toBeDefined();
    expect(tool()).not.toHaveProperty("presentation");
    expect(rows(watched.elements)).not.toContain(`invalid_message:${call.id}`);

    // The same call arriving again, and another call with the same type, are not logged again.
    daemon.eventEmit("message.updated", {
        agentId,
        runId: "run-1",
        message: fixture(unknownPresentation),
    });
    const another = fixture(unknownPresentation);
    daemon.eventEmit("message.updated", {
        agentId,
        runId: "run-1",
        message: {
            ...another,
            id: `${another.id}2`,
            content: another.content.map((block) =>
                block.type === "tool_call" ? { ...block, id: `${block.id}2` } : block,
            ),
        } as Message,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(tool()).toBeDefined();
    expect(warn).not.toHaveBeenCalled();
    expect(debug).toHaveBeenCalledOnce();
    expect(debug.mock.calls[0]![1]).toEqual({
        agentId: "agent-a",
        messageId: call.id,
        toolCallId: "toolunknownpresent000001",
        type: "hologram",
    });
});

it("moves a pending placeholder into the run that accepts it, and keeps it there past a late reply", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { daemon, connection, agentId, watched } = await sessionOpen([
        fakeRun({
            id: "run-0",
            status: "completed",
            endedAt: 2,
            messages: [
                fakeAgentMessage({ id: "reply-0", content: [{ type: "text", text: "Hi." }] }),
            ],
        }),
    ]);
    // The server's answer to this send, and its events, carry a user message with no mode.
    let reply: (() => void) | undefined;
    let sentId: string | undefined;
    const unreadable = (id: string) => ({ ...fixture(userMissingMode), id }) as Message;
    (daemon.client as unknown as { sendMessage: unknown }).sendMessage = (
        _agentId: string,
        request: { id: string },
    ) =>
        new Promise((resolve) => {
            sentId = request.id;
            reply = () =>
                resolve({ cursor: "cursor-999999999999", message: unreadable(request.id) });
        });
    connection.sendMessage(agentId, "hello");
    await vi.waitFor(() => expect(sentId).toBeDefined());
    const id = sentId!;
    const placeholder = () =>
        watched.elements.find(
            (element) => element.kind === "invalid_message" && element.messageId === id,
        );

    daemon.eventEmit("message.created", { agentId, runId: null, message: unreadable(id) });
    await vi.waitFor(() => expect(placeholder()?.groupId).toBe(`pending:${id}`));

    daemon.eventEmit("run.started", {
        agentId,
        run: fakeRun({ id: "run-1", status: "running", startedAt: 3 }),
        acceptedMessageIds: [id],
    });
    await vi.waitFor(() => expect(placeholder()?.groupId).toBe("run-1"));

    // The send's reply, and a replayed creation, both name no run.
    reply!();
    daemon.eventEmit("message.created", { agentId, runId: null, message: unreadable(id) });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(placeholder()?.groupId).toBe("run-1");
    expect(watched.elements.filter((element) => element.kind === "invalid_message")).toHaveLength(
        1,
    );
});
