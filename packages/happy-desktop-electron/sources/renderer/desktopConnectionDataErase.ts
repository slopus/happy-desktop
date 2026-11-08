/** What one connection keeps in this window's storage, by key, beside its stores' own records. */
export function desktopConnectionStorageKeys(happyAgentId: string): readonly string[] {
    return [
        `happy.connection-preferences.v1:${happyAgentId}`,
        `happy.model-settings.v1:${happyAgentId}`,
        `happy.connection-history.v1:${happyAgentId}`,
    ];
}

/**
 * Erases what this window keeps of one Happy Cloud server whose sign-in ended:
 * the places it remembers there, the settings copies its stores hold, and its
 * own storage keys. Every other connection's stays exactly as it was.
 */
export function desktopConnectionDataErase(input: {
    readonly happyAgentId: string;
    readonly storage: Pick<Storage, "removeItem">;
    /** Each store that keeps a record for this connection, told to drop it. */
    readonly forget: readonly ((happyAgentId: string) => void)[];
}): void {
    // The stores first: each writes its remaining record back, and the keys
    // removed after that cannot be written again by an erase still under way.
    for (const forget of input.forget) forget(input.happyAgentId);
    for (const key of desktopConnectionStorageKeys(input.happyAgentId)) {
        try {
            input.storage.removeItem(key);
        } catch {
            // A storage-denied window kept nothing to erase.
        }
    }
}
