import type { HappyAgentClient, HappyIntegration } from "@slopus/happy-agent-client";
import { createStore } from "zustand/vanilla";
import type { UserError } from "../types.js";
import { happyAgentUserError } from "./happyAgentSupport.js";
import { happyAgentSyncRead } from "../happyAgentConnection/happyAgentSyncRead.js";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { happyDesktopMobileOnboardingStoreCreate } from "../onboarding/happyDesktopMobileOnboardingStore.js";
import type {
    HappyDesktopMobileStep,
    HappyMobileOnboardingStore,
} from "../onboarding/happyMobileOnboardingStore.js";
import type {
    HappyMobileManagementConfirmation,
    HappyTerminalCliInspection,
    HappyTerminalCliResetOutcome,
    HappyTerminalCliResetRequest,
    HappyTerminalCliSnapshot,
} from "./happyTerminalCli.js";

export type HappyAgentIntegrationStatus =
    | "loading"
    | "disabled"
    | "disconnected"
    | "pairing"
    | "connecting"
    | "connected"
    | "failed"
    | "unavailable";

/** The Happy Mobile connection as the Happy settings category reads it. */
export interface HappyAgentIntegrationSnapshot {
    /** Undefined until the daemon has reported whether it holds a pairing. */
    readonly configured?: boolean;
    /** True while this window is waiting for the daemon to confirm an unlink. */
    readonly disconnecting: boolean;
    /** True while this window is waiting for the daemon to start pairing. */
    readonly pairingStarting: boolean;
    /** True while this window is waiting for the daemon to cancel pairing. */
    readonly pairingCanceling: boolean;
    /** Why the live integration state could not be read. */
    readonly error?: UserError;
    /** Why the last unlink was refused. Cleared by the next attempt. */
    readonly disconnectError?: UserError;
    /** Why the last pairing action was refused. Cleared by the next attempt. */
    readonly pairingError?: UserError;
    /** The opaque QR authorization supplied only while pairing is active. */
    readonly pairing?: {
        readonly data: string;
        readonly expiresAt: number;
    };
    /** The daemon's own detail for a disconnected or failed integration. */
    readonly message?: string;
    readonly status: HappyAgentIntegrationStatus;
    readonly updatedAt?: number;
    readonly terminalCli?: HappyTerminalCliSnapshot;
    readonly terminalSetupSupport?: "standalone" | "personal" | "unknown";
    readonly terminalCliReadError?: string;
    readonly management?: HappyMobileManagementConfirmation;
    /** Projection of the shared first-run flow while local setup is open. */
    readonly setup?: HappyDesktopMobileStep;
}

/** The authenticated owner's Happy Mobile integration, read while its surface is open. */
export interface HappyAgentIntegrationStore {
    get(): HappyAgentIntegrationSnapshot;
    subscribe(listener: () => void): () => void;
    /** Unlinks the authenticated owner's Happy Agent pairing from Happy Mobile. */
    happyIntegrationDisconnect(): void;
    /** Starts the authenticated owner's Happy Agent pairing with Happy Mobile. */
    happyIntegrationPair(): void;
    /** Cancels the pairing authorization currently shown by this window. */
    happyIntegrationPairingCancel(): void;
    happyIntegrationDisconnectRequest(): void;
    terminalCliResetRequest(): void;
    terminalCliRegistrationRemovalUpdate(value: boolean): void;
    mobileManagementCancel(): void;
    mobileManagementConfirm(): void;
    /** Present only for the local Desktop; remote Agents retain Agent-only pairing. */
    readonly mobileSetup?: {
        start(): void;
        continue(): void;
        close(): void;
        platformSelect(platform: "ios" | "android"): void;
    };
    [Symbol.dispose](): void;
}

export interface HappyAgentIntegrationStoreDeps {
    /** The local desktop pairs through the guided setup; remote Agents pair in place. */
    readonly guidedMobileSetup?: boolean;
    readonly readLegacyCli?: () => Promise<HappyTerminalCliInspection>;
    readonly resetLegacyCli?: (
        request: HappyTerminalCliResetRequest,
    ) => Promise<HappyTerminalCliResetOutcome>;
    readonly sync: HappyAgentSync;
    readonly client: Pick<
        HappyAgentClient,
        | "cancelHappyIntegration"
        | "disconnectHappyIntegration"
        | "getHappyIntegration"
        | "startHappyIntegration"
        | "getProfile"
    >;
}

