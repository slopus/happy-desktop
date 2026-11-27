import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, request as httpRequest, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { HappyAgentDeviceBridgeHostState } from "happy-desktop-state";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DeviceBridgeHost } from "./deviceBridgeHost";
import { happyAgentProxyHandle, type HappyAgentProxyClient } from "./happyAgentProxyHandle";

const servers: Server[] = [];

afterEach(async () => {
    await Promise.all(
        servers.splice(0).map(
            (server) =>
                new Promise<void>((resolve) => {
                    server.closeAllConnections();
                    server.close(() => resolve());
                }),
        ),
    );
});

const state: HappyAgentDeviceBridgeHostState = {
    usb: {
        available: true,
        devices: [
            {
                busId: "1-4",
                vendorId: "0a12",
                productId: "0001",
                name: "Bluetooth adapter",
                manufacturer: null,
                bluetooth: true,
            },
        ],
    },
    bridges: [],
};

function hostFake() {
    const stops = vi.fn();
    const host = {
        clientSet: vi.fn(),
        stateFollow: vi.fn(
            (_connectionId: string | undefined, listener: (value: typeof state) => void) => {
                listener(state);
                return stops;
            },
        ),
        usbAttach: vi.fn(async () => undefined),
        workspaceToLocalOpen: vi.fn(async () => undefined),
        localToWorkspaceOpen: vi.fn(async () => {
            throw new Error("Port 8080 on this computer is already in use.");
        }),
        bridgeClose: vi.fn(async () => undefined),
        close: vi.fn(async () => undefined),
    } satisfies DeviceBridgeHost;
    return { host, stops };
}

