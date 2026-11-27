import {
    HappyAgentApiError,
    happyIntegrationSchema,
    type HappyAgentClient,
    type HappyIntegration,
} from "@slopus/happy-agent-client";
import { Value } from "@sinclair/typebox/value";
import { createStore } from "zustand/vanilla";
import type { UserError } from "../types.js";
import type { HappyAgentMobileConnectorStore } from "./happyAgentMobileConnectorStore.js";
import { happyAgentUserError } from "./happyAgentSupport.js";
import { happyAgentSyncRead } from "../happyAgentConnection/happyAgentSyncRead.js";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { happyDesktopMobileOnboardingStoreCreate } from "../onboarding/happyDesktopMobileOnboardingStore.js";
import type {
    HappyDesktopMobileStep,
    HappyMobileOnboardingStore,
} from "../onboarding/happyMobileOnboardingStore.js";

export type HappyAgentIntegrationStatus =
    | "loading"
    | "disabled"
    | "disconnected"
    | "pairing"
    | "connecting"
    | "connected"
    | "failed"
    | "unavailable";

/** The open Disconnect confirmation, kept until the request settles. */
export interface HappyMobileManagementConfirmation {
    readonly kind: "disconnect";
    readonly pending: boolean;
    readonly error?: string;
}

/** The Happy Mobile connection as the Happy settings category reads it. */
export interface HappyAgentIntegrationSnapshot {
    /** Undefined until the daemon has reported whether it holds a pairing. */
    readonly configured?: boolean;
    /** True while this window is waiting for the daemon to confirm an unlink. */
    readonly disconnecting: boolean;
    /** True while this window is waiting for the daemon to connect a saved pairing again. */
    readonly pairingStarting: boolean;
    /** Why the live integration state could not be read. */
    readonly error?: UserError;
    /** Why the last unlink was refused. Cleared by the next attempt. */
    readonly disconnectError?: UserError;
    /** Why the last reconnect was refused. Cleared by the next attempt. */
    readonly pairingError?: UserError;
    /** The daemon's own detail for a disconnected or failed integration. */
    readonly message?: string;
    /** The daemon's stable code for `message`, such as `happy_unavailable`. */
    readonly messageCode?: string;
    readonly status: HappyAgentIntegrationStatus;
    readonly updatedAt?: number;
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
    /**
     * Keeps a saved pairing and asks the daemon to connect it again. This is
     * how a failed removal is abandoned ("Keep linked") and how any other
     * failed saved pairing is retried; it never replaces the credentials.
     */
    happyIntegrationReconnect(): void;
    happyIntegrationDisconnectRequest(): void;
    mobileManagementCancel(): void;
    mobileManagementConfirm(): void;
    /**
     * Present only for the local Desktop, which walks through getting the app
     * before the direct code; remote Agents open the direct code in place.
     */
    readonly mobileSetup?: {
        start(): void;
        continue(): void;
        close(): void;
    };
    [Symbol.dispose](): void;
}

export interface HappyAgentIntegrationStoreDeps {
    /** The local desktop pairs through the guided setup; remote Agents pair in place. */
    readonly guidedMobileSetup?: boolean;
    /** The same Happy Agent's direct connector, whose code the guided setup offers. */
    readonly mobileConnector?: HappyAgentMobileConnectorStore;
    readonly sync: HappyAgentSync;
    readonly client: Pick<
        HappyAgentClient,
        "disconnectHappyIntegration" | "getHappyIntegration" | "startHappyIntegration"
    >;
}

