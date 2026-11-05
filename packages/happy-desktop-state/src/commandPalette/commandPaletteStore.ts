/**
 * Whether the command palette is showing, what has been typed into it, and
 * which of the offered rows Enter would run.
 *
 * This is the window's own transient view state and nothing else: it is not in
 * the address, it is not remembered across launches, and it holds no results.
 * The rows the palette shows are a pure transform of the snapshots the surface
 * already reads, recomputed as those change, so keeping a copy of them here
 * would be a second, staler answer to a question another store already owns.
 * What it does keep is which found rows the reader has passed, since that is
 * a fact about looking, not about the results.
 *
 * The highlight is an index rather than a row id because the offered list
 * narrows as the query is typed. The owner of the list is the only party that
 * knows how long it currently is, so it clamps or wraps before recording a
 * move here.
 */
export interface CommandPaletteSnapshot {
    /** Which row Enter would run, as an index into the owner's flat list. */
    readonly activeIndex: number;
    /**
     * The search keys of the found rows the reader has passed, from the top
     * through the highlighted one, as they were shown when the highlight last
     * moved. Those rows keep their places when the Happy Agent's answer
     * arrives. Absent until the reader moves the highlight after typing: then
     * nothing has been chosen, and the answer may reorder everything.
     */
    readonly held?: readonly string[];
    readonly open: boolean;
    /**
     * What was typed. Closing keeps the last query, so a palette still leaving
     * shows the list the reader left rather than a different one; opening
     * always starts empty.
     */
    readonly query: string;
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
    /**
     * Moves the highlight to a position the owner has already clamped into
     * its list, with the keys of the found rows shown from the top through it.
     */
    activeIndexUpdate(value: number, held: readonly string[]): void;
}

const CLOSED: CommandPaletteSnapshot = { activeIndex: 0, open: false, query: "" };
const OPENED: CommandPaletteSnapshot = { activeIndex: 0, open: true, query: "" };

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
            publish({ ...snapshot, open: false });
        },
        paletteToggle() {
            publish(snapshot.open ? { ...snapshot, open: false } : OPENED);
        },
        queryUpdate(value) {
            // A closed palette has no query to change, so a keystroke arriving
            // from a card being taken down cannot bring one back.
            if (!snapshot.open || snapshot.query === value) return;
            publish({ activeIndex: 0, open: true, query: value });
        },
        activeIndexUpdate(value, held) {
            if (!snapshot.open) return;
            if (
                snapshot.activeIndex === value &&
                snapshot.held !== undefined &&
                snapshot.held.length === held.length &&
                snapshot.held.every((key, index) => key === held[index])
            )
                return;
            publish({ ...snapshot, activeIndex: value, held });
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
};
