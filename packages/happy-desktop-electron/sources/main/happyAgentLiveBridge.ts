import { Value } from "@sinclair/typebox/value";
import {
    HappyAgentApiError,
    createLiveSessionRequestSchema,
    closeLiveSessionRequestSchema,
    liveSessionSchema,
    type Cuid2,
    type LiveSession,
} from "@slopus/happy-agent-client";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import {
    HAPPY_AGENT_LIVE_MAX_WIRE_BYTES,
    type HappyAgentDaemonClient,
} from "./happyAgentDaemonClient";
import type { RendererLiveAttempt } from "../shared/happyAgentRendererUtilityContract";
import {
    HAPPY_AGENT_LIVE_WINDOW_HEADER,
    happyAgentLivePath,
    happyAgentLiveRoute,
    type HappyAgentLiveRoute,
} from "./happyAgentLiveRoute";

export type HappyAgentLiveClient = Pick<
    HappyAgentDaemonClient,
    "createLiveSession" | "getLiveSession" | "closeLiveSession" | "attachLiveSession"
> & { readonly connection?: (id: string) => HappyAgentLiveClient };

interface LiveAttempt {
    readonly id: Cuid2;
    readonly windowId: string;
    readonly client: HappyAgentLiveClient;
    readonly creation: Promise<void>;
    disposed: boolean;
    readonly sockets: Set<WebSocket>;
}

