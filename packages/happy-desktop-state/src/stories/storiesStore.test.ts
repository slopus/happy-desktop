import { expect, it, vi } from "vitest";
import type { Story } from "@slopus/happy-agent-client";
import { happyAgentSyncCreate } from "../happyAgentConnection/happyAgentSync.js";
import {
    happyAgentAutoJoinSettingsCreate,
    type HappyAgentAutoJoinSettingsSnapshot,
} from "../happyAgent/happyAgentAutoJoinSettings.js";
import { happyAgentStoriesStoreCreate } from "./storiesStore.js";

function story(id: string, agentId: string, postedAt: number, seen = false): Story {
    return {
        id,
        agentId,
        taskId: agentId.startsWith("task") ? agentId : null,
        botId: agentId.startsWith("bot") ? agentId : null,
        caption: `caption ${id}`,
        media: { kind: "image", mimeType: "image/png", size: 1 },
        postedAt,
        expiresAt: Date.now() + 86_400_000,
        seen,
        poster: "agent",
        userId: null,
        repostOf: null,
        round: null,
        replyCount: 0,
        replies: [],
        canDelete: false,
    } as Story;
}

/** A person's repost of an agent's story. */
function repost(id: string, userId: string, of: Story, seen = false): Story {
    return { ...of, id, poster: "person", userId, repostOf: of.id, seen, caption: "look" };
}

const replyOf = (storyId: string, n: number) => ({
    id: `r${n}`,
    storyId,
    userId: "u2",
    text: `reply ${n}`,
    createdAt: n,
});

/** A person's `stories` setting, which the test flips. */
function setting(enabled: boolean) {
    const listeners = new Set<() => void>();
    let snapshot: HappyAgentAutoJoinSettingsSnapshot;
    const set = (on: boolean) => {
        snapshot = { status: "ready", autoJoinEnabled: on, online: true, saving: false };
        for (const listener of listeners) listener();
    };
    set(enabled);
    return {
        get: () => snapshot,
        subscribe: (listener: () => void) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        set,
    };
}

function open(
    stories: Story[],
    enabled = true,
    preload?: (media: readonly { kind: string; url: string }[]) => Promise<readonly object[]>,
) {
    const server = { stories, seen: [] as string[], reads: 0 };
    const client = {
        listStories: vi.fn(async () => {
            server.reads += 1;
            return { stories: server.stories, cursor: "0005" };
        }),
        markStorySeen: vi.fn(async (id: string) => {
            server.seen.push(id);
            const marked = { ...server.stories.find((each) => each.id === id)!, seen: true };
            server.stories = server.stories.map((each) => (each.id === id ? marked : each));
            return { story: marked };
        }),
        storyMediaUrl: (id: string) => `https://daemon/v0/stories/${id}/media`,
        storyLayerUrl: (id: string, layer: string) =>
            `https://daemon/v0/stories/${id}/layers/${layer}`,
        uploadStoryMedia: vi.fn(async (body: Blob) => ({ upload: { id: `upload-${body.size}` } })),
        endpoint: "https://daemon",
        getUsers: vi.fn(async (ids: string[]) => ({
            users: ids.map((id) => ({ id, name: `Person ${id}`, photo: null })),
        })),
        listStoryReplies: vi.fn(async (id: string) => ({
            replies: [1, 2, 3].map((n) => replyOf(id, n)),
        })),
        replyToStory: vi.fn(async (_id: string, _text: string) => ({ reply: {} })),
        repostStory: vi.fn(async (id: string, body: { layers?: Story["layers"] }) => {
            const of = server.stories.find((each) => each.id === id)!;
            return {
                story: { ...repost("re", "me", of, true), layers: body.layers },
            };
        }),
        postStory: vi.fn(
            async (body: { media: { uploadId: string }; layers?: Story["layers"] }) => ({
                story: {
                    ...story("own", "", Date.now(), true),
                    poster: "person" as const,
                    agentId: null,
                    taskId: null,
                    botId: null,
                    userId: "me",
                    media: { kind: "image" as const, mimeType: "image/png", size: 5 },
                    layers: body.layers,
                    canDelete: true,
                },
            }),
        ),
        deleteStory: vi.fn(async (_id: string) => ({})),
    };
    const sync = happyAgentSyncCreate();
    const settings = setting(enabled);
    const store = happyAgentStoriesStoreCreate({
        client: client as never,
        sync: sync.source,
        settings,
        ...(preload ? { preload } : {}),
    });
    store.subscribe(() => undefined);
    sync.writer.bootstrapReceived({} as never);
    return { server, client, sync, settings, store };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
async function until(check: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 200 && !check(); attempt += 1) await settle();
    expect(check()).toBe(true);
}
const on = (snapshot: ReturnType<ReturnType<typeof open>["store"]["get"]>) => {
    if (snapshot.mode !== "on") throw new Error("stories are off");
    return snapshot;
};
const post = (sync: ReturnType<typeof open>["sync"], cursor: string, posted: Story) =>
    sync.writer.updateReceived({
        kind: "event",
        cursor,
        event: { type: "story.changed", payload: { story: posted } },
    } as never);

