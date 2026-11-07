import { createStore } from "zustand/vanilla";
import { UserError } from "../types.js";
import type { HappyCloudRequest } from "./happyAgentProviderCredentials.js";
import { happyAgentUserError } from "./happyAgentSupport.js";

/** A compute a person may attach: a pool, or one machine of it. */
export type HappyAgentComputeTarget =
    | { readonly kind: "pool"; readonly poolId: string }
    | { readonly kind: "runner"; readonly runnerId: string };

/** One machine of a pool, as the picker lists it. */
export interface HappyAgentComputeRunner {
    readonly target: HappyAgentComputeTarget & { readonly kind: "runner" };
    readonly hostname: string;
    readonly status: "connected" | "disconnected" | "draining";
}

/** One pool the reader may use, with its machines. */
export interface HappyAgentComputePool {
    readonly target: HappyAgentComputeTarget & { readonly kind: "pool" };
    readonly name: string;
    /** The team's suggestion; never attached on its own. */
    readonly default: boolean;
    readonly online: boolean;
    readonly runners: readonly HappyAgentComputeRunner[];
}

export interface HappyAgentComputesSnapshot {
    /** True while the list is being read for an open picker. */
    readonly loading: boolean;
    readonly pools: readonly HappyAgentComputePool[];
    /** Whether the reader may attach or switch a compute (`compute.use`). */
    readonly attachAllowed: boolean;
    /** Whether the reader may detach one (`content.write`). */
    readonly detachAllowed: boolean;
    /** Agents whose attach or detach the server hasn't answered. */
    readonly saving: ReadonlySet<string>;
    /** Why the list could not be read. */
    readonly error?: UserError;
    /** Why the last attach or detach was refused; cleared by the next. */
    readonly saveError?: UserError;
}

/**
 * The computes a person may attach to a Happy Cloud conversation, read when
 * the chip's picker opens, and the attach and detach it sends. The chip's
 * own state comes from the agent, which the server updates after either.
 */
export interface HappyAgentComputesStore {
    get(): HappyAgentComputesSnapshot;
    subscribe(listener: () => void): () => void;
    /** Reads what this agent may attach, and the reader's permissions, for a picker opening. */
    listRead(agentId: string): void;
    computeAttach(agentId: string, target: HappyAgentComputeTarget): void;
    computeDetach(agentId: string): void;
    [Symbol.dispose](): void;
}

const NO_SAVING: ReadonlySet<string> = new Set();

function recordOf(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null
        ? (value as Record<string, unknown>)
        : undefined;
}

function targetOf(value: unknown): HappyAgentComputeTarget | undefined {
    const compute = recordOf(value);
    if (compute?.type === "pool" && typeof compute.poolId === "string")
        return { kind: "pool", poolId: compute.poolId };
    if (compute?.type === "runner" && typeof compute.runnerId === "string")
        return { kind: "runner", runnerId: compute.runnerId };
    return undefined;
}

function wireOf(target: HappyAgentComputeTarget): unknown {
    return target.kind === "pool"
        ? { type: "pool", poolId: target.poolId }
        : { type: "runner", runnerId: target.runnerId };
}

function poolsRead(answer: unknown): readonly HappyAgentComputePool[] {
    const computes = recordOf(answer)?.computes;
    if (!Array.isArray(computes)) return [];
    return computes.flatMap((entry: unknown): HappyAgentComputePool[] => {
        const pool = recordOf(entry);
        const target = targetOf(pool?.compute);
        if (!pool || target?.kind !== "pool") return [];
        const runners = Array.isArray(pool.runners) ? pool.runners : [];
        return [
            {
                target,
                name: typeof pool.name === "string" ? pool.name : target.poolId,
                default: pool.default === true,
                online: pool.online === true,
                runners: runners.flatMap((value: unknown): HappyAgentComputeRunner[] => {
                    const runner = recordOf(value);
                    const runnerTarget = targetOf(runner?.compute);
                    if (!runner || runnerTarget?.kind !== "runner") return [];
                    const status =
                        runner.status === "connected" || runner.status === "draining"
                            ? runner.status
                            : "disconnected";
                    return [
                        {
                            target: runnerTarget,
                            hostname:
                                typeof runner.hostname === "string"
                                    ? runner.hostname
                                    : runnerTarget.runnerId,
                            status,
                        },
                    ];
                }),
            },
        ];
    });
}

