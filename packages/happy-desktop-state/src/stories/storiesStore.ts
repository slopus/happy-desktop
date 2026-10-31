import type { HappyAgentClient, Story, UserMessage } from "@slopus/happy-agent-client";
import type { HappyAgentConnection } from "../happyAgentConnection/types.js";
import { happyAgentUserError } from "../happyAgent/happyAgentSupport.js";
import type { HappyAgentRichTasksStore } from "../richTasks/richTasksStore.js";
import { cuid2Create } from "../utils/cuid2Create.js";

/** One poster's ring: one segment per live story. */
export interface HappyAgentStoryRing {
    /** `user:<userId>` for a person's reposts, `agent:<agentId>` for an agent's stories. */
    readonly id: string;
    readonly poster: Story["poster"];
    /** The reader's own reposts, drawn first as "My story". */
    readonly self: boolean;
    /** Oldest first, the order the segments and the viewer walk them in. */
    readonly stories: readonly Story[];
    /** How many of them the reader has not opened. */
    readonly unseen: number;
}

/** What the open story's one frame shows, once its file is known. */
export type HappyAgentStoryFrame =
    | { readonly kind: "loading" }
    | {
          readonly kind: "image" | "video";
          readonly url: string;
          /** A repost's round video, laid over the frame. */
          readonly roundUrl: string | null;
      }
    /** A page or document of another artifact, opened in the artifact viewer. */
    | { readonly kind: "artifact"; readonly artifactId: string; readonly roundUrl: string | null }
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
    readonly ringId: string;
    readonly story: Story;
    readonly frame: HappyAgentStoryFrame;
    /** Newest first, read back from the conversation they went to. */
    readonly replies: HappyAgentStoryReplies;
    readonly reply: HappyAgentStoryPhase;
    readonly action: HappyAgentStoryPhase;
    /** The reader's own repost, or a story posted under a task they own or for them alone. */
    readonly takeDownOffered: boolean;
    /** Anyone else's story may be reposted to the team. */
    readonly repostOffered: boolean;
}

/**
 * Stories are drawn only from a daemon with `capabilities.storyArtifacts`
 * while the Tasks area is rich; otherwise nothing is asked and nothing drawn.
 */
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
    /** Opens a ring at its first unseen story, or its first. */
    ringOpen(ringId: string): void;
    /** The next or previous story, across rings; past the last it closes. */
    storyStep(delta: 1 | -1): void;
    viewerClose(): void;
    /** Sends the text to the story's reply agent, as the reader's message answering it. */
    replySend(text: string): void;
    storyTakeDown(): void;
    /** Reposts the open story to the team, with the reader's caption or the original's. */
    storyRepost(caption: string | null): void;
    [Symbol.dispose](): void;
}

export interface HappyAgentStoriesDeps {
    readonly client: Pick<
        HappyAgentClient,
        | "listStories"
        | "markStorySeen"
        | "listStoryReplies"
        | "takeDownStory"
        | "repostStory"
        | "getArtifactVersion"
        | "artifactFileUrl"
    >;
    readonly connection: Pick<HappyAgentConnection, "sync" | "richTasks" | "sendMessageConfirmed">;
    readonly richTasks: Pick<HappyAgentRichTasksStore, "get" | "subscribe">;
    readonly now?: () => number;
}

const OFF: HappyAgentStoriesSnapshot = { mode: "off" };
const IDLE: HappyAgentStoryPhase = { phase: "idle" };

/** A store that never draws a story, for a window with no Happy Agent. */
export const happyAgentStoriesStoreNone: HappyAgentStoriesStore = {
    get: () => OFF,
    subscribe: () => () => undefined,
    ringOpen: () => undefined,
    storyStep: () => undefined,
    viewerClose: () => undefined,
    replySend: () => undefined,
    storyTakeDown: () => undefined,
    storyRepost: () => undefined,
    [Symbol.dispose]: () => undefined,
};

const ringIdOf = (poster: Story["poster"]): string =>
    poster.kind === "user" ? `user:${String(poster.userId)}` : `agent:${poster.agentId}`;

const failedOf = (error: unknown): HappyAgentStoryPhase => ({
    phase: "failed",
    message: happyAgentUserError(error).message,
});

/**
 * The stories of one connection: the live feed, reconciled from
 * `story.changed`, and the one story open in the viewer with its frame,
 * replies, and what the reader did to it. Opens nothing until subscribed
 * while both gates are open.
 */
