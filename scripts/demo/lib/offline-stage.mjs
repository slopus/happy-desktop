import { request as httpRequest } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const origin = "https://happy-demo.invalid";
const endpoint = "/__happy_local_happy_agent";

/** Browser half of a byte-transparent transport, including the native SSE body. */
export function offlineTransportInstall({ origin, endpoint }) {
    const nativeFetch = window.fetch.bind(window);
    const streams = new Map();
    const lifetime = crypto.randomUUID();
    let nextId = 0;
    window.__happyDemoStream = ({ id, bytes, ended, error }) => {
        const stream = streams.get(id);
        if (!stream) return;
        if (error) stream.controller.error(new Error(error));
        else if (ended) stream.controller.close();
        else
            stream.controller.enqueue(
                Uint8Array.from(atob(bytes), (character) => character.charCodeAt(0)),
            );
        if (error || ended) {
            stream.cleanup();
            streams.delete(id);
        }
    };
    window.fetch = async (input, init) => {
        const request = new Request(input, init);
        const url = new URL(request.url);
        if (
            url.origin !== origin ||
            !(url.pathname === endpoint || url.pathname.startsWith(`${endpoint}/`))
        )
            return nativeFetch(input, init);
        if (request.signal.aborted) throw request.signal.reason;
        const id = `${lifetime}:${++nextId}`;
        const abort = () => {
            streams.get(id)?.controller.error(request.signal.reason);
            cleanup();
            streams.delete(id);
            void window.__happyDemoCancel(id);
        };
        const cleanup = () => request.signal.removeEventListener("abort", abort);
        const body = new ReadableStream({
            start(controller) {
                streams.set(id, { controller, cleanup });
            },
            cancel() {
                cleanup();
                streams.delete(id);
                return window.__happyDemoCancel(id);
            },
        });
        request.signal.addEventListener("abort", abort, { once: true });
        try {
            const bytes = new Uint8Array(await request.arrayBuffer());
            let binary = "";
            for (const byte of bytes) binary += String.fromCharCode(byte);
            const response = await window.__happyDemoRequest({
                id,
                method: request.method,
                path: `${url.pathname}${url.search}`,
                headers: [...request.headers],
                body: btoa(binary),
            });
            // The owning request's abort lifetime remains the response-stream lifetime.
            return new Response([204, 205, 304].includes(response.status) ? null : body, response);
        } catch (error) {
            request.signal.removeEventListener("abort", abort);
            streams.delete(id);
            void window.__happyDemoCancel(id);
            throw error;
        }
    };
}

/**
 * Loads the full built product, not a second UI. Only the browser-development
 * transport is replaced: HTTP bytes cross the private daemon's Unix socket,
 * and SSE bytes retain their actual order/timing. No HTTP listener is opened.
 */
