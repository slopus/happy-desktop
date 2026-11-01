import { expect, it, vi } from "vitest";
import {
    managedAnalyticsAllowed,
    managedPhonePairing,
    managedServers,
    managedSettingsPresent,
    managedSettingsStoreCreate,
} from "./managedSettingsStore.js";

it("leaves every choice to the person until a source reports a policy", () => {
    const { store } = managedSettingsStoreCreate();
    expect(store.get()).toEqual({ status: "absent" });
    expect(managedAnalyticsAllowed(store.get())).toBe(true);
    expect(managedPhonePairing(store.get())).toEqual({ relay: true, direct: true });
    expect(managedServers(store.get())).toEqual({ additionalAllowed: true });
});

it("sends no analytics while the policy is still being read", () => {
    const { store, writer } = managedSettingsStoreCreate();
    writer.managedSettingsLoading();
    expect(managedAnalyticsAllowed(store.get())).toBe(false);
    writer.managedSettingsAdopt({});
    expect(managedAnalyticsAllowed(store.get())).toBe(true);
    writer.managedSettingsAdopt({ analyticsEnabled: false });
    expect(managedAnalyticsAllowed(store.get())).toBe(false);
});

it("keeps phone pairing off under a policy unless the policy turns it on", () => {
    const { store, writer } = managedSettingsStoreCreate();
    writer.managedSettingsAdopt({});
    expect(managedSettingsPresent(store.get())).toBe(false);
    expect(managedPhonePairing(store.get())).toEqual({ relay: true, direct: true });
    writer.managedSettingsAdopt({ analyticsEnabled: false });
    expect(managedSettingsPresent(store.get())).toBe(true);
    expect(managedPhonePairing(store.get())).toEqual({ relay: false, direct: false });
    writer.managedSettingsAdopt({ phonePairingEnabled: false });
    expect(managedPhonePairing(store.get())).toEqual({ relay: false, direct: false });
    writer.managedSettingsAdopt({ phonePairingEnabled: true });
    expect(managedPhonePairing(store.get())).toEqual({ relay: true, direct: true });
});

it("closes each way of linking a phone that its key turns off", () => {
    const { store, writer } = managedSettingsStoreCreate();
    writer.managedSettingsAdopt({ phonePairingEnabled: true, hostedRelayEnabled: false });
    expect(managedPhonePairing(store.get())).toEqual({ relay: false, direct: true });
    writer.managedSettingsAdopt({ phonePairingEnabled: true, tailcatEnabled: false });
    expect(managedPhonePairing(store.get())).toEqual({ relay: true, direct: false });
    writer.managedSettingsAdopt({ hostedRelayEnabled: true, tailcatEnabled: true });
    expect(managedPhonePairing(store.get())).toEqual({ relay: false, direct: false });
});

it("notifies only when the policy changes", () => {
    const { store, writer } = managedSettingsStoreCreate();
    const listener = vi.fn();
    store.subscribe(listener);
    writer.managedSettingsAdopt({ serverUrl: "https://happy.corp.example" });
    writer.managedSettingsAdopt({ serverUrl: "https://happy.corp.example" });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(managedServers(store.get())).toEqual({
        preset: "https://happy.corp.example",
        additionalAllowed: true,
    });
});
