import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import type { Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocketServer } from "ws";
import { describe, expect, it } from "vitest";
import { HappyAgentDaemonClient, HappyAgentDaemonHttpError } from "./happyAgentDaemonClient";
import { localAgentSocketPath } from "./localAgentSocketPath";

describe("local agent transport", () => {
    it("keeps Windows endpoint identity stable across casing and separators", () => {
        const path = localAgentSocketPath("C:\\Users\\steve\\.happy\\agent", "win32");
        expect(path).toBe(
            String.raw`\\.\pipe\happy-agent-f6bb7b3494ac2294a9709e06d6bc6179ffb98dc0778d486338146dcc74ce96f6`,
        );
        expect(localAgentSocketPath("c:/USERS/STEVE/.happy/agent/", "win32")).toBe(path);
        expect(localAgentSocketPath("C:/Users/steve/another-agent", "win32")).not.toBe(path);
    });

    it("authenticates HTTP and streams terminal WebSockets over the local transport", async () => {
        const directory = await mkdtemp(join(tmpdir(), "happy-desktop-transport-"));
        const socketPath =
            process.platform === "win32"
                ? String.raw`\\.\pipe\happy-desktop-test-` + randomUUID()
                : join(directory, "server.sock");
        const token = "local-transport-test-token";
        const paths: string[] = [];
        const server = createServer((request, response) => {
            if (request.headers.authorization !== "Bearer " + token) {
                response.writeHead(401).end();
                return;
            }
            paths.push(request.url ?? "");
            response.writeHead(200, { "content-type": "application/json" }).end('{"ok":true}');
        });
        const terminal = new WebSocketServer({ noServer: true });
        server.on("upgrade", (request, socket, head) => {
            if (request.headers.authorization !== "Bearer " + token) {
                socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
                return;
            }
            paths.push(request.url ?? "");
            terminal.handleUpgrade(request, socket, head, (connection) => {
                connection.on("message", (data) => connection.send(data));
            });
        });
        server.listen(socketPath);
        await once(server, "listening");
        try {
            const client = new HappyAgentDaemonClient({ socketPath, token });
            const response = await client.rawRequest({ method: "GET", path: "/v0/health" });
            const chunks: Buffer[] = [];
            for await (const chunk of response.body) chunks.push(Buffer.from(chunk));
            expect(response.statusCode).toBe(200);
            expect(Buffer.concat(chunks).toString()).toBe('{"ok":true}');
            const stream = await client.attachTerminal("workspace", "terminal");
            try {
                const echoed = once(stream, "data");
                stream.write(Buffer.from("native terminal echo"));
                expect(Buffer.from((await echoed)[0]).toString()).toBe("native terminal echo");
            } finally {
                stream.destroy();
            }
            const rejected = new HappyAgentDaemonClient({ socketPath, token: "wrong-token" });
            const unauthorized = await rejected.rawRequest({ method: "GET", path: "/v0/health" });
            unauthorized.body.resume();
            expect(unauthorized.statusCode).toBe(401);
            await expect(rejected.attachTerminal("workspace", "terminal")).rejects.toBeInstanceOf(
                HappyAgentDaemonHttpError,
            );
            expect(paths).toEqual([
                "/v0/health",
                "/v0/workspaces/workspace/terminals/terminal/attach",
            ]);
        } finally {
            for (const client of terminal.clients) client.terminate();
            terminal.close();
            server.closeAllConnections();
            await new Promise<void>((resolve) => server.close(() => resolve()));
            await rm(directory, { recursive: true, force: true });
        }
    });
    it("opens a dedicated proxy tunnel after ordinary requests warm the HTTP connection pool", async () => {
        const directory = await mkdtemp(join(tmpdir(), "happy-desktop-proxy-"));
        const socketPath =
            process.platform === "win32"
                ? String.raw`\\.\pipe\happy-desktop-test-` + randomUUID()
                : join(directory, "server.sock");
        const token = "local-proxy-test-token";
        const requestSockets: Socket[] = [];
        const sockets = new Set<Socket>();
        let tunnelSocket: Socket | undefined;
        let tunnelAuthorization: string | undefined;
        let tunnelPath: string | undefined;
        const server = createServer((request, response) => {
            requestSockets.push(request.socket);
            response.end("ready");
        });
        server.on("connection", (socket) => {
            sockets.add(socket);
            socket.once("close", () => sockets.delete(socket));
        });
        server.on("connect", (request, socket) => {
            tunnelSocket = request.socket;
            tunnelAuthorization = request.headers.authorization;
            tunnelPath = request.url;
            socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
            socket.on("data", (chunk) => socket.write(chunk));
        });
        server.listen(socketPath);
        await once(server, "listening");
        try {
            const client = new HappyAgentDaemonClient({ socketPath, token });
            for (let index = 0; index < 2; index += 1) {
                const response = await client.rawRequest({ method: "GET", path: "/v0/health" });
                for await (const _chunk of response.body) {
                    // Drain each response so its keep-alive connection becomes reusable.
                }
                await new Promise<void>((resolve) => setImmediate(resolve));
            }
            expect(requestSockets).toHaveLength(2);
            expect(requestSockets[1]).toBe(requestSockets[0]);
            const tunnel = await client.openWorkspaceHttpProxy("workspace");
            try {
                expect(tunnelSocket).toBeDefined();
                expect(tunnelSocket).not.toBe(requestSockets[0]);
                expect(tunnelAuthorization).toBe(`Bearer ${token}`);
                expect(tunnelPath).toBe("/v0/workspaces/workspace/proxy");
                const echoed = once(tunnel, "data");
                tunnel.write("dedicated tunnel echo");
                expect(Buffer.from((await echoed)[0]).toString()).toBe("dedicated tunnel echo");
            } finally {
                tunnel.destroy();
            }
        } finally {
            for (const socket of sockets) socket.destroy();
            await new Promise<void>((resolve) => server.close(() => resolve()));
            await rm(directory, { recursive: true, force: true });
        }
    });
});
