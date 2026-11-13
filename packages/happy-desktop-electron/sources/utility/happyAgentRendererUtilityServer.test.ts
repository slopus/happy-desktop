import { createServer, request as httpRequest, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { performance } from "node:perf_hooks";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { happyAgentRendererUtilityServerCreate } from "./happyAgentRendererUtilityServer";

function daemonSocketPath(directory: string): string {
    return process.platform === "win32"
        ? `\\\\.\\pipe\\${basename(directory)}-daemon`
        : join(directory, "daemon.sock");
}

describe("isolated Happy Agent HTTP transport", () => {
    let isolated: Awaited<ReturnType<typeof happyAgentRendererUtilityServerCreate>> | undefined;
    let daemon: Server | undefined;
    let bridge: Server | undefined;
    let directory: string | undefined;

    afterEach(async () => {
        isolated?.close();
        await Promise.all(
            [daemon, bridge]
                .filter((server): server is Server => !!server)
                .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
        );
        if (directory) await rm(directory, { recursive: true, force: true });
        isolated = undefined;
        daemon = undefined;
        bridge = undefined;
        directory = undefined;
    });

    const get = (path: string, auth: string, origin?: string) => {
        const request = httpRequest({
            host: "127.0.0.1",
            port: isolated!.port,
            path: `http://happy-agent${path}`,
            headers: {
                host: "happy-agent",
                "proxy-authorization": auth,
                ...(origin ? { origin } : {}),
            },
        });
        const reply = new Promise<{ status: number; body: string }>((resolve, reject) => {
            request.once("response", async (response) => {
                try {
                    let body = "";
                    for await (const chunk of response) body += String(chunk);
                    resolve({ status: response.statusCode ?? 0, body });
                } catch (error) {
                    reject(error);
                }
            });
            request.once("error", reject);
        });
        request.end();
        return reply;
    };

    it("serves daemon bytes without the native bridge, keeps local routes scoped, and swaps clients", async () => {
        directory = await mkdtemp(join(tmpdir(), "happy-utility-"));
        const socket = daemonSocketPath(directory);
        const forwarded = vi.fn();
        daemon = createServer((request, response) => {
            forwarded(request.url, request.headers.authorization);
            response.writeHead(200, { "content-type": "text/plain" });
            response.write("first");
            response.end("second");
        });
        await new Promise<void>((resolve) => daemon!.listen(socket, resolve));
        const local = vi.fn();
        bridge = createServer((request, response) => {
            local(request.url);
            response.end("native");
        });
        await new Promise<void>((resolve) => bridge!.listen(0, "127.0.0.1", resolve));
        const bridgeUrl = `http://127.0.0.1:${String((bridge.address() as AddressInfo).port)}/cap`;
        const events = vi.fn();
        isolated = await happyAgentRendererUtilityServerCreate(events, true);
        await isolated.receive({
            type: "backing",
            id: 1,
            bridgeUrl,
            terminalCapability: "cap",
            transport: { socketPath: socket, token: "first-token" },
        });
        const auth = `Basic ${Buffer.from(`${isolated.username}:${isolated.password}`).toString("base64")}`;
        expect((await get("/v0/history", "Basic wrong")).status).toBe(407);
        expect((await get("/v0/history", auth, "https://untrusted.example")).status).toBe(403);
        expect(forwarded).not.toHaveBeenCalled();
        expect(await get("/v0/history", auth)).toEqual({ status: 200, body: "firstsecond" });
        expect(forwarded).toHaveBeenCalledWith("/v0/history", "Bearer first-token");
        expect(local).not.toHaveBeenCalled();
        expect(await get("/open-in-targets", auth)).toEqual({ status: 200, body: "native" });
        expect(local).toHaveBeenCalledWith("/cap/open-in-targets");
        expect((await get("/unapproved", auth)).status).toBe(404);
        expect(local).toHaveBeenCalledOnce();

        await isolated.receive({
            type: "backing",
            id: 2,
            bridgeUrl,
            terminalCapability: "cap",
            transport: { socketPath: socket, token: "replacement-token" },
        });
        expect(await get("/v0/history", auth)).toEqual({ status: 200, body: "firstsecond" });
        expect(forwarded).toHaveBeenLastCalledWith("/v0/history", "Bearer replacement-token");
        expect(events.mock.calls.filter(([event]) => event.type === "debug")).toEqual([]);
    });

    it("preserves backpressure and aborts the daemon stream when the renderer disconnects", async () => {
        directory = await mkdtemp(join(tmpdir(), "happy-utility-stream-"));
        const socket = daemonSocketPath(directory);
        const chunk = Buffer.alloc(64 * 1024, 0x61);
        let generated = 0;
        let cancelled = false;
        daemon = createServer((request, response) => {
            response.writeHead(200, { "content-type": "application/octet-stream" });
            if (request.url === "/v0/abort") {
                response.write("begin");
                response.once("close", () => {
                    cancelled = !response.writableFinished;
                });
                return;
            }
            void (async () => {
                for (let index = 0; index < 512; index++) {
                    generated++;
                    if (!response.write(chunk))
                        await new Promise<void>((resolve) => response.once("drain", resolve));
                }
                response.end();
            })();
        });
        await new Promise<void>((resolve) => daemon!.listen(socket, resolve));
        isolated = await happyAgentRendererUtilityServerCreate(() => undefined, false);
        await isolated.receive({
            type: "backing",
            id: 1,
            bridgeUrl: "http://127.0.0.1:9/cap",
            terminalCapability: "cap",
            transport: { socketPath: socket, token: "private-token" },
        });
        const auth = `Basic ${Buffer.from(`${isolated.username}:${isolated.password}`).toString("base64")}`;
        const fetchStream = (path: string) =>
            new Promise<import("node:http").IncomingMessage>((resolve, reject) => {
                const outgoing = httpRequest({
                    host: "127.0.0.1",
                    port: isolated!.port,
                    path: `http://happy-agent${path}`,
                    headers: { host: "happy-agent", "proxy-authorization": auth },
                });
                outgoing.once("response", resolve);
                outgoing.once("error", reject);
                outgoing.end();
            });
        const streaming = await fetchStream("/v0/large");
        streaming.pause();
        await vi.waitFor(() => expect(generated).toBeGreaterThan(2));
        expect(generated).toBeLessThan(512);
        let received = 0;
        const complete = new Promise<void>((resolve, reject) => {
            streaming.on("data", (data: Buffer) => {
                received += data.byteLength;
            });
            streaming.once("end", resolve);
            streaming.once("error", reject);
        });
        streaming.resume();
        await complete;
        expect(received).toBe(512 * chunk.byteLength);

        const aborting = await fetchStream("/v0/abort");
        aborting.destroy();
        await vi.waitFor(() => expect(cancelled).toBe(true));
    });

    it("opens Happy Cloud sites through main with no Happy Agent, and nothing else without one", async () => {
        const events = vi.fn();
        isolated = await happyAgentRendererUtilityServerCreate(events, false);
        const auth = `Basic ${Buffer.from(`${isolated.username}:${isolated.password}`).toString("base64")}`;
        const asked = () =>
            events.mock.calls
                .map(([event]) => event as { type: string; requestId?: number })
                .filter((event) => event.type === "cloud-site-open");

        const vault = get("/connections/cloud-acme/vault-app?surfaceId=s&fileId=f&version=3", auth);
        await vi.waitFor(() => expect(asked()).toHaveLength(1));
        expect(asked()[0]).toEqual({
            type: "cloud-site-open",
            requestId: 1,
            connectionId: "cloud-acme",
            site: { kind: "vault", surfaceId: "s", fileId: "f", version: 3 },
        });
        await isolated.receive({
            type: "cloud-site-opened",
            requestId: 1,
            url: "happy-artifact://vault-a-v3.cabc/index.html",
        });
        expect(await vault).toEqual({
            status: 200,
            body: JSON.stringify({ url: "happy-artifact://vault-a-v3.cabc/index.html" }),
        });

        const artifact = get("/connections/cloud-acme/artifact-site?artifactId=a&version=2", auth);
        await vi.waitFor(() => expect(asked()).toHaveLength(2));
        expect(asked()[1]).toMatchObject({
            connectionId: "cloud-acme",
            site: { kind: "artifact", artifactId: "a", version: 2 },
        });
        await isolated.receive({
            type: "cloud-site-refused",
            requestId: 2,
            status: 403,
            error: "Sign in to this server to use it.",
        });
        expect(await artifact).toEqual({
            status: 403,
            body: JSON.stringify({ error: "Sign in to this server to use it." }),
        });

        expect(await get("/connections/cloud-acme/vault-app?surfaceId=s&version=3", auth)).toEqual({
            status: 400,
            body: JSON.stringify({ error: "fileId is required." }),
        });
        expect(
            (
                await get(
                    "/connections/cloud-acme/vault-app?surfaceId=s&fileId=f&version=3",
                    auth,
                    "https://untrusted.example",
                )
            ).status,
        ).toBe(403);
        // Every other desktop service still needs Happy Agent, a host
        // connection's apps included.
        for (const path of [
            "/open-in-targets",
            "/vault-app?surfaceId=s&fileId=f&version=3",
            "/connections/team/vault-app?surfaceId=s&fileId=f&version=3",
            "/connections/cloud-acme/html-preview?workspaceId=w&path=a.html",
        ])
            expect(await get(path, auth)).toEqual({
                status: 503,
                body: JSON.stringify({
                    error: "Happy Agent isn't running on this computer.",
                    code: "local_unavailable",
                }),
            });
        expect(asked()).toHaveLength(2);
    });

    if (process.env.HAPPY_TRANSPORT_BENCH === "1")
        it("measures 100 local 1 MiB responses (Node fixture, not Electron)", async () => {
            directory = await mkdtemp(join(tmpdir(), "happy-utility-bench-"));
            const socket = daemonSocketPath(directory);
            const bytes = Buffer.alloc(1024 * 1024, 0x61);
            daemon = createServer((_request, response) =>
                response.writeHead(200, { "content-length": bytes.byteLength }).end(bytes),
            );
            await new Promise<void>((resolve) => daemon!.listen(socket, resolve));
            isolated = await happyAgentRendererUtilityServerCreate(() => undefined, false);
            await isolated.receive({
                type: "backing",
                id: 1,
                bridgeUrl: "http://127.0.0.1:9/cap",
                terminalCapability: "cap",
                transport: { socketPath: socket, token: "fixture-token" },
            });
            const auth = `Basic ${Buffer.from(`${isolated.username}:${isolated.password}`).toString("base64")}`;
            const samples: number[] = [];
            for (let index = 0; index < 100; index++) {
                const start = performance.now();
                const response = await get("/v0/history", auth);
                expect(response.status).toBe(200);
                expect(response.body.length).toBe(bytes.byteLength);
                samples.push(performance.now() - start);
            }
            samples.sort((left, right) => left - right);
            console.log(
                `Node isolated HTTP fixture, 100 x 1 MiB: p50=${samples[49]!.toFixed(1)}ms ` +
                    `p95=${samples[94]!.toFixed(1)}ms max=${samples[99]!.toFixed(1)}ms`,
            );
        }, 30_000);
});
