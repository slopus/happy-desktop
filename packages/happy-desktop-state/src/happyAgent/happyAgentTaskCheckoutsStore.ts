import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import type {
    HappyAgentCheckout,
    HappyAgentCheckoutsSnapshot,
    HappyAgentCheckoutsStore,
} from "./happyAgentCheckoutsStore.js";
import {
    HappyCloudRequestRefusal,
    type HappyCloudRequest,
} from "./happyAgentProviderCredentials.js";

const RETRY_MS = 5_000;
/** What can add an agent or a computer to a task's tree, as the server announces it. */
const TREE_EVENTS = ["checkout.updated", "checkout.deleted", "repository.updated"] as const;

/** What the server says about a task's tree: whose checkouts are in it, and on which computer. */
type Tree =
    | { readonly status: "loading" | "unsupported" }
    | {
          readonly status: "ready";
          /** Every agent with a checkout in the tree, in the server's order. */
          readonly agentIds: readonly string[];
          /** The computer each checkout was made on, by checkout. */
          readonly computers: ReadonlyMap<string, string>;
      };

function recordOf(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
}

function textOf(value: unknown): string | undefined {
    return typeof value === "string" && value !== "" ? value : undefined;
}

/** `GET /v0/agents/:id/repositories`, checked here at the cluster's boundary. */
function treeRead(answer: unknown): Tree {
    const agentIds: string[] = [];
    const computers = new Map<string, string>();
    const repositories = recordOf(answer)?.repositories;
    for (const repository of Array.isArray(repositories) ? repositories : []) {
        const checkouts = recordOf(repository)?.checkouts;
        for (const entry of Array.isArray(checkouts) ? checkouts : []) {
            const checkout = recordOf(entry);
            const agentId = textOf(checkout?.agentId);
            if (agentId !== undefined && !agentIds.includes(agentId)) agentIds.push(agentId);
            const checkoutId = textOf(checkout?.checkoutId);
            const computer = textOf(recordOf(checkout?.computer)?.name);
            if (checkoutId !== undefined && computer !== undefined)
                computers.set(checkoutId, computer);
        }
    }
    return { status: "ready", agentIds, computers };
}

/**
 * Every checkout a task's agents work in: the task's own agent and each of its
 * subtasks, the task's agent first, each agent's checkouts by folder, and each
 * checkout with the computer it is on where the server says.
 *
 * The server lists the whole tree at `GET /v0/agents/:id/repositories`, read
 * again whenever a checkout or repository changes; each agent's own
 * checkouts, read from its own store, carry what they changed. A server
 * without that route answers 404, and then the agents the client already
 * knows of are read instead, with no computer named.
 *
 * This is the one place that decides where a task's checkouts come from.
 */
