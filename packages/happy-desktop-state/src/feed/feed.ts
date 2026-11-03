import type {
    FeedActor,
    FeedCluster,
    FeedEntry,
    FeedItem,
    FeedSubject,
    HappyAgentClient,
} from "@slopus/happy-agent-client";
import type { HappyAgentArtifactTitlesStore } from "../artifacts/artifactTitlesStore.js";
import type { HappyAgentArtifactId } from "../artifacts/artifactTypes.js";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { happyAgentSyncRead } from "../happyAgentConnection/happyAgentSyncRead.js";
import { happyAgentUserError } from "../happyAgent/happyAgentSupport.js";
import type { UserError } from "../types.js";
import {
    feedTodoKey,
    happyAgentFeedReferencesCreate,
    type HappyAgentFeedReferencesStore,
    type HappyAgentFeedTodoReference,
} from "./feedReferences.js";

export type { FeedActor, FeedSubject } from "@slopus/happy-agent-client";
export * from "./feedReferences.js";

/**
 * One subject's folded changes, as references only. Nothing about the
 * subject itself is held: its name, face, and type are read from the stores
 * that sync it, so a rename shows at once. An older daemon still sends a copy
 * of the subject frozen at the change; it is never kept.
 */
export interface HappyAgentFeedPeekEntry {
    /** The newest change folded in; entries sort newest `cursor` first. */
    readonly cursor: string;
    readonly subject: FeedSubject;
    /** The home cluster of the newest change folded in. */
    readonly cluster: string;
    /** Whether the subject's creation is among the folded changes. */
    readonly created: boolean;
    /** Further changes: new todos, document edit sessions, or artifact versions. */
    readonly updates: number;
    /** The first five distinct actors, in the order they first acted. */
    readonly actors: readonly FeedActor[];
    /** How many distinct actors are folded in. */
    readonly actorCount: number;
    /** The todo the newest change added, for a todo list's entry. */
    readonly todo?: HappyAgentFeedTodoReference;
    readonly firstAt: number;
    readonly lastAt: number;
}

/** One entry in the reader's feed. */
export interface HappyAgentFeedItem extends HappyAgentFeedPeekEntry {
    /** Minted when the entry opened; stable as the entry moves up. Key rows by it. */
    readonly id: string;
    /** Minted at every change to the entry; of two copies, the greater is current. */
    readonly version: string;
    /** When the reader saw it; `null` while open. */
    readonly seenAt: number | null;
}

/** One place the feed gathers from, by reference: `*`, `team`, or `<kind>:<id>`. */
export interface HappyAgentFeedPlace {
    readonly cluster: string;
    /** `everything` is `*`; an unknown kind is an opaque name. */
    readonly kind: string;
    /** The reader's own choice; `null` follows `*`. */
    readonly state: FeedCluster["state"];
    readonly lastAt: number | null;
}

/**
 * The todo an entry's newest change added, from the daemon's reference to it.
 * A daemon from before entries named their newest change sends none.
 */
function feedTodoOf(entry: FeedEntry): HappyAgentFeedTodoReference | undefined {
    const latest = entry.latest;
    if (entry.subject.type !== "surface" || latest?.type !== "todo.created") return undefined;
    return latest.todoId === undefined
        ? undefined
        : { surfaceId: entry.subject.id, todoId: latest.todoId };
}

function feedPeekEntryOf(entry: FeedEntry): HappyAgentFeedPeekEntry {
    const todo = feedTodoOf(entry);
    return {
        cursor: entry.cursor,
        subject: { type: entry.subject.type, id: entry.subject.id },
        cluster: entry.cluster,
        created: entry.created,
        updates: entry.updates,
        actors: entry.actors.map((actor) => ({ userId: actor.userId, agentId: actor.agentId })),
        actorCount: entry.actorCount,
        ...(todo === undefined ? {} : { todo }),
        firstAt: entry.firstAt,
        lastAt: entry.lastAt,
    };
}

