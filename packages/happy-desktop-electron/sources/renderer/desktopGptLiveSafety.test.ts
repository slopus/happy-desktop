// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
    fakeHappyAgentDaemonCreate,
    fakeAgentMessage,
    fakeRun,
    fakeUserMessage,
} from "happy-desktop-state/testing";
import {
    HappyAgentApiError,
    type HappyAgentSessionId,
    type HappyAgentProjectId,
} from "happy-desktop-state";
import { happyAgentConnectionOpen, type HappyAgentConnectionHandle } from "./happyAgentConnection";
import { gptLiveDesktopContextRead } from "../../../happy-desktop-state/src/gptLive/gptLiveDesktopContext";
import { gptLiveControllerCreate } from "../../../happy-desktop-state/src/gptLive/gptLiveController";
import { gptLiveRuntimeFixtureCreate } from "../../../happy-desktop-state/src/gptLive/testing/gptLiveRuntimeFixture";
import serializedContextFixture from "./fixtures/gptLiveDesktopContext.json";

vi.mock("happy-desktop-app", () => ({ terminalDriverCreate: () => undefined }));
const handles: HappyAgentConnectionHandle[] = [];
const subscriptions: (() => void)[] = [];
afterEach(() => {
    for (const unsubscribe of subscriptions.splice(0)) unsubscribe();
    for (const handle of handles.splice(0)) handle.dispose();
});

async function fixture(withHistory = false) {
    const daemon = fakeHappyAgentDaemonCreate();
    const project = daemon.projectSeed({ id: "project-voice", name: "Voice test project" });
    const agent = daemon.agentSeed(project.id, { id: "agent-voice", title: "Voice safety" });
    const other = daemon.agentSeed(project.id, { id: "agent-other", title: "Other task" });
    if (withHistory)
        daemon.historySet(agent.id, [
            fakeRun({
                id: "run-public",
                messages: [
                    fakeUserMessage({
                        id: "message-human",
                        status: "accepted",
                        content: [{ type: "text", text: "Please inspect the build result." }],
                    }),
                    fakeAgentMessage({
                        id: "message-agent",
                        content: [
                            { type: "reasoning", text: "PRIVATE_REASONING_EXCLUDED" },
                            { type: "text", text: "The build completed successfully." },
                            {
                                type: "tool_call",
                                id: "tool-private",
                                name: "exec_command",
                                status: "completed",
                                arguments: { cmd: "PRIVATE_TOOL_ARGUMENT_EXCLUDED" },
                                result: { output: "PRIVATE_TOOL_OUTPUT_EXCLUDED" },
                            },
                        ],
                    }),
                ],
            }),
        ]);
    const handle = happyAgentConnectionOpen({
        client: daemon.client,
        cloudHost: {
            cloudAuthCallbackSubscribe: () => () => {},
            cloudAuthCallbackTake: async () => undefined,
            cloudAuthConfigurationGet: () => new Promise(() => {}),
            cloudAuthOpen: async () => {},
        },
        deps: {
            changed: () => {},
            conversationOpen: (location) =>
                handle.get()?.workspace.conversationOpen(location.sessionId, location.groupId),
            groupForget: () => {},
            subtasksForget: () => {},
            groupOpen: () => {},
        },
        happyAgentHttpUrl: "http://happy-agent.test",
        happyAgentId: "voice-test",
        memberProfileRequired: true,
        host: { applicationMenuOpen: () => {}, directoryPick: async () => undefined },
        modelPreferencePersistence: { read: () => undefined, write: () => {} },
        terminalColorScheme: () => "light",
    });
    handles.push(handle);
    await vi.waitFor(() => expect(handle.get()).toBeDefined());
    const workspace = handle.get()!.workspace;
    subscriptions.push(workspace.subscribe(() => {}));
    const id = agent.id as HappyAgentSessionId;
    const group = project.id as HappyAgentProjectId;
    workspace.conversationOpen(id, group);
    await vi.waitFor(() => {
        const conversation = workspace.get().conversation;
        expect(conversation.type === "ready" && conversation.value.ready).toBe(true);
    });
    const voice = await workspace.voiceSessionAcquire(id);
    const question = (targetId = agent.id) => {
        const question = {
            id: "question-voice",
            agentId: targetId,
            runId: "run-voice",
            status: "pending" as const,
            questions: [
                {
                    id: "prompt-voice",
                    header: "Permission",
                    question: "Approve the operation?",
                    multiSelect: false,
                    options: [
                        { label: "Approve", description: "Allow it" },
                        { label: "Deny", description: "Do not allow it" },
                    ],
                },
            ],
            autoResolveAt: null,
            answers: null,
            version: daemon.versionNext(),
            createdAt: 1,
            answeredAt: null,
        };
        daemon.questionSet(targetId, question);
        daemon.eventEmit("question.created", { question });
    };
    return {
        daemon,
        workspace,
        voice,
        id,
        group,
        otherId: other.id as HappyAgentSessionId,
        question,
    };
}

