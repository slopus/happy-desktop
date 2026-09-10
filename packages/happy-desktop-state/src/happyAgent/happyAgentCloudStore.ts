import {
    HappyAgentApiError,
    type ApiErrorBody,
    type Cloud,
    type CloudEnvironment,
    type HappyAgentClient,
} from "@slopus/happy-agent-client";
import { createStore } from "zustand/vanilla";
import type { UserError } from "../types.js";
import { happyAgentUserError } from "./happyAgentSupport.js";
import { happyAgentSyncRead } from "../happyAgentConnection/happyAgentSyncRead.js";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";

export type HappyAgentCloudStatus =
    | "loading"
    | "disconnected"
    | "authorizing"
    | "connected"
    | "unavailable";

export interface HappyAgentCloudSnapshot {
    readonly authorizationCompleting: boolean;
    readonly authorizationExpiresAt?: number;
    readonly authorizationStarting: boolean;
    readonly disconnecting: boolean;
    readonly environment?: CloudEnvironment;
    readonly error?: UserError;
    readonly status: HappyAgentCloudStatus;
    readonly user?: {
        readonly email: string;
        readonly firstName?: string;
        readonly id: string;
        readonly lastName?: string;
    };
}

export interface HappyAgentCloudStore {
    get(): HappyAgentCloudSnapshot;
    subscribe(listener: () => void): () => void;
    cloudAccountConnect(): void;
    cloudAccountDisconnect(): void;
    [Symbol.dispose](): void;
}

export interface HappyAgentCloudHost {
    cloudAuthCallbackSubscribe(listener: () => void): () => void;
    cloudAuthCallbackTake(): Promise<string | undefined>;
    cloudAuthConfigurationGet(): Promise<{
        readonly environment: CloudEnvironment;
        readonly redirectUri: string;
    }>;
    cloudAuthOpen(url: string): Promise<void>;
}

export interface HappyAgentCloudStoreDeps {
    readonly sync: HappyAgentSync;
    readonly client: Pick<
        HappyAgentClient,
        "completeCloudAuthorization" | "disconnectCloud" | "getCloud" | "startCloudAuthorization"
    >;
    readonly host: HappyAgentCloudHost;
}

const EMPTY: HappyAgentCloudSnapshot = {
    authorizationCompleting: false,
    authorizationStarting: false,
    disconnecting: false,
    status: "loading",
};

/**
 * The daemon-owned WorkOS account. Reads begin with the first subscriber;
 * pending authentication keeps following callbacks after Settings closes.
 */
