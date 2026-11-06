export type HappyAgentDebugLogLevel = "info" | "warning" | "error";

export type HappyAgentDebugLogSource =
    | "catalog"
    | "connection"
    | "health"
    | "mutation"
    | "sse"
    | "sync";

/** One diagnostic fact before the store assigns its local identity and timestamp. */
export interface HappyAgentDebugLogInput {
    readonly detail?: string;
    readonly level: HappyAgentDebugLogLevel;
    readonly message: string;
    readonly source: HappyAgentDebugLogSource;
}

export interface HappyAgentDebugLogEntry extends HappyAgentDebugLogInput {
    readonly id: number;
    /** Epoch milliseconds when this window observed the event. */
    readonly occurredAt: number;
}

export interface HappyAgentDebugLogSnapshot {
    /** Entries retained in arrival order, oldest first. */
    readonly entries: readonly HappyAgentDebugLogEntry[];
    /** Entries removed from the head to keep this diagnostic surface memory-bounded. */
    readonly discardedEntries: number;
}

export interface HappyAgentDebugLogStore {
    get(): HappyAgentDebugLogSnapshot;
    subscribe(listener: () => void): () => void;
}

/** Private input used by the connection composition root, never by UI code. */
export interface HappyAgentDebugLogWriter {
    entryAppend(input: HappyAgentDebugLogInput): void;
}

export interface HappyAgentDebugLogStoreOptions {
    readonly now?: () => number;
}

const MAXIMUM_ENTRIES = 2_000;
const MAXIMUM_RETAINED_CHARACTERS = 4 * 1024 * 1024;
const MAXIMUM_DETAIL_CHARACTERS = 64 * 1024;

function detailBound(detail: string | undefined): string | undefined {
    if (detail === undefined || detail.length <= MAXIMUM_DETAIL_CHARACTERS) return detail;
    const discarded = detail.length - MAXIMUM_DETAIL_CHARACTERS;
    return `${detail.slice(0, MAXIMUM_DETAIL_CHARACTERS)}\n… ${discarded.toLocaleString("en-US")} detail characters omitted`;
}

function entryCharacters(entry: HappyAgentDebugLogEntry): number {
    return entry.message.length + (entry.detail?.length ?? 0);
}

/**
 * Creates one Happy Agent-lifetime diagnostic buffer. The constructor opens no timers or
 * transport; connection owners synchronously write the facts they observe.
 */
export function happyAgentDebugLogStoreCreate(options: HappyAgentDebugLogStoreOptions = {}): {
    readonly store: HappyAgentDebugLogStore;
    readonly writer: HappyAgentDebugLogWriter;
} {
    const now = options.now ?? Date.now;
    const listeners = new Set<() => void>();
    let nextId = 1;
    let retainedCharacters = 0;
    let discardedEntries = 0;
    /*
     * The connection writes an entry for every realtime event, hundreds at a time in a burst,
     * while the log is rarely on screen. Entries are appended in place and discarded by
     * moving `head`; the immutable snapshot is materialized only when someone reads it.
     */
    let retained: HappyAgentDebugLogEntry[] = [];
    let head = 0;
    let snapshot: HappyAgentDebugLogSnapshot | undefined = { discardedEntries: 0, entries: [] };

    const writer: HappyAgentDebugLogWriter = {
        entryAppend(input) {
            const detail = detailBound(input.detail);
            const entry: HappyAgentDebugLogEntry = {
                ...input,
                ...(detail === undefined ? {} : { detail }),
                id: nextId,
                occurredAt: now(),
            };
            nextId += 1;

            retained.push(entry);
            retainedCharacters += entryCharacters(entry);
            while (
                retained.length - head > 1 &&
                (retained.length - head > MAXIMUM_ENTRIES ||
                    retainedCharacters > MAXIMUM_RETAINED_CHARACTERS)
            ) {
                retainedCharacters -= entryCharacters(retained[head]!);
                head += 1;
                discardedEntries += 1;
            }
            // Compacted once the discarded head is as long as the log itself.
            if (head >= MAXIMUM_ENTRIES) {
                retained = retained.slice(head);
                head = 0;
            }
            snapshot = undefined;
            for (const listener of listeners) listener();
        },
    };

    return {
        store: {
            get: () => (snapshot ??= { discardedEntries, entries: retained.slice(head) }),
            subscribe(listener) {
                listeners.add(listener);
                return () => listeners.delete(listener);
            },
        },
        writer,
    };
}