it("serializes the real Desktop public-context projection without reasoning or tool data", async () => {
    const f = await fixture(true);
    try {
        await vi.waitFor(() => expect(f.voice.get().entries.length).toBeGreaterThan(1));
        const context = gptLiveDesktopContextRead("window-fixture", {
            get: () => ({
                activeConnectionId: "local",
                connections: [
                    { id: "local", name: "Test desktop", online: true, workspace: f.workspace },
                ],
            }),
            subscribe: () => () => {},
            targetOpen: () => {},
        });
        const serialized = JSON.stringify(context, null, 2);
        expect(serialized).not.toContain("PRIVATE_");
        expect(serialized).not.toContain("/tmp/");
        expect(serialized).toContain("Please inspect the build result.");
        expect(serialized).toContain("The build completed successfully.");
        expect(JSON.parse(serialized)).toEqual(serializedContextFixture);
    } finally {
        f.voice[Symbol.dispose]();
    }
});

it("stages in the existing composer, rejects stale/replayed/second drafts and sends human edits only on composer submission", async () => {
    const f = await fixture();
    const frames: Parameters<Parameters<typeof gptLiveControllerCreate>[0]["send"]>[0][] = [];
    const controller = gptLiveControllerCreate({
        windowId: "window-test",
        source: {
            get: () => ({
                activeConnectionId: "local",
                connections: [
                    { id: "local", name: "Test desktop", online: true, workspace: f.workspace },
                ],
            }),
            subscribe: () => () => {},
            targetOpen: () => {},
        },
        send: (frame) => frames.push(frame),
        receive: () => {},
    });
    controller.start();
    const target = { connectionId: "local", groupId: f.group, sessionId: f.id };
    const request = {
        type: "actionRequested" as const,
        actionId: "stage-exact",
        contextRevision: controller.contextRead().revision,
        inputTranscriptIds: [],
        action: { type: "sessionSend" as const, target, text: "Review this exact change" },
    };
    try {
        controller.actionReceive(request);
        await vi.waitFor(() =>
            expect(frames).toContainEqual({
                type: "actionResult",
                actionId: "stage-exact",
                result: { status: "succeeded", output: { type: "staged" } },
            }),
        );
        expect(f.daemon.callCount("sendMessage")).toBe(0);
        expect(f.daemon.callCount("saveAgentDraft")).toBe(0);
        const resultIndex = frames.findIndex(
            (frame) => frame.type === "actionResult" && frame.actionId === "stage-exact",
        );
        expect(frames.slice(0, resultIndex)).toContainEqual(
            expect.objectContaining({
                type: "desktopContext",
                revision: controller.contextRead().revision,
            }),
        );
        controller.actionReceive(request);
        expect(f.voice.draftRead()?.text).toBe("Review this exact change");
        controller.actionReceive({
            ...request,
            actionId: "stale",
            action: { type: "composerDraftAppend", target, text: "Must not append" },
        });
        await vi.waitFor(() =>
            expect(frames).toContainEqual(
                expect.objectContaining({
                    type: "actionResult",
                    actionId: "stale",
                    result: expect.objectContaining({ code: "staleContext" }),
                }),
            ),
        );
        controller.actionReceive({
            ...request,
            actionId: "second",
            contextRevision: controller.contextRead().revision,
        });
        await vi.waitFor(() =>
            expect(frames).toContainEqual(
                expect.objectContaining({
                    type: "actionResult",
                    actionId: "second",
                    result: expect.objectContaining({ code: "draftConflict" }),
                }),
            ),
        );
        f.workspace.composerTextUpdate("My edited message");
        expect(f.voice.draftRead()?.voiceDraft).toBe(true);
        expect(f.daemon.callCount("sendMessage")).toBe(0);
        controller.close();
        expect(f.voice.draftRead()?.text).toBe("My edited message");
        f.workspace.composerTextSubmit();
        await vi.waitFor(() => expect(f.voice.draftRead()?.text).toBe(""));
        const sent = f.daemon.calls.find((call) => call.method === "sendMessage");
        expect(sent?.args[1]).toMatchObject({ text: "My edited message" });
        expect(f.daemon.callCount("sendMessage")).toBe(1);
    } finally {
        controller.close();
        f.voice[Symbol.dispose]();
    }
});

