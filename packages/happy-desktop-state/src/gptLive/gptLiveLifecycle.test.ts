import { describe, expect, it, vi } from "vitest";
import { gptLiveStoreCreate, gptLiveExperimentsConnect } from "./gptLiveStore";
import { experimentsStoreCreate } from "../experiments/experimentsStore";
import { gptLiveRuntimeFixtureCreate } from "./testing/gptLiveRuntimeFixture";
import type {
    GptLiveAvailability,
    GptLiveCall,
    GptLiveRuntime,
    GptLiveRuntimeEvent,
} from "./gptLiveRuntime";

const available: GptLiveAvailability = {
    supported: true,
    accounts: [
        { id: "codex", label: "Codex subscription", providerId: "codex", kind: "subscription" },
    ],
};

function pending<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<T>((done, fail) => {
        resolve = done;
        reject = fail;
    });
    return { promise, resolve, reject };
}

function fixture() {
    const opening = pending<GptLiveCall>();
    let signal: AbortSignal | undefined;
    let receive: (event: GptLiveRuntimeEvent) => void = () => {};
    const call: GptLiveCall = {
        close: vi.fn(),
        microphoneMutedUpdate: vi.fn(),
    };
    const runtime: GptLiveRuntime = {
        availabilityRead: vi.fn(async () => available),
        callOpen: vi.fn((_input, listener, lifetime) => {
            receive = listener;
            signal = lifetime;
            return opening.promise;
        }),
    };
    const store = gptLiveStoreCreate(undefined, runtime);
    const start = async () => {
        store.gptLiveEnabledUpdate(true);
        store.availabilityRead();
        await Promise.resolve();
        store.accountSelect("codex");
        store.callStart();
    };
    return {
        store,
        runtime,
        call,
        opening,
        start,
        receive: (event: GptLiveRuntimeEvent) => receive(event),
        signal: () => signal,
    };
}

