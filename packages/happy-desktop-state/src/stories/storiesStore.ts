import type {
    HappyAgentClient,
    Story,
    StoryMediaLayer,
    StoryMediaLayerInput,
    StoryReply,
} from "@slopus/happy-agent-client";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { happyAgentSyncRead } from "../happyAgentConnection/happyAgentSyncRead.js";
import type { HappyAgentAutoJoinSettingsStore } from "../happyAgent/happyAgentAutoJoinSettings.js";
import { happyAgentUserError } from "../happyAgent/happyAgentSupport.js";
import { happyAgentSurfacePeopleReaderCreate } from "../surfaces/surfacePeople.js";
import type { HappyAgentSurfacePerson } from "../surfaces/surfaceTypes.js";
import { UserError } from "../types.js";
import type { HappyAgentStoryMediaFrames } from "./storyMediaPreload.js";

/** One poster in the stories row: an agent by its agent id, or a reposting person. */
export type HappyAgentStoryTile = {
    /** `agent:<agentId>` or `person:<userId>`; a standalone person has an empty user id. */
    readonly key: string;
    readonly poster: "agent" | "person";
    readonly agentId: string | null;
    readonly userId: string | null;
    readonly state: "unseen" | "seen";
    /** Its live stories, and how many of them were watched: one arc each around its ring. */
    readonly total: number;
    readonly seen: number;
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
              /** Its poster's tile key, the ring it opens from. */
              readonly key: string;
              readonly media: HappyAgentStoryMedia;
              /** Above the base media in paint order, each at its own address. */
              readonly mediaLayers: readonly (StoryMediaLayer &
                  HappyAgentStoryMedia & { readonly shape: "rect" | "round" })[];
              /** Its place among its poster's live stories, oldest first. */
              readonly segment: { readonly index: number; readonly total: number };
              /** Every reply once read, else the story's last two; oldest first. */
              readonly replies: readonly StoryReply[];
          } | null;
          /** The reader's last reply, repost or delete the daemon refused. */
          readonly failure: UserError | null;
          readonly draft: { readonly mediaUrl: string; readonly kind: "image" | "video" } | null;
      };

export type HappyAgentStoriesStore = ReturnType<typeof happyAgentStoriesStoreCreate>;
export type HappyAgentStoryMedia = HappyAgentStoryMediaFrames & {
    readonly kind: "image" | "video";
    readonly url: string;
};

/** Stories whose media is fetched at once, ahead of their poster's ring or of playback. */
const PRELOAD_PARALLEL = 3;
/** How long a fetch ahead may hold back its ring: past it the story opens on a spinner instead. */
const PRELOAD_WAIT_MS = 8_000;

const OFF: HappyAgentStoriesSnapshot = { mode: "off" };
const noop = () => undefined;
const keyOf = (story: Story) =>
    story.poster === "person" ? `person:${story.userId ?? ""}` : `agent:${story.agentId}`;

type Composition = {
    readonly caption?: string;
    readonly text?: NonNullable<NonNullable<Story["layers"]>["text"]>;
    readonly mediaLayers: readonly (Omit<StoryMediaLayerInput, "uploadId"> & {
        readonly blob: Blob;
    })[];
};

