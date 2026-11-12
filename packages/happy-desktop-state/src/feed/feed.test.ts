import { expect, it, vi } from "vitest";
import type { FeedItem } from "@slopus/happy-agent-client";
import type { HappyAgentArtifactTitlesStore } from "../artifacts/artifactTitlesStore.js";
import { happyAgentSyncCreate } from "../happyAgentConnection/happyAgentSync.js";
import { happyAgentFeedCreate } from "./feed.js";

function item(id: string, cursor: string, seenAt: number | null = null): FeedItem {
    return {
        id,
        version: `${cursor}-v`,
        cursor,
        subject: { type: "task", id: `task-${id}` },
        cluster: `task:task-${id}`,
        created: true,
        updates: 0,
        actors: [],
        actorCount: 0,
        firstAt: 1,
        lastAt: 1,
        seenAt,
    } as FeedItem;
}

const artifactTitles = {
    get: () => new Map(),
    subscribe: () => () => undefined,
    request: () => undefined,
    [Symbol.dispose]: () => undefined,
} as unknown as HappyAgentArtifactTitlesStore;

/** A feed whose first page is `items` and whose daemon counts `unread` open entries. */
function open(items: FeedItem[], unread: number) {
    let readAll: { resolve: (unread: number) => void; reject: (error: Error) => void };
    const client = {
        getFeed: vi.fn(async () => ({ items, hasMore: unread > 0, unread, cursor: "0001" })),
        markFeedReadAll: vi.fn(
            (_request: { through?: string }) =>
                new Promise<{ unread: number }>((resolve, reject) => {
                    readAll = { resolve: (count) => resolve({ unread: count }), reject };
                }),
        ),
        markFeedSeen: vi.fn(),
        endpoint: "https://daemon",
    };
    const sync = happyAgentSyncCreate();
    const feed = happyAgentFeedCreate({
        client: client as never,
        sync: sync.source,
        artifactTitles: () => artifactTitles,
    });
    const page = feed.page();
    const count = feed.unread();
    page.subscribe(() => undefined);
    count.subscribe(() => undefined);
    sync.writer.healthReceived({ capabilities: { feed: true } } as never);
    sync.writer.bootstrapReceived({ cursor: "0001", feedUnread: unread } as never);
    return {
        client,
        page,
        count,
        answer: (count: number) => readAll.resolve(count),
        fail: (error: Error) => readAll.reject(error),
    };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
async function until(check: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 200 && !check(); attempt += 1) await settle();
    expect(check()).toBe(true);
}

it("reads every entry through the newest on screen, closing them at once", async () => {
    const feed = open([item("b", "0003"), item("a", "0002")], 2);
    await until(() => feed.page.get().items.length === 2);

    feed.page.readAll();

    expect(feed.client.markFeedReadAll).toHaveBeenCalledTimes(1);
    expect(feed.client.markFeedReadAll.mock.calls[0]![0].through).toBe("0003");
    expect([...feed.page.get().seenPending]).toEqual(["b", "a"]);

    feed.answer(0);
    await until(() => feed.page.get().seenPending.size === 0);
    expect(feed.page.get().items.every((entry) => entry.seenAt !== null)).toBe(true);
    expect(feed.count.get().unread).toBe(0);
});

it("reads entries on pages not read yet, asking once however often it is pressed", async () => {
    const feed = open([item("b", "0003", 5), item("a", "0002", 5)], 3);
    await until(() => feed.page.get().items.length === 2);
    expect(feed.count.get().unread).toBe(3);

    feed.page.readAll();
    feed.page.readAll();

    expect(feed.client.markFeedReadAll).toHaveBeenCalledTimes(1);
    expect(feed.client.markFeedReadAll.mock.calls[0]![0].through).toBe("0003");
    feed.answer(0);
    await until(() => feed.count.get().unread === 0);
});

it("asks nothing when nothing is unread", async () => {
    const feed = open([item("a", "0002", 5)], 0);
    await until(() => feed.page.get().items.length === 1);

    feed.page.readAll();

    expect(feed.client.markFeedReadAll).not.toHaveBeenCalled();
});

it("reopens the entries and says why when the daemon refuses", async () => {
    const feed = open([item("a", "0002")], 1);
    await until(() => feed.page.get().items.length === 1);

    feed.page.readAll();
    expect(feed.page.get().seenPending.has("a")).toBe(true);
    feed.fail(new Error("offline"));

    await until(() => feed.page.get().error !== null);
    expect(feed.page.get().seenPending.size).toBe(0);
    expect(feed.page.get().items[0]!.seenAt).toBeNull();
    expect(feed.count.get().unread).toBe(1);

    feed.page.readAll();
    expect(feed.client.markFeedReadAll).toHaveBeenCalledTimes(2);
});

it("keeps where the reader left the list, and starts another list at its top", async () => {
    const feed = open([item("b", "0003"), item("a", "0002")], 0);
    await until(() => feed.page.get().items.length === 2);
    expect(feed.page.get().scrollPosition).toBeNull();
    let notified = 0;
    feed.page.subscribe(() => (notified += 1));

    feed.page.scrollPositionUpdate({ rowId: "a", offset: 12 });
    const left = feed.page.get();
    expect(left.scrollPosition).toEqual({ rowId: "a", offset: 12 });
    expect(notified).toBe(1);
    // The same place again is not a change, and nothing else moved with it.
    feed.page.scrollPositionUpdate({ rowId: "a", offset: 12 });
    expect(notified).toBe(1);
    expect(feed.page.get().items).toBe(left.items);
    expect(feed.client.getFeed).toHaveBeenCalledTimes(1);

    feed.page.filterUpdate("highlights");
    expect(feed.page.get().scrollPosition).toBeNull();
});
