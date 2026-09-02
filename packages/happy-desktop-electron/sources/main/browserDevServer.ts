import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { desktopConfigPath, DesktopConfigStore } from "./desktopConfig";
import type { LocalHappyAgentConnection } from "./localHappyAgent";
import { localHappyAgentConnectorCreate } from "./localHappyAgent";
import { happyAgentDaemonConnectionUnavailable } from "./happyAgentDaemonClient";
import { happyAgentProxyHandle } from "./happyAgentProxyHandle";
import { happyAgentTerminalBridgeCreate } from "./happyAgentTerminalBridge";

const endpoint = "/__happy_local_happy_agent";
const maximumBridgeBodyBytes = 3 * 1024 * 1024;

interface DevRuntime {
    readonly connection: LocalHappyAgentConnection;
}

export interface BrowserLocalHappyAgentOptions {
    /** Opens one daemon connection; injectable so tests drive reconnection deterministically. */
    readonly connect?: () => Promise<LocalHappyAgentConnection>;
    /** Overrides the normal home-directory config path for an isolated host. */
    readonly desktopConfigPath?: string;
}

/**
 * Gives the loopback-only Vite renderer a development bridge to the user's normal
 * Happy Agent daemon. It mirrors the packaged desktop's HTTP proxy: `GET /health`
 * forwards daemon health, and the renderer's connection loader probes it
 * exactly as it probes the Electron main process's proxy in production.
 *
 * The connection is memoized but never permanent: it is dropped as soon as a
 * route reports that the daemon has become unreachable or has stopped accepting
 * this connection's token, so restarting the daemon under a running `vite` heals
 * on the renderer's next health probe instead of serving 503 until a restart.
 */
export function browserLocalHappyAgentPlugin(options: BrowserLocalHappyAgentOptions = {}): Plugin {
    const connect = options.connect ?? (() => localHappyAgentConnectorCreate().connect());
    let desktopConfigTask: Promise<DesktopConfigStore> | undefined;
    const desktopConfig = (): Promise<DesktopConfigStore> => {
        desktopConfigTask ??= DesktopConfigStore.create(
            options.desktopConfigPath ?? desktopConfigPath(),
        );
        return desktopConfigTask;
    };
    let runtimeTask: Promise<DevRuntime> | undefined;
    const runtime = (): Promise<DevRuntime> => {
        if (runtimeTask) return runtimeTask;
        const task = connect().then((connection) => ({ connection }));
        // A failed connect must not stay memoized, or one daemon outage at the
        // first request keeps this bridge dead for the whole Vite session.
        void task.catch(() => {
            if (runtimeTask === task) runtimeTask = undefined;
        });
        runtimeTask = task;
        return task;
    };
    // A restarted daemon regenerates its token file, so the memoized connection's
    // cached token stops authenticating and every proxied route fails until the
    // connection itself is rebuilt. Dropping the memo makes the next request
    // reconnect and re-read the token, which is how the dev bridge recovers
    // without the user reloading Vite.
    const runtimeInvalidate = (error: unknown, expected?: Promise<DevRuntime>): void => {
        if (!happyAgentDaemonConnectionUnavailable(error)) return;
        if (expected !== undefined && runtimeTask !== expected) return;
        const stale = runtimeTask;
        runtimeTask = undefined;
        void stale?.then(
            ({ connection }) => connection.close(),
            () => undefined,
        );
    };
    return {
        name: "happy-browser-local-happy-agent",
        apply: "serve",
        transformIndexHtml() {
            // Signal browser-local mode to the renderer without import.meta.env, so
            // the shared renderer entry can pick the dev bridge over the web app. A
            // meta tag (not an inline script) carries the flag because the page CSP
            // forbids inline scripts, which would otherwise silently drop the signal.
            if (process.env.VITE_HAPPY_BROWSER_LOCAL !== "1") return;
            return [
                {
                    tag: "meta",
                    attrs: { name: "happy-browser-local", content: "1" },
                    injectTo: "head" as const,
                },
            ];
        },
        configureServer(server) {
            const configuredHost =
                typeof server.config.server.host === "string"
                    ? server.config.server.host
                    : "127.0.0.1";
            const configuredPort = server.config.server.port ?? 5173;
            const expectedHost = `${configuredHost}:${configuredPort}`;
            const rendererOrigin = `http://${expectedHost}`;
            // A terminal's bytes cannot ride the middleware stack, so the dev
            // bridge claims the one upgrade path it owns and leaves every other
            // upgrade — Vite's own HMR socket above all — to Vite's listeners.
            const terminals = happyAgentTerminalBridgeCreate({
                allowedOrigin: rendererOrigin,
                client: () => runtime().then(({ connection }) => connection.client),
                expectedHost: () => expectedHost,
                prefix: endpoint,
            });
            server.httpServer?.on("upgrade", (request, socket, head) => {
                terminals.upgrade(request, socket, head);
            });
            server.middlewares.use(async (request, response, next) => {
                const url = new URL(request.url ?? "/", "http://127.0.0.1");
                const path = url.pathname;
                // The exact endpoint is the browser development bridge for
                // runtime and machine-local actions; everything under it is a
                // Happy Agent or desktop-local route.
                if (path === endpoint && request.method === "POST") {
                    await handleRequest(request, response, runtime, desktopConfig);
                    return;
                }
                if (path === endpoint || path.startsWith(`${endpoint}/`)) {
                    let pending: Promise<DevRuntime> | undefined;
                    try {
                        pending = runtime();
                        const active = await pending;
                        const bridgePath = path.slice(endpoint.length) || "/";
                        const handled = await happyAgentProxyHandle({
                            client: active.connection.client,
                            method: request.method ?? "GET",
                            nativeWorkspaceOwner: true,
                            path: bridgePath,
                            query: url.searchParams,
                            request,
                            response,
                            onConnectionError: (error) => runtimeInvalidate(error, pending),
                        });
                        if (!handled && !response.headersSent) next();
                    } catch (error) {
                        runtimeInvalidate(error, pending);
                        if (!response.headersSent) json(response, 503, { error: message(error) });
                    }
                    return;
                }
                next();
            });
            server.httpServer?.once("close", () => {
                terminals.close();
                void runtimeTask?.then(({ connection }) => connection.close());
            });
        },
    };
}

