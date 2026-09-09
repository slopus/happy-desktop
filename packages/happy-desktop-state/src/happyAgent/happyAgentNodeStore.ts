import type { DaemonConfig, HappyAgentClient } from "@slopus/happy-agent-client";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { happyAgentSyncRead } from "../happyAgentConnection/happyAgentSyncRead.js";

/** How one Happy Agent installation presents itself: its own name and picture. */
export interface HappyAgentNodeIdentity {
    readonly name: string;
    /** Present when the installation has a picture; the bytes are fetched separately. */
    readonly avatar?: { readonly url: string; readonly thumbhash: string };
}

export interface HappyAgentNodeSnapshot {
    /** Absent until the daemon has reported its config, or on a daemon too old to have one. */
    readonly node?: HappyAgentNodeIdentity;
}

export interface HappyAgentNodeStore {
    get(): HappyAgentNodeSnapshot;
    subscribe(listener: () => void): () => void;
    [Symbol.dispose](): void;
}

function identityProject(
    endpoint: string,
    config: DaemonConfig,
): HappyAgentNodeIdentity | undefined {
    const node = config.node;
    if (node === undefined) return undefined;
    return {
        name: node.name,
        ...(node.avatar === null
            ? {}
            : {
                  avatar: {
                      url: `${endpoint.replace(/\/$/u, "")}/v0/node/avatar`,
                      thumbhash: node.avatar.thumbhash,
                  },
              }),
    };
}

function identitiesEqual(
    left: HappyAgentNodeIdentity | undefined,
    right: HappyAgentNodeIdentity | undefined,
): boolean {
    if (left === undefined || right === undefined) return left === right;
    return (
        left.name === right.name &&
        left.avatar?.url === right.avatar?.url &&
        left.avatar?.thumbhash === right.avatar?.thumbhash
    );
}

/**
 * One connection's installation identity. The bootstrap config establishes it,
 * and every `config.updated` re-reads the config, since that event carries no
 * payload. Live for exactly as long as a surface is observing it.
 */
export function happyAgentNodeStoreCreate(
    client: HappyAgentClient,
    sync: HappyAgentSync,
): HappyAgentNodeStore {
    let snapshot: HappyAgentNodeSnapshot = {};
    const listeners = new Set<() => void>();
    let controller: AbortController | undefined;
    let pending: AbortController | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    let failed = false;
    const adopt = (config: DaemonConfig): void => {
        const node = identityProject(client.endpoint, config);
        if (identitiesEqual(snapshot.node, node)) return;
        snapshot = node === undefined ? {} : { node };
        for (const listener of listeners) listener();
    };
    const reconcileRequest = (parent: AbortSignal): void => {
        pending?.abort();
        const own = new AbortController();
        pending = own;
        const signal = AbortSignal.any([parent, own.signal]);
        void happyAgentSyncRead(
            signal,
            () => client.getConfig({ signal }),
            () => {
                failed = true;
            },
        )
            .then((response) => {
                if (signal.aborted) return;
                failed = false;
                adopt(response.config);
            })
            .catch(() => {
                if (!signal.aborted) failed = true;
            })
            .finally(() => {
                if (pending === own) pending = undefined;
            });
    };
    const start = (): void => {
        if (disposed || controller || listeners.size === 0) return;
        const active = new AbortController();
        controller = active;
        void (async () => {
            for await (const input of sync.follow({
                signal: active.signal,
                events: ["config.updated"],
            })) {
                if (input.kind === "error") {
                    failed = true;
                    continue;
                }
                if (input.kind === "bootstrap") {
                    pending?.abort();
                    pending = undefined;
                    failed = false;
                    adopt(input.bootstrap.config);
                } else if (
                    input.kind === "reconcile" ||
                    (input.update.kind === "connected" && failed) ||
                    (input.update.kind === "event" && input.update.event.type === "config.updated")
                )
                    reconcileRequest(active.signal);
            }
        })()
            .catch(() => {
                if (!active.signal.aborted) failed = true;
            })
            .finally(() => {
                if (controller === active) controller = undefined;
                if (!active.signal.aborted && !disposed && listeners.size > 0)
                    retry = setTimeout(start, 1_000);
            });
    };
    const stop = (): void => {
        pending?.abort();
        pending = undefined;
        controller?.abort();
        controller = undefined;
        if (retry) clearTimeout(retry);
        retry = undefined;
    };
    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            start();
            return () => {
                listeners.delete(listener);
                if (listeners.size === 0) stop();
            };
        },
        [Symbol.dispose]() {
            disposed = true;
            stop();
            listeners.clear();
        },
    };
}