export function happyAgentComputesStoreCreate(deps: {
    readonly request: HappyCloudRequest;
}): HappyAgentComputesStore {
    const store = createStore<HappyAgentComputesSnapshot>()(() => ({
        loading: false,
        pools: [],
        attachAllowed: false,
        detachAllowed: false,
        saving: NO_SAVING,
    }));
    let disposed = false;
    /** Counts reads so an older answer never replaces a newer one. */
    let read = 0;

    const savingSet = (agentId: string, on: boolean): void => {
        const saving = new Set(store.getState().saving);
        if (on) saving.add(agentId);
        else saving.delete(agentId);
        store.setState({ saving: saving.size === 0 ? NO_SAVING : saving }, false);
    };

    const send = (agentId: string, request: () => Promise<unknown>): void => {
        if (disposed || store.getState().saving.has(agentId)) return;
        const { saveError: _cleared, ...rest } = store.getState();
        store.setState(rest, true);
        savingSet(agentId, true);
        // The agent's own update carries the new binding to the chip.
        void request().then(
            () => {
                if (!disposed) savingSet(agentId, false);
            },
            (error: unknown) => {
                if (disposed) return;
                savingSet(agentId, false);
                store.setState({ saveError: happyAgentUserError(error) }, false);
            },
        );
    };

    return {
        get: () => store.getState(),
        subscribe: (listener) => (disposed ? () => undefined : store.subscribe(listener)),
        listRead(agentId) {
            if (disposed) return;
            const ticket = ++read;
            const { error: _cleared, ...rest } = store.getState();
            store.setState({ ...rest, loading: true }, true);
            // Permissions decide what may be done even when the list can't be read.
            void deps.request("GET", "v0/permissions").then(
                (permissions) => {
                    if (disposed || ticket !== read) return;
                    const granted = recordOf(permissions)?.granted;
                    const has = (permission: string): boolean =>
                        Array.isArray(granted) && granted.includes(permission);
                    store.setState(
                        {
                            attachAllowed: has("compute.use"),
                            detachAllowed: has("content.write"),
                        },
                        false,
                    );
                },
                () => undefined,
            );
            // Filtered to what this agent may hold, as the agent itself sees it.
            void deps.request("GET", `v0/computes?agentId=${encodeURIComponent(agentId)}`).then(
                (computes) => {
                    if (disposed || ticket !== read) return;
                    store.setState({ loading: false, pools: poolsRead(computes) }, false);
                },
                (error: unknown) => {
                    if (disposed || ticket !== read) return;
                    const refused = happyAgentUserError(error);
                    store.setState(
                        refused.code === "forbidden"
                            ? { loading: false, pools: [] }
                            : {
                                  loading: false,
                                  pools: [],
                                  error:
                                      refused.code === "not_found"
                                          ? new UserError(
                                                "This server can't list its machines yet.",
                                            )
                                          : refused,
                              },
                        false,
                    );
                },
            );
        },
        computeAttach(agentId, target) {
            send(agentId, () =>
                deps.request("PUT", `v0/agents/${encodeURIComponent(agentId)}/compute`, {
                    compute: wireOf(target),
                }),
            );
        },
        computeDetach(agentId) {
            send(agentId, () =>
                deps.request("DELETE", `v0/agents/${encodeURIComponent(agentId)}/compute`),
            );
        },
        [Symbol.dispose]() {
            disposed = true;
        },
    };
}

const INERT_SNAPSHOT: HappyAgentComputesSnapshot = {
    loading: false,
    pools: [],
    attachAllowed: false,
    detachAllowed: false,
    saving: NO_SAVING,
};

/** Where no compute can be picked: it never reads and never changes. */
export const happyAgentComputesStoreNoop: HappyAgentComputesStore = {
    get: () => INERT_SNAPSHOT,
    subscribe: () => () => undefined,
    listRead: () => undefined,
    computeAttach: () => undefined,
    computeDetach: () => undefined,
    [Symbol.dispose]: () => undefined,
};
