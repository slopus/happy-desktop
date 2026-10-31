import type { HappyAgentFileTabKind } from "./happyAgentWorkspaceStore.js";
import type {
    HappyAgentBrowserNetworkId,
    HappyAgentGroupId,
    HappyAgentSessionId,
} from "./happyAgentTypes.js";
import type { HappyAgentBrowserRecent, HappyAgentViewPlacement } from "./happyAgentPanelStore.js";

/** One file tab remembered for a group, enough to reopen it as it was left. */
export interface HappyAgentFileTabMemory {
    readonly path: string;
    readonly kind: HappyAgentFileTabKind;
    /**
     * The tab was a glance rather than a document the reader settled on. It is
     * remembered all the same: closing the window is not a decision to throw the
     * file away, and a preview that came back as a permanent tab would be a
     * different tab than the one that was on screen.
     */
    readonly preview?: boolean;
}

/** One restorable tab destination in the reader's local most-recently-visited list. */
export type HappyAgentRecentTabMemory =
    | {
          readonly type: "session";
          readonly groupId: HappyAgentGroupId;
          readonly sessionId: HappyAgentSessionId;
      }
    | {
          readonly type: "file";
          readonly groupId: HappyAgentGroupId;
          readonly path: string;
          /** The newest presentation used for this path; revisiting replaces the older one. */
          readonly fileKind: HappyAgentFileTabKind;
      };

/** One browser tab remembered for a group's panel, by where it was left. */
export interface HappyAgentPanelBrowserMemory {
    readonly url: string;
    readonly label: string;
    /** The agent the page was opened for. */
    readonly agentId: HappyAgentSessionId;
    /** The network the page was bound to when it opened; it never moves to another. */
    readonly networkId: HappyAgentBrowserNetworkId;
    /**
     * Which strip the page was being read in. Absent means the panel, which is
     * where every page opens and where every page remembered before this was
     * written down was.
     */
    readonly placement?: HappyAgentViewPlacement;
}

/**
 * Which of a panel's views was on screen. A terminal is deliberately not one of
 * them: it is a live process, and there is nothing to reattach to once the
 * window that owned it is gone.
 */
export type HappyAgentPanelViewMemory =
    | { readonly type: "files" }
    /** The browser tab at this index in `browsers`. */
    | { readonly type: "browser"; readonly index: number };

/**
 * How one group's panel was arranged: whether it was showing at all, how wide,
 * the pages it had open, and which view was in front.
 */
export interface HappyAgentPanelMemory {
    readonly open: boolean;
    readonly browsers: readonly HappyAgentPanelBrowserMemory[];
    readonly active: HappyAgentPanelViewMemory;
    /** Pages the group's browser visited, most recent first. */
    readonly recent?: readonly HappyAgentBrowserRecent[];
}

/**
 * What one project or worktree was left looking like: the tab that was being
 * read, the order tabs were last read in, and the files that were open in it.
 * The history is what makes a closed tab fall back to the one behind it rather
 * than to an arbitrary row.
 */
export interface HappyAgentGroupTabMemory {
    /** The tab that was on screen: a session id, or a file tab id. */
    readonly activeTabId?: string;
    /** Tab ids, most recently read first. */
    readonly history: readonly string[];
    /** The group's open file tabs, in strip order. */
    readonly files: readonly HappyAgentFileTabMemory[];
    /**
     * Where the reader dragged each tab, as a fractional order key by tab id.
     * Only tabs that have actually been moved appear: an untouched strip has no
     * keys at all and reads in the order its tabs arrived, which is what makes a
     * new tab open last without anything being written down for it.
     *
     * The keys are minted here rather than read from the daemon because this is
     * one strip of mixed things — sessions, files, whatever else lands in it —
     * and the daemon only knows about sessions. It could never order a strip it
     * can only see half of.
     */
    readonly order?: { readonly [tabId: string]: string };
    /** How the group's right-hand panel was arranged. */
    readonly panel?: HappyAgentPanelMemory;
    /**
     * What was typed into the group's composer and never sent. It is kept here
     * rather than in the daemon because the daemon has nowhere to keep it: the
     * session this message would start does not exist yet, and creating one to
     * hold a sentence would leave an empty session behind every time somebody
     * began a thought and walked away from it.
     */
    readonly draft?: string;
}

/**
 * How long an unsent group draft may be before it stops being remembered. A
 * message is a message, not a document; this is far past anything anyone types
 * into a composer and well inside what the host's storage will hold.
 */
