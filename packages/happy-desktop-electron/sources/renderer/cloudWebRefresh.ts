/** The lock every tab of one server's page takes to refresh its session. */
export const CLOUD_WEB_REFRESH_LOCK = "happy.cloud-web.refresh";
/** When a tab of this page last refreshed the session, in milliseconds. */
export const CLOUD_WEB_REFRESHED_KEY = "happy.cloud-web.refreshed-at";

/**
 * The edge's session refresh, one at a time across every tab of the page.
 * Accounts treats a refresh token used twice as stolen and ends the session,
 * so two tabs refused together must not both spend it: the second waits for
 * the lock, sees that the first refreshed after it was refused, and sends its
 * request again on the new cookies instead.
 */
export function cloudWebRefreshCreate(deps: {
    /** Sends the refresh; true when the edge issued new cookies. */
    readonly post: () => Promise<boolean>;
    /** Runs `task` while holding the lock every tab of this origin shares. */
    readonly locked: <T>(task: () => Promise<T>) => Promise<T>;
    readonly storage: Pick<Storage, "getItem" | "setItem">;
    readonly now: () => number;
}): (refusedAt: number) => Promise<boolean> {
    let refreshing: Promise<boolean> | undefined;
    const refreshedAt = (): number => {
        try {
            return Number(deps.storage.getItem(CLOUD_WEB_REFRESHED_KEY)) || 0;
        } catch {
            return 0;
        }
    };
    return (refusedAt) => {
        refreshing ??= deps
            .locked(async () => {
                // Another tab refreshed after this request was refused.
                if (refreshedAt() >= refusedAt) return true;
                const refreshed = await deps.post().catch(() => false);
                if (refreshed)
                    try {
                        deps.storage.setItem(CLOUD_WEB_REFRESHED_KEY, String(deps.now()));
                    } catch {
                        // Other tabs refresh for themselves; this one has its cookies.
                    }
                return refreshed;
            })
            .finally(() => {
                refreshing = undefined;
            });
        return refreshing;
    };
}

/** The Web Locks API where the browser has it; otherwise this tab alone. */
export function cloudWebLocked<T>(task: () => Promise<T>): Promise<T> {
    const locks = (globalThis.navigator as Navigator | undefined)?.locks;
    return locks ? locks.request(CLOUD_WEB_REFRESH_LOCK, task) : task();
}

/**
 * Erases everything this page's origin keeps. The origin is one server's, so
 * this is that server's data and nobody else's: its stored rows, drafts,
 * caches and preferences.
 */
export async function cloudWebStorageErase(): Promise<void> {
    try {
        globalThis.localStorage?.clear();
        globalThis.sessionStorage?.clear();
    } catch {
        // Storage this page was denied holds nothing.
    }
    const cacheStorage = (globalThis as { caches?: CacheStorage }).caches;
    if (cacheStorage)
        await cacheStorage
            .keys()
            .then((names) => Promise.all(names.map((name) => cacheStorage.delete(name))))
            .catch(() => undefined);
    const databases = globalThis.indexedDB;
    if (databases && typeof databases.databases === "function")
        await databases
            .databases()
            .then((list) => {
                for (const database of list)
                    if (database.name) databases.deleteDatabase(database.name);
            })
            .catch(() => undefined);
}
