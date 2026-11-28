import { afterEach, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { happyAgentSyncCreate } from "../happyAgentConnection/happyAgentSync.js";
import { fakeHandbookClusterCreate } from "../testing/fakeHandbookCluster.js";
import { happyAgentHandbookStoreCreate } from "./handbookStore.js";
import type { HappyAgentHandbookItemId, HappyAgentHandbookStore } from "./handbookTypes.js";

/**
 * The handbook against a cluster held in memory: the list and what the reader
 * may do, a review that applies the drafts as the reader saw them, live drafts
 * that take only their own item's frames, and a history read as it is opened.
 */

const DEPLOYS = "hb_deploys" as HappyAgentHandbookItemId;
const STYLE = "hb_style" as HappyAgentHandbookItemId;

const opened: { [Symbol.dispose](): void }[] = [];
afterEach(() => {
    for (const store of opened.splice(0)) store[Symbol.dispose]();
    vi.useRealTimers();
});

function setup() {
    const cluster = fakeHandbookClusterCreate();
    const sync = happyAgentSyncCreate();
    const handbook = happyAgentHandbookStoreCreate({
        request: cluster.request,
        sync: sync.source,
        selfUserId: async () => "u_viewer",
        now: cluster.now,
    });
    opened.push(handbook);
    return { cluster, sync, handbook };
}

async function settled(store: HappyAgentHandbookStore, check: () => boolean): Promise<void> {
    await vi.waitFor(() => {
        if (!check()) throw new Error(JSON.stringify(store.get().review ?? store.get().status));
    });
}

it("lists the items in order, and what the reader may do", async () => {
    const { cluster, handbook } = setup();
    cluster.itemAdd({ id: DEPLOYS, title: "Deploys", text: "Ship on Fridays." });
    cluster.itemAdd({ id: STYLE, title: "Code style", text: "Tabs.", alwaysInContext: true });
    cluster.applyNow(STYLE);
    cluster.granted = ["handbook.edit"];
    handbook.subscribe(() => undefined);
    await settled(handbook, () => handbook.get().status === "ready");
    const snapshot = handbook.get();
    expect(
        snapshot.items.map((item) => [item.title, item.pending, item.applied?.revision]),
    ).toEqual([
        ["Deploys", true, undefined],
        ["Code style", false, 1],
    ]);
    expect(snapshot.access).toEqual({ edit: true, apply: false });
    expect(snapshot.viewerId).toBe("u_viewer");
});

it("reads the list again on a handbook event", async () => {
    const { cluster, sync, handbook } = setup();
    handbook.subscribe(() => undefined);
    await settled(handbook, () => handbook.get().status === "ready");
    expect(handbook.get().items).toEqual([]);
    cluster.itemAdd({ id: DEPLOYS, title: "Deploys", by: "u_kirill" });
    sync.writer.updateReceived({
        kind: "event",
        cursor: "c1",
        event: { type: "handbook.created", payload: { id: DEPLOYS } } as never,
    });
    await settled(handbook, () => handbook.get().items.length === 1);
});

it("applies each draft as the reviewer saw it, and leaves later edits pending", async () => {
    const { cluster, handbook } = setup();
    cluster.itemAdd({ id: DEPLOYS, title: "Deploys", text: "Deploy after CI." });
    cluster.applyNow(DEPLOYS);
    cluster.draftWrite(DEPLOYS, "Deploy to staging first.");
    handbook.subscribe(() => undefined);
    await settled(handbook, () => handbook.get().items[0]?.pending === true);

    handbook.reviewOpen([DEPLOYS]);
    await settled(handbook, () => handbook.get().review?.items[0]?.comparison.type === "ready");
    const reviewed = handbook.get().review!.items[0]!;
    expect(reviewed.baseSeq).toBe(2);
    expect(reviewed.comparison).toEqual({
        type: "ready",
        value: { before: "Deploy after CI.", after: "Deploy to staging first." },
    });

    // Kirill keeps typing while the sheet is open.
    cluster.draftWrite(DEPLOYS, "Deploy to staging first, then smoke test.", "u_kirill");
    handbook.reviewNoteUpdate("Staging first");
    handbook.reviewSubmit();
    await settled(handbook, () => handbook.get().review === undefined);

    const apply = cluster.calls.find((call) => call.path === "v0/handbook/apply");
    expect(apply?.body).toMatchObject({
        note: "Staging first",
        items: [{ id: DEPLOYS, baseSeq: 2 }],
    });
    await settled(handbook, () => handbook.get().items[0]?.applied?.revision === 2);
    expect(handbook.get().items[0]).toMatchObject({ pending: true, pendingUserIds: ["u_kirill"] });
});

it("says who is still writing in a reviewed draft", async () => {
    const { cluster, handbook } = setup();
    cluster.itemAdd({ id: DEPLOYS, title: "Deploys", text: "One.", by: "u_kirill" });
    handbook.subscribe(() => undefined);
    await settled(handbook, () => handbook.get().items.length === 1);
    handbook.reviewOpen([DEPLOYS]);
    await settled(
        handbook,
        () => handbook.get().review?.items[0]?.editingUserIds.includes("u_kirill") === true,
    );
    expect(handbook.get().review!.items[0]!.changedSinceOpened).toBe(false);
});

it("explains a refused apply in the review and lets it be tried again", async () => {
    const { cluster, handbook } = setup();
    cluster.itemAdd({ id: DEPLOYS, title: "Deploys", text: "One." });
    handbook.subscribe(() => undefined);
    await settled(handbook, () => handbook.get().items.length === 1);
    handbook.reviewOpen([DEPLOYS]);
    cluster.refuseNext("POST", "v0/handbook/apply", 409, {
        error: { code: "handbook_budget", message: "Too big." },
        bytes: 300_000,
        limit: 262_144,
    });
    handbook.reviewSubmit();
    await settled(handbook, () => handbook.get().review?.error !== undefined);
    expect(handbook.get().review).toMatchObject({ applying: false });
    expect(handbook.get().review!.error!.message).toContain("293 KB");

    // Never answered, then answered: one mutation ID across both attempts.
    cluster.failNext("POST", "v0/handbook/apply");
    handbook.reviewSubmit();
    await settled(handbook, () => handbook.get().review?.applying === false);
    handbook.reviewSubmit();
    await settled(handbook, () => handbook.get().review === undefined);
    const ids = cluster.calls
        .filter((call) => call.path === "v0/handbook/apply")
        .map((call) => (call.body as { mutationId: string }).mutationId);
    expect(ids).toHaveLength(3);
    expect(ids[0]).not.toBe(ids[1]);
    expect(ids[1]).toBe(ids[2]);
});

it("sends a typed title once typing rests, and shows it meanwhile", async () => {
    const { cluster, handbook } = setup();
    cluster.itemAdd({ id: DEPLOYS, title: "Deploys" });
    handbook.subscribe(() => undefined);
    await settled(handbook, () => handbook.get().items.length === 1);
    handbook.titleUpdate(DEPLOYS, "Deploy");
    handbook.titleUpdate(DEPLOYS, "Deploys and rollbacks");
    expect(handbook.get().edits.get(DEPLOYS)?.title).toBe("Deploys and rollbacks");
    await settled(handbook, () => handbook.get().items[0]?.title === "Deploys and rollbacks");
    await settled(handbook, () => handbook.get().edits.size === 0);
    expect(cluster.calls.filter((call) => call.method === "PATCH")).toHaveLength(1);
});

it("carries a draft live, taking only its own item's frames", async () => {
    const { cluster, sync, handbook } = setup();
    cluster.itemAdd({ id: DEPLOYS, title: "Deploys", text: "Ship." });
    const draft = handbook.draft(DEPLOYS);
    draft.subscribe(() => undefined);
    sync.writer.bootstrapReceived({} as never);
    sync.writer.updateReceived({ kind: "connected", cursor: "c0", streamId: "stream_1" as never });
    await vi.waitFor(() => {
        if (draft.get().status !== "live") throw new Error(draft.get().status);
    });
    const snapshot = draft.get();
    if (snapshot.status !== "live") throw new Error("not live");
    expect(snapshot.ydoc.getText("markdown").toString()).toBe("Ship.");
    expect(cluster.calls.some((call) => call.path === "v0/handbook/hb_deploys/subscribe")).toBe(
        true,
    );

    // A frame for another item, or for a Surface, changes nothing here.
    const other = new Y.Doc();
    other.getText("markdown").insert(0, "elsewhere ");
    const elsewhere = btoa(String.fromCharCode(...Y.encodeStateAsUpdate(other)));
    sync.writer.updateReceived({
        kind: "document",
        frame: { type: "document.update", data: { itemId: STYLE, seq: 9, update: elsewhere } },
    } as never);
    sync.writer.updateReceived({
        kind: "document",
        frame: { type: "document.update", data: { surfaceId: DEPLOYS, seq: 9, update: elsewhere } },
    } as never);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(snapshot.ydoc.getText("markdown").toString()).toBe("Ship.");

    // The reader types: the change reaches the draft on the cluster.
    snapshot.ydoc.getText("markdown").insert(5, " Today.");
    await vi.waitFor(() => {
        if (cluster.draftText(DEPLOYS) !== "Ship. Today.")
            throw new Error(cluster.draftText(DEPLOYS));
    });
});

it("builds the history from revisions and sessions, and reads a change only when opened", async () => {
    const { cluster, handbook } = setup();
    cluster.itemAdd({ id: DEPLOYS, title: "Deploys", text: "One." });
    cluster.applyNow(DEPLOYS);
    cluster.advance(10 * 60 * 1_000);
    cluster.draftWrite(DEPLOYS, "Two.", "u_kirill");
    const history = handbook.history(DEPLOYS);
    history.subscribe(() => undefined);
    await vi.waitFor(() => {
        if (history.get().status !== "ready") throw new Error("loading");
    });
    expect(history.get().entries.map((entry) => entry.key)).toEqual(["s:2-2", "r:1", "s:1-1"]);
    expect(cluster.calls.some((call) => call.path.includes("?seq="))).toBe(false);

    history.entryToggle("s:2-2");
    await vi.waitFor(() => {
        if (history.get().expanded.get("s:2-2")?.type !== "ready") throw new Error("loading");
    });
    expect(history.get().expanded.get("s:2-2")).toEqual({
        type: "ready",
        value: { before: "One.", after: "Two." },
    });

    history.entryRestore("r:1");
    await vi.waitFor(() => {
        if (cluster.draftText(DEPLOYS) !== "One.") throw new Error(cluster.draftText(DEPLOYS));
    });
});
