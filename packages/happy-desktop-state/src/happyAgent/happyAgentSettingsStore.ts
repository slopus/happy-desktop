import {
    HAPPY_AGENT_DEFAULT_THINKING_LEVEL,
    type HappyAgentPermissionMode,
    type HappyAgentThinkingLevel,
} from "./happyAgentTypes.js";

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
    /** Unset until the reader picks a model; the catalog's own default stands in. */
    readonly defaultProviderId?: string;
    readonly defaultModelId?: string;
    readonly defaultEffort: HappyAgentThinkingLevel;
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
    /** Chooses the model a new session starts on, together with its provider. */
    defaultModelUpdate(providerId: string, modelId: string): void;
    defaultEffortUpdate(effort: HappyAgentThinkingLevel): void;
    defaultPermissionModeUpdate(mode: HappyAgentPermissionMode): void;
    linkOpenPlacementUpdate(placement: HappyAgentLinkOpenPlacement): void;
    previewUpdatesUpdate(enabled: boolean): void;
    /** Offers or withholds one model in the session pickers. */
    modelEnabledUpdate(key: HappyAgentModelKey, enabled: boolean): void;
}

const EMPTY_DISABLED: ReadonlySet<HappyAgentModelKey> = new Set<HappyAgentModelKey>();

export interface HappyAgentSettingsInitial {
    readonly defaultProviderId?: string;
    readonly defaultModelId?: string;
    readonly defaultEffort?: HappyAgentThinkingLevel;
    readonly defaultPermissionMode?: HappyAgentPermissionMode;
    readonly linkOpenPlacement?: HappyAgentLinkOpenPlacement;
    readonly previewUpdatesEnabled?: boolean;
}

/** Creates the workspace-lifetime preference store; it opens no transport or timers. */
export function happyAgentSettingsStoreCreate(
    initial: HappyAgentSettingsInitial = {},
): HappyAgentSettingsStore {
    const listeners = new Set<() => void>();
    let snapshot: HappyAgentSettingsSnapshot = {
        ...initial,
        defaultEffort: initial.defaultEffort ?? HAPPY_AGENT_DEFAULT_THINKING_LEVEL,
        defaultPermissionMode: initial.defaultPermissionMode ?? "auto",
        linkOpenPlacement: initial.linkOpenPlacement ?? "panel",
        previewUpdatesEnabled: initial.previewUpdatesEnabled ?? false,
        disabledModels: EMPTY_DISABLED,
    };

    const publish = (next: HappyAgentSettingsSnapshot): void => {
        snapshot = next;
        for (const listener of listeners) listener();
    };

    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        defaultModelUpdate(providerId, modelId) {
            if (snapshot.defaultProviderId === providerId && snapshot.defaultModelId === modelId)
                return;
            publish({ ...snapshot, defaultProviderId: providerId, defaultModelId: modelId });
        },
        defaultEffortUpdate(effort) {
            if (snapshot.defaultEffort === effort) return;
            publish({ ...snapshot, defaultEffort: effort });
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
}
