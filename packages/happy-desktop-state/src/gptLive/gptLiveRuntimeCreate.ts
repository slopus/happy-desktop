import { Value } from "@sinclair/typebox/value";
import {
    createLiveSessionRequestSchema,
    createLiveSessionResponseSchema,
    liveControlClientMessageSchema,
    liveControlServerMessageSchema,
    liveSessionResponseSchema,
    type HappyAgentClient,
    type LiveControlClientMessage,
    type LiveControlServerMessage,
    type LiveSessionResponse,
} from "@slopus/happy-agent-client";
import { UserError } from "../types.js";
import { gptLiveControllerCreate } from "./gptLiveController.js";
import type { GptLiveDesktopSource } from "./gptLiveDesktopSource.js";
import type {
    GptLiveAvailability,
    GptLiveCall,
    GptLiveRuntime,
    GptLiveRuntimeEvent,
} from "./gptLiveRuntime.js";

/** Browser integration owns these resources; the product lifetime decides when to release them. */
export interface GptLiveMedia {
    readonly offer: string;
    readonly ready: Promise<void>;
    answerApply(sdp: string): Promise<void>;
    microphoneMutedUpdate(muted: boolean): void;
    silence(): void;
    close(): void;
}

export interface GptLiveControlSocket {
    send(text: string): void;
    close(): void;
}

/** Transport callbacks arrive after the socket factory returns. Only text frames are accepted. */
export interface GptLiveControlSocketHandlers {
    opened(): void;
    messageReceived(text: string): void;
    failed(message: string): void;
    closed(): void;
}

export interface GptLiveRuntimeCreateOptions {
    readonly windowId: string;
    readonly source: GptLiveDesktopSource;
    readonly client: () => HappyAgentClient | undefined;
    readonly permissionStart: (input: { readonly enabled: true }) => Promise<void>;
    readonly permissionRevoke: () => void | Promise<void>;
    readonly mediaOpen: (
        signal: AbortSignal,
        failed: (message: string) => void,
    ) => Promise<GptLiveMedia>;
    readonly socket: (url: string, handlers: GptLiveControlSocketHandlers) => GptLiveControlSocket;
}

const CONTROL_BYTES = 256 * 1024;
const CREATE_BYTES = 384 * 1024;
const CONNECT_MS = 60_000;
const CLOSE_MS = 15_000;
const CLEANUP_MS = 30_000;

