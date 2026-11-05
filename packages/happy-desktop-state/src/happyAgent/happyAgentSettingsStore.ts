import {
    HAPPY_AGENT_DEFAULT_THINKING_LEVEL,
    type HappyAgentPermissionMode,
    type HappyAgentThinkingLevel,
} from "./happyAgentTypes.js";
import type {
    HappyAgentModelPreferenceDocument,
    HappyAgentNewSessionStart,
} from "./happyAgentModelStore.js";

declare const happyAgentModelKeyBrand: unique symbol;

/**
 * One model inside one provider, as `${providerId}:${modelId}`. The catalog
 * reuses a model id across providers, so neither half identifies a row on its
 * own and a plain string would silently address the wrong provider's copy.
 */
export type HappyAgentModelKey = string & { readonly [happyAgentModelKeyBrand]: true };

export function happyAgentModelKey(providerId: string, modelId: string): HappyAgentModelKey {
    return `${providerId}:${modelId}` as HappyAgentModelKey;
}

/**
 * Where a clicked web link opens: the browser tab in the panel beside the
 * conversation, or the machine's own browser.
 */
export type HappyAgentLinkOpenPlacement = "panel" | "browser";

export interface HappyAgentSettingsSnapshot {
    /**
     * Unset until the reader picks a model here or starts a new session; the
     * catalog's own default stands in. While `newSessionStart` is
     * `lastStarted`, starting a new session replaces it, and `defaultEffort`,
     * with that session's. A model only: the provider a new session uses is
     * the one picked last.
     */
    readonly defaultModelId?: string;
    readonly defaultEffort: HappyAgentThinkingLevel;
    /** Whether a new session follows the last one started or stays on the default model. */
    readonly newSessionStart: HappyAgentNewSessionStart;
    /** Access granted to a new session before its composer overrides the choice. */
    readonly defaultPermissionMode: HappyAgentPermissionMode;
    /** Where a plain click on a web link goes. A link's own menu can still choose either. */
    readonly linkOpenPlacement: HappyAgentLinkOpenPlacement;
    /** Explicit machine-local opt-in to preview Desktop and Happy Agent releases. */
    readonly previewUpdatesEnabled: boolean;
    /** Models switched off for this workspace. Absent from the set means enabled. */
    readonly disabledModels: ReadonlySet<HappyAgentModelKey>;
}

/**
 * The local workspace's own preferences: which model a new session starts on and
 * which of the catalog's models the pickers are allowed to offer. It is the
 * reader's selection, not the daemon's. The concrete store stays memory-only;
 * its desktop host may seed it from local configuration and persist notifications
 * without turning those choices into server-confirmed state.
 */
export interface HappyAgentSettingsStore {
    get(): HappyAgentSettingsSnapshot;
    subscribe(listener: () => void): () => void;
    /** Chooses the model a new session starts on, on whichever provider was picked last. */
    defaultModelUpdate(modelId: string): void;
    defaultEffortUpdate(effort: HappyAgentThinkingLevel): void;
    newSessionStartUpdate(start: HappyAgentNewSessionStart): void;
    defaultPermissionModeUpdate(mode: HappyAgentPermissionMode): void;
    linkOpenPlacementUpdate(placement: HappyAgentLinkOpenPlacement): void;
    previewUpdatesUpdate(enabled: boolean): void;
    /** Offers or withholds one model in the session pickers. */
    modelEnabledUpdate(key: HappyAgentModelKey, enabled: boolean): void;
}

const EMPTY_DISABLED: ReadonlySet<HappyAgentModelKey> = new Set<HappyAgentModelKey>();

export interface HappyAgentSettingsInitial {
    readonly defaultModelId?: string;
    readonly defaultEffort?: HappyAgentThinkingLevel;
    readonly newSessionStart?: HappyAgentNewSessionStart;
    readonly defaultPermissionMode?: HappyAgentPermissionMode;
    readonly linkOpenPlacement?: HappyAgentLinkOpenPlacement;
    readonly previewUpdatesEnabled?: boolean;
}

/**
 * The settings the desktop document owns. The model defaults are deliberately
 * absent: they belong to the Happy Agent's model preference document and arrive
 * only through `modelPreferencesChanged`, so a desktop document that never
 * carried them cannot erase them.
 */