/** Native-only ownership records. They contain no product state or provider wire events. */
export function happyAgentLiveBridgeCreate(options: {
    readonly client: () => HappyAgentLiveClient;
    readonly reserve?: (attempt: RendererLiveAttempt, host: HappyAgentLiveClient) => Promise<void>;
    readonly allowedOrigin?: () => string | undefined;
}) {
    const windows = new Map<string, symbol>();
    const attempts = new Map<string, LiveAttempt>();
    const sockets = new WebSocketServer({
        noServer: true,
        perMessageDeflate: false,
        maxPayload: HAPPY_AGENT_LIVE_MAX_WIRE_BYTES,
    });
    const key = (route: HappyAgentLiveRoute, id = route.id) => `${route.connectionId ?? ""}/${id}`;
    const owner = (request: IncomingMessage) => {
        const value = request.headers[HAPPY_AGENT_LIVE_WINDOW_HEADER];
        const lifetime = typeof value === "string" ? windows.get(value) : undefined;
        return typeof value === "string" && lifetime ? { windowId: value, lifetime } : undefined;
    };
    const attemptOwned = (route: HappyAgentLiveRoute, windowId: string) => {
        const attempt = attempts.get(key(route));
        return attempt && !attempt.disposed && attempt.windowId === windowId ? attempt : undefined;
    };
    const closeAttempt = (attempt: LiveAttempt) => {
        // First close covers a resource already reserved by an in-flight create.
        // Closing again after that attempt settles covers delayed reservation.
        const close = () =>
            happyAgentLiveAttemptClose(attempt.client, {
                id: attempt.id,
                windowId: attempt.windowId,
            });
        close();
        void attempt.creation.then(close, close);
        for (const socket of attempt.sockets) socket.terminate();
    };
    const windowClose = (windowId: string) => {
        windows.delete(windowId);
        for (const attempt of attempts.values()) {
            if (attempt.windowId !== windowId || attempt.disposed) continue;
            attempt.disposed = true;
            closeAttempt(attempt);
        }
    };
    return {
        windowStart(windowId: string) {
            if (!windows.has(windowId)) windows.set(windowId, Symbol());
        },
        windowClose,
        attemptRestore(ownership: RendererLiveAttempt, disposed: boolean) {
            const route = { ...ownership, action: "status" as const };
            if (attempts.has(key(route))) return;
            const host = options.client();
            const client = ownership.connectionId ? host.connection!(ownership.connectionId) : host;
            attempts.set(key(route), {
                ...ownership,
                client,
                creation: Promise.resolve(),
                disposed,
                sockets: new Set(),
            });
        },
        async handle(
            request: IncomingMessage,
            response: ServerResponse,
            url: URL,
        ): Promise<boolean> {
            if (!happyAgentLivePath(url.pathname)) return false;
            const route = happyAgentLiveRoute(url.pathname);
            const ownership = owner(request);
            if (!route || !ownership || url.search) {
                json(response, 403, { error: "This window cannot access GPT-Live." });
                return true;
            }
            const { windowId, lifetime } = ownership;
            let expectedId = route.id;
            try {
                if (route.action === "create" && request.method === "POST") {
                    const body: unknown = await bodyJson(request);
                    if (
                        !Value.Check(createLiveSessionRequestSchema, body) ||
                        !body.id ||
                        body.windowId !== windowId ||
                        body.context.windowId !== windowId
                    ) {
                        json(response, 400, {
                            error: "A caller-owned resource ID and this window's GPT-Live context are required.",
                        });
                        return true;
                    }
                    // Never replay creation, even after an ambiguous or unsuccessful response.
                    if (attempts.has(key(route, body.id as Cuid2))) {
                        json(response, 409, {
                            error: "This GPT-Live creation was already attempted. Read or close its resource.",
                        });
                        return true;
                    }
                    if (windows.get(windowId) !== lifetime) {
                        json(response, 403, { error: "The GPT-Live window has closed." });
                        return true;
                    }
                    const host = options.client();
                    if (route.connectionId && !host.connection) {
                        json(response, 501, { error: "Remote GPT-Live is unavailable." });
                        return true;
                    }
                    const client = route.connectionId ? host.connection!(route.connectionId) : host;
                    expectedId = body.id;
                    // Reserve locally before the one provider call. A renderer disconnect never retries it.
                    const resource = {
                        id: body.id as Cuid2,
                        windowId,
                        ...(route.connectionId ? { connectionId: route.connectionId } : {}),
                    };
                    let forwarded = false;
                    const creation = Promise.resolve().then(async () => {
                        await options.reserve?.(resource, host);
                        if (windows.get(windowId) !== lifetime)
                            throw new Error("The GPT-Live window has closed.");
                        forwarded = true;
                        return client.createLiveSession(body, AbortSignal.timeout(30_000));
                    });
                    const attempt: LiveAttempt = {
                        id: body.id as Cuid2,
                        windowId,
                        client,
                        creation: creation.then(
                            () => undefined,
                            () => undefined,
                        ),
                        disposed: false,
                        sockets: new Set(),
                    };
                    attempts.set(key(route, attempt.id), attempt);
                    response.once("close", () => {
                        if (!response.writableFinished) closeAttempt(attempt);
                    });
                    void creation.catch(() => {
                        if (forwarded)
                            happyAgentLiveAttemptClose(client, { id: attempt.id, windowId });
                    });
                    const result = await creation;
                    if (!sessionOwned(result.session, attempt)) {
                        attempt.disposed = true;
                        json(response, 403, {
                            error: "This window does not own that GPT-Live resource.",
                        });
                        return true;
                    }
                    if (!attempt.disposed) json(response, 201, result);
                    else json(response, 410, { error: "The GPT-Live window has closed." });
                    return true;
                }
                const attempt = attemptOwned(route, windowId);
                if (!attempt) {
                    json(response, 403, {
                        error: "This window does not own that GPT-Live resource.",
                    });
                    return true;
                }
                if (route.action === "status" && request.method === "GET") {
                    const result = await attempt.client.getLiveSession(
                        attempt.id,
                        AbortSignal.timeout(15_000),
                    );
                    if (sessionOwned(result.session, attempt)) json(response, 200, result);
                    else {
                        attempt.disposed = true;
                        json(response, 403, {
                            error: "This window does not own that GPT-Live resource.",
                        });
                    }
                } else if (route.action === "close" && request.method === "POST") {
                    const body: unknown = await bodyJson(request);
                    if (!Value.Check(closeLiveSessionRequestSchema, body)) {
                        json(response, 400, { error: "Invalid GPT-Live close request." });
                        return true;
                    }
                    const current = await attempt.client.getLiveSession(
                        attempt.id,
                        AbortSignal.timeout(15_000),
                    );
                    if (!sessionOwned(current.session, attempt)) {
                        attempt.disposed = true;
                        json(response, 403, {
                            error: "This window does not own that GPT-Live resource.",
                        });
                        return true;
                    }
                    // Leave the sideband alive for the renderer's bounded settlement grace.
                    const result = await attempt.client.closeLiveSession(
                        attempt.id,
                        body,
                        AbortSignal.timeout(15_000),
                    );
                    if (sessionOwned(result.session, attempt)) json(response, 200, result);
                    else {
                        attempt.disposed = true;
                        json(response, 403, {
                            error: "This window does not own that GPT-Live resource.",
                        });
                    }
                } else json(response, 405, { error: "Unsupported GPT-Live method." });
            } catch (error) {
                if (error instanceof HappyAgentApiError) {
                    const session = error.body?.session;
                    if (
                        session !== undefined &&
                        (!Value.Check(liveSessionSchema, session) ||
                            session.id !== expectedId ||
                            session.windowId !== windowId)
                    ) {
                        const attempt = expectedId
                            ? attempts.get(key(route, expectedId))
                            : undefined;
                        if (attempt) attempt.disposed = true;
                        json(response, 403, {
                            error: "This window does not own that GPT-Live resource.",
                        });
                    } else json(response, error.status, error.body ?? { error: error.message });
                } else if (error instanceof LiveRequestError)
                    json(response, error.status, { error: error.message });
                else json(response, 502, { error: "The GPT-Live request could not complete." });
            }
            return true;
        },
        /** Only authenticated, host-pinned virtual-origin requests enter this function. */
        upgrade(request: IncomingMessage, socket: Duplex, head: Buffer, url: URL): boolean {
            if (!happyAgentLivePath(url.pathname)) return false;
            const route = happyAgentLiveRoute(url.pathname);
            const windowId = owner(request)?.windowId;
            const keys = [...url.searchParams.keys()];
            const attempt = route && windowId ? attemptOwned(route, windowId) : undefined;
            if (
                request.method !== "GET" ||
                route?.action !== "control" ||
                !attempt ||
                !windowId ||
                !liveOriginAllowed(request.headers.origin, options.allowedOrigin?.()) ||
                request.headers["sec-websocket-protocol"] !== undefined ||
                keys.length !== 1 ||
                keys[0] !== "windowId" ||
                url.searchParams.get("windowId") !== windowId
            ) {
                rejectUpgrade(socket, 403);
                return true;
            }
            // Let ws validate the renderer handshake before opening a daemon attachment.
            sockets.handleUpgrade(request, socket, head, (renderer) => {
                renderer.pause();
                attempt.sockets.add(renderer);
                let daemon: WebSocket | undefined;
                const dispose = () => {
                    attempt.sockets.delete(renderer);
                    if (daemon) attempt.sockets.delete(daemon);
                    renderer.terminate();
                    daemon?.terminate();
                };
                renderer.once("close", dispose);
                renderer.once("error", dispose);
                void (async () => {
                    const current = await attempt.client.getLiveSession(
                        attempt.id,
                        AbortSignal.timeout(15_000),
                    );
                    if (!sessionOwned(current.session, attempt)) {
                        attempt.disposed = true;
                        dispose();
                        return;
                    }
                    daemon = await attempt.client.attachLiveSession(attempt.id, windowId);
                    if (
                        renderer.readyState !== WebSocket.OPEN ||
                        attempt.disposed ||
                        !windows.has(windowId)
                    ) {
                        dispose();
                        return;
                    }
                    attempt.sockets.add(daemon);
                    daemon.once("close", dispose);
                    daemon.once("error", dispose);
                    relay(renderer, daemon);
                    relay(daemon, renderer);
                    daemon.resume();
                    renderer.resume();
                })().catch(dispose);
            });
            return true;
        },
        close() {
            for (const windowId of windows.keys()) windowClose(windowId);
            for (const socket of sockets.clients) socket.terminate();
            sockets.close();
        },
    };
}

