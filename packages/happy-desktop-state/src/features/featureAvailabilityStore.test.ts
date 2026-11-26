import { afterEach, describe, expect, it, vi } from "vitest";
import type {
    HappyAgentSync,
    HappyAgentSyncInput,
} from "../happyAgentConnection/happyAgentSync.js";
import { HappyCloudRequestRefusal } from "../happyAgent/happyAgentProviderCredentials.js";
import type { HappyAgentViewersActivity } from "../viewers/viewersStore.js";
import {
    featureAvailable,
    featureAvailabilityStoreCreate,
    type FeatureAvailabilityStore,
} from "./featureAvailabilityStore.js";

const FEATURES = "v0/features";
const OFF_REFUSAL = {
    error: "Pipelines are not installed for your account. Install the Pipelines plugin to use them again.",
    code: "feature_not_installed",
    feature: "pipelines",
    plugin: "pipelines",
};

/** A server where the person has the Pipelines feature plugin installed or not; records every request. */
function server(options: { readonly status?: number } = {}) {
    let enabled = true;
    const sent: { method: string; path: string; body?: unknown }[] = [];
    const list = () => ({ features: [{ id: "pipelines", available: enabled }] });
    const request = vi.fn((method: string, path: string, body?: unknown): Promise<unknown> => {
        sent.push({ method, path, ...(body === undefined ? {} : { body }) });
        if (path === FEATURES && method === "GET") {
            if (options.status !== undefined)
                return Promise.reject(
                    new HappyCloudRequestRefusal(
                        "No such route.",
                        options.status === 404 ? "not_found" : undefined,
                        options.status,
                        undefined,
                    ),
                );
            return Promise.resolve(list());
        }
        if (path.startsWith("v0/pipelines"))
            return enabled
                ? Promise.resolve({ pipelines: [] })
                : Promise.reject(
                      new HappyCloudRequestRefusal(
                          OFF_REFUSAL.error,
                          OFF_REFUSAL.code,
                          403,
                          OFF_REFUSAL,
                      ),
                  );
        return Promise.resolve({});
    });
    return {
        request,
        sent,
        reads: () =>
            sent.filter((entry) => entry.method === "GET" && entry.path === FEATURES).length,
        set(value: boolean) {
            enabled = value;
        },
    };
}

/** A connection whose events and reconnects the test sends one by one. */
function connection(options: { readonly features?: boolean } = {}) {
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
        // Happy Cloud says `features`, which the daemon's protocol does not name.
        health: () =>
            ({ capabilities: { features: options.features ?? true } }) as unknown as ReturnType<
                HappyAgentSync["health"]
            >,
    };
    const push = (input: HappyAgentSyncInput): void => {
        queue.push(input);
        wake?.();
    };
    return {
        sync,
        featuresUpdated(enabled: boolean): void {
            push({
                kind: "update",
                update: {
                    kind: "event",
                    event: {
                        cursor: "c1",
                        type: "features.updated",
                        occurredAt: 1_795_737_600_000,
                        payload: { features: [{ id: "pipelines", available: enabled }] },
                    },
                } as never,
            });
        },
        reconnect(): void {
            push({ kind: "update", update: { kind: "connected" } as never });
        },
    };
}

