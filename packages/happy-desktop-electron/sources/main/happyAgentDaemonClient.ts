import { connect as connectLocalSocket } from "node:net";
import { localAgentSocketPath } from "./localAgentSocketPath.js";
import { readFile } from "node:fs/promises";
import { request as httpRequest, type IncomingHttpHeaders, type IncomingMessage } from "node:http";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import type { Duplex, Readable } from "node:stream";
import {
    HappyAgentApiError,
    HappyAgentClient,
    WORKSPACE_BRIDGE_MAX_BINARY_MESSAGE_BYTES,
    type AgentResponse,
    type ArtifactVersionResponse,
    type Cuid2,
    type CreateLiveSessionRequest,
    type CreateLiveSessionResponse,
    type CloseLiveSessionRequest,
    type LiveSessionResponse,
    type DrainResponse,
    type FileContentResponse,
    type HealthResponse,
    type InspectorStartedResponse,
    type InspectorStoppedResponse,
    type ShutdownResponse,
    type WorkspaceResponse,
    type WriteFileRequest,
    type WriteFileResponse,
    workspaceAgentNetworkResponseSchema,
} from "@slopus/happy-agent-client";
import { Value } from "@sinclair/typebox/value";
import { WebSocket, createWebSocketStream } from "ws";

/**
 * Largest terminal frame carried by either side of the desktop bridge.
 *
 * Happy Agent's terminal protocol uses bounded binary frames. This remains
 * deliberately larger than the protocol's own largest frame while refusing an
 * unbounded WebSocket payload before it can reach the renderer.
 */
export const HAPPY_AGENT_TERMINAL_MAX_WIRE_BYTES = 4 * 1024 * 1024;

/** The approved Live control protocol carries bounded UTF-8 JSON, never audio. */
export const HAPPY_AGENT_LIVE_MAX_WIRE_BYTES = 256 * 1024;

export interface HappyAgentDaemonClientOptions {
    readonly socketPath: string;
    readonly token: string;
    readonly connectionId?: string;
}

export interface HappyAgentDaemonPaths {
    readonly socketPath: string;
    readonly tokenPath: string;
}

export interface HappyAgentDaemonRawResponse {
    readonly statusCode: number;
    readonly headers: IncomingHttpHeaders;
    readonly body: IncomingMessage;
}

/** One runtime component whose admitted work has not finished draining. */
export type DrainWaitingFor = NonNullable<HealthResponse["drainWaitingFor"]>[number];

/** Where a debugger attaches once Happy Agent's inspector is listening. */
export type HappyAgentDaemonInspectorResponse = InspectorStartedResponse;

/** Whether an inspector was listening before the stop request. */
export type HappyAgentDaemonInspectorStopResponse = InspectorStoppedResponse;

/**
 * Authenticated Unix-socket boundary for Happy Agent.
 *
 * It intentionally does not reproduce the browser-safe HappyAgentClient API.
 * The renderer already owns that client and reaches it through `rawRequest`.
 * Main only keeps the few transport operations a sandboxed browser cannot do:
 * health during bootstrap, terminal WebSockets, browser CONNECT tunnels, and
 * workspace file/path reads for native preview and Open In services.
 */
export class HappyAgentDaemonClient {
    readonly socketPath: string;
    readonly #token: string;
    readonly #client: HappyAgentClient;
    readonly #connectionId?: string;
    readonly #connections = new Map<string, HappyAgentDaemonClient>();

    constructor(options: HappyAgentDaemonClientOptions) {
        this.socketPath = options.socketPath;
        this.#token = options.token;
        this.#connectionId = options.connectionId;
        const client = new HappyAgentClient({
            endpoint: "http://happy-agent/",
            token: options.token,
            fetch: (input, init) => unixSocketFetch(options.socketPath, input, init),
        });
        this.#client = options.connectionId ? client.connection(options.connectionId) : client;
    }

