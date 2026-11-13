import { createStore } from "zustand/vanilla";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import type { UserError } from "../types.js";
import { happyAgentImageUrl } from "../utils/happyAgentImageUrl.js";
import {
    HappyCloudRequestRefusal,
    type HappyCloudRequest,
} from "./happyAgentProviderCredentials.js";
import { happyAgentUserError, referencesPreserve } from "./happyAgentSupport.js";

export type HappyAgentCheckoutAccess = "readWrite" | "readOnly";

/** The repository a checkout is of, as the team's repository list holds it. */
export interface HappyAgentCheckoutRepository {
    readonly id: string;
    readonly name: string;
    readonly url: string;
    /** The branch the repository's own host calls its default, when it says. */
    readonly defaultBranch: string | null;
    /** Its picture, painted from the ThumbHash until it loads; null without one. */
    readonly avatar: { readonly url: string; readonly thumbhash: string } | null;
}

/** What a checkout changed against its base, as Git counts it. */
export interface HappyAgentCheckoutChanges {
    readonly changedFiles: number;
    readonly insertions: number;
    readonly deletions: number;
    /** False when Git could not compare it, so zero counts do not claim a clean checkout. */
    readonly comparable: boolean;
}

/** One repository checked out into a cloud agent's workspace, and how that went. */
export interface HappyAgentCheckout {
    readonly id: string;
    /** Where it is, relative to the workspace root. */
    readonly folder: string;
    readonly repository: HappyAgentCheckoutRepository;
    readonly branch: string;
    /** What the agent may do with it: `readOnly` cannot push. */
    readonly access: HappyAgentCheckoutAccess;
    readonly status: "pending" | "ready" | "failed";
    /** The server's words for why a `failed` checkout failed. */
    readonly error: string | null;
    /** Null until Git has looked at it. */
    readonly changes: HappyAgentCheckoutChanges | null;
}

export interface HappyAgentCheckoutsSnapshot {
    /**
     * `unsupported` is a server without checkouts, where the agent's single
     * attached repository is read from the agent instead.
     */
    readonly status: "loading" | "ready" | "unsupported";
    /** Why the last read failed; what was read before stays. */
    readonly error?: UserError;
    /** By folder, as the server orders them. */
    readonly checkouts: readonly HappyAgentCheckout[];
}

/** One cloud agent's checkouts, read while something shows them and read again on each change. */
export interface HappyAgentCheckoutsStore {
    get(): HappyAgentCheckoutsSnapshot;
    subscribe(listener: () => void): () => void;
    [Symbol.dispose](): void;
}

const LOADING: HappyAgentCheckoutsSnapshot = { status: "loading", checkouts: [] };
const UNSUPPORTED: HappyAgentCheckoutsSnapshot = { status: "unsupported", checkouts: [] };
const RETRY_MS = 5_000;
const CHECKOUT_EVENTS = ["checkout.updated", "checkout.deleted"] as const;

function recordOf(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
}

function textOrNull(value: unknown): string | null {
    return typeof value === "string" && value !== "" ? value : null;
}

function count(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function accessRead(value: unknown): HappyAgentCheckoutAccess {
    return value === "read_only" ? "readOnly" : "readWrite";
}

/**
 * Reads one agent's checkouts from Happy Cloud. The route is the cluster's own
 * and not in the published client, so its JSON is checked here, at that
 * boundary, and carried typed from here on.
 */
export function happyAgentCheckoutsStoreCreate(deps: {
    readonly request: HappyCloudRequest;
    /** Where the server serves repository pictures from. */
    readonly endpoint: string;
    readonly sync: HappyAgentSync;
    readonly agentId: string;
}): HappyAgentCheckoutsStore {
    const store = createStore<HappyAgentCheckoutsSnapshot>()(() => LOADING);
    const listeners = new Set<() => void>();
    let disposed = false;
    let reading = false;
    let readAgain = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let follow: AbortController | undefined;

    const repositoryRead = (value: unknown): HappyAgentCheckoutRepository | undefined => {
        const repository = recordOf(value);
        const id = textOrNull(repository?.id);
        if (!repository || id === null) return undefined;
        const avatar = recordOf(repository.avatar);
        const digest = textOrNull(avatar?.digest);
        return {
            id,
            name: textOrNull(repository.name) ?? id,
            url: textOrNull(repository.url) ?? "",
            defaultBranch: textOrNull(repository.defaultBranch),
            avatar:
                digest === null
                    ? null
                    : {
                          url: happyAgentImageUrl(
                              deps.endpoint,
                              `/v0/repositories/${encodeURIComponent(id)}/avatar`,
                              digest,
                          ),
                          thumbhash: textOrNull(avatar?.thumbhash) ?? "",
                      },
        };
    };

    const checkoutRead = (value: unknown): HappyAgentCheckout | undefined => {
        const checkout = recordOf(value);
        const id = textOrNull(checkout?.id);
        const repository = repositoryRead(checkout?.repository);
        if (!checkout || id === null || !repository) return undefined;
        const changes = recordOf(checkout.changes);
        return {
            id,
            folder: textOrNull(checkout.folder) ?? "",
            repository,
            branch: textOrNull(checkout.branch) ?? "",
            access: accessRead(checkout.access),
            status:
                checkout.status === "ready" || checkout.status === "failed"
                    ? checkout.status
                    : "pending",
            error:
                checkout.status === "failed"
                    ? (textOrNull(recordOf(checkout.error)?.message) ??
                      "The repository could not be checked out.")
                    : null,
            changes: changes
                ? {
                      changedFiles: count(changes.changedFiles),
                      insertions: count(changes.insertions),
                      deletions: count(changes.deletions),
                      comparable: changes.comparison === "ready",
                  }
                : null,
        };
    };

    const read = async (): Promise<void> => {
        let answer: unknown;
        try {
            answer = await deps.request(
                "GET",
                `v0/agents/${encodeURIComponent(deps.agentId)}/checkouts`,
            );
        } catch (error) {
            // A server from before checkouts has no such route.
            if (error instanceof HappyCloudRequestRefusal && error.status === 404) {
                if (!disposed) store.setState(UNSUPPORTED, true);
                return;
            }
            throw error;
        }
        if (disposed) return;
        const current = store.getState();
        const checkouts: HappyAgentCheckout[] = [];
        const list = recordOf(answer)?.checkouts;
        for (const entry of Array.isArray(list) ? list : []) {
            const checkout = checkoutRead(entry);
            if (checkout) checkouts.push(checkout);
        }
        store.setState(
            { status: "ready", checkouts: referencesPreserve(current.checkouts, checkouts) },
            true,
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
                events: [...CHECKOUT_EVENTS],
            })) {
                const greeting = !greeted;
                greeted = true;
                // The first read was sent after this subscription was installed.
                if (input.kind === "error" || (greeting && input.kind !== "update")) continue;
                // The stream resumes after its last event on reconnect, so news of the connection
                // itself, which the follower also replays on subscribing, changes no checkout.
                if (
                    input.kind === "update" &&
                    input.update.kind !== "event" &&
                    input.update.kind !== "state_lost"
                )
                    continue;
                // Events are hints, any agent's included: the list is read again rather than patched.
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