it("refuses sessionSend and composerDraftAppend over an existing human draft without modifying it", async () => {
    const f = await fixture();
    f.workspace.composerTextUpdate("Private existing human draft");
    const frames: Parameters<Parameters<typeof gptLiveControllerCreate>[0]["send"]>[0][] = [];
    const receive = vi.fn();
    const controller = gptLiveControllerCreate({
        windowId: "window-test",
        source: {
            get: () => ({
                activeConnectionId: "local",
                connections: [
                    { id: "local", name: "Test desktop", online: true, workspace: f.workspace },
                ],
            }),
            subscribe: () => () => {},
            targetOpen: () => {},
        },
        send: (frame) => frames.push(frame),
        receive,
    });
    try {
        controller.start();
        controller.actionReceive({
            type: "actionRequested",
            actionId: "conflicting-send",
            contextRevision: controller.contextRead().revision,
            inputTranscriptIds: [],
            action: {
                type: "sessionSend",
                target: { connectionId: "local", groupId: f.group, sessionId: f.id },
                text: "Only this requested text",
            },
        });
        await vi.waitFor(() =>
            expect(frames).toContainEqual(
                expect.objectContaining({
                    type: "actionResult",
                    actionId: "conflicting-send",
                    result: expect.objectContaining({ status: "refused", code: "draftConflict" }),
                }),
            ),
        );
        expect(f.voice.draftRead()?.text).toBe("Private existing human draft");
        controller.actionReceive({
            type: "actionRequested",
            actionId: "conflicting-append",
            contextRevision: controller.contextRead().revision,
            inputTranscriptIds: [],
            action: {
                type: "composerDraftAppend",
                target: { connectionId: "local", groupId: f.group, sessionId: f.id },
                text: "Must not taint this draft",
            },
        });
        await vi.waitFor(() =>
            expect(frames).toContainEqual(
                expect.objectContaining({
                    type: "actionResult",
                    actionId: "conflicting-append",
                    result: expect.objectContaining({ code: "draftConflict" }),
                }),
            ),
        );
        expect(f.voice.draftRead()?.text).toBe("Private existing human draft");
        expect(f.voice.draftRead()?.voiceDraft).toBeUndefined();
        expect(receive).not.toHaveBeenCalled();
        expect(JSON.stringify(frames)).not.toContain("Private existing human draft");
        expect(f.daemon.callCount("sendMessage")).toBe(0);
    } finally {
        controller.close();
        f.voice[Symbol.dispose]();
    }
});

it("keeps accepted context immutable while real runtime streams focused public text and status without a watch", async () => {
    const f = await fixture();
    const live = gptLiveRuntimeFixtureCreate({
        daemon: f.daemon,
        source: {
            get: () => ({
                activeConnectionId: "local",
                connections: [
                    { id: "local", name: "Test desktop", online: true, workspace: f.workspace },
                ],
            }),
            subscribe: () => () => {},
            targetOpen: () => {},
        },
    });
    let call: Awaited<ReturnType<typeof live.open>> | undefined;
    try {
        const opening = live.open();
        await vi.waitFor(() => expect(live.stats.socketOpens).toBe(1));
        live.hello();
        live.mediaReady();
        live.active();
        call = await opening;
        await vi.waitFor(() =>
            expect(live.sent.some((frame) => frame.type === "desktopContext")).toBe(true),
        );
        const initial = live.createRequests()[0]!;
        f.daemon.eventEmit("run.started", {
            agentId: f.id,
            run: fakeRun({ id: "live-public-run", status: "running" }),
            acceptedMessageIds: [],
        });
        f.daemon.eventEmit("message.created", {
            agentId: f.id,
            runId: "live-public-run",
            message: fakeAgentMessage({
                id: "live-public-message",
                content: [{ type: "text", text: "Public streaming" }],
            }),
        });
        await vi.waitFor(() =>
            expect(live.sent).toContainEqual(
                expect.objectContaining({
                    type: "sessionUpdate",
                    status: "running",
                    messages: expect.arrayContaining([
                        expect.objectContaining({ text: "Public streaming" }),
                    ]),
                }),
            ),
        );
        f.daemon.eventEmit("message.delta", {
            agentId: f.id,
            runId: "live-public-run",
            messageId: "live-public-message",
            blockIndex: 0,
            offset: 16,
            append: " result",
        });
        await vi.waitFor(() =>
            expect(live.sent).toContainEqual(
                expect.objectContaining({
                    type: "sessionUpdate",
                    messages: expect.arrayContaining([
                        expect.objectContaining({ text: "Public streaming result" }),
                    ]),
                }),
            ),
        );
        const contexts = live.sent.filter((frame) => frame.type === "desktopContext");
        expect(contexts).toHaveLength(1);
        expect(contexts[0]).toEqual({
            type: "desktopContext",
            revision: initial.contextRevision,
            context: initial.context,
        });
        expect(live.events).not.toContainEqual(expect.objectContaining({ type: "callFailed" }));
        expect(live.stats.mediaCloses).toBe(0);
    } finally {
        call?.close();
        if (call) live.status("closed");
        f.voice[Symbol.dispose]();
    }
});

