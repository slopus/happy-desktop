import { createStore } from "zustand/vanilla";
import {
    referencesPreserve,
    happyAgentPermissionLabel,
    happyAgentServiceTierLabel,
    happyAgentThinkingLabel,
} from "./happyAgentSupport.js";
import type {
    HappyAgentEffortOption,
    HappyAgentMenusSnapshot,
    HappyAgentModelCatalog,
    HappyAgentModelEffortRemembered,
    HappyAgentModelOption,
    HappyAgentPermissionMode,
    HappyAgentPermissionModeOption,
    HappyAgentSelection,
    HappyAgentServiceTierOption,
    HappyAgentThinkingLevel,
} from "./happyAgentTypes.js";

const PERMISSION_MODES: readonly HappyAgentPermissionMode[] = [
    "auto",
    "workspace_write",
    "read_only",
    "full_access",
];

/**
 * Pure derivation of picker options from the model catalog and the current
 * session selection. Kept side-effect free so both the standalone menus store
 * and the chat store can compute the same option lists from their own inputs.
 * `remembered` reports the effort last chosen per model, when the caller keeps one.
 */
export function happyAgentMenusDerive(
    catalog: HappyAgentModelCatalog,
    selection: HappyAgentSelection,
    remembered?: HappyAgentModelEffortRemembered,
): HappyAgentMenusSnapshot {
    const modelOptions: HappyAgentModelOption[] = [];
    let selectedProvider = catalog.providers.find(
        (provider) => provider.id === selection.providerId,
    );
    for (const provider of catalog.providers) {
        for (const model of provider.models) {
            const rememberedEffort = remembered?.(provider.id, model.id);
            modelOptions.push({
                providerId: provider.id,
                modelId: model.id,
                name: model.name,
                disabled: provider.disabledReason !== undefined,
                current: provider.id === selection.providerId && model.id === selection.modelId,
                efforts: model.thinkingLevels.map((level) => ({
                    level,
                    label: happyAgentThinkingLabel(level),
                })),
                defaultEffort: model.defaultThinkingLevel,
                providerType: provider.type,
                ...(rememberedEffort !== undefined &&
                model.thinkingLevels.includes(rememberedEffort)
                    ? { rememberedEffort }
                    : {}),
            });
        }
    }

    const currentModel = selectedProvider?.models.find((model) => model.id === selection.modelId);
    const effortOptions: HappyAgentEffortOption[] = (currentModel?.thinkingLevels ?? []).map(
        (level: HappyAgentThinkingLevel): HappyAgentEffortOption => ({
            level,
            label: happyAgentThinkingLabel(level),
            current: level === selection.effort,
            isDefault: level === currentModel?.defaultThinkingLevel,
        }),
    );

    const permissionModeOptions: HappyAgentPermissionModeOption[] = PERMISSION_MODES.map(
        (mode) => ({
            mode,
            label: happyAgentPermissionLabel(mode),
            current: mode === selection.permissionMode,
        }),
    );

    const serviceTierOptions: HappyAgentServiceTierOption[] = [
        {
            tier: null,
            label: happyAgentServiceTierLabel(null),
            current: selection.serviceTier === undefined,
        },
        ...(selectedProvider?.disabledReason === undefined
            ? (currentModel?.serviceTiers ?? [])
            : []
        ).map((tier) => ({
            tier,
            label: happyAgentServiceTierLabel(tier),
            current: selection.serviceTier === tier,
        })),
    ];

    return {
        modelOptions,
        effortOptions,
        permissionModeOptions,
        serviceTierOptions,
        currentProviderId: selection.providerId,
        currentModelId: selection.modelId,
        currentEffort: selection.effort,
        currentPermissionMode: selection.permissionMode,
        currentServiceTier: selection.serviceTier,
    };
}