function feedItemOf(item: FeedItem): HappyAgentFeedItem {
    return { ...feedPeekEntryOf(item), id: item.id, version: item.version, seenAt: item.seenAt };
}

function feedPlaceOf(cluster: FeedCluster): HappyAgentFeedPlace {
    return {
        cluster: cluster.cluster,
        kind: cluster.kind,
        state: cluster.state,
        lastAt: cluster.lastAt,
    };
}

/**
 * Whether this Happy Agent keeps a feed: not known until it has said what it
 * can do, and `unsupported` for one too old to keep one.
 */
export type HappyAgentFeedAvailability = "unknown" | "available" | "unsupported";

/** The reader's count of entries they have not looked at, for the sidebar's Feed row. */
export interface HappyAgentFeedUnreadSnapshot {
    readonly availability: HappyAgentFeedAvailability;
    readonly unread: number;
}

/** Which of the Feed page's two lists is on screen. */
export type HappyAgentFeedView = "activity" | "following";

/** The reader's feed as the Feed page shows it. */
export interface HappyAgentFeedPageSnapshot {
    readonly availability: HappyAgentFeedAvailability;
    readonly view: HappyAgentFeedView;
    /**
     * Newest `cursor` first; an entry that takes in a change keeps its object
     * identity only while unchanged. An entry is here only once everything it
     * names that is read by id — the people and agents who acted, a bot, an
     * artifact, a todo — has been read, so a row never shows a stand-in name.
     */
    readonly items: readonly HappyAgentFeedItem[];
    /** The first read, and what its entries name, have not answered yet. */
    readonly loading: boolean;
    /** Older entries exist beyond the last one held. */
    readonly hasMore: boolean;
    readonly loadingMore: boolean;
    /** The last read or act that failed, until the next one succeeds. */
    readonly error: UserError | null;
    /**
     * Entries the reader opened or marked read whose closing the daemon has
     * not confirmed yet. They read as seen; the confirmed copy replaces them.
     */
    readonly seenPending: ReadonlySet<string>;
}

/** One cluster looked into without following it. */
export interface HappyAgentFeedPeek {
    readonly cluster: string;
    /** Only entries whose references have been read, as for the page. */
    readonly entries: readonly HappyAgentFeedPeekEntry[];
    readonly loading: boolean;
    readonly error: UserError | null;
}

/** The places the reader's feed gathers from, and one of them peeked into. */
export interface HappyAgentFeedClustersSnapshot {
    readonly availability: HappyAgentFeedAvailability;
    readonly clusters: readonly HappyAgentFeedPlace[];
    readonly loading: boolean;
    readonly error: UserError | null;
    /** Clusters whose follow or mute is on its way. */
    readonly pending: ReadonlySet<string>;
    readonly peek: HappyAgentFeedPeek | null;
}

export interface HappyAgentFeedUnreadStore {
    get(): HappyAgentFeedUnreadSnapshot;
    subscribe(listener: () => void): () => void;
}

export interface HappyAgentFeedPageStore {
    get(): HappyAgentFeedPageSnapshot;
    subscribe(listener: () => void): () => void;
    viewUpdate(view: HappyAgentFeedView): void;
    /** Reads the next page of older entries. */
    pageNextLoad(): void;
    /**
     * The reader opened an entry: its subject is marked seen through the
     * change the entry was showing, so a newer one keeps it open.
     */
    entryOpen(itemId: string): void;
    /** Marks every entry seen, up to the newest one on screen. */
    readAll(): void;
}

export interface HappyAgentFeedClustersStore {
    get(): HappyAgentFeedClustersSnapshot;
    subscribe(listener: () => void): () => void;
    /** Follows a cluster, or mutes it. */
    clusterFollowUpdate(cluster: string, following: boolean): void;
    /** Looks into one cluster without following it. */
    peekOpen(cluster: string): void;
    peekClose(): void;
}

/**
 * One Happy Agent's feed for its reader. Each store is materialized on first
 * access and opens nothing until something subscribes to it.
 */
