import type {
    HappyAgentTerminalHandle,
    HappyAgentTerminalStore,
} from "./happyAgentTerminalStore.js";
import type { HappyAgentArtifactId } from "../artifacts/artifactTypes.js";
import type {
    HappyAgentBrowserNetworkId,
    HappyAgentGroupId,
    HappyAgentSessionId,
} from "./happyAgentTypes.js";
import type { HappyAgentPanelChatHandle, HappyAgentPanelChatStore } from "./happyAgentPanelChat.js";
import type { HappyAgentPanelMemory } from "./happyAgentWorkspaceMemory.js";

declare const happyAgentPanelTabIdBrand: unique symbol;

/** Branded identifier of one tab in the workspace panel, minted by this store. */
export type HappyAgentPanelTabId = string & { readonly [happyAgentPanelTabIdBrand]: true };

/**
 * What a tool tab holds. An artifact is one only once the reader moved it out
 * of the panel's artifact tab into the main content; in the panel it is that
 * one replaceable tab rather than a tool tab of its own. A chat is another
 * conversation read beside the open one.
 */
export type HappyAgentPanelTabKind = "terminal" | "browser" | "artifact" | "chat";

/**
 * Which of the workspace's two tab strips a view is being shown in.
 *
 * Placement is a property of the view, not of the strip drawing it: a terminal
 * moved into the main content is the same terminal running the same shell under
 * the same id, and only where it is drawn has changed. Saying that in one field
 * is what makes moving one a change of placement rather than closing a tab here
 * and opening a different one there.
 */
export type HappyAgentViewPlacement = "panel" | "main";

interface HappyAgentPanelTabSnapshotBase {
    readonly id: HappyAgentPanelTabId;
    /** Tab strip label. A terminal's is its ordinal, not its shell's window title. */
    readonly label: string;
    /** Which strip is drawing this tab. Every tab is born in the panel. */
    readonly placement: HappyAgentViewPlacement;
}

export type HappyAgentPanelTabSnapshot =
    | (HappyAgentPanelTabSnapshotBase & {
          readonly kind: "terminal";
      })
    | (HappyAgentPanelTabSnapshotBase & {
          readonly kind: "browser";
          /** Authoritative workspace network boundary. */
          readonly workspaceId: HappyAgentGroupId;
          /**
           * The agent the tab was opened for, fixed when it opened. Reading
           * another of the workspace's chats never moves it.
           */
          readonly agentId: HappyAgentSessionId;
          /**
           * The network the tab is bound to, named once by the agent's Happy
           * Agent and never replaced: a different network is a different tab.
           * Absent until it has been named.
           */
          readonly networkId?: HappyAgentBrowserNetworkId;
          /** Last committed main-frame location, restored if the surface remounts. */
          readonly url: string;
      })
    | (HappyAgentPanelTabSnapshotBase & {
          readonly kind: "chat";
          /** The conversation the tab reads. */
          readonly agentId: HappyAgentSessionId;
      })
    | (HappyAgentPanelTabSnapshotBase & {
          readonly kind: "artifact";
          readonly artifactId: HappyAgentArtifactId;
          /** The version it was on when it moved; absent, it follows the latest. */
          readonly version?: number;
      });

/** A page this group's browser visited, for its new tab to offer again. */
export interface HappyAgentBrowserRecent {
    readonly url: string;
    readonly label: string;
}

export interface HappyAgentBrowserUpdate {
    /** Last committed main-frame location. */
    readonly url?: string;
    /** Page title reported by Chromium. Empty titles fall back to the host name. */
    readonly title?: string;
}

/**
 * The panel as the workspace renders it: whether it is showing at all, the tabs
 * belonging to the project or worktree currently addressed, and which of them is
 * selected. A tab's live contents are deliberately absent — a terminal repaints
 * many times a second, and folding that into this snapshot would re-render the
 * whole workspace on every frame — so a tab body reads its own store through
 * `terminal`.
 */
export interface HappyAgentPanelSnapshot {
    readonly open: boolean;
    readonly tabs: readonly HappyAgentPanelTabSnapshot[];
    /** Every live browser, including other groups, until its tab truly closes. */
    readonly browserTabs: readonly Extract<HappyAgentPanelTabSnapshot, { kind: "browser" }>[];
    /**
     * Whether Files is in the strip. It is closed like any other tab, and the
     * pane closes with the last of them; opening the pane again brings it back.
     */
    readonly filesViewOpen: boolean;
    /**
     * Pages the addressed group's browser visited, most recent first. Pages
     * share one browser per group, so this is that browser's history.
     */
    readonly browserRecent: readonly HappyAgentBrowserRecent[];
    /** Whether the transient Activity tab is selected/open for this conversation. */
    readonly activityViewOpen: boolean;
    /** Whether the reader dismissed the Activity tab for this conversation. */
    readonly activityViewDismissed: boolean;
    /** Whether the transient Usage tab is open for this conversation. */
    readonly usageViewOpen: boolean;
    /**
     * Whether the Devices tab is open. It belongs to the workspace rather than
     * to one conversation, because what it bridges reaches the workspace's
     * machine, so moving between that workspace's sessions keeps it.
     */
    readonly devicesViewOpen: boolean;
    /**
     * The permanent files view, the permanent list of the chat's artifacts, the
     * transient tool preview, the transient file viewer, or one live tool tab.
     */
    readonly activeViewId:
        | "files"
        | "artifacts"
        | "activity"
        | "usage"
        | "devices"
        | "preview"
        | "change"
        | "file"
        | "artifact"
        | HappyAgentPanelTabId;
    /** Conversation entry selected into the replaceable Preview tab. */
    readonly previewEntryId?: string;
    /**
     * One file that entry's tool call presented, by its media position: the
     * tab previews that file instead of the call.
     */
    readonly previewMediaIndex?: number;
    /**
     * The file whose changes in this conversation the transient change tab
     * shows, as one diff of everything its edits did. It is the destination
     * for a changed file where no Git checkout keeps a diff of its own.
     */
    readonly changeViewPath?: string;
    /**
     * A workspace file is open in the transient viewer tab. Which file it is
     * belongs to the workspace store, which reads it; this only says the tab
     * exists, so the two never disagree about the file being shown.
     */
    readonly fileViewOpen: boolean;
    /**
     * The conversations whose work floaty the reader opened by hand. The
     * floaty never opens on its own: it stays shut until opened here.
     */
    readonly floatyOpened: ReadonlySet<string>;
    /** Whether the floaty's history fold is open. */
    readonly floatyHistoryExpanded: boolean;
    /**
     * The artifact a conversation link opened in the transient artifact tab,
     * and the version it named when it named one. Absent, the tab is closed.
     */
    readonly artifactView?: HappyAgentPanelArtifactView;
    /**
     * Why a new terminal cannot be opened here, or absent when one can. A shell
     * runs in the checkout, so a checkout that is not there cannot host one; the
     * owner supplies the sentence with the scope, since it is the one that knows
     * the group's state. Terminals already running are untouched by it.
     */
    readonly terminalRefusal?: string;
}

