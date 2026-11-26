import type {
    HappyAgentCheckout,
    HappyAgentCheckoutsSnapshot,
    HappyAgentCheckoutsStore,
} from "./happyAgentCheckoutsStore.js";

/**
 * Every checkout a task's agents work in: the task's own agent and each of its
 * subtasks, in the order the agents are given and each agent's checkouts by
 * folder. It is read from each agent's own checkouts, so a subtask the client
 * does not list yet is not in it.
 *
 * This is the one place that decides where a task's checkouts come from. A
 * server that lists the whole tree at once replaces the body of this file and
 * nothing else.
 *
 * It holds no resources of its own: subscribing to it subscribes to each
 * agent's store, which does its own reading, and unsubscribing lets them go.
 */
export function happyAgentTaskCheckoutsStoreCreate(deps: {
    /** The task's agent first, then its subtasks. */
    readonly agentIds: readonly string[];
    readonly checkouts: (agentId: string) => HappyAgentCheckoutsStore | undefined;
}): HappyAgentCheckoutsStore {
    const stores = deps.agentIds.flatMap((agentId) => {
        const store = deps.checkouts(agentId);
        return store ? [store] : [];
    });
    let sources: readonly HappyAgentCheckoutsSnapshot[] = [];
    let snapshot: HappyAgentCheckoutsSnapshot = { status: "loading", checkouts: [] };

    /** One snapshot for as long as no agent's own snapshot changed. */
    const get = (): HappyAgentCheckoutsSnapshot => {
        const next = stores.map((store) => store.get());
        if (next.length === sources.length && next.every((value, i) => value === sources[i]))
            return snapshot;
        sources = next;
        // Loading until every agent has answered once, so the sections do not
        // arrive one agent at a time under the reader.
        const status = next.some((value) => value.status === "loading")
            ? "loading"
            : next.length > 0 && next.every((value) => value.status === "unsupported")
              ? "unsupported"
              : "ready";
        const error = next.find((value) => value.error !== undefined)?.error;
        const checkouts: HappyAgentCheckout[] = next.flatMap((value) => value.checkouts);
        const unchanged =
            checkouts.length === snapshot.checkouts.length &&
            checkouts.every((checkout, i) => checkout === snapshot.checkouts[i]);
        snapshot = {
            status,
            ...(error === undefined ? {} : { error }),
            checkouts: unchanged ? snapshot.checkouts : checkouts,
        };
        return snapshot;
    };

    return {
        get,
        subscribe(listener) {
            const unsubscribes = stores.map((store) => store.subscribe(listener));
            return () => {
                for (const unsubscribe of unsubscribes) unsubscribe();
            };
        },
        // The agents' stores belong to the client, which disposes them.
        [Symbol.dispose]() {},
    };
}
