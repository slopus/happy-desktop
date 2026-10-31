import { useSyncExternalStore } from "react";
import type {
    AppearanceStore,
    HappyAgentAttentionStore,
    HappyAgentCompletionSound,
    HappyAgentChangeTiersSnapshot,
    HappyAgentChangeTiersStore,
    ExperimentsStore,
    ProjectsVisibilityStore,
    GptLiveStore,
    HappyAgentInstructionsSnapshot,
    HappyAgentDebugLogSnapshot,
    HappyAgentSecurityPolicySnapshot,
    HappyAgentSecret,
    HappyAgentModelKey,
    HappyAgentProviderEntry,
    HappyAgentSettingsSnapshot,
    HappyAgentSettingsStore,
    HappyAgentTaskSettingsSnapshot,
    HappyAgentSidebarVisibilityStore,
    HappyAgentWindowStore,
    KeepAwakeStore,
    StatusBarStore,
    TitleShimmerStore,
    UsageAnalyticsStore,
} from "happy-desktop-state";
import {
    EXPERIMENTAL_FEATURES,
    HAPPY_AGENT_CHANGE_TIERS_MAX,
    HAPPY_AGENT_INSTRUCTIONS_MAX_BYTES,
    HAPPY_AGENT_SECURITY_POLICY_MAX_BYTES,
    happyAgentMenusDerive,
    happyAgentModelKey,
    happyAgentServiceName,
    happyAgentThinkingLabel,
    experimentsStoreNoop,
    projectsVisibilityStoreNoop,
    projectsVisibilityConnection,
    gptLiveStoreNoop,
    happyAgentCloudStoreNoop,
    happyAgentAvailabilityProject,
    happyAgentIntegrationStoreNoop,
    happyAgentMobileConnectorStoreNoop,
    happyAgentIntegrationRemovalIncomplete,
    happyAgentVersionAtLeast,
    HAPPY_AGENT_COMPUTER_REMOVAL_VERSION,
    happyAgentProfileStoreNoop,
    happyAgentProviderUsageStoreNoop,
    type HappyAgentProviderUsageStore,
    happyAgentProvidersStoreNoop,
    happyAgentSecretsStoreNoop,
    happyAgentVoiceSettingsStoreNoop,
    happyAgentWindowStoreNoop,
    happyAgentAttentionConnection,
    happyAgentAttentionStoreNoop,
    keepAwakeStoreCreate,
    statusBarStoreNoop,
    titleShimmerStoreNoop,
} from "happy-desktop-state";
import {
    happyAgentComposerModelControlProps,
    GptLiveVoiceSettings,
    HappyAgentAccountSettings,
    HappyAgentGeneralSettings,
    HappyAgentExperimentalSettings,
    HappyAgentConnectionSettingsSection,
    HappyAgentDebugLogPanel,
    HappyAgentDebugSettings,
    HappyAgentFileTierSettings,
    HappyAgentInstructionsSettings,
    HappyAgentMobileLinkSettings,
    HappyAgentMobileSettings,
    happyAgentMobileLinkHeading,
    HappyAgentProviderSettings,
    HappyAgentProfilerSettings,
    HappyAgentProfileSettings,
    HappyAgentPasswordSettings,
    HappyAgentSecretSettings,
    HappyAgentSettingsShell,
    HappyAgentTaskSettings,
    HappyAgentSurfaceSettings,
    GptLiveSettings,
    HappyAgentStateSettings,
    HappyAgentUsageSettings,
    providerAccountName,
    type HappyAgentProviderRow,
    type HappyAgentSecretRow,
    type HappyAgentSettingsCategory,
    type HappyAgentStateDocument,
} from "happy-desktop-ui";
import { HappyAgentVersionProvider } from "../HappyAgentVersionProvider";
import {
    AppMobileDirectSection,
    appMobilePairingOptions,
    appMobileRelayFromIntegration,
    appMobileRelayFromLink,
} from "../components/AppMobilePairing";
import {
    hostHappyAgent,
    type AppHappyAgentDirectoryStore,
    type AppHappyAgentEntry,
    type AppHappyAgentUpdate,
} from "../AppHappyAgentView";

/** The categories the local settings window offers, in the order they are listed. */
export const HAPPY_AGENT_SETTINGS_CATEGORIES: readonly HappyAgentSettingsCategory[] = [
    { icon: "settings", id: "general", label: "General" },
    // Joining other people's tasks and their shared docs, lists and calendars.
    { icon: "files", id: "sharing", label: "Sharing" },
    // Local author identity and the optional WorkOS account share one category.
    { icon: "users", id: "account", label: "Account" },
    // How each project's changes are split into tiers in the Changes listing.
    { icon: "file-diff", id: "file-tiers", label: "File tiers" },
    { icon: "doc", id: "instructions", label: "Instructions" },
    { icon: "lock", id: "secrets", label: "Secrets" },
    { icon: "lock", id: "passwords", label: "Passwords" },
    { icon: "globe", id: "providers", label: "Providers" },
    // Usage sits after Providers because it is the same accounts read the other
    // way round: which of them exist, then what each has spent.
    { icon: "zap", id: "usage", label: "Usage" },
    { icon: "call", id: "voice", label: "Voice" },
    { icon: "mobile", id: "mobile-access", label: "Mobile access" },
    { icon: "zap", id: "experimental", label: "Experimental" },
    { icon: "code", id: "debug", label: "Dev tools" },
];

export const HAPPY_AGENT_SETTINGS_DEFAULT_CATEGORY = "general";

/** Categories that were folded into another, by their old address. */
export const HAPPY_AGENT_SETTINGS_MOVED_CATEGORIES: Readonly<Record<string, string>> = {
    surfaces: "sharing",
    tasks: "sharing",
};

/** True when `section` addresses a category this window actually has. */
export function happyAgentSettingsCategoryExists(section: string): boolean {
    return HAPPY_AGENT_SETTINGS_CATEGORIES.some((category) => category.id === section);
}

export interface AppHappyAgentDebugTargetSnapshot {
    readonly error?: string;
    readonly status:
        | "stopped"
        | "starting"
        | "running"
        | "stopping"
        | "unavailable"
        | "disabled"
        | "error";
    readonly url?: string;
}

/** The native debugger state projected into the settings route. */
export interface AppHappyAgentDebugSnapshot {
    readonly daemon: AppHappyAgentDebugTargetSnapshot;
    readonly daemonConnected: boolean;
    readonly error?: string;
    readonly loading: boolean;
    readonly main: AppHappyAgentDebugTargetSnapshot;
    readonly renderer: AppHappyAgentDebugTargetSnapshot;
    readonly supported: boolean;
}

/** Framework-neutral adapter for the desktop debugger capability. */
export interface AppHappyAgentDebugStore {
    /**
     * Saves a fresh Dev tools snapshot to a file on this machine and resolves
     * with its absolute path; rejects where the host cannot save one.
     */
    diagnosticsWrite(kind: "raw-state" | "state-log", text: string): Promise<string>;
    get(): AppHappyAgentDebugSnapshot;
    subscribe(listener: () => void): () => void;
    debugAllStart(): void;
    debugAllStop(): void;
    daemonInspectorStart(): void;
    daemonInspectorStop(): void;
    mainInspectorStart(): void;
    mainInspectorStop(): void;
    rendererInspectorStart(): void;
    rendererInspectorStop(): void;
}

/** One Happy Agent version the person may run, published or already downloaded. */
export interface AppHappyAgentDaemonVersion {
    readonly downloaded: boolean;
    readonly prerelease: boolean;
    readonly version: string;
}

/** One agent the daemon is still waiting on, and the stage it is finishing. */
export interface AppHappyAgentDrainAgent {
    readonly id: string;
    readonly stage: "inference" | "tools" | "compaction" | "settlement";
}

/** One runtime component whose admitted work has not drained yet. */
export interface AppHappyAgentDrainComponent {
    readonly name: string;
    readonly count: number;
    readonly agents?: readonly AppHappyAgentDrainAgent[];
    readonly truncated?: boolean;
}

/**
 * Why the daemon is being taken down and brought back. `reload` is one this
 * window did not start: `happy-agent reload`, run from a terminal or an agent.
 */
export type AppHappyAgentDaemonRestartReason = "install" | "restart" | "reload";

