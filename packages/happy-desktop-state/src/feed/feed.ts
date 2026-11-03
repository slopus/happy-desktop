import type {
    FeedCluster,
    FeedEntry,
    FeedItem,
    FeedSubject,
    HappyAgentClient,
} from "@slopus/happy-agent-client";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { happyAgentSyncRead } from "../happyAgentConnection/happyAgentSyncRead.js";
import { happyAgentUserError } from "../happyAgent/happyAgentSupport.js";
import { happyAgentSurfacePeopleReaderCreate } from "../surfaces/surfacePeople.js";
import type { HappyAgentSurfacePerson } from "../surfaces/surfaceTypes.js";
import type { UserError } from "../types.js";

export type {
    FeedActor,
    FeedCluster,
    FeedEntry,
    FeedItem,
    FeedSnapshot,
    FeedSubject,
} from "@slopus/happy-agent-client";

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
    /** Newest `cursor` first; an entry that takes in a change keeps its object identity only while unchanged. */
    readonly items: readonly FeedItem[];
    /** The first read has not answered yet. */
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
    readonly name: string;
    readonly entries: readonly FeedEntry[];
    readonly loading: boolean;
    readonly error: UserError | null;
}

/** The places the reader's feed gathers from, and one of them peeked into. */
export interface HappyAgentFeedClustersSnapshot {
    readonly availability: HappyAgentFeedAvailability;
    readonly clusters: readonly FeedCluster[];
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

export interface HappyAgentFeedPeopleStore {
    get(): ReadonlyMap<string, HappyAgentSurfacePerson>;
    subscribe(listener: () => void): () => void;
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
    /** The names and photos of the people entries credit, by user id, as they are read. */
    people(): HappyAgentFeedPeopleStore;
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
        | "endpoint"
    >;
    readonly sync: HappyAgentSync;
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

export function happyAgentFeedCreate(deps: HappyAgentFeedDeps): HappyAgentFeed {
    const { client, sync } = deps;
    let disposed = false;
    // The people entries credit, each read once while the feed lives.
    const peopleController = new AbortController();
    const peopleListeners = new Set<() => void>();
    let people: ReadonlyMap<string, HappyAgentSurfacePerson> = new Map();
    const peopleReader = happyAgentSurfacePeopleReaderCreate({
        client,
        signal: peopleController.signal,
        read: (read) => {
            people = new Map([...people, ...read]);
            for (const listener of peopleListeners) listener();
        },
    });
    const peopleStore: HappyAgentFeedPeopleStore = {
        get: () => people,
        subscribe(listener) {
            peopleListeners.add(listener);
            return () => peopleListeners.delete(listener);
        },
    };
    const actorsSeen = (entries: readonly Pick<FeedEntry, "actors">[]): void =>
        peopleReader.request(entries.flatMap((entry) => entry.actors.map((actor) => actor.userId)));
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
        /** The version each pending entry had when it was opened or read. */
        const pending = new Map<string, string>();
        let following: AbortController | undefined;
        let cursor: string | undefined;
        const publish = (next: Partial<HappyAgentFeedPageSnapshot>): void => {
            snapshot = { ...snapshot, ...next };
            for (const listener of listeners) listener();
        };
        /** The pending set as it now stands, to publish beside whatever changed it. */
        const seenPendingNow = (): Pick<HappyAgentFeedPageSnapshot, "seenPending"> => ({
            seenPending: pending.size === 0 ? SEEN_PENDING_NONE : new Set(pending.keys()),
        });
        const pendingPublish = (): void => publish(seenPendingNow());
        /**
         * Takes in copies of entries: the greater `version` of each wins, and
         * an entry older than the last one held is left for paging to bring,
         * so the list never has a gap. Unchanged entries keep their objects.
         */
        const upsert = (
            current: readonly FeedItem[],
            incoming: readonly FeedItem[],
            hasMore: boolean,
        ): readonly FeedItem[] => {
            if (incoming.length === 0) return current;
            const byId = new Map(current.map((item) => [item.id, item]));
            const tail = current.at(-1)?.cursor;
            let changed = false;
            for (const item of incoming) {
                const held = byId.get(item.id);
                if (held !== undefined && held.version >= item.version) continue;
                if (held === undefined && hasMore && tail !== undefined && item.cursor < tail)
                    continue;
                byId.set(item.id, item);
                changed = true;
                const opened = pending.get(item.id);
                if (opened !== undefined && item.version > opened) pending.delete(item.id);
            }
            return changed ? [...byId.values()].sort(byCursor) : current;
        };
        const remove = (itemId: string): void => {
            if (!snapshot.items.some((item) => item.id === itemId)) return;
            pending.delete(itemId);
            publish({
                items: snapshot.items.filter((item) => item.id !== itemId),
                ...seenPendingNow(),
            });
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
            actorsSeen(response.items);
            const floor = response.items.at(-1)?.cursor;
            const ids = new Set(response.items.map((item) => item.id));
            const older =
                floor === undefined || !response.hasMore
                    ? []
                    : snapshot.items.filter((item) => item.cursor < floor && !ids.has(item.id));
            const fresh = upsert(
                snapshot.items.filter((item) => ids.has(item.id) || older.includes(item)),
                response.items,
                false,
            );
            publish({
                items: fresh,
                loading: false,
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
                    publish({ availability: available, loading: available === "available" });
                    if (available === "available") void firstRead(signal).catch(noop);
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
                    actorsSeen([event.payload.item]);
                    const items = upsert(snapshot.items, [event.payload.item], snapshot.hasMore);
                    if (items !== snapshot.items) publish({ items, ...seenPendingNow() });
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
            const items = snapshot.items.map((item) => {
                if (item.cursor > through) return item;
                pending.delete(item.id);
                if (item.seenAt !== null) return item;
                changed = true;
                return { ...item, seenAt: at };
            });
            publish({ ...(changed ? { items } : {}), ...seenPendingNow() });
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
                        void followLoop(following.signal).catch(noop);
                    }
                    return () => void listeners.delete(listener);
                },
                viewUpdate(view: HappyAgentFeedView) {
                    if (view !== snapshot.view) publish({ view });
                },
                pageNextLoad() {
                    const last = snapshot.items.at(-1);
                    const signal = following?.signal;
                    if (!signal || !last || !snapshot.hasMore || snapshot.loadingMore) return;
                    publish({ loadingMore: true });
                    client.getFeed({ before: last.cursor, limit: PAGE }, { signal }).then(
                        (response) => {
                            if (signal.aborted) return;
                            actorsSeen(response.items);
                            const merged = [...snapshot.items];
                            const ids = new Set(merged.map((item) => item.id));
                            for (const item of response.items)
                                if (!ids.has(item.id)) merged.push(item);
                            publish({
                                items: upsert(merged.sort(byCursor), response.items, false),
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
                    const item = snapshot.items.find((entry) => entry.id === itemId);
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
                                publish({
                                    items: upsert(snapshot.items, response.items, false),
                                    ...seenPendingNow(),
                                });
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
                const next = upsert(snapshot.items, items, false);
                if (next === snapshot.items) return;
                publish({ items: next, ...seenPendingNow() });
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
        let following: AbortController | undefined;
        let settle: ReturnType<typeof setTimeout> | undefined;
        const publish = (next: Partial<HappyAgentFeedClustersSnapshot>): void => {
            snapshot = { ...snapshot, ...next };
            for (const listener of listeners) listener();
        };
        const clusterAdopt = (cluster: FeedCluster): void =>
            publish({
                clusters: snapshot.clusters.map((held) =>
                    held.cluster === cluster.cluster ? cluster : held,
                ),
            });
        const clustersRead = async (signal: AbortSignal): Promise<void> => {
            const response = await happyAgentSyncRead(
                signal,
                () => client.listFeedClusters({ signal }),
                (error) => publish({ error: happyAgentUserError(error) }),
            );
            if (signal.aborted) return;
            publish({ clusters: response.clusters, loading: false, error: null });
        };
        const peekRead = (signal: AbortSignal, cluster: string): void => {
            client.peekFeedCluster(cluster, { limit: PEEK_LIMIT }, { signal }).then(
                (response) => {
                    if (signal.aborted || snapshot.peek?.cluster !== cluster) return;
                    actorsSeen(response.entries);
                    publish({
                        peek: {
                            cluster,
                            name: response.cluster.name,
                            entries: response.entries,
                            loading: false,
                            error: null,
                        },
                    });
                },
                (error: unknown) => {
                    if (signal.aborted || snapshot.peek?.cluster !== cluster) return;
                    publish({
                        peek: {
                            ...snapshot.peek,
                            loading: false,
                            error: happyAgentUserError(error),
                        },
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
                            clusterAdopt(response.cluster);
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
                    const name =
                        snapshot.clusters.find((held) => held.cluster === cluster)?.name ?? cluster;
                    publish({ peek: { cluster, name, entries: [], loading: true, error: null } });
                    peekRead(signal, cluster);
                },
                peekClose() {
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
        people: () => peopleStore,
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
            peopleController.abort();
            peopleListeners.clear();
        },
    };
}
