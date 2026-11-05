import { afterEach, expect, it, vi } from "vitest";
import { connectHappyAgent } from "../happyAgentConnection/connectHappyAgent.js";
import type { HappyAgentConnection } from "../happyAgentConnection/types.js";
import { happyAgentDeviceBridgeSupportStoreCreate } from "../happyAgent/happyAgentDeviceBridgeSupportStore.js";
import {
    fakeHappyAgentDaemonCreate,
    type FakeHappyAgentDaemon,
} from "../testing/fakeHappyAgentDaemon.js";
import { happyAgentSurfaceSupportStoreCreate } from "./surfaceSupportStore.js";

const connections: HappyAgentConnection[] = [];
const disposables: Disposable[] = [];

afterEach(() => {
    for (const disposable of disposables.splice(0)) disposable[Symbol.dispose]();
    for (const connection of connections.splice(0)) connection.close();
});

async function liveConnection(daemon: FakeHappyAgentDaemon): Promise<HappyAgentConnection> {
    const connection = connectHappyAgent({
        endpoint: "http://happy-agent.test/",
        token: "token",
        client: daemon.client,
        wait: () => new Promise((resolve) => setTimeout(resolve, 0)),
        now: () => 1_000,
    });
    connections.push(connection);
    await vi.waitFor(() => expect(daemon.streamLiveCount()).toBe(1));
    return connection;
}

it("answers from the health the connection already heard, asking nothing of its own", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    const connection = await liveConnection(daemon);
    const surfaces = happyAgentSurfaceSupportStoreCreate({
        client: daemon.client,
        sync: connection.sync,
    });
    const bridges = happyAgentDeviceBridgeSupportStoreCreate({
        client: daemon.client,
        sync: connection.sync,
    });
    disposables.push(surfaces, bridges);
    surfaces.subscribe(() => undefined);
    bridges.subscribe(() => undefined);

    await vi.waitFor(() => {
        expect(surfaces.get()).toEqual({
            documents: "unsupported",
            calendars: "unsupported",
            systemMonitors: "unsupported",
            chats: "unsupported",
            vaults: "unsupported",
        });
        expect(bridges.get()).toEqual({ status: "unsupported" });
    });
    // The bootstrap carried the health; a reconnect of the same process changes nothing.
    daemon.streamDropAll();
    await vi.waitFor(() => expect(daemon.streamLiveCount()).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(daemon.callCount("getHealth")).toBe(0);
});

it("reuses the health an older daemon was asked for apart", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.bootstrapHealthSet(false);
    const connection = await liveConnection(daemon);
    const surfaces = happyAgentSurfaceSupportStoreCreate({
        client: daemon.client,
        sync: connection.sync,
    });
    disposables.push(surfaces);
    surfaces.subscribe(() => undefined);

    await vi.waitFor(() =>
        expect(surfaces.get()).toEqual({
            documents: "unsupported",
            calendars: "unsupported",
            systemMonitors: "unsupported",
            chats: "unsupported",
            vaults: "unsupported",
        }),
    );
    expect(daemon.callCount("getHealth")).toBe(1);
});
