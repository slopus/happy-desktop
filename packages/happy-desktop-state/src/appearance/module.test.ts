import { describe, expect, it } from "vitest";
import { appearanceStoreCreate } from "./appearanceStore.js";
import { customThemeEmpty } from "./customTheme.js";

/** A controllable stand-in for the platform appearance and its change events. */
function platform(initial: "dark" | "light" = "light") {
    let current = initial;
    const listeners = new Set<() => void>();
    return {
        subscriberCount: () => listeners.size,
        set(next: "dark" | "light") {
            current = next;
            for (const listener of listeners) listener();
        },
        options: {
            systemAppearance: () => current,
            systemAppearanceSubscribe: (listener: () => void) => {
                listeners.add(listener);
                return () => listeners.delete(listener);
            },
        },
    };
}

describe("appearance store", () => {
    it("resolves the system mode against the platform and follows its changes", () => {
        const system = platform("light");
        const store = appearanceStoreCreate(system.options);
        const seen: string[] = [];
        const unsubscribe = store.subscribe(() => seen.push(store.get().appearance));

        expect(store.get()).toEqual({
            mode: "system",
            appearance: "light",
            palette: "light",
            customTheme: customThemeEmpty,
            scrollbarVisibility: "automatic",
            avatarsAnimated: false,
        });

        system.set("dark");
        expect(store.get()).toEqual({
            mode: "system",
            appearance: "dark",
            palette: "dark",
            customTheme: customThemeEmpty,
            scrollbarVisibility: "automatic",
            avatarsAnimated: false,
        });
        expect(seen).toEqual(["dark"]);

        unsubscribe();
        store[Symbol.dispose]();
    });

    it("pins the opposite of what is rendered when toggled from system", () => {
        const system = platform("dark");
        const store = appearanceStoreCreate(system.options);
        const unsubscribe = store.subscribe(() => undefined);

        expect(store.get().appearance).toBe("dark");
        store.appearanceToggle();
        // From system-dark the toggle means "give me light", explicitly.
        expect(store.get()).toEqual({
            mode: "light",
            appearance: "light",
            palette: "light",
            customTheme: customThemeEmpty,
            scrollbarVisibility: "automatic",
            avatarsAnimated: false,
        });

        store.appearanceToggle();
        expect(store.get()).toEqual({
            mode: "dark",
            appearance: "dark",
            palette: "dark",
            customTheme: customThemeEmpty,
            scrollbarVisibility: "automatic",
            avatarsAnimated: false,
        });

        unsubscribe();
        store[Symbol.dispose]();
    });

    it("ignores the platform once an explicit mode is selected", () => {
        const system = platform("light");
        const store = appearanceStoreCreate(system.options);
        const seen: string[] = [];
        const unsubscribe = store.subscribe(() => seen.push(store.get().appearance));

        store.appearanceSelect("dark");
        expect(seen).toEqual(["dark"]);

        // An explicit selection is authoritative: a platform change is not a
        // notification and does not alter the rendered appearance.
        system.set("dark");
        system.set("light");
        expect(store.get()).toEqual({
            mode: "dark",
            appearance: "dark",
            palette: "dark",
            customTheme: customThemeEmpty,
            scrollbarVisibility: "automatic",
            avatarsAnimated: false,
        });
        expect(seen).toEqual(["dark"]);

        // Returning to system re-resolves against the platform.
        store.appearanceSelect("system");
        expect(store.get()).toEqual({
            mode: "system",
            appearance: "light",
            palette: "light",
            customTheme: customThemeEmpty,
            scrollbarVisibility: "automatic",
            avatarsAnimated: false,
        });

        unsubscribe();
        store[Symbol.dispose]();
    });

    it("observes the platform only while a subscriber needs it", () => {
        const system = platform("light");
        const store = appearanceStoreCreate(system.options);

        // The constructor opens nothing.
        expect(system.subscriberCount()).toBe(0);

        const unsubscribe = store.subscribe(() => undefined);
        expect(system.subscriberCount()).toBe(1);

        // An explicit mode no longer depends on the platform, so stop watching.
        store.appearanceSelect("dark");
        expect(system.subscriberCount()).toBe(0);
        store.appearanceSelect("system");
        expect(system.subscriberCount()).toBe(1);

        unsubscribe();
        expect(system.subscriberCount()).toBe(0);
        store[Symbol.dispose]();
    });

    it("starts in an explicit mode when asked and notifies only on real changes", () => {
        const system = platform("light");
        const store = appearanceStoreCreate({ ...system.options, mode: "dark" });
        const seen: string[] = [];
        const unsubscribe = store.subscribe(() => seen.push(store.get().appearance));

        expect(store.get()).toEqual({
            mode: "dark",
            appearance: "dark",
            palette: "dark",
            customTheme: customThemeEmpty,
            scrollbarVisibility: "automatic",
            avatarsAnimated: false,
        });
        // Re-selecting the current mode is not a change.
        store.appearanceSelect("dark");
        expect(seen).toEqual([]);

        unsubscribe();
        store[Symbol.dispose]();
    });
});