describe("GPT-Live call lifetime", () => {
    it("blocks saved voice while experiments are off and withdraws an active call through its normal close path", async () => {
        const experiments = experimentsStoreCreate();
        const live = gptLiveRuntimeFixtureCreate();
        const store = gptLiveStoreCreate(
            { read: () => ({ gptLiveEnabled: true }), write: () => {} },
            live.runtime,
            experiments,
        );
        const stop = gptLiveExperimentsConnect(store, experiments);
        try {
            expect(store.get().gptLiveEnabled).toBe(false);
            store.gptLiveEnabledUpdate(true);
            store.panelOpen();
            store.callStart();
            expect(live.daemon.calls).toHaveLength(0);
            expect(live.stats.permissionStarts).toBe(0);
            experiments.experimentalFeaturesUpdate(true);
            store.gptLiveEnabledUpdate(true);
            store.panelOpen();
            await vi.waitFor(() => expect(store.get().availability?.supported).toBe(true));
            store.accountSelect("codex");
            store.callStart();
            await vi.waitFor(() => expect(live.stats.socketOpens).toBe(1));
            live.hello();
            live.mediaReady();
            live.active();
            await vi.waitFor(() => expect(store.get().status).toBe("active"));
            experiments.experimentalFeaturesUpdate(false);
            expect(store.get().gptLiveEnabled).toBe(false);
            expect(store.get().panelVisible).toBe(false);
            expect(live.stats.mediaSilences).toBe(1);
            expect(live.stats.subscriptions).toBe(0);
            await vi.waitFor(() => expect(live.closeRequests()).toHaveLength(1));
            live.status("closed");
            expect(live.stats.mediaCloses).toBe(1);
            expect(live.stats.socketCloses).toBe(1);
            expect(live.daemon.callCount("abortAgent")).toBe(0);
        } finally {
            stop();
            store[Symbol.dispose]();
        }
    });
    it("starts graceful local close before cancelling the opening signal", async () => {
        const f = fixture();
        await f.start();
        f.opening.resolve(f.call);
        await Promise.resolve();
        vi.mocked(f.call.close).mockImplementation(() => expect(f.signal()?.aborted).toBe(false));
        f.store.callEnd();
        expect(f.call.close).toHaveBeenCalledTimes(1);
        expect(f.signal()?.aborted).toBe(true);
    });
    it("is completely inert off, including subscribers and Start attempts", () => {
        const { store, runtime } = fixture();
        const unsubscribe = store.subscribe(() => {});
        store.availabilityRead();
        store.callStart();
        store.accountSelect("codex");
        expect(runtime.availabilityRead).not.toHaveBeenCalled();
        expect(runtime.callOpen).not.toHaveBeenCalled();
        expect(store.get().status).toBe("disabled");
        unsubscribe();
    });

    it("restored opt-in never starts recording or opens transport", () => {
        const { runtime } = fixture();
        const store = gptLiveStoreCreate(
            { read: () => ({ gptLiveEnabled: true }), write: vi.fn() },
            runtime,
        );
        store.subscribe(() => {});
        expect(store.get().status).toBe("idle");
        expect(runtime.callOpen).not.toHaveBeenCalled();
        expect(runtime.availabilityRead).not.toHaveBeenCalled();
    });

    it("closes a late microphone/call grant after disable and ignores late events", async () => {
        const f = fixture();
        await f.start();
        expect(f.store.get().status).toBe("connecting");
        f.store.gptLiveEnabledUpdate(false);
        expect(f.signal()?.aborted).toBe(true);
        f.receive({ type: "callActive" });
        f.opening.resolve(f.call);
        await Promise.resolve();
        expect(f.call.close).toHaveBeenCalledTimes(1);
        expect(f.store.get().status).toBe("disabled");
    });

    it("does not equate an opened media/control handle with provider readiness", async () => {
        const f = fixture();
        await f.start();
        f.opening.resolve(f.call);
        await Promise.resolve();
        expect(f.store.get().status).toBe("connecting");
        f.receive({ type: "callActive" });
        expect(f.store.get().status).toBe("active");
        f.store.microphoneMutedUpdate(true);
        expect(f.call.microphoneMutedUpdate).toHaveBeenLastCalledWith(true);
        f.store.callEnd();
        expect(f.call.close).toHaveBeenCalledTimes(1);
        expect(f.signal()?.aborted).toBe(true);
        expect(f.store.get().status).toBe("idle");
    });

    it("deduplicates Start and reports draft staging without opening another surface", async () => {
        const f = fixture();
        await f.start();
        f.store.callStart();
        expect(f.runtime.callOpen).toHaveBeenCalledTimes(1);
        f.opening.resolve(f.call);
        await Promise.resolve();
        f.receive({ type: "callActive" });
        f.receive({
            type: "actionStatusUpdated",
            message: "Review the draft in the conversation composer.",
        });
        expect(f.store.get().actionStatus).toBe("Review the draft in the conversation composer.");
        expect(f.store.get().panelVisible).toBe(false);
    });

    it("aborts availability on disable without republishing a late success", async () => {
        const availability = pending<GptLiveAvailability>();
        const runtime: GptLiveRuntime = {
            availabilityRead: () => availability.promise,
            callOpen: vi.fn(),
        };
        const store = gptLiveStoreCreate(undefined, runtime);
        store.gptLiveEnabledUpdate(true);
        store.availabilityRead();
        store.gptLiveEnabledUpdate(false);
        availability.resolve(available);
        await Promise.resolve();
        expect(store.get().status).toBe("disabled");
        expect(store.get().availability).toBeUndefined();
    });

    it("disposal tears down once and rejects every stale update", async () => {
        const f = fixture();
        await f.start();
        f.opening.resolve(f.call);
        await Promise.resolve();
        const listener = vi.fn();
        f.store.subscribe(listener);
        f.store[Symbol.dispose]();
        f.store[Symbol.dispose]();
        f.receive({ type: "callFailed", message: "late" });
        f.store.callStart();
        expect(f.call.close).toHaveBeenCalledTimes(1);
        expect(f.signal()?.aborted).toBe(true);
        expect(listener).not.toHaveBeenCalled();
        expect(f.runtime.callOpen).toHaveBeenCalledTimes(1);
    });
});
