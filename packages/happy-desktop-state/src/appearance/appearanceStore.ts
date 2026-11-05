import {
    customThemeEmpty,
    customThemeEqual,
    type CustomTheme,
    type ThemePalette,
} from "./customTheme.js";

/**
 * The appearance surface: the selected and resolved theme, the window's
 * scrollbar visibility behavior, and whether avatar placeholders move.
 *
 * It exists because appearance is product state, not React state: every
 * workspace renders one `ThemeScope` from it instead of carrying a separate
 * theme implementation. Keeping it here also keeps the selection out of the
 * application layer, which may not own React state.
 *
 * Following the state principles, the constructor opens nothing. The system
 * appearance is observed only while the store has a subscriber and only while
 * the mode actually depends on it, so a backgrounded surface does no work.
 */
export type ThemeMode = "custom" | "dark" | "light" | "midnight" | "system";
export type ScrollbarVisibility = "always" | "automatic";

export interface AppearanceSnapshot {
    /** The user's selection. `system` defers to the platform appearance. */
    readonly mode: ThemeMode;
    /** The colour scheme actually rendered: midnight is dark, custom is its base's. */
    readonly appearance: "dark" | "light";
    /** The built-in palette rendered, after resolving `system` and `custom`. */
    readonly palette: ThemePalette;
    /** The hand-made fourth theme, rendered only while `mode` is `custom`. */
    readonly customTheme: CustomTheme;
    /** Whether overflowing surfaces keep their scrollbar visible at rest. */
    readonly scrollbarVisibility: ScrollbarVisibility;
    /**
     * Animated avatars, as on the phone: placeholders are drawn live by their
     * shader rather than shown as their stills. Kept by this window, on unless
     * turned off.
     */
    readonly avatarsAnimated: boolean;
}

export interface AppearanceStore {
    /** Modes supported by the host, fixed for this store's lifetime. */
    readonly supportedModes: readonly ThemeMode[];
    get(): AppearanceSnapshot;
    subscribe(listener: () => void): () => void;
    /**
     * Flips to the opposite of the appearance currently rendered. From `system`
     * this pins the explicit opposite of what the platform is showing, which is
     * what a single toggle control means to the person pressing it.
     */
    appearanceToggle(): void;
    /** Selects a mode directly, including returning to `system`. */
    appearanceSelect(mode: ThemeMode): void;
    scrollbarVisibilitySelect(visibility: ScrollbarVisibility): void;
    avatarsAnimatedUpdate(animated: boolean): void;
    [Symbol.dispose](): void;
}

/** Private input from the host that owns the custom theme document. */
export interface AppearanceWriter {
    configReceived(config: {
        readonly mode: ThemeMode;
        readonly customTheme: CustomTheme;
        readonly scrollbarVisibility: ScrollbarVisibility;
    }): void;
}

/** Media query the `system` mode resolves against. */
const DARK_QUERY = "(prefers-color-scheme: dark)";

export interface AppearanceStoreOptions {
    readonly supportedModes?: readonly ThemeMode[];
    /** Initial selection; defaults to following the platform. */
    readonly mode?: ThemeMode;
    /** Initial custom theme; defaults to an untouched midnight. */
    readonly customTheme?: CustomTheme;
    /** Initial scrollbar behavior; defaults to automatic. */
    readonly scrollbarVisibility?: ScrollbarVisibility;
    /** Initial Animated avatars; defaults to on. */
    readonly avatarsAnimated?: boolean;
    /**
     * Injected platform appearance source. Supplying it keeps this store free of
     * a `window` dependency in tests and in any non-browser host.
     */
    readonly systemAppearance?: () => "dark" | "light";
    /** Injected subscription to platform appearance changes; returns an unsubscribe. */
    readonly systemAppearanceSubscribe?: (listener: () => void) => () => void;
}

function browserSystemAppearance(): "dark" | "light" {
    return globalThis.matchMedia?.(DARK_QUERY).matches ? "dark" : "light";
}

function browserSystemAppearanceSubscribe(listener: () => void): () => void {
    const query = globalThis.matchMedia?.(DARK_QUERY);
    if (!query) return () => undefined;
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
}

/** Creates an appearance store whose custom theme no host delivers. */
export function appearanceStoreCreate(options: AppearanceStoreOptions = {}): AppearanceStore {
    return appearanceStoreOwnedCreate(options).store;
}

