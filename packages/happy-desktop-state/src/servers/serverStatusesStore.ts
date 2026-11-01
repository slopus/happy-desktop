import {
    HappyAgentApiError,
    type ConnectionStatus,
    type HappyAgentClient,
} from "@slopus/happy-agent-client";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { happyAgentSyncRead } from "../happyAgentConnection/happyAgentSyncRead.js";

export interface ServerStatusesSnapshot {
    /** Each server connection by URL, by the host Happy Agent's connection ID. */
    readonly statuses: ReadonlyMap<string, ConnectionStatus>;
}

export interface ServerStatusesStore {
    get(): ServerStatusesSnapshot;
    subscribe(listener: () => void): () => void;
    [Symbol.dispose](): void;
}

const EMPTY: ServerStatusesSnapshot = { statuses: new Map() };

/**
 * Where the host Happy Agent's server connections by URL stand: signed in and
 * reachable, connecting, needing a new sign-in, or unreachable.
 *
 * The constructor opens nothing. The first subscriber reads every status and
 * follows `connections.status.updated`; a bootstrap or reconcile reads them all
 * again, and an event replaces one status unless the one held is newer. A
 * daemon that predates these connections answers 404 and has none.
 */
export function serverStatusesStoreCreate(
    client: Pick<HappyAgentClient, "listConnectionStatuses">,
    sync: HappyAgentSync,
): ServerStatusesStore {
    const listeners = new Set<() => void>();
    let snapshot = EMPTY;
    let controller: AbortController | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;

    const publish = (statuses: ReadonlyMap<string, ConnectionStatus>): void => {
        snapshot = { statuses };
        for (const listener of listeners) listener();
    };
    const listAdopt = (list: readonly ConnectionStatus[]): void => {
        const next = new Map(list.map((status) => [status.id, status]));
        const current = snapshot.statuses;
        if (
            next.size === current.size &&
            [...next].every(([id, status]) => statusEqual(current.get(id), status))
        )
            return;
        publish(next);
    };
    const statusAdopt = (status: ConnectionStatus): void => {
        const held = snapshot.statuses.get(status.id);
        if (held && (held.updatedAt > status.updatedAt || statusEqual(held, status))) return;
        publish(new Map(snapshot.statuses).set(status.id, status));
    };
    const read = (signal: AbortSignal) =>
        happyAgentSyncRead(
            signal,
            async () => {
                try {
                    return (await client.listConnectionStatuses({ signal })).statuses;
                } catch (error) {
                    if (error instanceof HappyAgentApiError && error.status === 404) return [];
                    throw error;
                }
            },
            () => undefined,
        );
    const start = (): void => {
        if (disposed || controller || listeners.size === 0) return;
        const active = new AbortController();
        controller = active;
        void (async () => {
            for await (const input of sync.follow({
                signal: active.signal,
                events: ["connections.status.updated"],
            })) {
                if (input.kind === "error") continue;
                if (input.kind === "bootstrap" || input.kind === "reconcile") {
                    const list = await read(active.signal);
                    if (!active.signal.aborted) listAdopt(list);
                } else if (
                    input.update.kind === "event" &&
                    input.update.event.type === "connections.status.updated"
                )
                    statusAdopt(input.update.event.payload);
            }
        })()
            .catch(() => undefined)
            .finally(() => {
                if (controller === active) controller = undefined;
                if (!active.signal.aborted && !disposed && listeners.size > 0)
                    retry = setTimeout(start, 1_000);
            });
    };
    const stop = (): void => {
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

function statusEqual(left: ConnectionStatus | undefined, right: ConnectionStatus): boolean {
    return (
        left !== undefined &&
        left.status === right.status &&
        left.message === right.message &&
        left.updatedAt === right.updatedAt
    );
}