export function happyAgentTaskCheckoutsStoreCreate(deps: {
    readonly request: HappyCloudRequest;
    readonly sync: HappyAgentSync;
    /** The task's agent first, then the subtasks the client lists under it. */
    readonly agentIds: readonly string[];
    readonly checkouts: (agentId: string) => HappyAgentCheckoutsStore | undefined;
}): HappyAgentCheckoutsStore {
    const root = deps.agentIds[0];
    const listeners = new Set<() => void>();
    /** The agents' stores this store is subscribed to, while anything is subscribed to it. */
    const agentSubscriptions = new Map<string, () => void>();
    /** Each checkout with its computer named, kept so an unchanged one keeps its identity. */
    const named = new WeakMap<HappyAgentCheckout, HappyAgentCheckout>();
    let tree: Tree = { status: "loading" };
    let disposed = false;
    let reading = false;
    let readAgain = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let follow: AbortController | undefined;
    let sources: readonly HappyAgentCheckoutsSnapshot[] = [];
    let sourceTree: Tree = tree;
    let snapshot: HappyAgentCheckoutsSnapshot = { status: "loading", checkouts: [] };

    const notify = (): void => {
        for (const listener of listeners) listener();
    };

    /** The agents read now: the tree's once the server named it, with the task's own first. */
    const agentIdsNow = (): readonly string[] =>
        tree.status === "ready" && root !== undefined
            ? [root, ...tree.agentIds.filter((agentId) => agentId !== root)]
            : deps.agentIds;

    const stores = (): readonly HappyAgentCheckoutsStore[] =>
        agentIdsNow().flatMap((agentId) => {
            const store = deps.checkouts(agentId);
            return store ? [store] : [];
        });

    /** Follows exactly the agents read now, and none once nothing follows this store. */
    const agentsFollow = (): void => {
        const wanted = new Set(listeners.size === 0 ? [] : agentIdsNow());
        for (const [agentId, unsubscribe] of agentSubscriptions)
            if (!wanted.has(agentId)) {
                unsubscribe();
                agentSubscriptions.delete(agentId);
            }
        for (const agentId of wanted) {
            if (agentSubscriptions.has(agentId)) continue;
            const store = deps.checkouts(agentId);
            if (store) agentSubscriptions.set(agentId, store.subscribe(notify));
        }
    };

    const computerName = (checkout: HappyAgentCheckout): HappyAgentCheckout => {
        const computer = tree.status === "ready" ? tree.computers.get(checkout.id) : undefined;
        if (computer === undefined || computer === checkout.computer) return checkout;
        const known = named.get(checkout);
        if (known?.computer === computer) return known;
        const next = { ...checkout, computer };
        named.set(checkout, next);
        return next;
    };

    /** One snapshot for as long as neither the tree nor any agent's own snapshot changed. */
    const get = (): HappyAgentCheckoutsSnapshot => {
        const next = stores().map((store) => store.get());
        if (
            sourceTree === tree &&
            next.length === sources.length &&
            next.every((value, i) => value === sources[i])
        )
            return snapshot;
        sources = next;
        sourceTree = tree;
        // Loading until every agent has answered once, so the sections do not
        // arrive one agent at a time under the reader.
        const status = next.some((value) => value.status === "loading")
            ? "loading"
            : next.length > 0 && next.every((value) => value.status === "unsupported")
              ? "unsupported"
              : "ready";
        const error = next.find((value) => value.error !== undefined)?.error;
        const checkouts = next.flatMap((value) => value.checkouts.map(computerName));
        const previous = snapshot.checkouts;
        const unchanged =
            checkouts.length === previous.length &&
            checkouts.every((checkout, i) => checkout === previous[i]);
        snapshot = {
            status,
            ...(error === undefined ? {} : { error }),
            checkouts: unchanged ? previous : checkouts,
        };
        return snapshot;
    };

    const treeSet = (next: Tree): void => {
        tree = next;
        agentsFollow();
        notify();
    };

    const read = async (): Promise<void> => {
        if (root === undefined) {
            treeSet({ status: "unsupported" });
            return;
        }
        let answer: unknown;
        try {
            answer = await deps.request(
                "GET",
                `v0/agents/${encodeURIComponent(root)}/repositories`,
            );
        } catch (error) {
            // A server from before task-wide repositories has no such route.
            if (error instanceof HappyCloudRequestRefusal && error.status === 404) {
                if (!disposed) treeSet({ status: "unsupported" });
                return;
            }
            throw error;
        }
        if (!disposed) treeSet(treeRead(answer));
    };

    /** `hint` is news that may postdate a read in flight. */
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
            .catch(() => {
                // The agents already known stay listed while the tree is asked again.
                if (disposed) return;
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
                events: [...TREE_EVENTS],
            })) {
                const greeting = !greeted;
                greeted = true;
                // The first read was sent after this subscription was installed.
                if (input.kind === "error" || (greeting && input.kind !== "update")) continue;
                if (
                    input.kind === "update" &&
                    input.update.kind !== "event" &&
                    input.update.kind !== "state_lost"
                )
                    continue;
                // Events are hints: the tree is read again rather than patched.
                load();
            }
        })().catch(() => undefined);
    };

    const stop = (): void => {
        follow?.abort();
        follow = undefined;
        if (retry !== undefined) clearTimeout(retry);
        retry = undefined;
        agentsFollow();
    };

    return {
        get,
        subscribe(listener) {
            if (disposed) return () => undefined;
            listeners.add(listener);
            if (listeners.size === 1) {
                agentsFollow();
                followStart();
                // Subscribing during React's commit never publishes synchronously.
                queueMicrotask(() => load(false));
            }
            return () => {
                listeners.delete(listener);
                if (listeners.size === 0) stop();
            };
        },
        // The agents' stores belong to the client, which disposes them.
        [Symbol.dispose]() {
            disposed = true;
            listeners.clear();
            stop();
        },
    };
}
