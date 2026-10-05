import { afterEach, expect, it, vi } from "vitest";
import { gptLiveStoreCreate } from "happy-desktop-state";
import { desktopGptLivePersistence } from "./desktopGptLive";

afterEach(() => vi.unstubAllGlobals());

it("persists only the GPT-Live preference and restores it on a new window store", () => {
    const records = new Map<string, string>();
    vi.stubGlobal("localStorage", {
        getItem: (key: string) => records.get(key) ?? null,
        setItem: (key: string, value: string) => records.set(key, value),
    });
    const first = gptLiveStoreCreate(desktopGptLivePersistence());
    expect(first.get().gptLiveEnabled).toBe(false);
    first.gptLiveEnabledUpdate(true);
    expect([...records]).toEqual([["happy.gpt-live.v1", '{"gptLiveEnabled":true}']]);
    const second = gptLiveStoreCreate(desktopGptLivePersistence());
    expect(second.get().gptLiveEnabled).toBe(true);
    second.gptLiveEnabledUpdate(false);
    expect(gptLiveStoreCreate(desktopGptLivePersistence()).get().gptLiveEnabled).toBe(false);
});

it("fails off for malformed browser storage", () => {
    vi.stubGlobal("localStorage", { getItem: () => "invalid JSON" });
    expect(gptLiveStoreCreate(desktopGptLivePersistence()).get().gptLiveEnabled).toBe(false);
});
