import type { PipelineRunStore } from "./pipelineRunStore.js";

/** Runs one window keeps: those opened or pointed at last. */
export const PIPELINE_RUN_CACHE_LIMIT = 20;
/** Preloads in flight at once, so a pointer sweeping down the runs reads a few, not all of them. */
export const PIPELINE_RUN_PRELOADS_CONCURRENT = 2;

/**
 * The runs one window keeps, each a live store. A run read once opens at once
 * from what was read; the least recently used is let go past the limit, never
 * one a reader is subscribed to or one still being preloaded.
 */
export interface PipelineRunCache {
    /** The run's store, made when it is not kept; counts as a use. */
    get(runId: string): PipelineRunStore;
    /** The run's store when it is kept, without counting as a use. */
    peek(runId: string): PipelineRunStore | undefined;
    /**
     * Reads a run ahead of a likely open. The run pointed at last is read
     * next; one already read is left as it is.
     */
    preload(runId: string): void;
    [Symbol.dispose](): void;
}

export function pipelineRunCacheCreate(deps: {
    readonly create: (runId: string) => PipelineRunStore;
    readonly limit?: number;
    readonly concurrent?: number;
}): PipelineRunCache {
    const limit = deps.limit ?? PIPELINE_RUN_CACHE_LIMIT;
    const concurrent = deps.concurrent ?? PIPELINE_RUN_PRELOADS_CONCURRENT;
    /** Least recently used first. */
    const stores = new Map<string, PipelineRunStore>();
    /** Runs waiting to be preloaded, the latest intent first. */
    const queue: string[] = [];
    const preloading = new Set<string>();
    let disposed = false;

    const trim = (keep: string): void => {
        for (const [runId, store] of stores) {
            if (stores.size <= limit) return;
            if (runId === keep || preloading.has(runId) || store.subscribed()) continue;
            stores.delete(runId);
            store[Symbol.dispose]();
        }
    };

    const get = (runId: string): PipelineRunStore => {
        if (disposed) throw new Error("The pipeline run cache is disposed.");
        let store = stores.get(runId);
        if (store) stores.delete(runId);
        else store = deps.create(runId);
        stores.set(runId, store);
        trim(runId);
        return store;
    };

    const pump = (): void => {
        while (!disposed && preloading.size < concurrent && queue.length > 0) {
            const runId = queue.shift()!;
            const store = get(runId);
            if (!store.get().loading) continue;
            preloading.add(runId);
            void store.preload().then(() => {
                preloading.delete(runId);
                pump();
            });
        }
    };

    return {
        get,
        peek: (runId) => stores.get(runId),
        preload(runId) {
            if (disposed || preloading.has(runId)) return;
            // Read already: a live run is following, and an ended one never changes.
            const kept = stores.get(runId);
            if (kept && !kept.get().loading) return;
            const queued = queue.indexOf(runId);
            if (queued >= 0) queue.splice(queued, 1);
            queue.unshift(runId);
            // Intents the pointer left long ago are dropped rather than read late.
            if (queue.length > limit) queue.length = limit;
            pump();
        },
        [Symbol.dispose]() {
            disposed = true;
            queue.length = 0;
            for (const store of stores.values()) store[Symbol.dispose]();
            stores.clear();
            preloading.clear();
        },
    };
}