/**
 * Creates an appearance store with the writer its host delivers the custom
 * theme through. The platform appearance source is injectable so tests drive it
 * deterministically. Listeners are notified only when the resolved snapshot
 * actually changes, so a platform change that the current mode ignores is not a
 * notification.
 */
export function appearanceStoreOwnedCreate(options: AppearanceStoreOptions = {}): {
    readonly store: AppearanceStore;
    readonly writer: AppearanceWriter;
} {
    const systemAppearance = options.systemAppearance ?? browserSystemAppearance;
    const systemSubscribe = options.systemAppearanceSubscribe ?? browserSystemAppearanceSubscribe;

    const listeners = new Set<() => void>();
    const supportedModes = options.supportedModes ?? [
        "system",
        "dark",
        "light",
        "midnight",
        "custom",
    ];
    let mode: ThemeMode =
        options.mode && supportedModes.includes(options.mode) ? options.mode : "system";
    let toggleReturn: ThemeMode | undefined;
    let customTheme = options.customTheme ?? customThemeEmpty;
    let scrollbarVisibility: ScrollbarVisibility = options.scrollbarVisibility ?? "automatic";
    let avatarsAnimated = options.avatarsAnimated ?? true;
    const paletteResolve = (): ThemePalette =>
        mode === "system" ? systemAppearance() : mode === "custom" ? customTheme.base : mode;
    const resolve = (): AppearanceSnapshot => {
        const palette = paletteResolve();
        return {
            mode,
            appearance: palette === "light" ? "light" : "dark",
            palette,
            customTheme,
            scrollbarVisibility,
            avatarsAnimated,
        };
    };
    let snapshot = resolve();
    let systemUnsubscribe: (() => void) | undefined;
    let disposed = false;

    const publish = (): void => {
        const next = resolve();
        if (
            snapshot.mode === next.mode &&
            snapshot.palette === next.palette &&
            snapshot.customTheme === next.customTheme &&
            snapshot.scrollbarVisibility === next.scrollbarVisibility &&
            snapshot.avatarsAnimated === next.avatarsAnimated
        )
            return;
        snapshot = next;
        for (const listener of listeners) listener();
    };

    // The platform is only worth observing while a subscriber exists and the
    // current mode actually resolves against it.
    const systemWatchSync = (): void => {
        const wanted = mode === "system" && listeners.size > 0 && !disposed;
        if (wanted && systemUnsubscribe === undefined) systemUnsubscribe = systemSubscribe(publish);
        else if (!wanted && systemUnsubscribe !== undefined) {
            systemUnsubscribe();
            systemUnsubscribe = undefined;
        }
    };

    const modeSet = (next: ThemeMode): void => {
        if (!supportedModes.includes(next)) return;
        if (mode === next) return;
        mode = next;
        publish();
        systemWatchSync();
    };

    const store: AppearanceStore = {
        supportedModes,
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            if (listeners.size === 1) {
                // A platform change may have landed while nothing was listening.
                publish();
                systemWatchSync();
            }
            return () => {
                listeners.delete(listener);
                systemWatchSync();
            };
        },
        appearanceToggle() {
            const opposite = snapshot.appearance === "dark" ? "light" : "dark";
            if (toggleReturn !== undefined) {
                const target = toggleReturn;
                toggleReturn = undefined;
                modeSet(target);
            } else {
                if (mode === "custom" || mode === "midnight") toggleReturn = mode;
                modeSet(opposite);
            }
        },
        appearanceSelect(next) {
            toggleReturn = undefined;
            modeSet(next);
        },
        scrollbarVisibilitySelect(next) {
            if (scrollbarVisibility === next) return;
            scrollbarVisibility = next;
            publish();
        },
        avatarsAnimatedUpdate(animated) {
            if (avatarsAnimated === animated) return;
            avatarsAnimated = animated;
            publish();
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            listeners.clear();
            systemWatchSync();
        },
    };
    const writer: AppearanceWriter = {
        configReceived(config) {
            mode = supportedModes.includes(config.mode) ? config.mode : "system";
            customTheme = customThemeEqual(customTheme, config.customTheme)
                ? customTheme
                : config.customTheme;
            scrollbarVisibility = config.scrollbarVisibility;
            toggleReturn = undefined;
            publish();
            systemWatchSync();
        },
    };
    return { store, writer };
}
