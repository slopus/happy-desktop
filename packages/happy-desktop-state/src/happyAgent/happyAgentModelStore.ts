import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { UserError } from "../types.js";
import { happyAgentMenusDerive } from "./happyAgentMenusStore.js";
import { happyAgentModelCatalogProject } from "./happyAgentProject.js";
import { deepEqual } from "./happyAgentSupport.js";
import {
    happyAgentSelectionModelUpdate,
    happyAgentSessionSelectionDefault,
} from "./happyAgentSessionDraftStore.js";
import type {
    HappyAgentMenusSnapshot,
    HappyAgentModel,
    HappyAgentModelCatalog,
    HappyAgentSelection,
} from "./happyAgentTypes.js";
import type {
    HappyAgentModelSelection,
    HappyAgentPermissionMode,
    HappyAgentServiceTier,
    HappyAgentThinkingLevel,
} from "./happyAgentTypes.js";

export interface HappyAgentModelPreference {
    readonly effort?: HappyAgentThinkingLevel | null;
    readonly serviceTier?: HappyAgentServiceTier | null;
}

export interface HappyAgentModelPreferences {
    readonly [providerId: string]:
        | {
              readonly [modelId: string]: HappyAgentModelPreference | undefined;
          }
        | undefined;
}

export interface HappyAgentModelPreferenceIdentity {
    readonly providerId: string;
    readonly modelId: string;
}

/**
 * What a new session's model and effort come from: the last new session
 * started (`lastStarted`), or only what was chosen in Settings (`default`).
 * Either way a new session runs on the provider picked last.
 */
export type HappyAgentNewSessionStart = "lastStarted" | "default";

/** One person's model choices on this Happy Agent, supplied by its preference authority. */
export interface HappyAgentModelPreferenceDocument {
    /**
     * The model a new session starts on: chosen in Settings, and replaced by
     * the last new session's while `newSessionStart` is `lastStarted`. It names
     * a model only: which account serves it is `lastPickedProviderId`'s to answer.
     */
    readonly defaultModelId?: string;
    /**
     * Reasoning level a new session starts on, kept apart from the model and
     * replaced alongside it. A model without that level starts on its own default.
     */
    readonly defaultEffort?: HappyAgentThinkingLevel;
    /** Whether starting a new session replaces the default model and effort; absent is `lastStarted`. */
    readonly newSessionStart?: HappyAgentNewSessionStart;
    /** Access mode configured for a new session, independent of its model. */
    readonly defaultPermissionMode?: HappyAgentPermissionMode;
    /**
     * The provider most recently picked in any model picker or started a new
     * session on. A new session starts on it whenever it serves the default
     * model; sessions that already exist keep their own.
     */
    readonly lastPickedProviderId?: string;
    readonly preferences: HappyAgentModelPreferences;
}

export interface HappyAgentModelPreferencePersistence {
    read(): HappyAgentModelPreferenceDocument | undefined;
    write(document: HappyAgentModelPreferenceDocument): void;
    /** Reports a replacement written through another store sharing this host document. */
    subscribe?(listener: () => void): () => void;
}

export type HappyAgentModelStoreSnapshot =
    | { readonly type: "loading" }
    | { readonly type: "error"; readonly error: UserError }
    | {
          readonly type: "ready";
          readonly catalog: HappyAgentModelCatalog;
          /**
           * What a new session starts on: the default model, served by the
           * provider picked last when that provider offers it.
           */
          readonly defaultSelection: HappyAgentSelection;
          readonly menus: HappyAgentMenusSnapshot;
      };

export type HappyAgentModelStoreReadySnapshot = Extract<
    HappyAgentModelStoreSnapshot,
    { type: "ready" }
>;

/**
 * One daemon connection's model authority. It loads the catalog, keeps it
 * current with the daemon's configuration for the rest of the connection —
 * across `config.updated` and a replacement daemon alike — exposes model
 * capabilities/defaults, and resolves what a new session starts on from the
 * default model and the provider most recently picked anywhere in that
 * connection.
 */
