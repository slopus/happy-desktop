import type { CaptureResult, PostHog } from "posthog-js";
import {
    ANALYTICS_PROPERTY_NAMES,
    type AnalyticsEventName,
    type AnalyticsEventProperties,
} from "./analyticsCatalog";

/** PostHog's US ingestion host, shared with the phone's project. */
const POSTHOG_HOST = "https://us.i.posthog.com";

/** What PostHog itself needs on every event; everything else it adds is dropped. */
const POSTHOG_PROPERTY_NAMES: ReadonlySet<string> = new Set([
    "token",
    "distinct_id",
    "$lib",
    "$lib_version",
    "$insert_id",
    "$time",
    "$process_person_profile",
]);

export interface AnalyticsTrackOptions {
    /**
     * Sends this one event at once by `sendBeacon` instead of queueing it, for
     * the moment the window is going away. Best effort: a library that has not
     * loaded yet cannot load in time.
     */
    readonly beacon?: boolean;
}

export interface AnalyticsClient {
    track<E extends AnalyticsEventName>(
        event: E,
        properties: AnalyticsEventProperties<E>,
        options?: AnalyticsTrackOptions,
    ): void;
}

export interface AnalyticsClientOptions {
    /** The project's public key. Absent means nothing is ever loaded or sent. */
    readonly apiKey: string | undefined;
    /** This installation's random identity; never derived from anything about the person. */
    readonly distinctId: string;
    /** Read before every event, so turning analytics off stops the next one. */
    readonly enabled: () => boolean;
}

/**
 * Rebuilds an outgoing event from the allowlists, so nothing PostHog adds on
 * its own — the page URL, which in a packaged app is a file path under the
 * person's home directory, the referrer, screen, browser, or session — and no
 * person property ever leaves the window.
 */
function analyticsBeforeSend(capture: CaptureResult | null): CaptureResult | null {
    if (capture === null) return null;
    const properties: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(capture.properties)) {
        if (POSTHOG_PROPERTY_NAMES.has(name) || ANALYTICS_PROPERTY_NAMES.has(name))
            properties[name] = value;
    }
    properties.$ip = null;
    properties.$geoip_disable = true;
    return {
        uuid: capture.uuid,
        event: capture.event,
        properties,
        ...(capture.timestamp === undefined ? {} : { timestamp: capture.timestamp }),
    };
}

/**
 * Sends catalog events to PostHog from this renderer. The library is loaded
 * only once there is a key and the first event is allowed, and is configured
 * to capture nothing by itself.
 */
export function analyticsClientCreate(options: AnalyticsClientOptions): AnalyticsClient {
    const apiKey = options.apiKey;
    let loading: Promise<PostHog | undefined> | undefined;
    /** The library once it has loaded, so a closing window can send without waiting. */
    let loaded: PostHog | undefined;
    const load = (key: string): Promise<PostHog | undefined> => {
        loading ??= import("posthog-js").then(
            ({ default: posthog }) => {
                posthog.init(key, {
                    api_host: POSTHOG_HOST,
                    bootstrap: { distinctID: options.distinctId },
                    person_profiles: "identified_only",
                    persistence: "memory",
                    autocapture: false,
                    capture_pageview: false,
                    capture_pageleave: false,
                    capture_dead_clicks: false,
                    capture_heatmaps: false,
                    capture_performance: false,
                    capture_exceptions: false,
                    rageclick: false,
                    disable_session_recording: true,
                    disable_surveys: true,
                    disable_product_tours: true,
                    disable_conversations: true,
                    disable_web_experiments: true,
                    disable_external_dependency_loading: true,
                    advanced_disable_flags: true,
                    save_referrer: false,
                    save_campaign_params: false,
                    before_send: analyticsBeforeSend,
                });
                loaded = posthog;
                return posthog;
            },
            (error: unknown) => {
                console.error("Could not load analytics.", error);
                return undefined;
            },
        );
        return loading;
    };
    return {
        track(event, properties, trackOptions) {
            if (apiKey === undefined || apiKey.length === 0 || !options.enabled()) return;
            if (trackOptions?.beacon && loaded) {
                loaded.capture(event, { ...properties }, { transport: "sendBeacon" });
                return;
            }
            void load(apiKey).then((posthog) => {
                if (!options.enabled()) return;
                posthog?.capture(event, { ...properties });
            });
        },
    };
}
