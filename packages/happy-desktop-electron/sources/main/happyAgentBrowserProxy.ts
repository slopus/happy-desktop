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
    /**
     * The most recent failure of a tunnel to `url`'s host and port in this
     * profile since `since`, in the daemon's or the agent's own words. Chromium
     * reports every refused tunnel as the same bare engine error.
     */
    tunnelFailure(url: string, since: number): string | undefined;
    /** Ends the kept connections no request is using, giving their tunnels back. */
    idleClose(): void;
    connectionsClose(): void;
    close(): void;
}

export interface HappyAgentBrowserProxyOptions {
    readonly openHttpProxy: (signal: AbortSignal) => Promise<Duplex>;
    /**
     * Keep plain `http://` connections open between requests: each one is a
     * tunnel holding a nested `CONNECT` to its destination, with keep-alive
     * HTTP inside, up to `POOL_SOCKETS` per destination. For a network whose
     * tunnels are counted and limited, so a page of many requests opens a few
     * tunnels instead of one each. Otherwise every request opens its own.
     */
    readonly pooled?: boolean;
}

/** Kept-alive connections to one destination, as a browser keeps to one host. */
const POOL_SOCKETS = 6;
/**
 * How long a kept connection may sit unused. Below the 60 seconds after which
 * a Happy Cloud server ends an idle tunnel, so one is never reused after the
 * server has let it go.
 */
const POOL_IDLE_MS = 50_000;

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
    const operations = new Set<AbortController>();
    const failures = new Map<string, { readonly at: number; readonly message: string }>();
    const failureRecord: TunnelFailureRecord = (authority, startedAt, message) => {
        failures.delete(authority);
        failures.set(authority, { at: startedAt, message });
        // The newest few are what a failed page can ask about.
        for (const key of failures.keys()) {
            if (failures.size <= 64) break;
            failures.delete(key);
        }
    };
    let closed = false;
    let generation = 0;
    const pools = new Map<string, Pool>();
    const connectionsClose = () => {
        generation += 1;
        for (const pool of pools.values()) pool.agent.destroy();
        pools.clear();
        for (const operation of operations) operation.abort();
        for (const socket of sockets) socket.destroy();
        sockets.clear();
    };
    const openHttpProxy = async (signal: AbortSignal) => {
        const openingGeneration = generation;
        if (closed) throw new Error("The Happy Agent browser proxy is closed.");
        const controller = new AbortController();
        operations.add(controller);
        try {
            const openingSignal = AbortSignal.any([
                signal,
                controller.signal,
                AbortSignal.timeout(10_000),
            ]);
            openingSignal.throwIfAborted();
            const tunnel = await options.openHttpProxy(openingSignal);
            if (closed || openingGeneration !== generation || openingSignal.aborted) {
                tunnel.destroy();
                throw new Error(
                    "The Happy Agent connection changed while opening the browser tunnel.",
                );
            }
            return tunnel;
        } finally {
            operations.delete(controller);
        }
    };
    // A page may upload or stream for as long as it likes; only a request whose
    // headers never finish arriving is cut off. Node derives the headers limit
    // from the request limit, so it is named here or it would vanish with it.
    const server = createServer(
        { requestTimeout: 0, headersTimeout: 60_000 },
        (request, response) => {
            if (!proxyAuthorized(request, authorization)) {
                proxyAuthenticationRequired(response);
                return;
            }
            if (options.pooled) proxyPooledRequest(poolGet, request, response);
            else void proxyRequest(openHttpProxy, request, response, sockets);
        },
    );
    const poolGet = (authority: string): Pool => {
        const existing = pools.get(authority);
        if (existing) return existing;
        const agent = new Agent({
            keepAlive: true,
            maxSockets: POOL_SOCKETS,
            maxFreeSockets: POOL_SOCKETS,
            timeout: POOL_IDLE_MS,
            scheduling: "lifo",
        });
        // Node takes a connection created later through the callback.
        (
            agent as unknown as {
                createConnection: (
                    options: { readonly timeout?: number },
                    created: (error: Error | null, socket?: Duplex) => void,
                ) => undefined;
            }
        ).createConnection = (connection, created) => {
            void nestedOpen(openHttpProxy, authority, sockets).then(
                (socket) => {
                    (socket as Socket).setTimeout?.(connection.timeout ?? POOL_IDLE_MS);
                    created(null, socket);
                },
                (error: unknown) =>
                    created(error instanceof Error ? error : new Error(String(error))),
            );
            return undefined;
        };
        const pool = { agent, slots: new PoolSlots(POOL_SOCKETS) };
        pools.set(authority, pool);
        return pool;
    };
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
        void proxyConnect(openHttpProxy, request, client, head, sockets, failureRecord);
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
                tunnelFailure(url, since) {
                    const authority = tunnelAuthority(url);
                    const failure = authority === undefined ? undefined : failures.get(authority);
                    return failure && failure.at >= since ? failure.message : undefined;
                },
                idleClose() {
                    for (const pool of pools.values())
                        for (const free of Object.values(pool.agent.freeSockets))
                            for (const socket of free ?? []) socket.destroy();
                },
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
    openHttpProxy: (signal: AbortSignal) => Promise<Duplex>,
    request: IncomingMessage,
    response: ServerResponse,
    sockets: Set<Duplex>,
): Promise<void> {
    const controller = new AbortController();
    let tunnel: Duplex | undefined;
    response.once("close", () => {
        controller.abort();
        tunnel?.destroy();
    });
    request.once("aborted", () => controller.abort());
    try {
        tunnel = await openHttpProxy(controller.signal);
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
                // A body cut short leaves Chromium waiting for the rest of it;
                // failing the response is what tells it the page broke off.
                upstreamResponse.once("close", () => {
                    if (!upstreamResponse.complete) response.destroy();
                });
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
    openHttpProxy: (signal: AbortSignal) => Promise<Duplex>,
    request: IncomingMessage,
    client: Duplex,
    head: Buffer,
    sockets: Set<Duplex>,
    failureRecord: TunnelFailureRecord,
): Promise<void> {
    const controller = new AbortController();
    const authority = request.url ?? "";
    const startedAt = Date.now();
    const refuse = (status: number, message: string) => {
        failureRecord(authority, startedAt, message);
        client.end(`HTTP/1.1 ${String(status)} Bad Gateway\r\nConnection: close\r\n\r\n`);
    };
    let tunnel: Duplex | undefined;
    client.once("close", () => {
        controller.abort();
        tunnel?.destroy();
    });
    try {
        tunnel = await openHttpProxy(controller.signal);
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
                refuse(
                    proxyResponse.statusCode ?? 502,
                    `The agent's network could not open ${authority} (${String(proxyResponse.statusCode)}${proxyResponse.statusMessage ? ` ${proxyResponse.statusMessage}` : ""}).`,
                );
                return;
            }
            // Either side may finish sending while the other still has bytes to
            // deliver. Left at its default, the tunnel would end its own writes on
            // the origin's FIN and drop the rest of the browser's data.
            upstream.allowHalfOpen = true;
            sockets.add(upstream);
            upstream.once("close", () => sockets.delete(upstream));
            client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
            if (proxyHead.length > 0) client.write(proxyHead);
            if (head.length > 0) upstream.write(head);
            relay(client, upstream);
        });
        nested.once("response", (proxyResponse) => {
            proxyResponse.resume();
            refuse(
                502,
                `The agent's network answered ${authority} without opening it (${String(proxyResponse.statusCode)}).`,
            );
            tunnel?.destroy();
        });
        nested.once("error", (error) => {
            refuse(
                502,
                `The agent's network closed before opening ${authority} (${error.message}).`,
            );
            tunnel?.destroy();
        });
        nested.end();
    } catch (error) {
        tunnel?.destroy();
        refuse(
            502,
            error instanceof Error ? error.message : "The Happy Agent browser tunnel failed.",
        );
    }
}