it("with the setting off, reads nothing and stays off", async () => {
    const { store, client } = open([story("a", "task1", 1)], false);
    await settle();
    expect(store.get()).toEqual({ mode: "off" });
    expect(client.listStories).not.toHaveBeenCalled();
});

it("outlines an agent unseen, then seen once every story of it is opened", async () => {
    const { store, server } = open([
        story("a", "task1", 1),
        story("b", "task1", 2),
        story("c", "bot1", 2),
    ]);
    await until(() => on(store.get()).outlines.size === 2);
    expect(on(store.get()).outlines.get("task1")).toBe("unseen");

    store.agentOpen("task1");
    expect(on(store.get()).open).toMatchObject({
        story: { id: "a" },
        segment: { index: 0, total: 2 },
        media: { kind: "image", url: "https://daemon/v0/stories/a/media" },
    });
    await until(() => server.seen.length === 1);
    // One of two seen leaves the outline in the accent once the next one is fetched ahead.
    await until(() => on(store.get()).outlines.get("task1") === "unseen");

    store.storyStep(1);
    expect(on(store.get()).open?.story.id).toBe("b");
    await until(() => on(store.get()).outlines.get("task1") === "seen");
    // Opening a seen story again asks nothing.
    store.storyStep(-1);
    await settle();
    expect(server.seen).toEqual(["a", "b"]);
    store.storyStep(-1);
    expect(on(store.get()).open).toBeNull();
    expect(on(store.get()).outlines.get("bot1")).toBe("unseen");
});

it("opens an agent at its first unseen story, and closes past the last", async () => {
    const { store } = open([story("a", "bot1", 1, true), story("b", "bot1", 2)]);
    await until(() => on(store.get()).outlines.size === 1);
    store.agentOpen("bot1");
    expect(on(store.get()).open?.segment).toEqual({ index: 1, total: 2 });
    store.storyStep(1);
    expect(on(store.get()).open).toBeNull();
    store.agentOpen("bot1");
    store.viewerClose();
    expect(on(store.get()).open).toBeNull();
});

it("adopts a posted story live, and ignores one the read already had", async () => {
    const { store, sync } = open([]);
    await until(() => on(store.get()).outlines.size === 0);
    post(sync, "0003", story("old", "task8", 1));
    post(sync, "0009", story("n", "task9", 3));
    await until(() => on(store.get()).outlines.get("task9") === "unseen");
    expect(on(store.get()).outlines.has("task8")).toBe(false);
});

