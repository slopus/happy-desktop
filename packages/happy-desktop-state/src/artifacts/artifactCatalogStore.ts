import {
    HappyAgentApiError,
    type ArtifactListQuery,
    type HappyAgentClient,
} from "@slopus/happy-agent-client";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { happyAgentSyncRead } from "../happyAgentConnection/happyAgentSyncRead.js";
import { happyAgentUserError } from "../happyAgent/happyAgentSupport.js";
import type { UserError } from "../types.js";
import {
    HAPPY_AGENT_ARTIFACT_EVENT_TYPES,
    happyAgentArtifactCatalogApply,
    happyAgentArtifactCatalogReplace,
    happyAgentArtifactEventProject,
    happyAgentArtifactFilterSame,
    type HappyAgentArtifactEvent,
} from "./artifactCatalog.js";
import { happyAgentArtifactAuthors } from "./artifactPeopleStore.js";
import { happyAgentArtifactProject } from "./artifactProject.js";
import type {
    HappyAgentArtifact,
    HappyAgentArtifactAuthor,
    HappyAgentArtifactFilter,
    HappyAgentArtifactId,
    HappyAgentArtifactsAvailability,
    HappyAgentArtifactSourceKind,
    HappyAgentArtifactType,
} from "./artifactTypes.js";

/** How many artifacts one catalog read asks for. */
const PAGE_LIMIT = 50;
/** How many a catalog that reads every page asks for at once: the daemon's largest page. */
const PAGES_ALL_LIMIT = 100;
/**
 * Where a catalog that reads every page stops. The daemon has no search of its
 * own, so the palette searches what was read; this bounds what one open costs.
 */
const PAGES_ALL_MAX = 1_000;

/** One way a list can be narrowed to a place: by its source, or by its conversation. */
export type HappyAgentArtifactNarrowing =
    | {
          readonly by: "source";
          readonly kind: HappyAgentArtifactSourceKind;
          readonly id: string;
      }
    | { readonly by: "agent"; readonly agentId: string };

/**
 * The chat a list sits beside, as the two narrower lists it offers. `chat` is
 * the chat itself — its bot, its task, or its one conversation — and `place`
 * is the project root or workspace it works in, present only when that lists
 * more than the chat does.
 */
export interface HappyAgentArtifactChatContext {
    readonly chat: HappyAgentArtifactNarrowing;
    readonly place?: {
        readonly kind: "project" | "workspace";
        readonly narrowing: HappyAgentArtifactNarrowing;
    };
}

/** How far a list beside a chat reaches: the chat, the place it works in, or everything. */
export type HappyAgentArtifactScope = "chat" | "place" | "all";

export interface HappyAgentArtifactCatalogSnapshot {
    /** Whether this Happy Agent has artifacts at all; an older one never will. */
    readonly availability: HappyAgentArtifactsAvailability;
    /** What the list currently holds, derived from the choices below. */
    readonly filter: HappyAgentArtifactFilter;
    /** The type the reader narrowed to, if any. */
    readonly type?: Exclude<HappyAgentArtifactType, "unknown">;
    /** The source the reader narrowed to, if any; a chat context outranks it. */
    readonly source?: { readonly kind: HappyAgentArtifactSourceKind; readonly id?: string };
    readonly deletedShown: boolean;
    readonly scope: HappyAgentArtifactScope;
    /** The chat this list sits beside, when it sits beside one. */
    readonly context?: HappyAgentArtifactChatContext;
    /** True until the first page of the current filter has been read. */
    readonly loading: boolean;
    /** Newest created first. */
    readonly artifacts: readonly HappyAgentArtifact[];
    /** Whether older artifacts remain on pages not read yet. */
    readonly hasMore: boolean;
    readonly loadingMore: boolean;
    /** The last read failed; the retained list stays visible and the read is retried. */
    readonly error?: UserError;
}