/** The steps a restart runs through, in the order it runs them. */
export type AppHappyAgentDaemonRestartStep = "draining" | "stopping" | "starting" | "reconnecting";

/**
 * Where a deliberate agent restart has got to. Every fact here is the daemon's
 * own report of itself, so a surface showing it states rather than estimates.
 */
export type AppHappyAgentDaemonInstall =
    /** No restart running — and how a finished one ends, so the screen leaves. */
    | { readonly phase: "idle" }
    | {
          readonly phase: "draining";
          readonly reason: AppHappyAgentDaemonRestartReason;
          readonly version: string;
          /** When the whole restart began (epoch ms); absent from an older host. */
          readonly startedAt?: number;
          readonly waitingFor: readonly AppHappyAgentDrainComponent[];
          /**
           * The most open work this drain has held at once, which the share
           * already finished is measured against.
           */
          readonly waitingPeak: number;
          /** The drain has run long enough to be worth offering a way out of. */
          readonly killable: boolean;
      }
    | {
          readonly phase: "stopping";
          readonly reason: AppHappyAgentDaemonRestartReason;
          readonly version: string;
          readonly startedAt?: number;
          /** The drain was cut short, so work was interrupted rather than finished. */
          readonly killed: boolean;
      }
    | {
          readonly phase: "starting";
          readonly reason: AppHappyAgentDaemonRestartReason;
          readonly version: string;
          readonly startedAt?: number;
      }
    | {
          readonly phase: "reconnecting";
          readonly reason: AppHappyAgentDaemonRestartReason;
          readonly version: string;
          readonly startedAt?: number;
          /** When the restart itself finished (epoch ms), when the host knows. */
          readonly finishedAt?: number;
      }
    | {
          readonly phase: "error";
          readonly reason: AppHappyAgentDaemonRestartReason;
          readonly version: string;
          readonly startedAt?: number;
          readonly message: string;
          /** The step that was running when it failed. */
          readonly failedAt: AppHappyAgentDaemonRestartStep;
      };

/** The managed Happy Agent installation projected into General settings. */
export interface AppHappyAgentDaemonSnapshot {
    readonly availableVersion?: string;
    readonly error?: string;
    readonly installedVersion?: string;
    readonly managed: boolean;
    readonly message?: string;
    readonly operation: "idle" | "checking" | "downloading" | "upgrading";
    readonly runningVersion?: string;
    readonly runtime: "stopped" | "starting" | "ready";
    readonly updateAvailable: boolean;
    /** Newest first; empty until the first catalog read answers. */
    readonly versions: readonly AppHappyAgentDaemonVersion[];
    /** A downloaded version waiting on the person to install it. */
    readonly readyVersion?: string;
    readonly install: AppHappyAgentDaemonInstall;
}

export interface AppHappyAgentDaemonStore {
    daemonCheck(): void;
    /** Drains and restarts the local daemon onto the downloaded version. */
    daemonInstall(): void;
    /** Hands the window back once a failed install has been read. */
    daemonInstallDismiss(): void;
    /** Stops waiting for the drain and takes the daemon down now. */
    daemonInstallKill(): void;
    /** Drains and restarts the daemon on the version it is already running. */
    daemonRestart(): void;
    daemonUpgrade(): void;
    daemonVersionSelect(version: string): void;
    get(): AppHappyAgentDaemonSnapshot;
    subscribe(listener: () => void): () => void;
}

export interface AppHappyAgentProfilerCapabilities {
    readonly liveDebuggerAttach: boolean;
    readonly nativeTrace: boolean;
    readonly processMetrics: boolean;
    readonly reactAttribution: boolean;
    readonly reactDevtoolsProfiling: boolean;
    readonly rendererMetrics: boolean;
}

export interface AppHappyAgentProfilerSnapshot {
    readonly artifactPath?: string;
    readonly capabilities: AppHappyAgentProfilerCapabilities;
    readonly error?: string;
    readonly partialReason?: string;
    readonly status:
        | "stopped"
        | "starting"
        | "running"
        | "stopping"
        | "partial"
        | "error"
        | "unavailable";
}

/** Framework-neutral adapter for the native renderer profiler capability. */
export interface AppHappyAgentProfilerStore {
    get(): AppHappyAgentProfilerSnapshot;
    profilerStart(): void;
    profilerStop(): void;
    subscribe(listener: () => void): () => void;
}

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
    experimental: "Features still being built",
    voice: "Voice calls, controller and prompt",
    debug: "Live state, debuggers and renderer profiles",
    general: "Appearance, behavior and new-session defaults",
    sharing: "Joining other people’s tasks, docs, lists and calendars",
    "mobile-access": "Use Happy on your phone with this computer",
    account: "Your name, photo and Happy account",
    "file-tiers": "Which changed files are listed apart",
    instructions: "Agent guidance and permission review for this machine",
    secrets: "Environment variables for agents",
    passwords: "Saved logins from your browsers",
    providers: "Model providers and the models they offer",
    usage: "What each provider account has spent",
};

/** Stands in where the host cannot hold the machine awake, keeping hook order fixed. */
const keepAwakeStoreNone = keepAwakeStoreCreate({ mode: "off" });

/** Stands in where the host sends no usage events, so the view subscribes unconditionally. */
const usageAnalyticsAbsentSnapshot = { usageAnalyticsEnabled: false } as const;
const usageAnalyticsAbsent: UsageAnalyticsStore = {
    get: () => usageAnalyticsAbsentSnapshot,
    subscribe: () => () => undefined,
    usageAnalyticsUpdate: () => undefined,
};

export interface AppHappyAgentSettingsViewProps {
    appearance: AppearanceStore;
    /** Whether this desktop fills logins saved in the person's browsers (macOS and Windows). */
    browserPasswordsAvailable?: boolean;
    /** Application update status remains visible here while the footer waits for a download. */
    update?: AppHappyAgentUpdate;
    onUpdateApply?: () => void;
    /** Managed Happy Agent controls, present only in the native desktop shell. */
    daemon?: AppHappyAgentDaemonStore;
    /**
     * Whether this window offers the features that are not finished yet. Absent
     * in a host that remembers no such choice, which withholds them.
     */
    experiments?: ExperimentsStore;
    /**
     * Whether the primary connection hides its Projects section. Absent in a
     * host that remembers no such choice, which offers no control for it.
     */
    projectsVisibility?: ProjectsVisibilityStore;
    /** Whether this window sends product analytics events. Absent where it sends none. */
    usageAnalytics?: UsageAnalyticsStore;
    gptLive?: GptLiveStore;
    /** Absent where the host cannot hold the machine awake. */
    keepAwake?: KeepAwakeStore;
    /** When each connection chimes. Absent where the host plays no sound. */
    attention?: HappyAgentAttentionStore;
    statusBar?: StatusBarStore;
    /** The window's sidebar, whose width the category column matches. */
    sidebarVisibility?: HappyAgentSidebarVisibilityStore;
    /** Every Happy Agent in this window, including the one whose catalog is read. */
    debug?: AppHappyAgentDebugStore;
    profiler?: AppHappyAgentProfilerStore;
    happyAgents: AppHappyAgentDirectoryStore;
    onClose(): void;
    onCategorySelect(id: string): void;
    platform?: "desktop" | "web";
    section: string;
    settings: HappyAgentSettingsStore;
    /** Window-local preference for animated activity titles. */
    titleShimmer?: TitleShimmerStore;
    windowState?: HappyAgentWindowStore;
}

/**
 * Local route glue for the settings window. It subscribes once each to the
 * appearance, model-catalog, and preference stores and projects the catalog into
 * the props the shared `happy-desktop-ui` settings surfaces take; every layout and
 * visual decision lives there.
 */