export async function offlineStageInstall({
    context,
    directory,
    socketPath,
    tokenPath,
    healthRead,
    desktopConfig,
}) {
    const root = resolve(directory);
    const authorization = `Bearer ${(await readFile(tokenPath, "utf8")).trim()}`;
    const requests = new Map();
    let configuration = desktopConfig;
    const send = (page, packet) =>
        page.evaluate((value) => window.__happyDemoStream(value), packet);
    const sourceCheck = ({ page, frame }) => {
        if (frame !== page.mainFrame())
            throw new Error("Only the recording's main frame may use its daemon transport.");
    };
    await context.exposeBinding("__happyDemoCancel", (source, id) => {
        sourceCheck(source);
        requests.get(id)?.destroy();
        requests.delete(id);
    });
    await context.exposeBinding("__happyDemoRequest", async (source, input) => {
        sourceCheck(source);
        const { page } = source;
        const url = new URL(input.path, origin);
        if (
            url.origin !== origin ||
            !(url.pathname === endpoint || url.pathname.startsWith(`${endpoint}/`))
        )
            throw new Error("Request is outside the private recording transport.");
        const reply = (status, value) => {
            void (async () => {
                await send(page, {
                    id: input.id,
                    bytes: Buffer.from(JSON.stringify(value)).toString("base64"),
                });
                await send(page, { id: input.id, ended: true });
            })().catch(() => undefined);
            return { status, headers: { "content-type": "application/json" } };
        };
        if (url.pathname === endpoint && input.method === "POST") {
            const { action, input: value } = JSON.parse(
                Buffer.from(input.body, "base64").toString("utf8"),
            );
            if (action === "desktopConfigGet") return reply(200, { value: configuration });
            if (action === "desktopConfigWrite") {
                configuration = value;
                return reply(200, {});
            }
            if (action === "runtimeGet")
                return reply(200, {
                    value: {
                        activeTarget: {
                            authentication: "happyAgent",
                            detail: "Isolated recording daemon",
                            id: "browser-local",
                            kind: "local",
                            label: "Local browser",
                            mode: "local",
                            happyAgentVersion: (await healthRead()).version.daemon,
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
            return reply(400, { error: "This recording uses no native desktop action." });
        }
        const path = url.pathname.slice(endpoint.length);
        if (path === "/health") {
            const health = await healthRead();
            return reply(200, {
                status: health.ready ? "ready" : "starting",
                version: health.version.daemon,
            });
        }
        if (path === "/open-in-targets") return reply(200, []);
        if (!path.startsWith("/v0/"))
            return reply(404, { error: "Route outside the recorded app scenario." });
        return new Promise((resolveResponse, rejectResponse) => {
            const headers = Object.fromEntries(input.headers);
            delete headers.host;
            delete headers["content-length"];
            const request = httpRequest(
                {
                    socketPath,
                    path: `${path}${url.search}`,
                    method: input.method,
                    headers: { ...headers, authorization },
                },
                async (response) => {
                    const responseHeaders = Object.fromEntries(
                        Object.entries(response.headers)
                            .filter(
                                ([key, value]) =>
                                    value !== undefined &&
                                    !["content-length", "transfer-encoding", "connection"].includes(
                                        key,
                                    ),
                            )
                            .map(([key, value]) => [
                                key,
                                Array.isArray(value) ? value.join(", ") : value,
                            ]),
                    );
                    resolveResponse({ status: response.statusCode, headers: responseHeaders });
                    try {
                        for await (const chunk of response)
                            await send(page, {
                                id: input.id,
                                bytes: Buffer.from(chunk).toString("base64"),
                            });
                        await send(page, { id: input.id, ended: true });
                    } catch {
                        await send(page, {
                            id: input.id,
                            error: "The isolated daemon response ended unexpectedly.",
                        }).catch(() => undefined);
                    } finally {
                        requests.delete(input.id);
                    }
                },
            );
            requests.set(input.id, request);
            request.once("error", (error) => {
                requests.delete(input.id);
                rejectResponse(error);
            });
            request.end(Buffer.from(input.body, "base64"));
        });
    });
    await context.addInitScript(offlineTransportInstall, { origin, endpoint });
    await context.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort();
        // Product avatars use normal <img> requests rather than window.fetch.
        // They still come from this exact daemon, never the recording fixture.
        if (
            url.pathname.startsWith(`${endpoint}/v0/`) &&
            route.request().resourceType() === "image"
        ) {
            const id = crypto.randomUUID();
            try {
                const resource = await new Promise((settle, reject) => {
                    const request = httpRequest(
                        {
                            socketPath,
                            path: `${url.pathname.slice(endpoint.length)}${url.search}`,
                            method: "GET",
                            headers: { authorization },
                        },
                        async (response) => {
                            try {
                                const chunks = [];
                                for await (const chunk of response) chunks.push(chunk);
                                settle({
                                    status: response.statusCode,
                                    contentType:
                                        response.headers["content-type"] ??
                                        "application/octet-stream",
                                    body: Buffer.concat(chunks),
                                });
                            } catch (error) {
                                reject(error);
                            }
                        },
                    );
                    requests.set(id, request);
                    request.once("error", reject);
                    request.end();
                });
                await route.fulfill(resource);
            } catch {
                await route.abort();
            } finally {
                requests.delete(id);
            }
            return;
        }
        const path = resolve(
            root,
            `.${decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname)}`,
        );
        if (!path.startsWith(`${root}${sep}`)) return route.abort();
        try {
            let body = await readFile(path);
            if (path === resolve(root, "index.html"))
                body = Buffer.from(
                    body
                        .toString("utf8")
                        .replace("<head>", '<head><meta name="happy-browser-local" content="1">'),
                );
            const types = {
                ".html": "text/html",
                ".js": "text/javascript",
                ".css": "text/css",
                ".json": "application/json",
                ".wasm": "application/wasm",
                ".woff2": "font/woff2",
                ".ttf": "font/ttf",
                ".png": "image/png",
                ".svg": "image/svg+xml",
                ".jpg": "image/jpeg",
                ".mp4": "video/mp4",
            };
            await route.fulfill({
                body,
                contentType: types[extname(path)] ?? "application/octet-stream",
            });
        } catch {
            await route.abort();
        }
    });
    await context.routeWebSocket("**/*", (socket) => socket.close());
    return {
        url: origin,
        close() {
            for (const request of requests.values()) request.destroy();
            requests.clear();
        },
    };
}