it.each(["edit", "empty", "submit"] as const)(
    "reviews the staged draft only through existing composer %s",
    async (change) => {
        const f = await fixture();
        const frames: Parameters<Parameters<typeof gptLiveControllerCreate>[0]["send"]>[0][] = [];
        const receive = vi.fn();
        const controller = gptLiveControllerCreate({
            windowId: "window-test",
            source: {
                get: () => ({
                    activeConnectionId: "local",
                    connections: [
                        { id: "local", name: "Test desktop", online: true, workspace: f.workspace },
                    ],
                }),
                subscribe: () => () => {},
                targetOpen: () => {},
            },
            send: (frame) => frames.push(frame),
            receive,
        });
        try {
            controller.start();
            controller.actionReceive({
                type: "actionRequested",
                actionId: "card-lifetime",
                contextRevision: controller.contextRead().revision,
                inputTranscriptIds: [],
                action: {
                    type: "sessionSend",
                    target: { connectionId: "local", groupId: f.group, sessionId: f.id },
                    text: "Exact generated text",
                },
            });
            await vi.waitFor(() => expect(f.voice.draftRead()?.text).toBe("Exact generated text"));
            expect(receive).toHaveBeenCalledWith(
                expect.objectContaining({ type: "actionStatusUpdated" }),
            );
            if (change === "submit") f.workspace.composerTextSubmit();
            else
                f.workspace.composerTextUpdate(
                    change === "empty" ? "" : "Human edited the suggestion",
                );
            if (change === "submit") {
                await vi.waitFor(() => expect(f.voice.draftRead()?.text).toBe(""));
                f.workspace.conversationOpen(f.otherId, f.group);
                f.workspace.conversationOpen(f.id, f.group);
                await vi.waitFor(() => expect(f.voice.draftRead()?.text).toBe(""));
                expect(f.daemon.callCount("sendMessage")).toBe(1);
                const remote = await f.daemon.client.getAgentBootstrap(f.id);
                expect(remote.draft.value?.text ?? "").toBe("");
            } else {
                expect(f.voice.draftRead()?.text).toBe(
                    change === "empty" ? "" : "Human edited the suggestion",
                );
                expect(f.daemon.callCount("sendMessage")).toBe(0);
            }
        } finally {
            controller.close();
            f.voice[Symbol.dispose]();
        }
    },
);

it("allows desktopState to recover after a stale mutation refuses before any side effect", async () => {
    const f = await fixture();
    const frames: Parameters<Parameters<typeof gptLiveControllerCreate>[0]["send"]>[0][] = [];
    let online = true;
    let changed = () => {};
    const controller = gptLiveControllerCreate({
        windowId: "window-test",
        source: {
            get: () => ({
                activeConnectionId: "local",
                connections: [
                    { id: "local", name: "Test desktop", online, workspace: f.workspace },
                ],
            }),
            subscribe: (listener) => {
                changed = listener;
                return () => {};
            },
            targetOpen: () => {},
        },
        send: (frame) => frames.push(frame),
        receive: () => {},
    });
    try {
        controller.start();
        const revision = controller.contextRead().revision;
        online = false;
        changed();
        controller.actionReceive({
            type: "actionRequested",
            actionId: "stale-mutation",
            contextRevision: revision,
            inputTranscriptIds: [],
            action: {
                type: "composerDraftAppend",
                target: { connectionId: "local", groupId: f.group, sessionId: f.id },
                text: "Never applied",
            },
        });
        await vi.waitFor(() =>
            expect(frames).toContainEqual(
                expect.objectContaining({
                    type: "actionResult",
                    actionId: "stale-mutation",
                    result: expect.objectContaining({ code: "staleContext" }),
                }),
            ),
        );
        expect(f.voice.draftRead()?.text).toBe("");
        expect(f.daemon.callCount("sendMessage")).toBe(0);
        controller.actionReceive({
            type: "actionRequested",
            actionId: "recover-state",
            contextRevision: revision,
            inputTranscriptIds: [],
            action: { type: "desktopState" },
        });
        await vi.waitFor(() =>
            expect(frames).toContainEqual(
                expect.objectContaining({
                    type: "actionResult",
                    actionId: "recover-state",
                    result: expect.objectContaining({
                        status: "succeeded",
                        output: expect.objectContaining({
                            type: "context",
                            context: expect.objectContaining({
                                connections: [expect.objectContaining({ online: false })],
                            }),
                        }),
                    }),
                }),
            ),
        );
    } finally {
        controller.close();
        f.voice[Symbol.dispose]();
    }
});