export interface HappyAgentFeed {
    /** The unread count, followed from the startup data and live events. */
    unread(): HappyAgentFeedUnreadStore;
    /** The entries, followed live while anything has subscribed. */
    page(): HappyAgentFeedPageStore;
    /** The clusters, read while subscribed. */
    clusters(): HappyAgentFeedClustersStore;
    /**
     * The people, agents, bots, and todos entries name, read as entries
     * arrive and kept current while subscribed.
     */
    references(): HappyAgentFeedReferencesStore;
    /**
     * The reader opened a subject somewhere else in the window: an artifact,
     * a Surface. Its open entry closes. Nothing is asked of a Happy Agent that
     * keeps no feed.
     */
    subjectSeen(subject: FeedSubject): void;
    [Symbol.dispose](): void;
}

export interface HappyAgentFeedDeps {
    readonly client: Pick<
        HappyAgentClient,
        | "getFeed"
        | "markFeedSeen"
        | "markFeedReadAll"
        | "listFeedClusters"
        | "subscribeFeedCluster"
        | "muteFeedCluster"
        | "peekFeedCluster"
        | "getUsers"
        | "getAgent"
        | "listBots"
        | "getBot"
        | "getTodo"
        | "endpoint"
    >;
    readonly sync: HappyAgentSync;
    /** The live titles of artifacts by id, which artifact entries are named by. */
    readonly artifactTitles: () => HappyAgentArtifactTitlesStore;
}

/** How many entries one read takes. */
const PAGE = 50;
/** How long the clusters wait after the last change before being read again. */
const CLUSTERS_SETTLE_MS = 1_500;
const PEEK_LIMIT = 200;
const SEEN_PENDING_NONE: ReadonlySet<string> = new Set();
const noop = () => undefined;
const mutationIdCreate = (): string => globalThis.crypto.randomUUID();

/** Newest change first. Cursors are UUIDv7, which sort as text. */
const byCursor = (left: { cursor: string }, right: { cursor: string }): number =>
    left.cursor < right.cursor ? 1 : left.cursor > right.cursor ? -1 : 0;

/** The same entries in the same order, so the list published before still stands. */
const sameEntries = <Entry>(left: readonly Entry[], right: readonly Entry[]): boolean =>
    left.length === right.length && left.every((entry, index) => entry === right[index]);

