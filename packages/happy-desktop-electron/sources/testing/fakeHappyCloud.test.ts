import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, it } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import {
    fakeHappyCloudStart,
    type FakeHappyCloud,
    type FakeHappyCloudOptions,
} from "./fakeHappyCloud";

const closers: (() => Promise<void> | void)[] = [];
afterEach(async () => {
    for (const close of closers.splice(0).reverse()) await close();
});

/** A page's own server: a document and a WebSocket echo, as a dev server has. */
async function originStart(): Promise<number> {
    const server = createServer((request, response) => {
        response.writeHead(200, { "content-type": "text/plain" });
        response.end(`served ${request.url ?? ""}`);
    });
    const echo = new WebSocketServer({ server, path: "/hmr" });
    echo.on("connection", (socket) => socket.on("message", (data) => socket.send(String(data))));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    closers.push(
        () =>
            new Promise<void>((resolve) => {
                echo.close();
                server.closeAllConnections();
                server.close(() => resolve());
            }),
    );
    return (server.address() as AddressInfo).port;
}

async function cloudStart(options?: FakeHappyCloudOptions): Promise<FakeHappyCloud> {
    const cloud = await fakeHappyCloudStart(options);
    closers.push(() => cloud.close());
    return cloud;
}

function networkRead(cloud: FakeHappyCloud, token = cloud.token) {
    return fetch(new URL("v0/workspaces/w1/agents/a1/proxy", cloud.url), {
        headers: { authorization: `Bearer ${token}` },
    }).then(async (response) => ({ status: response.status, body: await response.json() }));
}

/** Opens the twin and resolves with every byte received until it closes. */
function twin(
    cloud: FakeHappyCloud,
    networkId: string,
    send: (socket: WebSocket, end: () => void) => void,
): Promise<{ readonly text: string; readonly code: number; readonly reason: string }> {
    return new Promise((resolve, reject) => {
        const socket = new WebSocket(
            new URL(`v0/networks/${networkId}/proxy/websocket`, cloud.url.replace(/^http/u, "ws")),
            { headers: { authorization: `Bearer ${cloud.token}` } },
        );
        const chunks: Buffer[] = [];
        socket.on("unexpected-response", (_request, response) =>
            reject(new Error(`refused ${String(response.statusCode)}`)),
        );
        let ended = false;
        const end = () => {
            if (ended) return;
            ended = true;
            socket.send(Buffer.alloc(0));
        };
        socket.on("open", () => send(socket, end));
        socket.on("message", (data: Buffer) => {
            chunks.push(data);
            // The other side finished; finish this side too, as a client does.
            if (data.length === 0) end();
        });
        socket.on("close", (code, reason) =>
            resolve({ text: Buffer.concat(chunks).toString(), code, reason: String(reason) }),
        );
        socket.on("error", () => undefined);
    });
}

it("names the agent's network to its bearer only, and refuses another token", async () => {
    const cloud = await cloudStart();
    await expect(networkRead(cloud)).resolves.toEqual({
        status: 200,
        body: { networkId: cloud.networkId, kind: "runner" },
    });
    await expect(networkRead(cloud, "wrong")).resolves.toMatchObject({ status: 401 });
});

it("carries an absolute-form request and a nested CONNECT through the twin, and ends on half-close", async () => {
    const cloud = await cloudStart();
    const port = await originStart();
    const plain = await twin(cloud, cloud.networkId, (socket, end) => {
        socket.send(
            Buffer.from(
                `GET http://127.0.0.1:${String(port)}/page HTTP/1.1\r\nHost: 127.0.0.1:${String(port)}\r\nConnection: close\r\n\r\n`,
            ),
        );
        end();
    });
    expect(plain.text).toMatch(/^HTTP\/1\.1 200 OK/u);
    expect(plain.text).toContain("served /page");
    expect(plain.code).toBe(1000);

    const nested = await twin(cloud, cloud.networkId, (socket) => {
        let established = false;
        socket.on("message", (data: Buffer) => {
            if (established || !data.toString().includes("200 Connection Established")) return;
            established = true;
            socket.send(
                Buffer.from(`GET /inside HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`),
            );
        });
        socket.send(Buffer.from(`CONNECT 127.0.0.1:${String(port)} HTTP/1.1\r\n\r\n`));
    });
    expect(nested.text).toContain("served /inside");
});

function tunnelHold(cloud: FakeHappyCloud, port: number) {
    return twin(cloud, cloud.networkId, (socket) =>
        socket.send(Buffer.from(`CONNECT 127.0.0.1:${String(port)} HTTP/1.1\r\n\r\n`)),
    );
}