it.each(["open", "create"] as const)(
    "executes real runtime %s then state and exact draft actions using each accepted revision",
    async (first) => {
        const f = await fixture();
        const live = gptLiveRuntimeFixtureCreate({
            daemon: f.daemon,
            source: {
                get: () => ({
                    activeConnectionId: "local",
                    connections: [
                        { id: "local", name: "Test desktop", online: true, workspace: f.workspace },
                    ],
                }),
                subscribe: () => () => {},
                targetOpen: (target) => {
                    if (target.kind === "session" || target.kind === "bot")
                        f.workspace.conversationOpen(
                            target.sessionId as HappyAgentSessionId,
                            target.groupId as HappyAgentProjectId,
                        );
                },
            },
        });
        let call: Awaited<ReturnType<typeof live.open>> | undefined;
        try {
            const opening = live.open();
            await vi.waitFor(() => expect(live.stats.socketOpens).toBe(1));
            live.hello();
            live.mediaReady();
            live.active();
            call = await opening;
            const initial = live.createRequests()[0]!.contextRevision;
            const result = (id: string) =>
                live.sent.find((frame) => frame.type === "actionResult" && frame.actionId === id);
            const revision = () =>
                live.sent.filter((frame) => frame.type === "desktopContext").at(-1)?.revision ??
                initial;
            live.frame({
                type: "actionRequested",
                actionId: "sequence-first",
                contextRevision: initial,
                inputTranscriptIds: [],
                action:
                    first === "open"
                        ? {
                              type: "desktopOpen",
                              target: {
                                  kind: "session",
                                  connectionId: "local",
                                  groupId: f.group,
                                  sessionId: f.otherId,
                              },
                          }
                        : {
                              type: "sessionCreate",
                              group: { connectionId: "local", groupId: f.group },
                          },
            });
            await vi.waitFor(() =>
                expect(result("sequence-first")).toMatchObject({ result: { status: "succeeded" } }),
            );
            expect(revision()).toBeGreaterThan(initial);
            const updated = live.sent.findIndex(
                (frame) => frame.type === "desktopContext" && frame.revision === revision(),
            );
            expect(updated).toBeLessThan(
                live.sent.findIndex(
                    (frame) => frame.type === "actionResult" && frame.actionId === "sequence-first",
                ),
            );
            live.frame({
                type: "actionRequested",
                actionId: "sequence-state",
                contextRevision: revision(),
                inputTranscriptIds: [],
                action: { type: "desktopState" },
            });
            await vi.waitFor(() =>
                expect(result("sequence-state")).toMatchObject({ result: { status: "succeeded" } }),
            );
            const target = {
                connectionId: "local",
                groupId: f.workspace.get().address.groupId!,
                sessionId: f.workspace.get().address.conversationId!,
            };
            live.frame({
                type: "actionRequested",
                actionId: "sequence-draft",
                contextRevision: revision(),
                inputTranscriptIds: [],
                action: {
                    type: first === "open" ? "sessionSend" : "composerDraftAppend",
                    target,
                    text: "Exact next-step draft",
                },
            });
            await vi.waitFor(() =>
                expect(result("sequence-draft")).toMatchObject({
                    result: {
                        status: "succeeded",
                        output: { type: first === "open" ? "staged" : "ack" },
                    },
                }),
            );
            expect(f.workspace.get().conversation).toMatchObject({
                type: "ready",
                value: { composer: { text: "Exact next-step draft", voiceDraft: true } },
            });
            expect(f.daemon.callCount("sendMessage")).toBe(0);
            expect(live.events).not.toContainEqual(expect.objectContaining({ type: "callFailed" }));
        } finally {
            call?.close();
            if (call) live.status("closed");
            f.voice[Symbol.dispose]();
        }
    },
);

it("cancels a slow Desktop action at fifty seconds and remains able to read state", async () => {
    const f = await fixture();
    const frames: Parameters<Parameters<typeof gptLiveControllerCreate>[0]["send"]>[0][] = [];
    const creation = vi
        .spyOn(f.workspace, "voiceConversationCreate")
        .mockImplementation(() => new Promise(() => {}));
    vi.useFakeTimers();
    const controller = gptLiveControllerCreate({
        windowId: "window-test",
        source: {
            get: () => ({
                activeConnectionId: "local",
                connections: [
                    { id: "local", name: "Test desktop", online: true, workspace: f.workspace },
                ],
            }),
            subscribe: () => () => {},
            targetOpen: () => {},
        },
        send: (frame) => frames.push(frame),
        receive: () => {},
    });
    try {
        controller.start();
        const revision = controller.contextRead().revision;
        controller.actionReceive({
            type: "actionRequested",
            actionId: "slow-create",
            contextRevision: revision,
            inputTranscriptIds: [],
            action: { type: "sessionCreate", group: { connectionId: "local", groupId: f.group } },
        });
        await vi.advanceTimersByTimeAsync(49_999);
        expect(frames.some((frame) => frame.type === "actionResult")).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect(frames).toContainEqual(
            expect.objectContaining({
                type: "actionResult",
                actionId: "slow-create",
                result: expect.objectContaining({ status: "cancelled", code: "ended" }),
            }),
        );
        controller.actionReceive({
            type: "actionRequested",
            actionId: "after-timeout",
            contextRevision: controller.contextRead().revision,
            inputTranscriptIds: [],
            action: { type: "desktopState" },
        });
        await vi.advanceTimersByTimeAsync(0);
        expect(frames).toContainEqual(
            expect.objectContaining({
                type: "actionResult",
                actionId: "after-timeout",
                result: expect.objectContaining({ status: "succeeded" }),
            }),
        );
    } finally {
        controller.close();
        creation.mockRestore();
        vi.useRealTimers();
        f.voice[Symbol.dispose]();
    }
});

