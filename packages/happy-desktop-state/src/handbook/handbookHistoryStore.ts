import { createStore } from "zustand/vanilla";
import type { Loadable } from "../conversation/loadable.js";
import type { HappyCloudRequest } from "../happyAgent/happyAgentProviderCredentials.js";
import { happyAgentUserError } from "../happyAgent/happyAgentSupport.js";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { cuid2Create } from "../utils/cuid2Create.js";
import {
    handbookComparisonRead,
    handbookPath,
    handbookRevisionRead,
    handbookSessionRead,
    handbookStatus,
    listOf,
    recordOf,
} from "./handbookRead.js";
import type {
    HappyAgentHandbookComparison,
    HappyAgentHandbookHistoryEntry,
    HappyAgentHandbookHistorySnapshot,
    HappyAgentHandbookHistoryStore,
    HappyAgentHandbookItemId,
    HappyAgentHandbookRevision,
    HappyAgentHandbookSession,
} from "./handbookTypes.js";

/**
 * How often an open history reads its newest sessions again. A session grows
 * with every batch of typing, which reaches no journal event, so the panel
 * polls while it is on screen and stops the moment it is not.
 */
const HISTORY_POLL_MS = 5_000;
const SESSIONS_PAGE = 50;
/** Revisions page oldest first; an item with more than this many shows the newest pages. */
const REVISION_PAGES_MAX = 20;
const REVISIONS_PAGE = 200;

const EXPANDED_NONE: ReadonlyMap<string, Loadable<HappyAgentHandbookComparison>> = new Map();

export interface HappyAgentHandbookHistoryDeps {
    readonly request: HappyCloudRequest;
    readonly sync: HappyAgentSync;
    readonly itemId: HappyAgentHandbookItemId;
    readonly now?: () => number;
}

const revisionKey = (revision: number): string => `r:${String(revision)}`;
const sessionKey = (session: HappyAgentHandbookSession): string =>
    `s:${String(session.fromSeq)}-${String(session.toSeq)}`;

/**
 * Applied revisions and edit sessions as one timeline, newest first. A
 * revision stands above the session that ends at its seq, which is the edit
 * it published. While older sessions remain unread, only revisions within
 * the sessions read so far are placed, so nothing is shown out of order.
 */
function entriesOf(
    revisions: readonly HappyAgentHandbookRevision[],
    sessions: readonly HappyAgentHandbookSession[],
    more: boolean,
): HappyAgentHandbookHistoryEntry[] {
    const oldest = sessions.at(-1)?.fromSeq;
    const shown =
        more && oldest !== undefined ? revisions.filter((r) => r.seq >= oldest) : revisions;
    const entries: {
        readonly at: number;
        readonly rank: number;
        readonly entry: HappyAgentHandbookHistoryEntry;
    }[] = [
        ...shown.map((revision) => ({
            at: revision.seq,
            rank: 1,
            entry: { kind: "revision" as const, key: revisionKey(revision.revision), revision },
        })),
        ...sessions.map((session) => ({
            at: session.toSeq,
            rank: 0,
            entry: { kind: "session" as const, key: sessionKey(session), session },
        })),
    ];
    entries.sort((left, right) => right.at - left.at || right.rank - left.rank);
    return entries.map(({ entry }) => entry);
}

/**
 * One item's history: what was applied, and who edited what in between.
 *
 * The first subscriber reads the item's revisions and newest sessions; they
 * are read again on every handbook event for the item and, while watched,
 * every few seconds. Opening an entry reads its text before and after,
 * which the panel compares; restoring one writes its version into the draft as a new
 * change, under one mutation ID however many times it is tried.
 */