it("turning the setting off clears the feed and stops following", async () => {
    const { store, settings, server } = open([story("a", "task1", 1)]);
    await until(() => on(store.get()).outlines.size === 1);
    settings.set(false);
    expect(store.get()).toEqual({ mode: "off" });
    settings.set(true);
    await until(() => on(store.get()).outlines.size === 1);
    expect(server.reads).toBe(2);
});

it("the setting is off unless saved true, and unsupported without storyFeed", async () => {
    const settingsOf = async (value: unknown, storyFeed: boolean) => {
        const sync = happyAgentSyncCreate();
        sync.writer.healthReceived({
            capabilities: { storyFeed },
            version: { protocol: 40 },
        } as never);
        const store = happyAgentAutoJoinSettingsCreate(
            { client: {} as never, sync: sync.source },
            "stories",
        );
        store.subscribe(() => undefined);
        const userSettings = value === undefined ? [] : [{ key: "stories", value, updatedAt: 1 }];
        sync.writer.bootstrapReceived({ profile: { userId: "u1" }, userSettings } as never);
        await until(() => store.get().status !== "loading");
        return store.get();
    };
    expect(await settingsOf(undefined, true)).toMatchObject({ autoJoinEnabled: false });
    expect(await settingsOf("yes", true)).toMatchObject({ autoJoinEnabled: false });
    expect(await settingsOf(true, true)).toMatchObject({ status: "ready", autoJoinEnabled: true });
    expect(await settingsOf(true, false)).toEqual({ status: "unsupported" });
});

it("never asks a daemon without storyFeed for the setting", async () => {
    for (const health of [undefined, { capabilities: {}, version: { protocol: 40 } }]) {
        const sync = happyAgentSyncCreate();
        if (health) sync.writer.healthReceived(health as never);
        // Mounted after bootstrap, as the sidebar is: a late follower reconciles.
        sync.writer.bootstrapReceived({ profile: { userId: "u1" }, userSettings: [] } as never);
        const client = { getUserSettings: vi.fn(), getProfile: vi.fn() };
        const store = happyAgentAutoJoinSettingsCreate(
            { client: client as never, sync: sync.source },
            "stories",
        );
        store.subscribe(() => undefined);
        await settle();
        expect(store.get()).toEqual({ status: "unsupported" });
        expect(client.getUserSettings).not.toHaveBeenCalled();
    }
});

it("greys a story the moment it opens, and asks the daemon once", async () => {
    const { store, client, server, sync } = open([story("a", "task1", 1)]);
    await until(() => on(store.get()).outlines.size === 1);
    client.markStorySeen.mockReturnValue(new Promise(() => undefined));
    store.agentOpen("task1");
    expect(on(store.get()).outlines.get("task1")).toBe("seen");
    store.viewerClose();
    store.agentOpen("task1");
    expect(client.markStorySeen).toHaveBeenCalledTimes(1);
    // Neither a late read nor a replayed event, both from before the look, takes it back.
    sync.writer.bootstrapReceived({} as never);
    await until(() => server.reads === 2);
    await settle();
    post(sync, "0006", story("a", "task1", 1));
    await settle();
    expect(on(store.get()).outlines.get("task1")).toBe("seen");
});

it("moves its cursor with each live story", async () => {
    const { store, sync } = open([]);
    await until(() => on(store.get()).outlines.size === 0);
    post(sync, "0009", story("n", "task9", 3));
    post(sync, "0007", story("m", "task7", 3));
    await until(() => on(store.get()).outlines.has("task9"));
    await settle();
    expect(on(store.get()).outlines.has("task7")).toBe(false);
});

it("retries a failed read", async () => {
    vi.useFakeTimers();
    try {
        const { store, client } = open([story("a", "task1", 1)]);
        client.listStories.mockRejectedValueOnce(new Error("offline"));
        await vi.advanceTimersByTimeAsync(0);
        expect(on(store.get()).outlines.size).toBe(0);
        await vi.advanceTimersByTimeAsync(1_000);
        expect(on(store.get()).outlines.get("task1")).toBe("unseen");
    } finally {
        vi.useRealTimers();
    }
});