/** What the transient artifact tab is showing. */
export interface HappyAgentPanelArtifactView {
    readonly artifactId: HappyAgentArtifactId;
    readonly version?: number;
}

export interface HappyAgentPanelStore {
    get(): HappyAgentPanelSnapshot;
    subscribe(listener: () => void): () => void;

    /**
     * Shows or hides the panel. It never starts anything: a terminal is a process
     * in the user's working directory, and opening a column is not consent to run
     * one. The panel shows its own content and offers to start a terminal.
     */
    panelToggle(): void;
    /** Selects the workspace-files tab, bringing it back if closed, and opens the panel. */
    filesSelect(): void;
    /** Closes the Files tab; the pane closes with it when nothing else is in the strip. */
    filesClose(): void;
    /**
     * Selects the permanent list of what the open chat has published and opens
     * the panel. The owner offers the tab only where the Happy Agent has
     * artifacts at all.
     */
    artifactsSelect(): void;
    /** Opens or selects the transient Activity tab for the current conversation. */
    activitySelect(): void;
    /** Hides Activity while another panel is shown without dismissing its tab. */
    activityHide(): void;
    /** Closes the transient Activity tab and returns to Files when it was selected. */
    activityClose(): void;
    /** Opens or selects the transient Usage tab for the current conversation. */
    usageSelect(): void;
    /** Closes the transient Usage tab. */
    usageClose(): void;
    /** Opens or selects the workspace's Devices tab. */
    devicesSelect(): void;
    /** Closes the Devices tab. Nothing it opened is closed with it. */
    devicesClose(): void;
    /**
     * Opens or replaces the transient Preview tab with one conversation tool
     * entry, or with one file it presented when `mediaIndex` names it.
     */
    previewOpen(entryId: string, mediaIndex?: number): void;
    /** Closes the transient Preview tab and returns to Files. */
    previewClose(): void;
    /**
     * Opens or replaces the transient change tab with one file this
     * conversation changed, and opens the panel.
     */
    changeViewOpen(path: string): void;
    /** Closes the transient change tab and returns to Files. */
    changeViewClose(): void;
    /**
     * Shows the transient file-viewer tab and opens the panel. The workspace
     * store calls this as it starts reading the file, so the tab appears with
     * the file's own loading state rather than after it.
     */
    fileViewOpen(): void;
    /** Closes the file-viewer tab and returns to Files. */
    fileViewClose(): void;
    /**
     * Shows one other conversation in a panel tab of its own and opens the
     * panel, selecting the tab already reading it rather than adding another.
     */
    chatTabOpen(agentId: HappyAgentSessionId, label: string): void;
    /**
     * Shows the permanent Files tab in an open panel the moment `groupId` is
     * the group addressed: the reader is going there to look at its work.
     * Applied at once when it already is.
     */
    filesSelectOnArrival(groupId: HappyAgentGroupId): void;
    /** Opens one chat's or space's floaty by hand, or shuts it again. */
    floatyOpenedUpdate(key: string, opened: boolean): void;
    floatyHistoryExpandedUpdate(expanded: boolean): void;
    /**
     * Shows one artifact — at one version, when a link named one — in the
     * transient artifact tab and opens the panel. Like the file viewer it is a
     * replaceable tab: the next artifact link opened lands in it.
     */
    artifactViewOpen(artifactId: HappyAgentArtifactId, version?: number): void;
    /** Closes the artifact tab and returns to Files. */
    artifactViewClose(): void;
    /**
     * Moves the artifact tab's artifact into the main content as a tab of its
     * own, at `version` — the one the reader has on screen, or absent to keep
     * following the latest — and returns that tab's id. The panel gives up its
     * artifact tab exactly as closing it would. Nothing moves when the panel
     * has no artifact open or no group is addressed.
     */
    artifactViewDetach(version: number | undefined): HappyAgentPanelTabId | undefined;
    /**
     * Moves an artifact tab out of the main content back into the panel's
     * artifact tab, at `version`, and shows it there. The artifact tab is one
     * slot, so whatever it held steps aside.
     */
    artifactTabAttach(tabId: HappyAgentPanelTabId, version: number | undefined): void;
    /**
     * Adds a terminal tab to the open group and selects it. The shell runs in
     * the open session, so there has to be one; the tab itself belongs to the
     * group and stays put as the reader moves between that group's sessions.
     * Given a page's tab, the terminal takes its place, the way a new tab
     * becomes whatever is opened from it.
     */
    terminalAdd(replacing?: HappyAgentPanelTabId): void;
    /**
     * Adds a browser tab to the open group, optionally at one safe web URL, and
     * selects it. The page uses the open conversation's agent, so without one
     * nothing is added.
     */
    browserAdd(url?: string): void;
    /**
     * Adds a page another page opened. It belongs where its opener does, to the
     * opener's group and on the opener's agent, whichever group is open now.
     */
    browserPopupAdd(
        url: string,
        groupId: HappyAgentGroupId,
        agentId: HappyAgentSessionId,
        networkId: HappyAgentBrowserNetworkId,
    ): void;
    /**
     * Binds a browser tab to the network its agent's Happy Agent named. A tab
     * is bound once; a tab already bound keeps its network.
     */
    browserNetworkBind(tabId: HappyAgentPanelTabId, networkId: HappyAgentBrowserNetworkId): void;
    /** Reconciles Chromium-owned location/title metadata into one browser tab. */
    browserUpdate(tabId: HappyAgentPanelTabId, update: HappyAgentBrowserUpdate): void;
    tabSelect(tabId: HappyAgentPanelTabId): void;
    /**
     * Moves one tab to the other strip. Nothing behind it is touched — the shell
     * keeps running, the page keeps its address — because the tab is not being
     * closed and reopened; it is being drawn somewhere else. A tab leaving the
     * panel gives up the panel's selection to whatever is still there, and a tab
     * arriving takes it, so neither strip is left pointing at a tab it no longer
     * draws.
     */
    tabPlacementUpdate(tabId: HappyAgentPanelTabId, placement: HappyAgentViewPlacement): void;
    /** Closes one tab, ending whatever it was running. The last tab takes the pane with it. */
    tabClose(tabId: HappyAgentPanelTabId): void;

