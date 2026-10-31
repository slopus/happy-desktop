import type { HappyAgentClient, Story, UserMessage } from "@slopus/happy-agent-client";
import type { HappyAgentConnection } from "../happyAgentConnection/types.js";
import { happyAgentUserError } from "../happyAgent/happyAgentSupport.js";
import type { HappyAgentRichTasksStore } from "../richTasks/richTasksStore.js";
import { cuid2Create } from "../utils/cuid2Create.js";

/** One poster's ring: one segment per live story, oldest first. */
export interface HappyAgentStoryRing {
    /** `agent:<agentId>`, or `user:<userId>` for a person's reposts. */
    readonly id: string;
    readonly poster: Story["poster"];
    /** The reader's own reposts: "My story". */
    readonly self: boolean;
    readonly stories: readonly Story[];
    readonly unseen: number;
}

/** The open story's one frame: a picture or video, or why it cannot be shown. */
export type HappyAgentStoryFrame =
    | { readonly kind: "loading" }
    | {
          readonly kind: "image" | "video";
          readonly url: string;
          /** The original file's path in its artifact, which a download is named after. */
          readonly path: string;
      }
    | { readonly kind: "failed"; readonly message: string };

export type HappyAgentStoryReplies =
    | { readonly status: "loading" }
    | { readonly status: "ready"; readonly messages: readonly UserMessage[] }
    | { readonly status: "failed"; readonly message: string };

/** A reply, take-down or repost the reader started on the open story. */
export type HappyAgentStoryPhase =
    | { readonly phase: "idle" | "sending" | "sent" }
    | { readonly phase: "failed"; readonly message: string };

export interface HappyAgentStoryOpen {
    readonly story: Story;
    /** Its place among its poster's live stories. */
    readonly segment: { readonly index: number; readonly total: number };
    readonly frame: HappyAgentStoryFrame;
    /** A repost's round video, laid over the frame. */
    readonly roundUrl: string | null;
    /** Newest first, read back from the conversation they went to. */
    readonly replies: HappyAgentStoryReplies;
    readonly reply: HappyAgentStoryPhase;
    readonly action: HappyAgentStoryPhase;
    readonly takeDownOffered: boolean;
    readonly repostOffered: boolean;
    /** The reply the drawer opens on, when the story was opened from that reply's quote. */
    readonly replyFocus: string | null;
}

/** The story a message answers, as its quote draws it: live, not read yet, or no longer up. */
export type HappyAgentStoryQuote =
    | { readonly kind: "loading" | "ended" }
    | ({ readonly kind: "live" } & Pick<HappyAgentStoryOpen, "story" | "segment" | "frame">);

/** Off unless the daemon has `capabilities.storyArtifacts` and the Tasks area is rich. */
export type HappyAgentStoriesSnapshot =
    | { readonly mode: "off" }
    | {
          readonly mode: "on";
          /** "My story" first, then rings with something unseen, then the rest, newest first. */
          readonly rings: readonly HappyAgentStoryRing[];
          readonly open: HappyAgentStoryOpen | null;
      };

export interface HappyAgentStoriesStore {
    get(): HappyAgentStoriesSnapshot;
    subscribe(listener: () => void): () => void;
    /** Opens a ring at its first unseen story; the walk keeps this order until it closes. */
    ringOpen(ringId: string): void;
    /** The next or previous story of the walk; past the end it closes. */
    storyStep(delta: 1 | -1): void;
    viewerClose(): void;
    /** Sends the text to the story's reply agent, as the reader's message answering it. */
    replySend(text: string): void;
    storyTakeDown(): void;
    /** Reposts the open story to the team, with a caption and a recorded round video, if any. */
    storyRepost(caption: string | null, round: Blob | null): void;
    /** The story a message answers; its frame is read the first time it is asked for. */
    quoteOf(artifactId: string): HappyAgentStoryQuote;
    /** Opens a quoted story with its replies drawer open on the reply that quoted it. */
    quoteOpen(artifactId: string, messageId: string): void;
    /** Opens the story a link names, in whatever state it is, read first when not in the feed. */
    storyOpen(artifactId: string): void;
    [Symbol.dispose](): void;
}

