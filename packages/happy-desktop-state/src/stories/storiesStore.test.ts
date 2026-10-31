import type { Story } from "@slopus/happy-agent-client";
import { afterEach, expect, it, vi } from "vitest";
import { connectHappyAgent } from "../happyAgentConnection/connectHappyAgent.js";
import type { HappyAgentConnection } from "../happyAgentConnection/types.js";
import { happyAgentRichTasksStoreCreate } from "../richTasks/richTasksStore.js";
import { fakeHappyAgentDaemonCreate } from "../testing/fakeHappyAgentDaemon.js";
import { happyAgentStoriesStoreCreate, type HappyAgentStoriesStore } from "./storiesStore.js";

/* Stories are asked for only behind both gates, `capabilities.storyArtifacts`
 * and the rich Tasks area; `story.changed` keeps the feed whole, and opening a
 * story marks it seen once. */

const opened: { connection: HappyAgentConnection; store: HappyAgentStoriesStore }[] = [];

afterEach(() => {
    for (const { connection, store } of opened.splice(0)) {
        store[Symbol.dispose]();
        connection.close();
    }
});

const story = (artifactId: string, agentId: string, more: Partial<Story> = {}): Story => ({
    artifactId,
    artifactVersion: 1,
    poster: { kind: "agent", agentId, taskId: null, botId: null },
    replyAgentId: agentId,
    audience: "owner",
    caption: "Shipped",
    media: { path: "frame.png" },
    round: null,
    repostOf: null,
    postedAt: 1,
    expiresAt: 2,
    state: "live",
    endedAt: null,
    takenDownBy: null,
    seenBy: [],
    replies: 0,
    ...more,
});

async function open(options: { readonly stories: boolean }) {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.taskSectionsSet([]);
    daemon.storiesSet(options.stories ? [story("story_1", "agent_a")] : undefined);
    daemon.taskSeed({ id: "task_a", name: "Launch", joinedKey: "a1" });
    await daemon.client.saveUserSetting("tasks.rich", { value: true });
    const connection = connectHappyAgent({
        endpoint: "http://happy-agent.test/",
        token: "token",
        client: daemon.client,
        wait: () => new Promise((resolve) => setTimeout(resolve, 0)),
        now: () => 1_000,
    });
    const richTasks = happyAgentRichTasksStoreCreate({ client: daemon.client, connection });
    const store = happyAgentStoriesStoreCreate({ client: daemon.client, connection, richTasks });
    opened.push({ connection, store });
    store.subscribe(() => undefined);
    return { daemon, richTasks, store };
}

const rings = (store: HappyAgentStoriesStore) => {
    const snapshot = store.get();
    return snapshot.mode === "on"
        ? snapshot.rings.map((ring) => [ring.id, ring.stories.length, ring.unseen])
        : snapshot.mode;
};

it("asks a daemon without storyArtifacts for no story, even with rich tasks on", async () => {
    const { daemon, richTasks, store } = await open({ stories: false });
    await vi.waitFor(() => expect(richTasks.get().mode).toBe("rich"));
    store.ringOpen("agent:agent_a");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(store.get()).toEqual({ mode: "off" });
    expect(
        daemon.calls.filter((call) => /Stor/u.test(call.method) || call.args.includes("story")),
    ).toEqual([]);
});

it("reconciles story.changed: a second story is a second segment, an ended one leaves", async () => {
    const { daemon, store } = await open({ stories: true });
    await vi.waitFor(() => expect(rings(store)).toEqual([["agent:agent_a", 1, 1]]));

    daemon.eventEmit("story.changed", { story: story("story_2", "agent_a", { postedAt: 5 }) });
    await vi.waitFor(() => expect(rings(store)).toEqual([["agent:agent_a", 2, 2]]));

    daemon.eventEmit("story.changed", {
        story: story("story_1", "agent_a", { state: "replaced" }),
    });
    daemon.eventEmit("story.changed", { story: story("story_9", "agent_b", { postedAt: 9 }) });
    await vi.waitFor(() =>
        expect(rings(store)).toEqual([
            ["agent:agent_b", 1, 1],
            ["agent:agent_a", 1, 1],
        ]),
    );
    expect(daemon.callCount("listStories")).toBe(1);
});

it("marks an opened story seen once and greys its ring", async () => {
    const { daemon, store } = await open({ stories: true });
    await vi.waitFor(() => expect(rings(store)).toEqual([["agent:agent_a", 1, 1]]));

    store.ringOpen("agent:agent_a");
    await vi.waitFor(() => expect(rings(store)).toEqual([["agent:agent_a", 1, 0]]));
    store.storyStep(-1);
    store.ringOpen("agent:agent_a");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(daemon.callCount("markStorySeen")).toBe(1);
    expect(daemon.callCount("listStoryReplies")).toBe(1);
    const snapshot = store.get();
    expect(snapshot.mode === "on" && snapshot.open?.story.artifactId).toBe("story_1");
});