export interface HappyAgentModelStore {
    get(): HappyAgentModelStoreSnapshot;
    subscribe(listener: () => void): () => void;
    /** Loads or joins the one in-flight catalog request. A failed explicit retry starts anew. */
    load(): Promise<HappyAgentModelStoreReadySnapshot>;
    /**
     * Replaces the catalog with one the daemon has just confirmed elsewhere.
     *
     * Enabling or disabling a provider changes what this machine offers, and the
     * daemon answers that change with its whole configuration. This is that
     * answer arriving, not a selection anyone made, so it replaces the catalog
     * and re-derives the defaults from it without touching what was last used.
     */
    catalogChanged(catalog: HappyAgentModelCatalog): void;
    /** Remembers the effort and speed a person chose for that selection's model. */
    selectionUsed(selection: HappyAgentSelection): void;
    /**
     * Makes a provider picked in a model picker the one new sessions start on.
     * It changes no session that already exists.
     */
    providerPicked(providerId: string): void;
    /**
     * Records what a new session was just started on. Its provider becomes the
     * one new sessions start on and its model's effort and speed are remembered
     * as `selectionUsed` does. While `newSessionStart` is `lastStarted`, its
     * model and effort also become the defaults; a selection without an effort
     * leaves the default effort as it was.
     */
    selectionStarted(selection: HappyAgentSelection): void;
    /** Selects a model with that model's last locally remembered effort and speed. */
    modelSelect(current: HappyAgentSelection, input: HappyAgentModelSelection): HappyAgentSelection;
    /** The effort last chosen for a model on a provider, when this machine remembers one. */
    effortRemembered(providerId: string, modelId: string): HappyAgentThinkingLevel | undefined;
    [Symbol.dispose](): void;
}

export interface HappyAgentModelStoreOptions {
    readonly catalogRead: () => Promise<HappyAgentModelCatalog>;
    /**
     * The catalog of the configuration the connection already holds, when it holds a current
     * one. The first `load()` adopts it instead of reading the configuration again: the
     * bootstrap that started the connection carried it.
     */
    readonly catalogCurrent?: () => HappyAgentModelCatalog | undefined;
    /**
     * The connection's authoritative input, followed from the first `load()`.
     * A bootstrap — including the one taken after a replacement daemon starts
     * answering — carries the configuration and replaces the catalog outright;
     * `config.updated` carries none, so it reads the catalog again.
     */
    readonly sync?: HappyAgentSync;
    readonly preferencePersistence?: HappyAgentModelPreferencePersistence;
}

/**
 * Waits before each re-read of a catalog whose last read failed. Bounded: past
 * the last one, the next reconnect or configuration announcement asks again.
 */
const CATALOG_RETRY_MS: readonly number[] = [1_000, 2_000, 4_000, 8_000, 16_000];

/**
 * The catalog read's failure as something a surface can show, without losing
 * what actually refused.
 *
 * The cause travels because a refusal carries meaning its sentence does not: a
 * daemon answering "this route is not shared" is a machine deliberately keeping
 * its work to itself, and a caller telling that apart from a broken one reads
 * the original rather than parsing this wording.
 */
function modelError(error: unknown): UserError {
    if (error instanceof UserError) return error;
    return new UserError(
        error instanceof Error ? error.message : "Could not load Happy Agent models.",
        undefined,
        error,
    );
}

