import type {
    LiveControlClientMessage,
    LiveControlServerMessage,
} from "@slopus/happy-agent-client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
    HappyAgentVoiceSession,
    HappyAgentWorkspaceStore,
} from "../happyAgent/happyAgentWorkspaceStore.js";
import {
    GPT_LIVE_DESKTOP_CAPABILITIES,
    GPT_LIVE_NAVIGATION_HOLD_MS,
    GPT_LIVE_OPEN_LOAD_MS,
    gptLiveControllerCreate,
} from "./gptLiveController.js";
import type { GptLiveNavigationTarget } from "./gptLiveDesktopSource.js";
import type { GptLiveRuntimeEvent } from "./gptLiveRuntime.js";

type Request = Extract<LiveControlServerMessage, { type: "actionRequested" }>;
type FocusFrame = Extract<LiveControlServerMessage, { type: "voiceFocus" }>;

const projectTarget = (id: string) =>
    ({ kind: "project", connectionId: "local", projectId: id, groupId: id }) as const;
const botTarget = {
    kind: "bot",
    connectionId: "local",
    groupId: "bot-ws",
    sessionId: "bot-session",
    botId: "bot-1",
} as const;

/** An empty composer at one revision, as the workspace hands out its source. */
const composerAt = (revision: number) => {
    const snapshot = { text: "", attachments: [], revision };
    return { get: () => snapshot, subscribe: () => () => undefined };
};

/** A conversation as the workspace holds it once its transcript has loaded. */
const loaded = (conversationId: string) => ({
    type: "ready",
    value: {
        conversationId,
        ready: true,
        title: "Release bot",
        entries: [],
        transcriptComplete: true,
        running: false,
        workingWait: false,
        composer: composerAt(1),
        session: { type: "ready", value: { pendingUserInputs: [], permissionMode: "read_only" } },
    },
});

/**
 * A workspace reduced to what the controller reads for projects and bots: the
 * catalog, the address the window is on, and a listener list. Opening a target
 * moves the address the way the router would.
 */
function fixture(
    options: {
        capabilities?: readonly string[];
        taskCreate?: () => Promise<never>;
        sessionAcquire?: HappyAgentWorkspaceStore["voiceSessionAcquire"];
    } = {},
) {
    const listeners = new Set<() => void>();
    let snapshot = {
        address: { groupId: "project-1" } as { groupId?: string; conversationId?: string },
        tabOrder: [],
        list: {
            projects: {
                type: "ready",
                value: ["project-1", "project-2", "project-3"].map((id) => ({
                    id,
                    name: id,
                    conversations: [],
                    worktrees: [],
                })),
            },
            bots: [
                {
                    id: "bot-1",
                    workspaceId: "bot-ws",
                    name: "Release bot",
                    conversation: {
                        id: "bot-session",
                        title: "Release bot",
                        activity: "idle",
                        updatedAt: 0,
                        participants: [],
                    },
                    subtasks: [],
                },
            ],
            tasks: [],
        },
        conversation: { type: "loading" } as { type: string; value?: unknown },
        groupAccess: { conversationRefusal: undefined as string | undefined },
    };
    const notify = () => {
        for (const listener of [...listeners]) listener();
    };
    const workspace = {
        get: () => snapshot,
        voiceTaskCreate: options.taskCreate,
        voiceSessionAcquire: options.sessionAcquire,
        subscribe: (listener: () => void) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    } as unknown as HappyAgentWorkspaceStore;
    const opened: GptLiveNavigationTarget[] = [];
    const frames: LiveControlClientMessage[] = [];
    const resultRevisions = new Map<string, number>();
    const events: GptLiveRuntimeEvent[] = [];
    const controller = gptLiveControllerCreate({
        windowId: "window-1",
        source: {
            get: () => ({
                activeConnectionId: "local",
                connections: [
                    { id: "local", name: "This Mac", kind: "local", online: true, workspace },
                ],
            }),
            subscribe: () => () => {},
            targetOpen(target) {
                opened.push(target);
                snapshot = {
                    ...snapshot,
                    address: {
                        groupId: target.groupId,
                        ...("sessionId" in target ? { conversationId: target.sessionId } : {}),
                    },
                };
                notify();
            },
            paint: () => Promise.resolve(),
        },
        send: (frame) => {
            if (frame.type === "actionResult")
                resultRevisions.set(frame.actionId, controller.contextRead().revision);
            frames.push(frame);
        },
        receive: (event) => events.push(event),
        capabilities: options.capabilities ?? GPT_LIVE_DESKTOP_CAPABILITIES,
    });
    const request = (actionId: string, action: Request["action"]): Request => ({
        type: "actionRequested",
        actionId,
        contextRevision: controller.contextRead().revision,
        inputTranscriptIds: [],
        action,
    });
    const result = (actionId: string) =>
        frames.find((frame) => frame.type === "actionResult" && frame.actionId === actionId);
    const focus = (focusId: string, target: GptLiveNavigationTarget | null): FocusFrame =>
        ({
            type: "voiceFocus",
            focusId,
            contextRevision: controller.contextRead().revision,
            target,
            reason: "mention",
        }) as FocusFrame;
    return {
        controller,
        frames,
        events,
        opened,
        request,
        result,
        resultRevisions,
        focus,
        update(next: (current: typeof snapshot) => typeof snapshot) {
            snapshot = next(snapshot);
            notify();
        },
    };
}

