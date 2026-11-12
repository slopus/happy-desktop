// First, so the cloud web app's session handling is in place before any
// module captures `fetch`.
import {
    CLOUD_WEB_PICKER_URL,
    cloudWeb,
    cloudWebPaymentsReturn,
    cloudWebSessionEndSubscribe,
    cloudWebSignIn,
    cloudWebSignOut,
} from "./cloudWeb";
import { useSyncExternalStore, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import {
    DesktopStartupScreen,
    appMobileRelayFromLink,
    appMobileRelayFromOnboarding,
    useAppMobilePairingOptions,
    happyAgentHistoryCreate,
    happyAgentWelcomeSlides,
    happyAgentRouterConversationOpen,
    happyAgentRouterGroupOpen,
    happyAgentRouterConnectionForget,
    happyAgentRouterGroupForget,
    happyAgentRouterHappyLinkOpen,
    happyAgentRouterSubtasksForget,
    happyAgentRouterCreate,
    happyAgentRouterConnectionChanged,
    type AppHappyAgentDaemonStore,
    type AppHappyAgentUpdateStore,
    type AppHappyAgentOutageStore,
    type AppHappyAgentReleaseNotesStore,
    type AppHappyAgentUpdate,
    type AppHappyAgentDebugStore,
    type AppHappyAgentProfilerStore,
    type HappyAgentRouter,
} from "happy-desktop-app";
import {
    HAPPY_AGENT_DEFAULT_THINKING_LEVEL,
    appearanceStoreCreate,
    appearanceStoreOwnedCreate,
    customThemeEmpty,
    type ThemeMode,
    keepAwakeStoreOwnedCreate,
    type KeepAwakeStore,
    commandPaletteStoreCreate,
    experimentsStoreCreate,
    mobilePairingMethodDefault,
    mobilePairingMethodStoreCreate,
    projectsVisibilityStoreOwnedCreate,
    statusBarStoreCreate,
    gptLiveStoreCreate,
    gptLiveExperimentsConnect,
    titleShimmerStoreOwnedCreate,
    welcomeStoreCreate,
    happyAgentNavigationOrderStoreCreate,
    happyAgentSidebarCollapseStoreCreate,
    happyAgentSidebarVisibilityStoreCreate,
    happyAgentSettingsStoreOwnedCreate,
    happyAgentAttentionConnection,
    happyAgentAttentionStoreOwnedCreate,
    happyAgentClockStoreCreate,
    happyExternalLinkParse,
    happyLinkInboxStoreCreate,
    parseHappyUrl,
    serverSessionsStoreCreate,
    serverSourceHostCreate,
    UserError,
    happyAgentMobileConnectorStoreUnfollowed,
    type AppearanceStore,
    type HappyAgentChiefOfStaffRequest,
    type HappyAgentClockStore,
    type HappyLinkInboxStore,
    type HappyAgentAttentionStore,
    type HappyAgentCompletionSound,
    type CommandPaletteStore,
    type ExperimentsStore,
    type MobilePairingMethodStore,
    type ProjectsVisibilityStore,
    type StatusBarStore,
    type UsageAnalyticsStore,
    type GptLiveStore,
    type WelcomeStore,
    type HappyAgentNavigationOrderStore,
    type HappyAgentSidebarCollapseStore,
    type HappyAgentSidebarVisibilityStore,
    type HappyAgentSettingsStore,
    type TitleShimmerStore,
    type HappyAgentWindowStore,
    type HappyAgentModelPreferencePersistence,
    type HappyAgentSessionId,
} from "happy-desktop-state";
import {
    CodeHighlightWorkers,
    LocalOnboardingScreen,
    localOnboardingStage,
    type OnboardingStage,
    SetupHandoff,
    SetupPage,
    ThemeScope,
    CloudWebSignInScreen,
    WelcomeScreen,
    ZoomIndicator,
    ConnectionShell,
    CloudConnectScreen,
    CloudSignInNoticeDialog,
    HappyLinkNoticeDialog,
    ConnectionSurface,
    happyAgentSurfaceBackdropsPreload,
    type BrowserContentRenderer,
    type HtmlPreviewRenderer,
    type LivePerformanceStore,
    type MediaWindowOpener,
    type MenuItem,
} from "happy-desktop-ui";
import {
    happyArtifactPartition,
    happyHtmlPreviewPartition,
    mediaPreviewView,
    type DesktopConfig,
    type DesktopGuestKeyEvent,
    type DesktopRuntimeSnapshot,
    type DesktopUpdateSnapshot,
    type HappyDesktopBridge,
} from "../shared/desktopContract";
import { happyCloudServerNameOf } from "../shared/happyCloud";
import { desktopStartRequestFromValues, desktopStartupValues } from "./desktopStartupModel";
import { dockUnreadPublish, happyAgentEntryUnreadCount } from "./dockUnread";
import { happyAgentListedConversations } from "./happyAgentListed";
import { completionChimePlay, completionChimeWanted } from "./completionChime";
import { desktopAttentionPersistence } from "./desktopAttention";
import { happyAgentDirectoryAgentWorking, keepAwakePublish } from "./keepAwake";
import { desktopRuntimeStoreCreate, type DesktopRuntimeStore } from "./runtimeStore";
import {
    localOnboardingReachedStage,
    localOnboardingStoreCreate,
    localOnboardingView,
    type LocalOnboardingStore,
    type LocalOnboardingViewSnapshot,
} from "./localOnboardingStore";
import {
    LOCAL_HAPPY_AGENT_ID,
    happyAgentDirectoryStoreCreate,
    type HappyAgentDirectoryStore,
} from "./happyAgentDirectoryStore";
import { happyAgentDirectoryLinkTarget } from "./happyAgentDirectoryLinkTarget";
import { happyShareLinkClicksRoute } from "./happyShareLinkClicks";
import { startupValuesStoreCreate, type StartupValuesStore } from "./startupValuesStore";
import { browserDevBridgeCreate } from "./browserDevBridge";
import { cloudWebBridgeCreate } from "./cloudWebBridge";
import { cloudWebTabFollow } from "./cloudWebTab";
import { cloudWebSignInStoreCreate, type CloudWebSignInStore } from "./cloudWebSignInStore";
import { localWebBuild } from "./localWebBuild";
import {
    localWebUpdateStoreCreate,
    type LocalWebUpdateSnapshot,
    type LocalWebUpdateStore,
} from "./localWebUpdateStore";
import { surfaceWindowStateStoreCreate, windowStateStoreCreate } from "./windowStateStore";
import { DesktopBrowserView } from "./desktopBrowserView";
import { DesktopHtmlPreviewView } from "./desktopHtmlPreviewView";
import { desktopPreferencesCreate } from "./desktopPreferences";
import { desktopHistoryPersistence } from "./desktopHistory";
import { desktopConnectionUiCreate, type DesktopConnectionUi } from "./desktopConnectionUi";
import { desktopConnectionDataErase } from "./desktopConnectionDataErase";
import { desktopConnectionPreferencesCreate } from "./desktopConnectionPreferences";
import { desktopModelPreferencesCreate } from "./desktopModelPreferences";
import { desktopCloudAuthRouterCreate, type DesktopCloudAuthEvent } from "./desktopCloudAuthRouter";
import {
    desktopCloudConnectStoreCreate,
    type DesktopCloudConnectStore,
} from "./desktopCloudConnectStore";
import {
    desktopCloudSignInNoticeStoreCreate,
    type DesktopCloudSignInNoticeStore,
} from "./desktopCloudSignInNoticeStore";
import { desktopDebugStoreCreate } from "./desktopDebugStore";
import { desktopRowHeightCheckInstall } from "./desktopRowHeightCheck";
import { desktopProfilerStoreCreate } from "./desktopProfilerStore";
import { desktopMetricsStoreCreate } from "./desktopMetricsStore";
import { desktopDaemonStoreCreate } from "./desktopDaemonStore";
import { desktopAgentReleaseNotesStoreCreate } from "./desktopAgentReleaseNotesStore";
import { desktopExperimentsPersistence } from "./desktopExperiments";
import {
    desktopProjectsVisibilityPersistence,
    desktopProjectsVisibilityLegacyConsume,
} from "./desktopProjectsVisibility";
import { desktopStatusBarPersistence } from "./desktopStatusBar";
import { desktopAvatarsAnimated } from "./desktopAvatarsAnimated";
import { desktopPowerSavingCreate, type DesktopPowerSaving } from "./desktopPowerSaving";
import { desktopGptLivePersistence } from "./desktopGptLive";
import { desktopGptLiveRuntimeCreate } from "./desktopGptLiveRuntime";
import { desktopWelcomePersistence } from "./desktopWelcome";
import { desktopNavigationOrderPersistence } from "./desktopNavigationOrder";
import { desktopSidebarCollapsePersistence } from "./desktopSidebarCollapse";
import { DesktopBootGate, desktopBootSkip } from "./DesktopBootGate";
import { desktopAnalyticsCreate, desktopOs } from "./desktopAnalytics";
import { desktopAgentUpdateStoreCreate } from "./desktopAgentUpdateStore";
import {
    DesktopAgentBrokenGate,
    desktopAgentBrokenStoreCreate,
    desktopAgentOutageStoreCreate,
    type DesktopAgentBrokenStore,
} from "./desktopAgentBroken";
import {
    DesktopMediaPreviewWindow,
    desktopMediaPreviewEscapeBind,
    desktopMediaPreviewStoreCreate,
} from "./desktopMediaPreview";

/**
 * Hands one workspace file to the shell to show in a window of its own. The
 * shell decides whether the address is one of its Happy Agents' and refuses otherwise,
 * so a failure here is reported rather than retried against another route.
 */
function desktopMediaWindowOpen(bridge: HappyDesktopBridge): MediaWindowOpener {
    return (request) => {
        void bridge.mediaPreviewOpen(request.url).catch((error: unknown) => {
            console.error("Could not open the file in its own window.", error);
        });
    };
}

/**
 * Opens one HTTPS address in the machine's own browser.
 *
 * The shell routes every `window.open` from this window into an embedded
 * browser tab, which needs a workspace behind it; a page reached from
 * somewhere with no workspace — the surface a new bot is made on — has
 * nowhere to open. The shell has exactly one door to the machine's browser,
 * the one it opens the account login through, and it accepts any HTTPS
 * address; it is used here for the same act, deliberately, because the shell
 * is a host process and cannot gain a door of its own in a renderer release.
 * Anything that is not HTTPS is refused rather than sent somewhere else.
 */
declare const __HAPPY_RENDERER_VERSION__: string;

const DESKTOP_OS_NAMES = { linux: "Linux", mac: "macOS", win: "Windows" } as const;

/** What a bug report says about this window: the renderer's version and the OS it runs on. */
function desktopBugReportHost(bridge: HappyDesktopBridge): {
    readonly desktopVersion: string;
    readonly os: string;
} {
    const os = DESKTOP_OS_NAMES[desktopOs()];
    const osVersion = bridge.system?.osVersion;
    return {
        desktopVersion: __HAPPY_RENDERER_VERSION__,
        os: osVersion ? `${os} ${osVersion}` : os,
    };
}

function desktopExternalLinkOpen(bridge: HappyDesktopBridge): (url: string) => void {
    return (url) => {
        let parsed: URL;
        try {
            parsed = new URL(url);
        } catch {
            return;
        }
        if (parsed.protocol !== "https:") return;
        void bridge.cloudAuthOpen(parsed.href).catch((error: unknown) => {
            console.error("Could not open the link in the browser.", error);
        });
    };
}

const desktopBrowserContentRender: BrowserContentRenderer = (props) => (
    <DesktopBrowserView {...props} />
);

const desktopHtmlPreviewRender: HtmlPreviewRenderer = (props) => (
    <DesktopHtmlPreviewView
        {...props}
        canvas="paper"
        partition={happyHtmlPreviewPartition}
        popups={false}
    />
);

const desktopArtifactPageRender: HtmlPreviewRenderer = (props) => (
    <DesktopHtmlPreviewView {...props} canvas="none" partition={happyArtifactPartition} popups />
);

function desktopAction(operation: Promise<void>): void {
    void operation.catch(() => undefined);
}

const COMPLETION_SOUND_MENU_PREFIX = "completion-sound:";
const COMPLETION_SOUND_CHOICES: readonly {
    readonly sound: HappyAgentCompletionSound;
    readonly label: string;
}[] = [
    { sound: "always", label: "Always" },
    { sound: "focused", label: "When focused" },
    { sound: "never", label: "Never" },
];

/** A connection tile's menu: when that connection chimes, with the current choice checked. */
function completionSoundMenuItems(current: HappyAgentCompletionSound): MenuItem[] {
    return [
        { kind: "label", label: "Completion sound" },
        ...COMPLETION_SOUND_CHOICES.map(
            ({ sound, label }): MenuItem => ({
                kind: "item",
                id: `${COMPLETION_SOUND_MENU_PREFIX}${sound}`,
                label,
                ...(sound === current ? { icon: "check" as const } : {}),
            }),
        ),
    ];
}

const CLOUD_SIGN_OUT_ACTION = "happy-cloud-sign-out";
const CLOUD_SERVER_SIGN_OUT_ACTION = "happy-cloud-server-sign-out";
const CLOUD_REMOVE_ACTION = "happy-cloud-remove";
const CLOUD_SERVER_MENU_ITEMS: readonly MenuItem[] = [
    { kind: "separator" },
    { kind: "item", id: CLOUD_SERVER_SIGN_OUT_ACTION, label: "Sign out of this server" },
    { kind: "item", id: CLOUD_SIGN_OUT_ACTION, label: "Sign out of Happy Cloud" },
    { kind: "item", id: CLOUD_REMOVE_ACTION, label: "Remove from Happy", danger: true },
];

/** The Happy Cloud connection a rail entry stands for, by its entry ID. */
function cloudServerConnectionOf(id: string): string | undefined {
    const connectionId = id.startsWith("connection:") ? id.slice("connection:".length) : id;
    return happyCloudServerNameOf(connectionId) === undefined ? undefined : connectionId;
}

/** A Happy Cloud server's handle, which picks the placeholder it wears without a picture. */
function cloudServerNameOf(id: string): string | undefined {
    const connectionId = cloudServerConnectionOf(id);
    return connectionId === undefined ? undefined : happyCloudServerNameOf(connectionId);
}

function completionSoundOf(actionId: string): HappyAgentCompletionSound | undefined {
    return COMPLETION_SOUND_CHOICES.find(
        ({ sound }) => actionId === `${COMPLETION_SOUND_MENU_PREFIX}${sound}`,
    )?.sound;
}

/**
 * Publishes Happy's selected appearance source to Chromium. Electron applies it
 * process-wide, which is the boundary shared by browser guests, HTML previews,
 * and the separate media-preview window.
 */
function desktopAppearanceSynchronize(
    appearance: AppearanceStore,
    bridge: HappyDesktopBridge,
): void {
    let published: ThemeMode | undefined;
    const publish = () => {
        const mode = appearance.get().mode;
        if (mode === published) return;
        published = mode;
        bridge.appearanceSet(mode);
    };
    publish();
    appearance.subscribe(publish);
}

interface WorkspaceUpdate {
    readonly action: "install" | "refresh";
    readonly snapshot: AppHappyAgentUpdate;
}

function workspaceUpdate(
    native: DesktopUpdateSnapshot,
    hosted: LocalWebUpdateSnapshot,
): WorkspaceUpdate | undefined {
    if (
        native.status === "available" ||
        native.status === "downloading" ||
        native.status === "downloaded"
    )
        return {
            action: "install",
            snapshot: {
                action: "restart",
                ...(native.availableVersion ? { version: native.availableVersion } : {}),
                ...(native.message ? { detail: native.message } : {}),
                status: native.status,
            },
        };
    if (hosted.status !== "available") return undefined;
    const version =
        hosted.version !== localWebBuild?.version
            ? hosted.version
            : `build ${hosted.buildId.slice(0, 7)}`;
    return {
        action: "refresh",
        snapshot: { action: "refresh", status: "downloaded", version },
    };
}

function ChoosingScreen(props: {
    bridge: HappyDesktopBridge;
    update: DesktopUpdateSnapshot;
    values: StartupValuesStore;
}) {
    const values = useSyncExternalStore(props.values.subscribe, props.values.get, props.values.get);
    return (
        <DesktopStartupScreen
            onChange={props.values.change}
            onInstallUpdate={() => desktopAction(props.bridge.updateInstall())}
            onSubmit={() =>
                desktopAction(props.bridge.runtimeStart(desktopStartRequestFromValues(values)))
            }
            phase="choosing"
            update={props.update}
            values={values}
        />
    );
}

/**
 * Mounts the local workspace under its router once a connection exists. The
 * router owns which conversation is open, so the stores of a new connection are
 * handed to it as route context rather than as props to a screen.
 */
/**
 * Renders the whole desktop tree in the selected appearance. The store outlives
 * every daemon connection and every startup phase, so the startup screens and the
 * workspace are one themed subtree rather than two.
 */
function DesktopAppearance(props: {
    appearance: AppearanceStore;
    /** The machine's power saving, which holds animated avatars still while it lasts. */
    powerSaving?: DesktopPowerSaving;
    children: ReactNode;
}) {
    const appearance = useSyncExternalStore(
        props.appearance.subscribe,
        props.appearance.get,
        props.appearance.get,
    );
    const powerSaving = useSyncExternalStore(
        props.powerSaving?.subscribe ?? powerSavingNever.subscribe,
        props.powerSaving?.get ?? powerSavingNever.get,
        props.powerSaving?.get ?? powerSavingNever.get,
    );
    return (
        <ThemeScope
            avatarsAnimated={appearance.avatarsAnimated && !powerSaving}
            customTheme={appearance.customTheme}
            mode={appearance.mode}
            scrollbarVisibility={appearance.scrollbarVisibility}
        >
            {props.children}
        </ThemeScope>
    );
}

/** A window without a shell to ask is never saving power. */
const powerSavingNever: DesktopPowerSaving = { get: () => false, subscribe: () => () => {} };

/**
 * Mounts the workspace router as soon as this window has a Happy Agent directory to
 * render. Which Happy Agent is on screen — and whether it has connected yet — is the
 * directory's business and the URL's, not this boundary's, so a machine that is
 * still connecting no longer holds the whole window on a startup screen.
 */
function HappyAgentBoundary(props: {
    appearance: AppearanceStore;
    commandPalette: CommandPaletteStore;
    daemon?: AppHappyAgentDaemonStore;
    /** The local agent's update card; supplied with `daemon`, to the local surface only. */
    agentUpdate?: AppHappyAgentUpdateStore;
    /** What is new in the local agent's offered version; supplied with `daemon`. */
    agentReleaseNotes?: AppHappyAgentReleaseNotesStore;
    /** The local agent's outage, told beside its work; supplied with `daemon`. */
    agentOutage?: AppHappyAgentOutageStore;
    debug?: AppHappyAgentDebugStore;
    performance?: LivePerformanceStore;
    profiler?: AppHappyAgentProfilerStore;
    connectionOnboarding?: boolean;
    bridge: HappyDesktopBridge;
    browserContent?: BrowserContentRenderer;
    htmlPreview?: HtmlPreviewRenderer;
    artifactPage?: HtmlPreviewRenderer;
    mediaWindow?: MediaWindowOpener;
    experiments: ExperimentsStore;
    mobilePairingMethod: MobilePairingMethodStore;
    projectsVisibility: ProjectsVisibilityStore;
    statusBar: StatusBarStore;
    keepAwake: KeepAwakeStore;
    platform: "desktop" | "web";
    gptLive: GptLiveStore;
    usageAnalytics: UsageAnalyticsStore;
    router: HappyAgentRouter;
    navigationOrder: HappyAgentNavigationOrderStore;
    sidebarCollapse: HappyAgentSidebarCollapseStore;
    sidebarVisibility: HappyAgentSidebarVisibilityStore;
    attention: HappyAgentAttentionStore;
    happyAgents: HappyAgentDirectoryStore;
    settings: HappyAgentSettingsStore;
    titleShimmer: TitleShimmerStore;
    update?: WorkspaceUpdate;
    windowState: HappyAgentWindowStore;
}) {
    const update = props.update;
    return (
        <RouterProvider
            context={{
                appearance: props.appearance,
                ...(cloudWebSession ? { cloudWebSession } : {}),
                browserContent: props.browserContent,
                // A development window says which checkout it came from; the
                // packaged product supplies nothing and shows nothing.
                buildIdentity: props.bridge.buildIdentity,
                bugReportHost: desktopBugReportHost(props.bridge),
                commandPalette: props.commandPalette,
                connectionOnboarding: props.connectionOnboarding,
                ...(props.daemon ? { daemon: props.daemon } : {}),
                ...(props.agentUpdate ? { agentUpdate: props.agentUpdate } : {}),
                ...(props.agentReleaseNotes ? { agentReleaseNotes: props.agentReleaseNotes } : {}),
                ...(props.agentOutage ? { agentOutage: props.agentOutage } : {}),
                debug: props.debug,
                ...(props.performance ? { performance: props.performance } : {}),
                profiler: props.profiler,
                htmlPreview: props.htmlPreview,
                artifactPage: props.artifactPage,
                mediaWindow: props.mediaWindow,
                // Only the packaged shell has a door to the machine's browser;
                // a browser tab opens a link the way it opens any link.
                ...(props.platform === "desktop"
                    ? { externalLinkOpen: desktopExternalLinkOpen(props.bridge) }
                    : {}),
                ...(update
                    ? {
                          onUpdateApply: () => {
                              if (update.action === "install")
                                  desktopAction(props.bridge.updateInstall());
                              else window.location.reload();
                          },
                          update: update.snapshot,
                      }
                    : {}),
                experiments: props.experiments,
                mobilePairingMethod: props.mobilePairingMethod,
                projectsVisibility: props.projectsVisibility,
                statusBar: props.statusBar,
                gptLive: props.gptLive,
                usageAnalytics: props.usageAnalytics,
                keepAwake: props.keepAwake,
                navigationOrder: props.navigationOrder,
                sidebarCollapse: props.sidebarCollapse,
                sidebarVisibility: props.sidebarVisibility,
                attention: props.attention,
                platform: props.platform,
                happyAgents: props.happyAgents,
                settings: props.settings,
                titleShimmer: props.titleShimmer,
                windowState: props.windowState,
            }}
            router={props.router}
        />
    );
}

/**
 * First-run setup, while there is any of it left to do.
 *
 * Within local mode it does own the whole window until the machine can actually
 * run Happy Agent and the person has answered the questions that follow, so the
 * workspace below is never mounted against a machine that is not ready. Which
 * stage is on is the main process's answer, so a restart, an interrupted
 * install, or a Happy Agent that disappeared resumes here rather than in a remembered
 * position.
 */
function DesktopOnboardingGate(props: {
    appearance: AppearanceStore;
    bridge: HappyDesktopBridge;
    children: ReactNode;
    clock: HappyAgentClockStore;
    experiments: ExperimentsStore;
    happyAgents: HappyAgentDirectoryStore;
    mobilePairingMethod: MobilePairingMethodStore;
    platform: "desktop" | "web";
    store: LocalOnboardingStore;
}) {
    const snapshot = useSyncExternalStore(props.store.subscribe, props.store.get, props.store.get);
    // The machine being set up, once its Happy Agent has said who it is.
    const node = useSyncExternalStore(
        props.happyAgents.subscribe,
        () =>
            props.happyAgents.get().happyAgents.find((entry) => entry.id === LOCAL_HAPPY_AGENT_ID)
                ?.node,
        () =>
            props.happyAgents.get().happyAgents.find((entry) => entry.id === LOCAL_HAPPY_AGENT_ID)
                ?.node,
    );
    const appearance = useSyncExternalStore(
        props.appearance.subscribe,
        props.appearance.get,
        props.appearance.get,
    );
    const methodSnapshot = useSyncExternalStore(
        props.mobilePairingMethod.subscribe,
        props.mobilePairingMethod.get,
        props.mobilePairingMethod.get,
    );
    const experiments = useSyncExternalStore(
        props.experiments.subscribe,
        props.experiments.get,
        props.experiments.get,
    );
    // Until Direct is turned on in Experiments, pairing is Relay alone.
    const relayOnly = !experiments.directConnection;
    const method = relayOnly ? "relay" : methodSnapshot.method;
    const view = snapshot.onboarding ? localOnboardingView(snapshot) : undefined;
    const linkPhase =
        view?.kind === "happy-mobile-desktop" && view.step.kind === "link"
            ? view.step.phase
            : undefined;
    // Linking offers both methods; the direct connector is read only while Direct shows.
    const linking = linkPhase !== undefined || view?.kind === "happy-mobile-pairing";
    const pairingOptions = useAppMobilePairingOptions({
        layout: "setup",
        method,
        relayOnly,
        // Choosing Direct asks for a direct code.
        onMethodSelect: (next) => {
            if (next === "direct") props.store.happyMobileDirect().pairingOpen();
            props.mobilePairingMethod.methodSelect(next, "onboarding");
        },
        relay: linkPhase
            ? appMobileRelayFromLink(linkPhase)
            : snapshot.happyMobile
              ? appMobileRelayFromOnboarding(snapshot.happyMobile)
              : { kind: "starting" },
        onRelayRetry: () => props.store.happyMobileConnect(),
        direct:
            linking && method === "direct"
                ? props.store.happyMobileDirect()
                : happyAgentMobileConnectorStoreUnfollowed,
        clock: props.clock,
        online: () => true,
    });
    // Nothing has answered yet, so nothing is known to be owed. On an ordinary
    // launch the boot cover holds the window meanwhile; a first launch spends
    // that time on the welcome.
    if (!snapshot.onboarding) return null;
    const reached = localOnboardingReachedStage(snapshot);
    const current = view ? localOnboardingStage(view) : undefined;
    const order: readonly OnboardingStage[] = [
        "setup",
        "subscriptions",
        "sandbox",
        "get-app",
        "connect-phone",
    ];
    const behind = (stage: OnboardingStage) =>
        current !== undefined && order.indexOf(stage) < order.indexOf(current);
    // Back to Setup or Subscriptions from any later step, and, while Setup is
    // being looked at again, forward to where the sequence actually stands —
    // which is what that page's Continue does too. Subscriptions revisited
    // offers no jump ahead: its own Continue is held until a sign-in works.
    const forward =
        view?.kind === "agent-ready" && reached && reached !== "setup" ? reached : undefined;
    const selectable: readonly OnboardingStage[] = [
        ...(["setup", "subscriptions"] as const).filter(behind),
        ...(forward ? [forward] : []),
    ];
    // The interface is the final onboarding step. Keep the sidebar (+) usable
    // while Chief of Staff's unsent draft is being prepared in the background.
    if (!view || view.kind === "finishing")
        return (
            <SetupHandoff
                error={view?.message}
                busy={view?.busy}
                onRetry={() => props.store.chiefOfStaffSetup()}
            >
                {props.children}
            </SetupHandoff>
        );
    return (
        <LocalOnboardingScreen
            appearance={appearance.mode}
            {...(node
                ? {
                      node: {
                          name: node.name,
                          // The installation names no ID of its own, so its
                          // placeholder is picked by the name it goes by.
                          placeholderSeed: node.name,
                          ...(node.avatar ? { imageUrl: node.avatar.url } : {}),
                      },
                  }
                : {})}
            showSteps
            onAssistantsContinue={() => props.store.assistantsContinue()}
            onSandboxSetup={() => props.store.sandboxSetup()}
            {...(snapshot.onboarding.sandboxStep ? { sandboxStep: true } : {})}
            onConnectRetry={() => props.store.connectRetry()}
            onAgentUpdate={() => props.store.agentUpdate()}
            onHappyMobileConnect={() => props.store.happyMobileConnect()}
            onHappyMobileSkip={() => props.store.happyMobileSkip()}
            happyMobilePairingOptions={pairingOptions}
            onStageSelect={(stage) => {
                if (stage === forward) props.store.assistantsContinue();
                else if (stage === "setup" || stage === "subscriptions")
                    props.store.stepBack(stage);
            }}
            selectableStages={selectable}
            onAssistantSignIn={(id) => props.store.assistantSignIn(id)}
            onAssistantInstall={(id) => props.store.assistantInstall(id)}
            onAssistantConnectCancel={(id) => props.store.assistantConnectCancel(id)}
            onClaudeTokenSubmit={(token) => props.store.claudeSetupTokenSave(token)}
            onClaudeTokenReset={() => props.store.claudeSetupTokenReset()}
            onExternalOpen={
                props.platform === "desktop"
                    ? desktopExternalLinkOpen(props.bridge)
                    : (url) => window.open(url, "_blank", "noopener,noreferrer")
            }
            view={view}
        />
    );
}

/**
 * What Happy says for itself before it has been set up, in the order it says it.
 *
 * The words live here rather than in the component because they are the product
 * talking, not a layout: `WelcomeScreen` owns the centred column, the slideshow,
 * and the button, and this is the only place that decides what any of it means.
 * The order is the value hierarchy, not a feature tour. The mark names the
 * category and carries the whole summary: the whole team and every AI in one
 * open-source app, on desktop and on mobile. The next two slides
 * make the differentiators concrete — the team inside the live session first,
 * then every agent mixed in one harness. Open source and being yours to change
 * close the deck with who controls the product.
 */

/** True while the runtime is working on, or running, this machine's own Happy Agent. */
/** Counts setup's pairing codes down. It ticks only while one is on screen. */
const onboardingClock = happyAgentClockStoreCreate();

function desktopLocalPhase(snapshot: DesktopRuntimeSnapshot): boolean {
    if (snapshot.phase === "choosing" || snapshot.phase === "off") return false;
    if (snapshot.phase === "ready") return snapshot.mode === "local";
    return snapshot.request.mode === "local";
}

/**
 * Whether first-run setup holds this machine's surface, read the way
 * `DesktopOnboardingGate` decides it. Chief of Staff's handoff is the
 * workspace, so it no longer counts.
 */
function desktopLocalSetupShown(snapshot: LocalOnboardingViewSnapshot): boolean {
    if (!snapshot.runtime || !desktopLocalPhase(snapshot.runtime) || !snapshot.onboarding)
        return false;
    const view = localOnboardingView(snapshot);
    return view !== undefined && view.kind !== "finishing";
}

interface DesktopRendererProps {
    connectionUis: ReadonlyMap<string, DesktopConnectionUi>;
    appearance: AppearanceStore;
    commandPalette: CommandPaletteStore;
    daemon?: AppHappyAgentDaemonStore;
    debug: AppHappyAgentDebugStore;
    performance?: LivePerformanceStore;
    profiler: AppHappyAgentProfilerStore;
    onboarding: LocalOnboardingStore;
    browserContent?: BrowserContentRenderer;
    htmlPreview?: HtmlPreviewRenderer;
    artifactPage?: HtmlPreviewRenderer;
    mediaWindow?: MediaWindowOpener;
    bridge: HappyDesktopBridge;
    experiments: ExperimentsStore;
    mobilePairingMethod: MobilePairingMethodStore;
    projectsVisibility: ProjectsVisibilityStore;
    statusBar: StatusBarStore;
    gptLive: GptLiveStore;
    usageAnalytics: UsageAnalyticsStore;
    /** The sidebar's "+" to Happy Cloud; absent on a shell that cannot sign in to servers. */
    cloudConnect?: DesktopCloudConnectStore;
    keepAwake: KeepAwakeStore;
    navigationOrder: HappyAgentNavigationOrderStore;
    sidebarCollapse: HappyAgentSidebarCollapseStore;
    sidebarVisibility: HappyAgentSidebarVisibilityStore;
    attention: HappyAgentAttentionStore;
    platform: "desktop" | "web";
    happyAgentRouter: HappyAgentRouter;
    happyAgents: HappyAgentDirectoryStore;
    settings: HappyAgentSettingsStore;
    titleShimmer: TitleShimmerStore;
    startupValues: StartupValuesStore;
    store: DesktopRuntimeStore;
    welcome: WelcomeStore;
    localWebUpdate: LocalWebUpdateStore;
    windowState: HappyAgentWindowStore;
    /**
     * What each connection surface lays out against: the window itself, or
     * the closed-inset arrangement while the connection rail owns the left edge.
     */
    surfaceWindowState: HappyAgentWindowStore;
    /** The local agent's update as the footer card tells it, held until it is connected again. */
    agentUpdate: AppHappyAgentUpdateStore;
    /** What is new in the local agent's offered version, read once a newer one is known. */
    agentReleaseNotes: AppHappyAgentReleaseNotesStore;
    /** Whether the local Happy Agent is broken badly enough to own the whole window. */
    agentBroken: DesktopAgentBrokenStore;
    /** The same outage once the window has reached the agent, told beside its work. */
    agentOutage: AppHappyAgentOutageStore;
}

/**
 * The desktop's own screens: choosing where Happy should run, the startup and
 * failure states of that choice, and the workspace once a machine is connected.
 * First-run setup is layered over this rather than built into it, so the choice
 * itself is always reachable.
 */
function DesktopRenderer(props: DesktopRendererProps) {
    const welcome = useSyncExternalStore(
        props.welcome.subscribe,
        props.welcome.get,
        props.welcome.get,
    );
    const appearance = useSyncExternalStore(
        props.appearance.subscribe,
        props.appearance.get,
        props.appearance.get,
    );
    // A first launch opens on the welcome itself. It needs nothing from the
    // machine, so it is not held behind the boot cover while the main process
    // works out what this machine still owes. Entering setup acknowledges it and
    // enables the renderer-owned automatic download and launch.
    if (!welcome.welcomeAcknowledged)
        return (
            <WelcomeScreen
                appearance={appearance.mode}
                backdrop={{ kind: "sky" }}
                onAction={() => {
                    desktopBootSkip();
                    props.onboarding.agentSetupBegin();
                    props.welcome.welcomeAcknowledge();
                }}
                onAppearanceChange={(mode) => props.appearance.appearanceSelect(mode)}
                // Someone who only uses Happy Cloud goes straight there and
                // this computer is never set up to run a Happy Agent. The start
                // page stays behind the sheet until a team is connected, so
                // Back lands on it again.
                {...(props.cloudConnect
                    ? {
                          secondaryAction: {
                              label: "Connect to Happy Cloud",
                              onAction: () => props.cloudConnect?.welcomeConnectOpen(),
                          },
                      }
                    : {})}
                slides={happyAgentWelcomeSlides}
            />
        );
    return (
        // Outside every screen below, so one mark spans the whole run-up to a
        // workspace instead of being unmounted and remounted as the window moves
        // between the screens that boot crosses.
        <DesktopBootGate
            onboarding={props.onboarding}
            happyAgents={props.happyAgents}
            runtime={props.store}
        >
            <DesktopScreens {...props} />
        </DesktopBootGate>
    );
}

function DesktopScreens(props: DesktopRendererProps) {
    const directory = useSyncExternalStore(
        props.happyAgents.subscribe,
        props.happyAgents.get,
        props.happyAgents.get,
    );
    const sidebarVisibility = useSyncExternalStore(
        props.sidebarVisibility.subscribe,
        props.sidebarVisibility.get,
        props.sidebarVisibility.get,
    );
    const projectsVisibility = useSyncExternalStore(
        props.projectsVisibility.subscribe,
        props.projectsVisibility.get,
        props.projectsVisibility.get,
    );
    const attention = useSyncExternalStore(
        props.attention.subscribe,
        props.attention.get,
        props.attention.get,
    );
    // Only which machine a voice call points into: the call's transcript moves
    // many times a second and must not re-render the shell.
    const voiceFocusConnectionId = useSyncExternalStore(
        props.gptLive.subscribe,
        () => props.gptLive.get().voiceFocus?.target.connectionId,
        () => props.gptLive.get().voiceFocus?.target.connectionId,
    );
    // Only whether setup holds the window: its download progress moves many
    // times a second and must not re-render the shell either.
    const localSetupShown = useSyncExternalStore(
        props.onboarding.subscribe,
        () => desktopLocalSetupShown(props.onboarding.get()),
        () => desktopLocalSetupShown(props.onboarding.get()),
    );
    // First-run setup owns the window. With no other machine to switch to, the
    // rail would only offer Home and a "+" beside it, so it stays away until
    // setup hands over to the workspace.
    const railHidden =
        sidebarVisibility.hidden ||
        (localSetupShown &&
            directory.happyAgents.every((entry) => entry.id === LOCAL_HAPPY_AGENT_ID));
    // Someone who only uses Happy Cloud never set this computer up to run a
    // Happy Agent; while a Cloud server is there, this computer has no place in
    // the rail and the first server stands in for it.
    const localOff = useSyncExternalStore(
        props.store.subscribe,
        () => props.store.get()?.phase === "off",
        () => props.store.get()?.phase === "off",
    );
    const firstRemote = directory.happyAgents.find((entry) => entry.id !== LOCAL_HAPPY_AGENT_ID);
    const localHidden = localOff && firstRemote !== undefined;
    const activeId =
        localHidden &&
        (directory.activeHappyAgentId ?? LOCAL_HAPPY_AGENT_ID) === LOCAL_HAPPY_AGENT_ID
            ? firstRemote.id
            : (directory.activeHappyAgentId ?? LOCAL_HAPPY_AGENT_ID);
    const main = props.connectionUis.get(LOCAL_HAPPY_AGENT_ID);
    const surfaceWindowState = props.surfaceWindowState;
    // An update of the local daemon does not take the window: the shell stays
    // usable, and the update is told on a card in the local sidebar's footer.
    // A local Happy Agent that is broken does take it: every machine reaches
    // this window through it, so nothing in the layout would work.
    return (
        <DesktopAgentBrokenGate store={props.agentBroken}>
            <ConnectionShell
                items={(localHidden
                    ? directory.happyAgents.filter((entry) => entry.id !== LOCAL_HAPPY_AGENT_ID)
                    : directory.happyAgents
                ).map((entry) => {
                    // Muted bots remain listed and working; hidden bots leave this set.
                    const listed = happyAgentListedConversations(
                        entry,
                        projectsVisibility,
                        attention,
                    );
                    const cloudName = cloudServerNameOf(entry.id);
                    return {
                        id: entry.id,
                        ...(cloudName === undefined ? {} : { placeholderSeed: cloudName }),
                        // The rail names a machine the way its own daemon does. The
                        // host's roster name stands in until that daemon has answered.
                        label: entry.node?.name ?? entry.label,
                        local: entry.id === LOCAL_HAPPY_AGENT_ID,
                        status: entry.status,
                        working: listed.some((conversation) => conversation.activity === "running"),
                        unread:
                            happyAgentEntryUnreadCount(entry, projectsVisibility, attention) > 0,
                        ...(entry.node?.avatar ? { avatar: entry.node.avatar } : {}),
                        // A call pointing into a machine not on screen is said on its
                        // rail button, the one place that machine is visible.
                        ...(voiceFocusConnectionId === entry.id && entry.id !== activeId
                            ? { voiceFocus: true }
                            : {}),
                    };
                })}
                selectedId={activeId}
                onSelect={props.happyAgents.happyAgentActivate}
                itemMenuItems={(item) => [
                    ...completionSoundMenuItems(
                        happyAgentAttentionConnection(attention, item.id).completionSound,
                    ),
                    ...(props.cloudConnect && cloudServerConnectionOf(item.id) !== undefined
                        ? CLOUD_SERVER_MENU_ITEMS
                        : []),
                ]}
                onItemMenuSelect={(id, actionId) => {
                    const sound = completionSoundOf(actionId);
                    if (sound) props.attention.completionSoundUpdate(id, sound);
                    const cloud = props.bridge.happyCloud;
                    const connectionId = cloudServerConnectionOf(id);
                    if (!cloud || connectionId === undefined) return;
                    if (actionId === CLOUD_SIGN_OUT_ACTION) void cloud.accountSignOut();
                    if (actionId === CLOUD_SERVER_SIGN_OUT_ACTION) {
                        const name = happyCloudServerNameOf(connectionId);
                        if (name !== undefined) void cloud.serverSignOut(name);
                    }
                    if (actionId === CLOUD_REMOVE_ACTION) {
                        const name = happyCloudServerNameOf(connectionId);
                        if (name === undefined) return;
                        void cloud.serverRemove(name).then(() => {
                            props.happyAgents.happyAgentCloudForget?.(connectionId);
                        });
                    }
                }}
                onReorder={
                    directory.happyAgents.some(
                        (entry) =>
                            entry.id === LOCAL_HAPPY_AGENT_ID && entry.status === "connected",
                    )
                        ? props.happyAgents.happyAgentReorder
                        : undefined
                }
                reordering={directory.reordering}
                reorderError={directory.reorderError}
                windowControls={props.platform === "desktop"}
                collapsed={railHidden}
                error={directory.error}
                {...(props.cloudConnect
                    ? {
                          add: {
                              label: "Connect to Happy Cloud",
                              onAdd: props.cloudConnect.connectOpen,
                          },
                      }
                    : {})}
            >
                <ConnectionSurface
                    key={LOCAL_HAPPY_AGENT_ID}
                    active={activeId === LOCAL_HAPPY_AGENT_ID}
                >
                    <DesktopLocalScreens
                        {...props}
                        happyAgents={main?.directory ?? props.happyAgents}
                        windowState={surfaceWindowState}
                    />
                </ConnectionSurface>
                {directory.happyAgents
                    .filter((entry) => entry.id !== LOCAL_HAPPY_AGENT_ID)
                    .map((entry) => {
                        const ui = props.connectionUis.get(entry.id);
                        if (!ui) return null;
                        return (
                            <ConnectionSurface key={entry.id} active={activeId === entry.id}>
                                <HappyAgentBoundary
                                    appearance={props.appearance}
                                    bridge={props.bridge}
                                    browserContent={props.browserContent}
                                    commandPalette={ui.commandPalette}
                                    connectionOnboarding
                                    experiments={props.experiments}
                                    mobilePairingMethod={props.mobilePairingMethod}
                                    projectsVisibility={props.projectsVisibility}
                                    statusBar={props.statusBar}
                                    gptLive={props.gptLive}
                                    usageAnalytics={props.usageAnalytics}
                                    keepAwake={props.keepAwake}
                                    htmlPreview={props.htmlPreview}
                                    artifactPage={props.artifactPage}
                                    mediaWindow={props.mediaWindow}
                                    navigationOrder={ui.navigationOrder}
                                    sidebarCollapse={ui.sidebarCollapse}
                                    sidebarVisibility={ui.sidebarVisibility}
                                    attention={props.attention}
                                    platform={props.platform}
                                    router={ui.router}
                                    happyAgents={ui.directory}
                                    settings={ui.settings}
                                    titleShimmer={props.titleShimmer}
                                    windowState={surfaceWindowState}
                                />
                            </ConnectionSurface>
                        );
                    })}
            </ConnectionShell>
        </DesktopAgentBrokenGate>
    );
}

function DesktopLocalScreens(props: DesktopRendererProps) {
    const snapshot = useSyncExternalStore(props.store.subscribe, props.store.get, props.store.get);
    const hostedUpdate = useSyncExternalStore(
        props.localWebUpdate.subscribe,
        props.localWebUpdate.get,
        props.localWebUpdate.get,
    );
    const content = (
        <DesktopProtocolGate
            // A runtime that is still choosing, starting, or failing answers for
            // itself, and those screens are the more actionable ones: a version
            // gap learned from an earlier connection must not talk over the
            // reason this one is not up. The gate stays mounted across that so
            // the workspace below it is never rebuilt by the change.
            ready={snapshot?.phase === "ready"}
            happyAgents={props.happyAgents}
            {...(props.daemon ? { daemon: props.daemon } : {})}
        >
            <DesktopRuntimeContent {...props} hostedUpdate={hostedUpdate} snapshot={snapshot} />
        </DesktopProtocolGate>
    );
    // Local setup gates the workspace until this machine can run Happy Agent.
    const gated =
        !snapshot || !desktopLocalPhase(snapshot) ? (
            content
        ) : (
            <DesktopOnboardingGate
                appearance={props.appearance}
                bridge={props.bridge}
                clock={onboardingClock}
                experiments={props.experiments}
                happyAgents={props.happyAgents}
                mobilePairingMethod={props.mobilePairingMethod}
                platform={props.platform}
                store={props.onboarding}
            >
                {content}
            </DesktopOnboardingGate>
        );
    return gated;
}

/**
 * The window when this build and the host's Happy Agent cannot read each other.
 *
 * Every other unavailability in Happy belongs beside the Happy Agent it affects, and
 * this one deliberately does not. A version gap is not a connection that might
 * come back: the daemon is up, answering, and speaking a protocol this build has
 * no code for, so nothing behind this screen would work and nothing anyone does
 * in it would change that. Waiting is not one of the options, which is why it is
 * not shown as a state to wait in.
 *
 * It is the host alone. A node with the same gap is one machine of several
 * whose work is missing while the rest of the app still does its job, so that
 * stays a notice beside that node.
 */
function DesktopProtocolGate(props: {
    children: ReactNode;
    daemon?: AppHappyAgentDaemonStore;
    /** False while the runtime still owns the window with a screen of its own. */
    ready: boolean;
    happyAgents: HappyAgentDirectoryStore;
}) {
    const directory = useSyncExternalStore(
        props.happyAgents.subscribe,
        props.happyAgents.get,
        props.happyAgents.get,
    );
    const daemonStore = props.daemon ?? unavailableDaemonStore;
    const daemon = useSyncExternalStore(daemonStore.subscribe, daemonStore.get, daemonStore.get);
    const mismatch = props.ready
        ? directory.happyAgents.find((happyAgent) => happyAgent.id === LOCAL_HAPPY_AGENT_ID)
              ?.protocolMismatch
        : undefined;
    if (!mismatch) return <>{props.children}</>;
    const upgrading = daemon.operation === "upgrading";
    return (
        <SetupPage
            {...(daemon.updateAvailable || upgrading
                ? {
                      action: {
                          busy: upgrading,
                          label: upgrading
                              ? "Updating Happy Agent…"
                              : `Update to ${daemon.availableVersion ?? "latest"}`,
                          onSelect: daemonStore.daemonUpgrade,
                          width: 280,
                      },
                  }
                : {})}
            copy={`${mismatch.message} ${
                !daemon.managed
                    ? "This daemon is supplied by an external development environment; update it there and reconnect."
                    : daemon.error
                      ? `Happy could not check for its update: ${daemon.error}`
                      : daemon.updateAvailable || upgrading
                        ? "Install the verified update to reconnect with the current protocol."
                        : "Happy is checking for a compatible update automatically."
            }`}
            data-testid="desktop-protocol-screen"
            scene="owl"
            title="Happy Agent is out of date"
        />
    );
}

const unavailableDaemonSnapshot = {
    install: { phase: "idle" },
    managed: false,
    operation: "idle",
    runtime: "stopped",
    updateAvailable: false,
    versions: [],
} as const;
const unavailableDaemonStore: AppHappyAgentDaemonStore = {
    daemonCheck: () => undefined,
    daemonInstall: () => undefined,
    daemonInstallDismiss: () => undefined,
    daemonInstallKill: () => undefined,
    daemonRestart: () => undefined,
    daemonUpgrade: () => undefined,
    daemonVersionSelect: () => undefined,
    get: () => unavailableDaemonSnapshot,
    subscribe: () => () => undefined,
};

/**
 * This computer's place in the rail while it runs no Happy Agent. Nothing is
 * started until the person asks for it here; Happy Cloud works without it.
 */
function DesktopLocalOffScreen(props: {
    cloudConnect?: DesktopCloudConnectStore;
    onboarding: LocalOnboardingStore;
}) {
    const setup = useSyncExternalStore(
        props.onboarding.subscribe,
        props.onboarding.get,
        props.onboarding.get,
    );
    return (
        <SetupPage
            action={{
                busy: setup.pending === true,
                label: "Set up this computer",
                onSelect: () => props.onboarding.agentSetupBegin(),
            }}
            copy="Set up Happy Agent to run agents on this computer's files and tools. Happy Cloud works without it."
            data-testid="desktop-local-off-screen"
            scene="cloud-variation"
            {...(setup.failure ? { status: { label: setup.failure.message } } : {})}
            {...(props.cloudConnect
                ? {
                      secondary: {
                          label: "Connect to Happy Cloud",
                          onSelect: props.cloudConnect.connectOpen,
                      },
                  }
                : {})}
            title="Happy Agent isn't running here"
        />
    );
}

function DesktopRuntimeContent(
    props: DesktopRendererProps & {
        hostedUpdate: LocalWebUpdateSnapshot;
        snapshot: DesktopRuntimeSnapshot | undefined;
    },
) {
    const { hostedUpdate, snapshot } = props;
    const directory = useSyncExternalStore(
        props.happyAgents.subscribe,
        props.happyAgents.get,
        props.happyAgents.get,
    );
    const materialized = directory.happyAgents.some((entry) => entry.session !== undefined);
    if (snapshot?.phase === "off")
        return (
            <DesktopLocalOffScreen
                {...(props.cloudConnect ? { cloudConnect: props.cloudConnect } : {})}
                onboarding={props.onboarding}
            />
        );
    if (!snapshot && !materialized)
        return (
            <DesktopStartupScreen
                message="Reading desktop settings…"
                onChange={() => undefined}
                onSubmit={() => undefined}
                phase="starting"
                values={desktopStartupValues()}
            />
        );
    if (snapshot?.phase === "choosing" && !materialized)
        return (
            <ChoosingScreen
                bridge={props.bridge}
                update={snapshot.update}
                values={props.startupValues}
            />
        );
    if (snapshot?.phase === "starting" && !materialized)
        return (
            <DesktopStartupScreen
                message={snapshot.message}
                onChange={() => undefined}
                onInstallUpdate={() => desktopAction(props.bridge.updateInstall())}
                onSubmit={() => undefined}
                phase="starting"
                update={snapshot.update}
                values={desktopStartupValues(snapshot.request)}
            />
        );
    if (snapshot?.phase === "error" && !materialized)
        return (
            <DesktopStartupScreen
                error={snapshot.message}
                onChange={() => undefined}
                onInstallUpdate={() => desktopAction(props.bridge.updateInstall())}
                onRetry={
                    snapshot.retryable
                        ? () => desktopAction(props.bridge.runtimeRetry())
                        : undefined
                }
                onSubmit={() => undefined}
                phase="error"
                update={snapshot.update}
                values={desktopStartupValues(snapshot.request)}
            />
        );

    return (
        <HappyAgentBoundary
            appearance={props.appearance}
            bridge={props.bridge}
            commandPalette={props.commandPalette}
            // The web app's one connection is a Happy Cloud server, which
            // admits a member only once their profile is saved.
            connectionOnboarding={cloudWeb}
            {...(props.daemon
                ? {
                      agentOutage: props.agentOutage,
                      agentReleaseNotes: props.agentReleaseNotes,
                      agentUpdate: props.agentUpdate,
                      daemon: props.daemon,
                  }
                : {})}
            debug={props.debug}
            {...(props.performance ? { performance: props.performance } : {})}
            profiler={props.profiler}
            browserContent={props.browserContent}
            htmlPreview={props.htmlPreview}
            artifactPage={props.artifactPage}
            mediaWindow={props.mediaWindow}
            experiments={props.experiments}
            mobilePairingMethod={props.mobilePairingMethod}
            projectsVisibility={props.projectsVisibility}
            statusBar={props.statusBar}
            keepAwake={props.keepAwake}
            gptLive={props.gptLive}
            usageAnalytics={props.usageAnalytics}
            navigationOrder={props.navigationOrder}
            sidebarCollapse={props.sidebarCollapse}
            sidebarVisibility={props.sidebarVisibility}
            attention={props.attention}
            platform={props.platform}
            router={props.happyAgentRouter}
            happyAgents={props.happyAgents}
            settings={props.settings}
            titleShimmer={props.titleShimmer}
            update={snapshot ? workspaceUpdate(snapshot.update, hostedUpdate) : undefined}
            windowState={props.windowState}
        />
    );
}

// Browser-local dev mode is signalled by a CSP-safe meta tag the dev server
// injects (an inline script would be blocked by the page's script-src policy).
// The cloud web app is a browser tab too, with its own server as the bridge's
// Happy Agent.
const browserLocal =
    cloudWeb ||
    document.querySelector('meta[name="happy-browser-local"]')?.getAttribute("content") === "1";
/** The cloud web app's own server, switching and signing out, for Settings. */
const cloudWebSession = cloudWeb
    ? {
          serverName: window.location.hostname.split(".")[0] ?? window.location.hostname,
          onServerSwitch: () => window.location.assign(CLOUD_WEB_PICKER_URL),
          onSignOut: () => void cloudWebSignOut(),
      }
    : undefined;
const bridge =
    window.happyDesktop ??
    (cloudWeb ? cloudWebBridgeCreate() : browserLocal ? browserDevBridgeCreate() : undefined);
desktopRowHeightCheckInstall();
const root = createRoot(document.getElementById("root")!);
// The cloud web app has no session, on a first visit or after one ended (its
// data is then already being erased): the whole page becomes the way to sign in,
// with nothing else on it.
if (cloudWeb) {
    cloudWebPaymentsReturn();
    const signIn = cloudWebSignInStoreCreate();
    cloudWebSessionEndSubscribe(() =>
        root.render(
            <DesktopAppearance appearance={appearanceStoreCreate()}>
                <CloudWebSignedOut store={signIn} />
            </DesktopAppearance>,
        ),
    );
}
// A todo list is laid over a picture; fetching and decoding both of them now
// means opening a list paints its background with it instead of a frame later.
happyAgentSurfaceBackdropsPreload();

/* The View menu owns zooming, so `bridge` is the only thing that hears of it.
   What is counted is how many times zoom was asked for, not what it came to:
   the count is the React key, so pressing ⌘0 twice at 100% shows the read-out
   twice, where keying on the percentage would remount nothing the second time
   and leave the fade to finish silently. Zero asks is a cold start, which shows
   nothing. The percentage is written in the same tick as the count. */
let zoomAsks = 0;
let zoomPercent = 100;
const zoomSubscribe = (listener: () => void) => {
    if (!bridge) return () => {};
    return bridge.zoomSubscribe((percent) => {
        zoomAsks += 1;
        zoomPercent = percent;
        listener();
    });
};

/** The window's one Happy account sign-in notice, centered over everything else. */
function DesktopCloudSignInNotice(props: { store: DesktopCloudSignInNoticeStore }): ReactNode {
    const notice = useSyncExternalStore(props.store.subscribe, props.store.get, props.store.get);
    if (!notice) return null;
    return (
        <CloudSignInNoticeDialog
            chiefOfStaff={notice.chiefOfStaff}
            onAccountSettingsOpen={props.store.accountSettingsOpen}
            onChiefOfStaffAsk={props.store.chiefOfStaffAsk}
            onClose={props.store.noticeClose}
            onConnectionOpen={props.store.connectionOpen}
            onSignIn={props.store.signInStart}
            onTeamConnect={props.store.teamConnect}
            onTeamsCheck={props.store.teamsCheck}
            view={notice.view}
        />
    );
}
/** The sidebar "+" to Happy Cloud, full window over everything else. */
function DesktopCloudConnect(props: {
    store: DesktopCloudConnectStore;
    appearance: AppearanceStore;
}): ReactNode {
    const view = useSyncExternalStore(props.store.subscribe, props.store.get, props.store.get);
    const appearance = useSyncExternalStore(
        props.appearance.subscribe,
        props.appearance.get,
        props.appearance.get,
    );
    if (!view) return null;
    return (
        <CloudConnectScreen
            appearance={appearance.mode}
            onAgentAdd={props.store.agentAdd}
            onBack={props.store.back}
            onClose={props.store.connectCancel}
            onCloudOpen={props.store.cloudOpen}
            onContinue={props.store.connectConfirm}
            onCreate={props.store.serverCreate}
            onCreateNameChange={props.store.createNameUpdate}
            onCreateOpen={props.store.createOpen}
            onLogoPress={props.store.logoPress}
            onTestLoginChange={props.store.testLoginUpdate}
            onTestPasswordChange={props.store.testPasswordUpdate}
            onTestSignIn={props.store.testSignIn}
            onEmailOpen={props.store.emailOpen}
            onEmailChange={props.store.emailUpdate}
            onEmailCodeSend={props.store.emailCodeSend}
            onEmailCodeChange={props.store.emailCodeUpdate}
            onEmailCodeVerify={props.store.emailCodeVerify}
            onEmailCodeResend={props.store.emailCodeResend}
            onEmailChangeOpen={props.store.emailChangeOpen}
            onServerPick={props.store.serverPick}
            onServersContinue={props.store.serversContinue}
            view={view}
        />
    );
}
/** Why a Happy link from outside was not opened, centered over everything else. */
function DesktopHappyLinkNotice(props: { store: HappyLinkInboxStore }): ReactNode {
    const { notice } = useSyncExternalStore(
        props.store.subscribe,
        props.store.get,
        props.store.get,
    );
    if (!notice) return null;
    return <HappyLinkNoticeDialog onClose={props.store.noticeDismiss} view={notice} />;
}

/* The traffic lights do not zoom with the page, so the safe area reserved for
   them is divided by the page's zoom. That zoom outlives a reload (a renderer
   update, ⌘R, another window of this origin) while the View menu reports only
   its own steps, so it is read from the window itself: the page fills the
   whole window, whose width is in screen points and whose viewport is in CSS
   pixels.

   It is read only when it can have changed: at load, and when the device pixel
   ratio — the screen's scale times the zoom — moves. Never on resize: the
   browser delivers the window's new width and its new viewport separately, so
   a resize read one against the other's old value and kept that wrong zoom
   until the next resize, which after a full-screen change or a dragged edge
   put the sidebar toggle over the lights. A zoom step leaves the window as it
   is, so its width is current whenever the ratio moves. */
const windowZoomApply = () => {
    const viewport = window.visualViewport?.width ?? window.innerWidth;
    if (!(viewport > 0) || !(window.outerWidth > 0)) return;
    const zoom = Math.round((window.outerWidth / viewport) * 1000) / 1000;
    document.documentElement.style.setProperty("--happy-window-zoom", String(zoom));
};
const windowZoomWatch = () => {
    windowZoomApply();
    matchMedia(`(resolution: ${String(window.devicePixelRatio)}dppx)`).addEventListener(
        "change",
        windowZoomWatch,
        { once: true },
    );
};
windowZoomWatch();

function DesktopZoomIndicator(): ReactNode {
    const asks = useSyncExternalStore(zoomSubscribe, () => zoomAsks);
    return asks === 0 ? undefined : <ZoomIndicator key={asks} percent={zoomPercent} />;
}
// The preview window is this same document, launched with the reduced bridge and
// loaded with the view it should mount. Deciding it here rather than after a
// round trip means the first frame is already the file instead of the whole
// application appearing for a beat.
const mediaPreviewBridge =
    new URLSearchParams(location.search).get(mediaPreviewView.key) === mediaPreviewView.value
        ? window.happyMediaPreview
        : undefined;
if (mediaPreviewBridge) {
    const previewBridge = mediaPreviewBridge;
    desktopMediaPreviewEscapeBind(previewBridge);
    root.render(
        <DesktopAppearance appearance={appearanceStoreCreate()}>
            <DesktopMediaPreviewWindow store={desktopMediaPreviewStoreCreate(previewBridge)} />
        </DesktopAppearance>,
    );
} else if (bridge) {
    const desktopBridge = bridge;
    const guestKeyUnsubscribe = desktopBridge.guestKeySubscribe((input: DesktopGuestKeyEvent) => {
        window.dispatchEvent(
            new KeyboardEvent(input.type, {
                altKey: input.altKey,
                bubbles: true,
                cancelable: true,
                code: input.code,
                ctrlKey: input.ctrlKey,
                isComposing: input.isComposing,
                key: input.key,
                location: input.location,
                metaKey: input.metaKey,
                repeat: input.repeat,
                shiftKey: input.shiftKey,
            }),
        );
    });
    window.addEventListener("unload", guestKeyUnsubscribe, { once: true });
    /** Window-owned stores shared by every independently retained connection UI. */
    interface DesktopShellStores {
        readonly appearance: AppearanceStore;
        readonly powerSaving: DesktopPowerSaving;
        readonly daemon?: AppHappyAgentDaemonStore;
    }
    let shell: DesktopShellStores | undefined;
    /** Registrations outside React live until the window closes, including across daemon restarts. */
    const appDisposers: (() => void)[] = [];
    const appDispose = (): void => {
        for (const dispose of appDisposers.splice(0)) dispose();
    };
    window.addEventListener("unload", appDispose, { once: true });
    let latestConfig: DesktopConfig | undefined;
    let configReceive: ((config: DesktopConfig) => void) | undefined;
    // Subscribe before the initial IPC read. An event wins over an older reply.
    const configUnsubscribe = desktopBridge.desktopConfigSubscribe?.((config) => {
        latestConfig = config;
        configReceive?.(config);
    });
    if (configUnsubscribe) appDisposers.push(configUnsubscribe);
    const start = (initial: DesktopConfig): void => {
        const config = latestConfig ?? initial;
        const runtimeStore = desktopRuntimeStoreCreate(desktopBridge);
        // Whether this machine's owner has been welcomed. Acknowledging this
        // deck enters machine setup; it does not wait for machine work to finish.
        const welcome = welcomeStoreCreate(desktopWelcomePersistence());
        // The local router outlives any single daemon connection, so it is created
        // here and the session store navigates through it when a conversation it
        // created should be opened.
        const happyAgentHistory = happyAgentHistoryCreate({
            // A browser tab's address is a place people paste and share, so the
            // cloud web app follows it; the desktop window has no address bar.
            browser: cloudWeb,
            persistence: desktopHistoryPersistence(),
        });
        const happyAgentRouter = happyAgentRouterCreate(happyAgentHistory);
        // The shell's Back and Forward arrive as a direction and are walked here.
        appDisposers.push(
            desktopBridge.navigationStepSubscribe((step) => {
                const history = activeRouter().history;
                if (step.direction === "back") history.back();
                else history.forward();
            }),
        );
        // Chromium acts on macOS side buttons after mouseup, before auxclick is
        // guaranteed to arrive. Claim them in capture so only our stack moves.
        const sideButtonWalk = (event: MouseEvent): void => {
            if (event.button !== 3 && event.button !== 4) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            const history = activeRouter().history;
            if (event.button === 3) history.back();
            else history.forward();
        };
        window.addEventListener("mouseup", sideButtonWalk, { capture: true });
        appDisposers.push(() =>
            window.removeEventListener("mouseup", sideButtonWalk, { capture: true }),
        );
        // Appearance, title motion, and model choices share one durable desktop
        // document. The adapter keeps its current value synchronous so writes
        // from any product store preserve changes already made by the others.
        const preferences = desktopPreferencesCreate(desktopBridge, config);
        let appearanceReceive: ((config: DesktopConfig) => void) | undefined;
        // Appearance is chosen for the window and shared by all connection UIs.
        shell ??= ((): DesktopShellStores => {
            const { store: created, writer } = appearanceStoreOwnedCreate({
                mode: preferences.initialAppearance,
                customTheme: config.customTheme ?? customThemeEmpty,
                supportedModes:
                    desktopBridge.desktopConfigSubscribe && desktopBridge.desktopConfigUpdate
                        ? ["system", "dark", "light", "midnight", "custom"]
                        : ["system", "dark", "light"],
                scrollbarVisibility: preferences.initialScrollbarVisibility,
                avatarsAnimated: desktopAvatarsAnimated.read(),
            });
            appearanceReceive = (next) =>
                writer.configReceived({
                    mode: next.appearance,
                    customTheme: next.customTheme ?? customThemeEmpty,
                    scrollbarVisibility: next.scrollbarVisibility,
                });
            desktopAppearanceSynchronize(created, desktopBridge);
            created.subscribe(() => {
                const snapshot = created.get();
                preferences.appearanceChanged(snapshot.mode, snapshot.scrollbarVisibility);
                if (snapshot.avatarsAnimated !== desktopAvatarsAnimated.read())
                    desktopAvatarsAnimated.write(snapshot.avatarsAnimated);
            });
            const store = browserLocal ? undefined : desktopDaemonStoreCreate(desktopBridge);
            return {
                appearance: created,
                powerSaving: desktopPowerSavingCreate(desktopBridge),
                ...(store ? { daemon: store } : {}),
            };
        })();
        const { appearance, daemon, powerSaving } = shell;
        const debug = desktopDebugStoreCreate(desktopBridge);
        const livePerformance = desktopBridge.debugMetricsEnabled
            ? desktopMetricsStoreCreate()
            : undefined;
        const profiler = desktopProfilerStoreCreate(desktopBridge);
        // The main connection keeps the existing desktop defaults. Remote UIs
        // receive their own settings and model preference persistence below.
        const {
            store: settings,
            modelPreferencesChanged,
            settingsReceived,
        } = happyAgentSettingsStoreOwnedCreate(preferences.initialSettings);
        appDisposers.push(settings.subscribe(() => preferences.settingsChanged(settings.get())));
        // How the reader arranged the sidebar's pinned rows. It is the window's
        // Those rows are window chrome whether or not any machine is reachable,
        // so the arrangement must outlive every connection this window makes.
        const navigationOrder = happyAgentNavigationOrderStoreCreate(
            desktopNavigationOrderPersistence(),
        );
        // Which projects the reader folded shut, kept beside that arrangement
        // and for the same reason: a fold is about this window's
        // sidebar, so no machine coming or going may undo it.
        const sidebarCollapse = happyAgentSidebarCollapseStoreCreate(
            desktopSidebarCollapsePersistence(),
        );
        // Whether the window's left side — sidebar and connection rail — is
        // folded away. Also the window's own: switching machines does not
        // bring the sidebar back, and the rail beside it goes with it.
        const sidebarVisibility = happyAgentSidebarVisibilityStoreCreate();
        // Which bots the person muted or hid and when each connection chimes.
        // Each connection's Happy Agent keeps them as the person's own user
        // settings, followed below as every connection opens; the window keeps
        // the last of them it knew, and its unsent changes, so a machine going
        // offline and coming back finds every choice where it was left.
        const {
            store: attention,
            connectionFollow: attentionFollow,
            connectionForget: attentionForget,
        } = happyAgentAttentionStoreOwnedCreate({ persistence: desktopAttentionPersistence() });
        // Whether this window offers the features that are not finished yet. It
        // is kept beside the arrangement above and for the same reason: it says
        // what this installation shows, so no machine has a say in it.
        const experiments = experimentsStoreCreate(desktopExperimentsPersistence());
        // Which way the open pairing page shows: what the person picked on
        // it, else this computer's default. Nothing is kept between pages.
        const mobilePairingMethod = mobilePairingMethodStoreCreate({
            defaultMethod: mobilePairingMethodDefault(desktopOs()),
            onOutput: (output) => analytics.mobilePairingMethodSelected(output),
        });
        // Each authenticated daemon owns project visibility, like bot attention.
        const { store: projectsVisibility, connectionFollow: projectsVisibilityFollow } =
            projectsVisibilityStoreOwnedCreate({
                persistence: desktopProjectsVisibilityPersistence(),
                legacyLocal: {
                    connectionId: LOCAL_HAPPY_AGENT_ID,
                    consume: desktopProjectsVisibilityLegacyConsume,
                },
            });
        // Which optional controls the status bar shows: the window's own choice.
        const statusBar = statusBarStoreCreate(desktopStatusBarPersistence());
        // Active-title motion is also this window's own choice. The store keeps
        // the product default in memory and writes only after the reader changes
        // the switch, so untouched installations follow future defaults.
        const { store: titleShimmer, preferenceReceived: titleShimmerReceived } =
            titleShimmerStoreOwnedCreate(preferences.titleShimmerPersistence);
        // What the command palette is currently showing and asking. It is this
        // window's transient view state, so it is created here beside the other
        // window-lifetime stores and deliberately given nothing to persist: an
        // open palette is a question in progress, not a place to come back to.
        const commandPalette = commandPaletteStoreCreate();
        const connectionUis = new Map<string, DesktopConnectionUi>();
        // Every sign-in that comes back to the window becomes one centered
        // notice. A callback read before that notice's store exists, such as
        // the one that launched the app, waits here for it.
        let signInNotice: DesktopCloudSignInNoticeStore | undefined;
        const signInEventsEarly: DesktopCloudAuthEvent[] = [];
        const auth = desktopCloudAuthRouterCreate(desktopBridge, (event) => {
            if (signInNotice) signInNotice.authEventReceive(event);
            else signInEventsEarly.push(event);
        });
        appDisposers.push(auth.dispose);
        const modelPreferences = new Map<
            string,
            ReturnType<typeof desktopModelPreferencesCreate>
        >();
        const preferencesFor = (id: string): HappyAgentModelPreferencePersistence => {
            let value = modelPreferences.get(id);
            if (!value) {
                value = desktopModelPreferencesCreate(
                    id,
                    id === LOCAL_HAPPY_AGENT_ID
                        ? preferences.preferencePersistence
                        : desktopConnectionPreferencesCreate(id),
                );
                modelPreferences.set(id, value);
            }
            return value.preferences;
        };
        // Every Happy Agent in this window, each with its own product stores. The router is
        // told to resolve its address again whenever the set of connected Happy Agents
        // changes, so a machine that connects after the URL already named it opens
        // the addressed conversation without the reader navigating twice.
        // The Chief of Staff adds and removes team servers; the shell signs in
        // to each one and holds every token, so this window never sees one. A
        // shell that cannot sign in to team servers offers none of it.
        const serverSignInBegin = desktopBridge.serverSignInBegin;
        const serverSignInFinish = desktopBridge.serverSignInFinish;
        const serverSignInCancel = desktopBridge.serverSignInCancel;
        const serverSessionsGet = desktopBridge.serverSessionsGet;
        const serverSessionsSubscribe = desktopBridge.serverSessionsSubscribe;
        const serverHost =
            serverSignInBegin &&
            serverSignInFinish &&
            serverSignInCancel &&
            serverSessionsGet &&
            serverSessionsSubscribe
                ? {
                      source: serverSourceHostCreate({
                          signInBegin: serverSignInBegin,
                          signInFinish: serverSignInFinish,
                          signInCancel: serverSignInCancel,
                      }),
                      sessions: serverSessionsStoreCreate({
                          get: serverSessionsGet,
                          subscribe: serverSessionsSubscribe,
                      }),
                  }
                : undefined;
        if (serverHost) appDisposers.push(() => serverHost.sessions[Symbol.dispose]());
        const happyAgents = happyAgentDirectoryStoreCreate(desktopBridge, runtimeStore, {
            cloudHostFor: auth.hostFor,
            ...(cloudWebSession
                ? { localHappyCloud: true, localLabel: cloudWebSession.serverName }
                : {}),
            // Asked for only after the window is up, by when the inbox is.
            happyLinkReceive: (url) => happyLinkInbox.linkReceive(url),
            ...(serverHost
                ? { servers: serverHost.source, serverSessions: serverHost.sessions }
                : {}),
            // Happy Cloud is offered only by builds that are not production, the
            // hosted Nightly renderer and development windows, and only on a
            // shell that reaches it itself.
            ...(serverHost &&
            desktopBridge.happyCloud &&
            (localWebBuild !== undefined || desktopBridge.buildIdentity !== undefined)
                ? { cloud: true }
                : {}),
            attentionFollow(id, source) {
                preferencesFor(id);
                const attentionStop = attentionFollow(id, source);
                const projectsVisibilityStop = projectsVisibilityFollow(id, source);
                const modelStop = modelPreferences.get(id)?.connectionFollow(source);
                return () => {
                    attentionStop();
                    projectsVisibilityStop();
                    modelStop?.();
                };
            },
            conversationOpen: (happyAgentId, location) =>
                happyAgentRouterConversationOpen(
                    connectionUis.get(happyAgentId)?.router ?? happyAgentRouter,
                    happyAgentId,
                    location,
                ),
            groupOpen: (happyAgentId, groupId) =>
                happyAgentRouterGroupOpen(
                    connectionUis.get(happyAgentId)?.router ?? happyAgentRouter,
                    happyAgentId,
                    groupId,
                ),
            groupForget: (happyAgentId, groupId) =>
                happyAgentRouterGroupForget(
                    connectionUis.get(happyAgentId)?.router ?? happyAgentRouter,
                    happyAgentId,
                    groupId,
                ),
            activity: (happyAgentId, activity) => analytics.activity(happyAgentId, activity),
            // Reported through `analytics`, which is made once the directory exists.
            mobilePairingObserve: (happyAgentId) =>
                analytics.mobilePairingObserve(happyAgentId, mobilePairingMethod),
            subtasksForget: (happyAgentId, removed, open) =>
                happyAgentRouterSubtasksForget(
                    connectionUis.get(happyAgentId)?.router ?? happyAgentRouter,
                    happyAgentId,
                    removed,
                    open,
                ),
            modelPreferencePersistence: preferencesFor,
            connectionDataErase: (happyAgentId) =>
                desktopConnectionDataErase({
                    happyAgentId,
                    storage: localStorage,
                    forget: [
                        (id) => {
                            const router = connectionUis.get(id)?.router;
                            if (router) happyAgentRouterConnectionForget(router, id);
                            happyAgentRouterConnectionForget(happyAgentRouter, id);
                        },
                        attentionForget,
                        (id) => modelPreferences.get(id)?.erase(),
                    ],
                }),
            // Remote connections ride through the local daemon, so a local
            // restart must degrade the local surface alone rather than pruning
            // the remotes off the rail the instant the daemon reports an empty
            // registry on its way back up.
            ...(daemon ? { localRestarting: () => daemon.get().install.phase !== "idle" } : {}),
            // A shell is told which background it is drawing on when it starts and
            // never hears about it again, so every terminal takes the appearance
            // showing at the moment it is opened and keeps it.
            terminalColorScheme: () => appearance.get().appearance,
            sessionFinished: (happyAgentId, sessionId, stillCurrent) => {
                completionChimePlay(
                    () =>
                        stillCurrent() &&
                        completionChimeWanted({
                            attention: attention.get(),
                            projectsVisibility: projectsVisibility.get(),
                            directory: happyAgents.get(),
                            happyAgentId,
                            sessionId,
                            windowFocused: document.hasFocus(),
                        }),
                );
            },
        });
        // Written into This Mac's Chief of Staff draft, whose conversation
        // then opens; nothing is sent for the reader.
        const chiefOfStaffAsk = async (request: HappyAgentChiefOfStaffRequest) => {
            const workspace = happyAgents
                .get()
                .happyAgents.find((entry) => entry.id === LOCAL_HAPPY_AGENT_ID)?.session?.workspace;
            if (!workspace)
                throw new UserError(
                    "The Happy Agent on this computer isn't connected. Try again once it is.",
                );
            await workspace.chiefOfStaffDraftAppend(request);
            happyAgents.happyAgentActivate(LOCAL_HAPPY_AGENT_ID);
        };
        const cloudConnectAction = happyAgents.happyAgentCloudConnect;
        const cloudConnect =
            cloudConnectAction && desktopBridge.happyCloud
                ? desktopCloudConnectStoreCreate({
                      cloud: desktopBridge.happyCloud,
                      bridge: desktopBridge,
                      chiefOfStaffAsk,
                      // A start page left for Happy Cloud is acknowledged only
                      // once a team is connected; until then Back returns to it.
                      connect: async (connectionId) => {
                          const connected = await cloudConnectAction(connectionId);
                          if (connected.ok && !welcome.get().welcomeAcknowledged) {
                              desktopBootSkip();
                              welcome.welcomeAcknowledge();
                          }
                          return connected;
                      },
                  })
                : undefined;
        if (cloudConnect) {
            // An invite is accepted in the browser; coming back to the window
            // brings its server into the list on show.
            const serversRefresh = () => cloudConnect.serversRefresh();
            window.addEventListener("focus", serversRefresh);
            appDisposers.push(() => window.removeEventListener("focus", serversRefresh));
        }
        // What this window reports about how it is used, read from the same
        // directory the sidebar reads. Development windows send nothing.
        const analytics = desktopAnalyticsCreate({
            development: (browserLocal && !cloudWeb) || desktopBridge.buildIdentity !== undefined,
            happyAgents,
            ...(desktopBridge.system ? { system: desktopBridge.system } : {}),
            doNotTrack: desktopBridge.doNotTrack === true,
        });
        appDisposers.push(analytics.dispose);
        analytics.appOpened();
        const windowState = windowStateStoreCreate(desktopBridge);
        const gptLive = gptLiveStoreCreate(
            desktopGptLivePersistence(),
            desktopGptLiveRuntimeCreate({
                bridge: desktopBridge,
                directory: happyAgents,
                connectionUis,
            }),
            experiments,
            // Voice settings and calls both belong to the local host, even while
            // the window is looking at a remote machine's work.
            () =>
                happyAgents
                    .get()
                    .happyAgents.find((entry) => entry.id === LOCAL_HAPPY_AGENT_ID)
                    ?.session?.voiceSettings.get().promptRevision ?? 0,
        );
        appDisposers.push(gptLiveExperimentsConnect(gptLive, experiments));
        appDisposers.push(() => gptLive[Symbol.dispose]());
        // What the surfaces lay out against: the window itself, or the
        // closed-inset arrangement while the rail owns the window's left edge.
        const surfaceWindowState = surfaceWindowStateStoreCreate({
            windowState,
            sidebarVisibility,
            happyAgents,
            railAdd: cloudConnect !== undefined,
        });
        const notices = desktopCloudSignInNoticeStoreCreate({
            happyAgents,
            accountSettingsOpen(id) {
                happyAgents.happyAgentActivate(id);
                const history = connectionUis.get(id)?.router.history;
                if (history && history.location.pathname !== "/settings/account")
                    history.replace("/settings/account");
            },
        });
        signInNotice = notices;
        for (const event of signInEventsEarly.splice(0)) notices.authEventReceive(event);
        // The update card outlives the main process's report of the update
        // until this window has reconnected and read the catalog again.
        const agentUpdate = analytics.agentUpdateObserve(
            desktopAgentUpdateStoreCreate({
                daemon: daemon ?? unavailableDaemonStore,
                happyAgents,
            }),
        );
        const agentReleaseNotes = desktopAgentReleaseNotesStoreCreate({
            daemon: daemon ?? unavailableDaemonStore,
            fetch: (url, init) => fetch(url, init),
        });
        const agentBroken = analytics.agentBrokenObserve(
            desktopAgentBrokenStoreCreate({
                daemon: daemon ?? unavailableDaemonStore,
                happyAgents,
                runtime: runtimeStore,
            }),
        );
        const agentOutage = desktopAgentOutageStoreCreate(
            agentBroken,
            (text) => void navigator.clipboard.writeText(text).catch(() => undefined),
        );
        function activeRouter(): HappyAgentRouter {
            return (
                connectionUis.get(happyAgents.get().activeHappyAgentId ?? LOCAL_HAPPY_AGENT_ID)
                    ?.router ?? happyAgentRouter
            );
        }
        // Native first-run setup retains its lifetime, while mobile pairing uses
        // the same local connection store and transport as the workspace.
        const onboardingStore = localOnboardingStoreCreate(desktopBridge, {
            agentSetupActive: welcome.get().welcomeAcknowledged,
            // A vendor's sign-in page opens in the person's own browser.
            externalOpen: desktopExternalLinkOpen(desktopBridge),
            chiefOfStaff: {
                get: () => {
                    const entry = happyAgents
                        .get()
                        .happyAgents.find((candidate) => candidate.id === LOCAL_HAPPY_AGENT_ID);
                    return entry?.status === "connected" ? entry.session?.workspace : undefined;
                },
                subscribe: happyAgents.subscribe,
            },
            chiefOfStaffPrepare: async () => {
                const session = happyAgents
                    .get()
                    .happyAgents.find((entry) => entry.id === LOCAL_HAPPY_AGENT_ID)?.session;
                const bot = session?.workspace
                    .get()
                    .list.bots.find((entry) => entry.systemKey === "chief_of_staff");
                if (!session || !bot)
                    throw new Error("Chief of Staff is not available yet. Try again.");
                const location = await session.workspace.sessionLocationRead(
                    bot.conversation.id as HappyAgentSessionId,
                );
                if (!location) throw new Error(`${bot.name}'s conversation is not available yet.`);
                await session.workspace.draftAppend(
                    location.sessionId,
                    "Help me get started with Happy. Let’s choose one project or create a new one, " +
                        "then make one small change together. Ask before looking for local projects " +
                        "or changing anything.",
                );
                return () =>
                    happyAgentRouterConversationOpen(
                        connectionUis.get(LOCAL_HAPPY_AGENT_ID)?.router ?? happyAgentRouter,
                        LOCAL_HAPPY_AGENT_ID,
                        location,
                    );
            },
            localConnected: {
                get: () =>
                    happyAgents.get().happyAgents.find((entry) => entry.id === LOCAL_HAPPY_AGENT_ID)
                        ?.status === "connected",
                subscribe: happyAgents.subscribe,
            },
            // Mobile setup is offered with the connection itself, not once the
            // workspace loads, so a slow or failing catalog cannot hold it back.
            happyMobile: {
                get: () =>
                    happyAgents.get().happyAgents.find((entry) => entry.id === LOCAL_HAPPY_AGENT_ID)
                        ?.setup?.onboarding.mobile,
                subscribe: happyAgents.subscribe,
            },
        });
        const uisReconcile = (): void => {
            const entries = happyAgents.get().happyAgents;
            for (const entry of entries) {
                if (connectionUis.has(entry.id)) continue;
                connectionUis.set(
                    entry.id,
                    desktopConnectionUiCreate({
                        id: entry.id,
                        directory: happyAgents,
                        preferences: preferencesFor(entry.id),
                        sidebarVisibility,
                        ...(entry.id === LOCAL_HAPPY_AGENT_ID
                            ? {
                                  main: {
                                      router: happyAgentRouter,
                                      settings,
                                      modelPreferencesChanged,
                                      commandPalette,
                                      navigationOrder,
                                      sidebarCollapse,
                                  },
                              }
                            : {}),
                    }),
                );
            }
            for (const [id, ui] of connectionUis) {
                if (entries.some((entry) => entry.id === id)) continue;
                ui.dispose();
                connectionUis.delete(id);
            }
        };
        appDisposers.push(happyAgents.subscribe(uisReconcile));
        uisReconcile();
        appDisposers.push(() => {
            for (const ui of connectionUis.values()) ui.dispose();
            connectionUis.clear();
        });
        // A Happy link from a browser or another app opens only on the connection
        // whose instance it names. It waits while that one is not live yet and
        // never falls back to the one on screen.
        const happyLinkInbox = happyLinkInboxStoreCreate({
            resolve: (instanceId) => happyAgentDirectoryLinkTarget(happyAgents.get(), instanceId),
            open(id, url) {
                happyAgents.happyAgentActivate(id);
                happyAgentRouterHappyLinkOpen(
                    connectionUis.get(id)?.router ?? happyAgentRouter,
                    url,
                    id,
                );
            },
        });
        appDisposers.push(() => happyLinkInbox[Symbol.dispose]());
        appDisposers.push(happyAgents.subscribe(happyLinkInbox.targetsChange));
        // The cloud web app's tab wears its server's picture.
        if (cloudWeb) appDisposers.push(cloudWebTabFollow(happyAgents));
        // A Happy link the reader followed in an artifact or HTML preview page
        // opens on the Happy Agent on screen, as the same link in a message
        // does. One that names an instance is a page's word about where it
        // goes, so it opens only on that instance, the way a link from outside
        // the app does.
        const happyLinkUnsubscribe = desktopBridge.happyLinkOpenSubscribe?.((url) => {
            if (parseHappyUrl(url)?.instanceId !== undefined) happyLinkInbox.linkReceive(url);
            else happyAgentRouterHappyLinkOpen(activeRouter(), url);
        });
        if (happyLinkUnsubscribe) appDisposers.push(happyLinkUnsubscribe);
        // A share link clicked anywhere in the window opens in the app.
        appDisposers.push(happyShareLinkClicksRoute(document, happyLinkInbox.linkReceive));
        const happyLinksTake = async (): Promise<void> => {
            const take = desktopBridge.happyLinkExternalTake;
            if (!take) return;
            for (let url = await take(); url !== undefined; url = await take()) {
                // The browser's hand-back after an invite: the Cloud's servers,
                // read afresh. The shell has already raised the window.
                if (cloudConnect && happyExternalLinkParse(url).kind === "cloudServers")
                    cloudConnect.serversShow();
                else happyLinkInbox.linkReceive(url);
            }
        };
        const happyLinksReceived = desktopBridge.happyLinkExternalSubscribe?.(() => {
            void happyLinksTake().catch(() => undefined);
        });
        if (happyLinksReceived) appDisposers.push(happyLinksReceived);
        // A link that opened Happy waited in the shell for this window.
        void happyLinksTake().catch(() => undefined);
        let materialized = "";
        appDisposers.push(
            happyAgents.subscribe(() => {
                const current = happyAgents
                    .get()
                    .happyAgents.map(
                        (happyAgent) => `${happyAgent.id}:${happyAgent.session ? "up" : "down"}`,
                    )
                    .join(",");
                if (current === materialized) return;
                materialized = current;
                void happyAgentRouterConnectionChanged(happyAgentRouter);
            }),
        );
        // What is waiting for the person is a fact about the whole window, not
        // about the screen that happens to be open, so the Dock is marked from
        // the same directory the sidebar reads rather than from any one Happy Agent.
        appDisposers.push(
            dockUnreadPublish(happyAgents, projectsVisibility, attention, (count) =>
                desktopBridge.dockUnreadSet(count),
            ),
        );
        // Whether this computer is held out of sleep is likewise a fact about
        // the whole window: the choice is the window's, and what the agents are
        // doing is read from the same directory. The choice is remembered in the
        // desktop document beside the appearance; the resolved answer goes to
        // the shell, which is the only thing that can act on it.
        const { store: keepAwake, modeReceived: keepAwakeReceived } = keepAwakeStoreOwnedCreate({
            ...(preferences.initialKeepAwake === undefined
                ? {}
                : { mode: preferences.initialKeepAwake }),
            agentWorking: {
                get: () => happyAgentDirectoryAgentWorking(happyAgents.get()),
                subscribe: happyAgents.subscribe,
            },
        });
        appDisposers.push(
            keepAwake.subscribe(() => preferences.keepAwakeChanged(keepAwake.get().mode)),
        );
        appDisposers.push(keepAwakePublish(keepAwake, desktopBridge));
        configReceive = (next) => {
            preferences.configReceived(next, (settings) => {
                appearanceReceive?.(next);
                settingsReceived(settings);
                titleShimmerReceived(next.titleShimmerEnabled);
                keepAwakeReceived(next.keepAwake ?? "agent");
            });
        };
        // This window renders the Happy Agent tree directly rather than through `App`, so
        // it has to start the highlighting pool itself: without this the file
        // viewer and every diff in the primary desktop surface tokenize on the
        // main thread, which is exactly where a large file must not be parsed.
        root.render(
            <DesktopAppearance appearance={appearance} powerSaving={powerSaving}>
                <DesktopZoomIndicator />
                <DesktopCloudSignInNotice store={notices} />
                <DesktopHappyLinkNotice store={happyLinkInbox} />
                <CodeHighlightWorkers>
                    <DesktopRenderer
                        connectionUis={connectionUis}
                        appearance={appearance}
                        commandPalette={commandPalette}
                        {...(daemon ? { daemon } : {})}
                        debug={debug}
                        {...(livePerformance ? { performance: livePerformance } : {})}
                        profiler={profiler}
                        onboarding={analytics.onboardingObserve(onboardingStore, welcome)}
                        browserContent={browserLocal ? undefined : desktopBrowserContentRender}
                        htmlPreview={browserLocal ? undefined : desktopHtmlPreviewRender}
                        artifactPage={browserLocal ? undefined : desktopArtifactPageRender}
                        bridge={desktopBridge}
                        mediaWindow={
                            browserLocal ? undefined : desktopMediaWindowOpen(desktopBridge)
                        }
                        experiments={experiments}
                        mobilePairingMethod={mobilePairingMethod}
                        projectsVisibility={projectsVisibility}
                        statusBar={statusBar}
                        gptLive={gptLive}
                        usageAnalytics={analytics.preference}
                        {...(cloudConnect ? { cloudConnect } : {})}
                        keepAwake={keepAwake}
                        navigationOrder={navigationOrder}
                        sidebarCollapse={sidebarCollapse}
                        sidebarVisibility={sidebarVisibility}
                        attention={attention}
                        // Only the Electron window hides its title bar; the browser
                        // development server renders the same tree with web chrome.
                        platform={browserLocal ? "web" : "desktop"}
                        happyAgentRouter={happyAgentRouter}
                        happyAgents={happyAgents}
                        localWebUpdate={localWebUpdateStoreCreate(localWebBuild)}
                        settings={settings}
                        titleShimmer={titleShimmer}
                        startupValues={startupValuesStoreCreate()}
                        store={runtimeStore}
                        welcome={welcome}
                        windowState={windowState}
                        surfaceWindowState={surfaceWindowState}
                        agentUpdate={agentUpdate}
                        agentReleaseNotes={agentReleaseNotes}
                        agentBroken={agentBroken}
                        agentOutage={agentOutage}
                    />
                </CodeHighlightWorkers>
                {/* After the app, not before it: the window folds drag regions in
                    tree order and later ones win, so the app's title-bar band would
                    otherwise re-cover the sheet's close button and leave it dead. */}
                {cloudConnect ? (
                    <DesktopCloudConnect appearance={appearance} store={cloudConnect} />
                ) : null}
            </DesktopAppearance>,
        );
    };
    void desktopBridge.desktopConfigGet().then(start, (error: unknown) => {
        console.error("Could not read desktop preferences.", error);
        start({
            appearance: "system",
            defaultEffort: HAPPY_AGENT_DEFAULT_THINKING_LEVEL,
            defaultPermissionMode: "auto",
            modelPreferences: [],
            scrollbarVisibility: "automatic",
            version: 1,
        });
    });
}

/** The cloud web app's page while it has no sign-in. */
function CloudWebSignedOut(props: { readonly store: CloudWebSignInStore }) {
    const { test } = useSyncExternalStore(props.store.subscribe, props.store.get, props.store.get);
    return (
        <CloudWebSignInScreen
            onScreenPress={props.store.screenPress}
            onSignIn={cloudWebSignIn}
            onTestLoginChange={props.store.testLoginUpdate}
            onTestPasswordChange={props.store.testPasswordUpdate}
            onTestSignIn={props.store.testSignInSubmit}
            {...(test
                ? {
                      testSignIn: {
                          login: test.login,
                          password: test.password,
                          busy: test.busy,
                          ...(test.error === undefined ? {} : { error: test.error }),
                      },
                  }
                : {})}
        />
    );
}