/** Creates the daemon-lifetime model store without opening transport work. */
export function happyAgentModelStoreCreate(
    options: HappyAgentModelStoreOptions,
): HappyAgentModelStore {
    const listeners = new Set<() => void>();
    let snapshot: HappyAgentModelStoreSnapshot = { type: "loading" };
    let loadPromise: Promise<HappyAgentModelStoreReadySnapshot> | undefined;
    let document: HappyAgentModelPreferenceDocument = { preferences: {} };
    let preferences = document.preferences;
    let preferenceUnsubscribe: (() => void) | undefined;
    let writingPreferences = false;
    const effortRemembered = (providerId: string, modelId: string) =>
        preferences[providerId]?.[modelId]?.effort ?? undefined;

    const publish = (next: HappyAgentModelStoreSnapshot): void => {
        snapshot = next;
        for (const listener of listeners) listener();
    };

    const preferencesReconcile = (): void => {
        if (writingPreferences) return;
        document = options.preferencePersistence?.read() ?? { preferences: {} };
        preferences = document.preferences;
        defaultsPublish();
    };

    /** Re-derives what a new session starts on after the preference document changed. */
    const defaultsPublish = (): void => {
        if (snapshot.type !== "ready") return;
        const defaultSelection = defaultSelectionResolve(snapshot.catalog, document);
        publish({
            ...snapshot,
            defaultSelection,
            menus: happyAgentMenusDerive(snapshot.catalog, defaultSelection, effortRemembered),
        });
    };

    const documentWrite = (next: HappyAgentModelPreferenceDocument): void => {
        document = next;
        writingPreferences = true;
        try {
            options.preferencePersistence?.write(document);
            document = options.preferencePersistence?.read() ?? document;
            preferences = document.preferences;
        } finally {
            writingPreferences = false;
        }
        defaultsPublish();
    };

    /**
     * Makes `catalog` the one this store answers with. An identical catalog is
     * not a change: keeping the old reference is what lets every picker and
     * chat that derived from it stand still.
     */
    const catalogAdopt = (catalog: HappyAgentModelCatalog): HappyAgentModelStoreReadySnapshot => {
        if (snapshot.type === "ready" && deepEqual(snapshot.catalog, catalog)) return snapshot;
        const defaultSelection = defaultSelectionResolve(catalog, document);
        const ready: HappyAgentModelStoreReadySnapshot = {
            type: "ready",
            catalog,
            defaultSelection,
            menus: happyAgentMenusDerive(catalog, defaultSelection, effortRemembered),
        };
        publish(ready);
        return ready;
    };

    // Every source of a catalog takes the next number, and only the newest may
    // land: a read that was already in flight when the daemon changed its
    // configuration answers with what it was before.
    let catalogGeneration = 0;
    // A re-read failed. The last confirmed catalog stays on screen while the
    // read is retried on a bounded backoff; past that, the next reconnect or
    // configuration announcement asks again.
    let catalogReadFailed = false;
    let catalogRetry: ReturnType<typeof setTimeout> | undefined;
    let follow: AbortController | undefined;
    let disposed = false;

    const catalogRetryCancel = (): void => {
        if (catalogRetry !== undefined) clearTimeout(catalogRetry);
        catalogRetry = undefined;
    };

    const catalogReload = (signal: AbortSignal, attempt = 0): void => {
        catalogRetryCancel();
        const generation = ++catalogGeneration;
        void options.catalogRead().then(
            (catalog) => {
                if (signal.aborted || generation !== catalogGeneration) return;
                catalogReadFailed = false;
                catalogAdopt(catalog);
            },
            () => {
                if (signal.aborted || generation !== catalogGeneration) return;
                catalogReadFailed = true;
                const delay = CATALOG_RETRY_MS[attempt];
                if (delay === undefined) return;
                catalogRetry = setTimeout(() => {
                    catalogRetry = undefined;
                    if (!signal.aborted) catalogReload(signal, attempt + 1);
                }, delay);
            },
        );
    };

    /**
     * Follows the daemon's configuration for the rest of this store's life.
     * Installed before the first read is sent, so nothing the daemon announces
     * after that read began can be missed.
     */
    const followStart = (): void => {
        const sync = options.sync;
        if (!sync || follow || disposed) return;
        const active = new AbortController();
        follow = active;
        void (async () => {
            let greeted = false;
            for await (const input of sync.follow({
                signal: active.signal,
                events: ["config.updated"],
            })) {
                const greeting = !greeted;
                greeted = true;
                if (input.kind === "error") continue;
                if (input.kind === "bootstrap") {
                    catalogRetryCancel();
                    ++catalogGeneration;
                    catalogReadFailed = false;
                    catalogAdopt(happyAgentModelCatalogProject(input.bootstrap.config));
                } else if (input.kind === "reconcile") {
                    // The first load was sent, or answered from the connection's
                    // current configuration, after this subscription was
                    // installed, so it already answers for everything before.
                    if (!greeting && !loadPromise) catalogReload(active.signal);
                } else if (
                    (input.update.kind === "connected" && catalogReadFailed) ||
                    (input.update.kind === "event" && input.update.event.type === "config.updated")
                )
                    catalogReload(active.signal);
            }
        })().catch(() => undefined);
    };

    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        load() {
            document = options.preferencePersistence?.read() ?? document;
            preferences = document.preferences;
            preferenceUnsubscribe ??=
                options.preferencePersistence?.subscribe?.(preferencesReconcile);
            if (snapshot.type === "ready") return Promise.resolve(snapshot);
            if (loadPromise) return loadPromise;
            if (snapshot.type === "error") publish({ type: "loading" });
            followStart();
            const current = options.catalogCurrent?.();
            if (current !== undefined) {
                ++catalogGeneration;
                return Promise.resolve(catalogAdopt(current));
            }
            const generation = ++catalogGeneration;
            loadPromise = options.catalogRead().then(
                (catalog) => {
                    loadPromise = undefined;
                    // A disposed store publishes nothing; its connection is gone.
                    if (disposed) throw new UserError("This Happy Agent connection is closed.");
                    // A newer catalog already arrived while this read was out.
                    if (generation !== catalogGeneration && snapshot.type === "ready")
                        return snapshot;
                    document = options.preferencePersistence?.read() ?? document;
                    preferences = document.preferences;
                    catalogAdopt(catalog);
                    return snapshot as HappyAgentModelStoreReadySnapshot;
                },
                (error: unknown) => {
                    loadPromise = undefined;
                    if (disposed) throw modelError(error);
                    if (snapshot.type === "ready") return snapshot;
                    const failure = modelError(error);
                    publish({ type: "error", error: failure });
                    throw failure;
                },
            );
            return loadPromise;
        },
        catalogChanged(catalog) {
            if (disposed) return;
            catalogRetryCancel();
            ++catalogGeneration;
            catalogAdopt(catalog);
        },
        selectionUsed(selection) {
            if (snapshot.type !== "ready") return;
            documentWrite({ ...document, preferences: preferencesUsed(preferences, selection) });
        },
        providerPicked(providerId) {
            if (snapshot.type !== "ready" || document.lastPickedProviderId === providerId) return;
            documentWrite({ ...document, lastPickedProviderId: providerId });
        },
        selectionStarted(selection) {
            if (snapshot.type !== "ready") return;
            const follows = document.newSessionStart !== "default";
            documentWrite({
                ...document,
                ...(follows ? { defaultModelId: selection.modelId } : {}),
                ...(follows && selection.effort !== undefined
                    ? { defaultEffort: selection.effort }
                    : {}),
                lastPickedProviderId: selection.providerId,
                preferences: preferencesUsed(preferences, selection),
            });
        },
        modelSelect(current, input) {
            if (snapshot.type !== "ready")
                return happyAgentSelectionModelUpdateWithoutPreferences(snapshot, current, input);
            const selected = happyAgentSelectionModelUpdateWithoutPreferences(
                snapshot,
                current,
                input,
            );
            const preference = preferences[selected.providerId]?.[selected.modelId];
            const provider = snapshot.catalog.providers.find(
                (candidate) => candidate.id === selected.providerId,
            );
            const model = provider?.models.find((candidate) => candidate.id === selected.modelId);
            // An effort named with the model is a choice, not a gap to fill from memory.
            const effort =
                input.effort === undefined &&
                preference?.effort &&
                model?.thinkingLevels.includes(preference.effort)
                    ? preference.effort
                    : selected.effort;
            // A revoked remembered tier resets to the agent's default; only absent memory carries over.
            const serviceTier =
                preference?.serviceTier === undefined
                    ? selected.serviceTier
                    : provider?.disabledReason === undefined &&
                        model?.serviceTierOptions.some(
                            (option) => option.id === preference.serviceTier,
                        )
                      ? (preference.serviceTier ?? undefined)
                      : undefined;
            return {
                providerId: selected.providerId,
                modelId: selected.modelId,
                ...(effort !== undefined ? { effort } : {}),
                permissionMode: selected.permissionMode,
                ...(serviceTier !== undefined ? { serviceTier } : {}),
            };
        },
        effortRemembered,
        [Symbol.dispose]() {
            disposed = true;
            catalogRetryCancel();
            follow?.abort();
            follow = undefined;
            preferenceUnsubscribe?.();
            listeners.clear();
        },
    };
}

