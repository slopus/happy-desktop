import { useSyncExternalStore } from "react";
import {
    feedTodoKey,
    happyAgentArtifactNames,
    type FeedActor,
    type HappyAgentArtifactId,
    type HappyAgentArtifactNames,
    type HappyAgentArtifactTitlesSnapshot,
    type HappyAgentArtifactTitlesStore,
    type HappyAgentBot,
    type HappyAgentClockStore,
    type HappyAgentFeed,
    type HappyAgentFeedBot,
    type HappyAgentFeedClustersSnapshot,
    type HappyAgentFeedClustersStore,
    type HappyAgentFeedPeekEntry,
    type HappyAgentFeedPlace,
    type HappyAgentFeedReferencesSnapshot,
    type HappyAgentProjectGroup,
    type HappyAgentSurface,
    type HappyAgentSurfacePerson,
    type HappyAgentTask,
    type HappyAgentWorkspaceStore,
    type FeedSubject,
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
import { reactFrameSubscribe } from "../reactFrameSubscribe";

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

/** People are named from the feed's own references, so the shared lookup is given none. */
const PEOPLE_NAMES_NONE: ReadonlyMap<string, string> = new Map();
const PROJECTS_NONE: readonly HappyAgentProjectGroup[] = [];

/**
 * Everything a name or a face on the feed is read from: the stores that sync
 * each kind of thing, never a copy the feed was sent. A rename anywhere shows
 * here as soon as its own store has it.
 */
interface FeedWorld {
    readonly projects: readonly HappyAgentProjectGroup[];
    /** The active bots, as the sidebar shows them. */
    readonly bots: readonly HappyAgentBot[];
    /** Every task, joined or not, archived or not. */
    readonly tasks: readonly HappyAgentTask[];
    readonly surfaces: readonly HappyAgentSurface[];
    readonly titles: HappyAgentArtifactTitlesSnapshot;
    /** People, agents, archived bots, todos, and the reader, read as entries name them. */
    readonly references: HappyAgentFeedReferencesSnapshot;
    readonly names: HappyAgentArtifactNames;
}

/** A bot by id, as the sidebar has it, or from the whole catalog once it is archived. */
type FeedBotFound =
    | { readonly kind: "listed"; readonly bot: HappyAgentBot }
    | { readonly kind: "catalog"; readonly bot: HappyAgentFeedBot };

function feedBotFind(world: FeedWorld, match: (bot: { id: string; agentId: string }) => boolean) {
    const listed = world.bots.find((bot) => match({ id: bot.id, agentId: bot.conversation.id }));
    if (listed) return { kind: "listed", bot: listed } satisfies FeedBotFound;
    for (const bot of world.references.bots?.values() ?? [])
        if (match(bot)) return { kind: "catalog", bot } satisfies FeedBotFound;
    return undefined;
}

function feedBotName(found: FeedBotFound): string {
    return found.bot.name;
}

function feedBotFace(found: FeedBotFound): HappyAgentFeedFace {
    const initials = ownerInitials(found.bot.name);
    if (found.kind === "listed") return { type: "agent", initials, ...botFace(found.bot) };
    const bot = found.bot;
    if (bot.avatar) return { type: "agent", initials, imageUrl: bot.avatar.url };
    return bot.systemKey === "chief_of_staff"
        ? { type: "agent", initials }
        : { type: "agent", initials, placeholderSeed: bot.id };
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
 * Who made a change, by the name and face the window knows them by now. An
 * agent is its bot's or task's face and name, or its conversation's title; a
 * person is their photo and name from the user directory. The one person of a
 * standalone installation is credited with no id at all, and is the reader.
 * One the window cannot name — a person or agent since deleted — is left out
 * of the list rather than given a stand-in; the count still holds them.
 */
function feedActorOf(actor: FeedActor, world: FeedWorld): HappyAgentFeedActor | undefined {
    if (actor.agentId !== null) {
        const agentId = actor.agentId;
        const bot = feedBotFind(world, (each) => each.agentId === agentId);
        if (bot) return { key: `agent:${agentId}`, name: feedBotName(bot), face: feedBotFace(bot) };
        const task = world.tasks.find((each) => each.conversation.id === agentId);
        if (task)
            return {
                key: `agent:${agentId}`,
                name: task.name,
                face: { type: "agent", ...taskFace(task) },
            };
        const read = world.references.agents.get(agentId);
        const name =
            world.names.agent?.(agentId) ?? (read?.type === "ready" ? read.value.title : undefined);
        if (name === undefined) return undefined;
        return {
            key: `agent:${agentId}`,
            name,
            face: { type: "agent", initials: ownerInitials(name), placeholderSeed: agentId },
        };
    }
    if (actor.userId !== null) {
        const read = world.references.people.get(actor.userId);
        if (read?.type !== "ready" || read.value.name === null) return undefined;
        const name = read.value.name;
        return {
            key: `user:${actor.userId}`,
            name,
            face: personFace(read.value, name, actor.userId),
        };
    }
    // The reader of a standalone installation, as their own chat names them: by
    // their profile's photo, else the initials of its name, else of "You".
    const profile = world.references.profile;
    const own = profile?.name?.trim() || "You";
    return { key: "you", name: "You", face: personFace(profile ?? undefined, own) };
}

/** A Surface's kind, as the page draws it. */
function feedSurfaceKind(surface: HappyAgentSurface): HappyAgentFeedSubjectKind {
    switch (surface.type.kind) {
        case "todo":
            return "todoList";
        case "document":
            return "document";
        case "calendar":
            return "calendar";
        default:
            return "surface";
    }
}

/** What an entry is about, in the words and face the window has for it now. */
interface FeedSubjectShown {
    readonly kind: HappyAgentFeedSubjectKind;
    readonly title: string;
    readonly face?: HappyAgentFeedFace;
    readonly artifactType?: HappyAgentFeedEntry["artifactType"];
    /** An artifact's cover, which makes its entry a post, and its summary. */
    readonly cover?: HappyAgentFeedEntry["cover"];
    readonly summary?: string;
}

/**
 * A subject as its own store has it: a bot's name and face, a task's, a
 * Surface's name and picture, an artifact's title and type. A subject the
 * window does not hold — a kind it does not know, or one since gone — is not
 * shown at all.
 */
function feedSubjectOf(subject: FeedSubject, world: FeedWorld): FeedSubjectShown | undefined {
    const id = subject.id;
    switch (subject.type) {
        case "bot": {
            const bot = feedBotFind(world, (each) => each.id === id);
            return bot && { kind: "bot", title: feedBotName(bot), face: feedBotFace(bot) };
        }
        case "task": {
            const task = world.tasks.find((each) => each.id === id);
            return (
                task && {
                    kind: "task",
                    title: task.name,
                    face: { type: "agent", ...taskFace(task) },
                }
            );
        }
        case "surface": {
            const surface = world.surfaces.find((each) => each.id === id);
            if (!surface) return undefined;
            return {
                kind: feedSurfaceKind(surface),
                title: surface.name,
                ...(surface.image
                    ? {
                          face: {
                              type: "agent",
                              initials: ownerInitials(surface.name),
                              imageUrl: surface.image.url,
                          },
                      }
                    : {}),
            };
        }
        case "artifact": {
            const artifact = world.titles.get(id as HappyAgentArtifactId);
            if (artifact?.type !== "ready") return undefined;
            const cover = artifact.cover;
            return {
                kind: "artifact",
                title: artifact.title,
                artifactType: artifact.artifactType,
                ...(cover === null
                    ? {}
                    : {
                          cover: {
                              url: cover.url,
                              aspect: cover.aspect,
                              ...(artifact.background === null
                                  ? {}
                                  : { background: artifact.background }),
                          },
                          ...(artifact.summary === null ? {} : { summary: artifact.summary }),
                      }),
            };
        }
        default:
            return undefined;
    }
}

/** The todo an entry's newest change added, in its current words. */
function feedDetailOf(entry: HappyAgentFeedPeekEntry, world: FeedWorld): string | undefined {
    if (entry.todo === undefined) return undefined;
    const todo = world.references.todos.get(feedTodoKey(entry.todo));
    return todo?.type === "ready" && todo.value.text.trim() !== "" ? todo.value.text : undefined;
}

function feedEntryOf(
    id: string,
    entry: HappyAgentFeedPeekEntry,
    unread: boolean,
    world: FeedWorld,
): HappyAgentFeedEntry | undefined {
    const subject = feedSubjectOf(entry.subject, world);
    if (!subject) return undefined;
    const detail = feedDetailOf(entry, world);
    return {
        id,
        subject: subject.kind,
        ...(subject.artifactType ? { artifactType: subject.artifactType } : {}),
        title: subject.title,
        ...(subject.face ? { face: subject.face } : {}),
        actors: entry.actors.flatMap((actor) => feedActorOf(actor, world) ?? []),
        actorCount: entry.actorCount,
        created: entry.created,
        updates: entry.updates,
        ...(detail === undefined ? {} : { detail }),
        ...(subject.cover ? { cover: subject.cover } : {}),
        ...(subject.summary === undefined ? {} : { summary: subject.summary }),
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

/** What a cluster is called and wears, from the place it names. */
interface FeedPlaceShown {
    readonly label: string;
    readonly face?: HappyAgentFeedFace;
}

/**
 * A cluster in words: everything and the team by their own names, and a
 * place by its task's, bot's, Surface's, project's, or workspace's current
 * name and face. The daemon names a place's cluster `<kind>:<id>`; one the
 * window does not hold is not shown.
 */
function feedPlaceOf(place: HappyAgentFeedPlace, world: FeedWorld): FeedPlaceShown | undefined {
    if (place.kind === "everything") return { label: "Everything" };
    if (place.kind === "team") return { label: "Team" };
    const prefix = `${place.kind}:`;
    if (!place.cluster.startsWith(prefix)) return undefined;
    const id = place.cluster.slice(prefix.length);
    switch (place.kind) {
        case "bot":
        case "task":
        case "surface": {
            const subject = feedSubjectOf({ type: place.kind, id }, world);
            return (
                subject && { label: subject.title, ...(subject.face ? { face: subject.face } : {}) }
            );
        }
        case "project": {
            const project = world.projects.find((each) => each.id === id);
            if (!project) return undefined;
            return {
                label: project.name,
                face: {
                    type: "agent",
                    initials: ownerInitials(project.name),
                    placeholderSeed: project.id,
                    ...(project.avatar ? { imageUrl: project.avatar.url } : {}),
                },
            };
        }
        case "workspace": {
            const label = world.names.workspace?.(id);
            return label === undefined ? undefined : { label };
        }
        default:
            return undefined;
    }
}

/**
 * A cluster as the reader follows it. One they made no choice about follows
 * everything, so it is followed exactly when everything is.
 */
function feedClusterOf(
    place: HappyAgentFeedPlace,
    everything: HappyAgentFeedPlace["state"],
    pending: boolean,
    world: FeedWorld,
): HappyAgentFeedCluster | undefined {
    const shown = feedPlaceOf(place, world);
    if (!shown) return undefined;
    return {
        id: place.cluster,
        kind: feedClusterKind(place.kind),
        label: shown.label,
        ...(shown.face ? { face: shown.face } : {}),
        state: place.state ?? everything ?? "subscribed",
        ...(pending ? { pending } : {}),
    };
}

/** A peek entry has no id of its own: its subject names it. */
const peekEntryId = (entry: HappyAgentFeedPeekEntry): string =>
    `${entry.subject.type}:${entry.subject.id}`;

/**
 * The reader's feed on one Happy Agent, in the window's content area. The
 * feed holds references only; every name, face, and picture on it is read
 * here from the stores that sync that thing, so it is never out of date.
 * Opening an entry marks it seen and goes to its subject.
 */
export function HappyAgentFeedSurface(props: {
    feed: HappyAgentFeed;
    clock: HappyAgentClockStore;
    /** The workspace whose list names projects, workspaces, bots, tasks, and conversations. */
    workspace: HappyAgentWorkspaceStore;
    /** The live titles of artifacts, which artifact entries are named by. */
    artifactTitles: HappyAgentArtifactTitlesStore;
    /** The Happy Agent's Surfaces, whose names and pictures their entries wear. */
    surfaces: readonly HappyAgentSurface[];
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
    const referencesStore = props.feed.references();
    const references = useSyncExternalStore(
        referencesStore.subscribe,
        referencesStore.get,
        referencesStore.get,
    );
    const titles = useSyncExternalStore(
        props.artifactTitles.subscribe,
        props.artifactTitles.get,
        props.artifactTitles.get,
    );
    // The workspace repaints as a transcript streams; its list is read once a frame.
    const workspace = useSyncExternalStore(
        reactFrameSubscribe(props.workspace),
        props.workspace.get,
        props.workspace.get,
    );
    const now = useSyncExternalStore(props.clock.subscribe, props.clock.get, props.clock.get);
    if (page.availability === "unsupported")
        return (
            <EmptyState
                description="This Happy Agent does not track activity yet. Update it to see activity here."
                icon="feed"
                size="panel"
                title="No activity here"
            />
        );
    const list = workspace.list;
    const projects = list.projects.type === "ready" ? list.projects.value : PROJECTS_NONE;
    const tasks = [...list.taskDirectory, ...list.tasksArchived];
    const world: FeedWorld = {
        projects,
        bots: list.bots,
        tasks,
        surfaces: props.surfaces,
        titles,
        references,
        names: happyAgentArtifactNames({ projects, bots: list.bots, tasks }, PEOPLE_NAMES_NONE),
    };
    const everything = clusters.clusters.find((cluster) => cluster.cluster === "*")?.state ?? null;
    const peek = clusters.peek;
    const peekPlace = peek && clusters.clusters.find((cluster) => cluster.cluster === peek.cluster);
    const peekShown = peekPlace ? feedPlaceOf(peekPlace, world) : undefined;
    const clustersStoreLive = props.feed.clusters();
    return (
        <HappyAgentFeedPage
            clusters={{
                items: clusters.clusters.flatMap(
                    (cluster) =>
                        feedClusterOf(
                            cluster,
                            everything,
                            clusters.pending.has(cluster.cluster),
                            world,
                        ) ?? [],
                ),
                loading: clusters.loading,
                hasMore: false,
                loadingMore: false,
                ...(clusters.error ? { error: clusters.error.message } : {}),
            }}
            feed={{
                items: page.items.flatMap(
                    (item) =>
                        feedEntryOf(
                            item.id,
                            item,
                            item.seenAt === null && !page.seenPending.has(item.id),
                            world,
                        ) ?? [],
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
            filter={page.filter}
            onFilterChange={pageStore.filterUpdate}
            {...(peek && peekShown
                ? {
                      peek: {
                          label: peekShown.label,
                          list: {
                              items: peek.entries.flatMap(
                                  (entry) =>
                                      feedEntryOf(peekEntryId(entry), entry, false, world) ?? [],
                              ),
                              loading: peek.loading,
                              hasMore: false,
                              loadingMore: false,
                              ...(peek.error ? { error: peek.error.message } : {}),
                          },
                      },
                  }
                : {})}
            unread={page.filteredUnread ?? unread.unread}
            {...(props.unavailable === undefined ? {} : { unavailable: props.unavailable })}
            view={page.view}
        />
    );
}
