import type { IncomingMessage } from "node:http";
import { Duplex } from "node:stream";
import { WebSocket } from "ws";
import type { DesktopBrowserProxyTarget, DesktopBrowserRefusal } from "../shared/desktopContract";
import {
    HappyAgentDaemonHttpError,
    happyAgentNetworkAnswerRead,
    type HappyAgentRemoteAuthorization,
} from "./happyAgentDaemonClient";

/**
 * The workspace browser's way into a Happy Cloud server, which the host Happy
 * Agent does not know. Main asks the server itself for an agent's network and
 * opens that network's tunnels as WebSocket twins, with the person's access
 * token, which goes only to the server it was issued for and never leaves
 * main.
 *
 * One twin carries one HTTP/1.1 connection into the network, so one nested
 * `CONNECT` at a time. The server limits how many twins one person may have
 * open and open a minute; openings here keep within those limits, waiting
 * their turn rather than failing, and back off when the server says too many.
 */
export interface HappyCloudBrowser {
    /** The network an agent's traffic leaves from, as its server names it. */
    networkResolve(target: DesktopBrowserProxyTarget, signal?: AbortSignal): Promise<string>;
    /** Opens one tunnel into a network: a byte stream to its forwarding proxy. */
    tunnelOpen(connectionId: string, networkId: string, signal: AbortSignal): Promise<Duplex>;
    /**
     * Asks to be told when an opening for this server waits because all of
     * the person's tunnels are open, so tunnels kept open unused can be given
     * back. Returns the way to stop being asked.
     */
    idleReclaimRegister(connectionId: string, reclaim: () => void): () => void;
}

export interface HappyCloudBrowserLimits {
    /** Twins one person may have open at once. */
    readonly concurrent: number;
    /** Twins one person may open in a minute. */
    readonly perMinute: number;
    /** The first wait after the server says too many; it doubles up to `backoffMaxMs`. */
    readonly backoffMs: number;
    readonly backoffMaxMs: number;
}

/** What the server allows today. */
const LIMITS: HappyCloudBrowserLimits = {
    concurrent: 8,
    perMinute: 32,
    backoffMs: 1_000,
    backoffMaxMs: 30_000,
};

/** One twin message is at most 1 MiB. */
const TWIN_MAX_MESSAGE = 1024 * 1024;

/**
 * A Happy Cloud server refused a browser request. A refusal because the
 * agent's compute is away says which, from the server's own code.
 */
export class HappyCloudBrowserError extends HappyAgentDaemonHttpError {
    readonly refusal?: DesktopBrowserRefusal;

    constructor(
        statusCode: number,
        message: string,
        readonly code?: string,
    ) {
        super(statusCode, message);
        this.name = "HappyCloudBrowserError";
        const refusal = happyCloudRefusalOf(statusCode, code);
        if (refusal !== undefined) this.refusal = refusal;
    }
}

/**
 * Which compute refusal a server's answer is. Older servers say
 * `runner_unavailable` for every way compute can be away.
 */
export function happyCloudRefusalOf(
    statusCode: number,
    code: string | undefined,
): DesktopBrowserRefusal | undefined {
    if (statusCode === 409 && code === "no_compute") return "computeDetached";
    if (
        statusCode === 503 &&
        (code === "compute_offline" || code === "draining" || code === "runner_unavailable")
    )
        return "computeOffline";
    return undefined;
}

