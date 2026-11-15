import { createServer, request as httpRequest } from "node:http";
import { connect, type AddressInfo } from "node:net";
import type { Session } from "electron";
import { afterEach, expect, it, vi } from "vitest";
import { WebSocketServer } from "ws";
import {
    fakeHappyCloudStart,
    type FakeHappyCloud,
    type FakeHappyCloudOptions,
} from "../testing/fakeHappyCloud";
import type { ServerRemoteCredential } from "../shared/serverRemoteAuthorization";
import { HappyAgentBrowser } from "./happyAgentBrowser";
import {
    happyAgentBrowserProxyCreate,
    type HappyAgentBrowserProxyHandle,
} from "./happyAgentBrowserProxy";
import {
    HappyCloudBrowserError,
    happyCloudBrowserCreate,
    type HappyCloudBrowser,
    type HappyCloudBrowserLimits,
} from "./happyCloudBrowser";

const CONNECTION = "cloud-test";
const closers: (() => Promise<void> | void)[] = [];
afterEach(async () => {
    for (const close of closers.splice(0).reverse()) await close();
});

async function cloudStart(options?: FakeHappyCloudOptions): Promise<FakeHappyCloud> {
    const cloud = await fakeHappyCloudStart(options);
    closers.push(() => cloud.close());
    return cloud;
}

/** A dev server: pages, the connections they came over, and a WebSocket echo. */
async function originStart() {
    let connections = 0;
    const server = createServer((request, response) => {
        response.writeHead(200, { "content-type": "text/plain" });
        response.end(`served ${request.url ?? ""}`);
    });
    server.on("connection", () => (connections += 1));
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
    return { port: (server.address() as AddressInfo).port, connections: () => connections };
}

/** The transport, signed in to `cloud` with its token; a refresh hands out the same one. */
function transportCreate(
    cloud: FakeHappyCloud,
    limits?: Partial<HappyCloudBrowserLimits>,
    token = cloud.token,
): { browser: HappyCloudBrowser; refreshes: () => number } {
    let refreshes = 0;
    let current: ServerRemoteCredential = { serverUrl: cloud.url, accessToken: token };
    const browser = happyCloudBrowserCreate({
        remote: {
            credential: (connectionId) => (connectionId === CONNECTION ? current : undefined),
            refresh: async () => {
                refreshes += 1;
                current = { serverUrl: cloud.url, accessToken: cloud.token };
                return current;
            },
        },
        ...(limits ? { limits } : {}),
    });
    return { browser, refreshes: () => refreshes };
}

async function proxyStart(browser: HappyCloudBrowser, networkId: string) {
    const proxy = await happyAgentBrowserProxyCreate({
        openHttpProxy: (signal) => browser.tunnelOpen(CONNECTION, networkId, signal),
        pooled: true,
    });
    closers.push(() => proxy.close());
    return proxy;
}

/** One absolute-form request to the loopback proxy, as Chromium sends it. */
function proxyGet(
    proxy: HappyAgentBrowserProxyHandle,
    url: string,
): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
        const request = httpRequest(
            {
                host: "127.0.0.1",
                port: proxy.port,
                method: "GET",
                path: url,
                headers: {
                    host: new URL(url).host,
                    "proxy-authorization": `Basic ${Buffer.from(`${proxy.username}:${proxy.password}`).toString("base64")}`,
                },
            },
            (response) => {
                let body = "";
                response.on("data", (chunk) => (body += String(chunk)));
                response.on("end", () => resolve({ status: response.statusCode ?? 0, body }));
            },
        );
        request.on("error", reject);
        request.end();
    });
}

/** Opens a `CONNECT` through the loopback proxy and resolves with its first answer. */
function proxyConnect(proxy: HappyAgentBrowserProxyHandle, authority: string) {
    return new Promise<{ answer: string; socket: ReturnType<typeof connect> }>((resolve) => {
        const socket = connect(proxy.port, "127.0.0.1", () =>
            socket.write(
                `CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\nProxy-Authorization: Basic ${Buffer.from(`${proxy.username}:${proxy.password}`).toString("base64")}\r\n\r\n`,
            ),
        );
        socket.once("data", (data) => resolve({ answer: String(data), socket }));
        socket.on("error", () => undefined);
        closers.push(() => void socket.destroy());
    });
}