export function happyAgentCloudStoreCreate(deps: HappyAgentCloudStoreDeps): HappyAgentCloudStore {
    const store = createStore<HappyAgentCloudSnapshot>()(() => EMPTY);
    const listeners = new Set<() => void>();
    let callbackReading = false;
    let callbackUnsubscribe: (() => void) | undefined;
    let controller: AbortController | undefined;
    let disposed = false;
    let version: string | undefined;

    const lifecycleStopIfIdle = (): void => {
        const current = store.getState();
        if (
            listeners.size > 0 ||
            current.authorizationStarting ||
            current.authorizationCompleting ||
            current.disconnecting ||
            current.status === "authorizing"
        )
            return;
        controller?.abort();
        controller = undefined;
        callbackUnsubscribe?.();
        callbackUnsubscribe = undefined;
    };

    const cloudAdopt = (cloud: Cloud): void => {
        if (version !== undefined && version.localeCompare(cloud.version) >= 0) {
            const { error: _cleared, ...current } = store.getState();
            if (_cleared) store.setState(current, true);
            return;
        }
        version = cloud.version;
        const current = store.getState();
        store.setState(
            {
                ...cloudProject(cloud),
                authorizationCompleting: current.authorizationCompleting,
                authorizationStarting: current.authorizationStarting,
                disconnecting: current.disconnecting,
            },
            true,
        );
        lifecycleStopIfIdle();
    };

    const callbackForward = async (): Promise<void> => {
        if (disposed || callbackReading) return;
        callbackReading = true;
        try {
            const callbackUrl = await deps.host.cloudAuthCallbackTake();
            if (!callbackUrl || disposed) return;
            store.setState({ authorizationCompleting: true, error: undefined }, false);
            const response = await deps.client.completeCloudAuthorization({ callbackUrl });
            if (disposed) return;
            cloudAdopt(response.cloud);
            store.setState({ authorizationCompleting: false }, false);
        } catch (error) {
            if (disposed) return;
            const authoritativeCloud = cloudApiErrorSnapshot(error);
            if (authoritativeCloud) cloudAdopt(authoritativeCloud);
            store.setState(
                {
                    authorizationCompleting: false,
                    error:
                        error instanceof HappyAgentApiError && error.code === "invalid_request"
                            ? undefined
                            : happyAgentUserError(error),
                },
                false,
            );
        } finally {
            callbackReading = false;
            lifecycleStopIfIdle();
        }
    };

    const follow = async (active: AbortController): Promise<void> => {
        const cloudRead = () =>
            happyAgentSyncRead(
                active.signal,
                () => deps.client.getCloud({ signal: active.signal }),
                (error) => store.setState({ error: happyAgentUserError(error) }, false),
            );
        for await (const input of deps.sync.follow({
            signal: active.signal,
            events: ["cloud.updated"],
        })) {
            try {
                if (input.kind === "error") throw input.error;
                if (input.kind === "bootstrap" || input.kind === "reconcile") {
                    const cloud =
                        input.kind === "bootstrap"
                            ? input.bootstrap.cloud
                            : (await cloudRead()).cloud;
                    if (active.signal.aborted) return;
                    if (input.kind === "bootstrap") version = undefined;
                    if (!cloud) {
                        store.setState({ ...EMPTY, status: "unavailable" }, true);
                        continue;
                    }
                    cloudAdopt(cloud);
                    continue;
                }
                const update = input.update;
                if (update.kind === "connected" && store.getState().error) {
                    const response = await cloudRead();
                    if (!active.signal.aborted) cloudAdopt(response.cloud);
                }
                if (update.kind === "event" && update.event.type === "cloud.updated")
                    cloudAdopt(update.event.payload.cloud);
            } catch (error) {
                if (!active.signal.aborted)
                    store.setState({ error: happyAgentUserError(error) }, false);
            }
        }
    };

    const lifecycleEnsure = (): void => {
        if (disposed) return;
        if (!callbackUnsubscribe) {
            callbackUnsubscribe = deps.host.cloudAuthCallbackSubscribe(() => {
                void callbackForward();
            });
            void callbackForward();
        }
        if (controller) return;
        const active = new AbortController();
        controller = active;
        void follow(active)
            .catch((error: unknown) => {
                if (disposed || active.signal.aborted) return;
                store.setState({ error: happyAgentUserError(error) }, false);
            })
            .finally(() => {
                if (controller === active) controller = undefined;
                lifecycleStopIfIdle();
            });
    };

    return {
        get: () => store.getState(),
        subscribe(listener) {
            if (disposed) return () => undefined;
            listeners.add(listener);
            const unsubscribe = store.subscribe(listener);
            if (listeners.size === 1) lifecycleEnsure();
            let released = false;
            return () => {
                if (released) return;
                released = true;
                unsubscribe();
                listeners.delete(listener);
                lifecycleStopIfIdle();
            };
        },
        cloudAccountConnect() {
            const current = store.getState();
            if (
                disposed ||
                current.authorizationStarting ||
                current.authorizationCompleting ||
                (current.status !== "disconnected" && current.status !== "authorizing")
            )
                return;
            store.setState({ authorizationStarting: true, error: undefined }, false);
            lifecycleEnsure();
            void deps.host
                .cloudAuthConfigurationGet()
                .then((configuration) =>
                    deps.client.startCloudAuthorization({
                        environment: configuration.environment,
                        redirectUri: configuration.redirectUri,
                    }),
                )
                .then(async (response) => {
                    if (disposed) return;
                    cloudAdopt(response.cloud);
                    await deps.host.cloudAuthOpen(response.cloud.authorization.url);
                    if (!disposed) store.setState({ authorizationStarting: false }, false);
                })
                .catch((error: unknown) => {
                    if (disposed) return;
                    store.setState(
                        { authorizationStarting: false, error: happyAgentUserError(error) },
                        false,
                    );
                })
                .finally(lifecycleStopIfIdle);
        },
        cloudAccountDisconnect() {
            const current = store.getState();
            if (disposed || current.status !== "connected" || current.disconnecting) return;
            store.setState({ disconnecting: true, error: undefined }, false);
            void deps.client
                .disconnectCloud()
                .then(
                    (response) => {
                        if (disposed) return;
                        cloudAdopt(response.cloud);
                        store.setState({ disconnecting: false }, false);
                    },
                    (error: unknown) => {
                        if (disposed) return;
                        store.setState(
                            { disconnecting: false, error: happyAgentUserError(error) },
                            false,
                        );
                    },
                )
                .finally(lifecycleStopIfIdle);
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            controller?.abort();
            controller = undefined;
            callbackUnsubscribe?.();
            callbackUnsubscribe = undefined;
            listeners.clear();
        },
    };
}

type CloudApiErrorBody = ApiErrorBody & { readonly cloud?: Cloud };

/** Cloud operation errors carry the authoritative snapshot in their API error body. */
function cloudApiErrorSnapshot(error: unknown): Cloud | undefined {
    if (!(error instanceof HappyAgentApiError) || error.body === null) return undefined;
    return (error.body as CloudApiErrorBody).cloud;
}

function cloudProject(cloud: Cloud): HappyAgentCloudSnapshot {
    const base = {
        authorizationCompleting: false,
        authorizationStarting: false,
        disconnecting: false,
    } as const;
    if (cloud.status === "connected")
        return {
            ...base,
            environment: cloud.environment,
            status: "connected",
            user: {
                email: cloud.user.email,
                ...(cloud.user.firstName ? { firstName: cloud.user.firstName } : {}),
                id: cloud.user.id,
                ...(cloud.user.lastName ? { lastName: cloud.user.lastName } : {}),
            },
        };
    if (cloud.status === "authorizing")
        return {
            ...base,
            authorizationExpiresAt: cloud.authorization.expiresAt,
            environment: cloud.environment,
            status: "authorizing",
        };
    return {
        ...base,
        status: "disconnected",
        ...(cloud.error && cloud.error.code !== "authorization_expired"
            ? { error: happyAgentUserError(new Error(cloud.error.message)) }
            : {}),
    };
}

const UNAVAILABLE: HappyAgentCloudSnapshot = { ...EMPTY, status: "unavailable" };

export const happyAgentCloudStoreNoop: HappyAgentCloudStore = {
    get: () => UNAVAILABLE,
    subscribe: () => () => undefined,
    cloudAccountConnect: () => undefined,
    cloudAccountDisconnect: () => undefined,
    [Symbol.dispose]: () => undefined,
};
