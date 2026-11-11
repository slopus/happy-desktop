import { createStore } from "zustand/vanilla";
import { UserError } from "../types.js";
import type { HappyCloudRequest } from "./happyAgentProviderCredentials.js";
import { happyAgentUserError, referencesPreserve } from "./happyAgentSupport.js";

/** Where a machine stands; a revoked machine is no longer listed. */
export type HappyAgentComputeMachineStatus = "online" | "offline" | "draining" | "enrolling";

/** Sandboxes in use against what the machines reported they hold; `total` is null until all have. */
export interface HappyAgentComputeCapacity {
    readonly used: number;
    readonly total: number | null;
}

/** One machine that joined a pool: a runner work is placed on. */
export interface HappyAgentComputeMachine {
    readonly id: string;
    readonly name: string;
    readonly poolId: string;
    readonly status: HappyAgentComputeMachineStatus;
    readonly hostname: string | null;
    /** `macos`, `linux` or `windows`, as the machine reported it. */
    readonly os: string | null;
    readonly arch: string | null;
    /** The supervisor version it runs. */
    readonly version: string | null;
    readonly sandboxes: HappyAgentComputeCapacity;
    /** The agents working on it now, by title where they have one. */
    readonly agents: readonly { readonly agentId: string; readonly title: string | null }[];
    /** Why its sandbox failed its self-test, while it does: then nothing is placed on it. */
    readonly sandboxError: string | null;
    /** When the status last changed, in milliseconds. */
    readonly since: number;
}

/** A pool of machines work is placed on; the default pool takes work that names none. */
export interface HappyAgentComputePool {
    readonly id: string;
    readonly name: string;
    readonly default: boolean;
    readonly machines: { readonly total: number; readonly online: number };
    readonly sandboxes: HappyAgentComputeCapacity;
}

/** The one-time install command a new machine joins a pool with. */
export interface HappyAgentComputeInstall {
    readonly poolId: string;
    /** Unix and Windows install commands; null where the server publishes no installer. */
    readonly commands: { readonly unix: string; readonly windows: string } | null;
    /** The join token itself, for an install without the commands. */
    readonly token: string;
    readonly clusterUrl: string;
    /** When the token stops working, in milliseconds. */
    readonly expiresAt: number;
}

/** Adding a machine, while its dialog is open. */
export interface HappyAgentComputeMachineAdd {
    readonly poolId: string;
    readonly creating: boolean;
    /** Shown once; closing the dialog forgets it. */
    readonly install?: HappyAgentComputeInstall;
    readonly error?: UserError;
}

export interface HappyAgentComputeSnapshot {
    /** True until the first answer, so "no machines" is never claimed early. */
    readonly loading: boolean;
    /** Whether the reader may see pools and add machines (`pools.manage`). */
    readonly manage: boolean;
    /** Empty for a reader who may not manage pools. */
    readonly pools: readonly HappyAgentComputePool[];
    readonly machines: readonly HappyAgentComputeMachine[];
    readonly machineAdd?: HappyAgentComputeMachineAdd;
    readonly error?: UserError;
}

/**
 * Settings › Compute on Happy Cloud: the pools work runs on and the machines
 * in them, and adding a machine. Compute events are not typed by this client
 * yet, so the lists are read again every few seconds while they are on screen.
 */
export interface HappyAgentComputeStore {
    get(): HappyAgentComputeSnapshot;
    subscribe(listener: () => void): () => void;
    /** Opens adding a machine, to `poolId` or else the default pool. */
    machineAddOpen(poolId?: string): void;
    machineAddClose(): void;
    machineAddPoolUpdate(poolId: string): void;
    /** Mints the pool's one-time join token and its install commands. */
    machineAddCreate(): void;
    [Symbol.dispose](): void;
}

const POLL_INTERVAL_MS = 4_000;

function recordOf(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null
        ? (value as Record<string, unknown>)
        : undefined;
}

function textOrNull(value: unknown): string | null {
    return typeof value === "string" && value !== "" ? value : null;
}