export interface HappyAgentArtifactCatalogStore {
    get(): HappyAgentArtifactCatalogSnapshot;
    subscribe(listener: () => void): () => void;
    filterTypeUpdate(type: Exclude<HappyAgentArtifactType, "unknown"> | undefined): void;
    filterSourceUpdate(
        source: { readonly kind: HappyAgentArtifactSourceKind; readonly id?: string } | undefined,
    ): void;
    deletedShownUpdate(shown: boolean): void;
    scopeUpdate(scope: HappyAgentArtifactScope): void;
    /** Reads the next page of older artifacts. */
    pageNextLoad(): void;
    /**
     * Owner input: the chat this list now sits beside, or none. Navigation
     * decides it, so it is applied rather than chosen, and an unchanged chat
     * keeps the list it already holds.
     */
    contextApply(context: HappyAgentArtifactChatContext | undefined): void;
    [Symbol.dispose](): void;
}

export interface HappyAgentArtifactCatalogDeps {
    readonly client: Pick<HappyAgentClient, "listArtifacts" | "getArtifact">;
    readonly sync: HappyAgentSync;
    /** Reports who a list credits, so the people among them can be named once for every surface. */
    readonly authorsSeen?: (authors: readonly (HappyAgentArtifactAuthor | null)[]) => void;
}

const UNSUPPORTED: HappyAgentArtifactCatalogSnapshot = {
    availability: "unsupported",
    filter: { includeDeleted: false },
    deletedShown: false,
    scope: "all",
    loading: false,
    artifacts: [],
    hasMore: false,
    loadingMore: false,
};

/**
 * A catalog with nothing behind it, for a surface whose Happy Agent has no
 * artifact stores — one still connecting, or none at all. It reads as a
 * Happy Agent without artifacts, so nothing offers them.
 */
export const happyAgentArtifactCatalogStoreNoop: HappyAgentArtifactCatalogStore = {
    get: () => UNSUPPORTED,
    subscribe: () => () => undefined,
    filterTypeUpdate: () => undefined,
    filterSourceUpdate: () => undefined,
    deletedShownUpdate: () => undefined,
    scopeUpdate: () => undefined,
    pageNextLoad: () => undefined,
    contextApply: () => undefined,
    [Symbol.dispose]: () => undefined,
};

function filterDerive(
    state: Pick<
        HappyAgentArtifactCatalogSnapshot,
        "type" | "source" | "deletedShown" | "scope" | "context"
    >,
): HappyAgentArtifactFilter {
    const narrowing =
        state.context === undefined || state.scope === "all"
            ? undefined
            : state.scope === "place" && state.context.place
              ? state.context.place.narrowing
              : state.context.chat;
    return {
        includeDeleted: state.deletedShown,
        ...(state.type === undefined ? {} : { type: state.type }),
        ...(narrowing === undefined
            ? state.context === undefined && state.source !== undefined
                ? { source: state.source }
                : {}
            : narrowing.by === "source"
              ? { source: { kind: narrowing.kind, id: narrowing.id } }
              : { agentId: narrowing.agentId }),
    };
}

function queryOf(filter: HappyAgentArtifactFilter, limit = PAGE_LIMIT): ArtifactListQuery {
    return {
        limit,
        ...(filter.includeDeleted ? { includeDeleted: true } : {}),
        ...(filter.type === undefined ? {} : { type: filter.type }),
        ...(filter.agentId === undefined ? {} : { agentId: filter.agentId }),
        ...(filter.source === undefined
            ? {}
            : {
                  sourceKind: filter.source.kind,
                  ...(filter.source.id === undefined ? {} : { sourceId: filter.source.id }),
              }),
    };
}

function narrowingSame(
    left: HappyAgentArtifactNarrowing | undefined,
    right: HappyAgentArtifactNarrowing | undefined,
): boolean {
    if (left === undefined || right === undefined) return left === right;
    if (left.by === "agent") return right.by === "agent" && left.agentId === right.agentId;
    return right.by === "source" && left.kind === right.kind && left.id === right.id;
}

function contextSame(
    left: HappyAgentArtifactChatContext | undefined,
    right: HappyAgentArtifactChatContext | undefined,
): boolean {
    if (left === undefined || right === undefined) return left === right;
    return (
        narrowingSame(left.chat, right.chat) &&
        left.place?.kind === right.place?.kind &&
        narrowingSame(left.place?.narrowing, right.place?.narrowing)
    );
}