    /** Main-only handoff to the isolated renderer transport; never sent to a page. */
    rendererTransport(): HappyAgentDaemonClientOptions {
        return { socketPath: this.socketPath, token: this.#token };
    }

    connection(id: string): HappyAgentDaemonClient {
        let client = this.#connections.get(id);
        if (!client) {
            client = new HappyAgentDaemonClient({
                socketPath: this.socketPath,
                token: this.#token,
                connectionId: id,
            });
            this.#connections.set(id, client);
        }
        return client;
    }

    health(signal?: AbortSignal): Promise<HealthResponse> {
        return this.#client.getHealth(signal ? { signal } : undefined);
    }

    /**
     * Puts this daemon process into its sticky drain mode: it stops admitting
     * work and reports what is still finishing through `health`. There is no way
     * back out, which is why only a decided restart calls it.
     */
    drain(signal?: AbortSignal): Promise<DrainResponse> {
        return this.#client.drain(signal ? { signal } : undefined);
    }

    /** Asks the daemon to exit; it answers with its pid before going. */
    shutdown(signal?: AbortSignal): Promise<ShutdownResponse> {
        return this.#client.shutdown(signal ? { signal } : undefined);
    }

    startInspector(signal?: AbortSignal): Promise<HappyAgentDaemonInspectorResponse> {
        return this.#client.startInspector(signal ? { signal } : undefined);
    }

    stopInspector(signal?: AbortSignal): Promise<HappyAgentDaemonInspectorStopResponse> {
        return this.#client.stopInspector(signal ? { signal } : undefined);
    }

    getAgent(agentId: string, signal?: AbortSignal): Promise<AgentResponse> {
        return this.#client.getAgent(agentId as Cuid2, signal ? { signal } : undefined);
    }

    createLiveSession(
        request: CreateLiveSessionRequest,
        signal?: AbortSignal,
    ): Promise<CreateLiveSessionResponse> {
        return this.#client.createLiveSession(request, signal ? { signal } : undefined);
    }

    getLiveSession(id: Cuid2, signal?: AbortSignal): Promise<LiveSessionResponse> {
        return this.#client.getLiveSession(id, signal ? { signal } : undefined);
    }

    closeLiveSession(
        id: Cuid2,
        request: CloseLiveSessionRequest = {},
        signal?: AbortSignal,
    ): Promise<LiveSessionResponse> {
        return this.#client.closeLiveSession(id, request, signal ? { signal } : undefined);
    }

    /** JSON frames stay intact; neither daemon credentials nor provider keys leave this transport. */
    attachLiveSession(id: Cuid2, windowId: string): Promise<WebSocket> {
        const url = new URL(this.#client.liveSessionControlUrl(id, windowId));
        url.protocol = "ws:";
        return new Promise((resolve, reject) => {
            const socket = new WebSocket(url, {
                createConnection: () => connectLocalSocket(this.socketPath),
                handshakeTimeout: 10_000,
                headers: { authorization: `Bearer ${this.#token}` },
                maxPayload: HAPPY_AGENT_LIVE_MAX_WIRE_BYTES,
                perMessageDeflate: false,
            });
            const fail = (error: Error) => {
                socket.terminate();
                reject(error);
            };
            socket.once("error", fail);
            socket.once("unexpected-response", (_request, response) => {
                response.resume();
                fail(
                    new HappyAgentDaemonHttpError(
                        response.statusCode ?? 502,
                        "The GPT-Live control channel was refused.",
                    ),
                );
            });
            socket.once("open", () => {
                socket.off("error", fail);
                // Install the relay before receiving the daemon's first hello frame.
                socket.pause();
                socket.on("error", () => undefined);
                resolve(socket);
            });
        });
    }

    getWorkspace(workspaceId: string, signal?: AbortSignal): Promise<WorkspaceResponse> {
        return this.#client.getWorkspace(workspaceId as Cuid2, signal ? { signal } : undefined);
    }

    readWorkspaceFile(
        workspaceId: string,
        filePath: string,
        signal?: AbortSignal,
    ): Promise<FileContentResponse> {
        return this.#client.readFile(
            workspaceId as Cuid2,
            filePath,
            signal ? { signal } : undefined,
        );
    }

    writeWorkspaceFile(
        workspaceId: string,
        request: WriteFileRequest,
        signal?: AbortSignal,
    ): Promise<WriteFileResponse> {
        return this.#client.writeFile(
            workspaceId as Cuid2,
            request,
            signal ? { signal } : undefined,
        );
    }