export function AppHappyAgentSettingsView(props: AppHappyAgentSettingsViewProps) {
    // Dev Tools prints every store snapshot verbatim, so the stores an ordinary
    // category would materialize only while it is open are materialized there
    // too. Reading raw state means reading the live thing, not a stale copy.
    const appearance = useSyncExternalStore(
        props.appearance.subscribe,
        props.appearance.get,
        props.appearance.get,
    );
    const experimentsStore = props.experiments ?? experimentsStoreNoop;
    const gptLiveStore = props.gptLive ?? gptLiveStoreNoop;
    const gptLive = useSyncExternalStore(
        gptLiveStore.subscribe,
        gptLiveStore.get,
        gptLiveStore.get,
    );
    const experiments = useSyncExternalStore(
        experimentsStore.subscribe,
        experimentsStore.get,
        experimentsStore.get,
    );
    const projectsVisibilityStore = props.projectsVisibility ?? projectsVisibilityStoreNoop;
    const projectsVisibility = useSyncExternalStore(
        projectsVisibilityStore.subscribe,
        projectsVisibilityStore.get,
        projectsVisibilityStore.get,
    );
    const usageAnalyticsStore = props.usageAnalytics ?? usageAnalyticsAbsent;
    const usageAnalytics = useSyncExternalStore(
        usageAnalyticsStore.subscribe,
        usageAnalyticsStore.get,
        usageAnalyticsStore.get,
    );
    const section = props.section;
    const stateOpen = section === "debug";
    const categories = HAPPY_AGENT_SETTINGS_CATEGORIES;
    const titleShimmerStore = props.titleShimmer ?? titleShimmerStoreNoop;
    const titleShimmer = useSyncExternalStore(
        titleShimmerStore.subscribe,
        titleShimmerStore.get,
        titleShimmerStore.get,
    );
    const keepAwakeStore = props.keepAwake ?? keepAwakeStoreNone;
    const keepAwake = useSyncExternalStore(
        keepAwakeStore.subscribe,
        keepAwakeStore.get,
        keepAwakeStore.get,
    );
    const attentionStore = props.attention ?? happyAgentAttentionStoreNoop;
    const attention = useSyncExternalStore(
        attentionStore.subscribe,
        attentionStore.get,
        attentionStore.get,
    );
    const statusBarStore = props.statusBar ?? statusBarStoreNoop;
    const statusBar = useSyncExternalStore(
        statusBarStore.subscribe,
        statusBarStore.get,
        statusBarStore.get,
    );
    const directory = useSyncExternalStore(
        props.happyAgents.subscribe,
        props.happyAgents.get,
        props.happyAgents.get,
    );
    const host = hostHappyAgent(directory);
    const hostAvailability = host?.session
        ? happyAgentAvailabilityProject(host.session.connection.get(), true, {
              status: host.status,
              ...(host.message === undefined ? {} : { message: host.message }),
          })
        : undefined;
    const unavailable =
        hostAvailability?.online === false
            ? (hostAvailability.refusal ?? hostAvailability.message)
            : host?.session
              ? undefined
              : "The local Happy Agent is unavailable.";
    const happyAgentOnline = (): boolean => {
        const current = hostHappyAgent(props.happyAgents.get());
        return current?.session
            ? happyAgentAvailabilityProject(current.session.connection.get(), true, {
                  status: current.status,
                  ...(current.message === undefined ? {} : { message: current.message }),
              }).online
            : false;
    };
    // The catalog shown is this machine's: providers are configured in the Happy Agent
    // the window runs on, and the defaults chosen here are the window's own.
    const modelStore = host?.session?.models;
    const models = useSyncExternalStore(
        modelStore?.subscribe ?? noSubscribe,
        modelStore?.get ?? modelsUnloaded,
        modelStore?.get ?? modelsUnloaded,
    );
    const settings = useSyncExternalStore(
        props.settings.subscribe,
        props.settings.get,
        props.settings.get,
    );
    const profileStore =
        (section === "account" || stateOpen ? host?.session?.profile?.() : undefined) ??
        happyAgentProfileStoreNoop;
    const profile = useSyncExternalStore(
        profileStore.subscribe,
        profileStore.get,
        profileStore.get,
    );
    // The connection keeps both identities synchronized. This category only
    // observes their already-warm snapshots while it is visible.
    const cloudStore =
        (section === "account" || stateOpen ? host?.session?.cloud?.() : undefined) ??
        happyAgentCloudStoreNoop;
    const cloud = useSyncExternalStore(cloudStore.subscribe, cloudStore.get, cloudStore.get);
    const happyIntegrationStore =
        (section === "mobile-access" || stateOpen
            ? host?.session?.happyIntegration?.()
            : undefined) ?? happyAgentIntegrationStoreNoop;
    const happyIntegration = useSyncExternalStore(
        happyIntegrationStore.subscribe,
        happyIntegrationStore.get,
        happyIntegrationStore.get,
    );
    // Phones paired directly, and the direct half of every pairing this
    // category opens. Its pairing code is secret, so Dev Tools never prints it.
    // It is an experiment: until the person turns it on, Mobile Access shows
    // Relay and does not follow the direct connector at all.
    const mobileDirect = experiments.mobileDirect;
    const mobileConnectorOwned =
        section === "mobile-access" ? host?.session?.mobileConnector?.() : undefined;
    const mobileConnectorStore =
        (mobileDirect ? mobileConnectorOwned : undefined) ?? happyAgentMobileConnectorStoreNoop;
    const pairingMethod = mobileDirect ? "direct" : "relay";
    // Choosing Direct is turning its experiment on, and Relay turning it off.
    // A page that opened on Relay asks for a direct code as Direct shows.
    const pairingMethodSelect = (method: "relay" | "direct") => {
        if (method === "direct") mobileConnectorOwned?.pairingOpen();
        experimentsStore.featureUpdate("mobileDirect", method === "direct", "mobile_access");
    };
    const mobileConnector = useSyncExternalStore(
        mobileConnectorStore.subscribe,
        mobileConnectorStore.get,
        mobileConnectorStore.get,
    );
    // Subscribing is what starts the read, so the instructions are asked for
    // only while this window is open, and only once however often it is.
    const instructionsStore = host?.session?.instructions;
    const instructions = useSyncExternalStore(
        instructionsStore?.subscribe ?? noSubscribe,
        instructionsStore?.get ?? instructionsUnavailable,
        instructionsStore?.get ?? instructionsUnavailable,
    );
    const securityPolicyStore = host?.session?.securityPolicy;
    const securityPolicy = useSyncExternalStore(
        securityPolicyStore?.subscribe ?? noSubscribe,
        securityPolicyStore?.get ?? securityPolicyUnavailable,
        securityPolicyStore?.get ?? securityPolicyUnavailable,
    );
    // Secrets are safe metadata only. The store starts its repeating read while
    // this category (or raw Dev Tools state) watches it and stops immediately
    // when the surface leaves.
    const secretsStore =
        (section === "secrets" || stateOpen ? host?.session?.secrets?.() : undefined) ??
        happyAgentSecretsStoreNoop;
    const secrets = useSyncExternalStore(
        secretsStore.subscribe,
        secretsStore.get,
        secretsStore.get,
    );
    // The Providers category is the only thing that reads this, and subscribing
    // is what starts the work: the daemon's configuration is read, and re-read
    // every few seconds, only while that category is the one on screen.
    const providersStore =
        (section === "providers" || stateOpen ? host?.session?.providers : undefined) ??
        happyAgentProvidersStoreNoop;
    const providers = useSyncExternalStore(
        providersStore.subscribe,
        providersStore.get,
        providersStore.get,
    );
    // The voice controller and prompt are read, and re-read every few seconds,
    // only while the Voice category is on screen, including while calls are off.
    const voiceSettingsStore =
        (section === "voice" || stateOpen ? host?.session?.voiceSettings : undefined) ??
        happyAgentVoiceSettingsStoreNoop;
    const voiceSettings = useSyncExternalStore(
        voiceSettingsStore.subscribe,
        voiceSettingsStore.get,
        voiceSettingsStore.get,
    );
    // The Usage category is the only thing that reads these, and subscribing is
    // what starts the work: the daemon is asked what its accounts have spent,
    // and the clock ticks the time left until each reset, only while that
    // category is the one on screen.
    const usageOpen = section === "usage";
    const usageStore =
        (usageOpen || stateOpen ? host?.session?.providerUsage : undefined) ??
        happyAgentProviderUsageStoreNoop;
    const usage = useSyncExternalStore(
        usageOpen ? usageOpenSubscribe(usageStore) : usageStore.subscribe,
        usageStore.get,
        usageStore.get,
    );
    // The clock is not part of raw state: nothing there counts down, and a
    // ticking second would republish every snapshot on the page for nothing.
    const clockStore = usageOpen ? host?.session?.clock : undefined;
    const currentTime = useSyncExternalStore(
        clockStore?.subscribe ?? noSubscribe,
        clockStore?.get ?? clockStopped,
        clockStore?.get ?? clockStopped,
    );
    // Tiers are one list for the window, remembered by the host's workspace;
    // every machine's Changes is split by these.
    const changeTiersStore = host?.session?.workspace.changeTiers;
    const changeTiers = useSyncExternalStore(
        changeTiersStore?.subscribe ?? noSubscribe,
        changeTiersStore?.get ?? changeTiersNone,
        changeTiersStore?.get ?? changeTiersNone,
    );
    const windowStateStore = props.windowState ?? happyAgentWindowStoreNoop;
    const windowState = useSyncExternalStore(
        windowStateStore.subscribe,
        windowStateStore.get,
        windowStateStore.get,
    );
    const debugStore = (section === "debug" ? props.debug : undefined) ?? debugStoreNoop;
    const debug = useSyncExternalStore(debugStore.subscribe, debugStore.get, debugStore.get);
    const debugLogStore = section === "debug" ? host?.session?.debugLog : undefined;
    const debugLog = useSyncExternalStore(
        debugLogStore?.subscribe ?? noSubscribe,
        debugLogStore?.get ?? debugLogEmpty,
        debugLogStore?.get ?? debugLogEmpty,
    );
    const profilerStore = (section === "debug" ? props.profiler : undefined) ?? profilerStoreNoop;
    const profiler = useSyncExternalStore(
        profilerStore.subscribe,
        profilerStore.get,
        profilerStore.get,
    );
    const daemonStore = (section === "general" ? props.daemon : undefined) ?? daemonStoreNoop;
    const daemon = useSyncExternalStore(daemonStore.subscribe, daemonStore.get, daemonStore.get);
    const daemonView: AppHappyAgentDaemonSnapshot = {
        ...daemon,
        ...(host?.version ? { runningVersion: host.version } : {}),
        runtime:
            host?.status === "connected"
                ? "ready"
                : host?.status === "connecting"
                  ? "starting"
                  : "stopped",
    };
    const catalog = models.type === "ready" ? models.catalog : undefined;
    // What a new session starts on: the default model and effort, on the provider
    // picked last. The pill lists each model at its own default effort rather than
    // the one last used with it, because a new session ignores that memory.
    const selection = models.type === "ready" ? models.defaultSelection : undefined;
    const defaultMenus =
        catalog && selection
            ? happyAgentMenusDerive(catalog, {
                  ...selection,
                  permissionMode: settings.defaultPermissionMode,
              })
            : undefined;
    const sessionClock = host?.session?.clock;
    const mobileSetup = happyIntegrationStore.mobileSetup;
    // Linking a phone is a page inside Mobile Access: the same Settings
    // window, with its header leading back to the category.
    const mobileLink =
        section === "mobile-access" && happyIntegration.setup && mobileSetup && sessionClock
            ? {
                  step: happyIntegration.setup,
                  setup: mobileSetup,
                  pairingOptions: appMobilePairingOptions({
                      layout: "settings",
                      method: pairingMethod,
                      onMethodSelect: pairingMethodSelect,
                      relay:
                          happyIntegration.setup.kind === "link"
                              ? appMobileRelayFromLink(happyIntegration.setup.phase)
                              : { kind: "starting" },
                      onRelayRetry: mobileSetup.continue,
                      direct: mobileConnectorStore,
                      snapshot: mobileConnector,
                      clock: sessionClock,
                      online: happyAgentOnline,
                      ...(unavailable === undefined ? {} : { unavailable }),
                  }),
              }
            : undefined;
    const mobileLinkHeading = mobileLink
        ? happyAgentMobileLinkHeading(mobileLink.step, mobileLink.pairingOptions)
        : undefined;
    const content = (
        <HappyAgentSettingsShell
            activeCategoryId={section}
            categories={categories}
            description={
                mobileLinkHeading ? mobileLinkHeading.description : CATEGORY_DESCRIPTIONS[section]
            }
            onCategorySelect={props.onCategorySelect}
            onClose={props.onClose}
            {...(mobileLink ? { onBack: mobileLink.setup.close } : {})}
            title={
                mobileLinkHeading?.title ??
                categories.find((category) => category.id === section)?.label ??
                "Settings"
            }
            windowControls={props.platform === "desktop"}
            windowFullScreen={windowState.fullScreen}
            windowTrafficLights={windowState.trafficLights}
            connectionRail={windowState.connectionRail}
            sidebarWidth={props.sidebarVisibility?.get().width}
        >
            {section === "experimental" ? (
                <HappyAgentExperimentalSettings
                    features={[
                        // Voice calls is switched on the Voice page, the one
                        // place that names what it turns on.
                        ...EXPERIMENTAL_FEATURES.filter((feature) => feature.id !== "voice").map(
                            (feature) => ({
                                ...feature,
                                enabled: experiments[feature.id],
                            }),
                        ),
                    ]}
                    onFeatureChange={(id, enabled) => {
                        const feature = EXPERIMENTAL_FEATURES.find((feature) => feature.id === id);
                        if (feature)
                            experimentsStore.featureUpdate(feature.id, enabled, "experiments");
                    }}
                />
            ) : section === "voice" ? (
                props.gptLive ? (
                    <>
                        <GptLiveSettings
                            enabled={experiments.voice && gptLive.gptLiveEnabled}
                            accounts={gptLive.availability?.accounts}
                            accountId={gptLive.accountId}
                            checking={gptLive.status === "checking"}
                            accountsVisible
                            onAccountSelect={gptLiveStore.accountSelect}
                            onAccountsRead={gptLiveStore.availabilityRead}
                            // The one Voice calls switch: the experiment that
                            // allows calls and the window's own choice move together.
                            onEnabledChange={(enabled) => {
                                if (enabled)
                                    experimentsStore.featureUpdate("voice", true, "experiments");
                                gptLiveStore.gptLiveEnabledUpdate(enabled);
                                if (!enabled)
                                    experimentsStore.featureUpdate("voice", false, "experiments");
                            }}
                        />
                        {
                            <GptLiveVoiceSettings
                                loading={voiceSettings.loading}
                                unavailable={
                                    unavailable ??
                                    voiceSettings.error?.message ??
                                    (voiceSettings.settings
                                        ? undefined
                                        : "This Happy Agent has no voice settings yet. Update it to choose the voice controller and prompt.")
                                }
                                {...(voiceSettings.menus
                                    ? {
                                          controller: happyAgentComposerModelControlProps(
                                              voiceSettings.menus,
                                              {
                                                  disabled: voiceSettings.saving,
                                                  onModelChange: (selection) => {
                                                      if (happyAgentOnline())
                                                          voiceSettingsStore.controllerModelUpdate(
                                                              selection,
                                                          );
                                                  },
                                                  onEffortChange: (effort) => {
                                                      if (happyAgentOnline())
                                                          voiceSettingsStore.controllerEffortUpdate(
                                                              effort,
                                                          );
                                                  },
                                              },
                                          ),
                                      }
                                    : {})}
                                {...(voiceSettings.settings?.effectiveController.notice
                                    ? {
                                          controllerNotice:
                                              voiceSettings.settings.effectiveController.notice,
                                      }
                                    : {})}
                                fastMode={voiceSettings.settings?.controller.fastMode ?? false}
                                {...(voiceSettings.fastModeAvailable
                                    ? {}
                                    : {
                                          fastModeUnavailable: `${voiceSettings.menus?.currentOption?.name ?? "This model"} has no fast mode.`,
                                      })}
                                onFastModeChange={(enabled) => {
                                    if (happyAgentOnline())
                                        voiceSettingsStore.fastModeUpdate(enabled);
                                }}
                                prompt={
                                    voiceSettings.promptDraft ??
                                    voiceSettings.settings?.effectiveSystemPrompt ??
                                    ""
                                }
                                promptCustom={
                                    (voiceSettings.settings?.systemPromptOverride ?? null) !== null
                                }
                                promptEditing={voiceSettings.promptDraft !== undefined}
                                onPromptChange={voiceSettingsStore.promptDraftUpdate}
                                onPromptCancel={voiceSettingsStore.promptDraftCancel}
                                onPromptSave={() => {
                                    if (happyAgentOnline()) voiceSettingsStore.promptSave();
                                }}
                                onPromptReset={() => {
                                    if (happyAgentOnline()) voiceSettingsStore.promptReset();
                                }}
                                promptRestart={
                                    voiceSettings.promptRevision !==
                                        (gptLive.promptRevision ?? 0) &&
                                    (gptLive.status === "active" ||
                                        gptLive.restartStatus === "closing" ||
                                        gptLive.restartStatus === "connecting")
                                        ? gptLive.restartStatus === "closing" ||
                                          gptLive.restartStatus === "connecting"
                                            ? "restarting"
                                            : "available"
                                        : undefined
                                }
                                onPromptRestart={() => {
                                    // Both this settings surface and the window's voice runtime
                                    // use the host. A changed host/store invalidates this click.
                                    if (
                                        happyAgentOnline() &&
                                        hostHappyAgent(props.happyAgents.get())?.session
                                            ?.voiceSettings === voiceSettingsStore
                                    )
                                        gptLiveStore.callRestart();
                                }}
                                promptRestartError={
                                    gptLive.restartStatus === "failed" ? gptLive.error : undefined
                                }
                                onPromptDefaultCopy={() => {
                                    const text = voiceSettings.settings?.defaultSystemPrompt;
                                    if (text !== undefined)
                                        void navigator.clipboard
                                            ?.writeText(text)
                                            .catch(() => undefined);
                                }}
                                saving={voiceSettings.saving}
                                {...(voiceSettings.saveError
                                    ? { saveError: voiceSettings.saveError.message }
                                    : {})}
                            />
                        }
                    </>
                ) : null
            ) : mobileLink ? (
                <HappyAgentMobileLinkSettings
                    step={mobileLink.step}
                    pairingOptions={mobileLink.pairingOptions}
                    onContinue={mobileLink.setup.continue}
                    onPlatformSelect={mobileLink.setup.platformSelect}
                />
            ) : section === "mobile-access" ? (
                <HappyAgentMobileSettings
                    configured={happyIntegration.configured}
                    updatedAt={happyIntegration.updatedAt}
                    management={happyIntegration.management}
                    onManagementCancel={happyIntegrationStore.mobileManagementCancel}
                    onManagementConfirm={happyIntegrationStore.mobileManagementConfirm}
                    // What Disconnect does depends on the running Agent: from
                    // this version it deletes the computer from the account.
                    removesComputer={happyAgentVersionAtLeast(
                        host?.version,
                        HAPPY_AGENT_COMPUTER_REMOVAL_VERSION,
                    )}
                    removalIncomplete={happyAgentIntegrationRemovalIncomplete(happyIntegration)}
                    onRemovalRetry={() => {
                        if (happyAgentOnline()) happyIntegrationStore.happyIntegrationDisconnect();
                    }}
                    onReconnect={() => {
                        if (happyAgentOnline()) happyIntegrationStore.happyIntegrationReconnect();
                    }}
                    disconnecting={happyIntegration.disconnecting}
                    onDisconnect={() => {
                        if (happyAgentOnline())
                            happyIntegrationStore.happyIntegrationDisconnectRequest();
                    }}
                    onPairingOptionsOpen={() => {
                        if (!happyAgentOnline()) return;
                        // The local desktop walks through getting the app first.
                        if (mobileSetup) mobileSetup.start();
                        else happyIntegrationStore.happyIntegrationPairingOpen();
                    }}
                    {...(happyIntegration.pairingOpen && sessionClock
                        ? {
                              pairingOptions: appMobilePairingOptions({
                                  layout: "settings",
                                  method: pairingMethod,
                                  onMethodSelect: pairingMethodSelect,
                                  relay: appMobileRelayFromIntegration(happyIntegration),
                                  relayStarting: happyIntegration.pairingStarting,
                                  onRelayRetry: happyIntegrationStore.happyIntegrationPair,
                                  direct: mobileConnectorStore,
                                  snapshot: mobileConnector,
                                  clock: sessionClock,
                                  online: happyAgentOnline,
                                  onClose: happyIntegrationStore.happyIntegrationPairingClose,
                                  ...(unavailable === undefined ? {} : { unavailable }),
                              }).view,
                          }
                        : {})}
                    // The direct connection is an experiment: off, its section is left out.
                    {...(mobileDirect
                        ? {
                              direct: sessionClock ? (
                                  <AppMobileDirectSection
                                      direct={mobileConnectorStore}
                                      snapshot={mobileConnector}
                                      clock={sessionClock}
                                      online={happyAgentOnline}
                                      {...(unavailable === undefined ? {} : { unavailable })}
                                  />
                              ) : null,
                          }
                        : {})}
                    pairingStarting={happyIntegration.pairingStarting}
                    status={happyIntegration.status}
                    {...(happyIntegration.error ? { error: happyIntegration.error.message } : {})}
                    {...(happyIntegration.disconnectError
                        ? { disconnectError: happyIntegration.disconnectError.message }
                        : {})}
                    {...(happyIntegration.message ? { message: happyIntegration.message } : {})}
                    {...(unavailable === undefined ? {} : { unavailable })}
                />
            ) : section === "debug" ? (
                <>
                    <HappyAgentStateSettings
                        {...(debug.supported
                            ? {
                                  onPathWrite: (text: string) =>
                                      debugStore.diagnosticsWrite("raw-state", text),
                              }
                            : {})}
                        documents={stateDocuments({
                            appearance,
                            cloud,
                            experiments,
                            happyIntegration,
                            instructions,
                            models,
                            profile,
                            providers,
                            secrets,
                            securityPolicy,
                            settings,
                            titleShimmer,
                            usage,
                            windowState,
                        })}
                    />
                    <HappyAgentDebugLogPanel
                        {...(debug.supported
                            ? {
                                  onPathWrite: (text: string) =>
                                      debugStore.diagnosticsWrite("state-log", text),
                              }
                            : {})}
                        discardedEntries={debugLog.discardedEntries}
                        entries={debugLog.entries}
                    />
                    <HappyAgentDebugSettings
                        daemon={debug.daemon}
                        daemonConnected={debug.daemonConnected}
                        error={debug.error}
                        loading={debug.loading}
                        main={debug.main}
                        onAllStart={debugStore.debugAllStart}
                        onAllStop={debugStore.debugAllStop}
                        onDaemonStart={debugStore.daemonInspectorStart}
                        onDaemonStop={debugStore.daemonInspectorStop}
                        onMainStart={debugStore.mainInspectorStart}
                        onMainStop={debugStore.mainInspectorStop}
                        onRendererStart={debugStore.rendererInspectorStart}
                        onRendererStop={debugStore.rendererInspectorStop}
                        renderer={debug.renderer}
                        supported={debug.supported}
                    />
                    <HappyAgentProfilerSettings
                        artifactPath={profiler.artifactPath}
                        capabilities={profiler.capabilities}
                        error={profiler.error}
                        onStart={profilerStore.profilerStart}
                        onStop={profilerStore.profilerStop}
                        partialReason={profiler.partialReason}
                        status={profiler.status}
                        supported={profiler.status !== "unavailable"}
                    />
                </>
            ) : section === "sharing" ? (
                directory.happyAgents.map((entry) => (
                    <HappyAgentConnectionSettingsSection
                        connectionLabel={entry.label}
                        key={entry.id}
                        {...entryUnavailable(entry)}
                    >
                        <AppHappyAgentAutoJoinSettings entry={entry} entity="task" />
                        <AppHappyAgentAutoJoinSettings entry={entry} entity="surface" />
                    </HappyAgentConnectionSettingsSection>
                ))
            ) : section === "account" ? (
                // The local author identity and optional WorkOS connection.
                <>
                    <HappyAgentProfileSettings
                        dirty={profile.dirty}
                        email={profile.email}
                        loading={profile.loading}
                        name={profile.name}
                        onEmailChange={(value) => profileStore.emailUpdate(value)}
                        onNameChange={(value) => profileStore.displayNameUpdate(value)}
                        onRevert={() => profileStore.profileRevert()}
                        onSave={() => {
                            if (happyAgentOnline()) void profileStore.profileSave();
                        }}
                        saving={profile.saving}
                        // Photo changes are not held back while the Happy Agent
                        // looks offline: picking and cropping are local, and a
                        // send that cannot reach it says so in the dialog.
                        onPhotoChoose={(file) => void profileStore.photoChoose(file)}
                        onPhotoCropCancel={() => profileStore.photoCropCancel()}
                        onPhotoCropConfirm={(region) => void profileStore.photoCropConfirm(region)}
                        onPhotoRemove={() => void profileStore.photoRemove()}
                        photoRemoving={profile.photoActivity === "removing"}
                        photoUploading={profile.photoActivity === "uploading"}
                        {...(profile.photo === undefined ? {} : { photo: profile.photo })}
                        // While a crop is open its dialog says why a send failed.
                        {...(profile.photoCrop
                            ? {
                                  photoCrop: {
                                      source: profile.photoCrop,
                                      saving: profile.photoActivity === "uploading",
                                      ...(profile.photoError ? { error: profile.photoError } : {}),
                                  },
                              }
                            : profile.photoError
                              ? { photoError: profile.photoError }
                              : {})}
                        // A team member's first save is what creates them, and
                        // a photo belongs to someone who already exists.
                        {...(profile.saved
                            ? {}
                            : { photoUnavailable: "Save your name first, then add a photo" })}
                        {...(profile.error ? { error: profile.error.message } : {})}
                        {...(profile.saveError ? { saveError: profile.saveError } : {})}
                        {...(unavailable === undefined ? {} : { unavailable })}
                    />
                    <HappyAgentAccountSettings
                        authorizationCompleting={cloud.authorizationCompleting}
                        authorizationStarting={cloud.authorizationStarting}
                        disconnecting={cloud.disconnecting}
                        onConnect={() => {
                            if (happyAgentOnline()) cloudStore.cloudAccountConnect();
                        }}
                        onDisconnect={() => {
                            if (happyAgentOnline()) cloudStore.cloudAccountDisconnect();
                        }}
                        status={cloud.status}
                        {...(cloud.error ? { error: cloud.error.message } : {})}
                        {...(cloud.user ? { email: cloud.user.email } : {})}
                        {...(unavailable === undefined ? {} : { unavailable })}
                    />
                </>
            ) : section === "file-tiers" ? (
                fileTierSettings(changeTiers, changeTiersStore, unavailable)
            ) : section === "instructions" ? (
                <HappyAgentInstructionsSettings
                    documents={[
                        {
                            bytes: instructions.bytes,
                            description:
                                "Given to every agent this machine starts, on top of the project's own AGENTS.md.",
                            dirty: instructions.dirty,
                            error: documentError(instructionsStore, instructions),
                            id: "agents",
                            label: "AGENTS.md",
                            loading: documentLoading(instructionsStore, instructions),
                            maximumBytes: HAPPY_AGENT_INSTRUCTIONS_MAX_BYTES,
                            onRevert: () => instructionsStore?.revert(),
                            onSave: () => {
                                if (happyAgentOnline()) instructionsStore?.save();
                            },
                            onValueChange: (value) => instructionsStore?.draftUpdate(value),
                            path: INSTRUCTIONS_PATH,
                            placeholder: "Anything every agent on this machine should know…",
                            saveError: instructions.saveError?.message,
                            saving: instructions.saving,
                            value: instructions.draft,
                            ...(unavailable === undefined
                                ? {}
                                : {
                                      saveDisabled: true,
                                      saveDisabledReason: unavailable,
                                  }),
                        },
                        {
                            bytes: securityPolicy.bytes,
                            description:
                                "Applied when this machine reviews whether an agent action is allowed.",
                            dirty: securityPolicy.dirty,
                            error: documentError(securityPolicyStore, securityPolicy),
                            id: "security",
                            label: "SECURITY.md",
                            loading: documentLoading(securityPolicyStore, securityPolicy),
                            maximumBytes: HAPPY_AGENT_SECURITY_POLICY_MAX_BYTES,
                            onRevert: () => securityPolicyStore?.revert(),
                            onSave: () => {
                                if (happyAgentOnline()) securityPolicyStore?.save();
                            },
                            onValueChange: (value) => securityPolicyStore?.draftUpdate(value),
                            path: SECURITY_POLICY_PATH,
                            placeholder: "Rules for deciding which agent actions are allowed…",
                            saveError: securityPolicy.saveError?.message,
                            saving: securityPolicy.saving,
                            value: securityPolicy.draft,
                            ...(unavailable === undefined
                                ? {}
                                : {
                                      saveDisabled: true,
                                      saveDisabledReason: unavailable,
                                  }),
                        },
                    ]}
                />
            ) : section === "providers" ? (
                <HappyAgentProviderSettings
                    loading={providers.loading}
                    onModelEnabledChange={(id, enabled) =>
                        happyAgentOnline()
                            ? props.settings.modelEnabledUpdate(id as HappyAgentModelKey, enabled)
                            : undefined
                    }
                    onProviderEnabledChange={(id, enabled) => {
                        if (happyAgentOnline()) providersStore.providerEnabledUpdate(id, enabled);
                    }}
                    providers={providerRows(providers.providers, settings, selection)}
                    {...(providers.error ? { error: providers.error.message } : {})}
                    {...(providers.saveError ? { saveError: providers.saveError.message } : {})}
                    {...(unavailable === undefined ? {} : { unavailable })}
                />
            ) : section === "passwords" ? (
                <HappyAgentPasswordSettings available={props.browserPasswordsAvailable ?? false} />
            ) : section === "secrets" ? (
                <HappyAgentSecretSettings
                    loading={secrets.loading}
                    onSecretCreate={(input) =>
                        happyAgentOnline()
                            ? secretsStore.secretCreate(input)
                            : Promise.reject(
                                  new Error(unavailable ?? "The local Happy Agent is unavailable."),
                              )
                    }
                    secrets={secretRows(secrets.secrets)}
                    {...(secrets.error ? { error: secrets.error.message } : {})}
                    {...(unavailable === undefined ? {} : { unavailable })}
                />
            ) : section === "usage" ? (
                <HappyAgentUsageSettings
                    loading={usage.loading}
                    providers={usage.providers.map((entry) => {
                        const provider = catalog?.providers.find(
                            (candidate) => candidate.id === entry.providerId,
                        );
                        return {
                            ...entry,
                            name: providerAccountName(entry.providerId, provider?.name),
                            ...(provider === undefined
                                ? {}
                                : { typeName: happyAgentServiceName(provider.type) }),
                        };
                    })}
                    {...(clockStore ? { currentTime } : {})}
                    {...(usage.error ? { error: usage.error } : {})}
                />
            ) : (
                <HappyAgentGeneralSettings
                    appearanceModes={props.appearance.supportedModes}
                    desktopUpdate={props.update}
                    onDesktopUpdateApply={props.onUpdateApply}
                    {...(props.daemon
                        ? {
                              agent: daemonView,
                              onAgentCheck: daemonStore.daemonCheck,
                              onAgentRestart: daemonStore.daemonRestart,
                              onAgentUpgrade: daemonStore.daemonUpgrade,
                              onAgentVersionSelect: daemonStore.daemonVersionSelect,
                              previewUpdatesEnabled: settings.previewUpdatesEnabled,
                              onPreviewUpdatesChange: props.settings.previewUpdatesUpdate,
                          }
                        : {})}
                    appearance={appearance.mode}
                    {...(defaultMenus
                        ? {
                              defaultModel: {
                                  ...happyAgentComposerModelControlProps(defaultMenus, {
                                      onModelChange: (next) => {
                                          const selected = catalog?.providers
                                              .flatMap((provider) => provider.models)
                                              .find((candidate) => candidate.id === next.modelId);
                                          if (!selected || !happyAgentOnline()) return;
                                          props.settings.defaultModelUpdate(next.modelId);
                                          props.settings.defaultEffortUpdate(
                                              next.effort ?? selected.defaultThinkingLevel,
                                          );
                                      },
                                      onEffortChange: (next) => {
                                          if (next && happyAgentOnline())
                                              props.settings.defaultEffortUpdate(next);
                                      },
                                  }),
                                  accountsReadOnly: true,
                              },
                          }
                        : {})}
                    error={models.type === "error" ? models.error.message : undefined}
                    {...(props.usageAnalytics
                        ? {
                              usageAnalyticsEnabled: usageAnalytics.usageAnalyticsEnabled,
                              onUsageAnalyticsChange: usageAnalyticsStore.usageAnalyticsUpdate,
                          }
                        : {})}
                    loading={models.type !== "ready" && models.type !== "error"}
                    onAppearanceChange={(mode) => props.appearance.appearanceSelect(mode)}
                    {...(props.statusBar
                        ? {
                              statusBar: {
                                  ...statusBar,
                                  onThemeShownChange: statusBarStore.themeShownUpdate,
                                  onKeepAwakeShownChange: statusBarStore.keepAwakeShownUpdate,
                              },
                          }
                        : {})}
                    {...(props.keepAwake
                        ? {
                              keepAwake: keepAwake.mode,
                              onKeepAwakeChange: keepAwakeStore.modeSelect,
                          }
                        : {})}
                    {...(props.attention && host
                        ? {
                              completionSound: happyAgentAttentionConnection(attention, host.id)
                                  .completionSound,
                              onCompletionSoundChange: (sound: HappyAgentCompletionSound) =>
                                  attentionStore.completionSoundUpdate(host.id, sound),
                          }
                        : {})}
                    onScrollbarVisibilityChange={(visibility) =>
                        props.appearance.scrollbarVisibilitySelect(visibility)
                    }
                    linkOpenPlacement={settings.linkOpenPlacement}
                    onLinkOpenPlacementChange={props.settings.linkOpenPlacementUpdate}
                    onTitleShimmerChange={(enabled) =>
                        titleShimmerStore.titleShimmerUpdate(enabled)
                    }
                    {...(props.projectsVisibility && host
                        ? {
                              projectsHidden: projectsVisibilityConnection(
                                  projectsVisibility,
                                  host.id,
                              ).projectsHidden,
                              onProjectsHiddenChange: (hidden: boolean) =>
                                  projectsVisibilityStore.projectsHiddenUpdate(host.id, hidden),
                          }
                        : {})}
                    {...(defaultMenus ? { defaultAccessMenus: defaultMenus } : {})}
                    onPermissionModeChange={(mode) => {
                        if (happyAgentOnline()) props.settings.defaultPermissionModeUpdate(mode);
                    }}
                    scrollbarVisibility={appearance.scrollbarVisibility}
                    titleShimmerEnabled={titleShimmer.titleShimmerEnabled}
                    {...(unavailable === undefined ? {} : { unavailable })}
                />
            )}
        </HappyAgentSettingsShell>
    );
    return (
        <HappyAgentVersionProvider lastKnownVersion={host?.version}>
            {content}
        </HappyAgentVersionProvider>
    );
}

