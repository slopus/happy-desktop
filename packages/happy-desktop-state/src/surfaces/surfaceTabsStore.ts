import { cuid2Create } from "../utils/cuid2Create.js";
import type { HappyAgentSurfaceId, HappyAgentSurfaceType } from "./surfaceTypes.js";

/**
 * The two places of a machine's sidebar its documents and its todo lists open
 * in. Each is a list of every Surface of its type, and a strip of tabs, like a
 * project's chats, of the ones the reader opened from it.
 */
export type HappyAgentSurfaceSection = "documents" | "todos";

/** The section a Surface of this type opens in; nothing for one that opens on its own. */
export function happyAgentSurfaceSectionOf(
    type: HappyAgentSurfaceType,
): HappyAgentSurfaceSection | undefined {
    if (type.kind === "document") return "documents";
    if (type.kind === "todo") return "todos";
    return undefined;
}

/**
 * One tab of a section: a Surface open in it, or the section's list, opened
 * with "+" to pick another one. Picking in a list tab turns that tab into the
 * Surface picked.
 */
export type HappyAgentSurfaceTab =
    | { readonly kind: "surface"; readonly surfaceId: HappyAgentSurfaceId }
    | { readonly kind: "list"; readonly id: string };

/** A tab's identity within its strip: a Surface's ID, or a list tab's own. */
export function happyAgentSurfaceTabId(tab: HappyAgentSurfaceTab): string {
    return tab.kind === "surface" ? tab.surfaceId : tab.id;
}

const listTabIdNext = cuid2Create(Date.now);

/** A new list tab's ID, minted where the tab is asked for so its address can name it. */
export function happyAgentSurfaceListTabIdCreate(): string {
    return `list-${listTabIdNext()}`;
}

/** One section's strip: its tabs in strip order and which were read most recently. */
export interface HappyAgentSurfaceSectionTabs {
    readonly tabs: readonly HappyAgentSurfaceTab[];
    /**
     * Tab IDs, most recently shown first. Its head is the tab the section
     * opens on again, and closing a tab falls back to the one behind it.
     */
    readonly history: readonly string[];
}

export interface HappyAgentSurfaceTabsSnapshot {
    readonly documents: HappyAgentSurfaceSectionTabs;
    readonly todos: HappyAgentSurfaceSectionTabs;
}

/**
 * The tabs of one machine's Documents and TODOs, remembered between runs the
 * way a project's chat tabs are. Which tab is on screen is the address's to
 * say; this store keeps what the strip holds and the order tabs were shown in.
 */
export interface HappyAgentSurfaceTabsStore {
    get(): HappyAgentSurfaceTabsSnapshot;
    subscribe(listener: () => void): () => void;
    /**
     * Shows a Surface in its section. One already open comes to the front. A
     * list tab in front becomes it, as picking in that list asks; one that
     * would duplicate an open tab goes instead. Anything else opens last.
     */
    surfaceTabOpen(section: HappyAgentSurfaceSection, surfaceId: HappyAgentSurfaceId): void;
    /** Shows a list tab, opening it last when the strip does not hold it yet. */
    listTabOpen(section: HappyAgentSurfaceSection, tabId: string): void;
    /**
     * Brings a tab the strip holds to the front, as selecting it in the strip
     * does, so opening its Surface next leaves the list tab it came from be.
     */
    tabSelect(section: HappyAgentSurfaceSection, tabId: string): void;
    tabClose(section: HappyAgentSurfaceSection, tabId: string): void;
    /** Rearranges the strip to the given order of its tab IDs. */
    tabReorder(section: HappyAgentSurfaceSection, tabIds: readonly string[]): void;
    [Symbol.dispose](): void;
}

export interface HappyAgentSurfaceTabsDeps {
    /** Where the strips are kept between runs; without it they last as long as this store. */
    readonly memory?: {
        read(): HappyAgentSurfaceTabsSnapshot | undefined;
        write(snapshot: HappyAgentSurfaceTabsSnapshot): void;
    };
}

const SECTION_EMPTY: HappyAgentSurfaceSectionTabs = { tabs: [], history: [] };
const TABS_EMPTY: HappyAgentSurfaceTabsSnapshot = {
    documents: SECTION_EMPTY,
    todos: SECTION_EMPTY,
};

