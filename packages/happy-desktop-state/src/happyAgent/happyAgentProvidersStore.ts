import { createStore } from "zustand/vanilla";
import type { DaemonConfig, HappyAgentClient } from "@slopus/happy-agent-client";
import type { UserError } from "../types.js";
import {
    happyAgentCustomProvidersProject,
    happyAgentProviderCredentialsProject,
    type HappyAgentCustomProviderDefinition,
    type HappyAgentCustomProviderInput,
    type HappyAgentCustomProviderProtocol,
    type HappyAgentProviderCredentialInput,
    type HappyAgentProviderCredentials,
    type HappyAgentProviderCredentialsApi,
} from "./happyAgentProviderCredentials.js";
import { happyAgentModelCatalogProject } from "./happyAgentProject.js";
import { happyAgentUserError, referencesPreserve } from "./happyAgentSupport.js";
import type { HappyAgentModelCatalog, HappyAgentModelProvider } from "./happyAgentTypes.js";

/**
 * One provider as the Providers category reads it: what the daemon says it
 * offers, plus whether a change this window asked for has been answered yet.
 */
export interface HappyAgentProviderEntry extends HappyAgentModelProvider {
    /** This window has asked for a change the daemon has not confirmed yet. */
    readonly saving: boolean;
    /**
     * The team keys a Happy Cloud server keeps for this provider, with which of
     * them this window is changing. Absent on a Happy Agent.
     */
    readonly credentials?: HappyAgentProviderCredentials & {
        readonly saving: ReadonlySet<string>;
    };
    /**
     * The protocol of a provider the team added itself on a Happy Cloud
     * server, which the team may edit and remove. Absent on built-ins.
     */
    readonly custom?: { readonly protocol: HappyAgentCustomProviderProtocol };
}

/** The team's own provider being added or edited, while its dialog is open. */
export interface HappyAgentCustomProviderEditor {
    /** The provider being edited; absent while a new one is being added. */
    readonly providerId?: string;
    /** What the server stores for the provider being edited, once read. */
    readonly definition?: HappyAgentCustomProviderDefinition;
    readonly loading: boolean;
    readonly saving: boolean;
    readonly removing: boolean;
    /** Why reading, saving, or removing was refused. Cleared by the next attempt. */
    readonly error?: UserError;
}

export interface HappyAgentProvidersSnapshot {
    /** Every provider the daemon knows about, in the order it reports them. */
    readonly providers: readonly HappyAgentProviderEntry[];
    /** True until the first answer arrives, so "no providers" is not claimed early. */
    readonly loading: boolean;
    /** Why the provider list could not be read; retained readings stay beneath it. */
    readonly error?: UserError;
    /** Why the last enablement change was refused. Cleared by the next attempt. */
    readonly saveError?: UserError;
    /** Whether the reader may add, edit, and remove the team's own providers. */
    readonly customProvidersManageable: boolean;
    readonly customProviderEditor?: HappyAgentCustomProviderEditor;
}

/**
 * The Inference settings category: every provider this Happy Agent knows about
 * and whether it may be used.
 *
 * Enablement is the daemon's own durable configuration rather than a preference
 * of this window, so switching a provider off here switches it off for every
 * agent on the machine. The store never guesses the outcome: a change marks the
 * provider as waiting, and the configuration the daemon answers with is what the
 * surface then shows.
 */
export interface HappyAgentProvidersStore {
    get(): HappyAgentProvidersSnapshot;
    subscribe(listener: () => void): () => void;
    /** Asks the daemon to start or stop using one provider machine-wide. */
    providerEnabledUpdate(providerId: string, enabled: boolean): void;
    /**
     * Adds a team API key to a Happy Cloud provider. Rejects with the server's
     * reason, such as only the owner being allowed to.
     */
    credentialAdd(providerId: string, input: HappyAgentProviderCredentialInput): Promise<void>;
    /** Turns one team key on or off; a refusal lands in `saveError`. */
    credentialEnabledUpdate(providerId: string, credentialId: string, enabled: boolean): void;
    /** Removes one team key; a refusal lands in `saveError`. */
    credentialRemove(providerId: string, credentialId: string): void;
    /** Opens the dialog that adds a provider of the team's own. */
    customProviderCreateOpen(): void;
    /** Opens the dialog for one of the team's own providers and reads what it stores. */
    customProviderEditOpen(providerId: string): void;
    customProviderEditorClose(): void;
    /** Creates or replaces the provider; the dialog closes once the server accepts. */
    customProviderSave(providerId: string, input: HappyAgentCustomProviderInput): void;
    /** Removes the provider being edited; the dialog closes once the server accepts. */
    customProviderRemove(providerId: string): void;
    [Symbol.dispose](): void;
}