function liveOriginAllowed(origin: string | undefined, allowed: string | undefined): boolean {
    return (
        origin === undefined ||
        origin === "null" ||
        origin.startsWith("file:") ||
        origin === allowed
    );
}

/** Resolve an uncertain single attempt by its original ID, never by creating another call. */
export function happyAgentLiveAttemptClose(
    client: HappyAgentLiveClient,
    attempt: RendererLiveAttempt,
): void {
    const selected = attempt.connectionId ? client.connection!(attempt.connectionId) : client;
    const deadline = Date.now() + 30_000;
    const close = async (): Promise<void> => {
        try {
            const current = await selected.getLiveSession(attempt.id, AbortSignal.timeout(5_000));
            if (!sessionOwned(current.session, attempt)) return;
            await selected.closeLiveSession(attempt.id, {}, AbortSignal.timeout(5_000));
        } catch {
            if (Date.now() < deadline) {
                const timer = setTimeout(() => void close(), 1_000);
                timer.unref();
            }
        }
    };
    void close();
}

/** Daemon identity is authoritative, including when a caller ID existed before this host attempt. */
function sessionOwned(session: LiveSession, attempt: RendererLiveAttempt): boolean {
    return session.id === attempt.id && session.windowId === attempt.windowId;
}

/** Preserve text/binary frame identity and apply downstream backpressure without interpreting messages. */
function relay(source: WebSocket, destination: WebSocket): void {
    source.on("message", (data, isBinary) => {
        if (
            isBinary ||
            destination.readyState !== WebSocket.OPEN ||
            destination.bufferedAmount > 4 * HAPPY_AGENT_LIVE_MAX_WIRE_BYTES
        ) {
            source.terminate();
            destination.terminate();
            return;
        }
        source.pause();
        destination.send(data, { binary: isBinary }, (error) => {
            if (error) {
                source.terminate();
                destination.terminate();
            } else source.resume();
        });
    });
}

async function bodyJson(request: IncomingMessage): Promise<unknown> {
    if (
        request.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase() !==
        "application/json"
    )
        throw new LiveRequestError(415, "JSON content type required.");
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += bytes.length;
        if (size > 384 * 1024)
            throw new LiveRequestError(413, "The GPT-Live request is too large.");
        chunks.push(bytes);
    }
    try {
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
        throw new LiveRequestError(400, "Invalid GPT-Live JSON request.");
    }
}

class LiveRequestError extends Error {
    constructor(
        readonly status: number,
        message: string,
    ) {
        super(message);
    }
}

function json(response: ServerResponse, status: number, value: unknown): void {
    if (response.destroyed || response.headersSent) return;
    response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify(value));
}

function rejectUpgrade(socket: Duplex, status: number): void {
    if (socket.writable)
        socket.end(`HTTP/1.1 ${status} Request Rejected\r\nConnection: close\r\n\r\n`);
    else socket.destroy();
}
