import { createStore } from "zustand/vanilla";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import {
    HappyCloudRequestRefusal,
    type HappyCloudRequest,
} from "../happyAgent/happyAgentProviderCredentials.js";
import { happyAgentUserError, referencesPreserve } from "../happyAgent/happyAgentSupport.js";
import { UserError } from "../types.js";
import type { HappyAgentViewersActivity } from "../viewers/viewersStore.js";

/** A feature a person may turn off for their account. Pipelines is the only one today. */
export type AccountFeatureId = "pipelines";

const ACCOUNT_FEATURE_IDS: readonly AccountFeatureId[] = ["pipelines"];

/** What a feature is called before the server has named it. */
const ACCOUNT_FEATURE_NAMES: Readonly<Record<AccountFeatureId, string>> = {
    pipelines: "Pipelines",
};

/** One feature, as it is for the account in every team the person belongs to. */
export interface AccountFeature {
    readonly id: AccountFeatureId;
    /** The server's name for it. */
    readonly name: string;
    readonly enabled: boolean;
}

export interface AccountFeaturesSnapshot {
    /** True until the server first answers. */
    readonly loading: boolean;
    /**
     * False on a server older than the switch, which answers `404` or `501`:
     * every feature is on there, and none can be turned off.
     */
    readonly served: boolean;
    /** As the server last answered or announced, in its order. */
    readonly features: readonly AccountFeature[];
    /** Switches sent and not answered yet, with the value each asked for. */
    readonly pending: ReadonlyMap<AccountFeatureId, boolean>;
    /** Why the last switch failed. The next switch clears it. */
    readonly error?: UserError;
}

/**
 * The features the person has on or off for their account. The switch is the
 * account's: it applies in every team, so a change made on any server reaches
 * this one as `account.features.updated`, whose payload replaces the list.
 *
 * Subscribing reads the list, then reads it again on every reconnect and each
 * time the window comes back to the foreground. Every feature counts as on
 * until the server says it is off.
 */
export interface AccountFeaturesStore {
    get(): AccountFeaturesSnapshot;
    subscribe(listener: () => void): () => void;
    /**
     * Turns one feature on or off for the account. The list changes only once
     * the server answers; until then the value asked for is in `pending`.
     */
    featureEnabledUpdate(featureId: AccountFeatureId, enabled: boolean): void;
    [Symbol.dispose](): void;
}

/** Private authoritative input from the connection that made the store. */
export interface AccountFeaturesWriter {
    /**
     * The same requests, watched: a `feature_not_installed` refusal turns its
     * feature off here, unless the list changed after the request was sent.
     */
    requestWatch(request: HappyCloudRequest): HappyCloudRequest;
}

export const ACCOUNT_FEATURES_EVENT = "account.features.updated";

const FEATURES = "v0/account/features";

/** Whether a feature is on: every feature is, until the server says it is off. */
export function accountFeatureEnabled(
    snapshot: AccountFeaturesSnapshot,
    featureId: AccountFeatureId,
): boolean {
    return snapshot.features.find((feature) => feature.id === featureId)?.enabled !== false;
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
}

function featureIdRead(value: unknown): AccountFeatureId | undefined {
    return ACCOUNT_FEATURE_IDS.find((id) => id === value);
}

/** One feature, or undefined for one this build does not know or a malformed entry. */
function featureRead(value: unknown): AccountFeature | undefined {
    const entry = recordOf(value);
    const id = featureIdRead(entry?.id);
    if (!entry || id === undefined || typeof entry.enabled !== "boolean") return undefined;
    const name = typeof entry.name === "string" && entry.name !== "" ? entry.name : undefined;
    return { id, name: name ?? ACCOUNT_FEATURE_NAMES[id], enabled: entry.enabled };
}

