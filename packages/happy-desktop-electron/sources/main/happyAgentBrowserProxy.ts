import { randomBytes } from "node:crypto";
import {
    Agent,
    createServer,
    request as httpRequest,
    type IncomingHttpHeaders,
    type IncomingMessage,
    type ServerResponse,
} from "node:http";
import type { AddressInfo, Socket } from "node:net";
import type { Duplex } from "node:stream";

export interface HappyAgentBrowserProxyHandle {
    readonly password: string;
    readonly port: number;
    readonly username: string;
    connectionsClose(): void;
    close(): void;
}

export interface HappyAgentBrowserProxyOptions {
    readonly openHttpProxy: () => Promise<Duplex>;
}

/**
 * Gives Chromium an ordinary authenticated loopback HTTP proxy and carries every
 * accepted request through one workspace-scoped Happy Agent proxy tunnel.
 */
export function happyAgentBrowserProxyCreate(
    options: HappyAgentBrowserProxyOptions,
): Promise<HappyAgentBrowserProxyHandle> {
    const username = randomBytes(24).toString("base64url");
    const password = randomBytes(32).toString("base64url");
    const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
    const sockets = new Set<Duplex>();
    let closed = false;
    let generation = 0;
    const connectionsClose = () => {
        generation += 1;
        for (const socket of sockets) socket.destroy();
        sockets.clear();
    };
    const openHttpProxy = async () => {
        const openingGeneration = generation;
        if (closed) throw new Error("The Happy Agent browser proxy is closed.");
        const tunnel = await options.openHttpProxy();
        if (closed || openingGeneration !== generation) {
            tunnel.destroy();
            throw new Error("The Happy Agent connection changed while opening the browser tunnel.");
        }
        return tunnel;
    };
    const server = createServer((request, response) => {
        if (!proxyAuthorized(request, authorization)) {
            proxyAuthenticationRequired(response);
            return;
        }
        void proxyRequest(openHttpProxy, request, response, sockets);
    });
    server.on("connect", (request, client, head) => {
        // An upgraded socket has left the HTTP server's own error handling, so it
        // must carry a handler from the first moment: Chromium abandoning a tunnel
        // fails the very next write with EPIPE/ECONNRESET, and an unhandled 'error'
        // here is an uncaught exception in the main process.
        client.on("error", () => client.destroy());
        if (!proxyAuthorized(request, authorization)) {
            client.end(
                'HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="Happy"\r\nConnection: close\r\n\r\n',
            );
            return;
        }
        void proxyConnect(openHttpProxy, request, client, head, sockets);
    });
    server.on("connection", (socket) => {
        sockets.add(socket);
        socket.once("close", () => sockets.delete(socket));
    });
    server.on("clientError", (_error, socket) => socket.destroy());

    return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
            server.removeListener("error", reject);
            const address = server.address() as AddressInfo;
            resolve({
                password,
                port: address.port,
                username,
                connectionsClose,
                close() {
                    closed = true;
                    connectionsClose();
                    server.close();
                },
            });
        });
    });
}

async function proxyRequest(
    openHttpProxy: () => Promise<Duplex>,
    request: IncomingMessage,
    response: ServerResponse,
    sockets: Set<Duplex>,
): Promise<void> {
    let tunnel: Duplex | undefined;
    try {
        tunnel = await openHttpProxy();
        sockets.add(tunnel);
        tunnel.on("error", () => tunnel?.destroy());
        tunnel.once("close", () => sockets.delete(tunnel!));
        const upstream = httpRequest(
            {
                agent: singleSocketAgent(tunnel),
                headers: forwardedHeaders(request.headers),
                method: request.method,
                path: request.url,
            },
            (upstreamResponse) => {
                response.writeHead(
                    upstreamResponse.statusCode ?? 502,
                    forwardedHeaders(upstreamResponse.headers),
                );
                upstreamResponse.on("error", () => tunnel?.destroy());
                upstreamResponse.pipe(response);
                upstreamResponse.once("end", () => tunnel?.destroy());
            },
        );
        upstream.once("error", (error) => {
            if (!response.headersSent) response.writeHead(502);
            response.end(error.message);
            tunnel?.destroy();
        });
        response.on("error", () => tunnel?.destroy());
        request.on("error", () => upstream.destroy());
        request.once("aborted", () => upstream.destroy());
        request.pipe(upstream);
    } catch (error) {
        tunnel?.destroy();
        if (!response.headersSent) response.writeHead(502);
        response.end(error instanceof Error ? error.message : "Happy Agent proxy unavailable.");
    }
}

async function proxyConnect(
    openHttpProxy: () => Promise<Duplex>,
    request: IncomingMessage,
    client: Duplex,
    head: Buffer,
    sockets: Set<Duplex>,
): Promise<void> {
    let tunnel: Duplex | undefined;
    try {
        tunnel = await openHttpProxy();
        sockets.add(tunnel);
        tunnel.on("error", () => tunnel?.destroy());
        tunnel.once("close", () => sockets.delete(tunnel!));
        const nested = httpRequest({
            agent: singleSocketAgent(tunnel),
            headers: { host: request.url ?? "" },
            method: "CONNECT",
            path: request.url,
        });
        nested.once("connect", (proxyResponse, upstream, proxyHead) => {
            if (proxyResponse.statusCode !== 200) {
                upstream.destroy();
                client.end(
                    `HTTP/1.1 ${String(proxyResponse.statusCode ?? 502)} Bad Gateway\r\nConnection: close\r\n\r\n`,
                );
                return;
            }
            sockets.add(upstream);
            upstream.once("close", () => sockets.delete(upstream));
            client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
            if (proxyHead.length > 0) client.write(proxyHead);
            if (head.length > 0) upstream.write(head);
            relay(client, upstream);
        });
        nested.once("response", (proxyResponse) => {
            proxyResponse.resume();
            client.end("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n");
            tunnel?.destroy();
        });
        nested.once("error", () => {
            client.end("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n");
            tunnel?.destroy();
        });
        nested.end();
    } catch {
        tunnel?.destroy();
        client.end("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n");
    }
}

/**
 * Carries bytes both ways between a browser socket and its tunneled upstream and
 * treats a failure on either side as an ordinary end of tunnel. Only one end of a
 * CONNECT tunnel needs to disappear for the relayed write to the other to fail,
 * which is normal browsing, not a proxy fault worth crashing over.
 */
function relay(first: Duplex, second: Duplex): void {
    first.on("error", () => second.destroy());
    second.on("error", () => first.destroy());
    first.pipe(second);
    second.pipe(first);
}

function proxyAuthorized(request: IncomingMessage, authorization: string): boolean {
    return request.headers["proxy-authorization"] === authorization;
}

function proxyAuthenticationRequired(response: ServerResponse): void {
    response.writeHead(407, {
        connection: "close",
        "proxy-authenticate": 'Basic realm="Happy"',
    });
    response.end();
}

function forwardedHeaders(headers: IncomingHttpHeaders): Record<string, string | string[]> {
    const forwarded: Record<string, string | string[]> = {};
    for (const [name, value] of Object.entries(headers)) {
        if (
            value === undefined ||
            name.toLowerCase() === "proxy-authorization" ||
            name.toLowerCase() === "proxy-connection"
        )
            continue;
        forwarded[name] = typeof value === "number" ? String(value) : value;
    }
    return forwarded;
}

function singleSocketAgent(socket: Duplex): Agent {
    const agent = new Agent({ keepAlive: false });
    agent.createConnection = () => socket as Socket;
    return agent;
}
