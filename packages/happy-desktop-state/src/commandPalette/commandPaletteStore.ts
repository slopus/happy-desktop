/**
 * Whether the command palette is showing, what has been typed into it, and
 * which of the offered rows Enter would run.
 *
 * This is the window's own transient view state and nothing else: it is not in
 * the address, it is not remembered across launches, and it holds no results.
 * The rows the palette shows are a pure transform of the snapshots the surface
 * already reads, recomputed as those change, so keeping a copy of them here
 * would be a second, staler answer to a question another store already owns.
 *
 * The highlight is an index rather than a row id because the offered list
 * narrows as the query is typed. The owner of the list is the only party that
 * knows how long it currently is, so it clamps or wraps before recording a
 * move here.
 */
export interface CommandPaletteSnapshot {
    /** Which row Enter would run, as an index into the owner's flat list. */
    readonly activeIndex: number;
    readonly open: boolean;
    /** Empty whenever the palette is closed: a closed palette asks nothing. */
    readonly query: string;
    /**
     * Whether the sheet listing every chord is showing. It is the palette's
     * sibling — the other window-wide surface a chord summons — and the two
     * never show together: opening either closes the other.
     */
    readonly shortcutSheet: boolean;
}

export interface CommandPaletteStore {
    get(): CommandPaletteSnapshot;
    subscribe(listener: () => void): () => void;
    /** Shows the palette with an empty query, as if it had never been opened. */
    paletteOpen(): void;
    paletteClose(): void;
    paletteToggle(): void;
    /** Records what has been typed; a new query is a new list, highlighted at its top. */
    queryUpdate(value: string): void;
    /** Moves the highlight to a position the owner has already clamped into its list. */
    activeIndexUpdate(value: number): void;
    shortcutSheetOpen(): void;
    shortcutSheetClose(): void;
    shortcutSheetToggle(): void;
}

const CLOSED: CommandPaletteSnapshot = {
    activeIndex: 0,
    open: false,
    query: "",
    shortcutSheet: false,
};
const OPENED: CommandPaletteSnapshot = {
    activeIndex: 0,
    open: true,
    query: "",
    shortcutSheet: false,
};
const SHEET: CommandPaletteSnapshot = { ...CLOSED, shortcutSheet: true };

/**
 * Creates the window-lifetime command palette store.
 *
 * The constructor opens nothing — there is no transport, no timer, and no
 * storage behind an open palette — so a host can materialize this the moment a
 * window exists and pay for it only while someone is looking at it.
 */
export function commandPaletteStoreCreate(): CommandPaletteStore {
    let snapshot: CommandPaletteSnapshot = CLOSED;
    const listeners = new Set<() => void>();

    const publish = (next: CommandPaletteSnapshot): void => {
        snapshot = next;
        for (const listener of listeners) listener();
    };

    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        paletteOpen() {
            if (snapshot.open) return;
            publish(OPENED);
        },
        paletteClose() {
            if (!snapshot.open) return;
            publish(CLOSED);
        },
        paletteToggle() {
            publish(snapshot.open ? CLOSED : OPENED);
        },
        queryUpdate(value) {
            // A closed palette has no query to change, so a keystroke arriving
            // from a card being taken down cannot bring one back.
            if (!snapshot.open || snapshot.query === value) return;
            publish({ activeIndex: 0, open: true, query: value, shortcutSheet: false });
        },
        activeIndexUpdate(value) {
            if (!snapshot.open || snapshot.activeIndex === value) return;
            publish({ ...snapshot, activeIndex: value });
        },
        shortcutSheetOpen() {
            if (snapshot.shortcutSheet) return;
            publish(SHEET);
        },
        shortcutSheetClose() {
            if (!snapshot.shortcutSheet) return;
            publish(CLOSED);
        },
        shortcutSheetToggle() {
            publish(snapshot.shortcutSheet ? CLOSED : SHEET);
        },
    };
}

/**
 * The palette a surface that offers no commands stands in. It stays closed and
 * ignores every action, so a screen can subscribe without branching on whether
 * this window has one.
 */
export const commandPaletteStoreNoop: CommandPaletteStore = {
    get: () => CLOSED,
    subscribe: () => () => {},
    paletteOpen: () => {},
    paletteClose: () => {},
    paletteToggle: () => {},
    queryUpdate: () => {},
    activeIndexUpdate: () => {},
    shortcutSheetOpen: () => {},
    shortcutSheetClose: () => {},
    shortcutSheetToggle: () => {},
};