/**
 * Carries one plain `http://` request over a kept-alive connection to its
 * destination. A request that fails on a connection kept from before, with no
 * answer yet, is sent once more on a new one when it can be: the connection
 * may have been ended while it sat unused.
 */
/** Kept connections to one destination, and the requests allowed on them at once. */
interface Pool {
    readonly agent: Agent;
    readonly slots: PoolSlots;
}

/**
 * Turns for requests to one destination. Node's agent does not count a
 * connection it is still opening, so a burst of requests would each open one;
 * holding requests to as many as there may be connections keeps it to that.
 */
class PoolSlots {
    #busy = 0;
    readonly #waiting: (() => void)[] = [];

    constructor(private readonly size: number) {}

    take(): Promise<() => void> {
        return new Promise((resolve) => {
            const grant = () => {
                this.#busy += 1;
                let released = false;
                resolve(() => {
                    if (released) return;
                    released = true;
                    this.#busy -= 1;
                    this.#waiting.shift()?.();
                });
            };
            if (this.#busy < this.size) grant();
            else this.#waiting.push(grant);
        });
    }
}

function proxyPooledRequest(
    poolGet: (authority: string) => Pool,
    request: IncomingMessage,
    response: ServerResponse,
): void {
    let target: URL;
    try {
        target = new URL(request.url ?? "");
    } catch {
        response.writeHead(400).end();
        return;
    }
    if (target.protocol !== "http:") {
        response.writeHead(400).end();
        return;
    }
    const port = target.port || "80";
    const authority = `${target.hostname}:${port}`;
    const bodiless =
        request.headers["content-length"] === undefined &&
        request.headers["transfer-encoding"] === undefined;
    const replayable = bodiless && ["GET", "HEAD", "OPTIONS"].includes(request.method ?? "GET");
    const pool = poolGet(authority);
    const send = (again: boolean): void => {
        let answered = false;
        const upstream = httpRequest(
            {
                agent: pool.agent,
                host: target.hostname.replace(/^\[(.*)\]$/u, "$1"),
                port: Number(port),
                headers: forwardedHeaders(request.headers),
                method: request.method,
                path: `${target.pathname}${target.search}`,
            },
            (upstreamResponse) => {
                answered = true;
                response.writeHead(
                    upstreamResponse.statusCode ?? 502,
                    forwardedHeaders(upstreamResponse.headers),
                );
                upstreamResponse.once("close", () => {
                    if (!upstreamResponse.complete) response.destroy();
                });
                upstreamResponse.pipe(response);
            },
        );
        upstream.once("error", (error) => {
            if (!answered && !again && replayable && upstream.reusedSocket) {
                send(true);
                return;
            }
            if (!response.headersSent) response.writeHead(502);
            response.end(error.message);
        });
        response.once("close", () => {
            if (!response.writableFinished) upstream.destroy();
        });
        if (bodiless) {
            request.resume();
            upstream.end();
        } else {
            request.on("error", () => upstream.destroy());
            request.pipe(upstream);
        }
    };
    void pool.slots.take().then((release) => {
        if (response.destroyed || response.writableFinished) {
            release();
            return;
        }
        response.once("close", release);
        send(false);
    });
}

/**
 * Opens a tunnel holding a nested `CONNECT` to `authority`, resolving with the
 * stream into the destination.
 */
async function nestedOpen(
    openHttpProxy: (signal: AbortSignal) => Promise<Duplex>,
    authority: string,
    sockets: Set<Duplex>,
): Promise<Duplex> {
    const tunnel = await openHttpProxy(AbortSignal.timeout(10_000));
    sockets.add(tunnel);
    tunnel.once("close", () => sockets.delete(tunnel));
    tunnel.on("error", () => tunnel.destroy());
    return await new Promise<Duplex>((resolve, reject) => {
        const failed = (message: string) => {
            tunnel.destroy();
            reject(new Error(message));
        };
        const nested = httpRequest({
            agent: singleSocketAgent(tunnel),
            headers: { host: authority },
            method: "CONNECT",
            path: authority,
        });
        nested.once("connect", (answer, upstream, head) => {
            if (answer.statusCode !== 200) {
                failed(
                    `The agent's network could not open ${authority} (${String(answer.statusCode)}).`,
                );
                return;
            }
            if (head.length > 0) upstream.unshift(head);
            resolve(upstream);
        });
        nested.once("response", (answer) => {
            answer.resume();
            failed(
                `The agent's network answered ${authority} without opening it (${String(answer.statusCode)}).`,
            );
        });
        nested.once("error", (error) =>
            failed(`The agent's network closed before opening ${authority} (${error.message}).`),
        );
        nested.end();
    });
}

/** Notes why one tunnel to `authority` failed, stamped with when it was asked for. */
type TunnelFailureRecord = (authority: string, startedAt: number, message: string) => void;

/** `host:port` as Chromium names a tunnel target, from a page address. */
function tunnelAuthority(url: string): string | undefined {
    try {
        const parsed = new URL(url);
        const port =
            parsed.port ||
            (parsed.protocol === "https:" || parsed.protocol === "wss:" ? "443" : "80");
        return `${parsed.hostname}:${port}`;
    } catch {
        return undefined;
    }
}

/**
 * Carries bytes both ways between a browser socket and its tunneled upstream and
 * treats a failure on either side as an ordinary end of tunnel. Only one end of a
 * CONNECT tunnel needs to disappear for the relayed write to the other to fail,
 * which is normal browsing, not a proxy fault worth crashing over.
 *
 * A side that ends cleanly may still have bytes queued for the other — often the
 * tail of a response — so the other is ended, and destroyed only once those are
 * written. A side that fails or is torn down takes the other with it at once.
 */
export function relay(first: Duplex, second: Duplex): void {
    first.on("error", () => second.destroy());
    second.on("error", () => first.destroy());
    relayClose(first, second);
    relayClose(second, first);
    first.pipe(second);
    second.pipe(first);
}

/** How long a cleanly ended tunnel waits for its other side to take the rest. */
const RELAY_DRAIN_MS = 30_000;

function relayClose(from: Duplex, to: Duplex): void {
    from.once("close", () => {
        if (to.destroyed) return;
        if (from.errored || !from.readableEnded || to.writableFinished) {
            to.destroy();
            return;
        }
        // A peer that stops reading must not hold the socket forever.
        const timer = setTimeout(() => to.destroy(), RELAY_DRAIN_MS);
        timer.unref();
        to.once("finish", () => {
            clearTimeout(timer);
            to.destroy();
        });
        to.once("close", () => clearTimeout(timer));
        to.end();
    });
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
            name.toLowerCase() === "proxy-connection" ||
            name.toLowerCase() === "proxy-authenticate"
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
