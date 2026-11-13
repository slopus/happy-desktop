import {
    request as httpRequest,
    type IncomingHttpHeaders,
    type IncomingMessage,
    type ServerResponse,
} from "node:http";
import { pipeline } from "node:stream/promises";
import {
    HappyAgentDaemonClient,
    type HappyAgentRemoteAuthorization,
} from "../main/happyAgentDaemonClient";
import type { ServerRemoteCredential } from "../shared/serverRemoteAuthorization";
import { happyAgentProxyHandle } from "../main/happyAgentProxyHandle";
import { happyCloudConnectionOf, happyCloudForward } from "../main/happyCloudForward";
import {
    happyAgentRendererOrigin,
    happyAgentRendererProxyCreate,
    type HappyAgentRendererTarget,
} from "../main/happyAgentRendererProxy";
import { happyAgentRequestTimingCreate } from "../main/happyAgentRequestTiming";
import {
    happyAgentLiveBridgeCreate,
    type HappyAgentLiveClient,
} from "../main/happyAgentLiveBridge";
import type {
    RendererCloudSite,
    RendererUtilityInput,
    RendererUtilityOutput,
} from "../shared/happyAgentRendererUtilityContract";
import { happyCloudServerNameOf } from "../shared/happyCloud";

const LOCAL_ROUTES = new Set([
    "/open-in-targets",
    "/open-in",
    "/file-reveal",
    "/attachment",
    "/attachment-source-reachable",
    "/workspace-file-bytes",
    "/workspace-file-media",
    "/html-preview",
    "/artifact-site",
    "/vault-app",
    "/bridge-events",
    "/bridge-usb-attach",
    "/bridge-port-open",
    "/bridge-forward-open",
    "/bridge-close",
]);

/** Local-only desktop operations and terminal upgrades stay on the capability bridge. */
function localRoute(path: string): boolean {
    if (LOCAL_ROUTES.has(path)) return true;
    const remote = /^\/connections\/[a-z][a-z0-9_-]{0,63}(\/[^/]+)$/u.exec(path);
    return remote !== null && LOCAL_ROUTES.has(remote[1]!);
}

function localForward(
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
    bridgeUrl: string,
): void {
    const headers: IncomingHttpHeaders = { ...request.headers, host: new URL(bridgeUrl).host };
    delete headers["proxy-authorization"];
    delete headers["proxy-connection"];
    const outgoing = httpRequest(
        `${bridgeUrl}${url.pathname}${url.search}`,
        {
            method: request.method,
            headers,
        },
        (incoming) => {
            response.writeHead(incoming.statusCode ?? 502, incoming.headers);
            void pipeline(incoming, response).catch(() => response.destroy());
        },
    );
    outgoing.on("error", () => {
        if (response.headersSent) response.destroy();
        else response.writeHead(502, { "cache-control": "no-store" }).end();
    });
    request.once("aborted", () => outgoing.destroy());
    response.once("close", () => outgoing.destroy());
    request.pipe(outgoing);
}

const CLOUD_SITE_PATH = /^\/connections\/([a-z][a-z0-9_-]{0,63})\/(artifact-site|vault-app)$/u;

/**
 * The site a window asks a Happy Cloud connection's artifact or vault app to
 * be opened as, or why it named none; `undefined` for every other request.
 * Main opens these itself, so they need no Happy Agent on this computer.
 */
function cloudSiteOf(
    method: string | undefined,
    url: URL,
):
    | { readonly connectionId: string; readonly site: RendererCloudSite }
    | { readonly error: string }
    | undefined {
    const match = CLOUD_SITE_PATH.exec(url.pathname);
    if (method !== "GET" || !match || happyCloudServerNameOf(match[1]!) === undefined)
        return undefined;
    const value = (name: string): string | undefined => {
        const found = url.searchParams.get(name);
        return found === null || found.trim().length === 0 ? undefined : found;
    };
    const names =
        match[2] === "artifact-site"
            ? ["artifactId", "version"]
            : ["surfaceId", "fileId", "version"];
    const missing = names.find((name) => value(name) === undefined);
    if (missing !== undefined) return { error: `${missing} is required.` };
    const version = Number(value("version"));
    return {
        connectionId: match[1]!,
        site:
            match[2] === "artifact-site"
                ? { kind: "artifact", artifactId: value("artifactId")!, version }
                : {
                      kind: "vault",
                      surfaceId: value("surfaceId")!,
                      fileId: value("fileId")!,
                      version,
                  },
    };
}

/** The daemon a backing reaches, for the requests that need one. */
interface RendererDaemon {
    readonly id: number;
    readonly client: HappyAgentDaemonClient;
    readonly bridgeUrl: string;
}

function localUnavailable(response: ServerResponse): void {
    response
        .writeHead(503, { "content-type": "application/json", "cache-control": "no-store" })
        .end(
            JSON.stringify({
                error: "Happy Agent isn't running on this computer.",
                code: "local_unavailable",
            }),
        );
}

