import { createStore } from "zustand/vanilla";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import type { UserError } from "../types.js";
import { happyAgentImageUrl } from "../utils/happyAgentImageUrl.js";
import {
    HappyCloudRequestRefusal,
    type HappyCloudRequest,
} from "./happyAgentProviderCredentials.js";
import { deepEqual, happyAgentUserError } from "./happyAgentSupport.js";
import type { HappyAgentTaskId } from "./happyAgentTypes.js";

/** One place a task's agent, or one of its subtasks, checked a repository out. */
export interface HappyAgentTaskRepositoryCheckout {
    readonly id: string;
    /** The agent in the task's tree that holds it. */
    readonly agentId: string;
    /** Where it is, relative to that agent's workspace root. */
    readonly folder: string;
    readonly branch: string;
    readonly status: "pending" | "ready" | "failed";
    /** That agent is scoped to this checkout alone. */
    readonly scoped: boolean;
    /** The computer it is on; null until one is attached. */
    readonly computer: { readonly id: string; readonly name: string } | null;
    /**
     * What it changed against the commit it started from, as its last scan
     * counted it; null before a scan, or when Git could not compare it.
     */
    readonly changes: HappyAgentTaskRepositoryChanges | null;
}

/** A checkout's line totals against the commit it started from. */
export interface HappyAgentTaskRepositoryChanges {
    readonly changedFiles: number;
    readonly insertions: number;
    readonly deletions: number;
}

/** One of the team's repositories, as a task works in it. */
export interface HappyAgentTaskRepository {
    readonly id: string;
    /** The name the team gave it. */
    readonly name: string;
    /** `owner/name` on its host, which tells apart two repositories named alike. */
    readonly path: string;
    /** Its photo, painted from the ThumbHash until it loads; null without one. */
    readonly avatar: { readonly url: string; readonly thumbhash: string } | null;
    /** In the order they were made. */
    readonly checkouts: readonly HappyAgentTaskRepositoryCheckout[];
}

/** A repository's name and photo as the server last answered for it. */
export interface HappyAgentRepositoryLook {
    readonly name: string;
    readonly avatar: { readonly url: string; readonly thumbhash: string } | null;
}

export interface HappyAgentTaskRepositoriesSnapshot {
    /** `unsupported` is a server without the route, where no task shows repositories. */
    readonly status: "loading" | "ready" | "unsupported";
    /** Why the last read failed; what was read before stays. */
    readonly error?: UserError;
    /**
     * Each joined task's repositories across its whole subtask tree, first
     * checked out first. A task working in none is absent.
     */
    readonly tasks: ReadonlyMap<HappyAgentTaskId, readonly HappyAgentTaskRepository[]>;
    /**
     * Repositories changed since this store started following, read again from
     * the server by id: their current name and photo, or `null` once deleted.
     * An agent's `scope` carries the name and photo it was read with and is not
     * sent again when they change, so a scoped agent outside every joined task
     * (a bot's subtask) takes them from here.
     */
    readonly changed: ReadonlyMap<string, HappyAgentRepositoryLook | null>;
}

/** The repositories of every task the reader has joined, read while something shows them. */
export interface HappyAgentTaskRepositoriesStore {
    get(): HappyAgentTaskRepositoriesSnapshot;
    subscribe(listener: () => void): () => void;
    [Symbol.dispose](): void;
}

const NONE: ReadonlyMap<HappyAgentTaskId, readonly HappyAgentTaskRepository[]> = new Map();
const UNCHANGED: ReadonlyMap<string, HappyAgentRepositoryLook | null> = new Map();
const LOADING: HappyAgentTaskRepositoriesSnapshot = {
    status: "loading",
    tasks: NONE,
    changed: UNCHANGED,
};
const RETRY_MS = 5_000;
/** What can change which repositories a task is in, or how one looks. */
const EVENTS = [
    "checkout.updated",
    "checkout.deleted",
    "repository.updated",
    "repository.deleted",
    "task.created",
    "task.joined",
] as const;

function recordOf(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
}

function textOrNull(value: unknown): string | null {
    return typeof value === "string" && value !== "" ? value : null;
}

function arrayOf(value: unknown): readonly unknown[] {
    return Array.isArray(value) ? value : [];
}

