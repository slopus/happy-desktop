import type { AnalyticsErrorArea, AnalyticsErrorCode } from "./analyticsCatalog";

/** Where the limits below keep what they remember, so a reload does not reset them. */
export interface AnalyticsMemory {
    read(): string | undefined;
    write(value: string): void;
}

/** `error_shown` is sent at most once per area and code in this window. */
const ERROR_SHOWN_WINDOW_MS = 10 * 60_000;

interface ErrorShownEntry {
    readonly sentAt: number;
    readonly held: number;
}

export interface AnalyticsErrorThrottle {
    /**
     * One occurrence of an error shown in `area`. Answers the `repeat_count` to
     * send it with, or undefined when it is held back for a later one.
     */
    occurred(area: AnalyticsErrorArea, code: AnalyticsErrorCode, now: number): number | undefined;
}

/**
 * At most one `error_shown` per (area, code) every ten minutes, with the
 * occurrences held back in between added to the next one sent, so the total
 * stays exact when a screen fails in a loop.
 */
export function analyticsErrorThrottleCreate(memory: AnalyticsMemory): AnalyticsErrorThrottle {
    const entries = new Map<string, ErrorShownEntry>(memoryRead(memory, isErrorShownEntry));
    return {
        occurred(area, code, now) {
            const key = `${area}:${code}`;
            const entry = entries.get(key);
            if (entry && now - entry.sentAt < ERROR_SHOWN_WINDOW_MS) {
                entries.set(key, { sentAt: entry.sentAt, held: entry.held + 1 });
                memory.write(JSON.stringify([...entries]));
                return undefined;
            }
            entries.set(key, { sentAt: now, held: 0 });
            memory.write(JSON.stringify([...entries]));
            return entry?.held ?? 0;
        },
    };
}

/** How many failures `chat_failure_shown` remembers having counted. */
const SEEN_LIMIT = 500;

export interface AnalyticsSeen {
    /** Whether `id` is new; remembering it either way, oldest forgotten first. */
    first(id: string): boolean;
}

/** A bounded set of ids already counted on this device. The ids never leave it. */
export function analyticsSeenCreate(memory: AnalyticsMemory): AnalyticsSeen {
    const ids = new Set(
        memoryRead(memory, (item): item is string => typeof item === "string").slice(-SEEN_LIMIT),
    );
    return {
        first(id) {
            if (ids.has(id)) return false;
            ids.add(id);
            for (const oldest of ids) {
                if (ids.size <= SEEN_LIMIT) break;
                ids.delete(oldest);
            }
            memory.write(JSON.stringify([...ids]));
            return true;
        },
    };
}

function isErrorShownEntry(item: unknown): item is readonly [string, ErrorShownEntry] {
    if (!Array.isArray(item) || item.length !== 2 || typeof item[0] !== "string") return false;
    const entry: unknown = item[1];
    return (
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as ErrorShownEntry).sentAt === "number" &&
        typeof (entry as ErrorShownEntry).held === "number"
    );
}

function memoryRead<T>(memory: AnalyticsMemory, valid: (item: unknown) => item is T): T[] {
    try {
        const value: unknown = JSON.parse(memory.read() ?? "[]");
        return Array.isArray(value) ? value.filter(valid) : [];
    } catch {
        return [];
    }
}
