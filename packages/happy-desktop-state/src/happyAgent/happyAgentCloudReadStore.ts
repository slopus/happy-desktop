import { createStore } from "zustand/vanilla";
import type { HappyAgentEvent } from "@slopus/happy-agent-client";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { happyAgentUserError } from "./happyAgentSupport.js";

/** One team server read, as it last answered. */
export interface HappyAgentCloudReadSnapshot<T> {
    /** True until the first answer. */
    readonly loading: boolean;
    readonly value?: T;
    /** Why the last read failed; the last value stays. */
    readonly error?: string;
}

export interface HappyAgentCloudReadStore<T> {
    get(): HappyAgentCloudReadSnapshot<T>;
    subscribe(listener: () => void): () => void;
    [Symbol.dispose](): void;
}

/**
 * A team server read that stays current while anything shows it: read when
 * the first reader subscribes, and again on each of `events`, on a reconnect,
 * and on a reconcile. The events are hints to read again, never state.
 */
export function happyAgentCloudReadStoreCreate<T>(deps: {
    readonly read: () => Promise<T>;
    readonly sync: HappyAgentSync;
    readonly events: readonly HappyAgentEvent["type"][];
}): HappyAgentCloudReadStore<T> {
    const store = createStore<HappyAgentCloudReadSnapshot<T>>()(() => ({ loading: true }));
    const events = deps.events;
    const listeners = new Set<() => void>();
    let disposed = false;
    let reading = false;
    let readAgain = false;
    let follower: AbortController | undefined;

    const load = (): void => {
        if (disposed) return;
        if (reading) {
            readAgain = true;
            return;
        }
        reading = true;
        void deps
            .read()
            .then(
                (value) => {
                    if (!disposed) store.setState({ loading: false, value }, true);
                },
                (error: unknown) => {
                    if (disposed) return;
                    const { value } = store.getState();
                    store.setState(
                        {
                            loading: false,
                            ...(value === undefined ? {} : { value }),
                            error: happyAgentUserError(error).message,
                        },
                        true,
                    );
                },
            )
            .finally(() => {
                reading = false;
                if (readAgain && !disposed) {
                    readAgain = false;
                    load();
                }
            });
    };

    const follow = (): void => {
        if (follower || disposed) return;
        const active = new AbortController();
        follower = active;
        void (async () => {
            for await (const input of deps.sync.follow({ signal: active.signal, events })) {
                if (input.kind === "error") continue;
                if (
                    input.kind === "bootstrap" ||
                    input.kind === "reconcile" ||
                    input.update.kind === "event" ||
                    input.update.kind === "connected"
                )
                    load();
            }
        })()
            .catch(() => undefined)
            .finally(() => {
                if (follower === active) follower = undefined;
            });
        load();
    };

    return {
        get: () => store.getState(),
        subscribe(listener) {
            listeners.add(listener);
            const unsubscribe = store.subscribe(listener);
            if (listeners.size === 1) follow();
            let released = false;
            return () => {
                if (released) return;
                released = true;
                unsubscribe();
                listeners.delete(listener);
                if (listeners.size === 0) {
                    follower?.abort();
                    follower = undefined;
                }
            };
        },
        [Symbol.dispose]() {
            disposed = true;
            follower?.abort();
            follower = undefined;
            listeners.clear();
        },
    };
}