/** Remembers a selection's effort and speed for its model. */
function preferencesUsed(
    preferences: HappyAgentModelPreferences,
    selection: HappyAgentSelection,
): HappyAgentModelPreferences {
    const provider = { ...preferences[selection.providerId] };
    // Reinsert the selected entry so bounded picker memory retains recent choices.
    delete provider[selection.modelId];
    const remainingProviders = { ...preferences };
    delete remainingProviders[selection.providerId];
    return {
        ...remainingProviders,
        [selection.providerId]: {
            ...provider,
            [selection.modelId]: {
                effort: selection.effort ?? null,
                serviceTier: selection.serviceTier ?? null,
            },
        },
    };
}

/**
 * What a new session starts on. The model is the default one — chosen in
 * Settings or, while new sessions follow the last one, started on last — or
 * the catalog's own default until there is one; the provider is the one picked last whenever it serves that model.
 * A provider that does not is passed over for the catalog's default provider
 * and then the first usable one serving the same model, so a provider choice
 * never silently changes the model.
 */
function defaultSelectionResolve(
    catalog: HappyAgentModelCatalog,
    document: HappyAgentModelPreferenceDocument,
): HappyAgentSelection {
    const catalogDefault = happyAgentSessionSelectionDefault(catalog);
    const permissionMode = document.defaultPermissionMode ?? catalogDefault.permissionMode;
    for (const modelId of [document.defaultModelId, catalogDefault.modelId]) {
        if (modelId === undefined) continue;
        const serving = catalog.providers.filter(
            (provider) =>
                provider.disabledReason === undefined &&
                !provider.hidden &&
                provider.models.some((model) => model.id === modelId),
        );
        const provider =
            serving.find((candidate) => candidate.id === document.lastPickedProviderId) ??
            serving.find((candidate) => candidate.id === catalog.defaultProviderId) ??
            serving[0];
        const model = provider?.models.find((candidate) => candidate.id === modelId);
        if (provider && model)
            return preferenceSelection(
                provider.id,
                model,
                document.preferences,
                permissionMode,
                document.defaultEffort,
            );
    }
    const model = catalog.providers
        .find((provider) => provider.id === catalogDefault.providerId)
        ?.models.find((candidate) => candidate.id === catalogDefault.modelId);
    const effort =
        document.defaultEffort && model?.thinkingLevels.includes(document.defaultEffort)
            ? document.defaultEffort
            : catalogDefault.effort;
    return {
        ...catalogDefault,
        ...(effort !== undefined ? { effort } : {}),
        permissionMode,
    };
}