it("drops a story when it expires, keeping the open one where it is", async () => {
    vi.useFakeTimers();
    try {
        const now = Date.now();
        const lasting = (id: string, ms: number) => ({
            ...story(id, "bot1", now),
            expiresAt: now + ms,
        });
        const { store } = open([lasting("a", 1_000), lasting("b", 2_000)]);
        await vi.advanceTimersByTimeAsync(0);
        store.agentOpen("bot1");
        store.storyStep(1);
        expect(on(store.get()).open).toMatchObject({
            story: { id: "b" },
            segment: { index: 1, total: 2 },
        });
        await vi.advanceTimersByTimeAsync(1_000);
        expect(on(store.get()).open).toMatchObject({
            story: { id: "b" },
            segment: { index: 0, total: 1 },
        });
        await vi.advanceTimersByTimeAsync(1_000);
        expect(on(store.get()).open).toBeNull();
        expect(on(store.get()).outlines.size).toBe(0);
    } finally {
        vi.useRealTimers();
    }
});

it("subscribing renders nothing again, keeps the feed with nobody subscribed, and a disposed store follows nothing", async () => {
    const { store, client, sync } = open([story("a", "task1", 1)]);
    await until(() => on(store.get()).outlines.size === 1);
    const before = store.get();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    expect(listener).not.toHaveBeenCalled();
    expect(store.get()).toBe(before);
    unsubscribe();
    // Switched away: live stories still land, and coming back reads nothing and shows them at once.
    post(sync, "0006", story("b", "bot1", 2));
    await until(() => on(store.get()).row.length === 2);
    store.subscribe(listener);
    expect(client.listStories).toHaveBeenCalledTimes(1);

    store[Symbol.dispose]();
    store.subscribe(listener);
    await settle();
    expect(listener).not.toHaveBeenCalled();
    expect(client.listStories).toHaveBeenCalledTimes(1);
});

it("lays out the row per poster, unseen first, and plays on through it", async () => {
    const agentStory = story("a", "task1", 1);
    const { store } = open([
        story("s", "bot1", 5, true),
        agentStory,
        { ...repost("p", "u1", agentStory), postedAt: 2 },
    ]);
    await until(() => on(store.get()).row.length === 3);
    expect(on(store.get()).row.map((tile) => [tile.key, tile.state])).toEqual([
        ["person:u1", "unseen"],
        ["agent:task1", "unseen"],
        ["agent:bot1", "seen"],
    ]);
    // Only agents' own stories outline their rows.
    expect([...on(store.get()).outlines]).toEqual([
        ["bot1", "seen"],
        ["task1", "unseen"],
    ]);
    await until(() => on(store.get()).people.get("u1")?.name === "Person u1");

    store.tileOpen("person:u1");
    expect(on(store.get()).open?.story.id).toBe("p");
    // The row keeps the order it opened in, though seen posters move back.
    store.storyStep(1);
    expect(on(store.get()).open?.story.id).toBe("a");
    store.storyStep(1);
    // A watched author is never autoplayed just because it remains in the row.
    expect(on(store.get()).open).toBeNull();
});

it("plays many stories chronologically, preloads the next, and skips fully watched authors", async () => {
    const { store, sync } = open([
        story("later", "task1", 3),
        story("first", "task1", 1),
        story("middle", "task1", 2),
        story("watched", "bot1", 9, true),
        story("fresh", "task2", 0),
    ]);
    await until(() => on(store.get()).row.length === 3);
    store.tileOpen("agent:task1");
    expect(on(store.get()).open).toMatchObject({
        story: { id: "first" },
        media: { kind: "image", url: "https://daemon/v0/stories/first/media" },
    });
    store.storyStep(1);
    expect(on(store.get()).open?.story.id).toBe("middle");
    store.storyStep(1);
    expect(on(store.get()).open?.story.id).toBe("later");
    // An author fully watched elsewhere while this viewer was open is skipped too.
    post(sync, "0006", story("fresh", "task2", 0, true));
    await until(() => on(store.get()).row.every((tile) => tile.state === "seen"));
    store.storyStep(1);
    expect(on(store.get()).open).toBeNull();
});