export function happyAgentStoriesStoreCreate(deps: HappyAgentStoriesDeps): HappyAgentStoriesStore {
    const mutationId = cuid2Create(deps.now ?? Date.now);
    const listeners = new Set<() => void>();
    let stories = new Map<string, Story>();
    let readCursor: string | undefined;
    let open:
        | {
              readonly ringId: string;
              readonly artifactId: string;
              readonly reply: HappyAgentStoryPhase;
              readonly action: HappyAgentStoryPhase;
          }
        | undefined;
    const frames = new Map<string, HappyAgentStoryFrame>();
    const replies = new Map<string, { count: number; replies: HappyAgentStoryReplies }>();
    const seenAsked = new Set<string>();
    let following: AbortController | undefined;
    let releaseRich: (() => void) | undefined;
    let disposed = false;
    let snapshot: HappyAgentStoriesSnapshot = OFF;
    let stale = true;

    const capable = (): boolean =>
        deps.connection.sync.health()?.capabilities?.storyArtifacts === true &&
        deps.richTasks.get().mode === "rich";
    const viewer = (): string | null => deps.connection.richTasks.get().viewerUserId;
    const seen = (story: Story): boolean => story.seenBy.some((entry) => entry.userId === viewer());

    const rings = (): HappyAgentStoryRing[] => {
        const byPoster = new Map<string, Story[]>();
        for (const story of [...stories.values()].sort((a, b) => a.postedAt - b.postedAt)) {
            const id = ringIdOf(story.poster);
            byPoster.set(id, [...(byPoster.get(id) ?? []), story]);
        }
        const me = viewer();
        return [...byPoster]
            .map(([id, held]): HappyAgentStoryRing => {
                const poster = held[0]!.poster;
                return {
                    id,
                    poster,
                    self: poster.kind === "user" && poster.userId === me,
                    stories: held,
                    unseen: held.filter((story) => !seen(story)).length,
                };
            })
            .sort(
                (a, b) =>
                    Number(b.self) - Number(a.self) ||
                    Number(b.unseen > 0) - Number(a.unseen > 0) ||
                    b.stories.at(-1)!.postedAt - a.stories.at(-1)!.postedAt,
            );
    };

    const ownerOf = (story: Story): boolean => {
        const me = viewer();
        if (story.poster.kind === "user") return story.poster.userId === me;
        const { taskId } = story.poster;
        return (
            story.audience === "owner" ||
            deps.connection.richTasks
                .get()
                .tasks.some((task) => task.id === taskId && task.ownerUserId === me)
        );
    };

    const compute = (): HappyAgentStoriesSnapshot => {
        const all = rings();
        const story = open ? stories.get(open.artifactId) : undefined;
        if (open && !story) open = undefined;
        return {
            mode: "on",
            rings: all,
            open:
                open && story
                    ? {
                          ringId: open.ringId,
                          story,
                          frame: frames.get(story.artifactId) ?? { kind: "loading" },
                          replies: replies.get(story.artifactId)?.replies ?? {
                              status: "loading",
                          },
                          reply: open.reply,
                          action: open.action,
                          takeDownOffered: ownerOf(story),
                          repostOffered: !(
                              story.poster.kind === "user" && story.poster.userId === viewer()
                          ),
                      }
                    : null,
        };
    };

    const get = (): HappyAgentStoriesSnapshot => {
        if (!capable()) return OFF;
        if (stale) {
            snapshot = compute();
            stale = false;
        }
        return snapshot;
    };

    const notify = (): void => {
        if (disposed) return;
        stale = true;
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
        if (held && held.count !== story.replies && open?.artifactId === story.artifactId)
            repliesRead(story);
    };

    const read = async (signal: AbortSignal): Promise<void> => {
        try {
            const response = await deps.client.listStories({ scope: "feed", signal });
            if (signal.aborted) return;
            readCursor = response.cursor;
            stories = new Map(
                response.stories
                    .filter((story) => story.state === "live")
                    .map((story) => [story.artifactId, story]),
            );
            notify();
        } catch {
            // The feed stays as it was until the next reconcile reads it again.
        }
    };

    const followLoop = async (signal: AbortSignal): Promise<void> => {
        for await (const input of deps.connection.sync.follow({
            signal,
            events: ["story.changed"],
        })) {
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
            open = undefined;
        } else if (wanted && !following) {
            following = new AbortController();
            void followLoop(following.signal).catch(() => undefined);
        }
    };

    const repliesRead = (story: Story): void => {
        const signal = following?.signal;
        if (!signal) return;
        const id = story.artifactId;
        const held = replies.get(id);
        replies.set(id, {
            count: story.replies,
            replies: held?.replies.status === "ready" ? held.replies : { status: "loading" },
        });
        void deps.client.listStoryReplies(id, {}, { signal }).then(
            ({ messages }) => {
                replies.set(id, { count: story.replies, replies: { status: "ready", messages } });
                notify();
            },
            (error: unknown) => {
                if (signal.aborted) return;
                const message = happyAgentUserError(error).message;
                replies.set(id, { count: story.replies, replies: { status: "failed", message } });
                notify();
            },
        );
    };

    const frameRead = async (story: Story): Promise<HappyAgentStoryFrame> => {
        const media = story.media;
        const own = !("artifactId" in media);
        const id = own ? story.artifactId : media.artifactId;
        const version = own ? story.artifactVersion : media.version;
        const options = own ? { type: "story" as const } : {};
        const manifest = (await deps.client.getArtifactVersion(id, version, options)).version;
        const path = media.path ?? manifest.entry.path;
        const mimeType = (manifest.files.find((file) => file.path === path) ?? manifest.entry)
            .mimeType;
        const roundUrl = story.round
            ? deps.client.artifactFileUrl(
                  story.artifactId,
                  story.artifactVersion,
                  story.round.path,
                  {
                      type: "story",
                  },
              )
            : null;
        const kind = mimeType.startsWith("image/")
            ? "image"
            : mimeType.startsWith("video/")
              ? "video"
              : undefined;
        if (kind)
            return { kind, url: deps.client.artifactFileUrl(id, version, path, options), roundUrl };
        return own
            ? { kind: "failed", message: "This story's frame cannot be shown here." }
            : { kind: "artifact", artifactId: id, roundUrl };
    };

    /** Shows one story: its frame and replies are read once, and it is marked seen. */
    const show = (ringId: string, story: Story): void => {
        open = { ringId, artifactId: story.artifactId, reply: IDLE, action: IDLE };
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
        if (!replies.has(id)) repliesRead(story);
        if (!seen(story) && !seenAsked.has(id)) {
            seenAsked.add(id);
            void deps.client.markStorySeen(id, { mutationId: mutationId() }).then(
                (response) => {
                    adopt(response.story);
                    notify();
                },
                () => seenAsked.delete(id),
            );
        }
        notify();
    };

    const current = (): HappyAgentStoryOpen | null => {
        const now = get();
        return now.mode === "on" ? now.open : null;
    };

    const phaseSet = (artifactId: string, key: "reply" | "action", phase: HappyAgentStoryPhase) => {
        if (open?.artifactId !== artifactId) return;
        open = { ...open, [key]: phase };
        notify();
    };

    return {
        get,
        subscribe(listener) {
            if (disposed) return () => undefined;
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
            const ring =
                now.mode === "on" ? now.rings.find((each) => each.id === ringId) : undefined;
            const story = ring?.stories.find((each) => !seen(each)) ?? ring?.stories[0];
            if (ring && story) show(ring.id, story);
        },
        storyStep(delta) {
            const now = get();
            if (now.mode !== "on" || !now.open) return;
            const walk = now.rings.flatMap((ring) =>
                ring.stories.map((story) => ({ ring: ring.id, story })),
            );
            const at = walk.findIndex(
                (each) => each.story.artifactId === now.open?.story.artifactId,
            );
            const next = walk[at + delta];
            if (next) show(next.ring, next.story);
            else {
                open = undefined;
                notify();
            }
        },
        viewerClose() {
            open = undefined;
            notify();
        },
        replySend(text) {
            const story = current()?.story;
            if (!story || text.trim() === "") return;
            phaseSet(story.artifactId, "reply", { phase: "sending" });
            deps.connection
                .sendMessageConfirmed(story.replyAgentId, {
                    text,
                    replyTo: { kind: "story", artifactId: story.artifactId },
                })
                .then(
                    () => phaseSet(story.artifactId, "reply", { phase: "sent" }),
                    (error: unknown) => phaseSet(story.artifactId, "reply", failedOf(error)),
                );
        },
        storyTakeDown() {
            const shown = current();
            if (!shown?.takeDownOffered) return;
            const id = shown.story.artifactId;
            phaseSet(id, "action", { phase: "sending" });
            deps.client.takeDownStory(id, { mutationId: mutationId() }).then(
                (response) => {
                    adopt(response.story);
                    notify();
                },
                (error: unknown) => phaseSet(id, "action", failedOf(error)),
            );
        },
        storyRepost(caption) {
            const shown = current();
            if (!shown?.repostOffered) return;
            const id = shown.story.artifactId;
            phaseSet(id, "action", { phase: "sending" });
            deps.client
                .repostStory(id, {
                    id: mutationId(),
                    audience: "team",
                    mutationId: mutationId(),
                    ...(caption === null || caption.trim() === "" ? {} : { caption }),
                })
                .then(
                    (response) => {
                        adopt(response.story);
                        phaseSet(id, "action", { phase: "sent" });
                    },
                    (error: unknown) => phaseSet(id, "action", failedOf(error)),
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