it("retains watch selections across disconnection, resumes public updates, and stops at call end", async () => {
    const f = await fixture(true);
    const frames: Parameters<Parameters<typeof gptLiveControllerCreate>[0]["send"]>[0][] = [];
    let online = true;
    let connectionChanged = () => {};
    const events: Parameters<Parameters<typeof gptLiveControllerCreate>[0]["receive"]>[0][] = [];
    const controller = gptLiveControllerCreate({
        windowId: "window-test",
        source: {
            get: () => ({
                activeConnectionId: "local",
                connections: [
                    { id: "local", name: "Test desktop", online, workspace: f.workspace },
                ],
            }),
            subscribe: (listener) => {
                connectionChanged = listener;
                return () => {};
            },
            targetOpen: () => {},
        },
        send: (frame) => frames.push(frame),
        receive: (event) => events.push(event),
    });
    try {
        controller.start();
        controller.actionReceive({
            type: "actionRequested",
            actionId: "watch",
            contextRevision: controller.contextRead().revision,
            inputTranscriptIds: [],
            action: {
                type: "sessionWatch",
                enabled: true,
                target: { connectionId: "local", groupId: f.group, sessionId: f.id },
            },
        });
        await vi.waitFor(() =>
            expect(frames.some((frame) => frame.type === "sessionUpdate")).toBe(true),
        );
        const ack = frames.findIndex(
            (frame) => frame.type === "actionResult" && frame.actionId === "watch",
        );
        expect(ack).toBeGreaterThanOrEqual(0);
        expect(ack).toBeLessThan(frames.findIndex((frame) => frame.type === "sessionUpdate"));
        expect(JSON.stringify(frames)).not.toContain("PRIVATE_");
        online = false;
        connectionChanged();
        const updates = frames.filter((frame) => frame.type === "sessionUpdate").length;
        f.workspace.composerTextUpdate("A local edit after disconnection");
        await new Promise((resolve) => setTimeout(resolve, 300));
        expect(frames.filter((frame) => frame.type === "sessionUpdate")).toHaveLength(updates);
        online = true;
        connectionChanged();
        await vi.waitFor(() =>
            expect(frames.filter((frame) => frame.type === "sessionUpdate").length).toBeGreaterThan(
                updates,
            ),
        );
        expect(
            frames.filter((frame) => frame.type === "actionResult" && frame.actionId === "watch"),
        ).toHaveLength(1);
        const count = frames.length;
        controller.close();
        f.workspace.composerTextUpdate("Still a normal human draft after call end");
        await new Promise((resolve) => setTimeout(resolve, 300));
        expect(frames).toHaveLength(count);
    } finally {
        controller.close();
        f.voice[Symbol.dispose]();
    }
});

it("keeps watch quota consistent and idempotently disables targets missing from disconnected or truncated context", async () => {
    const f = await fixture();
    const ids = [f.otherId];
    for (let index = 0; index < 5; index++) {
        const agent = f.daemon.agentSeed(f.group, {
            id: `watch-extra-${index}`,
            title: `Extra ${index}`,
        });
        f.daemon.eventEmit("agent.created", { agent });
        ids.push(agent.id as HappyAgentSessionId);
    }
    const frames: Parameters<Parameters<typeof gptLiveControllerCreate>[0]["send"]>[0][] = [];
    let hidden = false;
    let truncated = false;
    let changed = () => {};
    const controller = gptLiveControllerCreate({
        windowId: "window-test",
        source: {
            get: () => ({
                activeConnectionId: hidden || truncated ? null : "local",
                connections: hidden
                    ? []
                    : [
                          ...(truncated
                              ? Array.from({ length: 100 }, (_, index) => ({
                                    id: `prefix-${index}`,
                                    name: `Other ${index}`,
                                    online: true,
                                }))
                              : []),
                          {
                              id: "local",
                              name: "Test desktop",
                              online: true,
                              workspace: f.workspace,
                          },
                      ],
            }),
            subscribe: (listener) => {
                changed = listener;
                return () => {};
            },
            targetOpen: () => {},
        },
        send: (frame) => frames.push(frame),
        receive: () => {},
    });
    const request = (
        actionId: string,
        sessionId: HappyAgentSessionId,
        enabled: boolean,
        revision = controller.contextRead().revision,
    ) =>
        controller.actionReceive({
            type: "actionRequested",
            actionId,
            contextRevision: revision,
            inputTranscriptIds: [],
            action: {
                type: "sessionWatch",
                enabled,
                target: { connectionId: "local", groupId: f.group, sessionId },
            },
        });
    const ack = async (actionId: string) =>
        vi.waitFor(() =>
            expect(frames).toContainEqual({
                type: "actionResult",
                actionId,
                result: { status: "succeeded", output: { type: "ack" } },
            }),
        );
    try {
        controller.start();
        await vi.waitFor(() =>
            expect(controller.contextRead().context.sessions.length).toBeGreaterThanOrEqual(7),
        );
        for (let index = 0; index < 5; index++) {
            request(`watch-${index}`, ids[index]!, true);
            await ack(`watch-${index}`);
        }
        const oldRevision = controller.contextRead().revision;
        hidden = true;
        changed();
        expect(controller.contextRead().context.sessions).toHaveLength(0);
        request("disable-missing", ids[0]!, false, oldRevision);
        await ack("disable-missing");
        request("disable-again", ids[0]!, false, oldRevision);
        await ack("disable-again");
        hidden = false;
        changed();
        request("watch-sixth", ids[5]!, true);
        await ack("watch-sixth");
        truncated = true;
        changed();
        expect(controller.contextRead().context.truncated).toBe(true);
        expect(controller.contextRead().context.sessions).toHaveLength(0);
        const updates = frames.filter((frame) => frame.type === "sessionUpdate").length;
        await new Promise((resolve) => setTimeout(resolve, 300));
        expect(frames.filter((frame) => frame.type === "sessionUpdate")).toHaveLength(updates);
        request("disable-truncated", ids[5]!, false, oldRevision);
        await ack("disable-truncated");
    } finally {
        controller.close();
        f.voice[Symbol.dispose]();
    }
});