export const HAPPY_AGENT_GROUP_DRAFT_MAX_LENGTH = 100_000;

/**
 * Everything one Happy Agent's window remembers between runs about where the reader
 * was: each group's open and recently read tabs. Chat read state is durable Happy Agent
 * state and deliberately does not have a second local copy here.
 */
export interface HappyAgentWorkspaceMemoryDocument {
    readonly groups: { readonly [groupId: string]: HappyAgentGroupTabMemory | undefined };
    /** Restorable session and file destinations, most recently visited first. */
    readonly recentTabs?: readonly HappyAgentRecentTabMemory[];
    /** The work floaties the reader opened by hand, by chat or space, oldest first. */
    readonly floatyOpened?: readonly string[];
    /** The Surfaces whose shared chat the reader left open beside them, oldest first. */
    readonly surfaceChatsShown?: readonly string[];
    /** The Surfaces the reader widened to the whole pane, oldest first. */
    readonly surfacesExpanded?: readonly string[];
}

/**
 * Where that memory is kept. The state package never names a storage medium: the
 * host supplies one, and omitting it leaves the memory alive for this client's
 * lifetime only.
 */
export interface HappyAgentWorkspaceMemoryPersistence {
    read(): HappyAgentWorkspaceMemoryDocument | undefined;
    write(document: HappyAgentWorkspaceMemoryDocument): void;
}

/**
 * The workspace's durable navigation memory.
 */
/**
 * Everything one workspace remembers about a group, written one concern at a
 * time. Each writer merges into what is already there, so recording a tab move
 * cannot silently drop a draft and folding the panel away cannot drop the tabs.
 */
export interface HappyAgentWorkspaceMemoryStore {
    groupRead(groupId: HappyAgentGroupId): HappyAgentGroupTabMemory | undefined;
    /** Records the group's open tabs, the one being read, and its recent history. */
    groupTabsWrite(
        groupId: HappyAgentGroupId,
        tabs: {
            readonly activeTabId?: string;
            readonly history: readonly string[];
            readonly files: readonly HappyAgentFileTabMemory[];
        },
    ): void;
    /**
     * Records where the reader dragged the group's tabs. An empty map means the
     * strip is back to arrival order and carries no keys at all.
     */
    groupOrderWrite(groupId: HappyAgentGroupId, order: { readonly [tabId: string]: string }): void;
    /** Records how the group's panel was arranged. */
    groupPanelWrite(groupId: HappyAgentGroupId, panel: HappyAgentPanelMemory): void;
    /** Drops a group that no longer exists, with everything remembered about it. */
    groupForget(groupId: HappyAgentGroupId): void;
    /**
     * Records what is typed into a group's composer without disturbing its tabs.
     * Empty text forgets the draft, so a group nobody has typed into carries no
     * record of one.
     */
    groupDraftWrite(groupId: HappyAgentGroupId, draft: string): void;
    /** Restorable session and file destinations most recently visited, newest first. */
    recentTabsRead(): readonly HappyAgentRecentTabMemory[];
    /** Moves one destination to the front, replacing an older visit to the same tab. */
    recentTabRemember(tab: HappyAgentRecentTabMemory): void;
    /** The work floaties the reader opened by hand, by chat or space. */
    floatyOpenedRead(): readonly string[];
    floatyOpenedWrite(keys: readonly string[]): void;
    /** The Surfaces whose shared chat the reader left open beside them. */
    surfaceChatsShownRead(): readonly string[];
    surfaceChatsShownWrite(surfaceIds: readonly string[]): void;
    /** The Surfaces the reader widened to the whole pane. */
    surfacesExpandedRead(): readonly string[];
    surfacesExpandedWrite(surfaceIds: readonly string[]): void;
}

const FILE_KINDS: readonly HappyAgentFileTabKind[] = ["file", "diff", "document", "media"];
/** Per-group budgets keep one busy workspace from erasing every other workspace's history. */
const RECENT_SESSION_LIMIT_PER_GROUP = 200;
const RECENT_FILE_LIMIT_PER_GROUP = 80;
/** Opened floaties remembered; the oldest is forgotten first. */
const FLOATY_OPENED_LIMIT = 500;
/** Surfaces remembered with their chat open, or widened; the oldest is forgotten first. */
const SURFACE_CHATS_SHOWN_LIMIT = 500;
const SURFACES_EXPANDED_LIMIT = 500;

