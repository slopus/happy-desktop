import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { happyAgentProtocol, HappyAgentDaemonHealth } from "happy-desktop-state";
import type { HtmlPreviewProxyHandle } from "./htmlPreviewProxy";
import { happyAgentProxyHandle, type HappyAgentProxyClient } from "./happyAgentProxyHandle";
import {
    happyAgentTerminalBridgeCreate,
    type HappyAgentTerminalClient,
} from "./happyAgentTerminalBridge";

export interface HappyAgentHttpProxyHandle {
    /** Loopback base URL, for example `http://127.0.0.1:52344`. */
    readonly url: string;
    /**
     * Atomically replaces the daemon connection forwarded through this already
     * bound proxy. Its URL, capability, server, terminal bridge, and preview
     * registration stay alive; subsequent work resolves through this backing.
     */
    replace(backing: HappyAgentHttpProxyBacking): void;
    close(): void;
}

export interface HappyAgentHttpProxyBacking {
    /** The daemon client whose `/v0` surface this proxy exposes. */
    readonly client: HappyAgentProxyClient & HappyAgentTerminalClient;
}

export interface HappyAgentHttpProxyOptions extends HappyAgentHttpProxyBacking {
    /**
     * Invoked when a health request fails at the transport level (the daemon is
     * unreachable), so the runtime can restart the connection. Daemon-reported
     * `error`/`starting` states resolve normally and never trigger this.
     */
    readonly onConnectionError?: (error: unknown) => void;
    /**
     * The single browser origin allowed to call this proxy cross-origin. The
     * development shell supplies its Vite origin; the local-web distribution
     * supplies its immutable hosted renderer origin. The standard packaged app
     * loads `file:` and passes nothing.
     */
    readonly allowedOrigin?: string;
    /**
     * The window's HTML preview proxy, if it has one. Registering this Happy Agent's
     * client with it is what lets a document of its checkouts be published as a
     * site; without one this proxy reports that it cannot render a document.
     */
    readonly htmlPreview?: HtmlPreviewProxyHandle;
}

/** Projects Happy Agent health into the minimal liveness shape the renderer loader consumes. */
export function happyAgentDaemonHealthProject(
    value: happyAgentProtocol.HealthResponse,
): HappyAgentDaemonHealth {
    return value.ready
        ? { status: "ready", version: value.version.daemon }
        : { status: "starting", version: value.version.daemon };
}

/**
 * A loopback-only HTTP bridge from the sandboxed renderer to the daemon. The
 * renderer cannot open the daemon's Unix socket, so the main process listens on an
 * ephemeral 127.0.0.1 port and forwards Happy Agent `/v0` requests to its
 * authenticated Unix socket. Everything under `/v0` is transparent: the proxy
 * preserves the daemon response as it stands. It binds to loopback only,
 * requires the unguessable URL capability, and 404s every unmatched path.
 * Resolves once the port is bound so the caller can advertise the URL.
 *
 * The same port also upgrades one route to a WebSocket: a terminal's byte channel,
 * which cannot be a request/response at all. That is the only upgrade this server
 * answers, so any other upgrade attempt is refused rather than left hanging.
 */