/** Every store snapshot Dev Tools prints, in the order the window reads them. */
function stateDocuments(snapshots: {
    readonly appearance: unknown;
    readonly cloud: unknown;
    readonly experiments: unknown;
    readonly happyIntegration: unknown;
    readonly instructions: unknown;
    readonly models: unknown;
    readonly profile: unknown;
    readonly providers: unknown;
    readonly secrets: unknown;
    readonly securityPolicy: unknown;
    readonly settings: unknown;
    readonly titleShimmer: unknown;
    readonly usage: unknown;
    readonly windowState: unknown;
}): readonly HappyAgentStateDocument[] {
    return [
        {
            description: "WorkOS account authentication",
            id: "cloud",
            label: "Cloud",
            value: stateText(snapshots.cloud),
        },
        {
            description: "The identity this machine authors work as",
            id: "profile",
            label: "Profile",
            value: stateText(snapshots.profile),
        },
        {
            description: "This Happy Agent's connection to Happy Mobile",
            id: "happy-integration",
            label: "Mobile integration",
            value: stateText(snapshots.happyIntegration),
        },
        {
            description: "Model providers and their saved configuration",
            id: "providers",
            label: "Providers",
            value: stateText(snapshots.providers),
        },
        {
            description: "Safe secret metadata; stored values never enter this snapshot",
            id: "secrets",
            label: "Secrets",
            value: stateText(snapshots.secrets),
        },
        {
            description: "The model catalog and what a new session starts on",
            id: "models",
            label: "Models",
            value: stateText(snapshots.models),
        },
        {
            description: "What each provider account's plan has spent",
            id: "usage",
            label: "Provider usage",
            value: stateText(snapshots.usage),
        },
        {
            description: "Defaults a new session starts with",
            id: "settings",
            label: "Settings",
            value: stateText(snapshots.settings),
        },
        {
            description: "Machine-wide AGENTS.md, as stored and as drafted",
            id: "instructions",
            label: "Instructions",
            value: stateText(snapshots.instructions),
        },
        {
            description: "Machine-wide SECURITY.md, as stored and as drafted",
            id: "security-policy",
            label: "Security policy",
            value: stateText(snapshots.securityPolicy),
        },
        {
            description: "Theme and scrollbar preferences for this window",
            id: "appearance",
            label: "Appearance",
            value: stateText(snapshots.appearance),
        },
        {
            description: "Whether unfinished features are offered",
            id: "experiments",
            label: "Experiments",
            value: stateText(snapshots.experiments),
        },
        {
            description: "Whether activity titles animate",
            id: "title-shimmer",
            label: "Title shimmer",
            value: stateText(snapshots.titleShimmer),
        },
        {
            description: "Full-screen and window chrome state",
            id: "window",
            label: "Window",
            value: stateText(snapshots.windowState),
        },
    ];
}