/** Keeps every unchanged picker collection and row stable across a fresh derivation. */
export function happyAgentMenusReferencesPreserve(
    previous: HappyAgentMenusSnapshot,
    next: HappyAgentMenusSnapshot,
): HappyAgentMenusSnapshot {
    const modelOptions = referencesPreserve(previous.modelOptions, next.modelOptions);
    const effortOptions = referencesPreserve(previous.effortOptions, next.effortOptions);
    const permissionModeOptions = referencesPreserve(
        previous.permissionModeOptions,
        next.permissionModeOptions,
    );
    const serviceTierOptions = referencesPreserve(
        previous.serviceTierOptions,
        next.serviceTierOptions,
    );
    if (
        modelOptions === previous.modelOptions &&
        effortOptions === previous.effortOptions &&
        permissionModeOptions === previous.permissionModeOptions &&
        serviceTierOptions === previous.serviceTierOptions &&
        next.currentProviderId === previous.currentProviderId &&
        next.currentModelId === previous.currentModelId &&
        next.currentEffort === previous.currentEffort &&
        next.currentPermissionMode === previous.currentPermissionMode &&
        next.currentServiceTier === previous.currentServiceTier
    )
        return previous;
    return {
        ...next,
        modelOptions,
        effortOptions,
        permissionModeOptions,
        serviceTierOptions,
    };
}

function currentOptionsUpdate<T extends { readonly current: boolean }>(
    options: readonly T[],
    current: (option: T) => boolean,
): readonly T[] {
    let changed = false;
    const next = options.map((option) => {
        const selected = current(option);
        if (option.current === selected) return option;
        changed = true;
        return { ...option, current: selected };
    });
    return changed ? next : options;
}

/** Reprojects one selection while touching only the option family whose current row changed. */
export function happyAgentMenusSelectionProject(
    catalog: HappyAgentModelCatalog,
    previous: HappyAgentMenusSnapshot,
    selection: HappyAgentSelection,
    remembered?: HappyAgentModelEffortRemembered,
): HappyAgentMenusSnapshot {
    if (
        previous.currentProviderId === selection.providerId &&
        previous.currentModelId === selection.modelId &&
        previous.currentEffort === selection.effort &&
        previous.currentPermissionMode === selection.permissionMode &&
        previous.currentServiceTier === selection.serviceTier
    )
        return previous;

    if (
        previous.currentProviderId !== selection.providerId ||
        previous.currentModelId !== selection.modelId
    )
        return happyAgentMenusReferencesPreserve(
            previous,
            happyAgentMenusDerive(catalog, selection, remembered),
        );

    return {
        ...previous,
        effortOptions:
            previous.currentEffort === selection.effort
                ? previous.effortOptions
                : currentOptionsUpdate(
                      previous.effortOptions,
                      (option) => option.level === selection.effort,
                  ),
        permissionModeOptions:
            previous.currentPermissionMode === selection.permissionMode
                ? previous.permissionModeOptions
                : currentOptionsUpdate(
                      previous.permissionModeOptions,
                      (option) => option.mode === selection.permissionMode,
                  ),
        serviceTierOptions:
            previous.currentServiceTier === selection.serviceTier
                ? previous.serviceTierOptions
                : currentOptionsUpdate(
                      previous.serviceTierOptions,
                      (option) => option.tier === (selection.serviceTier ?? null),
                  ),
        currentEffort: selection.effort,
        currentPermissionMode: selection.permissionMode,
        currentServiceTier: selection.serviceTier,
    };
}

export interface HappyAgentMenusStore {
    get(): HappyAgentMenusSnapshot;
    subscribe(listener: () => void): () => void;
    /** Private authoritative input: feed a fresh selection (e.g. from the chat snapshot). */
    menusSelectionUpdate(selection: HappyAgentSelection): void;
}

export interface HappyAgentMenusStoreOptions {
    readonly catalog: HappyAgentModelCatalog;
    readonly selection: HappyAgentSelection;
    readonly effortRemembered?: HappyAgentModelEffortRemembered;
}

/**
 * A standalone picker-options store for a session's model/effort/permission/tier
 * choices. It is a pure derivation of catalog + selection: the owner feeds the
 * current selection through `menusSelectionUpdate`, so nothing is mirrored or
 * fetched here.
 */
export function happyAgentMenusStoreCreate(
    options: HappyAgentMenusStoreOptions,
): HappyAgentMenusStore {
    const catalog = options.catalog;
    const store = createStore<HappyAgentMenusSnapshot>()(() =>
        happyAgentMenusDerive(catalog, options.selection, options.effortRemembered),
    );
    return {
        get: () => store.getState(),
        subscribe: (listener) => store.subscribe(listener),
        menusSelectionUpdate(selection) {
            const previous = store.getState();
            store.setState(
                happyAgentMenusSelectionProject(
                    catalog,
                    previous,
                    selection,
                    options.effortRemembered,
                ),
                true,
            );
        },
    };
}