it("shows the last two replies, every reply once the drawer asks, and sends one", async () => {
    const replied = {
        ...story("a", "task1", 1),
        replyCount: 3,
        replies: [replyOf("a", 2), replyOf("a", 3)],
    };
    const { store, client } = open([replied]);
    await until(() => on(store.get()).row.length === 1);
    store.agentOpen("task1");
    expect(on(store.get()).open?.replies.map((reply) => reply.id)).toEqual(["r2", "r3"]);
    store.repliesOpen();
    await until(() => on(store.get()).open?.replies.length === 3);
    store.replySend("make it blue");
    expect(client.replyToStory).toHaveBeenCalledWith("a", "make it blue");
    client.replyToStory.mockRejectedValueOnce(new Error("Story ended"));
    store.replySend("again");
    await until(() => on(store.get()).failure?.message === "Story ended");
});

it("reposts with each media layer uploaded once and referenced, and adopts the repost", async () => {
    const { store, client } = open([story("a", "task1", 1)]);
    await until(() => on(store.get()).row.length === 1);
    store.agentOpen("task1");
    const blob = new Blob([new Uint8Array([0, 1, 2, 255])], { type: "video/mp4" });
    const text = { text: "so good 🚀", x: 0.7, y: 0.6, scale: 1.5, rotation: -20 };
    const round = { shape: "round" as const, x: 0.3, y: 0.4, width: 0.5, aspect: 1, scale: 2 };
    store.storyRepost({ caption: "Separate caption", text, mediaLayers: [{ ...round, blob }] });
    await until(() => on(store.get()).row.some((tile) => tile.key === "person:me"));
    expect(client.uploadStoryMedia).toHaveBeenCalledExactlyOnceWith(blob);
    expect(client.repostStory).toHaveBeenCalledWith("a", {
        caption: "Separate caption",
        layers: { text },
        mediaLayers: [{ ...round, uploadId: "upload-4" }],
    });
});

it("reads the feed from the startup data, and shows a ring only once its first story can play", async () => {
    const pending = new Map<string, () => void>();
    const preload = vi.fn(
        (media: readonly { url: string }[]) =>
            new Promise<readonly object[]>((resolve) =>
                pending.set(media[0]!.url, () => resolve([])),
            ),
    );
    const { store, client, sync } = open([], true, preload);
    const layered = {
        ...story("a", "task1", 1),
        mediaLayers: [
            {
                id: "round",
                kind: "video" as const,
                mimeType: "video/mp4",
                size: 9,
                x: 0.5,
                y: 0.5,
                width: 0.4,
                aspect: 1,
            },
        ],
    };
    sync.writer.bootstrapReceived({
        storiesEnabled: true,
        stories: [layered, story("b", "task1", 2)],
        cursor: "0007",
    } as never);
    await until(() => preload.mock.calls.length === 1);
    expect(client.listStories).not.toHaveBeenCalled();
    expect(preload).toHaveBeenCalledWith([
        { kind: "image", url: "https://daemon/v0/stories/a/media" },
        expect.objectContaining({
            id: "round",
            shape: "rect",
            url: "https://daemon/v0/stories/a/layers/round",
        }),
    ]);
    expect(on(store.get()).row).toEqual([]);
    expect(on(store.get()).outlines.size).toBe(0);
    // Three fetch at once; the fourth poster waits its turn, then is fetched too.
    for (const [id, at] of [
        ["c", "0008"],
        ["d", "0009"],
        ["e", "0010"],
    ])
        post(sync, at!, story(id!, `task${id}`, 3));
    await until(() => pending.size === 3);
    pending.get("https://daemon/v0/stories/c/media")!();
    await until(() => pending.size === 4);
    pending.get("https://daemon/v0/stories/a/media")!();
    await until(() => on(store.get()).row.length === 2);
    expect(on(store.get()).outlines.get("task1")).toBe("unseen");
    // Opening it fetches the next story ahead of playback.
    store.agentOpen("task1");
    await until(() => pending.has("https://daemon/v0/stories/b/media"));
    expect(client.listStories).not.toHaveBeenCalled();
});