    /** One numbered artifact version and its whole manifest. */
    getArtifactVersion(
        artifactId: string,
        version: number,
        signal?: AbortSignal,
    ): Promise<ArtifactVersionResponse> {
        return this.#client.getArtifactVersion(
            artifactId as Cuid2,
            version,
            signal ? { signal } : undefined,
        );
    }

    /**
     * Opens one file of a numbered artifact version as a stream, so a page's
     * video can seek by the byte range it asks for instead of waiting for the
     * whole file. The route carries this client's connection prefix.
     */
    openArtifactFile(
        artifactId: string,
        version: number,
        filePath: string,
        range?: string,
        signal?: AbortSignal,
    ): Promise<HappyAgentDaemonRawResponse> {
        const url = new URL(this.#client.artifactFileUrl(artifactId as Cuid2, version, filePath));
        return this.rawRequest({
            method: "GET",
            path: `${url.pathname}${url.search}`,
            headers: { accept: "*/*", ...(range === undefined ? {} : { range }) },
            ...(signal ? { signal } : {}),
        });
    }

    /**
     * Forwards one request to an artifact's own API, `/v0/artifacts/:id/api/`,
     * under this client's connection prefix, without interpreting either side:
     * the API belongs to Happy Agent, so a new one needs no desktop release.
     * `rest` is already-encoded path segments and `search` the raw query.
     */
    openArtifactApi(
        artifactId: string,
        rest: string,
        search: string,
        options: {
            readonly method: string;
            readonly headers: Readonly<Record<string, string>>;
            readonly body?: Buffer;
            readonly signal?: AbortSignal;
        },
    ): Promise<HappyAgentDaemonRawResponse> {
        const connection = new URL(this.#client.endpoint).pathname.replace(/\/$/u, "");
        const prefix = `${connection}/v0/artifacts/${encodeURIComponent(artifactId)}/api/`;
        const path = `${prefix}${rest}${search}`;
        // Dot segments resolved here would carry the daemon credential to a
        // route outside the artifact's API.
        if (!new URL(path, "http://happy").pathname.startsWith(prefix))
            return Promise.reject(new Error("The artifact API path is invalid."));
        return this.rawRequest({ ...options, path });
    }

    /**
     * Opens one of Happy Agent's standard component files — `style.css`,
     * `components.js`, `diagrams.js` — as it serves them outside any artifact,
     * at `/v0/artifact-components/`, under this client's connection prefix.
     * The caller names only files it allows; the request is never interpreted.
     */
    openArtifactComponent(
        file: string,
        headers: Readonly<Record<string, string>>,
        signal?: AbortSignal,
    ): Promise<HappyAgentDaemonRawResponse> {
        const connection = new URL(this.#client.endpoint).pathname.replace(/\/$/u, "");
        return this.rawRequest({
            method: "GET",
            path: `${connection}/v0/artifact-components/${encodeURIComponent(file)}`,
            headers,
            ...(signal ? { signal } : {}),
        });
    }

    /**
     * Opens one daemon request without interpreting its response.
     *
     * Only `/v0` is accepted. The renderer supplies ordinary HTTP headers, but
     * the daemon credential is always replaced here and never leaves main.
     */
    rawRequest(options: {
        readonly method: string;
        readonly path: string;
        readonly body?: Buffer;
        readonly headers?: Readonly<Record<string, string>>;
        readonly signal?: AbortSignal;
    }): Promise<HappyAgentDaemonRawResponse> {
        const path = happyAgentPath(options.path);
        return new Promise((resolvePromise, reject) => {
            if (options.signal?.aborted) {
                reject(abortedError());
                return;
            }
            const headers: Record<string, string | number> = {
                accept: "application/json",
                ...options.headers,
                authorization: `Bearer ${this.#token}`,
            };
            if (options.body !== undefined) headers["content-length"] = options.body.byteLength;
            const request = httpRequest(
                {
                    headers,
                    method: options.method,
                    path,
                    socketPath: this.socketPath,
                },
                (response) => {
                    response.once("close", cleanup);
                    resolvePromise({
                        statusCode: response.statusCode ?? 500,
                        headers: response.headers,
                        body: response,
                    });
                },
            );
            const abort = () => request.destroy(abortedError());
            const cleanup = () => options.signal?.removeEventListener("abort", abort);
            options.signal?.addEventListener("abort", abort, { once: true });
            request.once("close", cleanup);
            request.once("error", reject);
            request.end(options.body);
        });
    }

    /**
     * `GET /v0/workspaces/:workspaceId/agents/:agentId/proxy`: the network that
     * agent's traffic leaves from. Agents sharing a network get the same answer.
     * Protocol 28 introduced the route, so an older Happy Agent is not asked.
     */
    async getWorkspaceAgentNetwork(
        workspaceId: string,
        agentId: string,
        signal?: AbortSignal,
    ): Promise<string> {
        const { version } = await this.health(signal);
        if (version.protocol < BROWSER_NETWORK_PROTOCOL)
            throw new Error(
                `Happy Agent ${version.daemon} (protocol ${String(version.protocol)}) cannot open a workspace browser; it needs protocol ${String(BROWSER_NETWORK_PROTOCOL)}.`,
            );
        const response: unknown = await this.#client.getWorkspaceAgentNetwork(
            workspaceId as Cuid2,
            agentId as Cuid2,
            signal ? { signal } : undefined,
        );
        if (!Value.Check(workspaceAgentNetworkResponseSchema, response))
            throw new Error("Happy Agent described an invalid browser network.");
        return response.networkId;
    }

    /**
     * Opens `CONNECT /v0/networks/:networkId/proxy`: one network, whichever
     * agent named it. An unknown or ended network is refused, and nothing falls
     * back to another one.
     */
    openNetworkHttpProxy(networkId: string, signal?: AbortSignal): Promise<Duplex> {
        const url = new URL(this.#client.networkProxyUrl(networkId));
        return this.#openConnect(url.pathname, signal);
    }

    /**
     * Opens `CONNECT /v0/artifacts/:artifactId/proxy`: a live artifact's own
     * tunnel, in the network it was made on, where the daemon decides every
     * address its page may reach.
     */
    openArtifactHttpProxy(artifactId: string, signal?: AbortSignal): Promise<Duplex> {
        const url = new URL(this.#client.artifactProxyUrl(artifactId));
        return this.#openConnect(url.pathname, signal);
    }

    /** Opens `CONNECT /v0/workspaces/:workspaceId/proxy`. */
    openWorkspaceHttpProxy(workspaceId: string, signal?: AbortSignal): Promise<Duplex> {
        // The SDK owns and validates the host-published connection prefix, just
        // as it does for ordinary HTTP requests and terminal attachments.
        const prefix = new URL(this.#client.endpoint).pathname.replace(/\/$/u, "");
        const path = `${prefix}/v0/workspaces/${encodeURIComponent(workspaceId)}/proxy`;
        return this.#openConnect(path, signal);
    }

    #openConnect(path: string, signal?: AbortSignal): Promise<Duplex> {
        return new Promise((resolvePromise, reject) => {
            if (signal?.aborted) {
                reject(abortedError());
                return;
            }
            const request = httpRequest({
                // CONNECT must enter the daemon's tunnel router on a fresh connection.
                agent: false,
                headers: { authorization: `Bearer ${this.#token}` },
                method: "CONNECT",
                path,
                socketPath: this.socketPath,
            });
            const abort = () => request.destroy(abortedError());
            const cleanup = () => signal?.removeEventListener("abort", abort);
            signal?.addEventListener("abort", abort, { once: true });
            request.once("close", cleanup);
            let settled = false;
            // A refusal keeps the daemon's own explanation, so whoever shows the
            // failure can say why instead of only that the tunnel failed.
            const fail = (statusCode: number | undefined, body: Readable, head?: Buffer): void => {
                if (settled) return;
                settled = true;
                cleanup();
                void refusalBodyRead(body, head).then((text) =>
                    reject(happyAgentProxyRefusal(statusCode ?? 500, text)),
                );
            };
            request.once("connect", (response, socket, head) => {
                if (response.statusCode !== 200) {
                    fail(response.statusCode, socket, head);
                    return;
                }
                if (settled) {
                    socket.destroy();
                    return;
                }
                settled = true;
                cleanup();
                if (head.length > 0) socket.unshift(head);
                resolvePromise(socket);
            });
            request.once("response", (response) => fail(response.statusCode, response));
            request.once("error", (error) => {
                if (settled) return;
                settled = true;
                cleanup();
                reject(
                    signal?.aborted
                        ? error
                        : new Error(
                              `Happy Agent closed the proxy tunnel without answering (${error.message}).`,
                              { cause: error },
                          ),
                );
            });
            request.end();
        });
    }

    /** Attaches one USB device of this computer to the workspace's machine. */
    openUsbBridge(
        workspaceId: string,
        query: { readonly busId: string; readonly id: string; readonly name: string },
    ): Promise<WebSocket> {
        return this.#openBridgeSocket(
            this.#client.workspaceUsbBridgeUrl(workspaceId as Cuid2, {
                ...query,
                id: query.id as Cuid2,
            }),
        );
    }

    /** Opens a port bridge's control channel: a loopback listener on the workspace's machine. */
    openPortBridge(
        workspaceId: string,
        query: { readonly port: number; readonly name: string },
    ): Promise<WebSocket> {
        return this.#openBridgeSocket(
            this.#client.workspacePortBridgeUrl(workspaceId as Cuid2, query),
        );
    }

    /** Accepts one connection waiting on a port bridge, as binary messages both ways. */
    acceptBridgeConnection(
        workspaceId: string,
        bridgeId: string,
        connectionId: string,
    ): Promise<WebSocket> {
        return this.#openBridgeSocket(
            this.#client.workspaceBridgeConnectionUrl(
                workspaceId as Cuid2,
                bridgeId as Cuid2,
                connectionId as Cuid2,
            ),
        );
    }

    /**
     * Opens one bridge WebSocket under this client's connection prefix.
     *
     * It resolves paused: a bridge's first message can follow the upgrade at
     * once, and must wait until its owner is listening.
     */
    #openBridgeSocket(endpointUrl: string): Promise<WebSocket> {
        const url = new URL(endpointUrl);
        url.protocol = "ws:";
        return new Promise((resolvePromise, reject) => {
            const socket = new WebSocket(url, {
                createConnection: () => connectLocalSocket(this.socketPath),
                handshakeTimeout: 10_000,
                headers: { authorization: `Bearer ${this.#token}` },
                maxPayload: WORKSPACE_BRIDGE_MAX_BINARY_MESSAGE_BYTES,
                perMessageDeflate: false,
            });
            let settled = false;
            const fail = (error: Error): void => {
                if (settled) return;
                settled = true;
                socket.terminate();
                reject(error);
            };
            socket.once("error", fail);
            socket.once("unexpected-response", (_request, response) => {
                const chunks: Buffer[] = [];
                let bytes = 0;
                response.on("data", (chunk: Buffer) => {
                    bytes += chunk.length;
                    if (bytes <= BRIDGE_REFUSAL_MAX_BYTES) chunks.push(chunk);
                });
                const refused = () =>
                    fail(
                        happyAgentBridgeRefusal(
                            response.statusCode ?? 502,
                            Buffer.concat(chunks).toString("utf8"),
                        ),
                    );
                response.once("error", refused);
                response.once("end", refused);
                response.once("close", refused);
            });
            socket.once("open", () => {
                if (settled) return;
                settled = true;
                socket.off("error", fail);
                socket.pause();
                resolvePromise(socket);
            });
        });
    }

    /**
     * Opens the binary Happy Agent terminal attachment as a byte stream.
     *
     * The workspace and terminal IDs are already authoritative `/v0`
     * identities; main performs no session lookup or legacy route projection.
     */
    attachTerminal(
        workspaceId: string,
        terminalId: string,
        connectionId?: string,
    ): Promise<Duplex> {
        const remote = connectionId ?? this.#connectionId;
        // The SDK validates the connection ID and owns the proxy prefix.
        const prefix = remote
            ? new URL(
                  this.#connectionId === remote
                      ? this.#client.endpoint
                      : this.#client.connection(remote).endpoint,
              ).pathname.replace(/\/$/u, "")
            : "";
        const path = `${prefix}/v0/workspaces/${encodeURIComponent(
            workspaceId,
        )}/terminals/${encodeURIComponent(terminalId)}/attach`;
        return new Promise((resolvePromise, reject) => {
            const socket = new WebSocket(`ws://happy-agent${path}`, {
                createConnection: () => connectLocalSocket(this.socketPath),
                handshakeTimeout: 10_000,
                headers: { authorization: `Bearer ${this.#token}` },
                maxPayload: HAPPY_AGENT_TERMINAL_MAX_WIRE_BYTES,
                perMessageDeflate: false,
            });
            let settled = false;
            const fail = (error: Error): void => {
                if (settled) return;
                settled = true;
                socket.terminate();
                reject(error);
            };
            const unexpected = (_request: unknown, response: { statusCode?: number }): void => {
                fail(
                    new HappyAgentDaemonHttpError(
                        response.statusCode ?? 500,
                        "The Happy Agent terminal attachment was refused.",
                    ),
                );
            };
            socket.once("error", fail);
            socket.once("unexpected-response", unexpected);
            socket.once("open", () => {
                if (settled) return;
                settled = true;
                socket.off("error", fail);
                socket.off("unexpected-response", unexpected);
                resolvePromise(createWebSocketStream(socket, { allowHalfOpen: false }));
            });
        });
    }
}