export function happyAgentHttpProxyCreate(
    options: HappyAgentHttpProxyOptions,
): Promise<HappyAgentHttpProxyHandle> {
    type Client = HappyAgentProxyClient & HappyAgentTerminalClient;
    interface CurrentBacking {
        readonly client: Client;
    }
    const backingCreate = (next: HappyAgentHttpProxyBacking): CurrentBacking => ({
        client: next.client,
    });
    let backing = backingCreate(options);
    // Preview sites outlive one daemon transport. Their stored client is this
    // stable facade, whose every method lookup binds to the current host client.
    const liveHostClient = new Proxy(options.client, {
        get(_target, property) {
            const client = backing.client;
            const value = Reflect.get(client, property, client) as unknown;
            return typeof value === "function" ? value.bind(client) : value;
        },
    });
    const preview = options.htmlPreview?.register(liveHostClient);
    const capability = randomBytes(32).toString("base64url");
    const capabilityPrefix = `/${capability}`;
    let expectedHost: string | undefined;
    const server = createServer((request, response) => {
        const url = new URL(request.url ?? "/", "http://127.0.0.1");
        // Exact-match only: an echoed arbitrary origin would hand the whole daemon
        // surface to any page the user happens to have open.
        const crossOrigin =
            options.allowedOrigin !== undefined && request.headers.origin === options.allowedOrigin;
        if (
            request.headers.host !== expectedHost ||
            (request.headers.origin !== undefined &&
                request.headers.origin !== "null" &&
                !request.headers.origin.startsWith("file:") &&
                !crossOrigin) ||
            (url.pathname !== capabilityPrefix && !url.pathname.startsWith(`${capabilityPrefix}/`))
        ) {
            response.writeHead(403);
            response.end();
            return;
        }
        if (crossOrigin) {
            response.setHeader("access-control-allow-origin", options.allowedOrigin!);
            response.setHeader("access-control-expose-headers", "*");
            response.setHeader("vary", "origin");
        }
        if (request.method === "OPTIONS") {
            // The exact renderer origin may use the complete connector protocol.
            // Echoing its requested method and headers keeps this bridge transparent
            // when Happy Agent adds an operation without weakening the origin gate.
            if (crossOrigin) {
                const requestedMethod = request.headers["access-control-request-method"]?.trim();
                const requestedHeaders = request.headers["access-control-request-headers"]?.trim();
                const privateNetwork =
                    request.headers["access-control-request-private-network"] === "true";
                response.writeHead(204, {
                    "access-control-allow-headers":
                        requestedHeaders ||
                        "authorization, content-type, if-match, x-happy-agent-mutation-id",
                    "access-control-allow-methods": requestedMethod
                        ? `${requestedMethod}, OPTIONS`
                        : "DELETE, GET, HEAD, PATCH, POST, PUT, OPTIONS",
                    ...(privateNetwork ? { "access-control-allow-private-network": "true" } : {}),
                    "access-control-max-age": "600",
                });
            } else {
                response.writeHead(403);
            }
            response.end();
            return;
        }
        const requestPath = url.pathname.slice(capabilityPrefix.length) || "/";
        const requestBacking = backing;
        const client = requestBacking.client;
        // The daemon bridge carries whatever body the daemon accepts, so the
        // JSON guard below is for this server's own local routes only.
        const daemonBridgeRequest = requestPath === "/v0" || requestPath.startsWith("/v0/");
        const hasBody =
            Number(request.headers["content-length"] ?? 0) > 0 ||
            request.headers["transfer-encoding"] !== undefined;
        if (
            hasBody &&
            !daemonBridgeRequest &&
            request.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase() !==
                "application/json"
        ) {
            response.writeHead(415, { "content-type": "application/json" });
            response.end(JSON.stringify({ error: "JSON content type required." }));
            return;
        }
        void happyAgentProxyHandle({
            client,
            method: request.method ?? "GET",
            nativeWorkspaceOwner: true,
            path: requestPath,
            query: url.searchParams,
            request,
            response,
            onConnectionError: (error: unknown) => {
                // An old in-flight request may finish failing after a
                // replacement is already live. It cannot invalidate
                // the new connection or start another reconnect.
                if (backing === requestBacking) options.onConnectionError?.(error);
            },
            ...(preview ? { htmlPreviewUrl: preview.workspace } : {}),
        }).then(
            (handled) => {
                if (!handled && !response.headersSent) {
                    response.writeHead(404, { "content-type": "application/json" });
                    response.end(JSON.stringify({ error: "Not found." }));
                }
            },
            (error: unknown) => {
                if (!response.headersSent) {
                    response.writeHead(500, { "content-type": "application/json" });
                    response.end(
                        JSON.stringify({
                            error: error instanceof Error ? error.message : String(error),
                        }),
                    );
                }
            },
        );
    });
    const terminals = happyAgentTerminalBridgeCreate({
        client: () => Promise.resolve(backing.client),
        capability,
        prefix: capabilityPrefix,
        expectedHost: () => expectedHost,
        ...(options.allowedOrigin === undefined ? {} : { allowedOrigin: options.allowedOrigin }),
    });
    server.on("upgrade", (request, socket, head) => {
        if (!terminals.upgrade(request, socket, head)) socket.destroy();
    });
    return new Promise<HappyAgentHttpProxyHandle>((resolvePromise, reject) => {
        const onError = (error: unknown) => reject(error as Error);
        server.once("error", onError);
        server.listen(0, "127.0.0.1", () => {
            server.removeListener("error", onError);
            const address = server.address() as AddressInfo | null;
            if (!address) {
                server.close();
                reject(new Error("The Happy Agent HTTP proxy did not bind a loopback port."));
                return;
            }
            expectedHost = `127.0.0.1:${address.port}`;
            let closed = false;
            resolvePromise({
                url: `http://${expectedHost}${capabilityPrefix}`,
                replace: (next) => {
                    if (closed) throw new Error("The Happy Agent HTTP proxy is closed.");
                    backing = backingCreate(next);
                },
                close: () => {
                    if (closed) return;
                    closed = true;
                    terminals.close();
                    server.close();
                },
            });
        });
    });
}