function count(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function changesRead(value: unknown): HappyAgentTaskRepositoryChanges | null {
    const changes = recordOf(value);
    return changes
        ? {
              changedFiles: count(changes.changedFiles),
              insertions: count(changes.insertions),
              deletions: count(changes.deletions),
          }
        : null;
}

function checkoutRead(value: unknown): HappyAgentTaskRepositoryCheckout | undefined {
    const checkout = recordOf(value);
    const id = textOrNull(checkout?.checkoutId);
    const agentId = textOrNull(checkout?.agentId);
    if (!checkout || id === null || agentId === null) return undefined;
    const computer = recordOf(checkout.computer);
    const computerId = textOrNull(computer?.id);
    return {
        id,
        agentId,
        folder: textOrNull(checkout.folder) ?? "",
        branch: textOrNull(checkout.branch) ?? "",
        status:
            checkout.status === "ready" || checkout.status === "failed"
                ? checkout.status
                : "pending",
        scoped: checkout.scoped === true,
        computer:
            computerId === null
                ? null
                : { id: computerId, name: textOrNull(computer?.name) ?? computerId },
        changes: changesRead(checkout.changes),
    };
}

/**
 * Reads the repositories of every task the reader has joined from Happy Cloud.
 * The route is the cluster's own and not in the published client, so its JSON
 * is checked here, at that boundary, and carried typed from here on. The list
 * is read again on each event that can change it rather than patched.
 */
export function happyAgentTaskRepositoriesStoreCreate(deps: {
    readonly request: HappyCloudRequest;
    /** Where the server serves repository pictures from. */
    readonly endpoint: string;
    readonly sync: HappyAgentSync;
}): HappyAgentTaskRepositoriesStore {
    const store = createStore<HappyAgentTaskRepositoriesSnapshot>()(() => LOADING);
    const listeners = new Set<() => void>();
    let disposed = false;
    let reading = false;
    let readAgain = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let follow: AbortController | undefined;

    const avatarRead = (
        id: string,
        value: unknown,
    ): { readonly url: string; readonly thumbhash: string } | null => {
        const thumbhash = textOrNull(recordOf(value)?.thumbhash);
        return thumbhash === null
            ? null
            : {
                  url: happyAgentImageUrl(
                      deps.endpoint,
                      `/v0/repositories/${encodeURIComponent(id)}/avatar`,
                      thumbhash,
                  ),
                  thumbhash,
              };
    };

    const repositoryRead = (value: unknown): HappyAgentTaskRepository | undefined => {
        const repository = recordOf(value);
        const id = textOrNull(repository?.repositoryId);
        if (!repository || id === null) return undefined;
        const checkouts: HappyAgentTaskRepositoryCheckout[] = [];
        for (const entry of arrayOf(repository.checkouts)) {
            const checkout = checkoutRead(entry);
            if (checkout) checkouts.push(checkout);
        }
        return {
            id,
            name: textOrNull(repository.name) ?? id,
            path: textOrNull(repository.path) ?? "",
            avatar: avatarRead(id, repository.avatar),
            checkouts,
        };
    };

    const read = async (): Promise<void> => {
        let answer: unknown;
        try {
            answer = await deps.request("GET", "v0/tasks/repositories");
        } catch (error) {
            // A server from before task repositories has no such route.
            if (error instanceof HappyCloudRequestRefusal && error.status === 404) {
                if (!disposed)
                    store.setState({ status: "unsupported", tasks: NONE, changed: UNCHANGED });
                return;
            }
            throw error;
        }
        if (disposed) return;
        const previous = store.getState().tasks;
        const tasks = new Map<HappyAgentTaskId, readonly HappyAgentTaskRepository[]>();
        let changed = false;
        for (const entry of arrayOf(recordOf(answer)?.tasks)) {
            const task = recordOf(entry);
            const taskId = textOrNull(task?.taskId) as HappyAgentTaskId | null;
            if (taskId === null) continue;
            const repositories: HappyAgentTaskRepository[] = [];
            for (const value of arrayOf(task?.repositories)) {
                const repository = repositoryRead(value);
                if (repository) repositories.push(repository);
            }
            if (repositories.length === 0) continue;
            // An unchanged task keeps its list, so its row is not drawn again.
            const before = previous.get(taskId);
            if (before !== undefined && deepEqual(before, repositories)) {
                tasks.set(taskId, before);
                continue;
            }
            tasks.set(taskId, repositories);
            changed = true;
        }
        store.setState({
            status: "ready",
            tasks: changed || tasks.size !== previous.size ? tasks : previous,
        });
    };

    const lookSet = (id: string, look: HappyAgentRepositoryLook | null): void => {
        const changed = store.getState().changed;
        const before = changed.get(id);
        if (before !== undefined && deepEqual(before, look)) return;
        store.setState({ changed: new Map(changed).set(id, look) });
    };

    /**
     * Reads one changed repository again. The event only says it changed; what
     * it is now is the server's answer, and one that is gone answers 404.
     */
    const repositoryLookRead = (id: string): void => {
        void deps.request("GET", `v0/repositories/${encodeURIComponent(id)}`).then(
            (answer) => {
                if (disposed) return;
                const record = recordOf(answer);
                const repository = recordOf(record?.repository) ?? record;
                lookSet(id, {
                    name: textOrNull(repository?.name) ?? id,
                    avatar: avatarRead(id, repository?.avatar),
                });
            },
            (error: unknown) => {
                if (disposed) return;
                if (error instanceof HappyCloudRequestRefusal && error.status === 404)
                    lookSet(id, null);
            },
        );
    };

    /** `hint` is news that may postdate a read in flight; a new subscriber's read joins that read. */
    function load(hint = true): void {
        if (disposed || listeners.size === 0) return;
        if (reading) {
            if (hint) readAgain = true;
            return;
        }
        if (retry !== undefined) clearTimeout(retry);
        retry = undefined;
        reading = true;
        readAgain = false;
        void read()
            .catch((error: unknown) => {
                if (disposed) return;
                store.setState({ error: happyAgentUserError(error) });
                retry ??= setTimeout(() => {
                    retry = undefined;
                    load();
                }, RETRY_MS);
            })
            .finally(() => {
                reading = false;
                if (readAgain) load();
            });
    }

    const followStart = (): void => {
        if (follow || disposed) return;
        const active = new AbortController();
        follow = active;
        void (async () => {
            let greeted = false;
            for await (const input of deps.sync.follow({
                signal: active.signal,
                events: [...EVENTS],
            })) {
                const greeting = !greeted;
                greeted = true;
                // The first read was sent after this subscription was installed.
                if (input.kind === "error" || (greeting && input.kind !== "update")) continue;
                // News of the connection itself, which the follower replays on
                // subscribing, changes no repository.
                if (
                    input.kind === "update" &&
                    input.update.kind !== "event" &&
                    input.update.kind !== "state_lost"
                )
                    continue;
                // The published client does not name these events; their payload is read here.
                if (input.kind === "update" && input.update.kind === "event") {
                    const event = input.update.event as {
                        readonly type: string;
                        readonly payload: unknown;
                    };
                    const repositoryId = textOrNull(recordOf(event.payload)?.repositoryId);
                    if (event.type === "repository.updated" && repositoryId !== null)
                        repositoryLookRead(repositoryId);
                    if (event.type === "repository.deleted" && repositoryId !== null)
                        lookSet(repositoryId, null);
                }
                load();
            }
        })().catch(() => undefined);
    };

    return {
        get: () => store.getState(),
        subscribe(listener) {
            if (disposed) return () => undefined;
            listeners.add(listener);
            const unsubscribe = store.subscribe(listener);
            if (listeners.size === 1) {
                followStart();
                // Subscribing during React's commit never publishes synchronously.
                queueMicrotask(() => load(false));
            }
            return () => {
                unsubscribe();
                listeners.delete(listener);
                if (listeners.size > 0) return;
                follow?.abort();
                follow = undefined;
                if (retry !== undefined) clearTimeout(retry);
                retry = undefined;
            };
        },
        [Symbol.dispose]() {
            disposed = true;
            follow?.abort();
            follow = undefined;
            if (retry !== undefined) clearTimeout(retry);
            retry = undefined;
            listeners.clear();
        },
    };
}
