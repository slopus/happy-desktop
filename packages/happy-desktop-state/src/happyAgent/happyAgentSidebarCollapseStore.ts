/**
 * Which rows in the sidebar the reader has folded shut — a project whose
 * worktrees they are not working in today, a folder they filled once and no
 * longer read.
 *
 * Stated as the rows that are closed rather than the rows that are open,
 * because open is what everything is until somebody says otherwise: a project
 * that arrives after this record was written must show its checkouts, and a
 * record of what is open would hide it.
 *
 * A row that is closed stays closed while it is away. A machine that is
 * unreachable, or a folder that is not being listed right now, has not been
 * reopened by going missing, and coming back to a tree that quietly unfolded
 * itself is the same defect as losing the arrangement entirely.
 */
export interface HappyAgentSidebarCollapseDocument {
    readonly collapsed: readonly string[];
}

/**
 * Where that record is kept. The state package never names a storage medium:
 * the host supplies one, and omitting it keeps the folding alive for this
 * window's lifetime only.
 */
export interface HappyAgentSidebarCollapsePersistence {
    read(): HappyAgentSidebarCollapseDocument | undefined;
    write(document: HappyAgentSidebarCollapseDocument): void;
}

export interface HappyAgentSidebarCollapseSnapshot {
    /** Every row this window has been told to fold shut, still folded. */
    readonly collapsed: ReadonlySet<string>;
    /**
     * The row last asked to be brought into view. Every request takes a new
     * serial, so asking for the row already on screen scrolls to it again. It
     * lasts for this window only and is never written down.
     */
    readonly reveal?: HappyAgentSidebarRowReveal;
}

export interface HappyAgentSidebarRowReveal {
    readonly rowId: string;
    readonly serial: number;
}

export interface HappyAgentSidebarCollapseStore {
    get(): HappyAgentSidebarCollapseSnapshot;
    subscribe(listener: () => void): () => void;
    /** Folds `rowId` shut if it is open, and opens it if it is shut. */
    rowCollapseToggle(rowId: string): void;
    /** Opens every row in `foldedIds`, the folds over `rowId`, and asks for `rowId` to be brought into view. */
    rowReveal(rowId: string, foldedIds: readonly string[]): void;
}

/**
 * How many folded rows one window will remember. Far past the number of
 * projects and folders anybody keeps, and small enough that a record nobody
 * prunes stays a record rather than a heap. Past the bound the oldest folding
 * is let go, so the row somebody just closed is always the one that is kept.
 */
const COLLAPSED_MAX = 512;

function documentParse(value: unknown): HappyAgentSidebarCollapseDocument | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const collapsed = (value as { collapsed?: unknown }).collapsed;
    if (!Array.isArray(collapsed)) return undefined;
    const seen = new Set<string>();
    for (const id of collapsed) if (typeof id === "string" && id.length > 0) seen.add(id);
    return { collapsed: [...seen] };
}

const EMPTY_SNAPSHOT: HappyAgentSidebarCollapseSnapshot = { collapsed: new Set<string>() };

/**
 * The window's folded sidebar rows, hydrated from the host's storage when it
 * has one. A stored document comes from a previous version of this app and from
 * a place a reader can edit, so it is parsed rather than trusted; an unreadable
 * one simply means nothing has been folded.
 */
export function happyAgentSidebarCollapseStoreCreate(
    persistence?: HappyAgentSidebarCollapsePersistence,
): HappyAgentSidebarCollapseStore {
    let snapshot: HappyAgentSidebarCollapseSnapshot = (() => {
        try {
            const document = documentParse(persistence?.read());
            return document ? { collapsed: new Set(document.collapsed) } : EMPTY_SNAPSHOT;
        } catch {
            return EMPTY_SNAPSHOT;
        }
    })();
    const listeners = new Set<() => void>();
    const collapsedWrite = (collapsed: Set<string>) => {
        try {
            persistence?.write({ collapsed: [...collapsed] });
        } catch {
            // Storage the host refused still keeps this window's folding for
            // as long as it stays open.
        }
    };
    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        rowCollapseToggle(rowId) {
            if (rowId.length === 0) return;
            const collapsed = new Set(snapshot.collapsed);
            if (!collapsed.delete(rowId)) collapsed.add(rowId);
            // Insertion order is the order they were folded, so trimming from
            // the front lets go of the oldest folding first.
            while (collapsed.size > COLLAPSED_MAX) {
                const oldest = collapsed.values().next();
                if (oldest.done === true) break;
                collapsed.delete(oldest.value);
            }
            snapshot = { ...snapshot, collapsed };
            collapsedWrite(collapsed);
            for (const listener of listeners) listener();
        },
        rowReveal(rowId, foldedIds) {
            if (rowId.length === 0) return;
            const collapsed = new Set(snapshot.collapsed);
            const opened = foldedIds.filter((id) => collapsed.delete(id)).length > 0;
            snapshot = {
                collapsed: opened ? collapsed : snapshot.collapsed,
                reveal: { rowId, serial: (snapshot.reveal?.serial ?? 0) + 1 },
            };
            if (opened) collapsedWrite(collapsed);
            for (const listener of listeners) listener();
        },
    };
}

/**
 * A folding record for a window that keeps none. Nothing is folded and nothing
 * can be, so a sidebar that must read one unconditionally reads "everything
 * open" instead of offering a fold the next launch would forget.
 */
export const happyAgentSidebarCollapseStoreNoop: HappyAgentSidebarCollapseStore = {
    get: () => EMPTY_SNAPSHOT,
    subscribe: () => () => undefined,
    rowCollapseToggle: () => undefined,
    rowReveal: () => undefined,
};