/**
 * One snapshot as text. A snapshot is an ordinary immutable value, but it may
 * carry the two shapes JSON has no notation for — a `Set`, a `Map` — and a
 * `UserError`, whose message is the whole point of it and which serializes to
 * `{}` untouched. Each is written out as itself so the printed value says what
 * the store actually holds.
 */
function stateText(snapshot: unknown): string {
    return JSON.stringify(snapshot, stateReplacer, 2) ?? String(snapshot);
}

function stateReplacer(_key: string, value: unknown): unknown {
    if (value instanceof Set) return [...value];
    if (value instanceof Map) return Object.fromEntries(value);
    if (value instanceof Error) return { message: value.message, name: value.name };
    return value;
}

/**
 * Where the daemon keeps its global instructions. The path is fixed by Happy Agent
 * itself and is shown rather than asked for, so it is plain what a save changes.
 */
const INSTRUCTIONS_PATH = "~/Happy/Config/AGENTS.md";
const SECURITY_POLICY_PATH = "~/Happy/Config/SECURITY.md";

const noSubscribe = () => () => undefined;
const autoJoinSettingsLoading: HappyAgentTaskSettingsSnapshot = { status: "loading" };
const autoJoinSettingsUnloaded = () => autoJoinSettingsLoading;

/** Why a connection's choices cannot be reached right now, said once above its rows. */
function entryUnavailable(entry: AppHappyAgentEntry): { readonly unavailable?: string } {
    if (!entry.session) return { unavailable: "This connection is unavailable." };
    const availability = happyAgentAvailabilityProject(entry.session.connection.get(), true, {
        status: entry.status,
        ...(entry.message === undefined ? {} : { message: entry.message }),
    });
    return availability.online === false
        ? { unavailable: availability.refusal ?? availability.message }
        : {};
}

