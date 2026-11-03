import { expect, it, onTestFinished, vi } from "vitest";
import { happyAgentSyncCreate } from "../happyAgentConnection/happyAgentSync.js";
import { fakeHappyAgentDaemonCreate } from "../testing/fakeHappyAgentDaemon.js";
import type { HappyAgentArtifactId } from "../artifacts/artifactTypes.js";
import { happyAgentSurfaceCatalogStoreCreate } from "./surfaceCatalogStore.js";

async function setup(daemon = fakeHappyAgentDaemonCreate()) {
    const sync = happyAgentSyncCreate();
    const store = happyAgentSurfaceCatalogStoreCreate({ client: daemon.client, sync: sync.source });
    onTestFinished(() => {
        store[Symbol.dispose]();
        sync.writer.close();
    });
    store.subscribe(() => undefined);
    sync.writer.bootstrapReceived(await daemon.client.getDesktopBootstrap());
    await vi.waitFor(() => expect(store.get().availability).toBe("available"));
    return { daemon, store };
}

it("reopening a monitor reuses this member's tab and keeps unrelated tabs", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.profileSet({ userId: "me" });
    daemon.surfaceSeed({
        id: "other-monitor",
        type: "system_monitor",
        creatorUserId: "other",
        members: [
            { userId: "other", orderKey: "1", joinedAt: 1 },
            { userId: "me", orderKey: "1", joinedAt: 1 },
        ],
    });
    daemon.surfaceSeed({ id: "my-monitor", type: "system_monitor", creatorUserId: "me" });
    daemon.surfaceSeed({ id: "notes", members: [{ userId: "me", orderKey: "2", joinedAt: 1 }] });
    const { store } = await setup(daemon);
    expect(store.surfaceCreate({ kind: "system_monitor", name: "System monitor" })).toBe(
        "my-monitor",
    );
    expect(store.surfaceCreate({ kind: "system_monitor", name: "Again" })).toBe("my-monitor");
    await vi.waitFor(() => expect(daemon.callCount("joinSurface")).toBe(1));
    expect(daemon.callCount("createSurface")).toBe(0);
    expect(store.get().joined.map((tab) => tab.id)).toEqual([
        "other-monitor",
        "notes",
        "my-monitor",
    ]);
});

it("deduplicates rapid monitor opens before the server replies, not ordinary documents", async () => {
    const { daemon, store } = await setup();
    const release = daemon.pause("createSurface");
    const first = store.surfaceCreate({ kind: "system_monitor", name: "System monitor" });
    expect(store.surfaceCreate({ kind: "system_monitor", name: "System monitor" })).toBe(first);
    const document = store.surfaceCreate({ kind: "document", name: "Notes" });
    expect(store.surfaceCreate({ kind: "document", name: "Notes" })).not.toBe(document);
    expect(store.get().joined).toHaveLength(3);
    release();
    await vi.waitFor(() => expect(daemon.callCount("createSurface")).toBe(3));
});

it("opening a reference creates a personal tab and reopening keeps the same identity", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.profileSet({ userId: "me" });
    daemon.surfaceSeed({
        id: "other-artifact",
        type: "artifact",
        creatorUserId: "other",
        target: {
            state: "available",
            type: "artifact",
            artifactId: "report",
            name: "Report",
            hasImage: false,
            version: "1",
        },
    });
    const { store } = await setup(daemon);
    const release = daemon.pause("createSurface");
    const reference = { kind: "artifact" as const, id: "report" as HappyAgentArtifactId };
    store.referenceAdd(reference, "Report");
    store.referenceAdd(reference, "Report");
    const tabId = store.get().joined[0]?.id;
    expect(tabId).toBeDefined();
    expect(tabId).not.toBe("other-artifact");
    expect(store.get().joined).toHaveLength(1);
    release();
    await vi.waitFor(() => expect(store.get().joined[0]?.version).not.toBe(""));
    store.referenceAdd(reference, "Report");
    expect(store.get().joined[0]?.id).toBe(tabId);
    expect(daemon.callCount("createSurface")).toBe(1);
    expect(daemon.callCount("joinSurface")).toBe(0);
});

it("keeps opens requested before the initial catalog arrives", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    const sync = happyAgentSyncCreate();
    const store = happyAgentSurfaceCatalogStoreCreate({ client: daemon.client, sync: sync.source });
    onTestFinished(() => {
        store[Symbol.dispose]();
        sync.writer.close();
    });
    store.referenceAdd({ kind: "artifact", id: "report" as HappyAgentArtifactId }, "Report");
    store.subscribe(() => undefined);
    sync.writer.bootstrapReceived(await daemon.client.getDesktopBootstrap());
    await vi.waitFor(() => expect(store.get().joined).toHaveLength(1));
    expect(daemon.callCount("createSurface")).toBe(1);
});