export function happyCloudBrowserCreate(input: {
    readonly remote: Pick<HappyAgentRemoteAuthorization, "credential" | "refresh">;
    readonly limits?: Partial<HappyCloudBrowserLimits>;
    readonly fetch?: typeof globalThis.fetch;
}): HappyCloudBrowser {
    const limits = { ...LIMITS, ...input.limits };
    const fetch = input.fetch ?? globalThis.fetch.bind(globalThis);
    const budgets = new Map<string, TunnelBudget>();
    const budgetOf = (connectionId: string): TunnelBudget => {
        let budget = budgets.get(connectionId);
        if (!budget) {
            budget = new TunnelBudget(limits);
            budgets.set(connectionId, budget);
        }
        return budget;
    };
    const credentialRequire = (connectionId: string) => {
        const credential = input.remote.credential(connectionId);
        if (!credential) throw new HappyCloudBrowserError(401, "Sign in to this server to use it.");
        return credential;
    };
    /**
     * Runs one request with the current token, and once more after a refresh
     * when the server refused the token: a refused token was never used.
     */
    const authorized = async <T>(
        connectionId: string,
        attempt: (serverUrl: string, token: string) => Promise<T | "unauthorized">,
    ): Promise<T> => {
        const credential = credentialRequire(connectionId);
        const first = await attempt(credential.serverUrl, credential.accessToken);
        if (first !== "unauthorized") return first;
        const fresh = await input.remote.refresh(connectionId, credential.accessToken);
        if (
            fresh !== undefined &&
            fresh.serverUrl === credential.serverUrl &&
            fresh.accessToken !== credential.accessToken
        ) {
            const second = await attempt(fresh.serverUrl, fresh.accessToken);
            if (second !== "unauthorized") return second;
        }
        throw new HappyCloudBrowserError(401, "Sign in to this server to use it.");
    };

    return {
        async networkResolve(target, signal) {
            if (target.connectionId === null) throw new Error("This is not a Happy Cloud agent.");
            return await authorized(target.connectionId, async (serverUrl, token) => {
                const url = new URL(
                    `v0/workspaces/${encodeURIComponent(target.workspaceId)}/agents/${encodeURIComponent(target.agentId)}/proxy`,
                    serverUrl,
                );
                const response = await fetch(url, {
                    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
                    // A redirect would carry the token to an address it was not issued for.
                    redirect: "error",
                    ...(signal ? { signal } : {}),
                });
                if (response.status === 401) {
                    await response.body?.cancel();
                    return "unauthorized";
                }
                const body: unknown = await response.json().catch(() => undefined);
                if (!response.ok) throw refusalRead(response.status, body);
                return happyAgentNetworkAnswerRead(body).networkId;
            });
        },
        idleReclaimRegister(connectionId, reclaim) {
            const budget = budgetOf(connectionId);
            budget.reclaimers.add(reclaim);
            return () => budget.reclaimers.delete(reclaim);
        },
        async tunnelOpen(connectionId, networkId, signal) {
            const budget = budgetOf(connectionId);
            for (;;) {
                const release = await budget.acquire(signal);
                try {
                    const tunnel = await authorized(connectionId, (serverUrl, token) =>
                        twinOpen(serverUrl, token, networkId, signal),
                    );
                    tunnel.once("close", release);
                    budget.succeeded();
                    return tunnel;
                } catch (error) {
                    release();
                    if (!(error instanceof HappyCloudBrowserError) || error.statusCode !== 429)
                        throw error;
                    // Too many: wait, then take a turn again.
                    budget.refused();
                }
            }
        },
    };
}

/** The codes a nested `CONNECT` can be refused with because compute is away. */
const NESTED_REFUSAL_CODES = new Set(["compute_offline", "no_compute", "draining"]);

/**
 * The compute refusal a nested `CONNECT` was answered with, from its body. A
 * tunnel opened while compute was still thought present is refused this way
 * the moment its compute stops answering, long before new tunnels are. Any
 * other refusal, Happy's or the agent's own, is no compute refusal.
 */
export function happyCloudNestedRefusalRead(
    statusCode: number,
    body: Buffer,
): HappyCloudBrowserError | undefined {
    let parsed: unknown;
    try {
        parsed = JSON.parse(body.toString("utf8"));
    } catch {
        return undefined;
    }
    const code =
        typeof parsed === "object" && parsed !== null
            ? (parsed as { readonly code?: unknown }).code
            : undefined;
    if (typeof code !== "string" || !NESTED_REFUSAL_CODES.has(code)) return undefined;
    const error = refusalRead(statusCode, parsed);
    return error.refusal === undefined ? undefined : error;
}

