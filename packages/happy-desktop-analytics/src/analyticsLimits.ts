import type { AnalyticsErrorArea, AnalyticsErrorCode } from "./analyticsCatalog";

/** `error_shown` is sent at most once per area and code in this window. */
const ERROR_SHOWN_WINDOW_MS = 10 * 60_000;

export interface AnalyticsErrorThrottle {
    /**
     * One occurrence of an error shown in `area`: whether to send it. Repeats
     * inside the window are dropped, not counted.
     */
    allow(area: AnalyticsErrorArea, code: AnalyticsErrorCode, now: number): boolean;
    /** Forgets every send. */
    clear(): void;
}

/**
 * At most one `error_shown` per (area, code) every ten minutes. Only the send
 * times are kept, in memory: a reload may send one again inside the window.
 */
export function analyticsErrorThrottleCreate(): AnalyticsErrorThrottle {
    const sent = new Map<string, number>();
    return {
        allow(area, code, now) {
            for (const [key, at] of sent) if (now - at >= ERROR_SHOWN_WINDOW_MS) sent.delete(key);
            const key = `${area}:${code}`;
            if (sent.has(key)) return false;
            sent.set(key, now);
            return true;
        },
        clear: () => sent.clear(),
    };
}

/** How long a counted failure is remembered: as long as it is fresh enough to count. */
const SEEN_MS = 5 * 60_000;

export interface AnalyticsSeen {
    /** Whether `id` was not counted in the last five minutes; remembering it either way. */
    first(id: string, now: number): boolean;
    /** Forgets every id. */
    clear(): void;
}

/** The failure ids this window counted in the last five minutes, in memory only. */
export function analyticsSeenCreate(): AnalyticsSeen {
    const ids = new Map<string, number>();
    return {
        first(id, now) {
            for (const [other, at] of ids) if (now - at >= SEEN_MS) ids.delete(other);
            if (ids.has(id)) return false;
            ids.set(id, now);
            return true;
        },
        clear: () => ids.clear(),
    };
}