/** Each connection owns one preference store and one coarse subscription while this page is open. */
function AppHappyAgentAutoJoinSettings(props: {
    readonly entry: AppHappyAgentEntry;
    readonly entity: "task" | "surface";
}) {
    const { entry } = props;
    const taskStore = props.entity === "task" ? entry.session?.taskSettings?.() : undefined;
    const surfaceStore =
        props.entity === "surface" ? entry.session?.surfaceSettings?.() : undefined;
    const store = taskStore ?? surfaceStore;
    const snapshot = useSyncExternalStore(
        store?.subscribe ?? noSubscribe,
        store?.get ?? autoJoinSettingsUnloaded,
        store?.get ?? autoJoinSettingsUnloaded,
    );
    const availability = entry.session
        ? happyAgentAvailabilityProject(entry.session.connection.get(), true, {
              status: entry.status,
              ...(entry.message === undefined ? {} : { message: entry.message }),
          })
        : undefined;
    const unavailable =
        availability?.online === false
            ? (availability.refusal ?? availability.message)
            : store === undefined
              ? "This connection is unavailable."
              : snapshot.status === "ready" && !snapshot.online
                ? "Reconnecting to this connection’s user settings."
                : undefined;
    const Settings = props.entity === "task" ? HappyAgentTaskSettings : HappyAgentSurfaceSettings;
    return (
        <Settings
            connectionLabel={entry.label}
            status={
                props.entity === "surface" && entry.session && store === undefined
                    ? "unsupported"
                    : snapshot.status
            }
            autoJoinEnabled={snapshot.status === "ready" ? snapshot.autoJoinEnabled : undefined}
            saving={snapshot.status === "ready" && snapshot.saving}
            error={snapshot.status !== "unsupported" ? snapshot.error?.message : undefined}
            saveError={snapshot.status === "ready" ? snapshot.saveError?.message : undefined}
            unavailable={unavailable}
            onAutoJoinChange={(enabled) => {
                if (availability?.online) {
                    if (props.entity === "task") taskStore?.taskAutoJoinUpdate(enabled);
                    else surfaceStore?.surfaceAutoJoinUpdate(enabled);
                }
            }}
        />
    );
}
const changeTiersEmpty: HappyAgentChangeTiersSnapshot = { tiers: [] };
const changeTiersNone = (): HappyAgentChangeTiersSnapshot => changeTiersEmpty;

