import { createStore } from "zustand/vanilla";
import { UserError } from "../types.js";
import type { HappyAgentProviderTokenCounts } from "./happyAgentProviderUsageStore.js";

/** One local day that spent tokens: each provider account's models and what they used. */
export interface HappyAgentDailyUsageDay {
    /** The local day, `YYYY-MM-DD`. */
    readonly date: string;
    /** Provider account ID, then model ID, then that day's counts. */
    readonly providers: ReadonlyMap<string, ReadonlyMap<string, HappyAgentProviderTokenCounts>>;
}

/**
 * The days that spent tokens, oldest first. Only days with usage are listed;
 * every day from `since` to today that is missing spent nothing, and nothing
 * is known before `since`.
 */
export interface HappyAgentDailyUsage {
    /** The first local day any usage was recorded, `YYYY-MM-DD`. */
    readonly since: string;
    readonly days: readonly HappyAgentDailyUsageDay[];
}

export interface HappyAgentDailyUsageSnapshot {
    /** Absent until read, where the server keeps no daily history, and where nothing was ever spent. */
    readonly history?: HappyAgentDailyUsage;
}

/**
 * Settings › Usage's activity grid: a year of daily token totals. It is read
 * when first followed and again every minute while followed. A server without
 * the route answers 404 once, after which nothing is asked again; any other
 * failure keeps what was already read.
 */
export interface HappyAgentDailyUsageStore {
    get(): HappyAgentDailyUsageSnapshot;
    subscribe(listener: () => void): () => void;
    [Symbol.dispose](): void;
}

/** How many days back the grid asks for: a year and the week it starts in. */
export const HAPPY_AGENT_DAILY_USAGE_DAYS = 371;

const POLL_INTERVAL_MS = 60_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;

function recordOf(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
}

function count(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function countsRead(value: unknown): HappyAgentProviderTokenCounts | undefined {
    const counts = recordOf(value);
    if (!counts) return undefined;
    return {
        inputTokens: count(counts.input),
        outputTokens: count(counts.output),
        cacheReadTokens: count(counts.cacheRead),
        cacheWriteTokens: count(counts.cacheWrite),
    };
}

function dayRead(value: unknown): HappyAgentDailyUsageDay | undefined {
    const day = recordOf(value);
    const byProvider = recordOf(day?.byProvider);
    if (!day || typeof day.date !== "string" || !DATE.test(day.date) || !byProvider)
        return undefined;
    const providers = new Map<string, ReadonlyMap<string, HappyAgentProviderTokenCounts>>();
    for (const [providerId, byModel] of Object.entries(byProvider)) {
        const models = new Map<string, HappyAgentProviderTokenCounts>();
        for (const [modelId, counts] of Object.entries(recordOf(byModel) ?? {})) {
            const read = countsRead(counts);
            if (read) models.set(modelId, read);
        }
        if (models.size > 0) providers.set(providerId, models);
    }
    return { date: day.date, providers };
}

/**
 * `GET /v0/usage/daily` as the client models it: `{ since, days: [{ date,
 * byProvider: { providerId: { modelId: counts } } }] }`, the same from a Happy
 * Agent and from Happy Cloud. A server that has recorded nothing answers no
 * `since`, which reads as no history at all.
 */
export function happyAgentDailyUsageRead(answer: unknown): HappyAgentDailyUsage | undefined {
    const body = recordOf(answer);
    if (!body || typeof body.since !== "string" || !DATE.test(body.since)) return undefined;
    const days = (Array.isArray(body.days) ? body.days : [])
        .flatMap((item: unknown) => {
            const day = dayRead(item);
            return day && day.date >= (body.since as string) ? [day] : [];
        })
        .sort((left, right) => left.date.localeCompare(right.date));
    return { since: body.since, days };
}

export function happyAgentDailyUsageStoreCreate(deps: {
    /** Reads `GET /v0/usage/daily` for the last `days` local days in the time zone `tz`. */
    readonly read: (days: number, tz: string) => Promise<unknown>;
}): HappyAgentDailyUsageStore {
    const store = createStore<HappyAgentDailyUsageSnapshot>()(() => ({}));
    const listeners = new Set<() => void>();
    let disposed = false;
    let reading = false;
    let unsupported = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = (): void => {
        if (disposed || unsupported || listeners.size === 0 || timer !== undefined) return;
        timer = setTimeout(() => {
            timer = undefined;
            load();
        }, POLL_INTERVAL_MS);
    };

    function load(): void {
        if (disposed || unsupported || reading || listeners.size === 0) return;
        reading = true;
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        void deps.read(HAPPY_AGENT_DAILY_USAGE_DAYS, tz).then(
            (answer) => {
                reading = false;
                if (disposed) return;
                const history = happyAgentDailyUsageRead(answer);
                store.setState(history ? { history } : {}, true);
                schedule();
            },
            (error: unknown) => {
                reading = false;
                // Older daemons and servers have no daily history; that is not a failure.
                if (error instanceof UserError && error.code === "not_found") unsupported = true;
                schedule();
            },
        );
    }

    return {
        get: () => store.getState(),
        subscribe(listener) {
            listeners.add(listener);
            const unsubscribe = store.subscribe(listener);
            if (listeners.size === 1) load();
            let released = false;
            return () => {
                if (released) return;
                released = true;
                unsubscribe();
                listeners.delete(listener);
                if (listeners.size === 0 && timer !== undefined) {
                    clearTimeout(timer);
                    timer = undefined;
                }
            };
        },
        [Symbol.dispose]() {
            disposed = true;
            if (timer !== undefined) clearTimeout(timer);
            timer = undefined;
        },
    };
}

const INERT_SNAPSHOT: HappyAgentDailyUsageSnapshot = {};

/** Where no daily history can be read: it shows nothing and never changes. */
export const happyAgentDailyUsageStoreNoop: HappyAgentDailyUsageStore = {
    get: () => INERT_SNAPSHOT,
    subscribe: () => () => undefined,
    [Symbol.dispose]: () => undefined,
};
