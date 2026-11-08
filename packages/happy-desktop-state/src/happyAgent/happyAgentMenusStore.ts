import { createStore } from "zustand/vanilla";
import {
    deepEqual,
    referencesPreserve,
    happyAgentPermissionLabel,
    happyAgentThinkingLabel,
} from "./happyAgentSupport.js";
import type {
    HappyAgentCurrentAccount,
    HappyAgentEffortOption,
    HappyAgentMenusSnapshot,
    HappyAgentModel,
    HappyAgentModelCatalog,
    HappyAgentModelProvider,
    HappyAgentModelEffortRemembered,
    HappyAgentModelOption,
    HappyAgentPermissionMode,
    HappyAgentPermissionModeOption,
    HappyAgentPoolMember,
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
    // A selection on an older ID the server answers as another provider reads
    // as that provider.
    const aliasOf = catalog.providers.find(
        (provider) => provider.id === selection.providerId,
    )?.aliasOf;
    if (aliasOf !== undefined) selection = { ...selection, providerId: aliasOf };
    const modelOptions: HappyAgentModelOption[] = [];
    const selectedProvider = catalog.providers.find(
        (provider) => provider.id === selection.providerId,
    );
    // A pool names its accounts by id; each is named as the catalog names it,
    // hidden ones included, since a pool is the only place those are listed.
    const poolMembersOf = (
        provider: Pick<HappyAgentModelProvider, "poolMembers">,
    ): readonly HappyAgentPoolMember[] | undefined =>
        provider.poolMembers?.map((memberId) => {
            const name = catalog.providers.find((candidate) => candidate.id === memberId)?.name;
            return { providerId: memberId, ...(name === undefined ? {} : { providerName: name }) };
        });
    const optionOf = (
        provider: Pick<HappyAgentModelProvider, "id" | "name" | "type" | "poolMembers">,
        model: HappyAgentModel,
        disabled: boolean,
    ): HappyAgentModelOption => {
        const rememberedEffort = remembered?.(provider.id, model.id);
        const poolMembers = poolMembersOf(provider);
        return {
            providerId: provider.id,
            ...(provider.name === undefined ? {} : { providerName: provider.name }),
            modelId: model.id,
            name: model.name,
            disabled,
            current: provider.id === selection.providerId && model.id === selection.modelId,
            efforts: model.thinkingLevels.map((level) => ({
                level,
                label: happyAgentThinkingLabel(level),
            })),
            defaultEffort: model.defaultThinkingLevel,
            providerType: provider.type,
            ...(rememberedEffort !== undefined && model.thinkingLevels.includes(rememberedEffort)
                ? { rememberedEffort }
                : {}),
            ...(poolMembers === undefined ? {} : { poolMembers }),
        };
    };
    let currentOption: HappyAgentModelOption | undefined;
    for (const provider of catalog.providers) {
        for (const model of provider.models) {
            const option = optionOf(provider, model, provider.disabledReason !== undefined);
            if (option.current) currentOption = option;
            // A hidden account or model is not offered, though the selection on it stays,
            // and a hidden model the conversation is already on stays in its own list.
            if (!provider.hidden && (option.current || !provider.hiddenModels.includes(model.id)))
                modelOptions.push(option);
        }
    }
    const currentAccount: HappyAgentCurrentAccount =
        selectedProvider === undefined
            ? "missing"
            : !selectedProvider.enabled
              ? "disabled"
              : selectedProvider.hidden
                ? "hidden"
                : "available";
    // An account removed from the configuration takes its models' rows with it;
    // the shared definition still names the model the conversation was on.
    if (currentOption === undefined && selectedProvider === undefined) {
        const model = catalog.models.find((candidate) => candidate.id === selection.modelId);
        if (model !== undefined)
            currentOption = optionOf(
                { id: selection.providerId, type: selection.providerId },
                model,
                true,
            );
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

    const serviceTierOptions: HappyAgentServiceTierOption[] = (
        selectedProvider?.disabledReason === undefined
            ? (currentModel?.serviceTierOptions ?? [])
            : []
    ).map((option) => ({
        tier: option.id,
        label: option.label,
        current: (selection.serviceTier ?? null) === option.id,
    }));

    return {
        modelOptions,
        effortOptions,
        permissionModeOptions,
        serviceTierOptions,
        currentProviderId: selection.providerId,
        currentModelId: selection.modelId,
        currentAccount,
        ...(currentOption === undefined ? {} : { currentOption }),
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
    // The current row is usually one of the listed ones; it keeps that identity.
    const currentOption =
        next.currentOption === undefined
            ? undefined
            : (modelOptions.find((option) => deepEqual(option, next.currentOption)) ??
              (previous.currentOption !== undefined &&
              deepEqual(previous.currentOption, next.currentOption)
                  ? previous.currentOption
                  : next.currentOption));
    if (
        modelOptions === previous.modelOptions &&
        effortOptions === previous.effortOptions &&
        permissionModeOptions === previous.permissionModeOptions &&
        serviceTierOptions === previous.serviceTierOptions &&
        currentOption === previous.currentOption &&
        next.currentAccount === previous.currentAccount &&
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
        ...(currentOption === undefined ? {} : { currentOption }),
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
