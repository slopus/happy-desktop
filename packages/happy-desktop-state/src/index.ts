export * from "./types.js";
export * from "./transport.js";
export { HappyAgentApiError, HappyAgentClient } from "@slopus/happy-agent-client";
export type { ApiErrorBody, HappyAgentClientOptions } from "@slopus/happy-agent-client";
export * as happyAgentProtocol from "@slopus/happy-agent-client";
export * from "./happyAgentConnection/index.js";
export { type DeepReadonly } from "./deepReadonly.js";
export * from "./conversation/conversationAuthor.js";
export * from "./conversation/conversationEntries.js";
export * from "./conversation/conversationEntry.js";
export * from "./conversation/conversationSummary.js";
export * from "./conversation/inlineImageSize.js";
export * from "./conversation/loadable.js";
export * from "./appearance/appearanceStore.js";
export * from "./keepAwake/keepAwakeStore.js";
export * from "./commandPalette/commandPaletteStore.js";
export * from "./experiments/experimentsStore.js";
export * from "./projectsVisibility/projectsVisibilityStore.js";
export * from "./statusBar/statusBarStore.js";
export * from "./usageAnalytics/usageAnalyticsStore.js";
export * from "./gptLive/gptLiveStore.js";
export * from "./gptLive/gptLiveRuntime.js";
export * from "./gptLive/gptLiveRuntimeCreate.js";
export * from "./gptLive/gptLiveDesktopSource.js";
export * from "./gptLive/gptLiveAppState.js";
export * from "./titleShimmer/titleShimmerStore.js";
export * from "./modules/composer/composerState.js";
export * from "./modules/terminal/terminalState.js";
export * from "./onboarding/welcomeStore.js";
export * from "./onboarding/happyMobileOnboardingStore.js";
export * from "./happyAgent/happyAgentChatStore.js";
export * from "./happyAgent/happyAgentClient.js";
export * from "./happyAgent/happyAgentClock.js";
export * from "./happyAgent/happyAgentConnection.js";
export * from "./happyAgent/happyAgentConnectionsStore.js";
export * from "./happyAgent/happyAgentNodeStore.js";
export * from "./happyAgent/happyAgentOnboardingStore.js";
export * from "./happyAgent/happyAgentDebugLogStore.js";
export * from "./happyAgent/happyAgentDeviceBridgeHost.js";
export * from "./happyAgent/happyAgentDeviceBridgesStore.js";
export * from "./happyAgent/happyAgentDeviceBridgeSupportStore.js";
export * from "./happyAgent/happyAgentConversationAuthors.js";
export * from "./happyAgent/happyAgentConversationProject.js";
export * from "./happyAgent/happyAgentStreamingMarkdown.js";
export * from "./happyAgent/happyAgentGroupAccess.js";
export * from "./happyAgent/happyAgentHost.js";
export * from "./happyAgent/happyAgentIntegrationStore.js";
export * from "./happyAgent/happyAgentMobileConnectorStore.js";
export * from "./happyAgent/happyAgentCloudStore.js";
export * from "./happyAgent/happyAgentTeamsStore.js";
export * from "./happyAgent/happyAgentInboxStore.js";
export * from "./artifacts/artifactTypes.js";
export { happyAgentArtifactBackground } from "./artifacts/artifactProject.js";
export {
    happyAgentArtifactFilterMatches,
    happyAgentArtifactSourceId,
} from "./artifacts/artifactCatalog.js";
export * from "./artifacts/artifactLabels.js";
export * from "./artifacts/artifactReference.js";
export {
    happyAgentArtifactCatalogStoreNoop,
    type HappyAgentArtifactCatalogSnapshot,
    type HappyAgentArtifactCatalogStore,
    type HappyAgentArtifactChatContext,
    type HappyAgentArtifactNarrowing,
    type HappyAgentArtifactScope,
} from "./artifacts/artifactCatalogStore.js";
export * from "./artifacts/artifactChatContext.js";
export type {
    HappyAgentArtifactContent,
    HappyAgentArtifactPage,
    HappyAgentArtifactStaticReason,
    HappyAgentArtifactDeletion,
    HappyAgentArtifactFileLink,
    HappyAgentArtifactViewerArtifact,
    HappyAgentArtifactViewerSnapshot,
    HappyAgentArtifactViewerStore,
} from "./artifacts/artifactViewerStore.js";
export type { HappyAgentArtifactPeopleStore } from "./artifacts/artifactPeopleStore.js";
export type {
    HappyAgentToolMediaDocumentContent,
    HappyAgentToolMediaDocumentRef,
    HappyAgentToolMediaDocumentSnapshot,
    HappyAgentToolMediaDocumentStore,
} from "./happyAgent/happyAgentToolMediaDocumentStore.js";
export type { HappyAgentArtifacts } from "./artifacts/artifacts.js";
export type {
    HappyAgentInlineArtifact,
    HappyAgentInlineArtifactSite,
    HappyAgentInlineArtifactsSnapshot,
    HappyAgentInlineArtifactsStore,
} from "./artifacts/artifactInlineStore.js";
export * from "./surfaces/surfaceTypes.js";
export {
    happyAgentSurfaceCatalogStoreNoop,
    happyAgentSurfaceReferenceFind,
    type HappyAgentSurfaceReference,
    type HappyAgentSurfaceCatalogSnapshot,
    type HappyAgentSurfaceCatalogStore,
    type HappyAgentSurfaceChatOpening,
    type HappyAgentSurfaceCreateInput,
    type HappyAgentSurfaceCreateKind,
    type HappyAgentSurfaceCreateRefusal,
    type HappyAgentSurfaceCreateState,
    type HappyAgentSurfaceMembershipAction,
} from "./surfaces/surfaceCatalogStore.js";
export {
    HAPPY_AGENT_TODO_TEXT_LIMIT,
    type HappyAgentTodoEditing,
    type HappyAgentTodoListSnapshot,
    type HappyAgentTodoListStore,
} from "./surfaces/surfaceTodoListStore.js";
export type {
    HappyAgentSurfaceDocumentPresence,
    HappyAgentSurfaceDocumentPresencePayload,
    HappyAgentSurfaceDocumentSnapshot,
    HappyAgentSurfaceDocumentStore,
    HappyAgentSurfaceDocumentSync,
} from "./surfaces/surfaceDocumentStore.js";
export {
    HAPPY_AGENT_SURFACE_MESSAGE_TEXT_LIMIT,
    type HappyAgentSurfaceMessageEditing,
    type HappyAgentSurfaceMessagesOlder,
    type HappyAgentSurfaceMessagesSnapshot,
    type HappyAgentSurfaceMessagesStore,
    type HappyAgentSurfaceOutgoingMessage,
} from "./surfaces/surfaceMessagesStore.js";
export {
    happyAgentSurfaceSupportStoreNone,
    type HappyAgentSurfaceSupport,
    type HappyAgentSurfaceSupportSnapshot,
    type HappyAgentSurfaceSupportStore,
} from "./surfaces/surfaceSupportStore.js";
export {
    happyAgentCalendarRangeOf,
    HAPPY_AGENT_CALENDAR_COUNT_LIMIT,
    HAPPY_AGENT_CALENDAR_INTERVAL_LIMIT,
    HAPPY_AGENT_CALENDAR_LOCATION_LIMIT,
    HAPPY_AGENT_CALENDAR_NOTES_LIMIT,
    HAPPY_AGENT_CALENDAR_TITLE_LIMIT,
    type HappyAgentCalendarDraft,
    type HappyAgentCalendarEditor,
    type HappyAgentCalendarEditorTarget,
    type HappyAgentCalendarRange,
    type HappyAgentCalendarSnapshot,
    type HappyAgentCalendarStore,
    type HappyAgentCalendarView,
} from "./surfaces/surfaceCalendarStore.js";
export * from "./surfaces/calendarTime.js";
export type { HappyAgentSystemMonitorStore } from "./surfaces/surfaceSystemMonitorStore.js";
export {
    HAPPY_AGENT_SYSTEM_MONITOR_PROCESS_SORT,
    happyAgentSystemMonitorProcessesFilter,
    happyAgentSystemMonitorProcessesSort,
} from "./surfaces/surfaceSystemMonitorProcesses.js";
export type {
    HappyAgentSystemMonitorProcess,
    HappyAgentSystemMonitorProcessState,
    HappyAgentSystemMonitorProcessColumn,
    HappyAgentSystemMonitorProcessRow,
    HappyAgentSystemMonitorProcessSort,
} from "./surfaces/surfaceSystemMonitorTypes.js";
export type {
    HappyAgentSystemMonitorSample,
    HappyAgentSystemMonitorSnapshot,
} from "./surfaces/surfaceSystemMonitorTypes.js";
export type { HappyAgentSurfaces } from "./surfaces/surfaces.js";
export type {
    HappyAgentArtifactTitle,
    HappyAgentArtifactTitlesSnapshot,
    HappyAgentArtifactTitlesStore,
} from "./artifacts/artifactTitlesStore.js";
// The Happy reference grammar is the daemon client's; the app reads it from here.
export {
    HAPPY_REFERENCE_KINDS,
    formatHappyReferenceTag,
    happyReferencePartialTagLength,
    happyReferencePlaceholder,
    isKnownHappyReferenceKind,
    parseHappyReferenceTag,
    parseHappyReferences,
    replaceHappyReferences,
    type HappyReference,
    type HappyReferenceKind,
    type HappyReferenceSegment,
} from "@slopus/happy-agent-client";
export {
    HAPPY_AGENT_FILE_LINK_READ_ONLY_REFUSAL,
    happyAgentFileLinkParse,
    type HappyAgentFileLink,
    type HappyAgentFileLinkTarget,
} from "./happyAgent/happyAgentFileLink.js";
export * from "./happyAgent/happyAgentInstructionsStore.js";
export * from "./happyAgent/happyAgentMenusStore.js";
export * from "./happyAgent/happyAgentModelStore.js";
export * from "./happyAgent/happyAgentNavigationOrderStore.js";
export * from "./happyAgent/happyAgentChangeTiers.js";
export * from "./happyAgent/happyAgentChangeTiersStore.js";
export * from "./happyAgent/happyAgentPanelStore.js";
export * from "./happyAgent/happyAgentProjectGroupProject.js";
export * from "./happyAgent/happyAgentProjectRegistration.js";
export * from "./happyAgent/happyAgentProfilePhoto.js";
export * from "./happyAgent/happyAgentProfileStore.js";
export * from "./happyAgent/happyAgentProviderUsageStore.js";
export * from "./happyAgent/happyAgentProvidersStore.js";
export * from "./happyAgent/happyAgentVoiceSettingsStore.js";
export * from "./happyAgent/happyAgentSecurityPolicyStore.js";
export * from "./happyAgent/happyAgentSecretsStore.js";
export * from "./happyAgent/happyAgentSessionListStore.js";
export * from "./happyAgent/happyAgentSettingsStore.js";
export * from "./happyAgent/happyAgentModelPreferences.js";
export type {
    HappyAgentUserSettingsDocument,
    HappyAgentUserSettingsPersistence,
    HappyAgentUserSettingsSource,
} from "./happyAgent/happyAgentUserSettings.js";
export * from "./happyAgent/happyAgentSidebarCollapseStore.js";
export * from "./happyAgent/happyAgentSidebarSearchStore.js";
export * from "./happyAgent/happyAgentAttentionStore.js";
export * from "./happyAgent/happyAgentSidebarTree.js";
export * from "./happyAgent/happyAgentSidebarVisibilityStore.js";
export * from "./happyAgent/happyAgentChiefOfStaffRequest.js";
export * from "./happyAgent/happyAgentSupport.js";
export * from "./happyAgent/happyAgentActivity.js";
export * from "./happyAgent/happyAgentTerminalStore.js";
export * from "./happyAgent/happyAgentHostServices.js";
export * from "./happyAgent/happyAgentTypes.js";
export { happyAgentBotSubtasks, happyAgentTaskDepths } from "./happyAgent/happyAgentBotSubtasks.js";
export type { HappyAgentSubtaskRoot } from "./happyAgent/happyAgentBotSubtasks.js";
export {
    HAPPY_AGENT_TASKS_VERSION,
    HAPPY_AGENT_TASK_CREATE_VERSION,
    happyAgentTasksBrowsable,
    happyAgentTasksJoined,
} from "./happyAgent/happyAgentTasks.js";
export * from "./happyAgent/happyAgentWindowStore.js";
export * from "./happyAgent/happyAgentWorkspaceMemory.js";
export * from "./happyAgent/happyAgentWorkspaceStore.js";
export * from "./happyAgent/happyAgentViewPreferences.js";
export type {
    HappyTerminalCliSnapshot,
    HappyTerminalCliResetPreview,
    HappyTerminalCliInspection,
    HappyTerminalCliResetRequest,
    HappyTerminalCliResetOutcome,
    HappyTerminalCliResetErrorCode,
    HappyTerminalCliResetEffects,
    HappyMobileManagementConfirmation,
} from "./happyAgent/happyTerminalCli.js";
