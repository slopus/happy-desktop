import { createServer, request as httpRequest, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket, WebSocketServer } from "ws";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CreateLiveSessionRequest, LiveSession } from "@slopus/happy-agent-client";
import { happyAgentRendererUtilityServerCreate } from "./happyAgentRendererUtilityServer";
import { HAPPY_AGENT_LIVE_WINDOW_HEADER, happyAgentLiveRoute } from "../main/happyAgentLiveRoute";
import { localAgentSocketPath } from "../main/localAgentSocketPath";

function createBody(id = "liveone", windowId = "window-a"): CreateLiveSessionRequest {
    return {
        id,
        windowId,
        sdp: "offer-sdp",
        credential: { type: "codex_subscription", providerId: "codex-selected" },
        contextRevision: 1,
        context: {
            windowId,
            connections: [],
            activeConnectionId: null,
            activeTarget: null,
            projects: [],
            workspaces: [],
            sessions: [],
            bots: [],
            activeSession: null,
            truncated: false,
        },
    };
}

function session(body: CreateLiveSessionRequest): LiveSession {
    return {
        id: body.id!,
        windowId: body.windowId,
        credential: body.credential,
        contextRevision: 1,
        status: "active",
        usage: { seconds: null, final: false },
        error: null,
        createdAt: 1,
        updatedAt: 1,
        endedAt: null,
        version: "version-one",
    };
}