/**
 * The File tiers category: the window's one list of tiers, as cards. The tiers
 * are kept on this machine, so they stay editable while the host reconnects;
 * only a host with no workspace yet leaves nothing to edit.
 */
function fileTierSettings(
    snapshot: HappyAgentChangeTiersSnapshot,
    store: HappyAgentChangeTiersStore | undefined,
    unavailable: string | undefined,
) {
    return (
        <HappyAgentFileTierSettings
            canAdd={store !== undefined && snapshot.tiers.length < HAPPY_AGENT_CHANGE_TIERS_MAX}
            onTierAdd={() => store?.tierAdd()}
            onTierMove={(tierId, direction) => store?.tierMove(tierId, direction)}
            onTierNameChange={(tierId, name) => store?.tierNameUpdate(tierId, name)}
            onTierPatternsChange={(tierId, patterns) => store?.tierPatternsUpdate(tierId, patterns)}
            onTierRemove={(tierId) => store?.tierRemove(tierId)}
            tiers={snapshot.tiers.map((tier) => ({
                id: tier.id,
                name: tier.name,
                patterns: tier.patterns,
            }))}
            {...(store === undefined && unavailable !== undefined ? { unavailable } : {})}
        />
    );
}
const UNLOADED = { type: "loading" } as const;
const modelsUnloaded = () => UNLOADED;
/** Stands in while no Happy Agent on this machine is connected to read the time from. */
const clockStopped = () => 0;
const EMPTY_DEBUG_LOG: HappyAgentDebugLogSnapshot = { discardedEntries: 0, entries: [] };
const debugLogEmpty = () => EMPTY_DEBUG_LOG;
const debugStopped: AppHappyAgentDebugTargetSnapshot = { status: "stopped" };
const debugUnavailable: AppHappyAgentDebugSnapshot = {
    daemon: debugStopped,
    daemonConnected: false,
    loading: false,
    main: debugStopped,
    renderer: debugStopped,
    supported: false,
};
const debugStoreNoop: AppHappyAgentDebugStore = {
    diagnosticsWrite: async () => {
        throw new Error("Saving diagnostics needs the Electron desktop window.");
    },
    get: () => debugUnavailable,
    subscribe: noSubscribe,
    debugAllStart: () => undefined,
    debugAllStop: () => undefined,
    daemonInspectorStart: () => undefined,
    daemonInspectorStop: () => undefined,
    mainInspectorStart: () => undefined,
    mainInspectorStop: () => undefined,
    rendererInspectorStart: () => undefined,
    rendererInspectorStop: () => undefined,
};
const profilerUnavailable: AppHappyAgentProfilerSnapshot = {
    capabilities: {
        liveDebuggerAttach: false,
        nativeTrace: false,
        processMetrics: false,
        reactAttribution: false,
        reactDevtoolsProfiling: false,
        rendererMetrics: false,
    },
    status: "unavailable",
};
const profilerStoreNoop: AppHappyAgentProfilerStore = {
    get: () => profilerUnavailable,
    profilerStart: () => undefined,
    profilerStop: () => undefined,
    subscribe: noSubscribe,
};
const daemonUnavailable: AppHappyAgentDaemonSnapshot = {
    install: { phase: "idle" },
    managed: false,
    operation: "idle",
    runtime: "stopped",
    updateAvailable: false,
    versions: [],
};
const daemonStoreNoop: AppHappyAgentDaemonStore = {
    daemonCheck: () => undefined,
    daemonInstall: () => undefined,
    daemonInstallDismiss: () => undefined,
    daemonInstallKill: () => undefined,
    daemonRestart: () => undefined,
    daemonUpgrade: () => undefined,
    daemonVersionSelect: () => undefined,
    get: () => daemonUnavailable,
    subscribe: noSubscribe,
};

