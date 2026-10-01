import { createStore } from "zustand/vanilla";
import {
    happyAgentMenusDerive,
    happyAgentMenusReferencesPreserve,
    happyAgentMenusSelectionProject,
} from "./happyAgentMenusStore.js";
import type {
    HappyAgentMenusSnapshot,
    HappyAgentModelCatalog,
    HappyAgentModelEffortRemembered,
    HappyAgentModelSelection,
    HappyAgentPermissionMode,
    HappyAgentSelection,
    HappyAgentServiceTier,
    HappyAgentThinkingLevel,
} from "./happyAgentTypes.js";

/**
 * How a session that does not exist yet is configured, plus the picker options
 * that configuration derives. `menus` is a pure derivation of `selection`, not a
 * second copy of it: the two can never disagree because only one is stored.
 */
export interface HappyAgentSessionDraftSnapshot {
    readonly selection: HappyAgentSelection;
    readonly menus: HappyAgentMenusSnapshot;
}

/**
 * The model, effort, access mode, and service tier a session will be created
 * with. It exists so those choices can be made before the first message rather
 * than discovered afterwards: until a session exists there is no chat store to
 * own them, and creating one just to hold a preference would leave an empty
 * session behind every time somebody opened a project to look around.
 */
export interface HappyAgentSessionDraftStore {
    get(): HappyAgentSessionDraftSnapshot;
    subscribe(listener: () => void): () => void;
    /**
     * Selects a model, and with it the provider that offers it. Effort follows
     * the new model's own default rather than carrying over a level the model
     * may not support, and a service tier the new model/account does not offer is
     * dropped for the same reason.
     */
    modelUpdate(input: HappyAgentModelSelection): void;
    effortUpdate(effort?: HappyAgentThinkingLevel): void;
    permissionModeUpdate(permissionMode: HappyAgentPermissionMode): void;
    serviceTierUpdate(serviceTier?: HappyAgentServiceTier): void;
}

/** Owner-only authoritative input to a draft; never a reader's action. */
export interface HappyAgentSessionDraftWriter {
    /**
     * The daemon changed what it offers. The pickers re-derive from the new
     * catalog; a speed tier the model/account no longer offers is cleared.
     */
    catalogChanged(catalog: HappyAgentModelCatalog): void;
}

export interface HappyAgentSessionDraftOptions {
    readonly catalog: HappyAgentModelCatalog;
    readonly modelSelect?: (
        current: HappyAgentSelection,
        input: HappyAgentModelSelection,
    ) => HappyAgentSelection;
    readonly effortRemembered?: HappyAgentModelEffortRemembered;
    /**
     * What to open the draft on — the workspace's most recent selection, so a
     * new session starts configured the way the last one was. Absent for the
     * first draft of a session, which falls back to the catalog's own defaults.
     */
    readonly selection?: HappyAgentSelection;
}

/**
 * The access mode a local session starts in. It matches what the desktop proxy
 * applies when a create request names no mode, so the picker and the request
 * agree instead of the picker showing one thing and creation doing another.
 */
const DEFAULT_PERMISSION_MODE: HappyAgentPermissionMode = "auto";

/**
 * The selection a draft opens on when the workspace has no previous one: the
 * catalog's declared default model at that model's own default effort.
 *
 * A catalog whose declared default names a model it does not list is a broken
 * catalog, but it is not worth refusing to start a session over — the daemon
 * still applies its own default. The first listed model of the first usable
 * provider stands in, so the pickers open on something real rather than on a
 * model id that does not exist.
 */
export function happyAgentSessionSelectionDefault(
    catalog: HappyAgentModelCatalog,
): HappyAgentSelection {
    const declared = catalog.providers.find(
        (provider) => provider.id === catalog.defaultProviderId,
    );
    const declaredModel = declared?.models.find((model) => model.id === catalog.defaultModelId);
    const provider =
        declaredModel !== undefined
            ? declared
            : catalog.providers.find(
                  (candidate) =>
                      candidate.disabledReason === undefined && candidate.models.length > 0,
              );
    const model = declaredModel ?? provider?.models[0];
    return {
        providerId: provider?.id ?? catalog.defaultProviderId,
        modelId: model?.id ?? catalog.defaultModelId,
        ...(model ? { effort: model.defaultThinkingLevel } : {}),
        permissionMode: DEFAULT_PERMISSION_MODE,
    };
}

/**
 * Selects a model within a selection. Which provider offers a model is the
 * catalog's to answer, not the caller's; effort follows the new model's own
 * default rather than carrying over a level it may not support, and a service
 * tier the new model/account does not offer is dropped for the same reason.
 *
 * Pure, so the pre-session draft and a live session's pending picker state apply
 * the identical rule without either store reaching into the other.
 */
export function happyAgentSelectionModelUpdate(
    catalog: HappyAgentModelCatalog,
    current: HappyAgentSelection,
    input: HappyAgentModelSelection,
): HappyAgentSelection {
    const providerId =
        input.providerId ??
        catalog.providers.find((provider) =>
            provider.models.some((model) => model.id === input.modelId),
        )?.id ??
        current.providerId;
    const provider = catalog.providers.find((candidate) => candidate.id === providerId);
    const model = provider?.models.find((candidate) => candidate.id === input.modelId);
    const effort = input.effort ?? model?.defaultThinkingLevel;
    const tierSupported =
        current.serviceTier === undefined ||
        (provider?.disabledReason === undefined &&
            (model?.serviceTiers.includes(current.serviceTier) ?? false));
    return {
        providerId,
        modelId: input.modelId,
        ...(effort !== undefined ? { effort } : {}),
        permissionMode: current.permissionMode,
        ...(tierSupported && current.serviceTier !== undefined
            ? { serviceTier: current.serviceTier }
            : {}),
    };
}