export interface HappyAgentProvidersStoreDeps {
    readonly client: Pick<HappyAgentClient, "getConfig" | "patchConfig">;
    /**
     * Hands on the catalog the daemon has just confirmed. Enabling a provider
     * changes what every picker in the window may offer, so the one catalog
     * authority is told rather than left holding the configuration from before.
     */
    readonly catalogChanged?: (catalog: HappyAgentModelCatalog) => void;
    /** Happy Cloud's team key routes; absent on a Happy Agent, which keeps none. */
    readonly credentials?: HappyAgentProviderCredentialsApi;
}

const EMPTY: HappyAgentProvidersSnapshot = {
    providers: [],
    loading: true,
    customProvidersManageable: false,
};

/**
 * How often the open category re-reads the daemon's configuration. Providers
 * have no realtime channel yet, so the surface polls while it is watched and
 * stops the moment nobody is.
 */
const PROVIDERS_POLL_INTERVAL_MS = 4_000;

export function happyAgentProvidersStoreCreate(
    deps: HappyAgentProvidersStoreDeps,
): HappyAgentProvidersStore {
    const store = createStore<HappyAgentProvidersSnapshot>()(() => EMPTY);
    const listeners = new Set<() => void>();
    /** Providers whose requested change the daemon has not answered yet. */
    const saving = new Set<string>();
    /** Team keys whose requested change the server has not answered yet, by provider. */
    const credentialSaving = new Map<string, Set<string>>();
    const NO_CREDENTIALS_SAVING: ReadonlySet<string> = new Set();
    /**
     * Accepted key changes still marked as changing until the configuration
     * read after them lands, so the row never shows the state from before.
     */
    let credentialSettles: (() => void)[] = [];
    /** The team keys the server last reported, by provider. */
    let credentials: ReadonlyMap<string, HappyAgentProviderCredentials> = new Map();
    /** The team's own providers the server last reported, by protocol. */
    let customProtocols: ReadonlyMap<string, HappyAgentCustomProviderProtocol> = new Map();
    /** Whether the reader's permissions have been asked for since the surface was watched. */
    let permissionsAsked = false;
    const entryOf = (provider: HappyAgentModelProvider): HappyAgentProviderEntry => {
        const keys = credentials.get(provider.id);
        const protocol = customProtocols.get(provider.id);
        const { custom: _custom, ...rest } = provider as HappyAgentProviderEntry;
        return {
            ...rest,
            ...(protocol ? { custom: { protocol } } : {}),
            saving: saving.has(provider.id),
            ...(keys
                ? {
                      credentials: {
                          ...keys,
                          saving: credentialSaving.get(provider.id) ?? NO_CREDENTIALS_SAVING,
                      },
                  }
                : {}),
        };
    };
    let disposed = false;
    let controller: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const timerCancel = (): void => {
        if (timer === undefined) return;
        clearTimeout(timer);
        timer = undefined;
    };

    const schedule = (): void => {
        if (disposed || listeners.size === 0 || timer !== undefined) return;
        timer = setTimeout(() => {
            timer = undefined;
            load();
        }, PROVIDERS_POLL_INTERVAL_MS);
    };

    /**
     * Replaces the list with the one the daemon has just confirmed. Rows the
     * answer leaves unchanged keep their identity, so a poll every few seconds
     * does not replace every card in the category.
     */
    const settle = (config: DaemonConfig): void => {
        const catalog = happyAgentModelCatalogProject(config);
        credentials = happyAgentProviderCredentialsProject(config);
        customProtocols = happyAgentCustomProvidersProject(config);
        for (const clear of credentialSettles) clear();
        credentialSettles = [];
        const current = store.getState();
        const providers = referencesPreserve(current.providers, catalog.providers.map(entryOf));
        const { error: _cleared, ...rest } = current;
        store.setState({ ...rest, providers, loading: false }, true);
        deps.catalogChanged?.(catalog);
    };

    /** Re-marks the rows waiting on an answer without re-reading the daemon. */
    const savingPublish = (): void => {
        const current = store.getState();
        const providers = referencesPreserve(
            current.providers,
            current.providers.map((provider) =>
                provider.saving === saving.has(provider.id) &&
                provider.credentials?.saving ===
                    (credentialSaving.get(provider.id) ?? NO_CREDENTIALS_SAVING)
                    ? provider
                    : entryOf(provider),
            ),
        );
        if (providers === current.providers) return;
        store.setState({ providers }, false);
    };

    const load = (): void => {
        if (disposed || listeners.size === 0 || controller !== undefined) return;
        timerCancel();
        const currentController = new AbortController();
        controller = currentController;
        void deps.client.getConfig({ signal: currentController.signal }).then(
            (response) => {
                if (disposed || controller !== currentController) return;
                settle(response.config);
                // Only a Happy Cloud server keeps team keys and the team's own providers.
                const api = deps.credentials;
                if (api && credentials.size > 0 && !permissionsAsked) {
                    permissionsAsked = true;
                    void api.permissionsRead().then(
                        (granted) => {
                            if (disposed) return;
                            const manageable = granted.has("providers.manage");
                            if (store.getState().customProvidersManageable !== manageable)
                                store.setState({ customProvidersManageable: manageable }, false);
                        },
                        () => {
                            permissionsAsked = false;
                        },
                    );
                }
                controller = undefined;
                schedule();
            },
            (error: unknown) => {
                if (
                    disposed ||
                    controller !== currentController ||
                    currentController.signal.aborted
                )
                    return;
                controller = undefined;
                // A failed refresh never empties a list the daemon has already
                // answered: only the first read has nothing to keep, and it owns
                // the error surface.
                if (store.getState().loading)
                    store.setState({ error: happyAgentUserError(error), loading: false }, false);
                schedule();
            },
        );
    };

    /** Reads the configuration again at once, after a change the server accepted. */
    function reread(): void {
        timerCancel();
        controller?.abort();
        controller = undefined;
        load();
    }

    /** Marks one team key as changing until the server answers the change. */
    function credentialChange(
        providerId: string,
        credentialId: string,
        change: (api: HappyAgentProviderCredentialsApi) => Promise<void>,
    ): void {
        const api = deps.credentials;
        if (disposed || !api || credentialSaving.get(providerId)?.has(credentialId)) return;
        credentialSaving.set(
            providerId,
            new Set(credentialSaving.get(providerId)).add(credentialId),
        );
        const { saveError: _cleared, ...rest } = store.getState();
        store.setState(rest, true);
        savingPublish();
        const settled = (): void => {
            const next = new Set(credentialSaving.get(providerId));
            next.delete(credentialId);
            if (next.size === 0) credentialSaving.delete(providerId);
            else credentialSaving.set(providerId, next);
        };
        void change(api).then(
            () => {
                if (disposed) return;
                credentialSettles.push(settled);
                reread();
            },
            (error: unknown) => {
                if (disposed) return;
                settled();
                savingPublish();
                store.setState({ saveError: happyAgentUserError(error) }, false);
            },
        );
    }

    /** Replaces the open dialog's state, unless it has closed or moved to another provider. */
    const editorUpdate = (
        providerId: string | undefined,
        next: (
            editor: HappyAgentCustomProviderEditor,
        ) => HappyAgentCustomProviderEditor | undefined,
    ): void => {
        const editor = store.getState().customProviderEditor;
        if (disposed || !editor || editor.providerId !== providerId) return;
        const { customProviderEditor: _replaced, ...rest } = store.getState();
        const updated = next(editor);
        store.setState(updated ? { ...rest, customProviderEditor: updated } : rest, true);
    };
    const editorClean = (
        editor: HappyAgentCustomProviderEditor,
        change: Partial<Omit<HappyAgentCustomProviderEditor, "error">>,
    ): HappyAgentCustomProviderEditor => {
        const { error: _cleared, ...rest } = editor;
        return { ...rest, ...change };
    };

    return {
        get: () => store.getState(),
        subscribe(listener) {
            if (disposed) return () => undefined;
            listeners.add(listener);
            const unsubscribe = store.subscribe(listener);
            if (listeners.size === 1) load();
            let released = false;
            return () => {
                if (released) return;
                released = true;
                unsubscribe();
                listeners.delete(listener);
                if (listeners.size !== 0) return;
                permissionsAsked = false;
                timerCancel();
                controller?.abort();
                controller = undefined;
            };
        },
        providerEnabledUpdate(providerId, enabled) {
            if (disposed || saving.has(providerId)) return;
            saving.add(providerId);
            const { saveError: _cleared, ...rest } = store.getState();
            store.setState(rest, true);
            savingPublish();
            // The poll would otherwise land mid-write and show the configuration
            // from before the change as though the change had not been made.
            timerCancel();
            controller?.abort();
            controller = undefined;
            void deps.client.patchConfig({ providers: { [providerId]: { enabled } } }).then(
                (response) => {
                    if (disposed) return;
                    saving.delete(providerId);
                    settle(response.config);
                    schedule();
                },
                (error: unknown) => {
                    if (disposed) return;
                    saving.delete(providerId);
                    savingPublish();
                    store.setState({ saveError: happyAgentUserError(error) }, false);
                    schedule();
                },
            );
        },
        credentialAdd(providerId, input) {
            const api = deps.credentials;
            if (disposed || !api) return Promise.reject(happyAgentUserError("Not available here."));
            return api.credentialAdd(providerId, input).then(reread, (error: unknown) => {
                throw happyAgentUserError(error);
            });
        },
        credentialEnabledUpdate(providerId, credentialId, enabled) {
            credentialChange(providerId, credentialId, (api) =>
                api.credentialEnabledUpdate(providerId, credentialId, enabled),
            );
        },
        credentialRemove(providerId, credentialId) {
            credentialChange(providerId, credentialId, (api) =>
                api.credentialRemove(providerId, credentialId),
            );
        },
        customProviderCreateOpen() {
            if (disposed || !deps.credentials) return;
            store.setState(
                {
                    customProviderEditor: {
                        loading: false,
                        saving: false,
                        removing: false,
                    },
                },
                false,
            );
        },
        customProviderEditOpen(providerId) {
            const api = deps.credentials;
            if (disposed || !api) return;
            store.setState(
                {
                    customProviderEditor: {
                        providerId,
                        loading: true,
                        saving: false,
                        removing: false,
                    },
                },
                false,
            );
            void api.customProviderRead(providerId).then(
                (definition) =>
                    editorUpdate(providerId, (editor) =>
                        editorClean(editor, { definition, loading: false }),
                    ),
                (error: unknown) =>
                    editorUpdate(providerId, (editor) => ({
                        ...editor,
                        loading: false,
                        error: happyAgentUserError(error),
                    })),
            );
        },
        customProviderEditorClose() {
            const editor = store.getState().customProviderEditor;
            if (disposed || !editor || editor.saving || editor.removing) return;
            const { customProviderEditor: _closed, ...rest } = store.getState();
            store.setState(rest, true);
        },
        customProviderSave(providerId, input) {
            const api = deps.credentials;
            const editor = store.getState().customProviderEditor;
            if (disposed || !api || !editor || editor.saving || editor.removing) return;
            const key = editor.providerId;
            editorUpdate(key, (current) => editorClean(current, { saving: true }));
            void api.customProviderSave(providerId, input).then(
                () => {
                    editorUpdate(key, () => undefined);
                    if (!disposed) reread();
                },
                (error: unknown) =>
                    editorUpdate(key, (current) => ({
                        ...current,
                        saving: false,
                        error: happyAgentUserError(error),
                    })),
            );
        },
        customProviderRemove(providerId) {
            const api = deps.credentials;
            const editor = store.getState().customProviderEditor;
            if (disposed || !api || editor?.providerId !== providerId) return;
            if (editor.saving || editor.removing) return;
            editorUpdate(providerId, (current) => editorClean(current, { removing: true }));
            void api.customProviderRemove(providerId).then(
                () => {
                    editorUpdate(providerId, () => undefined);
                    if (!disposed) reread();
                },
                (error: unknown) =>
                    editorUpdate(providerId, (current) => ({
                        ...current,
                        removing: false,
                        error: happyAgentUserError(error),
                    })),
            );
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            timerCancel();
            controller?.abort();
            controller = undefined;
            saving.clear();
            listeners.clear();
        },
    };
}

const INERT_SNAPSHOT: HappyAgentProvidersSnapshot = {
    providers: [],
    loading: false,
    customProvidersManageable: false,
};

/**
 * The providers of a Happy Agent this window cannot reach. It is permanently
 * empty and settled, so the category says the machine is unavailable instead of
 * claiming it has no providers.
 */
export const happyAgentProvidersStoreNoop: HappyAgentProvidersStore = {
    get: () => INERT_SNAPSHOT,
    subscribe: () => () => undefined,
    providerEnabledUpdate: () => undefined,
    credentialAdd: () => Promise.reject(new Error("Not available here.")),
    credentialEnabledUpdate: () => undefined,
    credentialRemove: () => undefined,
    customProviderCreateOpen: () => undefined,
    customProviderEditOpen: () => undefined,
    customProviderEditorClose: () => undefined,
    customProviderSave: () => undefined,
    customProviderRemove: () => undefined,
    [Symbol.dispose]: () => undefined,
};
