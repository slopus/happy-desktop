import { useSyncExternalStore } from "react";
import {
    HAPPY_AGENT_ARTIFACT_TYPES,
    happyAgentArtifactNames,
    type FeedCluster,
    type FeedEntry,
    type FeedItem,
    type FeedSubject,
    type HappyAgentArtifactPlaces,
    type HappyAgentArtifactType,
    type HappyAgentClockStore,
    type HappyAgentFeed,
    type HappyAgentFeedClustersSnapshot,
    type HappyAgentFeedClustersStore,
    type HappyAgentSurface,
    type HappyAgentSurfacePerson,
} from "happy-desktop-state";
import {
    EmptyState,
    HappyAgentFeedPage,
    type HappyAgentFeedActor,
    type HappyAgentFeedCluster,
    type HappyAgentFeedClusterKind,
    type HappyAgentFeedEntry,
    type HappyAgentFeedFace,
    type HappyAgentFeedSubjectKind,
} from "happy-desktop-ui";
import { botFace, ownerInitials, taskFace } from "../agentFaces";

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

/** People are named from the feed's own people store, so the shared lookup is given none. */
const PEOPLE_NAMES_NONE: ReadonlyMap<string, string> = new Map();

/** Everything a face or a name on the feed is looked up in. */
interface FeedFaces {
    readonly places: HappyAgentArtifactPlaces;
    readonly surfaces: readonly HappyAgentSurface[];
    readonly people: ReadonlyMap<string, HappyAgentSurfacePerson>;
    /** The standalone person, who is credited with no user id. */
    readonly profile: HappyAgentSurfacePerson | undefined;
    /** A conversation's title. */
    readonly agentName: (agentId: string) => string | undefined;
}

function personFace(person: HappyAgentSurfacePerson | undefined, name: string, seed?: string) {
    return {
        type: "human",
        initials: ownerInitials(name),
        ...(seed === undefined ? {} : { placeholderSeed: seed }),
        ...(person?.photo ? { imageUrl: person.photo.url } : {}),
    } satisfies HappyAgentFeedFace;
}

/**
 * Who made a change, by the name and face the window already knows them by.
 * An agent is its bot's or task's face and its conversation's title; a person
 * is their photo and name from the user directory. The one person of a
 * standalone installation is credited with no id at all, and is the reader.
 */
function feedActorOf(actor: FeedItem["actors"][number], faces: FeedFaces): HappyAgentFeedActor {
    if (actor.agentId !== null) {
        const agentId = actor.agentId;
        const bot = faces.places.bots.find((each) => each.conversation.id === agentId);
        const task = faces.places.tasks.find((each) => each.conversation.id === agentId);
        const name = bot?.name ?? task?.name ?? faces.agentName(agentId) ?? "An agent";
        return {
            key: `agent:${agentId}`,
            name,
            face: {
                type: "agent",
                initials: ownerInitials(name),
                ...(bot ? botFace(bot) : task ? taskFace(task) : { placeholderSeed: agentId }),
            },
        };
    }
    if (actor.userId !== null) {
        const person = faces.people.get(actor.userId);
        const name = person?.name ?? "A person";
        return {
            key: `user:${actor.userId}`,
            name,
            face: personFace(person, name, actor.userId),
        };
    }
    return { key: "you", name: "You", face: personFace(faces.profile, faces.profile?.name ?? "") };
}

/**
 * A subject's own avatar: a bot's face, a task's, a Surface's picture. An
 * artifact, and a Surface without a picture, wear their glyph instead.
 */
function feedSubjectFace(
    entry: Pick<FeedEntry, "subject" | "snapshot">,
    faces: FeedFaces,
): HappyAgentFeedFace | undefined {
    const id = entry.subject.id;
    const initials = ownerInitials(entry.snapshot.title);
    switch (entry.subject.type) {
        case "bot": {
            const bot = faces.places.bots.find((each) => each.id === id);
            return { type: "agent", initials, ...(bot ? botFace(bot) : { placeholderSeed: id }) };
        }
        case "task": {
            const task = faces.places.tasks.find((each) => each.id === id);
            return task
                ? { type: "agent", ...taskFace(task) }
                : { type: "agent", initials, placeholderSeed: id };
        }
        case "surface": {
            const image = faces.surfaces.find((each) => each.id === id)?.image;
            return image ? { type: "agent", initials, imageUrl: image.url } : undefined;
        }
        default:
            return undefined;
    }
}

function feedEntryOf(
    id: string,
    entry: FeedEntry,
    unread: boolean,
    faces: FeedFaces,
): HappyAgentFeedEntry {
    const subject = feedSubjectKind(entry);
    const face = feedSubjectFace(entry, faces);
    return {
        id,
        subject,
        ...(subject === "artifact"
            ? { artifactType: feedArtifactType(entry.snapshot.artifactType) }
            : {}),
        title: entry.snapshot.title,
        ...(face ? { face } : {}),
        actors: entry.actors.map((actor) => feedActorOf(actor, faces)),
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
    faces: FeedFaces,
): HappyAgentFeedCluster {
    const state = cluster.state ?? everything ?? "subscribed";
    const face = feedClusterFace(cluster, faces);
    return {
        id: cluster.cluster,
        kind: feedClusterKind(cluster.kind),
        label: cluster.name,
        ...(face ? { face } : {}),
        state,
        ...(pending ? { pending } : {}),
    };
}

/**
 * A cluster's avatar: its bot's, task's, or project's face, or its Surface's
 * picture. The daemon names a place's cluster `<kind>:<id>`.
 */
function feedClusterFace(cluster: FeedCluster, faces: FeedFaces): HappyAgentFeedFace | undefined {
    const prefix = `${cluster.kind}:`;
    if (!cluster.cluster.startsWith(prefix)) return undefined;
    const id = cluster.cluster.slice(prefix.length);
    const initials = ownerInitials(cluster.name);
    switch (cluster.kind) {
        case "bot":
        case "task":
        case "surface":
            return feedSubjectFace(
                { subject: { type: cluster.kind, id }, snapshot: { title: cluster.name } },
                faces,
            );
        case "project": {
            const project = faces.places.projects.find((each) => each.id === id);
            if (!project) return undefined;
            return {
                type: "agent",
                initials,
                placeholderSeed: project.id,
                ...(project.avatar ? { imageUrl: project.avatar.url } : {}),
            };
        }
        default:
            return undefined;
    }
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
    /** The Happy Agent's Surfaces, whose pictures their entries wear. */
    surfaces: readonly HappyAgentSurface[];
    /** The standalone reader, who is credited with no user id. */
    profile?: HappyAgentSurfacePerson;
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
    const faces: FeedFaces = {
        places: props.places,
        surfaces: props.surfaces,
        people,
        profile: props.profile,
        agentName:
            happyAgentArtifactNames(props.places, PEOPLE_NAMES_NONE).agent ?? (() => undefined),
    };
    const everything = clusters.clusters.find((cluster) => cluster.cluster === "*")?.state ?? null;
    const peek = clusters.peek;
    const clustersStoreLive = props.feed.clusters();
    return (
        <HappyAgentFeedPage
            clusters={{
                items: clusters.clusters.map((cluster) =>
                    feedClusterOf(
                        cluster,
                        everything,
                        clusters.pending.has(cluster.cluster),
                        faces,
                    ),
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
                        faces,
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
                                  feedEntryOf(peekEntryId(entry), entry, false, faces),
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
