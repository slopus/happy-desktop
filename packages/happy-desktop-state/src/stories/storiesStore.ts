import type { HappyAgentClient, Story, StoryReply } from "@slopus/happy-agent-client";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { happyAgentSyncRead } from "../happyAgentConnection/happyAgentSyncRead.js";
import type { HappyAgentAutoJoinSettingsStore } from "../happyAgent/happyAgentAutoJoinSettings.js";
import { happyAgentUserError } from "../happyAgent/happyAgentSupport.js";
import { happyAgentSurfacePeopleReaderCreate } from "../surfaces/surfacePeople.js";
import type { HappyAgentSurfacePerson } from "../surfaces/surfaceTypes.js";
import { UserError } from "../types.js";

/** One poster in the stories row: an agent by its agent id, or a reposting person. */
export type HappyAgentStoryTile = {
    /** `agent:<agentId>` or `person:<userId>`; a standalone person has an empty user id. */
    readonly key: string;
    readonly poster: "agent" | "person";
    readonly agentId: string;
    readonly userId: string | null;
    readonly state: "unseen" | "seen";
};

export type HappyAgentStoriesSnapshot =
    | { readonly mode: "off" }
    | {
          readonly mode: "on";
          /** Agent stories by the posting task's or bot's agent id: unseen if any live story is. */
          readonly outlines: ReadonlyMap<string, "unseen" | "seen">;
          /** Unseen posters first, then the most recent. */
          readonly row: readonly HappyAgentStoryTile[];
          /** Reposters and repliers by user id, as they are read. */
          readonly people: ReadonlyMap<string, HappyAgentSurfacePerson>;
          readonly open: {
              readonly story: Story;
              readonly mediaUrl: string;
              readonly roundUrl: string | null;
              /** Its place among its poster's live stories, oldest first. */
              readonly segment: { readonly index: number; readonly total: number };
              /** Every reply once read, else the story's last two; oldest first. */
              readonly replies: readonly StoryReply[];
          } | null;
          /** The reader's last reply, repost or delete the daemon refused. */
          readonly failure: UserError | null;
      };

export type HappyAgentStoriesStore = ReturnType<typeof happyAgentStoriesStoreCreate>;

const OFF: HappyAgentStoriesSnapshot = { mode: "off" };
const noop = () => undefined;
const keyOf = (story: Story) =>
    story.poster === "person" ? `person:${story.userId ?? ""}` : `agent:${story.agentId}`;

async function base64(blob: Blob): Promise<string> {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let text = "";
    for (let at = 0; at < bytes.length; at += 0x8000)
        text += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
    return btoa(text);
}