it("names an agent's network with the person's token, refreshing a refused one once", async () => {
    const cloud = await cloudStart();
    const { browser, refreshes } = transportCreate(cloud, undefined, "stale");
    const target = { connectionId: CONNECTION, workspaceId: "w1", agentId: "a1" };
    await expect(browser.networkResolve(target)).resolves.toBe(cloud.networkId);
    expect(refreshes()).toBe(1);

    cloud.computeRelease();
    const detached = await browser.networkResolve(target).catch((error: unknown) => error);
    expect(detached).toBeInstanceOf(HappyCloudBrowserError);
    expect(detached).toMatchObject({ statusCode: 409, refusal: "computeDetached" });
    cloud.computeOffline();
    await expect(browser.networkResolve(target)).rejects.toMatchObject({
        statusCode: 503,
        refusal: "computeOffline",
    });
});

it("carries a page of many requests over a few kept tunnels, and a WebSocket over its own", async () => {
    const cloud = await cloudStart();
    const origin = await originStart();
    const { browser } = transportCreate(cloud);
    const proxy = await proxyStart(browser, cloud.networkId);
    const base = `http://127.0.0.1:${String(origin.port)}`;

    const answers = await Promise.all(
        Array.from({ length: 60 }, (_, index) => proxyGet(proxy, `${base}/m${String(index)}.js`)),
    );
    expect(answers.every((answer, index) => answer.body === `served /m${String(index)}.js`)).toBe(
        true,
    );
    // Sixty requests, at most six tunnels: the server's limits are never reached.
    expect(cloud.tunnelsOpened()).toBeLessThanOrEqual(6);
    expect(origin.connections()).toBe(cloud.tunnelsOpened());

    const opened = cloud.tunnelsOpened();
    const { answer, socket } = await proxyConnect(proxy, `127.0.0.1:${String(origin.port)}`);
    expect(answer).toMatch(/^HTTP\/1\.1 200/u);
    expect(cloud.tunnelsOpened()).toBe(opened + 1);
    socket.write(`GET /inside HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`);
    const inside = await new Promise<string>((resolve) => {
        let text = "";
        socket.on("data", (data) => (text += String(data)));
        socket.on("close", () => resolve(text));
    });
    expect(inside).toContain("served /inside");
});

it("sends a request again on a new tunnel when its kept one ended while unused", async () => {
    const cloud = await cloudStart({ tunnelIdleMs: 200 });
    const origin = await originStart();
    const { browser } = transportCreate(cloud);
    const proxy = await proxyStart(browser, cloud.networkId);
    const base = `http://127.0.0.1:${String(origin.port)}`;
    await expect(proxyGet(proxy, `${base}/first`)).resolves.toMatchObject({ status: 200 });
    await expect.poll(() => cloud.tunnelsLive()).toBe(0);
    await expect(proxyGet(proxy, `${base}/second`)).resolves.toEqual({
        status: 200,
        body: "served /second",
    });
    expect(cloud.tunnelsOpened()).toBe(2);
});

it("waits its turn within the person's tunnels, and backs off when the server says too many", async () => {
    const cloud = await cloudStart({ tunnelsConcurrent: 1 });
    const origin = await originStart();
    // This side allows two at once, the server only one: the second is refused
    // with 429 until the first ends, and is opened then, not failed.
    const { browser } = transportCreate(cloud, { concurrent: 2, backoffMs: 50, backoffMaxMs: 100 });
    const signal = () => AbortSignal.timeout(5_000);
    const first = await browser.tunnelOpen(CONNECTION, cloud.networkId, signal());
    const second = browser.tunnelOpen(CONNECTION, cloud.networkId, signal());
    // Within this side's own limit a third waits for a turn without asking the server.
    const third = browser.tunnelOpen(CONNECTION, cloud.networkId, signal());
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(cloud.tunnelsOpened()).toBe(1);
    first.destroy();
    const opened = await second;
    expect(cloud.tunnelsOpened()).toBe(2);
    opened.destroy();
    (await third).destroy();
    expect(cloud.tunnelsOpened()).toBe(3);
    void origin;
});

it("gives up waiting when the opening's deadline passes", async () => {
    const cloud = await cloudStart();
    const { browser } = transportCreate(cloud, { concurrent: 1 });
    const held = await browser.tunnelOpen(CONNECTION, cloud.networkId, AbortSignal.timeout(5_000));
    await expect(
        browser.tunnelOpen(CONNECTION, cloud.networkId, AbortSignal.timeout(100)),
    ).rejects.toThrow();
    held.destroy();
    const next = await browser.tunnelOpen(CONNECTION, cloud.networkId, AbortSignal.timeout(5_000));
    next.destroy();
});

