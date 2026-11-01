import type { ConnectionListResponse, HappyAgentClient } from "@slopus/happy-agent-client";
import { afterEach, expect, it, vi } from "vitest";
import { happyAgentSyncCreate } from "../happyAgentConnection/happyAgentSync.js";
import { fakeHappyAgentDaemonCreate } from "../testing/fakeHappyAgentDaemon.js";
import {
    happyAgentConnectionsStoreCreate,
    type HappyAgentConnectionItem,
    type HappyAgentConnectionsStore,
} from "./happyAgentConnectionsStore.js";

const stores: HappyAgentConnectionsStore[] = [];

afterEach(() => {
    for (const store of stores.splice(0)) store[Symbol.dispose]();
});

function remote(id: string, name: string): ConnectionListResponse["connections"][number] {
    return { id, name, orderKey: id } as ConnectionListResponse["connections"][number];
}

it("lists the membership last confirmed before the daemon is asked, and replaces it with the answer", async () => {
    const listed: ConnectionListResponse = {
        connections: [remote("core", "Core"), remote("lab", "Lab")],
        version: "v2",
    } as ConnectionListResponse;
    const listConnections = vi.fn(async () => listed);
    const client = { listConnections } as unknown as HappyAgentClient;
    let kept: readonly HappyAgentConnectionItem[] | undefined = [
        { id: "connection:core", name: "Core", remoteId: "core" },
        { id: "connection:gone", name: "Gone", remoteId: "gone" },
    ];
    const { source, writer } = happyAgentSyncCreate();
    const store = happyAgentConnectionsStoreCreate(client, source, {
        read: () => kept,
        write: (items) => {
            kept = items;
        },
    });
    stores.push(store);
    store.subscribe(() => undefined);

    // Known at once, while nothing has been read.
    expect(store.get().items.map((item) => item.id)).toEqual([
        "local",
        "connection:core",
        "connection:gone",
    ]);
    expect(listConnections).not.toHaveBeenCalled();

    // The daemon's own answer, once its connection has bootstrapped, is what stands.
    const daemon = fakeHappyAgentDaemonCreate();
    writer.bootstrapReceived(await daemon.client.getDesktopBootstrap());
    await vi.waitFor(() =>
        expect(store.get().items.map((item) => item.id)).toEqual([
            "local",
            "connection:core",
            "connection:lab",
        ]),
    );
    expect(kept).toEqual([
        { id: "connection:core", name: "Core", remoteId: "core" },
        { id: "connection:lab", name: "Lab", remoteId: "lab" },
    ]);
});

it("ignores a remembered entry that does not name its own connection", () => {
    const client = { listConnections: vi.fn() } as unknown as HappyAgentClient;
    const { source } = happyAgentSyncCreate();
    const store = happyAgentConnectionsStoreCreate(client, source, {
        read: () => [
            { id: "local", name: "Not a remote" },
            { id: "connection:other", name: "Mismatched", remoteId: "core" },
        ],
        write: () => undefined,
    });
    stores.push(store);
    expect(store.get().items.map((item) => item.id)).toEqual(["local"]);
});

it("carries the instance the main daemon saw for each remote, and remembers it", async () => {
    const TEAM = "k3x9q2m7p0a4b8c1d5e6f7g2";
    const listed = {
        connections: [{ ...remote("team", "Team"), instanceId: TEAM }, remote("lab", "Lab")],
        version: "v2",
    } as ConnectionListResponse;
    const client = { listConnections: vi.fn(async () => listed) } as unknown as HappyAgentClient;
    let kept: readonly HappyAgentConnectionItem[] | undefined;
    const { source, writer } = happyAgentSyncCreate();
    const store = happyAgentConnectionsStoreCreate(client, source, {
        read: () => kept,
        write: (items) => {
            kept = items;
        },
    });
    stores.push(store);
    store.subscribe(() => undefined);
    const daemon = fakeHappyAgentDaemonCreate();
    writer.bootstrapReceived(await daemon.client.getDesktopBootstrap());
    await vi.waitFor(() => expect(store.get().items).toHaveLength(3));
    expect(store.get().items[1]).toEqual({
        id: "connection:team",
        name: "Team",
        remoteId: "team",
        instanceId: TEAM,
    });
    // A remote the main daemon has not reached yet names none.
    expect(store.get().items[2]).not.toHaveProperty("instanceId");
    // The next start matches links to it before it is asked again.
    expect(kept?.[0]?.instanceId).toBe(TEAM);
});