function numberOr(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function capacityRead(value: unknown): HappyAgentComputeCapacity {
    const capacity = recordOf(value);
    return {
        used: numberOr(capacity?.used, 0),
        total: typeof capacity?.total === "number" ? capacity.total : null,
    };
}

function poolRead(value: unknown): HappyAgentComputePool | undefined {
    const pool = recordOf(value);
    if (!pool || typeof pool.id !== "string") return undefined;
    const counts = recordOf(pool.nodeCounts);
    return {
        id: pool.id,
        name: typeof pool.name === "string" ? pool.name : pool.id,
        default: pool.default === true,
        // A revoked machine is gone from the list, so it is not counted either.
        machines: {
            total: numberOr(counts?.total, 0) - numberOr(counts?.revoked, 0),
            online: numberOr(counts?.online, 0),
        },
        sandboxes: capacityRead(pool.sandboxCapacity),
    };
}

const MACHINE_STATUSES: readonly HappyAgentComputeMachineStatus[] = [
    "online",
    "offline",
    "draining",
    "enrolling",
];

function machineStatusOf(value: unknown): HappyAgentComputeMachineStatus | undefined {
    return MACHINE_STATUSES.find((status) => status === value);
}

/** A node from `/v0/compute/nodes`; a revoked one is left out. */
function nodeRead(value: unknown): HappyAgentComputeMachine | undefined {
    const node = recordOf(value);
    const status = machineStatusOf(node?.status);
    if (!node || typeof node.id !== "string" || !status) return undefined;
    const active = Array.isArray(node.activeSandboxes) ? node.activeSandboxes : [];
    return {
        id: node.id,
        name: textOrNull(node.name) ?? textOrNull(node.hostname) ?? node.id.slice(0, 8),
        poolId: typeof node.pool === "string" ? node.pool : "",
        status,
        hostname: textOrNull(node.hostname),
        os: textOrNull(node.os),
        arch: textOrNull(node.arch),
        version: textOrNull(node.version),
        sandboxes: capacityRead(node.sandboxCapacity),
        agents: active.flatMap((item: unknown) => {
            const sandbox = recordOf(item);
            return sandbox && typeof sandbox.agentId === "string"
                ? [{ agentId: sandbox.agentId, title: textOrNull(sandbox.agentTitle) }]
                : [];
        }),
        sandboxError: textOrNull(node.sandboxError),
        since: numberOr(node.since, 0),
    };
}

/**
 * A runner from `/v0/runners`, which every member may read: the same machines
 * with less detail, for a reader who may not manage pools.
 */
function runnerRead(value: unknown): HappyAgentComputeMachine | undefined {
    const runner = recordOf(value);
    if (!runner || typeof runner.id !== "string") return undefined;
    const machine = recordOf(runner.machine);
    const status: HappyAgentComputeMachineStatus =
        runner.status === "connected" ? "online" : (machineStatusOf(runner.reason) ?? "offline");
    const platform = textOrNull(machine?.platform);
    return {
        id: runner.id,
        name: textOrNull(runner.name) ?? runner.id.slice(0, 8),
        poolId: typeof runner.pool === "string" ? runner.pool : "",
        status,
        hostname: textOrNull(machine?.hostname),
        os: platform === "darwin" ? "macos" : platform === "win32" ? "windows" : platform,
        arch: textOrNull(machine?.arch),
        version: textOrNull(machine?.version),
        sandboxes: { used: 0, total: null },
        agents: [],
        sandboxError: null,
        since: numberOr(runner.since, 0),
    };
}

function listRead<T>(value: unknown, key: string, read: (item: unknown) => T | undefined): T[] {
    const list = recordOf(value)?.[key];
    if (!Array.isArray(list)) return [];
    return list.flatMap((item: unknown) => {
        const entry = read(item);
        return entry === undefined ? [] : [entry];
    });
}

function installRead(value: unknown, poolId: string): HappyAgentComputeInstall | undefined {
    const answer = recordOf(value);
    if (!answer || typeof answer.token !== "string") return undefined;
    const commands = recordOf(answer.commands);
    return {
        poolId,
        commands:
            commands && typeof commands.unix === "string" && typeof commands.windows === "string"
                ? { unix: commands.unix, windows: commands.windows }
                : null,
        token: answer.token,
        clusterUrl: typeof answer.clusterUrl === "string" ? answer.clusterUrl : "",
        // The token's expiry is a JWT `exp`, in seconds.
        expiresAt: numberOr(answer.expiresAt, 0) * 1000,
    };
}

/** Online first, then by name, so the machines that can take work lead. */
function machineCompare(left: HappyAgentComputeMachine, right: HappyAgentComputeMachine): number {
    const online = Number(right.status === "online") - Number(left.status === "online");
    return online !== 0 ? online : left.name.localeCompare(right.name);
}

export function happyAgentComputeStoreCreate(deps: {
    readonly request: HappyCloudRequest;
}): HappyAgentComputeStore {
    const store = createStore<HappyAgentComputeSnapshot>()(() => ({
        loading: true,
        manage: false,
        pools: [],
        machines: [],
    }));
    const listeners = new Set<() => void>();
    let disposed = false;
    let reading = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = (): void => {
        if (disposed || listeners.size === 0 || timer !== undefined) return;
        timer = setTimeout(() => {
            timer = undefined;
            load();
        }, POLL_INTERVAL_MS);
    };

    const accept = (
        manage: boolean,
        pools: readonly HappyAgentComputePool[],
        machines: readonly HappyAgentComputeMachine[],
    ): void => {
        const current = store.getState();
        const { error: _cleared, ...rest } = current;
        store.setState(
            {
                ...rest,
                loading: false,
                manage,
                pools: referencesPreserve(current.pools, pools),
                machines: referencesPreserve(current.machines, [...machines].sort(machineCompare)),
            },
            true,
        );
    };

    const failed = (error: unknown): void => {
        if (store.getState().loading)
            store.setState({ loading: false, error: happyAgentUserError(error) }, false);
    };

    function load(): void {
        if (disposed || listeners.size === 0 || reading) return;
        if (timer !== undefined) clearTimeout(timer);
        timer = undefined;
        reading = true;
        const settle = (): void => {
            reading = false;
            schedule();
        };
        void deps.request("GET", "v0/permissions").then(
            (permissions) => {
                if (disposed) return settle();
                const granted = recordOf(permissions)?.granted;
                const manage = Array.isArray(granted) && granted.includes("pools.manage");
                // Pools and their nodes are for `pools.manage`; every member
                // may read the same machines as runners.
                const lists = manage
                    ? Promise.all([
                          deps.request("GET", "v0/compute/pools"),
                          deps.request("GET", "v0/compute/nodes"),
                      ]).then(([pools, nodes]) =>
                          accept(
                              true,
                              listRead(pools, "pools", poolRead),
                              listRead(nodes, "nodes", nodeRead),
                          ),
                      )
                    : deps
                          .request("GET", "v0/runners")
                          .then((runners) =>
                              accept(false, [], listRead(runners, "runners", runnerRead)),
                          );
                void lists.then(settle, (error: unknown) => {
                    if (!disposed) failed(error);
                    settle();
                });
            },
            (error: unknown) => {
                if (!disposed) failed(error);
                settle();
            },
        );
    }

    const machineAddUpdate = (change: Partial<HappyAgentComputeMachineAdd>): void => {
        const add = store.getState().machineAdd;
        if (add) store.setState({ machineAdd: { ...add, ...change } }, false);
    };

    return {
        get: () => store.getState(),
        subscribe(listener) {
            listeners.add(listener);
            const unsubscribe = store.subscribe(listener);
            if (listeners.size === 1) load();
            let released = false;
            return () => {
                if (released) return;
                released = true;
                unsubscribe();
                listeners.delete(listener);
                if (listeners.size === 0 && timer !== undefined) {
                    clearTimeout(timer);
                    timer = undefined;
                }
            };
        },
        machineAddOpen(poolId) {
            const snapshot = store.getState();
            if (disposed || !snapshot.manage) return;
            const pool =
                snapshot.pools.find((entry) => entry.id === poolId) ??
                snapshot.pools.find((entry) => entry.default) ??
                snapshot.pools[0];
            if (!pool) return;
            store.setState({ machineAdd: { poolId: pool.id, creating: false } }, false);
        },
        machineAddClose() {
            const { machineAdd, ...rest } = store.getState();
            if (disposed || !machineAdd || machineAdd.creating) return;
            store.setState(rest, true);
        },
        machineAddPoolUpdate(poolId) {
            const add = store.getState().machineAdd;
            if (!add || add.creating || !store.getState().pools.some((pool) => pool.id === poolId))
                return;
            // A command already shown joins the pool it was made for, so it goes.
            store.setState({ machineAdd: { poolId, creating: false } }, false);
        },
        machineAddCreate() {
            const add = store.getState().machineAdd;
            if (disposed || !add || add.creating) return;
            const poolId = add.poolId;
            store.setState({ machineAdd: { poolId, creating: true } }, false);
            void deps
                .request("POST", `v0/compute/pools/${encodeURIComponent(poolId)}/join-tokens`, {})
                .then(
                    (answer) => {
                        if (disposed || store.getState().machineAdd?.poolId !== poolId) return;
                        const install = installRead(answer, poolId);
                        machineAddUpdate(
                            install
                                ? { creating: false, install }
                                : {
                                      creating: false,
                                      error: new UserError(
                                          "Happy Cloud didn't send an install command.",
                                      ),
                                  },
                        );
                    },
                    (error: unknown) => {
                        if (disposed || store.getState().machineAdd?.poolId !== poolId) return;
                        machineAddUpdate({ creating: false, error: happyAgentUserError(error) });
                    },
                );
        },
        [Symbol.dispose]() {
            disposed = true;
            if (timer !== undefined) clearTimeout(timer);
            timer = undefined;
        },
    };
}

const INERT_SNAPSHOT: HappyAgentComputeSnapshot = {
    loading: false,
    manage: false,
    pools: [],
    machines: [],
};

/** Where there is no Happy Cloud compute: it lists nothing and never changes. */
export const happyAgentComputeStoreNoop: HappyAgentComputeStore = {
    get: () => INERT_SNAPSHOT,
    subscribe: () => () => undefined,
    machineAddOpen: () => undefined,
    machineAddClose: () => undefined,
    machineAddPoolUpdate: () => undefined,
    machineAddCreate: () => undefined,
    [Symbol.dispose]: () => undefined,
};