/** One connection's live stories, followed only while subscribed with `stories` on. */
export function happyAgentStoriesStoreCreate(deps: {
    readonly client: Pick<
        HappyAgentClient,
        | "endpoint"
        | "getUsers"
        | "listStories"
        | "markStorySeen"
        | "storyMediaUrl"
        | "storyRoundUrl"
        | "listStoryReplies"
        | "replyToStory"
        | "repostStory"
        | "deleteStory"
    >;
    readonly sync: HappyAgentSync;
    readonly settings: Pick<HappyAgentAutoJoinSettingsStore, "get" | "subscribe">;
}) {
    const { client, settings } = deps;
    const listeners = new Set<() => void>();
    let stories: readonly Story[] = [];
    let cursor: string | undefined;
    /** The open story as it was opened, and the row it plays through when opened from one. */
    let open: { readonly story: Story; readonly through: readonly string[] | null } | null = null;
    let replies: { readonly id: string; readonly all: readonly StoryReply[] } | null = null;
    let people: ReadonlyMap<string, HappyAgentSurfacePerson> = new Map();
    let failure: UserError | null = null;
    let following: AbortController | undefined;
    let reader: ReturnType<typeof happyAgentSurfacePeopleReaderCreate> | undefined;
    let release: (() => void) | undefined;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    let snapshot: HappyAgentStoriesSnapshot | undefined;
    let disposed = false;

    const enabled = () => {
        const setting = settings.get();
        return setting.status === "ready" && setting.autoJoinEnabled;
    };
    const walk = (key: string) => stories.filter((story) => keyOf(story) === key);
    const opened = () => stories.find((story) => story.id === open?.story.id);
    const row = (): HappyAgentStoryTile[] => {
        const tiles = new Map<string, HappyAgentStoryTile & { latest: number }>();
        for (const story of stories) {
            const held = tiles.get(keyOf(story));
            tiles.set(keyOf(story), {
                key: keyOf(story),
                poster: story.poster,
                agentId: story.agentId,
                userId: story.userId,
                state: held?.state === "unseen" || !story.seen ? "unseen" : "seen",
                latest: Math.max(held?.latest ?? 0, story.postedAt),
            });
        }
        return [...tiles.values()]
            .sort(
                (left, right) =>
                    Number(left.state === "seen") - Number(right.state === "seen") ||
                    right.latest - left.latest,
            )
            .map(({ latest: _, ...tile }) => tile);
    };
    const compute = (): HappyAgentStoriesSnapshot => {
        const outlines = new Map<string, "unseen" | "seen">();
        for (const { agentId, seen, poster } of stories)
            if (poster === "agent" && outlines.get(agentId) !== "unseen")
                outlines.set(agentId, seen ? "seen" : "unseen");
        const story = opened();
        const held = story ? walk(keyOf(story)) : [];
        const view = story && {
            story,
            mediaUrl: client.storyMediaUrl(story.id),
            roundUrl: story.round ? client.storyRoundUrl(story.id) : null,
            segment: { index: held.indexOf(story), total: held.length },
            replies: replies?.id === story.id ? replies.all : story.replies,
        };
        return { mode: "on", outlines, row: row(), people, open: view ?? null, failure };
    };
    /** Follows while someone is subscribed with the setting on; stopping forgets the feed. */
    const lifetime = () => {
        const wanted = !disposed && listeners.size > 0 && enabled();
        if (wanted && !following) {
            following = new AbortController();
            reader = happyAgentSurfacePeopleReaderCreate({
                client,
                signal: following.signal,
                read: (read) => {
                    people = new Map([...people, ...read]);
                    notify();
                },
            });
            void followLoop(following.signal).catch(noop);
        } else if (!wanted && following) {
            following.abort();
            following = undefined;
            clearTimeout(expiry);
            [stories, cursor, open, replies, failure, snapshot] = [
                [],
                undefined,
                null,
                null,
                null,
                undefined,
            ];
            people = new Map();
        }
    };
    const notify = () => {
        snapshot = undefined;
        lifetime();
        for (const listener of listeners) listener();
    };
    /** Notifies after dropping expired stories, as the daemon does, and wakes at the next expiry. */
    const changed = () => {
        clearTimeout(expiry);
        const now = Date.now();
        stories = stories.filter((story) => story.expiresAt > now);
        // The open story left: on to its poster's next one, or the row's next poster.
        if (open && !opened()) {
            const { story: gone, through } = open;
            const after = walk(keyOf(gone)).find((story) => story.postedAt >= gone.postedAt);
            show(after ?? hop(keyOf(gone), 1), through);
        }
        reader?.request(
            stories.flatMap((story) => [story.userId, ...story.replies.map((each) => each.userId)]),
        );
        const next = Math.min(...stories.map((story) => story.expiresAt));
        if (Number.isFinite(next)) expiry = setTimeout(changed, Math.min(next - now, 0x7fffffff));
        notify();
    };
    // A late read or a replayed event never takes back the reader's own look.
    const merged = (story: Story) =>
        !story.seen && stories.some((each) => each.id === story.id && each.seen)
            ? { ...story, seen: true }
            : story;
    const adopt = (story: Story) => {
        stories = stories.some((each) => each.id === story.id)
            ? stories.map((each) => (each.id === story.id ? merged(story) : each))
            : [...stories, story];
    };
    const remove = (id: string) => {
        stories = stories.filter((story) => story.id !== id);
    };
    /** Reads every reply of the open story, while the reader looks at them. */
    const repliesRead = (id: string) => {
        const signal = following?.signal;
        client.listStoryReplies(id, { signal }).then((response) => {
            if (signal?.aborted || open?.story.id !== id) return;
            replies = { id, all: response.replies };
            changed();
        }, noop);
    };
    const followLoop = async (signal: AbortSignal) => {
        for await (const input of deps.sync.follow({
            signal,
            events: ["story.changed", "story.removed"],
        })) {
            if (input.kind === "bootstrap" || input.kind === "reconcile") {
                const read = await happyAgentSyncRead(
                    signal,
                    () => client.listStories({ signal }),
                    noop,
                );
                if (signal.aborted) return;
                [stories, cursor] = [read.stories.map(merged), read.cursor];
            } else if (
                input.kind === "update" &&
                input.update.kind === "event" &&
                // Already in the feed that was read after it.
                (cursor === undefined || input.update.cursor.localeCompare(cursor) > 0)
            ) {
                const { event } = input.update;
                if (event.type === "story.changed") {
                    adopt(event.payload.story);
                    if (replies?.id === event.payload.story.id) repliesRead(replies.id);
                } else if (event.type === "story.removed") remove(event.payload.storyId);
                else continue;
                cursor = input.update.cursor;
            } else continue;
            changed();
        }
    };
    /** Shows a story and marks it seen, greying it at once. */
    const show = (story: Story | undefined, through: readonly string[] | null) => {
        open = story ? { story, through } : null;
        replies = null;
        const signal = following?.signal;
        if (story && !story.seen) {
            adopt({ ...story, seen: true });
            client.markStorySeen(story.id).then((response) => {
                if (signal?.aborted) return;
                adopt(response.story);
                notify();
            }, noop);
        }
        notify();
    };
    /** A poster's first unseen story, or its first. */
    const first = (key: string) => {
        const held = walk(key);
        return held.find((story) => !story.seen) ?? held[0];
    };
    /** The story `delta` posters along the row from `key`, past posters with none left. */
    const hop = (key: string, delta: 1 | -1) => {
        const keys = open?.through ?? [];
        for (let at = keys.indexOf(key) + delta; at >= 0 && at < keys.length; at += delta) {
            const held = walk(keys[at]!);
            if (held.length > 0) return delta > 0 ? first(keys[at]!) : held.at(-1);
        }
        return undefined;
    };
    /** Runs one of the reader's acts on the open story; false when the daemon refused it. */
    const act = (run: (story: Story) => Promise<void>): Promise<boolean> => {
        const story = opened();
        if (!story) return Promise.resolve(false);
        failure = null;
        notify();
        return run(story).then(
            () => true,
            (error: unknown) => {
                failure = happyAgentUserError(error);
                notify();
                return false;
            },
        );
    };

    return {
        get: (): HappyAgentStoriesSnapshot => (enabled() ? (snapshot ??= compute()) : OFF),
        subscribe(listener: () => void) {
            if (disposed) return noop;
            listeners.add(listener);
            release ??= settings.subscribe(notify);
            lifetime();
            return () => {
                listeners.delete(listener);
                if (listeners.size > 0) return;
                release?.();
                release = undefined;
                lifetime();
            };
        },
        /** Opens an agent's stories at its first unseen one; past either end it closes. */
        agentOpen(agentId: string) {
            if (enabled()) show(first(`agent:${agentId}`), null);
        },
        /** Opens a row tile's poster and plays on through the row. */
        tileOpen(key: string) {
            if (enabled())
                show(
                    first(key),
                    row().map((tile) => tile.key),
                );
        },
        storyStep(delta: 1 | -1) {
            const story = opened();
            if (!story || !open) return;
            // Past a poster's end the row plays on: forward to the next poster, back to the last one.
            const held = walk(keyOf(story));
            show(held[held.indexOf(story) + delta] ?? hop(keyOf(story), delta), open.through);
        },
        viewerClose() {
            open = null;
            notify();
        },
        repliesOpen() {
            if (open) repliesRead(open.story.id);
        },
        replySend(text: string) {
            void act(async (story) => void (await client.replyToStory(story.id, text)));
        },
        /** Resolves false when it was refused, so the reader can try again. */
        storyRepost(caption: string, round: Blob | null) {
            return act(async (story) => {
                // The largest round video the daemon takes.
                if (round && round.size > 16 * 1024 * 1024)
                    throw new UserError("A round video can be at most 16 MB.");
                const response = await client.repostStory(story.id, {
                    ...(caption ? { caption } : {}),
                    ...(round ? { round: { data: await base64(round) } } : {}),
                });
                adopt(response.story);
                changed();
            });
        },
        storyDelete() {
            void act(async (story) => {
                await client.deleteStory(story.id);
                remove(story.id);
                changed();
            });
        },
        [Symbol.dispose]() {
            disposed = true;
            listeners.clear();
            release?.();
            release = undefined;
            lifetime();
        },
    };
}
