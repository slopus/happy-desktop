import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { once } from "node:events";
import { test } from "node:test";
import { offlineStageInstall } from "./offline-stage.mjs";
import { nativeCredentialPrepare } from "../scenario/native-credential.mjs";

test("full-app transport preserves HTTP bodies, SSE delivery and cancellation through Unix", async () => {
    const root = await mkdtemp(resolve(".s-"));
    const socketPath = join(root, "s");
    const tokenPath = join(root, "token");
    await writeFile(tokenPath, "test-token");
    await writeFile(join(root, "index.html"), "<html><head></head><body>Real build</body></html>");
    let sse;
    let sseClose;
    const server = createServer(async (request, response) => {
        assert.equal(request.headers.authorization, "Bearer test-token");
        if (request.url === "/v0/events/stream") {
            sse = response;
            sseClose = once(response, "close");
            response.writeHead(200, { "content-type": "text/event-stream" });
            response.write("event: changed\ndata: first\n\n");
            return;
        }
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        response.writeHead(201, { "content-type": "application/json" });
        response.end(JSON.stringify({ path: request.url, body: Buffer.concat(chunks).toString() }));
    });
    const originalWindow = globalThis.window;
    const frame = {};
    const page = { mainFrame: () => frame, evaluate: async (fn, value) => fn(value) };
    let staticRoute;
    let fallbackRequests = 0;
    globalThis.window = {
        fetch: async () => {
            fallbackRequests++;
            return new Response("outside");
        },
    };
    const context = {
        async exposeBinding(name, handler) {
            window[name] = (value) => handler({ page, frame }, value);
        },
        async addInitScript(fn, args) {
            fn(args);
        },
        async route(_pattern, handler) {
            staticRoute = handler;
        },
        async routeWebSocket() {},
    };
    let stage;
    try {
        server.listen(socketPath);
        await once(server, "listening");
        stage = await offlineStageInstall({
            context,
            directory: root,
            socketPath,
            tokenPath,
            healthRead: async () => ({ ready: true, version: { daemon: "test-preview" } }),
            desktopConfig: { version: 1 },
        });
        const endpoint = `${stage.url}/__happy_local_happy_agent`;
        const response = await window.fetch(`${endpoint}/v0/example?cursor=1`, {
            method: "POST",
            body: "hello ✓",
        });
        assert.equal(response.status, 201);
        assert.deepEqual(await response.json(), { path: "/v0/example?cursor=1", body: "hello ✓" });
        assert.deepEqual(await (await window.fetch(`${endpoint}/health`)).json(), {
            status: "ready",
            version: "test-preview",
        });
        const action = (action, input) =>
            window.fetch(endpoint, { method: "POST", body: JSON.stringify({ action, input }) });
        await (await action("desktopConfigWrite", { version: 1, appearance: "dark" })).json();
        assert.deepEqual(await (await action("desktopConfigGet")).json(), {
            value: { version: 1, appearance: "dark" },
        });
        assert.equal((await action("unsupportedNativeAction")).status, 400);
        const controller = new AbortController();
        const stream = await window.fetch(`${endpoint}/v0/events/stream`, {
            signal: controller.signal,
        });
        const reader = stream.body.getReader();
        assert.equal(
            new TextDecoder().decode((await reader.read()).value),
            "event: changed\ndata: first\n\n",
        );
        sse.write("event: changed\ndata: second\n\n");
        assert.equal(
            new TextDecoder().decode((await reader.read()).value),
            "event: changed\ndata: second\n\n",
        );
        controller.abort();
        await assert.rejects(reader.read(), { name: "AbortError" });
        await sseClose;
        await window.fetch("https://outside.invalid/example");
        assert.equal(fallbackRequests, 1);
        let delivered;
        await staticRoute({
            request: () => ({ url: () => stage.url }),
            fulfill: async (value) => {
                delivered = value;
            },
        });
        assert.match(delivered.body.toString(), /<meta name="happy-browser-local" content="1">/);
        await staticRoute({
            request: () => ({
                url: () => `${endpoint}/v0/projects/example/avatar`,
                resourceType: () => "image",
            }),
            fulfill: async (value) => {
                delivered = value;
            },
        });
        assert.deepEqual(JSON.parse(delivered.body.toString()), {
            path: "/v0/projects/example/avatar",
            body: "",
        });
        let aborted = false;
        await staticRoute({
            request: () => ({ url: () => "https://outside.invalid/" }),
            abort: () => {
                aborted = true;
            },
        });
        assert.equal(aborted, true);
    } finally {
        stage?.close();
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
        globalThis.window = originalWindow;
        await rm(root, { recursive: true, force: true });
    }
});

test("native credential copy verifies identity, excludes refresh and preserves source", async () => {
    const root = await mkdtemp(resolve(".c-"));
    try {
        const source = join(root, "source.json");
        const home = join(root, "private");
        const token = (email) =>
            `header.${Buffer.from(JSON.stringify({ email })).toString("base64url")}.signature`;
        const original = JSON.stringify({
            tokens: {
                access_token: token("demo@example.com"),
                id_token: token("demo@example.com"),
                refresh_token: "never-copy-this",
                account_id: "demo-account",
            },
        });
        await writeFile(source, original);
        await mkdir(home);
        await assert.rejects(
            nativeCredentialPrepare({ source, expectedEmail: "other@example.com", home }),
            /could not be verified/,
        );
        const cleanup = await nativeCredentialPrepare({
            source,
            expectedEmail: "demo@example.com",
            home,
        });
        const copy = JSON.parse(await readFile(join(home, ".codex/auth.json"), "utf8"));
        assert.equal(copy.tokens.refresh_token, undefined);
        assert.equal(copy.tokens.account_id, "demo-account");
        assert.equal(await readFile(source, "utf8"), original);
        await cleanup();
        await assert.rejects(readFile(join(home, ".codex/auth.json")), { code: "ENOENT" });
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
