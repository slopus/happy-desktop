import { expect, it, vi } from "vitest";
import { desktopPreferencesCreate } from "./desktopPreferences";
import type { DesktopConfig, HappyDesktopBridge } from "../shared/desktopContract";

it("retains Ultrafast in the desktop document and restores it without losing unrelated preferences", () => {
    const initial: DesktopConfig = {
        appearance: "dark",
        defaultEffort: "high",
        defaultPermissionMode: "auto",
        scrollbarVisibility: "always",
        titleShimmerEnabled: false,
        version: 1,
        modelPreferences: [
            { providerId: "codex", modelId: "astra", lastEffort: "high", lastSpeed: "ultrafast" },
        ],
    };
    const desktopConfigWrite = vi.fn(async (_config: DesktopConfig) => undefined);
    const bridge = { desktopConfigWrite } as unknown as HappyDesktopBridge;
    const adapter = desktopPreferencesCreate(bridge, initial);
    expect(adapter.preferencePersistence.read()?.preferences.codex?.astra?.serviceTier).toBe(
        "ultrafast",
    );
    const document = adapter.preferencePersistence.read()!;
    adapter.preferencePersistence.write(document);
    const saved = desktopConfigWrite.mock.calls[0]![0];
    expect(saved.modelPreferences[0]?.lastSpeed).toBe("ultrafast");
    expect(saved).toMatchObject({
        appearance: "dark",
        scrollbarVisibility: "always",
        titleShimmerEnabled: false,
    });
    const reopened = desktopPreferencesCreate(bridge, saved);
    expect(reopened.preferencePersistence.read()?.preferences.codex?.astra?.serviceTier).toBe(
        "ultrafast",
    );
});