/** One connection's live stories, followed only while subscribed with `stories` on. */
export function happyAgentStoriesStoreCreate(deps: {
    readonly client: Pick<
        HappyAgentClient,
        | "endpoint"
        | "getUsers"
        | "listStories"
        | "markStorySeen"
        | "storyMediaUrl"
        | "storyLayerUrl"
        | "uploadStoryMedia"
        | "listStoryReplies"
        | "replyToStory"
        | "repostStory"
        | "postStory"
        | "deleteStory"
    >;
    readonly sync: HappyAgentSync;
    readonly settings: Pick<HappyAgentAutoJoinSettingsStore, "get" | "subscribe">;
    /**
     * Settles once these can play at once through the app's shared media cache: an image decoded,
     * a video buffered to play through, each kept warm to move into place. Never rejects. A poster's
     * ring waits for its first story.
     */
    readonly preload?: (
        media: readonly HappyAgentStoryMedia[],
    ) => Promise<readonly HappyAgentStoryMediaFrames[]>;
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
    let draft: {
        readonly file: File;
        readonly mediaUrl: string;
        readonly kind: "image" | "video";
    } | null = null;
    const draftDrop = () => {
        if (draft) URL.revokeObjectURL(draft.mediaUrl);
        draft = null;
    };

    const enabled = () => {
        const setting = settings.get();
        return setting.status === "ready" && setting.autoJoinEnabled;
    };
    const walk = (key: string) =>
        stories
            .filter((story) => keyOf(story) === key)
            .sort(
                (left, right) => left.postedAt - right.postedAt || left.id.localeCompare(right.id),
            );
    const opened = () => stories.find((story) => story.id === open?.story.id);
    const frames = new Map<string, HappyAgentStoryMediaFrames>();
    const playable = (kind: "image" | "video", url: string) => ({ kind, url, ...frames.get(url) });
    /**
     * A repost is its original's media and layers under the same ids, plus its own: each piece has
     * the address of the first story carrying it, the original and then reposts by id; never a round.
     */
    const mediaOf = (story: Story) => {
        const of = story.repostOf ?? story.id;
        const rank = (each: Story) => (each.id === of ? "" : each.id);
        const group = stories
            .filter((each) => rank(each) === "" || each.repostOf === of)
            .sort((left, right) => rank(left).localeCompare(rank(right)));
        const holder = (id: string) =>
            (id === "round" ? [] : group).find((each) =>
                each.mediaLayers?.some((layer) => layer.id === id),
            ) ?? story;
        return {
            media: playable(story.media.kind, client.storyMediaUrl((group[0] ?? story).id)),
            mediaLayers: (story.mediaLayers ?? []).map((layer) => ({
                ...layer,
                ...playable(layer.kind, client.storyLayerUrl(holder(layer.id).id, layer.id)),
                shape: layer.shape ?? "rect",
            })),
        };
    };
    // Stories whose media is ready or asked for, and posters whose ring has appeared and so stays.
    const ready = new Set<string>();
    const asked = new Set<string>();
    const shown = new Set<string>();
    /** Each address fetched or being fetched ahead, once however many stories share it. */
    const fetches = new Map<string, Promise<unknown>>();
    const queue: Story[] = [];
    let loading = 0;
    const pump = () => {
        while (loading < PRELOAD_PARALLEL && queue.length > 0) {
            const next = queue.shift()!;
            const { media, mediaLayers } = mediaOf(next);
            const all = [media, ...mediaLayers];
            const fresh = all.filter(({ url }) => !fetches.has(url));
            // Only a story with an address of its own to fetch takes one of the slots.
            const slot = fresh.length > 0 ? 1 : 0;
            loading += slot;
            const batch = Promise.resolve(
                slot && deps.preload ? deps.preload(fresh).catch(() => []) : [],
            ).then((each) => fresh.forEach(({ url }, at) => frames.set(url, each[at] ?? {})));
            for (const { url } of fresh) fetches.set(url, batch);
            // A fetch ahead that fails or stalls only loses its frames: the ring still appears.
            let timer: ReturnType<typeof setTimeout> | undefined;
            const fetched = Promise.race([
                Promise.all(all.map(({ url }) => fetches.get(url))),
                new Promise<void>((resolve) => (timer = setTimeout(resolve, PRELOAD_WAIT_MS))),
            ]);
            void fetched.then(() => {
                clearTimeout(timer);
                loading -= slot;
                ready.add(next.id);
                pump();
                if (following) changed();
            });
        }
    };
    const preload = (story: Story | undefined) => {
        if (!story || asked.has(story.id)) return;
        asked.add(story.id);
        queue.push(story);
        pump();
    };
    /** A ring is unseen only while its first unseen story can play, so a tap never lands on a spinner. */
    const ring = (key: string) => {
        const opening = first(key)!;
        return !opening.seen && ready.has(opening.id) ? "unseen" : "seen";
    };
    const row = (): HappyAgentStoryTile[] => {
        const tiles = new Map<string, HappyAgentStoryTile & { latest: number }>();
        for (const story of stories) {
            const held = tiles.get(keyOf(story));
            if (shown.has(keyOf(story)))
                tiles.set(keyOf(story), {
                    key: keyOf(story),
                    poster: story.poster,
                    agentId: story.agentId,
                    userId: story.userId,
                    state: held?.state ?? ring(keyOf(story)),
                    total: (held?.total ?? 0) + 1,
                    seen: (held?.seen ?? 0) + Number(story.seen),
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
        for (const { agentId, poster } of stories)
            if (poster === "agent" && agentId && shown.has(`agent:${agentId}`))
                outlines.set(agentId, ring(`agent:${agentId}`));
        const story = opened();
        const held = story ? walk(keyOf(story)) : [];
        const view = story && {
            story,
            key: keyOf(story),
            ...mediaOf(story),
            segment: { index: held.indexOf(story), total: held.length },
            replies: replies?.id === story.id ? replies.all : story.replies,
        };
        return { mode: "on", outlines, row: row(), people, open: view ?? null, failure, draft };
    };
    /**
     * Follows from the first subscriber until disposed, like the sidebar's own lists, so switching
     * away and back reads nothing and redraws at once; it is fed by the startup data and live
     * events. Turning the setting off forgets the feed, and turning it on reads it.
     */
    const lifetime = () => {
        const setting = settings.get();
        if (setting.status === "ready" && !setting.autoJoinEnabled && fed) {
            draftDrop();
            fed = false;
            [stories, cursor, open, replies, failure] = [[], undefined, null, null, null];
        } else if (following && synced && enabled() && !fed) void feedRead(following.signal);
        if (disposed || listeners.size === 0 || following) return;
        following = new AbortController();
        synced = false;
        reader = happyAgentSurfacePeopleReaderCreate({
            client,
            signal: following.signal,
            read: (read) => {
                people = new Map([...people, ...read]);
                notify();
            },
        });
        void followLoop(following.signal).catch(noop);
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
        // A poster's ring appears once its first story can play at once, and then stays.
        for (const key of new Set(stories.map(keyOf))) {
            const opening = first(key);
            if (opening && ready.has(opening.id)) shown.add(key);
            else preload(opening);
        }
        // Forget what the feed no longer holds: frames, fetches, stories and posters.
        const live = new Set(
            stories.flatMap((story) => {
                const { media, mediaLayers } = mediaOf(story);
                return [story.id, keyOf(story), media.url, ...mediaLayers.map(({ url }) => url)];
            }),
        );
        for (const held of [frames, fetches, ready, asked, shown])
            for (const key of held.keys()) if (!live.has(key)) held.delete(key);
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
    /**
     * Whether `stories` is this reader's feed with the setting on, a read of it in flight, and
     * whether the startup data has arrived: before it, a setting that loads first reads nothing.
     */
    let fed = false;
    let synced = false;
    let reading: AbortSignal | undefined;
    const feedRead = async (signal: AbortSignal) => {
        if (reading === signal) return;
        reading = signal;
        const read = await happyAgentSyncRead(signal, () => client.listStories({ signal }), noop);
        reading = undefined;
        if (signal.aborted) return;
        [stories, cursor, fed] = [read.stories.map(merged), read.cursor, true];
        changed();
    };
    const followLoop = async (signal: AbortSignal) => {
        for await (const input of deps.sync.follow({
            signal,
            events: ["story.changed", "story.removed"],
        })) {
            if (input.kind === "bootstrap" || input.kind === "reconcile") synced = true;
            if (input.kind === "bootstrap" && input.bootstrap.storiesEnabled !== undefined) {
                // The startup data carries the feed, its cursor and the switch: nothing to read.
                const { stories: feed = [], storiesEnabled, cursor: at } = input.bootstrap;
                [stories, cursor, fed] = [feed.map(merged), at, storiesEnabled];
            } else if (input.kind === "bootstrap" || input.kind === "reconcile") {
                fed = false;
                if (enabled()) void feedRead(signal);
                continue;
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
        // Keep the next two stories fetched ahead of playback.
        const held = story ? walk(keyOf(story)) : [];
        const at = story ? held.indexOf(story) : -1;
        preload(held[at + 1] ?? (story && hop(keyOf(story), 1)));
        preload(held[at + 2]);
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
            if (held.length > 0 && (delta < 0 || held.some((story) => !story.seen)))
                return delta > 0 ? first(keys[at]!) : held.at(-1);
        }
        return undefined;
    };
    // Every file is streamed once on its own, and the story only references it.
    const upload = async (file: Blob) => (await client.uploadStoryMedia(file)).upload.id;
    const composed = async ({ caption, text, mediaLayers }: Composition) => ({
        ...(caption ? { caption } : {}),
        ...(text ? { layers: { text } } : {}),
        mediaLayers: await Promise.all(
            mediaLayers.map(async ({ blob, ...placement }) => ({
                ...placement,
                uploadId: await upload(blob),
            })),
        ),
    });
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
            return () => void listeners.delete(listener);
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
            draftDrop();
            open = null;
            notify();
        },
        storyDraftOpen(file: File) {
            if (!enabled()) return;
            failure = null;
            if (!(file.type.startsWith("image/") || file.type === "video/mp4"))
                failure = new UserError("Choose an image or an MP4 video.");
            else if (file.size > 32 * 1024 * 1024)
                failure = new UserError("A story can be at most 32 MB.");
            else {
                draftDrop();
                draft = {
                    file,
                    mediaUrl: URL.createObjectURL(file),
                    kind: file.type === "video/mp4" ? "video" : "image",
                };
                open = null;
            }
            notify();
        },
        async storyPost(composition: Composition) {
            if (!draft || !enabled()) return false;
            const held = draft;
            failure = null;
            try {
                const [media, rest] = await Promise.all([upload(held.file), composed(composition)]);
                const response = await client.postStory({ media: { uploadId: media }, ...rest });
                if (!enabled() || draft !== held) return false;
                draftDrop();
                adopt(response.story);
                changed();
                return true;
            } catch (error) {
                failure = happyAgentUserError(error);
                notify();
                return false;
            }
        },
        repliesOpen() {
            if (open) repliesRead(open.story.id);
        },
        replySend(text: string) {
            void act(async (story) => void (await client.replyToStory(story.id, text)));
        },
        /** Resolves false when it was refused, so the reader can try again. */
        storyRepost(composition: Composition) {
            return act(async (story) => {
                const response = await client.repostStory(story.id, await composed(composition));
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
            following?.abort();
            clearTimeout(expiry);
            draftDrop();
        },
    };
}