it("shows a ring whose fetch ahead stalls once the wait runs out, and frees its slot", async () => {
    vi.useFakeTimers();
    try {
        const preload = vi.fn(() => new Promise<readonly object[]>(() => {}));
        const { store, sync } = open([], true, preload);
        sync.writer.bootstrapReceived({
            storiesEnabled: true,
            stories: ["a", "b", "c", "d"].map((id, at) => story(id, `task${id}`, at)),
            cursor: "0007",
        } as never);
        await vi.advanceTimersByTimeAsync(7_999);
        expect(on(store.get()).row).toEqual([]);
        expect(preload).toHaveBeenCalledTimes(3);
        await vi.advanceTimersByTimeAsync(1);
        expect(on(store.get()).row).toHaveLength(3);
        expect(preload).toHaveBeenCalledTimes(4);
        await vi.advanceTimersByTimeAsync(8_000);
        expect(on(store.get()).row).toHaveLength(4);
    } finally {
        vi.useRealTimers();
    }
});

it("drops a deleted story, by the reader or live from the daemon", async () => {
    const { store, sync, client } = open([
        { ...story("a", "task1", 1), canDelete: true },
        story("b", "bot1", 2),
    ]);
    await until(() => on(store.get()).row.length === 2);
    store.agentOpen("task1");
    store.storyDelete();
    await until(() => on(store.get()).open === null);
    expect(client.deleteStory).toHaveBeenCalledWith("a");
    expect(on(store.get()).outlines.has("task1")).toBe(false);
    sync.writer.updateReceived({
        kind: "event",
        cursor: "0009",
        event: { type: "story.removed", payload: { storyId: "b" } },
    } as never);
    await until(() => on(store.get()).row.length === 0);
});

it("reports a refused repost, and clears it once one is taken", async () => {
    const { store, client } = open([story("a", "task1", 1)]);
    await until(() => on(store.get()).row.length === 1);
    store.agentOpen("task1");
    client.repostStory.mockRejectedValueOnce(new Error("Not an H.264 MP4"));
    expect(await store.storyRepost({ mediaLayers: [] })).toBe(false);
    expect(on(store.get()).failure?.message).toBe("Not an H.264 MP4");
    expect(await store.storyRepost({ mediaLayers: [] })).toBe(true);
    expect(on(store.get()).failure).toBeNull();
});

it("posts gallery photos and MP4s without added layers, retains failures, and rejects unsupported picks", async () => {
    const { store, client } = open([]);
    await until(() => client.listStories.mock.calls.length > 0);
    for (const type of ["image/png", "video/mp4"]) {
        const file = new File(["media"], "story", { type });
        store.storyDraftOpen(file);
        expect(on(store.get()).draft?.kind).toBe(type === "video/mp4" ? "video" : "image");
        client.postStory.mockRejectedValueOnce(new Error("Try again"));
        expect(await store.storyPost({ mediaLayers: [] })).toBe(false);
        expect(on(store.get()).draft).not.toBeNull();
        expect(await store.storyPost({ caption: "Gallery caption", mediaLayers: [] })).toBe(true);
        expect(client.uploadStoryMedia).toHaveBeenLastCalledWith(file);
        expect(client.postStory).toHaveBeenLastCalledWith({
            media: { uploadId: "upload-5" },
            caption: "Gallery caption",
            mediaLayers: [],
        });
        expect(on(store.get()).draft).toBeNull();
        store.tileOpen("person:me");
        expect(on(store.get()).open?.story.canDelete).toBe(true);
        expect(on(store.get()).outlines.size).toBe(0);
    }
    store.storyDraftOpen(new File(["bad"], "clip.webm", { type: "video/webm" }));
    expect(on(store.get()).failure?.message).toContain("image or an MP4");
    expect(on(store.get()).draft).toBeNull();
});