export function happyAgentHandbookHistoryStoreCreate(
    deps: HappyAgentHandbookHistoryDeps,
): HappyAgentHandbookHistoryStore {
    const itemId = deps.itemId;
    const idCreate = cuid2Create(deps.now ?? Date.now);
    const store = createStore<HappyAgentHandbookHistorySnapshot>()(() => ({
        itemId,
        status: "loading",
        entries: [],
        more: false,
        loadingMore: false,
        expanded: EXPANDED_NONE,
    }));
    const listeners = new Set<() => void>();
    let disposed = false;
    let revisions: readonly HappyAgentHandbookRevision[] = [];
    let sessions: readonly HappyAgentHandbookSession[] = [];
    let nextBeforeSeq: number | null = null;
    let reading: AbortController | undefined;
    let readAgain = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let follow: AbortController | undefined;
    /** A restore being tried, kept whole so a retry repeats its mutation ID. */
    let restore: { readonly key: string; readonly mutationId: string } | undefined;

    const publishEntries = (): void => {
        const more = nextBeforeSeq !== null;
        store.setState({ entries: entriesOf(revisions, sessions, more), more }, false);
    };

    const revisionsRead = async (signal: AbortSignal): Promise<HappyAgentHandbookRevision[]> => {
        const read: HappyAgentHandbookRevision[] = [];
        let after: number | null = null;
        for (let page = 0; page < REVISION_PAGES_MAX && !signal.aborted; page += 1) {
            const answer = recordOf(
                await deps.request(
                    "GET",
                    handbookPath(
                        itemId,
                        `/revisions?limit=${String(REVISIONS_PAGE)}${after === null ? "" : `&afterRevision=${String(after)}`}`,
                    ),
                ),
            );
            for (const entry of listOf(answer?.revisions)) {
                const revision = handbookRevisionRead(entry);
                if (revision) read.push(revision);
            }
            const next = answer?.nextAfterRevision;
            if (typeof next !== "number") break;
            after = next;
        }
        return read;
    };

    const sessionsRead = async (
        beforeSeq: number | null,
    ): Promise<{ sessions: HappyAgentHandbookSession[]; nextBeforeSeq: number | null }> => {
        const answer = recordOf(
            await deps.request(
                "GET",
                handbookPath(
                    itemId,
                    `/sessions?limit=${String(SESSIONS_PAGE)}${beforeSeq === null ? "" : `&beforeSeq=${String(beforeSeq)}`}`,
                ),
            ),
        );
        return {
            sessions: listOf(answer?.sessions).flatMap((entry) => {
                const session = handbookSessionRead(entry);
                return session ? [session] : [];
            }),
            nextBeforeSeq: typeof answer?.nextBeforeSeq === "number" ? answer.nextBeforeSeq : null,
        };
    };

    const schedule = (): void => {
        if (disposed || listeners.size === 0 || timer !== undefined) return;
        timer = setTimeout(() => {
            timer = undefined;
            load();
        }, HISTORY_POLL_MS);
    };

    /** Reads the revisions and the newest sessions; older pages read already are kept. */
    function load(): void {
        if (disposed || listeners.size === 0) return;
        if (reading) {
            readAgain = true;
            return;
        }
        const active = new AbortController();
        reading = active;
        readAgain = false;
        void (async () => {
            const [readRevisions, newest] = await Promise.all([
                revisionsRead(active.signal),
                sessionsRead(null),
            ]);
            if (active.signal.aborted || disposed) return;
            revisions = readRevisions;
            const boundary = newest.sessions.at(-1)?.fromSeq;
            // The newest page is current; what was read further back stays.
            const older =
                boundary === undefined || newest.nextBeforeSeq === null
                    ? []
                    : sessions.filter((session) => session.toSeq < boundary);
            sessions = [...newest.sessions, ...older];
            if (older.length === 0) nextBeforeSeq = newest.nextBeforeSeq;
            const { error: _cleared, ...rest } = store.getState();
            store.setState({ ...rest, status: "ready" }, true);
            publishEntries();
        })()
            .catch((error: unknown) => {
                if (active.signal.aborted || disposed) return;
                store.setState({ status: "ready", error: happyAgentUserError(error) }, false);
            })
            .finally(() => {
                if (reading === active) reading = undefined;
                if (readAgain) load();
                else schedule();
            });
    }

    const followStart = (): void => {
        if (follow || disposed) return;
        const active = new AbortController();
        follow = active;
        void (async () => {
            for await (const input of deps.sync.follow({
                signal: active.signal,
                events: ["handbook.updated", "handbook.applied", "handbook.removed"],
            })) {
                if (input.kind === "error") continue;
                load();
            }
        })().catch(() => undefined);
    };

    const stop = (): void => {
        follow?.abort();
        follow = undefined;
        reading?.abort();
        reading = undefined;
        if (timer) clearTimeout(timer);
        timer = undefined;
    };

    const entryOf = (key: string): HappyAgentHandbookHistoryEntry | undefined =>
        store.getState().entries.find((entry) => entry.key === key);

    const expandedSet = (
        key: string,
        value: Loadable<HappyAgentHandbookComparison> | undefined,
    ): void => {
        const expanded = new Map(store.getState().expanded);
        if (value === undefined) expanded.delete(key);
        else expanded.set(key, value);
        store.setState({ expanded }, false);
    };

    /**
     * The text an entry changed, read only once it is opened: a session from
     * just before it began to its last change, a revision from the one before
     * it (nothing, for the first).
     */
    const comparisonRead = (entry: HappyAgentHandbookHistoryEntry) =>
        entry.kind === "session"
            ? handbookComparisonRead(
                  deps.request,
                  itemId,
                  { seq: entry.session.fromSeq - 1 },
                  { seq: entry.session.toSeq },
              )
            : handbookComparisonRead(
                  deps.request,
                  itemId,
                  entry.revision.revision > 1
                      ? { revision: entry.revision.revision - 1 }
                      : { seq: 0 },
                  { revision: entry.revision.revision },
              );

    return {
        get: () => store.getState(),
        subscribe(listener) {
            if (disposed) return () => undefined;
            listeners.add(listener);
            const unsubscribe = store.subscribe(listener);
            if (listeners.size === 1) {
                followStart();
                load();
            }
            let released = false;
            return () => {
                if (released) return;
                released = true;
                unsubscribe();
                listeners.delete(listener);
                if (listeners.size === 0) stop();
            };
        },
        sessionsMore() {
            const state = store.getState();
            if (disposed || state.loadingMore || nextBeforeSeq === null) return;
            const before = nextBeforeSeq;
            store.setState({ loadingMore: true }, false);
            void sessionsRead(before).then(
                (page) => {
                    if (disposed) return;
                    const seen = new Set(sessions.map(sessionKey));
                    sessions = [
                        ...sessions,
                        ...page.sessions.filter((s) => !seen.has(sessionKey(s))),
                    ];
                    nextBeforeSeq = page.nextBeforeSeq;
                    store.setState({ loadingMore: false }, false);
                    publishEntries();
                },
                (error: unknown) => {
                    if (!disposed)
                        store.setState(
                            { loadingMore: false, error: happyAgentUserError(error) },
                            false,
                        );
                },
            );
        },
        entryToggle(key) {
            if (disposed) return;
            if (store.getState().expanded.has(key)) {
                expandedSet(key, undefined);
                return;
            }
            const entry = entryOf(key);
            if (!entry) return;
            expandedSet(key, { type: "loading" });
            void comparisonRead(entry).then(
                (comparison) => {
                    if (disposed || !store.getState().expanded.has(key)) return;
                    expandedSet(key, { type: "ready", value: comparison });
                },
                (error: unknown) => {
                    if (disposed || !store.getState().expanded.has(key)) return;
                    expandedSet(key, { type: "error", error: happyAgentUserError(error) });
                },
            );
        },
        entryRestore(key) {
            const state = store.getState();
            if (disposed || state.restoring !== undefined) return;
            const entry = entryOf(key);
            if (!entry) return;
            if (restore?.key !== key) restore = { key, mutationId: idCreate() };
            const mutationId = restore.mutationId;
            const { restoreError: _cleared, ...rest } = state;
            store.setState({ ...rest, restoring: key }, true);
            void deps
                .request(
                    "POST",
                    handbookPath(itemId, "/restore"),
                    entry.kind === "revision"
                        ? { revision: entry.revision.revision, mutationId }
                        : { seq: entry.session.toSeq, mutationId },
                )
                .then(
                    () => {
                        if (disposed) return;
                        restore = undefined;
                        const { restoring: _done, ...after } = store.getState();
                        store.setState(after, true);
                        load();
                    },
                    (error: unknown) => {
                        if (disposed) return;
                        // A refusal was an answer; trying again is a new restore.
                        if (handbookStatus(error) !== undefined) restore = undefined;
                        const { restoring: _done, ...after } = store.getState();
                        store.setState(
                            { ...after, restoreError: happyAgentUserError(error) },
                            true,
                        );
                    },
                );
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            stop();
            listeners.clear();
        },
    };
}
