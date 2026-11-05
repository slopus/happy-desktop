import {
    ANALYTICS_EVENT_NAMES,
    analyticsRuleOf,
    analyticsValueAllowed,
    type AnalyticsEventName,
    type AnalyticsFlag,
    type AnalyticsEventProperties,
} from "./analyticsCatalog";

/** PostHog's US ingestion host, shared with the phones' project. */
const POSTHOG_HOST = "https://us.i.posthog.com";

/** Which client sent an event, as the shared spec names it. */
const ANALYTICS_LIB = "happy-desktop";

/** The PostHog fields every event carries beside its catalog properties, and nothing else. */
export const ANALYTICS_ENVELOPE_PROPERTY_NAMES: ReadonlySet<string> = new Set([
    "distinct_id",
    "$insert_id",
    "$lib",
    "$process_person_profile",
    "$ip",
    "$geoip_disable",
]);

export interface AnalyticsTrackOptions {
    /**
     * Sends this one event with `keepalive`, for the moment the window is
     * going away and an ordinary request in flight would be cut off.
     */
    readonly beacon?: boolean;
}

export interface AnalyticsClient {
    track<E extends AnalyticsEventName>(
        event: E,
        properties: AnalyticsEventProperties<E>,
        options?: AnalyticsTrackOptions,
    ): void;
    /**
     * Follows one feature flag for this installation: `listener` hears once
     * whether it is on, and false when PostHog could not answer. With no key
     * or analytics off it never hears anything, so the caller's default stands.
     */
    flagFollow(flag: AnalyticsFlag, listener: (enabled: boolean) => void): () => void;
}

export interface AnalyticsClientOptions {
    /** The project's public key. Absent means nothing is ever sent or asked. */
    readonly apiKey: string | undefined;
    /** Where events go instead of PostHog: a local capture endpoint, for checking them. */
    readonly host?: string;
    /** This installation's random identity; never derived from anything about the person. */
    readonly distinctId: string;
    /** Read right before every request, so turning analytics off stops the next one. */
    readonly enabled: () => boolean;
}

/**
 * Whether a host override is this machine's own capture endpoint. Only such a
 * host may receive what a development or automated window would otherwise
 * never send.
 */
export function analyticsHostLoopback(host: string): boolean {
    let hostname: string;
    try {
        hostname = new URL(host).hostname;
    } catch {
        return false;
    }
    return (
        hostname === "127.0.0.1" ||
        hostname === "[::1]" ||
        hostname === "::1" ||
        hostname === "localhost"
    );
}

/** One event as `/batch/` takes it. */
export interface AnalyticsBatchEvent {
    readonly event: string;
    readonly timestamp: string;
    readonly properties: Readonly<Record<string, unknown>>;
}

/**
 * The event as it leaves: only the catalog properties its rules allow on this
 * event, inside the fixed envelope, which keeps the IP and location out and
 * makes no person profile. Undefined for an event the catalog does not name.
 */
export function analyticsEnvelope(
    event: string,
    properties: Readonly<Record<string, unknown>>,
    envelope: {
        readonly distinctId: string;
        readonly insertId: string;
        readonly timestamp: string;
    },
): AnalyticsBatchEvent | undefined {
    if (!ANALYTICS_EVENT_NAMES.has(event)) return undefined;
    const allowed: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(properties)) {
        const rule = analyticsRuleOf(event, name);
        if (rule && analyticsValueAllowed(rule, value)) allowed[name] = value;
    }
    allowed.distinct_id = envelope.distinctId;
    allowed.$insert_id = envelope.insertId;
    allowed.$lib = ANALYTICS_LIB;
    allowed.$process_person_profile = false;
    allowed.$ip = null;
    allowed.$geoip_disable = true;
    return { event, timestamp: envelope.timestamp, properties: allowed };
}

/** The flags `/flags/?v=2` says are on; a v2 answer names each with `enabled`. */
function flagsOf(answer: unknown): ReadonlySet<string> {
    const flags =
        typeof answer === "object" && answer !== null && "flags" in answer
            ? answer.flags
            : undefined;
    if (typeof flags !== "object" || flags === null) return new Set();
    return new Set(
        Object.entries(flags)
            .filter(
                ([, flag]) =>
                    typeof flag === "object" &&
                    flag !== null &&
                    "enabled" in flag &&
                    flag.enabled === true,
            )
            .map(([key]) => key),
    );
}

/**
 * Sends catalog events to PostHog from this renderer, one request per event,
 * without an SDK. A request that fails is dropped, never kept or sent again,
 * so nothing is sent after analytics is turned off. No cookie or referrer
 * goes with it, and a window driven by automation sends nothing unless it
 * sends to a capture endpoint on this machine.
 */
export function analyticsClientCreate(options: AnalyticsClientOptions): AnalyticsClient {
    const host = options.host ?? POSTHOG_HOST;
    const loopback = options.host !== undefined && analyticsHostLoopback(options.host);
    const sendable = (): string | undefined => {
        const apiKey = options.apiKey;
        if (apiKey === undefined || apiKey.length === 0 || !options.enabled()) return undefined;
        if (!loopback && typeof navigator !== "undefined" && navigator.webdriver) return undefined;
        return apiKey;
    };
    /** This window's answer from `/flags`, asked once; undefined when PostHog gave none. */
    let flags: Promise<ReadonlySet<string> | undefined> | undefined;
    const flagsLoad = (apiKey: string): Promise<ReadonlySet<string> | undefined> =>
        (flags ??= fetch(`${host}/flags/?v=2`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ api_key: apiKey, distinct_id: options.distinctId }),
            credentials: "omit",
            referrerPolicy: "no-referrer",
        })
            .then(async (response) => (response.ok ? flagsOf(await response.json()) : undefined))
            .catch(() => undefined));
    return {
        track(event, properties, trackOptions) {
            const apiKey = sendable();
            if (apiKey === undefined) return;
            const batch = analyticsEnvelope(event, { ...properties }, {
                distinctId: options.distinctId,
                insertId: crypto.randomUUID(),
                timestamp: new Date().toISOString(),
            });
            if (!batch) return;
            void fetch(`${host}/batch/`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ api_key: apiKey, batch: [batch] }),
                credentials: "omit",
                referrerPolicy: "no-referrer",
                // Outlives the window it was sent from; best effort, like anything sent at close.
                ...(trackOptions?.beacon ? { keepalive: true } : {}),
            }).catch(() => undefined);
        },
        flagFollow(flag, listener) {
            const apiKey = sendable();
            if (apiKey === undefined) return () => undefined;
            let stopped = false;
            void flagsLoad(apiKey).then((on) => {
                if (stopped || sendable() === undefined) return;
                listener(on?.has(flag) === true);
            });
            return () => {
                stopped = true;
            };
        },
    };
}
