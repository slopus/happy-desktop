import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { HappyCloudRequest } from "./happyAgentProviderCredentials.js";
import {
    happyAgentPreviewsStoreCreate,
    type HappyAgentPreviewsStore,
} from "./happyAgentPreviewsStore.js";

const stores: HappyAgentPreviewsStore[] = [];
beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
});
afterEach(() => {
    for (const store of stores.splice(0)) store[Symbol.dispose]();
    vi.useRealTimers();
});

function setup() {
    const request = vi.fn<HappyCloudRequest>(async (_method, path) => ({
        previewId: path.split("/")[2],
        status: "ready",
    }));
    const store = happyAgentPreviewsStoreCreate({ request });
    stores.push(store);
    return { store, request };
}

it("does no transport work until a preview row is visible, and stops immediately when hidden", async () => {
    const { store, request } = setup();
    await vi.advanceTimersByTimeAsync(8_000);
    expect(request).not.toHaveBeenCalled();
    const unsubscribe = store.subscribe(() => undefined);
    let visible = false;
    const viewer = { live: () => visible };
    store.previewVisibilityUpdate(viewer, ["preview"]);
    await vi.advanceTimersByTimeAsync(8_000);
    expect(request).not.toHaveBeenCalled();

    visible = true;
    store.previewVisibilityUpdate(viewer, ["preview", "preview"]);
    await vi.advanceTimersByTimeAsync(0);
    expect(request.mock.calls).toEqual([["GET", "v0/previews/preview/status"]]);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(request).toHaveBeenCalledTimes(2);

    visible = false;
    store.previewVisibilityUpdate(viewer, []);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(12_000);
    expect(request).toHaveBeenCalledTimes(2);
    unsubscribe();
});

it("stops the polling timer when the last surface unsubscribes", async () => {
    const { store, request } = setup();
    const unsubscribe = store.subscribe(() => undefined);
    store.previewVisibilityUpdate({ live: () => true }, ["preview"]);
    await vi.advanceTimersByTimeAsync(0);
    expect(request).toHaveBeenCalledTimes(1);
    unsubscribe();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(request).toHaveBeenCalledTimes(1);
});

it("keeps another visible view current after one view hides", async () => {
    const { store, request } = setup();
    const first = { live: () => true };
    const second = { live: () => true };
    const unsubscribeFirst = store.subscribe(() => undefined);
    const unsubscribeSecond = store.subscribe(() => undefined);
    store.previewVisibilityUpdate(first, ["first"]);
    store.previewVisibilityUpdate(second, ["second"]);
    await vi.advanceTimersByTimeAsync(0);
    expect(request).toHaveBeenCalledTimes(2);

    store.previewVisibilityUpdate(first, []);
    unsubscribeFirst();
    await vi.advanceTimersByTimeAsync(4_000);
    expect(request.mock.calls).toEqual([
        ["GET", "v0/previews/first/status"],
        ["GET", "v0/previews/second/status"],
        ["GET", "v0/previews/second/status"],
    ]);
    unsubscribeSecond();
    expect(vi.getTimerCount()).toBe(0);
});
