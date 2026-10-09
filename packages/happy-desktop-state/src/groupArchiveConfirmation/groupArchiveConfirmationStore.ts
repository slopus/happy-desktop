/**
 * Whether archiving a project or workspace stops at a confirmation first.
 *
 * Archiving a workspace deletes its worktree folder, so the product asks by
 * default. A reader who ticks "Don't ask again" in that confirmation turns the
 * question off for this window's installation; the General settings switch
 * turns it back on. It is the window's own choice, kept by the host's storage
 * rather than by any Happy Agent: the folder is on the machine in front of the
 * reader, and no daemon has an opinion about how carefully they want to delete
 * it.
 */
export const GROUP_ARCHIVE_CONFIRMATION_ENABLED_DEFAULT = true;

export interface GroupArchiveConfirmationDocument {
    /** Absent until the reader explicitly changes the setting. */
    readonly groupArchiveConfirmationEnabled?: boolean;
}

export interface GroupArchiveConfirmationPersistence {
    read(): GroupArchiveConfirmationDocument | undefined;
    write(document: GroupArchiveConfirmationDocument): void;
}

export interface GroupArchiveConfirmationSnapshot {
    readonly groupArchiveConfirmationEnabled: boolean;
}

export interface GroupArchiveConfirmationStore {
    get(): GroupArchiveConfirmationSnapshot;
    subscribe(listener: () => void): () => void;
    /** Keeps this explicit choice across launches, independent of later defaults. */
    groupArchiveConfirmationUpdate(enabled: boolean): void;
}

function documentParse(value: unknown): GroupArchiveConfirmationDocument | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const enabled = (value as { groupArchiveConfirmationEnabled?: unknown })
        .groupArchiveConfirmationEnabled;
    return typeof enabled === "boolean" ? { groupArchiveConfirmationEnabled: enabled } : undefined;
}

const DEFAULT_SNAPSHOT: GroupArchiveConfirmationSnapshot = {
    groupArchiveConfirmationEnabled: GROUP_ARCHIVE_CONFIRMATION_ENABLED_DEFAULT,
};

/**
 * Creates the window-lifetime archive-confirmation store.
 *
 * Reading an absent record applies the product default entirely in memory.
 * Nothing is persisted until `groupArchiveConfirmationUpdate` records a choice,
 * so merely launching this version cannot pin today's default for future
 * releases.
 */
export function groupArchiveConfirmationStoreCreate(
    persistence?: GroupArchiveConfirmationPersistence,
): GroupArchiveConfirmationStore {
    let override: boolean | undefined;
    try {
        override = documentParse(persistence?.read())?.groupArchiveConfirmationEnabled;
    } catch {
        // Storage the host refused is the same as no remembered choice.
    }
    let snapshot: GroupArchiveConfirmationSnapshot =
        override === undefined ? DEFAULT_SNAPSHOT : { groupArchiveConfirmationEnabled: override };
    const listeners = new Set<() => void>();

    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        groupArchiveConfirmationUpdate(enabled) {
            if (override === enabled) return;
            override = enabled;
            const changed = snapshot.groupArchiveConfirmationEnabled !== enabled;
            if (changed) snapshot = { groupArchiveConfirmationEnabled: enabled };
            try {
                persistence?.write({ groupArchiveConfirmationEnabled: enabled });
            } catch {
                // Keep the explicit choice for the rest of this window even
                // when the host cannot remember it.
            }
            if (changed) for (const listener of listeners) listener();
        },
    };
}

/**
 * A host without preference storage always asks and ignores updates, so
 * application surfaces can subscribe without branching.
 */
export const groupArchiveConfirmationStoreNoop: GroupArchiveConfirmationStore = {
    get: () => DEFAULT_SNAPSHOT,
    subscribe: () => () => {},
    groupArchiveConfirmationUpdate: () => {},
};