const EMPTY: HappyAgentIntegrationSnapshot = {
    disconnecting: false,
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
    const store = createStore<HappyAgentIntegrationSnapshot>()(() => EMPTY);
    const listeners = new Set<() => void>();
    let controller: AbortController | undefined;
    let disposed = false;
    let version: string | undefined;
    let setup: HappyMobileOnboardingStore | undefined;
    let setupUnsubscribe: (() => void) | undefined;

    const managementClose = (): void => {
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
            ...(deps.mobileConnector ? { mobileConnector: deps.mobileConnector } : {}),
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
                ...(current.setup ? { setup: current.setup } : {}),
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
                    const integration =
                        input.kind === "bootstrap"
                            ? input.bootstrap.happyIntegration
                            : (await integrationRead()).integration;
                    if (active.signal.aborted) return;
                    if (input.kind === "bootstrap") version = undefined;
                    if (!integration) {
                        const { setup, management } = store.getState();
                        store.setState(
                            {
                                ...EMPTY,
                                status: "unavailable",
                                ...(setup ? { setup } : {}),
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
                  },
              }
            : {}),
        subscribe(listener) {
            if (disposed) return () => undefined;
            listeners.add(listener);
            const unsubscribe = store.subscribe(listener);
            if (listeners.size === 1) followEnsure();
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
                    // A refused removal answers with the integration it left
                    // behind: still linked, and failed. Adopting it here does
                    // not depend on the stream event having arrived first.
                    const integration =
                        error instanceof HappyAgentApiError
                            ? error.body?.["integration"]
                            : undefined;
                    if (Value.Check(happyIntegrationSchema, integration))
                        integrationAdopt(integration);
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
        mobileManagementCancel() {
            if (disposed || store.getState().management?.pending) return;
            managementClose();
        },
        mobileManagementConfirm() {
            const current = store.getState().management;
            if (disposed || !current || current.pending) return;
            integrationStore.happyIntegrationDisconnect();
        },
        happyIntegrationReconnect() {
            const current = store.getState();
            if (
                disposed ||
                current.configured !== true ||
                current.status !== "failed" ||
                current.disconnecting ||
                current.pairingStarting
            )
                return;
            const { disconnectError: _removal, pairingError: _pairing, ...rest } = current;
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
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            setupClose();
            controller?.abort();
            controller = undefined;
            listeners.clear();
        },
    };
    return integrationStore;
}

function integrationProject(integration: HappyIntegration): HappyAgentIntegrationSnapshot {
    return {
        configured: integration.configured,
        disconnecting: false,
        pairingStarting: false,
        status: integration.status,
        updatedAt: integration.updatedAt,
        ...((integration.status === "disconnected" || integration.status === "failed") &&
        integration.error
            ? { message: integration.error.message, messageCode: integration.error.code }
            : {}),
    };
}

/**
 * The first Happy Agent whose Disconnect deletes this computer, and the chats
 * it published, from the Happy account. Older Agents only forget the pairing,
 * and the copy shown for Disconnect must say which of the two will happen.
 */
export const HAPPY_AGENT_COMPUTER_REMOVAL_VERSION = "0.4.84-preview.1";

/**
 * Whether this window asked to remove the computer and Happy could not confirm
 * it: the pairing is still saved and closed until the removal is retried or
 * abandoned. Without this window's own refused request, a failed saved pairing
 * is an ordinary connection failure.
 */
export function happyAgentIntegrationRemovalIncomplete(
    snapshot: HappyAgentIntegrationSnapshot,
): boolean {
    return (
        snapshot.configured === true &&
        snapshot.status === "failed" &&
        snapshot.messageCode === "happy_unavailable" &&
        snapshot.disconnectError !== undefined
    );
}

const UNAVAILABLE: HappyAgentIntegrationSnapshot = {
    disconnecting: false,
    pairingStarting: false,
    status: "unavailable",
};

/** A settled stand-in when this window has no Happy Agent integration source. */
export const happyAgentIntegrationStoreNoop: HappyAgentIntegrationStore = {
    get: () => UNAVAILABLE,
    subscribe: () => () => undefined,
    happyIntegrationDisconnect: () => undefined,
    happyIntegrationReconnect: () => undefined,
    happyIntegrationDisconnectRequest: () => undefined,
    mobileManagementCancel: () => undefined,
    mobileManagementConfirm: () => undefined,
    [Symbol.dispose]: () => undefined,
};
