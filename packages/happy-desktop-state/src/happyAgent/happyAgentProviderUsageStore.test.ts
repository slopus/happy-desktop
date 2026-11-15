import { afterEach, expect, it, vi } from "vitest";
import {
    happyAgentProviderUsageStoreCreate,
    type HappyAgentProviderUsageEntry,
    type HappyAgentProviderUsageSource,
    type HappyAgentProviderUsageSourceReading,
} from "./happyAgentProviderUsageStore.js";

/* The store holds the latest reading and follows the source only while
 * something watches, and for a short while after, so a remounted watcher takes
 * over a source still following. Once the source has stopped, it starts again
 * with the next watcher however recent the reading: a refresh asked for on
 * opening answers only through the source's later readings. */

afterEach(() => {
    vi.useRealTimers();
});

function sourceCreate() {
    const listeners = new Set<(reading: HappyAgentProviderUsageSourceReading) => void>();
    const refresh = vi.fn<(providerIds: readonly string[]) => void>();
    const tokensRelease = vi.fn();
    const tokensFollow = vi.fn(() => tokensRelease);
    let subscriptions = 0;
    const source: HappyAgentProviderUsageSource = {
        subscribe(listener) {
            subscriptions += 1;
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        refresh,
        recheck: () => Promise.resolve(),
        tokensFollow,
    };
    return {
        source,
        refresh,
        tokensFollow,
        tokensRelease,
        subscriptions: () => subscriptions,
        live: () => listeners.size,
        emit(reading: HappyAgentProviderUsageSourceReading) {
            for (const listener of listeners) listener(reading);
        },
    };
}

const CLAUDE: HappyAgentProviderUsageEntry = {
    providerId: "claude",
    refreshedAt: 1_000,
    usage: { capturedAt: 1_000, fiveHour: { usedPercent: 20 } },
};

it("keeps following for a remounted watcher instead of starting the source again", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const fake = sourceCreate();
    const store = happyAgentProviderUsageStoreCreate({ source: fake.source });

    // Each conversation opened in turn unmounts one model pill and mounts another.
    let release = store.subscribe(() => undefined);
    fake.emit({ loading: false, loadedAt: Date.now(), providers: [CLAUDE] });
    for (let opened = 0; opened < 3; opened += 1) {
        release();
        vi.advanceTimersByTime(2_000);
        release = store.subscribe(() => undefined);
    }
    expect(fake.subscriptions()).toBe(1);
    expect(fake.live()).toBe(1);
    expect(store.get().providers).toEqual([CLAUDE]);

    // Nobody came back, so the source stops.
    release();
    vi.advanceTimersByTime(29_999);
    expect(fake.live()).toBe(1);
    vi.advanceTimersByTime(1);
    expect(fake.live()).toBe(0);
    store[Symbol.dispose]();
});

it("stops a lingering source at once when disposed", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const fake = sourceCreate();
    const store = happyAgentProviderUsageStoreCreate({ source: fake.source });
    store.subscribe(() => undefined)();
    expect(fake.live()).toBe(1);
    store[Symbol.dispose]();
    expect(fake.live()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
});

it("passes token following on to the source", () => {
    const fake = sourceCreate();
    const store = happyAgentProviderUsageStoreCreate({ source: fake.source });
    const release = store.tokensFollow();
    expect(fake.tokensFollow).toHaveBeenCalledTimes(1);
    release();
    expect(fake.tokensRelease).toHaveBeenCalledTimes(1);

    store[Symbol.dispose]();
    store.tokensFollow()();
    expect(fake.tokensFollow).toHaveBeenCalledTimes(1);
});

it("follows the source again for a watcher after it stopped, even right after a reading", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const fake = sourceCreate();
    const store = happyAgentProviderUsageStoreCreate({ source: fake.source });

    const release = store.subscribe(() => undefined);
    fake.emit({ loading: false, loadedAt: Date.now(), providers: [CLAUDE] });
    release();
    vi.advanceTimersByTime(30_000);
    expect(fake.live()).toBe(0);

    const again = store.subscribe(() => undefined);
    expect(fake.subscriptions()).toBe(2);
    // The held reading shows at once while the source reads again.
    expect(store.get().providers).toEqual([CLAUDE]);
    fake.emit({ loading: true, providers: [] });
    expect(store.get()).toMatchObject({ loading: false, providers: [CLAUDE] });
    again();
});

it("replaces an account with each reading the source reports", () => {
    const fake = sourceCreate();
    const store = happyAgentProviderUsageStoreCreate({ source: fake.source });
    const release = store.subscribe(() => undefined);

    fake.emit({ loading: false, loadedAt: 1, providers: [CLAUDE] });
    const refreshing = { ...CLAUDE, refreshing: true };
    fake.emit({ loading: false, loadedAt: 1, providers: [refreshing] });
    expect(store.get().providers).toEqual([refreshing]);

    const spent: HappyAgentProviderUsageEntry = {
        providerId: "claude",
        refreshedAt: 2_000,
        usage: { capturedAt: 2_000, exhausted: true, fiveHour: { usedPercent: 100 } },
    };
    fake.emit({ loading: false, loadedAt: 1, providers: [spent] });
    expect(store.get().providers).toEqual([spent]);
    release();
});

it("passes a refresh on to the source without claiming anything itself", () => {
    const fake = sourceCreate();
    const store = happyAgentProviderUsageStoreCreate({ source: fake.source });
    const notified = vi.fn();
    const release = store.subscribe(notified);
    fake.emit({ loading: false, loadedAt: 1, providers: [CLAUDE] });
    notified.mockClear();

    store.usageRefresh(["claude", "claude_extra"]);
    expect(fake.refresh).toHaveBeenCalledWith(["claude", "claude_extra"]);
    expect(notified).not.toHaveBeenCalled();
    expect(store.get().providers).toEqual([CLAUDE]);

    store.usageRefresh([]);
    expect(fake.refresh).toHaveBeenCalledTimes(1);
    // Naming no account asks about every one.
    store.usageRefresh();
    expect(fake.refresh).toHaveBeenLastCalledWith(undefined);
    release();

    store[Symbol.dispose]();
    store.usageRefresh(["claude"]);
    expect(fake.refresh).toHaveBeenCalledTimes(2);
});