    /**
     * The live store behind a terminal tab, for the view that renders it. It is
     * not part of the snapshot precisely so a terminal's output notifies only its
     * own subscriber.
     */
    terminal(tabId: HappyAgentPanelTabId): HappyAgentTerminalStore | undefined;
    /** The live store behind a chat tab, for the view that renders it. */
    chat(tabId: HappyAgentPanelTabId): HappyAgentPanelChatStore | undefined;

    /**
     * Applies what the workspace has open. This is authoritative input from the
     * panel's owner, not a user action: navigation decides it, and the panel
     * answers by showing that group's arrangement. The conversation comes along
     * because a terminal is a process inside a session, so starting one needs to
     * know which session asked for it.
     *
     * Tabs of other groups keep running, so moving between projects and coming
     * back finds the same terminals.
     */
    scopeApply(
        groupId: HappyAgentGroupId | undefined,
        conversationId: HappyAgentSessionId | undefined,
        terminalRefusal?: string,
    ): void;

    [Symbol.dispose](): void;
}

export interface HappyAgentPanelDeps {
    /** Opens one terminal in a session; the panel owns the returned lease. */
    readonly terminalOpen: (sessionId: HappyAgentSessionId) => HappyAgentTerminalHandle;
    /** Reads one conversation for a chat tab; the panel owns the returned lease. */
    readonly chatOpen?: (agentId: HappyAgentSessionId) => HappyAgentPanelChatHandle;
    /**
     * How one group's arrangement survives the window. Both are optional so the
     * same store works standalone in a blueprint and in tests, where nothing is
     * remembered and nothing needs to be.
     */
    readonly memoryRead?: (groupId: HappyAgentGroupId) => HappyAgentPanelMemory | undefined;
    readonly memoryWrite?: (groupId: HappyAgentGroupId, memory: HappyAgentPanelMemory) => void;
    /** Which floaties were opened by hand, read once and written on every change. */
    readonly floatyMemoryRead?: () => readonly string[];
    readonly floatyMemoryWrite?: (keys: readonly string[]) => void;
}

interface Tab {
    readonly id: HappyAgentPanelTabId;
    readonly kind: HappyAgentPanelTabKind;
    label: string;
    readonly groupId: HappyAgentGroupId;
    readonly agentId?: HappyAgentSessionId;
    networkId?: HappyAgentBrowserNetworkId;
    readonly terminal?: HappyAgentTerminalHandle;
    readonly chat?: HappyAgentPanelChatHandle;
    title?: string;
    url?: string;
    readonly artifactId?: HappyAgentArtifactId;
    readonly version?: number;
    placement: HappyAgentViewPlacement;
}

const NO_TABS: readonly HappyAgentPanelTabSnapshot[] = [];
const NO_RECENT: readonly HappyAgentBrowserRecent[] = [];
/** How many visited pages a group's new tab offers. */
const BROWSER_RECENT_LIMIT = 8;

/**
 * Whether a rebuilt tab says exactly what the one already in the snapshot says.
 * A tab that has not changed keeps its object, so a strip re-renders only the
 * tab that actually moved, was renamed, or went somewhere.
 */
function tabSame(
    before: HappyAgentPanelTabSnapshot | undefined,
    next: HappyAgentPanelTabSnapshot,
): before is HappyAgentPanelTabSnapshot {
    if (
        before === undefined ||
        before.id !== next.id ||
        before.label !== next.label ||
        before.placement !== next.placement
    )
        return false;
    if (before.kind === "browser")
        return (
            next.kind === "browser" &&
            before.url === next.url &&
            before.workspaceId === next.workspaceId &&
            before.agentId === next.agentId &&
            before.networkId === next.networkId
        );
    if (before.kind === "artifact")
        return (
            next.kind === "artifact" &&
            before.artifactId === next.artifactId &&
            before.version === next.version
        );
    if (before.kind === "chat") return next.kind === "chat" && before.agentId === next.agentId;
    return next.kind === "terminal";
}