/** Resolves the standard Happy Agent daemon endpoint and optional exact overrides. */
export function happyAgentDaemonPathsResolve(
    environment: NodeJS.ProcessEnv = process.env,
    homeDirectory = homedir(),
): HappyAgentDaemonPaths {
    const configuredHome = environment.HAPPY_HOME_DIR?.trim();
    const happyHome =
        configuredHome === undefined || configuredHome.length === 0
            ? join(homeDirectory, ".happy")
            : configuredHome.startsWith("~")
              ? join(homeDirectory, configuredHome.slice(1))
              : isAbsolute(configuredHome)
                ? configuredHome
                : resolve(homeDirectory, configuredHome);
    const directory = join(happyHome, "agent");
    return {
        socketPath:
            environment.HAPPY_AGENT_SERVER_SOCKET_PATH?.trim() || localAgentSocketPath(directory),
        tokenPath: environment.HAPPY_AGENT_SERVER_TOKEN_PATH?.trim() || join(directory, "token"),
    };
}

export async function happyAgentDaemonTokenRead(tokenPath: string): Promise<string | undefined> {
    try {
        return (await readFile(tokenPath, "utf8")).trim() || undefined;
    } catch {
        return undefined;
    }
}

/** A daemon response the caller could not use, preserving its HTTP status. */
export class HappyAgentDaemonHttpError extends Error {
    constructor(
        readonly statusCode: number,
        message: string,
    ) {
        super(message);
        this.name = "HappyAgentDaemonHttpError";
    }
}

