import { HappyAgentApiError } from "@slopus/happy-agent-client";
import { afterEach, expect, it, vi } from "vitest";
import { serverSourceDaemonCreate, type ServerSourceDaemonClient } from "./serverSourceDaemon.js";

const AUTHORIZE = "https://login.example.com/authorize?client_id=happy&state=s1";
const CALLBACK = "happy://oauth/callback?code=c1&state=s1";

afterEach(() => {
    vi.useRealTimers();
});

function daemonCreate(overrides: Partial<Record<keyof ServerSourceDaemonClient, unknown>> = {}) {
    const client = {
        addConnection: vi.fn(async () => ({
            connection: {
                id: "happy-example-com",
                name: "happy.example.com",
                orderKey: "1",
                authentication: "oauth",
                url: "https://happy.example.com/",
            },
            connections: [],
            version: "v1",
        })),
        removeConnection: vi.fn(async () => ({ connections: [], version: "v2" })),
        startConnectionSignIn: vi.fn(async () => ({
            authorizationUrl: AUTHORIZE,
            state: "s1",
            expiresAt: Date.now() + 600_000,
        })),
        completeConnectionSignIn: vi.fn(async () => ({
            status: { id: "happy-example-com", status: "ready", updatedAt: 1 },
        })),
        cancelConnectionSignIn: vi.fn(async () => undefined),
        ...overrides,
    };
    const opened: string[] = [];
    const source = serverSourceDaemonCreate({
        client: () => client as unknown as ServerSourceDaemonClient,
        browserOpen: async (url) => {
            opened.push(url);
        },
    });
    const hosts: string[] = [];
    const progress = { signInOpened: (host: string) => hosts.push(host) };
    return { client, source, opened, hosts, progress };
}

it("adds the server, signs in through the browser, and finishes with the callback by state", async () => {
    const { client, source, opened, hosts, progress } = daemonCreate();
    const added = source.serverAdd(
        "https://happy.example.com",
        progress,
        new AbortController().signal,
    );
    await vi.waitFor(() => expect(opened).toEqual([AUTHORIZE]));
    expect(hosts).toEqual(["login.example.com"]);
    expect(client.addConnection).toHaveBeenCalledWith(
        expect.objectContaining({ url: "https://happy.example.com" }),
        expect.anything(),
    );
    // A callback for another attempt is not this one's.
    source.callbackReceive("happy://oauth/callback?code=x&state=other");
    source.callbackReceive("not a url");
    expect(client.completeConnectionSignIn).not.toHaveBeenCalled();
    source.callbackReceive(CALLBACK);
    await expect(added).resolves.toEqual({ connectionId: "happy-example-com" });
    expect(client.completeConnectionSignIn).toHaveBeenCalledWith(
        "happy-example-com",
        { callbackUrl: CALLBACK },
        expect.anything(),
    );
    expect(client.removeConnection).not.toHaveBeenCalled();
});

it("removes a first add that is cancelled, and tells the daemon to forget the attempt", async () => {
    const { client, source, opened, progress } = daemonCreate();
    const controller = new AbortController();
    const added = source.serverAdd("https://happy.example.com", progress, controller.signal);
    await vi.waitFor(() => expect(opened).toHaveLength(1));
    controller.abort();
    await expect(added).rejects.toMatchObject({ code: "cancelled" });
    expect(client.cancelConnectionSignIn).toHaveBeenCalledWith("happy-example-com", {
        state: "s1",
    });
    expect(client.removeConnection).toHaveBeenCalledWith("happy-example-com");
    // The callback arriving afterwards finishes nothing.
    source.callbackReceive(CALLBACK);
    expect(client.completeConnectionSignIn).not.toHaveBeenCalled();
});

it("removes a first add whose sign-in the server refused, and says why", async () => {
    const denied = new HappyAgentApiError(
        400,
        "The sign-in page said the request was not allowed.",
        "sign_in_denied",
        null,
    );
    const { client, source, opened, progress } = daemonCreate({
        completeConnectionSignIn: vi.fn(async () => {
            throw denied;
        }),
    });
    const added = source.serverAdd(
        "https://happy.example.com",
        progress,
        new AbortController().signal,
    );
    await vi.waitFor(() => expect(opened).toHaveLength(1));
    source.callbackReceive(CALLBACK);
    await expect(added).rejects.toMatchObject({
        message: "The sign-in page said the request was not allowed.",
    });
    expect(client.removeConnection).toHaveBeenCalledWith("happy-example-com");
});

it("keeps a server that only needed signing in again when that sign-in fails", async () => {
    const { client, source, opened, progress } = daemonCreate();
    const controller = new AbortController();
    const signedIn = source.serverSignIn("happy-example-com", progress, controller.signal);
    await vi.waitFor(() => expect(opened).toHaveLength(1));
    controller.abort();
    await expect(signedIn).rejects.toMatchObject({ code: "cancelled" });
    expect(client.removeConnection).not.toHaveBeenCalled();
    expect(client.addConnection).not.toHaveBeenCalled();
});

it("says a server is already added, and that the local Happy Agent is needed", async () => {
    const { source, progress } = daemonCreate({
        addConnection: vi.fn(async () => {
            throw new HappyAgentApiError(409, "Already in the roster.", "server_exists", null);
        }),
    });
    await expect(
        source.serverAdd("https://happy.example.com", progress, new AbortController().signal),
    ).rejects.toMatchObject({ code: "server_exists", message: "That server is already added." });
    const offline = serverSourceDaemonCreate({
        client: () => undefined,
        browserOpen: async () => undefined,
    });
    await expect(
        offline.serverAdd("https://happy.example.com", progress, new AbortController().signal),
    ).rejects.toMatchObject({ code: "local_unavailable" });
});

it("gives up on a sign-in once the daemon's attempt has expired", async () => {
    vi.useFakeTimers();
    const { client, source, progress } = daemonCreate({
        startConnectionSignIn: vi.fn(async () => ({
            authorizationUrl: AUTHORIZE,
            state: "s1",
            expiresAt: Date.now() + 1_000,
        })),
    });
    const signedIn = source.serverSignIn(
        "happy-example-com",
        progress,
        new AbortController().signal,
    );
    const settled = expect(signedIn).rejects.toMatchObject({ code: "sign_in_expired" });
    await vi.advanceTimersByTimeAsync(1_000);
    await settled;
    expect(client.cancelConnectionSignIn).toHaveBeenCalledWith("happy-example-com", {
        state: "s1",
    });
});
