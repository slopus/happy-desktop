import type {
    GroupArchiveConfirmationDocument,
    GroupArchiveConfirmationPersistence,
} from "happy-desktop-state";

const GROUP_ARCHIVE_CONFIRMATION_KEY = "happy.groupArchiveConfirmation.v1";

/**
 * Where this machine remembers whether archiving a workspace or project still
 * asks first. It is the window's own storage rather than anything a Happy Agent
 * holds: the worktree folder being deleted is on this machine, so how carefully
 * the reader wants to delete it is a choice about this installation and must
 * never follow them onto another one.
 */
export function desktopGroupArchiveConfirmationPersistence(): GroupArchiveConfirmationPersistence {
    return {
        read() {
            try {
                const value = localStorage.getItem(GROUP_ARCHIVE_CONFIRMATION_KEY);
                return value ? (JSON.parse(value) as GroupArchiveConfirmationDocument) : undefined;
            } catch {
                return undefined;
            }
        },
        write(document) {
            try {
                localStorage.setItem(GROUP_ARCHIVE_CONFIRMATION_KEY, JSON.stringify(document));
            } catch {
                // A storage-denied renderer still honours the choice for as long
                // as the window stays open.
            }
        },
    };
}