const usageOpenSubscribes = new WeakMap<
    HappyAgentProviderUsageStore,
    (listener: () => void) => () => void
>();

/**
 * Subscribes the Usage category to the store and asks the daemon to read again
 * every account it last read a while ago, once each time the category opens.
 * The category shows token counts, so it follows them while open.
 * Identity contract: one function per store, so React keeps the subscription
 * (and sends no second request) for as long as the category stays open.
 */
function usageOpenSubscribe(
    store: HappyAgentProviderUsageStore,
): (listener: () => void) => () => void {
    let subscribe = usageOpenSubscribes.get(store);
    if (subscribe === undefined) {
        subscribe = (listener) => {
            const release = store.subscribe(listener);
            const tokensRelease = store.tokensFollow();
            store.usageRefresh();
            return () => {
                tokensRelease();
                release();
            };
        };
        usageOpenSubscribes.set(store, subscribe);
    }
    return subscribe;
}

const INSTRUCTIONS_UNAVAILABLE: HappyAgentInstructionsSnapshot = {
    stored: { type: "unloaded" },
    draft: "",
    dirty: false,
    bytes: 0,
    saving: false,
};
/** Stands in while no Happy Agent on this machine is connected to read them from. */
const instructionsUnavailable = () => INSTRUCTIONS_UNAVAILABLE;
const SECURITY_POLICY_UNAVAILABLE: HappyAgentSecurityPolicySnapshot = INSTRUCTIONS_UNAVAILABLE;
const securityPolicyUnavailable = () => SECURITY_POLICY_UNAVAILABLE;

function documentError(
    store: { get(): HappyAgentInstructionsSnapshot } | undefined,
    snapshot: HappyAgentInstructionsSnapshot,
): string | undefined {
    return store === undefined
        ? "This window is not connected to a Happy Agent on this machine."
        : snapshot.stored.type === "error"
          ? snapshot.stored.error.message
          : undefined;
}

function documentLoading(
    store: { get(): HappyAgentInstructionsSnapshot } | undefined,
    snapshot: HappyAgentInstructionsSnapshot,
): boolean {
    return (
        store !== undefined && snapshot.stored.type !== "ready" && snapshot.stored.type !== "error"
    );
}

function providerRows(
    providers: readonly HappyAgentProviderEntry[],
    settings: HappyAgentSettingsSnapshot,
    selection: { readonly providerId: string; readonly modelId: string } | undefined,
): readonly HappyAgentProviderRow[] {
    return providers.map((provider) => ({
        enabled: provider.enabled,
        id: provider.id,
        models: provider.models.map((model) => ({
            contextWindow: model.contextWindow,
            efforts: model.thinkingLevels.map(happyAgentThinkingLabel),
            enabled: !settings.disabledModels.has(happyAgentModelKey(provider.id, model.id)),
            id: happyAgentModelKey(provider.id, model.id),
            isDefault: provider.id === selection?.providerId && model.id === selection.modelId,
            modelId: model.id,
            name: model.name,
        })),
        name: providerAccountName(provider.id, provider.name),
        typeName: happyAgentServiceName(provider.type),
        saving: provider.saving,
        serviceTiers: [
            ...new Set(
                provider.models.flatMap((model) =>
                    model.serviceTierOptions
                        .filter((option) => option.id !== null)
                        .map((option) => option.label),
                ),
            ),
        ],
        status: provider.disabledReason ?? "ready",
    }));
}

/** Safe secret metadata with its timestamp localized for the settings list. */
function secretRows(secrets: readonly HappyAgentSecret[]): readonly HappyAgentSecretRow[] {
    return secrets.map((secret) => ({
        availableToAgents: secret.availableToAgents,
        description: secret.description,
        environmentVariables: secret.environmentVariables,
        id: secret.id,
        managed: secret.managed,
        updatedAt: new Intl.DateTimeFormat(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
        }).format(new Date(secret.updatedAt)),
    }));
}