/** Construction starts no transport, permission request, subscription, or timer. */
export function gptLiveRuntimeCreate(options: GptLiveRuntimeCreateOptions): GptLiveRuntime {
    async function availabilityRead(signal: AbortSignal): Promise<GptLiveAvailability> {
        try {
            const client = options.client();
            if (!client)
                return {
                    supported: false,
                    reason: "Connect to Happy Agent to use GPT-Live.",
                    accounts: [],
                };
            const health = await client.getHealth({ signal });
            if (!health.ready || health.draining || health.shuttingDown)
                return {
                    supported: false,
                    reason: "Happy Agent is not ready for a voice call.",
                    accounts: [],
                };
            if (health.capabilities?.desktopLiveControl !== true)
                return {
                    supported: false,
                    reason: "This Happy Agent does not support GPT-Live desktop control.",
                    accounts: [],
                };
            const { config } = await client.getConfig({ signal });
            const accounts: GptLiveAvailability["accounts"][number][] = [];
            for (const [providerId, provider] of Object.entries(config.providers)) {
                if (!provider.enabled) continue;
                if (provider.type === "codex")
                    accounts.push({
                        id: providerId,
                        providerId,
                        kind: "subscription",
                        label: `${providerId} · Codex subscription`,
                    });
                else if (provider.type === "openai")
                    accounts.push({
                        id: providerId,
                        providerId,
                        kind: "api",
                        label: `${providerId} · OpenAI API`,
                    });
            }
            return {
                supported: true,
                accounts,
                ...(accounts.length === 0
                    ? {
                          reason: "Configure an enabled Codex subscription or OpenAI API provider to use GPT-Live.",
                      }
                    : {}),
            };
        } catch (error) {
            throw userError(error, "GPT-Live availability could not be checked.");
        }
    }

    return {
        availabilityRead,
        async callOpen(input, receive, signal): Promise<GptLiveCall> {
            if (signal.aborted) throw cancelled();
            const lifetime = new AbortController();
            let phase: "opening" | "ready" | "closing" | "ended" = "opening";
            let permissionRequested = false;
            let client: HappyAgentClient | undefined;
            let resourceId: string | undefined;
            let creationAttempted = false;
            let media: GptLiveMedia | undefined;
            let socket: GptLiveControlSocket | undefined;
            let controller: ReturnType<typeof gptLiveControllerCreate> | undefined;
            let socketOpened = false;
            let helloVerified = false;
            let mediaReady = false;
            let providerActive = false;
            let active = false;
            let revision = 0;
            let connectTimer: ReturnType<typeof setTimeout> | undefined;
            let closeTimer: ReturnType<typeof setTimeout> | undefined;
            let cleanupPromise: Promise<LiveSessionResponse | undefined> | undefined;
            let readyResolve!: () => void;
            let readyReject!: (error: UserError) => void;
            const ready = new Promise<void>((resolve, reject) => {
                readyResolve = resolve;
                readyReject = reject;
            });
            let stoppedReject!: (error: UserError) => void;
            const stopped = new Promise<never>((_resolve, reject) => {
                stoppedReject = reject;
            });
            // Both can end before a pending browser permission resolves and before a waiter is attached.
            void ready.catch(() => undefined);
            void stopped.catch(() => undefined);
            const wait = <T>(operation: Promise<T>): Promise<T> =>
                Promise.race([operation, stopped]);
            const permissionRevoke = () => {
                if (!permissionRequested) return;
                try {
                    void Promise.resolve(options.permissionRevoke()).catch(() => undefined);
                } catch {
                    /* The native window may already have gone. */
                }
            };
            const identityMatches = (response: LiveSessionResponse): boolean =>
                Value.Check(liveSessionResponseSchema, response) &&
                response.session.id === resourceId &&
                response.session.windowId === options.windowId;
            const remoteCleanup = (): Promise<LiveSessionResponse | undefined> => {
                if (!creationAttempted || !client || !resourceId) return Promise.resolve(undefined);
                if (cleanupPromise) return cleanupPromise;
                const selected = client;
                const id = resourceId;
                const deadline = Date.now() + CLEANUP_MS;
                cleanupPromise = (async () => {
                    // Original identity only: status/close can resolve an uncertain creation, never replay it.
                    while (true) {
                        try {
                            const current = await selected.getLiveSession(id, {
                                signal: AbortSignal.timeout(5_000),
                            });
                            if (!identityMatches(current)) return undefined;
                            const result = await selected.closeLiveSession(
                                id,
                                { mutationId: `close-${id}` },
                                { signal: AbortSignal.timeout(5_000) },
                            );
                            return identityMatches(result) ? result : undefined;
                        } catch {
                            if (Date.now() >= deadline) return undefined;
                            await new Promise<void>((resolve) => setTimeout(resolve, 500));
                        }
                    }
                })();
                return cleanupPromise;
            };
            const finish = (error: UserError, event?: GptLiveRuntimeEvent) => {
                if (phase === "ended") return;
                phase = "ended";
                active = false;
                signal.removeEventListener("abort", aborted);
                if (connectTimer !== undefined) clearTimeout(connectTimer);
                if (closeTimer !== undefined) clearTimeout(closeTimer);
                connectTimer = closeTimer = undefined;
                controller?.close();
                media?.silence();
                permissionRevoke();
                lifetime.abort();
                media?.close();
                socket?.close();
                readyReject(error);
                stoppedReject(error);
                if (event) receive(event);
            };
            const fail = (message: string) => {
                if (phase === "ended") return;
                finish(new UserError(message), { type: "callFailed", message });
                void remoteCleanup();
            };
            const aborted = () => {
                finish(cancelled());
                void remoteCleanup();
            };
            const activate = () => {
                if (
                    active ||
                    phase === "ended" ||
                    phase === "closing" ||
                    !helloVerified ||
                    !mediaReady ||
                    !providerActive
                )
                    return;
                active = true;
                if (connectTimer !== undefined) clearTimeout(connectTimer);
                connectTimer = undefined;
                receive({ type: "callActive" });
            };
            const terminalReceive = (status: "closed" | "failed", error: string | null) => {
                if (status === "failed")
                    fail(error ?? "The voice call failed. Start a new call to reconnect.");
                else finish(cancelled(), { type: "callClosed" });
            };
            const close = () => {
                if (phase === "ended" || phase === "closing") return;
                phase = "closing";
                active = false;
                // The store aborts its opening signal immediately after close(). Keep the RTC/DC
                // and sideband on this separate lifetime until typed terminal state or the grace deadline.
                signal.removeEventListener("abort", aborted);
                if (connectTimer !== undefined) clearTimeout(connectTimer);
                connectTimer = undefined;
                controller?.close();
                media?.silence();
                permissionRevoke();
                closeTimer = setTimeout(
                    () => fail("The voice connection ended before its close could be confirmed."),
                    CLOSE_MS,
                );
                if (!client || !resourceId || !creationAttempted) {
                    finish(cancelled());
                    return;
                }
                const id = resourceId;
                try {
                    // Send the command before releasing either provider transport. RPC completion
                    // alone is not terminal state or a statement about final voice usage.
                    void client
                        .closeLiveSession(
                            id,
                            { mutationId: `close-${id}` },
                            { signal: AbortSignal.timeout(CLOSE_MS) },
                        )
                        .then(
                            (result) => {
                                if (phase === "ended") return;
                                if (!identityMatches(result)) {
                                    fail("The voice close response did not match this window.");
                                    return;
                                }
                                if (
                                    result.session.status === "closed" ||
                                    result.session.status === "failed"
                                )
                                    terminalReceive(result.session.status, result.session.error);
                            },
                            () => fail("The voice close command could not reach Happy Agent."),
                        );
                } catch {
                    fail("The voice close command could not reach Happy Agent.");
                }
            };
            const send = (frame: LiveControlClientMessage) => {
                if (phase === "ended" || phase === "closing") return;
                if (!socketOpened || !helloVerified || !socket)
                    throw new UserError("Voice control is not ready.");
                if (!Value.Check(liveControlClientMessageSchema, frame)) {
                    fail("Voice desktop context did not match the control contract.");
                    return;
                }
                const text = JSON.stringify(frame);
                if (bytes(text) > CONTROL_BYTES) {
                    fail("Voice desktop context exceeded its size limit.");
                    return;
                }
                try {
                    socket.send(text);
                } catch {
                    fail("Voice control disconnected. Start a new call to reconnect.");
                }
            };
            const messageReceive = (text: string) => {
                if (phase === "ended") return;
                let value: unknown;
                try {
                    if (bytes(text) > CONTROL_BYTES) throw new Error();
                    value = JSON.parse(text);
                    if (!Value.Check(liveControlServerMessageSchema, value)) throw new Error();
                } catch {
                    fail("Happy Agent sent an invalid voice control message.");
                    return;
                }
                const frame: LiveControlServerMessage = value;
                if (phase === "closing") {
                    if (
                        frame.type === "status" &&
                        (frame.status === "closed" || frame.status === "failed")
                    )
                        terminalReceive(frame.status, frame.error);
                    return;
                }
                if (!socketOpened) {
                    fail("Voice control sent data before opening.");
                    return;
                }
                if (!helloVerified) {
                    if (
                        frame.type !== "hello" ||
                        frame.sessionId !== resourceId ||
                        frame.windowId !== options.windowId ||
                        frame.contextRevision !== revision
                    ) {
                        fail("Voice control did not match this call and window.");
                        return;
                    }
                    helloVerified = true;
                    try {
                        controller?.start();
                    } catch {
                        fail("Voice desktop context could not start.");
                        return;
                    }
                    readyResolve();
                    activate();
                    return;
                }
                switch (frame.type) {
                    case "hello":
                        fail("Voice control repeated its initial handshake.");
                        break;
                    case "status":
                        if (frame.status === "active") {
                            providerActive = true;
                            activate();
                        } else if (frame.status === "starting") {
                            providerActive = false;
                            if (active)
                                fail(
                                    "Voice lost provider readiness. Start a new call to reconnect.",
                                );
                        } else if (frame.status === "closing") close();
                        else terminalReceive(frame.status, frame.error);
                        break;
                    case "transcript":
                        if ("startMs" in frame && frame.endMs < frame.startMs) {
                            fail("Voice transcript timing was invalid.");
                            return;
                        }
                        receive({
                            type: "transcriptReceived",
                            fragment: {
                                id: frame.transcriptId,
                                role: frame.role,
                                text: frame.text,
                                ...("startMs" in frame
                                    ? { startMs: frame.startMs, endMs: frame.endMs }
                                    : {}),
                            },
                        });
                        break;
                    case "actionRequested":
                        if (!active) {
                            fail("Voice requested a desktop action before provider readiness.");
                            return;
                        }
                        try {
                            controller?.actionReceive(frame);
                        } catch {
                            fail("The requested voice action could not be handled.");
                        }
                        break;
                }
            };
            signal.addEventListener("abort", aborted, { once: true });
            connectTimer = setTimeout(
                () => fail("Voice connection timed out. Start a new call to try again."),
                CONNECT_MS,
            );
            try {
                const availability = await wait(availabilityRead(lifetime.signal));
                const account = availability.accounts.find(
                    (candidate) =>
                        candidate.id === input.account.id &&
                        candidate.providerId === input.account.providerId &&
                        candidate.kind === input.account.kind,
                );
                if (!availability.supported || !account)
                    throw new UserError(
                        availability.reason ??
                            "The selected voice account is unavailable. Choose an enabled account.",
                    );
                client = options.client();
                if (!client)
                    throw new UserError("Happy Agent disconnected before the voice call started.");
                permissionRequested = true;
                await wait(
                    Promise.resolve()
                        .then(() =>
                            options.permissionStart({ enabled: true }).catch((error: unknown) => {
                                throw new UserError(
                                    "Microphone access was denied.",
                                    "microphone-denied",
                                    error,
                                );
                            }),
                        )
                        .then(() => {
                            if (phase === "ended") {
                                permissionRevoke();
                                throw cancelled();
                            }
                        }),
                );
                const openingMedia = options.mediaOpen(lifetime.signal, fail).then((value) => {
                    if (phase === "ended" || lifetime.signal.aborted) {
                        value.silence();
                        value.close();
                        permissionRevoke();
                        throw cancelled();
                    }
                    media = value;
                    void value.ready.then(
                        () => {
                            mediaReady = true;
                            activate();
                        },
                        (error: unknown) => {
                            if (phase !== "ended" && phase !== "closing")
                                fail(userError(error, "Voice media could not connect.").message);
                        },
                    );
                    return value;
                });
                await wait(openingMedia);
                if (!media || lifetime.signal.aborted) throw cancelled();
                resourceId = `c${crypto.randomUUID().replaceAll("-", "").slice(0, 23)}`;
                controller = gptLiveControllerCreate({
                    windowId: options.windowId,
                    source: options.source,
                    send,
                    receive,
                });
                const initial = controller.contextRead();
                revision = initial.revision;
                const request = {
                    id: resourceId,
                    windowId: options.windowId,
                    sdp: media.offer,
                    credential: {
                        type:
                            account.kind === "subscription"
                                ? ("codex_subscription" as const)
                                : ("openai_api_key" as const),
                        providerId: account.providerId,
                    },
                    contextRevision: revision,
                    context: initial.context,
                };
                if (
                    !Value.Check(createLiveSessionRequestSchema, request) ||
                    bytes(JSON.stringify(request)) > CREATE_BYTES
                )
                    throw new UserError(
                        "Voice desktop context could not fit the connection request.",
                    );
                creationAttempted = true;
                const creating = client
                    .createLiveSession(request, { signal: lifetime.signal })
                    .then((result) => {
                        if (phase === "ended") {
                            cleanupPromise = undefined;
                            void remoteCleanup();
                            throw cancelled();
                        }
                        if (
                            !Value.Check(createLiveSessionResponseSchema, result) ||
                            result.session.id !== resourceId ||
                            result.session.windowId !== options.windowId ||
                            result.session.credential.type !== request.credential.type ||
                            result.session.credential.providerId !== account.providerId ||
                            result.session.contextRevision !== revision
                        )
                            throw new UserError(
                                "The voice connection response did not match this call and account.",
                            );
                        return result;
                    });
                const created = await wait(creating);
                await wait(media.answerApply(created.transport.sdp));
                if (lifetime.signal.aborted) throw cancelled();
                const url = new URL(client.liveSessionControlUrl(resourceId, options.windowId));
                if (url.protocol === "http:") url.protocol = "ws:";
                else if (url.protocol === "https:") url.protocol = "wss:";
                else
                    throw new UserError(
                        "Happy Agent provided an unsupported voice control address.",
                    );
                socket = options.socket(url.toString(), {
                    opened: () => {
                        if (phase !== "ended") socketOpened = true;
                    },
                    messageReceived: messageReceive,
                    failed: (message) => fail(message),
                    closed: () =>
                        fail("Voice control disconnected. Start a new call to reconnect."),
                });
                await wait(ready);
                if (lifetime.signal.aborted) throw cancelled();
                if (phase === "opening") phase = "ready";
                return {
                    close,
                    microphoneMutedUpdate(muted) {
                        if (phase === "ready" || phase === "opening")
                            media?.microphoneMutedUpdate(muted);
                    },
                };
            } catch (error) {
                const failure = userError(error, "The voice call could not start.");
                finish(failure);
                void remoteCleanup();
                throw failure;
            }
        },
    };
}

function bytes(text: string): number {
    return new TextEncoder().encode(text).byteLength;
}
function cancelled(): UserError {
    return new UserError("The voice call ended.", "cancelled");
}
function userError(error: unknown, fallback: string): UserError {
    return error instanceof UserError
        ? error
        : new UserError(error instanceof Error ? error.message : fallback, undefined, error);
}