/** A window the person leaves and comes back to. */
function window() {
    let active = true;
    const listeners = new Set<() => void>();
    const activity: HappyAgentViewersActivity = {
        active: () => active,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
    return {
        activity,
        set(value: boolean) {
            active = value;
            for (const listener of listeners) listener();
        },
    };
}

/** Lets reads that would follow a hint start and land. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

const disposables: FeatureAvailabilityStore[] = [];

function featuresStore(options: { readonly status?: number; readonly features?: boolean } = {}) {
    const fake = server(options);
    const live = connection(options);
    const focus = window();
    const created = featureAvailabilityStoreCreate({
        request: fake.request,
        sync: live.sync,
        activity: focus.activity,
    });
    disposables.push(created.store);
    return { ...created, fake, live, focus };
}

const pipelinesOn = (store: FeatureAvailabilityStore) => featureAvailable(store.get(), "pipelines");

afterEach(() => {
    for (const store of disposables.splice(0)) store[Symbol.dispose]();
});

describe("feature availability", () => {
    it("counts every feature on until the server answers, then keeps the list it answered", async () => {
        const { store, fake } = featuresStore();
        fake.set(false);
        expect(store.get().loading).toBe(true);
        expect(pipelinesOn(store)).toBe(true);

        store.subscribe(() => undefined);
        await vi.waitFor(() => expect(store.get().loading).toBe(false));
        expect(store.get().served).toBe(true);
        expect(store.get().features).toEqual([{ id: "pipelines", available: false }]);
        expect(pipelinesOn(store)).toBe(false);
    });

    it("replaces the list with the event's, live, without reading again", async () => {
        const { store, fake, live } = featuresStore();
        store.subscribe(() => undefined);
        await vi.waitFor(() => expect(store.get().loading).toBe(false));
        await settle();
        const reads = fake.reads();

        live.featuresUpdated(false);
        await vi.waitFor(() => expect(pipelinesOn(store)).toBe(false));
        live.featuresUpdated(true);
        await vi.waitFor(() => expect(pipelinesOn(store)).toBe(true));
        await settle();
        expect(fake.reads()).toBe(reads);
    });

    it("reads again on a reconnect and when the window comes back to the foreground", async () => {
        const { store, fake, live, focus } = featuresStore();
        store.subscribe(() => undefined);
        await vi.waitFor(() => expect(store.get().loading).toBe(false));
        await settle();

        fake.set(false);
        live.reconnect();
        await vi.waitFor(() => expect(pipelinesOn(store)).toBe(false));
        await settle();

        // Leaving the window reads nothing; coming back reads once.
        const reads = fake.reads();
        fake.set(true);
        focus.set(false);
        await settle();
        expect(fake.reads()).toBe(reads);
        focus.set(true);
        await vi.waitFor(() => expect(pipelinesOn(store)).toBe(true));
        expect(fake.reads()).toBe(reads + 1);
    });

    it("stops reading once nothing watches it", async () => {
        const { store, fake, live, focus } = featuresStore();
        const unsubscribe = store.subscribe(() => undefined);
        await vi.waitFor(() => expect(store.get().loading).toBe(false));
        await settle();
        unsubscribe();
        const reads = fake.reads();

        live.reconnect();
        focus.set(false);
        focus.set(true);
        await settle();
        expect(fake.reads()).toBe(reads);
    });

    it.each([404, 501])(
        "has every feature on, with nothing to switch, on a server that answers %i",
        async (status) => {
            const { store } = featuresStore({ status });
            store.subscribe(() => undefined);
            await vi.waitFor(() => expect(store.get().loading).toBe(false));
            expect(store.get().served).toBe(false);
            expect(store.get().features).toEqual([]);
            expect(pipelinesOn(store)).toBe(true);
        },
    );

    it("has every feature available, reading nothing, where health does not say features", async () => {
        const { store, fake } = featuresStore({ features: false });
        store.subscribe(() => undefined);
        await vi.waitFor(() => expect(store.get().loading).toBe(false));
        expect(store.get().served).toBe(false);
        expect(pipelinesOn(store)).toBe(true);
        expect(fake.reads()).toBe(0);
    });

    it("turns a feature off when its route refuses because it is off, and still rejects", async () => {
        const { store, writer, fake } = featuresStore();
        store.subscribe(() => undefined);
        await vi.waitFor(() => expect(store.get().loading).toBe(false));
        const request = writer.requestWatch(fake.request);

        fake.set(false);
        await expect(request("GET", "v0/pipelines")).rejects.toMatchObject({
            status: 403,
            code: "feature_not_installed",
        });
        expect(pipelinesOn(store)).toBe(false);
    });

    it("ignores a refusal sent before the feature was turned back on", async () => {
        const { store, writer, live } = featuresStore();
        store.subscribe(() => undefined);
        await vi.waitFor(() => expect(store.get().loading).toBe(false));
        let refuse: ((error: unknown) => void) | undefined;
        const request = writer.requestWatch(
            () =>
                new Promise((_resolve, reject) => {
                    refuse = reject;
                }),
        );

        const answer = request("GET", "v0/pipelines");
        live.featuresUpdated(true);
        await settle();
        refuse?.(
            new HappyCloudRequestRefusal(OFF_REFUSAL.error, OFF_REFUSAL.code, 403, OFF_REFUSAL),
        );
        await expect(answer).rejects.toBeInstanceOf(HappyCloudRequestRefusal);
        expect(pipelinesOn(store)).toBe(true);
    });

    it("passes any other refusal through untouched", async () => {
        const { store, writer } = featuresStore();
        const request = writer.requestWatch(() =>
            Promise.reject(new HappyCloudRequestRefusal("Forbidden.", "forbidden", 403, {})),
        );
        await expect(request("GET", "v0/pipelines")).rejects.toMatchObject({ code: "forbidden" });
        expect(pipelinesOn(store)).toBe(true);
    });
});
