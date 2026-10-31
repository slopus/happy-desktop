import { afterEach, expect, it, vi } from "vitest";
import { connectHappyAgent } from "../happyAgentConnection/connectHappyAgent.js";
import { happyAgentRichTasksStoreCreate } from "../richTasks/richTasksStore.js";
import { fakeHappyAgentDaemonCreate, fakeStory as story } from "../testing/fakeHappyAgentDaemon.js";
import { happyAgentStoriesStoreCreate, type HappyAgentStoriesStore } from "./storiesStore.js";

/* Asked for only behind both gates; reconciled from `story.changed`; seen once per open. */

const closes: (() => void)[] = [];
afterEach(() => closes.splice(0).forEach((close) => close()));

async function open(stories: boolean) {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.taskSectionsSet([]);
    daemon.storiesSet(stories ? [story("story_1", "agent_a")] : undefined);
    await daemon.client.saveUserSetting("tasks.rich", { value: true });
    const { client } = daemon;
    const connection = connectHappyAgent({ endpoint: "http://agent.test/", token: "t", client });
    const richTasks = happyAgentRichTasksStoreCreate({ client, connection });
    const store = happyAgentStoriesStoreCreate({ client, connection, richTasks });
    store.subscribe(() => undefined);
    closes.push(() => {
        store[Symbol.dispose]();
        connection.close();
    });
    return { daemon, richTasks, store };
}

const rings = (store: HappyAgentStoriesStore) => {
    const snapshot = store.get();
    if (snapshot.mode === "off") return snapshot.mode;
    return snapshot.rings.map((ring) => `${ring.id} ${ring.stories.length}/${ring.unseen}`);
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

it("asks a daemon without storyArtifacts for no story, even with rich tasks on", async () => {
    const { daemon, richTasks, store } = await open(false);
    await vi.waitFor(() => expect(richTasks.get().mode).toBe("rich"));
    store.ringOpen("agent:agent_a");
    await settle();

    expect(store.get()).toEqual({ mode: "off" });
    const asked = daemon.calls.filter(
        (call) => /Stor/u.test(call.method) || call.args.includes("story"),
    );
    expect(asked).toEqual([]);
});

it("reconciles story.changed, marks an opened story seen once, and walks in the order it opened", async () => {
    const { daemon, store } = await open(true);
    await vi.waitFor(() => expect(rings(store)).toEqual(["agent:agent_a 1/1"]));
    daemon.eventEmit("story.changed", { story: story("story_0", "agent_z", { postedAt: 0 }) });
    daemon.eventEmit("story.changed", { story: story("story_8", "agent_b", { postedAt: 8 }) });
    daemon.eventEmit("story.changed", {
        story: story("story_8", "agent_b", { state: "replaced" }),
    });
    await vi.waitFor(() =>
        expect(rings(store)).toEqual(["agent:agent_a 1/1", "agent:agent_z 1/1"]),
    );
    expect(daemon.callCount("listStories")).toBe(1);

    store.ringOpen("agent:agent_a");
    await vi.waitFor(() =>
        expect(rings(store)).toEqual(["agent:agent_z 1/1", "agent:agent_a 1/0"]),
    );
    // Greying moved the ring behind the unseen one; the walk still goes on to it.
    store.storyStep(1);
    await vi.waitFor(() => expect(daemon.callCount("markStorySeen")).toBe(2));
    store.viewerClose();
    store.ringOpen("agent:agent_a");
    await settle();

    expect(daemon.callCount("markStorySeen")).toBe(2);
    expect(daemon.callCount("listStoryReplies")).toBe(2);
    const snapshot = store.get();
    expect(snapshot.mode === "on" && snapshot.open?.story.artifactId).toBe("story_1");
});