/** A server's refusal, as an error with the server's own code and words. */
function refusalRead(statusCode: number, body: unknown): HappyCloudBrowserError {
    const refusal =
        typeof body === "object" && body !== null
            ? (body as { readonly error?: unknown; readonly code?: unknown })
            : {};
    const message =
        typeof refusal.error === "string" && refusal.error.trim() !== ""
            ? refusal.error.trim().slice(0, 500)
            : `The Happy Cloud server refused the browser (${String(statusCode)}).`;
    return new HappyCloudBrowserError(
        statusCode,
        message,
        typeof refusal.code === "string" ? refusal.code : undefined,
    );
}

/** Opens one network tunnel's twin, resolving once the server accepts it. */
function twinOpen(
    serverUrl: string,
    token: string,
    networkId: string,
    signal: AbortSignal,
): Promise<TwinStream | "unauthorized"> {
    return new Promise((resolve, reject) => {
        signal.throwIfAborted();
        const url = new URL(
            `v0/networks/${encodeURIComponent(networkId)}/proxy/websocket`,
            serverUrl,
        );
        url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
        const websocket = new WebSocket(url, {
            headers: { authorization: `Bearer ${token}` },
            maxPayload: TWIN_MAX_MESSAGE,
            followRedirects: false,
            perMessageDeflate: false,
        });
        const abort = () => {
            websocket.terminate();
            reject(signal.reason);
        };
        signal.addEventListener("abort", abort, { once: true });
        const settled = () => signal.removeEventListener("abort", abort);
        websocket.once("unexpected-response", (_request, response: IncomingMessage) => {
            settled();
            const chunks: Buffer[] = [];
            response.on("data", (chunk: Buffer) => {
                if (chunks.reduce((size, each) => size + each.length, 0) < 16_384)
                    chunks.push(chunk);
            });
            response.once("error", () => undefined);
            response.once("end", () => {
                websocket.terminate();
                const status = response.statusCode ?? 502;
                if (status === 401) {
                    resolve("unauthorized");
                    return;
                }
                let body: unknown;
                try {
                    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
                } catch {
                    body = undefined;
                }
                reject(refusalRead(status, body));
            });
        });
        websocket.once("open", () => {
            settled();
            resolve(new TwinStream(websocket));
        });
        websocket.once("error", (error) => {
            settled();
            reject(error);
        });
    });
}

/**
 * One twin as the byte stream it carries: every message is binary, and an
 * empty one ends its direction as a TCP half-close does. The server closing
 * the twin because the agent's compute went away fails the stream with that
 * refusal; any other close before both directions ended fails it plainly.
 *
 * It answers the socket calls an HTTP agent makes on a pooled connection,
 * including an idle timeout, which only carried bytes put off.
 */
export class TwinStream extends Duplex {
    #idleMs = 0;
    #idleTimer?: ReturnType<typeof setTimeout>;
    #ended = false;
    #finished = false;

    constructor(private readonly websocket: WebSocket) {
        super({ allowHalfOpen: true });
        websocket.on("message", (data: Buffer, binary: boolean) => {
            if (!binary) {
                this.destroy(new Error("The Happy Cloud tunnel sent text."));
                return;
            }
            this.#used();
            if (data.length === 0) {
                this.#ended = true;
                this.push(null);
                return;
            }
            if (!this.push(data)) websocket.pause();
        });
        websocket.once("close", (code: number, reason: Buffer) => {
            if (this.destroyed) return;
            const why = reason.toString("utf8");
            if (code === 1001 && why === "compute_offline") {
                this.destroy(
                    new HappyCloudBrowserError(
                        503,
                        "This agent's compute went offline.",
                        "compute_offline",
                    ),
                );
                return;
            }
            if (this.#ended && this.#finished) {
                this.destroy();
                return;
            }
            this.destroy(new Error(`The Happy Cloud tunnel closed (${String(code)}).`));
        });
        websocket.on("error", (error) => this.destroy(error));
    }

    override _read(): void {
        this.websocket.resume();
    }

    override _write(
        chunk: Buffer,
        _encoding: BufferEncoding,
        callback: (error?: Error) => void,
    ): void {
        this.#used();
        let pending = 0;
        let failed: Error | undefined;
        for (let offset = 0; offset < chunk.length; offset += TWIN_MAX_MESSAGE) {
            pending += 1;
            this.websocket.send(
                chunk.subarray(offset, offset + TWIN_MAX_MESSAGE),
                { binary: true },
                (error) => {
                    failed ??= error ?? undefined;
                    pending -= 1;
                    if (pending === 0) callback(failed);
                },
            );
        }
        if (pending === 0) callback();
    }

