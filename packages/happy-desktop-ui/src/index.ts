import "./styles.css";
export { DitherChart, type DitherChartProps } from "./dither/DitherChart";
export { DitherSparkline } from "./dither/DitherSparkline";
export type { DitherSeries, DitherPoint, DitherColor } from "./dither/ditherTypes";
export {
    HappyAgentSystemMonitorProcessesPanel,
    type HappyAgentSystemMonitorProcessesPanelProps,
} from "./pages/surfaces/HappyAgentSystemMonitorProcessesPanel";

export { happyLogoBlackUrl, happyLogoWhiteUrl } from "./assets";
export {
    ChangedFileDiff,
    type ChangedFileDiffComment,
    type ChangedFileDiffCommentDraft,
    type ChangedFileDiffCommentSide,
    type ChangedFileDiffProps,
} from "./ChangedFileDiff";
export {
    ReviewComment,
    reviewCommentPlace,
    type ReviewCommentProps,
    type ReviewCommentSide,
} from "./ReviewComment";
export {
    ReviewStream,
    type ReviewStreamComment,
    type ReviewStreamCommentDraft,
    type ReviewStreamFile,
    type ReviewStreamProps,
    type ReviewStreamSingleFile,
} from "./ReviewStream";
export { GptLiveSettings, type GptLiveSettingsProps } from "./GptLiveSettings";
export { GptLiveVoiceSettings, type GptLiveVoiceSettingsProps } from "./GptLiveVoiceSettings";
export { GptLivePhone, type GptLivePhoneProps } from "./GptLivePhone";
export { CompactActivityRow, type CompactActivityRowProps } from "./CompactActivityRow";
export { compactCount } from "./countText";
export { CodeBlock, codeBlockLanguage, type CodeBlockProps } from "./CodeBlock";
export { CodeEditor, type CodeEditorProps, type CodeEditorReveal } from "./CodeEditor";
export {
    ScrollArea,
    ScrollbarTrack,
    ScrollbarTracks,
    scrollbarControllerCreate,
    type ScrollAreaProps,
    type ScrollbarAxes,
    type ScrollbarAxis,
    type ScrollbarController,
    type ScrollbarPlacement,
} from "./Scrollbar";
export { CodeHighlightWorkers } from "./CodeHighlightWorkers";
export { SplashScreen, type SplashScreenProps } from "./SplashScreen";
export { SplashCover, type SplashCoverProps } from "./SplashCover";
export {
    NightSkyShader,
    type NightSkyShaderMotion,
    type NightSkyShaderProps,
} from "./NightSkyShader";
export { SplitColumn, type SplitColumnProps } from "./SplitColumn";
export {
    AGENT_WORKING_STATUS_ROW_HEIGHT,
    AgentWorkingStatus,
    type AgentWaitStatus,
    type AgentWorkingPhase,
    type AgentWorkingStatusProps,
} from "./AgentWorkingStatus";
export { TurnSummary, type TurnSummaryProps } from "./TurnSummary";
export { Tooltip, type TooltipPlacement, type TooltipProps } from "./Tooltip";
export { CopyButton, type CopyButtonProps } from "./CopyButton";
export { ScrollingText, type ScrollingTextProps } from "./ScrollingText";
export { TypedText, type TypedTextProps } from "./TypedText";
export {
    ConversationComputeEvent,
    type ConversationComputeEventProps,
} from "./ConversationComputeEvent";
export { ConversationErrorCard, type ConversationErrorCardProps } from "./ConversationErrorCard";
export { AgentDesk, type AgentDeskProps, type DeskListItem, type DeskRun } from "./AgentDesk";
export {
    AgentTracePanel,
    type AgentTracePanelEntry,
    type AgentTracePanelProps,
    type AgentTracePanelStatus,
} from "./AgentTracePanel";
export {
    AgentTraceRow,
    type AgentTraceRowKind,
    type AgentTraceRowProps,
    type AgentTraceRowStatus,
} from "./AgentTraceRow";
export {
    AgentRunCard,
    type AgentRun,
    type AgentRunAction,
    type AgentRunCardProps,
    type AgentRunStatus,
    type AgentRunStep,
} from "./AgentRunCard";
export {
    ApprovalCard,
    type ApprovalCardProps,
    type ApprovalRequest,
    type ApprovalResolution,
} from "./ApprovalCard";
export {
    AppShell,
    APP_SHELL_PANEL_DEFAULT_WIDTH,
    type AppShellFocusedPane,
    type AppShellProps,
} from "./AppShell";
export {
    Avatar,
    type AvatarProps,
    type AvatarSize,
    type AvatarType,
    type ToneName,
} from "./Avatar";
export { AvatarBrutalist, type AvatarBrutalistProps } from "./AvatarBrutalist";
export {
    BotFace,
    botFaceCredit,
    botFaceDataUri,
    botFacePaint,
    botFaceSvg,
    type BotFacePainting,
    type BotFaceProps,
} from "./BotFace";
export { AutomatedTag, type AutomatedTagProps } from "./AutomatedTag";
export {
    Badge,
    type BadgeProps,
    type BadgeVariant,
    CountBadge,
    type CountBadgeProps,
    KeyCap,
    type KeyCapProps,
    ReactionChip,
    type ReactionChipProps,
} from "./Badge";
export { Box, type BoxProps } from "./Box";
export { DevBuildMenu, type DevBuildMenuProps } from "./DevBuildMenu";
export {
    LivePerformanceIndicator,
    type LivePerformanceSnapshot,
    type LivePerformanceStore,
} from "./LivePerformanceIndicator";
export { Button, type ButtonProps, type ButtonSize, type ButtonVariant } from "./Button";
export { QRCode, type QRCodeMark, type QRCodeProps } from "./QRCode";
export { ChannelHeader, type ChannelHeaderProps, type ChannelMember } from "./ChannelHeader";
export { PanelHeader, type PanelHeaderProps } from "./PanelHeader";
export { AudienceToggle, type AudienceToggleProps, type AudienceValue } from "./AudienceToggle";
export {
    Composer,
    type ComposerProps,
    ContextChips,
    type ContextChipsProps,
    type ContextItem,
    type ContextKind,
    type Mentionable,
    MentionPicker,
    type MentionPickerProps,
} from "./Composer";
export {
    type ComposerAttachmentPreview,
    type ComposerAttachmentPreviewKind,
    ComposerAttachmentPreviews,
    type ComposerAttachmentPreviewsProps,
} from "./ComposerAttachmentPreviews";
export {
    COMPOSER_MODEL_BENCHMARKS_URL,
    ComposerModelControl,
    type ComposerModelAccount,
    type ComposerModelAccountUsage,
    type ComposerModelChoice,
    type ComposerModelControlPreview,
    type ComposerModelControlProps,
    type ComposerModelEffort,
    type ComposerModelSelection,
    type ComposerModelService,
    type ComposerModelUsage,
    type ComposerModelUsageWatch,
    type ComposerModelUsageWindow,
} from "./ComposerModelControl";
export {
    happyAgentComposerModelControlProps,
    happyAgentComposerModelUsageProject,
    happyAgentComposerModelUsageWatch,
} from "./happyAgentComposerModelControl";
export {
    DiffSnippet,
    type DiffLine,
    type DiffLineKind,
    type DiffSnippetProps,
} from "./DiffSnippet";
export { ToolCallPreview, type ToolCallPreviewProps } from "./ToolCallPreview";
export type { Dimension } from "./dimensions";
export { EventCard, type EventCardProps } from "./EventCard";
export { Fade, type FadeProps } from "./Fade";
export {
    FileTree,
    FileTreeFamilyIcon,
    fileTreeFamily,
    type FileTreeFamily,
    type FileTreeGitStatus,
    type FileTreeNode,
    type FileTreeProps,
    type FileTreeSelectModifiers,
} from "./FileTree";
export { FilePanel, type FilePanelProps } from "./FilePanel";
export {
    FileBrowser,
    type FileBrowserLayout,
    type FileBrowserProps,
    type FileBrowserScope,
} from "./FileBrowser";
export { FilePathLabel, type FilePathLabelProps } from "./FilePathLabel";
export {
    FilePreview,
    filePreviewKind,
    type FilePreviewContent,
    type FilePreviewKind,
    type FilePreviewProps,
} from "./FilePreview";
export {
    ImageViewer,
    type ImageViewerContent,
    type ImageViewerLoadedImage,
    type ImageViewerProps,
} from "./ImageViewer";
export { VideoViewer, type VideoViewerContent, type VideoViewerProps } from "./VideoViewer";
export { FileEditor, type FileEditorProps } from "./FileEditor";
export {
    commandShortcut,
    commandShortcutMatches,
    windowShortcutBlocked,
    type CommandShortcut,
    type KeyboardShortcut,
} from "./keyboardShortcut";
export { WindowShortcuts, type WindowShortcutAction } from "./WindowShortcuts";
export type { HtmlPreviewFailure, HtmlPreviewProps, HtmlPreviewRenderer } from "./htmlPreview";
export {
    INLINE_PAGE_CONTENT_GAP,
    INLINE_PAGE_MAX_HEIGHT,
    INLINE_PAGE_TITLE_HEIGHT,
    inlinePageHeight,
    type InlinePageFit,
    type InlinePageGeometry,
    type InlinePagePlacement,
    type InlinePageRender,
} from "./inlinePageFit";
export { InlinePage, type InlinePageProps } from "./InlinePage";
export type { ConversationInlinePages } from "./conversationInlinePages";
export type { MediaWindowOpener, MediaWindowRequest } from "./mediaWindow";
export { HtmlPreviewFrame, type HtmlPreviewFrameProps } from "./HtmlPreviewFrame";
export { HtmlPreviewError, type HtmlPreviewErrorProps } from "./HtmlPreviewError";
export {
    MarkdownDocument,
    markdownDocumentLinkPath,
    markdownDocumentLinkTarget,
    type MarkdownDocumentProps,
    type MarkdownDocumentReferences,
} from "./MarkdownDocument";
export {
    fileReferenceFragment,
    fileReferenceSplit,
    type FileLinkOpenHandler,
    type FileOpenHandler,
    type FileReference,
} from "./fileReference";
export { MathFormula, type MathFormulaProps } from "./MathFormula";
export { MermaidDiagram, type MermaidDiagramProps } from "./MermaidDiagram";
export { Icon, type IconName, iconNames, type IconProps } from "./Icon";
export {
    Ionicon,
    type IoniconName,
    type IoniconProps,
    ioniconNames,
    Octicon,
    type OcticonName,
    type OcticonProps,
    octiconNames,
} from "./vectorIcons/VectorIcon";
export {
    DayDivider,
    Message,
    MessageList,
    type MessageDeliveryState,
    type MessageImage,
    type MessageListProps,
    type MessageListScrollPosition,
    type MessageProps,
    type MessageReaction,
    type MessageSegment,
    SteeringNotice,
    SystemNotice,
    type SystemNoticeSegment,
} from "./Message";
export {
    type LinkOpenHandler,
    type LinkOpenPlacement,
    type MessageGenerationStatus,
} from "./MessageMarkdown";
export { type MessageReferences, type MessageReferenceView } from "./messageReferences";
export { Lightbox, type LightboxProps } from "./Lightbox";
export { Rail, type RailItem, type RailProps } from "./Rail";
export {
    ThemeScope,
    type ScrollbarVisibility,
    type ThemeMode,
    type ThemeScopeProps,
} from "./ThemeScope";
export { haptic, type HapticSignal } from "./haptics";
export {
    Sidebar,
    sidebarReorderMove,
    type SidebarHeaderAction,
    type SidebarItem,
    type SidebarItemAction,
    type SidebarNumberShortcutTarget,
    type SidebarProps,
    type SidebarReorder,
    type SidebarSearch,
    type SidebarSection,
} from "./Sidebar";
export {
    SidebarFooter,
    type SidebarFooterConnection,
    type SidebarFooterProps,
} from "./SidebarFooter";
export {
    SidebarKeepAwakeMenu,
    type SidebarKeepAwakeMenuProps,
    type SidebarKeepAwakeMode,
} from "./SidebarKeepAwakeMenu";
export {
    SIDEBAR_SPACES_BAR_HEIGHT,
    SIDEBAR_SPACES_DOT_SIZE,
    SidebarSpaces,
    type SidebarSpace,
    type SidebarSpacesProps,
} from "./SidebarSpaces";
export { SidebarUpdateAction, type SidebarUpdateActionProps } from "./SidebarUpdateAction";
export {
    DesktopStartupScreen,
    type DesktopStartupPhase,
    type DesktopStartupScreenProps,
    type DesktopStartupUpdate,
    type DesktopStartupValues,
} from "./DesktopStartupScreen";
export {
    HappyAgentConnectionStatus,
    type HappyAgentConnectionStatusProps,
} from "./HappyAgentConnectionStatus";
export {
    AgentActivityRow,
    type ActivityMotion,
    type ActivityTreatment,
    type AgentActivityRowProps,
} from "./AgentActivityRow";
export { ConversationEntryView, type ConversationEntryViewProps } from "./ConversationEntryView";
export { DelegatedAgentActivity, type DelegatedAgentActivityProps } from "./DelegatedAgentActivity";
export { ContextMenu, type ContextMenuProps } from "./ContextMenu";
export { ContextMeter, type ContextMeterProps } from "./ContextMeter";
export {
    fileTreeBuild,
    fileTreeExpanded,
    fileTreeFlatten,
    fileTreeRanked,
    fileTreeVisibleFiles,
    type FileTreeBuildEntry,
    type FileTreeExpansion,
} from "./fileTreeBuild";
export { filePathMatches } from "./fileTreeSearch";
export { fileEntriesSort, fileNameCompare, filePathCompare } from "./fileTreeSort";
export {
    ConversationStatus,
    ConversationView,
    type ConversationViewProps,
} from "./ConversationView";
export {
    ComposerFooterBar,
    ConversationDock,
    FloatingConversationDock,
    type ComposerFooterBarProps,
    type ConversationDockProps,
    type FloatingConversationDockProps,
} from "./ConversationDock";
export { ComposerPanel, type ComposerPanelProps } from "./ComposerPanel";
export {
    HappyAgentUserInputPrompt,
    type HappyAgentUserInputAnswerMap,
    type HappyAgentUserInputPromptProps,
    type HappyAgentUserInputPromptVariant,
} from "./HappyAgentUserInputPrompt";
export {
    HappyAgentControlMenu,
    type HappyAgentControlMenuProps,
    HappyAgentSessionControls,
    type HappyAgentSessionControlsProps,
} from "./HappyAgentSessionControls";
export {
    CommandPicker,
    commandPickerItems,
    type CommandPickerItem,
    type CommandPickerProps,
} from "./CommandPicker";
export { HappyAgentUsagePanel, type HappyAgentUsagePanelProps } from "./HappyAgentUsagePanel";
export { HappyAgentDevicesPanel, type HappyAgentDevicesPanelProps } from "./HappyAgentDevicesPanel";
export {
    HappyAgentProjectSettingsDialog,
    type HappyAgentProjectComputeChoice,
    type HappyAgentProjectComputeMode,
    type HappyAgentProjectComputeSection,
    type HappyAgentProjectSettingsDialogProps,
    type HappyAgentProjectSetupSection,
} from "./HappyAgentProjectSettingsDialog";
export {
    HappyAgentCreateBotPage,
    type HappyAgentCreateBotFaceSlot,
    type HappyAgentCreateBotPageProps,
} from "./HappyAgentCreateBotPage";
export {
    HappyAgentCreateTaskPage,
    type HappyAgentCreateTaskPageProps,
} from "./HappyAgentCreateTaskPage";
export {
    HappyAgentProjectCloneDialog,
    type HappyAgentProjectCloneDialogProps,
} from "./HappyAgentProjectCloneDialog";
export {
    HappyAgentTaskBrowseDialog,
    type HappyAgentTaskBrowseDialogProps,
    type HappyAgentTaskBrowseEntry,
} from "./HappyAgentTaskBrowseDialog";
export {
    HappyAgentActivityPanel,
    type HappyAgentActivityPanelProps,
} from "./HappyAgentActivityPanel";
export {
    HAPPY_AGENT_ACTIVITY_CONTROL_TRANSCRIPT_HEIGHT,
    HappyAgentActivityControl,
    type HappyAgentActivityControlProps,
} from "./HappyAgentActivityControl";
export {
    SearchField,
    type SearchFieldEditableProps,
    type SearchFieldOpenerProps,
    type SearchFieldProps,
    TitleBar,
    type TitleBarEditableProps,
    type TitleBarOpenerProps,
    type TitleBarPlainProps,
    type TitleBarProps,
    WindowDragRegion,
    type WindowDragRegionProps,
} from "./TitleBar";
export {
    TextField,
    type TextFieldProps,
    type TextFieldSize,
    type TextFieldType,
} from "./TextField";
export { Select, type SelectOption, type SelectProps, type SelectSize } from "./Select";
export { LoadingSwap, type LoadingSwapProps } from "./LoadingSwap";
export {
    SPINNER_FRAMES,
    SPINNER_VARIANTS,
    Spinner,
    type SpinnerProps,
    type SpinnerTone,
    type SpinnerVariant,
} from "./Spinner";
export {
    ShimmerText,
    type ShimmerTextProps,
    type ShimmerTextSweep,
    type ShimmerTextTone,
} from "./ShimmerText";
export { WaitRing, type WaitRingProps, waitFinishDateLabel, waitRemainingLabel } from "./WaitRing";
export { WorkspaceLifecycleLane, type WorkspaceLifecycleLaneProps } from "./WorkspaceLifecycleLane";
export {
    WorkspaceLifecycleNotice,
    type WorkspaceLifecycleNoticeProps,
    type WorkspaceLifecycleNoticeSize,
    type WorkspaceLifecyclePhase,
} from "./WorkspaceLifecycleNotice";
export { Switch, type SwitchProps, type SwitchSize } from "./Switch";
export { Checkbox, type CheckboxProps } from "./Checkbox";
export {
    SegmentedControl,
    type SegmentedControlProps,
    type SegmentedControlSegment,
    type SegmentedControlSize,
} from "./SegmentedControl";
export {
    SegmentedProgress,
    type SegmentedProgressProps,
    type SegmentedProgressSegment,
    type SegmentedProgressState,
} from "./SegmentedProgress";
export {
    OnboardingSteps,
    type OnboardingStepsProps,
    type OnboardingStage,
    type MobileOnboardingStage,
} from "./OnboardingSteps";
export { Banner, type BannerAction, type BannerProps, type BannerTone } from "./Banner";
export {
    EmptyState,
    type EmptyStateAction,
    type EmptyStateProps,
    type EmptyStateSize,
} from "./EmptyState";
export {
    LottieScene,
    type LottieSceneName,
    type LottieScenePlay,
    type LottieSceneProps,
} from "./LottieScene";
export { type TabItem, Tabs, type TabsProps, type TabsSize } from "./Tabs";
export { TabbedPane, type TabbedPaneProps } from "./TabbedPane";
export {
    DeferredPane,
    type DeferredPaneCurrent,
    type DeferredPanePending,
    type DeferredPaneProps,
} from "./DeferredPane";
export { TransferZone, type TransferZoneProps } from "./TransferZone";
export {
    TRANSFER_ZONE_ATTRIBUTE,
    type TabTransferTarget,
    type TransferZoneState,
} from "./tabTransfer";
export { Toolbar, type ToolbarProps, type ToolbarSearch } from "./Toolbar";
export { Menu, type MenuItem, type MenuProps } from "./Menu";
export { MenuButton, type MenuButtonProps } from "./MenuButton";
export { Modal, type ModalProps, type ModalSize, type ModalTone } from "./Modal";
export { ModalOverlay, type ModalOverlayProps } from "./ModalOverlay";
export {
    CloudSignInNoticeDialog,
    type CloudSignInNoticeAccount,
    type CloudSignInNoticeChiefOfStaff,
    type CloudSignInNoticeDialogProps,
    type CloudSignInNoticeFailure,
    type CloudSignInNoticeTeam,
    type CloudSignInNoticeView,
} from "./CloudSignInNoticeDialog";
export {
    IMAGE_CROP_MAX_ZOOM,
    imageCropClamp,
    imageCropEdge,
    imageCropInitial,
    imageCropOpen,
    imageCropPan,
    imageCropRegion,
    imageCropZoom,
    type ImageCropRegion,
    type ImageCropSize,
    type ImageCropSource,
    type ImageCropView,
} from "./imageCrop";
export {
    PROFILE_PHOTO_CROP_FRAME,
    PROFILE_PHOTO_CROP_STAGE,
    ProfilePhotoCropDialog,
    type ProfilePhotoCropDialogProps,
    type ProfilePhotoCropSource,
} from "./ProfilePhotoCropDialog";
export {
    DefaultAgentForm,
    type DefaultAgentFormProps,
    DEFAULT_AGENT_LUCKY_LABEL,
} from "./DefaultAgentForm";
export { CommandPalette, type CommandPaletteProps } from "./CommandPalette";
export {
    CommandPaletteResults,
    commandPaletteResultsRows,
    type CommandPaletteCommandRow,
    type CommandPaletteControlRow,
    type CommandPaletteResultsAvatar,
    type CommandPaletteResultsProps,
    type CommandPaletteResultsRow,
    type CommandPaletteResultsSection,
    type CommandPaletteRowEmphasis,
} from "./CommandPaletteResults";
export { FormRow, type FormRowAlign, type FormRowLayout, type FormRowProps } from "./FormRow";
export {
    DocumentEditor,
    documentFragmentName,
    type DocumentEditorPresence,
    type DocumentEditorPresencePayload,
    type DocumentEditorProps,
    type DocumentEditorUser,
} from "./DocumentEditor";
export {
    DataTable,
    type DataTableAlign,
    type DataTableColumn,
    type DataTableProps,
    type DataTableRow,
} from "./DataTable";
export {
    type StatDelta,
    StatTile,
    type StatTileProps,
    type StatTone,
    type StatTrend,
} from "./StatTile";
export {
    LocalOnboardingScreen,
    localOnboardingInstallCommand,
    localOnboardingStage,
    type LocalOnboardingAgentSetupPhase,
    type LocalOnboardingAssistant,
    type LocalOnboardingAssistantId,
    type LocalOnboardingCommandCopy,
    type LocalOnboardingInstallShell,
    type LocalOnboardingCustom,
    type LocalOnboardingDownload,
    type LocalOnboardingScreenProps,
    type LocalOnboardingView,
} from "./LocalOnboardingScreen";
export { ProfileSetupScreen, type ProfileSetupScreenProps } from "./ProfileSetupScreen";
export {
    DesktopMobileSetup,
    desktopMobilePairingOptionsCopy,
    type DesktopMobilePairingOptions,
    type DesktopMobileSetupProps,
    type DesktopMobileSetupStep,
} from "./DesktopMobileSetup";
export {
    AgentUpdateCard,
    type AgentUpdateCardAgent,
    type AgentUpdateCardProps,
    type AgentUpdateCardReason,
    type AgentUpdateCardView,
    type AgentUpdateStep,
} from "./AgentUpdateCard";
export { SidebarAgentUpdate, type SidebarAgentUpdateProps } from "./SidebarAgentUpdate";
export {
    WelcomeScreen,
    type WelcomeScreenBackdrop,
    type WelcomeScreenProps,
} from "./WelcomeScreen";
export {
    WelcomeDeck,
    type WelcomeDeckProps,
    type WelcomeDeckTint,
    type WelcomeSlide,
    type WelcomeSlideArt,
} from "./WelcomeDeck";
export { SetupChoice, type SetupChoiceOption, type SetupChoiceProps } from "./SetupChoice";
export {
    SetupAssistants,
    type SetupAgentPrompt,
    type SetupAssistantAction,
    type SetupAssistantEntry,
    type SetupAssistantsProps,
} from "./SetupAssistants";
export { SetupCommand, type SetupCommandProps } from "./SetupCommand";
export { AssistantMark, type AssistantMarkName, type AssistantMarkProps } from "./AssistantMark";
export {
    SetupHandoff,
    SetupPage,
    SetupProgress,
    type SetupPageAction,
    type SetupPageProgress,
    type SetupPageProps,
    type SetupProgressProps,
} from "./SetupPage";
export {
    SetupOptionCard,
    type SetupOptionCardProps,
    type SetupOptionHintTone,
    type SetupOptionStatus,
} from "./SetupOptionCard";
export {
    BuildProgressPanel,
    type BuildProgressPanelProps,
    type BuildProgressStatus,
} from "./BuildProgressPanel";
export { type Availability, StatusPicker, type StatusPickerProps } from "./StatusPicker";
export {
    type SearchResultAvatar,
    type SearchResultGroup,
    type SearchResultItem,
    SearchResults,
    type SearchResultsProps,
    type SearchResultsVariant,
    type SearchResultType,
} from "./SearchResults";
export {
    MediaGallery,
    type MediaGalleryProps,
    type MediaItem,
    type MediaKind,
} from "./MediaGallery";
export {
    FileAttachment,
    type FileAttachmentKind,
    type FileAttachmentProps,
    type FileAttachmentVariant,
} from "./FileAttachment";
export { ResultCard, type ResultCardProps } from "./ResultCard";
export {
    ConversationMedia,
    MediaImageTile,
    MediaVideoTile,
    type ConversationMediaProps,
    type MediaImageTileProps,
    type MediaVideoTileProps,
} from "./ConversationMedia";
export { type EmojiItem, EmojiPicker, type EmojiPickerProps } from "./EmojiPicker";
export { TerminalPanel, type TerminalPanelProps } from "./TerminalPanel";
export {
    BrowserPanel,
    type BrowserContentProps,
    type BrowserContentRenderer,
    type BrowserController,
    type BrowserFailure,
    type BrowserPanelProps,
} from "./BrowserPanel";
export {
    QuickActionsCard,
    type QuickActionsCardItem,
    type QuickActionsCardProps,
} from "./QuickActionsCard";
export { ZoomIndicator } from "./ZoomIndicator";
export {
    HappyAgentInboxPage,
    type HappyAgentInboxAnswerMap,
    type HappyAgentInboxPageProps,
} from "./pages/inbox/HappyAgentInboxPage";
export {
    type HappyAgentArtifactLabels,
    type HappyAgentArtifactSourceChoice,
} from "./pages/artifacts/artifactPresentation";
export {
    HappyAgentArtifactsPage,
    type HappyAgentArtifactsPageProps,
} from "./pages/artifacts/HappyAgentArtifactsPage";
export {
    HappyAgentArtifactsPanel,
    type HappyAgentArtifactsPanelProps,
} from "./pages/artifacts/HappyAgentArtifactsPanel";
export {
    HappyAgentArtifactViewer,
    type HappyAgentArtifactViewerProps,
} from "./pages/artifacts/HappyAgentArtifactViewer";
export { artifactHtmlDocument } from "./pages/artifacts/artifactHtmlDocument";
export { REORDERING_LIST_STATIC, ReorderingList, type ReorderingListProps } from "./ReorderingList";
export {
    SurfaceAvatar,
    SurfaceMemberStack,
    surfaceMembersText,
    surfaceTypeIcon,
    surfaceTypeLabel,
    type HappyAgentSurfaceMemberView,
    type HappyAgentSurfacePicture,
    type HappyAgentSurfaceView,
    type SurfaceAvatarProps,
} from "./pages/surfaces/surfacePresentation";
export {
    HappyAgentSurfaceHeader,
    type HappyAgentSurfaceHeaderProps,
} from "./pages/surfaces/HappyAgentSurfaceHeader";
export { HappyAgentTodoRow, type HappyAgentTodoRowProps } from "./pages/surfaces/HappyAgentTodoRow";
export {
    HappyAgentTodoSurfacePage,
    type HappyAgentTodoSurfacePageProps,
} from "./pages/surfaces/HappyAgentTodoSurfacePage";
export {
    HappyAgentMessagesSurfacePage,
    type HappyAgentMessagesSurfacePageProps,
} from "./pages/surfaces/HappyAgentMessagesSurfacePage";
export {
    HappyAgentDocumentSurfacePage,
    type HappyAgentDocumentSurfaceContent,
    type HappyAgentDocumentSurfacePageProps,
    type HappyAgentDocumentSync,
} from "./pages/surfaces/HappyAgentDocumentSurfacePage";
export {
    HappyAgentSurfaceNotMadePage,
    type HappyAgentSurfaceNotMadePageProps,
} from "./pages/surfaces/HappyAgentSurfaceNotMadePage";
export {
    HappyAgentSurfaceReferencePage,
    type HappyAgentSurfaceReferencePageProps,
    type HappyAgentSurfaceReferenceView,
} from "./pages/surfaces/HappyAgentSurfaceReferencePage";
export {
    HappyAgentSurfaceChatPanel,
    type HappyAgentSurfaceChatPanelProps,
    type HappyAgentSurfaceChatPanelState,
} from "./pages/surfaces/HappyAgentSurfaceChatPanel";
export type { HappyAgentSurfaceChatToggle } from "./pages/surfaces/HappyAgentSurfaceHeader";
export {
    HappyAgentCalendarSurfacePage,
    type HappyAgentCalendarSurfacePageProps,
} from "./pages/surfaces/HappyAgentCalendarSurfacePage";
export {
    HappyAgentCalendarEventPopover,
    type HappyAgentCalendarEditorHandlers,
    type HappyAgentCalendarEventPopoverProps,
} from "./pages/surfaces/HappyAgentCalendarEventPopover";
export {
    HappyAgentCalendarMonthView,
    type HappyAgentCalendarMonthViewProps,
} from "./pages/surfaces/HappyAgentCalendarMonthView";
export { CalendarSeriesNote } from "./pages/surfaces/CalendarSeriesNote";
export {
    HappyAgentCalendarWeekView,
    type HappyAgentCalendarWeekViewProps,
} from "./pages/surfaces/HappyAgentCalendarWeekView";
export {
    HappyAgentSurfaceUnsupportedPage,
    type HappyAgentSurfaceUnsupportedPageProps,
} from "./pages/surfaces/HappyAgentSurfaceUnsupportedPage";
export {
    HappyAgentSurfaceCreateDialog,
    type HappyAgentSurfaceCreateDialogProps,
    type HappyAgentSurfaceCreateInput,
} from "./pages/surfaces/HappyAgentSurfaceCreateDialog";
export { happyAgentSurfaceBackdropsPreload } from "./pages/surfaces/surfaceBackdropsPreload";
export {
    HappyAgentSettingsSection,
    HappyAgentSettingsShell,
    type HappyAgentSettingsCategory,
    type HappyAgentSettingsSectionProps,
    type HappyAgentSettingsShellProps,
} from "./pages/settings/HappyAgentSettingsShell";
export {
    HappyAgentGeneralSettings,
    type HappyAgentAppearanceChoice,
    type HappyAgentGeneralSettingsProps,
    type HappyAgentLinkOpenPlacementChoice,
    type HappyAgentScrollbarVisibilityChoice,
} from "./pages/settings/HappyAgentGeneralSettings";
export {
    HappyAgentProductAnalyticsSettings,
    type HappyAgentProductAnalyticsSettingsProps,
} from "./pages/settings/HappyAgentProductAnalyticsSettings";
export {
    HappyAgentAccountSettings,
    type HappyAgentAccountSettingsProps,
} from "./pages/settings/HappyAgentAccountSettings";
export {
    HappyAgentMobileSettings,
    type HappyAgentMobileSettingsProps,
    type HappyAgentMobileStatus,
    type HappyAgentMobileTerminal,
} from "./pages/settings/HappyAgentMobileSettings";
export {
    MobileDirectConnectionSection,
    MobileDirectEmoji,
    MobileDirectPairingPanel,
    MobileDirectRemoveConfirmation,
    mobileDirectPairingEngaged,
    type MobileDirectConnectionSectionProps,
    type MobileDirectConnector,
    type MobileDirectConnectorState,
    type MobileDirectDeviceClaim,
    type MobileDirectEmojiProps,
    type MobileDirectPairedDevice,
    type MobileDirectPairing,
    type MobileDirectPairingPanelProps,
    type MobileDirectPairingStatus,
    type MobileDirectPlatform,
    type MobileDirectRemoval,
    type MobileDirectRemoveConfirmationProps,
    type MobileDirectSocketStatus,
} from "./MobileDirectConnection";
export {
    MobilePairingOptions,
    type MobilePairingOptionsLayout,
    type MobilePairingOptionsProps,
    type MobileRelayPairingState,
} from "./MobilePairingOptions";
export {
    MobileAccessConfirmation,
    MobileAccessDetail,
    type MobileAccessConfirmationProps,
    type MobileAccessConfirmationState,
    type MobileAccessTerminalResetPreview,
} from "./MobileAccessConfirmation";
export {
    HappyAgentDebugSettings,
    type HappyAgentDebugSettingsProps,
    type HappyAgentDebugTarget,
} from "./pages/settings/HappyAgentDebugSettings";
export {
    HappyAgentDebugLogPanel,
    type HappyAgentDebugLogPanelEntry,
    type HappyAgentDebugLogPanelProps,
} from "./pages/settings/HappyAgentDebugLogPanel";
export {
    HappyAgentProfilerSettings,
    type HappyAgentProfilerCapabilities,
    type HappyAgentProfilerSettingsProps,
    type HappyAgentProfilerStatus,
} from "./pages/settings/HappyAgentProfilerSettings";
export {
    HappyAgentInstructionsSettings,
    type HappyAgentInstructionDocument,
    type HappyAgentInstructionsSettingsProps,
} from "./pages/settings/HappyAgentInstructionsSettings";
export {
    HappyAgentProviderSettings,
    type HappyAgentProviderModelRow,
    type HappyAgentProviderRow,
    type HappyAgentProviderSettingsProps,
    type HappyAgentProviderStatus,
} from "./pages/settings/HappyAgentProviderSettings";
export {
    HappyAgentFileTierSettings,
    type HappyAgentFileTierMoveDirection,
    type HappyAgentFileTierRow,
    type HappyAgentFileTierSettingsProps,
} from "./pages/settings/HappyAgentFileTierSettings";
export {
    HappyAgentSecretSettings,
    type HappyAgentSecretCreateInput,
    type HappyAgentSecretRow,
    type HappyAgentSecretSettingsProps,
} from "./pages/settings/HappyAgentSecretSettings";
export {
    HappyAgentSecretCreateDialog,
    type HappyAgentSecretCreateDialogProps,
    type HappyAgentSecretCreateDraft,
    type HappyAgentSecretVariableDraft,
} from "./pages/settings/HappyAgentSecretCreateDialog";
export {
    HappyAgentProfileSettings,
    type HappyAgentProfileSettingsPhoto,
    type HappyAgentProfileSettingsProps,
} from "./pages/settings/HappyAgentProfileSettings";
export {
    HappyAgentStateSettings,
    type HappyAgentStateDocument,
    type HappyAgentStateSettingsProps,
} from "./pages/settings/HappyAgentStateSettings";
export {
    HappyAgentUsageSettings,
    type HappyAgentUsageSettingsProps,
    type HappyAgentUsageProviderRow,
} from "./pages/settings/HappyAgentUsageSettings";
export { providerAccountName } from "./pages/settings/providerAccountName";
export { ConnectionShell, type ConnectionShellItem } from "./ConnectionShell";
export { ConnectionSurface } from "./ConnectionSurface";
export {
    DataDisclosure,
    type DataDisclosureGroup,
    type DataDisclosureProps,
} from "./DataDisclosure";
export {
    HappyAgentSystemMonitorSurfacePage,
    type HappyAgentSystemMonitorSurfacePageProps,
} from "./pages/surfaces/HappyAgentSystemMonitorSurfacePage";
