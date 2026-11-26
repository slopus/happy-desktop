import { afterEach, describe, expect, it, vi } from "vitest";
import type {
    HappyAgentSync,
    HappyAgentSyncInput,
} from "../happyAgentConnection/happyAgentSync.js";
import { HappyCloudRequestRefusal } from "../happyAgent/happyAgentProviderCredentials.js";
import type { HappyAgentViewersActivity } from "../viewers/viewersStore.js";
import {
    accountFeatureEnabled,
    accountFeaturesStoreCreate,
    type AccountFeaturesStore,
} from "./accountFeaturesStore.js";

const FEATURES = "v0/account/features";
const OFF_REFUSAL = {
    error: "Pipelines are turned off for your account. Turn them on in your account settings to use them again.",
    code: "feature_not_installed",
    feature: "pipelines",
};

/** A server holding the account's Pipelines switch; records every request. */
function server(options: { readonly status?: number } = {}) {
    let enabled = true;
    const sent: { method: string; path: string; body?: unknown }[] = [];
    let putAnswer: ((answer: unknown) => void) | undefined;
    let putFail: ((error: unknown) => void) | undefined;
    const list = () => ({ features: [{ id: "pipelines", name: "Pipelines", enabled }] });
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
        if (path === `${FEATURES}/pipelines` && method === "PUT")
            return new Promise((resolve, reject) => {
                putAnswer = resolve;
                putFail = reject;
            });
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
        putAnswer(value: boolean) {
            enabled = value;
            putAnswer?.({ feature: { id: "pipelines", name: "Pipelines", enabled: value } });
        },
        putFail(error: unknown) {
            putFail?.(error);
        },
    };
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
        featuresUpdated(enabled: boolean): void {
            push({
                kind: "update",
                update: {
                    kind: "event",
                    event: {
                        cursor: "c1",
                        type: "account.features.updated",
                        occurredAt: 1_795_737_600_000,
                        payload: { features: [{ id: "pipelines", name: "Pipelines", enabled }] },
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

const disposables: AccountFeaturesStore[] = [];

function featuresStore(options: { readonly status?: number } = {}) {
    const fake = server(options);
    const live = connection();
    const focus = window();
    const created = accountFeaturesStoreCreate({
        request: fake.request,
        sync: live.sync,
        activity: focus.activity,
    });
    disposables.push(created.store);
    return { ...created, fake, live, focus };
}

const pipelinesOn = (store: AccountFeaturesStore) =>
    accountFeatureEnabled(store.get(), "pipelines");

afterEach(() => {
    for (const store of disposables.splice(0)) store[Symbol.dispose]();
});

describe("account features", () => {
    it("counts every feature on until the server answers, then keeps the list it answered", async () => {
        const { store, fake } = featuresStore();
        fake.set(false);
        expect(store.get().loading).toBe(true);
        expect(pipelinesOn(store)).toBe(true);

        store.subscribe(() => undefined);
        await vi.waitFor(() => expect(store.get().loading).toBe(false));
        expect(store.get().served).toBe(true);
        expect(store.get().features).toEqual([
            { id: "pipelines", name: "Pipelines", enabled: false },
        ]);
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
            expect(store.get().error).toBeUndefined();
        },
    );

    it("switches a feature with the server, showing the value asked for until it answers", async () => {
        const { store, fake } = featuresStore();
        store.subscribe(() => undefined);
        await vi.waitFor(() => expect(store.get().loading).toBe(false));

        store.featureEnabledUpdate("pipelines", false);
        expect(fake.sent.at(-1)).toEqual({
            method: "PUT",
            path: `${FEATURES}/pipelines`,
            body: { enabled: false },
        });
        expect(store.get().pending.get("pipelines")).toBe(false);
        // Nothing is hidden on the strength of the request alone.
        expect(pipelinesOn(store)).toBe(true);

        fake.putAnswer(false);
        await vi.waitFor(() => expect(pipelinesOn(store)).toBe(false));
        expect(store.get().pending.size).toBe(0);
    });

    it("keeps the feature as it was and says why when a switch fails", async () => {
        const { store, fake } = featuresStore();
        store.subscribe(() => undefined);
        await vi.waitFor(() => expect(store.get().loading).toBe(false));

        store.featureEnabledUpdate("pipelines", false);
        fake.putFail(
            new HappyCloudRequestRefusal("The server is busy.", undefined, 503, undefined),
        );
        await vi.waitFor(() => expect(store.get().error?.message).toBe("The server is busy."));
        expect(store.get().pending.size).toBe(0);
        expect(pipelinesOn(store)).toBe(true);

        // The next switch clears it.
        store.featureEnabledUpdate("pipelines", false);
        expect(store.get().error).toBeUndefined();
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