async function serverCreate(
    deviceBridges?: DeviceBridgeHost,
    fields: Partial<HappyAgentProxyClient> = {},
): Promise<string> {
    const client: HappyAgentProxyClient = {
        connection: () => client,
        ...fields,
    } as unknown as HappyAgentProxyClient;
    const server = createServer((request, response) => {
        const url = new URL(request.url ?? "/", "http://127.0.0.1");
        void happyAgentProxyHandle({
            client,
            method: request.method ?? "GET",
            path: url.pathname,
            query: url.searchParams,
            request,
            response,
            ...(deviceBridges ? { deviceBridges } : {}),
        }).then((handled) => {
            if (!handled) response.writeHead(404).end();
        });
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
}

async function post(url: string, body: unknown) {
    const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe("happyAgentProxyHandle bridge routes", () => {
    it("streams the host's state for the connection the route names until the reader leaves", async () => {
        const { host, stops } = hostFake();
        const base = await serverCreate(host);
        const first = await new Promise<string>((resolve, reject) => {
            const request = httpRequest(`${base}/connections/peer1/bridge-events`, (response) => {
                expect(response.statusCode).toBe(200);
                expect(response.headers["content-type"]).toBe("text/event-stream");
                response.setEncoding("utf8");
                response.once("data", (chunk: string) => {
                    resolve(chunk);
                    request.destroy();
                });
            });
            request.once("error", reject);
            request.end();
        });
        expect(first).toBe(`data: ${JSON.stringify(state)}\n\n`);
        expect(host.stateFollow).toHaveBeenCalledWith("peer1", expect.any(Function));
        await vi.waitFor(() => expect(stops).toHaveBeenCalledTimes(1));
    });

    it("opens bridges with validated requests and answers once they hold", async () => {
        const { host } = hostFake();
        const base = await serverCreate(host);
        expect(
            await post(`${base}/bridge-usb-attach`, {
                workspaceId: "w1",
                busId: "1-4",
                name: "Bluetooth\u0007 adapter",
            }),
        ).toEqual({ status: 200, body: {} });
        expect(host.usbAttach).toHaveBeenCalledWith(undefined, {
            workspaceId: "w1",
            busId: "1-4",
            name: "Bluetooth adapter",
        });
        expect(
            await post(`${base}/connections/peer1/bridge-port-open`, {
                workspaceId: "w1",
                workspacePort: 0,
                localPort: 3000,
            }),
        ).toEqual({ status: 200, body: {} });
        expect(host.workspaceToLocalOpen).toHaveBeenCalledWith("peer1", {
            workspaceId: "w1",
            workspacePort: 0,
            localPort: 3000,
        });
        expect(await post(`${base}/bridge-close`, { id: "b1" })).toEqual({ status: 200, body: {} });
        expect(host.bridgeClose).toHaveBeenCalledWith(undefined, "b1");
    });

    it("refuses a malformed request before it reaches the host, and says why a bridge failed", async () => {
        const { host } = hostFake();
        const base = await serverCreate(host);
        const invalid = await post(`${base}/bridge-port-open`, {
            workspaceId: "w1",
            workspacePort: 0,
            localPort: 0,
        });
        expect(invalid.status).toBeGreaterThanOrEqual(400);
        expect(invalid.body).toEqual({ error: "localPort must be a port number." });
        expect(host.workspaceToLocalOpen).not.toHaveBeenCalled();
        const busId = await post(`${base}/bridge-usb-attach`, {
            workspaceId: "w1",
            busId: "../1",
            name: "x",
        });
        expect(busId.body).toEqual({ error: "busId is invalid." });
        const failed = await post(`${base}/bridge-forward-open`, {
            workspaceId: "w1",
            localPort: 8080,
            workspacePort: 8080,
        });
        expect(failed.status).toBeGreaterThanOrEqual(400);
        expect(failed.body).toEqual({ error: "Port 8080 on this computer is already in use." });
    });

    it("answers a Happy Cloud connection's host services with 501, never reaching the host", async () => {
        const connection = vi.fn();
        const client = { connection } as unknown as HappyAgentProxyClient;
        const server = createServer((request, response) => {
            const url = new URL(request.url ?? "/", "http://127.0.0.1");
            void happyAgentProxyHandle({
                client,
                method: request.method ?? "GET",
                path: url.pathname,
                query: url.searchParams,
                request,
                response,
            });
        });
        servers.push(server);
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
        const base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
        for (const route of ["attachment", "attachment-source-reachable"])
            expect(
                await post(`${base}/connections/cloud-acme/${route}`, {
                    workspaceId: "w",
                    name: "a.txt",
                    content: "",
                }),
            ).toEqual({
                status: 501,
                body: {
                    error: "Happy Cloud doesn't offer this desktop service.",
                    code: "not_implemented",
                },
            });
        expect(connection).not.toHaveBeenCalled();
        // A host connection is still served as before.
        expect(
            await post(`${base}/connections/team/attachment-source-reachable`, { path: "/a" }),
        ).toEqual({ status: 200, body: { reachable: false } });
        expect(connection).toHaveBeenCalledWith("team");
    });

    it("says, as JSON, that a desktop without a bridge host cannot bridge", async () => {
        const base = await serverCreate();
        const response = await fetch(`${base}/bridge-events`);
        expect(response.status).toBe(501);
        expect(response.headers.get("content-type")).toBe("application/json");
    });
});

describe("happyAgentProxyHandle file-open routes", () => {
    let root: string;
    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), "happy-proxy-file-open-"));
    });
    afterEach(async () => {
        await rm(root, { recursive: true, force: true });
    });

    function workspaceRead(type: "host" | "container") {
        return vi.fn(async () => ({
            workspace: { compute: type === "host" ? { type, path: root } : { type } },
        }));
    }

    it("refuses a file on another machine before asking it about the workspace", async () => {
        const getWorkspace = workspaceRead("host");
        const base = await serverCreate(undefined, {
            getWorkspace,
        } as unknown as Partial<HappyAgentProxyClient>);
        for (const route of ["file-open", "file-open-applications"])
            expect(
                await post(`${base}/connections/team/${route}`, {
                    workspaceId: "w1",
                    path: "/tmp/sales-report.xlsx",
                    appId: "com.apple.Numbers",
                }),
            ).toEqual({
                status: 502,
                body: { error: "A file on another machine cannot be opened on this Mac." },
            });
        expect(getWorkspace).not.toHaveBeenCalled();
    });

    it("refuses a container's file and a relative path that climbs out of the workspace", async () => {
        const container = await serverCreate(undefined, {
            getWorkspace: workspaceRead("container"),
        } as unknown as Partial<HappyAgentProxyClient>);
        expect(
            await post(`${container}/file-open`, {
                workspaceId: "w1",
                path: "sales-report.xlsx",
                appId: "com.apple.Numbers",
            }),
        ).toEqual({
            status: 502,
            body: { error: "A file in a container cannot be opened on this Mac." },
        });
        const host = await serverCreate(undefined, {
            getWorkspace: workspaceRead("host"),
        } as unknown as Partial<HappyAgentProxyClient>);
        expect(
            await post(`${host}/file-open-applications`, {
                workspaceId: "w1",
                path: "../sales-report.xlsx",
            }),
        ).toEqual({ status: 502, body: { error: "That path is outside this workspace." } });
    });

    it("offers nothing for a script and refuses to open one, whatever application is asked for", async () => {
        await writeFile(join(root, "run.command"), "echo");
        const base = await serverCreate(undefined, {
            getWorkspace: workspaceRead("host"),
        } as unknown as Partial<HappyAgentProxyClient>);
        expect(
            await post(`${base}/file-open-applications`, {
                workspaceId: "w1",
                path: "run.command",
            }),
        ).toEqual({ status: 200, body: { applications: [] } });
        expect(
            await post(`${base}/file-open`, {
                workspaceId: "w1",
                path: "run.command",
                appId: "com.apple.TextEdit",
            }),
        ).toEqual({
            status: 502,
            body: {
                error:
                    process.platform === "darwin"
                        ? "A .command file is not opened from Happy."
                        : "Opening a file in another application is only supported on macOS.",
            },
        });
        expect(
            (await post(`${base}/file-open`, { workspaceId: "w1", path: "run.command" })).body,
        ).toEqual({ error: "appId is required." });
    });
});
