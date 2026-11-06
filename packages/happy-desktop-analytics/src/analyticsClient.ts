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
    /**
     * Where events go instead of PostHog, for checking them: an https host, or
     * an http one on this machine, without credentials. Any other sends nothing.
     */
    readonly host?: string;
    /**
     * This installation's random identity; never derived from anything about
     * the person. Asked for only right before a request that may go.
     */
    readonly distinctId: () => string;
    /** Read right before every request, so turning analytics off stops the next one. */
    readonly enabled: () => boolean;
}

/**
 * Whether a host override is this machine's own capture endpoint. Only such a
 * host may receive what a development or automated window would otherwise
 * never send.
 */
export function analyticsHostLoopback(host: string): boolean {
    const url = urlOf(host);
    return url !== undefined && LOOPBACK_HOSTNAMES.has(url.hostname);
}

function urlOf(host: string): URL | undefined {
    try {
        return new URL(host);
    } catch {
        return undefined;
    }
}

const LOOPBACK_HOSTNAMES: ReadonlySet<string> = new Set(["127.0.0.1", "[::1]", "::1", "localhost"]);

/** An https host, or an http one on this machine, with no credentials in it. */
function hostAllowed(host: string): boolean {
    const url = urlOf(host);
    if (url === undefined || url.username !== "" || url.password !== "") return false;
    return (
        url.protocol === "https:" ||
        (url.protocol === "http:" && LOOPBACK_HOSTNAMES.has(url.hostname))
    );
}

/** Every request: no cookie, no referrer, and no following a redirect anywhere else. */
const REQUEST: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "omit",
    referrerPolicy: "no-referrer",
    redirect: "error",
};

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
 * goes with it and no redirect is followed. A window driven by automation
 * sends nothing unless it sends to a capture endpoint on this machine.
 */
export function analyticsClientCreate(options: AnalyticsClientOptions): AnalyticsClient {
    const host = options.host ?? POSTHOG_HOST;
    const allowed = hostAllowed(host);
    const loopback = options.host !== undefined && analyticsHostLoopback(options.host);
    const sendable = (): string | undefined => {
        const apiKey = options.apiKey;
        if (!allowed || apiKey === undefined || apiKey.length === 0 || !options.enabled())
            return undefined;
        if (!loopback && typeof navigator !== "undefined" && navigator.webdriver) return undefined;
        return apiKey;
    };
    /**
     * This window's answer from `/flags`, asked once per installation id;
     * undefined when PostHog gave none.
     */
    let flags:
        | { readonly id: string; readonly answer: Promise<ReadonlySet<string> | undefined> }
        | undefined;
    const flagsLoad = (apiKey: string): Promise<ReadonlySet<string> | undefined> => {
        const id = options.distinctId();
        if (flags?.id !== id)
            flags = {
                id,
                answer: fetch(`${host}/flags/?v=2`, {
                    ...REQUEST,
                    body: JSON.stringify({ api_key: apiKey, distinct_id: id }),
                })
                    .then(async (response) =>
                        response.ok ? flagsOf(await response.json()) : undefined,
                    )
                    .catch(() => undefined),
            };
        return flags.answer;
    };
    return {
        track(event, properties, trackOptions) {
            const apiKey = sendable();
            if (apiKey === undefined) return;
            const batch = analyticsEnvelope(
                event,
                { ...properties },
                {
                    distinctId: options.distinctId(),
                    insertId: crypto.randomUUID(),
                    // Whole seconds: finer times only help tell people apart.
                    timestamp: new Date(Math.floor(Date.now() / 1000) * 1000).toISOString(),
                },
            );
            if (!batch) return;
            void fetch(`${host}/batch/`, {
                ...REQUEST,
                body: JSON.stringify({ api_key: apiKey, batch: [batch] }),
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
