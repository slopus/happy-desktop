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

export interface HappyAgentModelPreferenceDefault extends HappyAgentModelPreferenceIdentity {
    readonly effort?: HappyAgentThinkingLevel;
}

/** Complete machine-local model choices supplied by the desktop host. */
export interface HappyAgentModelPreferenceDocument {
    readonly defaultSelection?: HappyAgentModelPreferenceDefault;
    /** Reasoning level configured for new sessions before a model-specific fallback. */
    readonly defaultEffort?: HappyAgentThinkingLevel;
    /** Access mode configured for a new session, independent of its model. */
    readonly defaultPermissionMode?: HappyAgentPermissionMode;
    readonly lastPickedModel?: HappyAgentModelPreferenceIdentity;
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
          readonly defaultSelection: HappyAgentSelection;
          readonly lastUsedSelection: HappyAgentSelection;
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
 * capabilities/defaults, and retains the complete selection most recently
 * chosen anywhere in that connection.
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
    /** Records a user-selected model/effort/access/tier as the next-session default. */
    selectionUsed(selection: HappyAgentSelection): void;
    /** Selects a model with that model's last locally remembered effort and speed. */
    modelSelect(current: HappyAgentSelection, input: HappyAgentModelSelection): HappyAgentSelection;
    /** The effort last chosen for a model on a provider, when this machine remembers one. */
    effortRemembered(providerId: string, modelId: string): HappyAgentThinkingLevel | undefined;
    [Symbol.dispose](): void;
}

export interface HappyAgentModelStoreOptions {
    readonly catalogRead: () => Promise<HappyAgentModelCatalog>;
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
        if (snapshot.type !== "ready") return;
        const selections = selectionsFromDocument(snapshot.catalog, document, snapshot);
        publish({
            ...snapshot,
            ...selections,
            menus: happyAgentMenusDerive(
                snapshot.catalog,
                selections.lastUsedSelection,
                effortRemembered,
            ),
        });
    };

    /**
     * Makes `catalog` the one this store answers with. An identical catalog is
     * not a change: keeping the old reference is what lets every picker and
     * chat that derived from it stand still.
     */
    const catalogAdopt = (catalog: HappyAgentModelCatalog): void => {
        if (snapshot.type === "ready" && deepEqual(snapshot.catalog, catalog)) return;
        const selections = selectionsFromDocument(
            catalog,
            document,
            snapshot.type === "ready" ? snapshot : undefined,
        );
        publish({
            type: "ready",
            catalog,
            ...selections,
            menus: happyAgentMenusDerive(catalog, selections.lastUsedSelection, effortRemembered),
        });
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
            for await (const input of sync.follow({
                signal: active.signal,
                events: ["config.updated"],
            })) {
                if (input.kind === "error") continue;
                if (input.kind === "bootstrap") {
                    catalogRetryCancel();
                    ++catalogGeneration;
                    catalogReadFailed = false;
                    catalogAdopt(happyAgentModelCatalogProject(input.bootstrap.config));
                } else if (input.kind === "reconcile") {
                    // The first load was sent after this subscription was
                    // installed, so it already answers for everything before.
                    if (!loadPromise) catalogReload(active.signal);
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
            const provider = preferences[selection.providerId] ?? {};
            preferences = {
                ...preferences,
                [selection.providerId]: {
                    ...provider,
                    [selection.modelId]: {
                        effort: selection.effort ?? null,
                        serviceTier: selection.serviceTier ?? null,
                    },
                },
            };
            document = {
                ...document,
                lastPickedModel: {
                    providerId: selection.providerId,
                    modelId: selection.modelId,
                },
                preferences,
            };
            writingPreferences = true;
            try {
                options.preferencePersistence?.write(document);
            } finally {
                writingPreferences = false;
            }
            publish({
                ...snapshot,
                lastUsedSelection: selection,
                menus: happyAgentMenusDerive(snapshot.catalog, selection, effortRemembered),
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
            const serviceTier =
                preference?.serviceTier === null
                    ? undefined
                    : preference?.serviceTier &&
                        provider?.disabledReason === undefined &&
                        model?.serviceTiers.includes(preference.serviceTier)
                      ? preference.serviceTier
                      : selected.serviceTier;
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

function selectionsFromDocument(
    catalog: HappyAgentModelCatalog,
    document: HappyAgentModelPreferenceDocument,
    current?: HappyAgentModelStoreReadySnapshot,
): Pick<HappyAgentModelStoreReadySnapshot, "defaultSelection" | "lastUsedSelection"> {
    const catalogDefault = happyAgentSessionSelectionDefault(catalog);
    const catalogDefaultModel = catalog.providers
        .find((provider) => provider.id === catalogDefault.providerId)
        ?.models.find((model) => model.id === catalogDefault.modelId);
    const catalogDefaultEffort =
        document.defaultEffort &&
        catalogDefaultModel?.thinkingLevels.includes(document.defaultEffort)
            ? document.defaultEffort
            : catalogDefault.effort;
    const defaultPermissionMode =
        document.defaultPermissionMode ??
        current?.defaultSelection.permissionMode ??
        catalogDefault.permissionMode;
    const catalogSelection = {
        ...catalogDefault,
        ...(catalogDefaultEffort !== undefined ? { effort: catalogDefaultEffort } : {}),
        permissionMode: defaultPermissionMode,
    };
    const defaultSelection =
        preferenceSelection(
            catalog,
            document.defaultSelection,
            document.preferences,
            defaultPermissionMode,
            document.defaultEffort,
        ) ?? catalogSelection;
    const lastUsedSelection =
        preferenceSelection(
            catalog,
            document.lastPickedModel,
            document.preferences,
            document.defaultPermissionMode ??
                current?.lastUsedSelection.permissionMode ??
                defaultSelection.permissionMode,
        ) ?? defaultSelection;
    return { defaultSelection, lastUsedSelection };
}

function preferenceSelection(
    catalog: HappyAgentModelCatalog,
    identity: HappyAgentModelPreferenceIdentity | undefined,
    preferences: HappyAgentModelPreferences,
    permissionMode: HappyAgentSelection["permissionMode"],
    defaultEffort?: HappyAgentThinkingLevel,
): HappyAgentSelection | undefined {
    if (!identity) return undefined;
    const provider = catalog.providers.find((candidate) => candidate.id === identity.providerId);
    const model = provider?.models.find((candidate) => candidate.id === identity.modelId);
    if (!provider || provider.disabledReason !== undefined || !model) return undefined;
    const candidateEffort =
        "effort" in identity ? (identity as HappyAgentModelPreferenceDefault).effort : undefined;
    const explicitEffort =
        candidateEffort && model.thinkingLevels.includes(candidateEffort)
            ? candidateEffort
            : undefined;
    const preference = preferences[identity.providerId]?.[identity.modelId];
    const rememberedEffort =
        preference?.effort && model.thinkingLevels.includes(preference.effort)
            ? preference.effort
            : undefined;
    const supportedDefaultEffort =
        defaultEffort && model.thinkingLevels.includes(defaultEffort) ? defaultEffort : undefined;
    const serviceTier =
        preference?.serviceTier && model.serviceTiers.includes(preference.serviceTier)
            ? preference.serviceTier
            : undefined;
    return {
        providerId: identity.providerId,
        modelId: identity.modelId,
        effort:
            explicitEffort ??
            supportedDefaultEffort ??
            rememberedEffort ??
            model.defaultThinkingLevel,
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
