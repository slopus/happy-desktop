import type { ConnectionListResponse, HappyAgentClient } from "@slopus/happy-agent-client";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { happyAgentSyncRead } from "../happyAgentConnection/happyAgentSyncRead.js";

export interface HappyAgentConnectionItem {
    readonly id: string;
    readonly name: string;
    readonly remoteId?: string;
}

export interface HappyAgentConnectionsSnapshot {
    readonly items: readonly HappyAgentConnectionItem[];
    readonly selectedId: string;
    readonly error?: string;
    readonly reordering: boolean;
    readonly reorderError?: string;
}

export interface HappyAgentConnectionsStore {
    get(): HappyAgentConnectionsSnapshot;
    subscribe(listener: () => void): () => void;
    connectionSelect(id: string): void;
    connectionReorder(id: string, afterId: string | null): void;
    [Symbol.dispose](): void;
}

/** The main daemon owns membership; connectivity never removes a known UI. */
export function happyAgentConnectionsStoreCreate(
    client: HappyAgentClient,
    sync: HappyAgentSync,
): HappyAgentConnectionsStore {
    let snapshot: HappyAgentConnectionsSnapshot = {
        items: [{ id: "local", name: "This Mac" }],
        selectedId: "local",
        reordering: false,
    };
    const listeners = new Set<() => void>();
    let controller: AbortController | undefined;
    // The read in flight, if any. A fresh trigger replaces it rather than
    // queueing behind it: a read that failed while the daemon was down is
    // backing off, and the connection coming back must not wait that out.
    let pending: AbortController | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    let version: string | undefined;
    let confirmedItems = snapshot.items;
    let optimisticOrder: readonly string[] | undefined;
    let reorderController: AbortController | undefined;
    const publish = (next: HappyAgentConnectionsSnapshot): void => {
        snapshot = next;
        for (const listener of listeners) listener();
    };
    const adopt = (result: ConnectionListResponse): void => {
        // A list read started before a reorder must not restore the old order.
        if (version && (!result.version || result.version < version)) return;
        version = result.version;
        let items: HappyAgentConnectionItem[] = [snapshot.items[0]!];
        for (const connection of result.connections) {
            const id = `connection:${connection.id}`;
            const previous = snapshot.items.find((item) => item.id === id);
            items.push(
                previous?.name === connection.name
                    ? previous
                    : { id, remoteId: connection.id, name: connection.name },
            );
        }
        confirmedItems = items;
        if (optimisticOrder) {
            const byId = new Map(items.map((item) => [item.id, item]));
            const order = new Set(optimisticOrder);
            items = [
                ...optimisticOrder.flatMap((id) => {
                    const item = byId.get(id);
                    return item ? [item] : [];
                }),
                ...items.filter((item) => !order.has(item.id)),
            ];
        }
        if (
            !snapshot.error &&
            items.length === snapshot.items.length &&
            items.every((item, index) => item === snapshot.items[index])
        )
            return;
        publish({
            ...snapshot,
            error: undefined,
            items,
            selectedId: items.some((item) => item.id === snapshot.selectedId)
                ? snapshot.selectedId
                : "local",
        });
    };
    const reconcile = async (signal: AbortSignal): Promise<void> => {
        const result = await happyAgentSyncRead(
            signal,
            () => client.listConnections({ signal }),
            (error) =>
                publish({
                    ...snapshot,
                    error: error instanceof Error ? error.message : String(error),
                }),
        );
        if (!signal.aborted) adopt(result);
    };
    const reconcileRequest = (parent: AbortSignal): void => {
        pending?.abort();
        const own = new AbortController();
        pending = own;
        const signal = AbortSignal.any([parent, own.signal]);
        void reconcile(signal)
            .catch((error: unknown) => {
                if (!signal.aborted)
                    publish({
                        ...snapshot,
                        error: error instanceof Error ? error.message : String(error),
                    });
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
            // The shared subscription is installed before reading membership;
            // changes during that read remain queued for reconciliation.
            for await (const input of sync.follow({
                signal: active.signal,
                events: ["connections.updated"],
            })) {
                try {
                    if (input.kind === "error") throw input.error;
                    if (input.kind === "bootstrap" || input.kind === "reconcile")
                        reconcileRequest(active.signal);
                    else if (
                        (input.update.kind === "connected" && snapshot.error) ||
                        (input.update.kind === "event" &&
                            input.update.event.type === "connections.updated")
                    )
                        reconcileRequest(active.signal);
                } catch (error) {
                    if (!active.signal.aborted)
                        publish({
                            ...snapshot,
                            error: error instanceof Error ? error.message : String(error),
                        });
                }
            }
        })()
            .catch((error: unknown) => {
                if (!active.signal.aborted)
                    publish({
                        ...snapshot,
                        error: error instanceof Error ? error.message : String(error),
                    });
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
        connectionSelect(id) {
            if (id !== snapshot.selectedId && snapshot.items.some((item) => item.id === id))
                publish({ ...snapshot, selectedId: id });
        },
        connectionReorder(id, afterId) {
            if (disposed || snapshot.reordering || !version || !controller) return;
            const item = snapshot.items.find((entry) => entry.id === id);
            const after = snapshot.items.find((entry) => entry.id === afterId);
            // Home is outside the server roster and can never be moved.
            if (!item?.remoteId || id === afterId || (afterId !== null && !after?.remoteId)) return;
            const index = snapshot.items.indexOf(item);
            if ((snapshot.items[index - 1]?.remoteId ?? null) === (after?.remoteId ?? null)) return;
            const request = new AbortController();
            reorderController = request;
            const signal = AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]);
            const ifMatch = version;
            const mutationId = crypto.randomUUID();
            const items = snapshot.items.filter((entry) => entry.id !== id);
            const destination = after ? items.indexOf(after) + 1 : 1;
            items.splice(destination, 0, item);
            optimisticOrder = items.map((entry) => entry.id);
            publish({ ...snapshot, items, reordering: true, reorderError: undefined });
            void client
                .reorderConnection(
                    item.remoteId,
                    { afterId: after?.remoteId ?? null, mutationId },
                    { ifMatch, signal },
                )
                .then((result) => {
                    if (!request.signal.aborted) adopt(result);
                })
                .catch((error: unknown) => {
                    if (!request.signal.aborted)
                        publish({
                            ...snapshot,
                            reorderError: `Could not reorder connections: ${error instanceof Error ? error.message : String(error)}`,
                        });
                })
                .finally(() => {
                    if (reorderController !== request) return;
                    reorderController = undefined;
                    if (disposed) return;
                    optimisticOrder = undefined;
                    publish({ ...snapshot, items: confirmedItems, reordering: false });
                    // Reconcile conflicts and uncertain outcomes through an authoritative read.
                    if (controller) reconcileRequest(controller.signal);
                });
        },
        [Symbol.dispose]() {
            disposed = true;
            reorderController?.abort();
            stop();
            listeners.clear();
        },
    };
}
