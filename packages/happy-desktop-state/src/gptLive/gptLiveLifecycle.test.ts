import { describe, expect, it, vi } from "vitest";
import { gptLiveStoreCreate, gptLiveExperimentsConnect } from "./gptLiveStore";
import { experimentsStoreCreate } from "../experiments/experimentsStore";
import { gptLiveRuntimeFixtureCreate } from "./testing/gptLiveRuntimeFixture";
import type {
    GptLiveAvailability,
    GptLiveCall,
    GptLiveOutputLevels,
    GptLiveRuntime,
    GptLiveRuntimeEvent,
} from "./gptLiveRuntime";
import { UserError } from "../types";

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
        close: vi.fn(async () => {}),
        microphoneMutedUpdate: vi.fn(),
        outputLevelsRead: vi.fn((): GptLiveOutputLevels => [0, 0, 0]),
    };
    const runtime: GptLiveRuntime = {
        availabilityRead: vi.fn(async () => available),
        callOpen: vi.fn((_input, listener, lifetime) => {
            receive = listener;
            signal = lifetime;
            return opening.promise;
        }),
    };
    const runtimeFor = vi.fn((_connectionId: string) => runtime);
    const store = gptLiveStoreCreate(undefined, runtimeFor);
    const start = async (connectionId = "local") => {
        store.gptLiveEnabledUpdate(true);
        store.availabilityRead(connectionId);
        await Promise.resolve();
        store.accountSelect(connectionId, "codex");
        store.callStart(connectionId);
    };
    return {
        store,
        runtime,
        runtimeFor,
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
            () => live.runtime,
            experiments,
        );
        const stop = gptLiveExperimentsConnect(store, experiments);
        try {
            expect(store.get().gptLiveEnabled).toBe(false);
            store.gptLiveEnabledUpdate(true);
            store.callStart("local");
            expect(live.daemon.calls).toHaveLength(0);
            expect(live.stats.permissionStarts).toBe(0);
            experiments.featureUpdate("voice", true, "experiments");
            store.gptLiveEnabledUpdate(true);
            store.availabilityRead("local");
            await vi.waitFor(() =>
                expect(store.get().availability.get("local")).toMatchObject({ status: "ready" }),
            );
            store.accountSelect("local", "codex");
            store.callStart("local");
            await vi.waitFor(() => expect(live.stats.socketOpens).toBe(1));
            live.hello();
            live.mediaReady();
            live.active();
            await vi.waitFor(() => expect(store.get().call.kind).toBe("active"));
            experiments.featureUpdate("voice", false, "experiments");
            expect(store.get().gptLiveEnabled).toBe(false);
            expect(store.get().call).toEqual({ kind: "idle" });
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
        vi.mocked(f.call.close).mockImplementation(async () =>
            expect(f.signal()?.aborted).toBe(false),
        );
        f.store.callEnd();
        expect(f.call.close).toHaveBeenCalledTimes(1);
        expect(f.signal()?.aborted).toBe(true);
    });
    it("can read and choose the account while calls are off without enabling or opening a call", async () => {
        const { store, runtime } = fixture();
        const unsubscribe = store.subscribe(() => {});
        store.availabilityRead("local");
        await Promise.resolve();
        store.callStart("local");
        store.accountSelect("local", "codex");
        expect(runtime.availabilityRead).toHaveBeenCalledTimes(1);
        expect(runtime.callOpen).not.toHaveBeenCalled();
        expect(store.get().call).toEqual({ kind: "idle" });
        expect(store.get().accountIds.get("local")).toBe("codex");
        expect(store.get().gptLiveEnabled).toBe(false);
        unsubscribe();
    });

    it("persists an account choice while off as an off preference", async () => {
        const write = vi.fn();
        const { runtime } = fixture();
        const store = gptLiveStoreCreate({ read: () => undefined, write }, () => runtime);
        store.availabilityRead("connection:remote");
        await Promise.resolve();
        store.accountSelect("connection:remote", "codex");
        expect(write).toHaveBeenCalledWith({
            gptLiveEnabled: false,
            accountIds: { "connection:remote": "codex" },
        });
        const saved = write.mock.calls.at(-1)![0];
        expect(
            gptLiveStoreCreate({ read: () => saved, write: () => {} })
                .get()
                .accountIds.get("connection:remote"),
        ).toBe("codex");
        store.callStart("connection:remote");
        expect(runtime.callOpen).not.toHaveBeenCalled();
        store.gptLiveEnabledUpdate(true);
        expect(store.get().accountIds.get("connection:remote")).toBe("codex");
        expect(runtime.callOpen).not.toHaveBeenCalled();
    });

    it("restored opt-in never starts recording or opens transport", () => {
        const { runtime } = fixture();
        const store = gptLiveStoreCreate(
            { read: () => ({ gptLiveEnabled: true }), write: vi.fn() },
            () => runtime,
        );
        store.subscribe(() => {});
        expect(store.get().call).toEqual({ kind: "idle" });
        expect(runtime.callOpen).not.toHaveBeenCalled();
        expect(runtime.availabilityRead).not.toHaveBeenCalled();
    });

    it("closes a late microphone/call grant after disable and ignores late events", async () => {
        const f = fixture();
        await f.start();
        expect(f.store.get().call.kind).toBe("connecting");
        f.store.gptLiveEnabledUpdate(false);
        expect(f.signal()?.aborted).toBe(true);
        f.receive({ type: "callActive" });
        f.opening.resolve(f.call);
        await Promise.resolve();
        expect(f.call.close).toHaveBeenCalledTimes(1);
        expect(f.store.get().call).toEqual({ kind: "idle" });
    });

    it("does not equate an opened media/control handle with provider readiness", async () => {
        const f = fixture();
        await f.start();
        f.opening.resolve(f.call);
        await Promise.resolve();
        expect(f.store.get().call.kind).toBe("connecting");
        f.receive({ type: "callActive" });
        expect(f.store.get().call).toMatchObject({ kind: "active", connectionId: "local" });
        f.store.microphoneMutedUpdate(true);
        expect(f.call.microphoneMutedUpdate).toHaveBeenLastCalledWith(true);
        f.store.callEnd();
        expect(f.call.close).toHaveBeenCalledTimes(1);
        expect(f.signal()?.aborted).toBe(true);
        expect(f.store.get().call).toEqual({ kind: "idle" });
    });

    it("deduplicates Start and reports draft staging without opening another surface", async () => {
        const f = fixture();
        await f.start();
        f.store.callStart("local");
        expect(f.runtime.callOpen).toHaveBeenCalledTimes(1);
        f.opening.resolve(f.call);
        await Promise.resolve();
        f.receive({ type: "callActive" });
        f.receive({
            type: "actionStatusUpdated",
            message: "Review the draft in the conversation composer.",
        });
        expect(f.store.get().actionStatus).toBe("Review the draft in the conversation composer.");
    });

    it("disabling while a Start waits for availability opens nothing", async () => {
        const availability = pending<GptLiveAvailability>();
        const runtime: GptLiveRuntime = {
            availabilityRead: () => availability.promise,
            callOpen: vi.fn(),
        };
        const store = gptLiveStoreCreate(
            {
                read: () => ({ gptLiveEnabled: false, accountIds: { local: "codex" } }),
                write: () => {},
            },
            () => runtime,
        );
        store.gptLiveEnabledUpdate(true);
        store.callStart("local");
        expect(store.get().call).toMatchObject({ kind: "connecting", step: "checking" });
        store.gptLiveEnabledUpdate(false);
        availability.resolve(available);
        await Promise.resolve();
        await Promise.resolve();
        expect(store.get().call).toEqual({ kind: "idle" });
        expect(runtime.callOpen).not.toHaveBeenCalled();
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
        f.receive({ type: "callFailed", message: "late", problem: "connection" });
        f.store.callStart("local");
        expect(f.call.close).toHaveBeenCalledTimes(1);
        expect(f.signal()?.aborted).toBe(true);
        expect(listener).not.toHaveBeenCalled();
        expect(f.runtime.callOpen).toHaveBeenCalledTimes(1);
    });

    it("binds the call to the agent it was started on and refuses a second agent while live", async () => {
        const f = fixture();
        await f.start("connection:remote");
        expect(f.runtimeFor).toHaveBeenLastCalledWith("connection:remote");
        f.receive({ type: "callStepUpdated", step: "allocating" });
        expect(f.store.get().call).toMatchObject({
            kind: "connecting",
            connectionId: "connection:remote",
            step: "allocating",
        });
        f.opening.resolve(f.call);
        await Promise.resolve();
        f.receive({ type: "callActive" });
        expect(f.store.get().call).toMatchObject({
            kind: "active",
            connectionId: "connection:remote",
            muted: false,
        });
        f.store.availabilityRead("local");
        await Promise.resolve();
        f.store.accountSelect("local", "codex");
        f.store.callStart("local");
        expect(f.runtime.callOpen).toHaveBeenCalledTimes(1);
        expect(f.store.get().call).toMatchObject({ connectionId: "connection:remote" });
    });

    it("keeps why an agent's call stopped until the person ends it or calls again", async () => {
        const f = fixture();
        await f.start("connection:remote");
        f.opening.resolve(f.call);
        await Promise.resolve();
        f.receive({ type: "callActive" });
        f.receive({
            type: "callFailed",
            message: "Voice control disconnected. Start a new call to reconnect.",
            problem: "connection",
        });
        expect(f.store.get().call).toEqual({
            kind: "ended",
            connectionId: "connection:remote",
            problem: "connection",
            message: "Voice control disconnected. Start a new call to reconnect.",
        });
        f.store.callEnd();
        expect(f.store.get().call).toEqual({ kind: "idle" });
    });

    it("ends with the problem a refused open names, and idles when it was cancelled", async () => {
        const runtime: GptLiveRuntime = {
            availabilityRead: async () => available,
            callOpen: vi
                .fn()
                .mockRejectedValueOnce(
                    new UserError("Microphone access was denied.", "microphonePermission"),
                )
                .mockRejectedValueOnce(new UserError("The voice call ended.", "cancelled"))
                .mockRejectedValueOnce(new Error("socket hang up")),
        };
        const store = gptLiveStoreCreate(
            {
                read: () => ({ gptLiveEnabled: true, accountIds: { local: "codex" } }),
                write: () => {},
            },
            () => runtime,
        );
        store.callStart("local");
        await vi.waitFor(() =>
            expect(store.get().call).toMatchObject({
                kind: "ended",
                problem: "microphonePermission",
            }),
        );
        store.callStart("local");
        await vi.waitFor(() => expect(store.get().call).toEqual({ kind: "idle" }));
        store.callStart("local");
        await vi.waitFor(() =>
            expect(store.get().call).toMatchObject({
                kind: "ended",
                problem: "connection",
                message: "The voice call could not connect.",
            }),
        );
    });

    it("ends with the agent's own reason when it cannot host voice, opening nothing", async () => {
        const runtime: GptLiveRuntime = {
            availabilityRead: async () => ({
                supported: false,
                problem: "agentOffline",
                reason: "Remote Lab isn't connected. Calls on it work again once it reconnects.",
                accounts: [],
            }),
            callOpen: vi.fn(),
        };
        const store = gptLiveStoreCreate(
            { read: () => ({ gptLiveEnabled: true }), write: () => {} },
            () => runtime,
        );
        store.callStart("connection:remote");
        await vi.waitFor(() =>
            expect(store.get().call).toEqual({
                kind: "ended",
                connectionId: "connection:remote",
                problem: "agentOffline",
                message: "Remote Lab isn't connected. Calls on it work again once it reconnects.",
            }),
        );
        expect(runtime.callOpen).not.toHaveBeenCalled();
    });

    it("asks for an account on the agent being called, not one chosen on another agent", async () => {
        const f = fixture();
        f.store.gptLiveEnabledUpdate(true);
        f.store.availabilityRead("local");
        await Promise.resolve();
        f.store.accountSelect("local", "codex");
        f.store.callStart("connection:remote");
        await vi.waitFor(() =>
            expect(f.store.get().call).toMatchObject({
                kind: "ended",
                connectionId: "connection:remote",
                problem: "notSetUp",
                message: "Choose a voice account for this agent in Voice settings.",
            }),
        );
        expect(f.runtime.callOpen).not.toHaveBeenCalled();
    });

    it("reads the call's received levels only while active, and never notifies for them", async () => {
        const f = fixture();
        vi.mocked(f.call.outputLevelsRead).mockReturnValue([0.1, 0.2, 0.3]);
        expect(f.store.outputLevelsRead()).toEqual([0, 0, 0]);
        await f.start();
        f.opening.resolve(f.call);
        await Promise.resolve();
        expect(f.store.outputLevelsRead()).toEqual([0, 0, 0]);
        const listener = vi.fn();
        f.store.subscribe(listener);
        f.receive({ type: "callActive" });
        listener.mockClear();
        expect(f.store.outputLevelsRead()).toEqual([0.1, 0.2, 0.3]);
        expect(listener).not.toHaveBeenCalled();
        f.store.callEnd();
        expect(f.store.outputLevelsRead()).toEqual([0, 0, 0]);
    });
});