export interface HappyAgentStoriesDeps {
    readonly client: HappyAgentClient;
    readonly connection: Pick<HappyAgentConnection, "sync" | "richTasks" | "sendMessageConfirmed">;
    readonly richTasks: Pick<HappyAgentRichTasksStore, "get" | "subscribe">;
    readonly now?: () => number;
}

type Phase = HappyAgentStoryPhase;
const OFF: HappyAgentStoriesSnapshot = { mode: "off" };
const IDLE: Phase = { phase: "idle" };
const STORY = { type: "story" } as const;
const noop = () => undefined;

/** A store that never draws a story, for a window with no Happy Agent. */
export const happyAgentStoriesStoreNone: HappyAgentStoriesStore = {
    get: () => OFF,
    subscribe: () => noop,
    ringOpen: noop,
    storyStep: noop,
    viewerClose: noop,
    replySend: noop,
    storyTakeDown: noop,
    storyRepost: noop,
    quoteOf: () => ({ kind: "ended" }),
    quoteOpen: noop,
    storyOpen: noop,
    [Symbol.dispose]: noop,
};

const ringIdOf = (poster: Story["poster"]): string =>
    poster.kind === "user" ? `user:${String(poster.userId)}` : `agent:${poster.agentId}`;

/**
 * The stories of one connection: the live feed, reconciled from
 * `story.changed`, and the one story open in the viewer. Opens nothing until
 * subscribed while both gates are open.
 */