it("keeps edited voice drafts local across navigation and blocks a later question on normal Enter", async () => {
    const f = await fixture();
    try {
        f.workspace.composerTextUpdate("Original human draft");
        await vi.waitFor(() => expect(f.daemon.callCount("saveAgentDraft")).toBe(1));
        await expect(f.voice.draftAppend("Approve", "Original human draft")).rejects.toThrow(
            "human draft",
        );
        expect(f.voice.draftRead()?.text).toBe("Original human draft");
        f.workspace.composerTextUpdate("");
        await vi.waitFor(() => expect(f.daemon.callCount("saveAgentDraft")).toBe(2));
        await f.voice.draftAppend("Approve", "");
        f.workspace.composerTextUpdate("Approve this edited voice suggestion");
        f.workspace.conversationOpen(f.otherId, f.group);
        f.workspace.conversationOpen(f.id, f.group);
        await vi.waitFor(() =>
            expect(f.voice.draftRead()?.text).toBe("Approve this edited voice suggestion"),
        );
        expect(f.voice.draftRead()?.voiceDraft).toBe(true);
        f.question();
        await vi.waitFor(() => expect(f.voice.get().pendingUserInputs).toHaveLength(1));
        f.workspace.composerTextSubmit();
        await vi.waitFor(() => expect(f.voice.draftRead()?.submission.status).toBe("failed"));
        expect(f.daemon.callCount("answerQuestion")).toBe(0);
        expect(f.daemon.callCount("sendMessage")).toBe(0);
        expect(f.daemon.callCount("saveAgentDraft")).toBe(2);
        const remote = await f.daemon.client.getAgentBootstrap(f.id);
        expect(remote.draft.value?.text ?? "").toBe("");
        f.workspace.composerTextUpdate("");
        expect(f.voice.draftRead()?.voiceDraft).toBeUndefined();
        f.workspace.composerTextUpdate("Approve");
        f.workspace.composerTextSubmit();
        await vi.waitFor(() => expect(f.daemon.callCount("answerQuestion")).toBe(1));
        expect(f.daemon.callCount("sendMessage")).toBe(0);
    } finally {
        f.voice[Symbol.dispose]();
    }
});

it("preserves local text until daemon acceptance, sends slash text literally and never clears another saved draft", async () => {
    const f = await fixture();
    try {
        await f.voice.draftAppend("/abort", "");
        const release = f.daemon.pause("sendMessage");
        f.workspace.composerTextSubmit();
        expect(f.voice.draftRead()?.text).toBe("/abort");
        expect(f.voice.draftRead()?.submission.status).toBe("pending");
        f.workspace.composerTextSubmit();
        expect(f.daemon.callCount("invokeSlashCommand")).toBe(0);
        release();
        await vi.waitFor(() => expect(f.voice.draftRead()?.submission.status).toBe("idle"));
        expect(f.voice.draftRead()?.text).toBe("");
        expect(f.daemon.callCount("sendMessage")).toBe(1);
        expect(f.daemon.callCount("saveAgentDraft")).toBe(0);
    } finally {
        f.voice[Symbol.dispose]();
    }
});

it("retains edited voice text when the existing composer send is refused", async () => {
    const f = await fixture();
    try {
        await f.voice.draftAppend("Reviewed text", "");
        f.workspace.composerTextUpdate("Changed text");
        expect(f.daemon.callCount("sendMessage")).toBe(0);
        f.daemon.failOnce(
            "sendMessage",
            new HappyAgentApiError(400, "refused", "invalid_request", null),
        );
        f.workspace.composerTextSubmit();
        await vi.waitFor(() => expect(f.voice.draftRead()?.submission.status).toBe("failed"));
        expect(f.voice.draftRead()?.text).toBe("Changed text");
        expect(f.daemon.callCount("sendMessage")).toBe(1);
    } finally {
        f.voice[Symbol.dispose]();
    }
});