/** The list `GET` answers and the event carries, or undefined when it is not that shape. */
function featuresRead(value: unknown): AccountFeature[] | undefined {
    const list = recordOf(value)?.features;
    if (!Array.isArray(list)) return undefined;
    return list.flatMap((entry: unknown) => {
        const feature = featureRead(entry);
        return feature ? [feature] : [];
    });
}

/** The feature a refusal says is off for the account, if it is one this build knows. */
export function accountFeatureRefusalRead(error: unknown): AccountFeatureId | undefined {
    if (
        !(error instanceof HappyCloudRequestRefusal) ||
        error.status !== 403 ||
        error.code !== "feature_not_installed"
    )
        return undefined;
    return featureIdRead(recordOf(error.body)?.feature);
}

const EMPTY: AccountFeaturesSnapshot = {
    loading: true,
    served: true,
    features: [],
    pending: new Map(),
};

export function accountFeaturesStoreCreate(deps: {
    readonly request: HappyCloudRequest;
    readonly sync?: HappyAgentSync;
    /** Whether the person is at this window; coming back to it reads the list again. */
    readonly activity?: HappyAgentViewersActivity;
}): { readonly store: AccountFeaturesStore; readonly writer: AccountFeaturesWriter } {
    const store = createStore<AccountFeaturesSnapshot>()(() => EMPTY);
    let disposed = false;
    let listeners = 0;
    let reading = false;
    let readAgain = false;
    let follow: AbortController | undefined;
    let activityRelease: (() => void) | undefined;
    /**
     * Counts every authoritative change to the list. An answer to a request
     * sent before the latest change is older than the list and is dropped.
     */
    let generation = 0;

    /** Replaces the list with what the server said, keeping unchanged entries. */
    const featuresApply = (
        features: readonly AccountFeature[],
        pending?: ReadonlyMap<AccountFeatureId, boolean>,
    ): void => {
        generation += 1;
        const current = store.getState();
        store.setState({
            loading: false,
            served: true,
            features: referencesPreserve(current.features, features),
            ...(pending ? { pending } : {}),
        });
    };

    const read = async (): Promise<void> => {
        const sent = generation;
        let answer: unknown;
        try {
            answer = await deps.request("GET", FEATURES);
        } catch (error) {
            // A server older than the switch has every feature on.
            if (
                error instanceof HappyCloudRequestRefusal &&
                (error.status === 404 || error.status === 501)
            ) {
                if (disposed || generation !== sent) return;
                generation += 1;
                store.setState({ loading: false, served: false, features: [] });
                return;
            }
            throw error;
        }
        if (disposed || generation !== sent) return;
        const features = featuresRead(answer);
        if (features) featuresApply(features);
        else store.setState({ loading: false });
    };

    const load = (): void => {
        if (disposed || listeners === 0) return;
        if (reading) {
            readAgain = true;
            return;
        }
        reading = true;
        readAgain = false;
        void read()
            // The list shown stays the last one read; a failed read leaves every feature as it was.
            .catch(() => {
                if (!disposed && store.getState().loading) store.setState({ loading: false });
            })
            .finally(() => {
                reading = false;
                if (readAgain) load();
            });
    };

    const followStart = (): void => {
        const sync = deps.sync;
        if (!sync || follow) return;
        const active = new AbortController();
        follow = active;
        void (async () => {
            let greeted = false;
            for await (const input of sync.follow({
                signal: active.signal,
                events: [ACCOUNT_FEATURES_EVENT],
            })) {
                const greeting = !greeted;
                greeted = true;
                // The first read was sent after this subscription was installed.
                if (input.kind === "error" || (greeting && input.kind !== "update")) continue;
                if (input.kind === "update") {
                    const update = input.update;
                    if (update.kind === "event") {
                        const event = update.event as { readonly payload?: unknown };
                        const features = featuresRead(event.payload);
                        if (features && !disposed) featuresApply(features);
                        else load();
                        continue;
                    }
                    // A reconnect may have missed a change.
                    if (update.kind !== "connected" && update.kind !== "state_lost") continue;
                }
                load();
            }
        })().catch(() => undefined);
    };

    const activityStart = (): void => {
        const activity = deps.activity;
        if (!activity || activityRelease) return;
        let present = activity.active();
        activityRelease = activity.subscribe(() => {
            const now = activity.active();
            // Coming back to the window reads again; leaving it reads nothing.
            if (now && !present) load();
            present = now;
        });
    };

    const featureRefused = (featureId: AccountFeatureId): void => {
        const current = store.getState();
        if (!accountFeatureEnabled(current, featureId)) return;
        const known = current.features.some((feature) => feature.id === featureId);
        featuresApply(
            known
                ? current.features.map((feature) =>
                      feature.id === featureId ? { ...feature, enabled: false } : feature,
                  )
                : [
                      ...current.features,
                      { id: featureId, name: ACCOUNT_FEATURE_NAMES[featureId], enabled: false },
                  ],
        );
    };

    const accountFeatures: AccountFeaturesStore = {
        get: () => store.getState(),
        subscribe(listener) {
            if (disposed) return () => undefined;
            const unsubscribe = store.subscribe(listener);
            listeners += 1;
            if (listeners === 1) {
                followStart();
                activityStart();
                // Subscribing during React's commit never publishes synchronously.
                queueMicrotask(load);
            }
            let released = false;
            return () => {
                if (released) return;
                released = true;
                unsubscribe();
                listeners -= 1;
                if (listeners > 0) return;
                follow?.abort();
                follow = undefined;
                activityRelease?.();
                activityRelease = undefined;
            };
        },
        featureEnabledUpdate(featureId, enabled) {
            if (disposed) return;
            const { error: _cleared, ...current } = store.getState();
            store.setState(
                { ...current, pending: new Map(current.pending).set(featureId, enabled) },
                true,
            );
            const sent = generation;
            void deps
                .request("PUT", `${FEATURES}/${encodeURIComponent(featureId)}`, { enabled })
                .then(
                    (answer) => {
                        if (disposed) return;
                        const feature = featureRead(recordOf(answer)?.feature);
                        const pending = new Map(store.getState().pending);
                        if (pending.get(featureId) === enabled) pending.delete(featureId);
                        // A change announced since is newer than this answer.
                        if (!feature || generation !== sent) {
                            store.setState({ pending });
                            return;
                        }
                        const features = store.getState().features;
                        featuresApply(
                            features.some((entry) => entry.id === feature.id)
                                ? features.map((entry) =>
                                      entry.id === feature.id ? feature : entry,
                                  )
                                : [...features, feature],
                            pending,
                        );
                    },
                    (error: unknown) => {
                        if (disposed) return;
                        const pending = new Map(store.getState().pending);
                        if (pending.get(featureId) === enabled) pending.delete(featureId);
                        store.setState({ pending, error: happyAgentUserError(error) });
                    },
                );
        },
        [Symbol.dispose]() {
            disposed = true;
            follow?.abort();
            follow = undefined;
            activityRelease?.();
            activityRelease = undefined;
        },
    };

    return {
        store: accountFeatures,
        writer: {
            requestWatch: (request) => async (method, path, body, headers) => {
                const sent = generation;
                try {
                    return await request(method, path, body, headers);
                } catch (error) {
                    const featureId = accountFeatureRefusalRead(error);
                    if (featureId !== undefined && !disposed && generation === sent)
                        featureRefused(featureId);
                    throw error;
                }
            },
        },
    };
}

const NONE: AccountFeaturesSnapshot = { ...EMPTY, loading: false, served: false };

/** For a connection without account features: every feature is on, and none can be turned off. */
export const accountFeaturesStoreNone: AccountFeaturesStore = {
    get: () => NONE,
    subscribe: () => () => undefined,
    featureEnabledUpdate: () => undefined,
    [Symbol.dispose]: () => undefined,
};
