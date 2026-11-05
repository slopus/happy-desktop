import type { HappyAgentClient } from "@slopus/happy-agent-client";
import type { HappyAgentHealth, HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";

/** Whether one kind of Surface can be made, and for a document written, here. */
export type HappyAgentSurfaceSupport = "checking" | "supported" | "unsupported";

/**
 * Which Surfaces a Happy Agent can make that an older one cannot, as its
 * health says: collaborative documents, calendars, system monitors, chats, and vaults.
 */
export interface HappyAgentSurfaceSupportSnapshot {
    readonly documents: HappyAgentSurfaceSupport;
    readonly calendars: HappyAgentSurfaceSupport;
    readonly systemMonitors: HappyAgentSurfaceSupport;
    readonly chats: HappyAgentSurfaceSupport;
    readonly vaults: HappyAgentSurfaceSupport;
}

export interface HappyAgentSurfaceSupportStore {
    get(): HappyAgentSurfaceSupportSnapshot;
    subscribe(listener: () => void): () => void;
    [Symbol.dispose](): void;
}

export interface HappyAgentSurfaceSupportDeps {
    readonly client: Pick<HappyAgentClient, "getHealth">;
    readonly sync: HappyAgentSync;
}

const CHECKING: HappyAgentSurfaceSupportSnapshot = {
    documents: "checking",
    calendars: "checking",
    systemMonitors: "checking",
    chats: "checking",
    vaults: "checking",
};
const UNSUPPORTED: HappyAgentSurfaceSupportSnapshot = {
    documents: "unsupported",
    calendars: "unsupported",
    systemMonitors: "unsupported",
    chats: "unsupported",
    vaults: "unsupported",
};
const RETRY_MS = 5_000;

const supportOf = (supported: boolean): HappyAgentSurfaceSupport =>
    supported ? "supported" : "unsupported";

/**
 * One connection's answer to which newer Surfaces it serves, from its health
 * as the connection last heard it, and asked again whenever the connection is
 * re-established, since that is when a different daemon may be answering. The
 * health is read here only while the connection has heard none. Offering a new
 * document, a new calendar, or a new chat waits on it: an older Happy Agent can
 * show a document, but nobody can write one here, and it cannot make a
 * calendar or a chat at all.
 */
export function happyAgentSurfaceSupportStoreCreate(
    deps: HappyAgentSurfaceSupportDeps,
): HappyAgentSurfaceSupportStore {
    const listeners = new Set<() => void>();
    let snapshot = CHECKING;
    let controller: AbortController | undefined;
    let pending: AbortController | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const set = (next: HappyAgentSurfaceSupportSnapshot): void => {
        if (
            next.documents === snapshot.documents &&
            next.calendars === snapshot.calendars &&
            next.systemMonitors === snapshot.systemMonitors &&
            next.chats === snapshot.chats &&
            next.vaults === snapshot.vaults
        )
            return;
        snapshot = next;
        for (const listener of listeners) listener();
    };

    const adopt = (health: HappyAgentHealth): void =>
        set({
            documents: supportOf(health.capabilities?.collaborativeDocuments === true),
            calendars: supportOf(health.capabilities?.calendarSurfaces === true),
            systemMonitors: supportOf(health.capabilities?.systemMonitorSurfaces === true),
            chats: supportOf(health.capabilities?.chatSurfaces === true),
            vaults: supportOf(health.capabilities?.vaults === true),
        });

    const check = (parent: AbortSignal): void => {
        pending?.abort();
        if (retry) clearTimeout(retry);
        retry = undefined;
        const known = deps.sync.health();
        if (known !== undefined) {
            pending = undefined;
            adopt(known);
            return;
        }
        const own = new AbortController();
        pending = own;
        const signal = AbortSignal.any([parent, own.signal]);
        void deps.client.getHealth({ signal }).then(
            (health) => {
                if (signal.aborted) return;
                adopt(health);
            },
            () => {
                // Not knowing is not "unsupported": an offer already made stays
                // while the connection is asked again.
                if (signal.aborted) return;
                retry = setTimeout(() => check(parent), RETRY_MS);
            },
        );
    };

    const start = (): void => {
        if (controller) return;
        const active = new AbortController();
        controller = active;
        void (async () => {
            for await (const input of deps.sync.follow({ signal: active.signal, events: [] })) {
                if (input.kind === "bootstrap" || input.kind === "reconcile") check(active.signal);
                else if (input.kind === "update" && input.update.kind === "connected")
                    check(active.signal);
            }
        })().catch(() => undefined);
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
            stop();
            listeners.clear();
        },
    };
}

/** For a connection without Surfaces: never supported, and nothing to follow. */
export const happyAgentSurfaceSupportStoreNone: HappyAgentSurfaceSupportStore = {
    get: () => UNSUPPORTED,
    subscribe: () => () => undefined,
    [Symbol.dispose]: () => undefined,
};