afterEach(() => vi.useRealTimers());

describe("GPT-Live controller navigation", () => {
    it("acknowledges a cold open after its session and composer hydrate, then stages and sends at that revision", async () => {
        vi.useFakeTimers();
        const draftAppend = vi.fn(async () => {});
        const messageSend = vi.fn(async () => {});
        const handle = {
            get: () => ({
                ready: true,
                session: loaded(botTarget.sessionId).value.session,
                pendingUserInputs: [],
            }),
            draftRead: () => ({ text: "", attachments: [], submission: { status: "idle" } }),
            subscribe: () => () => {},
            draftAppend,
            messageSend,
            [Symbol.dispose]: () => {},
        } as unknown as HappyAgentVoiceSession;
        const f = fixture({ sessionAcquire: async () => handle });
        const cold = {
            ...loaded(botTarget.sessionId).value,
            ready: false,
            session: { type: "loading" },
        };
        f.update((current) => ({ ...current, conversation: { type: "ready", value: cold } }));
        f.controller.start(GPT_LIVE_DESKTOP_CAPABILITIES);
        f.controller.actionReceive(
            f.request("cold-open", { type: "desktopOpen", target: botTarget }),
        );
        await vi.advanceTimersByTimeAsync(GPT_LIVE_NAVIGATION_HOLD_MS);
        expect(f.opened).toEqual([botTarget]);
        expect(f.result("cold-open")).toBeUndefined();
        f.update((current) => ({
            ...current,
            conversation: { type: "ready", value: { ...cold, ready: true } },
        }));
        await vi.advanceTimersByTimeAsync(0);
        expect(f.result("cold-open")).toBeUndefined();
        f.update((current) => ({
            ...current,
            conversation: {
                type: "ready",
                value: {
                    ...loaded(botTarget.sessionId).value,
                    composer: composerAt(2),
                },
            },
        }));
        await vi.advanceTimersByTimeAsync(0);
        expect(f.result("cold-open")).toMatchObject({ result: { status: "succeeded" } });
        const published = f.frames.filter((frame) => frame.type === "desktopContext").at(-1)!;
        expect(published.revision).toBe(f.resultRevisions.get("cold-open"));
        expect(f.frames.indexOf(published)).toBeLessThan(f.frames.indexOf(f.result("cold-open")!));
        f.controller.actionReceive({
            ...f.request("next-draft", {
                type: "composerDraftAppend",
                target: botTarget,
                text: "Bring the seed catalog",
            }),
            contextRevision: f.resultRevisions.get("cold-open")!,
        });
        await vi.advanceTimersByTimeAsync(0);
        expect(f.result("next-draft")).toMatchObject({
            result: { status: "succeeded", output: { type: "ack" } },
        });
        expect(draftAppend).toHaveBeenCalledExactlyOnceWith("Bring the seed catalog", "");
        // A send really sends, through the conversation's own send, and stages nothing.
        f.controller.actionReceive({
            ...f.request("next-send", {
                type: "sessionSend",
                target: botTarget,
                text: "Run the benchmark again, please.",
            }),
            contextRevision: f.resultRevisions.get("cold-open")!,
        });
        await vi.advanceTimersByTimeAsync(0);
        expect(f.result("next-send")).toMatchObject({
            result: { status: "succeeded", output: { type: "ack" } },
        });
        expect(messageSend).toHaveBeenCalledExactlyOnceWith("Run the benchmark again, please.");
        expect(draftAppend).toHaveBeenCalledTimes(1);
        f.controller.close();
    });

    it.each(["error", "leave", "end"] as const)("ends a cold-open wait on %s", async (ending) => {
        vi.useFakeTimers();
        const f = fixture();
        f.update((current) => ({
            ...current,
            conversation: {
                type: "ready",
                value: {
                    ...loaded(botTarget.sessionId).value,
                    ready: false,
                    session: { type: "loading" },
                },
            },
        }));
        f.controller.start(GPT_LIVE_DESKTOP_CAPABILITIES);
        f.controller.actionReceive(
            f.request("cold-open", { type: "desktopOpen", target: botTarget }),
        );
        await vi.advanceTimersByTimeAsync(GPT_LIVE_NAVIGATION_HOLD_MS);
        expect(f.result("cold-open")).toBeUndefined();
        if (ending === "end") f.controller.close();
        else
            f.update((current) =>
                ending === "leave"
                    ? { ...current, address: { groupId: "project-3" } }
                    : {
                          ...current,
                          conversation: {
                              type: "ready",
                              value: {
                                  ...loaded(botTarget.sessionId).value,
                                  ready: false,
                                  session: { type: "error", error: { message: "Session failed." } },
                              },
                          },
                      },
            );
        await vi.advanceTimersByTimeAsync(0);
        if (ending === "end") expect(f.result("cold-open")).toBeUndefined();
        else expect(f.result("cold-open")).toMatchObject({ result: { status: "succeeded" } });
        f.controller.close();
    });

    it.each(["taskCreate", "sessionModelChange"] as const)(
        "refuses %s before acquiring or mutating when Happy Agent accepted no v2 capabilities",
        async (type) => {
            vi.useFakeTimers();
            const taskCreate = vi.fn(async (): Promise<never> => {
                throw new Error("An unaccepted task mutation was attempted.");
            });
            const sessionAcquire = vi.fn((): never => {
                throw new Error("An unaccepted model change acquired a session.");
            });
            const f = fixture({ taskCreate, sessionAcquire });
            f.update((current) => ({
                ...current,
                address: { groupId: botTarget.groupId, conversationId: botTarget.sessionId },
                conversation: loaded(botTarget.sessionId),
            }));
            f.controller.start([]);
            const action: Request["action"] =
                type === "taskCreate"
                    ? { type, connectionId: "local", name: "Audit", text: "Review the changelog." }
                    : {
                          type,
                          target: botTarget,
                          providerId: "voice",
                          modelId: "openai/gpt-6.1-sol",
                      };
            f.controller.actionReceive(f.request("unsupported", action));
            await vi.advanceTimersByTimeAsync(0);
            expect(f.result("unsupported")).toMatchObject({
                result: { status: "refused", code: "unavailable" },
            });
            expect(taskCreate).not.toHaveBeenCalled();
            expect(sessionAcquire).not.toHaveBeenCalled();
            expect(f.opened).toEqual([]);
            expect(
                f.events.some(
                    (event) =>
                        event.type === "actionStatusUpdated" || event.type === "voiceFocusUpdated",
                ),
            ).toBe(false);
            f.controller.close();
        },
    );

    it("keeps task creation uncertainty and no-replay advice in voice failures without a raw task ID", async () => {
        vi.useFakeTimers();
        const taskCreate = vi.fn(async () => {
            throw new Error(
                "“New task” was created, but its setup was not confirmed. Check the task before trying again.",
            );
        });
        const f = fixture({ taskCreate });
        f.controller.start(GPT_LIVE_DESKTOP_CAPABILITIES);
        f.controller.actionReceive(
            f.request("task", {
                type: "taskCreate",
                connectionId: "local",
                name: "New task",
                text: "Review the changelog.",
            }),
        );
        await vi.advanceTimersByTimeAsync(0);
        expect(taskCreate).toHaveBeenCalledTimes(1);
        expect(f.result("task")).toMatchObject({
            result: {
                status: "refused",
                code: "failed",
                message: expect.stringContaining(
                    "Do not repeat creation automatically; inspect the task list.",
                ),
            },
        });
        f.controller.close();
    });

    it("ignores stale, future and unknown focus frames during a valid navigation hold", async () => {
        vi.useFakeTimers();
        const f = fixture();
        f.controller.start(GPT_LIVE_DESKTOP_CAPABILITIES);
        const stale = f.focus("old", projectTarget("project-3"));
        f.update((current) => ({ ...current, address: { groupId: "project-3" } }));
        f.controller.actionReceive(
            f.request("open", {
                type: "desktopOpen",
                target: projectTarget("project-2"),
            }),
        );
        await vi.advanceTimersByTimeAsync(0);
        const before = f.events.slice();
        f.controller.focusReceive(stale);
        f.controller.focusReceive({ ...stale, target: null });
        f.controller.focusReceive(f.focus("unknown", projectTarget("missing")));
        const future = f.focus("future", projectTarget("project-3"));
        f.controller.focusReceive({ ...future, contextRevision: future.contextRevision + 1 });
        expect(f.events).toEqual(before);
        await vi.advanceTimersByTimeAsync(GPT_LIVE_NAVIGATION_HOLD_MS - 1);
        expect(f.opened).toEqual([]);
        await vi.advanceTimersByTimeAsync(1);
        expect(f.opened).toEqual([projectTarget("project-2")]);
        expect(f.result("open")).toMatchObject({ result: { status: "succeeded" } });
        f.controller.focusReceive(f.focus("clear", null));
        expect(f.events.at(-1)).toEqual({ type: "voiceFocusUpdated", focus: null });
        f.controller.close();
    });

    it.each([true, false])(
        "repaints and holds an expired same-target mention (explicit focus: %s)",
        async (explicit) => {
            vi.useFakeTimers();
            const f = fixture();
            f.controller.start(GPT_LIVE_DESKTOP_CAPABILITIES);
            f.controller.focusReceive(f.focus("mention", projectTarget("project-2")));
            await vi.advanceTimersByTimeAsync(31_000);
            if (explicit)
                f.controller.focusReceive({
                    ...f.focus("navigation", projectTarget("project-2")),
                    reason: "navigation",
                });
            f.controller.actionReceive(
                f.request("open", {
                    type: "desktopOpen",
                    target: projectTarget("project-2"),
                }),
            );
            await vi.advanceTimersByTimeAsync(0);
            expect(f.events.filter((event) => event.type === "voiceFocusUpdated")).toHaveLength(2);
            expect(f.opened).toEqual([]);
            await vi.advanceTimersByTimeAsync(GPT_LIVE_NAVIGATION_HOLD_MS - 1);
            expect(f.opened).toEqual([]);
            await vi.advanceTimersByTimeAsync(1);
            expect(f.opened).toEqual([projectTarget("project-2")]);
            f.controller.close();
        },
    );

    it("highlights a navigation target, holds it on screen, then revalidates and moves", async () => {
        vi.useFakeTimers();
        const f = fixture();
        f.controller.start(GPT_LIVE_DESKTOP_CAPABILITIES);
        f.controller.actionReceive(
            f.request("open", { type: "desktopOpen", target: projectTarget("project-2") }),
        );
        await vi.advanceTimersByTimeAsync(0);
        expect(f.events).toContainEqual({
            type: "voiceFocusUpdated",
            focus: {
                id: "navigation-open",
                target: projectTarget("project-2"),
                reason: "navigation",
            },
        });
        await vi.advanceTimersByTimeAsync(GPT_LIVE_NAVIGATION_HOLD_MS - 1);
        expect(f.opened).toEqual([]);
        expect(f.result("open")).toBeUndefined();
        await vi.advanceTimersByTimeAsync(1);
        expect(f.opened).toEqual([projectTarget("project-2")]);
        expect(f.result("open")).toEqual({
            type: "actionResult",
            actionId: "open",
            result: { status: "succeeded", output: { type: "ack" } },
        });
        // Voice hears the new focus before the result it will answer from.
        const appState = f.frames
            .map(
                (frame) =>
                    frame.type === "appState" &&
                    frame.appState.focused?.target.groupId === "project-2",
            )
            .lastIndexOf(true);
        const context = f.frames.map((frame) => frame.type === "desktopContext").lastIndexOf(true);
        const done = f.frames.findIndex((frame) => frame.type === "actionResult");
        expect(appState).toBeGreaterThanOrEqual(0);
        expect(appState).toBeLessThan(done);
        expect(context).toBeLessThan(done);
        f.controller.close();
    });

    it("moves at once to a target voice already pointed at for the whole hold", async () => {
        vi.useFakeTimers();
        const f = fixture();
        f.controller.start(GPT_LIVE_DESKTOP_CAPABILITIES);
        f.controller.focusReceive(f.focus("named", projectTarget("project-2")));
        await vi.advanceTimersByTimeAsync(GPT_LIVE_NAVIGATION_HOLD_MS + 100);
        f.controller.actionReceive(
            f.request("open", { type: "desktopOpen", target: projectTarget("project-2") }),
        );
        await vi.advanceTimersByTimeAsync(0);
        expect(f.opened).toEqual([projectTarget("project-2")]);
        expect(f.result("open")).toMatchObject({ result: { status: "succeeded" } });
        f.controller.close();
    });

    it("waits only the rest of the hold for a target highlighted a moment ago", async () => {
        vi.useFakeTimers();
        const f = fixture();
        f.controller.start(GPT_LIVE_DESKTOP_CAPABILITIES);
        f.controller.focusReceive(f.focus("named", projectTarget("project-2")));
        await vi.advanceTimersByTimeAsync(300);
        f.controller.actionReceive(
            f.request("open", { type: "desktopOpen", target: projectTarget("project-2") }),
        );
        await vi.advanceTimersByTimeAsync(GPT_LIVE_NAVIGATION_HOLD_MS - 300 - 1);
        expect(f.opened).toEqual([]);
        await vi.advanceTimersByTimeAsync(1);
        expect(f.opened).toEqual([projectTarget("project-2")]);
        f.controller.close();
    });

    it("cancels a held navigation when voice points elsewhere, or the call ends, before anything moves", async () => {
        vi.useFakeTimers();
        const f = fixture();
        f.controller.start(GPT_LIVE_DESKTOP_CAPABILITIES);
        f.controller.actionReceive(
            f.request("open", { type: "desktopOpen", target: projectTarget("project-2") }),
        );
        await vi.advanceTimersByTimeAsync(200);
        f.controller.focusReceive(f.focus("elsewhere", projectTarget("project-3")));
        await vi.advanceTimersByTimeAsync(0);
        expect(f.result("open")).toMatchObject({
            result: { status: "cancelled", code: "ended" },
        });
        await vi.advanceTimersByTimeAsync(GPT_LIVE_NAVIGATION_HOLD_MS);
        expect(f.opened).toEqual([]);

        f.controller.actionReceive(
            f.request("open-again", { type: "desktopOpen", target: projectTarget("project-2") }),
        );
        await vi.advanceTimersByTimeAsync(200);
        f.controller.close();
        await vi.advanceTimersByTimeAsync(GPT_LIVE_NAVIGATION_HOLD_MS);
        expect(f.opened).toEqual([]);
    });

    it("keeps a highlight's start when voice names the same target again for navigation", async () => {
        vi.useFakeTimers();
        const f = fixture();
        f.controller.start(GPT_LIVE_DESKTOP_CAPABILITIES);
        f.controller.focusReceive(f.focus("named", projectTarget("project-2")));
        await vi.advanceTimersByTimeAsync(GPT_LIVE_NAVIGATION_HOLD_MS + 100);
        f.controller.focusReceive({
            ...f.focus("navigating", projectTarget("project-2")),
            reason: "navigation",
        });
        f.controller.actionReceive(
            f.request("open", { type: "desktopOpen", target: projectTarget("project-2") }),
        );
        await vi.advanceTimersByTimeAsync(0);
        expect(f.opened).toEqual([projectTarget("project-2")]);
        expect(f.result("open")).toMatchObject({ result: { status: "succeeded" } });
        f.controller.close();
    });

    it("reports an opened conversation once it has loaded, with the context that describes it", async () => {
        vi.useFakeTimers();
        const f = fixture();
        f.controller.start(GPT_LIVE_DESKTOP_CAPABILITIES);
        f.controller.actionReceive(f.request("open", { type: "desktopOpen", target: botTarget }));
        await vi.advanceTimersByTimeAsync(GPT_LIVE_NAVIGATION_HOLD_MS + 10);
        expect(f.opened).toEqual([botTarget]);
        expect(f.result("open")).toBeUndefined();
        f.update((current) => ({ ...current, conversation: loaded("bot-session") }));
        await vi.advanceTimersByTimeAsync(0);
        expect(f.result("open")).toMatchObject({ result: { status: "succeeded" } });
        const at = f.frames.findIndex(
            (frame) => frame.type === "actionResult" && frame.actionId === "open",
        );
        const contexts = f.frames.slice(0, at).filter((frame) => frame.type === "desktopContext");
        expect(contexts.at(-1)).toMatchObject({
            context: { activeSession: { target: { sessionId: "bot-session" } } },
        });
        // The load was reported before the result, so nothing it caused follows it.
        await vi.advanceTimersByTimeAsync(1_000);
        expect(f.frames.slice(at + 1).some((frame) => frame.type === "desktopContext")).toBe(false);
        f.controller.close();
    });

    it.each(["conversation", "session"] as const)(
        "reports an opening whose %s is still loading once the load bound passes",
        async (loading) => {
            vi.useFakeTimers();
            const f = fixture();
            if (loading === "session")
                f.update((current) => ({
                    ...current,
                    conversation: {
                        type: "ready",
                        value: {
                            ...loaded(botTarget.sessionId).value,
                            ready: false,
                            session: { type: "loading" },
                        },
                    },
                }));
            f.controller.start(GPT_LIVE_DESKTOP_CAPABILITIES);
            f.controller.actionReceive(
                f.request("open", { type: "desktopOpen", target: botTarget }),
            );
            await vi.advanceTimersByTimeAsync(
                GPT_LIVE_NAVIGATION_HOLD_MS + GPT_LIVE_OPEN_LOAD_MS - 1,
            );
            expect(f.result("open")).toBeUndefined();
            await vi.advanceTimersByTimeAsync(1);
            expect(f.result("open")).toMatchObject({ result: { status: "succeeded" } });
            f.controller.close();
        },
    );

    it("runs actions in arrival order instead of refusing one that arrives while another runs", async () => {
        vi.useFakeTimers();
        const f = fixture();
        f.controller.start(GPT_LIVE_DESKTOP_CAPABILITIES);
        f.controller.actionReceive(
            f.request("open", { type: "desktopOpen", target: projectTarget("project-2") }),
        );
        f.controller.actionReceive(
            f.request("create", {
                type: "workspaceCreate",
                project: { connectionId: "local", projectId: "project-1" },
            }),
        );
        await vi.advanceTimersByTimeAsync(0);
        expect(f.result("create")).toBeUndefined();
        await vi.advanceTimersByTimeAsync(GPT_LIVE_NAVIGATION_HOLD_MS);
        const results = f.frames.filter((frame) => frame.type === "actionResult");
        expect(results.map((frame) => frame.actionId)).toEqual(["open", "create"]);
        // Voice makes tasks now; the older creations are refused, never attempted.
        expect(f.result("create")).toMatchObject({
            result: { status: "refused", code: "unavailable" },
        });
        f.controller.close();
    });
});

