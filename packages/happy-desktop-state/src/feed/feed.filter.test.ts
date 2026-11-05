import { expect, it } from "vitest";
import type { FeedItem } from "@slopus/happy-agent-client";
import type { HappyAgentArtifactTitlesStore } from "../artifacts/artifactTitlesStore.js";
import { happyAgentSyncCreate } from "../happyAgentConnection/happyAgentSync.js";
import { fakeHappyAgentDaemonCreate } from "../testing/fakeHappyAgentDaemon.js";
import { happyAgentFeedCreate, type HappyAgentFeedFilter } from "./feed.js";

/** One open entry about `type:id`, at `cursor`; entries sort by it, newest first. */
function item(index: number, type: string): FeedItem {
    const cursor = String(index).padStart(6, "0");
    return {
        id: `item-${String(index)}`,
        version: `v-${cursor}`,
        cursor,
        subject: { type, id: `${type}-${String(index)}` },
        cluster: "*",
        created: true,
        updates: 0,
        actors: [],
        actorCount: 0,
        firstAt: index,
        lastAt: index,
        seenAt: null,
    } as FeedItem;
}

/**
 * A long feed in which highlights are rare: one task in every six entries,
 * the rest Surface entries. (A bot's entry waits for the bot catalog, which
 * this daemon does not serve.)
 */
function feedSparse(count: number): FeedItem[] {
    return Array.from({ length: count }, (_, index) =>
        item(count - index, index % 6 === 0 ? "task" : "surface"),
    );
}

/** Every artifact is read at once, so artifact entries settle as soon as they arrive. */
const artifactTitles = {
    get: () => ({ has: () => true }),
    subscribe: () => () => undefined,
    request: () => undefined,
    [Symbol.dispose]: () => undefined,
} as unknown as HappyAgentArtifactTitlesStore;

async function open(options: {
    readonly items: readonly FeedItem[];
    readonly subjectFilter: boolean;
    readonly kept?: HappyAgentFeedFilter;
}) {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.feedSeed(options.items);
    daemon.feedSubjectFilterSet(options.subjectFilter);
    const kept: HappyAgentFeedFilter[] = [];
    const sync = happyAgentSyncCreate();
    const feed = happyAgentFeedCreate({
        client: daemon.client,
        sync: sync.source,
        artifactTitles: () => artifactTitles,
        filterPersistence: {
            read: () => options.kept,
            write: (filter) => kept.push(filter),
        },
    });
    const page = feed.page();
    page.subscribe(() => undefined);
    sync.writer.healthReceived(await daemon.client.getHealth());
    sync.writer.bootstrapReceived({ cursor: daemon.cursorLatest() } as never);
    /** A new entry the daemon keeps and announces, as the connection delivers it. */
    const deliver = (created: FeedItem): void => {
        daemon.feedSeed([...daemon.feedItems(), created]);
        const event = daemon.eventEmit("feed.item.created", { item: created });
        sync.writer.updateReceived({ kind: "event", event, cursor: event.cursor });
    };
    return { daemon, page, kept, deliver };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
async function until(check: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 200 && !check(); attempt += 1) await settle();
    expect(check()).toBe(true);
}

const subjectsAsked = (daemon: ReturnType<typeof fakeHappyAgentDaemonCreate>) =>
    daemon.calls
        .filter((call) => call.method === "getFeed")
        .map((call) => (call.args[0] as { subjects?: readonly string[] }).subjects);

it("filters on the client and reads on until a screen of highlights shows, without subjectFilter", async () => {
    const feed = await open({ items: feedSparse(300), subjectFilter: false });
    await until(() => !feed.page.get().loading);
    expect(feed.page.get().filter).toBe("all");
    expect(feed.page.get().items).toHaveLength(50);

    feed.page.filterUpdate("highlights");

    expect(feed.kept).toEqual(["highlights"]);
    // Nine tasks are held so far: older pages are read until twenty show.
    await until(() => feed.page.get().items.length >= 20 && !feed.page.get().loadingMore);
    const shown = feed.page.get();
    expect(shown.items.every((entry) => entry.subject.type === "task")).toBe(true);
    expect(shown.hasMore).toBe(true);
    expect(shown.filteredUnread).toBe(shown.items.length);
    // This daemon cannot filter, so nothing asked it to.
    expect(subjectsAsked(feed.daemon).every((subjects) => subjects === undefined)).toBe(true);
    expect(feed.daemon.callCount("getFeed")).toBe(3);

    // Back to All: the same entries, every kind, without reading again.
    feed.page.filterUpdate("all");
    expect(feed.page.get().items.length).toBeGreaterThan(shown.items.length);
    expect(feed.daemon.callCount("getFeed")).toBe(3);
});

