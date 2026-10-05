import type {
    CreateLiveSessionRequest,
    LiveControlClientMessage,
    LiveControlServerMessage,
} from "@slopus/happy-agent-client";
import { fakeHappyAgentDaemonCreate } from "../../testing/fakeHappyAgentDaemon.js";
import {
    gptLiveRuntimeCreate,
    type GptLiveControlSocketHandlers,
    type GptLiveMedia,
} from "../gptLiveRuntimeCreate.js";
import type { GptLiveAccount, GptLiveRuntimeEvent } from "../gptLiveRuntime.js";
import type { GptLiveDesktopSource } from "../gptLiveDesktopSource.js";

/** Browser-safe programmable lifecycle fixture shared by state and actual UI interaction tests. */
export function gptLiveRuntimeFixtureCreate(
    options: {
        readonly daemon?: ReturnType<typeof fakeHappyAgentDaemonCreate>;
        readonly source?: GptLiveDesktopSource;
    } = {},
) {
    const daemon = options.daemon ?? fakeHappyAgentDaemonCreate();
    daemon.healthSet({ desktopLiveControl: true });
    daemon.configSet({
        ...daemon.configGet(),
        providers: {
            codex: { enabled: true, type: "codex", models: [] },
            openai: { enabled: true, type: "openai", models: [] },
            disabled: { enabled: false, type: "codex", models: [] },
            unsupported: { enabled: true, type: "claude", models: [] },
        },
    });
    const stats = {
        permissionStarts: 0,
        permissionRevokes: 0,
        mediaOpens: 0,
        mediaSilences: 0,
        mediaCloses: 0,
        socketOpens: 0,
        socketCloses: 0,
        subscriptions: 0,
        microphoneMuted: false,
    };
    const order: string[] = [];
    const events: GptLiveRuntimeEvent[] = [];
    const sent: LiveControlClientMessage[] = [];
    const answers: string[] = [];
    let handlers: GptLiveControlSocketHandlers | undefined;
    let permissionGate: Promise<void> | undefined;
    let mediaGate: Promise<void> | undefined;
    const source: GptLiveDesktopSource = options.source ?? {
        get: () => ({ activeConnectionId: null, connections: [] }),
        subscribe: () => {
            stats.subscriptions++;
            return () => {
                stats.subscriptions--;
            };
        },
        targetOpen: () => {},
    };
    let mediaClosed = false;
    let silenced = false;
    let mediaReady!: () => void;
    let mediaFailed!: (error: Error) => void;
    const ready = new Promise<void>((resolve, reject) => {
        mediaReady = resolve;
        mediaFailed = reject;
    });
    void ready.catch(() => undefined);
    const media: GptLiveMedia = {
        offer: "fake-offer",
        ready,
        async answerApply(sdp) {
            answers.push(sdp);
            order.push("answer-applied");
        },
        microphoneMutedUpdate(muted) {
            stats.microphoneMuted = muted;
        },
        silence() {
            if (!silenced) {
                silenced = true;
                stats.mediaSilences++;
                order.push("microphone-silenced");
            }
        },
        close() {
            if (!mediaClosed) {
                mediaClosed = true;
                stats.mediaCloses++;
                order.push("media-closed");
            }
        },
    };
    const close = daemon.client.closeLiveSession.bind(daemon.client);
    daemon.client.closeLiveSession = (...args) => {
        order.push("close-rpc");
        return close(...args);
    };
    const runtime = gptLiveRuntimeCreate({
        windowId: "test-window",
        source,
        client: () => daemon.client,
        permissionStart: async () => {
            stats.permissionStarts++;
            order.push("permission-start");
            await permissionGate;
        },
        permissionRevoke: () => {
            stats.permissionRevokes++;
            order.push("permission-revoked");
        },
        mediaOpen: async () => {
            stats.mediaOpens++;
            order.push("media-opened");
            await mediaGate;
            return media;
        },
        socket: (_url, receive) => {
            handlers = receive;
            stats.socketOpens++;
            order.push("socket-created");
            let closed = false;
            return {
                send: (text) => {
                    sent.push(JSON.parse(text) as LiveControlClientMessage);
                },
                close: () => {
                    if (!closed) {
                        closed = true;
                        stats.socketCloses++;
                        order.push("socket-closed");
                    }
                },
            };
        },
    });
    const account: GptLiveAccount = {
        id: "codex",
        providerId: "codex",
        kind: "subscription",
        label: "Codex test subscription",
    };
    const createRequests = () =>
        daemon.calls
            .filter((call) => call.method === "createLiveSession")
            .map((call) => call.args[0] as CreateLiveSessionRequest);
    const frame = (message: LiveControlServerMessage) =>
        handlers!.messageReceived(JSON.stringify(message));
    const status = (
        value: "starting" | "active" | "closing" | "closed" | "failed",
        error: string | null = null,
    ) => {
        const id = createRequests()[0]?.id;
        const session = id ? daemon.liveSessionGet(id) : undefined;
        if (session)
            daemon.liveSessionSet({
                ...session,
                status: value,
                error,
                ...(value === "closed" || value === "failed" ? { endedAt: 3 } : {}),
            });
        frame({ type: "status", status: value, error });
    };
    return {
        daemon,
        client: daemon.client,
        source,
        runtime,
        account,
        stats,
        order,
        events,
        sent,
        answers,
        media,
        createRequests,
        closeRequests: () => daemon.calls.filter((call) => call.method === "closeLiveSession"),
        open: (signal = new AbortController().signal) =>
            runtime.callOpen({ account }, (event) => events.push(event), signal),
        permissionHold() {
            let release!: () => void;
            permissionGate = new Promise<void>((resolve) => {
                release = resolve;
            });
            return release;
        },
        mediaHold() {
            let release!: () => void;
            mediaGate = new Promise<void>((resolve) => {
                release = resolve;
            });
            return release;
        },
        socketOpened() {
            handlers!.opened();
        },
        hello() {
            handlers!.opened();
            const request = createRequests()[0]!;
            frame({
                type: "hello",
                sessionId: request.id!,
                windowId: request.windowId,
                contextRevision: request.contextRevision,
            });
        },
        active: () => status("active"),
        mediaReady,
        mediaFail: (message: string) => mediaFailed(new Error(message)),
        status,
        frame,
        raw: (text: string) => handlers!.messageReceived(text),
        socketLose: () => handlers!.closed(),
    };
}