/** Moves one ID to the front of a history. */
function historyFront(history: readonly string[], tabId: string): readonly string[] {
    return history[0] === tabId ? history : [tabId, ...history.filter((id) => id !== tabId)];
}

/** What one section's strip becomes when a Surface is shown in it. */
function surfaceShown(
    section: HappyAgentSurfaceSectionTabs,
    surfaceId: HappyAgentSurfaceId,
): HappyAgentSurfaceSectionTabs {
    const open = section.tabs.some((tab) => tab.kind === "surface" && tab.surfaceId === surfaceId);
    const front = section.tabs.find((tab) => happyAgentSurfaceTabId(tab) === section.history[0]);
    if (front?.kind === "list") {
        const listId = front.id;
        const tabs: HappyAgentSurfaceTab[] = open
            ? section.tabs.filter((tab) => tab !== front)
            : section.tabs.map((tab) => (tab === front ? { kind: "surface", surfaceId } : tab));
        return {
            tabs,
            history: historyFront(
                section.history.filter((id) => id !== listId),
                surfaceId,
            ),
        };
    }
    if (open && section.history[0] === surfaceId) return section;
    return {
        tabs: open ? section.tabs : [...section.tabs, { kind: "surface", surfaceId }],
        history: historyFront(section.history, surfaceId),
    };
}

export function happyAgentSurfaceTabsStoreCreate(
    deps: HappyAgentSurfaceTabsDeps = {},
): HappyAgentSurfaceTabsStore {
    const listeners = new Set<() => void>();
    let snapshot: HappyAgentSurfaceTabsSnapshot = (() => {
        try {
            return deps.memory?.read() ?? TABS_EMPTY;
        } catch {
            // Memory the host cannot read is memory of nothing.
            return TABS_EMPTY;
        }
    })();
    let disposed = false;

    const sectionUpdate = (
        section: HappyAgentSurfaceSection,
        next: HappyAgentSurfaceSectionTabs,
    ): void => {
        if (disposed || snapshot[section] === next) return;
        snapshot = { ...snapshot, [section]: next };
        try {
            deps.memory?.write(snapshot);
        } catch {
            // Storage the host refused still keeps the strips for this run.
        }
        for (const listener of listeners) listener();
    };

    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        surfaceTabOpen(section, surfaceId) {
            sectionUpdate(section, surfaceShown(snapshot[section], surfaceId));
        },
        listTabOpen(section, tabId) {
            const current = snapshot[section];
            const open = current.tabs.some((tab) => tab.kind === "list" && tab.id === tabId);
            if (open && current.history[0] === tabId) return;
            sectionUpdate(section, {
                tabs: open ? current.tabs : [...current.tabs, { kind: "list", id: tabId }],
                history: historyFront(current.history, tabId),
            });
        },
        tabSelect(section, tabId) {
            const current = snapshot[section];
            if (!current.tabs.some((tab) => happyAgentSurfaceTabId(tab) === tabId)) return;
            if (current.history[0] === tabId) return;
            sectionUpdate(section, { ...current, history: historyFront(current.history, tabId) });
        },
        tabClose(section, tabId) {
            const current = snapshot[section];
            if (!current.tabs.some((tab) => happyAgentSurfaceTabId(tab) === tabId)) return;
            sectionUpdate(section, {
                tabs: current.tabs.filter((tab) => happyAgentSurfaceTabId(tab) !== tabId),
                history: current.history.filter((id) => id !== tabId),
            });
        },
        tabReorder(section, tabIds) {
            const current = snapshot[section];
            const byId = new Map(current.tabs.map((tab) => [happyAgentSurfaceTabId(tab), tab]));
            const ordered = tabIds.flatMap((id) => {
                const tab = byId.get(id);
                byId.delete(id);
                return tab === undefined ? [] : [tab];
            });
            // A tab the move did not name keeps its place at the end.
            const tabs = [...ordered, ...byId.values()];
            if (tabs.every((tab, index) => tab === current.tabs[index])) return;
            sectionUpdate(section, { ...current, tabs });
        },
        [Symbol.dispose]() {
            disposed = true;
            listeners.clear();
        },
    };
}
