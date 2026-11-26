import { createStore } from "zustand/vanilla";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { happyAgentHealthCapability } from "../happyAgentConnection/happyAgentHealthCapability.js";
import {
    HappyCloudRequestRefusal,
    type HappyCloudRequest,
} from "../happyAgent/happyAgentProviderCredentials.js";
import { referencesPreserve } from "../happyAgent/happyAgentSupport.js";
import type { HappyAgentViewersActivity } from "../viewers/viewersStore.js";

/**
 * One of Happy's own features a person turns on or off for themselves by
 * installing or uninstalling its feature plugin. Pipelines is the only one today.
 */
export type FeatureId = "pipelines";

const FEATURE_IDS: readonly FeatureId[] = ["pipelines"];

/** Whether one feature is available to the person, in every team they belong to. */
export interface FeatureAvailability {
    readonly id: FeatureId;
    readonly available: boolean;
}

export interface FeatureAvailabilitySnapshot {
    /** True until the server first answers. */
    readonly loading: boolean;
    /**
     * False on a server without feature plugins: its health does not say
     * `features`, or it answers `404` or `501`. Every feature is available there.
     */
    readonly served: boolean;
    /** As the server last answered or announced, in its order. */
    readonly features: readonly FeatureAvailability[];
}

/**
 * Which features are available to the person. A feature is available while
 * their account has its feature plugin installed, which they change on the
 * Plugins screen of any server; the change reaches this one as
 * `features.updated`, whose payload replaces the list.
 *
 * Subscribing reads the list, then reads it again on every reconnect and each
 * time the window comes back to the foreground. Every feature counts as
 * available until the server says it is not.
 */
export interface FeatureAvailabilityStore {
    get(): FeatureAvailabilitySnapshot;
    subscribe(listener: () => void): () => void;
    [Symbol.dispose](): void;
}

/** Private authoritative input from the connection that made the store. */
export interface FeatureAvailabilityWriter {
    /**
     * The same requests, watched: a `feature_not_installed` refusal makes its
     * feature unavailable here, unless the list changed after the request was sent.
     */
    requestWatch(request: HappyCloudRequest): HappyCloudRequest;
}

export const FEATURES_UPDATED_EVENT = "features.updated";

const FEATURES = "v0/features";

/** Whether a feature is available: every feature is, until the server says it is not. */
export function featureAvailable(
    snapshot: FeatureAvailabilitySnapshot,
    featureId: FeatureId,
): boolean {
    return snapshot.features.find((feature) => feature.id === featureId)?.available !== false;
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
}

function featureIdRead(value: unknown): FeatureId | undefined {
    return FEATURE_IDS.find((id) => id === value);
}

/** One feature, or undefined for one this build does not know or a malformed entry. */
function featureRead(value: unknown): FeatureAvailability | undefined {
    const entry = recordOf(value);
    const id = featureIdRead(entry?.id);
    if (!entry || id === undefined || typeof entry.available !== "boolean") return undefined;
    return { id, available: entry.available };
}

/** The list `GET` answers and the event carries, or undefined when it is not that shape. */
function featuresRead(value: unknown): FeatureAvailability[] | undefined {
    const list = recordOf(value)?.features;
    if (!Array.isArray(list)) return undefined;
    return list.flatMap((entry: unknown) => {
        const feature = featureRead(entry);
        return feature ? [feature] : [];
    });
}

/** The feature a refusal says is unavailable to the person, if it is one this build knows. */
export function featureRefusalRead(error: unknown): FeatureId | undefined {
    if (
        !(error instanceof HappyCloudRequestRefusal) ||
        error.status !== 403 ||
        error.code !== "feature_not_installed"
    )
        return undefined;
    return featureIdRead(recordOf(error.body)?.feature);
}

const EMPTY: FeatureAvailabilitySnapshot = { loading: true, served: true, features: [] };
const UNSERVED: FeatureAvailabilitySnapshot = { loading: false, served: false, features: [] };

export function featureAvailabilityStoreCreate(deps: {
    readonly request: HappyCloudRequest;
    /** The connection's events, and its health, which says whether it has feature plugins. */
    readonly sync: HappyAgentSync;
    /** Whether the person is at this window; coming back to it reads the list again. */
    readonly activity?: HappyAgentViewersActivity;
}): { readonly store: FeatureAvailabilityStore; readonly writer: FeatureAvailabilityWriter } {
    const store = createStore<FeatureAvailabilitySnapshot>()(() => EMPTY);
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
    const featuresApply = (features: readonly FeatureAvailability[]): void => {
        generation += 1;
        const current = store.getState();
        store.setState({
            loading: false,
            served: true,
            features: referencesPreserve(current.features, features),
        });
    };

    const unserved = (): void => {
        generation += 1;
        store.setState(UNSERVED, true);
    };

    const read = async (): Promise<void> => {
        const health = deps.sync.health();
        // Asked again once the connection has said what it serves.
        if (health === undefined) return;
        if (!happyAgentHealthCapability(health, "features")) {
            if (store.getState() !== UNSERVED) unserved();
            return;
        }
        const sent = generation;
        let answer: unknown;
        try {
            answer = await deps.request("GET", FEATURES);
        } catch (error) {
            if (
                error instanceof HappyCloudRequestRefusal &&
                (error.status === 404 || error.status === 501)
            ) {
                if (!disposed && generation === sent) unserved();
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
        if (follow) return;
        const active = new AbortController();
        follow = active;
        void (async () => {
            let greeted = false;
            for await (const input of deps.sync.follow({
                signal: active.signal,
                events: [FEATURES_UPDATED_EVENT],
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

    const featureRefused = (featureId: FeatureId): void => {
        const current = store.getState();
        if (!featureAvailable(current, featureId)) return;
        const known = current.features.some((feature) => feature.id === featureId);
        featuresApply(
            known
                ? current.features.map((feature) =>
                      feature.id === featureId ? { ...feature, available: false } : feature,
                  )
                : [...current.features, { id: featureId, available: false }],
        );
    };

    const availability: FeatureAvailabilityStore = {
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
        [Symbol.dispose]() {
            disposed = true;
            follow?.abort();
            follow = undefined;
            activityRelease?.();
            activityRelease = undefined;
        },
    };

    return {
        store: availability,
        writer: {
            requestWatch: (request) => async (method, path, body, headers) => {
                const sent = generation;
                try {
                    return await request(method, path, body, headers);
                } catch (error) {
                    const featureId = featureRefusalRead(error);
                    if (featureId !== undefined && !disposed && generation === sent)
                        featureRefused(featureId);
                    throw error;
                }
            },
        },
    };
}

/** For a connection without feature plugins: every feature is available. */
export const featureAvailabilityStoreNone: FeatureAvailabilityStore = {
    get: () => UNSERVED,
    subscribe: () => () => undefined,
    [Symbol.dispose]: () => undefined,
};