const EMPTY: HappyAgentIntegrationSnapshot = {
    disconnecting: false,
    pairingCanceling: false,
    pairingStarting: false,
    status: "loading",
};

/**
 * Creates the settings projection of Happy Mobile's daemon-owned integration.
 *
 * The constructor opens nothing. The first subscriber reads one race-free
 * shared bootstrap or a narrow integration read, then follows the connection's
 * shared stream. Every server response is a complete replacement, so the
 * store never reconstructs connection state from event order.
 */
export function happyAgentIntegrationStoreCreate(
    deps: HappyAgentIntegrationStoreDeps,
): HappyAgentIntegrationStore {
    const store = createStore<HappyAgentIntegrationSnapshot>()(() => ({
        ...EMPTY,
        ...(deps.readLegacyCli
            ? {
                  terminalSetupSupport: "unknown" as const,
                  terminalCli: { status: "loading" as const },
              }
            : {}),
    }));
    const listeners = new Set<() => void>();
    let controller: AbortController | undefined;
    let disposed = false;
    let version: string | undefined;
    let setup: HappyMobileOnboardingStore | undefined;
    let setupUnsubscribe: (() => void) | undefined;
    let terminalTimer: ReturnType<typeof setTimeout> | undefined;
    let terminalGeneration = 0;
    let terminalReading = false;
    let terminalGuard: string | undefined;
    let confirmationGuard: string | undefined;

    const terminalStop = (): void => {
        terminalGeneration += 1;
        terminalReading = false;
        if (terminalTimer !== undefined) clearTimeout(terminalTimer);
        terminalTimer = undefined;
    };
    const terminalRead = (): void => {
        const read = deps.readLegacyCli;
        if (!read || disposed || listeners.size === 0 || terminalReading) return;
        terminalReading = true;
        const request = terminalGeneration;
        void read()
            .then(
                (result) => {
                    if (disposed || listeners.size === 0 || request !== terminalGeneration) return;
                    terminalGuard = result.identityGuard;
                    const { terminalCliReadError: _cleared, ...current } = store.getState();
                    store.setState({ ...current, terminalCli: result.snapshot }, true);
                },
                (error: unknown) => {
                    if (disposed || listeners.size === 0 || request !== terminalGeneration) return;
                    const message = happyAgentUserError(error).message;
                    store.setState({
                        terminalCliReadError: message,
                        ...(store.getState().terminalCli?.status === "loading"
                            ? { terminalCli: { status: "unavailable", message } as const }
                            : {}),
                    });
                },
            )
            .finally(() => {
                if (disposed || listeners.size === 0 || request !== terminalGeneration) return;
                terminalReading = false;
                terminalTimer = setTimeout(() => {
                    terminalTimer = undefined;
                    terminalRead();
                }, 3_000);
            });
    };
    const managementClose = (): void => {
        confirmationGuard = undefined;
        const { management: _closed, ...current } = store.getState();
        if (_closed) store.setState(current, true);
    };

    const setupClose = (): void => {
        const closing = setup;
        setup = undefined;
        setupUnsubscribe?.();
        setupUnsubscribe = undefined;
        closing?.[Symbol.dispose]();
        const { setup: _closed, ...current } = store.getState();
        store.setState(current, true);
    };
    const setupStart = (): void => {
        if (disposed || listeners.size === 0 || setup || !deps.guidedMobileSetup) return;
        if (store.getState().disconnecting) return;
        const session = happyDesktopMobileOnboardingStoreCreate({
            client: deps.client,
            sync: deps.sync,
            guided: true,
        });
        setup = session;
        const project = () => {
            if (setup !== session) return;
            const snapshot = session.get();
            if (snapshot.status === "desktop") store.setState({ setup: snapshot.step });
            else setupClose();
        };
        setupUnsubscribe = session.subscribe(project);
        project();
    };

    const integrationAdopt = (integration: HappyIntegration): void => {
        if (version !== undefined && version.localeCompare(integration.version) >= 0) {
            // A successful bootstrap or stream event also proves transport has
            // recovered when its integration version did not need replacing.
            const { error: _cleared, ...current } = store.getState();
            if (_cleared) store.setState(current, true);
            return;
        }
        version = integration.version;
        // Unlink is a lifetime boundary for the open phone setup flow.
        if (store.getState().configured === true && !integration.configured) {
            setupClose();
            if (store.getState().management?.kind === "disconnect") managementClose();
        }
        const current = store.getState();
        store.setState(
            {
                ...integrationProject(integration),
                disconnecting: current.disconnecting,
                pairingCanceling: current.pairingCanceling,
                ...(current.setup ? { setup: current.setup } : {}),
                ...(current.terminalCli ? { terminalCli: current.terminalCli } : {}),
                ...(current.terminalSetupSupport
                    ? { terminalSetupSupport: current.terminalSetupSupport }
                    : {}),
                ...(current.terminalCliReadError
                    ? { terminalCliReadError: current.terminalCliReadError }
                    : {}),
                ...(current.management ? { management: current.management } : {}),
                pairingStarting: current.pairingStarting,
                ...(integration.configured && current.disconnectError
                    ? { disconnectError: current.disconnectError }
                    : {}),
                ...(!integration.configured && current.pairingError
                    ? { pairingError: current.pairingError }
                    : {}),
            },
            true,
        );
    };

    const follow = async (active: AbortController): Promise<void> => {
        const integrationRead = () =>
            happyAgentSyncRead(
                active.signal,
                () => deps.client.getHappyIntegration({ signal: active.signal }),
                (error) => store.setState({ error: happyAgentUserError(error) }, false),
            );
        for await (const input of deps.sync.follow({
            signal: active.signal,
            events: ["happy.integration.updated"],
        })) {
            try {
                if (input.kind === "error") throw input.error;
                if (input.kind === "bootstrap" || input.kind === "reconcile") {
                    if (deps.readLegacyCli) {
                        try {
                            const profile =
                                input.kind === "bootstrap"
                                    ? input.bootstrap.profile
                                    : (await deps.client.getProfile({ signal: active.signal }))
                                          .profile;
                            if (active.signal.aborted) return;
                            store.setState({
                                terminalSetupSupport:
                                    profile.userId === null
                                        ? "standalone"
                                        : profile.userId === undefined
                                          ? "unknown"
                                          : "personal",
                            });
                        } catch {
                            if (active.signal.aborted) return;
                            store.setState({ terminalSetupSupport: "unknown" });
                        }
                    }
                    const integration =
                        input.kind === "bootstrap"
                            ? input.bootstrap.happyIntegration
                            : (await integrationRead()).integration;
                    if (active.signal.aborted) return;
                    if (input.kind === "bootstrap") version = undefined;
                    if (!integration) {
                        const {
                            setup,
                            terminalCli,
                            terminalCliReadError,
                            terminalSetupSupport,
                            management,
                        } = store.getState();
                        store.setState(
                            {
                                ...EMPTY,
                                status: "unavailable",
                                ...(setup ? { setup } : {}),
                                ...(terminalCli ? { terminalCli } : {}),
                                ...(terminalSetupSupport ? { terminalSetupSupport } : {}),
                                ...(terminalCliReadError ? { terminalCliReadError } : {}),
                                ...(management ? { management } : {}),
                            },
                            true,
                        );
                        continue;
                    }
                    integrationAdopt(integration);
                    continue;
                }
                const update = input.update;
                if (update.kind === "connected" && store.getState().error) {
                    const response = await integrationRead();
                    if (!active.signal.aborted) integrationAdopt(response.integration);
                }
                if (update.kind === "event" && update.event.type === "happy.integration.updated")
                    integrationAdopt(update.event.payload.integration);
            } catch (error) {
                if (!active.signal.aborted)
                    store.setState({ error: happyAgentUserError(error) }, false);
            }
        }
    };

    const followEnsure = (): void => {
        if (disposed || listeners.size === 0 || controller !== undefined) return;
        const active = new AbortController();
        controller = active;
        void follow(active)
            .catch((error: unknown) => {
                if (disposed || active.signal.aborted) return;
                store.setState({ error: happyAgentUserError(error) }, false);
            })
            .finally(() => {
                if (controller === active) controller = undefined;
            });
    };

    const integrationStore: HappyAgentIntegrationStore = {
        get: () => store.getState(),
        ...(deps.guidedMobileSetup
            ? {
                  mobileSetup: {
                      start: setupStart,
                      continue: () => setup?.happyMobileConnect(),
                      close: () => setup?.happyMobileSkip(),
                      platformSelect: (platform: "ios" | "android") =>
                          setup?.happyMobilePlatformSelect(platform),
                  },
              }
            : {}),
        subscribe(listener) {
            if (disposed) return () => undefined;
            listeners.add(listener);
            const unsubscribe = store.subscribe(listener);
            if (listeners.size === 1) {
                followEnsure();
                terminalRead();
            }
            let released = false;
            return () => {
                if (released) return;
                released = true;
                unsubscribe();
                listeners.delete(listener);
                if (listeners.size !== 0) return;
                controller?.abort();
                controller = undefined;
                setupClose();
                terminalStop();
                if (!store.getState().management?.pending) managementClose();
            };
        },
        happyIntegrationDisconnect() {
            const current = store.getState();
            if (disposed || current.configured !== true || current.disconnecting) return;
            const { disconnectError: _cleared, ...rest } = current;
            store.setState(
                {
                    ...rest,
                    disconnecting: true,
                    ...(current.management?.kind === "disconnect"
                        ? {
                              management: { kind: "disconnect", pending: true },
                          }
                        : {}),
                },
                true,
            );
            void deps.client.disconnectHappyIntegration().then(
                (response) => {
                    if (disposed) return;
                    integrationAdopt(response.integration);
                    store.setState({ disconnecting: false }, false);
                },
                (error: unknown) => {
                    if (disposed) return;
                    store.setState(
                        {
                            disconnectError: happyAgentUserError(error),
                            disconnecting: false,
                            ...(store.getState().management?.kind === "disconnect"
                                ? {
                                      management: {
                                          kind: "disconnect",
                                          pending: false,
                                          error: happyAgentUserError(error).message,
                                      },
                                  }
                                : {}),
                        },
                        false,
                    );
                },
            );
        },
        happyIntegrationDisconnectRequest() {
            const current = store.getState();
            if (
                disposed ||
                listeners.size === 0 ||
                !current.configured ||
                current.disconnecting ||
                current.management?.pending
            )
                return;
            store.setState({ management: { kind: "disconnect", pending: false } });
        },
        terminalCliResetRequest() {
            const current = store.getState();
            const terminal = current.terminalCli;
            if (
                disposed ||
                listeners.size === 0 ||
                !deps.resetLegacyCli ||
                !terminalGuard ||
                terminal?.status !== "available" ||
                current.management?.pending
            )
                return;
            confirmationGuard = terminalGuard;
            store.setState({
                management: {
                    kind: "terminal-reset",
                    preview: terminal.resetPreview,
                    ...(terminal.accountKeyFingerprint
                        ? { accountKeyFingerprint: terminal.accountKeyFingerprint }
                        : {}),
                    removeRegistration: false,
                    pending: false,
                },
            });
        },
        terminalCliRegistrationRemovalUpdate(value) {
            const current = store.getState().management;
            if (
                disposed ||
                current?.kind !== "terminal-reset" ||
                current.pending ||
                (value && !current.preview.registration)
            )
                return;
            store.setState({ management: { ...current, removeRegistration: value } });
        },
        mobileManagementCancel() {
            if (disposed || store.getState().management?.pending) return;
            managementClose();
        },
        mobileManagementConfirm() {
            const current = store.getState().management;
            if (disposed || !current || current.pending) return;
            if (current.kind === "disconnect") {
                integrationStore.happyIntegrationDisconnect();
                return;
            }
            const reset = deps.resetLegacyCli;
            const guard = confirmationGuard;
            if (!reset || !guard) return;
            terminalStop();
            const { error: _cleared, ...pending } = current;
            store.setState({ management: { ...pending, pending: true } });
            void reset({
                expectedGuard: guard,
                confirmed: true,
                removeRegistration: current.removeRegistration,
            })
                .then(
                    (outcome) => {
                        if (disposed) return;
                        if (outcome.status === "succeeded") managementClose();
                        else
                            store.setState({
                                management: {
                                    ...pending,
                                    pending: false,
                                    error: outcome.message,
                                    effects: {
                                        localAuthCleared: outcome.localAuthCleared,
                                        registrationRemoved: outcome.registrationRemoved,
                                        daemonStopped: outcome.daemonStopped,
                                    },
                                },
                            });
                    },
                    (error: unknown) => {
                        if (!disposed)
                            store.setState({
                                management: {
                                    ...pending,
                                    pending: false,
                                    error: happyAgentUserError(error).message,
                                },
                            });
                    },
                )
                .finally(() => {
                    if (!disposed) terminalRead();
                });
        },
        happyIntegrationPair() {
            if (deps.guidedMobileSetup) {
                setupStart();
                return;
            }
            const current = store.getState();
            if (
                disposed ||
                current.configured !== false ||
                current.pairingStarting ||
                (current.status !== "disconnected" && current.status !== "failed")
            )
                return;
            const { pairingError: _cleared, ...rest } = current;
            store.setState({ ...rest, pairingStarting: true }, true);
            void deps.client.startHappyIntegration().then(
                (response) => {
                    if (disposed) return;
                    integrationAdopt(response.integration);
                    store.setState({ pairingStarting: false }, false);
                },
                (error: unknown) => {
                    if (disposed) return;
                    store.setState(
                        { pairingError: happyAgentUserError(error), pairingStarting: false },
                        false,
                    );
                },
            );
        },
        happyIntegrationPairingCancel() {
            const current = store.getState();
            if (disposed || current.status !== "pairing" || current.pairingCanceling) return;
            const { pairingError: _cleared, ...rest } = current;
            store.setState({ ...rest, pairingCanceling: true }, true);
            void deps.client.cancelHappyIntegration().then(
                (response) => {
                    if (disposed) return;
                    integrationAdopt(response.integration);
                    store.setState({ pairingCanceling: false }, false);
                },
                (error: unknown) => {
                    if (disposed) return;
                    store.setState(
                        { pairingCanceling: false, pairingError: happyAgentUserError(error) },
                        false,
                    );
                },
            );
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            setupClose();
            controller?.abort();
            controller = undefined;
            terminalStop();
            listeners.clear();
        },
    };
    return integrationStore;
}