export function happyAgentStoriesStoreCreate(deps: HappyAgentStoriesDeps): HappyAgentStoriesStore {
    const { client, connection } = deps;
    const mutationId = cuid2Create(deps.now ?? Date.now);
    const listeners = new Set<() => void>();
    let stories = new Map<string, Story>();
    let readCursor: string | undefined;
    /** The walk is frozen when the viewer opens, so a story going grey never reorders it. */
    let view: { walk: readonly string[]; at: number; reply: Phase; action: Phase } | undefined;
    let replyFocus: string | null = null;
    /** A linked story outside the feed, read for the viewer alone. */
    let linked: Story | undefined;
    const storyOf = (id: string | undefined) =>
        (id && stories.get(id)) || (linked?.artifactId === id ? linked : undefined);
    const frames = new Map<string, HappyAgentStoryFrame>();
    const replies = new Map<string, { count: number; replies: HappyAgentStoryReplies }>();
    const seenAsked = new Set<string>();
    let following: AbortController | undefined;
    let releaseRich: (() => void) | undefined;
    let disposed = false;
    let snapshot: HappyAgentStoriesSnapshot | undefined;

    const capable = (): boolean =>
        connection.sync.health()?.capabilities?.storyArtifacts === true &&
        deps.richTasks.get().mode === "rich";
    const viewer = (): string | null => connection.richTasks.get().viewerUserId;
    const seen = (story: Story): boolean => story.seenBy.some((entry) => entry.userId === viewer());
    const mine = (poster: Story["poster"]) => poster.kind === "user" && poster.userId === viewer();
    const openId = () => (view ? view.walk[view.at] : undefined);

    const rings = (): HappyAgentStoryRing[] => {
        const byPoster = new Map<string, Story[]>();
        for (const story of [...stories.values()].sort((a, b) => a.postedAt - b.postedAt)) {
            const id = ringIdOf(story.poster);
            byPoster.set(id, [...(byPoster.get(id) ?? []), story]);
        }
        return [...byPoster]
            .map(([id, held]) => ({
                id,
                poster: held[0]!.poster,
                self: mine(held[0]!.poster),
                stories: held,
                unseen: held.filter((story) => !seen(story)).length,
            }))
            .sort(
                (a, b) =>
                    Number(b.self) - Number(a.self) ||
                    Number(b.unseen > 0) - Number(a.unseen > 0) ||
                    b.stories.at(-1)!.postedAt - a.stories.at(-1)!.postedAt,
            );
    };

    /*
     * API.md, take-down: "The person the story belongs to may take it down — the
     * owner of the posting task, the reposter, or, for a bot's story, the person it
     * was posted for — and so may the team owner; anyone else receives 403
     * forbidden. In standalone mode the installation's one person may." The wire
     * does not say who the team owner is, so that clause cannot be offered here.
     * A bot's "owner" story is visible only to the person it was posted for.
     */
    const takeDownAllowed = ({ poster, audience }: Story): boolean => {
        const me = viewer();
        if (me === null) return true;
        if (poster.kind === "user") return poster.userId === me;
        const tasks = connection.richTasks.get().tasks;
        if (poster.taskId !== null)
            return tasks.some((task) => task.id === poster.taskId && task.ownerUserId === me);
        return poster.botId !== null && audience === "owner";
    };

    const compute = (): HappyAgentStoriesSnapshot => {
        const all = rings();
        const story = view && storyOf(view.walk[view.at]);
        const ring = story && all.find((each) => each.id === ringIdOf(story.poster));
        if (!view || !story) return { mode: "on", rings: all, open: null };
        const { artifactId, artifactVersion, round } = story;
        const open: HappyAgentStoryOpen = {
            story,
            segment: ring
                ? { index: ring.stories.indexOf(story), total: ring.stories.length }
                : { index: 0, total: 1 },
            frame: frames.get(artifactId) ?? { kind: "loading" },
            roundUrl: round
                ? client.artifactFileUrl(artifactId, artifactVersion, round.path, STORY)
                : null,
            replies: replies.get(artifactId)?.replies ?? { status: "loading" },
            reply: view.reply,
            action: view.action,
            takeDownOffered: takeDownAllowed(story),
            repostOffered: !mine(story.poster),
            replyFocus,
        };
        return { mode: "on", rings: all, open };
    };

    const get = (): HappyAgentStoriesSnapshot => (capable() ? (snapshot ??= compute()) : OFF);

    const notify = (): void => {
        if (disposed) return;
        snapshot = undefined;
        follow();
        for (const listener of listeners) listener();
    };

    /** A complete replacement: live stories stay in the feed, ended ones leave it. */
    const adopt = (story: Story): void => {
        const next = new Map(stories);
        if (story.state === "live") next.set(story.artifactId, story);
        else next.delete(story.artifactId);
        stories = next;
        const held = replies.get(story.artifactId);
        if (held && held.count !== story.replies && openId() === story.artifactId)
            repliesRead(story);
    };

    const read = async (signal: AbortSignal): Promise<void> => {
        const response = await client.listStories({ scope: "feed", signal }).catch(noop);
        if (signal.aborted) return;
        // A failed read keeps the feed as it was until the next reconcile; quotes stop waiting.
        readCursor = response?.cursor ?? readCursor ?? "";
        if (response) stories = new Map();
        for (const story of response?.stories ?? []) adopt(story);
        notify();
    };

    const followLoop = async (signal: AbortSignal): Promise<void> => {
        for await (const input of connection.sync.follow({ signal, events: ["story.changed"] })) {
            if (input.kind === "bootstrap" || input.kind === "reconcile") await read(signal);
            else if (
                input.kind === "update" &&
                input.update.kind === "event" &&
                input.update.event.type === "story.changed" &&
                // Already in the feed that was read after it.
                (readCursor === undefined || input.update.cursor.localeCompare(readCursor) > 0)
            ) {
                adopt(input.update.event.payload.story);
                notify();
            }
        }
    };

    // The feed is followed only while someone listens and both gates are open.
    const follow = (): void => {
        const wanted = listeners.size > 0 && capable();
        if (!wanted && following) {
            following.abort();
            following = undefined;
            stories = new Map();
            readCursor = undefined;
            view = undefined;
        } else if (wanted && !following) {
            following = new AbortController();
            void followLoop(following.signal).catch(noop);
        }
    };

    const repliesRead = (story: Story): void => {
        const signal = following?.signal;
        const id = story.artifactId;
        if (!signal) return;
        const set = (next: HappyAgentStoryReplies) =>
            replies.set(id, { count: story.replies, replies: next });
        const land = (next: HappyAgentStoryReplies) => !signal.aborted && set(next) && notify();
        set(replies.get(id)?.replies ?? { status: "loading" });
        client.listStoryReplies(id, {}, { signal }).then(
            ({ messages }) => land({ status: "ready", messages }),
            (error: unknown) =>
                land({ status: "failed", message: happyAgentUserError(error).message }),
        );
    };

    const frameRead = async ({ media, artifactId, artifactVersion }: Story) => {
        const own = !("artifactId" in media);
        const id = own ? artifactId : media.artifactId;
        const version = own ? artifactVersion : media.version;
        const options = own ? STORY : {};
        const manifest = (await client.getArtifactVersion(id, version, options)).version;
        const path = media.path ?? manifest.entry.path;
        const type = (manifest.files.find((file) => file.path === path) ?? manifest.entry).mimeType;
        const kind = type.split("/")[0];
        if (kind === "image" || kind === "video")
            return { kind, url: client.artifactFileUrl(id, version, path, options), path } as const;
        return { kind: "failed", message: "This story's frame cannot be shown here." } as const;
    };

    /** The story's frame, read once. */
    const frameOf = (story: Story): HappyAgentStoryFrame => {
        const id = story.artifactId;
        if (!frames.has(id)) {
            frames.set(id, { kind: "loading" });
            void frameRead(story)
                .catch((error: unknown) => ({
                    kind: "failed" as const,
                    message: happyAgentUserError(error).message,
                }))
                .then((frame) => {
                    frames.set(id, frame);
                    notify();
                });
        }
        return frames.get(id)!;
    };

    /** Shows one story of the walk: its frame and replies are read once, and it is marked seen. */
    const show = (walk: readonly string[], at: number, focus: string | null = null) => {
        const story = storyOf(walk[at]);
        if (!story) return;
        const id = story.artifactId;
        view = { walk, at, reply: IDLE, action: IDLE };
        replyFocus = focus;
        frameOf(story);
        if (!replies.has(id)) repliesRead(story);
        if (!seen(story) && !seenAsked.has(id)) {
            seenAsked.add(id);
            client.markStorySeen(id, { mutationId: mutationId() }).then(
                (response) => {
                    adopt(response.story);
                    notify();
                },
                () => seenAsked.delete(id),
            );
        }
        notify();
    };

    const step = (delta: 1 | -1): void => {
        if (!view) return;
        // A story that ended since the walk began is passed over.
        let at = view.at + delta;
        while (view.walk[at] !== undefined && !storyOf(view.walk[at])) at += delta;
        if (view.walk[at] !== undefined) return show(view.walk, at);
        view = undefined;
        notify();
    };

    type Key = "reply" | "action";
    const phaseSet = (story: Story, key: Key, phase: Phase) => {
        if (!view || openId() !== story.artifactId) return;
        view = { ...view, [key]: phase };
        notify();
    };
    const failed = (story: Story, key: Key) => (error: unknown) =>
        phaseSet(story, key, { phase: "failed", message: happyAgentUserError(error).message });
    /** Starts `key` on the open story when it is offered and not already under way. */
    const start = (key: Key, offered: (open: HappyAgentStoryOpen) => boolean): Story | null => {
        const now = get();
        const open = now.mode === "on" ? now.open : null;
        if (!open || !offered(open) || open[key].phase === "sending") return null;
        phaseSet(open.story, key, { phase: "sending" });
        return open.story;
    };

    const repost = async (story: Story, caption: string | null, round: Blob | null) => {
        // The recorder names its container; the path's extension is how the daemon types the file.
        const path = round?.type.startsWith("video/mp4") ? "round.mp4" : "round.webm";
        const upload =
            round && (await client.uploadArtifactFile({ data: await round.arrayBuffer() }));
        return client.repostStory(story.artifactId, {
            id: mutationId(),
            audience: "team",
            mutationId: mutationId(),
            ...(caption?.trim() ? { caption } : {}),
            ...(upload ? { round: { uploadId: upload.upload.id, path } } : {}),
        });
    };

    return {
        get,
        subscribe(listener) {
            if (disposed) return noop;
            listeners.add(listener);
            releaseRich ??= deps.richTasks.subscribe(notify);
            follow();
            return () => {
                listeners.delete(listener);
                if (listeners.size > 0) return;
                releaseRich?.();
                releaseRich = undefined;
                follow();
            };
        },
        ringOpen(ringId) {
            const now = get();
            if (now.mode !== "on") return;
            const walk = now.rings.flatMap((ring) => ring.stories.map((each) => each.artifactId));
            const ring = now.rings.find((each) => each.id === ringId);
            const story = ring?.stories.find((each) => !seen(each)) ?? ring?.stories[0];
            if (story) show(walk, walk.indexOf(story.artifactId));
        },
        quoteOf(artifactId) {
            const now = get();
            const story = stories.get(artifactId);
            const ring =
                story && now.mode === "on"
                    ? now.rings.find((each) => each.id === ringIdOf(story.poster))
                    : undefined;
            if (!story || !ring) return { kind: readCursor === undefined ? "loading" : "ended" };
            const segment = { index: ring.stories.indexOf(story), total: ring.stories.length };
            return { kind: "live", story, segment, frame: frameOf(story) };
        },
        quoteOpen(artifactId, messageId) {
            const now = get();
            if (now.mode !== "on") return;
            const walk = now.rings.flatMap((ring) => ring.stories.map((each) => each.artifactId));
            if (walk.includes(artifactId)) show(walk, walk.indexOf(artifactId), messageId);
        },
        storyOpen(artifactId) {
            const now = get();
            if (now.mode !== "on") return;
            const walk = now.rings.flatMap((ring) => ring.stories.map((each) => each.artifactId));
            if (walk.includes(artifactId)) return show(walk, walk.indexOf(artifactId));
            client.getStory(artifactId).then(({ story }) => {
                linked = story;
                show([artifactId], 0);
            }, noop);
        },
        storyStep: step,
        viewerClose() {
            view = undefined;
            notify();
        },
        replySend(text) {
            // One reply at a time; the connection retries it under one message ID.
            const story = text.trim() === "" ? null : start("reply", () => true);
            if (!story) return;
            const replyTo = { kind: "story", artifactId: story.artifactId } as const;
            connection
                .sendMessageConfirmed(story.replyAgentId, { text, replyTo })
                .then(() => phaseSet(story, "reply", { phase: "sent" }), failed(story, "reply"));
        },
        storyTakeDown() {
            const story = start("action", (open) => open.takeDownOffered);
            if (!story) return;
            client.takeDownStory(story.artifactId, { mutationId: mutationId() }).then(
                (response) => {
                    adopt(response.story);
                    step(1);
                },
                failed(story, "action"),
            );
        },
        storyRepost(caption, round) {
            const story = start("action", (open) => open.repostOffered);
            if (!story) return;
            repost(story, caption, round).then(
                (response) => {
                    adopt(response.story);
                    phaseSet(story, "action", { phase: "sent" });
                },
                failed(story, "action"),
            );
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            listeners.clear();
            releaseRich?.();
            releaseRich = undefined;
            following?.abort();
            following = undefined;
        },
    };
}