/** The distinct non-empty strings of a stored list, newest `limit` kept. */
function storedKeysParse(value: unknown, limit: number): readonly string[] {
    if (!Array.isArray(value)) return [];
    return [
        ...new Set(value.filter((key): key is string => typeof key === "string" && key.length > 0)),
    ].slice(-limit);
}

function recentTabsBound(
    tabs: readonly HappyAgentRecentTabMemory[],
): readonly HappyAgentRecentTabMemory[] {
    const sessions = new Map<HappyAgentGroupId, number>();
    const files = new Map<HappyAgentGroupId, number>();
    return tabs.filter((tab) => {
        if (tab.type === "session") {
            const count = (sessions.get(tab.groupId) ?? 0) + 1;
            sessions.set(tab.groupId, count);
            return count <= RECENT_SESSION_LIMIT_PER_GROUP;
        }
        const count = (files.get(tab.groupId) ?? 0) + 1;
        files.set(tab.groupId, count);
        return count <= RECENT_FILE_LIMIT_PER_GROUP;
    });
}

/** Reads one stored file tab, rejecting anything that is not the shape we wrote. */
function fileTabParse(value: unknown): HappyAgentFileTabMemory | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const record = value as Record<string, unknown>;
    const { path, kind } = record;
    if (typeof path !== "string") return undefined;
    if (typeof kind !== "string" || !FILE_KINDS.includes(kind as HappyAgentFileTabKind))
        return undefined;
    return {
        path,
        kind: kind as HappyAgentFileTabKind,
        ...(record.preview === true ? { preview: true } : {}),
    };
}

function recentTabParse(value: unknown): HappyAgentRecentTabMemory | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const record = value as Record<string, unknown>;
    const { groupId, type } = record;
    if (typeof groupId !== "string" || groupId.length === 0) return undefined;
    if (type === "session") {
        if (typeof record.sessionId !== "string" || record.sessionId.length === 0) return undefined;
        return {
            type,
            groupId: groupId as HappyAgentGroupId,
            sessionId: record.sessionId as HappyAgentSessionId,
        };
    }
    if (type !== "file") return undefined;
    if (typeof record.path !== "string" || record.path.length === 0) return undefined;
    if (
        typeof record.fileKind !== "string" ||
        !FILE_KINDS.includes(record.fileKind as HappyAgentFileTabKind)
    )
        return undefined;
    return {
        type,
        groupId: groupId as HappyAgentGroupId,
        path: record.path,
        fileKind: record.fileKind as HappyAgentFileTabKind,
    };
}

function recentTabKey(tab: HappyAgentRecentTabMemory): string {
    return tab.type === "session"
        ? `session\u0000${tab.groupId}\u0000${tab.sessionId}`
        : `file\u0000${tab.groupId}\u0000${tab.path}`;
}

function recentTabSame(left: HappyAgentRecentTabMemory, right: HappyAgentRecentTabMemory): boolean {
    if (recentTabKey(left) !== recentTabKey(right)) return false;
    if (left.type === "session") return right.type === "session";
    if (right.type !== "file") return false;
    return left.fileKind === right.fileKind;
}

function orderParse(value: unknown): { readonly [tabId: string]: string } | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const entries = Object.entries(value as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0,
    );
    return entries.length === 0 ? undefined : Object.fromEntries(entries);
}

function panelParse(value: unknown): HappyAgentPanelMemory | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const record = value as Record<string, unknown>;
    const stored = record.active;
    const storedIndex =
        typeof stored === "object" &&
        stored !== null &&
        (stored as Record<string, unknown>).type === "browser" &&
        typeof (stored as Record<string, unknown>).index === "number"
            ? (stored as { index: number }).index
            : undefined;
    let activeIndex: number | undefined;
    const browsers: HappyAgentPanelBrowserMemory[] = [];
    // A page remembered without its agent and network has no network to load
    // from, so it is not brought back on some other one.
    for (const [index, entry] of (Array.isArray(record.browsers)
        ? record.browsers
        : []
    ).entries()) {
        if (typeof entry !== "object" || entry === null) continue;
        const browser = entry as Record<string, unknown>;
        if (typeof browser.url !== "string") continue;
        if (typeof browser.agentId !== "string" || browser.agentId.length === 0) continue;
        if (typeof browser.networkId !== "string" || browser.networkId.length === 0) continue;
        if (index === storedIndex) activeIndex = browsers.length;
        browsers.push({
            url: browser.url,
            label: typeof browser.label === "string" ? browser.label : browser.url,
            agentId: browser.agentId as HappyAgentSessionId,
            networkId: browser.networkId as HappyAgentBrowserNetworkId,
        });
    }
    const active: HappyAgentPanelViewMemory =
        activeIndex === undefined ? { type: "files" } : { type: "browser", index: activeIndex };
    const recent = (Array.isArray(record.recent) ? record.recent : []).flatMap(
        (entry): HappyAgentBrowserRecent[] => {
            if (typeof entry !== "object" || entry === null) return [];
            const page = entry as Record<string, unknown>;
            if (typeof page.url !== "string") return [];
            return [
                { url: page.url, label: typeof page.label === "string" ? page.label : page.url },
            ];
        },
    );
    const panel: HappyAgentPanelMemory = {
        open: record.open === true,
        browsers,
        active,
        ...(recent.length === 0 ? {} : { recent }),
    };
    return panelMemoryEmpty(panel) ? undefined : panel;
}