/** The most of a refused bridge upgrade's JSON body that is read. */
const BRIDGE_REFUSAL_MAX_BYTES = 16 * 1024;

/**
 * Happy Agent refused to open a bridge, before its WebSocket upgrade. `code` is
 * the daemon's error code; `reason` explains an unavailable capability.
 */
export class HappyAgentBridgeRefusedError extends HappyAgentDaemonHttpError {
    constructor(
        statusCode: number,
        readonly code: string | undefined,
        message: string,
    ) {
        super(statusCode, message);
        this.name = "HappyAgentBridgeRefusedError";
    }
}

function happyAgentBridgeRefusal(statusCode: number, body: string): HappyAgentBridgeRefusedError {
    let code: string | undefined;
    let message = `Happy Agent refused the bridge (${String(statusCode)}).`;
    try {
        const value = JSON.parse(body) as {
            readonly code?: unknown;
            readonly error?: unknown;
            readonly reason?: { readonly message?: unknown } | null;
        };
        if (typeof value.code === "string") code = value.code;
        // An unavailable capability's own explanation says more than the refusal.
        if (typeof value.reason?.message === "string") message = value.reason.message;
        else if (typeof value.error === "string" && value.error.length > 0) message = value.error;
    } catch {
        // Not every refusal on the way to the daemon is Happy Agent's own JSON.
    }
    return new HappyAgentBridgeRefusedError(statusCode, code, message);
}

