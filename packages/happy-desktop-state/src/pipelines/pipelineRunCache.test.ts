import { describe, expect, it } from "vitest";
import { pipelineRunCacheCreate } from "./pipelineRunCache.js";
import type { PipelineRunSnapshot, PipelineRunStore } from "./pipelineRunStore.js";

/** A run store whose preload the test answers, and whose readers it counts. */
function fakeStore(runId: string) {
    let loading = true;
    let readers = 0;
    let answer: (() => void) | undefined;
    const store = {
        runId,
        disposed: false,
        preloads: 0,
        get: () => ({ loading }) as PipelineRunSnapshot,
        subscribe() {
            readers += 1;
            return () => {
                readers -= 1;
            };
        },
        subscribed: () => readers > 0,
        preload() {
            store.preloads += 1;
            return new Promise<void>((resolve) => {
                answer = () => {
                    loading = false;
                    resolve();
                };
            });
        },
        /** The server answers the preload. */
        answer() {
            answer?.();
        },
        nodeSelect: () => undefined,
        runAbort: () => undefined,
        [Symbol.dispose]() {
            store.disposed = true;
        },
    };
    return store;
}

function cache(options: { limit?: number; concurrent?: number } = {}) {
    const made = new Map<string, ReturnType<typeof fakeStore>>();
    const runs = pipelineRunCacheCreate({
        create: (runId) => {
            const store = fakeStore(runId);
            made.set(runId, store);
            return store as PipelineRunStore;
        },
        ...options,
    });
    return { runs, made };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("pipeline run cache", () => {
    it("preloads two runs at once, the one pointed at last first", async () => {
        const { runs, made } = cache({ concurrent: 2 });
        for (const runId of ["a", "b", "c", "d"]) runs.preload(runId);
        expect([...made.keys()]).toEqual(["a", "b"]);

        made.get("a")!.answer();
        await flush();
        // "d" was pointed at after "c", so it is read before it.
        expect([...made.keys()]).toEqual(["a", "b", "d"]);
        made.get("b")!.answer();
        await flush();
        expect([...made.keys()]).toEqual(["a", "b", "d", "c"]);
    });

    it("does not preload a run already read", async () => {
        const { runs, made } = cache();
        runs.preload("a");
        made.get("a")!.answer();
        await flush();
        runs.preload("a");
        runs.preload("a");
        expect(made.get("a")!.preloads).toBe(1);
    });

    it("lets the least recently used run go past the limit, never one on screen", () => {
        const { runs, made } = cache({ limit: 2 });
        runs.get("a").subscribe(() => undefined);
        runs.get("b");
        runs.get("c");
        // "a" is the oldest but on screen, so "b" goes.
        expect(made.get("a")!.disposed).toBe(false);
        expect(made.get("b")!.disposed).toBe(true);
        expect(runs.peek("b")).toBeUndefined();

        // Opening "a" again finds the same store.
        expect(runs.get("a")).toBe(made.get("a"));
        runs.get("d");
        expect(made.get("c")!.disposed).toBe(true);
        expect(runs.peek("a")).toBe(made.get("a"));
    });

    it("lets every kept run go when it is disposed", () => {
        const { runs, made } = cache();
        runs.get("a");
        runs.preload("b");
        runs[Symbol.dispose]();
        expect(made.get("a")!.disposed).toBe(true);
        expect(made.get("b")!.disposed).toBe(true);
    });
});