describe("native GPT-Live transport over the authenticated utility and daemon socket", () => {
    let isolated: Awaited<ReturnType<typeof happyAgentRendererUtilityServerCreate>> | undefined;
    let daemon: Server | undefined;
    let directory: string | undefined;
    let daemonSockets: WebSocketServer | undefined;
    const rendererSockets = new Set<WebSocket>();

    afterEach(async () => {
        for (const socket of rendererSockets) socket.terminate();
        rendererSockets.clear();
        isolated?.close();
        for (const socket of daemonSockets?.clients ?? []) socket.terminate();
        daemonSockets?.close();
        await new Promise<void>((resolve) => (daemon ? daemon.close(() => resolve()) : resolve()));
        if (directory) await rm(directory, { recursive: true, force: true });
        isolated = undefined;
        daemon = undefined;
        directory = undefined;
        daemonSockets = undefined;
    });

    async function fixture(creationWait?: Promise<void>) {
        directory = await mkdtemp(join(tmpdir(), "happy-native-live-"));
        const socketPath = localAgentSocketPath(directory);
        const resources = new Map<string, LiveSession>();
        const requests = vi.fn();
        daemon = createServer(async (request, response) => {
            const url = new URL(request.url!, "http://happy-agent");
            const route = happyAgentLiveRoute(url.pathname)!;
            let bytes = "";
            for await (const chunk of request) bytes += String(chunk);
            requests(request.method, request.url, request.headers, bytes);
            const key = `${route.connectionId ?? ""}/${route.id}`;
            response.setHeader("content-type", "application/json");
            if (route.action === "create") {
                const body = JSON.parse(bytes) as CreateLiveSessionRequest;
                const existing = resources.get(`${route.connectionId ?? ""}/${body.id}`);
                if (existing) {
                    response.writeHead(409).end(
                        JSON.stringify({
                            code: "conflict",
                            error: "Existing resource.",
                            session: existing,
                        }),
                    );
                    return;
                }
                await creationWait;
                const resource = session(body);
                resources.set(`${route.connectionId ?? ""}/${body.id}`, resource);
                response.end(
                    JSON.stringify({
                        session: resource,
                        transport: { type: "webrtc", sdp: "answer-sdp" },
                    }),
                );
            } else if (!resources.has(key))
                response
                    .writeHead(404)
                    .end(JSON.stringify({ code: "not_found", error: "No resource." }));
            else {
                const resource = resources.get(key)!;
                if (route.action === "close")
                    resources.set(key, { ...resource, status: "closing" });
                response.end(JSON.stringify({ session: resources.get(key) }));
            }
        });
        daemonSockets = new WebSocketServer({ noServer: true });
        const upgrades = vi.fn();
        const received = vi.fn();
        daemon.on("upgrade", (request, socket, head) => {
            upgrades(request.url, request.headers);
            daemonSockets!.handleUpgrade(request, socket, head, (connection) => {
                connection.send('{"type":"status","status":"active","error":null}');
                connection.on("message", (data, isBinary) => {
                    received(data.toString(), isBinary);
                    connection.send(data, { binary: isBinary });
                });
            });
        });
        await new Promise<void>((resolve, reject) => {
            daemon!.once("error", reject);
            daemon!.listen(socketPath, resolve);
        });
        isolated = await happyAgentRendererUtilityServerCreate((message) => {
            if (message.type === "live-attempt-reserve")
                void isolated!.receive({
                    type: "live-attempt-reserved",
                    reservationId: message.reservationId,
                    allowed: true,
                });
        }, false);
        await isolated.receive({
            type: "backing",
            id: 1,
            bridgeUrl: "http://127.0.0.1:9/cap",
            terminalCapability: "cap",
            transport: { socketPath, token: "daemon-private-token" },
        });
        await isolated.receive({ type: "live-window-start", windowId: "window-a" });
        await isolated.receive({ type: "live-window-start", windowId: "window-b" });
        return { requests, upgrades, received, resources };
    }

    function auth() {
        return `Basic ${Buffer.from(`${isolated!.username}:${isolated!.password}`).toString("base64")}`;
    }

    function outgoing(
        path: string,
        method = "GET",
        windowId: string | undefined = "window-a",
        extra = {},
    ) {
        return httpRequest({
            host: "127.0.0.1",
            port: isolated!.port,
            path: `http://happy-agent${path}`,
            method,
            headers: {
                host: "happy-agent",
                "proxy-authorization": auth(),
                "content-type": "application/json",
                ...(windowId ? { [HAPPY_AGENT_LIVE_WINDOW_HEADER]: windowId } : {}),
                ...extra,
            },
        });
    }

    function reply(request: ReturnType<typeof outgoing>) {
        return new Promise<{ status: number; body: string }>((resolve, reject) => {
            request.once("error", reject);
            request.once("response", async (response) => {
                let body = "";
                try {
                    for await (const chunk of response) body += String(chunk);
                    resolve({ status: response.statusCode!, body });
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    function http(
        path: string,
        method = "GET",
        windowId: string | undefined = "window-a",
        body?: unknown,
    ) {
        const request = outgoing(path, method, windowId);
        const result = reply(request);
        request.end(body === undefined ? undefined : JSON.stringify(body));
        return result;
    }

    function control(path: string, windowId = "window-a", origin = "null") {
        const socket = new WebSocket(`ws://127.0.0.1:${isolated!.port}${path}`, {
            headers: {
                host: "happy-agent",
                "proxy-authorization": auth(),
                [HAPPY_AGENT_LIVE_WINDOW_HEADER]: windowId,
                origin,
            },
        });
        rendererSockets.add(socket);
        return socket;
    }

    function rejected(socket: WebSocket) {
        return new Promise<number>((resolve, reject) => {
            socket.on("error", () => undefined);
            socket.once("open", () => reject(new Error("Unexpected accepted upgrade.")));
            socket.once("unexpected-response", (_request, response) => {
                response.resume();
                resolve(response.statusCode!);
                socket.terminate();
            });
        });
    }

    it("binds create/status/close/control to the actual window and peer namespace without forwarding internal headers", async () => {
        const f = await fixture();
        expect(
            (await http("/v0/live/sessions", "POST", "window-a", createBody("foreign", "window-b")))
                .status,
        ).toBe(400);
        const wrongContext = createBody();
        wrongContext.context.windowId = "window-b";
        expect((await http("/v0/live/sessions", "POST", "window-a", wrongContext)).status).toBe(
            400,
        );
        const missingId = createBody();
        delete missingId.id;
        expect((await http("/v0/live/sessions", "POST", "window-a", missingId)).status).toBe(400);
        expect(f.requests).not.toHaveBeenCalled();
        const created = await http("/v0/live/sessions", "POST", "window-a", createBody());
        expect(created.status).toBe(201);
        expect(created.body).not.toContain("daemon-private-token");
        expect((await http("/v0/live/sessions/liveone", "GET", "window-b")).status).toBe(403);
        expect((await http("/v0/live/sessions/liveone/close", "POST", "window-b", {})).status).toBe(
            403,
        );
        expect((await http("/v0/%6cive/sessions/liveone", "GET", "window-b")).status).toBe(403);
        expect(
            await rejected(
                control("/v0/live/sessions/liveone/control?windowId=window-a", "window-b"),
            ),
        ).toBe(403);
        expect(await rejected(control("/v0/live/sessions/liveone/control?windowId=window-b"))).toBe(
            403,
        );
        expect(
            await rejected(
                control("/v0/live/sessions/liveone/control?windowId=window-a&windowId=window-a"),
            ),
        ).toBe(403);
        expect(
            await rejected(
                control(
                    "/v0/live/sessions/liveone/control?windowId=window-a",
                    "window-a",
                    "https://hostile.example",
                ),
            ),
        ).toBe(403);
        expect(f.upgrades).not.toHaveBeenCalled();
        expect((await http("/v0/live/sessions", "POST", "window-a", createBody())).status).toBe(
            409,
        );
        expect(
            (await http("/v0/live/sessions", "POST", "window-b", createBody("liveone", "window-b")))
                .status,
        ).toBe(409);
        expect(f.requests).toHaveBeenCalledOnce();
        const remote = "/v0/connections/node-a/api/v0/live/sessions";
        expect((await http(remote, "POST", "window-a", createBody())).status).toBe(201);
        expect((await http(`${remote}/liveone`, "GET", "window-b")).status).toBe(403);
        expect((await http(`${remote}/liveone`, "GET")).status).toBe(200);
        expect((await http("/v0/live/sessions/liveone", "GET")).status).toBe(200);
        const closed = await http("/v0/live/sessions/liveone/close", "POST", "window-a", {});
        expect(JSON.parse(closed.body).session).toMatchObject({
            status: "closing",
            usage: { final: false },
        });
        for (const call of f.requests.mock.calls) {
            expect(call[2].authorization).toBe("Bearer daemon-private-token");
            expect(call[2][HAPPY_AGENT_LIVE_WINDOW_HEADER]).toBeUndefined();
            expect(call[2]["proxy-authorization"]).toBeUndefined();
        }
    });

    it("relays text frames in both directions, keeps settlement alive after close RPC, and tears down on window disposal", async () => {
        const f = await fixture();
        await http("/v0/live/sessions", "POST", "window-a", createBody());
        const socket = control("/v0/live/sessions/liveone/control?windowId=window-a");
        const messages: { text: string; binary: boolean }[] = [];
        socket.on("message", (data, binary) => messages.push({ text: data.toString(), binary }));
        await new Promise<void>((resolve, reject) => {
            socket.once("open", resolve);
            socket.once("error", reject);
        });
        await vi.waitFor(() =>
            expect(messages).toContainEqual({
                text: '{"type":"status","status":"active","error":null}',
                binary: false,
            }),
        );
        const message =
            '{"type":"actionResult","actionId":"test","result":{"status":"succeeded","output":{"type":"ack"}}}';
        socket.send(message);
        await vi.waitFor(() => expect(f.received).toHaveBeenCalledWith(message, false));
        await vi.waitFor(() => expect(messages).toContainEqual({ text: message, binary: false }));
        expect(f.upgrades.mock.calls[0]![1].authorization).toBe("Bearer daemon-private-token");
        expect(f.upgrades.mock.calls[0]![1][HAPPY_AGENT_LIVE_WINDOW_HEADER]).toBeUndefined();
        await http("/v0/live/sessions/liveone/close", "POST", "window-a", {});
        expect(socket.readyState).toBe(WebSocket.OPEN);
        const closing = new Promise<void>((resolve) => socket.once("close", () => resolve()));
        await isolated!.receive({ type: "live-window-close", windowId: "window-a" });
        await closing;
        await vi.waitFor(() => expect(daemonSockets!.clients.size).toBe(0));
        expect(
            f.requests.mock.calls.every((call) => String(call[1]).includes("/live/sessions")),
        ).toBe(true);
    });

    it("never claims or closes a different window's daemon resource when a caller ID already exists", async () => {
        const f = await fixture();
        f.resources.set("/foreignknown", session(createBody("foreignknown", "outside-window")));
        const created = await http(
            "/v0/live/sessions",
            "POST",
            "window-a",
            createBody("foreignknown"),
        );
        expect(created.status).toBe(403);
        expect(created.body).not.toContain("outside-window");
        expect((await http("/v0/live/sessions/foreignknown", "GET")).status).toBe(403);
        expect(
            (await http("/v0/live/sessions/foreignknown/close", "POST", "window-a", {})).status,
        ).toBe(403);
        expect(
            await rejected(control("/v0/live/sessions/foreignknown/control?windowId=window-a")),
        ).toBe(403);
        await isolated!.receive({ type: "live-window-close", windowId: "window-a" });
        expect(f.resources.get("/foreignknown")?.status).toBe("active");
        expect(
            f.requests.mock.calls.some(
                (call) => call[0] === "POST" && String(call[1]).endsWith("/close"),
            ),
        ).toBe(false);
        expect(f.upgrades).not.toHaveBeenCalled();
    });

    it("cleans an uncertain creation by the original ID after renderer loss, without replaying it", async () => {
        let finish!: () => void;
        const creationWait = new Promise<void>((resolve) => {
            finish = resolve;
        });
        const f = await fixture(creationWait);
        const request = outgoing("/v0/live/sessions", "POST");
        request.on("error", () => undefined);
        request.end(JSON.stringify(createBody()));
        await vi.waitFor(() =>
            expect(
                f.requests.mock.calls.some(
                    (call) => call[0] === "POST" && call[1] === "/v0/live/sessions",
                ),
            ).toBe(true),
        );
        request.destroy();
        await isolated!.receive({ type: "live-window-close", windowId: "window-a" });
        await isolated!.receive({ type: "live-window-start", windowId: "window-a" });
        finish();
        await vi.waitFor(() => expect(f.resources.get("/liveone")?.status).toBe("closing"));
        expect(
            f.requests.mock.calls.filter((call) => call[1] === "/v0/live/sessions"),
        ).toHaveLength(1);
        expect((await http("/v0/live/sessions", "POST", "window-a", createBody())).status).toBe(
            409,
        );
        expect((await http("/v0/live/sessions/liveone", "GET")).status).toBe(403);
        expect(
            (await http("/v0/live/sessions", "POST", "window-a", createBody("livenext"))).status,
        ).toBe(201);
    });

    it("rejects an old document's incomplete create body after reload and a new explicit Start", async () => {
        const f = await fixture();
        const body = JSON.stringify(createBody());
        const request = outgoing("/v0/live/sessions", "POST", "window-a", {
            expect: "100-continue",
            "content-length": Buffer.byteLength(body),
        });
        const result = reply(request);
        const continued = new Promise<void>((resolve) => request.once("continue", resolve));
        request.flushHeaders();
        await continued;
        await isolated!.receive({ type: "live-window-close", windowId: "window-a" });
        await isolated!.receive({ type: "live-window-start", windowId: "window-a" });
        request.end(body);
        expect((await result).status).toBe(403);
        expect(f.requests).not.toHaveBeenCalled();
    });
});
