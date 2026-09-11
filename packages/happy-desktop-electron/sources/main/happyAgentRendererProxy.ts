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
import { HAPPY_AGENT_TERMINAL_CAPABILITY_PROTOCOL_PREFIX } from "./happyAgentTerminalBridge";

export const happyAgentRendererOrigin = "http://happy-agent";

export interface HappyAgentRendererTarget {
    readonly url: string;
    readonly terminalCapability: string;
}

export interface HappyAgentRendererProxy {
    readonly port: number;
    readonly username: string;
    readonly password: string;
    /** Installs a backing without changing the renderer's URL or cache keys. */
    targetSet(target: HappyAgentRendererTarget): () => void;
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
export function happyAgentRendererProxyCreate(): Promise<HappyAgentRendererProxy> {
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
    const headers = (
        request: IncomingMessage,
        backing: HappyAgentRendererTarget,
        upgrade: boolean,
    ) => {
        const forwarded: IncomingHttpHeaders = {
            ...request.headers,
            host: new URL(backing.url).host,
        };
        delete forwarded["proxy-authorization"];
        delete forwarded["proxy-connection"];
        if (upgrade) {
            const protocols = request.headers["sec-websocket-protocol"];
            forwarded["sec-websocket-protocol"] = [
                ...(typeof protocols === "string"
                    ? protocols.split(",").map((value) => value.trim())
                    : []),
                `${HAPPY_AGENT_TERMINAL_CAPABILITY_PROTOCOL_PREFIX}${backing.terminalCapability}`,
            ].join(", ");
        }
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
        const upstream = httpRequest(
            `${backing.url}${url.pathname}${url.search}`,
            {
                method: request.method,
                headers: headers(request, backing, false),
            },
            (incoming) => {
                response.writeHead(incoming.statusCode ?? 502, incoming.headers);
                incoming.on("error", () => response.destroy());
                incoming.pipe(response);
            },
        );
        upstream.on("error", () => {
            if (response.headersSent) response.destroy();
            else response.writeHead(502, { "cache-control": "no-store" }).end();
        });
        request.once("aborted", () => upstream.destroy());
        request.on("error", () => upstream.destroy());
        response.once("close", () => upstream.destroy());
        request.pipe(upstream);
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
        const upstream = httpRequest(`${backing.url}${url.pathname}${url.search}`, {
            headers: headers(request, backing, true),
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
    return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
            server.removeListener("error", reject);
            resolve({
                port: (server.address() as AddressInfo).port,
                username,
                password,
                targetSet(next) {
                    target = next;
                    return () => {
                        if (target === next) target = undefined;
                    };
                },
                close() {
                    target = undefined;
                    for (const socket of sockets) socket.destroy();
                    sockets.clear();
                    server.close();
                },
            });
        });
    });
}