    override _final(callback: (error?: Error) => void): void {
        this.#finished = true;
        this.websocket.send(Buffer.alloc(0), { binary: true }, (error) =>
            callback(error ?? undefined),
        );
    }

    override _destroy(error: Error | null, callback: (error: Error | null) => void): void {
        clearTimeout(this.#idleTimer);
        if (this.websocket.readyState === WebSocket.OPEN) this.websocket.close(1000);
        else this.websocket.terminate();
        callback(error);
    }

    #used(): void {
        if (this.#idleMs <= 0) return;
        clearTimeout(this.#idleTimer);
        this.#idleTimer = setTimeout(() => this.emit("timeout"), this.#idleMs);
    }

    /** As `net.Socket#setTimeout`: emits `timeout` after that long with no bytes either way. */
    setTimeout(ms: number, callback?: () => void): this {
        this.#idleMs = ms;
        if (callback) this.once("timeout", callback);
        if (ms <= 0) clearTimeout(this.#idleTimer);
        else this.#used();
        return this;
    }

    setKeepAlive(): this {
        return this;
    }

    setNoDelay(): this {
        return this;
    }

    ref(): this {
        return this;
    }

    unref(): this {
        return this;
    }
}

/**
 * One person's twins: so many open at once and so many opened a minute.
 * An opening over either waits its turn. After the server says too many,
 * nothing opens until a wait that doubles with each refusal in a row.
 */
class TunnelBudget {
    /** Told when an opening waits for one of the open tunnels to end. */
    readonly reclaimers = new Set<() => void>();
    #open = 0;
    readonly #openings: number[] = [];
    readonly #waiting: (() => void)[] = [];
    #coolUntil = 0;
    #backoffMs: number;
    #timer?: ReturnType<typeof setTimeout>;

    constructor(private readonly limits: HappyCloudBrowserLimits) {
        this.#backoffMs = limits.backoffMs;
    }

    async acquire(signal: AbortSignal): Promise<() => void> {
        for (;;) {
            signal.throwIfAborted();
            const now = Date.now();
            while (this.#openings.length > 0 && this.#openings[0]! <= now - 60_000)
                this.#openings.shift();
            if (
                now >= this.#coolUntil &&
                this.#open < this.limits.concurrent &&
                this.#openings.length < this.limits.perMinute
            ) {
                this.#open += 1;
                this.#openings.push(now);
                let released = false;
                return () => {
                    if (released) return;
                    released = true;
                    this.#open -= 1;
                    this.#wake();
                };
            }
            if (this.#open >= this.limits.concurrent)
                for (const reclaim of this.reclaimers) reclaim();
            const wakeAt = Math.max(
                this.#coolUntil,
                this.#openings.length >= this.limits.perMinute ? this.#openings[0]! + 60_000 : 0,
            );
            await new Promise<void>((resolve, reject) => {
                const wake = () => {
                    signal.removeEventListener("abort", abort);
                    resolve();
                };
                const abort = () => {
                    const index = this.#waiting.indexOf(wake);
                    if (index >= 0) this.#waiting.splice(index, 1);
                    reject(signal.reason);
                };
                signal.addEventListener("abort", abort, { once: true });
                this.#waiting.push(wake);
                if (wakeAt > now) this.#wakeAt(wakeAt);
            });
        }
    }

    succeeded(): void {
        this.#backoffMs = this.limits.backoffMs;
    }

    refused(): void {
        this.#coolUntil = Date.now() + this.#backoffMs;
        this.#backoffMs = Math.min(this.#backoffMs * 2, this.limits.backoffMaxMs);
    }

    #wake(): void {
        for (const wake of this.#waiting.splice(0)) wake();
    }

    #wakeAt(at: number): void {
        clearTimeout(this.#timer);
        this.#timer = setTimeout(() => this.#wake(), Math.max(0, at - Date.now()));
        this.#timer.unref();
    }
}