it("carries on past a story that leaves while open, and skips emptied posters", async () => {
    const removed = (sync: ReturnType<typeof open>["sync"], cursor: string, storyId: string) =>
        sync.writer.updateReceived({
            kind: "event",
            cursor,
            event: { type: "story.removed", payload: { storyId } },
        } as never);
    const { store, sync } = open([
        story("a1", "task1", 3),
        story("a2", "task1", 4),
        story("b1", "task2", 2),
        story("c1", "task3", 1),
    ]);
    await until(() => on(store.get()).row.length === 3);
    store.tileOpen("agent:task1");
    expect(on(store.get()).open?.story.id).toBe("a1");
    // Its poster's next story takes its place.
    removed(sync, "0006", "a1");
    await until(() => on(store.get()).open?.story.id === "a2");
    // A poster emptied behind the reader is stepped over, both ways.
    removed(sync, "0007", "b1");
    await until(() => on(store.get()).row.length === 2);
    store.storyStep(1);
    expect(on(store.get()).open?.story.id).toBe("c1");
    store.storyStep(-1);
    expect(on(store.get()).open?.story.id).toBe("a2");
    // The poster's last one gone, the row's next poster plays only while it has unseen stories.
    removed(sync, "0008", "a2");
    await until(() => on(store.get()).open === null);
});

const layer = (id: string) => ({
    id,
    kind: "video" as const,
    mimeType: "video/mp4",
    size: 9,
    x: 0.5,
    y: 0.5,
    width: 0.4,
    aspect: 1,
});

it("addresses a repost's shared media through its original, fetching each file once", async () => {
    const fetched: string[] = [];
    const preload = vi.fn(async (media: readonly { url: string }[]) => {
        fetched.push(...media.map(({ url }) => url));
        return media.map(({ url }) => ({ poster: `frame of ${url}` }));
    });
    const original = { ...story("a", "task1", 1), mediaLayers: [layer("sticker")] };
    // The daemon lists the original's layers first under their own ids, then the reposter's.
    const reposts = [
        { ...repost("r2", "u2", original), mediaLayers: [layer("sticker"), layer("x2")] },
        { ...repost("r1", "u1", original), mediaLayers: [layer("sticker"), layer("round")] },
    ];
    const { store } = open([...reposts, original], true, preload);
    await until(() => on(store.get()).row.length === 3);
    const at = (path: string) => `https://daemon/v0/stories/${path}`;
    expect([...fetched].sort()).toEqual(
        ["a/layers/sticker", "a/media", "r1/layers/round", "r2/layers/x2"].map(at),
    );
    store.tileOpen("person:u2");
    expect(on(store.get()).open).toMatchObject({
        media: { url: at("a/media"), poster: `frame of ${at("a/media")}` },
        mediaLayers: [
            {
                id: "sticker",
                url: at("a/layers/sticker"),
                poster: `frame of ${at("a/layers/sticker")}`,
            },
            { id: "x2", url: at("r2/layers/x2") },
        ],
    });
    // A legacy round is always the reposter's own.
    store.tileOpen("person:u1");
    expect(on(store.get()).open?.mediaLayers.map(({ url }) => url)).toEqual([
        at("a/layers/sticker"),
        at("r1/layers/round"),
    ]);
    // Opening the original and every repost fetched nothing more.
    store.tileOpen("agent:task1");
    await settle();
    expect(fetched).toHaveLength(4);

    // Without the original, the reposts share the first repost's copy.
    const alone = open(reposts, true);
    await until(() => on(alone.store.get()).row.length === 2);
    alone.store.tileOpen("person:u2");
    expect(on(alone.store.get()).open).toMatchObject({
        media: { url: at("r1/media") },
        mediaLayers: [{ url: at("r1/layers/sticker") }, { url: at("r2/layers/x2") }],
    });
});

