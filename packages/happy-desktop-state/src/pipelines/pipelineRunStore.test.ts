import { afterEach, describe, expect, it, vi } from "vitest";
import type {
    HappyAgentSync,
    HappyAgentSyncInput,
} from "../happyAgentConnection/happyAgentSync.js";
import { HappyCloudRequestRefusal } from "../happyAgent/happyAgentProviderCredentials.js";
import { pipelineNodeLogStoreCreate, type PipelineNodeLogStore } from "./pipelineNodeLogStore.js";
import { pipelineRunStoreCreate, type PipelineRunStore } from "./pipelineRunStore.js";
import type { PipelineRunState } from "./pipelineTypes.js";

const RUN = "v0/pipeline-runs/r1";
const LOG = `${RUN}/nodes/n1/log`;

/** A server whose run is in `state()`; records every path read. */
function server(state: () => PipelineRunState) {
    const read: string[] = [];
    const request = vi.fn((_method: string, path: string): Promise<unknown> => {
        read.push(path);
        if (path === RUN)
            return Promise.resolve({
                run: {
                    id: "r1",
                    pipelineId: "p1",
                    version: 1,
                    state: state(),
                    createdAt: 1,
                    nodes: [],
                    childRunIds: [],
                },
            });
        if (path.startsWith(LOG))
            return Promise.resolve({ entries: [{ seq: 1, at: 1, kind: "message", text: "hi" }] });
        return Promise.resolve({});
    });
    return { request, runReads: () => read.filter((path) => path === RUN).length, read };
}

/** A connection whose events and reconnects the test sends one by one. */
function connection() {
    const queue: HappyAgentSyncInput[] = [];
    let wake: (() => void) | undefined;
    const sync: HappyAgentSync = {
        async *follow({ signal }) {
            // As a connected connection greets each new follower.
            yield { kind: "reconcile" };
            while (!signal.aborted) {
                const next = queue.shift();
                if (next) {
                    yield next;
                    continue;
                }
                await new Promise<void>((resume) => {
                    wake = resume;
                    signal.addEventListener("abort", () => resume(), { once: true });
                });
            }
        },
        health: () => undefined,
    };
    const push = (input: HappyAgentSyncInput): void => {
        queue.push(input);
        wake?.();
    };
    return {
        sync,
        event(type: string): void {
            push({
                kind: "update",
                update: { kind: "event", event: { type, payload: {} } } as never,
            });
        },
        reconnect(): void {
            push({ kind: "update", update: { kind: "connected" } as never });
        },
    };
}

/** Lets reads that would follow a hint start and land. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

const disposables: (PipelineRunStore | PipelineNodeLogStore)[] = [];

function runStore(state: () => PipelineRunState) {
    const fake = server(state);
    const live = connection();
    const store = pipelineRunStoreCreate({ runId: "r1", request: fake.request, sync: live.sync });
    disposables.push(store);
    return { store, fake, live };
}

afterEach(() => {
    for (const store of disposables.splice(0)) store[Symbol.dispose]();
});

describe("pipeline run cache lifetime", () => {
    it("preloads a run before it is opened, then opens at once and reads again behind it", async () => {
        const { store, fake } = runStore(() => "running");
        await store.preload();
        expect(store.get().loading).toBe(false);
        expect(store.get().run?.state).toBe("running");
        expect(fake.runReads()).toBe(1);

        store.subscribe(() => undefined);
        // Shown from what the preload read, with no loading in between.
        expect(store.get().loading).toBe(false);
        expect(store.get().run?.id).toBe("r1");
        await vi.waitFor(() => expect(fake.runReads()).toBe(2));
    });

    it("keeps a live run current off screen, and reads it again on reconnect", async () => {
        let state: PipelineRunState = "running";
        const { store, fake, live } = runStore(() => state);
        await store.preload();
        await settle();
        const reads = fake.runReads();

        live.event("pipeline.node.updated");
        await vi.waitFor(() => expect(fake.runReads()).toBe(reads + 1));

        state = "succeeded";
        live.reconnect();
        await vi.waitFor(() => expect(store.get().run?.state).toBe("succeeded"));
    });

    it("reads an ended run once: opening it, events and reconnects read nothing", async () => {
        const { store, fake, live } = runStore(() => "succeeded");
        await store.preload();
        await settle();
        expect(fake.runReads()).toBe(1);

        const unsubscribe = store.subscribe(() => undefined);
        expect(store.get().run?.state).toBe("succeeded");
        live.event("pipeline.run.updated");
        live.reconnect();
        await settle();
        unsubscribe();
        store.subscribe(() => undefined);
        await settle();
        expect(fake.runReads()).toBe(1);
    });

    it("stops following a run once a read finds it ended", async () => {
        let state: PipelineRunState = "running";
        const { store, fake, live } = runStore(() => state);
        store.subscribe(() => undefined);
        await vi.waitFor(() => expect(store.get().run?.state).toBe("running"));
        await settle();

        state = "failed";
        live.event("pipeline.run.updated");
        await vi.waitFor(() => expect(store.get().run?.state).toBe("failed"));
        const reads = fake.runReads();
        live.event("pipeline.run.updated");
        live.reconnect();
        await settle();
        expect(fake.runReads()).toBe(reads);
    });

    it("lets a run that is not live stop following once it is left", async () => {
        const { store, fake, live } = runStore(() => "aborted");
        const unsubscribe = store.subscribe(() => undefined);
        await vi.waitFor(() => expect(store.get().loading).toBe(false));
        unsubscribe();
        await settle();
        const reads = fake.runReads();
        live.reconnect();
        await settle();
        expect(fake.runReads()).toBe(reads);
    });

    it("stops following a preloaded run the server says is not there", async () => {
        const live = connection();
        const request = vi.fn(
            (): Promise<unknown> =>
                Promise.reject(
                    new HappyCloudRequestRefusal("Run not found", "not_found", 404, {
                        error: "Run not found",
                    }),
                ),
        );
        const store = pipelineRunStoreCreate({ runId: "gone", request, sync: live.sync });
        disposables.push(store);
        await store.preload();
        expect(store.get()).toMatchObject({ loading: false, missing: true, run: null });
        const reads = request.mock.calls.length;

        // Other pipelines keep running while nobody looks at this one.
        for (let index = 0; index < 3; index += 1) {
            live.event("pipeline.run.updated");
            await settle();
        }
        live.reconnect();
        await settle();
        expect(request.mock.calls.length).toBe(reads);
    });
});

describe("pipeline node log of an ended run", () => {
    function logStore(runEnded: () => boolean) {
        const fake = server(() => "succeeded");
        const live = connection();
        const store = pipelineNodeLogStoreCreate({
            runId: "r1",
            nodeId: "n1",
            request: fake.request,
            sync: live.sync,
            runEnded,
        });
        disposables.push(store);
        return { store, logReads: () => fake.read.filter((path) => path.startsWith(LOG)).length };
    }

    it("is read to its end once, and not again when it is opened again", async () => {
        const { store, logReads } = logStore(() => true);
        const unsubscribe = store.subscribe(() => undefined);
        await vi.waitFor(() => expect(store.get().entries).toHaveLength(1));
        unsubscribe();
        store.subscribe(() => undefined);
        await settle();
        expect(logReads()).toBe(1);
    });

    it("is read again on open while its run is live", async () => {
        const { store, logReads } = logStore(() => false);
        const unsubscribe = store.subscribe(() => undefined);
        await vi.waitFor(() => expect(store.get().entries).toHaveLength(1));
        unsubscribe();
        store.subscribe(() => undefined);
        await vi.waitFor(() => expect(logReads()).toBe(2));
    });
});
