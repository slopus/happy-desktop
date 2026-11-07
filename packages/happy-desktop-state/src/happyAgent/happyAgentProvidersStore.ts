import { createStore } from "zustand/vanilla";
import type { DaemonConfig, HappyAgentClient } from "@slopus/happy-agent-client";
import type { UserError } from "../types.js";
import {
    happyAgentProviderCredentialsProject,
    type HappyAgentProviderCli,
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
     * The team subscription a Happy Cloud server signs in to for this
     * provider, such as a ChatGPT or Claude plan. Absent elsewhere.
     */
    readonly subscription?: HappyAgentProviderSubscription;
}

export interface HappyAgentProviderSubscription {
    /** The vendor's name for what is signed in to, such as "Codex". */
    readonly name: string;
    readonly signIn: HappyAgentProviderCli["signIn"];
    /** The current or last sign-in; its authorization says what to do next. */
    readonly operation: HappyAgentProviderCli["operation"];
    /** A start, code, or cancel this window sent that is not answered yet. */
    readonly pending: boolean;
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
}

/**
 * The Providers settings category: every provider this Happy Agent knows about
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
    /** Starts the team subscription's sign-in; a refusal lands in `saveError`. */
    subscriptionSignIn(providerId: string): void;
    /** Hands the waiting sign-in the code the vendor's page showed. */
    subscriptionCodeSubmit(providerId: string, code: string): Promise<void>;
    /** Stops the sign-in that is waiting. */
    subscriptionSignInCancel(providerId: string): void;
    /** Signs the team out of the subscription, removing its shared credential. */
    subscriptionSignOut(providerId: string): void;
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

const EMPTY: HappyAgentProvidersSnapshot = { providers: [], loading: true };

/**
 * How often the open category re-reads the daemon's configuration. Providers
 * have no realtime channel yet, so the surface polls while it is watched and
 * stops the moment nobody is.
 */
const PROVIDERS_POLL_INTERVAL_MS = 4_000;
/** How often a sign-in the person is finishing is re-read, so it lands promptly. */
const SIGN_IN_POLL_INTERVAL_MS = 1_500;

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
    /** The server's subscription sign-ins, by the provider each serves. */
    let clis: ReadonlyMap<string, HappyAgentProviderCli> = new Map();
    /** Providers whose sign-in request this window has not had answered. */
    const cliPending = new Set<string>();
    const subscriptionOf = (providerId: string): HappyAgentProviderSubscription | undefined => {
        const cli = clis.get(providerId);
        if (!cli) return undefined;
        return {
            name: cli.name,
            signIn: cli.signIn,
            operation: cli.operation,
            pending: cliPending.has(providerId),
        };
    };
    const subscriptionsEqual = (
        left: HappyAgentProviderSubscription | undefined,
        right: HappyAgentProviderSubscription | undefined,
    ): boolean =>
        left === right ||
        (left !== undefined &&
            right !== undefined &&
            left.pending === right.pending &&
            JSON.stringify(left) === JSON.stringify(right));
    const entryOf = (provider: HappyAgentModelProvider): HappyAgentProviderEntry => {
        const keys = credentials.get(provider.id);
        const subscription = subscriptionOf(provider.id);
        const { subscription: _previous, ...rest } = provider as HappyAgentProviderEntry;
        return {
            ...rest,
            ...(subscription ? { subscription } : {}),
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
        const signingIn = [...clis.values()].some(
            (cli) => cli.operation?.status === "running" || cli.operation?.status === "waiting",
        );
        timer = setTimeout(
            () => {
                timer = undefined;
                load();
            },
            signingIn ? SIGN_IN_POLL_INTERVAL_MS : PROVIDERS_POLL_INTERVAL_MS,
        );
    };

    /**
     * Replaces the list with the one the daemon has just confirmed. Rows the
     * answer leaves unchanged keep their identity, so a poll every few seconds
     * does not replace every card in the category.
     */
    const settle = (config: DaemonConfig): void => {
        const catalog = happyAgentModelCatalogProject(config);
        credentials = happyAgentProviderCredentialsProject(config);
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
                    (credentialSaving.get(provider.id) ?? NO_CREDENTIALS_SAVING) &&
                subscriptionsEqual(provider.subscription, subscriptionOf(provider.id))
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
            async (response) => {
                if (disposed || controller !== currentController) return;
                settle(response.config);
                // Only a Happy Cloud server signs subscriptions in for its team.
                const api = deps.credentials;
                if (api && credentials.size > 0) {
                    const read = await api.providerClisRead().catch(() => undefined);
                    if (disposed || controller !== currentController) return;
                    if (read) clisAccept(read);
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

    /** Keeps the newer of what is known and what arrived, and redraws what changed. */
    function clisAccept(read: readonly HappyAgentProviderCli[]): void {
        const next = new Map(clis);
        for (const cli of read) {
            if (cli.providerId === null) continue;
            const known = next.get(cli.providerId);
            if (!known || known.version <= cli.version) next.set(cli.providerId, cli);
        }
        clis = next;
        savingPublish();
    }

    /** Sends one sign-in request for a provider and takes in the sign-in it answers with. */
    function cliSend(
        providerId: string,
        request: (
            api: HappyAgentProviderCredentialsApi,
            cliId: string,
        ) => Promise<HappyAgentProviderCli>,
    ): Promise<void> {
        const api = deps.credentials;
        const cli = clis.get(providerId);
        if (disposed || !api || !cli)
            return Promise.reject(happyAgentUserError("Not available here."));
        cliPending.add(providerId);
        const { saveError: _cleared, ...rest } = store.getState();
        store.setState(rest, true);
        savingPublish();
        return request(api, cli.id).then(
            (answer) => {
                cliPending.delete(providerId);
                if (disposed) return;
                clisAccept([answer]);
                timerCancel();
                schedule();
            },
            (error: unknown) => {
                cliPending.delete(providerId);
                if (!disposed) savingPublish();
                throw happyAgentUserError(error);
            },
        );
    }

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
        subscriptionSignIn(providerId) {
            if (cliPending.has(providerId)) return;
            void cliSend(providerId, (api, cliId) =>
                api.signInStart(cliId, crypto.randomUUID()),
            ).catch((error: unknown) => {
                if (!disposed) store.setState({ saveError: happyAgentUserError(error) }, false);
            });
        },
        subscriptionCodeSubmit(providerId, code) {
            return cliSend(providerId, (api, cliId) =>
                api.signInCodeSubmit(cliId, code, crypto.randomUUID()),
            );
        },
        subscriptionSignInCancel(providerId) {
            void cliSend(providerId, (api, cliId) =>
                api.signInCancel(cliId, crypto.randomUUID()),
            ).catch((error: unknown) => {
                if (!disposed) store.setState({ saveError: happyAgentUserError(error) }, false);
            });
        },
        subscriptionSignOut(providerId) {
            credentialChange(providerId, "default", (api) =>
                api.credentialRemove(providerId, "default"),
            );
        },
        credentialRemove(providerId, credentialId) {
            credentialChange(providerId, credentialId, (api) =>
                api.credentialRemove(providerId, credentialId),
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

const INERT_SNAPSHOT: HappyAgentProvidersSnapshot = { providers: [], loading: false };

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
    subscriptionSignIn: () => undefined,
    subscriptionCodeSubmit: () => Promise.reject(new Error("Not available here.")),
    subscriptionSignInCancel: () => undefined,
    subscriptionSignOut: () => undefined,
    [Symbol.dispose]: () => undefined,
};