it("says which compute refusal ended or refused a tunnel, in the new codes and the old", async () => {
    const cloud = await cloudStart();
    const { browser } = transportCreate(cloud);
    const open = () => browser.tunnelOpen(CONNECTION, cloud.networkId, AbortSignal.timeout(5_000));

    const held = await open();
    const ended = new Promise<unknown>((resolve) => held.once("error", resolve));
    cloud.computeOffline();
    await expect(ended).resolves.toMatchObject({ refusal: "computeOffline" });
    await expect(open()).rejects.toMatchObject({ statusCode: 503, refusal: "computeOffline" });
    cloud.computeRelease();
    await expect(open()).rejects.toMatchObject({ statusCode: 409, refusal: "computeDetached" });
    cloud.computeAttach();
    (await open()).destroy();

    const legacy = await cloudStart({ legacy: true });
    const old = transportCreate(legacy).browser;
    const oldOpen = () => old.tunnelOpen(CONNECTION, legacy.networkId, AbortSignal.timeout(5_000));
    const oldHeld = await oldOpen();
    const oldEnded = new Promise<unknown>((resolve) => oldHeld.once("error", resolve));
    legacy.computeOffline();
    // Today's servers end it with no reason, as they end a tunnel at its age
    // limit: that alone is no refusal; the next opening says what happened.
    const plain = await oldEnded;
    expect(plain).not.toHaveProperty("refusal");
    await expect(oldOpen()).rejects.toMatchObject({
        statusCode: 503,
        code: "runner_unavailable",
        refusal: "computeOffline",
    });
});

/** A profile session that routes every address the way it was last told to. */
function profileSession(): Session {
    let rules = "";
    return {
        webRequest: { onBeforeRequest: () => undefined },
        setProxy: async (config: { proxyRules?: string }) => {
            rules = config.proxyRules ?? "";
        },
        closeAllConnections: async () => undefined,
        resolveProxy: async () => `PROXY ${rules.replace("http://", "")}`,
    } as unknown as Session;
}

it("tells the profile's pages when compute is away, whether opening or open", async () => {
    const cloud = await cloudStart();
    const origin = await originStart();
    const { browser: cloudBrowser } = transportCreate(cloud);
    const refused = vi.fn();
    const network = { connectionId: CONNECTION, networkId: cloud.networkId };
    const browser = await HappyAgentBrowser.create(
        profileSession(),
        network,
        {
            openHttpProxy: (_network, signal) =>
                cloudBrowser.tunnelOpen(CONNECTION, cloud.networkId, signal!),
            browserNetworkCloud: () => true,
            browserTunnelsReclaimRegister: (_network, reclaim) =>
                cloudBrowser.idleReclaimRegister(CONNECTION, reclaim),
        },
        { networkMissing: vi.fn(), refused },
    );
    closers.push(() => browser.close());
    const proxy = browser.proxy!;

    // An open WebSocket's tunnel ends when the computer goes offline.
    const { answer } = await proxyConnect(proxy, `127.0.0.1:${String(origin.port)}`);
    expect(answer).toMatch(/^HTTP\/1\.1 200/u);
    cloud.computeOffline();
    await expect.poll(() => refused.mock.calls.length).toBe(1);
    expect(refused).toHaveBeenLastCalledWith(
        "computeOffline",
        "This agent's compute went offline.",
    );

    // A page asked for while compute is detached is refused, and says so.
    cloud.computeRelease();
    const page = await proxyGet(proxy, `http://127.0.0.1:${String(origin.port)}/`);
    expect(page.status).toBe(502);
    expect(refused).toHaveBeenLastCalledWith("computeDetached", "This agent has no compute.");
});

it("gives back a profile's unused kept tunnels when another opening waits for one", async () => {
    const cloud = await cloudStart();
    const first = await originStart();
    const second = await originStart();
    const { browser } = transportCreate(cloud, { concurrent: 3 });
    const proxy = await proxyStart(browser, cloud.networkId);
    browser.idleReclaimRegister(CONNECTION, () => proxy.idleClose());
    // Three kept tunnels to one dev server use the person's whole allowance.
    await Promise.all(
        [1, 2, 3].map((index) =>
            proxyGet(proxy, `http://127.0.0.1:${String(first.port)}/${String(index)}`),
        ),
    );
    await expect.poll(() => cloud.tunnelsLive()).toBe(3);
    // Another server's page does not wait for them to sit idle long enough to end.
    const started = Date.now();
    await expect(
        proxyGet(proxy, `http://127.0.0.1:${String(second.port)}/other`),
    ).resolves.toMatchObject({ status: 200, body: "served /other" });
    expect(Date.now() - started).toBeLessThan(2_000);
});
