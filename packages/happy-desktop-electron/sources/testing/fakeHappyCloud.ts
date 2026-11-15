import { randomBytes, randomUUID } from "node:crypto";
import {
    createServer,
    request as httpRequest,
    type IncomingMessage,
    type ServerResponse,
} from "node:http";
import { connect, type AddressInfo, type Socket } from "node:net";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";

/**
 * A Happy Cloud server as the workspace browser meets it, for tests: the
 * agent's network answer, and the network tunnel's WebSocket twin with a
 * forwarding HTTP proxy behind it that opens connections from this machine.
 * Like a cluster behind an ordinary ingress, it does not carry `CONNECT`.
 *
 * The agent's network stays the same for its whole life, while its compute
 * comes and goes: released, every answer is `409 no_compute`; offline, every
 * answer is `503 compute_offline`, and the tunnels already open close with
 * `1001 compute_offline`. Lost, the compute has stopped answering before the
 * cloud has noticed: tunnels still open and stay open, but whatever they ask
 * for is refused with `503 compute_offline`, as a nested `CONNECT` is in the
 * first minute after a computer goes away. A `legacy` cloud answers as
 * clusters did before those codes: `503 runner_unavailable`, and an
 * unexplained `1008`.
 *
 * Tunnels are limited per user as the cluster limits them: so many open at
 * once and so many opened a minute, refused with `429 too_many_tunnels`. A
 * tunnel that carries no bytes for too long closes, and so does one open too
 * long, with an unexplained `1008`.
 */
export interface FakeHappyCloud {
    /** The server's address, with a trailing slash. */
    readonly url: string;
    /** The only bearer token it admits. */
    readonly token: string;
    /** The network the agent's traffic leaves from. */
    readonly networkId: string;
    /** Tunnels admitted so far. */
    tunnelsOpened(): number;
    /** Tunnels open now. */
    tunnelsLive(): number;
    computeRelease(): void;
    computeOffline(): void;
    computeLost(): void;
    computeAttach(): void;
    close(): Promise<void>;
}

export interface FakeHappyCloudOptions {
    readonly legacy?: boolean;
    readonly tunnelsConcurrent?: number;
    readonly tunnelsPerMinute?: number;
    readonly tunnelIdleMs?: number;
    readonly tunnelLifetimeMs?: number;
    /** How one tunnel carries its traffic; one byte stream unless replaced. */
    readonly session?: (context: FakeHappyCloudSessionContext) => void;
}

/** One admitted tunnel, for the session that carries its traffic. */
export interface FakeHappyCloudSessionContext {
    readonly websocket: WebSocket;
    /** Opens a connection into the forwarding proxy behind the cloud. */
    forwardOpen(): Socket;
    /** Marks the tunnel as in use, putting off its idle close. */
    used(): void;
}

type Compute = "attached" | "released" | "offline" | "lost";

interface Refusal {
    readonly status: number;
    readonly error: string;
    readonly code: string;
}

/** The cluster's twin frames: one message is at most 1 MiB. */
const TWIN_MAX_MESSAGE = 1024 * 1024;