/**
 * A closed panel with nothing in it is the default, and writing it down for
 * every group anyone ever opened would only grow the document.
 */
function panelMemoryEmpty(panel: HappyAgentPanelMemory): boolean {
    return !panel.open && panel.browsers.length === 0 && !panel.recent?.length;
}

function groupParse(value: unknown): HappyAgentGroupTabMemory | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const record = value as Record<string, unknown>;
    const history = Array.isArray(record.history)
        ? record.history.filter((id): id is string => typeof id === "string")
        : [];
    const files = Array.isArray(record.files)
        ? record.files.flatMap((entry) => {
              const file = fileTabParse(entry);
              return file ? [file] : [];
          })
        : [];
    const activeTabId = typeof record.activeTabId === "string" ? record.activeTabId : undefined;
    const draft =
        typeof record.draft === "string" && record.draft.length > 0
            ? record.draft.slice(0, HAPPY_AGENT_GROUP_DRAFT_MAX_LENGTH)
            : undefined;
    const order = orderParse(record.order);
    const panel = panelParse(record.panel);
    if (
        history.length === 0 &&
        files.length === 0 &&
        draft === undefined &&
        order === undefined &&
        panel === undefined
    )
        return undefined;
    return {
        ...(activeTabId ? { activeTabId } : {}),
        history,
        files,
        ...(order === undefined ? {} : { order }),
        ...(panel === undefined ? {} : { panel }),
        ...(draft === undefined ? {} : { draft }),
    };
}

/** True once nothing is left worth keeping a record of this group for. */
function groupEmpty(memory: HappyAgentGroupTabMemory): boolean {
    return (
        memory.history.length === 0 &&
        memory.files.length === 0 &&
        memory.draft === undefined &&
        memory.order === undefined &&
        memory.panel === undefined
    );
}

/**
 * Creates the memory a Happy Agent's surfaces share, hydrated from the host's storage
 * when it has one. Stored documents come from a previous version of this app and
 * from a file a reader can edit, so every field is parsed rather than trusted;
 * an unreadable document simply means nothing is remembered.
 */
