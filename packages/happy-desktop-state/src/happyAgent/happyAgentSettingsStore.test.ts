import { expect, it } from "vitest";
import { happyAgentSettingsStoreOwnedCreate } from "./happyAgentSettingsStore.js";

it("keeps the model defaults when the desktop document arrives without them", () => {
    const owned = happyAgentSettingsStoreOwnedCreate();
    owned.modelPreferencesChanged({
        defaultModelId: "anthropic/opus-5-5",
        defaultEffort: "high",
        defaultPermissionMode: "full_access",
        preferences: {},
    });

    owned.settingsReceived({ linkOpenPlacement: "browser" });

    expect(owned.store.get()).toMatchObject({
        defaultModelId: "anthropic/opus-5-5",
        defaultEffort: "high",
        defaultPermissionMode: "full_access",
        linkOpenPlacement: "browser",
    });
});

it("follows the last session by default and takes where new sessions start from the model preferences", () => {
    const owned = happyAgentSettingsStoreOwnedCreate();
    expect(owned.store.get().newSessionStart).toBe("lastStarted");

    owned.modelPreferencesChanged({ newSessionStart: "default", preferences: {} });
    expect(owned.store.get().newSessionStart).toBe("default");

    owned.store.newSessionStartUpdate("lastStarted");
    expect(owned.store.get().newSessionStart).toBe("lastStarted");
});