export async function fakeHappyCloudStart(
    options: FakeHappyCloudOptions = {},
): Promise<FakeHappyCloud> {
    const token = randomBytes(24).toString("base64url");
    const network = randomUUID();
    const concurrent = options.tunnelsConcurrent ?? 8;
    const perMinute = options.tunnelsPerMinute ?? 32;
    const idleMs = options.tunnelIdleMs ?? 60_000;
    const lifetimeMs = options.tunnelLifetimeMs ?? 60 * 60_000;
    const session = options.session ?? fakeHappyCloudStreamSession;
    let compute: Compute = "attached";
    let opened = 0;
    const openings: number[] = [];
    const live = new Set<WebSocket>();
    const forward = await forwardProxyStart(() =>
        compute === "lost"
            ? { status: 503, error: "The agent's computer is offline.", code: "compute_offline" }
            : undefined,
    );

    const json = (response: ServerResponse, status: number, body: unknown): void => {
        response
            .writeHead(status, { "content-type": "application/json; charset=utf-8" })
            .end(JSON.stringify(body));
    };
    const computeRefusal = (): Refusal | undefined => {
        if (compute === "attached" || compute === "lost") return undefined;
        if (options.legacy)
            return {
                status: 503,
                error: "The compute node is unavailable.",
                code: "runner_unavailable",
            };
        return compute === "released"
            ? { status: 409, error: "This agent has no compute.", code: "no_compute" }
            : { status: 503, error: "This agent's compute is offline.", code: "compute_offline" };
    };
    const refusal = (request: IncomingMessage): Refusal | undefined =>
        request.headers.authorization === `Bearer ${token}`
            ? computeRefusal()
            : { status: 401, error: "Sign in to continue.", code: "unauthorized" };
    const tunnelRefusal = (request: IncomingMessage, networkId: string): Refusal | undefined => {
        const refused = refusal(request);
        if (refused) return refused;
        if (networkId !== network)
            return { status: 404, error: "No such network.", code: "not_found" };
        const now = Date.now();
        while (openings.length > 0 && openings[0]! <= now - 60_000) openings.shift();
        if (live.size >= concurrent || openings.length >= perMinute)
            return { status: 429, error: "Too many tunnels.", code: "too_many_tunnels" };
        openings.push(now);
        return undefined;
    };
    const computeAway = (): void => {
        for (const websocket of live)
            if (options.legacy) websocket.close(1008);
            else websocket.close(1001, "compute_offline");
    };

    const server = createServer((request, response) => {
        const path = new URL(request.url ?? "/", "http://cloud").pathname;
        if (
            request.method === "GET" &&
            (/^\/v0\/workspaces\/[^/]+\/agents\/[^/]+\/proxy$/u.test(path) ||
                /^\/v0\/agents\/[^/]+\/proxy$/u.test(path))
        ) {
            const refused = refusal(request);
            if (refused) json(response, refused.status, refused);
            else json(response, 200, { networkId: network, kind: "runner" });
            return;
        }
        json(response, 404, { error: "Not found.", code: "not_found" });
    });
    // An ordinary ingress answers CONNECT with something that is not Happy.
    server.on("connect", (_request, socket: Duplex) => {
        socket.on("error", () => socket.destroy());
        socket.end("HTTP/1.1 405 Method Not Allowed\r\nConnection: close\r\n\r\n");
    });
    const sockets = new WebSocketServer({ noServer: true, maxPayload: TWIN_MAX_MESSAGE });
    server.on("upgrade", (request, socket: Duplex, head) => {
        socket.on("error", () => socket.destroy());
        const path = new URL(request.url ?? "/", "http://cloud").pathname;
        const match = /^\/v0\/networks\/([^/]+)\/proxy\/websocket$/u.exec(path);
        const refused = match
            ? tunnelRefusal(request, decodeURIComponent(match[1]!))
            : { status: 404, error: "Not found.", code: "not_found" };
        if (refused) {
            const body = JSON.stringify(refused);
            socket.end(
                `HTTP/1.1 ${String(refused.status)} Refused\r\nContent-Type: application/json\r\n` +
                    `Content-Length: ${String(Buffer.byteLength(body))}\r\nConnection: close\r\n\r\n${body}`,
            );
            return;
        }
        sockets.handleUpgrade(request, socket, head, (websocket) => {
            opened += 1;
            live.add(websocket);
            websocket.once("close", () => live.delete(websocket));
            // Only carried bytes count as use; the twin's own pings do not.
            let idle: NodeJS.Timeout | undefined;
            const used = () => {
                clearTimeout(idle);
                idle = setTimeout(() => websocket.close(1000, "idle"), idleMs);
            };
            used();
            const lifetime = setTimeout(() => websocket.close(1008), lifetimeMs);
            websocket.once("close", () => {
                clearTimeout(idle);
                clearTimeout(lifetime);
            });
            session({
                websocket,
                forwardOpen: () => connect(forward.port, "127.0.0.1"),
                used,
            });
        });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    return {
        url: `http://127.0.0.1:${String(port)}/`,
        token,
        networkId: network,
        tunnelsOpened: () => opened,
        tunnelsLive: () => live.size,
        computeRelease() {
            compute = "released";
            computeAway();
        },
        computeOffline() {
            compute = "offline";
            computeAway();
        },
        computeLost() {
            compute = "lost";
        },
        computeAttach() {
            compute = "attached";
        },
        async close() {
            for (const websocket of live) websocket.terminate();
            sockets.close();
            server.closeAllConnections();
            await new Promise<void>((resolve) => server.close(() => resolve()));
            await forward.close();
        },
    };
}

/**
 * Carries one twin's bytes to and from one connection into the forwarding
 * proxy: every message is binary, an empty one ends that direction as a TCP
 * half-close does, and once both directions have ended the WebSocket closes.
 * One tunnel therefore carries requests one after another, or one nested
 * `CONNECT` for the rest of its life.
 */
export function fakeHappyCloudStreamSession(context: FakeHappyCloudSessionContext): void {
    const { websocket, used } = context;
    const upstream = context.forwardOpen();
    upstream.setNoDelay(true);
    upstream.allowHalfOpen = true;
    let sentEnd = false;
    let receivedEnd = false;
    const finish = () => {
        if (sentEnd && receivedEnd) websocket.close(1000);
    };
    upstream.on("data", (chunk: Buffer) => {
        used();
        for (let offset = 0; offset < chunk.length; offset += TWIN_MAX_MESSAGE)
            websocket.send(chunk.subarray(offset, offset + TWIN_MAX_MESSAGE), { binary: true });
    });
    upstream.once("end", () => {
        sentEnd = true;
        websocket.send(Buffer.alloc(0), { binary: true });
        finish();
    });
    upstream.on("error", () => websocket.close(1011));
    upstream.once("close", () => {
        if (!sentEnd) websocket.close(1011);
    });
    websocket.on("message", (data: Buffer, binary: boolean) => {
        if (!binary) {
            websocket.close(1003);
            return;
        }
        used();
        if (data.length === 0) {
            receivedEnd = true;
            upstream.end();
            finish();
            return;
        }
        upstream.write(data);
    });
    websocket.once("close", () => upstream.destroy());
}

/**
 * The forwarding proxy behind a tunnel: absolute-form requests and nested
 * `CONNECT host:port`, both opened from this machine unless `refusal` says
 * why not.
 */
async function forwardProxyStart(
    refusal: () => Refusal | undefined,
): Promise<{ port: number; close(): Promise<void> }> {
    const refusalAnswer = (refused: Refusal): string => {
        const body = JSON.stringify({ code: refused.code, error: refused.error });
        return (
            `HTTP/1.1 ${String(refused.status)} Service Unavailable\r\n` +
            `Content-Type: application/json; charset=utf-8\r\n` +
            `Content-Length: ${String(Buffer.byteLength(body))}\r\n\r\n${body}`
        );
    };
    const server = createServer((request, response) => {
        const refused = refusal();
        if (refused) {
            request.resume();
            response
                .writeHead(refused.status, { "content-type": "application/json; charset=utf-8" })
                .end(JSON.stringify({ code: refused.code, error: refused.error }));
            return;
        }
        let target: URL;
        try {
            target = new URL(request.url ?? "");
        } catch {
            response.writeHead(400).end();
            return;
        }
        const upstream = httpRequest(
            target,
            { method: request.method, headers: request.headers },
            (answer) => {
                response.writeHead(answer.statusCode ?? 502, answer.headers);
                answer.pipe(response);
            },
        );
        upstream.on("error", () => {
            if (!response.headersSent) response.writeHead(502);
            response.end();
        });
        request.pipe(upstream);
    });
    // A tunnel's client may finish sending before the answer is written, as a
    // half-closed TCP connection does; the answer must still reach it.
    (server as typeof server & { httpAllowHalfOpen: boolean }).httpAllowHalfOpen = true;
    server.on("connect", (request: IncomingMessage, client: Duplex, head: Buffer) => {
        client.on("error", () => client.destroy());
        const refused = refusal();
        if (refused) {
            // The tunnel stays open after the answer, as the cluster's does,
            // until its client is done with it.
            client.write(refusalAnswer(refused));
            client.once("end", () => client.end());
            return;
        }
        const [host, port] = (request.url ?? "").split(":");
        const upstream = connect(Number(port), host ?? "");
        upstream.on("error", () =>
            client.end("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n"),
        );
        upstream.once("connect", () => {
            client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
            if (head.length > 0) upstream.write(head);
            upstream.pipe(client);
            client.pipe(upstream);
        });
        client.once("close", () => upstream.destroy());
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    return {
        port: (server.address() as AddressInfo).port,
        close: () =>
            new Promise<void>((resolve) => {
                server.closeAllConnections();
                server.close(() => resolve());
            }),
    };
}
