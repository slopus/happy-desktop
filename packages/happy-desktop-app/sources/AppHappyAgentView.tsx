import { useCallback, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import type { HappyAgentSystemMonitorStore } from "happy-desktop-state";
import { HappyAgentSystemMonitorSurfacePage, type InlinePageFit } from "happy-desktop-ui";
import {
    conversationFileChanges,
    conversationFileDiff,
    conversationNotesFold,
    gptLiveStoreNoop,
    happyAgentBotSubtasks,
    happyAgentClockStoreCreate,
    happyAgentSidebarTree,
    happyAgentTabsOrdered,
    happyAgentTodoHeading,
    type ConversationFileDiff,
    type ConversationNote,
    type GptLiveVoiceFocus,
    type HappyAgentSidebarProject,
} from "happy-desktop-state";
import { AppGptLivePhone } from "./gptLive/AppGptLivePhone";
import {
    componentSitesStoreNoop,
    conversationInlinePagesCreate,
    inlineArtifactsStoreNoop,
} from "./conversationInlinePages";
import {
    ARTIFACT_READING,
    artifactTitlesStoreNoop,
    messageReferenceEntities,
    messageReferenceSurfaceNames,
    messageReferencesCreate,
    type MessageReferenceEntities,
    type MessageReferenceSurfaces,
} from "./messageReferences";
import type {
    AppearanceStore,
    CommandPaletteStore,
    HappyAgentArtifactCatalogStore,
    HappyAgentArtifactChatContext,
    HappyAgentArtifactId,
    HappyAgentArtifactPlaces,
    HappyAgentArtifacts,
    HappyAgentArtifactTitlesSnapshot,
    HappyAgentArtifactTitlesStore,
    HappyAgentArtifactViewerStore,
    ConversationEntry,
    ComposerSource,
    ExperimentsStore,
    GptLiveStore,
    ConversationToolCall,
    HappyAgentClockStore,
    HappyAgentToolMediaDocumentStore,
    HappyAgentCloudStore,
    HappyAgentTeamsStore,
    HappyAgentFileLineRange,
    HappyAgentFileTabKind,
    HappyAgentFileTabSnapshot,
    HappyAgentConnectionStore,
    HappyAgentDebugLogStore,
    HappyAgentConversationSnapshot,
    HappyAgentDeviceBridgesStore,
    HappyAgentDeviceBridgeSupportStore,
    HappyAgentFileLayout,
    HappyAgentWorkspaceFiles,
    HappyAgentCommentDraft,
    HappyAgentCommentId,
    HappyAgentFileComment,
    HappyAgentFileScope,
    HappyAgentFileSearch,
    HappyAgentFileViewMode,
    HappyAgentReview,
    HappyAgentHost,
    HappyAgentIntegrationStore,
    HappyAgentGroupId,
    HappyAgentMenusSnapshot,
    HappyAgentModelStore,
    HappyAgentModelSelection,
    HappyAgentNavigationOrderStore,
    HappyAgentSidebarCollapseStore,
    HappyAgentSidebarSearchStore,
    HappyAgentSidebarVisibilityStore,
    HappyAgentAttentionSnapshot,
    HappyAgentAttentionStore,
    HappyAgentBotAttention,
    HappyAgentPanelArtifactView,
    HappyAgentPanelSnapshot,
    HappyAgentRecentTabMemory,
    HappyAgentProjectAddSnapshot,
    HappyAgentPanelStore,
    HappyAgentPanelTabId,
    HappyAgentPanelTabSnapshot,
    HappyAgentBrowserNetworkId,
    HappyAgentPanelChatStore,
    HappyAgentPermissionMode,
    HappyAgentProfileStore,
    HappyAgentInboxItem,
    HappyAgentInboxSnapshot,
    HappyAgentInboxStore,
    HappyAgentInstructionsStore,
    HappyAgentSecurityPolicyStore,
    HappyAgentSecretsStore,
    HappyAgentAvailabilitySnapshot,
    HappyAgentProviderUsageStore,
    HappyAgentProvidersStore,
    HappyAgentSessionLocation,
    HappyAgentVoiceSettingsStore,
    HappyAgentBot,
    HappyAgentBotCreating,
    HappyAgentBotSubtask,
    HappyAgentSubtaskRoot,
    HappyAgentTask,
    HappyAgentTaskId,
    HappyAgentBotId,
    HappyAgentSpace,
    SidebarDocumentClassic,
    ProjectsVisibilityStore,
    ProjectsVisibilitySnapshot,
    StemCellAnimationStore,
    HappyAgentGroupLifecycle,
    HappyAgentChangeTier,
    HappyAgentChangeTierId,
    HappyAgentChangeTiersSnapshot,
    HappyAgentChangeTiersStore,
    HappyAgentProjectGroup,
    HappyAgentWorktreeGroup,
    HappyAgentProjectId,
    HappyAgentServiceTier,
    HappyAgentSessionCreateInput,
    HappyAgentSessionId,
    HappyAgentSessionSummary,
    ScrollbarVisibility,
    ThemeMode,
    SubagentSummary,
    HappyAgentTerminalStore,
    HappyAgentThinkingLevel,
    TitleShimmerStore,
    HappyAgentWindowStore,
    HappyAgentWorkspaceSnapshot,
    HappyAgentWorkspaceStore,
    HappyAgentWorkingWait,
    HappyAgentWorktreeId,
    HappyAgentLinkOpenPlacement,
    HappyAgentSettingsStore,
    KeepAwakeMode,
    KeepAwakeStore,
    StatusBarStore,
} from "happy-desktop-state";
import {
    HAPPY_AGENT_FILE_LINK_READ_ONLY_REFUSAL,
    HAPPY_AGENT_PANEL_FILE_VIEW_ID,
    agentAuthor,
    happyAgentChangeTiersAssign,
    happyAgentArtifactAuthorLabel,
    happyAgentArtifactCatalogStoreNoop,
    type HappyAgentArtifactCatalogSnapshot,
    happyAgentArtifactChatContext,
    happyAgentSurfaceCatalogStoreNoop,
    happyAgentSurfaceSupportStoreNone,
    calendarTimeZones,
    happyAgentSurfaceReferenceFind,
    happyAgentSurfaceChatSupported,
    type HappyAgentSurfaceReference,
    happyAgentArtifactNames,
    happyAgentArtifactSourceLabel,
    commandPaletteStoreNoop,
    experimentsStoreNoop,
    happyAgentStemCellsSettingsStoreNoop,
    happyAgentStoriesSettingsStoreNoop,
    projectsVisibilityStoreNoop,
    projectsVisibilityConnection,
    stemCellAnimationStoreNoop,
    happyAgentVersionAtLeast,
    HAPPY_AGENT_TASKS_VERSION,
    HAPPY_AGENT_TASK_CREATE_VERSION,
    happyAgentInboxStoreNoop,
    happyAgentNavigationOrderApply,
    happyAgentAvailabilityProject,
    happyAgentNavigationOrderStoreNoop,
    happyAgentSidebarCollapseStoreNoop,
    happyAgentSidebarSearchStoreNoop,
    happyAgentSidebarVisibilityStoreNoop,
    happyAgentAttentionStoreNoop,
    happyAgentBotAttention,
    happyAgentHumanMessageAuthor,
    happyAgentSessionGroupIdOf,
    happyAgentOwnerAuthor,
    happyAgentWindowStoreNoop,
    happyAgentSettingsStoreCreate,
    keepAwakeStoreCreate,
    statusBarStoreNoop,
    titleShimmerStoreNoop,
    type HappyAgentConversationSource,
    type HappyAgentSurface,
    type HappyAgentSurfaceCatalogSnapshot,
    type HappyAgentSurfaceCatalogStore,
    type HappyAgentSurfaceChatActivity,
    type HappyAgentSurfaceCreateKind,
    type HappyAgentSurfaceSupportSnapshot,
    type HappyAgentSurfaceId,
    type HappyAgentSurfaces,
    type HappyAgentSpacesStore,
    type HappyAgentStemCell,
    type HappyAgentTodoListStore,
    type HappyAgentSurfaceMessagesStore,
    type HappyAgentSurfaceDocumentStore,
    type HappyAgentCalendarStore,
} from "happy-desktop-state";
import {
    type AgentWaitStatus,
    AppShell,
    APP_SHELL_PANEL_DEFAULT_WIDTH,
    type AppShellFocusedPane,
    Banner,
    BrowserPanel,
    DevBuildMenu,
    type BrowserContentRenderer,
    type BrowserPanelProps,
    type BrowserStartTool,
    HtmlPreviewFrame,
    type HtmlPreviewRenderer,
    type LivePerformanceStore,
    type MediaWindowOpener,
    Button,
    CommandPalette,
    CommandPaletteResults,
    type CommandPaletteResultsRow,
    type CommandPaletteResultsSection,
    commandPaletteResultsRows,
    ContextMeter,
    ChangedFileDiff,
    FileChangeDiff,
    CodeEditor,
    ComposerFooterBar,
    ComposerModelControl,
    type ComposerModelUsageWatch,
    ConversationDock,
    type ConversationDockProps,
    type ConversationLeadingHeader,
    type ConversationSwitchTarget,
    ConversationView,
    DeferredPane,
    EmptyState,
    FileBrowser,
    FileEditor,
    FilePreview,
    FormRow,
    type FilePreviewKind,
    filePreviewKind,
    Lightbox,
    MarkdownDocument,
    Modal,
    ModalOverlay,
    ReviewStream,
    HappyAgentActivityControl,
    HappyAgentActivityPanel,
    fileTreeBuild,
    fileTreeExpanded,
    fileTreeFlatten,
    fileTreeRanked,
    filePathMatches,
    fileNameCompare,
    type FileLinkOpenHandler,
    type FileOpenHandler,
    type LinkOpenHandler,
    type LinkOpenPlacement,
    type FileTreeExpansion,
    type FileTreeBuildEntry,
    HappyAgentCreateBotPage,
    HappyAgentCreateTaskPage,
    HappyAgentProjectCloneDialog,
    HappyAgentTaskBrowseDialog,
    HappyAgentSurfaceCreateDialog,
    HappyAgentSurfaceUnsupportedPage,
    HappyAgentSurfaceNotMadePage,
    HappyAgentSurfaceReferencePage,
    type HappyAgentSurfaceReferenceView,
    HappyAgentSurfaceChatPanel,
    type HappyAgentSurfaceChatToggle,
    type HappyAgentSurfaceWidthToggle,
    HappyAgentTodoSurfacePage,
    HappyAgentMessagesSurfacePage,
    HappyAgentDocumentSurfacePage,
    HappyAgentCalendarSurfacePage,
    type HappyAgentDocumentSurfaceContent,
    type DocumentEditorUser,
    surfaceTypeIcon,
    type HappyAgentSurfaceMemberView,
    type HappyAgentSurfaceView,
    HappyAgentProjectSettingsDialog,
    HappyAgentSessionControls,
    type HappyAgentUserInputAnswerMap,
    HappyAgentUsagePanel,
    HappyAgentDevicesPanel,
    QuickActionsCard,
    type QuickActionsCardItem,
    SegmentedControl,
    Sidebar,
    SidebarFooter,
    SidebarAgentUpdate,
    SidebarUpdateAction,
    Switch,
    HappyAgentInboxPage,
    HappyAgentArtifactsPage,
    HappyAgentArtifactsPanel,
    HappyAgentArtifactViewer,
    type HappyAgentArtifactLabels,
    type HappyAgentArtifactSourceChoice,
    TabbedPane,
    TextField,
    TerminalPanel,
    ToolCallPreview,
    TransferZone,
    RetainedViews,
    type TabTransferTarget,
    WindowDragRegion,
    happyAgentComposerModelControlProps,
    happyAgentComposerModelUsageWatch,
    sidebarReorderMove,
    type IconName,
    type MakeStuffOption,
    type MenuItem,
    type FileTreeNode,
    type KeyboardShortcut,
    type SidebarItem,
    type SidebarNumberShortcutTarget,
    type SidebarReorder,
    type SidebarSection,
    type TabItem,
    WindowShortcuts,
    WorkspaceLifecycleLane,
    WorkspaceLifecycleNotice,
    workspaceLifecycleNoticeLines,
    WorkFloaty,
    type WorkFloatyRow,
    WorkTabControls,
    type WorkspaceLifecyclePhase,
} from "happy-desktop-ui";
import { APP_SHORTCUTS } from "./appShortcuts";
import {
    happyAgentSpacesStoreNoop,
    type HappyAgentSidebarProposalsStore,
} from "happy-desktop-state";
import { HappyAgentSidebarProposal } from "./components/HappyAgentSidebarProposal";
import {
    HappyAgentStoriesRow,
    HappyAgentStoriesScreens,
    HappyAgentStoryInline,
} from "./components/HappyAgentStories";
import {
    happyAgentSpaceFocused,
    happyAgentSpaceHappyIs,
    happyAgentSpaceDestination,
    happyAgentSpaceLabel,
    happyAgentSpaceMark,
    happyAgentSpacesNotes,
    happyAgentSessionMark,
    happyAgentSpacesChildDestination,
    happyAgentSpacesIntroHeader,
    HappyAgentSpacesSidebar,
    type HappyAgentSpacesNavigation,
    type HappyAgentSpacesPlaces,
} from "./components/HappyAgentSpacesSidebar";
import { HappyAgentVersionProvider } from "./HappyAgentVersionProvider";
import {
    COMMAND_PALETTE_PREVIEW_LIMIT,
    commandPaletteIndexMove,
    commandPaletteResults,
    commandPaletteRowAt,
    commandPaletteQuickActionRows,
    type CommandPaletteCommand,
    type CommandPaletteContext,
    type CommandPaletteGlyph,
    type CommandPaletteRow,
    type CommandPaletteSpace,
    type CommandPaletteSettingRow,
    type CommandPaletteTab,
} from "./commandPaletteResults";
import { openExternalLink } from "./externalLink";
import { fileDownload } from "./fileDownload";
import { imageCopy } from "./imageCopy";
import { reactFrameInputUpdate, reactFrameSubscribe } from "./reactFrameSubscribe";
import { useDisposableLease } from "./useDisposableLease";
import {
    fileSizeFormat,
    HappyAgentToolMediaPreview,
    type HappyAgentPreviewMedia,
} from "./views/HappyAgentToolMediaPreview";
import { BlueprintView } from "./views/BlueprintView";
import type {
    AppHappyAgentDaemonSnapshot,
    AppHappyAgentDaemonStore,
} from "./views/AppHappyAgentSettingsView";
import type {
    AppHappyAgentReleaseNotesStore,
    AppHappyAgentUpdateSnapshot,
    AppHappyAgentUpdateStore,
} from "./agentUpdate";
import { agentUpdateCardView, type AgentUpdateCatalog } from "./agentUpdateCardView";

const sidebarDaemonUnavailable: AppHappyAgentDaemonSnapshot = {
    install: { phase: "idle" },
    managed: false,
    operation: "idle",
    runtime: "stopped",
    updateAvailable: false,
    versions: [],
};

/** Stands in wherever no machine-local agent is managed, such as a browser. */
const sidebarDaemonStoreNoop: AppHappyAgentDaemonStore = {
    daemonCheck: () => undefined,
    daemonInstall: () => undefined,
    daemonInstallDismiss: () => undefined,
    daemonInstallKill: () => undefined,
    daemonRestart: () => undefined,
    daemonUpgrade: () => undefined,
    daemonVersionSelect: () => undefined,
    get: () => sidebarDaemonUnavailable,
    subscribe: () => () => undefined,
};

/** Stands in wherever no update of a machine-local agent can be under way. */
/**
 * What the composer says while the Happy Agent is draining or restarting. The
 * draft stays editable underneath and nothing is sent until it is back.
 */
const AGENT_RESTARTING_NOTICE = [
    "Agent is restarting and can't accept new messages.",
    "You can keep editing your draft.",
] as const;

const agentUpdateStoreNoop: AppHappyAgentUpdateStore = {
    cardToggle: () => undefined,
    chiefOfStaffAsk: () => undefined,
    get: () => undefined,
    restartNow: () => undefined,
    subscribe: () => () => undefined,
    updateRetry: () => undefined,
};

const agentReleaseNotesStoreNoop: AppHappyAgentReleaseNotesStore = {
    get: () => undefined,
    subscribe: () => () => undefined,
};

/**
 * The clock an update's elapsed time is read against. It ticks only while a
 * running update's card is subscribed to it.
 */
const agentUpdateClock = happyAgentClockStoreCreate();
const AGENT_UPDATE_CLOCK_STOPPED = (): undefined => undefined;

/**
 * The footer's update slot while an update runs. Its own component so the
 * elapsed time ticking once a second redraws only the card, not the window.
 */
function AgentUpdateSidebar(props: {
    readonly snapshot: AppHappyAgentUpdateSnapshot;
    readonly store: AppHappyAgentUpdateStore;
    readonly catalog: AgentUpdateCatalog;
    readonly onConversationOpen: (groupId: string, sessionId: string) => void;
}) {
    const { snapshot, store } = props;
    const progress = snapshot.progress;
    const ticking =
        progress.kind !== "done" && progress.kind !== "failed" && progress.startedAt !== undefined;
    const now = useSyncExternalStore(
        ticking ? agentUpdateClock.subscribe : SUBSCRIBE_NONE,
        ticking ? agentUpdateClock.get : AGENT_UPDATE_CLOCK_STOPPED,
        ticking ? agentUpdateClock.get : AGENT_UPDATE_CLOCK_STOPPED,
    );
    return (
        <SidebarAgentUpdate
            chiefOfStaffPending={snapshot.chiefOfStaff === "pending"}
            expanded={snapshot.expanded}
            hidden={!snapshot.revealed}
            onCollapse={store.cardToggle}
            onToggle={store.cardToggle}
            view={agentUpdateCardView(progress, props.catalog, props.onConversationOpen, now)}
            {...(progress.kind === "draining" && progress.restartNow !== "unavailable"
                ? {
                      onRestartNow: store.restartNow,
                      restartNowPending: progress.restartNow === "pending",
                  }
                : {})}
            {...(progress.kind === "failed"
                ? {
                      ...(progress.retryable ? { onRetry: store.updateRetry } : {}),
                      ...(snapshot.chiefOfStaff === "unavailable"
                          ? {}
                          : { onChiefOfStaffAsk: store.chiefOfStaffAsk }),
                  }
                : {})}
        />
    );
}

/**
 * What the sidebar has to say about the agent, if anything.
 *
 * Only a downloaded version waiting to be installed gets a footer action.
 * Download status stays in Settings, and an agent managed outside Happy takes
 * no space here.
 */
function agentUpdateOffer(daemon: AppHappyAgentDaemonSnapshot):
    | {
          readonly status: "downloaded";
          readonly version: string;
      }
    | undefined {
    if (!daemon.managed || daemon.install.phase !== "idle") return undefined;
    if (daemon.readyVersion !== undefined)
        return { status: "downloaded", version: daemon.readyVersion };
    return undefined;
}

export interface AppHappyAgentUpdate {
    readonly action: "refresh" | "restart";
    readonly detail?: string;
    readonly status: "available" | "downloading" | "downloaded";
    readonly version?: string;
}

/** One Happy Agent this window can address, with its own catalog and surface stores. */
export interface AppHappyAgentEntry {
    readonly id: string;
    /** Host-published connection identity; absent only for the host itself. */
    readonly remoteId?: string;
    readonly label: string;
    readonly status: "connecting" | "connected" | "disconnected" | "error";
    readonly message?: string;
    readonly version?: string;
    readonly projects: readonly HappyAgentProjectGroup[];
    /**
     * This Happy Agent's bots. They are listed under a heading of their own
     * above its projects and are not projects: a bot offers no
     * new-conversation control and no settings, because it is one permanent
     * conversation with nothing to configure.
     */
    readonly bots: readonly HappyAgentBot[];
    /**
     * Bots this window has asked this Happy Agent for that it has not listed
     * yet. Each stands under the Bots heading as a row being made, the way a
     * worktree does while its checkout is prepared, so asking for a bot shows
     * at once rather than when the host answers. Absent on a host that does
     * not report them, which reads as none.
     */
    readonly botsCreating?: readonly HappyAgentBotCreating[];
    readonly projectsStatus: "loading" | "ready" | "error";
    /**
     * Where adding a folder to this Happy Agent as a project stands. Absent on a host
     * that does not report it, which reads as nothing being added — the same way
     * a host with no live stores supplies no `session`.
     */
    readonly projectAdd?: HappyAgentProjectAddSnapshot;
    /**
     * Bot subtasks whose archive or move the host refused, by the task's
     * conversation. The reason is stated under the Bots heading for as long as
     * the task is still listed. Absent reads as none.
     */
    readonly subtaskFailures?: ReadonlyMap<
        string,
        { readonly action: "archive" | "reorder"; readonly error: { readonly message: string } }
    >;
    /**
     * The tasks the reader has joined on this Happy Agent, in the reader's own
     * order. They are listed under a heading of their own below the bots, and a
     * task's row is a bot's row worn by its owner's face. Absent reads as none.
     */
    readonly tasks?: readonly HappyAgentTask[];
    /**
     * Task acts the host refused — a join, leave, move, archive, or rename —
     * by task. The reason is stated under the Tasks heading. Absent reads as none.
     */
    readonly taskFailures?: ReadonlyMap<
        string,
        {
            readonly action: "join" | "leave" | "reorder" | "archive" | "unarchive" | "rename";
            readonly error: { readonly message: string };
        }
    >;
    /** The live stores for this Happy Agent, present once its connection is up. */
    readonly session?: AppHappyAgentSession;
    /** Authenticated setup is available before protected product stores load. */
    readonly setup?: AppHappyAgentSetup;
}

export interface AppHappyAgentSetup {
    readonly welcome: import("happy-desktop-state").WelcomeStore;
    readonly onboarding: import("happy-desktop-state").HappyAgentOnboardingStore;
    readonly profile: HappyAgentProfileStore;
    /** Counts pairing codes down during setup, before the session's stores load. */
    readonly clock: HappyAgentClockStore;
    readonly retry: () => void;
}

export interface AppHappyAgentSession {
    readonly welcome?: import("happy-desktop-state").WelcomeStore;
    readonly onboarding?: import("happy-desktop-state").HappyAgentOnboardingStore;
    readonly clock: HappyAgentClockStore;
    readonly connection: HappyAgentConnectionStore;
    /** This Happy Agent installation's WorkOS account. */
    readonly cloud?: () => HappyAgentCloudStore;
    /** WorkOS organizations, available on agents with the Teams API. */
    readonly teams?: () => HappyAgentTeamsStore;
    /** This Happy Agent's retained connection, reconciliation, and SSE diagnostics. */
    readonly debugLog?: HappyAgentDebugLogStore;
    readonly host: HappyAgentHost;
    /** This Happy Agent's own model catalog, read by the settings window's pickers. */
    readonly models: HappyAgentModelStore;
    /** This Happy Agent installation's live Happy Mobile integration. */
    readonly happyIntegration?: () => HappyAgentIntegrationStore;
    /** Phones paired directly with this Happy Agent, and the pairing that adds one. */
    readonly mobileConnector?: () => import("happy-desktop-state").HappyAgentMobileConnectorStore;
    readonly workspace: HappyAgentWorkspaceStore;
    /**
     * Every question this Happy Agent's agents are waiting on. Absent when the machine
     * offers no question feed, which is why the inbox row is absent too rather
     * than opening onto an empty queue that means nothing.
     */
    readonly inbox?: HappyAgentInboxStore;
    /**
     * How much of each provider account's plan this machine has spent, read by
     * the Usage settings category. Absent when the machine reports no usage,
     * which leaves that category saying so rather than listing accounts that
     * mean nothing.
     */
    readonly providerUsage?: HappyAgentProviderUsageStore;
    /** The identity this Happy Agent authors work as, as its profile settings edit it. */
    readonly profile?: () => HappyAgentProfileStore | undefined;
    /**
     * Which model providers this machine will use, as the Providers settings
     * category reads and switches them. Absent on a host that cannot change the
     * machine's configuration, which leaves that category saying so.
     */
    readonly providers?: HappyAgentProvidersStore;
    /** The voice controller and prompt this machine's calls start with, as Voice settings edit them. */
    readonly voiceSettings?: HappyAgentVoiceSettingsStore;
    /** This connection's authenticated person's task membership preference. */
    readonly taskSettings?: () => import("happy-desktop-state").HappyAgentTaskSettingsStore;
    /** This connection's authenticated person's Surface membership preference. */
    readonly surfaceSettings?: () => import("happy-desktop-state").HappyAgentSurfaceSettingsStore;
    readonly stemCellsSettings?: () => import("happy-desktop-state").HappyAgentStemCellsSettingsStore;
    /** Stories on this connection: its setting, the row, stickers and the editor. */
    readonly stories?: () => import("happy-desktop-state").HappyAgentStories;
    /** This Happy Agent's machine-wide instructions, as the settings window edits them. */
    readonly instructions?: HappyAgentInstructionsStore;
    /** This Happy Agent's machine-wide permission-review policy. */
    readonly securityPolicy?: HappyAgentSecurityPolicyStore;
    /** This Happy Agent's global write-only environment bundles. */
    readonly secrets?: () => HappyAgentSecretsStore;
    /**
     * What this Happy Agent's agents and people have published. A Happy Agent
     * that keeps none reports so through its catalog, and every surface that
     * would show artifacts stays away.
     */
    readonly artifacts?: HappyAgentArtifacts;
    /**
     * This Happy Agent's shared Surfaces, such as todo lists. A Happy Agent
     * without them says so through its catalog, and the sidebar offers none.
     */
    readonly surfaces?: HappyAgentSurfaces;
    /** The spaces sidebar, on a Happy Agent new enough to keep one. */
    readonly spaces?: HappyAgentSpacesStore;
    /** The sidebar proposals Prioritizing's chat shows inline. */
    readonly sidebarProposals?: HappyAgentSidebarProposalsStore;
}

export interface AppHappyAgentDirectorySnapshot {
    /**
     * The Happy Agent this window is addressing, as `happyAgentActivate` last recorded it. It
     * is the synchronous authority on which machine is on screen, for the
     * decisions that cannot be taken at render time — whether an agent's
     * contribution may still be performed when someone presses it. A host that
     * records no addressed Happy Agent supplies nothing here, and such a press is inert
     * rather than aimed at a guess.
     */
    readonly activeHappyAgentId?: string;
    readonly happyAgents: readonly AppHappyAgentEntry[];
}

/** The Happy Agents this window can address. */
export interface AppHappyAgentDirectoryStore {
    get(): AppHappyAgentDirectorySnapshot;
    subscribe(listener: () => void): () => void;
    /**
     * Records which Happy Agent the window is addressing. The URL decides it; the store
     * is told so that window-level events with no Happy Agent of their own — a URL handed
     * to the app to open — land in the workspace on screen.
     */
    happyAgentActivate(id: string): void;
}

/**
 * What a development window calls itself: the worktree or branch it was built
 * from, and the checkout worth copying out of it. A packaged Happy supplies
 * none — the product has one identity and does not have to announce it.
 */
export interface AppBuildIdentity {
    readonly branch: string;
    readonly label: string;
    readonly path: string;
}

export interface AppHappyAgentViewProps {
    /** The host Happy Agent this window is an interface onto, and what it currently holds. */
    happyAgents: AppHappyAgentDirectoryStore;
    /**
     * This build's development identity, shown in the sidebar footer menu.
     * Absent in the packaged product, where there is nothing to tell apart.
     */
    buildIdentity?: AppBuildIdentity;
    /** Live renderer diagnostics, supplied only by an explicitly debug-launched desktop window. */
    performance?: LivePerformanceStore;
    /** Which Happy Agent the URL addresses; its projects and sessions fill the window. */
    happyAgentId: string;
    /** Theme selection behind the status bar's theme menu. */
    appearance: AppearanceStore;
    /** Which optional controls the status bar shows; the defaults when absent. */
    statusBar?: StatusBarStore;
    /**
     * The window's own preferences, read here for where a clicked link goes
     * and for the palette's settings rows. A host that keeps none supplies
     * none, and the product defaults stand.
     */
    settings?: HappyAgentSettingsStore;
    /**
     * Whether this computer is held out of sleep, behind the footer's
     * keep-awake control. A host that cannot hold the machine awake supplies
     * none, and the footer shows no control rather than one wired to nothing.
     */
    keepAwake?: KeepAwakeStore;
    /**
     * Where this surface is running. In the Electron shell the window has no
     * native title bar, so the shell owns the traffic-light inset and the drag
     * lanes and the sidebar heading gives its space up to them; the browser
     * development mode keeps the ordinary branded heading.
     */
    platform?: "desktop" | "web";
    /**
     * The window's own chrome. Entering macOS full screen takes the traffic
     * lights away, so the lane reserved for them closes with them and the sidebar
     * toggle returns to the window's left edge. The browser shell supplies no
     * such store and stays windowed.
     */
    windowState?: HappyAgentWindowStore;
    /**
     * Where this window remembers the order the reader arranged its pinned rows
     * in. A host that keeps no such record supplies none, and the rows stay in
     * the order the window offers them rather than being arrangeable into an
     * order the next launch would forget.
     */
    navigationOrder?: HappyAgentNavigationOrderStore;
    /**
     * Where this window remembers which projects and folders the reader folded
     * shut. A host that keeps no such record supplies none, and every row stays
     * open rather than offering a fold the next launch would forget.
     */
    sidebarCollapse?: HappyAgentSidebarCollapseStore;
    /**
     * What the sidebar's search field holds. While it holds anything the
     * sidebar lists what matches in place of its usual contents; a host that
     * keeps no search supplies none and the sidebar offers no field.
     */
    sidebarSearch?: HappyAgentSidebarSearchStore;
    /**
     * Which bots the reader muted or hid, per connection. A host that keeps no
     * such record supplies none, and the bot rows offer neither.
     */
    attention?: HappyAgentAttentionStore;
    /**
     * Whether this window's left side — the sidebar and the connection rail
     * beside it — is folded away. It belongs to the window, so every
     * connection reads and writes the same fold. A host that supplies none
     * leaves the fold to this view alone.
     */
    sidebarVisibility?: HappyAgentSidebarVisibilityStore;
    /**
     * Whether this window offers the features that are not finished yet. A host
     * that remembers no such choice supplies none, and they stay withheld.
     */
    experiments?: ExperimentsStore;
    /**
     * Whether the sidebar leaves every Projects section out. A host that
     * remembers no such choice supplies none, and the projects stay listed.
     */
    projectsVisibility?: ProjectsVisibilityStore;
    /**
     * Whether new work's stem cell grows into its icon when the icon arrives.
     * A host that remembers no such choice supplies none, and it does.
     */
    stemCellAnimation?: StemCellAnimationStore;
    gptLive?: GptLiveStore;
    /**
     * Whether running session, project, and workspace titles shimmer. A host
     * without this preference uses the current product default.
     */
    titleShimmer?: TitleShimmerStore;
    /**
     * What the command palette is showing and asking. A host that supplies none
     * has no palette, and Command-K does nothing rather than opening a surface
     * whose query nothing is keeping.
     */
    commandPalette?: CommandPaletteStore;
    /** Native or hosted-renderer update projected by the desktop host. */
    update?: AppHappyAgentUpdate;
    /** Applies the ready update. Absent in a plain browser surface. */
    onUpdateApply?: () => void;
    /**
     * The machine-local Happy Agent, supplied only by the native desktop shell.
     * The sidebar reads it to offer a downloaded agent update; a browser surface
     * manages no agent and is given none.
     */
    daemon?: AppHappyAgentDaemonStore;
    /**
     * The local Happy Agent update in progress, supplied with `daemon`. While it
     * runs, the footer shows its card instead of the update offer.
     */
    agentUpdate?: AppHappyAgentUpdateStore;
    /** Compact notes for the local Happy Agent update on offer. */
    agentReleaseNotes?: AppHappyAgentReleaseNotesStore;
    /** Native page renderer supplied only by the packaged Electron host. */
    browserContent?: BrowserContentRenderer;
    /**
     * Renders one HTML workspace file as a page. Supplied only by a host with an
     * engine to run it in; without one an HTML file opens as its source.
     */
    htmlPreview?: HtmlPreviewRenderer;
    /**
     * Shows an HTML artifact served as a site of its own. Supplied only by a host
     * with an isolated guest for it; without one an HTML artifact is a static
     * preview.
     */
    artifactPage?: HtmlPreviewRenderer;
    /**
     * Shows one workspace picture or recording in a window of the host's own.
     * Supplied only by a host that has such a window; without one the file stays
     * in place.
     */
    mediaWindow?: MediaWindowOpener;
    /**
     * Opens one web address in the machine's own browser rather than in an
     * embedded tab. Supplied only by a host that can ask its shell to; without
     * one the address opens the way any link from this window does.
     */
    onExternalLinkOpen?(url: string): void;
    /**
     * The addressed group — a project or one of its worktrees — and conversation,
     * read from the route by the caller. This surface never decides what is
     * shown; it renders the addressed group's sessions and asks for a different
     * address through `onChatSelect`.
     */
    groupId?: string;
    chatId?: string;
    /**
     * Addresses a Happy Agent, a group in it, and optionally one of that group's
     * sessions; no group means that Happy Agent's list.
     */
    onChatSelect(
        happyAgentId: string,
        groupId: string | undefined,
        chatId?: string,
        replace?: boolean,
    ): void;
    /** Removes an archived session's dead destinations from Back/Forward history. */
    onChatClose?(
        happyAgentId: string,
        groupId: string,
        chatId: string,
        fallbackChatId?: string,
    ): boolean;
    /**
     * Removes every history visit inside a group the reader closed, such as new
     * work from Create. A reader standing in it goes back to where they were
     * before it. Absent in a host with no navigation stack.
     */
    onGroupClose?(happyAgentId: string, groupId: string): void;
    /** Removes every history visit to a file tab that the reader closed. */
    onFileClose(happyAgentId: string, groupId: string, path: string): void;
    /**
     * Addresses a file tab over the session currently visible in its workspace.
     * An absent chat is the empty-workspace form of the same destination.
     */
    onFileSelect(
        happyAgentId: string,
        groupId: string,
        chatId: string | undefined,
        path: string,
        kind: HappyAgentFileTabKind,
        replace?: boolean,
    ): void;
    /** Opens the local settings destination from the pinned sidebar footer. */
    onSettingsOpen(): void;
    /**
     * Opens one settings category by id, as the palette's settings rows name
     * them. Absent in a host whose settings surface has no sections of its own.
     */
    onSettingsSectionOpen?(section: string): void;
    /** Whether the URL addresses the naming surface for a new bot. */
    botCreateOpen?: boolean;
    /** Addresses that surface on one machine. Absent in a host with nowhere to put it. */
    onBotCreateOpen?(happyAgentId: string): void;
    /** Whether the URL addresses the surface for a new task. */
    taskCreateOpen?: boolean;
    /** Addresses that surface on one machine. Absent in a host with nowhere to put it. */
    onTaskCreateOpen?(happyAgentId: string): void;
    /** Whether the URL addresses the addressed Happy Agent's inbox of agent questions. */
    inboxOpen?: boolean;
    /** Addresses that inbox. */
    onInboxOpen?(): void;
    /** Whether the URL addresses the addressed Happy Agent's artifacts. */
    artifactsOpen?: boolean;
    /** The artifact the URL opens in the viewer, within those artifacts. */
    artifactId?: string;
    /** Addresses the addressed Happy Agent's artifacts. */
    onArtifactsOpen?(): void;
    /** Addresses one artifact on one Happy Agent. */
    onArtifactOpen?(happyAgentId: string, artifactId: string): void;
    /** Leaves the open artifact for wherever it was opened from. */
    onArtifactClose?(happyAgentId: string): void;
    /** The shared Surface the URL opens, on the addressed Happy Agent. */
    surfaceId?: string;
    /** Addresses one Surface on one Happy Agent. */
    onSurfaceOpen?(happyAgentId: string, surfaceId: string): void;
    /** The open Surface's shared chat, when the URL opens it beside the Surface. */
    surfaceChat?: { readonly groupId: string; readonly chatId: string };
    /**
     * Shows the Surface's shared chat beside it, at the conversation it is, or
     * hides it. Ignored once the reader has left that Surface, since the chat
     * is found in the background.
     */
    onSurfaceChatShow?(
        happyAgentId: string,
        surfaceId: string,
        chat: { readonly groupId: string; readonly chatId: string } | undefined,
    ): void;
    /** Whether the URL addresses the enrolled account's friends surface. */
    /** Addresses that friends surface. */
    /** Whether the URL addresses the component workbench, in a development build. */
    blueprintOpen?: boolean;
    /** Addresses the workbench. */
    onBlueprintOpen?(): void;
}

/**
 * What the tab strip needs about the addressed group, flattened so a project and
 * a worktree open the same way. `create` is what a new session in it takes: the
 * project's root, or the worktree's checkout and its id.
 */
interface OpenGroup {
    readonly id: HappyAgentGroupId;
    /** Bots and subtasks expose one pinned chat, regardless of their shared checkout. */
    readonly singleConversationId?: string;
    readonly name: string;
    /**
     * The catch-all project for sessions started outside any repository. It is
     * addressed as a place rather than as a path, so the surface names it by its
     * house glyph and never spells its `~` out.
     */
    readonly home: boolean;
    readonly conversations: HappyAgentProjectGroup["conversations"];
    readonly changes: NonNullable<HappyAgentProjectGroup["changes"]>;
    readonly changesStatus?: HappyAgentProjectGroup["changesStatus"];
    readonly create?: HappyAgentSessionCreateInput;
    /**
     * Where the open group's checkout is in its own life, for a worktree. A
     * project has none: it is a directory Happy Agent adopted rather than one it made,
     * so there is no moment at which it is being prepared.
     */
    readonly lifecycle?: HappyAgentGroupLifecycle;
    /** The checkout's path, so a notice about it can name the directory. */
    readonly path: string;
}

/** What the window reads when the host supplies no settings store: the product defaults, unchanging. */
const settingsStoreNone = happyAgentSettingsStoreCreate();
/**
 * What the footer reads when the host supplies no keep-awake store: a choice of
 * `off` that never changes. The constructor opens nothing, so one shared
 * instance costs nothing and keeps the hook order the same either way.
 */
const keepAwakeStoreNone = keepAwakeStoreCreate({ mode: "off" });

/**
 * The rows one project contributes: the project itself, then a nested row per
 * worktree that has work in it. A row is the project's name and its picture,
 * both the daemon's — derived from the git remote — so a reader recognizes a
 * repository at a glance. Its path is deliberately not here: it is long enough
 * to crowd out the name it is supposed to disambiguate, and the heading over the
 * open project states it in full. The home project is the exception both ways:
 * it has no remote to derive a picture from, and an "H" plaque would read as one
 * more repository, so it wears a house instead.
 */
/**
 * One bot's row.
 *
 * It is deliberately barer than a project's. A project row carries a `+`
 * because a project is a place work is started in, and a settings control
 * because a project has a name and a path someone chose. A bot has neither: the
 * daemon made its one conversation with it and no second one can ever be added,
 * so the row is the bot's face, its name, and whatever that one conversation is
 * doing — and nothing else to press.
 *
 * The row is top level like a project; active interactive subtasks nest under it.
 *
 * It is a `project` row in the sidebar's own vocabulary, and that is not a
 * hedge: that kind is how the sidebar draws a place work runs inside — an
 * avatar in the leading lane, the name shimmering while something is running,
 * a spinner in the trailing cell, and the unread dot on the face rather than at
 * the far edge. A bot is exactly that place. The `agent` kind is for a row that
 * *is* a correspondent rather than a place holding one, and it reports itself
 * in words instead, which left a bot saying "working" beside a column of
 * projects that spin.
 */
function botSidebarItem(
    bot: HappyAgentBot,
    titleShimmerEnabled: boolean,
    muted: boolean,
): SidebarItem {
    return {
        id: bot.workspaceId,
        kind: "project",
        label: bot.name,
        labelShimmer: titleShimmerEnabled,
        initials: ownerInitials(bot.name),
        ...(bot.avatar ? { imageUrl: bot.avatar.url } : {}),
        ...sidebarActivity(bot.conversation.activity),
        ...(bot.conversation.unread ? { unread: true } : {}),
        ...(muted ? { muted: true } : {}),
    };
}

/**
 * A bot the host has been asked for and has not listed yet, as the row it is
 * about to become: the same id, name, and face, spinning in the accent colour
 * the way a worktree does while its checkout is prepared. Nothing is running
 * in it and nothing is unread, because there is nothing yet for either to be.
 */
function botCreatingSidebarItem(
    bot: HappyAgentBotCreating,
    titleShimmerEnabled: boolean,
): SidebarItem {
    return {
        id: bot.workspaceId,
        kind: "project",
        label: bot.name,
        labelShimmer: titleShimmerEnabled,
        initials: ownerInitials(bot.name),
        ...(bot.avatar ? { imageUrl: bot.avatar.url } : {}),
        lifecycle: "creating",
        lifecycleLabel: "creating",
    };
}

/** A task's face, as its row wears it: the owner's, or a glyph on a standalone machine. */
function taskFace(task: HappyAgentTask): Pick<SidebarItem, "icon" | "imageUrl" | "initials"> {
    const owner = task.owner;
    if (owner === null) return { icon: "tasks" };
    const initials =
        owner.name === undefined || ownerInitials(owner.name) === ""
            ? undefined
            : ownerInitials(owner.name);
    return {
        ...(owner.avatar ? { imageUrl: owner.avatar.url } : {}),
        ...(initials !== undefined
            ? { initials }
            : owner.avatar === undefined
              ? { icon: "tasks" }
              : {}),
    };
}

/** Up to two initials from a person's name, for an owner with no photo. */
function ownerInitials(name: string): string {
    return name
        .trim()
        .split(/\s+/u)
        .filter((word) => word.length > 0)
        .slice(0, 2)
        .map((word) => word.slice(0, 1).toUpperCase())
        .join("");
}

/**
 * A joined task as its row: a bot's row in every respect but the face, which
 * in a team is the owner's rather than the task's own — a task has none. The
 * owner's photo comes first, then their initials, and a task whose owner
 * nobody could identify wears the same generated mark a bot without a picture
 * does, hashed from the task's id so it survives every rename.
 *
 * On a standalone machine every task is the reader's own, so a face would say
 * nothing: the row wears the plain tasks glyph in the same tile, the way the
 * home project wears its house, and its name stays on the bots' column.
 *
 * The trailing control leaves the task. Leaving is the reader's own act on
 * their own list and loses nothing — the task carries on for everyone else and
 * can be joined again — so it is the row's default; archiving, which ends the
 * task for everybody, waits in the row's menu for the people allowed to.
 */
function taskSidebarItem(task: HappyAgentTask, titleShimmerEnabled: boolean): SidebarItem {
    return {
        id: task.workspaceId,
        kind: "project",
        label: task.name,
        labelShimmer: titleShimmerEnabled,
        ...taskFace(task),
        action: {
            icon: "close" as const,
            label: `Leave ${task.name}`,
            reveal: "hover" as const,
        },
        ...sidebarActivity(task.conversation.activity),
        ...(task.conversation.unread ? { unread: true } : {}),
    };
}

/** One subtask anywhere in a tree, by its conversation. */
function subtaskFind(
    subtasks: readonly HappyAgentBotSubtask[],
    conversationId: string,
): HappyAgentBotSubtask | undefined {
    for (const subtask of subtasks) {
        if (subtask.conversation.id === conversationId) return subtask;
        const nested = subtaskFind(subtask.subtasks, conversationId);
        if (nested) return nested;
    }
    return undefined;
}

/** The task or bot a space opens, of one kind. */
function targetOfSpace(
    space: HappyAgentSpace,
    places: HappyAgentSpacesPlaces,
    kind: "task" | "bot",
): { readonly workspaceId: string } | undefined {
    if (space.target.kind !== kind) return undefined;
    const id = space.target.id;
    return kind === "task"
        ? places.tasks.find((task) => task.id === id)
        : places.bots.find((bot) => bot.id === id);
}

/** What the stem cell offers beside the Surfaces: naming a bot. */
const STEM_CELL_BOT = "bot";

/**
 * The worktrees one agent made, which no subtask works in: a subtask's own
 * worktree is already that subtask's row.
 */
function agentWorktreeSidebarItems(
    agentId: string,
    projects: readonly HappyAgentSidebarProject[],
    titleShimmerEnabled: boolean,
): SidebarItem[] {
    return projects.flatMap(({ project, worktrees }) =>
        worktrees
            .filter((worktree) => worktree.creatorAgentId === agentId)
            .map(
                (worktree): SidebarItem => ({
                    id: worktree.id,
                    kind: "workspace",
                    depth: 1,
                    label: worktree.name,
                    labelShimmer: titleShimmerEnabled,
                    // The project's own picture says whose checkout it is; a
                    // project without one falls back to the worktree glyph.
                    ...(project.avatar
                        ? {
                              contextAvatars: [
                                  {
                                      id: project.id,
                                      label: `Project: ${project.name}`,
                                      imageUrl: project.avatar.url,
                                  },
                              ],
                          }
                        : { icon: "branch" as const }),
                    ...sidebarLifecycle(worktree.lifecycle),
                    ...sidebarActivity(worktree.activity),
                    ...(worktree.conversations.some((conversation) => conversation.unread)
                        ? { unread: true }
                        : {}),
                    ...((worktree.addedLines ?? 0) > 0 || (worktree.deletedLines ?? 0) > 0
                        ? {
                              changeStats: {
                                  added: worktree.addedLines ?? 0,
                                  deleted: worktree.deletedLines ?? 0,
                              },
                          }
                        : {}),
                }),
            ),
    );
}

function botSubtaskSidebarItems(
    tasks: readonly HappyAgentBotSubtask[],
    projects: readonly HappyAgentProjectGroup[],
    titleShimmerEnabled: boolean,
    depth = 1,
): SidebarItem[] {
    return tasks.flatMap((task) => {
        const project = projects.find((candidate) =>
            candidate.worktrees.some((worktree) => worktree.id === task.workspaceId),
        );
        // A task working in a worktree of its own is that worktree's row: the
        // Projects section leaves the worktree out, so its delta and its phase
        // are said here. A task sharing its bot's folder has no checkout of its
        // own and so no delta to report.
        const worktree = project?.worktrees.find((entry) => entry.id === task.workspaceId);
        return [
            {
                id: task.conversation.id,
                kind: "workspace" as const,
                depth,
                label: task.conversation.title,
                labelShimmer: titleShimmerEnabled,
                ...(project
                    ? {
                          contextAvatars: [
                              {
                                  id: project.id,
                                  label: `Project: ${project.name}`,
                                  initials: project.name.slice(0, 1).toUpperCase(),
                                  ...(project.kind === "home" ? { icon: "home" as const } : {}),
                                  ...(project.avatar ? { imageUrl: project.avatar.url } : {}),
                              },
                          ],
                      }
                    : {}),
                ...(worktree ? sidebarLifecycle(worktree.lifecycle) : {}),
                ...sidebarActivity(task.conversation.activity),
                ...(task.conversation.unread ? { unread: true } : {}),
                ...((worktree?.addedLines ?? 0) > 0 || (worktree?.deletedLines ?? 0) > 0
                    ? {
                          changeStats: {
                              added: worktree?.addedLines ?? 0,
                              deleted: worktree?.deletedLines ?? 0,
                          },
                      }
                    : {}),
            },
            ...botSubtaskSidebarItems(task.subtasks, projects, titleShimmerEnabled, depth + 1),
        ];
    });
}

function sidebarItems(
    { project, worktrees }: HappyAgentSidebarProject,
    titleShimmerEnabled: boolean,
): SidebarItem[] {
    const projectHasLineChanges = (project.addedLines ?? 0) > 0 || (project.deletedLines ?? 0) > 0;
    // The shared sidebar tree already leaves out a worktree a bot's or task's
    // subtask works in: it is listed once, as that subtask under its root. The
    // project's own delta is its root checkout's and stays.
    return [
        {
            id: project.id,
            kind: "project",
            label: project.name,
            labelShimmer: titleShimmerEnabled,
            initials: project.name.slice(0, 1).toUpperCase(),
            ...(project.kind === "home" ? { icon: "home" as const } : {}),
            ...(project.avatar ? { imageUrl: project.avatar.url } : {}),
            // The + always waits for hover, so a project at rest ends with its
            // delta on the same column as every other row and nothing is
            // holding a place open for a control the reader is not reaching for.
            action: {
                disabled: project.lifecycle.phase !== "ready",
                icon: "plus" as const,
                label: `New workspace in ${project.name}`,
                reveal: "hover" as const,
            },
            ...sidebarLifecycle(project.lifecycle),
            // Settings waits for hover beside the +, both laid over the lane
            // rather than placed in it. The home project is left out — its name
            // and its path are the machine's, so there is nothing there for the
            // reader to set.
            ...(project.kind === "home"
                ? {}
                : {
                      secondaryAction: {
                          icon: "settings" as const,
                          label: `Settings for ${project.name}`,
                          reveal: "hover" as const,
                      },
                  }),
            // A row only carries a status while one of its sessions is live.
            // Waiting is the low-priority modifier: any session doing real work
            // makes the row spin, and only an all-waiting row wears the clock.
            ...sidebarActivity(project.activity),
            ...(project.conversations.some((conversation) => conversation.unread)
                ? { unread: true }
                : {}),
            ...(projectHasLineChanges
                ? {
                      changeStats: {
                          added: project.addedLines ?? 0,
                          deleted: project.deletedLines ?? 0,
                      },
                  }
                : {}),
        },
        ...worktrees.map((worktree) => ({
            id: worktree.id,
            kind: "workspace" as const,
            depth: 1,
            label: worktree.name,
            labelShimmer: titleShimmerEnabled,
            // Archiving throws away a checkout, so it stays out of sight until
            // the reader is actually on the row.
            action: {
                icon: "archive" as const,
                label: `Archive ${worktree.name}`,
                reveal: "hover" as const,
            },
            // A worktree whose checkout is still being made, could not be made,
            // or is no longer there says so on the row: the reader is looking at
            // a place they may be about to send work into.
            ...sidebarLifecycle(worktree.lifecycle),
            ...sidebarActivity(worktree.activity),
            ...(worktree.conversations.some((conversation) => conversation.unread)
                ? { unread: true }
                : {}),
            ...((worktree.addedLines ?? 0) > 0 || (worktree.deletedLines ?? 0) > 0
                ? {
                      changeStats: {
                          added: worktree.addedLines ?? 0,
                          deleted: worktree.deletedLines ?? 0,
                      },
                  }
                : {}),
        })),
    ];
}

/**
 * The status a row wears for what its sessions are doing. An open question
 * outranks everything and a scheduled wait is the low-priority modifier, both
 * already decided by the activity rollup; each maps to its own static mark so
 * neither claims, with a spinner, that work is happening.
 */
function sidebarActivity(
    activity: "running" | "awaitingInput" | "waiting" | "idle",
): Pick<SidebarItem, "status"> {
    if (activity === "awaitingInput") return { status: "awaitingInput" };
    if (activity === "running") return { status: "working" };
    if (activity === "waiting") return { status: "waiting" };
    return {};
}

/**
 * The row treatment one worktree phase asks for, as `SidebarItem` names them.
 *
 * A ready worktree contributes nothing: it is an ordinary row, and the row is
 * then free to report the work happening inside it. The other three replace that
 * report, because a place that does not exist yet has nothing running in it and
 * a place that has gone is not somewhere to send work.
 */
function sidebarLifecycle(
    lifecycle: HappyAgentGroupLifecycle,
): Pick<SidebarItem, "lifecycle" | "lifecycleLabel"> {
    if (lifecycle.phase === "creating")
        return { lifecycle: "creating", lifecycleLabel: "creating" };
    if (lifecycle.phase === "failed") return { lifecycle: "failed", lifecycleLabel: "failed" };
    if (lifecycle.phase === "missing")
        return { lifecycle: "unavailable", lifecycleLabel: "missing" };
    return {};
}

/**
 * The phase a screen showing this worktree has to interrupt the reader with.
 *
 * A ready worktree and a project both answer `undefined`: the place is simply
 * there, and a notice saying so would sit permanently over every screen in the
 * application. The notice's own type leaves `ready` out for the same reason.
 */
function workspaceLifecyclePhase(
    lifecycle: HappyAgentGroupLifecycle | undefined,
): WorkspaceLifecyclePhase | undefined {
    if (lifecycle === undefined || lifecycle.phase === "ready") return undefined;
    return lifecycle.phase;
}

/** The row action ids the sidebar's context menu dispatches back to this surface. */
const ROW_MENU_ARCHIVE = "archive";
/** Edits the existing sidebar label without changing the row's layout. */
const ROW_MENU_RENAME = "rename";
const ROW_MENU_SETTINGS = "settings";
/** Takes a task off the reader's own list; it carries on for everyone else. */
const ROW_MENU_LEAVE = "leave";
/** Mutes or unmutes a bot: its unread stops counting anywhere but its own row. */
const ROW_MENU_MUTE = "mute";
/** Takes a bot out of the sidebar; the Bots heading lists it to bring it back. */
const ROW_MENU_HIDE = "hide";
/** The Bots heading's menu of hidden bots: one row per bot, and one for all of them. */
const BOTS_MENU_SHOW_PREFIX = "show:";
const BOTS_MENU_SHOW_ALL = "show-all";
const ROW_MENU_SURFACE_ADD = "surface-add";
const ROW_MENU_SURFACE_REMOVE = "surface-remove";

/**
 * What a bot row offers about its own news. Both acts are this window's own
 * record rather than anything asked of the machine, so they are offered
 * whether or not the machine is answering.
 */
function botAttentionMenuItems(attention: HappyAgentBotAttention): MenuItem[] {
    return [
        {
            kind: "item",
            id: ROW_MENU_MUTE,
            label: attention === "muted" ? "Unmute bot" : "Mute bot",
            icon: "bell",
        },
        { kind: "item", id: ROW_MENU_HIDE, label: "Hide from sidebar", icon: "eye-off" },
    ];
}

/**
 * The context menu one sidebar row offers. Archiving is a menu action rather
 * than a visible control because it takes the row and its running work out of
 * the window. A bot keeps its dedicated folder for a later restore; archiving a
 * project closes its conversations and removes every one of its worktree
 * checkouts. The home project is left out — it is the machine's default place
 * rather than a repository the reader adopted, so hiding it would only bring it
 * straight back the next time a session starts there.
 */
function rowMenuItems(
    projects: readonly HappyAgentProjectGroup[],
    bots: readonly HappyAgentBot[],
    tasks: readonly HappyAgentTask[],
    item: SidebarItem,
    /** Whether the Happy Agent renames tasks; one from before that cannot. */
    taskRenamable: boolean,
    /**
     * What a bot's news does, for the bot row being asked about. Absent where
     * the window keeps no such record, and the row offers neither act.
     */
    botAttention: ((bot: HappyAgentBot) => HappyAgentBotAttention) | undefined,
): MenuItem[] {
    // A subtask's title is the daemon's to write, so archiving is all its row
    // offers. The task stops and leaves its bot; its history and its worktree
    // stay, and the worktree is listed under its project again.
    if (happyAgentBotSubtasks([...bots, ...tasks]).some((task) => task.conversation.id === item.id))
        return [
            {
                kind: "item",
                id: ROW_MENU_ARCHIVE,
                label: "Archive subtask",
                icon: "archive",
                danger: true,
            },
        ];
    // Leaving is a task's ordinary way off the list and is always offered.
    // Archiving ends it for every member, so it is offered only to the people
    // the host says may do that — its owner and the team's owner.
    const task = tasks.find((entry) => entry.workspaceId === item.id);
    if (task)
        return [
            ...(taskRenamable
                ? ([
                      { kind: "item", id: ROW_MENU_RENAME, label: "Rename task", icon: "edit" },
                  ] as const)
                : []),
            { kind: "item", id: ROW_MENU_LEAVE, label: "Leave task", icon: "close" },
            ...(task.canArchive
                ? ([
                      { kind: "separator" },
                      {
                          kind: "item",
                          id: ROW_MENU_ARCHIVE,
                          label: "Archive task",
                          icon: "archive",
                          danger: true,
                      },
                  ] as const)
                : []),
        ];
    const bot = bots.find((candidate) => candidate.workspaceId === item.id);
    if (bot)
        return [
            { kind: "item", id: ROW_MENU_RENAME, label: "Rename bot", icon: "edit" },
            { kind: "separator" },
            ...(botAttention
                ? [...botAttentionMenuItems(botAttention(bot)), { kind: "separator" } as const]
                : []),
            {
                kind: "item",
                id: ROW_MENU_ARCHIVE,
                label: "Archive bot",
                icon: "archive",
                danger: true,
            },
        ];
    const owner = rowOwnerFind(projects, item.id);
    if (!owner) return [];
    if (owner.worktreeId)
        return [
            { kind: "item", id: ROW_MENU_RENAME, label: "Rename workspace", icon: "edit" },
            { kind: "separator" },
            {
                kind: "item",
                id: ROW_MENU_ARCHIVE,
                label: "Archive workspace",
                icon: "archive",
                danger: true,
            },
        ];
    // The home project's name is the machine's, not the reader's to set, so it
    // offers neither renaming nor archiving.
    if (owner.project.kind === "home") return [];
    return [
        { kind: "item", id: ROW_MENU_RENAME, label: "Rename project", icon: "edit" },
        { kind: "item", id: ROW_MENU_SETTINGS, label: "Project settings…", icon: "settings" },
        { kind: "separator" },
        {
            kind: "item",
            id: ROW_MENU_ARCHIVE,
            label: "Archive project",
            icon: "archive",
            danger: true,
        },
    ];
}

/**
 * The two regions a tab can be moved between, named once so the strip that
 * offers the move and the region that accepts it cannot drift apart.
 */
const TRANSFER_ZONE_MAIN = "happy-agent-main";
const TRANSFER_ZONE_PANEL = "happy-agent-panel";

/** Where a tab in the panel's strip can go: the main content, to its leading side. */
const PANEL_TRANSFER_TARGETS: readonly TabTransferTarget[] = [
    { zone: TRANSFER_ZONE_MAIN, label: "the main content", side: "leading" },
];

/** Where a tab in the main strip can go: the panel, to its trailing side. */
const MAIN_TRANSFER_TARGETS: readonly TabTransferTarget[] = [
    { zone: TRANSFER_ZONE_PANEL, label: "the side panel", side: "trailing" },
];

/** The live tool tabs currently drawn on one side of the workspace. */
function toolTabsPlaced(
    panel: HappyAgentPanelSnapshot,
    placement: "panel" | "main",
): readonly HappyAgentPanelTabSnapshot[] {
    return panel.tabs.filter((tab) => tab.placement === placement);
}

/**
 * What Command-W closes: the right pane's tab while the keyboard is in the
 * pane, or the pane itself when nothing in it is closable; otherwise the main
 * content's tab, exactly as before the pane had tabs of its own.
 */
export function workspaceCloseTargetFind(
    focusedPane: AppShellFocusedPane,
    panel: HappyAgentPanelSnapshot,
    checkoutClosed: boolean,
): { type: "view"; viewId: string } | { type: "pane" } | { type: "main" } {
    if (focusedPane !== "panel" || !panel.open || checkoutClosed) return { type: "main" };
    const viewId =
        panelCloseTargetFind(panel) ??
        (panel.activeViewId === "files" && panel.filesViewOpen ? "files" : undefined);
    return viewId === undefined ? { type: "pane" } : { type: "view", viewId };
}

function panelCloseTargetFind(panel: HappyAgentPanelSnapshot): string | undefined {
    if (!panel.open || panel.activeViewId === "files" || panel.activeViewId === "artifacts")
        return undefined;
    if (panel.activeViewId === "activity") return "activity";
    if (panel.activeViewId === "usage") return "usage";
    if (panel.activeViewId === "devices") return "devices";
    if (panel.activeViewId === "preview") return panel.previewEntryId ? "preview" : undefined;
    if (panel.activeViewId === "change") return panel.changeViewPath ? "change" : undefined;
    if (panel.activeViewId === "file") return panel.fileViewOpen ? "file" : undefined;
    if (panel.activeViewId === "artifact") return panel.artifactView ? "artifact" : undefined;
    const tab = panel.tabs.find(
        (entry) => entry.id === panel.activeViewId && entry.placement === "panel",
    );
    return tab?.id;
}

/**
 * One tab per tool, iconed by what it holds. An artifact is named by its live
 * title, which the strip drawing it reads.
 */
function toolTabItems(
    tabs: readonly HappyAgentPanelTabSnapshot[],
    artifactLabel?: (artifactId: HappyAgentArtifactId) => string,
): TabItem[] {
    return tabs.map((tab) => ({
        closable: true,
        id: tab.id,
        label: tab.kind === "artifact" ? (artifactLabel?.(tab.artifactId) ?? tab.label) : tab.label,
        icon:
            tab.kind === "terminal"
                ? ("terminal" as const)
                : tab.kind === "artifact"
                  ? ("package" as const)
                  : tab.kind === "chat"
                    ? ("agents" as const)
                    : ("globe" as const),
    }));
}

/**
 * What a tab holding an artifact is called: the same live title a reference
 * to it reads as, and "Artifact" until that title has been read.
 */
function artifactTabLabelOf(
    titles: HappyAgentArtifactTitlesSnapshot,
    titlesStore: HappyAgentArtifactTitlesStore,
    artifactId: HappyAgentArtifactId,
): string {
    const view = messageReferencesCreate({
        titles,
        titlesStore,
        entities: messageReferenceEntities(undefined),
        onArtifactOpen: () => undefined,
    }).view({ kind: "artifact", id: artifactId });
    return view.type === "link" && view !== ARTIFACT_READING ? view.label : "Artifact";
}

/**
 * The version a viewer has on screen for one artifact, to carry it across the
 * window: what the reader picked in it, or absent while it follows the latest.
 * A viewer not yet holding that artifact has shown no other version, so the
 * one the tab was opened on stands.
 */
function artifactVersionOnScreen(
    store: HappyAgentArtifactViewerStore,
    artifactId: HappyAgentArtifactId,
    opened: number | undefined,
): number | undefined {
    const viewer = store.get();
    return viewer.artifactId === artifactId ? viewer.versionSelected : opened;
}

/**
 * The sidebar row an address lands on. A subtask is its own row, addressed by
 * its conversation. A worktree a subtask works in is not listed under its
 * project at all, so any other address inside it — the workspace alone, a file,
 * another conversation there — lands on that subtask's row too. A bot's own
 * folder is the bot's row, whichever of its folder-sharing tasks it holds.
 */
function activeRowId(
    bots: readonly HappyAgentBot[],
    rootTasks: readonly HappyAgentTask[],
    groupId: string,
    chatId: string | undefined,
): string {
    const tasks = happyAgentBotSubtasks([...bots, ...rootTasks]);
    const addressed = tasks.find((task) => task.conversation.id === chatId);
    if (addressed) return addressed.conversation.id;
    if (bots.some((bot) => bot.workspaceId === groupId)) return groupId;
    if (rootTasks.some((task) => task.workspaceId === groupId)) return groupId;
    return tasks.find((task) => task.workspaceId === groupId)?.conversation.id ?? groupId;
}

/** The project a sidebar row belongs to, and whether the row is one of its worktrees. */
function rowOwnerFind(
    projects: readonly HappyAgentProjectGroup[],
    id: string,
):
    | { readonly project: HappyAgentProjectGroup; readonly worktreeId?: HappyAgentWorktreeId }
    | undefined {
    for (const project of projects) {
        if (project.id === id) return { project };
        for (const worktree of project.worktrees)
            if (worktree.id === id) return { project, worktreeId: worktree.id };
    }
    return undefined;
}

/** A group with no conversation has no transcript; the constant keeps the prop stable. */
const NO_ENTRIES: readonly ConversationEntry[] = [];

/** A window with no machine yet holds no projects; the constant keeps the prop stable. */
const NO_PROJECTS: readonly HappyAgentProjectGroup[] = [];

/** A machine that lists no joined tasks; the constant keeps the prop stable. */
const NO_TASKS: readonly HappyAgentTask[] = [];

/** Resolves the selected preview against the current immutable conversation snapshot. */
function previewToolFind(
    conversation: HappyAgentWorkspaceSnapshot["conversation"],
    entryId: string | undefined,
): ConversationToolCall | undefined {
    if (entryId === undefined || conversation.type !== "ready") return undefined;
    const entry = conversation.value.entries.find(
        (candidate) => candidate.kind === "agentActivity" && candidate.id === entryId,
    );
    return entry?.kind === "agentActivity" && entry.activity.kind === "tool"
        ? entry.activity.tool
        : undefined;
}

/** The presented file the Preview tab names, when it names one that is still there. */
function previewMediaFind(
    conversation: HappyAgentWorkspaceSnapshot["conversation"],
    tool: ConversationToolCall | undefined,
    index: number | undefined,
): HappyAgentPreviewMedia | undefined {
    if (conversation.type !== "ready" || tool === undefined || index === undefined)
        return undefined;
    const item = tool.presentation?.type === "media" ? tool.presentation.items[index] : undefined;
    return item === undefined
        ? undefined
        : {
              agentId: conversation.value.conversationId,
              toolCallId: tool.toolCallId,
              index,
              item,
          };
}

/** One tab per session in the open group, marked while the agent is working. */
function sessionTabs(
    group: OpenGroup,
    titleShimmerEnabled: boolean,
    hideAvatar = false,
): TabItem[] {
    return group.conversations.map((summary) => ({
        id: summary.id,
        label: summary.title,
        labelShimmer: titleShimmerEnabled,
        ...(hideAvatar ? {} : { icon: "chat" as const }),
        // Stated even when false; the activity marks sit at the trailing edge,
        // so work starting or finishing never slides the title sideways.
        busy: summary.activity === "running",
        waiting: summary.activity === "waiting",
        awaitingInput: summary.activity === "awaitingInput",
        unread: summary.unread === true,
    }));
}

/**
 * Keeps a bot's one conversation first in the strip and refuses to close it.
 *
 * A bot *is* that conversation: it was created with the bot, it is the only one
 * there will ever be, and there is no control anywhere that could bring it back.
 * So it does not take its chances in the reader's tab order the way an ordinary
 * session does — it holds the leading position whatever else is opened beside
 * it, and the files and tools a reader opens from it arrange themselves after.
 *
 * Every other group passes through untouched: `sessionId` is absent unless the
 * open group is a bot's.
 */
function botTabPin(items: readonly TabItem[], sessionId: string | undefined): TabItem[] {
    if (sessionId === undefined) return items as TabItem[];
    const pinned = items.find((item) => item.id === sessionId);
    if (pinned === undefined) return items as TabItem[];
    return [{ ...pinned, closable: false }, ...items.filter((item) => item.id !== sessionId)];
}

/** The group's tabs in the order the workspace records; shared with voice's AppState. */
const tabsOrdered = happyAgentTabsOrdered;

/** The tab action ids the strip's context menu dispatches back to this surface. */
const TAB_MENU_CLOSE = "close";
const TAB_MENU_CLOSE_OTHERS = "close-others";
const TAB_MENU_CLOSE_LEFT = "close-left";
const TAB_MENU_CLOSE_RIGHT = "close-right";
const TAB_MENU_CLOSE_ALL = "close-all";
const fileDocumentIdentities = new WeakMap<object, number>();
let fileDocumentIdentityNext = 0;

/**
 * The context menu one tab offers: the usual sweeps — this tab, the others,
 * everything to one side, the whole strip. Closing a session tab archives the
 * session, so a session tab's menu says "archive", while a file tab, whose
 * closing throws nothing away, says "close". A sweep still applies each tab's
 * own close semantics whatever the word on the item that started it. A sweep
 * with nothing to act on stays visible but disabled, so the menu keeps one
 * shape wherever it opens.
 */
function tabStripMenu(verb: "Archive" | "Close", left: number, right: number): MenuItem[] {
    return [
        { kind: "item", id: TAB_MENU_CLOSE, label: `${verb} tab` },
        { kind: "separator" },
        {
            kind: "item",
            id: TAB_MENU_CLOSE_OTHERS,
            label: `${verb} other tabs`,
            disabled: left + right === 0,
        },
        {
            kind: "item",
            id: TAB_MENU_CLOSE_LEFT,
            label: `${verb} tabs to the left`,
            disabled: left === 0,
        },
        {
            kind: "item",
            id: TAB_MENU_CLOSE_RIGHT,
            label: `${verb} tabs to the right`,
            disabled: right === 0,
        },
        { kind: "separator" },
        { kind: "item", id: TAB_MENU_CLOSE_ALL, label: `${verb} all tabs` },
    ];
}

function fileTabDirty(tab: HappyAgentFileTabSnapshot): boolean {
    if (tab.draft === undefined || tab.document.type !== "ready") return false;
    const document = tab.document.value;
    const saved =
        "newContent" in document
            ? document.newContent
            : "content" in document
              ? document.content
              : undefined;
    return saved !== undefined && tab.draft !== saved;
}

/** The same familiar file-type glyph whether a file is open or in tab history. */
function fileTabIcon(
    path: string,
    kind: HappyAgentFileTabKind,
): "doc" | "globe" | "image" | "play" {
    const preview = kind === "media" ? filePreviewKind(path) : undefined;
    return kind === "document"
        ? "globe"
        : preview === "image"
          ? "image"
          : preview === "video" || preview === "audio"
            ? "play"
            : "doc";
}

/**
 * Exact identity of the ready document a file tab is currently drawing.
 *
 * A Git revision can advance before its replacement read settles while the old
 * ready document deliberately stays visible. Keying the editor from the loaded
 * object keeps that old parsed state attached to the old content until the new
 * document actually arrives. Weak keys add no lifetime beyond the tab/cache.
 */
function fileDocumentKey(tabId: string, document: object): string {
    let identity = fileDocumentIdentities.get(document);
    if (identity === undefined) {
        fileDocumentIdentityNext += 1;
        identity = fileDocumentIdentityNext;
        fileDocumentIdentities.set(document, identity);
    }
    return `${tabId}\u0000${String(identity)}`;
}

function fileTabItem(tab: HappyAgentFileTabSnapshot): TabItem {
    // A tab of a picture says picture. Wearing the document glyph over every
    // open file made the strip a row of identical marks with only the name to
    // tell them apart.
    return {
        id: tab.id,
        label: tab.path.split("/").at(-1) ?? tab.path,
        dirty: fileTabDirty(tab),
        icon: fileTabIcon(tab.path, tab.kind),
        preview: tab.preview,
    };
}

/**
 * How opening one file should show it.
 *
 * A picture, a video, or an archive has no text view worth offering, and asking
 * for one only produced "Binary files cannot be opened in the editor." over the
 * thing the reader just clicked. Ordinary source asks for a file; the workspace
 * state upgrades that intent to a diff only when its live Git snapshot says the
 * path is changed.
 */
function fileTabKind(path: string): HappyAgentFileTabKind {
    const kind = filePreviewKind(path);
    if (kind === "image" || kind === "video" || kind === "audio" || kind === "pdf") return "media";
    if (kind === "binary") return "media";
    // An HTML file is text that is also a page. It opens as the page, with its
    // source a toggle away, even out of the changed list: someone opening a
    // document wants to see the document.
    if (kind === "html") return "document";
    return "file";
}

function fileHighlightLanguageKey(path: string): string {
    const name = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
    // Pierre resolves language from the complete basename. Keeping the
    // complete name avoids treating `component.d.ts` and `component.ts` as
    // interchangeable cache entries just because their final extension agrees.
    return name;
}

/** Compact identity shared by saved source previews with the same bytes/language. */
function fileHighlightCacheKey(path: string, hash: string): string {
    return `h:${hash}:${fileHighlightLanguageKey(path)}`;
}

function markdownHighlightCacheKey(path: string, hash: string): string {
    return `m:${hash}:${fileHighlightLanguageKey(path)}`;
}

/**
 * One path as the checkout addresses it. A transcript names files the way the
 * agent saw them, which is usually an absolute path on the machine running the
 * session; the host reads paths inside the checkout, so its root is stripped
 * when the path is under it and the path is otherwise passed through unchanged.
 * A leading `./` is the same file written the way a shell prompt writes it, and
 * the host addresses that file without it.
 */
function workspacePathRelative(path: string, root: string | undefined): string {
    const normalized = path.replaceAll("\\", "/").replace(/^(?:\.\/)+/u, "");
    if (root === undefined) return normalized;
    const base = root.replaceAll("\\", "/").replace(/\/+$/u, "");
    const contained = /^[a-z]:\//iu.test(base)
        ? normalized.toLowerCase().startsWith(`${base.toLowerCase()}/`)
        : normalized.startsWith(`${base}/`);
    return base.length > 0 && contained ? normalized.slice(base.length + 1) : normalized;
}

/**
 * A link inside a rendered document, resolved against the document holding it.
 * `../DESIGN.md` in `docs/guide.md` is `DESIGN.md`, which is the file the reader
 * asked for; an absolute path names itself.
 */
function documentLinkResolve(from: string, href: string): string {
    if (href.startsWith("/") || /^[a-z]:\//iu.test(href)) return href;
    const segments = from.split("/").slice(0, -1);
    for (const segment of href.split("/")) {
        if (segment === "" || segment === ".") continue;
        if (segment === "..") segments.pop();
        else segments.push(segment);
    }
    return segments.join("/");
}

/**
 * Resolves an addressed group id against the list, matching projects, worktrees
 * and bots alike.
 *
 * A bot resolves to its own dedicated workspace holding its one conversation.
 * It is a group in every way this surface cares about — it is addressed, it has
 * a directory, it renders a chat — and it is only the sidebar that keeps bots
 * apart from projects, so the whole screen below reads one shape rather than
 * asking at every turn which kind of thing is open.
 */
function openGroupFind(
    projects: readonly HappyAgentProjectGroup[],
    bots: readonly HappyAgentBot[],
    rootTasks: readonly HappyAgentTask[],
    groupId: string | undefined,
    conversationId?: string,
): OpenGroup | undefined {
    if (groupId === undefined) return undefined;
    const tasks = happyAgentBotSubtasks([...bots, ...rootTasks]).filter(
        (task) => task.workspaceId === groupId,
    );
    const bot = bots.find((candidate) => candidate.workspaceId === groupId);
    const rootTask = rootTasks.find((candidate) => candidate.workspaceId === groupId);
    const task =
        tasks.find((entry) => entry.conversation.id === conversationId) ??
        (conversationId === undefined && bot === undefined && rootTask === undefined
            ? tasks[0]
            : undefined);
    if (task) {
        const worktree = projects
            .flatMap((project) => project.worktrees)
            .find((entry) => entry.id === groupId);
        return {
            id: task.workspaceId,
            singleConversationId: task.conversation.id,
            name: task.conversation.title,
            home: false,
            conversations: [task.conversation],
            changes: worktree?.changes ?? [],
            ...(worktree?.changesStatus === undefined
                ? {}
                : { changesStatus: worktree.changesStatus }),
            ...(worktree === undefined ? {} : { lifecycle: worktree.lifecycle }),
            create: { cwd: task.path, worktreeId: task.workspaceId },
            path: task.path,
        };
    }
    // A task opens the way a bot does: its one conversation, pinned, with its
    // folder's files, terminals, and git in the panel beside it.
    if (rootTask)
        return {
            id: rootTask.workspaceId,
            singleConversationId: rootTask.conversation.id,
            name: rootTask.name,
            home: false,
            conversations: [rootTask.conversation],
            changes: [],
            create: { cwd: rootTask.path, worktreeId: rootTask.workspaceId },
            path: rootTask.displayPath,
        };
    if (bot)
        return {
            id: bot.workspaceId,
            singleConversationId: bot.conversation.id,
            name: bot.name,
            home: false,
            conversations: [bot.conversation],
            changes: [],
            // The bot's folder, so files and attachments land in it. Starting a
            // second conversation here is refused separately: a bot has exactly
            // one, and `sessionCreateAvailable` is what withholds that control.
            create: { cwd: bot.path, worktreeId: bot.workspaceId },
            path: bot.displayPath,
        };
    for (const project of projects) {
        if (project.id === groupId)
            return {
                id: project.id,
                name: project.name,
                home: project.kind === "home",
                conversations: project.conversations,
                changes: project.changes ?? [],
                ...(project.changesStatus === undefined
                    ? {}
                    : { changesStatus: project.changesStatus }),
                create: { cwd: project.path },
                lifecycle: project.lifecycle,
                path: project.displayPath,
            };
        for (const worktree of project.worktrees)
            if (worktree.id === groupId)
                return {
                    id: worktree.id,
                    name: worktree.name,
                    home: false,
                    conversations: worktree.conversations,
                    changes: worktree.changes ?? [],
                    ...(worktree.changesStatus === undefined
                        ? {}
                        : { changesStatus: worktree.changesStatus }),
                    create: { cwd: worktree.path, worktreeId: worktree.id },
                    lifecycle: worktree.lifecycle,
                    path: worktree.displayPath,
                };
    }
    return undefined;
}

/**
 * The composer prompt names where the message lands. A window holds several
 * projects and worktrees at once, and their names read as anything from `happy`
 * to `Fix login redirect`, so the group is quoted rather than glued into a
 * sentence that only reads well for one kind of title.
 */
function composerPlaceholder(groupName: string | undefined): string {
    return groupName === undefined ? "Message Happy…" : `Message Happy in “${groupName}”…`;
}

/**
 * The composer prompt for a chat the reader may only read. It names the agent
 * holding the conversation, because that is the fact the reader needs: this work
 * belongs to something already running and is not waiting on a message. A chat
 * whose title has not been written yet says the same thing without a name rather
 * than falling back to jargon about what kind of chat it is.
 */
function conversationLockedPlaceholder(title: string | undefined): string {
    return title === undefined || title === "" ? "Running…" : `${title} is running this chat…`;
}

/** A sidebar row's id: which Happy Agent it belongs to, then the group inside it. */
function happyAgentItemId(happyAgentId: string, id: string): string {
    return `${happyAgentId}/${id}`;
}

/**
 * One Happy Agent contributes two headed lists, and a section id says which of
 * them a heading control or a drag came from.
 *
 * They are separate sections rather than one list with the bots at the top,
 * because a section is exactly what the sidebar arranges rows within: rows in
 * one section are peers a drag rearranges among each other, and a bot and a
 * project are not peers — a bot dropped past the last one has no meaning
 * against a project, and the drop had to be bent into "first among the bots" to
 * mean anything at all. Given a section of their own, bots are dragged among
 * bots and projects among projects, and neither list has to know about the
 * other.
 */
const HAPPY_AGENT_SECTION_PREFIX = "happy-agent:";
const HAPPY_AGENT_BOTS_SECTION_PREFIX = "happy-agent-bots:";
const HAPPY_AGENT_TASKS_SECTION_PREFIX = "happy-agent-tasks:";
const HAPPY_AGENT_SURFACES_SECTION_PREFIX = "happy-agent-surfaces:";

function happyAgentSectionId(happyAgentId: string): string {
    return `${HAPPY_AGENT_SECTION_PREFIX}${happyAgentId}`;
}

function happyAgentBotsSectionId(happyAgentId: string): string {
    return `${HAPPY_AGENT_BOTS_SECTION_PREFIX}${happyAgentId}`;
}

function happyAgentTasksSectionId(happyAgentId: string): string {
    return `${HAPPY_AGENT_TASKS_SECTION_PREFIX}${happyAgentId}`;
}

function happyAgentSurfacesSectionId(happyAgentId: string): string {
    return `${HAPPY_AGENT_SURFACES_SECTION_PREFIX}${happyAgentId}`;
}

/** Which of a Happy Agent's lists a section id names, and whose it is. */
function happyAgentSectionParse(sectionId: string):
    | {
          readonly happyAgentId: string;
          readonly kind: "bots" | "tasks" | "surfaces" | "projects";
      }
    | undefined {
    if (sectionId.startsWith(HAPPY_AGENT_SURFACES_SECTION_PREFIX))
        return {
            happyAgentId: sectionId.slice(HAPPY_AGENT_SURFACES_SECTION_PREFIX.length),
            kind: "surfaces",
        };
    if (sectionId.startsWith(HAPPY_AGENT_TASKS_SECTION_PREFIX))
        return {
            happyAgentId: sectionId.slice(HAPPY_AGENT_TASKS_SECTION_PREFIX.length),
            kind: "tasks",
        };
    if (sectionId.startsWith(HAPPY_AGENT_BOTS_SECTION_PREFIX))
        return {
            happyAgentId: sectionId.slice(HAPPY_AGENT_BOTS_SECTION_PREFIX.length),
            kind: "bots",
        };
    if (sectionId.startsWith(HAPPY_AGENT_SECTION_PREFIX))
        return {
            happyAgentId: sectionId.slice(HAPPY_AGENT_SECTION_PREFIX.length),
            kind: "projects",
        };
    return undefined;
}

function happyAgentItemParse(value: string): {
    readonly happyAgentId: string;
    readonly id: string;
} {
    const boundary = value.indexOf("/");
    return boundary < 0
        ? { id: "", happyAgentId: value }
        : { id: value.slice(boundary + 1), happyAgentId: value.slice(0, boundary) };
}

/**
 * The window's Happy Agents, each with its own projects, as one sidebar. Every row is
 * addressed by its Happy Agent and then by the group inside it, so a project on another
 * machine is selected, renamed, archived, and reordered through exactly the same
 * controls as one on this machine — against that machine's own workspace store.
 *
 * A machine that is not connected keeps the projects and work last confirmed
 * from it. Those rows remain navigation targets while their Happy Agent-backed actions
 * are disabled; reachability changes the section's state, not its membership.
 */
/**
 * The pinned rows in the order this window keeps them. A row the reader has
 * never moved — a newly reachable machine, for example — stays where the window
 * offered it, so an arrangement is a decision about the rows it was made about
 * and nothing else.
 */
function pinnedArrange(rows: readonly SidebarItem[], order: readonly string[]): SidebarItem[] {
    const byId = new Map(rows.map((row) => [row.id, row]));
    return happyAgentNavigationOrderApply(
        rows.map((row) => row.id),
        order,
    ).flatMap((id) => {
        const row = byId.get(id);
        return row ? [row] : [];
    });
}

function happyAgentSidebarItemAvailability(
    item: SidebarItem,
    happyAgent: AppHappyAgentEntry,
): Pick<SidebarItem, "action" | "secondaryAction"> {
    const disconnected = happyAgent.status !== "connected";
    return {
        ...(item.action && disconnected
            ? { action: { ...item.action, disabled: true } }
            : item.action
              ? { action: item.action }
              : {}),
        ...(item.secondaryAction && disconnected
            ? { secondaryAction: { ...item.secondaryAction, disabled: true } }
            : item.secondaryAction
              ? { secondaryAction: item.secondaryAction }
              : {}),
    };
}

/**
 * The sections with the reader's folding applied, marked on the rows that carry
 * something nested under them.
 *
 * Said once over the finished sections rather than inside each builder above:
 * every one of them states rows with a depth, the row ids are only their final
 * ones by the time they reach here, and folding is one fact about the sidebar
 * rather than something a project, a folder and a contact list should each have
 * to remember. A row nothing is nested under is left alone, so it never claims a
 * fold that would do nothing.
 */
function sectionsCollapsed(
    sections: readonly SidebarSection[],
    collapsed: ReadonlySet<string>,
): SidebarSection[] {
    if (collapsed.size === 0) return sections as SidebarSection[];
    return sections.map((section) => ({
        ...section,
        items: section.items.map((item, index) =>
            collapsed.has(item.id) && (section.items[index + 1]?.depth ?? 0) > (item.depth ?? 0)
                ? { ...item, collapsed: true }
                : item,
        ),
    }));
}

/**
 * The Bots heading's way back to the bots the reader hid: a control beside the
 * +, there only while something is hidden, opening a menu that names each one.
 * Hiding is this window's own record, so the control works offline too.
 */
function hiddenBotsAction(
    happyAgent: AppHappyAgentEntry,
    attention: HappyAgentAttentionSnapshot,
): Pick<SidebarSection, "secondaryAction"> {
    const hidden = happyAgent.bots.filter(
        (bot) => happyAgentBotAttention(attention, happyAgent.id, bot.id) === "hidden",
    );
    if (hidden.length === 0) return {};
    return {
        secondaryAction: {
            icon: "eye-off",
            label: "Hidden bots",
            reveal: "hover",
            menuItems: [
                { kind: "label", label: "Hidden bots" },
                ...hidden.map(
                    (bot): MenuItem => ({
                        kind: "item",
                        id: `${BOTS_MENU_SHOW_PREFIX}${bot.id}`,
                        label: `Show ${bot.name}`,
                        icon: "eye",
                    }),
                ),
                ...(hidden.length > 1
                    ? ([
                          { kind: "separator" },
                          { kind: "item", id: BOTS_MENU_SHOW_ALL, label: "Show all" },
                      ] as const)
                    : []),
            ],
        },
    };
}

/**
 * The sidebar rows a voice target can be: a subtask's own row, which is named
 * by its conversation, then the row of the group it lives in — a bot's or
 * task's workspace, a project, or a worktree. A session has no row of its own,
 * so it is pointed at through its group.
 */
function voiceFocusRowIds(focus: GptLiveVoiceFocus): string[] {
    const { target } = focus;
    return [
        ...("sessionId" in target ? [happyAgentItemId(target.connectionId, target.sessionId)] : []),
        happyAgentItemId(target.connectionId, target.groupId),
    ];
}

/**
 * The sections with the reader's folding applied and the row a voice call
 * points at marked, separately from the row the window has selected.
 *
 * A navigation about to happen unfolds whatever is folded over its row for as
 * long as voice points there; the reader's folding is never written, so it is
 * back the moment the call points elsewhere. A mere mention leaves the folding
 * alone and marks the outermost folded row instead, or the Projects heading
 * when the whole list is folded away.
 */
function sectionsVoiceFocused(
    sections: readonly SidebarSection[],
    collapsed: ReadonlySet<string>,
    focus: GptLiveVoiceFocus | undefined,
    directory: AppHappyAgentDirectorySnapshot,
): SidebarSection[] {
    if (!focus) return sectionsCollapsed(sections, collapsed);
    let place: { readonly section: number; readonly index: number } | undefined;
    for (const id of voiceFocusRowIds(focus)) {
        for (let section = 0; section < sections.length && !place; section++) {
            const index = sections[section]!.items.findIndex((item) => item.id === id);
            if (index >= 0) place = { section, index };
        }
        if (place) break;
    }
    if (!place) {
        const { target } = focus;
        const bots =
            directory.happyAgents.find((entry) => entry.id === target.connectionId)?.bots ?? [];
        // Hidden bots stay selectable by voice. Their heading carries the cue
        // when the bot or a child has no visible row; the hidden choice stays put.
        const inBots = [...bots, ...happyAgentBotSubtasks(bots)].some(
            (entry) =>
                entry.workspaceId === target.groupId ||
                ("sessionId" in target && entry.conversation.id === target.sessionId),
        );
        const heading = inBots
            ? happyAgentBotsSectionId(target.connectionId)
            : happyAgentSectionId(target.connectionId);
        return sectionsCollapsed(
            sections.map((section) =>
                section.id === heading && (inBots || section.items.length === 0)
                    ? { ...section, voiceFocus: true }
                    : section,
            ),
            collapsed,
        );
    }
    const items = sections[place.section]!.items;
    // Walking up: each earlier row shallower than the last one found is the next ancestor out.
    const folded: string[] = [];
    let depth = items[place.index]!.depth ?? 0;
    for (let index = place.index - 1; index >= 0 && depth > 0; index--) {
        const ancestor = items[index]!;
        if ((ancestor.depth ?? 0) >= depth) continue;
        depth = ancestor.depth ?? 0;
        if (collapsed.has(ancestor.id)) folded.push(ancestor.id);
    }
    const reveal = focus.reason === "navigation";
    const marked = reveal || folded.length === 0 ? items[place.index]!.id : folded.at(-1)!;
    const shown =
        reveal && folded.length > 0
            ? new Set([...collapsed].filter((id) => !folded.includes(id)))
            : collapsed;
    const section = place.section;
    return sectionsCollapsed(sections, shown).map((entry, index) =>
        index !== section
            ? entry
            : {
                  ...entry,
                  items: entry.items.map((item) =>
                      item.id === marked ? { ...item, voiceFocus: true } : item,
                  ),
              },
    );
}

/** Whether a voice target lives in one of a Happy Agent's projects, so its Projects list must show. */
function voiceFocusInProjects(
    focus: GptLiveVoiceFocus | undefined,
    directory: AppHappyAgentDirectorySnapshot,
): boolean {
    if (!focus) return false;
    const { target } = focus;
    return (
        directory.happyAgents
            .find((entry) => entry.id === target.connectionId)
            ?.projects.some(
                (project) =>
                    project.id === target.groupId ||
                    project.worktrees.some((worktree) => worktree.id === target.groupId),
            ) === true
    );
}

function happyAgentSections(
    directory: AppHappyAgentDirectorySnapshot,
    titleShimmerEnabled: boolean,
    projectsVisibility: ProjectsVisibilitySnapshot,
    attention: HappyAgentAttentionSnapshot,
    folded?: ReadonlySet<string>,
    /** The machine Cmd-N makes a task on, whose Tasks heading wears the chord. */
    shortcutHappyAgentId?: string,
): SidebarSection[] {
    return directory.happyAgents.flatMap((happyAgent) => [
        // Keep the heading even with no bots: its action is where the first
        // one is named, and a machine with none is exactly where that is wanted.
        {
            id: happyAgentBotsSectionId(happyAgent.id),
            label: "Bots",
            items: [
                ...happyAgentSidebarTree(happyAgent).bots.flatMap((bot) => {
                    // A hidden bot leaves the list with everything nested
                    // under it; a muted one stays, with its whole tree quiet.
                    const botAttention = happyAgentBotAttention(attention, happyAgent.id, bot.id);
                    if (botAttention === "hidden") return [];
                    const muted = botAttention === "muted";
                    return [
                        botSidebarItem(bot, titleShimmerEnabled, muted),
                        ...botSubtaskSidebarItems(
                            bot.subtasks,
                            happyAgent.projects,
                            titleShimmerEnabled,
                        ).map((item) => (muted ? { ...item, muted: true } : item)),
                    ];
                }),
                // The host lists a new bot last, so a bot still being made
                // stands where it will arrive.
                ...(happyAgent.botsCreating ?? []).map((bot) =>
                    botCreatingSidebarItem(bot, titleShimmerEnabled),
                ),
            ].map((item) => ({
                ...item,
                id: happyAgentItemId(happyAgent.id, item.id),
            })),
            // Naming a bot belongs to the Happy Agent named by this section, the
            // same way adding a project does.
            // Once the machine has been seen, an outage disables the control
            // rather than removing it, so the sidebar does not move.
            ...(happyAgent.session
                ? {
                      action: {
                          disabled: happyAgent.status !== "connected",
                          icon: "plus" as const,
                          label: "New bot",
                          reveal: "always" as const,
                      },
                  }
                : {}),
            ...hiddenBotsAction(happyAgent, attention),
            ...subtaskFailureError(happyAgent, happyAgent.bots),
            // With the Projects list left out, what the Happy Agent said when it
            // failed still needs a heading to stand under.
            ...(projectsVisibilityConnection(projectsVisibility, happyAgent.id).projectsHidden &&
            happyAgent.status === "error" &&
            happyAgent.message !== undefined
                ? { error: happyAgent.message }
                : {}),
        },
        // A Happy Agent from before tasks has no task list to show, so it
        // offers no heading that could only ever stand empty.
        ...(happyAgentTasksSupported(happyAgent)
            ? [happyAgentTasksSection(happyAgent, titleShimmerEnabled, shortcutHappyAgentId)]
            : []),
        // The reader's own choice in settings for this connection: the
        // section goes entirely, heading and all, rather than folding.
        ...(projectsVisibilityConnection(projectsVisibility, happyAgent.id).projectsHidden
            ? []
            : [happyAgentProjectsSection(happyAgent, titleShimmerEnabled, folded)]),
    ]);
}

/**
 * The reader's joined tasks, under a heading of their own below the bots and
 * in the reader's own order. Each is a bot's row with its owner's face, and its
 * delegated subtasks nest under it exactly as a bot's do. The heading's action
 * is where every other task on the machine is browsed and joined, so it stays
 * even when the list is empty.
 */
function happyAgentTasksSection(
    happyAgent: AppHappyAgentEntry,
    titleShimmerEnabled: boolean,
    shortcutHappyAgentId?: string,
): SidebarSection {
    // The heading keeps its shape once the machine has been seen: an outage,
    // such as an update restarting it, disables its controls rather than
    // taking them away, so the rows below do not move.
    const materialized = happyAgent.session !== undefined;
    const offline = happyAgent.status !== "connected";
    return {
        id: happyAgentTasksSectionId(happyAgent.id),
        label: "Tasks",
        items: happyAgentSidebarTree(happyAgent)
            .tasks.flatMap((task) => [
                taskSidebarItem(task, titleShimmerEnabled),
                ...botSubtaskSidebarItems(task.subtasks, happyAgent.projects, titleShimmerEnabled),
            ])
            .map((item) => ({
                ...item,
                id: happyAgentItemId(happyAgent.id, item.id),
                ...happyAgentSidebarItemAvailability(item, happyAgent),
            })),
        // The heading makes a task the way the Bots heading makes a bot, with
        // browsing beside it. A Happy Agent from before task creation only
        // browses, so its search stands where the + would.
        ...(materialized && happyAgentTaskCreateSupported(happyAgent)
            ? {
                  action: {
                      disabled: offline,
                      icon: "plus" as const,
                      label: "New task",
                      reveal: "always" as const,
                      // The chord answers for the machine on screen, so only
                      // that machine's heading shows it.
                      ...(shortcutHappyAgentId === happyAgent.id
                          ? { shortcut: APP_SHORTCUTS.taskCreate }
                          : {}),
                  },
                  secondaryAction: {
                      disabled: offline,
                      icon: "search" as const,
                      label: "Browse tasks",
                      reveal: "always" as const,
                  },
                  // Nothing joined yet says so under the heading, with making
                  // the first one right beside it while it can be made.
                  empty: {
                      ...(offline ? {} : { actionLabel: "New task" }),
                      description: "Start a task, or browse to join one.",
                      icon: "tasks" as const,
                      title: "No tasks yet",
                  },
              }
            : materialized
              ? {
                    action: {
                        disabled: offline,
                        icon: "search" as const,
                        label: "Browse tasks",
                        reveal: "always" as const,
                    },
                    empty: {
                        ...(offline ? {} : { actionLabel: "Browse tasks" }),
                        description: "Join a task to keep it here.",
                        icon: "tasks" as const,
                        title: "No tasks yet",
                    },
                }
              : {}),
        ...taskFailureError(happyAgent),
        ...(taskFailureError(happyAgent).error === undefined
            ? subtaskFailureError(happyAgent, happyAgent.tasks ?? [])
            : {}),
    };
}

/**
 * Whether this Happy Agent has tasks at all. The task routes first shipped in
 * `HAPPY_AGENT_TASKS_VERSION`; a machine that reported an older version, or
 * none yet, shows the Tasks section only if it already listed tasks.
 */
function happyAgentTasksSupported(happyAgent: AppHappyAgentEntry): boolean {
    return (
        (happyAgent.tasks?.length ?? 0) > 0 ||
        happyAgentVersionAtLeast(happyAgent.version, HAPPY_AGENT_TASKS_VERSION)
    );
}

/** Whether this Happy Agent makes and renames tasks: `HAPPY_AGENT_TASK_CREATE_VERSION` onwards. */
function happyAgentTaskCreateSupported(happyAgent: AppHappyAgentEntry): boolean {
    return happyAgentVersionAtLeast(happyAgent.version, HAPPY_AGENT_TASK_CREATE_VERSION);
}

/**
 * A Surface's row is addressed inside its Happy Agent like every other row,
 * and marked so it can never be read as a workspace's.
 */
const SURFACE_ROW_PREFIX = "surface:";

function surfaceRowId(surfaceId: string): string {
    return `${SURFACE_ROW_PREFIX}${surfaceId}`;
}

/** What the sidebar heading's + offers to make, in the order it lists them. */
const SURFACE_CREATE_OFFERS: readonly {
    readonly kind: HappyAgentSurfaceCreateKind;
    readonly icon: IconName;
    readonly label: string;
}[] = [
    { kind: "todo", icon: "tasks", label: "New todo list" },
    { kind: "document", icon: "doc", label: "New document" },
    { kind: "calendar", icon: "calendar", label: "New calendar" },
    { kind: "system_monitor", icon: "pulse", label: "New system monitor" },
    { kind: "chat", icon: "users", label: "New chat" },
];

/**
 * The + menu: a document only from a Happy Agent that serves collaborative
 * documents, since an older one can show a document but nobody can write it,
 * and a calendar, a system monitor, or a chat only from one that serves them.
 */
function surfaceCreateMenu(support: HappyAgentSurfaceSupportSnapshot): MenuItem[] {
    return SURFACE_CREATE_OFFERS.filter(
        (offer) =>
            (offer.kind !== "document" || support.documents === "supported") &&
            (offer.kind !== "calendar" || support.calendars === "supported") &&
            (offer.kind !== "system_monitor" || support.systemMonitors === "supported") &&
            (offer.kind !== "chat" || support.chats === "supported"),
    ).map((offer) => ({ kind: "item", id: offer.kind, icon: offer.icon, label: offer.label }));
}

/** The tones a person's caret can wear in a shared document. */
const PERSON_TONES = ["violet", "ember", "mint", "ocean", "rose", "amber"] as const;

/**
 * The reader as everyone else in a shared document sees their caret: their
 * name, and a tone fixed by who they are, so it is the same in every document
 * and every window.
 */
function documentUserOf(catalog: HappyAgentSurfaceCatalogSnapshot): DocumentEditorUser {
    const userId = catalog.viewer?.userId ?? null;
    const person = userId === null ? catalog.profile : catalog.users.get(userId);
    let hash = 0;
    for (const character of userId ?? "") hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    return { name: person?.name ?? "Someone", tone: PERSON_TONES[hash % PERSON_TONES.length]! };
}

/** The Surface a row id names, or nothing for any other row. */
function surfaceRowParse(rowId: string): HappyAgentSurfaceId | undefined {
    return rowId.startsWith(SURFACE_ROW_PREFIX)
        ? (rowId.slice(SURFACE_ROW_PREFIX.length) as HappyAgentSurfaceId)
        : undefined;
}

/**
 * Who is in a Surface, by name and face. The standalone person has no user
 * ID and is named by the profile; a teammate the catalog has not learned yet
 * is still counted, by a placeholder name.
 */
function surfaceMembersView(
    catalog: HappyAgentSurfaceCatalogSnapshot,
    surface: HappyAgentSurface,
): HappyAgentSurfaceMemberView[] {
    return surface.members.map((member) => {
        const person = member.userId === null ? catalog.profile : catalog.users.get(member.userId);
        return {
            key: member.userId ?? "standalone",
            name: person?.name ?? (member.userId === null ? "You" : "Someone"),
            ...(person?.photo ? { photo: person.photo } : {}),
        };
    });
}

/** A Surface as every view of it shows it, from the catalog it is listed in. */
function surfaceViewOf(
    catalog: HappyAgentSurfaceCatalogSnapshot,
    surface: HappyAgentSurface,
): HappyAgentSurfaceView {
    // A Surface that credits nobody names no creator, and nor does one whose
    // creator the catalog has not read yet: the name appears once, as itself.
    const creator =
        surface.creatorUserId === null ? undefined : catalog.users.get(surface.creatorUserId);
    return {
        name: surfaceLabel(surface),
        ...(surface.image ? { image: surface.image } : {}),
        type: surface.type,
        ...(creator === undefined
            ? {}
            : {
                  creator: {
                      name: creator.name ?? "Someone",
                      ...(creator.photo ? { photo: creator.photo } : {}),
                  },
              }),
        members: surfaceMembersView(catalog, surface),
    };
}

/**
 * A Surface's row: its own name and picture whatever its type, with Leave on
 * one the reader joined and Join on one a search found. A joined todo list
 * also says how many of its todos are still open, and a joined Surface whose
 * shared chat is busy says so the way a chat's row does, wherever the reader
 * is.
 */
function surfaceSidebarItem(
    happyAgentId: string,
    surface: HappyAgentSurface,
    places: SurfacePlaces,
    joined: boolean,
    offline: boolean,
    live?: {
        readonly activeTodoCounts: ReadonlyMap<HappyAgentSurfaceId, number>;
        readonly chatActivity: ReadonlyMap<HappyAgentSurfaceId, HappyAgentSurfaceChatActivity>;
        readonly labelShimmer: boolean;
    },
): SidebarItem {
    const count = joined ? live?.activeTodoCounts.get(surface.id) : undefined;
    const chatActivity = joined ? live?.chatActivity.get(surface.id) : undefined;
    const label = surfaceLabel(surface);
    return {
        id: happyAgentItemId(happyAgentId, surfaceRowId(surface.id)),
        kind: "project",
        label,
        ...surfaceFace(surface, places),
        ...(chatActivity === undefined
            ? {}
            : { labelShimmer: live?.labelShimmer ?? true, ...sidebarActivity(chatActivity) }),
        ...(count !== undefined && count > 0 ? { count } : {}),
        ...(joined ? {} : { reorderable: false }),
        action: joined
            ? {
                  disabled: offline,
                  icon: "close" as const,
                  label: `Leave ${label}`,
                  reveal: "hover" as const,
              }
            : {
                  disabled: offline,
                  icon: "plus" as const,
                  label: `Join ${label}`,
              },
    };
}

/** The bots and tasks a reference Surface's row borrows its face from. */
interface SurfacePlaces {
    readonly bots: readonly HappyAgentBot[];
    readonly tasks: readonly HappyAgentTask[];
}

function surfacePlacesOf(happyAgent: AppHappyAgentEntry | undefined): SurfacePlaces {
    return { bots: happyAgent?.bots ?? [], tasks: happyAgent?.tasks ?? [] };
}

/**
 * What a Surface is called: an artifact, bot, or task kept among the
 * Surfaces goes by its own current name while the reader can see it, and by
 * the label it was kept under otherwise.
 */
function surfaceLabel(surface: HappyAgentSurface): string {
    return surface.target?.state === "available" ? surface.target.name : surface.name;
}

/**
 * The face a Surface's row wears, chosen by its type so it reads as the same
 * thing whatever state its target is in. A task always wears the task glyph.
 * A bot wears its own face, and an artifact the Surface's picture or a
 * picture glyph for an image, while the reader can see them; one they cannot
 * falls back to its type's glyph. An unavailable target's row dims. Any other
 * Surface wears its picture, or its type's glyph.
 */
function surfaceFace(
    surface: HappyAgentSurface,
    places: SurfacePlaces,
): Pick<SidebarItem, "icon" | "imageUrl" | "initials" | "archived"> {
    const target = surface.target;
    const glyph = { icon: surfaceTypeIcon(surface.type) };
    if (target?.state === "unavailable") return { ...glyph, archived: true };
    if (surface.type.kind === "task") return glyph;
    if (target?.kind === "bot") {
        const bot = places.bots.find((entry) => entry.id === target.id);
        return {
            initials: ownerInitials(bot?.name ?? surface.name),
            ...(bot?.avatar ? { imageUrl: bot.avatar.url } : {}),
        };
    }
    if (surface.image) return { imageUrl: surface.image.url };
    if (target?.kind === "artifact" && target.hasImage) return { icon: "image" };
    return glyph;
}

/** A bot's or a task's row, as the reference a Surface would keep of it. */
function rowReferenceOf(
    happyAgent: AppHappyAgentEntry,
    rowId: string,
): { readonly reference: HappyAgentSurfaceReference; readonly name: string } | undefined {
    const bot = happyAgent.bots.find((entry) => entry.workspaceId === rowId);
    if (bot) return { reference: { kind: "bot", id: bot.id }, name: bot.name };
    const task = happyAgent.tasks?.find((entry) => entry.workspaceId === rowId);
    if (task) return { reference: { kind: "task", id: task.id }, name: task.name };
    return undefined;
}

/**
 * The bot's or task's row menu, with keeping it among the Surfaces first —
 * or taking it out again — where the Happy Agent has Surfaces.
 */
function rowSurfaceMenuItems(
    happyAgent: AppHappyAgentEntry,
    rowId: string,
    items: MenuItem[],
): MenuItem[] {
    const found = rowReferenceOf(happyAgent, rowId);
    const catalog = happyAgent.session?.surfaces?.catalog().get();
    if (found === undefined || catalog?.availability !== "available") return items;
    const kept = happyAgentSurfaceReferenceFind(catalog.joined, found.reference) !== undefined;
    return [
        kept
            ? {
                  kind: "item",
                  id: ROW_MENU_SURFACE_REMOVE,
                  label: "Remove from top of sidebar",
                  icon: "close",
              }
            : {
                  kind: "item",
                  id: ROW_MENU_SURFACE_ADD,
                  label: "Add to top of sidebar",
                  icon: "plus",
              },
        ...(items.length > 0 ? ([{ kind: "separator" }] as const) : []),
        ...items,
    ];
}

/**
 * The first group in the sidebar, under no heading. Artifacts leads it and is
 * always there; it never moves and nothing is dragged past it. The reader's
 * Surfaces follow in their own order and are dragged among themselves only.
 * Every type is listed by its own name and picture, including a type this
 * build cannot show; only opening one depends on its type. Every act on them
 * applies at once and reaches the Happy Agent in the background, so the
 * group never reports a failure.
 */
function happyAgentTopSection(
    happyAgentId: string,
    happyAgent: AppHappyAgentEntry | undefined,
    catalog: HappyAgentSurfaceCatalogSnapshot,
    activeTodoCounts: ReadonlyMap<HappyAgentSurfaceId, number>,
    titleShimmerEnabled: boolean,
): SidebarSection {
    const offline = happyAgent?.status !== "connected";
    return {
        id: happyAgentSurfacesSectionId(happyAgentId),
        items: [
            ARTIFACTS_SIDEBAR_ITEM,
            ...(catalog.availability === "available"
                ? catalog.joined.map((surface) =>
                      surfaceSidebarItem(
                          happyAgentId,
                          surface,
                          surfacePlacesOf(happyAgent),
                          true,
                          offline,
                          {
                              activeTodoCounts,
                              chatActivity: catalog.chatActivity,
                              labelShimmer: titleShimmerEnabled,
                          },
                      ),
                  )
                : []),
        ],
    };
}

/**
 * A chat's row is addressed inside its Happy Agent by the chat alone; the
 * workspace it is filed under is read back from the list that holds it.
 */
const CHAT_ROW_PREFIX = "chat:";

function chatRowId(chatId: string): string {
    return `${CHAT_ROW_PREFIX}${chatId}`;
}

function chatRowParse(rowId: string): string | undefined {
    return rowId.startsWith(CHAT_ROW_PREFIX) ? rowId.slice(CHAT_ROW_PREFIX.length) : undefined;
}

/**
 * Where selecting one of a Happy Agent's sidebar rows goes: the group it addresses and the
 * conversation that opens there, if any. Nothing for a chat filed nowhere any more or a bot still
 * being made.
 */
function rowDestination(
    happyAgent: AppHappyAgentEntry,
    rowId: string,
): { readonly groupId: string; readonly chatId: string | undefined } | undefined {
    const chatId = chatRowParse(rowId);
    if (chatId !== undefined) {
        const groupId = chatGroupFind(happyAgent.projects, chatId);
        return groupId === undefined ? undefined : { groupId, chatId };
    }
    const subtask = happyAgentBotSubtasks([...happyAgent.bots, ...(happyAgent.tasks ?? [])]).find(
        (task) => task.conversation.id === rowId,
    );
    if (subtask) return { groupId: subtask.workspaceId, chatId: subtask.conversation.id };
    const task = happyAgent.tasks?.find((entry) => entry.workspaceId === rowId);
    if (task) return { groupId: task.workspaceId, chatId: task.conversation.id };
    const bot = happyAgent.bots.find((entry) => entry.workspaceId === rowId);
    if (bot) return { groupId: bot.workspaceId, chatId: bot.conversation.id };
    // A bot still being made has no conversation to go to yet. The
    // window follows it on its own the moment the host answers.
    if (happyAgent.botsCreating?.some((entry) => entry.workspaceId === rowId)) return undefined;
    return {
        groupId: rowId,
        // A workspace that has not recorded where this project was
        // left falls back to its most recent conversation, which is
        // also what a workspace without the memory at all does.
        chatId:
            happyAgent.session?.workspace.get().groupResume?.get(rowId as HappyAgentGroupId) ??
            openGroupFind(happyAgent.projects, happyAgent.bots, happyAgent.tasks ?? [], rowId)
                ?.conversations[0]?.id,
    };
}

/** The project or worktree a chat is filed under, by its id. */
function chatGroupFind(
    projects: readonly HappyAgentProjectGroup[],
    chatId: string,
): string | undefined {
    for (const project of projects) {
        if (project.conversations.some((chat) => chat.id === chatId)) return project.id;
        for (const worktree of project.worktrees)
            if (worktree.conversations.some((chat) => chat.id === chatId)) return worktree.id;
    }
    return undefined;
}

/** The most chats a search lists; the newest matching ones are kept. */
const SEARCH_CHAT_LIMIT = 30;

const SEARCH_SECTION_PREFIX = "happy-agent-search:";

/**
 * What the sidebar lists while its search field holds anything, in place of
 * everything it usually lists: every Surface whose name matches, joined or
 * not, then the bots, tasks, projects, worktrees, and chats that do, each
 * under a heading naming what it is. A match is the text appearing anywhere
 * in a row's name, ignoring case. Rows keep the order the sidebar gives them,
 * except Surfaces the reader has not joined, which follow theirs by name, and
 * chats, which are newest first.
 *
 * Nothing found is arranged by hand: a narrowed list does not hold the rows a
 * move would be stated against. Opening a row is opening it from the sidebar.
 */
function happyAgentSearchSections(
    query: string,
    directory: AppHappyAgentDirectorySnapshot,
    activeHappyAgentId: string,
    catalog: HappyAgentSurfaceCatalogSnapshot,
    activeTodoCounts: ReadonlyMap<HappyAgentSurfaceId, number>,
    titleShimmerEnabled: boolean,
    projectsVisibility: ProjectsVisibilitySnapshot,
    attention: HappyAgentAttentionSnapshot,
): SidebarSection[] {
    const needle = query.trim().toLocaleLowerCase();
    const matches = (text: string): boolean => text.toLocaleLowerCase().includes(needle);
    const found = (item: SidebarItem): SidebarItem => ({
        ...item,
        depth: 0,
        reorderable: false,
    });
    const sections = directory.happyAgents.flatMap((happyAgent): SidebarSection[] => {
        const offline = happyAgent.status !== "connected";
        const rowOf = (item: SidebarItem): SidebarItem =>
            found({
                ...item,
                id: happyAgentItemId(happyAgent.id, item.id),
                ...happyAgentSidebarItemAvailability(item, happyAgent),
            });
        const surfaces: SidebarItem[] = [];
        if (happyAgent.id === activeHappyAgentId) {
            if (matches(ARTIFACTS_SIDEBAR_ITEM.label)) surfaces.push(ARTIFACTS_SIDEBAR_ITEM);
            if (catalog.availability === "available") {
                const joined = new Set(catalog.joined.map((surface) => surface.id));
                for (const surface of catalog.joined)
                    if (matches(surfaceLabel(surface)))
                        surfaces.push(
                            found(
                                surfaceSidebarItem(
                                    happyAgent.id,
                                    surface,
                                    surfacePlacesOf(happyAgent),
                                    true,
                                    offline,
                                    {
                                        activeTodoCounts,
                                        chatActivity: catalog.chatActivity,
                                        labelShimmer: titleShimmerEnabled,
                                    },
                                ),
                            ),
                        );
                for (const surface of [...catalog.surfaces].sort((left, right) =>
                    surfaceLabel(left).localeCompare(surfaceLabel(right)),
                ))
                    if (!joined.has(surface.id) && matches(surfaceLabel(surface)))
                        surfaces.push(
                            surfaceSidebarItem(
                                happyAgent.id,
                                surface,
                                surfacePlacesOf(happyAgent),
                                false,
                                offline,
                            ),
                        );
            }
        }
        const bots = happyAgent.bots
            .filter(
                (bot) =>
                    matches(bot.name) &&
                    happyAgentBotAttention(attention, happyAgent.id, bot.id) !== "hidden",
            )
            .map((bot) =>
                rowOf(
                    botSidebarItem(
                        bot,
                        titleShimmerEnabled,
                        happyAgentBotAttention(attention, happyAgent.id, bot.id) === "muted",
                    ),
                ),
            );
        const tasks = (happyAgent.tasks ?? [])
            .filter((task) => matches(task.name))
            .map((task) => rowOf(taskSidebarItem(task, titleShimmerEnabled)));
        const projects = projectsVisibilityConnection(projectsVisibility, happyAgent.id)
            .projectsHidden
            ? []
            : happyAgentSidebarTree(happyAgent).projects.flatMap((entry) =>
                  sidebarItems(entry, titleShimmerEnabled)
                      .filter((item) => matches(item.label))
                      // A worktree found on its own says which project it is in.
                      .map((item) =>
                          rowOf(item.depth === 1 ? { ...item, meta: entry.project.name } : item),
                      ),
              );
        const chats = happyAgent.projects
            .flatMap((project) => [
                ...project.conversations.map((chat) => ({ chat, where: project.name })),
                ...project.worktrees.flatMap((worktree) =>
                    worktree.conversations.map((chat) => ({ chat, where: worktree.name })),
                ),
            ])
            .filter(({ chat }) => matches(chat.title))
            .sort((left, right) => right.chat.updatedAt - left.chat.updatedAt)
            .slice(0, SEARCH_CHAT_LIMIT)
            .map(
                ({ chat, where }): SidebarItem =>
                    found({
                        id: happyAgentItemId(happyAgent.id, chatRowId(chat.id)),
                        kind: "channel",
                        icon: "chat",
                        label: chat.title,
                        labelShimmer: titleShimmerEnabled,
                        meta: where,
                        ...sidebarActivity(chat.activity),
                        ...(chat.unread ? { unread: true } : {}),
                    }),
            );
        const section = (kind: string, label: string, items: SidebarItem[]): SidebarSection[] =>
            items.length === 0
                ? []
                : [{ id: `${SEARCH_SECTION_PREFIX}${kind}:${happyAgent.id}`, label, items }];
        return [
            ...section("surfaces", "Shared", surfaces),
            ...section("bots", "Bots", bots),
            ...section("tasks", "Tasks", tasks),
            ...section("projects", "Projects", projects),
            ...section("chats", "Chats", chats),
        ];
    });
    return sections.length > 0
        ? sections
        : [
              {
                  id: `${SEARCH_SECTION_PREFIX}none`,
                  items: [],
                  empty: {
                      description: `Nothing matches “${query.trim()}”.`,
                      icon: "search",
                  },
              },
          ];
}

/**
 * The Tasks heading's word on a task act the host refused. A refused leave or
 * move puts the row back where the host has it, and a refused archive leaves
 * it listed, so the reason stands under the heading it is listed in. A
 * refused join names a task that is not listed here at all, and is said in
 * the browse dialog that asked for it instead.
 */
function taskFailureError(happyAgent: AppHappyAgentEntry): Pick<SidebarSection, "error"> {
    const failures = happyAgent.taskFailures;
    if (failures === undefined || failures.size === 0) return {};
    for (const task of happyAgent.tasks ?? []) {
        const failure = failures.get(task.id);
        if (failure && failure.action !== "join")
            return {
                error: `Could not ${taskFailureVerb(failure.action)} “${task.name}”. ${failure.error.message}`,
            };
    }
    return {};
}

function taskFailureVerb(
    action: "join" | "leave" | "reorder" | "archive" | "unarchive" | "rename",
): string {
    if (action === "reorder") return "move";
    return action;
}

/**
 * The Bots heading's word on a subtask archive or move the host refused. The task is
 * still in its bot's tree, so the reason stands under the heading it is listed
 * in until the reader asks again; a refusal for a task no longer listed has
 * nothing left to explain.
 */
function subtaskFailureError(
    happyAgent: AppHappyAgentEntry,
    roots: readonly HappyAgentSubtaskRoot[],
): Pick<SidebarSection, "error"> {
    const failures = happyAgent.subtaskFailures;
    if (failures === undefined || failures.size === 0) return {};
    for (const task of happyAgentBotSubtasks(roots)) {
        const failure = failures.get(task.conversation.id);
        if (failure)
            return {
                error: `Could not ${failure.action === "archive" ? "archive" : "move"} “${task.conversation.title}”. ${failure.error.message}`,
            };
    }
    return {};
}

function happyAgentProjectsSection(
    happyAgent: AppHappyAgentEntry,
    titleShimmerEnabled: boolean,
    /**
     * The window's folding record, when it keeps one. The whole Projects list
     * folds under its own heading the way a project folds its worktrees, kept
     * in the same record by the section's id; a window that remembers no
     * folding offers no control to fold.
     */
    folded?: ReadonlySet<string>,
): SidebarSection {
    const id = happyAgentSectionId(happyAgent.id);
    const hidden = folded?.has(id) === true;
    return {
        id,
        // Which machine this is belongs to the connection rail and the window,
        // not to a heading over the list: the heading names the kind of thing
        // beneath it, the way "Bots" does above.
        label: "Projects",
        items: hidden
            ? []
            : happyAgentSidebarTree(happyAgent)
                  .projects.flatMap((entry) => sidebarItems(entry, titleShimmerEnabled))
                  .map((item) => ({
                      ...item,
                      id: happyAgentItemId(happyAgent.id, item.id),
                      ...happyAgentSidebarItemAvailability(item, happyAgent),
                  })),
        // The heading stays, so the list can always be shown again from it.
        ...(folded === undefined
            ? {}
            : {
                  secondaryAction: {
                      icon: hidden ? ("eye" as const) : ("eye-off" as const),
                      label: hidden ? "Show projects" : "Hide projects",
                      reveal: "hover" as const,
                  },
              }),
        // Project creation belongs to the Happy Agent named by this section.
        // Disabled, not removed, while a machine already seen is offline.
        ...(happyAgent.session
            ? {
                  action: {
                      busy: happyAgent.projectAdd?.pending === true,
                      disabled: happyAgent.status !== "connected",
                      icon: "plus" as const,
                      label: "Add project",
                      reveal: "always" as const,
                  },
                  ...(happyAgent.projectAdd?.error !== undefined
                      ? { error: happyAgent.projectAdd.error }
                      : {}),
              }
            : {}),
        // What a Happy Agent said when it failed belongs under its own heading.
        ...(happyAgent.status === "error" && happyAgent.message !== undefined
            ? { error: happyAgent.message }
            : {}),
        ...(happyAgent.projects.length === 0 && !hidden
            ? {
                  empty:
                      happyAgent.status === "connected"
                          ? {
                                description: "Choose a repository folder on this Mac.",
                                icon: "plus" as const,
                                title: "No projects yet",
                            }
                          : {
                                description: happyAgentEmptyDescription(happyAgent),
                                icon: "link" as const,
                                title: happyAgentStatusLabel(happyAgent),
                                actionLabel: "Open settings",
                            },
              }
            : {}),
    };
}

/**
 * Command-number destinations prioritize the project somebody is working in:
 * its main checkout is always first, followed by its visible workspaces. Any
 * remaining digits focus other projects in the sidebar's ordinary top-to-bottom
 * Happy Agent/project order. Sidebar intersects this order with the rows it actually
 * draws, so a folded workspace consumes no number.
 */
function projectShortcutTargets(
    directory: AppHappyAgentDirectorySnapshot,
    activeHappyAgentId: string | undefined,
    activeProjectId: HappyAgentProjectId | undefined,
): readonly SidebarNumberShortcutTarget[] {
    const activeHappyAgent = directory.happyAgents.find(
        (happyAgent) => happyAgent.id === activeHappyAgentId,
    );
    const activeProject = activeHappyAgent?.projects.find(
        (project) => project.id === activeProjectId,
    );
    const target = (
        happyAgent: AppHappyAgentEntry,
        id: HappyAgentProjectId | HappyAgentWorktreeId,
    ): SidebarNumberShortcutTarget => ({
        itemId: happyAgentItemId(happyAgent.id, id),
        sectionId: happyAgentSectionId(happyAgent.id),
    });
    return [
        ...(activeHappyAgent && activeProject
            ? [
                  target(activeHappyAgent, activeProject.id),
                  ...activeProject.worktrees.map((worktree) =>
                      target(activeHappyAgent, worktree.id),
                  ),
              ]
            : []),
        ...directory.happyAgents.flatMap((happyAgent) =>
            happyAgent.projects.flatMap((project) =>
                happyAgent.id === activeHappyAgent?.id && project.id === activeProject?.id
                    ? []
                    : [target(happyAgent, project.id)],
            ),
        ),
    ];
}

/** One directory entry's unified inner-health and outer-route availability. */
function happyAgentEntryAvailability(
    happyAgent: AppHappyAgentEntry,
): HappyAgentAvailabilitySnapshot | undefined {
    if (!happyAgent.session) return undefined;
    return happyAgentAvailabilityProject(happyAgent.session.connection.get(), true, {
        status: happyAgent.status,
        ...(happyAgent.message === undefined ? {} : { message: happyAgent.message }),
    });
}

/** The primary Happy Agent backing window-wide settings and chrome. */
export function hostHappyAgent(
    directory: AppHappyAgentDirectorySnapshot,
): AppHappyAgentEntry | undefined {
    return directory.happyAgents[0];
}

/**
 * What a section says when it is standing empty because its machine has not
 * answered.
 *
 * It does not say there is nothing there. Whatever that machine holds is
 * unknown while the connection is down, and telling the reader their work is
 * gone would be a worse mistake than telling them nothing. So this says only
 * where the connection stands; the failure itself is already stated under the
 * heading, and is not repeated here.
 */
function happyAgentEmptyDescription(happyAgent: AppHappyAgentEntry): string {
    if (happyAgent.status === "connecting") return "Connecting to this machine…";
    if (happyAgent.status === "error") return "Its projects will appear once it answers again.";
    return "Connect this machine to see its projects.";
}

function happyAgentStatusLabel(happyAgent: AppHappyAgentEntry): string {
    if (happyAgent.status === "connected") return "Connected";
    if (happyAgent.status === "connecting") return "Connecting…";
    return happyAgent.status === "error" ? "Not reachable" : "Disconnected";
}

/**
 * The pinned row that opens the addressed Happy Agent's inbox. It belongs with the
 * pinned rows rather than under a project because the questions it collects come
 * from every session on that machine at once, and the person answering them is
 * working through a queue rather than visiting a repository.
 */
const INBOX_ITEM = "inbox";

/**
 * The row that opens the addressed Happy Agent's artifacts. It gathers from
 * every chat on the machine at once, so it heads the sidebar's first group
 * rather than being filed under any one of them, and it never moves.
 */
const ARTIFACTS_ITEM = "artifacts";

/** A subscription to nothing, for a hook whose store is absent. */
const SUBSCRIBE_NONE = (): (() => void) => () => undefined;

/** How many todos a list holds open, headings aside, once it has been read. */
function todoListActiveCount(store: HappyAgentTodoListStore | undefined): number | undefined {
    const list = store?.get();
    return list?.status === "ready"
        ? list.active.filter((todo) => happyAgentTodoHeading(todo.text) === undefined).length
        : undefined;
}

const ARTIFACTS_SIDEBAR_ITEM: SidebarItem = {
    icon: "package",
    id: ARTIFACTS_ITEM,
    kind: "project",
    label: "Artifacts",
    reorderable: false,
};

/**
 * The workspace window. It owns no product state: it subscribes to the directory
 * of Happy Agents, renders their projects as one sidebar, and hands the addressed Happy Agent's
 * own stores to the surface below. A Happy Agent that is still connecting, or one the
 * reader has disconnected from, keeps the sidebar and states itself in the
 * content area instead of taking the window away.
 */
export function AppHappyAgentView(props: AppHappyAgentViewProps) {
    const directory = useSyncExternalStore(
        props.happyAgents.subscribe,
        props.happyAgents.get,
        props.happyAgents.get,
    );
    const appearance = useSyncExternalStore(
        props.appearance.subscribe,
        props.appearance.get,
        props.appearance.get,
    );
    // Read through a store that never changes when the host supplies none, so
    // the hook order does not depend on whether one was supplied.
    const settingsStore = props.settings ?? settingsStoreNone;
    const settings = useSyncExternalStore(
        settingsStore.subscribe,
        settingsStore.get,
        settingsStore.get,
    );
    // Likewise for the footer's keep-awake control, which can be absent
    // without the hook order depending on it.
    const keepAwakeStore = props.keepAwake ?? keepAwakeStoreNone;
    const keepAwake = useSyncExternalStore(
        keepAwakeStore.subscribe,
        keepAwakeStore.get,
        keepAwakeStore.get,
    );
    const statusBarStore = props.statusBar ?? statusBarStoreNoop;
    const statusBar = useSyncExternalStore(
        statusBarStore.subscribe,
        statusBarStore.get,
        statusBarStore.get,
    );
    const titleShimmerStore = props.titleShimmer ?? titleShimmerStoreNoop;
    const titleShimmerEnabled = useSyncExternalStore(
        titleShimmerStore.subscribe,
        titleShimmerStore.get,
        titleShimmerStore.get,
    ).titleShimmerEnabled;
    // The order the reader arranged the pinned rows in belongs to the window
    // rather than to any one Happy Agent, so a machine going away rearranges nothing.
    const experimentsStore = props.experiments ?? experimentsStoreNoop;
    // The inbox and folders are still being built, so they are offered only to
    // a reader who has asked for unfinished work in settings. The switch is
    // read here so their routes, sidebar rows, and dialogs cannot disagree
    // about whether the surfaces exist.
    const experimental = useSyncExternalStore(
        experimentsStore.subscribe,
        experimentsStore.get,
        experimentsStore.get,
    );
    // Each connection follows its authenticated reader's Projects preference.
    const projectsVisibilityStore = props.projectsVisibility ?? projectsVisibilityStoreNoop;
    const projectsVisibility = useSyncExternalStore(
        projectsVisibilityStore.subscribe,
        projectsVisibilityStore.get,
        projectsVisibilityStore.get,
    );
    // Whether a row or tab that sees its stem cell get an icon grows it there.
    const stemCellAnimationStore = props.stemCellAnimation ?? stemCellAnimationStoreNoop;
    const stemCellAnimation = useSyncExternalStore(
        stemCellAnimationStore.subscribe,
        stemCellAnimationStore.get,
        stemCellAnimationStore.get,
    ).stemCellAnimationEnabled;
    const navigationOrderStore = props.navigationOrder ?? happyAgentNavigationOrderStoreNoop;
    const navigationOrder = useSyncExternalStore(
        navigationOrderStore.subscribe,
        navigationOrderStore.get,
        navigationOrderStore.get,
    );
    // Which projects and folders the reader folded shut. Like the order above it
    // this belongs to the window: a machine going away must not unfold the tree
    // somebody arranged, and coming back must not fold it again.
    const sidebarCollapseStore = props.sidebarCollapse ?? happyAgentSidebarCollapseStoreNoop;
    const sidebarCollapse = useSyncExternalStore(
        sidebarCollapseStore.subscribe,
        sidebarCollapseStore.get,
        sidebarCollapseStore.get,
    );
    // What the sidebar's search field holds; anything in it replaces the
    // sidebar's contents with what matches.
    const sidebarSearchStore = props.sidebarSearch ?? happyAgentSidebarSearchStoreNoop;
    const sidebarSearch = useSyncExternalStore(
        sidebarSearchStore.subscribe,
        sidebarSearchStore.get,
        sidebarSearchStore.get,
    );
    const searching = sidebarSearch.query.trim().length > 0;
    // Which bots the reader muted or hid. Each machine keeps the reader's own
    // choices, and the window keeps its last copy of them, so a machine
    // dropping off neither unmutes nor reveals one.
    const attentionStore = props.attention ?? happyAgentAttentionStoreNoop;
    const attention = useSyncExternalStore(
        attentionStore.subscribe,
        attentionStore.get,
        attentionStore.get,
    );
    const sidebarVisibilityStore = props.sidebarVisibility ?? happyAgentSidebarVisibilityStoreNoop;
    const sidebarVisibility = useSyncExternalStore(
        sidebarVisibilityStore.subscribe,
        sidebarVisibilityStore.get,
        sidebarVisibilityStore.get,
    );
    // The palette is opened from anywhere in the window, so the key that opens
    // it is bound here rather than inside a workspace. Only whether it is open
    // is read here: what it holds is the palette's own business, and reading
    // the query at this level would re-render the whole window per keystroke.
    const commandPaletteStore = props.commandPalette ?? commandPaletteStoreNoop;
    const commandPaletteOpen = useSyncExternalStore(
        commandPaletteStore.subscribe,
        () => commandPaletteStore.get().open,
        () => commandPaletteStore.get().open,
    );
    // What a voice call is pointing at. Only that is read here: the call's
    // transcript moves many times a second and must not re-render the window.
    const gptLiveStore = props.gptLive ?? gptLiveStoreNoop;
    const voiceFocus = useSyncExternalStore(
        gptLiveStore.subscribe,
        () => gptLiveStore.get().voiceFocus,
        () => gptLiveStore.get().voiceFocus,
    );
    const windowStateStore = props.windowState ?? happyAgentWindowStoreNoop;
    const windowState = useSyncExternalStore(
        windowStateStore.subscribe,
        windowStateStore.get,
        windowStateStore.get,
    );
    const active =
        directory.happyAgents.find((happyAgent) => happyAgent.id === props.happyAgentId) ??
        directory.happyAgents[0] ??
        undefined;
    const viewerId = happyAgentOwnerAuthor.id;
    const stemCellsSettingsStore =
        active?.session?.stemCellsSettings?.() ?? happyAgentStemCellsSettingsStoreNoop;
    const stemCellsSettings = useSyncExternalStore(
        stemCellsSettingsStore.subscribe,
        stemCellsSettingsStore.get,
        stemCellsSettingsStore.get,
    );
    // Creation waits for the daemon to acknowledge an opt-in. Turning it off
    // withholds creation immediately, including while the clear is in flight.
    const stemCellsEnabled =
        stemCellsSettings.status === "ready" &&
        stemCellsSettings.stemCellsEnabled &&
        !stemCellsSettings.saving;
    const activeAvailability = active ? happyAgentEntryAvailability(active) : undefined;
    const addressedProject =
        active && props.groupId ? rowOwnerFind(active.projects, props.groupId)?.project : undefined;
    const shortcutProject = activeAvailability?.online ? addressedProject : undefined;
    const workspaceCreateTarget =
        active && shortcutProject?.lifecycle.phase === "ready"
            ? { projectId: shortcutProject.id, happyAgentId: active.id }
            : undefined;
    // Cmd-N makes a task where the Tasks heading's + would: on the machine on
    // screen, once it is up and new enough to make them. Anywhere else the
    // chord is left alone rather than answered with an error.
    const taskCreateTarget =
        active?.session?.workspace &&
        activeAvailability?.online === true &&
        props.onTaskCreateOpen &&
        happyAgentTaskCreateSupported(active)
            ? active.id
            : undefined;
    const activeHappyAgentOnline = (): boolean => {
        const current = props.happyAgents.get();
        const happyAgent =
            current.happyAgents.find((entry) => entry.id === props.happyAgentId) ??
            current.happyAgents[0] ??
            undefined;
        return happyAgent ? (happyAgentEntryAvailability(happyAgent)?.online ?? false) : false;
    };
    const happyAgentOf = (happyAgentId: string) =>
        directory.happyAgents.find((happyAgent) => happyAgent.id === happyAgentId);
    // The pinned row carries a live count, so the window subscribes to the
    // addressed Happy Agent's inbox whether or not the inbox itself is open: the point of
    // the count is to be seen while the reader is doing something else.
    const inboxStore = active?.session?.inbox ?? happyAgentInboxStoreNoop;
    const inbox = useSyncExternalStore(inboxStore.subscribe, inboxStore.get, inboxStore.get);
    const daemonStore = props.daemon ?? sidebarDaemonStoreNoop;
    const daemon = useSyncExternalStore(daemonStore.subscribe, daemonStore.get, daemonStore.get);
    const inboxPending = inbox.pending.length;
    // Whether the addressed Happy Agent keeps artifacts at all. The catalog is
    // read whether or not it is on screen, because the panel beside every chat
    // exists only once the machine has answered that it does; one too old to
    // know about them answers 404 and is offered no panel. The sidebar's row
    // stays either way, and its page says when there is nothing to show.
    const artifactCatalog: HappyAgentArtifactCatalogStore =
        active?.session?.artifacts?.catalog() ?? happyAgentArtifactCatalogStoreNoop;
    const artifactsAvailable = useSyncExternalStore(
        artifactCatalog.subscribe,
        () => artifactCatalog.get().availability === "available",
        () => artifactCatalog.get().availability === "available",
    );
    // The addressed Happy Agent's Surfaces: the sidebar's own list of them and
    // the dialogs that browse and make them read this one catalog, whatever is
    // on screen. One too old to keep Surfaces answers 404 and is offered none.
    const surfaceCatalogStore: HappyAgentSurfaceCatalogStore =
        active?.session?.surfaces?.catalog() ?? happyAgentSurfaceCatalogStoreNoop;
    const surfaceCatalog = useSyncExternalStore(
        surfaceCatalogStore.subscribe,
        surfaceCatalogStore.get,
        surfaceCatalogStore.get,
    );
    // A Surface a message names opens as its sidebar row does.
    const referenceSurfaces: MessageReferenceSurfaces | undefined = active
        ? {
              names: messageReferenceSurfaceNames(surfaceCatalog),
              open: (surfaceId) => props.onSurfaceOpen?.(active.id, surfaceId),
          }
        : undefined;
    const surfaceSupportStore =
        active?.session?.surfaces?.support() ?? happyAgentSurfaceSupportStoreNone;
    const surfaceSupport = useSyncExternalStore(
        surfaceSupportStore.subscribe,
        surfaceSupportStore.get,
        surfaceSupportStore.get,
    );
    /**
     * Opens what an artifact, bot, or task Surface points at, where it always
     * opens: the artifact viewer, or the bot's or task's own chat. Answers
     * whether it could — not for one the reader cannot see, nor for a task
     * they are not in.
     */
    const surfaceTargetOpen = (
        happyAgent: AppHappyAgentEntry,
        surface: HappyAgentSurface,
    ): boolean => {
        const target = surface.target;
        if (target?.state !== "available") return false;
        if (target.kind === "artifact") {
            if (props.onArtifactOpen === undefined) return false;
            props.onArtifactOpen(happyAgent.id, target.id);
            return true;
        }
        const place =
            target.kind === "bot"
                ? happyAgent.bots.find((bot) => bot.id === target.id)
                : happyAgent.tasks?.find((task) => task.id === target.id);
        if (place === undefined) return false;
        props.onChatSelect(happyAgent.id, place.workspaceId, place.conversation.id);
        return true;
    };
    // The todo list on screen is counted from its own store, which holds the
    // reader's changes the moment they are made, so ticking one off moves its
    // sidebar count at once. Every other list is counted by the catalog.
    const openSurface =
        props.surfaceId === undefined
            ? undefined
            : surfaceCatalog.surfaces.find((surface) => surface.id === props.surfaceId);
    const openTodoList =
        openSurface?.type.kind === "todo"
            ? active?.session?.surfaces?.todoList(openSurface.id)
            : undefined;
    const openTodoCount = useSyncExternalStore(
        openTodoList?.subscribe ?? SUBSCRIBE_NONE,
        () => todoListActiveCount(openTodoList),
        () => todoListActiveCount(openTodoList),
    );
    const activeTodoCounts =
        openSurface === undefined || openTodoCount === undefined
            ? surfaceCatalog.activeTodoCounts
            : new Map(surfaceCatalog.activeTodoCounts).set(openSurface.id, openTodoCount);
    const desktop = props.platform === "desktop";
    // Happy's own update wins the row. Restarting the app is the larger event of
    // the two, and it carries the agent with it, so the agent states its case
    // once there is nothing bigger waiting.
    const applicationUpdate = props.update?.status === "downloaded" ? props.update : undefined;
    const agentUpdate = applicationUpdate ? undefined : agentUpdateOffer(daemon);
    const releaseNotesStore = props.agentReleaseNotes ?? agentReleaseNotesStoreNoop;
    const releaseNotes = useSyncExternalStore(
        releaseNotesStore.subscribe,
        releaseNotesStore.get,
        releaseNotesStore.get,
    );
    const updateStore = props.agentUpdate ?? agentUpdateStoreNoop;
    const updateProgress = useSyncExternalStore(
        updateStore.subscribe,
        updateStore.get,
        updateStore.get,
    );
    const updateHost = hostHappyAgent(directory);
    // Tiers are one list for the window, remembered by the host: every
    // machine's Changes is split by the same tiers Settings shows.
    const changeTiersStore = updateHost?.session?.workspace.changeTiers;
    // An update under way owns the slot: the window keeps working beside it,
    // and the offer comes back only once it has finished and been cleared.
    const sidebarUpdate = updateProgress ? (
        <AgentUpdateSidebar
            catalog={updateHost ?? { bots: [], projects: [] }}
            onConversationOpen={(groupId, sessionId) => {
                if (updateHost) props.onChatSelect(updateHost.id, groupId, sessionId);
            }}
            snapshot={updateProgress}
            store={updateStore}
        />
    ) : applicationUpdate ? (
        <SidebarUpdateAction
            action={applicationUpdate.action}
            detail={applicationUpdate.detail}
            onAction={props.onUpdateApply}
            status={applicationUpdate.status}
            subject="application"
            version={applicationUpdate.version}
        />
    ) : agentUpdate ? (
        <SidebarUpdateAction
            action="install"
            {...(releaseNotes?.to === agentUpdate.version ? { notes: releaseNotes } : {})}
            onAction={daemonStore.daemonInstall}
            status={agentUpdate.status}
            subject="happyAgent"
            version={agentUpdate.version}
        />
    ) : undefined;
    // The pinned rows as the window offers them. What the reader has made of
    // that order is applied below, so this list only ever states which rows this
    // window has and what each one is.
    // The inbox belongs to the addressed machine, so it appears only while that
    // machine is reachable: a queue of questions is meaningless from a Happy Agent that
    // cannot say what it is waiting on.
    const pinnedOffered: SidebarItem[] =
        experimental.inbox && active?.session?.inbox
            ? [
                  {
                      badge: inboxPending,
                      icon: "bell",
                      id: INBOX_ITEM,
                      kind: "action",
                      label: "Inbox",
                  },
              ]
            : [];
    const pinned = pinnedArrange(pinnedOffered, navigationOrder.order);
    // Search heads the open sidebar, and opens the same palette as ⌘K.
    const sidebarSearchRow = props.commandPalette
        ? {
              label: "Search",
              shortcut: APP_SHORTCUTS.paletteOpen,
              onOpen: () => commandPaletteStore.paletteOpen(),
          }
        : undefined;
    const sidebarFooter = (
        <SidebarFooter
            voice={
                props.gptLive ? (
                    <AppGptLivePhone store={props.gptLive} experiments={props.experiments} />
                ) : undefined
            }
            actions={sidebarUpdate}
            devMenu={
                props.buildIdentity ? (
                    <DevBuildMenu
                        branch={props.buildIdentity.branch}
                        label={props.buildIdentity.label}
                        onBlueprintOpen={props.onBlueprintOpen}
                        onCopyPath={() =>
                            void navigator.clipboard
                                .writeText(props.buildIdentity!.path)
                                .catch(() => undefined)
                        }
                        performance={props.performance}
                        path={props.buildIdentity.path}
                    />
                ) : undefined
            }
            {...(statusBar.themeShown
                ? {
                      theme: {
                          appearance: appearance.appearance,
                          supportedModes: props.appearance.supportedModes,
                          mode: appearance.mode,
                          onModeSelect: (mode: ThemeMode) =>
                              props.appearance.appearanceSelect(mode),
                      },
                  }
                : {})}
            {...(props.keepAwake && statusBar.keepAwakeShown
                ? {
                      keepAwake: {
                          active: keepAwake.active,
                          mode: keepAwake.mode,
                          onModeSelect: (mode: KeepAwakeMode) => props.keepAwake?.modeSelect(mode),
                      },
                  }
                : {})}
            onSettingsOpen={props.onSettingsOpen}
        />
    );
    // The spaces sidebar comes with Stem Cells: the person turned it on for
    // this Happy Agent and it keeps one. It follows the switch at once, before
    // the daemon confirms, and until the daemon first answers it follows this
    // connection's last answer, so a reload paints the chosen sidebar at once.
    // Anything older, or Stem Cells off, keeps the classic sidebar.
    const stemCellsChosen =
        stemCellsSettings.status === "ready"
            ? stemCellsSettings.stemCellsEnabled
            : stemCellsSettings.status === "loading" && stemCellsSettings.hint === true;
    const spacesStore =
        (stemCellsChosen ? active?.session?.spaces : undefined) ?? happyAgentSpacesStoreNoop;
    const spaces = useSyncExternalStore(spacesStore.subscribe, spacesStore.get, spacesStore.get);
    const spacesEnabled = stemCellsChosen && spaces.availability !== "unsupported";
    const spacesPlaces: HappyAgentSpacesPlaces = {
        bots: active?.bots ?? [],
        tasks: active?.tasks ?? NO_TASKS,
        chatGroupOf: (agentId) => chatGroupFind(active?.projects ?? NO_PROJECTS, agentId),
        surfaceIcon: (surfaceId) => {
            const surface = surfaceCatalog.surfaces.find((entry) => entry.id === surfaceId);
            return surface ? surfaceTypeIcon(surface.type) : undefined;
        },
    };
    const spacesProjects = active ? happyAgentSidebarTree(active).projects : [];
    const spacesSessionRow = (agentId: string): SidebarItem | undefined => {
        // A session is a subtask at any depth, or a task of its own
        // that Prioritizing shows under the work that started it.
        const subtask =
            subtaskFind(
                [...spacesPlaces.tasks, ...spacesPlaces.bots].flatMap((owner) => owner.subtasks),
                agentId,
            ) ?? spacesPlaces.tasks.find((task) => task.conversation.id === agentId);
        if (!subtask) return undefined;
        // A subtask with a checkout of its own is that checkout's
        // row, and wears its project's picture like the task's
        // other worktrees, or the worktree glyph where the project
        // has none.
        const [row] = botSubtaskSidebarItems(
            [
                {
                    workspaceId: subtask.workspaceId,
                    path: subtask.path,
                    conversation: subtask.conversation,
                    subtasks: [],
                },
            ],
            active?.projects ?? NO_PROJECTS,
            titleShimmerEnabled,
        );
        if (!row) return undefined;
        const { contextAvatars, ...rest } = row;
        return contextAvatars?.some((avatar) => avatar.imageUrl !== undefined)
            ? { ...rest, contextAvatars }
            : contextAvatars?.length
              ? { ...rest, icon: "branch" as const }
              : rest;
    };
    // Stories are an experiment each person turns on. Until the daemon answers,
    // the device's last answer decides, so the row's band is there (or not)
    // from the first frame and never pushes the sidebar down afterwards.
    const storiesHub = active?.session?.stories?.();
    const storiesSettingsStore = storiesHub?.settings() ?? happyAgentStoriesSettingsStoreNoop;
    const storiesSettings = useSyncExternalStore(
        storiesSettingsStore.subscribe,
        storiesSettingsStore.get,
        storiesSettingsStore.get,
    );
    const storiesOn =
        storiesSettings.status === "ready"
            ? storiesSettings.storiesEnabled
            : storiesSettings.status === "loading" && storiesSettings.hint === true;
    const stories = storiesOn ? storiesHub : undefined;
    const storiesRow = stories ? <HappyAgentStoriesRow hub={stories} /> : undefined;
    // Scrolling on through the sidebar's rows folds the stories row out of the way.
    const storiesBodyWheel = stories
        ? (deltaY: number) => {
              if (deltaY > 0) stories.row().rowCollapse();
          }
        : undefined;
    const storyRender = stories
        ? (artifactId: string, fit: InlinePageFit) => (
              <HappyAgentStoryInline fit={fit} hub={stories} storyId={artifactId} />
          )
        : undefined;
    // A proposal Prioritizing makes is drawn in its chat by the sidebar's own rows.
    const sidebarProposalsStore = spacesEnabled ? active?.session?.sidebarProposals : undefined;
    const sidebarProposal = sidebarProposalsStore
        ? (artifactId: string, fit: InlinePageFit) => (
              <HappyAgentSidebarProposal
                  artifactId={artifactId}
                  fit={fit}
                  places={spacesPlaces}
                  sessionRow={spacesSessionRow}
                  snapshot={spaces}
                  stemCellAnimation={stemCellAnimation}
                  store={sidebarProposalsStore}
                  titleShimmerEnabled={titleShimmerEnabled}
              />
          )
        : undefined;
    const spacesNavigation: HappyAgentSpacesNavigation | undefined = active
        ? {
              onChatSelect: (groupId, chatId) => props.onChatSelect(active.id, groupId, chatId),
              onGroupClose: (groupId) => props.onGroupClose?.(active.id, groupId),
              onSurfaceOpen: (surfaceId) => props.onSurfaceOpen?.(active.id, surfaceId),
          }
        : undefined;
    // What the reader had folded and hidden in the classic sidebar, which the
    // daemon's first Spaces document mirrors without knowing.
    const spacesClassic: SidebarDocumentClassic = (() => {
        const rowIdOf = (workspaceId: string) =>
            active ? happyAgentItemId(active.id, workspaceId) : workspaceId;
        const foldedSpaceIds = new Set<string>();
        const hiddenSpaceIds = new Set<string>();
        for (const space of spaces.spaces.values()) {
            const owner =
                targetOfSpace(space, spacesPlaces, "task") ??
                targetOfSpace(space, spacesPlaces, "bot");
            if (owner && sidebarCollapse.collapsed.has(rowIdOf(owner.workspaceId)))
                foldedSpaceIds.add(space.id);
            if (
                active &&
                space.target.kind === "bot" &&
                happyAgentBotAttention(attention, active.id, space.target.id as HappyAgentBotId) ===
                    "hidden"
            )
                hiddenSpaceIds.add(space.id);
        }
        const foldedSectionIds = new Set<string>(
            active
                ? [
                      ...(sidebarCollapse.collapsed.has(happyAgentBotsSectionId(active.id))
                          ? ["bots"]
                          : []),
                      ...(sidebarCollapse.collapsed.has(happyAgentTasksSectionId(active.id))
                          ? ["tasks"]
                          : []),
                  ]
                : [],
        );
        return { foldedSpaceIds, foldedSectionIds, hiddenSpaceIds };
    })();
    // The stem cell and its empty chat are one thing, opened together: in the
    // click itself on a daemon that takes the window's names for them, where
    // the first message waits for the daemon; otherwise once it has made them.
    // A section heading's `+` makes it right under that heading instead.
    const makeStuff = (sectionId: string | null = null): void => {
        if (!stemCellsEnabled || !active || !activeHappyAgentOnline()) return;
        // Without a section, new work lands right below Happy's row, wherever
        // the reader keeps it.
        const happySpace = [...spaces.spaces.values()].find((space) =>
            happyAgentSpaceHappyIs(space, spacesPlaces),
        );
        const creation = spacesStore.stemCellCreate(sectionId, happySpace?.id ?? null);
        const open = (cell: HappyAgentStemCell): void => {
            spacesStore.happyFocusUpdate(false);
            props.onChatSelect(active.id, cell.workspaceId, cell.agentId);
        };
        const opened = creation.cell;
        if (opened === undefined) {
            void creation.created.then(open).catch(() => undefined);
            return;
        }
        const { groupId, chatId } = props;
        open(opened);
        // Refused — one round trip after the click — the work never existed:
        // the window forgets it, which takes a reader still in it back to
        // where the click was made. A host with no navigation stack is sent
        // there directly.
        void creation.created.catch(() => {
            if (props.onGroupClose) props.onGroupClose(active.id, opened.workspaceId);
            else props.onChatSelect(active.id, groupId, chatId, true);
        });
    };
    // What can be made: the Surfaces this Happy Agent serves, and a bot. The
    // Create row's › lists them directly and a new stem cell offers the same.
    const createOffers: readonly MakeStuffOption[] = [
        ...(surfaceCatalog.availability === "available"
            ? surfaceCreateMenu(surfaceSupport).flatMap((item) =>
                  item.kind === "item" && item.icon
                      ? [{ id: item.id, icon: item.icon, label: item.label }]
                      : [],
              )
            : []),
        ...(active && props.onBotCreateOpen
            ? [{ id: STEM_CELL_BOT, icon: "agents" as const, label: "New bot" }]
            : []),
    ];
    const createOfferSelect = (id: string): void => {
        if (id === STEM_CELL_BOT) {
            if (active) props.onBotCreateOpen?.(active.id);
            return;
        }
        const offer = SURFACE_CREATE_OFFERS.find((entry) => entry.kind === id);
        if (offer !== undefined) surfaceCatalogStore.createOpen(offer.kind);
    };
    const spacesSidebar =
        spacesEnabled && spacesNavigation ? (
            <HappyAgentSpacesSidebar
                actions={{
                    taskLeave: (taskId) =>
                        void active?.session?.workspace
                            .taskLeave(taskId as HappyAgentTaskId)
                            .catch(() => undefined),
                    taskArchive: (taskId) =>
                        void active?.session?.workspace
                            .taskArchive(taskId as HappyAgentTaskId)
                            .catch(() => undefined),
                    botArchive: (botId) =>
                        void active?.session?.workspace
                            .botArchive(botId as HappyAgentBotId)
                            .catch(() => undefined),
                    surfaceLeave: (surfaceId) =>
                        surfaceCatalogStore.surfaceLeave(surfaceId as HappyAgentSurfaceId),
                    subtaskArchive: (agentId) =>
                        void active?.session?.workspace
                            .subtaskArchive(agentId as HappyAgentSessionId)
                            .catch(() => undefined),
                    worktreeArchive: (worktreeId) => {
                        const owner = rowOwnerFind(active?.projects ?? NO_PROJECTS, worktreeId);
                        if (owner?.worktreeId === undefined) return;
                        void active?.session?.workspace
                            .worktreeArchive(owner.project.id, owner.worktreeId)
                            .catch(() => undefined);
                    },
                    worktreeRename: (worktreeId, name) => {
                        const owner = rowOwnerFind(active?.projects ?? NO_PROJECTS, worktreeId);
                        if (owner?.worktreeId === undefined) return;
                        void active?.session?.workspace
                            .worktreeRename(owner.project.id, owner.worktreeId, name)
                            .catch(() => undefined);
                    },
                    ...(active && happyAgentTaskCreateSupported(active)
                        ? {
                              taskRename: (taskId: string, name: string) =>
                                  (
                                      active.session?.workspace.taskRename(
                                          taskId as HappyAgentTaskId,
                                          name,
                                      ) ?? Promise.resolve(false)
                                  ).catch(() => false),
                          }
                        : {}),
                    botRename: (botId, name) =>
                        (
                            active?.session?.workspace.botRename(botId as HappyAgentBotId, name) ??
                            Promise.resolve(false)
                        ).catch(() => false),
                }}
                // The integrated header holds the toggle in this lane, so the
                // spaces sidebar never shows the wordmark.
                brand={false}
                {...(storiesRow ? { topAccessory: storiesRow } : {})}
                {...(storiesBodyWheel ? { onBodyWheel: storiesBodyWheel } : {})}
                {...(spaces.stemCellError
                    ? {
                          headerAccessory: (
                              <Banner
                                  onDismiss={() => spacesStore.stemCellErrorDismiss()}
                                  tone="danger"
                              >
                                  {spaces.stemCellError.message}
                              </Banner>
                          ),
                      }
                    : {})}
                {...(sidebarSearchRow ? { search: sidebarSearchRow } : {})}
                {...(stemCellsEnabled
                    ? {
                          create: {
                              label: "Create",
                              shortcut: APP_SHORTCUTS.taskCreate,
                              onOpen: () => makeStuff(),
                          },
                      }
                    : {})}
                classic={spacesClassic}
                {...(stemCellsEnabled ? { onSectionCreate: makeStuff } : {})}
                focus={{
                    ...(props.chatId !== undefined ? { chatId: props.chatId } : {}),
                    ...(props.groupId !== undefined ? { groupId: props.groupId } : {}),
                    ...(props.surfaceId !== undefined ? { surfaceId: props.surfaceId } : {}),
                    ...(props.artifactsOpen && props.artifactId !== undefined
                        ? { artifactId: props.artifactId }
                        : {}),
                }}
                footer={sidebarFooter}
                navigation={spacesNavigation}
                now={spaces.readAt}
                titleShimmerEnabled={titleShimmerEnabled}
                stemCellAnimation={stemCellAnimation}
                sessionRow={spacesSessionRow}
                worktreeRows={(agentId) =>
                    agentWorktreeSidebarItems(agentId, spacesProjects, titleShimmerEnabled)
                }
                onChildSelect={(child) => {
                    if (!active) return;
                    const worktrees = spacesProjects.flatMap((entry) => entry.worktrees);
                    const destination = happyAgentSpacesChildDestination(
                        child,
                        spacesPlaces,
                        worktrees,
                        (worktreeId) =>
                            active.session?.workspace
                                .get()
                                .groupResume?.get(worktreeId as HappyAgentGroupId),
                    );
                    if (!destination) return;
                    if (child.kind === "worktree") {
                        const worktree = worktrees.find((entry) => entry.id === child.worktreeId);
                        if (worktree)
                            workspaceChangesShowOnOpen(active.session?.workspace, worktree);
                    }
                    props.onChatSelect(active.id, destination.groupId, destination.chatId);
                }}
                onChatAside={(agentId, label) =>
                    active?.session?.workspace.panel.chatTabOpen(
                        agentId as HappyAgentSessionId,
                        label,
                    )
                }
                onSidebarOpen={(artifactId) =>
                    active?.session?.workspace.panel.artifactViewOpen(
                        artifactId as HappyAgentArtifactId,
                    )
                }
                places={spacesPlaces}
                {...(sidebarProposalsStore ? { proposals: sidebarProposalsStore } : {})}
                snapshot={spaces}
                store={spacesStore}
            />
        ) : undefined;
    const spaceOfChat = (sessionId: string) =>
        happyAgentSpaceFocused(spaces, { chatId: sessionId });
    const happySpace = [...spaces.spaces.values()].find((space) =>
        happyAgentSpaceHappyIs(space, spacesPlaces),
    );
    const workspaceSpaces: HappyAgentWorkspaceSpaces = {
        chatMark: (sessionId) => {
            const space = spaceOfChat(sessionId);
            // A session wears the picture Prioritizing chose for it, whether or
            // not its row is shown.
            return space
                ? {
                      ...happyAgentSpaceMark(space, spacesPlaces, stemCellAnimation),
                      label: happyAgentSpaceLabel(space),
                  }
                : happyAgentSessionMark(spaces, sessionId);
        },
        floatyKey: (sessionId) => spaceOfChat(sessionId)?.id,
        chatHeader: (sessionId, settled) => {
            const space = spaceOfChat(sessionId);
            return space === undefined || happyAgentSpaceHappyIs(space, spacesPlaces)
                ? undefined
                : happyAgentSpacesIntroHeader(space, {
                      settled,
                      stemCellAnimation,
                      options: createOffers,
                      onOptionSelect: createOfferSelect,
                  });
        },
        chatNotes: (sessionId) =>
            experimental.batchNotes &&
            happySpace !== undefined &&
            happySpace.target.agentId === sessionId
                ? happyAgentSpacesNotes(spaces.batches)
                : undefined,
    };
    const sidebar = (
        <Sidebar
            // A search replaces everything below the field, pinned rows too.
            actions={searching ? [] : pinned}
            {...(sidebarSearchRow ? { searchRow: sidebarSearchRow } : {})}
            // A todo list is made from the sidebar's own heading, beside the
            // control that hides it. A Happy Agent without Surfaces offers none.
            {...(surfaceCatalog.availability === "available"
                ? {
                      headerAction: {
                          disabled: active?.status !== "connected",
                          icon: "plus" as const,
                          label: "New…",
                          menu: surfaceCreateMenu(surfaceSupport),
                      },
                      onHeaderMenuSelect: (id: string) => {
                          const offer = SURFACE_CREATE_OFFERS.find((entry) => entry.kind === id);
                          if (offer !== undefined) surfaceCatalogStore.createOpen(offer.kind);
                      },
                  }
                : {})}
            {...(props.sidebarSearch
                ? {
                      search: {
                          onValueChange: sidebarSearchStore.queryUpdate,
                          placeholder: "Search",
                          value: sidebarSearch.query,
                      },
                  }
                : {})}
            numberShortcuts="navigate"
            numberShortcutTargets={projectShortcutTargets(
                directory,
                active?.id,
                addressedProject?.id,
            )}
            activeItemId={
                experimental.inbox && props.inboxOpen
                    ? INBOX_ITEM
                    : props.artifactsOpen
                      ? ARTIFACTS_ITEM
                      : props.surfaceId !== undefined
                        ? happyAgentItemId(props.happyAgentId, surfaceRowId(props.surfaceId))
                        : props.groupId
                          ? happyAgentItemId(
                                props.happyAgentId,
                                activeRowId(
                                    active?.bots ?? [],
                                    active?.tasks ?? [],
                                    props.groupId,
                                    props.chatId,
                                ),
                            )
                          : ""
            }
            // The integrated band holds the toggle and search in this lane, so
            // the product mark stands down.
            brand={false}
            {...(storiesRow ? { topAccessory: storiesRow } : {})}
            {...(storiesBodyWheel ? { onBodyWheel: storiesBodyWheel } : {})}
            footer={sidebarFooter}
            headerAccessory={
                // Reachability is the footer's line, not this heading's. What
                // stays here is what only this list can
                // say: that the Happy Agent is up and still did not hand over its
                // sessions.
                active?.status === "connected" && active.projectsStatus === "error" ? (
                    <Banner
                        action={{
                            label: "Retry",
                            onClick: () => active.session?.workspace.conversationListRetry(),
                        }}
                        tone="danger"
                        title="Sessions unavailable"
                    >
                        {`${active.label} did not return its projects.`}
                    </Banner>
                ) : active?.status === "connected" && active.projectsStatus === "loading" ? (
                    // Also only while the Happy Agent is up. Losing it resets the list to
                    // loading, and "Loading sessions…" under a footer saying the
                    // machine is unreachable is a promise nothing is keeping.
                    <Banner tone="neutral">Loading sessions…</Banner>
                ) : undefined
            }
            itemMenuItems={(item) => {
                const row = happyAgentItemParse(item.id);
                const happyAgent = happyAgentOf(row.happyAgentId);
                if (!happyAgent) return [];
                // A chat a search found is only opened from here.
                if (chatRowParse(row.id) !== undefined) return [];
                // A joined Surface is left from its menu, as a task is; there
                // is nothing else to do to one from here.
                const surfaceId = surfaceRowParse(row.id);
                if (surfaceId !== undefined)
                    return surfaceCatalog.joined.some((surface) => surface.id === surfaceId)
                        ? [{ kind: "item", id: ROW_MENU_LEAVE, label: "Leave", icon: "close" }]
                        : [];
                if (happyAgent.status !== "connected") {
                    // Muting and hiding are this window's own record, so a
                    // bot keeps offering them while its machine is away.
                    const bot = happyAgent.bots.find((entry) => entry.workspaceId === row.id);
                    return bot && props.attention
                        ? botAttentionMenuItems(
                              happyAgentBotAttention(attention, happyAgent.id, bot.id),
                          )
                        : [];
                }
                return rowSurfaceMenuItems(
                    happyAgent,
                    row.id,
                    rowMenuItems(
                        happyAgent.projects,
                        happyAgent.bots,
                        happyAgent.tasks ?? [],
                        { ...item, id: row.id },
                        happyAgentTaskCreateSupported(happyAgent),
                        props.attention
                            ? (bot) => happyAgentBotAttention(attention, happyAgent.id, bot.id)
                            : undefined,
                    ),
                );
            }}
            // Each heading makes its own kind of thing on the Happy Agent it
            // names: a bot is named on a surface of its own, a project is chosen
            // from this machine's folders.
            onSectionAction={(sectionId, source) => {
                const section = happyAgentSectionParse(sectionId);
                if (!section) return;
                // Folding the list is this window's own record, whatever the
                // machine behind it is doing. The Tasks heading's second
                // control browses instead, below.
                if (source === "secondary" && section.kind !== "tasks") {
                    sidebarCollapseStore.rowCollapseToggle(sectionId);
                    return;
                }
                const happyAgent = happyAgentOf(section.happyAgentId);
                if (happyAgent?.status !== "connected") {
                    props.onSettingsOpen();
                    return;
                }
                const workspace = happyAgent.session?.workspace;
                if (!workspace) return;
                if (section.kind === "bots") props.onBotCreateOpen?.(happyAgent.id);
                else if (section.kind === "tasks") {
                    if (source !== "secondary" && happyAgentTaskCreateSupported(happyAgent))
                        props.onTaskCreateOpen?.(happyAgent.id);
                    else workspace.taskBrowseOpen();
                } else workspace.projectAdd();
            }}
            itemRename={{
                actionId: ROW_MENU_RENAME,
                onSubmit: (item, name) => {
                    const row = happyAgentItemParse(item.id);
                    const happyAgent = happyAgentOf(row.happyAgentId);
                    const workspace = happyAgent?.session?.workspace;
                    if (happyAgent?.status !== "connected" || !workspace) return;
                    const task = happyAgent.tasks?.find((entry) => entry.workspaceId === row.id);
                    if (task) {
                        void workspace.taskRename(task.id, name).catch(() => undefined);
                        return;
                    }
                    const bot = happyAgent.bots.find((entry) => entry.workspaceId === row.id);
                    if (bot) {
                        void workspace.botRename(bot.id, name).catch(() => undefined);
                        return;
                    }
                    const owner = rowOwnerFind(happyAgent.projects, row.id);
                    if (!owner) return;
                    void (
                        owner.worktreeId
                            ? workspace.worktreeRename(owner.project.id, owner.worktreeId, name)
                            : workspace.projectRename(owner.project.id, name)
                    ).catch(() => undefined);
                },
            }}
            onItemMenuSelect={(item, actionId) => {
                const row = happyAgentItemParse(item.id);
                const happyAgent = happyAgentOf(row.happyAgentId);
                if (!happyAgent) return;
                const attentionBot = happyAgent.bots.find(
                    (candidate) => candidate.workspaceId === row.id,
                );
                if (attentionBot && actionId === ROW_MENU_MUTE) {
                    attentionStore.botMutedUpdate(
                        happyAgent.id,
                        attentionBot.id,
                        happyAgentBotAttention(attention, happyAgent.id, attentionBot.id) !==
                            "muted",
                    );
                    return;
                }
                // The open conversation stays open: a hidden bot only leaves
                // the list, so hiding the one being read moves nobody.
                if (attentionBot && actionId === ROW_MENU_HIDE) {
                    attentionStore.botHiddenUpdate(happyAgent.id, attentionBot.id, true);
                    return;
                }
                if (happyAgent.status !== "connected") return;
                const surfaceId = surfaceRowParse(row.id);
                if (surfaceId !== undefined) {
                    if (actionId === ROW_MENU_LEAVE)
                        happyAgent.session?.surfaces?.catalog().surfaceLeave(surfaceId);
                    return;
                }
                if (actionId === ROW_MENU_SURFACE_ADD || actionId === ROW_MENU_SURFACE_REMOVE) {
                    const found = rowReferenceOf(happyAgent, row.id);
                    const catalog = happyAgent.session?.surfaces?.catalog();
                    if (found === undefined || catalog === undefined) return;
                    if (actionId === ROW_MENU_SURFACE_ADD) {
                        catalog.referenceAdd(found.reference, found.name);
                        return;
                    }
                    const kept = happyAgentSurfaceReferenceFind(
                        catalog.get().joined,
                        found.reference,
                    );
                    if (kept) catalog.surfaceLeave(kept.id);
                    return;
                }
                const workspace = happyAgent.session?.workspace;
                if (!workspace) return;
                const subtask = happyAgentBotSubtasks([
                    ...happyAgent.bots,
                    ...(happyAgent.tasks ?? []),
                ]).find((task) => task.conversation.id === row.id);
                if (subtask) {
                    // No navigation, for the reason the archive below gives.
                    if (actionId === ROW_MENU_ARCHIVE)
                        void workspace
                            .subtaskArchive(subtask.conversation.id as HappyAgentSessionId)
                            .catch(() => undefined);
                    return;
                }
                const task = happyAgent.tasks?.find((entry) => entry.workspaceId === row.id);
                if (task) {
                    // No navigation either way: the task leaves the list when
                    // the host's own catalog stops listing it, and the
                    // workspace follows that, so a refusal strands nobody.
                    if (actionId === ROW_MENU_LEAVE)
                        void workspace.taskLeave(task.id).catch(() => undefined);
                    if (actionId === ROW_MENU_ARCHIVE && task.canArchive)
                        void workspace.taskArchive(task.id).catch(() => undefined);
                    return;
                }
                const bot = happyAgent.bots.find((candidate) => candidate.workspaceId === row.id);
                if (bot) {
                    if (actionId === ROW_MENU_ARCHIVE)
                        void workspace.botArchive(bot.id).catch(() => undefined);
                    return;
                }
                const owner = rowOwnerFind(happyAgent.projects, row.id);
                if (!owner) return;
                if (actionId === ROW_MENU_SETTINGS) {
                    workspace.renameOpen(owner.project.id, undefined);
                    return;
                }
                if (actionId !== ROW_MENU_ARCHIVE) return;
                // Deliberately no navigation here. An archive that the host
                // refuses would have ejected the reader from a project that is
                // still there, and an archive performed from another window or
                // another machine would not have moved them at all. Leaving the
                // addressed group is one thing, driven by the host's own catalog
                // no longer holding it, and the workspace reports that.
                void (
                    owner.worktreeId
                        ? workspace.worktreeArchive(owner.project.id, owner.worktreeId)
                        : workspace.projectArchive(owner.project.id)
                ).catch(() => undefined);
            }}
            // The Bots heading's menu of hidden bots puts one, or all, back.
            onSectionMenuSelect={(sectionId, _source, actionId) => {
                const section = happyAgentSectionParse(sectionId);
                if (section?.kind !== "bots") return;
                const happyAgent = happyAgentOf(section.happyAgentId);
                if (!happyAgent) return;
                for (const bot of happyAgent.bots)
                    if (
                        actionId === BOTS_MENU_SHOW_ALL ||
                        actionId === `${BOTS_MENU_SHOW_PREFIX}${bot.id}`
                    )
                        attentionStore.botHiddenUpdate(happyAgent.id, bot.id, false);
            }}
            // Addressing a group opens the tab it was left on, so a list row
            // lands back where the reader was rather than on an empty screen.
            // Once every remembered tab is gone, its first session is what the
            // group still has to show.
            onItemSelect={(id) => {
                if (id === INBOX_ITEM) {
                    props.onInboxOpen?.();
                    return;
                }
                if (id === ARTIFACTS_ITEM) {
                    props.onArtifactsOpen?.();
                    return;
                }
                const row = happyAgentItemParse(id);
                const happyAgent = happyAgentOf(row.happyAgentId);
                if (!happyAgent) return;
                const surfaceId = surfaceRowParse(row.id);
                if (surfaceId !== undefined) {
                    const surface = happyAgent.session?.surfaces
                        ?.catalog()
                        .get()
                        .surfaces.find((entry) => entry.id === surfaceId);
                    // An artifact, bot, or task opens where it always does;
                    // only one that cannot be opened from here shows its page.
                    if (surface !== undefined && surfaceTargetOpen(happyAgent, surface)) return;
                    props.onSurfaceOpen?.(happyAgent.id, surfaceId);
                    return;
                }
                const destination = rowDestination(happyAgent, row.id);
                workspaceChangesShowOnOpen(
                    happyAgent.session?.workspace,
                    happyAgent.projects
                        .flatMap((project) => [project, ...project.worktrees])
                        .find((group) => group.id === row.id),
                );
                if (destination)
                    props.onChatSelect(happyAgent.id, destination.groupId, destination.chatId);
            }}
            // Pointing at a row loads the conversation it would open, so that
            // selecting it shows the conversation at once.
            onItemIntent={(id) => {
                const row = happyAgentItemParse(id);
                const happyAgent = happyAgentOf(row.happyAgentId);
                if (happyAgent?.status !== "connected" || surfaceRowParse(row.id) !== undefined)
                    return;
                const chatId = rowDestination(happyAgent, row.id)?.chatId;
                if (chatId !== undefined)
                    happyAgent.session?.workspace.conversationPrefetch(
                        chatId as HappyAgentSessionId,
                    );
            }}
            onItemAction={(id) => {
                const row = happyAgentItemParse(id);
                const happyAgent = happyAgentOf(row.happyAgentId);
                if (!happyAgent) return;
                if (happyAgent.status !== "connected") return;
                // The control on a joined Surface leaves it, as a task's does;
                // on one a search found, it joins it.
                const surfaceId = surfaceRowParse(row.id);
                if (surfaceId !== undefined) {
                    const catalog = happyAgent.session?.surfaces?.catalog();
                    if (catalog?.get().joined.some((surface) => surface.id === surfaceId))
                        catalog.surfaceLeave(surfaceId);
                    else catalog?.surfaceJoin(surfaceId);
                    return;
                }
                const workspace = happyAgent.session?.workspace;
                // The control on a task leaves it — the reader's own list
                // loses the row, and the task carries on for everyone else.
                const task = happyAgent.tasks?.find((entry) => entry.workspaceId === row.id);
                if (task && workspace) {
                    void workspace.taskLeave(task.id).catch(() => undefined);
                    return;
                }
                const owner = rowOwnerFind(happyAgent.projects, row.id);
                if (!owner || !workspace) return;
                // The plus on a project adds a worktree; the control on a
                // worktree archives it.
                void (
                    owner.worktreeId
                        ? workspace.worktreeArchive(owner.project.id, owner.worktreeId)
                        : workspace.worktreeCreate(owner.project.id)
                ).catch(() => undefined);
            }}
            // The cog on a project row. Only project rows carry one, and the
            // settings surface is the same one the row's menu opens.
            onItemSecondaryAction={(id) => {
                const row = happyAgentItemParse(id);
                const happyAgent = happyAgentOf(row.happyAgentId);
                if (!happyAgent) return;
                if (happyAgent.status !== "connected") return;
                const workspace = happyAgent.session?.workspace;
                const owner = rowOwnerFind(happyAgent.projects, row.id);
                if (!owner || owner.worktreeId || !workspace) return;
                workspace.renameOpen(owner.project.id, undefined);
            }}
            {...(props.navigationOrder
                ? {
                      onActionReorder: (move: SidebarReorder) => {
                          props.navigationOrder?.itemReorder(
                              move.id,
                              move.afterId,
                              pinned.map((row) => row.id),
                          );
                      },
                  }
                : {})}
            onItemReorder={(sectionId, move) => {
                const section = happyAgentSectionParse(sectionId);
                if (!section) return;
                const happyAgent = happyAgentOf(section.happyAgentId);
                if (happyAgent?.status !== "connected") return;
                // Surfaces are arranged among themselves, in the reader's own
                // order; nobody else's sidebar changes.
                if (section.kind === "surfaces") {
                    const moved = surfaceRowParse(happyAgentItemParse(move.id).id);
                    const after =
                        move.afterId === null
                            ? null
                            : surfaceRowParse(happyAgentItemParse(move.afterId).id);
                    if (moved === undefined || after === undefined) return;
                    happyAgent.session?.surfaces?.catalog().surfaceReorder(moved, after);
                    return;
                }
                const workspace = happyAgent.session?.workspace;
                if (!workspace) return;
                const moved = happyAgentItemParse(move.id).id;
                const after = move.afterId === null ? null : happyAgentItemParse(move.afterId).id;
                // A task's row is addressed by its workspace, the way a bot's
                // is, and the move lands in the reader's own order — nobody
                // else's list changes.
                if (section.kind === "tasks") {
                    if (move.parentId) {
                        void workspace
                            .subtaskReorder(
                                moved as HappyAgentSessionId,
                                after as HappyAgentSessionId | null,
                            )
                            .catch(() => undefined);
                        return;
                    }
                    const taskOf = (workspaceId: string | null) =>
                        workspaceId === null
                            ? undefined
                            : happyAgent.tasks?.find((task) => task.workspaceId === workspaceId);
                    const movedTask = taskOf(moved);
                    if (!movedTask) return;
                    void workspace
                        .taskReorder(movedTask.id, taskOf(after)?.id ?? null)
                        .catch(() => undefined);
                    return;
                }
                // A bot's row is addressed by its workspace, so the move the
                // sidebar reports names workspaces and the bots behind them are
                // what is actually arranged.
                if (section.kind === "bots") {
                    // A nested drag only ever rearranges one parent's children,
                    // so it is a subtask moved among its siblings. Its row is
                    // addressed by its conversation, which is the task.
                    if (move.parentId) {
                        void workspace
                            .subtaskReorder(
                                moved as HappyAgentSessionId,
                                after as HappyAgentSessionId | null,
                            )
                            .catch(() => undefined);
                        return;
                    }
                    const botOf = (workspaceId: string | null) =>
                        workspaceId === null
                            ? undefined
                            : happyAgent.bots.find((bot) => bot.workspaceId === workspaceId);
                    const movedBot = botOf(moved);
                    if (!movedBot) return;
                    void workspace
                        .botReorder(movedBot.id, botOf(after)?.id ?? null)
                        .catch(() => undefined);
                    return;
                }
                // A drag inside a project rearranges its worktrees; a drag
                // at the top level rearranges the projects themselves.
                void (
                    move.parentId
                        ? workspace.worktreeReorder(
                              happyAgentItemParse(move.parentId).id as HappyAgentProjectId,
                              moved as HappyAgentWorktreeId,
                              after as HappyAgentWorktreeId | null,
                          )
                        : workspace.projectReorder(
                              moved as HappyAgentProjectId,
                              after as HappyAgentProjectId | null,
                          )
                ).catch(() => undefined);
            }}
            // A row is folded shut by this window's own record, so a project
            // whose checkouts are hidden stays hidden as its Happy Agent comes and goes.
            {...(props.sidebarCollapse
                ? {
                      onItemCollapseToggle: (id: string) => {
                          sidebarCollapseStore.rowCollapseToggle(id);
                      },
                  }
                : {})}
            sections={
                searching
                    ? happyAgentSearchSections(
                          sidebarSearch.query,
                          directory,
                          active?.id ?? props.happyAgentId,
                          surfaceCatalog,
                          activeTodoCounts,
                          titleShimmerEnabled,
                          projectsVisibility,
                          attention,
                      )
                    : [
                          happyAgentTopSection(
                              active?.id ?? props.happyAgentId,
                              active,
                              surfaceCatalog,
                              activeTodoCounts,
                              titleShimmerEnabled,
                          ),
                          ...sectionsVoiceFocused(
                              happyAgentSections(
                                  directory,
                                  titleShimmerEnabled,
                                  projectsVisibility,
                                  attention,
                                  props.sidebarCollapse
                                      ? // A navigation into a folded-away Projects list
                                        // shows it while voice points there.
                                        voiceFocus?.reason === "navigation" &&
                                        voiceFocusInProjects(voiceFocus, directory)
                                          ? new Set(
                                                [...sidebarCollapse.collapsed].filter(
                                                    (id) =>
                                                        id !==
                                                        happyAgentSectionId(
                                                            voiceFocus.target.connectionId,
                                                        ),
                                                ),
                                            )
                                          : sidebarCollapse.collapsed
                                      : undefined,
                                  taskCreateTarget,
                              ),
                              sidebarCollapse.collapsed,
                              voiceFocus,
                              directory,
                          ),
                      ]
            }
        />
    );

    // What the palette and the held-Command card are both about. The update is
    // offered only once it is downloaded and there is something to apply it
    // with, which is the same test the sidebar's own update control makes.
    const paletteSubject: HappyAgentPaletteSubject = {
        bots: active?.bots ?? [],
        tasks: active?.tasks ?? NO_TASKS,
        chatId: props.chatId,
        groupId: props.groupId,
        happyAgentId: active?.id ?? props.happyAgentId,
        online: activeAvailability?.online === true,
        projects: active?.projects ?? NO_PROJECTS,
        updateReady:
            props.update?.status === "downloaded" && props.onUpdateApply
                ? { action: props.update.action, version: props.update.version }
                : undefined,
        workspace: active?.session?.workspace,
        workspaceCreateProjectId: workspaceCreateTarget?.projectId,
        taskCreateAvailable: taskCreateTarget !== undefined,
        // A window that keeps no fold of its own leaves it to the shell, which
        // nothing outside it can reach, so no row offers it.
        ...(props.sidebarVisibility ? { sidebar: { hidden: sidebarVisibility.hidden } } : {}),
        // What the sidebar on screen lists at its top level, so the palette
        // offers those rows first and wears their marks.
        sidebarMode: spacesSidebar
            ? {
                  kind: "spaces",
                  spaces: [...spaces.spaces.values()].flatMap((space): CommandPaletteSpace[] => {
                      const destination = happyAgentSpaceDestination(space, spacesPlaces, spaces);
                      if (!destination) return [];
                      const title = happyAgentSpaceLabel(space);
                      const target = space.target;
                      return [
                          {
                              id: space.id,
                              title,
                              glyph: paletteMarkGlyph(
                                  happyAgentSpaceMark(space, spacesPlaces, false),
                                  title,
                              ),
                              target:
                                  target.kind === "task" || target.kind === "bot"
                                      ? { kind: target.kind, id: target.id }
                                      : { kind: target.kind === "surface" ? "surface" : "agent" },
                              destination,
                          },
                      ];
                  }),
              }
            : {
                  kind: "classic",
                  botsHidden: new Set(
                      (active?.bots ?? [])
                          .filter(
                              (bot) =>
                                  happyAgentBotAttention(attention, active!.id, bot.id) ===
                                  "hidden",
                          )
                          .map((bot) => bot.id as string),
                  ),
                  projectsHidden: projectsVisibilityConnection(
                      projectsVisibility,
                      active?.id ?? props.happyAgentId,
                  ).projectsHidden,
              },
    };
    // The same suggestions the empty palette offers, on the gesture the reader
    // already has for discovering chords. The shell mounts it only while
    // Command is held, so this card's own reading of the workspace lasts
    // exactly as long as the hold. A window with no palette shows no card: its
    // footer promises ⌘K, and a promise nothing answers is worse than silence.
    const paletteHints = !props.commandPalette ? undefined : active?.session?.workspace ? (
        <HappyAgentQuickActionsSurface {...paletteSubject} workspace={active.session.workspace} />
    ) : (
        <HappyAgentQuickActions {...paletteSubject} facts={PALETTE_WORKSPACE_ABSENT} />
    );
    const paletteActions: HappyAgentPaletteActions = {
        appearance: props.appearance,
        experiments: experimentsStore,
        happyAgentOnline: activeHappyAgentOnline,
        onChatSelect: props.onChatSelect,
        onFileSelect: props.onFileSelect,
        onSettingsOpen: props.onSettingsOpen,
        onSettingsSectionOpen: props.onSettingsSectionOpen,
        onUpdateApply: props.onUpdateApply,
        onTaskCreateOpen: props.onTaskCreateOpen,
        onSurfaceOpen: props.onSurfaceOpen,
        store: commandPaletteStore,
        settings: settingsStore,
        sidebarVisibility: sidebarVisibilityStore,
        titleShimmer: titleShimmerStore,
    };

    // Which screen the window is showing. It is a value rather than a set of
    // early returns because the window's own dialogs are mounted beside it: a
    // surface that answers on one route and not another is not a window-level
    // surface at all.
    const routeContent = (): ReactNode => {
        // The workbench belongs to no machine and needs no connection: it renders the
        // component pages themselves, so it is independent of every Happy Agent.
        if (props.blueprintOpen)
            return (
                <>
                    {desktop ? <WindowDragRegion /> : null}
                    <BlueprintView />
                </>
            );

        // Naming a bot belongs to the addressed machine — it is the machine the
        // bot will live on — so it is shown only while that machine has a
        // workspace to answer through. There is deliberately nothing else on the
        // surface: what it is called is the only thing being decided here.
        if (props.botCreateOpen && active?.session?.workspace)
            return (
                <>
                    {desktop ? <WindowDragRegion /> : null}
                    <HappyAgentCreateBotSurface
                        happyAgentOnline={activeHappyAgentOnline}
                        providerUsage={active.session.providerUsage}
                        // The artist's page is on the web, and this window has
                        // no workspace behind it for an embedded tab to run in,
                        // so it goes to the machine's own browser where the
                        // host can send it there.
                        onExternalLinkOpen={props.onExternalLinkOpen ?? openExternalLink}
                        workspace={active.session.workspace}
                        {...(activeAvailability?.refusal === undefined
                            ? {}
                            : { unavailable: activeAvailability.refusal })}
                    />
                </>
            );

        // A task is made on the addressed machine, as a bot is.
        if (props.taskCreateOpen && active?.session?.workspace)
            return (
                <>
                    {desktop ? <WindowDragRegion /> : null}
                    <HappyAgentCreateTaskSurface
                        happyAgentOnline={activeHappyAgentOnline}
                        providerUsage={active.session.providerUsage}
                        workspace={active.session.workspace}
                        {...(activeAvailability?.refusal === undefined
                            ? {}
                            : { unavailable: activeAvailability.refusal })}
                    />
                </>
            );

        // The artifacts belong to the addressed machine, like its inbox. A
        // machine that keeps none says so here rather than showing an empty
        // catalog, in case its address was reached some other way. Their
        // headers carry controls — Back, History, Delete — so the headers
        // themselves are the window's drag band; a drag overlay would sit on
        // those controls and take every click.
        if (props.artifactsOpen && active?.session?.artifacts) {
            const artifacts = active.session.artifacts;
            return (
                <>
                    <HappyAgentArtifactsSurface
                        artifacts={artifacts}
                        {...(active.session.surfaces
                            ? { surfaces: active.session.surfaces.catalog() }
                            : {})}
                        {...(props.artifactPage ? { artifactPage: props.artifactPage } : {})}
                        {...(props.artifactId === undefined
                            ? {}
                            : { artifactId: props.artifactId as HappyAgentArtifactId })}
                        onArtifactClose={() => props.onArtifactClose?.(active.id)}
                        onArtifactOpen={(artifactId) =>
                            props.onArtifactOpen?.(active.id, artifactId)
                        }
                        places={{
                            bots: active.bots,
                            projects: active.projects,
                            tasks: active.tasks ?? [],
                        }}
                    />
                </>
            );
        }

        // A Surface belongs to the addressed machine, like its artifacts. Its
        // header carries Leave or Join, so the header is the window's drag
        // band rather than an overlay on top of it.
        if (props.surfaceId !== undefined && active?.session?.surfaces) {
            const session = active.session;
            const workspace = session.workspace;
            return (
                <HappyAgentSurfaceContent
                    key={props.surfaceId}
                    support={surfaceSupport}
                    {...(props.surfaceChat ? { chat: props.surfaceChat } : {})}
                    chatConversation={(chat, surfaceName) => (
                        <HappyAgentSurfaceChat
                            {...(referenceSurfaces ? { referenceSurfaces } : {})}
                            {...(artifactsAvailable && session.artifacts
                                ? { artifacts: session.artifacts }
                                : {})}
                            chatId={chat.chatId}
                            clock={session.clock}
                            groupId={chat.groupId}
                            happyAgentOnline={activeHappyAgentOnline}
                            onChatSelect={(groupId, chatId) =>
                                props.onChatSelect(active.id, groupId, chatId)
                            }
                            onExternalLinkOpen={props.onExternalLinkOpen ?? openExternalLink}
                            {...(session.providerUsage
                                ? { providerUsage: session.providerUsage }
                                : {})}
                            surfaceName={surfaceName}
                            {...(activeAvailability?.refusal === undefined
                                ? {}
                                : { unavailable: activeAvailability.refusal })}
                            viewerId={viewerId}
                            workspace={workspace}
                        />
                    )}
                    onChatShow={(location) =>
                        props.onSurfaceChatShow?.(
                            active.id,
                            props.surfaceId!,
                            location === undefined
                                ? undefined
                                : { groupId: location.groupId, chatId: location.sessionId },
                        )
                    }
                    onTargetOpen={(surface) => {
                        if (surfaceTargetOpen(active, surface)) return;
                        // A task the reader is not in is joined, and then opened.
                        const target = surface.target;
                        if (target?.state !== "available" || target.kind !== "task") return;
                        if (!activeHappyAgentOnline()) return;
                        void workspace
                            .taskJoin(target.id)
                            .then(() =>
                                taskJoinedThen(workspace, target.id, (task) =>
                                    props.onChatSelect(
                                        active.id,
                                        task.workspaceId,
                                        task.conversation.id,
                                    ),
                                ),
                            )
                            .catch(() => undefined);
                    }}
                    clock={session.clock}
                    places={surfacePlacesOf(active)}
                    {...(activeAvailability?.refusal === undefined
                        ? {}
                        : { unavailable: activeAvailability.refusal })}
                    surfaceId={props.surfaceId as HappyAgentSurfaceId}
                    surfaces={active.session.surfaces}
                />
            );
        }

        // The inbox belongs to the addressed machine, so it is shown only while that
        // machine has stores to answer through.
        if (experimental.inbox && props.inboxOpen && active?.session?.inbox)
            return (
                <>
                    {desktop ? <WindowDragRegion /> : null}
                    <HappyAgentInboxSurface
                        onOpenSession={(happyAgentId, groupId, chatId) =>
                            props.onChatSelect(happyAgentId, groupId, chatId)
                        }
                        projects={active.projects}
                        happyAgentId={active.id}
                        happyAgentOnline={activeHappyAgentOnline}
                        snapshot={inbox}
                        store={active.session.inbox}
                        {...(activeAvailability?.refusal === undefined
                            ? {}
                            : { unavailable: activeAvailability.refusal })}
                    />
                </>
            );

        if (active?.session)
            return (
                <HappyAgentWorkspaceSurface
                    {...(referenceSurfaces ? { referenceSurfaces } : {})}
                    {...(sidebarProposal ? { sidebarProposal } : {})}
                    {...(storyRender ? { storyRender } : {})}
                    availability={
                        activeAvailability ??
                        happyAgentAvailabilityProject(active.session.connection.get(), true, {
                            status: active.status,
                            ...(active.message === undefined ? {} : { message: active.message }),
                        })
                    }
                    appearance={props.appearance}
                    browserContent={props.browserContent}
                    browserConnectionId={active.remoteId ?? null}
                    htmlPreview={props.htmlPreview}
                    mediaWindow={props.mediaWindow}
                    chatId={props.chatId}
                    clock={active.session.clock}
                    groupId={props.groupId}
                    key={active.id}
                    onChatSelect={(groupId, chatId, replace) => {
                        props.onChatSelect(active.id, groupId, chatId, replace);
                    }}
                    onChatClose={(groupId, chatId, fallbackChatId) => {
                        return (
                            props.onChatClose?.(active.id, groupId, chatId, fallbackChatId) ?? false
                        );
                    }}
                    onFileClose={(groupId, path) => props.onFileClose(active.id, groupId, path)}
                    onFileSelect={(groupId, chatId, path, kind, replace) =>
                        props.onFileSelect(active.id, groupId, chatId, path, kind, replace)
                    }
                    onExternalLinkOpen={props.onExternalLinkOpen ?? openExternalLink}
                    linkOpenDefault={settings.linkOpenPlacement}
                    platform={props.platform}
                    projects={active.projects}
                    happyAgentOnline={activeHappyAgentOnline}
                    providerUsage={active.session.providerUsage}
                    titleShimmerEnabled={titleShimmerEnabled}
                    viewerId={viewerId}
                    {...(voiceFocus?.target.connectionId === active.id &&
                    "sessionId" in voiceFocus.target
                        ? { voiceFocusSessionId: voiceFocus.target.sessionId }
                        : {})}
                    workspace={active.session.workspace}
                    {...(spacesSidebar ? { spaces: workspaceSpaces } : {})}
                    {...(changeTiersStore === undefined ? {} : { changeTiers: changeTiersStore })}
                    {...(artifactsAvailable && active.session.artifacts
                        ? {
                              artifacts: active.session.artifacts,
                              ...(props.artifactPage ? { artifactPage: props.artifactPage } : {}),
                              onArtifactOpen: (artifactId: string) =>
                                  props.onArtifactOpen?.(active.id, artifactId),
                          }
                        : {})}
                />
            );
        // The host Happy Agent has no live stores yet — it is still connecting, or it could
        // not be reached. The sidebar stays so the window keeps its shape while
        // that resolves; anything the reader can do about it is a settings act,
        // which is where the control points.
        return (
            <>
                {desktop ? <WindowDragRegion /> : null}
                <EmptyState
                    action={{
                        label: "Open settings",
                        icon: "settings",
                        onClick: props.onSettingsOpen,
                    }}
                    description={
                        active
                            ? (active.message ??
                              (active.status === "connecting"
                                  ? `Connecting to ${active.label}…`
                                  : `${active.label} is disconnected.`))
                            : "Waiting for this machine's Happy Agent."
                    }
                    icon={active?.status === "error" ? "shield" : "link"}
                    size="panel"
                    title={active ? active.label : "No machine"}
                />
            </>
        );
    };

    return (
        <HappyAgentVersionProvider lastKnownVersion={active?.version}>
            {/* Window chrome has one lifetime. Happy Agent workspaces keep their own
                keyed lifetimes inside its content region, so changing machines
                resets machine-owned UI without rebuilding this sidebar's DOM,
                focus, width, collapsed state, or scroll position. */}
            <AppShell
                sidebarCollapsible
                {...(props.sidebarVisibility
                    ? {
                          sidebarCollapsed: sidebarVisibility.hidden,
                          onSidebarCollapsedChange: sidebarVisibilityStore.sidebarHiddenUpdate,
                          sidebarDefaultWidth: sidebarVisibility.width,
                          onSidebarWidthChange: sidebarVisibilityStore.sidebarWidthUpdate,
                      }
                    : {})}
                shortcutHints="interactive"
                shortcutHintsSurface={paletteHints}
                windowControls={desktop}
                windowFullScreen={windowState.fullScreen}
                windowTrafficLights={windowState.trafficLights}
                connectionRail={windowState.connectionRail}
                sidebar={spacesSidebar ?? sidebar}
                // One band holds the sidebar toggle, search, and the tabs; the
                // surface header is gone.
                navigationChrome="integrated"
                sidebarCollapsedLayout="overlay"
                {...(props.commandPalette
                    ? {
                          sidebarSearchAction: {
                              label: "Search",
                              onClick: () => commandPaletteStore.paletteOpen(),
                          },
                      }
                    : {})}
                {...(spacesSidebar && stemCellsEnabled
                    ? {
                          sidebarCollapsedAction: {
                              label: "New work (⌘N or ⌘T)",
                              onClick: () => makeStuff(),
                          },
                          sidebarOwnsCreate: true,
                      }
                    : taskCreateTarget !== undefined
                      ? {
                            sidebarCollapsedAction: {
                                label: "New task (⌘N)",
                                onClick: () => props.onTaskCreateOpen?.(taskCreateTarget),
                            },
                        }
                      : {})}
            >
                {routeContent()}
            </AppShell>
            {/* Command-K belongs to the window rather than to a workspace: it is
                offered on every route, including the ones no machine is behind.
                It only opens. The dispatcher stands down while any dialog is
                showing, so the palette's own key closes it from inside the card
                and the two never fight over one chord.

                A host that keeps no palette binds nothing: swallowing the chord
                to do nothing with it is worse than leaving it to whatever else
                the reader has bound Command-K to. */}
            {props.commandPalette ? (
                <WindowShortcuts
                    actions={[
                        {
                            run: () => commandPaletteStore.paletteOpen(),
                            shortcut: APP_SHORTCUTS.paletteOpen,
                        },
                    ]}
                />
            ) : null}
            {/* Cmd-N belongs to the window too: a task is made from wherever
                the reader is, as the Tasks heading's + makes one. Bound only
                while the machine on screen can make one, so an older Happy
                Agent leaves the chord to do nothing at all. */}
            {spacesSidebar && stemCellsEnabled ? (
                <WindowShortcuts
                    actions={[
                        { run: () => makeStuff(), shortcut: APP_SHORTCUTS.taskCreate },
                        { run: () => makeStuff(), shortcut: APP_SHORTCUTS.sessionCreate },
                    ]}
                />
            ) : taskCreateTarget !== undefined ? (
                <WindowShortcuts
                    actions={[
                        {
                            run: () => props.onTaskCreateOpen?.(taskCreateTarget),
                            shortcut: APP_SHORTCUTS.taskCreate,
                        },
                    ]}
                />
            ) : null}
            {/* The window's own dialogs, mounted once beside whatever screen is
                showing rather than inside one of them. Naming a row belongs to
                the sidebar, and Create belongs to the window: both are reached
                from chrome that is on every route, so a cog or a Create that
                answered on the workspace and did nothing on the inbox would not
                be a control. Being outside the screen is also what lets a task
                being written survive the route notifications underneath it. */}
            {active?.session?.workspace ? (
                <HappyAgentWindowDialogs
                    projects={active.projects}
                    happyAgentOnline={activeHappyAgentOnline}
                    onTaskOpen={(task) => {
                        active.session?.workspace.taskBrowseClose();
                        props.onChatSelect(active.id, task.workspaceId, task.conversation.id);
                    }}
                    workspace={active.session.workspace}
                    {...(activeAvailability?.refusal === undefined
                        ? {}
                        : { unavailable: activeAvailability.refusal })}
                />
            ) : null}
            {/* Stories' viewer and editor fill the window over whatever it shows. */}
            {stories && active ? (
                <HappyAgentStoriesScreens
                    hub={stories}
                    onLinkOpen={props.onExternalLinkOpen ?? openExternalLink}
                    onSourceOpen={(agentId) => {
                        const groupId = chatGroupFind(active.projects ?? NO_PROJECTS, agentId);
                        if (groupId !== undefined) props.onChatSelect(active.id, groupId, agentId);
                    }}
                />
            ) : null}
            {/* Making a Surface is the sidebar's, so it belongs to the window
                like the dialogs above, on whatever route is showing. */}
            {active && surfaceCatalog.create.phase === "open" ? (
                <HappyAgentSurfaceCreateDialog
                    kind={surfaceCatalog.create.kind}
                    onClose={surfaceCatalogStore.createClose}
                    onSubmit={(input) => {
                        // The list exists the moment it is asked for, so it is
                        // opened at once; the Happy Agent hears in the background.
                        const surfaceId = surfaceCatalogStore.surfaceCreate(input);
                        if (surfaceId === undefined) return;
                        props.onSurfaceOpen?.(active.id, surfaceId);
                    }}
                />
            ) : null}
            {/* The palette is mounted only while it is open, so nothing in the
                window pays for a surface nobody has asked for, and its own
                subscriptions — the workspace above all — start with it. */}
            {commandPaletteOpen ? (
                active?.session?.workspace ? (
                    <HappyAgentCommandPaletteSurface
                        {...paletteSubject}
                        workspace={active.session.workspace}
                        {...paletteActions}
                    />
                ) : (
                    <HappyAgentCommandPalette
                        {...paletteSubject}
                        {...paletteActions}
                        facts={PALETTE_WORKSPACE_ABSENT}
                    />
                )
            ) : null}
        </HappyAgentVersionProvider>
    );
}

/**
 * What the palette and its held-Command preview are both about: the machine on
 * screen, where in it the reader is standing, and what this window could do
 * from there. Both surfaces answer the same question, so neither is given its
 * own idea of the subject.
 */
interface HappyAgentPaletteSubject {
    happyAgentId: string;
    projects: readonly HappyAgentProjectGroup[];
    bots: readonly HappyAgentBot[];
    tasks: readonly HappyAgentTask[];
    groupId?: string;
    chatId?: string;
    /** Whether the machine can be asked to do anything at this moment. */
    online: boolean;
    /** The project a new workspace would be made in, when there is one. */
    workspaceCreateProjectId?: HappyAgentProjectId;
    /** Whether a new task can be made on this machine right now. */
    taskCreateAvailable: boolean;
    updateReady?: { readonly action: "refresh" | "restart"; readonly version?: string };
    workspace?: HappyAgentWorkspaceStore;
    /** The window's own fold of its left side, when it keeps one. */
    sidebar?: { readonly hidden: boolean };
    /** What the sidebar on screen lists at its top level. */
    sidebarMode: CommandPaletteContext["sidebarMode"];
}

/** The window acts the palette can commit to. */
interface HappyAgentPaletteActions {
    appearance: AppearanceStore;
    experiments: ExperimentsStore;
    settings: HappyAgentSettingsStore;
    sidebarVisibility: HappyAgentSidebarVisibilityStore;
    titleShimmer: TitleShimmerStore;
    store: CommandPaletteStore;
    happyAgentOnline: () => boolean;
    onChatSelect(happyAgentId: string, groupId: string | undefined, chatId?: string): void;
    onFileSelect(
        happyAgentId: string,
        groupId: string,
        chatId: string | undefined,
        path: string,
        kind: HappyAgentFileTabKind,
    ): void;
    onSettingsOpen(): void;
    onSettingsSectionOpen?(section: string): void;
    onUpdateApply?(): void;
    onTaskCreateOpen?(happyAgentId: string): void;
    onSurfaceOpen?(happyAgentId: string, surfaceId: string): void;
}

/**
 * The part of the offer only the open workspace can answer: which sessions it
 * has closed, what its strip currently holds, whether it can take another chat,
 * and which session each of its groups would resume.
 */
interface HappyAgentPaletteFacts {
    readonly archivedSessions: readonly HappyAgentSessionSummary[];
    readonly tabs: readonly CommandPaletteTab[];
    readonly sessionCreateAvailable: boolean;
    readonly groupResume?: ReadonlyMap<HappyAgentGroupId, HappyAgentSessionId>;
    /** The open workspace's secondary pane, when it has one to show. */
    readonly panel?: { readonly open: boolean };
    /** Every task the machine lists, joined or not, archived or not. */
    readonly taskDirectory?: readonly HappyAgentTask[];
    /** The sessions this window opened, most recently first. */
    readonly visits: readonly HappyAgentRecentTabMemory[];
}

/**
 * What a window with no workspace behind it can say. It offers no chats it
 * would not be able to open and no creation it could not perform, which leaves
 * the palette its workspaces, its settings, and the way into them.
 */
const PALETTE_WORKSPACE_ABSENT: HappyAgentPaletteFacts = {
    archivedSessions: [],
    sessionCreateAvailable: false,
    tabs: [],
    visits: [],
};

/** The open workspace's strip, sessions and files together in the reader's order. */
function paletteTabs(
    workspace: HappyAgentWorkspaceSnapshot,
    openGroup: OpenGroup | undefined,
): CommandPaletteTab[] {
    if (!openGroup) return [];
    return tabsOrdered<CommandPaletteTab>(
        [
            ...openGroup.conversations.map((summary) => ({
                kind: "session" as const,
                id: summary.id,
                title: summary.title,
            })),
            ...workspace.fileTabs
                .filter((tab) => tab.groupId === openGroup.id && tab.placement === "main")
                .map((tab) => ({
                    kind: "file" as const,
                    id: tab.id,
                    path: tab.path,
                    fileKind: tab.kind,
                    icon: fileTabIcon(tab.path, tab.kind),
                })),
        ],
        workspace.tabOrder,
    );
}

/**
 * The workspace's answer, read once for whichever palette surface is showing.
 *
 * Whether another chat may be started here is the workspace's own rule, taken
 * from the same three facts the workspace surface's own control reads, so the
 * palette never offers a New chat that screen would have greyed out.
 */
function paletteFacts(
    workspace: HappyAgentWorkspaceSnapshot,
    panel: HappyAgentPanelSnapshot,
    groupId: string | undefined,
    online: boolean,
): HappyAgentPaletteFacts {
    const rows = workspace.list.projects.type === "ready" ? workspace.list.projects.value : [];
    const openGroup = openGroupFind(
        rows,
        workspace.list.bots,
        workspace.list.tasks,
        groupId,
        workspace.address.conversationId,
    );
    return {
        archivedSessions: workspace.list.archivedSessions,
        groupResume: workspace.groupResume,
        sessionCreateAvailable:
            online &&
            !workspace.conversationDelegated &&
            openGroup?.singleConversationId === undefined &&
            openGroup?.create !== undefined &&
            workspace.groupAccess.conversationRefusal === undefined &&
            workspaceLifecyclePhase(openGroup.lifecycle) !== "creating",
        tabs: paletteTabs(workspace, openGroup),
        taskDirectory: workspace.list.taskDirectory,
        visits: workspace.recentTabs,
        // The pane the workspace's own toggle shows, on the same condition:
        // a checkout still being prepared has nothing to put in it.
        ...(openGroup !== undefined && workspaceLifecyclePhase(openGroup.lifecycle) !== "creating"
            ? { panel: { open: panel.open } }
            : {}),
    };
}

/**
 * The palette over an open workspace. It exists to hold that one subscription:
 * the workspace repaints as fast as a transcript does, and reading it here
 * keeps those frames inside the palette instead of re-rendering the window
 * around it. Frame-coalesced for the same reason the window's dialogs are.
 */
function HappyAgentCommandPaletteSurface(
    props: HappyAgentPaletteSubject &
        HappyAgentPaletteActions & { workspace: HappyAgentWorkspaceStore },
) {
    const workspace = useSyncExternalStore(
        reactFrameSubscribe(props.workspace),
        props.workspace.get,
        props.workspace.get,
    );
    const panel = useSyncExternalStore(
        props.workspace.panel.subscribe,
        props.workspace.panel.get,
        props.workspace.panel.get,
    );
    return (
        <HappyAgentCommandPalette
            {...props}
            facts={paletteFacts(workspace, panel, props.groupId, props.online)}
        />
    );
}

/** The same reading, for the held-Command card. */
function HappyAgentQuickActionsSurface(
    props: HappyAgentPaletteSubject & { workspace: HappyAgentWorkspaceStore },
) {
    const workspace = useSyncExternalStore(
        reactFrameSubscribe(props.workspace),
        props.workspace.get,
        props.workspace.get,
    );
    const panel = useSyncExternalStore(
        props.workspace.panel.subscribe,
        props.workspace.panel.get,
        props.workspace.panel.get,
    );
    return (
        <HappyAgentQuickActions
            {...props}
            facts={paletteFacts(workspace, panel, props.groupId, props.online)}
        />
    );
}

/** Everything the results are computed from, assembled once for either surface. */
function paletteContext(
    subject: HappyAgentPaletteSubject,
    facts: HappyAgentPaletteFacts,
): CommandPaletteContext {
    return {
        archivedSessions: facts.archivedSessions,
        bots: subject.bots,
        tasks: subject.tasks,
        chatId: subject.chatId,
        groupId: subject.groupId,
        happyAgentId: subject.happyAgentId,
        projects: subject.projects,
        sessionCreateAvailable: facts.sessionCreateAvailable,
        tabs: facts.tabs,
        updateReady: subject.updateReady,
        workspaceCreateAvailable:
            subject.online &&
            subject.workspace !== undefined &&
            subject.workspaceCreateProjectId !== undefined,
        taskCreateAvailable: subject.taskCreateAvailable,
        ...(subject.sidebar ? { sidebar: subject.sidebar } : {}),
        ...(facts.panel ? { panel: facts.panel } : {}),
        ...(facts.taskDirectory ? { taskDirectory: facts.taskDirectory } : {}),
        sidebarMode: subject.sidebarMode,
        visits: facts.visits,
    };
}

/**
 * A spaces row's mark as the palette draws it: its clay icon or stem cell as
 * drawn, and otherwise the same rounded tile the row's own Avatar is — its
 * picture, else its glyph, else its initial.
 */
function paletteMarkGlyph(
    mark: Pick<SidebarItem, "icon" | "imageMark" | "imageUrl" | "stemCell">,
    title: string,
): CommandPaletteGlyph {
    if (mark.imageMark || mark.stemCell)
        return {
            kind: "mark",
            ...(mark.imageMark ? { imageMark: mark.imageMark } : {}),
            ...(mark.stemCell ? { stemCell: mark.stemCell } : {}),
        };
    return {
        kind: "avatar",
        initials: title.slice(0, 1).toUpperCase(),
        ...(mark.imageUrl ? { imageUrl: mark.imageUrl } : {}),
        ...(mark.icon ? { icon: mark.icon } : {}),
    };
}

/**
 * What holding Command puts in the middle of the window: the acts the palette
 * answers a typed query with, each wearing the chord that runs it.
 *
 * It is the same list, from the same transform, so the card never teaches a
 * chord for something the palette would not run. Rows the card cannot draw —
 * a picture, a live settings control — are left out rather than approximated;
 * actions produce none today.
 */
function HappyAgentQuickActions(
    props: HappyAgentPaletteSubject & { facts: HappyAgentPaletteFacts },
) {
    const items = commandPaletteQuickActionRows(paletteContext(props, props.facts))
        .slice(0, COMMAND_PALETTE_PREVIEW_LIMIT)
        .flatMap((row): QuickActionsCardItem[] =>
            row.glyph.kind === "avatar" || row.glyph.kind === "mark"
                ? []
                : [
                      {
                          id: row.id,
                          title: row.title,
                          ...(row.glyph.kind === "emphasis"
                              ? { emphasis: row.glyph.emphasis }
                              : { icon: row.glyph.name }),
                          ...(row.shortcut ? { shortcut: row.shortcut } : {}),
                      },
                  ],
        );
    return <QuickActionsCard items={items} />;
}

/**
 * The window's command palette: one query over everything this machine holds,
 * and the settings it can change without going anywhere.
 *
 * The card owns its own focus, its Escape, and its ⌘K; the list owns nothing
 * but drawing. What is left here is the middle: which rows are offered, which
 * one Enter would run, and what running it does. The highlight is an index in
 * the state store rather than local state, and the rows are recomputed from
 * live snapshots on every render, so a session that finishes or a setting
 * changed from its own row moves under the reader without being asked to.
 */
/** How long a chat stays highlighted in the palette before it is loaded ahead of Enter. */
const PALETTE_INTENT_DWELL_MS = 60;

function HappyAgentCommandPalette(
    props: HappyAgentPaletteSubject & HappyAgentPaletteActions & { facts: HappyAgentPaletteFacts },
) {
    const palette = useSyncExternalStore(props.store.subscribe, props.store.get, props.store.get);
    const appearance = useSyncExternalStore(
        props.appearance.subscribe,
        props.appearance.get,
        props.appearance.get,
    );
    const titleShimmer = useSyncExternalStore(
        props.titleShimmer.subscribe,
        props.titleShimmer.get,
        props.titleShimmer.get,
    );
    const settings = useSyncExternalStore(
        props.settings.subscribe,
        props.settings.get,
        props.settings.get,
    );
    const results = commandPaletteResults({
        ...paletteContext(props, props.facts),
        query: palette.query,
        scrollbarVisibility: appearance.scrollbarVisibility,
        themeMode: appearance.mode,
        themeModes: props.appearance.supportedModes,
        linkOpenPlacement: settings.linkOpenPlacement,
        titleShimmerEnabled: titleShimmer.titleShimmerEnabled,
    });
    const sections = results.sections.map(
        (section): CommandPaletteResultsSection => ({
            caption: section.label,
            id: section.id,
            rows: section.rows.map((row) => paletteResultsRow(row, props)),
        }),
    );
    // The list's own flat order, so the index the reader arrows through and the
    // order they are looking at cannot come apart.
    const length = commandPaletteResultsRows(sections).length;
    // A chat that stays highlighted for a moment is loaded ahead of Enter, as one whose sidebar
    // row the pointer rests on is, so committing it shows the conversation at once.
    const highlighted = useRef<CommandPaletteRow | undefined>(undefined);
    // eslint-disable-next-line react-hooks/refs -- the dwell timer reads the row highlighted when it fires: the latest render's, not the one that started it
    highlighted.current = commandPaletteRowAt(results, palette.activeIndex);
    const intentTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
    const highlightIntent = () => {
        clearTimeout(intentTimer.current);
        // The palette never lets focus leave its input, so the card holding focus is this one. A
        // palette closed, or closed and opened again, before the timer fires is a different card.
        const card = document.activeElement?.closest('[data-happy-desktop-ui="command-palette"]');
        intentTimer.current = setTimeout(() => {
            const row = highlighted.current;
            if (card?.isConnected !== true || row?.kind === "setting") return;
            const command = row?.command;
            if (command?.kind !== "chatOpen" || command.archived) return;
            if (command.happyAgentId !== props.happyAgentId) return;
            props.workspace?.conversationPrefetch(command.chatId as HappyAgentSessionId);
        }, PALETTE_INTENT_DWELL_MS);
    };

    /** Runs one row. A settings row answers in place; anything else is a departure. */
    const rowCommit = (index: number) => {
        const row = commandPaletteRowAt(results, index);
        if (!row) return;
        if (row.kind === "setting") {
            paletteSettingCommit(row, props);
            return;
        }
        // The palette closes before the act rather than after it: navigation
        // moves the window under it, and a surface that goes away as a result
        // of what it did looks like it failed to.
        props.store.paletteClose();
        paletteCommandRun(row.command, props);
    };

    return (
        // No dim: the window stays as it is behind the card, and a press
        // anywhere outside it — the connection rail included — closes it.
        <ModalOverlay
            backdrop="clear"
            onDismiss={() => props.store.paletteClose()}
            placement="center"
        >
            <CommandPalette
                onClose={() => props.store.paletteClose()}
                onQueryChange={(value) => {
                    props.store.queryUpdate(value);
                    highlightIntent();
                }}
                onSelectionCommit={() => rowCommit(palette.activeIndex)}
                onNumberCommit={(number) => {
                    const index = results.numbered[number - 1];
                    if (index !== undefined) rowCommit(index);
                }}
                onSelectionMove={(direction) => {
                    props.store.activeIndexUpdate(
                        commandPaletteIndexMove(palette.activeIndex, direction, length),
                    );
                    highlightIntent();
                }}
                placeholder="Search tasks and chats…"
                query={palette.query}
            >
                <CommandPaletteResults
                    activeIndex={palette.activeIndex}
                    emptyDescription="Try a different search."
                    emptyLabel="No results"
                    label="Search results"
                    onActiveIndexChange={(index) => {
                        props.store.activeIndexUpdate(index);
                        highlightIntent();
                    }}
                    onSelect={(_id, index) => rowCommit(index)}
                    sections={sections}
                />
            </CommandPalette>
        </ModalOverlay>
    );
}

/** One computed row as the list draws it: a command, or a settings row itself. */
function paletteResultsRow(
    row: CommandPaletteRow,
    actions: HappyAgentPaletteActions,
): CommandPaletteResultsRow {
    if (row.kind === "setting")
        return {
            control: paletteSettingControl(row, actions),
            description: row.description,
            icon: row.icon,
            id: row.id,
            kind: "control",
            // The control is opaque to the list, so what it is called has to be
            // given: the same words the hosted FormRow shows.
            label: row.label,
        };
    return {
        id: row.id,
        kind: "command",
        title: row.title,
        ...(row.meta === undefined ? {} : { meta: row.meta }),
        // The lane the computed row already decided: a glyph, the thing's own
        // picture, or the product's mark for what kind of news this row is.
        ...(row.glyph.kind === "icon"
            ? { icon: row.glyph.name }
            : row.glyph.kind === "emphasis"
              ? { emphasis: row.glyph.emphasis }
              : row.glyph.kind === "mark"
                ? {
                      ...(row.glyph.imageMark ? { imageMark: row.glyph.imageMark } : {}),
                      ...(row.glyph.stemCell ? { stemCell: row.glyph.stemCell } : {}),
                  }
                : {
                      // The rounded tile the sidebar gives the same row.
                      avatar: {
                          initials: row.glyph.initials,
                          type: "agent" as const,
                          ...(row.glyph.imageUrl === undefined
                              ? {}
                              : { imageUrl: row.glyph.imageUrl }),
                          ...(row.glyph.icon === undefined ? {} : { icon: row.glyph.icon }),
                      },
                  }),
        ...(row.shortcut ? { shortcut: row.shortcut } : {}),
    };
}

/**
 * A settings row, as the settings page itself renders it — the same `FormRow`,
 * the same control, the same words, wired to the same store action. The row in
 * the palette is that row, so changing it here is changing it there.
 */
function paletteSettingControl(
    row: CommandPaletteSettingRow,
    actions: HappyAgentPaletteActions,
): ReactNode {
    switch (row.setting) {
        case "themeMode":
            return (
                <FormRow
                    density="compact"
                    control={
                        <SegmentedControl
                            aria-label={row.label}
                            onChange={(value) =>
                                actions.appearance.appearanceSelect(value as ThemeMode)
                            }
                            segments={[...row.control.segments]}
                            size="small"
                            value={row.control.value}
                        />
                    }
                    description={row.description}
                    label={row.label}
                />
            );
        case "scrollbarVisibility":
            return (
                <FormRow
                    density="compact"
                    control={
                        <SegmentedControl
                            aria-label={row.label}
                            onChange={(value) =>
                                actions.appearance.scrollbarVisibilitySelect(
                                    value as ScrollbarVisibility,
                                )
                            }
                            segments={[...row.control.segments]}
                            size="small"
                            value={row.control.value}
                        />
                    }
                    description={row.description}
                    label={row.label}
                />
            );
        case "titleShimmer":
            return (
                <FormRow
                    density="compact"
                    control={
                        <Switch
                            aria-label={row.label}
                            checked={row.control.checked}
                            id={row.controlId}
                            onChange={(checked) => actions.titleShimmer.titleShimmerUpdate(checked)}
                            size="small"
                        />
                    }
                    description={row.description}
                    htmlFor={row.controlId}
                    label={row.label}
                />
            );
        case "linkOpenPlacement":
            return (
                <FormRow
                    density="compact"
                    control={
                        <SegmentedControl
                            aria-label={row.label}
                            onChange={(value) =>
                                actions.settings.linkOpenPlacementUpdate(
                                    value as HappyAgentLinkOpenPlacement,
                                )
                            }
                            segments={[...row.control.segments]}
                            size="small"
                            value={row.control.value}
                        />
                    }
                    description={row.description}
                    label={row.label}
                />
            );
    }
}

/**
 * Enter on a settings row. It moves the setting to the value the row already
 * carries and leaves the palette exactly where it was: the reader is looking at
 * the thing they changed, and taking the window away would be the one answer
 * they did not ask for.
 */
function paletteSettingCommit(row: CommandPaletteSettingRow, actions: HappyAgentPaletteActions) {
    switch (row.setting) {
        case "themeMode":
            actions.appearance.appearanceSelect(row.control.next);
            return;
        case "scrollbarVisibility":
            actions.appearance.scrollbarVisibilitySelect(row.control.next);
            return;
        case "titleShimmer":
            actions.titleShimmer.titleShimmerUpdate(row.control.next);
            return;
        case "linkOpenPlacement":
            actions.settings.linkOpenPlacementUpdate(row.control.next);
            return;
    }
}

/** What committing a row does, once the palette has stood down. */
function paletteCommandRun(
    command: CommandPaletteCommand,
    props: HappyAgentPaletteSubject & HappyAgentPaletteActions & { facts: HappyAgentPaletteFacts },
) {
    switch (command.kind) {
        case "chatOpen": {
            if (!command.archived) {
                props.onChatSelect(command.happyAgentId, command.groupId, command.chatId);
                return;
            }
            // A closed session is asked of the host by id: it stopped listing
            // the agent when it was archived, so it is restored before it is
            // addressed — the same order the workspace's recents menu uses.
            const workspace = props.workspace;
            if (!workspace || !props.happyAgentOnline()) return;
            void workspace
                .conversationRestore(command.chatId as HappyAgentSessionId)
                .then(() =>
                    props.onChatSelect(command.happyAgentId, command.groupId, command.chatId),
                )
                .catch(() => undefined);
            return;
        }
        case "workspaceOpen": {
            // A workspace opens where the reader left it, exactly as its
            // sidebar row does; one never visited falls back to its first chat.
            const resume =
                props.facts.groupResume?.get(command.groupId as HappyAgentGroupId) ??
                openGroupFind(props.projects, props.bots, props.tasks, command.groupId)
                    ?.conversations[0]?.id;
            props.onChatSelect(command.happyAgentId, command.groupId, resume);
            return;
        }
        case "fileOpen":
            props.onFileSelect(
                command.happyAgentId,
                command.groupId,
                props.chatId,
                command.path,
                command.fileKind,
            );
            return;
        case "sessionCreate": {
            const workspace = props.workspace;
            const group = openGroupFind(
                props.projects,
                props.bots,
                props.tasks,
                props.groupId,
                props.chatId,
            );
            if (
                !workspace ||
                !group?.create ||
                group.singleConversationId !== undefined ||
                !props.happyAgentOnline()
            )
                return;
            void workspace
                .conversationCreate(group.id, group.create, "command_palette")
                .catch(() => undefined);
            return;
        }
        case "workspaceCreate": {
            const workspace = props.workspace;
            const projectId = props.workspaceCreateProjectId;
            if (!workspace || projectId === undefined || !props.happyAgentOnline()) return;
            void workspace.worktreeCreate(projectId).catch(() => undefined);
            return;
        }
        case "taskCreate":
            if (props.taskCreateAvailable) props.onTaskCreateOpen?.(props.happyAgentId);
            return;
        case "settingsOpen":
            props.onSettingsOpen();
            return;
        case "settingsSectionOpen":
            if (props.onSettingsSectionOpen) props.onSettingsSectionOpen(command.section);
            else props.onSettingsOpen();
            return;
        case "updateApply":
            props.onUpdateApply?.();
            return;
        case "sidebarHiddenUpdate":
            props.sidebarVisibility.sidebarHiddenUpdate(command.hidden);
            return;
        case "surfaceOpen":
            props.onSurfaceOpen?.(command.happyAgentId, command.surfaceId);
            return;
        case "panelToggle":
            props.workspace?.panel.panelToggle();
            return;
    }
}

/**
 * One Happy Agent's inbox inside the window's shell. It subscribes to nothing: the
 * window already reads this store for the sidebar count, so the queue and the
 * badge are one subscription and can never disagree about how many questions
 * are waiting.
 *
 * Naming an item's location and opening the session that asked are addressing
 * acts, which is why they live here rather than in the page: the page renders
 * questions, the window decides where they came from and where they lead.
 */
function HappyAgentInboxSurface(props: {
    onOpenSession(happyAgentId: string, groupId: string, chatId: string): void;
    projects: readonly HappyAgentProjectGroup[];
    happyAgentId: string;
    happyAgentOnline: () => boolean;
    snapshot: HappyAgentInboxSnapshot;
    store: HappyAgentInboxStore;
    unavailable?: string;
}) {
    const locate = (item: HappyAgentInboxItem) => {
        const scope = item.scope;
        if (!scope) return undefined;
        const project = props.projects.find((candidate) => candidate.id === scope.projectId);
        if (!project) return undefined;
        if (scope.kind === "project") return project.name;
        const worktree = project.worktrees.find((candidate) => candidate.id === scope.worktreeId);
        return worktree ? `${project.name} · ${worktree.name}` : project.name;
    };
    return (
        <HappyAgentInboxPage
            answered={props.snapshot.answered}
            {...(props.snapshot.error ? { error: props.snapshot.error } : {})}
            itemLocation={locate}
            itemTime={(item) =>
                inboxItemTime(item.status === "answered" ? item.resolvedAt : item.createdAt)
            }
            loading={props.snapshot.loading}
            messages={props.snapshot.messages}
            onAnswer={(itemId, answers) => {
                if (props.happyAgentOnline()) props.store.itemAnswer(itemId, answers);
            }}
            onMessageChange={(itemId, text) => props.store.itemMessageUpdate(itemId, text)}
            onMessageSubmit={(itemId) => {
                if (props.happyAgentOnline()) props.store.itemMessageSubmit(itemId);
            }}
            onSelectionChange={(itemId, answers) =>
                props.store.itemSelectionUpdate(itemId, answers)
            }
            selections={props.snapshot.selections}
            onOpenSession={(item) => {
                if (!item.scope) return;
                props.onOpenSession(
                    props.happyAgentId,
                    happyAgentSessionGroupIdOf(item.scope),
                    item.sessionId,
                );
            }}
            pending={props.snapshot.pending}
            submissions={props.snapshot.submissions}
            {...(props.unavailable === undefined ? {} : { unavailable: props.unavailable })}
        />
    );
}

/** When a question was asked or settled, as an absolute local time. */
function inboxItemTime(value: number | undefined): string | undefined {
    if (value === undefined) return undefined;
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(value),
    );
}

/** When something happened to an artifact, as an absolute local time. */
function artifactTime(value: number): string {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(value),
    );
}

/**
 * How the artifact surfaces name places, people, and moments: the window's own
 * names for this Happy Agent's bots, tasks, projects, and conversations, and
 * the people the artifact stores have read.
 */
function artifactLabels(
    places: HappyAgentArtifactPlaces,
    people: ReadonlyMap<string, string>,
): HappyAgentArtifactLabels {
    const names = happyAgentArtifactNames(places, people);
    return {
        author: (author) => happyAgentArtifactAuthorLabel(author, names),
        source: (source) => happyAgentArtifactSourceLabel(source, names),
        time: artifactTime,
    };
}

/**
 * Every place the catalog can be narrowed to: each kind of place, then each
 * bot, task, project, and workspace this window lists, by the name it lists
 * it under.
 */
function artifactSourceChoices(
    places: HappyAgentArtifactPlaces,
): readonly HappyAgentArtifactSourceChoice[] {
    return [
        { kind: "bot", label: "Any bot" },
        { kind: "task", label: "Any task" },
        { kind: "project", label: "Any project root" },
        { kind: "workspace", label: "Any workspace" },
        { kind: "agent", label: "Any other conversation" },
        ...places.bots.map((bot) => ({ kind: "bot" as const, id: bot.id, label: bot.name })),
        ...places.tasks.map((task) => ({ kind: "task" as const, id: task.id, label: task.name })),
        ...places.projects.flatMap((project) => [
            { kind: "project" as const, id: project.id, label: project.name },
            ...project.worktrees.map((worktree) => ({
                kind: "workspace" as const,
                id: worktree.id,
                label: `${project.name} / ${worktree.name}`,
            })),
        ]),
    ];
}

/**
 * One Happy Agent's artifacts inside the window's shell: the catalog, or the
 * one artifact the address opens. The places come from the directory the
 * window already holds, so a bot or a project is called here what the sidebar
 * calls it.
 */
function HappyAgentArtifactsSurface(props: {
    artifacts: HappyAgentArtifacts;
    artifactPage?: HtmlPreviewRenderer;
    artifactId?: HappyAgentArtifactId;
    /** The Happy Agent's Surfaces, which an open artifact can be kept among. */
    surfaces?: HappyAgentSurfaceCatalogStore;
    places: HappyAgentArtifactPlaces;
    onArtifactOpen(artifactId: string): void;
    onArtifactClose(): void;
}) {
    const peopleStore = props.artifacts.people();
    const people = useSyncExternalStore(peopleStore.subscribe, peopleStore.get, peopleStore.get);
    const labels = artifactLabels(props.places, people);
    if (props.artifactId !== undefined)
        return (
            <HappyAgentArtifactViewerSurface
                artifactId={props.artifactId}
                {...(props.artifactPage ? { artifactPage: props.artifactPage } : {})}
                artifacts={props.artifacts}
                labels={labels}
                onClose={props.onArtifactClose}
                surfaces={props.surfaces ?? happyAgentSurfaceCatalogStoreNoop}
            />
        );
    return (
        <HappyAgentArtifactCatalogSurface
            artifacts={props.artifacts}
            labels={labels}
            onArtifactOpen={props.onArtifactOpen}
            places={props.places}
        />
    );
}

function HappyAgentArtifactCatalogSurface(props: {
    artifacts: HappyAgentArtifacts;
    labels: HappyAgentArtifactLabels;
    places: HappyAgentArtifactPlaces;
    onArtifactOpen(artifactId: string): void;
}) {
    const store = props.artifacts.catalog();
    const catalog = useSyncExternalStore(store.subscribe, store.get, store.get);
    if (catalog.availability === "unsupported")
        return (
            <EmptyState
                description="This Happy Agent does not keep artifacts. Updating it adds them."
                icon="package"
                size="panel"
                title="No artifacts here"
            />
        );
    return (
        <HappyAgentArtifactsPage
            catalog={catalog}
            labels={props.labels}
            onArtifactOpen={props.onArtifactOpen}
            onDeletedShownChange={store.deletedShownUpdate}
            onLoadMore={store.pageNextLoad}
            onSourceChange={store.filterSourceUpdate}
            onTypeChange={store.filterTypeUpdate}
            sources={artifactSourceChoices(props.places)}
        />
    );
}

function HappyAgentArtifactViewerSurface(props: {
    artifacts: HappyAgentArtifacts;
    artifactPage?: HtmlPreviewRenderer;
    artifactId: HappyAgentArtifactId;
    labels: HappyAgentArtifactLabels;
    onClose(): void;
    surfaces: HappyAgentSurfaceCatalogStore;
}) {
    const store = props.artifacts.viewer();
    const surfaces = useSyncExternalStore(
        props.surfaces.subscribe,
        props.surfaces.get,
        props.surfaces.get,
    );
    const reference = { kind: "artifact", id: props.artifactId } as const;
    const kept = happyAgentSurfaceReferenceFind(surfaces.joined, reference);
    // The address decides which artifact the viewer holds, for exactly as long
    // as this surface shows it; leaving lets the viewer drop it and everything
    // read for it.
    useDisposableLease(props.artifactId, () => {
        store.artifactOpen(props.artifactId);
        return { [Symbol.dispose]: () => store.artifactOpen(undefined) };
    });
    const viewer = useSyncExternalStore(store.subscribe, store.get, store.get);
    return (
        <HappyAgentArtifactViewer
            labels={props.labels}
            onBack={props.onClose}
            onDeletionCancel={store.deletionCancel}
            onDeletionConfirm={store.deletionConfirm}
            onDeletionRequest={store.deletionRequest}
            onFileDownload={(link) => {
                void fileDownload(link.file.path, { type: "url", url: link.url }).catch(
                    () => undefined,
                );
            }}
            onVersionSelect={store.versionSelect}
            onVersionsLoadMore={store.versionsNextLoad}
            {...(props.artifactPage ? { renderPage: props.artifactPage } : {})}
            {...(surfaces.availability === "available"
                ? {
                      surface: {
                          added: kept !== undefined,
                          onToggle: () => {
                              if (kept !== undefined) {
                                  props.surfaces.surfaceLeave(kept.id);
                                  return;
                              }
                              const artifact =
                                  viewer.artifact.type === "ready"
                                      ? viewer.artifact.value
                                      : undefined;
                              props.surfaces.referenceAdd(reference, artifact?.title || "Untitled");
                          },
                      },
                  }
                : {})}
            viewer={viewer.artifactId === props.artifactId ? viewer : VIEWER_OPENING}
        />
    );
}

/** How wide a Surface's shared chat opens: a conversation needs more than a file tree does. */
const SURFACE_CHAT_PANEL_WIDTH = 420;

/**
 * One Surface in the content area. Everything but its content is the same for
 * every type — its header names it and shows who is in it — and the content
 * is chosen by the type: a todo list is shown, and a type this build has no
 * view for says so rather than guessing at one.
 */
function HappyAgentSurfaceContent(props: {
    surfaces: HappyAgentSurfaces;
    surfaceId: HappyAgentSurfaceId;
    support: HappyAgentSurfaceSupportSnapshot;
    /** The connection's clock, which a calendar's line across today follows. */
    clock: HappyAgentClockStore;
    places: SurfacePlaces;
    /** Why this Happy Agent cannot currently accept network actions. */
    unavailable?: string;
    /** Opens what an artifact, bot, or task Surface points at, joining a task first. */
    onTargetOpen: (surface: HappyAgentSurface) => void;
    /** The shared chat the address opens beside the Surface, when it does. */
    chat?: { readonly groupId: string; readonly chatId: string };
    /** Shows the shared chat, at the conversation it is, or hides it. */
    onChatShow: (location: HappyAgentSessionLocation | undefined) => void;
    /** The conversation that is the open chat, as the window composes it. */
    chatConversation: (
        chat: { readonly groupId: string; readonly chatId: string },
        surfaceName: string,
    ) => ReactNode;
}) {
    const catalogStore = props.surfaces.catalog();
    const support = props.support;
    const catalog = useSyncExternalStore(
        catalogStore.subscribe,
        catalogStore.get,
        catalogStore.get,
    );
    const surface = catalog.surfaces.find((entry) => entry.id === props.surfaceId);
    // Until the catalog names it the page is simply empty: a list made here is
    // in the catalog the moment it is asked for, and one opened on launch
    // appears as the catalog arrives, so there is no loader or error to show.
    // One the reader made here and the Happy Agent turned down says why
    // instead.
    if (surface === undefined) {
        const refusal = catalog.createsRefused.get(props.surfaceId);
        return refusal === undefined ? (
            <WindowDragRegion />
        ) : (
            <HappyAgentSurfaceNotMadePage
                name={refusal.name}
                reason={refusal.error.message}
                type={refusal.type}
            />
        );
    }
    const presented = surfaceViewOf(catalog, surface);
    const view: HappyAgentSurfaceView =
        surface.type.kind === "system_monitor" && support.systemMonitors !== "supported"
            ? { ...presented, type: { kind: "unsupported", type: "system_monitor" } }
            : presented;
    const opening = catalog.chatsOpening.get(surface.id);
    // Shown from the moment it is asked for, so the reader sees it being made.
    const chatShown = props.chat !== undefined || opening !== undefined;
    const chatClose = () => {
        catalogStore.chatOpenCancel(surface.id);
        if (props.chat !== undefined) props.onChatShow(undefined);
    };
    // A reference whose target the reader cannot see has no chat they may
    // read either: the daemon guards it by the target's own access.
    const chat: HappyAgentSurfaceChatToggle | undefined =
        happyAgentSurfaceChatSupported(view.type) && surface.target?.state !== "unavailable"
            ? {
                  open: chatShown,
                  working: catalog.chatActivity.get(surface.id) === "running",
                  onToggle: () => {
                      if (chatShown) {
                          chatClose();
                          return;
                      }
                      catalogStore.chatOpen(surface.id).then(props.onChatShow, () => undefined);
                  },
              }
            : undefined;
    // A document or chat reads on its centred column until the reader widens
    // it, and stays as they left it.
    const expanded = catalog.expanded.has(surface.id);
    const width: HappyAgentSurfaceWidthToggle = {
        expanded,
        onToggle: () =>
            catalogStore.surfaceWidthUpdate(surface.id, expanded ? "centered" : "expanded"),
    };
    // The address only asks for the chat; where it is held is the Surface's
    // to say. An address naming any other conversation shows none, and the
    // window replaces it with the Surface's own.
    const found = catalog.chats.get(surface.id);
    const chatFound =
        props.chat !== undefined &&
        found !== undefined &&
        found.sessionId === surface.chatAgentId &&
        found.sessionId === props.chat.chatId &&
        found.groupId === props.chat.groupId
            ? found
            : undefined;
    // Once the chat's composer is there, stray typing lands in it; the
    // Surface's own field gives it up, and keeps it while the chat is still
    // being opened or could not be, and takes it back when the chat closes.
    const conversationShown = chatFound !== undefined && opening?.phase !== "failed";
    const page = () => {
        if (surface.type.kind === "todo")
            return (
                <HappyAgentTodoSurface
                    {...(chat ? { chat } : {})}
                    focusOnType={!conversationShown}
                    store={props.surfaces.todoList(surface.id)}
                    surface={view}
                />
            );
        if (surface.type.kind === "document")
            return (
                <HappyAgentDocumentSurface
                    {...(chat ? { chat } : {})}
                    focusOnType={!conversationShown}
                    store={props.surfaces.document(surface.id)}
                    surface={view}
                    user={documentUserOf(catalog)}
                    width={width}
                />
            );
        if (surface.type.kind === "system_monitor")
            return support.systemMonitors !== "unsupported" ? (
                <HappyAgentSystemMonitorSurface
                    {...(chat ? { chat } : {})}
                    enabled={support.systemMonitors === "supported"}
                    store={props.surfaces.systemMonitor(surface.id)}
                    surface={view}
                />
            ) : (
                <HappyAgentSurfaceUnsupportedPage
                    surface={{ ...view, type: { kind: "unsupported", type: "system_monitor" } }}
                />
            );
        if (surface.type.kind === "chat")
            return (
                <HappyAgentMessagesSurface
                    {...(chat ? { chat } : {})}
                    focusOnType={!conversationShown}
                    store={props.surfaces.messages(surface.id)}
                    surface={view}
                    {...(props.unavailable === undefined ? {} : { unavailable: props.unavailable })}
                    {...(catalog.viewer ? { viewer: catalog.viewer } : {})}
                    width={width}
                />
            );
        if (surface.type.kind === "calendar")
            return (
                <HappyAgentCalendarSurface
                    {...(chat ? { chat } : {})}
                    clock={props.clock}
                    store={props.surfaces.calendar(surface.id)}
                    surface={view}
                />
            );
        if (
            surface.type.kind === "artifact" ||
            surface.type.kind === "bot" ||
            surface.type.kind === "task"
        )
            return (
                <HappyAgentSurfaceReferencePage
                    {...(chat ? { chat } : {})}
                    onOpen={() => props.onTargetOpen(surface)}
                    reference={surfaceReferenceView(surface, props.places)}
                    surface={view}
                />
            );
        return <HappyAgentSurfaceUnsupportedPage surface={view} />;
    };
    // The shell is there whether or not the chat is, so opening it does not
    // remount the Surface's page and lose its scroll, caret, or edit.
    return (
        <AppShell
            embedded
            panel={
                chatShown && chat ? (
                    <HappyAgentSurfaceChatPanel
                        onClose={chatClose}
                        state={
                            opening?.phase === "failed"
                                ? { phase: "failed", message: opening.error.message }
                                : conversationShown
                                  ? { phase: "open" }
                                  : { phase: "opening" }
                        }
                        surfaceName={view.name}
                    >
                        {conversationShown && chatFound !== undefined
                            ? props.chatConversation(
                                  { groupId: chatFound.groupId, chatId: chatFound.sessionId },
                                  view.name,
                              )
                            : null}
                    </HappyAgentSurfaceChatPanel>
                ) : undefined
            }
            panelDefaultWidth={SURFACE_CHAT_PANEL_WIDTH}
            panelResizable
        >
            {page()}
        </AppShell>
    );
}

/**
 * A Surface's shared chat, in the panel beside it. It is the ordinary
 * conversation the address opened — transcript, composer, model and access
 * controls — not a second chat of its own. Its composer claims stray typing:
 * opening the chat is the reader saying that is where they are writing now.
 *
 * Its folder has no file panel here, so a file the transcript names is not
 * opened from it, and a web link opens in the machine's browser.
 */
function HappyAgentSurfaceChat(props: {
    workspace: HappyAgentWorkspaceStore;
    groupId: string;
    chatId: string;
    surfaceName: string;
    artifacts?: HappyAgentArtifacts;
    clock: HappyAgentClockStore;
    providerUsage?: HappyAgentProviderUsageStore;
    viewerId: string;
    happyAgentOnline: () => boolean;
    /** Why this Happy Agent cannot currently accept network actions. */
    unavailable?: string;
    onChatSelect: (groupId: string | undefined, chatId?: string) => void;
    onExternalLinkOpen: (url: string) => void;
    /** The Surfaces the chat's references can name, and where one opens. */
    referenceSurfaces?: MessageReferenceSurfaces;
}) {
    const workspace = useSyncExternalStore(
        reactFrameSubscribe(props.workspace),
        props.workspace.get,
        props.workspace.get,
    );
    const now = useSyncExternalStore(props.clock.subscribe, props.clock.get, props.clock.get);
    const modelUsageWatch = useComposerModelUsageWatch(props.providerUsage);
    // The address applies the conversation before this renders; one still
    // naming another is the moment between, and reads as still loading.
    const conversation =
        workspace.conversation.type === "ready" &&
        workspace.conversation.value.conversationId !== props.chatId
            ? SURFACE_CHAT_LOADING
            : workspace.conversation;
    const writeRefusal = props.unavailable ?? workspace.groupAccess.conversationRefusal;
    return (
        <HappyAgentConversationBody
            activitySelected={false}
            {...(props.artifacts ? { artifacts: props.artifacts } : {})}
            referenceEntities={messageReferenceEntities(workspace.list)}
            onReferenceGroupOpen={(groupId, agentId) => props.onChatSelect(groupId, agentId)}
            {...(props.referenceSurfaces ? { referenceSurfaces: props.referenceSurfaces } : {})}
            modelUsageWatch={modelUsageWatch}
            conversation={conversation}
            emptyContent={
                <EmptyState
                    description={`Everyone in ${props.surfaceName} reads and writes this chat. Its agent can work on ${props.surfaceName} for whoever asks.`}
                    icon="chat"
                    size="panel"
                    title="One chat for everyone here"
                />
            }
            focusOnType
            groupId={props.groupId}
            groupName={props.surfaceName}
            now={now}
            onChatSelect={(groupId, chatId) => props.onChatSelect(groupId, chatId)}
            onFileOpen={() => undefined}
            onFileLinkOpen={() => undefined}
            onLinkOpen={(url) => props.onExternalLinkOpen(url)}
            linkOpenDefault="browser"
            canAbort
            readOnly={false}
            happyAgentOnline={props.happyAgentOnline}
            {...(props.unavailable === undefined ? {} : { unavailable: props.unavailable })}
            {...(writeRefusal === undefined ? {} : { writeRefusal })}
            viewerId={props.viewerId}
            workspace={props.workspace}
        />
    );
}

const SURFACE_CHAT_LOADING = { type: "loading" } as const;

/**
 * Hands the task to `open` once the reader's join of it has landed, and
 * never if the host refuses it. Joining answers as soon as it is asked, so
 * the task is among the reader's Tasks only once the host has answered.
 */
function taskJoinedThen(
    workspace: HappyAgentWorkspaceStore,
    taskId: HappyAgentTaskId,
    open: (task: HappyAgentTask) => void,
): void {
    const settled = (): boolean => {
        const list = workspace.get().list;
        const task = list.tasks.find((entry) => entry.id === taskId);
        if (task !== undefined) open(task);
        return task !== undefined || !list.tasksJoining.has(taskId);
    };
    if (settled()) return;
    const unsubscribe = workspace.subscribe(() => {
        if (settled()) unsubscribe();
    });
}

/** What a reference Surface's page says about what it points at. */
function surfaceReferenceView(
    surface: HappyAgentSurface,
    places: SurfacePlaces,
): HappyAgentSurfaceReferenceView {
    const target = surface.target;
    if (target === undefined) return { phase: "resolving" };
    if (target.state === "unavailable") return { phase: "unavailable", kind: target.kind };
    const joined = target.kind !== "task" || places.tasks.some((task) => task.id === target.id);
    return {
        phase: "available",
        kind: target.kind,
        name: target.name,
        action: joined ? "open" : "join",
    };
}

/** A document Surface, read from its own store for as long as it is on screen. */
function HappyAgentDocumentSurface(props: {
    store: HappyAgentSurfaceDocumentStore;
    surface: HappyAgentSurfaceView;
    user: DocumentEditorUser;
    chat?: HappyAgentSurfaceChatToggle;
    width: HappyAgentSurfaceWidthToggle;
    focusOnType: boolean;
}) {
    const store = props.store;
    const document = useSyncExternalStore(store.subscribe, store.get, store.get);
    const content = ((): HappyAgentDocumentSurfaceContent => {
        switch (document.status) {
            case "loading":
            case "missing":
                return { kind: document.status };
            case "readOnly":
                return { kind: "readOnly", text: document.text };
            case "live":
                return {
                    kind: "live",
                    ydoc: document.ydoc,
                    user: props.user,
                    presence: document.presence,
                    onPresence: store.presenceUpdate,
                    onPointerPress: store.pointerPressUpdate,
                    sync: document.sync,
                    ...(document.failure === undefined
                        ? {}
                        : { failure: document.failure.message }),
                };
        }
    })();
    return (
        <HappyAgentDocumentSurfacePage
            {...(props.chat ? { chat: props.chat } : {})}
            content={content}
            // A document made here opens with the caret in its empty first line.
            {...(document.status === "live" && document.madeHere
                ? { focusKey: document.surfaceId }
                : {})}
            focusOnType={props.focusOnType}
            surface={props.surface}
            width={props.width}
        />
    );
}

/** One visibility-scoped subscription owns the machine's telemetry polling. */
function HappyAgentSystemMonitorSurface(props: {
    store: HappyAgentSystemMonitorStore;
    surface: HappyAgentSurfaceView;
    enabled: boolean;
    chat?: HappyAgentSurfaceChatToggle;
}) {
    const store = props.store;
    // Subscription identity must survive samples: changing it would abort and
    // restart polling on every render. Hidden windows release the subscription.
    const subscribe = useCallback(
        (listener: () => void) => {
            if (!props.enabled) return () => undefined;
            let release: (() => void) | undefined;
            const visibilityChange = () => {
                if (document.visibilityState === "visible") {
                    release ??= store.subscribe(listener);
                    listener();
                } else {
                    release?.();
                    release = undefined;
                }
            };
            document.addEventListener("visibilitychange", visibilityChange);
            visibilityChange();
            return () => {
                document.removeEventListener("visibilitychange", visibilityChange);
                release?.();
            };
        },
        [store, props.enabled],
    );
    const monitor = useSyncExternalStore(subscribe, store.get, store.get);
    return (
        <HappyAgentSystemMonitorSurfacePage
            surface={props.surface}
            monitor={monitor}
            onProcessFilterChange={store.processFilterUpdate}
            onProcessSortChange={store.processSortUpdate}
            {...(props.chat ? { chat: props.chat } : {})}
        />
    );
}

/** The minute a clock is in, so a calendar redraws once a minute rather than every tick. */
function clockMinuteOf(clock: HappyAgentClockStore): number {
    return Math.floor(clock.get() / 60_000) * 60_000;
}

/** A calendar Surface, read from its own store for as long as it is on screen. */
function HappyAgentCalendarSurface(props: {
    store: HappyAgentCalendarStore;
    surface: HappyAgentSurfaceView;
    clock: HappyAgentClockStore;
    chat?: HappyAgentSurfaceChatToggle;
}) {
    const store = props.store;
    const calendar = useSyncExternalStore(store.subscribe, store.get, store.get);
    const now = useSyncExternalStore(
        props.clock.subscribe,
        () => clockMinuteOf(props.clock),
        () => clockMinuteOf(props.clock),
    );
    return (
        <HappyAgentCalendarSurfacePage
            {...(props.chat ? { chat: props.chat } : {})}
            calendar={calendar}
            now={now}
            onAllDayChange={store.editorAllDayUpdate}
            onClose={store.editorClose}
            onDelete={store.editorDelete}
            onDraftMove={store.editorTimingUpdate}
            onDraftOpen={store.draftOpen}
            onEndDateChange={store.editorEndDateUpdate}
            onEndMinutesChange={store.editorEndMinutesUpdate}
            onFailureDismiss={store.failureDismiss}
            onLocationChange={store.editorLocationUpdate}
            onNotesChange={store.editorNotesUpdate}
            onOccurrenceMove={store.occurrenceTimingUpdate}
            onOccurrenceOpen={store.occurrenceEditOpen}
            onPeriodStep={store.periodStep}
            onRecurrenceChange={store.editorRecurrenceUpdate}
            onSave={store.editorSave}
            onStartDateChange={store.editorStartDateUpdate}
            onStartMinutesChange={store.editorStartMinutesUpdate}
            onTimeZoneChange={store.editorTimeZoneUpdate}
            onTitleChange={store.editorTitleUpdate}
            onTodayShow={store.todayShow}
            onViewChange={store.viewUpdate}
            onWeekShow={store.weekShow}
            surface={props.surface}
            timeZones={calendarTimeZones()}
        />
    );
}

/** A chat Surface, read from its own store for as long as it is on screen. */
function HappyAgentMessagesSurface(props: {
    store: HappyAgentSurfaceMessagesStore;
    surface: HappyAgentSurfaceView;
    viewer?: { readonly userId: string | null };
    unavailable?: string;
    chat?: HappyAgentSurfaceChatToggle;
    width: HappyAgentSurfaceWidthToggle;
    focusOnType: boolean;
}) {
    const store = props.store;
    const messages = useSyncExternalStore(store.subscribe, store.get, store.get);
    return (
        <HappyAgentMessagesSurfacePage
            {...(props.chat ? { chat: props.chat } : {})}
            focusOnType={props.focusOnType}
            messages={messages}
            onDraftChange={store.draftUpdate}
            onDraftSubmit={store.draftSubmit}
            onFailureDismiss={store.failureDismiss}
            onMessageDelete={store.messageDelete}
            onMessageEditCancel={store.messageEditCancel}
            onMessageEditCommit={store.messageEditCommit}
            onMessageEditStart={store.messageEditStart}
            onMessageEditTextChange={store.messageEditTextUpdate}
            onOlderLoad={store.olderLoad}
            surface={props.surface}
            {...(props.unavailable === undefined ? {} : { unavailable: props.unavailable })}
            {...(props.viewer ? { viewer: props.viewer } : {})}
            width={props.width}
        />
    );
}

/** A todo list Surface, read from its own store for as long as it is on screen. */
function HappyAgentTodoSurface(props: {
    store: HappyAgentTodoListStore;
    surface: HappyAgentSurfaceView;
    chat?: HappyAgentSurfaceChatToggle;
    focusOnType: boolean;
}) {
    const store = props.store;
    const list = useSyncExternalStore(store.subscribe, store.get, store.get);
    return (
        <HappyAgentTodoSurfacePage
            {...(props.chat ? { chat: props.chat } : {})}
            focusOnType={props.focusOnType}
            list={list}
            onCompletedShownChange={store.completedShownUpdate}
            onDraftChange={store.draftUpdate}
            onDraftSubmit={store.draftSubmit}
            onTodoCompletedChange={(todoId, completed) =>
                store.todoStatusUpdate(todoId, completed ? "completed" : "active")
            }
            onTodoDelete={store.todoDelete}
            onTodoEditCancel={store.todoEditCancel}
            onTodoEditCommit={store.todoEditCommit}
            onTodoEditStart={store.todoEditStart}
            onTodoEditTextChange={store.todoEditTextUpdate}
            onTodoMove={store.todoMove}
            surface={props.surface}
        />
    );
}

/**
 * The artifact a reference in the conversation opened, beside it in the side
 * panel. It is the same viewer the Artifacts page shows, held in a store of
 * its own, opened on the version the reference named when it named one.
 */
function HappyAgentArtifactPanelViewerSurface(props: {
    artifacts: HappyAgentArtifacts;
    artifactPage?: HtmlPreviewRenderer;
    places: HappyAgentArtifactPlaces;
    view: HappyAgentPanelArtifactView;
}) {
    const store = props.artifacts.panelViewer();
    const peopleStore = props.artifacts.people();
    const people = useSyncExternalStore(peopleStore.subscribe, peopleStore.get, peopleStore.get);
    const { artifactId, version } = props.view;
    // The panel decides which artifact this viewer holds for as long as the
    // tab shows it; closing the tab lets the viewer drop everything read.
    useDisposableLease(`${artifactId}@${String(version ?? "latest")}`, () => {
        store.artifactOpen(artifactId, version);
        return { [Symbol.dispose]: () => store.artifactOpen(undefined) };
    });
    const viewer = useSyncExternalStore(store.subscribe, store.get, store.get);
    return (
        <HappyAgentArtifactViewer
            labels={artifactLabels(props.places, people)}
            onDeletionCancel={store.deletionCancel}
            onDeletionConfirm={store.deletionConfirm}
            onDeletionRequest={store.deletionRequest}
            onFileDownload={(link) => {
                void fileDownload(link.file.path, { type: "url", url: link.url }).catch(
                    () => undefined,
                );
            }}
            onVersionSelect={store.versionSelect}
            onVersionsLoadMore={store.versionsNextLoad}
            {...(props.artifactPage ? { renderPage: props.artifactPage } : {})}
            tab
            viewer={viewer.artifactId === artifactId ? viewer : VIEWER_OPENING}
        />
    );
}

/**
 * An artifact the reader moved out of the side panel, as a tab of the main
 * content: the same viewer again, opened on the version it was on when it
 * moved. A tab is ended by its own close button and has no page behind it to
 * go back to, so the viewer offers no way back.
 */
function HappyAgentArtifactTabSurface(props: {
    artifacts: HappyAgentArtifacts;
    artifactPage?: HtmlPreviewRenderer;
    places: HappyAgentArtifactPlaces;
    tab: Extract<HappyAgentPanelTabSnapshot, { kind: "artifact" }>;
}) {
    const store = props.artifacts.tabViewer();
    const peopleStore = props.artifacts.people();
    const people = useSyncExternalStore(peopleStore.subscribe, peopleStore.get, peopleStore.get);
    const { artifactId, version } = props.tab;
    // The main content shows one tab at a time, so the tab on screen holds the
    // shared viewer for as long as it is shown.
    useDisposableLease(`${props.tab.id}:${artifactId}@${String(version ?? "latest")}`, () => {
        store.artifactOpen(artifactId, version);
        return { [Symbol.dispose]: () => store.artifactOpen(undefined) };
    });
    const viewer = useSyncExternalStore(store.subscribe, store.get, store.get);
    return (
        <HappyAgentArtifactViewer
            labels={artifactLabels(props.places, people)}
            onDeletionCancel={store.deletionCancel}
            onDeletionConfirm={store.deletionConfirm}
            onDeletionRequest={store.deletionRequest}
            onFileDownload={(link) => {
                void fileDownload(link.file.path, { type: "url", url: link.url }).catch(
                    () => undefined,
                );
            }}
            onVersionSelect={store.versionSelect}
            onVersionsLoadMore={store.versionsNextLoad}
            {...(props.artifactPage ? { renderPage: props.artifactPage } : {})}
            tab
            viewer={viewer.artifactId === artifactId ? viewer : VIEWER_OPENING}
        />
    );
}

/**
 * What the viewer shows in the one commit between an address naming an
 * artifact and the viewer being told to open it, so the previous artifact is
 * never drawn under the new address.
 */
const VIEWER_OPENING = {
    artifact: { type: "loading" },
    versions: [],
    versionsLoading: false,
    versionsHasMore: false,
    files: [],
    content: { type: "loading" },
    deletion: { phase: "idle" },
} as const satisfies import("happy-desktop-state").HappyAgentArtifactViewerSnapshot;

/** The identity of a chat's narrowing, so the list is told only when it changes. */
function artifactChatContextKey(context: HappyAgentArtifactChatContext | undefined): string {
    if (context === undefined) return "none";
    const narrowing = (value: HappyAgentArtifactChatContext["chat"]): string =>
        value.by === "agent" ? `agent:${value.agentId}` : `${value.kind}:${value.id}`;
    return context.place
        ? `${narrowing(context.chat)}|${context.place.kind}:${narrowing(context.place.narrowing)}`
        : narrowing(context.chat);
}

/**
 * The side panel's list of what the open chat has published. The chat the
 * panel sits beside narrows it; the reader widens it to the chat's place or to
 * everything.
 */
function HappyAgentArtifactsPanelSurface(props: {
    artifacts: HappyAgentArtifacts;
    context?: HappyAgentArtifactChatContext;
    places: HappyAgentArtifactPlaces;
    onArtifactOpen(artifactId: string): void;
}) {
    const store = props.artifacts.panel();
    // Navigation decides which chat the list sits beside; the list is told
    // once per chat rather than on every render of the workspace around it.
    useDisposableLease(artifactChatContextKey(props.context), () => {
        store.contextApply(props.context);
        return { [Symbol.dispose]: () => undefined };
    });
    const catalog = useSyncExternalStore(store.subscribe, store.get, store.get);
    const peopleStore = props.artifacts.people();
    const people = useSyncExternalStore(peopleStore.subscribe, peopleStore.get, peopleStore.get);
    return (
        <HappyAgentArtifactsPanel
            catalog={catalog}
            labels={artifactLabels(props.places, people)}
            onArtifactOpen={props.onArtifactOpen}
            onLoadMore={store.pageNextLoad}
            onScopeChange={store.scopeUpdate}
        />
    );
}

interface HappyAgentWorkspaceSurfaceProps {
    /** The Surfaces the transcript's references can name, and where one opens. */
    referenceSurfaces?: MessageReferenceSurfaces;
    /** Draws a sidebar proposal in Prioritizing's chat; absent without Spaces. */
    sidebarProposal?: (artifactId: string, fit: InlinePageFit) => ReactNode;
    /** Draws a story an agent drafted, in its chat; absent while Stories are off. */
    storyRender?: (artifactId: string, fit: InlinePageFit) => ReactNode;
    /** The machine's artifacts, present only once it has said it keeps them. */
    artifacts?: HappyAgentArtifacts;
    /** Shows an HTML artifact opened beside the conversation as a site of its own. */
    artifactPage?: HtmlPreviewRenderer;
    /** Opens one artifact in the viewer. */
    onArtifactOpen?: (artifactId: string) => void;
    /** Account usage for the model picker's account submenu; read only while that submenu is open. */
    providerUsage?: HappyAgentProviderUsageStore;
    /** The conversation a voice call points at in this Happy Agent, marked on its tab. */
    voiceFocusSessionId?: string;
    browserConnectionId: string | null;
    /** Unified outer route and daemon health for this already materialized Happy Agent. */
    availability: HappyAgentAvailabilitySnapshot;
    /** Re-reads unified availability when a retained network handler fires. */
    happyAgentOnline: () => boolean;
    /** Joined conversation-list + active-conversation product store. */
    workspace: HappyAgentWorkspaceStore;
    /**
     * The tiers every Changes listing is split by. The host's, whichever
     * machine this workspace is on: tiers are one list for the whole window,
     * and Settings edits the host's.
     */
    changeTiers?: HappyAgentChangeTiersStore;
    /**
     * The Happy Agent's projects, for the surfaces that address a project the window is
     * not currently open on — the settings dialog reached from any row.
     */
    projects: readonly HappyAgentProjectGroup[];
    /** Ticking clock feeding relative timestamps in the conversation list. */
    clock: HappyAgentClockStore;
    appearance: AppearanceStore;
    platform?: "desktop" | "web";
    browserContent?: BrowserContentRenderer;
    htmlPreview?: HtmlPreviewRenderer;
    mediaWindow?: MediaWindowOpener;
    /** Whether active session titles shimmer in the tab strip. */
    titleShimmerEnabled: boolean;
    /** Identity of the human reading and writing this Happy Agent. */
    viewerId: string;
    groupId?: string;
    chatId?: string;
    onChatSelect(groupId: string | undefined, chatId?: string, replace?: boolean): void;
    onChatClose(groupId: string, chatId: string, fallbackChatId?: string): boolean;
    onFileClose(groupId: string, path: string): void;
    onFileSelect(
        groupId: string,
        chatId: string | undefined,
        path: string,
        kind: HappyAgentFileTabKind,
        replace?: boolean,
    ): void;
    /** Opens one web address in the machine's own browser rather than in an embedded tab. */
    onExternalLinkOpen(url: string): void;
    /** Which of the two places a plain click on a link goes, marked in its menu. */
    linkOpenDefault: LinkOpenPlacement;
    /** What the spaces sidebar adds to the chats it opens. */
    spaces?: HappyAgentWorkspaceSpaces;
}

/** What the spaces sidebar adds to a workspace it shows. */
interface HappyAgentWorkspaceSpaces {
    /** The identity a chat's tab wears: its space's name and icon, or its stem cell. */
    chatMark(
        sessionId: string,
    ):
        | (Pick<TabItem, "icon" | "imageMark" | "imageUrl" | "stemCell"> &
              Partial<Pick<TabItem, "label">>)
        | undefined;
    /** Which space a chat's hand-folded floaty is remembered for. */
    floatyKey(sessionId: string): string | undefined;
    /**
     * The block that opens a chat's transcript, such as new work's stem cell
     * and the line under it; `settled` once the chat has begun.
     */
    chatHeader(sessionId: string, settled: boolean): ConversationLeadingHeader | undefined;
    /** Bookkeeping a conversation reads as one-line summaries, such as Happy's sidebar batches. */
    chatNotes(sessionId: string): ReadonlyMap<string, ConversationNote> | undefined;
}

/**
 * One Happy Agent's workspace. It subscribes once each to that Happy Agent's connection,
 * workspace, panel, clock, and appearance stores (no local React state) and
 * composes the shared `happy-desktop-ui` components, including `ConversationView`
 * for the selected conversation and the desktop affordances (the model and
 * effort pickers beneath the composer, the settings
 * dialog holding the view toggles and access pickers, and the usage and activity
 * panels) passed into that surface.
 *
 * The right panel is the workspace's tool column: terminals now, other kinds of
 * tab later. It is a second subscription rather than part of the workspace
 * snapshot because a live terminal repaints far faster than the conversation does
 * and must not drag this whole surface through a render to do it.
 *
 * Until this Happy Agent's daemon connection is live it shows the connection status with
 * a retry. Which conversation is shown comes from the route through `chatId`, and
 * choosing another one is a navigation request; materialization and every draft
 * keystroke live in the workspace store outside React, so this component stays a
 * pure projection.
 */
/**
 * The model picker's account-usage feed for one session. The picker treats a
 * new watch as a new lease on the daemon's usage reads, so it keeps one identity
 * for as long as the store does.
 */
function useComposerModelUsageWatch(
    store: HappyAgentProviderUsageStore | undefined,
): ComposerModelUsageWatch | undefined {
    return useMemo(() => (store ? happyAgentComposerModelUsageWatch(store) : undefined), [store]);
}

function HappyAgentWorkspaceSurface(props: HappyAgentWorkspaceSurfaceProps) {
    const modelUsageWatch = useComposerModelUsageWatch(props.providerUsage);
    const workspaceFocusedPane = useRef<AppShellFocusedPane>("workspace");
    // AppShell's panel callback ref treats this callback's identity as the
    // panel lifetime, so ordinary store renders must keep it stable.
    const workspaceFocusedPaneChange = useCallback((pane: AppShellFocusedPane): void => {
        workspaceFocusedPane.current = pane;
    }, []);
    const workspace = useSyncExternalStore(
        reactFrameSubscribe(props.workspace),
        props.workspace.get,
        props.workspace.get,
    );
    const panel = useSyncExternalStore(
        props.workspace.panel.subscribe,
        props.workspace.panel.get,
        props.workspace.panel.get,
    );
    const now = useSyncExternalStore(props.clock.subscribe, props.clock.get, props.clock.get);
    const appearance = useSyncExternalStore(
        props.appearance.subscribe,
        props.appearance.get,
        props.appearance.get,
    );
    // A materialized workspace is a Happy Agent lifetime, not a connection lifetime.
    // Health only changes what this mounted surface may do and what it says
    // about the state already on screen.
    const availability = props.availability;
    const connectionRefusal = availability.refusal;
    const happyAgentOnline = props.happyAgentOnline;
    const terminalHappyAgentAvailability = availability.online
        ? undefined
        : availability.state === "reconnecting"
          ? ("reconnecting" as const)
          : ("unavailable" as const);

    // Inside an open project the directory is already decided, so every "new
    // session" affordance here starts one in it rather than asking again.
    const groupConversationCreate = (
        group: OpenGroup,
        source: HappyAgentConversationSource = "workspace",
    ) => {
        if (!happyAgentOnline() || !group.create) return;
        void props.workspace
            .conversationCreate(group.id, group.create, source)
            .catch(() => undefined);
    };

    const projects = workspace.list.projects;
    const rows = projects.type === "ready" ? projects.value : [];
    // What may be done in the addressed checkout, as the state decided it.
    // Connection health stays separate: each control combines the relevant
    // durable refusal with connection state at the boundary where it acts.
    const access = workspace.groupAccess;
    // Why a chat cannot be started here or sent to. A workspace whose checkout
    // Happy Agent is still preparing refuses the second and not the first, so the two
    // reasons are kept apart all the way down to the controls: a composer reads
    // this one, while file and terminal actions read the write refusal above it.
    const openGroupChatRefusal = access.conversationRefusal;
    const openGroup = openGroupFind(
        rows,
        workspace.list.bots,
        workspace.list.tasks,
        props.groupId,
        props.chatId,
    );
    // Where this machine's artifacts can have been made, as the list names it.
    const artifactPlaces: HappyAgentArtifactPlaces = {
        bots: workspace.list.bots,
        projects: rows,
        tasks: workspace.list.tasks,
    };
    // A bot and each subtask are separate single-chat destinations, even when
    // they share a workspace. Only the root bot gets bot-specific content.
    const openBot = workspace.list.bots.find(
        (bot) => bot.conversation.id === openGroup?.singleConversationId,
    );
    // Whether another session may be added here. A workspace whose checkout is
    // still being prepared already has the one it was made with and can take no
    // second: Happy Agent does not queue an agent against a checkout that is not there,
    // so the control is disabled until it arrives rather than offering a tab
    // that could not open.
    const sessionCreateAvailable =
        openGroup?.create !== undefined &&
        // A bot has exactly one conversation and can never have a second, so
        // the control that would start one is not offered here at all.
        openGroup.singleConversationId === undefined &&
        connectionRefusal === undefined &&
        openGroupChatRefusal === undefined &&
        workspaceLifecyclePhase(openGroup.lifecycle) !== "creating";
    // The worktree phase this screen has to say something about. `ready` and a
    // project both leave it absent: there is nothing to interrupt the reader
    // with when the place they are looking at is simply there.
    const openGroupPhase = workspaceLifecyclePhase(openGroup?.lifecycle);
    // Whether that phase is the whole screen rather than a lane over it. It is,
    // and only is, when nothing has ever run here and nothing ever can: an empty
    // workspace that failed, was refused, or has lost its folder has no composer
    // worth drawing. One that is merely being prepared does — it takes chats
    // already — so the phase goes in the lane above it instead.
    const openGroupNotice =
        openGroup !== undefined &&
        openGroup.conversations.length === 0 &&
        openGroupPhase !== undefined &&
        !access.canConverse;
    const workspaceComposerNotice =
        openGroup !== undefined && openGroupPhase !== undefined && openGroupPhase !== "creating"
            ? workspaceLifecycleNoticeLines({
                  name: openGroup.name,
                  phase: openGroupPhase,
                  ...(openGroup.lifecycle?.phase === "failed" &&
                  openGroup.lifecycle.reason !== undefined
                      ? { detail: openGroup.lifecycle.reason }
                      : {}),
                  ...(openGroup.path ? { path: openGroup.path } : {}),
              })
            : undefined;
    // The one phase that takes the body of the first chat rather than a strip
    // above it. A workspace is addressed the instant it is asked for, so this is
    // the screen the reader lands on straight after clicking: the checkout being
    // prepared is the only thing happening here, so it is the only thing shown,
    // with the composer still live underneath it. Every control that would act
    // on a directory that is not there yet is withheld for the same reason —
    // there is nothing behind them to act on until the checkout arrives.
    const openGroupPreparing = openGroupPhase === "creating";
    // Whether there is a checkout here to read at all: not while it is being
    // prepared. Every control that reads the checkout keys off this one fact.
    const checkoutClosed = openGroupPreparing;
    const panelCloseTarget = checkoutClosed ? undefined : panelCloseTargetFind(panel);
    // The address the reader was sent to when a creation was accepted locally
    // and then refused. There is no row at it any more — happy-agent-connect withdrew
    // the one it had predicted — so the address answers for itself here rather
    // than falling through to "no project open".
    const refusedCreate =
        openGroup === undefined && props.groupId !== undefined
            ? workspace.list.worktreeCreateFailures.get(props.groupId as HappyAgentWorktreeId)
            : undefined;
    const groupFileTabs = openGroup
        ? workspace.fileTabs.filter(
              (tab) => tab.groupId === openGroup.id && tab.placement === "main",
          )
        : [];
    // The checkout's whole change, where the reader has it open. It is one per
    // checkout, so the addressed group names it outright rather than the strip
    // being searched for it.
    const openReview = openGroup ? workspace.reviews.get(openGroup.id) : undefined;
    const activeReview = openReview?.id === workspace.activeMainViewId ? openReview : undefined;
    const activeFile = groupFileTabs.find((tab) => tab.id === workspace.activeMainViewId);
    const displayedFileTab = groupFileTabs.find((tab) => tab.id === workspace.displayedMainViewId);
    const displayedFile =
        displayedFileTab?.displayedDocument === undefined
            ? displayedFileTab
            : {
                  ...displayedFileTab,
                  kind: displayedFileTab.displayedKind ?? displayedFileTab.kind,
                  path: displayedFileTab.displayedPath ?? displayedFileTab.path,
                  document: {
                      type: "ready" as const,
                      value: displayedFileTab.displayedDocument,
                  },
              };
    const pendingFile =
        activeFile &&
        (workspace.displayedMainViewId !== activeFile.id ||
            (activeFile.displayedPresentationId !== activeFile.presentationId &&
                (activeFile.document.type !== "ready" ||
                    activeFile.document.value !== activeFile.displayedDocument)))
            ? activeFile
            : undefined;
    // Terminals, pages, and artifacts the reader moved out of the panel. They
    // belong to the addressed group the way the panel does, so they are listed
    // and drawn here only while that group is the one open.
    const mainTools = openGroup ? toolTabsPlaced(panel, "main") : [];
    // An artifact moved here is named by the same live title as everywhere else.
    const artifactTitlesStore = props.artifacts?.titles() ?? artifactTitlesStoreNoop;
    const artifactTitles = useSyncExternalStore(
        artifactTitlesStore.subscribe,
        artifactTitlesStore.get,
        artifactTitlesStore.get,
    );
    const activeMainTool = mainTools.find((tab) => tab.id === workspace.activeMainViewId);
    const displayedMainTool = mainTools.find((tab) => tab.id === workspace.displayedMainViewId);
    const openInRecent = workspace.openInRecent;
    const conversation = workspace.conversation;
    // A chat that belongs to another session rather than to this group's strip.
    // The state says so outright — the host gives such a session no place in an
    // order — because the alternatives all lie at the moment it matters: a
    // session is addressed the instant it is named, so it is legitimately
    // missing from the rows for a moment after the reader creates it, and
    // reading that absence as delegation locked them out of their own new chat
    // and put someone else's name on it.
    const detachedConversationId =
        workspace.conversationDelegated && props.chatId ? props.chatId : undefined;
    const detachedConversation =
        detachedConversationId && conversation.type === "ready" ? conversation.value : undefined;
    const detachedConversationTab: TabItem | undefined = detachedConversationId
        ? {
              id: detachedConversationId,
              // Child chats identify themselves by their title, not a generated face.
              label: detachedConversation?.title ?? "Untitled",
              labelShimmer: props.titleShimmerEnabled,
              ...(detachedConversation !== undefined &&
              happyAgentConversationWorking(detachedConversation)
                  ? { busy: true }
                  : {}),
          }
        : undefined;
    // Sessions without a list position are delegated children. They remain
    // readable by id, but their runner owns their input and configuration.
    // A workspace that cannot take a chat cannot take a message into an old
    // conversation either: the session is pointed at a checkout that will never
    // be usable, so what it read before stays readable and its input closes with
    // the reason it closed for. A checkout merely still being prepared is not
    // that: Happy Agent holds the message until the directory arrives, so the input
    // stays open and the reader can keep writing.
    const conversationReadOnly =
        detachedConversationId !== undefined || openGroupChatRefusal !== undefined;
    const conversationReadOnlyReason =
        detachedConversationId !== undefined
            ? conversationLockedPlaceholder(detachedConversation?.title)
            : openGroupChatRefusal;
    // Stopping is not writing. An unusable checkout still has whatever was
    // already running in it, and leaving the reader unable to end that would be
    // work they can see, cannot write to, and cannot stop either.
    const conversationCanAbort =
        availability.online && detachedConversationId === undefined && access.canAbort;
    // Child agents expose one chat, even when they share a checkout. Files and
    // tools can still sit beside that pinned conversation.
    const groupTabs: TabItem[] = [
        ...botTabPin(
            tabsOrdered(
                openGroup
                    ? [
                          ...(detachedConversationTab
                              ? [detachedConversationTab]
                              : sessionTabs(
                                    openGroup,
                                    props.titleShimmerEnabled,
                                    openGroup.singleConversationId !== undefined &&
                                        openBot === undefined,
                                )
                          )
                              .map((tab) =>
                                  availability.online ? tab : { ...tab, closable: false },
                              )
                              .map((tab) =>
                                  tab.id === props.voiceFocusSessionId
                                      ? { ...tab, voiceFocus: true }
                                      : tab,
                              )
                              .map((tab) => {
                                  const mark = props.spaces?.chatMark(tab.id);
                                  return mark ? { ...tab, ...mark } : tab;
                              }),
                          // The strip holds only chats and files.
                          ...groupFileTabs.map(fileTabItem),
                      ]
                    : [],
                workspace.tabOrder,
            ),
            detachedConversationId ?? openGroup?.singleConversationId,
        ),
    ];
    // The floaty's agents: what this conversation has delegated, by the names
    // they were started under, with what is over one level down.
    const floatyAgents = workFloatyAgents(
        conversation.type === "ready" ? conversation.value.subagents : [],
    );
    // What the work changed: the checkout's own diff where Git keeps one, and
    // the conversation's edits where it does not, such as a task's folder.
    const floatyFromGit = (openGroup?.changes.length ?? 0) > 0;
    const floatyEdits =
        floatyFromGit || conversation.type !== "ready"
            ? []
            : conversationFileChanges(conversation.value.entries);
    const changeDiff =
        panel.changeViewPath === undefined || conversation.type !== "ready"
            ? undefined
            : conversationFileDiff(conversation.value.entries, panel.changeViewPath);
    // The listing Changes shows: the checkout's own where Git keeps one, the
    // conversation's edits where it does not.
    const panelChanges: readonly HappyAgentPanelChange[] = floatyFromGit
        ? (openGroup?.changes ?? [])
        : floatyEdits.map((change) => ({
              path: change.path,
              addedLines: change.added,
              deletedLines: change.deleted,
          }));
    // The places this chat changed files, its own first.
    const floatyOwnPlace =
        openGroup === undefined
            ? undefined
            : workFloatyOwnPlace(openGroup, rows, panelChanges, floatyFromGit);
    // A workspace the card names opens the way its sidebar row does: where it
    // was left, or on its newest chat, with its changes beside it.
    const workspaceOpen = (groupId: HappyAgentGroupId) => {
        const group = rows
            .flatMap((project) => [project, ...project.worktrees])
            .find((candidate) => candidate.id === groupId);
        workspaceChangesShowOnOpen(props.workspace, group);
        props.onChatSelect(
            groupId,
            props.workspace.get().groupResume?.get(groupId) ?? group?.conversations[0]?.id,
        );
    };
    const floatyPlaces: readonly WorkFloatyPlace[] = [
        ...(floatyOwnPlace ? [floatyOwnPlace] : []),
        ...(props.chatId === undefined
            ? []
            : workFloatyCreatedPlaces(rows, props.chatId, openGroup?.id)),
    ];
    // What this chat has published. Read while the chat is open, since the
    // floaty opens on its own once there is any.
    const floatyArtifacts = props.onArtifactOpen ? props.artifacts : undefined;
    const floatyArtifactStore = floatyArtifacts?.panel() ?? happyAgentArtifactCatalogStoreNoop;
    const floatyArtifactContext = happyAgentArtifactChatContext(
        artifactPlaces,
        props.groupId,
        props.chatId,
    );
    useDisposableLease(
        floatyArtifacts ? artifactChatContextKey(floatyArtifactContext) : undefined,
        () => {
            floatyArtifactStore.contextApply(floatyArtifactContext);
            return { [Symbol.dispose]: () => undefined };
        },
    );
    const floatyCatalog = useSyncExternalStore(
        floatyArtifactStore.subscribe,
        floatyArtifactStore.get,
        floatyArtifactStore.get,
    );
    const floatyOutputs = workFloatyOutputs(floatyCatalog.artifacts, props.chatId);
    // The floaty opens on its own wherever there is work to show, and stays
    // folded where the reader folded it by hand until they open it again.
    // With the spaces sidebar, a fold is remembered for the space, not the chat.
    const floatyChatId =
        conversation.type === "ready" ? conversation.value.conversationId : undefined;
    const floatyKey =
        floatyChatId === undefined
            ? undefined
            : (props.spaces?.floatyKey(floatyChatId) ?? floatyChatId);
    const floatyShown =
        floatyKey !== undefined &&
        panel.floatyOpened.has(floatyKey) &&
        (floatyPlaces.length > 0 ||
            floatyOutputs.length > 0 ||
            floatyAgents.current.length > 0 ||
            floatyAgents.history.length > 0);
    // The row whose tab the pane beside the chat is showing.
    const floatyActiveTab = panel.open
        ? panel.tabs.find((tab) => tab.id === panel.activeViewId)
        : undefined;
    const floatySelectedId = !panel.open
        ? undefined
        : panel.activeViewId === "files"
          ? floatyPlaces.find((place) => place.workspaceId === undefined)?.row.id
          : panel.activeViewId === "artifact" && panel.artifactView
            ? `${FLOATY_ARTIFACT_PREFIX}${panel.artifactView.artifactId}`
            : floatyActiveTab?.kind === "chat"
              ? floatyActiveTab.agentId
              : undefined;
    // Closing a tab archives the session behind it, while a file tab simply
    // closes. The close control and every context-menu sweep funnel through
    // this one routine, so a sweep behaves exactly like closing each tab by
    // hand. History is repaired before the session leaves the list. It chooses
    // the most recently visited survivor in this workspace; a requested keeper
    // or the nearest surviving session to the left is its fallback.
    const groupTabsClose = (tabIds: readonly string[], keepId?: string) => {
        const current = props.workspace.get();
        const currentRows =
            current.list.projects.type === "ready" ? current.list.projects.value : [];
        const currentGroup = openGroupFind(
            currentRows,
            current.list.bots,
            current.list.tasks,
            current.address.groupId,
            current.address.conversationId,
        );
        if (!currentGroup) return;
        const panelNow = props.workspace.panel.get();
        const online = happyAgentOnline();
        const sessionIds = new Set(currentGroup.conversations.map((summary) => summary.id));
        const fileIds = new Set(
            current.fileTabs
                .filter((tab) => tab.groupId === currentGroup.id && tab.placement === "main")
                .map((tab) => tab.id),
        );
        const toolIds = new Set<string>(
            panelNow.tabs.filter((tab) => tab.placement === "main").map((tab) => tab.id),
        );
        const closeableIds = tabIds.filter(
            (tabId) =>
                fileIds.has(tabId) ||
                toolIds.has(tabId) ||
                (online &&
                    tabId !== currentGroup.singleConversationId &&
                    sessionIds.has(tabId as HappyAgentSessionId)),
        );
        const targets = new Set(closeableIds);
        const rest = currentGroup.conversations.filter((summary) => !targets.has(summary.id));
        const selectedSessionIndex = current.address.conversationId
            ? currentGroup.conversations.findIndex(
                  (summary) => summary.id === current.address.conversationId,
              )
            : -1;
        const leftFallbackSessionId =
            selectedSessionIndex < 1
                ? undefined
                : currentGroup.conversations
                      .slice(0, selectedSessionIndex)
                      .reverse()
                      .find((summary) => !targets.has(summary.id))?.id;
        const fallbackSessionId =
            keepId !== undefined && rest.some((summary) => summary.id === keepId)
                ? keepId
                : (leftFallbackSessionId ?? rest[0]?.id);
        let selectedHistoryRepaired = false;
        for (const tabId of closeableIds) {
            if (fileIds.has(tabId)) {
                const file = current.fileTabs.find((tab) => tab.id === tabId);
                if (file) props.onFileClose(file.groupId, file.path);
                props.workspace.fileClose(tabId);
                continue;
            }
            // A terminal or a page closes where it is drawn: it was moved here,
            // not copied, so this is the only tab it has and closing it ends
            // the shell or the page rather than sending it back.
            if (toolIds.has(tabId)) {
                props.workspace.panel.tabClose(tabId as HappyAgentPanelTabId);
                continue;
            }
            const repaired = props.onChatClose(currentGroup.id, tabId, fallbackSessionId);
            if (tabId === current.address.conversationId) selectedHistoryRepaired = repaired;
            void props.workspace
                .conversationArchive(tabId as HappyAgentSessionId)
                .catch(() => undefined);
        }
        // A router-backed window repairs and lands through its navigation stack,
        // which preserves the most recently visited survivor. Standalone
        // Blueprint composition has no history owner, so it receives the same
        // left-tab/workspace fallback directly.
        if (
            current.address.conversationId &&
            targets.has(current.address.conversationId) &&
            !selectedHistoryRepaired
        )
            props.onChatSelect(currentGroup.id, fallbackSessionId, true);
    };
    const groupTabClose = (tabId: string) => {
        // The review is one tab of one checkout, and the state knows it by that
        // checkout rather than by a strip id, so it closes by name.
        if (openReview?.id === tabId && openGroup) {
            props.workspace.reviewClose(openGroup.id);
            return;
        }
        // A detached subagent's tab is an address, not a member of the list:
        // closing it only steps back to the sessions that are listed.
        if (tabId === detachedConversationId) {
            props.onChatSelect(openGroup?.id, openGroup?.conversations[0]?.id, true);
            return;
        }
        groupTabsClose([tabId]);
    };
    const panelViewClose = (viewId: string) => {
        if (viewId === "files") props.workspace.panel.filesClose();
        else if (viewId === "activity") props.workspace.activityPanelClose();
        else if (viewId === "usage") props.workspace.usagePanelClose();
        else if (viewId === "devices") props.workspace.panel.devicesClose();
        else if (viewId === "preview") props.workspace.panel.previewClose();
        else if (viewId === "change") props.workspace.panel.changeViewClose();
        else if (viewId === "file") props.workspace.filePanelClose();
        else if (viewId === "artifact") props.workspace.panel.artifactViewClose();
        else props.workspace.panel.tabClose(viewId as HappyAgentPanelTabId);
    };
    const activeTabClose = () => {
        const target = workspaceCloseTargetFind(
            workspaceFocusedPane.current,
            props.workspace.panel.get(),
            checkoutClosed,
        );
        if (target.type !== "main") {
            if (target.type === "view") panelViewClose(target.viewId);
            else props.workspace.panel.panelToggle();
            // The last tab closed takes the pane with it, and the keyboard
            // returns to the selected main tab.
            if (!props.workspace.panel.get().open) {
                const shell = [
                    ...document.querySelectorAll<HTMLElement>(
                        '[data-happy-desktop-ui="app-shell"][data-embedded]',
                    ),
                ].find((element) => element.getClientRects().length > 0);
                const mainTab = shell?.querySelector<HTMLElement>(
                    '[data-happy-desktop-ui="app-shell-workspace"] [data-happy-desktop-ui="tab"][aria-selected="true"]',
                );
                mainTab?.focus();
                workspaceFocusedPane.current = "workspace";
            }
            return;
        }
        const current = props.workspace.get();
        const tabId = current.activeMainViewId ?? current.address.conversationId;
        if (tabId) groupTabClose(tabId);
        else if (openGroup) props.workspace.groupArchiveOpen(openGroup.id);
    };
    // The strip in the order it is drawn, without the detached subagent: it is
    // addressed rather than listed, so a sweep over "the tabs beside this one"
    // never reaches it.
    const sweepableTabs = groupTabs.filter((entry) => entry.id !== detachedConversationId);
    const previewTool = previewToolFind(conversation, panel.previewEntryId);
    const previewMedia = previewMediaFind(conversation, previewTool, panel.previewMediaIndex);
    const desktop = props.platform === "desktop";

    // Whether the chat this workspace was made with is what is on screen. That
    // chat carries the checkout's phase itself, so the lane above the tab strip
    // does not: a file or a terminal open here is not that chat, and those keep
    // the lane. It is suppressed even when the chat says nothing at all — a new
    // workspace is an ordinary empty chat, and the sidebar row is already
    // showing that its checkout is being prepared.
    const preparingChatOnScreen =
        openGroupPreparing &&
        openGroup !== undefined &&
        activeMainTool === undefined &&
        activeFile === undefined;
    // Follow the displayed pane, not the selected file that may still be loading.
    // A disabled chat input still owns its notice; a file, tool, or loading chat
    // has no dock, so the workspace lane remains its fallback.
    const workspaceNoticeInComposer =
        workspaceComposerNotice !== undefined &&
        !openGroupNotice &&
        displayedMainTool === undefined &&
        activeReview === undefined &&
        displayedFile === undefined &&
        (conversation.type === "ready" ||
            (openGroup?.conversations.length === 0 && workspace.groupComposer !== undefined));
    const mainFileBody = (file: HappyAgentFileTabSnapshot): ReactNode => (
        <HappyAgentFileBody
            appearance={appearance.appearance}
            file={file}
            tabNamed
            {...(props.htmlPreview ? { htmlPreview: props.htmlPreview } : {})}
            key={`${file.id}:${file.kind}`}
            {...(props.mediaWindow ? { mediaWindow: props.mediaWindow } : {})}
            mode={workspace.fileViewMode}
            comments={workspace.fileComments.comments.filter(
                (comment) => comment.anchor.path === file.path,
            )}
            {...(workspace.fileComments.draft?.anchor.path === file.path
                ? { commentDraft: workspace.fileComments.draft }
                : {})}
            happyAgentOnline={happyAgentOnline}
            onMainFileOpen={(path, kind, selection) => {
                // The address names the file; the region is the ask that came
                // with it, and the tab keeps it because a file's own address is
                // re-applied as a preview and leaves a region alone.
                if (selection !== undefined)
                    props.workspace.fileOpen(file.groupId, path, kind, selection);
                props.onFileSelect(file.groupId, props.chatId, path, kind);
            }}
            wrap={workspace.fileViewWrap}
            {...(file.linked
                ? { writeRefusal: HAPPY_AGENT_FILE_LINK_READ_ONLY_REFUSAL }
                : access.writeRefusal === undefined
                  ? {}
                  : { writeRefusal: access.writeRefusal })}
            {...(connectionRefusal === undefined ? {} : { saveRefusal: connectionRefusal })}
            workspace={props.workspace}
        />
    );
    /**
     * The checkout's whole change, in one scroll — or one file of it, when the
     * change is too large for that and is read a file at a time instead.
     *
     * Only files whose two sides have been read are handed over, and the change
     * is not drawn at all until every one of them has: what is on screen does
     * not grow under the reader. Notes are the same notes the single-file diff
     * leaves — they carry their path already, so nothing here re-addresses
     * them.
     */
    const mainReviewBody = (review: HappyAgentReview): ReactNode => {
        // A change too large for one scroll is read a file at a time, so only
        // that file is drawn. The ones read either side of it are read so that
        // stepping is a step rather than a round trip, not so they are shown.
        const drawn =
            review.presentation === "one-file"
                ? review.files.filter((file) => file.path === review.activePath)
                : review.files;
        const files = drawn.flatMap((file) =>
            file.document.type === "ready"
                ? [
                      {
                          path: file.path,
                          ...(file.oldPath === undefined ? {} : { oldPath: file.oldPath }),
                          oldContent: file.document.value.oldContent,
                          newContent: file.document.value.newContent,
                          // The same two identities one file's diff gives its
                          // sides. Without them the renderer has nothing to file
                          // a tokenized result under, so every file here would
                          // be highlighted from scratch each time the stream is
                          // opened or rebuilt — and a review is many files at
                          // once, which is exactly where that is felt.
                          ...(file.document.value.oldHash === undefined
                              ? {}
                              : {
                                    oldCacheKey: `d:old:${review.groupId}:${file.document.value.oldHash}:${fileHighlightLanguageKey(file.document.value.oldPath)}`,
                                }),
                          ...(file.document.value.hash === undefined
                              ? {}
                              : {
                                    newCacheKey: `d:new:${review.groupId}:${file.document.value.hash}:${fileHighlightLanguageKey(file.path)}`,
                                }),
                      },
                  ]
                : [],
        );
        // Nothing is drawn until the whole change has been read once. A stream
        // built up file by file as the reads land is a floor that moves while
        // the reader is standing on it: the scroll slides, and the steps travel
        // to addresses that were somewhere else a moment ago. One wait, then
        // the change. After that the stream stays on screen — a file the agent
        // has since written arrives in its own place when its read lands.
        if ((review.loading && !review.drawn) || files.length === 0)
            return (
                <EmptyState
                    animation={review.loading ? "snail" : undefined}
                    description={
                        review.loading
                            ? "Reading every changed file."
                            : "Nothing in this checkout has changed."
                    }
                    icon="file-diff"
                    size="panel"
                    title={review.loading ? "Opening the change…" : "No changes"}
                />
            );
        return (
            <ReviewStream
                appearance={appearance.appearance}
                {...(workspace.fileComments.draft === undefined
                    ? {}
                    : {
                          commentDraft: {
                              path: workspace.fileComments.draft.anchor.path,
                              lineNumber: workspace.fileComments.draft.anchor.lineNumber,
                              side: workspace.fileComments.draft.anchor.side,
                              text: workspace.fileComments.draft.text,
                          },
                      })}
                comments={workspace.fileComments.comments.map((comment) => ({
                    id: comment.id,
                    path: comment.anchor.path,
                    lineNumber: comment.anchor.lineNumber,
                    side: comment.anchor.side,
                    text: comment.text,
                    stale: comment.stale,
                }))}
                files={files}
                onCommentDraftCancel={() => props.workspace.commentDraftCancel()}
                {...(review.presentation === "one-file"
                    ? {
                          singleFile: {
                              index:
                                  review.files.findIndex(
                                      (file) => file.path === review.activePath,
                                  ) + 1,
                              onNext: () => props.workspace.reviewFileNext(review.groupId),
                              onPrevious: () => props.workspace.reviewFilePrevious(review.groupId),
                          },
                      }
                    : {})}
                // A file the checkout would not give up is named rather than
                // left out, or the review is quietly short of part of itself.
                failures={review.files
                    .filter((file) => file.document.type === "error")
                    .map((file) => file.path)}
                onFailuresRetry={() => props.workspace.reviewRetry(review.groupId)}
                total={review.files.length}
                collapsed={review.collapsed}
                viewed={review.viewed}
                onFileCollapsedToggle={(path) =>
                    props.workspace.reviewFileCollapsedToggle(review.groupId, path)
                }
                onFileViewedToggle={(path) =>
                    props.workspace.reviewFileViewedToggle(review.groupId, path)
                }
                onFilesCollapsedSet={(collapsed) =>
                    props.workspace.reviewFilesCollapsedSet(review.groupId, collapsed)
                }
                // One preference for how a diff is drawn, wherever it is drawn:
                // choosing Split here is choosing it for a single file's diff
                // too. The file face belongs to a file, not to a review, so a
                // review opened while it was chosen reads as Unified.
                view={workspace.fileViewMode === "split" ? "split" : "unified"}
                onViewChange={(view) => props.workspace.fileViewModeUpdate(view)}
                // Opening one file of a change gives it its own tab, the same
                // one the listing opens — a file is a file wherever it is
                // reached from.
                onFileOpen={(path) => {
                    if (!happyAgentOnline()) return;
                    const kind = fileTabKind(path);
                    props.workspace.fileOpen(review.groupId, path, kind);
                    props.onFileSelect(review.groupId, props.chatId, path, kind);
                }}
                {...(access.writeRefusal === undefined
                    ? {
                          onCommentDraftOpen: (path, lineNumber, side) => {
                              props.workspace.commentDraftOpen({ path, lineNumber, side });
                          },
                      }
                    : {})}
                onCommentDraftSubmit={() => props.workspace.commentDraftSubmit()}
                onCommentDraftUpdate={(text) => props.workspace.commentDraftUpdate(text)}
                onCommentRemove={(commentId) =>
                    props.workspace.commentRemove(commentId as HappyAgentCommentId)
                }
                onWrapChange={(wrap) => props.workspace.fileViewWrapUpdate(wrap)}
                wrap={workspace.fileViewWrap}
            />
        );
    };
    // A session the address names is drawn among the views kept for the ones
    // left before it; the group's own composer and the empty state are not.
    const openConversationView =
        openGroup !== undefined &&
        props.chatId !== undefined &&
        !(openGroup.conversations.length === 0 && workspace.groupComposer);
    const mainConversationBody =
        openGroup === undefined ? undefined : openGroup.conversations.length === 0 &&
          workspace.groupComposer ? (
            // Files or tools are open here, but no session exists yet. The body
            // under the strip is the same composer that starts the first one.
            <HappyAgentGroupComposer
                composer={workspace.groupComposer}
                composerNotice={workspaceComposerNotice}
                modelUsageWatch={modelUsageWatch}
                {...(workspace.groupSessionDraft
                    ? { draftMenus: workspace.groupSessionDraft.menus }
                    : {})}
                focusOnType
                groupId={openGroup.id}
                groupName={openGroup.name}
                happyAgentOnline={happyAgentOnline}
                {...(connectionRefusal === undefined ? {} : { unavailable: connectionRefusal })}
                {...(availability.admitting === false ? { restarting: true } : {})}
                workspace={props.workspace}
            />
        ) : (
            <HappyAgentConversationBody
                composerNotice={workspaceComposerNotice}
                modelUsageWatch={modelUsageWatch}
                {...(props.artifacts ? { artifacts: props.artifacts } : {})}
                inlineEngines={{
                    ...(props.artifactPage ? { artifactPage: props.artifactPage } : {}),
                    ...(props.browserContent ? { browserContent: props.browserContent } : {}),
                    ...(props.sidebarProposal ? { proposalRender: props.sidebarProposal } : {}),
                    ...(props.storyRender ? { storyRender: props.storyRender } : {}),
                    browserConnectionId: props.browserConnectionId,
                }}
                referenceEntities={messageReferenceEntities(workspace.list)}
                {...(props.referenceSurfaces ? { referenceSurfaces: props.referenceSurfaces } : {})}
                onReferenceGroupOpen={(groupId, agentId) => {
                    // A workspace or project a reference names opens where the
                    // reader left it, the way its sidebar row does; an agent
                    // opens on its own conversation.
                    props.onChatSelect(
                        groupId,
                        agentId ??
                            workspace.groupResume.get(groupId) ??
                            openGroupFind(rows, workspace.list.bots, workspace.list.tasks, groupId)
                                ?.conversations[0]?.id,
                    );
                }}
                activitySelected={panel.open && panel.activeViewId === "activity"}
                conversation={conversation}
                {...(workspace.fileOpenFailure === undefined
                    ? {}
                    : {
                          notice: (
                              <Banner
                                  data-testid="file-reference-failure"
                                  onDismiss={() => props.workspace.fileOpenFailureDismiss()}
                                  title={`Could not open ${workspace.fileOpenFailure.path}`}
                                  tone="warning"
                              >
                                  {workspace.fileOpenFailure.message}
                              </Banner>
                          ),
                      })}
                {...(props.spaces && props.chatId
                    ? { notes: props.spaces.chatNotes(props.chatId) }
                    : {})}
                {...((spaces, chatId) =>
                    spaces && chatId
                        ? {
                              leadingHeader: (settled: boolean) =>
                                  spaces.chatHeader(chatId, settled),
                          }
                        : {})(props.spaces, props.chatId)}
                emptyContent={
                    openBot?.systemKey === "chief_of_staff" &&
                    conversation.type === "ready" &&
                    openBot.conversation.id === conversation.value.conversationId ? (
                        <EmptyState
                            animation="chief-of-staff"
                            description="This bot has elevated permissions to configure Happy around your needs. Tell it how you want Happy to work for you."
                            emphasis="prominent"
                            icon="shield"
                            size="panel"
                            title="Your Chief of Staff"
                        />
                    ) : undefined
                }
                focusOnType
                groupId={openGroup.id}
                groupName={openGroup.name}
                now={now}
                {...(connectionRefusal === undefined &&
                openGroupChatRefusal === undefined &&
                openGroup.create !== undefined
                    ? { onCreate: () => groupConversationCreate(openGroup) }
                    : {})}
                onChatSelect={props.onChatSelect}
                onFileOpen={(path, selection) => {
                    if (!happyAgentOnline() || !openGroup.create) return;
                    const target = workspacePathRelative(path, openGroup.create.cwd);
                    // A reference is a claim about the checkout, and the
                    // checkout is asked before a tab is opened on the claim.
                    props.workspace.fileReferenceOpen(
                        openGroup.id,
                        target,
                        fileTabKind(target),
                        selection,
                    );
                }}
                // A link into another agent's or workspace's folder opens a
                // read-only preview beside this conversation. It is not gated
                // on the connection here: an unreachable Happy Agent is one of
                // the reasons the notice gives, rather than a silent no-op.
                onFileLinkOpen={(link) =>
                    props.workspace.fileLinkOpen(link, fileTabKind(link.path))
                }
                onLinkOpen={(url, placement) => {
                    // The side panel's browser tab is this workspace's own; the
                    // machine's browser is the host's door, and only the host
                    // knows whether it has one.
                    if (placement === "browser") props.onExternalLinkOpen(url);
                    else props.workspace.panel.browserAdd(url);
                }}
                linkOpenDefault={props.linkOpenDefault}
                canAbort={conversationCanAbort}
                readOnly={conversationReadOnly}
                happyAgentOnline={happyAgentOnline}
                {...(connectionRefusal === undefined ? {} : { unavailable: connectionRefusal })}
                {...(availability.admitting === false ? { restarting: true } : {})}
                {...(conversationReadOnlyReason === undefined
                    ? {}
                    : { readOnlyReason: conversationReadOnlyReason })}
                {...(connectionRefusal === undefined && openGroupChatRefusal === undefined
                    ? {}
                    : { writeRefusal: connectionRefusal ?? openGroupChatRefusal })}
                viewerId={props.viewerId}
                workspace={props.workspace}
            />
        );

    // Devices reach a workspace on another machine, so only a connection the
    // host can bridge offers them, and only for the workspace that is open.
    const deviceBridgeSupport = props.workspace.deviceBridgeSupport();
    const deviceBridges =
        deviceBridgeSupport && openGroup ? props.workspace.deviceBridges(openGroup.id) : undefined;

    return (
        <AppShell
            embedded
            panelResizable
            // A chat narrower than this yields to the pane. The activity card
            // overlays the chat and never changes the width it needs.
            workspaceReadableWidth={420}
            {...(checkoutClosed
                ? {}
                : {
                      panelToggleAction: {
                          open: panel.open,
                          onClick: () => props.workspace.panel.panelToggle(),
                      },
                  })}
            // The width this checkout was last left at, or the shell's own
            // default where nobody has sized it. Passed on every render rather
            // than seeded once, so moving to another project shows that
            // project's width instead of carrying this one's across.
            panelWidth={workspace.panelWidth ?? APP_SHELL_PANEL_DEFAULT_WIDTH}
            onFocusedPaneChange={workspaceFocusedPaneChange}
            onPanelWidthChange={(width) => {
                if (openGroup) props.workspace.panelWidthUpdate(openGroup.id, width);
            }}
            panel={
                // The panel reads and writes the checkout: a file tree, a diff,
                // a terminal. None of them has anything to open until the
                // checkout is there, so while it is being prepared the panel is
                // not drawn at all rather than drawn empty. It comes back on its
                // own — the reader's choice to have it open is untouched here.
                panel.open && !checkoutClosed ? (
                    <HappyAgentPanelBody
                        {...(panelCloseTarget ? { closeShortcut: APP_SHORTCUTS.tabClose } : {})}
                        {...(props.artifacts && props.onArtifactOpen
                            ? {
                                  artifacts: {
                                      artifacts: props.artifacts,
                                      context: happyAgentArtifactChatContext(
                                          artifactPlaces,
                                          props.groupId,
                                          props.chatId,
                                      ),
                                      onOpen: props.onArtifactOpen,
                                      places: artifactPlaces,
                                      ...(props.artifactPage ? { page: props.artifactPage } : {}),
                                  },
                              }
                            : {})}
                        {...(props.artifacts && props.chatId
                            ? {
                                  onArtifactNew: (replacing: HappyAgentPanelTabId) => {
                                      const panelStore = props.workspace.panel;
                                      void props
                                          .artifacts!.artifactCreate(
                                              props.chatId as HappyAgentSessionId,
                                          )
                                          .then(
                                              (artifactId) => {
                                                  panelStore.artifactViewOpen(artifactId);
                                                  panelStore.tabClose(replacing);
                                              },
                                              () => undefined,
                                          );
                                  },
                              }
                            : {})}
                        activity={conversation.type === "ready" ? conversation.value : undefined}
                        canStartBrowser={
                            availability.online &&
                            openGroup !== undefined &&
                            props.chatId !== undefined
                        }
                        {...(deviceBridgeSupport && deviceBridges && openGroup
                            ? {
                                  devices: {
                                      groupId: openGroup.id,
                                      support: deviceBridgeSupport,
                                      bridges: deviceBridges,
                                  },
                              }
                            : {})}
                        browserContent={props.browserContent}
                        browserConnectionId={props.browserConnectionId}
                        htmlPreview={props.htmlPreview}
                        mediaWindow={props.mediaWindow}
                        changes={panelChanges}
                        {...(openGroup?.changesStatus === undefined || !floatyFromGit
                            ? {}
                            : { changesStatus: openGroup.changesStatus })}
                        {...(props.changeTiers === undefined
                            ? {}
                            : { changeTiers: props.changeTiers })}
                        expanded={workspace.fileTreeExpanded}
                        collapsed={workspace.fileTreeCollapsed}
                        layout={workspace.fileLayout}
                        onFileSelect={(path) => {
                            // A file the conversation edited outside a checkout
                            // opens as everything those edits did to it.
                            if (!floatyFromGit && workspace.fileScope === "changed")
                                props.workspace.panel.changeViewOpen(path);
                            else if (openGroup && happyAgentOnline())
                                props.onFileSelect(
                                    openGroup.id,
                                    props.chatId,
                                    path,
                                    fileTabKind(path),
                                );
                        }}
                        onFileOpen={(path) => {
                            if (!floatyFromGit && workspace.fileScope === "changed")
                                props.workspace.panel.changeViewOpen(path);
                            else if (openGroup && happyAgentOnline()) {
                                const kind = fileTabKind(path);
                                // A double click pins the preview; the address
                                // is unchanged when the first click already
                                // selected this file.
                                props.workspace.fileOpen(openGroup.id, path, kind);
                                props.onFileSelect(openGroup.id, props.chatId, path, kind);
                            }
                        }}
                        onFilePreprocess={(path) => {
                            if (openGroup && happyAgentOnline())
                                props.workspace.filePreprocess(
                                    openGroup.id,
                                    path,
                                    fileTabKind(path),
                                );
                        }}
                        onLayoutChange={(layout) => {
                            if (openGroup) props.workspace.fileLayoutUpdate(openGroup.id, layout);
                        }}
                        now={now}
                        {...(availability.online
                            ? {
                                  onActivityProcessStop: (processId: number) => {
                                      void props.workspace
                                          .backgroundProcessStop(processId)
                                          .catch(() => undefined);
                                  },
                              }
                            : {})}
                        onActivityOpen={() => props.workspace.activityPanelOpen()}
                        onUsageOpen={() => props.workspace.usagePanelOpen()}
                        {...(openGroup
                            ? {
                                  onSubagentSelect: (sessionId: string) => {
                                      props.workspace.activityPanelClose();
                                      props.onChatSelect(
                                          openGroup.id,
                                          sessionId as HappyAgentSessionId,
                                      );
                                  },
                              }
                            : {})}
                        {...(workspace.panelFile ? { panelFile: workspace.panelFile } : {})}
                        fileBody={mainFileBody}
                        onPanelFileClose={() => props.workspace.filePanelClose()}
                        onViewClose={panelViewClose}
                        onScopeChange={(scope) => {
                            if (
                                openGroup &&
                                (scope === "changed" ||
                                    workspace.workspaceFiles !== undefined ||
                                    happyAgentOnline())
                            )
                                props.workspace.fileScopeUpdate(openGroup.id, scope);
                        }}
                        onToggle={(path, expanded) =>
                            props.workspace.fileTreeExpandedUpdate(path, expanded)
                        }
                        onDirectoryPrefetch={(path) =>
                            props.workspace.fileTreeDirectoryPrefetch(path)
                        }
                        onLoadMore={(path) => props.workspace.fileTreeLoadMore(path)}
                        onViewTransfer={(viewId) => {
                            if (viewId === "artifact") {
                                const view = panel.artifactView;
                                if (!view || !props.artifacts) return;
                                props.workspace.artifactPlacementUpdate(
                                    viewId,
                                    "main",
                                    artifactVersionOnScreen(
                                        props.artifacts.panelViewer(),
                                        view.artifactId,
                                        view.version,
                                    ),
                                );
                                return;
                            }
                            const file =
                                viewId === HAPPY_AGENT_PANEL_FILE_VIEW_ID
                                    ? workspace.panelFile
                                    : workspace.fileTabs.find((tab) => tab.id === viewId);
                            props.workspace.viewPlacementUpdate(viewId, "main");
                            if (file)
                                props.onFileSelect(
                                    file.groupId,
                                    props.chatId,
                                    file.path,
                                    file.kind,
                                );
                        }}
                        panel={panel}
                        {...(changeDiff === undefined ? {} : { changeDiff })}
                        previewTool={previewTool}
                        {...(previewMedia
                            ? {
                                  previewMedia,
                                  toolMediaDocument: props.workspace.toolMediaDocument(),
                              }
                            : {})}
                        {...(terminalHappyAgentAvailability === undefined
                            ? {}
                            : {
                                  happyAgentAvailability: terminalHappyAgentAvailability,
                                  happyAgentAvailabilityReason: availability.message,
                              })}
                        onReviewOpen={() => {
                            if (openGroup) props.workspace.reviewOpen(openGroup.id);
                        }}
                        scope={workspace.fileScope}
                        search={workspace.fileSearch}
                        onSearchQueryChange={(query) => props.workspace.fileSearchUpdate(query)}
                        selectedPath={activeFile?.path}
                        store={props.workspace.panel}
                        workspaceFiles={workspace.workspaceFiles}
                        workspaceFilesLoading={workspace.workspaceFilesLoading}
                    />
                ) : undefined
            }
        >
            {openGroup ? (
                <>
                    {/* No banner for an unreachable Happy Agent. The sidebar footer says
                        that once, and repeating it here
                        pushed the transcript down for something the reader was
                        already told — in the one surface where the shift is
                        most expensive. What this conversation still owes is the
                        local part: its composer and actions go read-only, which
                        they do on `availability` without any chrome of their
                        own. */}
                    <WindowShortcuts
                        actions={[
                            // Cmd-W is consistently the workspace's close
                            // command. The live handler simply has nothing to
                            // do when Files or an offline session is the only
                            // current target.
                            { run: activeTabClose, shortcut: APP_SHORTCUTS.tabClose },
                            ...(checkoutClosed
                                ? []
                                : [
                                      {
                                          run: () => props.workspace.panel.panelToggle(),
                                          shortcut: APP_SHORTCUTS.panelToggle,
                                      },
                                      {
                                          run: () => props.workspace.panel.panelToggle(),
                                          shortcut: APP_SHORTCUTS.panelToggleAlternate,
                                      },
                                  ]),
                            // The spaces sidebar gives Command-T to Make Stuff.
                            ...(sessionCreateAvailable && !props.spaces
                                ? [
                                      {
                                          run: () => groupConversationCreate(openGroup, "shortcut"),
                                          shortcut: APP_SHORTCUTS.sessionCreate,
                                      },
                                  ]
                                : []),
                        ]}
                    />
                    {/* Chats say workspace errors above their input. Keep the
                        lane mounted but empty there, preserving the tab strip
                        and transcript identities. Views without a composer use
                        it as their fallback. Preparation stays in the sidebar
                        while the chat is on screen. */}
                    <WorkspaceLifecycleLane
                        {...(openGroup.lifecycle?.phase === "failed" &&
                        openGroup.lifecycle.reason !== undefined
                            ? { detail: openGroup.lifecycle.reason }
                            : {})}
                        name={openGroup.name}
                        {...(openGroup.path ? { path: openGroup.path } : {})}
                        {...(openGroupPhase !== undefined &&
                        !openGroupNotice &&
                        !preparingChatOnScreen &&
                        !workspaceNoticeInComposer
                            ? { phase: openGroupPhase }
                            : {})}
                    />
                    {openGroupNotice ? (
                        // Nothing has run here and the place itself will never
                        // take one: a composer would collect a message for a
                        // checkout that is not coming. What happened to the
                        // workspace is the whole screen instead.
                        //
                        // A checkout Happy Agent is still preparing is deliberately not
                        // this case. Happy Agent has already said where it will be and
                        // holds a session's work until it is there, so an empty
                        // new workspace shows its composer immediately with the
                        // lane above saying what is happening to it.
                        <WorkspaceLifecycleNotice
                            {...(openGroup.lifecycle?.phase === "failed" &&
                            openGroup.lifecycle.reason !== undefined
                                ? { detail: openGroup.lifecycle.reason }
                                : {})}
                            name={openGroup.name}
                            {...(openGroup.path ? { path: openGroup.path } : {})}
                            phase={openGroupPhase}
                        />
                    ) : (
                        <TabbedPane
                            actions={
                                /* A tab is a session, so adding one starts it
                                   directly in the addressed project or worktree.
                                   A checkout that cannot take one yet keeps the
                                   control disabled rather than dropping it; a
                                   bot or task can never take a second chat, so
                                   it offers none. */
                                openGroup.singleConversationId === undefined ? (
                                    <Button
                                        aria-label="Create a session in this project"
                                        disabled={!sessionCreateAvailable}
                                        icon="plus"
                                        iconOnly
                                        onClick={() => groupConversationCreate(openGroup)}
                                        {...(props.spaces
                                            ? {}
                                            : { shortcut: APP_SHORTCUTS.sessionCreate })}
                                        size="small"
                                        variant="ghost"
                                    />
                                ) : null
                            }
                            trailing={
                                /* The strip's own controls hold the bar's far
                                   edge instead of sliding along with the tabs. */
                                <WorkTabControls
                                    floatyOpen={floatyShown}
                                    onFloatyOpenChange={(open) => {
                                        if (floatyKey !== undefined)
                                            props.workspace.panel.floatyOpenedUpdate(
                                                floatyKey,
                                                open,
                                            );
                                    }}
                                />
                            }
                            activeId={workspace.activeMainViewId ?? props.chatId ?? ""}
                            tabSizing="content"
                            closePresentation="overlay"
                            overflowFade
                            size="medium"
                            closeLabel="Close tab"
                            closeShortcut={APP_SHORTCUTS.tabClose}
                            onClose={groupTabClose}
                            onDoubleClick={(tabId) => {
                                const file = groupFileTabs.find((tab) => tab.id === tabId);
                                if (file)
                                    props.workspace.fileOpen(file.groupId, file.path, file.kind);
                            }}
                            onReorder={(tabIds: readonly string[]) => {
                                // A detached subagent has no place in the
                                // order, so it is taken out of both sides of
                                // the comparison rather than dragged into one.
                                const orderable = (ids: readonly string[]) =>
                                    ids.filter((id) => id !== detachedConversationId);
                                const move = sidebarReorderMove(
                                    orderable(groupTabs.map((tab) => tab.id)),
                                    orderable(tabIds),
                                );
                                if (!move) return;
                                props.workspace.tabReorder(move.id, move.afterId);
                            }}
                            onSelect={(tabId) => {
                                if (openReview?.id === tabId) {
                                    props.workspace.reviewOpen(openGroup.id);
                                    return;
                                }
                                const file = groupFileTabs.find((tab) => tab.id === tabId);
                                if (file) {
                                    props.onFileSelect(
                                        file.groupId,
                                        props.chatId,
                                        file.path,
                                        file.kind,
                                    );
                                    return;
                                }
                                if (mainTools.some((tab) => tab.id === tabId)) {
                                    props.workspace.mainViewSelect(tabId);
                                    return;
                                }
                                props.onChatSelect(openGroup.id, tabId);
                            }}
                            // Pointing at a session tab loads its conversation, so that
                            // selecting it shows the conversation at once.
                            onIntent={(tabId) => {
                                if (openReview?.id === tabId) return;
                                if (groupFileTabs.some((tab) => tab.id === tabId)) return;
                                if (mainTools.some((tab) => tab.id === tabId)) return;
                                props.workspace.conversationPrefetch(tabId as HappyAgentSessionId);
                            }}
                            onTransfer={(tabId) => {
                                const artifact = mainTools.find(
                                    (tab) => tab.id === tabId && tab.kind === "artifact",
                                );
                                if (artifact?.kind === "artifact") {
                                    props.workspace.artifactPlacementUpdate(
                                        tabId,
                                        "panel",
                                        props.artifacts
                                            ? artifactVersionOnScreen(
                                                  props.artifacts.tabViewer(),
                                                  artifact.artifactId,
                                                  artifact.version,
                                              )
                                            : artifact.version,
                                    );
                                    return;
                                }
                                const file = groupFileTabs.find((tab) => tab.id === tabId);
                                const selected = workspace.activeMainViewId === tabId;
                                props.workspace.viewPlacementUpdate(tabId, "panel");
                                // Moving the addressed file beside the session
                                // uncovers that session in the main region, so
                                // its address must stop claiming the file is
                                // still selected there.
                                if (file && selected)
                                    props.onChatSelect(openGroup.id, props.chatId, true);
                            }}
                            // A session is what the address names, so it stays
                            // where the address points; a diff is two revisions
                            // read together and the panel's viewer reads one
                            // file, so it has nowhere over there to land; and a
                            // file with text that has not been written back
                            // keeps its edit rather than its place.
                            transferable={(tab) =>
                                mainTools.some((entry) => entry.id === tab.id) ||
                                groupFileTabs.some(
                                    (entry) =>
                                        entry.id === tab.id &&
                                        entry.kind !== "diff" &&
                                        entry.draft === undefined &&
                                        !entry.saving,
                                )
                            }
                            transferTargets={MAIN_TRANSFER_TARGETS}
                            tabMenuItems={(tab) => {
                                const index = sweepableTabs.findIndex(
                                    (entry) => entry.id === tab.id,
                                );
                                // The detached subagent's tab is not in the sweepable
                                // order, so it offers no menu — its runner owns it.
                                if (index < 0) return [];
                                // A session is archived; a file, a terminal, a
                                // page is closed. The verb has to be the true
                                // one for the tab it is offered on.
                                const verb =
                                    groupFileTabs.some((entry) => entry.id === tab.id) ||
                                    mainTools.some((entry) => entry.id === tab.id)
                                        ? "Close"
                                        : "Archive";
                                return tabStripMenu(verb, index, sweepableTabs.length - index - 1);
                            }}
                            onTabMenuSelect={(tab, actionId) => {
                                const ids = sweepableTabs.map((entry) => entry.id);
                                const index = ids.indexOf(tab.id);
                                if (index < 0) return;
                                if (actionId === TAB_MENU_CLOSE) {
                                    groupTabsClose([tab.id]);
                                } else if (actionId === TAB_MENU_CLOSE_OTHERS) {
                                    groupTabsClose(
                                        ids.filter((id) => id !== tab.id),
                                        tab.id,
                                    );
                                } else if (actionId === TAB_MENU_CLOSE_LEFT) {
                                    groupTabsClose(ids.slice(0, index), tab.id);
                                } else if (actionId === TAB_MENU_CLOSE_RIGHT) {
                                    groupTabsClose(ids.slice(index + 1), tab.id);
                                } else if (actionId === TAB_MENU_CLOSE_ALL) {
                                    groupTabsClose(ids);
                                }
                            }}
                            tabs={groupTabs}
                        >
                            <WorkFloaty
                                agents={floatyAgents.current}
                                artifacts={floatyOutputs.slice(0, FLOATY_ARTIFACTS)}
                                changes={floatyPlaces.map((place) => place.row)}
                                history={[
                                    ...floatyAgents.history,
                                    ...floatyOutputs.slice(FLOATY_ARTIFACTS),
                                ]}
                                historyExpanded={panel.floatyHistoryExpanded}
                                onHistoryExpandedChange={
                                    props.workspace.panel.floatyHistoryExpandedUpdate
                                }
                                // Every row opens beside the chat, which stays
                                // where it was: a place as its changes, an
                                // artifact as itself, an agent as its chat. A
                                // tab already showing it is selected again.
                                onRowOpen={(id) => {
                                    const place = floatyPlaces.find(
                                        (candidate) => candidate.row.id === id,
                                    );
                                    if (place?.workspaceId !== undefined)
                                        workspaceOpen(place.workspaceId);
                                    else if (place) {
                                        if (openGroup)
                                            props.workspace.fileScopeUpdate(
                                                openGroup.id,
                                                "changed",
                                            );
                                        props.workspace.panel.filesSelect();
                                    } else if (id.startsWith(FLOATY_ARTIFACT_PREFIX))
                                        props.workspace.panel.artifactViewOpen(
                                            id.slice(
                                                FLOATY_ARTIFACT_PREFIX.length,
                                            ) as HappyAgentArtifactId,
                                        );
                                    else {
                                        const agent = [
                                            ...floatyAgents.current,
                                            ...floatyAgents.history,
                                        ].find((candidate) => candidate.id === id);
                                        if (agent)
                                            props.workspace.panel.chatTabOpen(
                                                id as HappyAgentSessionId,
                                                agent.label,
                                            );
                                    }
                                }}
                                open={floatyShown}
                                placement="overlay"
                                {...(floatySelectedId === undefined
                                    ? {}
                                    : { selectedId: floatySelectedId })}
                            />
                            {/* The whole content area accepts a tab dragged out
                                of the panel, so the reader aims at where the
                                thing will be rather than at a stripe. */}
                            <TransferZone
                                icon="panel-collapse"
                                id={TRANSFER_ZONE_MAIN}
                                label="Open in the main content"
                            >
                                <DeferredPane
                                    current={
                                        displayedMainTool
                                            ? undefined
                                            : activeReview
                                              ? {
                                                    id: activeReview.id,
                                                    content: mainReviewBody(activeReview),
                                                }
                                              : displayedFile
                                                ? {
                                                      id:
                                                          displayedFile.displayedPresentationId ??
                                                          displayedFile.presentationId,
                                                      content: mainFileBody(displayedFile),
                                                  }
                                                : openConversationView
                                                  ? // Drawn among the kept views below.
                                                    undefined
                                                  : {
                                                        id: `conversation:${openGroup.id}:empty`,
                                                        content: mainConversationBody,
                                                    }
                                    }
                                    fallback={
                                        <EmptyState
                                            animation="snail"
                                            description="The selected file is taking a moment."
                                            icon="doc"
                                            size="panel"
                                            title="Opening file…"
                                        />
                                    }
                                    onReveal={props.workspace.mainViewDisplay}
                                    pending={
                                        pendingFile
                                            ? (() => {
                                                  const readyOnCommit =
                                                      connectionRefusal !== undefined ||
                                                      pendingFile.document.type !== "loading";
                                                  return {
                                                      id: pendingFile.presentationId,
                                                      ready: readyOnCommit,
                                                      render: () => mainFileBody(pendingFile),
                                                  };
                                              })()
                                            : undefined
                                    }
                                    // Every page moved to this side stays
                                    // mounted whichever tab is on screen, and so
                                    // do the conversations left most recently.
                                    persistent={
                                        <>
                                            <HappyAgentConversationViews
                                                open={
                                                    openConversationView &&
                                                    props.chatId !== undefined
                                                        ? {
                                                              // Named by what the body draws,
                                                              // so a view and its content agree
                                                              // while the address catches up.
                                                              id:
                                                                  conversation.type === "ready"
                                                                      ? conversation.value
                                                                            .conversationId
                                                                      : props.chatId,
                                                              content: mainConversationBody,
                                                              ready:
                                                                  conversation.type !== "ready" ||
                                                                  conversation.value.standIn !==
                                                                      true,
                                                          }
                                                        : undefined
                                                }
                                                shown={
                                                    !displayedMainTool &&
                                                    activeReview === undefined &&
                                                    displayedFile === undefined
                                                }
                                                workspace={props.workspace}
                                            />
                                            <HappyAgentToolBodies
                                                activeId={workspace.displayedMainViewId}
                                                {...(props.artifacts
                                                    ? {
                                                          artifacts: {
                                                              artifacts: props.artifacts,
                                                              places: artifactPlaces,
                                                              ...(props.artifactPage
                                                                  ? { page: props.artifactPage }
                                                                  : {}),
                                                          },
                                                      }
                                                    : {})}
                                                browserConnectionId={props.browserConnectionId}
                                                {...(props.browserContent
                                                    ? { browserContent: props.browserContent }
                                                    : {})}
                                                store={props.workspace.panel}
                                                tabs={mainTools}
                                                {...(terminalHappyAgentAvailability === undefined
                                                    ? {}
                                                    : {
                                                          happyAgentAvailability:
                                                              terminalHappyAgentAvailability,
                                                          happyAgentAvailabilityReason:
                                                              availability.message,
                                                      })}
                                            />
                                        </>
                                    }
                                />
                            </TransferZone>
                        </TabbedPane>
                    )}
                </>
            ) : (
                <>
                    {/* With no project open there is no tab strip, so this side of
                        the window would have no lane to drag it by. */}
                    {desktop ? <WindowDragRegion /> : null}
                    {/* No banner for an unreachable Happy Agent here either. The sidebar
                        footer is the window's one account
                        of the machine being out of touch, and this screen has
                        nothing to add to it: what it offers already goes quiet
                        on `availability`, below. */}
                    {refusedCreate ? (
                        // This address was a workspace being made until Happy Agent
                        // refused it. Saying "no project open" here would leave
                        // the reader to work out for themselves that the row they
                        // just watched appear and vanish was never created.
                        <WorkspaceLifecycleNotice
                            detail={refusedCreate.message}
                            // The name every worktree Happy asks for is created
                            // under. Happy Agent never gave this one a record, so the
                            // name the request carried is the only one there is.
                            name="Workspace"
                            phase="refused"
                        />
                    ) : (
                        /* Keep project setup in the main empty pane: the sidebar
                           explains why it is empty without repeating this action. */
                        <EmptyState
                            {...(availability.online
                                ? {
                                      action: {
                                          label: "Add project",
                                          icon: "plus" as const,
                                          onClick: () => props.workspace.projectAdd(),
                                      },
                                  }
                                : {})}
                            description="Pick one in the sidebar, or add a project."
                            icon="files"
                            size="panel"
                            title="No project open"
                        />
                    )}
                </>
            )}
        </AppShell>
    );
}

function happyAgentFileRevalidationBanner(
    error: { readonly message: string } | undefined,
): ReactNode {
    return error ? (
        <Banner tone="warning" title="File may be out of date">
            Showing the last loaded content. {error.message}
        </Banner>
    ) : null;
}

/**
 * What a file tab has to say about itself before its content: that the bytes
 * on screen may be stale, and that the last save did not happen. A refused
 * write is the louder of the two — the edit is still only in this window — so
 * it is stated first.
 */
function happyAgentFileNotices(file: HappyAgentFileTabSnapshot): ReactNode {
    if (file.saveError === undefined)
        return happyAgentFileRevalidationBanner(file.revalidationError);
    return (
        <>
            <Banner tone="danger" title="Could not save this file">
                {file.saveError.message} Your edit is still here and has not been written to the
                workspace.
            </Banner>
            {happyAgentFileRevalidationBanner(file.revalidationError)}
        </>
    );
}

function HappyAgentFileBody(props: {
    appearance: "dark" | "light";
    file: HappyAgentFileTabSnapshot;
    /** The file's tab names it, so its content does not name it again. */
    tabNamed?: boolean;
    htmlPreview?: HtmlPreviewRenderer;
    mediaWindow?: MediaWindowOpener;
    mode: HappyAgentFileViewMode;
    /** Whether long diff lines wrap to the pane or scroll out of it. */
    wrap: boolean;
    /** Re-reads Happy Agent availability when a retained file handler fires. */
    happyAgentOnline: () => boolean;
    /** Addresses a linked file opened from a main-content file tab. */
    onMainFileOpen(
        path: string,
        kind: HappyAgentFileTabKind,
        selection?: HappyAgentFileLineRange,
    ): void;
    /** Why this file cannot be edited or saved, or absent when it can. */
    writeRefusal?: string;
    /** Why the current local draft cannot be persisted to the Happy Agent. */
    saveRefusal?: string;
    /** Review notes on this file, and the one being written if it is on this file. */
    comments: readonly HappyAgentFileComment[];
    commentDraft?: HappyAgentCommentDraft;
    workspace: HappyAgentWorkspaceStore;
}) {
    const { file, workspace } = props;
    /**
     * Opens a file a document links to, on the side the document is being read
     * on. A file followed in the main content lands beside it in the tab strip;
     * one followed in the panel stays in the panel, because the reader is
     * reading the conversation and the panel is where they are reading.
     */
    const linkedFileOpen: FileOpenHandler = (target, selection): void => {
        if (!props.happyAgentOnline()) return;
        const kind = fileTabKind(target);
        // A file read through a link into another workspace names its
        // neighbours in that workspace, so they are followed there too.
        if (file.linked)
            workspace.fileLinkOpen(
                {
                    target: { type: "workspace", workspaceId: file.groupId },
                    path: target,
                    ...(selection === undefined ? {} : { selection }),
                },
                kind,
            );
        else if (file.placement === "panel")
            workspace.fileReferenceOpen(file.groupId, target, kind, selection);
        else props.onMainFileOpen(target, kind, selection);
    };
    /** Follows a `happy-file:` link the document carries, into the panel. */
    const fileLinkOpen: FileLinkOpenHandler = (link): void =>
        workspace.fileLinkOpen(link, fileTabKind(link.path));
    // Typing into a document that could never be written back is worse than not
    // offering the editor at all: the reader loses what they typed and learns
    // why only when they try to save it.
    const writable = props.writeRefusal === undefined;
    const saveDisabled = !writable || props.saveRefusal !== undefined;
    if (file.kind === "media")
        return (
            <>
                {happyAgentFileRevalidationBanner(file.revalidationError)}
                <HappyAgentFilePreview
                    document={file.document}
                    {...(props.mediaWindow ? { mediaWindow: props.mediaWindow } : {})}
                    key={file.id}
                    path={file.path}
                    revalidating={file.revalidating}
                />
            </>
        );
    if (
        (file.kind === "file" || file.kind === "document") &&
        file.document.type === "ready" &&
        "content" in file.document.value
    ) {
        const content = file.document.value.content;
        const dirty = file.draft !== undefined && file.draft !== content;
        const text = file.draft ?? content;
        const status =
            props.writeRefusal ?? props.saveRefusal ?? (file.saving ? "Saving…" : undefined);
        const markdownCacheKey =
            file.draft === undefined
                ? markdownHighlightCacheKey(file.path, file.document.value.hash)
                : undefined;
        return (
            <FileEditor
                banner={happyAgentFileNotices(file)}
                documentKey={fileDocumentKey(file.id, file.document.value)}
                dirty={dirty}
                {...(file.kind === "document" && props.htmlPreview
                    ? {
                          rendered: (
                              // The page is served from the file on disk, so the
                              // rendered face shows what was saved; the source
                              // face is where an unsaved edit lives until it is.
                              <HtmlPreviewFrame
                                  {...(file.previewError
                                      ? {
                                            failure: {
                                                kind: "address-unavailable" as const,
                                                path: file.path,
                                                detail: file.previewError,
                                            },
                                        }
                                      : {})}
                                  renderContent={props.htmlPreview}
                                  revision={file.revision}
                                  source={file.previewUrl}
                              />
                          ),
                      }
                    : {})}
                {...(filePreviewKind(file.path) === "markdown"
                    ? {
                          rendered: (
                              <MarkdownDocument
                                  /* Whatever the link names — another document,
                                     a picture — follows the same file-open path
                                     as the sidebar. */
                                  onFileOpen={(href, selection) =>
                                      linkedFileOpen(
                                          documentLinkResolve(file.path, href),
                                          selection,
                                      )
                                  }
                                  onFileLinkOpen={fileLinkOpen}
                                  {...(markdownCacheKey === undefined
                                      ? {}
                                      : { cacheKey: markdownCacheKey })}
                                  text={text}
                              />
                          ),
                      }
                    : {})}
                // The file as saved, not an unsaved edit: downloading names a
                // file, and the file is what is on disk.
                onDownload={() =>
                    void fileDownload(file.path, { type: "text", text: content }).catch(
                        () => undefined,
                    )
                }
                onRevert={() => workspace.fileDraftRevert(file.id)}
                onSave={() => {
                    if (!saveDisabled && props.happyAgentOnline())
                        void workspace.fileDraftSave(file.id).catch(() => undefined);
                }}
                onValueChange={(value) => workspace.fileDraftUpdate(file.id, value)}
                onWrapChange={(wrap) => workspace.fileViewWrapUpdate(wrap)}
                path={file.path}
                pathShown={props.tabNamed !== true}
                readOnly={file.saving || !writable}
                {...(file.reveal === undefined ? {} : { reveal: file.reveal })}
                saveDisabled={saveDisabled}
                saving={file.saving}
                {...(status === undefined ? {} : { status })}
                value={text}
                wrap={props.wrap}
            />
        );
    }
    if (
        file.kind === "diff" &&
        file.document.type === "ready" &&
        "oldContent" in file.document.value
    ) {
        const change = file.document.value;
        // An untouched tab shows what was read; once edited it shows what was
        // typed, which is the only copy of it there is.
        const current = file.draft ?? change.newContent;
        const oldCacheKey =
            file.draft !== undefined || change.oldHash === undefined
                ? undefined
                : `d:old:${file.groupId}:${change.oldHash}:${fileHighlightLanguageKey(change.oldPath)}`;
        const newCacheKey =
            file.draft === undefined && change.hash !== undefined
                ? `d:new:${file.groupId}:${change.hash}:${fileHighlightLanguageKey(file.path)}`
                : undefined;
        return (
            <>
                {happyAgentFileNotices(file)}
                <ChangedFileDiff
                    appearance={props.appearance}
                    documentKey={fileDocumentKey(file.id, file.document.value)}
                    key={`${file.id}:${file.kind}`}
                    loading={file.revalidating}
                    mode={props.mode}
                    {...(newCacheKey === undefined ? {} : { newCacheKey })}
                    newContent={current}
                    {...(oldCacheKey === undefined ? {} : { oldCacheKey })}
                    oldContent={change.oldContent}
                    oldPath={change.oldPath}
                    {...(writable
                        ? {
                              onContentChange: (content: string) =>
                                  workspace.fileDraftUpdate(file.id, content),
                              onSave: () => {
                                  if (!saveDisabled && props.happyAgentOnline())
                                      void workspace.fileDraftSave(file.id).catch(() => undefined);
                              },
                          }
                        : {})}
                    saveDisabled={saveDisabled}
                    {...(writable
                        ? {
                              // Notes are about this file, so only this file's
                              // ones are drawn; the rest belong to their own
                              // tabs and travel together only when sent.
                              comments: props.comments.map((comment) => ({
                                  id: comment.id,
                                  lineNumber: comment.anchor.lineNumber,
                                  side: comment.anchor.side,
                                  text: comment.text,
                                  stale: comment.stale,
                              })),
                              ...(props.commentDraft === undefined
                                  ? {}
                                  : {
                                        commentDraft: {
                                            lineNumber: props.commentDraft.anchor.lineNumber,
                                            side: props.commentDraft.anchor.side,
                                            text: props.commentDraft.text,
                                        },
                                    }),
                              onCommentDraftOpen: (
                                  lineNumber: number,
                                  side: "deletions" | "additions",
                              ) =>
                                  workspace.commentDraftOpen({
                                      path: file.path,
                                      lineNumber,
                                      side,
                                      ...(change.hash === undefined ? {} : { hash: change.hash }),
                                  }),
                              onCommentDraftUpdate: (text: string) =>
                                  workspace.commentDraftUpdate(text),
                              onCommentDraftCancel: () => workspace.commentDraftCancel(),
                              onCommentDraftSubmit: () => workspace.commentDraftSubmit(),
                              onCommentRemove: (commentId: string) =>
                                  workspace.commentRemove(commentId as HappyAgentCommentId),
                          }
                        : {})}
                    onModeChange={(mode) => workspace.fileViewModeUpdate(mode)}
                    onWrapChange={(wrap) => workspace.fileViewWrapUpdate(wrap)}
                    wrap={props.wrap}
                    // A change that deleted the file left no copy to look at, which
                    // the read reports by having no working-tree identity for it.
                    // Preview is then not offered rather than offered over nothing.
                    {...(change.hash === undefined
                        ? {}
                        : {
                              preview: (
                                  <HappyAgentChangedFilePreview
                                      file={file}
                                      onFileOpen={linkedFileOpen}
                                      onFileLinkOpen={fileLinkOpen}
                                      openDisabled={props.saveRefusal !== undefined}
                                      text={current}
                                      // The file's characters, where they can be
                                      // written: the same editor the file's own
                                      // tab uses, so reading a change and fixing
                                      // what it says are one place.
                                      {...(writable
                                          ? {
                                                editor: (
                                                    <CodeEditor
                                                        className="happy-changed-file-editor"
                                                        documentKey={fileDocumentKey(
                                                            file.id,
                                                            file.document.value,
                                                        )}
                                                        name={file.path}
                                                        onSave={() => {
                                                            if (
                                                                !saveDisabled &&
                                                                props.happyAgentOnline()
                                                            )
                                                                void workspace
                                                                    .fileDraftSave(file.id)
                                                                    .catch(() => undefined);
                                                        }}
                                                        onValueChange={(content) =>
                                                            workspace.fileDraftUpdate(
                                                                file.id,
                                                                content,
                                                            )
                                                        }
                                                        readOnly={file.saving}
                                                        value={current}
                                                        wrap={props.wrap}
                                                    />
                                                ),
                                            }
                                          : {})}
                                  />
                              ),
                          })}
                    path={file.path}
                    pathShown={props.tabNamed !== true}
                    saving={file.saving}
                />
            </>
        );
    }
    if (file.document.type === "error")
        return (
            <EmptyState
                {...(props.saveRefusal === undefined
                    ? {
                          action: {
                              label: "Retry",
                              icon: "arrow-right" as const,
                              onClick: () => {
                                  if (props.happyAgentOnline()) workspace.fileRetry(file.id);
                              },
                          },
                      }
                    : {})}
                description={file.document.error.message}
                icon="doc"
                size="panel"
                title="File unavailable"
            />
        );
    if (props.saveRefusal)
        return (
            <EmptyState
                description={props.saveRefusal}
                icon="link"
                size="panel"
                title="File unavailable while Happy Agent is offline"
            />
        );
    return (
        <EmptyState
            animation="snail"
            description={
                file.kind === "file"
                    ? "Reading the file from its workspace."
                    : "Reading the changed file from its workspace."
            }
            icon="doc"
            size="panel"
            title="Loading file…"
        />
    );
}

/**
 * A changed file as it now stands, in the same preview the product opens any
 * file into.
 *
 * The text is the copy already in hand: the changed-file read takes its
 * working-tree side from the same file read that opening an ordinary file uses,
 * so Preview and Edit are looking at one file rather than at two reads of it —
 * including an edit that has been typed and not yet saved. Nothing is fetched
 * here, so switching to Preview cannot land another file's bytes.
 */
function HappyAgentChangedFilePreview(props: {
    file: HappyAgentFileTabSnapshot;
    openDisabled: boolean;
    /** Opens a linked file on the side this one is being read on. */
    onFileOpen: FileOpenHandler;
    /** Opens a `happy-file:` link the document carries, into the panel. */
    onFileLinkOpen: FileLinkOpenHandler;
    text: string;
    /** The file's characters, editable, where this checkout can be written. */
    editor?: ReactNode;
}) {
    const { file } = props;
    // A picture, a recording, or an archive opens as itself rather than as a
    // diff, so a tab of one is not a diff tab and this is reached only by a tab
    // restored from a session that sorted the file differently. Saying the file
    // has no preview beats rendering its bytes as characters.
    const kind = filePreviewKind(file.path);
    const readable = kind === "markdown" || kind === "text";
    const saved =
        file.document.type === "ready" && "newContent" in file.document.value
            ? file.document.value.newContent
            : undefined;
    const cacheKey =
        file.draft === undefined &&
        file.document.type === "ready" &&
        "hash" in file.document.value &&
        file.document.value.hash !== undefined
            ? fileHighlightCacheKey(file.path, file.document.value.hash)
            : undefined;
    return (
        <FilePreview
            content={readable ? { type: "text", text: props.text } : { type: "unavailable" }}
            {...(cacheKey === undefined ? {} : { cacheKey })}
            {...(props.editor === undefined || !readable ? {} : { editor: props.editor })}
            {...(saved === undefined
                ? {}
                : {
                      onDownload: () =>
                          void fileDownload(file.path, { type: "text", text: saved }).catch(
                              () => undefined,
                          ),
                  })}
            // A document followed out of the changed list lands beside it as the
            // file itself, the same way one followed out of a file tab does.
            onFileOpen={(href, selection) => {
                if (props.openDisabled) return;
                props.onFileOpen(documentLinkResolve(file.path, href), selection);
            }}
            onFileLinkOpen={props.onFileLinkOpen}
            path={file.path}
        />
    );
}

/**
 * One workspace file shown rather than edited.
 *
 * The document says where the bytes are rather than carrying them, so the
 * picture element fetches its own source over an ordinary URL. Nothing here
 * holds a browser resource with a lifetime to revoke, and a video's seeks become
 * range requests against the proxy instead of a whole file already in the DOM.
 */
function HappyAgentFilePreview(props: {
    document: HappyAgentFileTabSnapshot["document"];
    mediaWindow?: MediaWindowOpener;
    path: string;
    revalidating: boolean;
}) {
    const document = props.document;
    if (document.type === "error")
        return (
            <FilePreview
                content={{ type: "error", message: document.error.message }}
                path={props.path}
            />
        );
    // A background revalidation must not replace usable media with a loading
    // face. The request may still fail into the warning banner owned by the
    // surrounding file surface; only a true first load has no content to show.
    if (document.type !== "ready")
        return <FilePreview content={{ type: "loading" }} path={props.path} />;
    const value = document.value;
    if (!("contentType" in value))
        return <FilePreview content={{ type: "unavailable" }} path={props.path} />;
    // A format with no viewer is stated as such rather than rendered as an
    // <img> that will only ever show a broken-image glyph.
    const kind = filePreviewKind(props.path);
    const showable = value.contentType !== "application/octet-stream" && kind !== "binary";
    const mediaWindow = props.mediaWindow;
    return (
        <FilePreview
            content={showable ? { type: "url", url: value.url } : { type: "unavailable" }}
            {...(mediaWindow && showable && mediaWindowShowable(kind)
                ? {
                      onMediaWindowOpen: () => mediaWindow({ path: props.path, url: value.url }),
                  }
                : {})}
            // A file with no viewer is still a file, and saving it is often the
            // only thing left to do with it.
            onDownload={() =>
                void fileDownload(props.path, { type: "url", url: value.url }).catch(
                    () => undefined,
                )
            }
            path={props.path}
            size={fileSizeFormat(value.size)}
            updating={props.revalidating}
        />
    );
}

/**
 * A conversation's dock, reading its composer's draft itself.
 *
 * This is the one subscription a keystroke reaches. The surface around it reads
 * the workspace, whose snapshot holds the composer as a source rather than its
 * draft, so typing re-renders this dock and nothing above it. The subscription
 * is synchronous, not frame-coalesced: a controlled textarea must be given its
 * new value inside the input event that produced it, or React puts the old one
 * back and the caret jumps to the end.
 */
function HappyAgentComposerDock(
    props: Omit<ConversationDockProps, "composer"> & { composer: ComposerSource },
) {
    const composer = useSyncExternalStore(
        props.composer.subscribe,
        props.composer.get,
        props.composer.get,
    );
    return <ConversationDock {...props} composer={composer} />;
}

/**
 * The composer of a group that holds no conversation yet: a live input rather
 * than a button, so opening a project or worktree and typing is what starts its
 * first session. It is one surface wherever it stands — alone on a group with
 * nothing open in it at all, or as the body under the tab strip when the only
 * tabs are files and tools — because two of them on one screen would be two
 * places to type the same first message.
 */
function HappyAgentGroupComposer(props: {
    composer: ComposerSource;
    composerNotice?: readonly string[];
    modelUsageWatch?: ComposerModelUsageWatch;
    /**
     * How that first conversation will be configured, and the options behind
     * those choices. Absent until the model catalog has been read, which is
     * what keeps the composer from waiting on it.
     */
    draftMenus?: HappyAgentMenusSnapshot;
    focusOnType: boolean;
    /** The group being written into. Arriving at another one takes the caret. */
    groupId: string;
    groupName: string;
    /** Reads current transport health when a Happy Agent-backed action is invoked. */
    happyAgentOnline: () => boolean;
    /** Why this Happy Agent cannot accept network actions while the local draft remains editable. */
    unavailable?: string;
    /**
     * The Happy Agent is restarting and takes no new messages until it is back:
     * the draft stays editable, Send is held, and the composer says why.
     */
    restarting?: boolean;
    workspace: HappyAgentWorkspaceStore;
}) {
    const workspace = props.workspace;
    const draftMenus = props.draftMenus;
    const modelsNotConfigured =
        draftMenus?.modelOptions.length === 0 && draftMenus.currentAccount !== "hidden";
    return (
        <ConversationView
            agentAuthor={agentAuthor}
            dock={
                <HappyAgentComposerDock
                    composer={props.composer}
                    disabled={modelsNotConfigured}
                    composerFocusOnType={props.focusOnType && !modelsNotConfigured}
                    // Only the composer that claims stray typing takes the caret, so the
                    // dock over an expanded panel cannot pull it out from under the one
                    // the reader can see.
                    {...(props.focusOnType && !modelsNotConfigured
                        ? { composerFocusKey: props.groupId }
                        : {})}
                    composerPlaceholder={
                        modelsNotConfigured
                            ? "Configure models to start messaging…"
                            : composerPlaceholder(props.groupName)
                    }
                    submitDisabled={props.unavailable !== undefined || props.restarting === true}
                    notice={[
                        ...(props.composerNotice ?? []),
                        ...(props.restarting === true ? AGENT_RESTARTING_NOTICE : []),
                    ]}
                    // The first message is what creates the session, so its model,
                    // effort, and access mode have to be choosable before it is sent
                    // rather than corrected afterwards. These are the same pickers an
                    // open conversation carries, over the draft instead of a live
                    // session.
                    composerControls={
                        draftMenus ? (
                            <ComposerModelControl
                                {...happyAgentComposerModelControlProps(draftMenus, {
                                    usageWatch: props.modelUsageWatch,
                                    onChiefOfStaffAsk: (request) =>
                                        workspace.chiefOfStaffDraftAppend(request),
                                    onEffortChange: (effort?: HappyAgentThinkingLevel) =>
                                        workspace.sessionEffortUpdate(effort),
                                    onModelChange: (selection: HappyAgentModelSelection) =>
                                        workspace.sessionModelUpdate(selection),
                                })}
                            />
                        ) : undefined
                    }
                    composerFooterControl={
                        draftMenus ? (
                            <ComposerFooterBar
                                leading={
                                    <HappyAgentSessionControls
                                        disabled={modelsNotConfigured}
                                        fields={["permission", "tier"]}
                                        menuPlacement="above"
                                        variant="ghost"
                                        menus={draftMenus}
                                        onEffortChange={(effort?: HappyAgentThinkingLevel) =>
                                            workspace.sessionEffortUpdate(effort)
                                        }
                                        onModelChange={(selection: HappyAgentModelSelection) =>
                                            workspace.sessionModelUpdate(selection)
                                        }
                                        onPermissionModeChange={(mode: HappyAgentPermissionMode) =>
                                            workspace.sessionPermissionModeUpdate(mode)
                                        }
                                        onServiceTierChange={(tier?: HappyAgentServiceTier) =>
                                            workspace.sessionServiceTierUpdate(tier)
                                        }
                                    />
                                }
                            />
                        ) : undefined
                    }
                    onComposerAttachmentRemove={(attachmentId) =>
                        workspace.composerAttachmentRemove(attachmentId)
                    }
                    onComposerAttachmentsSelect={(files) => workspace.composerAttachmentsAdd(files)}
                    onComposerFocusChange={(focused) => workspace.composerFocusUpdate(focused)}
                    onComposerSend={() => {
                        if (!modelsNotConfigured && props.happyAgentOnline())
                            workspace.composerTextSubmit();
                    }}
                    onComposerValueChange={(value) => workspace.composerTextUpdate(value)}
                />
            }
            entries={NO_ENTRIES}
        />
    );
}

/** The open conversation's materialization states, inside the directory's tabs. */
function HappyAgentConversationBody(props: {
    activitySelected: boolean;
    /** The machine's artifacts, which the transcript's references name. */
    artifacts?: HappyAgentArtifacts;
    /**
     * The host's engines for pages tool calls show inline, and the connection
     * a web page's network belongs to. Absent, every such call keeps its card.
     */
    inlineEngines?: {
        readonly artifactPage?: HtmlPreviewRenderer;
        readonly browserContent?: BrowserContentRenderer;
        /** Draws a sidebar proposal the transcript shows. */
        readonly proposalRender?: (artifactId: string, fit: InlinePageFit) => ReactNode;
        /** Draws a story the transcript shows. */
        readonly storyRender?: (artifactId: string, fit: InlinePageFit) => ReactNode;
        readonly browserConnectionId: string | null;
    };
    /** The agents, workspaces, and projects the transcript's references can name. */
    referenceEntities: MessageReferenceEntities;
    /** Opens a group a reference names, on one of its conversations or where it was left. */
    onReferenceGroupOpen: (groupId: HappyAgentGroupId, agentId?: string) => void;
    /** The Surfaces the transcript's references can name, and where one opens. */
    referenceSurfaces?: MessageReferenceSurfaces;
    modelUsageWatch?: ComposerModelUsageWatch;
    conversation: HappyAgentWorkspaceSnapshot["conversation"];
    emptyContent?: ReactNode;
    /** The block that opens the transcript; `settled` once the conversation has begun. */
    leadingHeader?: (settled: boolean) => ConversationLeadingHeader | undefined;
    /** Messages that are bookkeeping, by message ID, each read as one summary row. */
    notes?: ReadonlyMap<string, ConversationNote> | undefined;
    focusOnType: boolean;
    groupId: string;
    groupName: string;
    now: number;
    /**
     * Something to say about the place this conversation is happening in, held
     * above every message in it. A workspace's own first conversation exists
     * before its checkout does, so this is where the reader watches that
     * checkout being prepared — while the transcript, the empty state, and the
     * composer underneath all behave exactly as they otherwise would.
     */
    notice?: ReactNode;
    /** Workspace context kept directly above the input, including when it is disabled. */
    composerNotice?: readonly string[];
    /** Starts a session here, when this workspace can host one. */
    onCreate?: () => void;
    onChatSelect: HappyAgentWorkspaceSurfaceProps["onChatSelect"];
    onFileOpen: FileOpenHandler;
    /** Opens a file a `happy-file:` link names in another workspace, beside this one. */
    onFileLinkOpen: FileLinkOpenHandler;
    /** Opens a web link a message carries where its context menu asked for it. */
    onLinkOpen: LinkOpenHandler;
    /** Which of the two places a plain click on a link goes, marked in its menu. */
    linkOpenDefault: LinkOpenPlacement;
    readOnly: boolean;
    /** Reads current transport health when a Happy Agent-backed action is invoked. */
    happyAgentOnline: () => boolean;
    /** Why the input is closed, said in the words of whatever closed it. */
    readOnlyReason?: string;
    /** Why this Happy Agent cannot currently accept network actions. */
    unavailable?: string;
    /**
     * The Happy Agent is restarting and takes no new messages until it is back:
     * the draft stays editable, Send is held, and the composer says why.
     */
    restarting?: boolean;
    /**
     * Whether a run already going here may be stopped. Separate from `readOnly`
     * on purpose: a checkout that has gone away closes the input, but the run
     * inside it is a process the host owns and the reader must still be able to
     * end it. Only a subagent's own runner takes Stop away, because that run
     * belongs to the parent that started it.
     */
    canAbort: boolean;
    /** Why this conversation may not be written into, or absent when it may. */
    writeRefusal?: string;
    viewerId: string;
    workspace: HappyAgentWorkspaceStore;
}) {
    const conversation = props.conversation;
    if (conversation.type === "ready")
        return (
            <HappyAgentConversationSurface
                activitySelected={props.activitySelected}
                {...(props.artifacts ? { artifacts: props.artifacts } : {})}
                {...(props.inlineEngines ? { inlineEngines: props.inlineEngines } : {})}
                referenceEntities={props.referenceEntities}
                onReferenceGroupOpen={props.onReferenceGroupOpen}
                {...(props.referenceSurfaces ? { referenceSurfaces: props.referenceSurfaces } : {})}
                modelUsageWatch={props.modelUsageWatch}
                conversation={conversation.value}
                emptyContent={props.emptyContent}
                {...(props.leadingHeader ? { leadingHeader: props.leadingHeader } : {})}
                notes={props.notes}
                focusOnType={props.focusOnType}
                groupId={props.groupId}
                groupName={props.groupName}
                composerNotice={props.composerNotice}
                {...(props.notice === undefined ? {} : { notice: props.notice })}
                now={props.now}
                {...(props.onCreate === undefined ? {} : { onNewChat: props.onCreate })}
                onChatSelect={props.onChatSelect}
                onFileOpen={props.onFileOpen}
                onFileLinkOpen={props.onFileLinkOpen}
                onLinkOpen={props.onLinkOpen}
                linkOpenDefault={props.linkOpenDefault}
                canAbort={props.canAbort}
                readOnly={props.readOnly}
                happyAgentOnline={props.happyAgentOnline}
                {...(props.unavailable === undefined ? {} : { unavailable: props.unavailable })}
                {...(props.restarting === true ? { restarting: true } : {})}
                {...(props.readOnlyReason === undefined
                    ? {}
                    : { readOnlyReason: props.readOnlyReason })}
                {...(props.writeRefusal === undefined ? {} : { writeRefusal: props.writeRefusal })}
                viewerId={props.viewerId}
                workspace={props.workspace}
            />
        );
    if (conversation.type === "loading" && props.unavailable !== undefined)
        return (
            <EmptyState
                description={`${props.unavailable} The session will finish loading automatically after reconnect.`}
                icon="link"
                size="panel"
                title="Session waiting for the Happy Agent"
            />
        );
    if (conversation.type === "loading")
        return (
            <EmptyState
                animation="snail"
                description="Loading the selected local session."
                icon="chat"
                size="panel"
                title="Loading session…"
            />
        );
    if (conversation.type === "error")
        return (
            <EmptyState
                {...(props.unavailable === undefined
                    ? {
                          action: {
                              label: "Retry",
                              icon: "arrow-right" as const,
                              onClick: () => {
                                  if (props.happyAgentOnline()) props.workspace.conversationRetry();
                              },
                          },
                      }
                    : {})}
                description={conversation.error.message}
                icon="shield"
                size="panel"
                title="Session unavailable"
            />
        );
    return (
        <EmptyState
            {...(props.onCreate === undefined
                ? {}
                : {
                      action: {
                          label: "New session",
                          icon: "plus" as const,
                          onClick: props.onCreate,
                      },
                  })}
            // The main screen of the whole application when no work is open: an
            // agent standing by, waiting to be given something to do.
            animation="robot"
            description="Select a session tab or start a new one to begin."
            icon="chat"
            size="panel"
            title="No session selected"
        />
    );
}

/**
 * The open conversation and the ones the workspace keeps behind it, each in a
 * view of its own that stays mounted out of sight. Going back to a kept
 * conversation shows the view already built for it — its transcript, where it
 * was scrolled to, its open rows — and draws it once from the conversation as
 * it is now, instead of building the whole thing again.
 *
 * Only the open conversation is given content. A kept one stays exactly as it
 * was drawn when it was left and does no work while out of sight, however much
 * it streams; so does the open one while a file or tool covers it.
 */
function HappyAgentConversationViews(props: {
    /**
     * The conversation the address names, drawn by the surface with everything
     * it knows. Not `ready` while it stands in for one being read back.
     */
    open: { readonly id: string; readonly content: ReactNode; readonly ready: boolean } | undefined;
    /** Whether the main pane shows the open conversation rather than a file or tool over it. */
    shown: boolean;
    workspace: HappyAgentWorkspaceStore;
}) {
    const { workspace } = props;
    const kept = useSyncExternalStore(
        reactFrameSubscribe(workspace.conversationsRetained),
        workspace.conversationsRetained.get,
        workspace.conversationsRetained.get,
    );
    // Stable for the workspace's lifetime: each view's frame is keyed on it, and
    // a new identity would re-measure the view on screen on every render.
    const viewHide = useCallback(
        (id: string, elements: number) =>
            workspace.conversationViewSizeUpdate(id as HappyAgentSessionId, elements),
        [workspace],
    );
    const views = [
        ...(props.open ? [props.open] : []),
        ...kept.conversationIds
            .filter((conversationId) => conversationId !== props.open?.id)
            .map((conversationId) => ({ id: conversationId })),
    ];
    return (
        <RetainedViews
            {...(props.shown && props.open ? { activeId: props.open.id } : {})}
            onViewHide={viewHide}
            views={views}
        />
    );
}

/** How many of a chat's artifacts and agents the floaty lists before its history. */
const FLOATY_ARTIFACTS = 4;
const FLOATY_AGENTS = 3;

/**
 * Readies a workspace about to be opened to show its work: with uncommitted
 * changes, the panel opens on its Changes listing when the workspace arrives.
 * Without any it opens as it always does.
 */
function workspaceChangesShowOnOpen(
    workspace: HappyAgentWorkspaceStore | undefined,
    group: { readonly id: string; readonly changes?: readonly unknown[] } | undefined,
): void {
    if (!workspace || !group || (group.changes?.length ?? 0) === 0) return;
    workspace.fileScopeUpdate(group.id as HappyAgentGroupId, "changed");
    workspace.panel.filesSelectOnArrival(group.id as HappyAgentGroupId);
}

/**
 * One place a chat changed files, as the floaty lists it. `workspaceId` is a
 * workspace of its own, which the row opens in place of this chat; absent, the
 * place is this chat's own, whose changes the panel beside it lists.
 */
interface WorkFloatyPlace {
    readonly row: WorkFloatyRow;
    readonly workspaceId?: HappyAgentGroupId;
}

/** A project or worktree, by its project's picture and its own name, as its sidebar row reads. */
function workFloatyProjectPlace(
    project: HappyAgentProjectGroup,
    worktree: HappyAgentWorktreeGroup | undefined,
    added: number,
    deleted: number,
): WorkFloatyRow {
    return {
        id: `place:${worktree?.id ?? project.id}`,
        label: worktree ? worktree.name : project.name,
        mark: {
            type: "project",
            label: `Project: ${project.name}`,
            initials: project.name.slice(0, 1).toUpperCase(),
            ...(project.avatar ? { imageUrl: project.avatar.url } : {}),
        },
        trailing: { type: "changes", added, deleted },
    };
}

/**
 * Where the open group itself changed files: its checkout, as its project and
 * name, when Git keeps a diff of it, and otherwise the folder the
 * conversation's edits went to.
 */
function workFloatyOwnPlace(
    group: OpenGroup,
    projects: readonly HappyAgentProjectGroup[],
    changes: readonly HappyAgentPanelChange[],
    fromGit: boolean,
): WorkFloatyPlace | undefined {
    if (changes.length === 0) return undefined;
    const added = changes.reduce((sum, change) => sum + (change.addedLines ?? 0), 0);
    const deleted = changes.reduce((sum, change) => sum + (change.deletedLines ?? 0), 0);
    const project = fromGit
        ? projects.find(
              (candidate) =>
                  candidate.id === group.id ||
                  candidate.worktrees.some((worktree) => worktree.id === group.id),
          )
        : undefined;
    if (project)
        return {
            row: workFloatyProjectPlace(
                project,
                project.worktrees.find((worktree) => worktree.id === group.id),
                added,
                deleted,
            ),
        };
    const path = group.path.replace(/\/+$/u, "");
    return {
        row: {
            id: `place:${group.id}`,
            label: path.slice(path.lastIndexOf("/") + 1) || group.name,
            mark: { type: "folder" },
            trailing: { type: "changes", added, deleted },
        },
    };
}

/**
 * The checkouts a chat made that hold changes now, each as its project and
 * name. They are the chat's places by the record of who created them.
 */
function workFloatyCreatedPlaces(
    projects: readonly HappyAgentProjectGroup[],
    chatId: string,
    openGroupId: HappyAgentGroupId | undefined,
): readonly WorkFloatyPlace[] {
    return projects.flatMap((project) =>
        project.worktrees
            .filter(
                (worktree) =>
                    worktree.creatorAgentId === chatId &&
                    worktree.id !== openGroupId &&
                    ((worktree.addedLines ?? 0) > 0 || (worktree.deletedLines ?? 0) > 0),
            )
            .map((worktree) => ({
                workspaceId: worktree.id,
                row: workFloatyProjectPlace(
                    project,
                    worktree,
                    worktree.addedLines ?? 0,
                    worktree.deletedLines ?? 0,
                ),
            })),
    );
}

/** A floaty row that opens an artifact rather than an agent's chat. */
const FLOATY_ARTIFACT_PREFIX = "artifact:";

/**
 * What one chat has published, newest change first. The list beside a chat
 * may have been widened, so the floaty narrows it back to this conversation.
 */
function workFloatyOutputs(
    artifacts: HappyAgentArtifactCatalogSnapshot["artifacts"],
    chatId: string | undefined,
): readonly WorkFloatyRow[] {
    return [...artifacts]
        .filter(
            (artifact) =>
                artifact.status === "active" &&
                (chatId === undefined ||
                    artifact.source?.agentId === chatId ||
                    artifact.updatedSource?.agentId === chatId),
        )
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .map(
            (artifact): WorkFloatyRow => ({
                id: `${FLOATY_ARTIFACT_PREFIX}${artifact.id}`,
                label: artifact.title,
                mark: { type: "icon", icon: "package" },
            }),
        );
}

/**
 * One conversation's delegated agents as the floaty lists them: every one
 * still working, then the newest finished ones up to the list's length, and
 * the rest under History.
 */
function workFloatyAgents(subagents: readonly SubagentSummary[]): {
    readonly current: readonly WorkFloatyRow[];
    readonly history: readonly WorkFloatyRow[];
} {
    const row = (subagent: SubagentSummary): WorkFloatyRow => {
        const label = subagent.taskName?.trim() || subagent.description.trim() || "Agent";
        return {
            id: subagent.id,
            label,
            mark: { type: "icon", icon: "agents" },
            ...(happyAgentSubagentActive(subagent)
                ? { trailing: { type: "working", label: `${label} is working` } }
                : subagent.totalTokens !== undefined && subagent.totalTokens > 0
                  ? { trailing: { type: "tokens", count: subagent.totalTokens } }
                  : {}),
        };
    };
    const newestFirst = [...subagents].sort((left, right) => right.updatedAt - left.updatedAt);
    const working = newestFirst.filter(happyAgentSubagentActive);
    const finished = newestFirst.filter((subagent) => !happyAgentSubagentActive(subagent));
    const shown = Math.max(0, FLOATY_AGENTS - working.length);
    return {
        current: [...working, ...finished.slice(0, shown)].map(row),
        history: finished.slice(shown).map(row),
    };
}

/** A delegated agent that is still working, or about to be. */
function happyAgentSubagentActive(subagent: SubagentSummary): boolean {
    return subagent.status === "queued" || subagent.status === "running";
}

/**
 * Whether this conversation is working at all: its own turn, or the agents it
 * delegated to and has not outlived. A turn can hand work to a child and end
 * before the child does, and the session is still working while that lasts.
 */
function happyAgentConversationWorking(
    conversation: Pick<HappyAgentConversationSnapshot, "running" | "subagents">,
): boolean {
    return conversation.running || conversation.subagents.some(happyAgentSubagentActive);
}

/** Counts live agents and terminals for the compact transcript affordance. */
function happyAgentActiveActivityCounts(
    conversation: Pick<
        HappyAgentConversationSnapshot,
        "subagents" | "backgroundProcesses" | "detachedBackgroundProcessIds"
    >,
): {
    readonly agents: number;
    readonly terminals: number;
} {
    const agents = conversation.subagents.filter(happyAgentSubagentActive);
    return {
        agents: agents.length,
        terminals: conversation.backgroundProcesses.filter((process) =>
            conversation.detachedBackgroundProcessIds.has(process.id),
        ).length,
    };
}

/**
 * How long this conversation's delegated agents have been working, counted from
 * the first one still going. It is the clock the status line shows once the
 * parent turn has ended and the children have not, so it measures the work that
 * is actually still running rather than the turn that started it.
 *
 * A child whose runner never told us when it started leaves the state without a
 * clock, and the status line then shows the state alone.
 */
function happyAgentDelegatedElapsedMs(
    conversation: Pick<HappyAgentConversationSnapshot, "subagents">,
    now: number,
): number | undefined {
    let startedAt: number | undefined;
    for (const subagent of conversation.subagents) {
        if (!happyAgentSubagentActive(subagent)) continue;
        const since = subagent.activeSince ?? subagent.createdAt;
        if (startedAt === undefined || since < startedAt) startedAt = since;
    }
    return startedAt === undefined ? undefined : Math.max(0, now - startedAt);
}

function HappyAgentConversationSurface(props: {
    activitySelected: boolean;
    /** The machine's artifacts, which the transcript's references name. */
    artifacts?: HappyAgentArtifacts;
    /**
     * The host's engines for pages tool calls show inline, and the connection
     * a web page's network belongs to. Absent, every such call keeps its card.
     */
    inlineEngines?: {
        readonly artifactPage?: HtmlPreviewRenderer;
        readonly browserContent?: BrowserContentRenderer;
        /** Draws a sidebar proposal the transcript shows. */
        readonly proposalRender?: (artifactId: string, fit: InlinePageFit) => ReactNode;
        /** Draws a story the transcript shows. */
        readonly storyRender?: (artifactId: string, fit: InlinePageFit) => ReactNode;
        readonly browserConnectionId: string | null;
    };
    /** The agents, workspaces, and projects the transcript's references can name. */
    referenceEntities: MessageReferenceEntities;
    /** Opens a group a reference names, on one of its conversations or where it was left. */
    onReferenceGroupOpen: (groupId: HappyAgentGroupId, agentId?: string) => void;
    /** The Surfaces the transcript's references can name, and where one opens. */
    referenceSurfaces?: MessageReferenceSurfaces;
    modelUsageWatch?: ComposerModelUsageWatch;
    conversation: HappyAgentConversationSnapshot;
    emptyContent?: ReactNode;
    /** The block that opens the transcript; `settled` once the conversation has begun. */
    leadingHeader?: (settled: boolean) => ConversationLeadingHeader | undefined;
    notes?: ReadonlyMap<string, ConversationNote> | undefined;
    focusOnType: boolean;
    groupId: string;
    groupName: string;
    /** What to say above every message here; see `HappyAgentConversationBody`. */
    notice?: ReactNode;
    /** Workspace context kept directly above the input, including when it is disabled. */
    composerNotice?: readonly string[];
    now: number;
    /** Starts a fresh session here, offered by a conversation too long to continue. */
    onNewChat?: () => void;
    onChatSelect: HappyAgentWorkspaceSurfaceProps["onChatSelect"];
    /** Opens a file the transcript names, in the panel beside it, at the lines it named. */
    onFileOpen: FileOpenHandler;
    /** Opens a file a `happy-file:` link names in another workspace, beside this one. */
    onFileLinkOpen: FileLinkOpenHandler;
    /** Opens a web link a message carries where its context menu asked for it. */
    onLinkOpen: LinkOpenHandler;
    /** Which of the two places a plain click on a link goes, marked in its menu. */
    linkOpenDefault: LinkOpenPlacement;
    readOnly: boolean;
    /** Reads current transport health when a Happy Agent-backed action is invoked. */
    happyAgentOnline: () => boolean;
    /** Why the input is closed, said in the words of whatever closed it. */
    readOnlyReason?: string;
    /** Why this Happy Agent cannot currently accept network actions. */
    unavailable?: string;
    /**
     * The Happy Agent is restarting and takes no new messages until it is back:
     * the draft stays editable, Send is held, and the composer says why.
     */
    restarting?: boolean;
    /**
     * Whether a run already going here may be stopped. Separate from `readOnly`
     * on purpose: a checkout that has gone away closes the input, but the run
     * inside it is a process the host owns and the reader must still be able to
     * end it. Only a subagent's own runner takes Stop away, because that run
     * belongs to the parent that started it.
     */
    canAbort: boolean;
    /** Why this conversation may not be written into, or absent when it may. */
    writeRefusal?: string;
    viewerId: string;
    workspace: HappyAgentWorkspaceStore;
}) {
    const { conversation, workspace } = props;
    // The one subscription the transcript's references read through: every
    // reference row fans out from this snapshot rather than subscribing itself.
    const titlesStore = props.artifacts?.titles() ?? artifactTitlesStoreNoop;
    const titles = useSyncExternalStore(titlesStore.subscribe, titlesStore.get, titlesStore.get);
    // The artifacts the transcript shows inline, read through one subscription
    // the way its titles are.
    const inlineStore = props.artifacts?.inline() ?? inlineArtifactsStoreNoop;
    const inlineArtifacts = useSyncExternalStore(
        inlineStore.subscribe,
        inlineStore.get,
        inlineStore.get,
    );
    // The pages a reply's charts, diagrams, code quotes, and file lists are
    // drawn on, through one subscription as well.
    const componentStore = props.artifacts?.components() ?? componentSitesStoreNoop;
    const componentSites = useSyncExternalStore(
        componentStore.subscribe,
        componentStore.get,
        componentStore.get,
    );
    // A session that is still being read is not a reason to unmount this
    // surface: the composer is already live, the header already carries the
    // title the list knew, and the transcript fills in underneath. Only a
    // session that failed replaces it.
    if (conversation.session.type === "error")
        return (
            <EmptyState
                {...(props.unavailable === undefined
                    ? {
                          action: {
                              label: "Retry",
                              icon: "arrow-right" as const,
                              onClick: () => {
                                  if (props.happyAgentOnline()) workspace.conversationRetry();
                              },
                          },
                      }
                    : {})}
                description={conversation.session.error.message}
                icon="shield"
                size="panel"
                title="Session unavailable"
            />
        );
    const swallow = (operation: Promise<unknown>) => void operation.catch(() => undefined);
    // Whether a chat this reader may not write into is closed rather than merely
    // held. A chat whose runner owns it is not somewhere to leave a draft: the
    // agent is having this conversation and the reader is reading it, so the
    // composer locks instead of collecting a message with nowhere to go.
    //
    // The Happy Agent being unreachable is deliberately not this: that is a wait, the
    // draft survives it, and the sidebar footer names it. Only an unusable
    // destination locks the box.
    const sendRefusal = props.unavailable;
    /*
     * Whether the reader may choose how this conversation runs. The model,
     * reasoning, access mode, and speed all describe the message about to be
     * sent, so a chat that takes no message offers no choice about one: a
     * subagent's settings belong to the runner that started it, and a checkout
     * that has gone away has nothing to apply them to. The controls stay
     * visible and keep showing what the session actually runs, which is what a
     * reader looking at someone else's chat came to find out.
     */
    const modelsNotConfigured =
        conversation.menus?.modelOptions.length === 0 &&
        conversation.menus.currentAccount !== "hidden";
    const composerDisabled = props.readOnly || modelsNotConfigured;
    const configurable = !composerDisabled && sendRefusal === undefined;
    const activeActivity = happyAgentActiveActivityCounts(conversation);
    const activityTotal = activeActivity.agents + activeActivity.terminals;
    const openImage = conversation.openImage;
    /* The model pill and a failure card's switch read one set of props, so the
       card offers the accounts, models, and usage the pill does, live. */
    const modelControl = conversation.menus
        ? happyAgentComposerModelControlProps(conversation.menus, {
              usageWatch: props.modelUsageWatch,
              sessionId: conversation.conversationId as HappyAgentSessionId,
              onChiefOfStaffAsk: (request) => workspace.chiefOfStaffDraftAppend(request),
              disabled: !configurable || conversation.modelLocked,
              onEffortChange: (effort?: HappyAgentThinkingLevel) => {
                  if (props.happyAgentOnline()) workspace.sessionEffortUpdate(effort);
              },
              onModelChange: (selection: HappyAgentModelSelection) => {
                  if (props.happyAgentOnline()) workspace.sessionModelUpdate(selection);
              },
          })
        : undefined;
    const references = messageReferencesCreate({
        titles,
        titlesStore,
        entities: props.referenceEntities,
        subagents: conversation.subagents,
        onGroupOpen: (groupId, agentId) => {
            if (props.happyAgentOnline()) props.onReferenceGroupOpen(groupId, agentId);
        },
        ...(props.referenceSurfaces
            ? {
                  surfaces: {
                      names: props.referenceSurfaces.names,
                      open: (surfaceId: HappyAgentSurfaceId) => {
                          if (props.happyAgentOnline()) props.referenceSurfaces?.open(surfaceId);
                      },
                  },
              }
            : {}),
        ...(props.artifacts
            ? {
                  // A reference opens beside the conversation, the way a file
                  // the transcript names does, rather than leaving it.
                  onArtifactOpen: (artifactId: HappyAgentArtifactId, version?: number) =>
                      workspace.panel.artifactViewOpen(artifactId, version),
              }
            : {}),
    });
    /* The header opens the transcript, so it is drawn only above its first
       entry: while older history is still to load, it waits for it. */
    const leadingHeader =
        conversation.entries.length === 0 || conversation.transcriptComplete
            ? props.leadingHeader?.(conversation.entries.length > 0)
            : undefined;
    const inlineEngines = props.inlineEngines;
    const inlinePages = inlineEngines
        ? conversationInlinePagesCreate({
              artifacts: inlineArtifacts,
              store: inlineStore,
              ...(props.artifacts && inlineEngines.artifactPage
                  ? {
                        artifactPage: inlineEngines.artifactPage,
                        components: { sites: componentSites, store: componentStore },
                    }
                  : {}),
              ...(inlineEngines.browserContent
                  ? { browserContent: inlineEngines.browserContent }
                  : {}),
              ...(inlineEngines.proposalRender
                  ? { proposalRender: inlineEngines.proposalRender }
                  : {}),
              ...(inlineEngines.storyRender ? { storyRender: inlineEngines.storyRender } : {}),
              browserConnectionId: inlineEngines.browserConnectionId,
              workspaceId: props.groupId,
              agentId: conversation.conversationId,
              artifactOpen: (artifactId, version) =>
                  workspace.panel.artifactViewOpen(artifactId, version),
              pageOpen: (url) => workspace.panel.browserAdd(url),
          })
        : undefined;
    return (
        <ConversationView
            references={references}
            {...(inlinePages ? { inlinePages } : {})}
            emptyContent={props.emptyContent}
            {...(leadingHeader ? { leadingHeader } : {})}
            agentAuthor={agentAuthor}
            activityControl={
                activityTotal > 0 ? (
                    <HappyAgentActivityControl
                        agents={activeActivity.agents}
                        backgroundTerminals={activeActivity.terminals}
                        onClick={() => workspace.activityPanelOpen()}
                    />
                ) : undefined
            }
            dock={
                <HappyAgentComposerDock
                    composer={conversation.composer}
                    disabled={composerDisabled}
                    submitDisabled={sendRefusal !== undefined || props.restarting === true}
                    // A restarting agent is said in two plain lines above the input,
                    // and only while the input is open: a locked chat already says why.
                    notice={[
                        ...(props.composerNotice ?? []),
                        ...(props.restarting === true && !composerDisabled
                            ? AGENT_RESTARTING_NOTICE
                            : []),
                    ]}
                    composerFocusOnType={!composerDisabled && props.focusOnType}
                    // The open conversation is what this composer writes into, so moving
                    // to another one — or landing in the one a new workspace was made
                    // with — puts the caret in the draft. A locked chat has no draft to
                    // put it in, and only the composer claiming stray typing takes it,
                    // so the dock over an expanded panel cannot steal it.
                    {...(!composerDisabled && props.focusOnType
                        ? { composerFocusKey: conversation.conversationId }
                        : {})}
                    // A locked chat says why in the words of whatever locked it: the
                    // agent that owns it, named, or the checkout that will not take a
                    // message. Both are more use than the category of chat this is.
                    composerPlaceholder={
                        props.readOnly
                            ? (props.readOnlyReason ?? composerPlaceholder(props.groupName))
                            : modelsNotConfigured
                              ? "Configure models to start messaging…"
                              : // The tab already names the chat.
                                composerPlaceholder(undefined)
                    }
                    composerControls={
                        <>{modelControl ? <ComposerModelControl {...modelControl} /> : null}</>
                    }
                    composerFooterControl={
                        <ComposerFooterBar
                            leading={
                                <>
                                    <HappyAgentSessionControls
                                        disabled={!configurable}
                                        fields={["permission", "tier"]}
                                        menuPlacement="above"
                                        variant="ghost"
                                        menus={conversation.menus}
                                        onEffortChange={(effort?: HappyAgentThinkingLevel) => {
                                            if (props.happyAgentOnline())
                                                workspace.sessionEffortUpdate(effort);
                                        }}
                                        onModelChange={(selection: HappyAgentModelSelection) => {
                                            if (props.happyAgentOnline())
                                                workspace.sessionModelUpdate(selection);
                                        }}
                                        onPermissionModeChange={(
                                            mode: HappyAgentPermissionMode,
                                        ) => {
                                            if (props.happyAgentOnline())
                                                workspace.sessionPermissionModeUpdate(mode);
                                        }}
                                        onServiceTierChange={(tier?: HappyAgentServiceTier) => {
                                            if (props.happyAgentOnline())
                                                workspace.sessionServiceTierUpdate(tier);
                                        }}
                                    />
                                </>
                            }
                            /* How much of the window this session has spent, at the far
                               end of the same row as the access mode and the speed: the
                               reader is about to type one more message, and this is
                               where they find out whether it still fits and when to
                               compact. Before the provider's first measurement, the
                               declared window still appears with an empty-state count
                               so the context surface is discoverable. */
                            trailing={
                                conversation.contextGauge ? (
                                    <ContextMeter
                                        approximate={conversation.contextGauge.approximate}
                                        compactTokens={conversation.contextGauge.compactTokens}
                                        measured={conversation.contextGauge.measured}
                                        totalTokens={conversation.contextGauge.totalTokens}
                                        usedTokens={conversation.contextGauge.usedTokens}
                                    />
                                ) : undefined
                            }
                        />
                    }
                    onAbort={
                        props.canAbort
                            ? () => {
                                  if (props.happyAgentOnline()) swallow(workspace.runAbort());
                              }
                            : undefined
                    }
                    onSubagentsAbort={
                        props.canAbort
                            ? () => {
                                  if (props.happyAgentOnline()) swallow(workspace.subagentsAbort());
                              }
                            : undefined
                    }
                    onCommandInvoke={
                        !modelsNotConfigured && props.unavailable === undefined
                            ? (commandId) => {
                                  if (props.happyAgentOnline())
                                      workspace.composerCommandInvoke(commandId);
                              }
                            : undefined
                    }
                    onComposerAttachmentRemove={(attachmentId) =>
                        workspace.composerAttachmentRemove(attachmentId)
                    }
                    onComposerAttachmentsSelect={(files) => workspace.composerAttachmentsAdd(files)}
                    onComposerFocusChange={(focused) => workspace.composerFocusUpdate(focused)}
                    onComposerSend={() => {
                        if (!modelsNotConfigured && props.happyAgentOnline())
                            workspace.composerTextSubmit();
                    }}
                    onComposerValueChange={(value) => workspace.composerTextUpdate(value)}
                    running={conversation.running}
                    subagentsRunning={conversation.subagentsRunning}
                />
            }
            conversationId={conversation.conversationId}
            entries={
                props.notes === undefined
                    ? conversation.entries
                    : conversationNotesFold(conversation.entries, props.notes)
            }
            errorAssistance={conversation.errorAssistance}
            errorAssistanceUnavailable={props.unavailable}
            onErrorAssistanceRequest={(entryId) => {
                if (props.happyAgentOnline()) workspace.errorAssistanceRequest(entryId);
            }}
            /* A chat that takes no message cannot be continued from its failure
               either, so a read-only one offers only a new chat. */
            failureActions={{
                ...(props.readOnly
                    ? {}
                    : {
                          onRetry: (entryId: string) => {
                              if (props.happyAgentOnline())
                                  swallow(workspace.failureRetry(entryId));
                          },
                          onSwitch: (entryId: string, target: ConversationSwitchTarget) => {
                              if (props.happyAgentOnline())
                                  swallow(
                                      workspace.failureSwitch(entryId, {
                                          providerId: target.providerId,
                                          modelId: target.modelId,
                                      }),
                                  );
                          },
                      }),
                ...(props.onNewChat === undefined ? {} : { onNewChat: () => props.onNewChat!() }),
            }}
            /* A daemon before protocol 32 accepts only the targets it stored
               with the failure, which are no longer read, so it offers Retry. */
            {...(modelControl && conversation.failureSwitchSupported
                ? { failureSwitch: modelControl }
                : {})}
            {...(conversation.retrying === undefined ? {} : { retrying: conversation.retrying })}
            loading={!conversation.ready}
            {...(props.notice === undefined ? {} : { notice: props.notice })}
            scrollPosition={conversation.scrollPosition}
            onScrollPositionChange={(position) => {
                workspace.conversationScrollUpdate(
                    conversation.conversationId as HappyAgentSessionId,
                    position,
                );
            }}
            // Reaching the oldest loaded entry is the whole request for the page
            // before it. The transcript reports it whether the reader scrolled
            // there or a short history put them there on arrival — a long run
            // fills a whole page on its own, and the transcript it opens with
            // can be shorter than the pane it sits in.
            onStartReached={() => {
                if (props.happyAgentOnline() && !conversation.transcriptComplete)
                    workspace.historyLoadMore();
            }}
            onFileOpen={(path, selection) => {
                if (props.happyAgentOnline()) props.onFileOpen(path, selection);
            }}
            onFileLinkOpen={props.onFileLinkOpen}
            onLinkOpen={props.onLinkOpen}
            linkOpenDefault={props.linkOpenDefault}
            onImageOpen={(messageId, attachmentId) => {
                if (props.happyAgentOnline()) workspace.imageOpen(messageId, attachmentId);
            }}
            onAttachmentOpen={(attachment) => {
                // An attached document is a page, not a file to save. When it
                // lives in a checkout this workspace reads, it opens the way a
                // document in the file list does — rendered, served from its own
                // folder so its stylesheet and scripts resolve, with the source
                // a toggle away. Only a document the workspace cannot reach
                // falls back to the download the host offered.
                if (
                    attachment.attachmentKind === "file" &&
                    filePreviewKind(attachment.source) === "html" &&
                    props.happyAgentOnline() &&
                    workspace.attachmentFileOpen(attachment.source, "document")
                ) {
                    return;
                }
                if (attachment.openUrl) openExternalLink(attachment.openUrl);
            }}
            onToolSelect={(entryId) => workspace.panel.previewOpen(entryId)}
            onToolMediaOpen={(entryId, tool, index) => {
                // A picture opens full size over the conversation, stepping
                // through every picture it shows; a document or any other file
                // opens in the preview beside it.
                const item =
                    tool.presentation?.type === "media"
                        ? tool.presentation.items[index]
                        : undefined;
                if (item?.kind === "image") workspace.toolImageOpen(entryId, index);
                else if (item !== undefined) workspace.panel.previewOpen(entryId, index);
            }}
            onDelegationSelect={(sessionId) =>
                props.onChatSelect(props.groupId, sessionId as HappyAgentSessionId)
            }
            {...(props.writeRefusal === undefined && props.unavailable === undefined
                ? {
                      onRequestAnswer: (requestId: string, answers: HappyAgentUserInputAnswerMap) =>
                          props.happyAgentOnline()
                              ? swallow(workspace.answerInput({ requestId, answers }))
                              : undefined,
                  }
                : {})}
            expandedTurnIds={conversation.expandedTurnIds}
            expandedMessageIds={conversation.expandedMessageIds}
            onMessageExpandedChange={(messageId, expanded) =>
                workspace.messageExpandedSet(messageId, expanded)
            }
            onTraceToggle={(turnId) => workspace.turnTraceToggle(turnId)}
            onTracesSeen={(viewer, turnIds) => workspace.turnTracesSeen(viewer, turnIds)}
            overlay={
                openImage ? (
                    <ModalOverlay onDismiss={() => workspace.imageClose()} placement="fill">
                        <Lightbox
                            adjacentImages={{
                                previous: openImage.previousUrl,
                                next: openImage.nextUrl,
                            }}
                            alt={openImage.alt}
                            imageThumbnail={openImage.thumbnail}
                            imageUrl={openImage.url}
                            onClose={() => workspace.imageClose()}
                            onCopy={() => imageCopy(openImage.url)}
                            onDownload={() =>
                                fileDownload(openImage.name, { type: "url", url: openImage.url })
                            }
                            {...(openImage.total > 1
                                ? {
                                      position: {
                                          index: openImage.index,
                                          total: openImage.total,
                                      },
                                      onNext: () => workspace.imageNext(),
                                      onPrevious: () => workspace.imagePrevious(),
                                  }
                                : {})}
                        />
                    </ModalOverlay>
                ) : undefined
            }
            requestSubmissions={conversation.requestSubmissions}
            requestSelections={conversation.requestSelections}
            onRequestSelectionChange={(requestId, answers) =>
                workspace.requestSelectionUpdate(requestId, answers)
            }
            activityTreatment="focused"
            motion="calm-typed"
            running={conversation.running}
            delegatedAgents={activeActivity.agents}
            delegatedElapsedMs={happyAgentDelegatedElapsedMs(conversation, props.now)}
            elapsedMs={happyAgentTurnElapsedMs(conversation, props.now)}
            now={props.now}
            workingPhase={conversation.workingPhase}
            workingLabel={conversation.workingLabel}
            workingWait={happyAgentWaitStatus(conversation, props.now)}
            viewerId={props.viewerId}
        />
    );
}

/**
 * The scheduled wait the footer counts down, paired with the surface clock it
 * is measured against. The daemon's own label states an absolute deadline that
 * stops being useful the moment it is written; handing the status line both
 * ends and a ticking `now` is what turns it into something that keeps changing
 * while the reader watches it.
 */
function happyAgentWaitStatus(
    conversation: { readonly running: boolean; readonly workingWait?: HappyAgentWorkingWait },
    now: number,
): AgentWaitStatus | undefined {
    if (!conversation.running || conversation.workingWait === undefined) return undefined;
    return { ...conversation.workingWait, now };
}

/**
 * Live elapsed for the open turn, counted from when the user sent the request
 * (before the first token). Prefers the store's request-send clock; falls back
 * to the last user message's createdAt when a reconnect leaves that unset.
 */
function happyAgentTurnElapsedMs(
    conversation: {
        readonly running: boolean;
        readonly runStartedAt?: number;
        readonly turnElapsedMs?: number;
        readonly entries: readonly ConversationEntry[];
    },
    now: number,
): number | undefined {
    if (!conversation.running) return conversation.turnElapsedMs;
    if (conversation.runStartedAt !== undefined)
        return Math.max(0, now - conversation.runStartedAt);
    let earliestSentAt: number | undefined;
    for (let index = conversation.entries.length - 1; index >= 0; index -= 1) {
        const entry = conversation.entries[index];
        if (entry?.kind === "turnStatus" && entry.status !== "steered") break;
        if (entry?.kind !== "message") continue;
        if (!happyAgentHumanMessageAuthor(entry.message.sender)) continue;
        const sentAt = Date.parse(entry.message.createdAt);
        if (Number.isFinite(sentAt)) earliestSentAt = sentAt;
    }
    return earliestSentAt === undefined ? undefined : Math.max(0, now - earliestSentAt);
}

/**
 * The right panel's header band and its two stacked regions. The upper one is
 * the addressed project/worktree's live changed-file list; the lower one is the
 * terminal section. The divider between them is the user's, so a shell can take
 * most of the column or none of it.
 *
 * Only the tab strip re-renders from this component's subscription; a terminal's
 * own output lands in `HappyAgentTerminalTab`, which subscribes to that terminal alone,
 * so a busy shell never re-renders its neighbours or the tab bar above it.
 *
 * The band is empty and still earns its place: it puts this column's tabs on the
 * same line as the session tabs beside them instead of a header's height higher,
 * and in the desktop window it gives that edge a lane to drag the window by.
 */
/**
 * The dialogs that belong to the window rather than to a screen: naming a row,
 * and Create. Both are reached from chrome that is on every route — the cog on a
 * sidebar row, the Create row above it — so they are mounted once beside the
 * screen instead of inside one of them, and they answer the same way wherever
 * the reader happens to be. Being outside the screen is also what keeps a task
 * being written alive while the surface behind it changes.
 *
 * One subscription serves both: this is a single window-level adapter onto one
 * materialized store, so the routes that render no workspace surface still see
 * a draft change as it is typed.
 */
function HappyAgentWindowDialogs(props: {
    projects: readonly HappyAgentProjectGroup[];
    happyAgentOnline: () => boolean;
    onTaskOpen: (task: HappyAgentTask) => void;
    unavailable?: string;
    workspace: HappyAgentWorkspaceStore;
}) {
    const workspace = useSyncExternalStore(
        reactFrameSubscribe(props.workspace),
        props.workspace.get,
        props.workspace.get,
    );
    return (
        <>
            {happyAgentNamingDialog(
                workspace.rename,
                workspace.projectArchive,
                workspace.projectSettings,
                props.projects,
                props.workspace,
                props.happyAgentOnline,
                props.unavailable,
            )}
            {happyAgentGroupArchiveDialog(
                workspace.groupArchive,
                props.workspace,
                props.happyAgentOnline,
                props.unavailable,
            )}
            {workspace.projectClone ? (
                <HappyAgentProjectCloneDialog
                    repository={workspace.projectClone.repository}
                    submitting={workspace.projectClone.submitting}
                    onClose={() => props.workspace.projectCloneCancel()}
                    onRepositoryChange={(value) => props.workspace.projectRepositoryUpdate(value)}
                    onSubmit={() => props.workspace.projectCloneSubmit()}
                    {...(workspace.projectClone.error === undefined
                        ? {}
                        : { error: workspace.projectClone.error })}
                    {...(props.unavailable === undefined
                        ? {}
                        : { submitDisabledReason: props.unavailable })}
                />
            ) : null}
            {workspace.taskBrowseOpen
                ? happyAgentTaskBrowseDialog(
                      workspace.list,
                      props.workspace,
                      props.onTaskOpen,
                      props.happyAgentOnline,
                      props.unavailable,
                  )
                : null}
        </>
    );
}

/**
 * Every active task on the machine, to join or to open. A joined task offers
 * Open instead, and a join waiting on the host spins on its own button; the
 * list itself is the host's, so a task joined from another window turns into
 * Open here on its own.
 */
function happyAgentTaskBrowseDialog(
    list: HappyAgentWorkspaceSnapshot["list"],
    store: HappyAgentWorkspaceStore,
    onTaskOpen: (task: HappyAgentTask) => void,
    happyAgentOnline: () => boolean,
    unavailable?: string,
): ReactNode {
    const joined = new Set(list.tasks.map((task) => task.id));
    const joinFailure = list.taskDirectory
        .map((task) => ({ task, failure: list.taskFailures.get(task.id) }))
        .find((entry) => entry.failure?.action === "join");
    return (
        <HappyAgentTaskBrowseDialog
            onClose={() => store.taskBrowseClose()}
            onJoin={(id) => {
                if (happyAgentOnline())
                    void store.taskJoin(id as HappyAgentTaskId).catch(() => undefined);
            }}
            onOpen={(id) => {
                const task = list.tasks.find((entry) => entry.id === id);
                if (task) onTaskOpen(task);
            }}
            tasks={list.taskDirectory.map((task) => ({
                id: task.id,
                name: task.name,
                joined: joined.has(task.id),
                ...(list.tasksJoining.has(task.id) ? { joining: true } : {}),
                // A standalone machine's tasks are all the reader's own, so
                // they are listed without anybody's face or name.
                ...(task.owner === null
                    ? {}
                    : {
                          owner: {
                              ...(task.owner.name === undefined ? {} : { name: task.owner.name }),
                              ...(task.owner.avatar === undefined
                                  ? {}
                                  : { imageUrl: task.owner.avatar.url }),
                          },
                      }),
            }))}
            {...(joinFailure?.failure
                ? { error: `“${joinFailure.task.name}”: ${joinFailure.failure.error.message}` }
                : {})}
            {...(unavailable === undefined ? {} : { joinDisabledReason: unavailable })}
        />
    );
}

/**
 * Cmd-W over an empty main pane stops at a confirmation. The dialog names the
 * exact group the store resolved, and the keystroke itself never archives it.
 */
function happyAgentGroupArchiveDialog(
    archive: HappyAgentWorkspaceSnapshot["groupArchive"],
    store: HappyAgentWorkspaceStore,
    happyAgentOnline: () => boolean,
    unavailable?: string,
): ReactNode {
    if (!archive) return null;
    const subject = archive.kind === "worktree" ? "workspace" : "project";
    return (
        <ModalOverlay
            {...(archive.submitting ? {} : { onDismiss: () => store.groupArchiveCancel() })}
        >
            <Modal
                footer={
                    <>
                        <Button
                            disabled={archive.submitting}
                            onClick={() => store.groupArchiveCancel()}
                            variant="ghost"
                        >
                            Cancel
                        </Button>
                        <Button
                            disabled={unavailable !== undefined}
                            loading={archive.submitting}
                            onClick={() => {
                                if (happyAgentOnline())
                                    void store.groupArchiveSubmit().catch(() => undefined);
                            }}
                            variant="danger"
                        >
                            Archive {subject}
                        </Button>
                    </>
                }
                icon="archive"
                {...(archive.submitting ? {} : { onClose: () => store.groupArchiveCancel() })}
                size="small"
                title={`Archive ${archive.name}?`}
                tone="danger"
            >
                {archive.error ? (
                    <Banner tone="danger" title={`Could not archive ${subject}`}>
                        {archive.error}
                    </Banner>
                ) : null}
                <p>
                    {archive.kind === "worktree"
                        ? "This removes the workspace from the sidebar and removes its worktree folder."
                        : "This removes the project and its sessions from the sidebar, archives every workspace under it, and removes those worktree folders. The project's own checkout stays where it is."}
                </p>
            </Modal>
        </ModalOverlay>
    );
}

/**
 * Where a row is named. A project opens its settings dialog rather than a bare
 * field: it has an identity and a checkout worth stating, and its name is the
 * one thing about it the daemon takes a new value for, so the name belongs
 * inside that surface. A worktree has nothing but its name, and gets the field.
 *
 * The project's settings are also where it ends: the archive lives in that same
 * dialog, so the confirmation, what it is waiting on, and why it failed are all
 * one projection of this store rather than a second surface over the first.
 */
function happyAgentNamingDialog(
    rename: HappyAgentWorkspaceSnapshot["rename"],
    archive: HappyAgentWorkspaceSnapshot["projectArchive"],
    compute: HappyAgentWorkspaceSnapshot["projectSettings"],
    projects: readonly HappyAgentProjectGroup[],
    store: HappyAgentWorkspaceStore,
    happyAgentOnline: () => boolean,
    unavailable?: string,
): ReactNode {
    if (!rename) return null;
    if (rename.kind !== "project")
        return (
            <ModalOverlay onDismiss={() => store.renameCancel()}>
                <Modal
                    footer={
                        <>
                            <Button onClick={() => store.renameCancel()} variant="ghost">
                                Cancel
                            </Button>
                            <Button
                                disabled={rename.submitting || unavailable !== undefined}
                                onClick={() => {
                                    if (happyAgentOnline())
                                        void store.renameSubmit().catch(() => undefined);
                                }}
                                variant="primary"
                            >
                                Rename
                            </Button>
                        </>
                    }
                    onClose={() => store.renameCancel()}
                    size="small"
                    title={`Rename ${rename.currentName}`}
                >
                    <TextField
                        disabled={rename.submitting}
                        fullWidth
                        label="Name"
                        onSubmit={() => {
                            if (happyAgentOnline())
                                void store.renameSubmit().catch(() => undefined);
                        }}
                        onValueChange={(value) => store.renameDraftUpdate(value)}
                        value={rename.draft}
                    />
                </Modal>
            </ModalOverlay>
        );
    // The project may have been archived from another window while this was
    // open. The dialog stays up on what the rename itself carries — the reader
    // still has an edit in front of them, and dismissing it is what clears the
    // draft — and simply drops the section it can no longer state.
    const project = projects.find((candidate) => candidate.id === rename.projectId);
    // Only what this dialog's own project is doing: an archive confirmed on
    // another project — or one this dialog was opened over afterwards — is not
    // this reader's question.
    const archiving = archive?.projectId === rename.projectId ? archive : undefined;
    // The archive is shown whenever an intent for it exists, whether or not the
    // row is in the list this render happens to hold: an operation the reader
    // started is not a fact about the catalog, and dropping the block the moment
    // the row went would take the pending state, the button, and the reason a
    // failure gave with it. Only a project with nothing pending has to be listed
    // to be offered one.
    const archiveBlock =
        archiving || project
            ? {
                  archive: {
                      confirming: archiving !== undefined,
                      submitting: archiving?.submitting === true,
                      ...(archiving?.error !== undefined ? { error: archiving.error } : {}),
                  },
              }
            : {};
    // Only this dialog's own project again. The compute block is materialized
    // with the dialog and released with it, so a snapshot naming another project
    // can only be one this render has raced; dropping it is what stops one
    // project's setting — and the handler that would save it — from being shown
    // over another.
    const computeBlock =
        compute?.projectId === rename.projectId
            ? {
                  compute: {
                      status: compute.status,
                      mode: compute.mode,
                      image: compute.image,
                      ...(compute.current === undefined ? {} : { current: compute.current }),
                      submitting: compute.submitting,
                      ...(compute.error === undefined ? {} : { error: compute.error }),
                      ...(compute.readError === undefined ? {} : { readError: compute.readError }),
                  },
                  // What a new workspace starts with comes from the same read as
                  // the compute choice, so it is present exactly when that is.
                  setup: {
                      status: compute.status,
                      setupCommands: compute.setupCommands,
                      ...(compute.initialPrompt === undefined
                          ? {}
                          : { initialPrompt: compute.initialPrompt }),
                      initialPromptDraft: compute.initialPromptDraft,
                      submitting: compute.submitting,
                      ...(compute.error === undefined ? {} : { error: compute.error }),
                      ...(compute.readError === undefined ? {} : { readError: compute.readError }),
                  },
              }
            : {};
    return (
        <HappyAgentProjectSettingsDialog
            draft={rename.draft}
            {...(project?.avatar ? { imageUrl: project.avatar.url } : {})}
            {...archiveBlock}
            {...computeBlock}
            {...(project
                ? {
                      contents: {
                          sessions:
                              project.conversations.length +
                              project.worktrees.reduce(
                                  (total, worktree) => total + worktree.conversations.length,
                                  0,
                              ),
                          worktrees: project.worktrees.length,
                      },
                      location: { displayPath: project.displayPath, path: project.path },
                  }
                : {})}
            // While an archive is pending, the name is the one the intent
            // captured and the store keeps current against the host: what the
            // reader is being asked to destroy has to be the entity that is
            // about to be destroyed, not whatever this dialog was opened on.
            name={archiving?.name ?? rename.currentName}
            onArchiveCancel={() => store.projectArchiveCancel()}
            onArchiveConfirm={() => {
                if (happyAgentOnline()) void store.projectArchiveSubmit().catch(() => undefined);
            }}
            onArchiveRequest={() => store.projectArchiveOpen(rename.projectId)}
            onClose={() => store.renameCancel()}
            onComputeImageChange={(value) => store.projectComputeImageUpdate(value)}
            onComputeModeChange={(mode) => store.projectComputeModeUpdate(mode)}
            onComputeSubmit={() => {
                if (happyAgentOnline()) void store.projectComputeSubmit().catch(() => undefined);
            }}
            onDraftChange={(value) => store.renameDraftUpdate(value)}
            onInitialPromptChange={(value) => store.projectInitialPromptUpdate(value)}
            onInitialPromptSubmit={() => {
                if (happyAgentOnline())
                    void store.projectInitialPromptSubmit().catch(() => undefined);
            }}
            // The commands live in the project's own happy.toml, so the offer is
            // to open that file where the project is, not to edit them here.
            {...(project
                ? { onSetupFileOpen: () => store.fileOpen(project.id, "happy.toml", "file") }
                : {})}
            onSubmit={() => {
                if (happyAgentOnline()) void store.renameSubmit().catch(() => undefined);
            }}
            submitting={rename.submitting}
            {...(unavailable === undefined ? {} : { submitDisabledReason: unavailable })}
        />
    );
}

/**
 * Where a bot is made: the conversation it is about to become, with nothing in
 * it yet. The body holds what is decided beforehand — the face, the name, and
 * Create — and the composer underneath is already the bot's own, standing
 * where it will stand once the bot exists, with the same model, access, and
 * speed pickers every composer carries and one sentence about what sending
 * does where the context meter will stand. Sending from it makes the bot and
 * says the first thing to it; Create makes the bot and carries the words into
 * the conversation as its draft, so making the bot moves nothing.
 *
 * The composer is the one the store materialized with the draft, addressed
 * through the draft's own actions rather than the workspace's shared ones: a
 * group left open behind this route may still hold a composer of its own, and
 * this one must never be mistaken for it.
 */
function HappyAgentCreateBotSurface(props: {
    happyAgentOnline: () => boolean;
    onExternalLinkOpen: (url: string) => void;
    providerUsage?: HappyAgentProviderUsageStore;
    unavailable?: string;
    workspace: HappyAgentWorkspaceStore;
}) {
    const botCreate = useSyncExternalStore(
        reactFrameSubscribe(props.workspace),
        props.workspace.get,
        props.workspace.get,
    ).botCreate;
    const modelUsageWatch = useComposerModelUsageWatch(props.providerUsage);
    if (!botCreate) return null;
    const store = props.workspace;
    const menus = botCreate.menus;
    return (
        <ConversationView
            agentAuthor={agentAuthor}
            dock={
                <HappyAgentComposerDock
                    composer={botCreate.composer}
                    // The composer stays live while the host makes the bot: what is
                    // typed meanwhile follows the reader into the conversation, and a
                    // composer that greyed out for the host's round trip would be the
                    // one thing on the screen that moved. The store refuses a second
                    // creation while one is under way.
                    composerFocusOnType
                    composerFocusKey={botCreate.composer.get().scopeId}
                    // The pickers an open conversation carries, over the draft the
                    // bot's conversation will start from.
                    composerControls={
                        menus ? (
                            <ComposerModelControl
                                {...happyAgentComposerModelControlProps(menus, {
                                    usageWatch: modelUsageWatch,
                                    onChiefOfStaffAsk: (request) =>
                                        store.chiefOfStaffDraftAppend(request),
                                    onEffortChange: (effort?: HappyAgentThinkingLevel) =>
                                        store.botCreateEffortUpdate(effort),
                                    onModelChange: (selection: HappyAgentModelSelection) =>
                                        store.botCreateModelUpdate(selection),
                                })}
                            />
                        ) : undefined
                    }
                    composerFooterControl={
                        <ComposerFooterBar
                            leading={
                                menus ? (
                                    <HappyAgentSessionControls
                                        fields={["permission", "tier"]}
                                        menuPlacement="above"
                                        variant="ghost"
                                        menus={menus}
                                        onEffortChange={(effort?: HappyAgentThinkingLevel) =>
                                            store.botCreateEffortUpdate(effort)
                                        }
                                        onModelChange={(selection: HappyAgentModelSelection) =>
                                            store.botCreateModelUpdate(selection)
                                        }
                                        onPermissionModeChange={(mode: HappyAgentPermissionMode) =>
                                            store.botCreatePermissionModeUpdate(mode)
                                        }
                                        onServiceTierChange={(tier?: HappyAgentServiceTier) =>
                                            store.botCreateServiceTierUpdate(tier)
                                        }
                                    />
                                ) : undefined
                            }
                            note="Sending also creates the bot"
                        />
                    }
                    composerPlaceholder="What should it work on?"
                    submitDisabled={props.unavailable !== undefined}
                    onComposerAttachmentRemove={(attachmentId) =>
                        store.botCreateAttachmentRemove(attachmentId)
                    }
                    onComposerAttachmentsSelect={(files) => store.botCreateAttachmentsAdd(files)}
                    onComposerFocusChange={(focused) => store.botCreateTaskFocusUpdate(focused)}
                    onComposerSend={() => {
                        if (props.happyAgentOnline()) store.botCreateTaskSend();
                    }}
                    onComposerValueChange={(value) => store.botCreateTaskUpdate(value)}
                />
            }
            emptyContent={
                <HappyAgentCreateBotPage
                    {...(botCreate.error === undefined ? {} : { error: botCreate.error })}
                    faceSlot={botCreate.faceSlot}
                    faces={botCreate.faces}
                    name={botCreate.name}
                    onCreditOpen={props.onExternalLinkOpen}
                    onFacePick={(slot) => store.botCreateFacePick(slot)}
                    onFacesRoll={() => store.botCreateFacesRoll()}
                    // The name is a controlled field, so its new value has to
                    // reach React inside the event that produced it; left in
                    // the frame queue, React restores the old value and takes
                    // the caret to the end of it.
                    onNameChange={(name) =>
                        reactFrameInputUpdate(store, () => store.botCreateNameUpdate(name))
                    }
                    onSubmit={() => {
                        if (props.happyAgentOnline())
                            void store.botCreateSubmit().catch(() => undefined);
                    }}
                    submitting={botCreate.submitting}
                    {...(props.unavailable === undefined
                        ? {}
                        : { submitDisabledReason: props.unavailable })}
                />
            }
            entries={NO_ENTRIES}
        />
    );
}

/**
 * Where a task is made, as a bot is: the conversation it is about to become,
 * with the name and Create in the body and the task's own composer under it.
 * Sending makes the task and says the first thing to it; Create makes it and
 * carries the words into the conversation as its draft. The composer is the
 * draft's own, for the reason the bot surface gives.
 */
function HappyAgentCreateTaskSurface(props: {
    happyAgentOnline: () => boolean;
    providerUsage?: HappyAgentProviderUsageStore;
    unavailable?: string;
    workspace: HappyAgentWorkspaceStore;
}) {
    const taskCreate = useSyncExternalStore(
        reactFrameSubscribe(props.workspace),
        props.workspace.get,
        props.workspace.get,
    ).taskCreate;
    const modelUsageWatch = useComposerModelUsageWatch(props.providerUsage);
    if (!taskCreate) return null;
    const store = props.workspace;
    const menus = taskCreate.menus;
    return (
        <ConversationView
            agentAuthor={agentAuthor}
            dock={
                <HappyAgentComposerDock
                    composer={taskCreate.composer}
                    composerFocusOnType
                    composerFocusKey={taskCreate.composer.get().scopeId}
                    composerControls={
                        menus ? (
                            <ComposerModelControl
                                {...happyAgentComposerModelControlProps(menus, {
                                    usageWatch: modelUsageWatch,
                                    onChiefOfStaffAsk: (request) =>
                                        store.chiefOfStaffDraftAppend(request),
                                    onEffortChange: (effort?: HappyAgentThinkingLevel) =>
                                        store.taskCreateEffortUpdate(effort),
                                    onModelChange: (selection: HappyAgentModelSelection) =>
                                        store.taskCreateModelUpdate(selection),
                                })}
                            />
                        ) : undefined
                    }
                    composerFooterControl={
                        <ComposerFooterBar
                            leading={
                                menus ? (
                                    <HappyAgentSessionControls
                                        fields={["permission", "tier"]}
                                        menuPlacement="above"
                                        variant="ghost"
                                        menus={menus}
                                        onEffortChange={(effort?: HappyAgentThinkingLevel) =>
                                            store.taskCreateEffortUpdate(effort)
                                        }
                                        onModelChange={(selection: HappyAgentModelSelection) =>
                                            store.taskCreateModelUpdate(selection)
                                        }
                                        onPermissionModeChange={(mode: HappyAgentPermissionMode) =>
                                            store.taskCreatePermissionModeUpdate(mode)
                                        }
                                        onServiceTierChange={(tier?: HappyAgentServiceTier) =>
                                            store.taskCreateServiceTierUpdate(tier)
                                        }
                                    />
                                ) : undefined
                            }
                            note="Sending also creates the task"
                        />
                    }
                    composerPlaceholder="What should it work on?"
                    submitDisabled={props.unavailable !== undefined}
                    onComposerAttachmentRemove={(attachmentId) =>
                        store.taskCreateAttachmentRemove(attachmentId)
                    }
                    onComposerAttachmentsSelect={(files) => store.taskCreateAttachmentsAdd(files)}
                    onComposerFocusChange={(focused) => store.taskCreateMessageFocusUpdate(focused)}
                    onComposerSend={() => {
                        if (props.happyAgentOnline()) store.taskCreateMessageSend();
                    }}
                    onComposerValueChange={(value) => store.taskCreateMessageUpdate(value)}
                />
            }
            emptyContent={
                <HappyAgentCreateTaskPage
                    {...(taskCreate.error === undefined ? {} : { error: taskCreate.error })}
                    name={taskCreate.name}
                    // Controlled, so the value reaches React inside its event,
                    // as the bot's name does.
                    onNameChange={(name) =>
                        reactFrameInputUpdate(store, () => store.taskCreateNameUpdate(name))
                    }
                    onSubmit={() => {
                        if (props.happyAgentOnline())
                            void store.taskCreateSubmit().catch(() => undefined);
                    }}
                    submitting={taskCreate.submitting}
                    {...(props.unavailable === undefined
                        ? {}
                        : { submitDisabledReason: props.unavailable })}
                />
            }
            entries={NO_ENTRIES}
        />
    );
}

/**
 * One file Changes lists: a checkout's Git change, or a file the conversation's
 * edits touched where the work has no checkout, which Git gave no status.
 */
type HappyAgentPanelChange = Pick<
    OpenGroup["changes"][number],
    "path" | "addedLines" | "deletedLines"
> & { readonly status?: OpenGroup["changes"][number]["status"] };

/**
 * One changed file as a listing entry. Under "All files" the changed ones keep
 * their status marks, so the work in progress stays findable inside the whole
 * tree rather than becoming indistinguishable from everything around it.
 */
function changeEntry(change: HappyAgentPanelChange): FileTreeBuildEntry {
    return {
        path: change.path,
        ...(change.status === undefined ? {} : { gitStatus: change.status }),
        ...(change.addedLines === undefined ? {} : { addedLines: change.addedLines }),
        ...(change.deletedLines === undefined ? {} : { deletedLines: change.deletedLines }),
    };
}

/** Projects only the directory pages the workspace store has materialized. */
function workspaceFileTreeNodes(
    files: HappyAgentWorkspaceFiles | undefined,
    directoryPath: string,
    expansion: FileTreeExpansion,
    changesByPath: ReadonlyMap<string, HappyAgentPanelChange>,
    depth = 0,
): FileTreeNode[] {
    const directory = files?.directories.get(directoryPath);
    if (directory === undefined) return [];
    const entries = [...directory.entries].sort((left, right) => {
        if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1;
        return fileNameCompare(left.name, right.name);
    });
    return entries.map((entry) => {
        const change = changesByPath.get(entry.path);
        const facts = {
            ...(change?.status === undefined ? {} : { gitStatus: change.status }),
            ...(change?.addedLines === undefined ? {} : { addedLines: change.addedLines }),
            ...(change?.deletedLines === undefined ? {} : { deletedLines: change.deletedLines }),
        };
        if (entry.kind === "file")
            return {
                id: entry.path,
                kind: "file" as const,
                name: entry.name,
                ...facts,
            };
        const expanded = fileTreeExpanded(expansion, entry.path, depth);
        const child = files?.directories.get(entry.path);
        return {
            id: entry.path,
            kind: "directory" as const,
            name: entry.name,
            expanded,
            ...(expanded
                ? {
                      children: workspaceFileTreeNodes(
                          files,
                          entry.path,
                          expansion,
                          changesByPath,
                          depth + 1,
                      ),
                      hasMore: child?.loading !== true && child?.nextCursor !== undefined,
                      loading: child === undefined || (child.loading && child.entries.length === 0),
                  }
                : {}),
        };
    });
}

const changeTiersEmpty: HappyAgentChangeTiersSnapshot = { tiers: [] };
const changeTiersNone = (): HappyAgentChangeTiersSnapshot => changeTiersEmpty;
const changeTiersNoSubscribe = (): (() => void) => () => undefined;

/**
 * The Changes listing with its tiers: the files no tier claims, laid out as the
 * reader chose, then a section for each tier that claimed any, laid out the same
 * way beneath its heading. `sections` names the tier behind each heading, so a
 * fold is reported against the tier rather than mistaken for a directory.
 */
function changeTierNodes(
    entries: readonly FileTreeBuildEntry[],
    tiers: readonly HappyAgentChangeTier[],
    layout: HappyAgentFileLayout,
    expansion: FileTreeExpansion,
): { nodes: FileTreeNode[]; sections: ReadonlyMap<string, HappyAgentChangeTierId> } {
    const arrange = (files: readonly FileTreeBuildEntry[]): FileTreeNode[] =>
        layout === "tree" ? fileTreeBuild(files, expansion) : fileTreeFlatten(files);
    const assignment = happyAgentChangeTiersAssign(entries, tiers);
    const sections = new Map<string, HappyAgentChangeTierId>();
    const tierNodes = assignment.tiers.map(({ tier, files }): FileTreeNode => {
        // NUL appears in no path, so a heading can never share an id with a
        // file or directory listed above it.
        const id = `\u0000tier\u0000${tier.id}`;
        sections.set(id, tier.id);
        return {
            id,
            kind: "section",
            name: tier.name.trim() === "" ? "Untitled tier" : tier.name.trim(),
            count: files.length,
            expanded: !tier.collapsed,
            ...(tier.collapsed ? {} : { children: arrange(files) }),
        };
    });
    return { nodes: [...arrange(assignment.primary), ...tierNodes], sections };
}

/** The Devices tab: one subscription to the open workspace's bridges. */
function HappyAgentDevicesSurface(props: { store: HappyAgentDeviceBridgesStore }) {
    const store = props.store;
    const devices = useSyncExternalStore(store.subscribe, store.get, store.get);
    return (
        <HappyAgentDevicesPanel
            devices={devices}
            onBridgeClose={(id) => store.bridgeClose(id)}
            onLocalToWorkspaceOpen={(workspacePort, localPort) =>
                store.localToWorkspaceOpen(workspacePort, localPort)
            }
            onUsbAttach={(busId) => store.usbAttach(busId)}
            onWorkspaceToLocalOpen={(localPort, workspacePort) =>
                store.workspaceToLocalOpen(localPort, workspacePort)
            }
        />
    );
}

function HappyAgentPanelBody(props: {
    activity?: HappyAgentConversationSnapshot;
    /**
     * What the open chat has published, offered only where the machine keeps
     * artifacts: the machine's artifact stores, the chat the list narrows to,
     * the places it names, and where an artifact opens.
     */
    artifacts?: {
        readonly artifacts: HappyAgentArtifacts;
        readonly context: HappyAgentArtifactChatContext | undefined;
        readonly places: HappyAgentArtifactPlaces;
        readonly onOpen: (artifactId: string) => void;
        /** Shows an HTML artifact opened here as a site of its own. */
        readonly page?: HtmlPreviewRenderer;
    };
    browserContent?: BrowserContentRenderer;
    browserConnectionId: string | null;
    htmlPreview?: HtmlPreviewRenderer;
    mediaWindow?: MediaWindowOpener;
    canStartBrowser: boolean;
    /** Turns a new tab into a new artifact, where this Happy Agent keeps them. */
    onArtifactNew?: (replacing: HappyAgentPanelTabId) => void;
    /**
     * The open workspace's local bridges, where the host can bridge to its
     * machine. Its Happy Agent says whether Devices is offered at all.
     */
    devices?: {
        readonly groupId: HappyAgentGroupId;
        readonly support: HappyAgentDeviceBridgeSupportStore;
        readonly bridges: HappyAgentDeviceBridgesStore;
    };
    changes: readonly HappyAgentPanelChange[];
    changesStatus?: OpenGroup["changesStatus"];
    /**
     * The tiers Changes lists secondary files under. Read here rather than by
     * the workspace surface, so editing a tier's patterns redraws the listing
     * it regroups and nothing around it. Absent while the host has no
     * workspace to remember them in, when every change is listed together.
     */
    changeTiers?: HappyAgentChangeTiersStore;
    closeShortcut?: KeyboardShortcut;
    expanded: ReadonlySet<string>;
    collapsed: ReadonlySet<string>;
    layout: HappyAgentFileLayout;
    /** Reference clock for elapsed subagent activity. */
    now: number;
    /** Selects Activity through the owning workspace. */
    onActivityOpen: () => void;
    /** Selects the session Usage tab through the owning workspace. */
    onUsageOpen: () => void;
    /** Stops one background process from the Activity tab. */
    onActivityProcessStop?: (processId: number) => void;
    /** Opens one delegated child session from the Activity tab. */
    onSubagentSelect?: (sessionId: string) => void;
    onFileOpen: (path: string) => void;
    onFilePreprocess: (path: string) => void;
    onFileSelect: (path: string) => void;
    onLayoutChange: (layout: HappyAgentFileLayout) => void;
    /** Opens every change in this checkout as one stream. */
    onReviewOpen: () => void;
    /** The file the viewer tab is on, read out of the transcript beside it. */
    panelFile?: HappyAgentFileTabSnapshot;
    /**
     * Draws one open file. It is the workspace's own file body, so the file
     * beside a conversation is the identical surface to the file in a
     * main-content tab — same header, same Rendered / Source, same editor,
     * same Command-S.
     */
    fileBody: (file: HappyAgentFileTabSnapshot) => ReactNode;
    onPanelFileClose: () => void;
    onScopeChange: (scope: HappyAgentFileScope) => void;
    onToggle: (path: string, expanded: boolean) => void;
    onDirectoryPrefetch: (path: string) => void;
    onLoadMore: (path: string) => void;
    /** Moves one view out of this panel and into the main content. */
    onViewTransfer: (viewId: string) => void;
    /** Closes one panel view through the same route used by Cmd-W. */
    onViewClose: (viewId: string) => void;
    panel: HappyAgentPanelSnapshot;
    /** Everything the conversation did to the file the change tab is showing. */
    changeDiff?: ConversationFileDiff;
    previewTool?: ConversationToolCall;
    /** The presented file the Preview tab shows instead of its call, when it names one. */
    previewMedia?: HappyAgentPreviewMedia;
    /** Reads a presented document for the preview's viewer. */
    toolMediaDocument?: HappyAgentToolMediaDocumentStore;
    /** Owning Happy Agent availability applied to every retained terminal tab. */
    happyAgentAvailability?: "reconnecting" | "unavailable";
    happyAgentAvailabilityReason?: string;
    scope: HappyAgentFileScope;
    /** What the reader is looking for in the listing, and what the checkout found. */
    search: HappyAgentFileSearch;
    onSearchQueryChange: (query: string) => void;
    selectedPath?: string;
    store: HappyAgentPanelStore;
    workspaceFiles?: HappyAgentWorkspaceFiles;
    workspaceFilesLoading: boolean;
}) {
    const all = props.scope === "all";
    const query = props.search.query;
    // Changes is whole in memory, so its query is answered right here by
    // dropping the rows that do not match. All Files cannot be: the tree holds
    // only the directories somebody opened, so filtering it would quietly
    // present a fraction of the checkout as the whole answer — the daemon ranks
    // that one and its results arrive through the snapshot.
    const entries: FileTreeBuildEntry[] = useMemo(() => {
        const built = props.changes.map(changeEntry);
        return query === "" ? built : built.filter((entry) => filePathMatches(entry.path, query));
    }, [props.changes, query]);
    const expansion: FileTreeExpansion = useMemo(
        () => ({
            opened: props.expanded,
            closed: props.collapsed,
            // All Files starts closed because every disclosure is a real daemon
            // read. Changes is already complete in memory, and what it holds is
            // the answer to "what did this touch" — so it stands open all the
            // way down and the reader sees every changed file without opening
            // a folder to find it.
            defaultDepth: all ? 0 : Number.POSITIVE_INFINITY,
        }),
        [all, props.expanded, props.collapsed],
    );
    const changesByPath = useMemo(
        () => new Map(props.changes.map((change) => [change.path, change])),
        [props.changes],
    );
    const changeTiersStore = props.changeTiers;
    const { tiers } = useSyncExternalStore(
        changeTiersStore?.subscribe ?? changeTiersNoSubscribe,
        changeTiersStore?.get ?? changeTiersNone,
        changeTiersStore?.get ?? changeTiersNone,
    );
    // The changed files split into the reader's tiers: the ones no tier claims
    // first, then one section per tier that claimed anything. A query narrows
    // the entries before they are split, so a section whose files all fail to
    // match leaves with them.
    const changeListing = useMemo(
        () => changeTierNodes(entries, tiers, props.layout, expansion),
        [entries, tiers, props.layout, expansion],
    );
    const searchResults = props.search.results;
    const nodes: FileTreeNode[] = useMemo(
        () =>
            all
                ? // A query replaces the tree with the checkout's ranked answer
                  // rather than filtering it: what matched may live in
                  // directories nobody has opened, which a tree cannot show
                  // without opening them. Until the first answer arrives the
                  // tree stays, so the panel does not blank out per keystroke.
                  query !== "" && searchResults !== undefined
                    ? fileTreeRanked(
                          searchResults.map((result) => {
                              // A match that is also a changed file keeps saying
                              // so: the status is a fact about the file, not
                              // about which listing found it.
                              const change = changesByPath.get(result.path);
                              return change ? changeEntry(change) : { path: result.path };
                          }),
                      )
                    : workspaceFileTreeNodes(props.workspaceFiles, "", expansion, changesByPath)
                : changeListing.nodes,
        [all, changeListing, changesByPath, expansion, props.workspaceFiles, query, searchResults],
    );
    const loading = all ? props.workspaceFilesLoading : props.changesStatus === "loading";
    const changesUnavailable = props.changesStatus === "unavailable";
    const changesStale = !all && props.changesStatus === "stale";
    const addedLines = props.changes.reduce((sum, change) => sum + (change.addedLines ?? 0), 0);
    const deletedLines = props.changes.reduce((sum, change) => sum + (change.deletedLines ?? 0), 0);
    const count = !all && (changesUnavailable || loading) ? undefined : entries.length;
    // Only the tabs this side is holding: one the reader moved into the main
    // content is drawn there, and the panel neither lists it nor renders it.
    const panelTools = toolTabsPlaced(props.panel, "panel");
    const activeToolTab = panelTools.find((tab) => tab.id === props.panel.activeViewId);
    const panelFile = props.panelFile;
    // The artifact a reference opened here, named by the same live title the
    // reference itself reads as.
    const titlesStore = props.artifacts?.artifacts.titles() ?? artifactTitlesStoreNoop;
    const titles = useSyncExternalStore(titlesStore.subscribe, titlesStore.get, titlesStore.get);
    const artifactView = props.panel.artifactView;
    const artifactTabLabel =
        artifactView === undefined
            ? "Artifact"
            : artifactTabLabelOf(titles, titlesStore, artifactView.artifactId);
    const activityTabShown =
        props.panel.activityViewOpen ||
        (props.activity?.activityAvailable === true && !props.panel.activityViewDismissed);
    const activityBackgroundProcesses = props.activity
        ? props.activity.backgroundProcesses.filter((process) =>
              props.activity?.detachedBackgroundProcessIds.has(process.id),
          )
        : [];
    const allFilesUnavailable =
        props.happyAgentAvailability !== undefined && props.workspaceFiles === undefined
            ? (props.happyAgentAvailabilityReason ??
              "Happy Agent must reconnect before loading all files.")
            : undefined;
    const baseTabs: TabItem[] = [
        ...(props.panel.filesViewOpen
            ? [{ closable: true, icon: "files" as const, id: "files", label: "Files" }]
            : []),
        ...(props.artifacts
            ? [{ closable: false, icon: "package" as const, id: "artifacts", label: "Artifacts" }]
            : []),
        ...(activityTabShown
            ? [{ closable: true, icon: "agents" as const, id: "activity", label: "Activity" }]
            : []),
        ...(props.panel.usageViewOpen
            ? [{ closable: true, icon: "clock" as const, id: "usage", label: "Usage" }]
            : []),
        ...(props.panel.devicesViewOpen && props.devices
            ? [{ closable: true, icon: "link" as const, id: "devices", label: "Devices" }]
            : []),
        ...(props.panel.fileViewOpen && panelFile
            ? [
                  {
                      ...fileTabItem(panelFile),
                      closable: true,
                      id: HAPPY_AGENT_PANEL_FILE_VIEW_ID,
                      // The viewer holds whatever the transcript last pointed
                      // at, so it is marked as the replaceable tab it is.
                      preview: true,
                  } satisfies TabItem,
              ]
            : []),
        ...(props.panel.artifactView && props.artifacts
            ? [
                  {
                      closable: true,
                      icon: "package" as const,
                      id: "artifact",
                      label: artifactTabLabel,
                      // Like the file viewer, it holds whatever the transcript
                      // last pointed at, so it is the replaceable tab it is.
                      preview: true,
                  } satisfies TabItem,
              ]
            : []),
        ...(props.panel.previewEntryId
            ? [
                  {
                      closable: true,
                      icon:
                          props.previewTool?.presentation?.type === "fileDiff" || props.previewMedia
                              ? ("doc" as const)
                              : props.previewTool?.presentation?.type === "execCommand" ||
                                  props.previewTool?.presentation?.type ===
                                      "backgroundTerminalInteraction"
                                ? ("terminal" as const)
                                : ("zap" as const),
                      id: "preview",
                      label: "Preview",
                      preview: true,
                  },
              ]
            : []),
        ...(props.panel.changeViewPath
            ? [
                  {
                      closable: true,
                      icon: "doc" as const,
                      id: "change",
                      label: props.panel.changeViewPath.slice(
                          props.panel.changeViewPath.lastIndexOf("/") + 1,
                      ),
                      preview: true,
                  } satisfies TabItem,
              ]
            : []),
        ...toolTabItems(panelTools),
    ];
    // The strip holds what can be opened, not the panel's listings.
    const tabs = baseTabs.filter(
        (tab) =>
            tab.id !== "artifacts" &&
            tab.id !== "activity" &&
            tab.id !== "usage" &&
            tab.id !== "devices",
    );
    return (
        <>
            {/* The whole panel accepts a tab dragged out of the main strip,
                rather than a target inside it: the reader is aiming at this
                side of the window, not at a stripe within it. */}
            <TransferZone
                icon="panel-expand"
                id={TRANSFER_ZONE_PANEL}
                label="Open in the side panel"
            >
                <TabbedPane
                    actions={
                        props.canStartBrowser ? (
                            <Button
                                aria-label="New tab"
                                icon="plus"
                                iconOnly
                                onClick={() => props.store.browserAdd()}
                                size="small"
                                variant="ghost"
                            />
                        ) : undefined
                    }
                    activeId={props.panel.activeViewId}
                    tabSizing="content"
                    closePresentation="overlay"
                    overflowFade
                    size="medium"
                    closeLabel="Close tab"
                    {...(props.closeShortcut ? { closeShortcut: props.closeShortcut } : {})}
                    onClose={props.onViewClose}
                    onSelect={(tabId) => {
                        if (tabId === "files") props.store.filesSelect();
                        else if (tabId === "artifacts") props.store.artifactsSelect();
                        else if (tabId === "activity") props.onActivityOpen();
                        else if (tabId === "usage") props.onUsageOpen();
                        else if (tabId === "devices") props.store.devicesSelect();
                        else if (tabId === "preview" && props.panel.previewEntryId)
                            props.store.previewOpen(props.panel.previewEntryId);
                        else if (tabId === "change" && props.panel.changeViewPath)
                            props.store.changeViewOpen(props.panel.changeViewPath);
                        else if (tabId === HAPPY_AGENT_PANEL_FILE_VIEW_ID)
                            props.store.fileViewOpen();
                        else if (tabId === "artifact" && props.panel.artifactView)
                            props.store.artifactViewOpen(
                                props.panel.artifactView.artifactId,
                                props.panel.artifactView.version,
                            );
                        else props.store.tabSelect(tabId as HappyAgentPanelTabId);
                    }}
                    onTransfer={(tabId) => props.onViewTransfer(tabId)}
                    tabs={tabs}
                    // The listing opens content rather than being content, and a
                    // tool-call preview is bound to an entry of the conversation
                    // the main content is showing; neither has a form over there.
                    // A file read through a link into another workspace is a
                    // preview beside this conversation, not one of this
                    // checkout's tabs. An open artifact becomes a main-content
                    // tab of its own.
                    transferable={(tab) =>
                        tab.id !== "files" &&
                        tab.id !== "artifacts" &&
                        tab.id !== "activity" &&
                        tab.id !== "usage" &&
                        tab.id !== "devices" &&
                        tab.id !== "preview" &&
                        tab.id !== "change" &&
                        !(tab.id === HAPPY_AGENT_PANEL_FILE_VIEW_ID && panelFile?.linked) &&
                        // Another chat and another checkout's changes are read
                        // beside this conversation, not opened in its place.
                        !panelTools.some((tool) => tool.id === tab.id && tool.kind === "chat")
                    }
                    transferTargets={PANEL_TRANSFER_TARGETS}
                >
                    <HappyAgentToolBodies
                        activeId={props.panel.activeViewId}
                        browserStart={(tabId) => ({
                            tools: [
                                ...(props.canStartBrowser &&
                                props.panel.terminalRefusal === undefined
                                    ? [
                                          {
                                              id: "terminal",
                                              icon: "terminal",
                                              label: "Terminal",
                                              onSelect: () => props.store.terminalAdd(tabId),
                                          } satisfies BrowserStartTool,
                                      ]
                                    : []),
                                ...(props.onArtifactNew
                                    ? [
                                          {
                                              id: "artifact",
                                              icon: "package",
                                              label: "New artifact",
                                              onSelect: () => props.onArtifactNew?.(tabId),
                                          } satisfies BrowserStartTool,
                                      ]
                                    : []),
                            ],
                            recent: props.panel.browserRecent,
                        })}
                        browserConnectionId={props.browserConnectionId}
                        {...(props.browserContent ? { browserContent: props.browserContent } : {})}
                        store={props.store}
                        tabs={panelTools}
                        {...(props.happyAgentAvailability === undefined
                            ? {}
                            : {
                                  happyAgentAvailability: props.happyAgentAvailability,
                                  ...(props.happyAgentAvailabilityReason === undefined
                                      ? {}
                                      : {
                                            happyAgentAvailabilityReason:
                                                props.happyAgentAvailabilityReason,
                                        }),
                              })}
                    />
                    {props.panel.activeViewId === "files" ? (
                        <FileBrowser
                            // Only Changes has a complete total and line delta;
                            // All Files stays visually focused on its lazy tree.
                            {...(all || changesUnavailable || loading
                                ? {}
                                : { addedLines, deletedLines })}
                            count={count}
                            emptyLabel={
                                query !== ""
                                    ? `Nothing matches “${query}”.`
                                    : all
                                      ? // A root that failed to read is not an
                                        // empty folder; it is retried on the
                                        // next change in the checkout.
                                        props.workspaceFiles?.directories.get("")?.error
                                          ? "Files could not be loaded."
                                          : "No files."
                                      : changesUnavailable
                                        ? "Git changes are temporarily unavailable."
                                        : "No changed files."
                            }
                            onSearchQueryChange={props.onSearchQueryChange}
                            searchQuery={query}
                            searching={props.search.searching}
                            layout={props.layout}
                            loading={loading}
                            nodes={nodes}
                            {...(changesStale
                                ? {
                                      note: "Showing the last successful Git scan. Retrying automatically…",
                                  }
                                : {})}
                            {...(props.happyAgentAvailability !== undefined && all
                                ? {
                                      fileActionsUnavailable:
                                          props.happyAgentAvailabilityReason ??
                                          "Happy Agent must reconnect before opening files.",
                                  }
                                : {})}
                            onLayoutChange={(layout: HappyAgentFileLayout) =>
                                props.onLayoutChange(layout)
                            }
                            onReviewOpen={props.onReviewOpen}
                            onDirectoryPrefetch={props.onDirectoryPrefetch}
                            onFilePrefetch={props.onFilePreprocess}
                            onLoadMore={props.onLoadMore}
                            {...(props.happyAgentAvailability === undefined
                                ? { onOpen: props.onFileOpen }
                                : {})}
                            onScopeChange={(scope: HappyAgentFileScope) =>
                                props.onScopeChange(scope)
                            }
                            {...(allFilesUnavailable === undefined
                                ? {}
                                : {
                                      scopeUnavailable: {
                                          all: allFilesUnavailable,
                                      },
                                  })}
                            onSelect={(path: string) => props.onFileSelect(path)}
                            onToggle={(id, expanded) => {
                                // A tier's heading folds the tier, which is
                                // remembered with the tier rather than with the
                                // directories of this checkout.
                                const tierId = all ? undefined : changeListing.sections.get(id);
                                if (tierId !== undefined && changeTiersStore !== undefined)
                                    changeTiersStore.tierCollapsedUpdate(tierId, !expanded);
                                else props.onToggle(id, expanded);
                            }}
                            scope={props.scope}
                            selectedId={props.selectedPath}
                        />
                    ) : props.panel.activeViewId === "artifacts" ? (
                        props.artifacts ? (
                            <HappyAgentArtifactsPanelSurface
                                artifacts={props.artifacts.artifacts}
                                {...(props.artifacts.context === undefined
                                    ? {}
                                    : { context: props.artifacts.context })}
                                onArtifactOpen={props.artifacts.onOpen}
                                places={props.artifacts.places}
                            />
                        ) : (
                            <EmptyState
                                description="This Happy Agent does not keep artifacts."
                                icon="package"
                                size="panel"
                                title="No artifacts"
                            />
                        )
                    ) : props.panel.activeViewId === "artifact" ? (
                        props.artifacts && props.panel.artifactView ? (
                            <HappyAgentArtifactPanelViewerSurface
                                artifacts={props.artifacts.artifacts}
                                {...(props.artifacts.page
                                    ? { artifactPage: props.artifacts.page }
                                    : {})}
                                places={props.artifacts.places}
                                view={props.panel.artifactView}
                            />
                        ) : (
                            <EmptyState
                                description="The artifact this conversation pointed at is no longer open."
                                icon="package"
                                size="panel"
                                title="No artifact open"
                            />
                        )
                    ) : props.panel.activeViewId === "activity" ? (
                        props.activity ? (
                            <HappyAgentActivityPanel
                                backgroundProcesses={activityBackgroundProcesses}
                                goal={props.activity.goal}
                                now={props.now}
                                onBackgroundProcessStop={props.onActivityProcessStop}
                                onSubagentSelect={props.onSubagentSelect}
                                placement="panel"
                                subagents={props.activity.subagents}
                                tasks={props.activity.tasks}
                            />
                        ) : (
                            <EmptyState
                                description="Open a session to see its goal, tasks, subagents, and background terminals."
                                icon="agents"
                                size="panel"
                                title="No session activity"
                            />
                        )
                    ) : props.panel.activeViewId === "usage" ? (
                        props.activity ? (
                            <HappyAgentUsagePanel
                                error={props.activity.usageError}
                                loading={props.activity.usageLoading}
                                placement="panel"
                                usage={props.activity.usage}
                            />
                        ) : (
                            <EmptyState
                                description="Open a session to see its token, cost, context, and quota usage."
                                icon="clock"
                                size="panel"
                                title="No session usage"
                            />
                        )
                    ) : props.panel.activeViewId === "devices" ? (
                        props.devices ? (
                            <HappyAgentDevicesSurface
                                // Another workspace is another store: what was
                                // typed for one does not carry to the next.
                                key={props.devices.groupId}
                                store={props.devices.bridges}
                            />
                        ) : (
                            <EmptyState
                                description="Devices and ports reach a workspace on another machine."
                                icon="link"
                                size="panel"
                                title="No devices here"
                            />
                        )
                    ) : props.panel.activeViewId === "preview" ? (
                        props.previewMedia && props.toolMediaDocument ? (
                            <HappyAgentToolMediaPreview
                                documents={props.toolMediaDocument}
                                media={props.previewMedia}
                                onClose={() => props.store.previewClose()}
                            />
                        ) : props.previewTool ? (
                            <ToolCallPreview tool={props.previewTool} />
                        ) : (
                            <EmptyState
                                description="The selected call is no longer in this conversation view."
                                icon="zap"
                                size="panel"
                                title="Preview unavailable"
                            />
                        )
                    ) : props.panel.activeViewId === "change" ? (
                        props.changeDiff ? (
                            <FileChangeDiff file={props.changeDiff} />
                        ) : (
                            <EmptyState
                                description="This conversation no longer shows that file's edits."
                                icon="doc"
                                size="panel"
                                title="No changes"
                            />
                        )
                    ) : props.panel.activeViewId === HAPPY_AGENT_PANEL_FILE_VIEW_ID ? (
                        panelFile ? (
                            props.fileBody(panelFile)
                        ) : (
                            <EmptyState
                                description="The file this conversation pointed at is no longer open."
                                icon="doc"
                                size="panel"
                                title="No file open"
                            />
                        )
                    ) : activeToolTab ? null : ( // Already drawn above, for every kind of tool.
                        <EmptyState
                            description="Select Files, Activity, Usage, a preview, or a live tool tab."
                            icon="files"
                            size="panel"
                            title="Nothing selected"
                        />
                    )}
                </TabbedPane>
            </TransferZone>
        </>
    );
}

/**
 * Whether a file is one the shell's separate window has a viewer for. Pictures
 * and recordings are; a document, a listing, or an archive is not, and offering
 * to open one in a window that could only say so again would be a control that
 * does nothing.
 */
function mediaWindowShowable(kind: FilePreviewKind): boolean {
    return kind === "image" || kind === "video";
}

/**
 * One terminal tab. It reads the terminal's own store, which is the only thing in
 * this surface that changes on every frame of output, and hands it to the shared
 * `TerminalPanel` with no height of its own so it fills the panel column. The tab
 * names it and closes it, so the panel draws no chrome of its own above the grid.
 */
/**
 * The bodies of the live tool tabs on one side of the workspace, written once
 * and rendered by whichever side is currently holding them: moving a tab across
 * the window changes which strip draws it and nothing about what it is.
 *
 * Browser pages are all mounted together and only one is shown, because a page that
 * stopped being looked at is still loaded and unmounting it would throw the
 * session away; a terminal is drawn only while it is on screen, and its process
 * outlives its view because the store, not this component, is what holds it.
 *
 * Moving a terminal across the window therefore costs it nothing: the view is
 * rebuilt on the other side and attaches to the same running shell. A page
 * cannot be given that promise. An iframe reloads whenever it is moved to a
 * different parent — that is the browser's rule, not this component's, and no
 * arrangement of React can move a node without moving it. So a page that
 * changes sides loads again, from the address the store kept for it, which is
 * why the address lives in the store and not in the frame.
 */
/** Another conversation read in a panel tab: its transcript, without a composer. */
function HappyAgentPanelChatSurface(props: {
    readonly store: HappyAgentPanelStore;
    readonly tabId: HappyAgentPanelTabId;
}) {
    const chat = props.store.chat(props.tabId) ?? happyAgentPanelChatNone;
    const snapshot = useSyncExternalStore(chat.subscribe, chat.get, chat.get);
    if (snapshot.type === "error")
        return (
            <EmptyState
                description={snapshot.message}
                icon="alert"
                size="panel"
                title="This chat could not be opened"
            />
        );
    const chatSnapshot = snapshot.type === "ready" ? snapshot.chat : undefined;
    return (
        <ConversationView
            {...(chatSnapshot ? { conversationId: chatSnapshot.sessionId } : {})}
            entries={chatSnapshot?.entries ?? []}
            {...(chatSnapshot ? { expandedTurnIds: chatSnapshot.expandedTurnIds } : {})}
            {...(chatSnapshot ? { expandedMessageIds: chatSnapshot.expandedMessageIds } : {})}
            onMessageExpandedChange={chat.messageExpandedSet}
            loading={chatSnapshot === undefined}
            onTraceToggle={chat.turnTraceToggle}
            onTracesSeen={chat.turnTracesSeen}
            running={chatSnapshot?.runStatus === "running"}
        />
    );
}

/** What a chat tab reads when its store is already gone: nothing, loading. */
const happyAgentPanelChatNone: HappyAgentPanelChatStore = {
    get: () => ({ type: "loading" }),
    subscribe: () => () => undefined,
    turnTraceToggle: () => undefined,
    messageExpandedSet: () => undefined,
    turnTracesSeen: () => undefined,
};

function HappyAgentToolBodies(props: {
    tabs: readonly HappyAgentPanelTabSnapshot[];
    activeId: string | undefined;
    store: HappyAgentPanelStore;
    /** Where an artifact tab is read from; only the main content holds one. */
    artifacts?: {
        readonly artifacts: HappyAgentArtifacts;
        readonly places: HappyAgentArtifactPlaces;
        readonly page?: HtmlPreviewRenderer;
    };
    browserContent?: BrowserContentRenderer;
    browserConnectionId: string | null;
    /** What a page that has not been anywhere offers instead of itself. */
    browserStart?: (tabId: HappyAgentPanelTabId) => BrowserPanelProps["start"];
    /** Owning Happy Agent availability applied to retained terminal tabs. */
    happyAgentAvailability?: "reconnecting" | "unavailable";
    happyAgentAvailabilityReason?: string;
}) {
    const active = props.tabs.find((tab) => tab.id === props.activeId);
    return (
        <>
            {props.tabs
                .filter((tab) => tab.kind === "browser")
                .map((tab) => (
                    <BrowserPanel
                        active={props.activeId === tab.id}
                        initialUrl={tab.url}
                        key={tab.id}
                        onLocationChange={(url) => props.store.browserUpdate(tab.id, { url })}
                        onTitleChange={(title) => props.store.browserUpdate(tab.id, { title })}
                        {...(props.browserStart ? { start: props.browserStart(tab.id) } : {})}
                        {...(props.happyAgentAvailability === undefined
                            ? {}
                            : {
                                  unavailable:
                                      props.happyAgentAvailabilityReason ??
                                      "This Happy Agent is reconnecting. Browser navigation is paused.",
                              })}
                        renderContent={
                            props.browserContent
                                ? (browserProps) =>
                                      props.browserContent!({
                                          ...browserProps,
                                          target: {
                                              connectionId: props.browserConnectionId,
                                              workspaceId: tab.workspaceId,
                                              agentId: tab.agentId,
                                              ...(tab.networkId === undefined
                                                  ? {}
                                                  : { networkId: tab.networkId }),
                                          },
                                          browserNetworkResolved: (networkId) =>
                                              props.store.browserNetworkBind(
                                                  tab.id,
                                                  networkId as HappyAgentBrowserNetworkId,
                                              ),
                                          // A page's popup opens beside it, on
                                          // its own agent and network.
                                          browserPopupRequested: (url) => {
                                              if (tab.networkId === undefined) return;
                                              props.store.browserPopupAdd(
                                                  url,
                                                  tab.workspaceId,
                                                  tab.agentId,
                                                  tab.networkId,
                                              );
                                          },
                                      })
                                : undefined
                        }
                    />
                ))}
            {active?.kind === "artifact" ? (
                props.artifacts ? (
                    <HappyAgentArtifactTabSurface
                        artifacts={props.artifacts.artifacts}
                        {...(props.artifacts.page ? { artifactPage: props.artifacts.page } : {})}
                        key={active.id}
                        places={props.artifacts.places}
                        tab={active}
                    />
                ) : (
                    <EmptyState
                        description="This Happy Agent does not keep artifacts."
                        icon="package"
                        size="panel"
                        title="No artifacts"
                    />
                )
            ) : null}
            {active?.kind === "chat" ? (
                <HappyAgentPanelChatSurface key={active.id} store={props.store} tabId={active.id} />
            ) : null}
            {active?.kind === "terminal" ? (
                <HappyAgentTerminalTab
                    key={active.id}
                    store={props.store}
                    tabId={active.id}
                    {...(props.happyAgentAvailability === undefined
                        ? {}
                        : {
                              happyAgentAvailability: props.happyAgentAvailability,
                              ...(props.happyAgentAvailabilityReason === undefined
                                  ? {}
                                  : {
                                        happyAgentAvailabilityReason:
                                            props.happyAgentAvailabilityReason,
                                    }),
                          })}
                />
            ) : null}
        </>
    );
}

function HappyAgentTerminalTab(props: {
    store: HappyAgentPanelStore;
    tabId: HappyAgentPanelTabId;
    happyAgentAvailability?: "reconnecting" | "unavailable";
    happyAgentAvailabilityReason?: string;
}) {
    const terminal: HappyAgentTerminalStore | undefined = props.store.terminal(props.tabId);
    if (!terminal)
        return (
            <EmptyState
                description="This terminal is no longer available."
                icon="terminal"
                size="panel"
                title="Terminal closed"
            />
        );
    return (
        <HappyAgentTerminalScreen
            terminal={terminal}
            {...(props.happyAgentAvailability === undefined
                ? {}
                : {
                      happyAgentAvailability: props.happyAgentAvailability,
                      ...(props.happyAgentAvailabilityReason === undefined
                          ? {}
                          : { happyAgentAvailabilityReason: props.happyAgentAvailabilityReason }),
                  })}
        />
    );
}

/** The subscribed half of a terminal tab, split out so the store is non-optional. */
function HappyAgentTerminalScreen(props: {
    terminal: HappyAgentTerminalStore;
    happyAgentAvailability?: "reconnecting" | "unavailable";
    happyAgentAvailabilityReason?: string;
}) {
    const { terminal } = props;
    const snapshot = useSyncExternalStore(terminal.subscribe, terminal.get, terminal.get);
    return (
        <TerminalPanel
            colorScheme={snapshot.colorScheme}
            exitCode={snapshot.exitCode}
            {...(snapshot.grid ? { grid: snapshot.grid } : {})}
            {...(snapshot.error ? { error: snapshot.error.message } : {})}
            onInput={(data) => terminal.terminalWrite(data)}
            onOpenLink={openExternalLink}
            onReconnect={() => terminal.terminalReconnect()}
            onResize={(cols, rows) => terminal.terminalResize(cols, rows)}
            {...(props.happyAgentAvailability === undefined
                ? {}
                : {
                      happyAgentAvailability: props.happyAgentAvailability,
                      ...(props.happyAgentAvailabilityReason === undefined
                          ? {}
                          : { happyAgentAvailabilityReason: props.happyAgentAvailabilityReason }),
                  })}
            status={snapshot.status}
        />
    );
}
