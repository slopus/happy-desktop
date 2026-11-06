/**
 * Whether this installation sends product analytics events.
 *
 * It is the window's own switch, kept by the host's storage like the
 * experiments switch beside it: it describes this app on this machine, so no
 * Happy Agent and no account has a say in it. On for an installation that
 * never chose; off when a stored choice cannot be read.
 */
export interface UsageAnalyticsDocument {
    readonly usageAnalyticsEnabled: boolean;
}

/** What the host's storage holds for the switch. */
export type UsageAnalyticsRead =
    /** Nothing was ever stored: a new installation. */
    | { readonly kind: "absent" }
    /** Something is stored, still to be checked as a document. */
    | { readonly kind: "stored"; readonly value: unknown }
    /** The storage could not be read, or what it holds could not be parsed. */
    | { readonly kind: "unreadable" };

export interface UsageAnalyticsPersistence {
    read(): UsageAnalyticsRead;
    /** Throws when the host refused to keep it. */
    write(document: UsageAnalyticsDocument): void;
}

export interface UsageAnalyticsSnapshot {
    readonly usageAnalyticsEnabled: boolean;
    /**
     * The host refused to keep the last choice, so a later launch may not
     * know it. The window keeps it for as long as it stays open.
     */
    readonly usageAnalyticsSaveFailed: boolean;
}

export interface UsageAnalyticsStore {
    get(): UsageAnalyticsSnapshot;
    subscribe(listener: () => void): () => void;
    usageAnalyticsUpdate(enabled: boolean): void;
}

function documentParse(value: unknown): UsageAnalyticsDocument | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const enabled = (value as { usageAnalyticsEnabled?: unknown }).usageAnalyticsEnabled;
    return typeof enabled === "boolean" ? { usageAnalyticsEnabled: enabled } : undefined;
}

/** On only for nothing stored or a valid stored yes: anything unreadable or invalid is off. */
function enabledOf(read: UsageAnalyticsRead): boolean {
    switch (read.kind) {
        case "absent":
            return true;
        case "stored":
            return documentParse(read.value)?.usageAnalyticsEnabled ?? false;
        case "unreadable":
            return false;
    }
}

/** Creates the window-lifetime switch, hydrated once from the host's storage. */
export function usageAnalyticsStoreCreate(
    persistence?: UsageAnalyticsPersistence,
): UsageAnalyticsStore {
    let snapshot: UsageAnalyticsSnapshot = {
        usageAnalyticsEnabled: (() => {
            try {
                return enabledOf(persistence?.read() ?? { kind: "absent" });
            } catch {
                return false;
            }
        })(),
        usageAnalyticsSaveFailed: false,
    };
    const listeners = new Set<() => void>();
    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        usageAnalyticsUpdate(enabled) {
            if (snapshot.usageAnalyticsEnabled === enabled && !snapshot.usageAnalyticsSaveFailed)
                return;
            let saveFailed = false;
            try {
                persistence?.write({ usageAnalyticsEnabled: enabled });
            } catch {
                saveFailed = true;
            }
            snapshot = { usageAnalyticsEnabled: enabled, usageAnalyticsSaveFailed: saveFailed };
            for (const listener of listeners) listener();
        },
    };
}