/**
 * The workspace's right-hand panel. It belongs to the project or worktree the
 * reader has open, not to the session they happen to be reading inside it: a
 * terminal runs in the checkout, the files it lists are the checkout's, and a
 * page opened out of one of them is still the same page after the reader moves
 * to the next session in that project. Switching session tabs therefore leaves
 * the panel exactly as it was, while moving to another project shows that
 * project's own arrangement.
 *
 * That arrangement outlives the window: it is read back from the group's memory
 * the first time the group is addressed, so a reopened app finds the panel where
 * it was left. Terminals are the exception and are deliberately not restored —
 * they are live processes, and there is nothing left to reattach to.
 */
export function happyAgentPanelStoreCreate(deps: HappyAgentPanelDeps): HappyAgentPanelStore {
    const listeners = new Set<() => void>();
    const tabs: Tab[] = [];
    /** Which live tool tab each group had selected, so returning to it lands there. */
    const activeByGroup = new Map<HappyAgentGroupId, HappyAgentPanelTabId>();
    /** Whether each group's panel was showing, and how wide, when it was left. */
    const chromeByGroup = new Map<HappyAgentGroupId, { open: boolean }>();
    /** Groups whose remembered arrangement has already been read back in this run. */
    const restoredGroupIds = new Set<HappyAgentGroupId>();
    const recentByGroup = new Map<HappyAgentGroupId, readonly HappyAgentBrowserRecent[]>();
    let groupId: HappyAgentGroupId | undefined;
    let conversationId: HappyAgentSessionId | undefined;
    /** Why a shell cannot be started in the current scope; supplied by the owner. */
    let terminalRefusal: string | undefined;
    let open = false;
    let activeViewId: HappyAgentPanelSnapshot["activeViewId"] = "files";
    let activityViewShown = false;
    let activityViewDismissed = false;
    let usageViewShown = false;
    let devicesViewShown = false;
    let previewEntryId: string | undefined;
    let previewMediaIndex: number | undefined;
    let previewConversationId: HappyAgentSessionId | undefined;
    let changeViewPath: string | undefined;
    let changeConversationId: HappyAgentSessionId | undefined;
    let fileViewShown = false;
    let filesViewShown = true;
    let floatyOpened: ReadonlySet<string> = new Set(deps.floatyMemoryRead?.() ?? []);
    let floatyHistoryExpanded = false;
    let artifactView: HappyAgentPanelArtifactView | undefined;
    /** A group whose Files tab is shown when it is next addressed. */
    let filesArrivalGroupId: HappyAgentGroupId | undefined;
    let nextTabNumber = 1;
    let disposed = false;
    let snapshot: HappyAgentPanelSnapshot = {
        activeViewId: "files",
        activityViewDismissed: false,
        activityViewOpen: false,
        usageViewOpen: false,
        devicesViewOpen: false,
        fileViewOpen: false,
        filesViewOpen: true,
        browserRecent: NO_RECENT,
        floatyOpened,
        floatyHistoryExpanded: false,
        open: false,
        tabs: NO_TABS,
        browserTabs: [],
    };

    const project = (): HappyAgentPanelSnapshot => {
        const visible = tabs.filter((tab) => tab.groupId === groupId);
        return {
            activeViewId,
            activityViewDismissed,
            activityViewOpen: activityViewShown,
            usageViewOpen: usageViewShown,
            devicesViewOpen: devicesViewShown,
            fileViewOpen: fileViewShown,
            filesViewOpen: filesViewShown,
            browserRecent: (groupId && recentByGroup.get(groupId)) || NO_RECENT,
            floatyOpened,
            floatyHistoryExpanded,
            ...(artifactView === undefined ? {} : { artifactView }),
            open,
            browserTabs: tabs.flatMap((tab) =>
                tab.kind === "browser" && tab.agentId !== undefined
                    ? [
                          {
                              id: tab.id,
                              label: tab.label,
                              placement: tab.placement,
                              kind: "browser" as const,
                              url: tab.url ?? "about:blank",
                              workspaceId: tab.groupId,
                              agentId: tab.agentId,
                              ...(tab.networkId === undefined ? {} : { networkId: tab.networkId }),
                          },
                      ]
                    : [],
            ),
            tabs: visible.flatMap((tab): HappyAgentPanelTabSnapshot[] => {
                const base = { id: tab.id, label: tab.label, placement: tab.placement };
                if (tab.kind === "browser")
                    return tab.agentId === undefined
                        ? []
                        : [
                              {
                                  ...base,
                                  kind: tab.kind,
                                  url: tab.url ?? "about:blank",
                                  workspaceId: tab.groupId,
                                  agentId: tab.agentId,
                                  ...(tab.networkId === undefined
                                      ? {}
                                      : { networkId: tab.networkId }),
                              },
                          ];
                if (tab.kind === "chat" && tab.agentId !== undefined)
                    return [{ ...base, kind: tab.kind, agentId: tab.agentId }];
                if (tab.kind === "artifact" && tab.artifactId !== undefined)
                    return [
                        {
                            ...base,
                            kind: tab.kind,
                            artifactId: tab.artifactId,
                            ...(tab.version === undefined ? {} : { version: tab.version }),
                        },
                    ];
                return [{ ...base, kind: "terminal" }];
            }),
            ...(previewEntryId === undefined ? {} : { previewEntryId }),
            ...(previewMediaIndex === undefined ? {} : { previewMediaIndex }),
            ...(changeViewPath === undefined ? {} : { changeViewPath }),
            ...(terminalRefusal === undefined ? {} : { terminalRefusal }),
        };
    };

    const recompute = (): void => {
        const next = project();
        // The count is part of what makes two strips the same strip. Comparing
        // only tab for tab would call a strip unchanged whenever the tabs that
        // remain still match position for position, which is exactly what
        // closing the last tab looks like — and the closed one would then be
        // kept, drawn forever, and answer nothing.
        const tabsSame =
            next.tabs.length === snapshot.tabs.length &&
            next.tabs.every((tab, index) => tabSame(snapshot.tabs[index], tab));
        const browsersSame =
            next.browserTabs.length === snapshot.browserTabs.length &&
            next.browserTabs.every((tab, index) => tabSame(snapshot.browserTabs[index], tab));
        if (
            next.open === snapshot.open &&
            next.activeViewId === snapshot.activeViewId &&
            next.activityViewDismissed === snapshot.activityViewDismissed &&
            next.activityViewOpen === snapshot.activityViewOpen &&
            next.usageViewOpen === snapshot.usageViewOpen &&
            next.devicesViewOpen === snapshot.devicesViewOpen &&
            next.previewEntryId === snapshot.previewEntryId &&
            next.previewMediaIndex === snapshot.previewMediaIndex &&
            next.changeViewPath === snapshot.changeViewPath &&
            next.fileViewOpen === snapshot.fileViewOpen &&
            next.filesViewOpen === snapshot.filesViewOpen &&
            next.browserRecent === snapshot.browserRecent &&
            next.floatyOpened === snapshot.floatyOpened &&
            next.floatyHistoryExpanded === snapshot.floatyHistoryExpanded &&
            next.artifactView === snapshot.artifactView &&
            next.terminalRefusal === snapshot.terminalRefusal &&
            tabsSame &&
            browsersSame
        )
            return;
        // Unchanged rows keep their identity so a tab strip re-renders only the
        // tab that actually changed.
        const projectedTabs = tabsSame
            ? snapshot.tabs
            : next.tabs.map((tab, index) => {
                  const before = snapshot.tabs[index];
                  return before !== undefined && tabSame(before, tab) ? before : tab;
              });
        snapshot = {
            activeViewId: next.activeViewId,
            activityViewDismissed: next.activityViewDismissed,
            activityViewOpen: next.activityViewOpen,
            usageViewOpen: next.usageViewOpen,
            devicesViewOpen: next.devicesViewOpen,
            fileViewOpen: next.fileViewOpen,
            filesViewOpen: next.filesViewOpen,
            browserRecent: next.browserRecent,
            floatyOpened: next.floatyOpened,
            floatyHistoryExpanded: next.floatyHistoryExpanded,
            ...(next.artifactView === undefined ? {} : { artifactView: next.artifactView }),
            open: next.open,
            tabs: projectedTabs,
            browserTabs: browsersSame
                ? snapshot.browserTabs
                : next.browserTabs.map((tab) => {
                      const before = snapshot.browserTabs.find((item) => item.id === tab.id);
                      return before && tabSame(before, tab) ? before : tab;
                  }),
            ...(next.previewEntryId === undefined ? {} : { previewEntryId: next.previewEntryId }),
            ...(next.previewMediaIndex === undefined
                ? {}
                : { previewMediaIndex: next.previewMediaIndex }),
            ...(next.changeViewPath === undefined ? {} : { changeViewPath: next.changeViewPath }),
            ...(next.terminalRefusal === undefined
                ? {}
                : { terminalRefusal: next.terminalRefusal }),
        };
        for (const listener of listeners) listener();
    };

    /**
     * Writes the addressed group's arrangement down. Everything restorable is
     * derived from the tabs themselves, so there is no second copy of the panel
     * to keep in step with this one.
     */
    const remember = (group = groupId): void => {
        if (!group || !deps.memoryWrite) return;
        const addressed = group === groupId;
        // A page not yet bound to a network has loaded nothing, so it is not
        // written down; it could only come back on a network named later.
        const browsers = tabs.flatMap((tab) =>
            tab.groupId === group &&
            tab.kind === "browser" &&
            tab.agentId !== undefined &&
            tab.networkId !== undefined
                ? [{ tab, agentId: tab.agentId, networkId: tab.networkId }]
                : [],
        );
        const selected = addressed ? activeViewId : activeByGroup.get(group);
        const activeIndex = browsers.findIndex(({ tab }) => tab.id === selected);
        deps.memoryWrite(group, {
            open: addressed ? open : (chromeByGroup.get(group)?.open ?? false),
            browsers: browsers.map(({ tab, agentId, networkId }) => ({
                url: tab.url ?? "about:blank",
                label: tab.label,
                agentId,
                networkId,
                placement: tab.placement,
            })),
            active: activeIndex >= 0 ? { type: "browser", index: activeIndex } : { type: "files" },
            ...(recentByGroup.get(group)?.length ? { recent: recentByGroup.get(group) } : {}),
        });
    };

    const terminalTabAdd = (group: HappyAgentGroupId, session: HappyAgentSessionId): void => {
        const id = `tab_${nextTabNumber}` as HappyAgentPanelTabId;
        // Terminals are numbered across the workspace rather than per group so a
        // label never silently means two different shells.
        const label = `Terminal ${nextTabNumber}`;
        nextTabNumber += 1;
        tabs.push({
            id,
            kind: "terminal",
            label,
            groupId: group,
            placement: "panel",
            terminal: deps.terminalOpen(session),
        });
        activeByGroup.set(group, id);
        activeViewId = id;
    };

    const browserTabAdd = (
        group: HappyAgentGroupId,
        agent: HappyAgentSessionId,
        network: HappyAgentBrowserNetworkId | undefined,
        candidate?: string,
        label?: string,
    ): boolean => {
        const url = candidate === undefined ? "about:blank" : browserUrl(candidate);
        if (!url) return false;
        const id = `tab_${nextTabNumber}` as HappyAgentPanelTabId;
        nextTabNumber += 1;
        tabs.push({
            id,
            kind: "browser",
            label: label ?? browserLabel(url),
            groupId: group,
            agentId: agent,
            ...(network === undefined ? {} : { networkId: network }),
            placement: "panel",
            url,
        });
        activeByGroup.set(group, id);
        activeViewId = id;
        return true;
    };

    /**
     * Reads one group's remembered arrangement back, once, the first time it is
     * addressed. Its pages return where they were left; its terminals do not,
     * because the processes behind them ended with the previous run.
     */
    const groupRestore = (group: HappyAgentGroupId): void => {
        if (restoredGroupIds.has(group)) return;
        restoredGroupIds.add(group);
        const memory = deps.memoryRead?.(group);
        if (!memory) return;
        if (memory.recent?.length) recentByGroup.set(group, memory.recent);
        for (const browser of memory.browsers) {
            browserTabAdd(group, browser.agentId, browser.networkId, browser.url, browser.label);
            // A page left in the main content comes back to the main content.
            // Where it was being read is part of how the group was arranged.
            const added = tabs.at(-1);
            if (added && browser.placement) added.placement = browser.placement;
        }
        const restored = tabs.filter((tab) => tab.groupId === group && tab.kind === "browser");
        const remembered =
            memory.active.type === "browser" ? restored[memory.active.index] : undefined;
        // Only a tab the panel is actually drawing can be the panel's selection.
        const active = remembered?.placement === "panel" ? remembered.id : undefined;
        if (active) activeByGroup.set(group, active);
        else activeByGroup.delete(group);
        chromeByGroup.set(group, { open: memory.open });
    };

    /**
     * Shows the open group's tab that `matches`, or adds the one `create`
     * makes, and selects it in an open panel. A tab of this kind reads
     * something else beside the conversation, so it stays in the panel.
     */
    const readerTabShow = (
        matches: (tab: Tab) => boolean,
        create: (id: HappyAgentPanelTabId, group: HappyAgentGroupId) => Tab,
    ): void => {
        if (!groupId) return;
        let tab = tabs.find((candidate) => candidate.groupId === groupId && matches(candidate));
        if (!tab) {
            tab = create(`tab_${nextTabNumber}` as HappyAgentPanelTabId, groupId);
            nextTabNumber += 1;
            tabs.push(tab);
        }
        tab.placement = "panel";
        activeByGroup.set(groupId, tab.id);
        activeViewId = tab.id;
        open = true;
        remember();
        recompute();
    };

    /** The tab the panel falls back to in this group, if it still draws one. */
    const panelSibling = (group: HappyAgentGroupId): Tab | undefined =>
        tabs.find((tab) => tab.groupId === group && tab.placement === "panel");

    /**
     * Where the addressed panel lands once the view in front is gone: Files,
     * else the next view the strip still draws. With nothing left the pane
     * closes, and Files is back for the next time it opens.
     */
    const landing = (): void => {
        if (filesViewShown) {
            activeViewId = "files";
            return;
        }
        const sibling = groupId ? panelSibling(groupId) : undefined;
        const next: HappyAgentPanelSnapshot["activeViewId"] | undefined = fileViewShown
            ? "file"
            : artifactView
              ? "artifact"
              : previewEntryId !== undefined
                ? "preview"
                : changeViewPath !== undefined
                  ? "change"
                  : sibling?.id;
        if (next !== undefined) {
            if (sibling && next === sibling.id && groupId) activeByGroup.set(groupId, sibling.id);
            activeViewId = next;
            return;
        }
        filesViewShown = true;
        activeViewId = "files";
        open = false;
    };

    /** Puts a page a group's browser committed at the front of its recent pages. */
    const recentRemember = (group: HappyAgentGroupId, url: string, label: string): void => {
        const before = recentByGroup.get(group) ?? NO_RECENT;
        if (before[0]?.url === url && before[0].label === label) return;
        recentByGroup.set(
            group,
            [{ url, label }, ...before.filter((entry) => entry.url !== url)].slice(
                0,
                BROWSER_RECENT_LIMIT,
            ),
        );
    };

    const tabDispose = (index: number): void => {
        const [removed] = tabs.splice(index, 1);
        removed?.terminal?.[Symbol.dispose]();
        removed?.chat?.[Symbol.dispose]();
        if (!removed) return;
        if (activeByGroup.get(removed.groupId) !== removed.id) return;
        const sibling = panelSibling(removed.groupId);
        if (sibling) {
            activeByGroup.set(removed.groupId, sibling.id);
            activeViewId = sibling.id;
        } else {
            activeByGroup.delete(removed.groupId);
            if (removed.groupId === groupId) landing();
            else activeViewId = "files";
        }
    };

    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },

        panelToggle() {
            if (disposed) return;
            open = !open;
            if (open && !filesViewShown && activeViewId === "files") landing();
            remember();
            recompute();
        },
        filesSelect() {
            if (disposed) return;
            filesViewShown = true;
            activeViewId = "files";
            open = true;
            remember();
            recompute();
        },
        filesClose() {
            if (disposed) return;
            filesViewShown = false;
            if (activeViewId === "files") landing();
            remember();
            recompute();
        },
        artifactsSelect() {
            if (disposed) return;
            activeViewId = "artifacts";
            open = true;
            remember();
            recompute();
        },
        activitySelect() {
            if (disposed || !conversationId) return;
            activityViewShown = true;
            activityViewDismissed = false;
            activeViewId = "activity";
            open = true;
            remember();
            recompute();
        },
        activityHide() {
            if (disposed || !conversationId) return;
            if (!activityViewShown && activeViewId !== "activity") return;
            activityViewShown = false;
            if (activeViewId === "activity") {
                if (usageViewShown) activeViewId = "usage";
                else landing();
            }
            remember();
            recompute();
        },
        activityClose() {
            if (disposed || !conversationId || (!activityViewShown && activityViewDismissed))
                return;
            activityViewShown = false;
            activityViewDismissed = true;
            if (activeViewId === "activity") {
                if (usageViewShown) activeViewId = "usage";
                else landing();
            }
            remember();
            recompute();
        },
        usageSelect() {
            if (disposed || !conversationId) return;
            usageViewShown = true;
            activeViewId = "usage";
            open = true;
            remember();
            recompute();
        },
        usageClose() {
            if (disposed || !conversationId || !usageViewShown) return;
            usageViewShown = false;
            if (activeViewId === "usage") {
                if (activityViewShown) activeViewId = "activity";
                else landing();
            }
            remember();
            recompute();
        },
        devicesSelect() {
            if (disposed || !groupId) return;
            devicesViewShown = true;
            activeViewId = "devices";
            open = true;
            remember();
            recompute();
        },
        devicesClose() {
            if (disposed || !devicesViewShown) return;
            devicesViewShown = false;
            if (activeViewId === "devices") landing();
            remember();
            recompute();
        },
        previewOpen(entryId, mediaIndex) {
            if (disposed || !conversationId) return;
            previewEntryId = entryId;
            previewMediaIndex = mediaIndex;
            previewConversationId = conversationId;
            activeViewId = "preview";
            open = true;
            remember();
            recompute();
        },
        previewClose() {
            if (disposed) return;
            previewEntryId = undefined;
            previewMediaIndex = undefined;
            previewConversationId = undefined;
            if (activeViewId === "preview") landing();
            remember();
            recompute();
        },
        changeViewOpen(path) {
            if (disposed || !conversationId) return;
            changeViewPath = path;
            changeConversationId = conversationId;
            activeViewId = "change";
            open = true;
            remember();
            recompute();
        },
        changeViewClose() {
            if (disposed) return;
            changeViewPath = undefined;
            changeConversationId = undefined;
            if (activeViewId === "change") landing();
            remember();
            recompute();
        },
        fileViewOpen() {
            if (disposed) return;
            fileViewShown = true;
            activeViewId = "file";
            open = true;
            remember();
            recompute();
        },
        fileViewClose() {
            if (disposed) return;
            fileViewShown = false;
            if (activeViewId === "file") landing();
            remember();
            recompute();
        },
        floatyOpenedUpdate(key, opened) {
            if (disposed || floatyOpened.has(key) === opened) return;
            const next = new Set(floatyOpened);
            if (opened) next.add(key);
            else next.delete(key);
            floatyOpened = next;
            deps.floatyMemoryWrite?.([...next]);
            recompute();
        },
        floatyHistoryExpandedUpdate(next) {
            if (disposed) return;
            floatyHistoryExpanded = next;
            recompute();
        },
        artifactViewOpen(artifactId, version) {
            if (disposed) return;
            if (artifactView?.artifactId !== artifactId || artifactView.version !== version)
                artifactView = version === undefined ? { artifactId } : { artifactId, version };
            activeViewId = "artifact";
            open = true;
            remember();
            recompute();
        },
        artifactViewClose() {
            if (disposed) return;
            artifactView = undefined;
            if (activeViewId === "artifact") landing();
            remember();
            recompute();
        },
        artifactViewDetach(version) {
            if (disposed || !groupId || artifactView === undefined) return undefined;
            const id = `tab_${nextTabNumber}` as HappyAgentPanelTabId;
            nextTabNumber += 1;
            tabs.push({
                id,
                kind: "artifact",
                // The owner names it by the artifact's live title.
                label: "Artifact",
                groupId,
                placement: "main",
                artifactId: artifactView.artifactId,
                ...(version === undefined ? {} : { version }),
            });
            artifactView = undefined;
            if (activeViewId === "artifact") activeViewId = "files";
            remember();
            recompute();
            return id;
        },
        artifactTabAttach(tabId, version) {
            if (disposed) return;
            const index = tabs.findIndex(
                (candidate) => candidate.id === tabId && candidate.kind === "artifact",
            );
            const tab = tabs[index];
            if (!tab?.artifactId) return;
            tabs.splice(index, 1);
            artifactView =
                version === undefined
                    ? { artifactId: tab.artifactId }
                    : { artifactId: tab.artifactId, version };
            activeViewId = "artifact";
            open = true;
            remember();
            recompute();
        },
        terminalAdd(replacing) {
            if (disposed || !groupId || !conversationId || terminalRefusal !== undefined) return;
            terminalTabAdd(groupId, conversationId);
            const replaced = tabs.findIndex(
                (tab) => tab.id === replacing && tab.kind === "browser" && tab.groupId === groupId,
            );
            if (replaced >= 0) tabs.splice(replaced, 1, tabs.pop()!);
            open = true;
            remember();
            recompute();
        },
        browserAdd(url) {
            if (disposed || !groupId || !conversationId) return;
            if (!browserTabAdd(groupId, conversationId, undefined, url)) return;
            open = true;
            remember();
            recompute();
        },
        browserPopupAdd(url, group, agent, network) {
            if (disposed) return;
            if (group === groupId) {
                if (!browserTabAdd(group, agent, network, url)) return;
                open = true;
                remember();
                recompute();
                return;
            }
            // Read the group's own pages back first, so writing this one down
            // does not replace what that group remembered.
            const selected = activeViewId;
            groupRestore(group);
            const added = browserTabAdd(group, agent, network, url);
            activeViewId = selected;
            if (!added) return;
            chromeByGroup.set(group, { open: true });
            remember(group);
        },
        browserNetworkBind(tabId, network) {
            if (disposed) return;
            const tab = tabs.find(
                (candidate) => candidate.id === tabId && candidate.kind === "browser",
            );
            if (!tab || tab.networkId !== undefined) return;
            tab.networkId = network;
            remember(tab.groupId);
            recompute();
        },
        browserUpdate(tabId, update) {
            if (disposed) return;
            const tab = tabs.find(
                (candidate) => candidate.id === tabId && candidate.kind === "browser",
            );
            if (!tab) return;
            const nextUrl = update.url === undefined ? undefined : browserUrl(update.url);
            if (nextUrl && nextUrl !== tab.url) {
                tab.url = nextUrl;
                tab.title = undefined;
            }
            if (update.title !== undefined) tab.title = update.title.trim() || undefined;
            tab.label = tab.title ? tab.title.slice(0, 80) : browserLabel(tab.url ?? "about:blank");
            if (tab.url !== undefined && tab.url !== "about:blank")
                recentRemember(tab.groupId, tab.url, tab.label);
            remember(tab.groupId);
            recompute();
        },
        tabSelect(tabId) {
            if (disposed) return;
            const tab = tabs.find((candidate) => candidate.id === tabId);
            if (!tab) return;
            activeByGroup.set(tab.groupId, tab.id);
            activeViewId = tab.id;
            remember();
            recompute();
        },
        tabClose(tabId) {
            if (disposed) return;
            const index = tabs.findIndex((candidate) => candidate.id === tabId);
            if (index < 0) return;
            const closedGroupId = tabs[index]!.groupId;
            tabDispose(index);
            remember(closedGroupId);
            recompute();
        },
        tabPlacementUpdate(tabId, placement) {
            if (disposed) return;
            const tab = tabs.find((candidate) => candidate.id === tabId);
            // An artifact has no tool tab in the panel: it goes back into the
            // artifact tab, through `artifactTabAttach`.
            if (
                !tab ||
                tab.placement === placement ||
                tab.kind === "artifact" ||
                tab.kind === "chat"
            )
                return;
            tab.placement = placement;
            if (placement === "panel") {
                // Arriving is being looked at: the reader moved this tab here,
                // so the panel shows it and opens if it was folded away.
                activeByGroup.set(tab.groupId, tab.id);
                activeViewId = tab.id;
                open = true;
            } else if (activeByGroup.get(tab.groupId) === tab.id) {
                // Leaving hands the panel's selection back to whatever the panel
                // still draws, and to Files when it draws nothing.
                const sibling = panelSibling(tab.groupId);
                if (sibling) {
                    activeByGroup.set(tab.groupId, sibling.id);
                    activeViewId = sibling.id;
                } else {
                    activeByGroup.delete(tab.groupId);
                    landing();
                }
            }
            remember();
            recompute();
        },

        terminal: (tabId) => tabs.find((tab) => tab.id === tabId)?.terminal,
        chat: (tabId) => tabs.find((tab) => tab.id === tabId)?.chat,

        chatTabOpen(agentId, label) {
            if (disposed || !groupId || !deps.chatOpen) return;
            readerTabShow(
                (tab) => tab.kind === "chat" && tab.agentId === agentId,
                (id, group) => ({
                    id,
                    kind: "chat",
                    label,
                    groupId: group,
                    agentId,
                    placement: "panel",
                    chat: deps.chatOpen!(agentId),
                }),
            );
        },
        filesSelectOnArrival(group) {
            if (disposed) return;
            if (group !== groupId) {
                filesArrivalGroupId = group;
                return;
            }
            activeViewId = "files";
            open = true;
            remember();
            recompute();
        },

        scopeApply(nextGroupId, nextConversationId, nextTerminalRefusal) {
            if (disposed) return;
            terminalRefusal = nextTerminalRefusal;
            const conversationChanged = conversationId !== nextConversationId;
            conversationId = nextConversationId;
            if (conversationChanged) {
                activityViewShown = false;
                activityViewDismissed = false;
                usageViewShown = false;
                if (activeViewId === "activity" || activeViewId === "usage") activeViewId = "files";
            }
            if (previewConversationId !== nextConversationId) {
                previewEntryId = undefined;
                previewMediaIndex = undefined;
                previewConversationId = undefined;
            }
            // A conversation's changes are its own, so its change tab stays behind.
            if (changeConversationId !== nextConversationId) {
                changeViewPath = undefined;
                changeConversationId = undefined;
                if (activeViewId === "change") activeViewId = "files";
            }
            if (nextGroupId === groupId) {
                recompute();
                return;
            }
            if (groupId) chromeByGroup.set(groupId, { open });
            groupId = nextGroupId;
            // A file was opened out of one checkout, and a path only means
            // something inside that checkout, so it does not travel to the next
            // project.
            activityViewShown = false;
            activityViewDismissed = false;
            usageViewShown = false;
            devicesViewShown = false;
            fileViewShown = false;
            filesViewShown = true;
            artifactView = undefined;
            if (nextGroupId) groupRestore(nextGroupId);
            const chrome = nextGroupId ? chromeByGroup.get(nextGroupId) : undefined;
            open = chrome?.open ?? false;
            const remembered =
                nextGroupId === undefined ? undefined : activeByGroup.get(nextGroupId);
            const drawn = tabs.find(
                (tab) => tab.id === remembered && tab.placement === "panel",
            )?.id;
            activeViewId = drawn ?? "files";
            if (nextGroupId !== undefined && filesArrivalGroupId === nextGroupId) {
                activeViewId = "files";
                open = true;
                remember();
            }
            filesArrivalGroupId = undefined;
            recompute();
        },

        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            for (const tab of tabs.splice(0)) {
                tab.terminal?.[Symbol.dispose]();
                tab.chat?.[Symbol.dispose]();
            }
            recompute();
            activeByGroup.clear();
            chromeByGroup.clear();
            listeners.clear();
        },
    };
}

/** Accepts only ordinary web locations plus the inert new-tab document we mint ourselves. */
function browserUrl(candidate: string): string | undefined {
    if (candidate === "about:blank") return candidate;
    try {
        const parsed = new URL(candidate);
        return parsed.protocol === "http:" || parsed.protocol === "https:"
            ? parsed.href
            : undefined;
    } catch {
        return undefined;
    }
}

function browserLabel(url: string): string {
    if (url === "about:blank") return "New tab";
    try {
        return new URL(url).hostname.replace(/^www\./u, "") || "Browser";
    } catch {
        return "Browser";
    }
}