export function happyAgentWorkspaceMemoryStoreCreate(
    persistence?: HappyAgentWorkspaceMemoryPersistence,
): HappyAgentWorkspaceMemoryStore {
    const groups = new Map<string, HappyAgentGroupTabMemory>();
    let recentTabs: readonly HappyAgentRecentTabMemory[] = [];
    let floatyOpened: readonly string[] = [];
    let surfaceChatsShown: readonly string[] = [];
    let surfacesExpanded: readonly string[] = [];
    const stored = (() => {
        try {
            return persistence?.read();
        } catch {
            return undefined;
        }
    })();
    if (stored && typeof stored === "object") {
        const document = stored as HappyAgentWorkspaceMemoryDocument;
        const storedGroups = document.groups;
        if (storedGroups && typeof storedGroups === "object")
            for (const [groupId, value] of Object.entries(storedGroups)) {
                const group = groupParse(value);
                if (group) groups.set(groupId, group);
            }
        if (Array.isArray(document.recentTabs)) {
            const seen = new Set<string>();
            recentTabs = recentTabsBound(
                document.recentTabs.flatMap((value) => {
                    const tab = recentTabParse(value);
                    if (!tab) return [];
                    const key = recentTabKey(tab);
                    if (seen.has(key)) return [];
                    seen.add(key);
                    return [tab];
                }),
            );
        }
        floatyOpened = storedKeysParse(document.floatyOpened, FLOATY_OPENED_LIMIT);
        surfaceChatsShown = storedKeysParse(document.surfaceChatsShown, SURFACE_CHATS_SHOWN_LIMIT);
        surfacesExpanded = storedKeysParse(document.surfacesExpanded, SURFACES_EXPANDED_LIMIT);
    }

    const flush = (): void => {
        if (!persistence) return;
        try {
            persistence.write({
                groups: Object.fromEntries(groups),
                recentTabs,
                ...(floatyOpened.length === 0 ? {} : { floatyOpened }),
                ...(surfaceChatsShown.length === 0 ? {} : { surfaceChatsShown }),
                ...(surfacesExpanded.length === 0 ? {} : { surfacesExpanded }),
            });
        } catch {
            // Storage the host refused still keeps this client's memory alive.
        }
    };

    /** Applies one concern's change over whatever else the group remembers. */
    const merge = (groupId: HappyAgentGroupId, next: HappyAgentGroupTabMemory): void => {
        if (groupEmpty(next)) {
            if (!groups.delete(groupId)) return;
            flush();
            return;
        }
        groups.set(groupId, next);
        flush();
    };

    const groupOr = (groupId: HappyAgentGroupId): HappyAgentGroupTabMemory =>
        groups.get(groupId) ?? { history: [], files: [] };

    return {
        groupRead: (groupId) => groups.get(groupId),
        groupTabsWrite(groupId, tabs) {
            const previous = groupOr(groupId);
            merge(groupId, {
                ...previous,
                ...(tabs.activeTabId ? { activeTabId: tabs.activeTabId } : {}),
                history: tabs.history,
                files: tabs.files,
            });
        },
        groupOrderWrite(groupId, order) {
            const previous = groupOr(groupId);
            const { order: _dropped, ...rest } = previous;
            merge(
                groupId,
                Object.keys(order).length === 0 ? rest : { ...rest, order: { ...order } },
            );
        },
        groupPanelWrite(groupId, panel) {
            const previous = groupOr(groupId);
            const { panel: _dropped, ...rest } = previous;
            // The default arrangement is not worth a record: a panel nobody has
            // opened must not keep a group alive in this document.
            merge(groupId, panelMemoryEmpty(panel) ? rest : { ...rest, panel });
        },
        groupForget(groupId) {
            const groupRemoved = groups.delete(groupId);
            const remainingTabs = recentTabs.filter((tab) => tab.groupId !== groupId);
            if (!groupRemoved && remainingTabs.length === recentTabs.length) return;
            recentTabs = remainingTabs;
            flush();
        },
        groupDraftWrite(groupId, draft) {
            const previous = groups.get(groupId);
            const next = draft.slice(0, HAPPY_AGENT_GROUP_DRAFT_MAX_LENGTH);
            if ((previous?.draft ?? "") === next) return;
            if (next.length === 0) {
                if (!previous) return;
                const { draft: _dropped, ...rest } = previous;
                // A group whose draft was the only thing worth remembering is
                // forgotten with it rather than left as an empty record.
                merge(groupId, rest);
                return;
            }
            merge(groupId, { ...groupOr(groupId), draft: next });
        },
        recentTabsRead: () => recentTabs,
        recentTabRemember(tab) {
            const key = recentTabKey(tab);
            if (recentTabs[0] && recentTabSame(recentTabs[0], tab)) return;
            recentTabs = recentTabsBound([
                tab,
                ...recentTabs.filter((entry) => recentTabKey(entry) !== key),
            ]);
            flush();
        },
        floatyOpenedRead: () => floatyOpened,
        floatyOpenedWrite(keys) {
            floatyOpened = [...new Set(keys)].slice(-FLOATY_OPENED_LIMIT);
            flush();
        },
        surfaceChatsShownRead: () => surfaceChatsShown,
        surfaceChatsShownWrite(surfaceIds) {
            surfaceChatsShown = [...new Set(surfaceIds)].slice(-SURFACE_CHATS_SHOWN_LIMIT);
            flush();
        },
        surfacesExpandedRead: () => surfacesExpanded,
        surfacesExpandedWrite(surfaceIds) {
            surfacesExpanded = [...new Set(surfaceIds)].slice(-SURFACES_EXPANDED_LIMIT);
            flush();
        },
    };
}