export async function happyAgentRendererUtilityServerCreate(
    send: (message: RendererUtilityOutput) => void,
    debugEnabled: boolean,
    /** The one cross-origin renderer allowed in while no daemon backs this transport. */
    daemonlessOrigin?: string,
) {
    const debug = debugEnabled ? (text: string) => send({ type: "debug", text }) : undefined;
    const proxy = await happyAgentRendererProxyCreate(debug, "transport");
    let detach: (() => void) | undefined;
    let activeId: number | undefined;
    let activeClient: HappyAgentDaemonClient | undefined;
    let allowedOrigin: string | undefined;
    let reservationId = 0;
    const backings = new WeakMap<HappyAgentLiveClient, number>();
    // Team-server access tokens from main, which keeps every refresh token.
    let remoteTokens: Readonly<Record<string, ServerRemoteCredential>> = {};
    let remoteRequestId = 0;
    const remoteRefreshes = new Map<
        number,
        (credential: ServerRemoteCredential | undefined) => void
    >();
    const remote: HappyAgentRemoteAuthorization = {
        credential: (connectionId) => remoteTokens[connectionId],
        refresh: (connectionId, rejected) =>
            new Promise((resolve) => {
                const requestId = ++remoteRequestId;
                remoteRefreshes.set(requestId, resolve);
                send({
                    type: "remote-refresh",
                    requestId,
                    connectionId,
                    ...(rejected === undefined ? {} : { rejected }),
                });
            }),
        signInRequire: (connectionId, rejected) =>
            send({ type: "remote-sign-in-required", connectionId, rejected }),
        serverMoved(connectionId, serverUrl) {
            // Stop sending it here at once; main ends the sign-in.
            if (remoteTokens[connectionId]?.serverUrl === serverUrl) {
                const { [connectionId]: _moved, ...rest } = remoteTokens;
                remoteTokens = rest;
            }
            send({ type: "remote-server-moved", connectionId, serverUrl });
        },
    };
    const reservations = new Map<
        number,
        { resolve(): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }
    >();
    let cloudSiteRequestId = 0;
    const cloudSiteRequests = new Map<number, ServerResponse>();
    const cloudSiteAnswer = (response: ServerResponse, status: number, body: unknown): void => {
        response
            .writeHead(status, { "content-type": "application/json", "cache-control": "no-store" })
            .end(JSON.stringify(body));
    };
    const live = happyAgentLiveBridgeCreate({
        client: () => {
            if (!activeClient) throw new Error("The GPT-Live daemon connection is unavailable.");
            return activeClient;
        },
        allowedOrigin: () => allowedOrigin,
        reserve: (attempt, host) =>
            new Promise<void>((resolve, reject) => {
                const id = ++reservationId;
                const timer = setTimeout(() => {
                    reservations.delete(id);
                    reject(new Error("Native Live ownership could not be registered."));
                }, 5_000);
                timer.unref();
                reservations.set(id, { resolve, reject, timer });
                const backingId = backings.get(host);
                if (backingId === undefined) {
                    clearTimeout(timer);
                    reservations.delete(id);
                    reject(new Error("The GPT-Live backing is unavailable."));
                    return;
                }
                send({ type: "live-attempt-reserve", reservationId: id, backingId, attempt });
            }),
    });
    /**
     * What answers while no daemon backs this transport, as on a computer that
     * only uses Happy Cloud: Happy Cloud's servers, which never go through a
     * Happy Agent, and a refusal for everything else.
     */
    const daemonless: HappyAgentRendererTarget = {
        // Never dialled: every upgrade is refused here first.
        url: happyAgentRendererOrigin,
        terminalCapability: "",
        upgradeHandle(_request, socket) {
            socket.end("HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n");
            return true;
        },
        requestHandle: (request, response, url) =>
            requestRoute(request, response, url, daemonlessOrigin, undefined),
    };
    const requestRoute = (
        request: IncomingMessage,
        response: ServerResponse,
        url: URL,
        allowedOrigin: string | undefined,
        daemon: RendererDaemon | undefined,
    ): void => {
        const path = url.pathname;
        const cloudSite = cloudSiteOf(request.method, url);
        if (!cloudSite && localRoute(path)) {
            if (daemon) localForward(request, response, url, daemon.bridgeUrl);
            else localUnavailable(response);
            return;
        }
        if (!cloudSite && path !== "/health" && path !== "/v0" && !path.startsWith("/v0/")) {
            response.writeHead(404, { "cache-control": "no-store" }).end();
            return;
        }
        const origin = request.headers.origin;
        const crossOrigin = allowedOrigin !== undefined && origin === allowedOrigin;
        if (
            origin !== undefined &&
            origin !== "null" &&
            !origin.startsWith("file:") &&
            !crossOrigin
        ) {
            response.writeHead(403).end();
            return;
        }
        if (crossOrigin) {
            response.setHeader("access-control-allow-origin", allowedOrigin);
            response.setHeader("access-control-expose-headers", "*");
            response.setHeader("vary", "origin");
        }
        if (request.method === "OPTIONS") {
            if (!crossOrigin) {
                response.writeHead(403).end();
                return;
            }
            const method = request.headers["access-control-request-method"]?.trim();
            const headers = request.headers["access-control-request-headers"]?.trim();
            response
                .writeHead(204, {
                    "access-control-allow-headers":
                        headers ||
                        "authorization, content-type, if-match, x-happy-agent-mutation-id",
                    "access-control-allow-methods": method
                        ? `${method}, OPTIONS`
                        : "DELETE, GET, HEAD, PATCH, POST, PUT, OPTIONS",
                    ...(request.headers["access-control-request-private-network"] === "true"
                        ? { "access-control-allow-private-network": "true" }
                        : {}),
                    "access-control-max-age": "600",
                })
                .end();
            return;
        }
        if (cloudSite) {
            if ("error" in cloudSite) {
                cloudSiteAnswer(response, 400, { error: cloudSite.error });
                return;
            }
            const requestId = ++cloudSiteRequestId;
            cloudSiteRequests.set(requestId, response);
            response.once("close", () => cloudSiteRequests.delete(requestId));
            send({ type: "cloud-site-open", requestId, ...cloudSite });
            return;
        }
        const cloud = happyCloudConnectionOf(path);
        if (cloud !== undefined) {
            happyCloudForward(request, response, url, remoteTokens[cloud]);
            return;
        }
        if (!daemon) {
            localUnavailable(response);
            return;
        }
        const onTiming = happyAgentRequestTimingCreate(response, debug);
        void live
            .handle(request, response, url)
            .then(
                (handled) =>
                    handled ||
                    happyAgentProxyHandle({
                        client: daemon.client,
                        method: request.method ?? "GET",
                        path,
                        query: url.searchParams,
                        request,
                        response,
                        ...(onTiming ? { onTiming } : {}),
                        onConnectionError: () => {
                            if (activeId === daemon.id)
                                send({ type: "unavailable", id: daemon.id });
                        },
                    }),
            )
            .then(
                (handled) => {
                    if (!handled && !response.headersSent) response.writeHead(404).end();
                },
                () => {
                    if (response.headersSent) response.destroy();
                    else response.writeHead(502, { "cache-control": "no-store" }).end();
                },
            );
    };
    await proxy.targetSet(daemonless);
    return {
        port: proxy.port,
        username: proxy.username,
        password: proxy.password,
        async receive(message: RendererUtilityInput): Promise<void> {
            if (message.type === "live-window-start") {
                live.windowStart(message.windowId);
                return;
            }
            if (message.type === "live-window-close") {
                live.windowClose(message.windowId);
                return;
            }
            if (message.type === "live-attempt-reserved") {
                const reservation = reservations.get(message.reservationId);
                if (reservation) {
                    clearTimeout(reservation.timer);
                    if (message.allowed) reservation.resolve();
                    else
                        reservation.reject(
                            new Error("The GPT-Live window no longer owns this attempt."),
                        );
                    reservations.delete(message.reservationId);
                }
                return;
            }
            if (message.type === "live-attempt-restore") {
                live.attemptRestore(message.attempt, message.disposed);
                return;
            }
            if (message.type === "remote-tokens") {
                remoteTokens = message.tokens;
                return;
            }
            if (message.type === "cloud-site-opened" || message.type === "cloud-site-refused") {
                const response = cloudSiteRequests.get(message.requestId);
                cloudSiteRequests.delete(message.requestId);
                if (!response || response.headersSent) return;
                if (message.type === "cloud-site-opened")
                    cloudSiteAnswer(response, 200, { url: message.url });
                else cloudSiteAnswer(response, message.status, { error: message.error });
                return;
            }
            if (message.type === "remote-refreshed") {
                const resolve = remoteRefreshes.get(message.requestId);
                remoteRefreshes.delete(message.requestId);
                resolve?.(message.credential);
                return;
            }
            if (message.type === "detach") {
                if (activeId === message.id) {
                    detach?.();
                    activeId = undefined;
                    detach = undefined;
                    activeClient = undefined;
                    await proxy.targetSet(daemonless);
                }
                return;
            }
            const client = new HappyAgentDaemonClient(message.transport, remote);
            const id = message.id;
            backings.set(client, id);
            const daemon = { id, client, bridgeUrl: message.bridgeUrl };
            const next = await proxy.targetSet({
                url: message.bridgeUrl,
                terminalCapability: message.terminalCapability,
                upgradeHandle: (request, socket, head, url) =>
                    live.upgrade(request, socket, head, url),
                requestHandle: (request, response, url) =>
                    requestRoute(request, response, url, message.allowedOrigin, daemon),
            });
            detach = next;
            activeId = id;
            activeClient = client;
            allowedOrigin = message.allowedOrigin;
            send({ type: "attached", id });
        },
        close(): void {
            live.close();
            for (const reservation of reservations.values()) {
                clearTimeout(reservation.timer);
                reservation.reject(new Error("The GPT-Live transport closed."));
            }
            reservations.clear();
            for (const resolve of remoteRefreshes.values()) resolve(undefined);
            remoteRefreshes.clear();
            cloudSiteRequests.clear();
            detach?.();
            proxy.close();
        },
    };
}