function message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

async function desktopConfigActionHandle(
    action: string,
    input: unknown,
    desktopConfig: () => Promise<DesktopConfigStore>,
): Promise<{ readonly handled: boolean; readonly value?: unknown }> {
    switch (action) {
        case "desktopConfigGet":
            return { handled: true, value: (await desktopConfig()).get() };
        case "desktopConfigWrite":
            await (await desktopConfig()).write(input);
            return { handled: true, value: undefined };
        default:
            return { handled: false };
    }
}

async function handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
    runtime: () => Promise<DevRuntime>,
    desktopConfig: () => Promise<DesktopConfigStore>,
): Promise<void> {
    try {
        const body = JSON.parse(await bodyRead(request)) as { action?: string; input?: unknown };
        // Desktop config is a machine-local capability, so it is answered before
        // the daemon connection is required and stays available even while the
        // normal Happy Agent daemon is offline.
        const config = await desktopConfigActionHandle(
            body.action ?? "",
            body.input,
            desktopConfig,
        );
        if (config.handled) {
            json(response, 200, { value: config.value });
            return;
        }
        const active = await runtime();
        if (body.action !== "runtimeGet")
            throw new Error("The browser development bridge action is unsupported.");
        json(response, 200, {
            value: {
                activeTarget: {
                    authentication: "happyAgent",
                    detail: "Normal local Happy Agent daemon",
                    id: "browser-local",
                    kind: "local",
                    label: "Local browser",
                    mode: "local",
                    happyAgentVersion: active.connection.version,
                    happyAgentHttpUrl: endpoint,
                },
                activeTargetId: "browser-local",
                connectionId: 1,
                mode: "local",
                phase: "ready",
                targets: [],
                update: { status: "idle" },
            },
        });
    } catch (error) {
        json(response, 400, {
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

async function bodyRead(request: IncomingMessage): Promise<string> {
    let body = "";
    for await (const chunk of request) {
        body += chunk;
        if (body.length > maximumBridgeBodyBytes) throw new Error("The request body is too large.");
    }
    return body;
}

function json(response: ServerResponse, status: number, body: unknown): void {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
}