it("revalidates the context after asynchronous acquisition before appending or reading", async () => {
    const f = await fixture();
    const frames: Parameters<Parameters<typeof gptLiveControllerCreate>[0]["send"]>[0][] = [];
    const controller = gptLiveControllerCreate({
        windowId: "window-test",
        source: {
            get: () => ({
                activeConnectionId: "local",
                connections: [
                    { id: "local", name: "Test desktop", online: true, workspace: f.workspace },
                ],
            }),
            subscribe: () => () => {},
            targetOpen: () => {},
        },
        send: (frame) => frames.push(frame),
        receive: () => {},
    });
    try {
        controller.start();
        controller.actionReceive({
            type: "actionRequested",
            actionId: "append-race",
            contextRevision: controller.contextRead().revision,
            inputTranscriptIds: [],
            action: {
                type: "composerDraftAppend",
                target: { connectionId: "local", groupId: f.group, sessionId: f.id },
                text: "Stale generated text",
            },
        });
        f.workspace.composerTextUpdate("Human typed after the voice intent");
        await vi.waitFor(() =>
            expect(frames).toContainEqual(
                expect.objectContaining({
                    type: "actionResult",
                    actionId: "append-race",
                    result: expect.objectContaining({ code: "staleContext" }),
                }),
            ),
        );
        expect(f.voice.draftRead()?.text).toBe("Human typed after the voice intent");
        expect(f.voice.draftRead()?.voiceDraft).toBeUndefined();
        controller.actionReceive({
            type: "actionRequested",
            actionId: "focus-race",
            contextRevision: controller.contextRead().revision,
            inputTranscriptIds: [],
            action: {
                type: "sessionRead",
                target: { connectionId: "local", groupId: f.group, sessionId: f.id },
            },
        });
        f.workspace.conversationOpen(f.otherId, f.group);
        await vi.waitFor(() =>
            expect(frames).toContainEqual(
                expect.objectContaining({
                    type: "actionResult",
                    actionId: "focus-race",
                    result: expect.objectContaining({ code: "staleContext" }),
                }),
            ),
        );
        expect(f.daemon.callCount("sendMessage")).toBe(0);
    } finally {
        controller.close();
        f.voice[Symbol.dispose]();
    }
});

it("creates one acknowledged session with a local-only prompt and blocks a later permission question", async () => {
    const f = await fixture();
    const frames: Parameters<Parameters<typeof gptLiveControllerCreate>[0]["send"]>[0][] = [];
    const controller = gptLiveControllerCreate({
        windowId: "window-test",
        source: {
            get: () => ({
                activeConnectionId: "local",
                connections: [
                    { id: "local", name: "Test desktop", online: true, workspace: f.workspace },
                ],
            }),
            subscribe: () => () => {},
            targetOpen: (target) => {
                if (target.kind === "session" || target.kind === "bot")
                    f.workspace.conversationOpen(
                        target.sessionId as HappyAgentSessionId,
                        target.groupId as HappyAgentProjectId,
                    );
            },
        },
        send: (frame) => frames.push(frame),
        receive: () => {},
    });
    let created: Awaited<ReturnType<typeof f.workspace.voiceSessionAcquire>> | undefined;
    try {
        controller.start();
        const request = {
            type: "actionRequested" as const,
            actionId: "create-draft",
            contextRevision: controller.contextRead().revision,
            inputTranscriptIds: [],
            action: {
                type: "sessionCreate" as const,
                group: { connectionId: "local", groupId: f.group },
                prompt: "Approve",
            },
        };
        controller.actionReceive(request);
        await vi.waitFor(() =>
            expect(frames).toContainEqual(
                expect.objectContaining({
                    type: "actionResult",
                    actionId: "create-draft",
                    result: expect.objectContaining({
                        status: "succeeded",
                        output: expect.objectContaining({ type: "created" }),
                    }),
                }),
            ),
        );
        const newId = f.workspace.get().address.conversationId!;
        expect(newId).not.toBe(f.id);
        created = await f.workspace.voiceSessionAcquire(newId);
        expect(created.draftRead()).toMatchObject({ text: "Approve", voiceDraft: true });
        controller.actionReceive(request);
        expect(f.daemon.callCount("createAgent")).toBe(1);
        expect(f.daemon.callCount("sendMessage")).toBe(0);
        expect(f.daemon.callCount("saveAgentDraft")).toBe(0);
        f.question(newId);
        await vi.waitFor(() => expect(created?.get().pendingUserInputs).toHaveLength(1));
        f.workspace.composerTextSubmit();
        await vi.waitFor(() => expect(created?.draftRead()?.submission.status).toBe("failed"));
        expect(f.daemon.callCount("answerQuestion")).toBe(0);
        expect(f.daemon.callCount("sendMessage")).toBe(0);
    } finally {
        controller.close();
        created?.[Symbol.dispose]();
        f.voice[Symbol.dispose]();
    }
});