/** The first Happy Agent protocol that names and opens browser networks. */
const BROWSER_NETWORK_PROTOCOL = 28;
/** The most of a refused proxy tunnel's body that is read, and for how long. */
const PROXY_REFUSAL_MAX_BYTES = 16 * 1024;
const PROXY_REFUSAL_READ_MS = 2_000;

/** Collects what a refusing daemon wrote after its status line, then lets go of it. */
function refusalBodyRead(body: Readable, head?: Buffer): Promise<string> {
    return new Promise((resolveBody) => {
        const chunks: Buffer[] = head && head.length > 0 ? [head] : [];
        let size = chunks[0]?.length ?? 0;
        let timer: NodeJS.Timeout | undefined;
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            body.removeListener("data", receive);
            body.removeListener("end", finish);
            body.removeListener("close", finish);
            body.removeListener("error", finish);
            if (!body.destroyed) body.destroy();
            resolveBody(
                Buffer.concat(chunks).subarray(0, PROXY_REFUSAL_MAX_BYTES).toString("utf8"),
            );
        };
        const receive = (chunk: Buffer) => {
            chunks.push(chunk);
            size += chunk.length;
            if (size >= PROXY_REFUSAL_MAX_BYTES) finish();
        };
        if (size >= PROXY_REFUSAL_MAX_BYTES || body.destroyed || body.readableEnded) {
            finish();
            return;
        }
        timer = setTimeout(finish, PROXY_REFUSAL_READ_MS);
        body.on("data", receive);
        body.on("end", finish);
        body.on("close", finish);
        body.on("error", finish);
    });
}