function notFound(error: unknown): boolean {
    return error instanceof HappyAgentApiError && error.status === 404;
}

/**
 * One filtered list of a Happy Agent's artifact catalog, kept live.
 *
 * The constructor opens nothing. The first subscriber follows the connection's
 * own event stream for `artifact.*` events and reads the first page; the last
 * one stops both. A read is authoritative and replaces the list; events are
 * delivery hints applied on top of it. Every event that arrives while a read is
 * in flight is replayed onto that read's answer, and applying an event the
 * answer already reflects changes nothing, so nothing made while the list
 * loads is missed. A gap in one artifact's version chain re-reads only that
 * artifact; a gap in the stream reconciles the whole list.
 *
 * A daemon that answers the catalog with 404 has no artifacts at all, and the
 * list says so through `availability` rather than through an error.
 */
export function happyAgentArtifactCatalogStoreCreate(
    deps: HappyAgentArtifactCatalogDeps,
    initial: {
        readonly scope?: HappyAgentArtifactScope;
        /**
         * Reads page after page while subscribed, up to `PAGES_ALL_MAX`
         * artifacts, instead of waiting to be asked for the next one.
         */
        readonly pagesAll?: boolean;
    } = {},
): HappyAgentArtifactCatalogStore {
    const pageLimit = initial.pagesAll === true ? PAGES_ALL_LIMIT : PAGE_LIMIT;
    const listeners = new Set<() => void>();
    let snapshot: HappyAgentArtifactCatalogSnapshot = {
        availability: "checking",
        filter: { includeDeleted: false },
        deletedShown: false,
        scope: initial.scope ?? "all",
        loading: true,
        artifacts: [],
        hasMore: false,
        loadingMore: false,
    };
    let following: AbortController | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    /** Reads of the current filter; aborted together when the filter changes. */
    let reads = new AbortController();
    /** Which `reads` a read belongs to, so an aborted one cannot close the journal. */
    let generation = 0;
    let readsInFlight = 0;
    /** The newest first-page read; an older one finishing later is discarded. */
    let reloadLatest = 0;
    /** Events seen while any read was in flight, replayed onto each answer. */
    let journal: HappyAgentArtifactEvent[] = [];
    let nextPageCursor: string | null = null;
    let failed = false;
    let disposed = false;

    const publish = (next: Partial<HappyAgentArtifactCatalogSnapshot>): void => {
        snapshot = { ...snapshot, ...next };
        for (const listener of listeners) listener();
    };

    const readBegin = (): {
        readonly signal: AbortSignal;
        readonly mark: number;
        readonly end: () => void;
    } => {
        readsInFlight += 1;
        const owner = generation;
        let ended = false;
        return {
            signal: reads.signal,
            mark: journal.length,
            end: () => {
                if (ended || owner !== generation) return;
                ended = true;
                readsInFlight -= 1;
                if (readsInFlight === 0) journal = [];
            },
        };
    };
    /** Abandons every read of the current filter, with the journal they were keeping. */
    const readsAbort = (): void => {
        reads.abort();
        reads = new AbortController();
        generation += 1;
        readsInFlight = 0;
        journal = [];
    };

    /** Applies events to a list, re-reading any artifact whose chain they broke. */
    const eventsApply = (
        artifacts: readonly HappyAgentArtifact[],
        events: readonly HappyAgentArtifactEvent[],
        complete: boolean,
    ): readonly HappyAgentArtifact[] => {
        let next = artifacts;
        for (const event of events) {
            const applied = happyAgentArtifactCatalogApply(next, event, snapshot.filter, complete);
            next = applied.artifacts;
            if (applied.gap) artifactReread(applied.gap);
        }
        return next;
    };

    const artifactReread = (artifactId: HappyAgentArtifactId): void => {
        const signal = reads.signal;
        void deps.client.getArtifact(artifactId, { signal }).then(
            (response) => {
                if (signal.aborted) return;
                const artifact = happyAgentArtifactProject(response.artifact);
                const artifacts = happyAgentArtifactCatalogReplace(
                    snapshot.artifacts,
                    artifact,
                    snapshot.filter,
                );
                if (artifacts !== snapshot.artifacts) publish({ artifacts });
            },
            (error: unknown) => {
                if (signal.aborted || !notFound(error)) return;
                const artifacts = snapshot.artifacts.filter((entry) => entry.id !== artifactId);
                if (artifacts.length !== snapshot.artifacts.length) publish({ artifacts });
            },
        );
    };

    /** Reads the first page of the current filter again, replacing the list. */
    const reload = (): void => {
        if (following === undefined) return;
        const filter = snapshot.filter;
        const { signal, mark, end } = readBegin();
        reloadLatest += 1;
        const token = reloadLatest;
        void happyAgentSyncRead(
            signal,
            async () => {
                try {
                    return await deps.client.listArtifacts(queryOf(filter, pageLimit), { signal });
                } catch (error) {
                    if (notFound(error)) return undefined;
                    throw error;
                }
            },
            (error) => {
                if (signal.aborted) return;
                failed = true;
                publish({ error: happyAgentUserError(error), loading: false });
            },
        )
            .then((response) => {
                if (signal.aborted || token !== reloadLatest) return;
                failed = false;
                if (response === undefined) {
                    nextPageCursor = null;
                    publish({
                        availability: "unsupported",
                        loading: false,
                        artifacts: [],
                        hasMore: false,
                        loadingMore: false,
                        error: undefined,
                    });
                    return;
                }
                nextPageCursor = response.nextPageCursor;
                const complete = nextPageCursor === null;
                const read = response.artifacts.map(happyAgentArtifactProject);
                const artifacts = eventsApply(read, journal.slice(mark), complete);
                deps.authorsSeen?.(happyAgentArtifactAuthors(artifacts));
                publish({
                    availability: "available",
                    loading: false,
                    artifacts,
                    hasMore: !complete,
                    loadingMore: false,
                    error: undefined,
                });
                pagesContinue();
            })
            .catch(() => undefined)
            .finally(end);
    };

    /** Starts over for a changed filter: the old list says nothing about the new one. */
    const filterChange = (
        next: Pick<
            HappyAgentArtifactCatalogSnapshot,
            "type" | "source" | "deletedShown" | "scope" | "context"
        >,
    ): void => {
        const filter = filterDerive(next);
        const changed = !happyAgentArtifactFilterSame(filter, snapshot.filter);
        const { type: _type, source: _source, context: _context, ...rest } = snapshot;
        snapshot = {
            ...rest,
            ...(next.type === undefined ? {} : { type: next.type }),
            ...(next.source === undefined ? {} : { source: next.source }),
            ...(next.context === undefined ? {} : { context: next.context }),
            deletedShown: next.deletedShown,
            scope: next.scope,
            filter,
        };
        if (changed) {
            readsAbort();
            nextPageCursor = null;
            snapshot = {
                ...snapshot,
                loading: true,
                artifacts: [],
                hasMore: false,
                loadingMore: false,
            };
            const { error: _error, ...clean } = snapshot;
            snapshot = clean;
        }
        for (const listener of listeners) listener();
        if (changed) reload();
    };

    const choices = (): Pick<
        HappyAgentArtifactCatalogSnapshot,
        "type" | "source" | "deletedShown" | "scope" | "context"
    > => ({
        ...(snapshot.type === undefined ? {} : { type: snapshot.type }),
        ...(snapshot.source === undefined ? {} : { source: snapshot.source }),
        ...(snapshot.context === undefined ? {} : { context: snapshot.context }),
        deletedShown: snapshot.deletedShown,
        scope: snapshot.scope,
    });

    const start = (): void => {
        if (disposed || following || listeners.size === 0) return;
        const active = new AbortController();
        following = active;
        void (async () => {
            for await (const input of deps.sync.follow({
                signal: active.signal,
                events: [...HAPPY_AGENT_ARTIFACT_EVENT_TYPES],
            })) {
                if (input.kind === "error") {
                    failed = true;
                    continue;
                }
                if (
                    input.kind === "bootstrap" ||
                    input.kind === "reconcile" ||
                    (input.kind === "update" && input.update.kind === "connected" && failed)
                ) {
                    reload();
                    continue;
                }
                if (input.kind !== "update" || input.update.kind !== "event") continue;
                const event = happyAgentArtifactEventProject(input.update.event);
                if (event === undefined) continue;
                if (readsInFlight > 0) journal.push(event);
                if (snapshot.loading || snapshot.availability !== "available") continue;
                const artifacts = eventsApply(snapshot.artifacts, [event], !snapshot.hasMore);
                if (artifacts === snapshot.artifacts) continue;
                if (event.type === "created")
                    deps.authorsSeen?.(happyAgentArtifactAuthors([event.artifact]));
                publish({ artifacts });
            }
        })()
            .catch(() => {
                failed = true;
            })
            .finally(() => {
                if (following === active) following = undefined;
                if (!active.signal.aborted && !disposed && listeners.size > 0)
                    retry = setTimeout(start, 1_000);
            });
    };

    const stop = (): void => {
        following?.abort();
        following = undefined;
        readsAbort();
        if (retry) clearTimeout(retry);
        retry = undefined;
    };

    /** Reads the next page of older artifacts, when there is one and none is being read. */
    const pageNext = (): void => {
        if (
            disposed ||
            following === undefined ||
            !snapshot.hasMore ||
            snapshot.loadingMore ||
            nextPageCursor === null
        )
            return;
        const filter = snapshot.filter;
        const pageCursor = nextPageCursor;
        const { signal, mark, end } = readBegin();
        publish({ loadingMore: true });
        void deps.client
            .listArtifacts({ ...queryOf(filter, pageLimit), pageCursor }, { signal })
            .then(
                (response) => {
                    if (signal.aborted) return;
                    nextPageCursor = response.nextPageCursor;
                    const complete = nextPageCursor === null;
                    const known = new Set(snapshot.artifacts.map((artifact) => artifact.id));
                    const page = response.artifacts
                        .map(happyAgentArtifactProject)
                        .filter((artifact) => !known.has(artifact.id));
                    const artifacts = eventsApply(
                        [...snapshot.artifacts, ...page],
                        journal.slice(mark),
                        complete,
                    );
                    deps.authorsSeen?.(happyAgentArtifactAuthors(page));
                    publish({ artifacts, hasMore: !complete, loadingMore: false });
                    pagesContinue();
                },
                (error: unknown) => {
                    if (signal.aborted) return;
                    publish({ loadingMore: false, error: happyAgentUserError(error) });
                },
            )
            .finally(end);
    };

    /** A catalog that reads every page asks for the next one as soon as a page lands. */
    const pagesContinue = (): void => {
        if (initial.pagesAll === true && snapshot.artifacts.length < PAGES_ALL_MAX) pageNext();
    };

    return {
        get: () => snapshot,
        subscribe(listener) {
            if (disposed) return () => undefined;
            listeners.add(listener);
            start();
            let released = false;
            return () => {
                if (released) return;
                released = true;
                listeners.delete(listener);
                if (listeners.size === 0) stop();
            };
        },
        filterTypeUpdate(type) {
            if (disposed || type === snapshot.type) return;
            const { type: _type, ...rest } = choices();
            filterChange(type === undefined ? rest : { ...rest, type });
        },
        filterSourceUpdate(source) {
            if (disposed) return;
            if (source?.kind === snapshot.source?.kind && source?.id === snapshot.source?.id)
                return;
            const { source: _source, ...rest } = choices();
            filterChange(source === undefined ? rest : { ...rest, source });
        },
        deletedShownUpdate(shown) {
            if (disposed || shown === snapshot.deletedShown) return;
            filterChange({ ...choices(), deletedShown: shown });
        },
        scopeUpdate(scope) {
            if (disposed || scope === snapshot.scope) return;
            filterChange({ ...choices(), scope });
        },
        pageNextLoad: pageNext,
        contextApply(context) {
            if (disposed || contextSame(context, snapshot.context)) return;
            const { context: _context, ...rest } = choices();
            filterChange(context === undefined ? rest : { ...rest, context });
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            stop();
            listeners.clear();
        },
    };
}
