import { randomBytes } from "node:crypto";
import {
    createServer,
    request as httpRequest,
    type IncomingHttpHeaders,
    type IncomingMessage,
    type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import type { Duplex } from "node:stream";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { HAPPY_AGENT_TERMINAL_CAPABILITY_PROTOCOL_PREFIX } from "./happyAgentTerminalBridge";
import type { HappyAgentDaemonClientOptions } from "./happyAgentDaemonClient";
import type { RendererLiveAttempt } from "../shared/happyAgentRendererUtilityContract";

export const happyAgentRendererOrigin = "http://happy-agent";

export interface HappyAgentRendererTarget {
    readonly url: string;
    readonly terminalCapability: string;
    /** HTTP stays on this connection; only terminal upgrades use the loopback bridge. */
    readonly requestHandle: (request: IncomingMessage, response: ServerResponse, url: URL) => void;
    readonly transport?: HappyAgentDaemonClientOptions;
    readonly onConnectionError?: () => void;
    readonly allowedOrigin?: string;
    readonly liveWindowStart?: (windowId: string) => void;
    readonly liveWindowClose?: (windowId: string) => void;
    readonly upgradeHandle?: (
        request: IncomingMessage,
        socket: Duplex,
        head: Buffer,
        url: URL,
    ) => boolean;
    /** Main retains attempted IDs before the utility may forward creation. */
    readonly liveAttemptClose?: (attempt: RendererLiveAttempt) => void;
}

export interface HappyAgentRendererProxy {
    readonly port: number;
    readonly username: string;
    readonly password: string;
    /** Installs a backing without changing the renderer's URL or cache keys. */
    targetSet(target: HappyAgentRendererTarget): Promise<() => void>;
    liveWindowStart?(windowId: string): void;
    liveWindowClose?(windowId: string): void;
    close(): void;
}

/**
 * An authenticated HTTP forward proxy for exactly one virtual origin. Chromium
 * retains the original URL for its HTTP cache; no redirect exposes the ephemeral
 * loopback address or capability. Electron owns the credentials and restricts
 * requests to trusted renderer frames before they reach this proxy.
 *
 * CONNECT is restricted to happy-agent:80. Chromium uses it for WebSockets; the
 * tunnel terminates at our own HTTP parser, never at an arbitrary network host.
 */
export function happyAgentRendererProxyCreate(
    debug?: (message: string) => void,
    eventLoopName = "main",
): Promise<HappyAgentRendererProxy> {
    const username = randomBytes(24).toString("base64url");
    const password = randomBytes(32).toString("base64url");
    const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
    const sockets = new Set<Duplex>();
    let target: HappyAgentRendererTarget | undefined;

    const socketHold = (socket: Duplex) => {
        sockets.add(socket);
        socket.once("close", () => sockets.delete(socket));
        socket.on("error", () => socket.destroy());
    };
    const route = (request: IncomingMessage): URL | undefined => {
        try {
            const url = new URL(request.url ?? "/", happyAgentRendererOrigin);
            if (
                url.origin !== happyAgentRendererOrigin ||
                url.username ||
                url.password ||
                url.hash ||
                (request.headers.host !== "happy-agent" &&
                    request.headers.host !== "happy-agent:80")
            )
                return undefined;
            return url;
        } catch {
            return undefined;
        }
    };
    const headers = (request: IncomingMessage, backing: HappyAgentRendererTarget) => {
        const forwarded: IncomingHttpHeaders = {
            ...request.headers,
            host: new URL(backing.url).host,
        };
        delete forwarded["proxy-authorization"];
        delete forwarded["proxy-connection"];
        const protocols = request.headers["sec-websocket-protocol"];
        forwarded["sec-websocket-protocol"] = [
            ...(typeof protocols === "string"
                ? protocols.split(",").map((value) => value.trim())
                : []),
            `${HAPPY_AGENT_TERMINAL_CAPABILITY_PROTOCOL_PREFIX}${backing.terminalCapability}`,
        ].join(", ");
        return forwarded;
    };
    const handle = (request: IncomingMessage, response: ServerResponse, authenticated: boolean) => {
        const url = route(request);
        if (!url) {
            response.writeHead(403).end();
            return;
        }
        if (!authenticated && request.headers["proxy-authorization"] !== authorization) {
            response
                .writeHead(407, {
                    "proxy-authenticate": 'Basic realm="Happy Agent"',
                    connection: "close",
                })
                .end();
            return;
        }
        const backing = target;
        if (!backing) {
            response.writeHead(503, { "cache-control": "no-store" }).end();
            return;
        }
        backing.requestHandle(request, response, url);
    };
    const forwardUpgrade = (
        request: IncomingMessage,
        socket: Duplex,
        head: Buffer,
        backing: HappyAgentRendererTarget,
        url: URL,
    ) => {
        const upstream = httpRequest(`${backing.url}${url.pathname}${url.search}`, {
            headers: headers(request, backing),
        });
        upstream.once("upgrade", (incoming, remote, remoteHead) => {
            socketHold(remote);
            if (socket.destroyed) {
                remote.destroy();
                return;
            }
            socket.write(
                `HTTP/1.1 ${String(incoming.statusCode)} ${incoming.statusMessage ?? ""}\r\n`,
            );
            for (let index = 0; index < incoming.rawHeaders.length; index += 2)
                socket.write(
                    `${incoming.rawHeaders[index]}: ${incoming.rawHeaders[index + 1]}\r\n`,
                );
            socket.write("\r\n");
            if (remoteHead.length) socket.write(remoteHead);
            if (head.length) remote.write(head);
            socket.once("close", () => remote.destroy());
            remote.once("close", () => socket.destroy());
            socket.pipe(remote);
            remote.pipe(socket);
        });
        upstream.once("response", (incoming) => {
            incoming.resume();
            socket.end(
                `HTTP/1.1 ${String(incoming.statusCode ?? 502)} Request Rejected\r\nConnection: close\r\n\r\n`,
            );
        });
        upstream.once("error", () => socket.destroy());
        socket.once("close", () => upstream.destroy());
        upstream.end();
    };
    const upgrade = (
        request: IncomingMessage,
        socket: Duplex,
        head: Buffer,
        authenticated: boolean,
    ) => {
        socketHold(socket);
        const url = route(request);
        if (!url) {
            socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
            return;
        }
        if (!authenticated && request.headers["proxy-authorization"] !== authorization) {
            socket.end(
                'HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="Happy Agent"\r\nConnection: close\r\n\r\n',
            );
            return;
        }
        const backing = target;
        if (!backing) {
            socket.end("HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n");
            return;
        }
        if (!backing.upgradeHandle?.(request, socket, head, url))
            forwardUpgrade(request, socket, head, backing, url);
    };
    const server = createServer((request, response) => handle(request, response, false));
    // This parser has no listening port; only authenticated CONNECT sockets enter.
    const tunnels = createServer((request, response) => handle(request, response, true));
    server.on("connection", socketHold);
    server.on("clientError", (_error, socket) => socket.destroy());
    tunnels.on("clientError", (_error, socket) => socket.destroy());
    server.on("upgrade", (request, socket, head) => upgrade(request, socket, head, false));
    tunnels.on("upgrade", (request, socket, head) => upgrade(request, socket, head, true));
    server.on("connect", (request, socket, head) => {
        if (request.url !== "happy-agent:80") {
            socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
            return;
        }
        if (request.headers["proxy-authorization"] !== authorization) {
            socket.end(
                'HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="Happy Agent"\r\nConnection: close\r\n\r\n',
            );
            return;
        }
        socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length) socket.unshift(head);
        tunnels.emit("connection", socket);
    });
    // Only enable sampling in debug mode. The histogram reports the actual JS
    // scheduling gap, independently of request/network timing.
    const eventLoop = debug ? monitorEventLoopDelay({ resolution: 10 }) : undefined;
    eventLoop?.enable();
    const interval =
        eventLoop &&
        setInterval(() => {
            const maximumMs = eventLoop.max / 1e6;
            if (maximumMs >= 100)
                debug?.(
                    `Happy Agent ${eventLoopName} event-loop stall max=${maximumMs.toFixed(0)}ms`,
                );
            eventLoop.reset();
        }, 10_000);
    interval?.unref();
    return new Promise((resolve, reject) => {
        const listenError = (error: Error) => {
            if (interval) clearInterval(interval);
            eventLoop?.disable();
            reject(error);
        };
        server.once("error", listenError);
        server.listen(0, "127.0.0.1", () => {
            server.off("error", listenError);
            resolve({
                port: (server.address() as AddressInfo).port,
                username,
                password,
                async targetSet(next) {
                    target = next;
                    return () => {
                        if (target === next) target = undefined;
                    };
                },
                liveWindowStart(windowId) {
                    target?.liveWindowStart?.(windowId);
                },
                liveWindowClose(windowId) {
                    target?.liveWindowClose?.(windowId);
                },
                close() {
                    target = undefined;
                    if (interval) clearInterval(interval);
                    eventLoop?.disable();
                    for (const socket of sockets) socket.destroy();
                    sockets.clear();
                    server.close();
                },
            });
        });
    });
}