/**
 * The daemon's refusal of a proxy tunnel, in its own words when it gave any.
 * Only its status and its error text are kept; nothing of the request is.
 */
function happyAgentProxyRefusal(statusCode: number, body: string): HappyAgentDaemonHttpError {
    let detail: string | undefined;
    try {
        const value = JSON.parse(body) as {
            readonly error?: unknown;
            readonly reason?: { readonly message?: unknown } | null;
        };
        if (typeof value.reason?.message === "string") detail = value.reason.message;
        else if (typeof value.error === "string") detail = value.error;
    } catch {
        // Not every refusal on the way to the daemon is Happy Agent's own JSON.
        detail = body;
    }
    detail = detail
        ?.replace(/[\u0000-\u001f\u007f]+/gu, " ")
        .trim()
        .slice(0, 300);
    return new HappyAgentDaemonHttpError(
        statusCode,
        `Happy Agent refused the proxy tunnel (${String(statusCode)})${detail ? `: ${detail}` : "."}`,
    );
}

/**
 * True when this immutable socket/token pair cannot be used again and the
 * desktop runtime must reconnect and reread the token.
 */
export function happyAgentDaemonConnectionUnavailable(error: unknown): boolean {
    let current: unknown = error;
    for (let depth = 0; current && depth < 4; depth += 1) {
        if (typeof current !== "object") return false;
        if (current instanceof HappyAgentApiError)
            return current.status === 401 || current.status === 403;
        if (current instanceof HappyAgentDaemonHttpError)
            return current.statusCode === 401 || current.statusCode === 403;
        const value = current as { readonly cause?: unknown; readonly code?: unknown };
        if (
            value.code === "ECONNREFUSED" ||
            value.code === "ECONNRESET" ||
            value.code === "EPIPE" ||
            value.code === "ENOENT"
        )
            return true;
        current = value.cause;
    }
    return false;
}

function happyAgentPath(path: string): string {
    let parsed: URL;
    try {
        parsed = new URL(path, "http://happy");
    } catch {
        throw new Error("The Happy Agent request path is invalid.");
    }
    if (
        parsed.origin !== "http://happy" ||
        (parsed.pathname !== "/v0" && !parsed.pathname.startsWith("/v0/"))
    )
        throw new Error("Only Happy Agent /v0 routes may cross the desktop bridge.");
    return `${parsed.pathname}${parsed.search}`;
}

function abortedError(): Error {
    return new Error("The Happy Agent request was aborted.");
}

async function unixSocketFetch(
    socketPath: string,
    input: RequestInfo | URL,
    init?: RequestInit,
): Promise<Response> {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const body = request.body ? Buffer.from(await request.arrayBuffer()) : undefined;
    return new Promise((resolvePromise, reject) => {
        if (request.signal.aborted) {
            reject(abortedError());
            return;
        }
        const outgoing = httpRequest(
            {
                headers: Object.fromEntries(request.headers.entries()),
                method: request.method,
                path: `${url.pathname}${url.search}`,
                socketPath,
            },
            (incoming) => {
                const chunks: Buffer[] = [];
                incoming.on("data", (chunk: Buffer | string) =>
                    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
                );
                incoming.once("error", reject);
                incoming.once("end", () => {
                    const headers = new Headers();
                    for (const [name, value] of Object.entries(incoming.headers)) {
                        if (Array.isArray(value))
                            for (const item of value) headers.append(name, item);
                        else if (value !== undefined) headers.set(name, value);
                    }
                    const payload = Buffer.concat(chunks);
                    resolvePromise(
                        new Response(payload.length === 0 ? null : new Uint8Array(payload), {
                            headers,
                            status: incoming.statusCode ?? 500,
                            statusText: incoming.statusMessage,
                        }),
                    );
                });
            },
        );
        const abort = () => outgoing.destroy(abortedError());
        const cleanup = () => request.signal.removeEventListener("abort", abort);
        request.signal.addEventListener("abort", abort, { once: true });
        outgoing.once("close", cleanup);
        outgoing.once("error", reject);
        outgoing.end(body);
    });
}