describe("GPT-Live controller AppState delivery", () => {
    it("sends AppState only to a Happy Agent that accepted it", async () => {
        vi.useFakeTimers();
        const f = fixture();
        f.controller.start([]);
        f.update((current) => ({ ...current, address: { groupId: "project-3" } }));
        await vi.advanceTimersByTimeAsync(2_000);
        expect(f.frames.some((frame) => frame.type === "appState")).toBe(false);
        f.controller.close();
    });

    it("sends what is listed or focused within a quarter second and how it is doing within a second", async () => {
        vi.useFakeTimers();
        const f = fixture();
        f.controller.start(GPT_LIVE_DESKTOP_CAPABILITIES);
        const sent = () => f.frames.filter((frame) => frame.type === "appState");
        expect(sent()).toHaveLength(1);
        // Status only: held to the slower cadence, counted from the last send.
        f.update((current) => ({
            ...current,
            list: {
                ...current.list,
                bots: current.list.bots.map((bot) => ({
                    ...bot,
                    conversation: { ...bot.conversation, activity: "running" },
                })),
            },
        }));
        await vi.advanceTimersByTimeAsync(999);
        expect(sent()).toHaveLength(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(sent()).toHaveLength(2);
        expect(sent()[1]).toMatchObject({
            appState: { servers: [{ bots: [{ status: "running" }] }] },
        });
        // A move on screen: a quarter second, however recently the last went.
        f.update((current) => ({ ...current, address: { groupId: "project-3" } }));
        await vi.advanceTimersByTimeAsync(250);
        expect(sent()).toHaveLength(3);
        expect(sent()[2]).toMatchObject({
            appState: { focused: { target: projectTarget("project-3") } },
        });
        // Nothing changed: nothing is sent.
        f.update((current) => ({ ...current }));
        await vi.advanceTimersByTimeAsync(2_000);
        expect(sent()).toHaveLength(3);
        f.controller.close();
        f.update((current) => ({ ...current, address: { groupId: "project-1" } }));
        await vi.advanceTimersByTimeAsync(2_000);
        expect(sent()).toHaveLength(3);
    });
});