it("keeps a ring grey until its new first unseen story can play, for at most the wait", async () => {
    vi.useFakeTimers();
    try {
        const stall = new Set(["b", "d"]);
        const preload = vi.fn(async (media: readonly { url: string }[]) =>
            [...stall].some((id) => media[0]!.url.includes(`/${id}/`))
                ? new Promise<readonly object[]>(() => {})
                : [],
        );
        const { store, sync } = open([story("a", "task1", 1, true)], true, preload);
        await vi.advanceTimersByTimeAsync(0);
        expect(on(store.get()).row).toMatchObject([{ key: "agent:task1", state: "seen" }]);
        post(sync, "0006", story("b", "task1", 2));
        await vi.advanceTimersByTimeAsync(0);
        expect(preload).toHaveBeenCalledTimes(2);
        // Its new story is still being fetched: the row and the sidebar keep it grey.
        expect(on(store.get()).row).toMatchObject([{ state: "seen" }]);
        expect(on(store.get()).outlines.get("task1")).toBe("seen");
        await vi.advanceTimersByTimeAsync(7_999);
        expect(on(store.get()).row).toMatchObject([{ state: "seen" }]);
        await vi.advanceTimersByTimeAsync(1);
        expect(on(store.get()).row).toMatchObject([{ state: "unseen" }]);
        expect(on(store.get()).outlines.get("task1")).toBe("unseen");
        // The unseen story leaves while the next is still fetched: grey, not a ring onto a spinner.
        post(sync, "0007", story("d", "task1", 3));
        sync.writer.updateReceived({
            kind: "event",
            cursor: "0008",
            event: { type: "story.removed", payload: { storyId: "b" } },
        } as never);
        await vi.advanceTimersByTimeAsync(0);
        expect(on(store.get()).row).toMatchObject([{ state: "seen" }]);
        expect(on(store.get()).outlines.get("task1")).toBe("seen");
        await vi.advanceTimersByTimeAsync(8_000);
        expect(on(store.get()).row).toMatchObject([{ state: "unseen" }]);
        store.agentOpen("task1");
        expect(on(store.get()).open?.story.id).toBe("d");
        expect(on(store.get()).outlines.get("task1")).toBe("seen");
    } finally {
        vi.useRealTimers();
    }
});

it("forgets the frames and fetches of a story once it leaves the feed", async () => {
    const preload = vi.fn(async (media: readonly { url: string }[]) =>
        media.map(() => ({ poster: "frame" })),
    );
    const { store, sync } = open([story("a", "task1", 1), story("b", "task2", 2)], true, preload);
    await until(() => on(store.get()).row.length === 2);
    sync.writer.updateReceived({
        kind: "event",
        cursor: "0006",
        event: { type: "story.removed", payload: { storyId: "b" } },
    } as never);
    await until(() => on(store.get()).row.length === 1);
    // Posted again, it is fetched afresh and its ring waits for it once more.
    preload.mockImplementationOnce(() => new Promise(() => {}));
    post(sync, "0007", story("b", "task2", 2));
    await until(() => preload.mock.calls.length === 3);
    expect(preload).toHaveBeenLastCalledWith([
        { kind: "image", url: "https://daemon/v0/stories/b/media" },
    ]);
    expect(on(store.get()).row.map(({ key }) => key)).toEqual(["agent:task1"]);
    store.agentOpen("task1");
    expect(on(store.get()).open?.media.poster).toBe("frame");
});