export type HappyAgentSettingsDesktop = Pick<
    HappyAgentSettingsInitial,
    "linkOpenPlacement" | "previewUpdatesEnabled"
>;

/** Creates the workspace-lifetime preference store; it opens no transport or timers. */
export function happyAgentSettingsStoreCreate(
    initial: HappyAgentSettingsInitial = {},
): HappyAgentSettingsStore {
    return happyAgentSettingsStoreOwnedCreate(initial).store;
}

/** The owner alone can deliver authoritative model preferences without expressing local intent. */
export function happyAgentSettingsStoreOwnedCreate(initial: HappyAgentSettingsInitial = {}) {
    const listeners = new Set<() => void>();
    let snapshot: HappyAgentSettingsSnapshot = {
        ...initial,
        defaultEffort: initial.defaultEffort ?? HAPPY_AGENT_DEFAULT_THINKING_LEVEL,
        newSessionStart: initial.newSessionStart ?? "lastStarted",
        defaultPermissionMode: initial.defaultPermissionMode ?? "auto",
        linkOpenPlacement: initial.linkOpenPlacement ?? "panel",
        previewUpdatesEnabled: initial.previewUpdatesEnabled ?? false,
        disabledModels: EMPTY_DISABLED,
    };

    const publish = (next: HappyAgentSettingsSnapshot): void => {
        snapshot = next;
        for (const listener of listeners) listener();
    };

    const store: HappyAgentSettingsStore = {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        defaultModelUpdate(modelId) {
            if (snapshot.defaultModelId === modelId) return;
            publish({ ...snapshot, defaultModelId: modelId });
        },
        defaultEffortUpdate(effort) {
            if (snapshot.defaultEffort === effort) return;
            publish({ ...snapshot, defaultEffort: effort });
        },
        newSessionStartUpdate(start) {
            if (snapshot.newSessionStart === start) return;
            publish({ ...snapshot, newSessionStart: start });
        },
        defaultPermissionModeUpdate(mode) {
            if (snapshot.defaultPermissionMode === mode) return;
            publish({ ...snapshot, defaultPermissionMode: mode });
        },
        linkOpenPlacementUpdate(placement) {
            if (snapshot.linkOpenPlacement === placement) return;
            publish({ ...snapshot, linkOpenPlacement: placement });
        },
        modelEnabledUpdate(key, enabled) {
            if (snapshot.disabledModels.has(key) === !enabled) return;
            const disabledModels = new Set(snapshot.disabledModels);
            if (enabled) disabledModels.delete(key);
            else disabledModels.add(key);
            publish({ ...snapshot, disabledModels });
        },
        previewUpdatesUpdate(enabled) {
            if (snapshot.previewUpdatesEnabled === enabled) return;
            publish({ ...snapshot, previewUpdatesEnabled: enabled });
        },
    };
    return {
        store,
        settingsReceived(next: HappyAgentSettingsDesktop): void {
            const linkOpenPlacement = next.linkOpenPlacement ?? "panel";
            const previewUpdatesEnabled = next.previewUpdatesEnabled ?? false;
            if (
                linkOpenPlacement === snapshot.linkOpenPlacement &&
                previewUpdatesEnabled === snapshot.previewUpdatesEnabled
            )
                return;
            publish({ ...snapshot, linkOpenPlacement, previewUpdatesEnabled });
        },
        modelPreferencesChanged(document: HappyAgentModelPreferenceDocument): void {
            const defaultModelId = document.defaultModelId;
            const defaultEffort = document.defaultEffort ?? HAPPY_AGENT_DEFAULT_THINKING_LEVEL;
            const defaultPermissionMode = document.defaultPermissionMode ?? "auto";
            const newSessionStart = document.newSessionStart ?? "lastStarted";
            if (
                snapshot.defaultModelId === defaultModelId &&
                snapshot.defaultEffort === defaultEffort &&
                snapshot.newSessionStart === newSessionStart &&
                snapshot.defaultPermissionMode === defaultPermissionMode
            )
                return;
            publish({
                ...snapshot,
                defaultModelId,
                defaultEffort,
                newSessionStart,
                defaultPermissionMode,
            });
        },
    };
}