it("refuses while compute is released or offline, closes open tunnels, and keeps its network", async () => {
    const cloud = await cloudStart();
    const port = await originStart();
    const network = cloud.networkId;

    const released = tunnelHold(cloud, port);
    await expect.poll(() => cloud.tunnelsOpened()).toBe(1);
    cloud.computeRelease();
    await expect(released).resolves.toMatchObject({ code: 1001, reason: "compute_offline" });
    await expect(networkRead(cloud)).resolves.toMatchObject({
        status: 409,
        body: { code: "no_compute" },
    });
    await expect(twin(cloud, network, () => undefined)).rejects.toThrow("refused 409");

    cloud.computeAttach();
    const offline = tunnelHold(cloud, port);
    await expect.poll(() => cloud.tunnelsOpened()).toBe(2);
    cloud.computeOffline();
    await expect(offline).resolves.toMatchObject({ code: 1001, reason: "compute_offline" });
    await expect(networkRead(cloud)).resolves.toMatchObject({
        status: 503,
        body: { code: "compute_offline" },
    });
    await expect(twin(cloud, network, () => undefined)).rejects.toThrow("refused 503");

    cloud.computeAttach();
    expect(cloud.networkId).toBe(network);
    await expect(networkRead(cloud)).resolves.toMatchObject({
        status: 200,
        body: { networkId: network },
    });
});

it("answers as clusters did before the compute codes when legacy", async () => {
    const cloud = await cloudStart({ legacy: true });
    const port = await originStart();
    const open = tunnelHold(cloud, port);
    await expect.poll(() => cloud.tunnelsOpened()).toBe(1);
    cloud.computeRelease();
    await expect(open).resolves.toMatchObject({ code: 1008, reason: "" });
    await expect(networkRead(cloud)).resolves.toMatchObject({
        status: 503,
        body: { code: "runner_unavailable" },
    });
});

it("limits tunnels open at once and opened a minute, and closes an idle one", async () => {
    const cloud = await cloudStart({
        tunnelsConcurrent: 2,
        tunnelsPerMinute: 3,
        tunnelIdleMs: 200,
    });
    const port = await originStart();
    const first = tunnelHold(cloud, port);
    const second = tunnelHold(cloud, port);
    await expect.poll(() => cloud.tunnelsLive()).toBe(2);
    await expect(twin(cloud, cloud.networkId, () => undefined)).rejects.toThrow("refused 429");
    await expect(first).resolves.toMatchObject({ code: 1000, reason: "idle" });
    await expect(second).resolves.toMatchObject({ code: 1000, reason: "idle" });
    await expect.poll(() => cloud.tunnelsLive()).toBe(0);

    await tunnelHold(cloud, port);
    await expect(twin(cloud, cloud.networkId, () => undefined)).rejects.toThrow("refused 429");
    expect(cloud.tunnelsOpened()).toBe(3);
});

it("closes a busy tunnel once it has been open too long", async () => {
    const cloud = await cloudStart({ tunnelIdleMs: 1_000, tunnelLifetimeMs: 300 });
    const port = await originStart();
    const closed = twin(cloud, cloud.networkId, (socket) => {
        socket.send(Buffer.from(`CONNECT 127.0.0.1:${String(port)} HTTP/1.1\r\n\r\n`));
        // Keep-alive requests inside the nested tunnel, as a busy page sends.
        const keepBusy = setInterval(
            () => socket.send(Buffer.from("GET /busy HTTP/1.1\r\nHost: localhost\r\n\r\n")),
            50,
        );
        socket.once("close", () => clearInterval(keepBusy));
    });
    await expect(closed).resolves.toMatchObject({ code: 1008, reason: "" });
});

it("does not carry CONNECT, as an ordinary ingress does not", async () => {
    const cloud = await cloudStart();
    const { connect } = await import("node:net");
    const url = new URL(cloud.url);
    const answer = await new Promise<string>((resolve) => {
        const socket = connect(Number(url.port), url.hostname, () =>
            socket.write(
                `CONNECT /v0/networks/${cloud.networkId}/proxy HTTP/1.1\r\nHost: cloud\r\nAuthorization: Bearer ${cloud.token}\r\n\r\n`,
            ),
        );
        let text = "";
        socket.on("data", (data) => (text += String(data)));
        socket.on("close", () => resolve(text));
    });
    expect(answer).toMatch(/^HTTP\/1\.1 405/u);
});