function integrationProject(integration: HappyIntegration): HappyAgentIntegrationSnapshot {
    return {
        configured: integration.configured,
        disconnecting: false,
        pairingCanceling: false,
        pairingStarting: false,
        status: integration.status,
        updatedAt: integration.updatedAt,
        ...(integration.status === "pairing"
            ? {
                  pairing: {
                      data: integration.authorization.data,
                      expiresAt: integration.authorization.expiresAt,
                  },
              }
            : {}),
        ...((integration.status === "disconnected" || integration.status === "failed") &&
        integration.error
            ? { message: integration.error.message }
            : {}),
    };
}

const UNAVAILABLE: HappyAgentIntegrationSnapshot = {
    disconnecting: false,
    pairingCanceling: false,
    pairingStarting: false,
    status: "unavailable",
};

/** A settled stand-in when this window has no Happy Agent integration source. */
export const happyAgentIntegrationStoreNoop: HappyAgentIntegrationStore = {
    get: () => UNAVAILABLE,
    subscribe: () => () => undefined,
    happyIntegrationDisconnect: () => undefined,
    happyIntegrationPair: () => undefined,
    happyIntegrationPairingCancel: () => undefined,
    happyIntegrationDisconnectRequest: () => undefined,
    terminalCliResetRequest: () => undefined,
    terminalCliRegistrationRemovalUpdate: () => undefined,
    mobileManagementCancel: () => undefined,
    mobileManagementConfirm: () => undefined,
    [Symbol.dispose]: () => undefined,
};