function preferenceSelection(
    providerId: string,
    model: HappyAgentModel,
    preferences: HappyAgentModelPreferences,
    permissionMode: HappyAgentSelection["permissionMode"],
    defaultEffort?: HappyAgentThinkingLevel,
): HappyAgentSelection {
    const preference = preferences[providerId]?.[model.id];
    // A new session starts on the remembered default effort, not the one last
    // used with this model; a model without that level starts on its own default.
    const supportedDefaultEffort =
        defaultEffort && model.thinkingLevels.includes(defaultEffort) ? defaultEffort : undefined;
    const serviceTier =
        preference?.serviceTier != null &&
        model.serviceTierOptions.some((option) => option.id === preference.serviceTier)
            ? preference.serviceTier
            : undefined;
    return {
        providerId,
        modelId: model.id,
        effort: supportedDefaultEffort ?? model.defaultThinkingLevel,
        permissionMode,
        ...(serviceTier !== undefined ? { serviceTier } : {}),
    };
}

function happyAgentSelectionModelUpdateWithoutPreferences(
    snapshot: HappyAgentModelStoreSnapshot,
    current: HappyAgentSelection,
    input: HappyAgentModelSelection,
): HappyAgentSelection {
    if (snapshot.type !== "ready") return current;
    return happyAgentSelectionModelUpdate(snapshot.catalog, current, input);
}
