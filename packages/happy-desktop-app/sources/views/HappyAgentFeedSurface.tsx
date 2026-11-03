import { useSyncExternalStore } from "react";
import {
    HAPPY_AGENT_ARTIFACT_TYPES,
    happyAgentArtifactNames,
    type FeedCluster,
    type FeedEntry,
    type FeedItem,
    type FeedSubject,
    type HappyAgentArtifactNames,
    type HappyAgentArtifactPlaces,
    type HappyAgentArtifactType,
    type HappyAgentClockStore,
    type HappyAgentFeed,
    type HappyAgentFeedClustersSnapshot,
    type HappyAgentFeedClustersStore,
} from "happy-desktop-state";
import {
    EmptyState,
    HappyAgentFeedPage,
    type HappyAgentFeedActor,
    type HappyAgentFeedCluster,
    type HappyAgentFeedClusterKind,
    type HappyAgentFeedEntry,
    type HappyAgentFeedSubjectKind,
} from "happy-desktop-ui";

/** The clusters of a page showing its other list: nothing is read for them. */
const CLUSTERS_UNREAD: HappyAgentFeedClustersSnapshot = {
    availability: "unknown",
    clusters: [],
    loading: true,
    error: null,
    pending: new Set(),
    peek: null,
};
const clustersStoreIdle: Pick<HappyAgentFeedClustersStore, "get" | "subscribe"> = {
    get: () => CLUSTERS_UNREAD,
    subscribe: () => () => undefined,
};

/** What kind of thing an entry is about, as the page draws it. */
function feedSubjectKind(
    entry: Pick<FeedEntry, "subject" | "snapshot">,
): HappyAgentFeedSubjectKind {
    switch (entry.subject.type) {
        case "task":
            return "task";
        case "bot":
            return "bot";
        case "artifact":
            return "artifact";
        case "surface":
            switch (entry.snapshot.surfaceType) {
                case "todo":
                    return "todoList";
                case "document":
                    return "document";
                case "calendar":
                    return "calendar";
                default:
                    return "surface";
            }
        default:
            return "unknown";
    }
}

function feedArtifactType(type: string | undefined): HappyAgentArtifactType {
    return HAPPY_AGENT_ARTIFACT_TYPES.find((known) => known === type) ?? "unknown";
}

/**
 * Who made a change, by the name the window already knows them by. An agent
 * is named by its conversation; a person by the user directory. The one
 * person of a standalone installation is credited with no id at all, and is
 * the reader.
 */
function feedActorOf(
    actor: FeedItem["actors"][number],
    names: HappyAgentArtifactNames,
): HappyAgentFeedActor {
    if (actor.agentId !== null)
        return { key: `agent:${actor.agentId}`, name: names.agent?.(actor.agentId) ?? "An agent" };
    if (actor.userId !== null)
        return { key: `user:${actor.userId}`, name: names.user?.(actor.userId) ?? "A person" };
    return { key: "you", name: "You" };
}

function feedEntryOf(
    id: string,
    entry: FeedEntry,
    unread: boolean,
    names: HappyAgentArtifactNames,
): HappyAgentFeedEntry {
    const subject = feedSubjectKind(entry);
    return {
        id,
        subject,
        ...(subject === "artifact"
            ? { artifactType: feedArtifactType(entry.snapshot.artifactType) }
            : {}),
        title: entry.snapshot.title,
        actors: entry.actors.map((actor) => feedActorOf(actor, names)),
        actorCount: entry.actorCount,
        created: entry.created,
        updates: entry.updates,
        ...(entry.snapshot.detail ? { detail: entry.snapshot.detail } : {}),
        lastAt: entry.lastAt,
        unread,
    };
}

function feedClusterKind(kind: string): HappyAgentFeedClusterKind {
    switch (kind) {
        case "everything":
        case "team":
        case "task":
        case "bot":
        case "surface":
        case "project":
        case "workspace":
            return kind;
        default:
            return "unknown";
    }
}

/**
 * A cluster as the reader follows it. One they made no choice about follows
 * everything, so it is followed exactly when everything is.
 */
function feedClusterOf(
    cluster: FeedCluster,
    everything: FeedCluster["state"],
    pending: boolean,
): HappyAgentFeedCluster {
    const state = cluster.state ?? everything ?? "subscribed";
    return {
        id: cluster.cluster,
        kind: feedClusterKind(cluster.kind),
        label: cluster.name,
        state,
        ...(pending ? { pending } : {}),
    };
}