export function happyAgentFeedCreate(deps: HappyAgentFeedDeps): HappyAgentFeed {
    const { client, sync } = deps;
    let disposed = false;
    const references = happyAgentFeedReferencesCreate({ client, sync });
    /** Asks for everything entries name that is read by id. */
    const referencesRequest = (entries: readonly HappyAgentFeedPeekEntry[]): void => {
        const userIds: string[] = [];
        const agentIds: string[] = [];
        const todos: HappyAgentFeedTodoReference[] = [];
        const artifactIds: HappyAgentArtifactId[] = [];
        for (const entry of entries) {
            for (const actor of entry.actors) {
                if (actor.agentId !== null) agentIds.push(actor.agentId);
                else if (actor.userId !== null) userIds.push(actor.userId);
            }
            if (entry.subject.type === "artifact")
                artifactIds.push(entry.subject.id as HappyAgentArtifactId);
            if (entry.todo !== undefined) todos.push(entry.todo);
        }
        references.request({ userIds, agentIds, todos });
        if (artifactIds.length > 0) deps.artifactTitles().request(artifactIds);
    };
    /** Whether everything an entry names that is read by id has been read. */
    const entrySettled = (entry: HappyAgentFeedPeekEntry): boolean => {
        const held = references.get();
        for (const actor of entry.actors) {
            if (actor.agentId !== null) {
                if (!held.agents.has(actor.agentId)) return false;
            } else if (actor.userId !== null && !held.people.has(actor.userId)) return false;
        }
        if (entry.subject.type === "bot" && held.bots === null) return false;
        if (
            entry.subject.type === "artifact" &&
            !deps
                .artifactTitles()
                .get()
                .has(entry.subject.id as HappyAgentArtifactId)
        )
            return false;
        if (entry.todo !== undefined && !held.todos.has(feedTodoKey(entry.todo))) return false;
        return true;
    };
    /**
     * Follows the stores entries are read from while `signal` lives, calling
     * `changed` whenever something they hold may have settled.
     */
    const referencesFollow = (signal: AbortSignal, changed: () => void): void => {
        const releases = [references.subscribe(changed), deps.artifactTitles().subscribe(changed)];
        signal.addEventListener("abort", () => releases.forEach((release) => release()), {
            once: true,
        });
    };
    const availability = (): HappyAgentFeedAvailability => {
        const health = sync.health();
        if (health === undefined) return "unknown";
        return health.capabilities?.feed === true ? "available" : "unsupported";
    };

    let unreadStore: ReturnType<typeof unreadCreate> | undefined;
    let pageStore: ReturnType<typeof pageCreate> | undefined;
    let clustersStore: ReturnType<typeof clustersCreate> | undefined;

    /* ---- Unread ------------------------------------------------------- */

    function unreadCreate() {
        const listeners = new Set<() => void>();
        let snapshot: HappyAgentFeedUnreadSnapshot = { availability: "unknown", unread: 0 };
        let following: AbortController | undefined;
        let cursor: string | undefined;
        const publish = (next: Partial<HappyAgentFeedUnreadSnapshot>): void => {
            const merged = { ...snapshot, ...next };
            if (merged.availability === snapshot.availability && merged.unread === snapshot.unread)
                return;
            snapshot = merged;
            for (const listener of listeners) listener();
        };
        const read = async (signal: AbortSignal): Promise<void> => {
            const response = await happyAgentSyncRead(
                signal,
                () => client.getFeed({ limit: 1 }, { signal }),
                noop,
            );
            if (signal.aborted) return;
            cursor = response.cursor;
            publish({ unread: response.unread });
        };
        const followLoop = async (signal: AbortSignal): Promise<void> => {
            for await (const input of sync.follow({ signal, events: ["feed.unread.updated"] })) {
                if (input.kind === "bootstrap" || input.kind === "reconcile") {
                    const available = availability();
                    publish({ availability: available });
                    if (available !== "available") continue;
                    if (input.kind === "bootstrap" && input.bootstrap.feedUnread !== undefined) {
                        cursor = input.bootstrap.cursor;
                        publish({ unread: input.bootstrap.feedUnread });
                    } else void read(signal).catch(noop);
                } else if (
                    input.kind === "update" &&
                    input.update.kind === "event" &&
                    input.update.event.type === "feed.unread.updated" &&
                    (cursor === undefined || input.update.cursor.localeCompare(cursor) > 0)
                ) {
                    cursor = input.update.cursor;
                    publish({ unread: input.update.event.payload.unread });
                }
            }
        };
        return {
            store: {
                get: () => snapshot,
                subscribe(listener: () => void) {
                    if (disposed) return noop;
                    listeners.add(listener);
                    if (!following) {
                        following = new AbortController();
                        void followLoop(following.signal).catch(noop);
                    }
                    return () => void listeners.delete(listener);
                },
            } satisfies HappyAgentFeedUnreadStore,
            /** A count the daemon answered a mutation with. */
            unreadReceived(unread: number): void {
                publish({ unread });
            },
            [Symbol.dispose](): void {
                following?.abort();
                listeners.clear();
            },
        };
    }

    /* ---- Page --------------------------------------------------------- */

    function pageCreate() {
        const listeners = new Set<() => void>();
        let snapshot: HappyAgentFeedPageSnapshot = {
            availability: "unknown",
            view: "activity",
            items: [],
            loading: true,
            hasMore: false,
            loadingMore: false,
            error: null,
            seenPending: SEEN_PENDING_NONE,
        };
        /**
         * Every entry read, newest first, whether or not what it names has
         * been read yet; `items` is the settled part of it.
         */
        let held: readonly HappyAgentFeedItem[] = [];
        /** The first read has answered, but what its entries name has not been read yet. */
        let firstSettling = true;
        let firstAnswered = false;
        /** The version each pending entry had when it was opened or read. */
        const pending = new Map<string, string>();
        let following: AbortController | undefined;
        let cursor: string | undefined;
        const publish = (next: Partial<HappyAgentFeedPageSnapshot>): void => {
            const settled = held.filter(entrySettled);
            // The first page shows at once, with every name it needs.
            if (firstSettling && firstAnswered && settled.length === held.length)
                firstSettling = false;
            const items = sameEntries(settled, snapshot.items) ? snapshot.items : settled;
            const loading = !firstAnswered || firstSettling;
            snapshot = { ...snapshot, ...next, items, loading };
            for (const listener of listeners) listener();
        };
        /** Something an entry names was read: the entries it held back may show now. */
        const referencesChanged = (): void => {
            const settled = held.filter(entrySettled);
            if (sameEntries(settled, snapshot.items) && !firstSettling) return;
            publish({});
        };
        /** The pending set as it now stands, to publish beside whatever changed it. */
        const seenPendingNow = (): Pick<HappyAgentFeedPageSnapshot, "seenPending"> => ({
            seenPending: pending.size === 0 ? SEEN_PENDING_NONE : new Set(pending.keys()),
        });
        const pendingPublish = (): void => publish(seenPendingNow());
        /** Sets what is held, asking for everything new entries name. */
        const heldSet = (next: readonly HappyAgentFeedItem[]): void => {
            if (next === held) return;
            const known = new Set(held);
            held = next;
            referencesRequest(next.filter((item) => !known.has(item)));
        };
        /**
         * Takes in copies of entries: the greater `version` of each wins, and
         * an entry older than the last one held is left for paging to bring,
         * so the list never has a gap. Unchanged entries keep their objects.
         */
        const upsert = (
            current: readonly HappyAgentFeedItem[],
            incoming: readonly HappyAgentFeedItem[],
            hasMore: boolean,
        ): readonly HappyAgentFeedItem[] => {
            if (incoming.length === 0) return current;
            const byId = new Map(current.map((item) => [item.id, item]));
            const tail = current.at(-1)?.cursor;
            let changed = false;
            for (const item of incoming) {
                const known = byId.get(item.id);
                if (known !== undefined && known.version >= item.version) continue;
                if (known === undefined && hasMore && tail !== undefined && item.cursor < tail)
                    continue;
                byId.set(item.id, item);
                changed = true;
                const opened = pending.get(item.id);
                if (opened !== undefined && item.version > opened) pending.delete(item.id);
            }
            return changed ? [...byId.values()].sort(byCursor) : current;
        };
        const remove = (itemId: string): void => {
            if (!held.some((item) => item.id === itemId)) return;
            pending.delete(itemId);
            heldSet(held.filter((item) => item.id !== itemId));
            publish(seenPendingNow());
        };
        /**
         * Reads the newest page and lays it over what is held: entries newer
         * than its last one are exactly the page, and older ones already read
         * stay, so a reader scrolled down keeps their place.
         */
        const firstRead = async (signal: AbortSignal): Promise<void> => {
            const response = await happyAgentSyncRead(
                signal,
                () => client.getFeed({ limit: PAGE }, { signal }),
                (error) => publish({ error: happyAgentUserError(error) }),
            );
            if (signal.aborted) return;
            cursor = response.cursor;
            const items = response.items.map(feedItemOf);
            const floor = items.at(-1)?.cursor;
            const ids = new Set(items.map((item) => item.id));
            const older =
                floor === undefined || !response.hasMore
                    ? []
                    : held.filter((item) => item.cursor < floor && !ids.has(item.id));
            heldSet(
                upsert(
                    held.filter((item) => ids.has(item.id) || older.includes(item)),
                    items,
                    false,
                ),
            );
            firstAnswered = true;
            publish({
                hasMore: older.length > 0 ? snapshot.hasMore : response.hasMore,
                error: null,
                ...seenPendingNow(),
            });
            unreadStore?.unreadReceived(response.unread);
        };
        const followLoop = async (signal: AbortSignal): Promise<void> => {
            for await (const input of sync.follow({
                signal,
                events: ["feed.item.created", "feed.item.updated", "feed.item.removed"],
            })) {
                if (input.kind === "bootstrap" || input.kind === "reconcile") {
                    const available = availability();
                    if (available === "available") void firstRead(signal).catch(noop);
                    else firstAnswered = available === "unsupported";
                    publish({ availability: available });
                    continue;
                }
                if (
                    input.kind !== "update" ||
                    input.update.kind !== "event" ||
                    (cursor !== undefined && input.update.cursor.localeCompare(cursor) <= 0)
                )
                    continue;
                const { event } = input.update;
                if (event.type === "feed.item.created" || event.type === "feed.item.updated") {
                    const next = upsert(held, [feedItemOf(event.payload.item)], snapshot.hasMore);
                    if (next !== held) {
                        heldSet(next);
                        publish(seenPendingNow());
                    }
                } else if (event.type === "feed.item.removed") remove(event.payload.itemId);
                cursor = input.update.cursor;
            }
        };
        /**
         * The daemon answered a read-all: by its contract every entry that was
         * open at or before `through` is now closed, whether or not its own
         * event has arrived yet. The held copies say so; a later change to one
         * arrives with a greater version and replaces it.
         */
        const readAllConfirmed = (through: string, at: number): void => {
            let changed = false;
            const next = held.map((item) => {
                if (item.cursor > through) return item;
                pending.delete(item.id);
                if (item.seenAt !== null) return item;
                changed = true;
                return { ...item, seenAt: at };
            });
            if (changed) heldSet(next);
            publish(seenPendingNow());
        };
        const seenFailed = (ids: readonly string[], error: unknown): void => {
            for (const id of ids) pending.delete(id);
            publish({ error: happyAgentUserError(error), ...seenPendingNow() });
        };
        return {
            store: {
                get: () => snapshot,
                subscribe(listener: () => void) {
                    if (disposed) return noop;
                    listeners.add(listener);
                    if (!following) {
                        following = new AbortController();
                        referencesFollow(following.signal, referencesChanged);
                        void followLoop(following.signal).catch(noop);
                    }
                    return () => void listeners.delete(listener);
                },
                viewUpdate(view: HappyAgentFeedView) {
                    if (view !== snapshot.view) publish({ view });
                },
                pageNextLoad() {
                    const last = held.at(-1);
                    const signal = following?.signal;
                    if (!signal || !last || !snapshot.hasMore || snapshot.loadingMore) return;
                    publish({ loadingMore: true });
                    client.getFeed({ before: last.cursor, limit: PAGE }, { signal }).then(
                        (response) => {
                            if (signal.aborted) return;
                            const items = response.items.map(feedItemOf);
                            const merged = [...held];
                            const ids = new Set(merged.map((item) => item.id));
                            for (const item of items) if (!ids.has(item.id)) merged.push(item);
                            heldSet(upsert(merged.sort(byCursor), items, false));
                            publish({
                                hasMore: response.hasMore,
                                loadingMore: false,
                                error: null,
                            });
                        },
                        (error: unknown) => {
                            if (signal.aborted) return;
                            publish({ loadingMore: false, error: happyAgentUserError(error) });
                        },
                    );
                },
                entryOpen(itemId: string) {
                    const item = held.find((entry) => entry.id === itemId);
                    if (!item || item.seenAt !== null || pending.has(itemId)) return;
                    pending.set(itemId, item.version);
                    pendingPublish();
                    client
                        .markFeedSeen({
                            subjects: [{ ...item.subject, through: item.cursor }],
                            mutationId: mutationIdCreate(),
                        })
                        .then(
                            (response) => {
                                // A newer change kept the entry open: nothing closed, so
                                // it reads unread again.
                                if (!response.items.some((closed) => closed.id === itemId))
                                    pending.delete(itemId);
                                heldSet(upsert(held, response.items.map(feedItemOf), false));
                                publish(seenPendingNow());
                                unreadStore?.unreadReceived(response.unread);
                            },
                            (error: unknown) => seenFailed([itemId], error),
                        );
                },
                readAll() {
                    const newest = snapshot.items[0];
                    const open = snapshot.items.filter(
                        (item) => item.seenAt === null && !pending.has(item.id),
                    );
                    if (!newest || open.length === 0) return;
                    for (const item of open) pending.set(item.id, item.version);
                    pendingPublish();
                    const through = newest.cursor;
                    client.markFeedReadAll({ through, mutationId: mutationIdCreate() }).then(
                        (response) => {
                            readAllConfirmed(through, Date.now());
                            unreadStore?.unreadReceived(response.unread);
                        },
                        (error: unknown) =>
                            seenFailed(
                                open.map((item) => item.id),
                                error,
                            ),
                    );
                },
            } satisfies HappyAgentFeedPageStore,
            /** Entries a mutation elsewhere closed, as the daemon answered it. */
            itemsReceived(items: readonly FeedItem[]): void {
                const next = upsert(held, items.map(feedItemOf), false);
                if (next === held) return;
                heldSet(next);
                publish(seenPendingNow());
            },
            [Symbol.dispose](): void {
                following?.abort();
                listeners.clear();
            },
        };
    }

    /* ---- Clusters ----------------------------------------------------- */

    function clustersCreate() {
        const listeners = new Set<() => void>();
        let snapshot: HappyAgentFeedClustersSnapshot = {
            availability: "unknown",
            clusters: [],
            loading: true,
            error: null,
            pending: SEEN_PENDING_NONE,
            peek: null,
        };
        /** The peeked cluster's entries as read, whether or not what they name has been. */
        let peekHeld: readonly HappyAgentFeedPeekEntry[] = [];
        let peekAnswered = false;
        let following: AbortController | undefined;
        let settle: ReturnType<typeof setTimeout> | undefined;
        const publish = (next: Partial<HappyAgentFeedClustersSnapshot>): void => {
            snapshot = { ...snapshot, ...next };
            for (const listener of listeners) listener();
        };
        /**
         * The peek as it stands: its settled entries, and loading until the
         * read and everything its entries name have answered.
         */
        const peekOf = (peek: HappyAgentFeedPeek): HappyAgentFeedPeek => {
            const settled = peekHeld.filter(entrySettled);
            const loading = !peekAnswered || (peek.loading && settled.length < peekHeld.length);
            return {
                ...peek,
                entries: sameEntries(settled, peek.entries) ? peek.entries : settled,
                loading,
            };
        };
        const peekChanged = (): void => {
            const peek = snapshot.peek;
            if (!peek) return;
            const next = peekOf(peek);
            if (next.entries !== peek.entries || next.loading !== peek.loading)
                publish({ peek: next });
        };
        const clusterAdopt = (cluster: HappyAgentFeedPlace): void =>
            publish({
                clusters: snapshot.clusters.map((known) =>
                    known.cluster === cluster.cluster ? cluster : known,
                ),
            });
        const clustersRead = async (signal: AbortSignal): Promise<void> => {
            const response = await happyAgentSyncRead(
                signal,
                () => client.listFeedClusters({ signal }),
                (error) => publish({ error: happyAgentUserError(error) }),
            );
            if (signal.aborted) return;
            publish({
                clusters: response.clusters.map(feedPlaceOf),
                loading: false,
                error: null,
            });
        };
        const peekRead = (signal: AbortSignal, cluster: string): void => {
            client.peekFeedCluster(cluster, { limit: PEEK_LIMIT }, { signal }).then(
                (response) => {
                    if (signal.aborted || snapshot.peek?.cluster !== cluster) return;
                    peekHeld = response.entries.map(feedPeekEntryOf);
                    peekAnswered = true;
                    referencesRequest(peekHeld);
                    publish({ peek: peekOf({ ...snapshot.peek, error: null }) });
                },
                (error: unknown) => {
                    if (signal.aborted || snapshot.peek?.cluster !== cluster) return;
                    peekAnswered = true;
                    publish({
                        peek: peekOf({
                            ...snapshot.peek,
                            loading: false,
                            error: happyAgentUserError(error),
                        }),
                    });
                },
            );
        };
        /** Something happened: what the clusters say about it is read once it settles. */
        const changed = (signal: AbortSignal): void => {
            clearTimeout(settle);
            settle = setTimeout(() => {
                if (signal.aborted) return;
                void clustersRead(signal).catch(noop);
                if (snapshot.peek) peekRead(signal, snapshot.peek.cluster);
            }, CLUSTERS_SETTLE_MS);
        };
        const followLoop = async (signal: AbortSignal): Promise<void> => {
            for await (const input of sync.follow({
                signal,
                events: ["feed.item.created", "feed.item.updated"],
            })) {
                if (input.kind === "bootstrap" || input.kind === "reconcile") {
                    const available = availability();
                    publish({ availability: available });
                    if (available !== "available") continue;
                    void clustersRead(signal).catch(noop);
                    if (snapshot.peek) peekRead(signal, snapshot.peek.cluster);
                } else if (input.kind === "update" && input.update.kind === "event")
                    changed(signal);
            }
        };
        const pendingSet = (cluster: string, on: boolean): void => {
            const next = new Set(snapshot.pending);
            if (on) next.add(cluster);
            else next.delete(cluster);
            publish({ pending: next.size === 0 ? SEEN_PENDING_NONE : next });
        };
        return {
            store: {
                get: () => snapshot,
                subscribe(listener: () => void) {
                    if (disposed) return noop;
                    listeners.add(listener);
                    if (!following) {
                        following = new AbortController();
                        referencesFollow(following.signal, peekChanged);
                        void followLoop(following.signal).catch(noop);
                    }
                    return () => {
                        listeners.delete(listener);
                        // A secondary list: nobody looking, nothing followed.
                        if (listeners.size > 0) return;
                        clearTimeout(settle);
                        following?.abort();
                        following = undefined;
                    };
                },
                clusterFollowUpdate(cluster: string, follow: boolean) {
                    if (snapshot.pending.has(cluster)) return;
                    pendingSet(cluster, true);
                    const options = { mutationId: mutationIdCreate() };
                    (follow
                        ? client.subscribeFeedCluster(cluster, options)
                        : client.muteFeedCluster(cluster, options)
                    ).then(
                        (response) => {
                            clusterAdopt(feedPlaceOf(response.cluster));
                            pendingSet(cluster, false);
                            publish({ error: null });
                        },
                        (error: unknown) => {
                            pendingSet(cluster, false);
                            publish({ error: happyAgentUserError(error) });
                        },
                    );
                },
                peekOpen(cluster: string) {
                    const signal = following?.signal;
                    if (!signal) return;
                    peekHeld = [];
                    peekAnswered = false;
                    publish({ peek: { cluster, entries: [], loading: true, error: null } });
                    peekRead(signal, cluster);
                },
                peekClose() {
                    peekHeld = [];
                    if (snapshot.peek) publish({ peek: null });
                },
            } satisfies HappyAgentFeedClustersStore,
            [Symbol.dispose](): void {
                clearTimeout(settle);
                following?.abort();
                listeners.clear();
            },
        };
    }

    const unreadOf = () => (unreadStore ??= unreadCreate());
    return {
        unread: () => unreadOf().store,
        page: () => (pageStore ??= pageCreate()).store,
        clusters: () => (clustersStore ??= clustersCreate()).store,
        references: () => references,
        subjectSeen(subject) {
            if (disposed || availability() !== "available") return;
            client.markFeedSeen({ subjects: [subject], mutationId: mutationIdCreate() }).then(
                (response) => {
                    if (disposed || response.items.length === 0) return;
                    pageStore?.itemsReceived(response.items);
                    unreadStore?.unreadReceived(response.unread);
                },
                // Seeing is a hint; the next change or read says where things stand.
                noop,
            );
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            unreadStore?.[Symbol.dispose]();
            pageStore?.[Symbol.dispose]();
            clustersStore?.[Symbol.dispose]();
            references[Symbol.dispose]();
        },
    };
}