it("closes only the highlights shown, by name, when the daemon cannot read all of a filter", async () => {
    const feed = await open({ items: feedSparse(60), subjectFilter: false, kept: "highlights" });
    await until(() => !feed.page.get().loading && !feed.page.get().loadingMore);
    const highlights = feed.page.get().items;
    expect(highlights).toHaveLength(10);

    feed.page.readAll();

    expect(feed.daemon.callCount("markFeedReadAll")).toBe(0);
    expect(feed.page.get().filteredUnread).toBe(0);
    await until(() => feed.page.get().seenPending.size === 0);
    expect(feed.page.get().items.every((entry) => entry.seenAt !== null)).toBe(true);
    const held = feed.daemon.feedItems();
    expect(held.filter((entry) => entry.seenAt !== null)).toHaveLength(10);
    expect(
        held
            .filter((entry) => entry.subject.type !== "task")
            .every((entry) => entry.seenAt === null),
    ).toBe(true);
});

it("asks the daemon for highlights and their count when it can filter", async () => {
    const items = [
        item(6, "artifact"),
        item(5, "surface"),
        item(4, "task"),
        item(3, "surface"),
        item(2, "artifact"),
        item(1, "surface"),
    ];
    const feed = await open({ items, subjectFilter: true });
    await until(() => !feed.page.get().loading);
    expect(feed.page.get().items).toHaveLength(6);

    feed.page.filterUpdate("highlights");

    // The highlights already held show at once while the daemon is asked.
    expect(feed.page.get().items.map((entry) => entry.id)).toEqual(["item-6", "item-4", "item-2"]);
    await until(() => feed.daemon.callCount("getFeed") === 2);
    expect(subjectsAsked(feed.daemon)).toEqual([undefined, ["artifact", "task"]]);
    await until(() => feed.page.get().filteredUnread === 3);

    // A live entry about another kind is not one of the daemon's highlights.
    feed.deliver(item(7, "surface"));
    feed.deliver(item(8, "task"));
    await until(() => feed.page.get().items[0]?.id === "item-8");
    expect(feed.page.get().items.some((entry) => entry.id === "item-7")).toBe(false);

    feed.page.readAll();

    await until(() => feed.daemon.callCount("markFeedReadAll") === 1);
    const request = feed.daemon.calls.find((call) => call.method === "markFeedReadAll")!
        .args[0] as { through?: string; subjects?: readonly string[] };
    expect(request).toMatchObject({ through: "000008", subjects: ["artifact", "task"] });
    await until(() => feed.page.get().filteredUnread === 0);
    const closed = feed.daemon.feedItems().filter((entry) => entry.seenAt !== null);
    expect(closed.map((entry) => entry.subject.type).sort()).toEqual([
        "artifact",
        "artifact",
        "task",
        "task",
    ]);

    // All again: the filtered list has gaps, so it is read over.
    feed.page.filterUpdate("all");
    expect(feed.page.get().loading).toBe(true);
    await until(() => !feed.page.get().loading);
    expect(feed.page.get().items).toHaveLength(8);
    expect(subjectsAsked(feed.daemon).at(-1)).toBeUndefined();
});

it("opens on the filter the reader kept", async () => {
    const feed = await open({
        items: [item(3, "surface"), item(2, "artifact"), item(1, "surface")],
        subjectFilter: true,
        kept: "highlights",
    });
    expect(feed.page.get().filter).toBe("highlights");
    await until(() => !feed.page.get().loading);
    expect(feed.page.get().items.map((entry) => entry.id)).toEqual(["item-2"]);
    expect(subjectsAsked(feed.daemon)).toEqual([["artifact", "task"]]);
    expect(feed.kept).toEqual([]);
});