/** A peek entry has no id of its own: its subject names it. */
const peekEntryId = (entry: FeedEntry): string => `${entry.subject.type}:${entry.subject.id}`;

/**
 * The reader's feed on one Happy Agent, in the window's content area. It reads
 * the feed's stores and hands the page what they hold in words; opening an
 * entry marks it seen and goes to its subject.
 */
export function HappyAgentFeedSurface(props: {
    feed: HappyAgentFeed;
    clock: HappyAgentClockStore;
    places: HappyAgentArtifactPlaces;
    /** Why this Happy Agent cannot take the reader's changes right now. */
    unavailable?: string;
    /** Goes to what an entry is about; an unknown kind of subject goes nowhere. */
    onSubjectOpen: (subject: FeedSubject) => void;
}) {
    const pageStore = props.feed.page();
    const page = useSyncExternalStore(pageStore.subscribe, pageStore.get, pageStore.get);
    const unreadStore = props.feed.unread();
    const unread = useSyncExternalStore(unreadStore.subscribe, unreadStore.get, unreadStore.get);
    // The clusters are read only while their list is on screen.
    const clustersStore = page.view === "following" ? props.feed.clusters() : clustersStoreIdle;
    const clusters = useSyncExternalStore(
        clustersStore.subscribe,
        clustersStore.get,
        clustersStore.get,
    );
    const peopleStore = props.feed.people();
    const people = useSyncExternalStore(peopleStore.subscribe, peopleStore.get, peopleStore.get);
    const now = useSyncExternalStore(props.clock.subscribe, props.clock.get, props.clock.get);
    if (page.availability === "unsupported")
        return (
            <EmptyState
                description="This Happy Agent does not keep a feed. Updating it adds one."
                icon="feed"
                size="panel"
                title="No feed here"
            />
        );
    const names = happyAgentArtifactNames(props.places, people);
    const everything = clusters.clusters.find((cluster) => cluster.cluster === "*")?.state ?? null;
    const peek = clusters.peek;
    const clustersStoreLive = props.feed.clusters();
    return (
        <HappyAgentFeedPage
            clusters={{
                items: clusters.clusters.map((cluster) =>
                    feedClusterOf(cluster, everything, clusters.pending.has(cluster.cluster)),
                ),
                loading: clusters.loading,
                hasMore: false,
                loadingMore: false,
                ...(clusters.error ? { error: clusters.error.message } : {}),
            }}
            feed={{
                items: page.items.map((item) =>
                    feedEntryOf(
                        item.id,
                        item,
                        item.seenAt === null && !page.seenPending.has(item.id),
                        names,
                    ),
                ),
                loading: page.loading,
                hasMore: page.hasMore,
                loadingMore: page.loadingMore,
                ...(page.error ? { error: page.error.message } : {}),
            }}
            now={now}
            onClusterFollowChange={clustersStoreLive.clusterFollowUpdate}
            onClusterPeek={clustersStoreLive.peekOpen}
            onEntryOpen={(itemId) => {
                const item = page.items.find((entry) => entry.id === itemId);
                if (!item) return;
                pageStore.entryOpen(itemId);
                props.onSubjectOpen(item.subject);
            }}
            onLoadMore={pageStore.pageNextLoad}
            onPeekClose={clustersStoreLive.peekClose}
            onPeekEntryOpen={(entryId) => {
                const entry = peek?.entries.find((candidate) => peekEntryId(candidate) === entryId);
                if (entry) props.onSubjectOpen(entry.subject);
            }}
            onPeekLoadMore={() => undefined}
            onReadAll={pageStore.readAll}
            onViewChange={pageStore.viewUpdate}
            {...(peek
                ? {
                      peek: {
                          label: peek.name,
                          list: {
                              items: peek.entries.map((entry) =>
                                  feedEntryOf(peekEntryId(entry), entry, false, names),
                              ),
                              loading: peek.loading,
                              hasMore: false,
                              loadingMore: false,
                              ...(peek.error ? { error: peek.error.message } : {}),
                          },
                      },
                  }
                : {})}
            unread={unread.unread}
            {...(props.unavailable === undefined ? {} : { unavailable: props.unavailable })}
            view={page.view}
        />
    );
}