/** Clears a revoked speed choice without changing model, effort, or permissions. */
export function happyAgentSelectionServiceTierReconcile(
    catalog: HappyAgentModelCatalog,
    selection: HappyAgentSelection,
): HappyAgentSelection {
    if (selection.serviceTier === undefined) return selection;
    const provider = catalog.providers.find((candidate) => candidate.id === selection.providerId);
    const model = provider?.models.find((candidate) => candidate.id === selection.modelId);
    if (
        provider?.disabledReason === undefined &&
        model?.serviceTiers.includes(selection.serviceTier)
    )
        return selection;
    const { serviceTier: _serviceTier, ...regular } = selection;
    return regular;
}

/** Sets the thinking level, or clears it back to the model's own default. */
export function happyAgentSelectionEffortUpdate(
    current: HappyAgentSelection,
    effort?: HappyAgentThinkingLevel,
): HappyAgentSelection {
    return {
        providerId: current.providerId,
        modelId: current.modelId,
        ...(effort !== undefined ? { effort } : {}),
        permissionMode: current.permissionMode,
        ...(current.serviceTier !== undefined ? { serviceTier: current.serviceTier } : {}),
    };
}

/** Sets the access mode a session's tools run under. */
export function happyAgentSelectionPermissionModeUpdate(
    current: HappyAgentSelection,
    permissionMode: HappyAgentPermissionMode,
): HappyAgentSelection {
    return { ...current, permissionMode };
}

/** Sets the service tier, or clears it back to the provider's standard one. */
export function happyAgentSelectionServiceTierUpdate(
    current: HappyAgentSelection,
    serviceTier?: HappyAgentServiceTier,
): HappyAgentSelection {
    return {
        providerId: current.providerId,
        modelId: current.modelId,
        ...(current.effort !== undefined ? { effort: current.effort } : {}),
        permissionMode: current.permissionMode,
        ...(serviceTier !== undefined ? { serviceTier } : {}),
    };
}

/** Whether two selections name the same configuration. */
export function happyAgentSelectionEqual(
    left: HappyAgentSelection,
    right: HappyAgentSelection,
): boolean {
    return (
        left.providerId === right.providerId &&
        left.modelId === right.modelId &&
        left.effort === right.effort &&
        left.permissionMode === right.permissionMode &&
        left.serviceTier === right.serviceTier
    );
}

/**
 * Holds one pending session configuration. The catalog arrives already resolved,
 * so the constructor opens no transport work and the same concrete store backs
 * the empty-project composer, the create dialog, Blueprint, and tests.
 *
 * Every action is a synchronous local mutation of this store alone. Nothing here
 * reaches a daemon: a draft is what the reader has chosen, and it becomes real
 * only when whoever owns this store reads `selection` and creates a session with
 * it.
 */
export function happyAgentSessionDraftStoreCreate(
    options: HappyAgentSessionDraftOptions,
): HappyAgentSessionDraftStore {
    return happyAgentSessionDraftStoreOwnedCreate(options).store;
}

/**
 * The draft together with its owner-only writer. Only the owner that follows
 * the connection's model store may tell a draft that the daemon's catalog
 * changed; the draft's public face stays the reader's actions alone.
 */
export function happyAgentSessionDraftStoreOwnedCreate(options: HappyAgentSessionDraftOptions): {
    readonly store: HappyAgentSessionDraftStore;
    readonly writer: HappyAgentSessionDraftWriter;
} {
    let catalog = options.catalog;
    const seed = happyAgentSelectionServiceTierReconcile(
        catalog,
        options.selection ?? happyAgentSessionSelectionDefault(catalog),
    );
    const snapshotOf = (selection: HappyAgentSelection): HappyAgentSessionDraftSnapshot => ({
        selection,
        menus: happyAgentMenusDerive(catalog, selection, options.effortRemembered),
    });
    const store = createStore<HappyAgentSessionDraftSnapshot>()(() => snapshotOf(seed));
    const selectionSet = (selection: HappyAgentSelection): void => {
        selection = happyAgentSelectionServiceTierReconcile(catalog, selection);
        const previous = store.getState();
        if (happyAgentSelectionEqual(previous.selection, selection)) return;
        store.setState(
            {
                selection,
                menus: happyAgentMenusSelectionProject(
                    catalog,
                    previous.menus,
                    selection,
                    options.effortRemembered,
                ),
            },
            true,
        );
    };

    return {
        store: {
            get: () => store.getState(),
            subscribe: (listener) => store.subscribe(listener),

            modelUpdate: (input) =>
                selectionSet(
                    options.modelSelect?.(store.getState().selection, input) ??
                        happyAgentSelectionModelUpdate(catalog, store.getState().selection, input),
                ),
            effortUpdate: (effort) =>
                selectionSet(happyAgentSelectionEffortUpdate(store.getState().selection, effort)),
            permissionModeUpdate: (permissionMode) =>
                selectionSet(
                    happyAgentSelectionPermissionModeUpdate(
                        store.getState().selection,
                        permissionMode,
                    ),
                ),
            serviceTierUpdate: (serviceTier) =>
                selectionSet(
                    happyAgentSelectionServiceTierUpdate(store.getState().selection, serviceTier),
                ),
        },
        writer: {
            catalogChanged(next) {
                if (next === catalog) return;
                catalog = next;
                const previous = store.getState();
                const selection = happyAgentSelectionServiceTierReconcile(
                    catalog,
                    previous.selection,
                );
                const menus = happyAgentMenusReferencesPreserve(
                    previous.menus,
                    happyAgentMenusDerive(catalog, selection, options.effortRemembered),
                );
                if (menus === previous.menus && selection === previous.selection) return;
                store.setState({ selection, menus }, true);
            },
        },
    };
}
