import { useSyncExternalStore } from "react";
import type {
    AppearanceStore,
    HappyAgentAttentionStore,
    HappyAgentCompletionSound,
    HappyAgentChangeTiersSnapshot,
    HappyAgentChangeTiersStore,
    ExperimentsStore,
    MobilePairingMethodStore,
    ProjectsVisibilityStore,
    GptLiveStore,
    HappyAgentInstructionsSnapshot,
    HappyAgentDebugLogSnapshot,
    HappyAgentSecurityPolicySnapshot,
    HappyAgentSecret,
    HappyAgentModelKey,
    HappyAgentCustomProviderEditor,
    HappyAgentCloudConnection,
    HappyAgentCloudProvidersSnapshot,
    HappyAgentProviderEntry,
    HappyAgentSettingsSnapshot,
    HappyAgentSettingsStore,
    HappyAgentTaskSettingsSnapshot,
    HappyAgentSidebarVisibilityStore,
    HappyAgentWindowStore,
    KeepAwakeStore,
    ServerAddStore,
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
    happyAgentProviderServiceName,
    happyAgentThinkingLabel,
    experimentsStoreNoop,
    mobilePairingMethodStoreNoop,
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
    happyAgentCredentialImportStoreNoop,
    happyAgentCloudProvidersStoreNoop,
    happyAgentRepositoriesStoreNoop,
    happyAgentCloudProviderAddTeamOnly,
    happyAgentCloudConnectionName,
    happyAgentCloudConnectionEditable,
    happyAgentCloudCredentialReplaceable,
    happyAgentProviderAddLinkParse,
    type HappyAgentCloudProvidersStore,
    happyAgentMembersStoreNoop,
    type HappyAgentMembersSnapshot,
    type HappyAgentCredentialImportSnapshot,
    happyAgentSecretsStoreNoop,
    happyAgentVoiceSettingsStoreNoop,
    happyAgentWindowStoreNoop,
    happyAgentAttentionConnection,
    happyAgentAttentionStoreNoop,
    keepAwakeStoreCreate,
    serverPhoneLinkFormat,
    serverUrlProblemMessage,
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
    HappyAgentCustomProviderDialog,
    type HappyAgentCustomProviderDialogProps,
    HappyAgentProviderSettings,
    HappyAgentCredentialImport,
    HappyAgentAiProviders,
    type HappyAgentAiProviderConnectionRow,
    type HappyAgentProviderAddDialogProps,
    type HappyAgentProviderEditDialogProps,
    HappyAgentMembersSettings,
    Banner,
    type HappyAgentCredentialImportRow,
    HappyAgentProfilerSettings,
    HappyAgentProfileSettings,
    HappyAgentPasswordSettings,
    HappyAgentSecretSettings,
    HappyAgentServerSettings,
    HappyAgentSettingsShell,
    HappyAgentTaskSettings,
    HappyAgentAutoJoinSettings,
    type HappyAgentTaskSettingsProps,
    HappyAgentSurfaceSettings,
    GptLiveSettings,
    HappyAgentStateSettings,
    HappyAgentUsageSettings,
    providerAccountName,
    type HappyAgentProviderRow,
    type HappyAgentSecretRow,
    type HappyAgentSettingsCategory,
    type HappyAgentStateDocument,
    type HappyAgentServerRow,
    type HappyAgentServerSignIn,
    HappyCloudWebSettings,
} from "happy-desktop-ui";
import { HappyAgentVersionProvider } from "../HappyAgentVersionProvider";
import { AppRepositoriesSettings } from "./AppRepositoriesSettings";
import { happyAgentSettingsCategoryAvailable } from "../happyAgentSettingsCategoryAvailable";
import {
    AppMobileDirectSection,
    appMobileDirectOff,
    appMobilePairingOptions,
    appMobileRelayFromIntegration,
    appMobileRelayFromLink,
} from "../components/AppMobilePairing";
import {
    hostHappyAgent,
    type AppHappyAgentDirectorySnapshot,
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
    // Team servers this window signs in to; offered only by a host that can add them.
    { icon: "globe", id: "servers", label: "Servers" },
    // How each project's changes are split into tiers in the Changes listing.
    { icon: "file-diff", id: "file-tiers", label: "File tiers" },
    { icon: "doc", id: "instructions", label: "Instructions" },
    { icon: "lock", id: "secrets", label: "Secrets" },
    { icon: "lock", id: "passwords", label: "Passwords" },
    { icon: "globe", id: "providers", label: "Providers" },
    // Who is on a Happy Cloud server; offered only there.
    { icon: "users", id: "members", label: "Members" },
    // The team's code on a Happy Cloud server; offered only there.
    { icon: "repository", id: "repositories", label: "Repositories" },
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

/**
 * The category a `happy://settings/<page>` link opens here, or nothing when
 * this window has no such page. Import lives on the Providers page.
 */
export function happyAgentSettingsSectionOf(page: string): string | undefined {
    const section =
        page === "providers/import" || happyAgentProviderAddLinkParse(page) !== undefined
            ? "providers"
            : page;
    return happyAgentSettingsCategoryExists(section) ? section : undefined;
}

/**
 * Opens what a settings page names beyond its category: Import's scan on a
 * desktop, or an AI provider's add dialog. Where there is no scan, as on the
 * web, the import page opens the add dialog's choices instead.
 */
export function happyAgentSettingsPageOpen(
    session:
        | {
              readonly credentialImport?: () => { dialogOpen(): void } | undefined;
              readonly cloudProviders?: () => HappyAgentCloudProvidersStore | undefined;
          }
        | undefined,
    page: string,
): void {
    if (page === "providers/import") {
        const scan = session?.credentialImport?.();
        if (scan) scan.dialogOpen();
        else session?.cloudProviders?.()?.addOpen();
        return;
    }
    const add = happyAgentProviderAddLinkParse(page);
    if (add) session?.cloudProviders?.()?.addOpen(add);
}

/** True when `section` addresses a category this window actually has. */
export function happyAgentSettingsCategoryExists(section: string): boolean {
    return HAPPY_AGENT_SETTINGS_CATEGORIES.some((category) => category.id === section);
}

export interface AppHappyAgentDebugTargetSnapshot {
    readonly error?: string;
    readonly status: "stopped" | "starting" | "running" | "stopping" | "unavailable" | "error";
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
    servers: "Team servers you sign in to",
    "file-tiers": "Which changed files are listed apart",
    instructions: "Agent guidance and permission review for this machine",
    secrets: "Environment variables for agents",
    passwords: "Saved logins from your browsers",
    providers: "Model providers and the models they offer",
    members: "Who is on this server and what they may do",
    usage: "What each provider account has spent",
};

/**
 * The team servers the host Happy Agent connects to by address, each with its
 * sign-in and the code a phone scans to add it. Only a server reached over
 * HTTPS whose instance is known has a code.
 */
function serverRows(
    entries: AppHappyAgentDirectorySnapshot["happyAgents"],
): readonly HappyAgentServerRow[] {
    return entries.flatMap((entry) => {
        if (entry.serverUrl === undefined || entry.remoteId === undefined) return [];
        const phoneCode = serverPhoneLinkFormat({
            url: entry.serverUrl,
            ...(entry.instanceId === undefined ? {} : { instanceId: entry.instanceId }),
        });
        return [
            {
                id: entry.id,
                name: entry.label,
                address: entry.serverUrl,
                signIn: serverSignInRead(entry),
                ...(phoneCode === undefined ? {} : { phoneCode }),
            },
        ];
    });
}

function serverSignInRead(entry: AppHappyAgentEntry): HappyAgentServerSignIn {
    const signIn = entry.signIn;
    if (signIn === undefined) return { kind: "signedIn" };
    switch (signIn.phase) {
        case "required":
            return entry.message === undefined
                ? { kind: "required" }
                : { kind: "required", message: entry.message };
        case "browser":
            return signIn.host === undefined
                ? { kind: "browser" }
                : { kind: "browser", host: signIn.host };
        case "failed":
            return { kind: "failed", message: signIn.message };
    }
}

/** The Chief of Staff's own name on the host Happy Agent, for the words that name it. */
function chiefOfStaffNameRead(directory: AppHappyAgentDirectorySnapshot): string {
    return (
        hostHappyAgent(directory)?.bots.find((bot) => bot.systemKey === "chief_of_staff")?.name ??
        "Chief of Staff"
    );
}

/**
 * Team servers in Settings › Servers: adding one by address, and the window's
 * whole directory they are listed from. A connection's own directory names only
 * that connection, so the list cannot come from it.
 */
export interface AppServers {
    readonly add: ServerAddStore;
    readonly directory: Pick<AppHappyAgentDirectoryStore, "get" | "subscribe">;
    /** Signs in to one listed server, by its directory entry ID. */
    signIn(id: string): void;
    /** Stops a listed server's sign-in whose browser is open. */
    signInCancel(id: string): void;
}

/** Stands in where the host cannot add servers, so the view subscribes unconditionally. */
const serverAddAbsentSnapshot = { url: "", phase: { kind: "editing" } } as const;
const serverAddStoreAbsent: ServerAddStore = {
    get: () => serverAddAbsentSnapshot,
    subscribe: () => () => undefined,
    urlUpdate: () => undefined,
    serverAddSubmit: () => undefined,
    serverRemoveSubmit: () => undefined,
    [Symbol.dispose]: () => undefined,
};
const serverDirectoryAbsentSnapshot: AppHappyAgentDirectorySnapshot = { happyAgents: [] };
const serverDirectoryAbsent: AppServers["directory"] = {
    get: () => serverDirectoryAbsentSnapshot,
    subscribe: () => () => undefined,
};

/** Stands in where the host cannot hold the machine awake, keeping hook order fixed. */
const keepAwakeStoreNone = keepAwakeStoreCreate({ mode: "off" });

/** Stands in where the host sends no usage events, so the view subscribes unconditionally. */
const usageAnalyticsAbsentSnapshot = {
    usageAnalyticsEnabled: false,
    usageAnalyticsSaveFailed: false,
} as const;
const usageAnalyticsAbsent: UsageAnalyticsStore = {
    get: () => usageAnalyticsAbsentSnapshot,
    subscribe: () => () => undefined,
    usageAnalyticsUpdate: () => undefined,
};

/** The cloud web app's session at the edge: its server, switching, and signing out. */
export interface AppCloudWebSession {
    readonly serverName: string;
    onServerSwitch(): void;
    onSignOut(): void;
}

export interface AppHappyAgentSettingsViewProps {
    appearance: AppearanceStore;
    /** Opens a page in the person's own browser, such as a provider's sign-in page. */
    externalLinkOpen?: (url: string) => void;
    /** Present only in the cloud web app. */
    cloudWebSession?: AppCloudWebSession;
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
    /** Which way Mobile Access offers a phone first; absent, Relay. */
    mobilePairingMethod?: MobilePairingMethodStore;
    /**
     * Whether the primary connection hides its Projects section. Absent in a
     * host that remembers no such choice, which offers no control for it.
     */
    projectsVisibility?: ProjectsVisibilityStore;
    /** Whether this window sends product analytics events. Absent where it sends none. */
    usageAnalytics?: UsageAnalyticsStore;
    /** Adds team servers by address. Absent where the host cannot, which leaves Servers out. */
    servers?: AppServers;
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
    /** Opens a person's profile on a Happy Cloud server. */
    onUserProfileOpen?(happyAgentId: string, userId: string): void;
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
    const methodStore = props.mobilePairingMethod ?? mobilePairingMethodStoreNoop;
    const { method: pairingMethod } = useSyncExternalStore(
        methodStore.subscribe,
        methodStore.get,
        methodStore.get,
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
    const serverAddStore = props.servers?.add ?? serverAddStoreAbsent;
    const serverAdd = useSyncExternalStore(
        serverAddStore.subscribe,
        serverAddStore.get,
        serverAddStore.get,
    );
    const serverDirectoryStore = props.servers?.directory ?? serverDirectoryAbsent;
    const serverDirectory = useSyncExternalStore(
        serverDirectoryStore.subscribe,
        serverDirectoryStore.get,
        serverDirectoryStore.get,
    );
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
    const happyCloud = host?.happyCloud === true;
    const section = happyAgentSettingsCategoryAvailable(props.section, happyCloud)
        ? props.section
        : HAPPY_AGENT_SETTINGS_DEFAULT_CATEGORY;
    const stateOpen = section === "debug";
    const membersStore = host?.session?.members?.();
    const repositoriesStore = host?.session?.repositories?.();
    // A category the host cannot serve is left out of the list rather than
    // shown and refused.
    const categories = HAPPY_AGENT_SETTINGS_CATEGORIES.filter(
        (category) =>
            happyAgentSettingsCategoryAvailable(category.id, happyCloud) &&
            (category.id !== "servers" || props.servers !== undefined) &&
            (category.id !== "members" || membersStore !== undefined) &&
            (category.id !== "repositories" || repositoriesStore !== undefined),
    );
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
        (!happyCloud && (section === "account" || stateOpen)
            ? host?.session?.cloud?.()
            : undefined) ?? happyAgentCloudStoreNoop;
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
    // A computer linked through the Happy server already reaches every phone
    // on the account, so it offers only the direct code, and its link stays.
    const relayLinked = happyIntegration.configured === true;
    // Phones paired directly, and the direct half of every pairing this
    // category opens. Its pairing code is secret, so Dev Tools never prints it.
    // While a pairing page shows Relay the connector is not followed, so no
    // direct code is made behind it.
    const relayPageShown =
        pairingMethod === "relay" &&
        !relayLinked &&
        (happyIntegration.pairingOpen || happyIntegration.setup !== undefined);
    const mobileConnectorOwned =
        section === "mobile-access" ? host?.session?.mobileConnector?.() : undefined;
    const mobileConnectorStore =
        (relayPageShown ? undefined : mobileConnectorOwned) ?? happyAgentMobileConnectorStoreNoop;
    // A page that opened on Relay asks for a direct code as Direct shows.
    const pairingMethodSelect = (method: "relay" | "direct") => {
        if (method === "direct") mobileConnectorOwned?.pairingOpen();
        methodStore.methodSelect(method, "mobile_access");
    };
    const mobileConnector = useSyncExternalStore(
        mobileConnectorStore.subscribe,
        mobileConnectorStore.get,
        mobileConnectorStore.get,
    );
    // A way of pairing this Happy Agent reports off is not offered. The local
    // desktop pairs through the guided setup, which goes through the relay, so
    // with the relay off it has no way left. With none, Connect a phone is left out.
    const relayOff = happyIntegration.status === "disabled";
    const directOff = appMobileDirectOff(mobileConnector.connector);
    const pairingOff = relayOff && (directOff || happyIntegrationStore.mobileSetup !== undefined);
    // Connect a phone directly: only the direct code, for a linked computer.
    const directOnly = relayLinked && !directOff;
    const directOnlyOpen =
        directOnly &&
        mobileConnector.pairingOpen &&
        !happyIntegration.pairingOpen &&
        happyIntegration.setup === undefined;
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
    // Import exists only on a Happy Cloud server reached from a desktop, and
    // looks for nothing until the person asks it to.
    const credentialImportStore =
        section === "providers" ? host?.session?.credentialImport?.() : undefined;
    // The member list is read, and re-read every few seconds, only while
    // Members is on screen.
    const membersShown = section === "members" ? membersStore : undefined;
    const members = useSyncExternalStore(
        (membersShown ?? happyAgentMembersStoreNoop).subscribe,
        (membersShown ?? happyAgentMembersStoreNoop).get,
        (membersShown ?? happyAgentMembersStoreNoop).get,
    );
    // The repository list is read, and re-read every few seconds, only while
    // Repositories is on screen.
    const repositoriesShown = section === "repositories" ? repositoriesStore : undefined;
    const repositories = useSyncExternalStore(
        (repositoriesShown ?? happyAgentRepositoriesStoreNoop).subscribe,
        (repositoriesShown ?? happyAgentRepositoriesStoreNoop).get,
        (repositoriesShown ?? happyAgentRepositoriesStoreNoop).get,
    );
    // AI providers exist only on Happy Cloud; the list is followed while
    // Providers is on screen.
    const cloudProvidersStore =
        section === "providers" ? host?.session?.cloudProviders?.() : undefined;
    const cloudProviders = useSyncExternalStore(
        (cloudProvidersStore ?? happyAgentCloudProvidersStoreNoop).subscribe,
        (cloudProvidersStore ?? happyAgentCloudProvidersStoreNoop).get,
        (cloudProvidersStore ?? happyAgentCloudProvidersStoreNoop).get,
    );
    const cloudProviderEdit = cloudProvidersStore
        ? providerEditProps(cloudProviders, cloudProvidersStore)
        : undefined;
    const credentialImport = useSyncExternalStore(
        (credentialImportStore ?? happyAgentCredentialImportStoreNoop).subscribe,
        (credentialImportStore ?? happyAgentCredentialImportStoreNoop).get,
        (credentialImportStore ?? happyAgentCredentialImportStoreNoop).get,
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
    const changeTiersStore = happyCloud ? undefined : host?.session?.workspace.changeTiers;
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
            ) : section === "servers" ? (
                props.servers ? (
                    <HappyAgentServerSettings
                        url={serverAdd.url}
                        phase={serverAdd.phase}
                        chiefOfStaffName={chiefOfStaffNameRead(serverDirectory)}
                        servers={serverRows(serverDirectory.happyAgents)}
                        {...(serverAdd.urlProblem === undefined
                            ? {}
                            : { urlError: serverUrlProblemMessage(serverAdd.urlProblem) })}
                        {...(serverAdd.error === undefined
                            ? {}
                            : { error: serverAdd.error.message })}
                        onUrlChange={serverAddStore.urlUpdate}
                        onAdd={serverAddStore.serverAddSubmit}
                        onSignIn={(id) => props.servers?.signIn(id)}
                        onSignInCancel={(id) => props.servers?.signInCancel(id)}
                        onRemove={(id) => {
                            const entry = serverDirectory.happyAgents.find(
                                (candidate) => candidate.id === id,
                            );
                            if (entry?.remoteId === undefined || entry.serverUrl === undefined)
                                return;
                            serverAddStore.serverRemoveSubmit({
                                connectionId: entry.remoteId,
                                name: entry.label,
                                url: entry.serverUrl,
                            });
                        }}
                    />
                ) : null
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
                    pairingDirectOnly={directOnly}
                    onPairingOptionsOpen={() => {
                        if (!happyAgentOnline() || pairingOff) return;
                        // A linked computer's relay link is left exactly as it is.
                        if (directOnly) mobileConnectorOwned?.pairingOpen();
                        // The local desktop walks through getting the app first.
                        else if (mobileSetup) mobileSetup.start();
                        else happyIntegrationStore.happyIntegrationPairingOpen();
                    }}
                    // Pairing opens in a dialog over the rows: only the direct
                    // code for a linked computer, else Relay | Direct.
                    {...(directOnlyOpen && sessionClock
                        ? {
                              pairingOptions: appMobilePairingOptions({
                                  layout: "dialog",
                                  method: "direct",
                                  directOnly: true,
                                  onMethodSelect: pairingMethodSelect,
                                  relay: { kind: "connected" },
                                  direct: mobileConnectorStore,
                                  snapshot: mobileConnector,
                                  clock: sessionClock,
                                  online: happyAgentOnline,
                                  ...(unavailable === undefined ? {} : { unavailable }),
                              }).view,
                              onPairingOptionsClose: () => mobileConnectorOwned?.pairingClose(),
                          }
                        : {})}
                    {...(happyIntegration.pairingOpen && sessionClock
                        ? {
                              pairingOptions: appMobilePairingOptions({
                                  layout: "dialog",
                                  method: pairingMethod,
                                  onMethodSelect: pairingMethodSelect,
                                  relay: appMobileRelayFromIntegration(happyIntegration),
                                  relayStarting: happyIntegration.pairingStarting,
                                  onRelayRetry: happyIntegrationStore.happyIntegrationPair,
                                  direct: mobileConnectorStore,
                                  snapshot: mobileConnector,
                                  clock: sessionClock,
                                  online: happyAgentOnline,
                                  ...(unavailable === undefined ? {} : { unavailable }),
                              }).view,
                              onPairingOptionsClose:
                                  happyIntegrationStore.happyIntegrationPairingClose,
                          }
                        : {})}
                    pairingOff={pairingOff}
                    // Reported off by the Happy Agent, or not followed behind a
                    // Relay page, the direct section is left out.
                    {...(!directOff && !relayPageShown
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
                        <AppHappyAgentAutoJoinSettings entry={entry} entity="stories" />
                    </HappyAgentConnectionSettingsSection>
                ))
            ) : section === "account" ? (
                // The local author identity and optional WorkOS connection.
                <>
                    {props.cloudWebSession ? (
                        <HappyCloudWebSettings
                            onServerSwitch={props.cloudWebSession.onServerSwitch}
                            onSignOut={props.cloudWebSession.onSignOut}
                            serverName={props.cloudWebSession.serverName}
                        />
                    ) : null}
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
                    {/* The web app's Happy Cloud session stands in for the
                        machine's own WorkOS connection, which it has none of. */}
                    {happyCloud || props.cloudWebSession ? null : (
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
                    )}
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
                <>
                    {cloudProvidersStore ? (
                        <HappyAgentAiProviders
                            connections={cloudProviders.connections.map(cloudConnectionRow)}
                            loading={cloudProviders.loading}
                            {...(cloudProviders.error
                                ? { error: cloudProviders.error.message }
                                : {})}
                            {...(cloudProviders.saveError
                                ? { saveError: cloudProviders.saveError.message }
                                : {})}
                            teamManageable={cloudProviders.teamAllowed}
                            {...(cloudProviders.add
                                ? {
                                      add: providerAddProps(
                                          cloudProviders,
                                          cloudProvidersStore,
                                          props.externalLinkOpen,
                                      ),
                                  }
                                : {})}
                            {...(cloudProviderEdit ? { edit: cloudProviderEdit } : {})}
                            onAdd={() => cloudProvidersStore.addOpen()}
                            onEdit={(connectionId) => cloudProvidersStore.editOpen(connectionId)}
                            onCredentialEnabledChange={(connectionId, credentialId, enabled) =>
                                cloudProvidersStore.credentialEnabledUpdate(
                                    connectionId,
                                    credentialId,
                                    enabled,
                                )
                            }
                            onCredentialRemove={(connectionId, credentialId) =>
                                cloudProvidersStore.credentialRemove(connectionId, credentialId)
                            }
                        />
                    ) : null}
                    {credentialImportStore ? (
                        <HappyAgentCredentialImport
                            open={credentialImport.open}
                            onOpen={() => credentialImportStore.dialogOpen()}
                            onClose={() => credentialImportStore.dialogClose()}
                            phase={credentialImport.phase}
                            rows={credentialImportRows(credentialImport)}
                            shellScanned={credentialImport.shellScanned}
                            teamAllowed={credentialImport.teamAllowed}
                            {...(credentialImport.error
                                ? { error: credentialImport.error.message }
                                : {})}
                            onScan={(options) => credentialImportStore.scanStart(options)}
                            onPickToggle={(id) => credentialImportStore.pickToggle(id)}
                            onPickScopeChange={(id, scope) =>
                                credentialImportStore.pickScopeUpdate(id, scope)
                            }
                            onImport={() => credentialImportStore.importSubmit()}
                        />
                    ) : null}
                    <HappyAgentProviderSettings
                        loading={providers.loading}
                        onModelEnabledChange={(id, enabled) =>
                            happyAgentOnline()
                                ? props.settings.modelEnabledUpdate(
                                      id as HappyAgentModelKey,
                                      enabled,
                                  )
                                : undefined
                        }
                        onProviderEnabledChange={(id, enabled) => {
                            if (happyAgentOnline())
                                providersStore.providerEnabledUpdate(id, enabled);
                        }}
                        onKeyAdd={(providerId, input) =>
                            providersStore.credentialAdd(providerId, input)
                        }
                        onKeyEnabledChange={(providerId, keyId, enabled) => {
                            if (happyAgentOnline())
                                providersStore.credentialEnabledUpdate(providerId, keyId, enabled);
                        }}
                        onKeyRemove={(providerId, keyId) => {
                            if (happyAgentOnline())
                                providersStore.credentialRemove(providerId, keyId);
                        }}
                        {...(providers.customProvidersManageable
                            ? {
                                  onCustomProviderCreate: () => {
                                      if (happyAgentOnline())
                                          providersStore.customProviderCreateOpen();
                                  },
                                  onCustomProviderEdit: (providerId: string) => {
                                      if (happyAgentOnline())
                                          providersStore.customProviderEditOpen(providerId);
                                  },
                              }
                            : {})}
                        providers={providerRows(
                            providers.providers,
                            settings,
                            selection,
                            cloudProvidersStore !== undefined,
                        )}
                        {...(providers.error ? { error: providers.error.message } : {})}
                        {...(providers.saveError ? { saveError: providers.saveError.message } : {})}
                        {...(unavailable === undefined ? {} : { unavailable })}
                    />
                    {providers.customProviderEditor ? (
                        <HappyAgentCustomProviderDialog
                            {...customProviderDialogValues(providers.customProviderEditor)}
                            onClose={() => providersStore.customProviderEditorClose()}
                            onSave={(values) =>
                                providersStore.customProviderSave(values.providerId, {
                                    name: values.name,
                                    baseUrl: values.baseUrl,
                                    protocol: values.protocol,
                                    promptCacheKey: values.promptCacheKey,
                                    models: values.models.map((model) => ({
                                        id: model.id,
                                        name: model.name,
                                        contextWindow: model.contextWindow,
                                        inputTypes: model.images ? ["text", "image"] : ["text"],
                                    })),
                                })
                            }
                            {...(providers.customProviderEditor.providerId === undefined
                                ? {}
                                : {
                                      onRemove: () => {
                                          const providerId =
                                              providers.customProviderEditor?.providerId;
                                          if (providerId !== undefined)
                                              providersStore.customProviderRemove(providerId);
                                      },
                                  })}
                        />
                    ) : null}
                </>
            ) : section === "repositories" ? (
                repositoriesShown ? (
                    <AppRepositoriesSettings snapshot={repositories} store={repositoriesShown} />
                ) : null
            ) : section === "members" ? (
                membersShown ? (
                    <HappyAgentMembersSettings
                        {...(members.error ? { error: members.error.message } : {})}
                        inviteCreating={members.inviteCreating}
                        {...(members.inviteCreated
                            ? {
                                  inviteCreated: {
                                      code: members.inviteCreated.code,
                                      roleName: roleNameOf(members, members.inviteCreated.roleId),
                                      expires: expiresText(members.inviteCreated.expiresAt),
                                  },
                              }
                            : {})}
                        invites={members.invites.map((invite) => ({
                            id: invite.id,
                            roleName: roleNameOf(members, invite.roleId),
                            expires: [
                                ...(invite.uses === 0
                                    ? []
                                    : [
                                          invite.uses === 1
                                              ? "Used once"
                                              : `Used ${String(invite.uses)} times`,
                                      ]),
                                expiresText(invite.expiresAt),
                            ].join(" · "),
                            saving: invite.saving,
                        }))}
                        loading={members.loading}
                        manage={members.manage}
                        members={members.members.map((member) => ({
                            id: member.id,
                            ...(member.userId === null ? {} : { userId: member.userId }),
                            name: member.name ?? "Someone who hasn't signed in yet",
                            roleId: member.roleId,
                            joined: `Joined ${new Date(member.joinedAt).toLocaleDateString([], {
                                month: "short",
                                day: "numeric",
                            })}`,
                            self: member.self,
                            saving: member.saving,
                        }))}
                        onDelete={(confirm) => membersShown.serverDelete(confirm)}
                        onInviteCreate={(roleId) => membersShown.inviteCreate(roleId)}
                        onInviteCreatedDismiss={() => membersShown.inviteCreatedDismiss()}
                        onInviteRevoke={(inviteId) => membersShown.inviteRevoke(inviteId)}
                        onLeave={() => membersShown.serverLeave()}
                        {...(host?.happyCloud &&
                        host.session?.userProfile &&
                        props.onUserProfileOpen
                            ? {
                                  onProfileOpen: (userId: string) =>
                                      props.onUserProfileOpen?.(host.id, userId),
                              }
                            : {})}
                        onRemove={(memberId) => membersShown.memberRemove(memberId)}
                        onRoleChange={(memberId, roleId) =>
                            membersShown.memberRoleUpdate(memberId, roleId)
                        }
                        owner={members.roleId === "owner"}
                        roles={members.roles}
                        {...(members.saveError ? { saveError: members.saveError.message } : {})}
                        serverName={members.serverName}
                    />
                ) : (
                    <Banner tone="neutral" title="No members here">
                        Members belong to a Happy Cloud server. Open one to see who is on it.
                    </Banner>
                )
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
                    newSessionStart={settings.newSessionStart}
                    onNewSessionStartChange={(start) => {
                        if (happyAgentOnline()) props.settings.newSessionStartUpdate(start);
                    }}
                    error={models.type === "error" ? models.error.message : undefined}
                    {...(props.usageAnalytics
                        ? {
                              usageAnalyticsEnabled: usageAnalytics.usageAnalyticsEnabled,
                              usageAnalyticsSaveFailed: usageAnalytics.usageAnalyticsSaveFailed,
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
                    {...(!happyCloud && props.projectsVisibility && host
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
                    avatarsAnimated={appearance.avatarsAnimated}
                    onAvatarsAnimatedChange={(animated) =>
                        props.appearance.avatarsAnimatedUpdate(animated)
                    }
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

/** The `stories` switch, left out on a daemon without stories. */
const HappyAgentStoriesSettings = (props: HappyAgentTaskSettingsProps) =>
    props.status === "unsupported" ? null : (
        <HappyAgentAutoJoinSettings
            {...props}
            entity="Stories"
            label="Stories"
            description="See the stories your agents post, and let them post."
        />
    );

/** Each connection owns one preference store and one coarse subscription while this page is open. */
function AppHappyAgentAutoJoinSettings(props: {
    readonly entry: AppHappyAgentEntry;
    readonly entity: "task" | "surface" | "stories";
}) {
    const { entry } = props;
    const taskStore = props.entity === "task" ? entry.session?.taskSettings?.() : undefined;
    const surfaceStore =
        props.entity === "surface" ? entry.session?.surfaceSettings?.() : undefined;
    const storiesStore =
        props.entity === "stories" ? entry.session?.storiesSettings?.() : undefined;
    const store = taskStore ?? surfaceStore ?? storiesStore;
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
    const Settings = {
        task: HappyAgentTaskSettings,
        surface: HappyAgentSurfaceSettings,
        stories: HappyAgentStoriesSettings,
    }[props.entity];
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
                    storiesStore?.autoJoinUpdate(enabled);
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

/**
 * Happy Cloud's keys and sign-ins are listed and added under AI providers, so
 * the cards here keep only the keys of the team's own providers.
 */
function providerRows(
    providers: readonly HappyAgentProviderEntry[],
    settings: HappyAgentSettingsSnapshot,
    selection: { readonly providerId: string; readonly modelId: string } | undefined,
    aiProviders: boolean,
): readonly HappyAgentProviderRow[] {
    return providers.map((entry) => {
        const provider: HappyAgentProviderEntry =
            aiProviders && !entry.custom
                ? (({ credentials: _credentials, ...rest }) => rest)(entry)
                : entry;
        return providerRow(provider, settings, selection);
    });
}

function providerRow(
    provider: HappyAgentProviderEntry,
    settings: HappyAgentSettingsSnapshot,
    selection: { readonly providerId: string; readonly modelId: string } | undefined,
): HappyAgentProviderRow {
    return {
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
        ...providerTypeName(provider),
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
        ...(provider.custom ? { custom: { protocol: provider.custom.protocol } } : {}),
        ...(provider.credentials
            ? {
                  keys: {
                      addable: provider.credentials.keyed,
                      source: provider.credentials.source,
                      list: provider.credentials.list.map((credential) => ({
                          id: credential.id,
                          label: credential.label,
                          enabled: credential.enabled,
                          state: credential.state,
                          ...(credential.coolingUntil === null
                              ? {}
                              : {
                                    coolingUntil: new Date(
                                        credential.coolingUntil,
                                    ).toLocaleTimeString([], {
                                        hour: "numeric",
                                        minute: "2-digit",
                                    }),
                                }),
                          saving: provider.credentials?.saving.has(credential.id) === true,
                      })),
                  },
              }
            : {}),
    };
}

const CLOUD_VENDOR_NAMES: Readonly<Record<string, string>> = {
    openai: "OpenAI",
    anthropic: "Anthropic",
    codex: "ChatGPT",
    "claude-code": "Claude",
    grok: "Grok",
    bedrock: "Amazon Bedrock",
};

const CLOUD_KIND_NAMES = {
    api_key: "API key",
    aws_keys: "AWS keys",
    oauth: "Subscription",
    oauth_token: "Setup token",
} as const;

function cloudVendorName(vendor: string): string {
    return CLOUD_VENDOR_NAMES[vendor] ?? vendor;
}

/** One AI provider connection as Settings lists it. */
function cloudConnectionRow(
    connection: HappyAgentCloudConnection,
): HappyAgentAiProviderConnectionRow {
    const models = connection.models.length;
    return {
        id: connection.id,
        name: happyAgentCloudConnectionName(connection),
        group:
            connection.source === "operator"
                ? "included"
                : connection.scope === "team"
                  ? "team"
                  : "private",
        meta: connection.enabled
            ? [
                  [...new Set(connection.vendors.map(cloudVendorName))].join(", "),
                  models === 1 ? "1 model" : `${String(models)} models`,
              ]
                  .filter(Boolean)
                  .join(" · ")
            : "Add a key or sign in to use it",
        enabled: connection.enabled,
        ...(happyAgentCloudConnectionEditable(connection) ? { editable: true } : {}),
        ...(connection.credentials
            ? {
                  credentials: connection.credentials.map((credential) => ({
                      id: credential.id,
                      label: credential.label,
                      meta:
                          credential.reason === "signin_missing"
                              ? `${cloudVendorName(credential.vendor)} · Sign in again`
                              : `${cloudVendorName(credential.vendor)} · ${CLOUD_KIND_NAMES[credential.kind]}`,
                      enabled: credential.enabled,
                      state: credential.state,
                      ...(credential.coolingUntil === null
                          ? {}
                          : {
                                coolingUntil: new Date(credential.coolingUntil).toLocaleTimeString(
                                    [],
                                    { hour: "numeric", minute: "2-digit" },
                                ),
                            }),
                  })),
              }
            : {}),
    };
}

/** The edit dialog's props from the AI providers store, while its connection is listed. */
function providerEditProps(
    snapshot: HappyAgentCloudProvidersSnapshot,
    store: HappyAgentCloudProvidersStore,
): HappyAgentProviderEditDialogProps | undefined {
    const edit = snapshot.edit;
    const connection = edit
        ? snapshot.connections.find((candidate) => candidate.id === edit.connectionId)
        : undefined;
    if (!edit || !connection) return undefined;
    return {
        name: connection.name,
        credentials: (connection.credentials ?? []).map((credential) => ({
            id: credential.id,
            label: credential.label,
            meta: `${cloudVendorName(credential.vendor)} · ${CLOUD_KIND_NAMES[credential.kind]}`,
            replaceable: happyAgentCloudCredentialReplaceable(credential),
        })),
        saving: edit.phase === "busy",
        ...(edit.error ? { error: edit.error } : {}),
        onSave: (changes) => store.editSave(changes),
        onClose: () => store.editClose(),
    };
}

/** The add dialog's props from the AI providers store. */
function providerAddProps(
    snapshot: HappyAgentCloudProvidersSnapshot,
    store: HappyAgentCloudProvidersStore,
    externalLinkOpen: ((url: string) => void) | undefined,
): HappyAgentProviderAddDialogProps {
    const add = snapshot.add!;
    return {
        flow: add.flow,
        to: add.to,
        destinationChoice:
            snapshot.privateAllowed &&
            snapshot.teamAllowed &&
            !happyAgentCloudProviderAddTeamOnly(add.flow),
        keyVendors: snapshot.teamAllowed
            ? ["openai", "anthropic", "grok", "bedrock"]
            : ["openai", "anthropic", "grok"],
        teamOnly: happyAgentCloudProviderAddTeamOnly(add.flow),
        phase: add.phase,
        ...(add.signIn ? { signIn: add.signIn } : {}),
        ...(add.done === undefined ? {} : { done: add.done }),
        ...(add.error ? { error: add.error } : {}),
        teamRoutingEditable: snapshot.teamAllowed,
        chatgptAvailable: snapshot.signIns.has("codex"),
        claudeAvailable: snapshot.signIns.has("claude"),
        setupTokenAvailable: snapshot.setupToken,
        onFlowSelect: (flow) => store.addFlowSelect(flow),
        onBack: () => store.addBack(),
        onClose: () => store.addClose(),
        onDestinationChange: (to) => store.addDestinationUpdate(to),
        onApiKeySubmit: (secret, region) => store.apiKeySubmit(secret, region),
        onAwsKeysSubmit: (input) => store.awsKeysSubmit(input),
        onSetupTokenSubmit: (token) => store.setupTokenSubmit(token),
        onSignInStart: () => store.signInStart(),
        onSignInCodeSubmit: (code) => store.signInCodeSubmit(code),
        ...(externalLinkOpen ? { onExternalOpen: externalLinkOpen } : {}),
    };
}

/** The open provider dialog's state, as the dialog takes it. */
function customProviderDialogValues(
    editor: HappyAgentCustomProviderEditor,
): Omit<HappyAgentCustomProviderDialogProps, "onSave" | "onRemove" | "onClose"> {
    const definition = editor.definition;
    return {
        loading: editor.loading,
        saving: editor.saving,
        removing: editor.removing,
        ...(editor.providerId === undefined ? {} : { providerId: editor.providerId }),
        ...(editor.error ? { error: editor.error.message } : {}),
        ...(definition
            ? {
                  values: {
                      providerId: definition.providerId,
                      name: definition.name,
                      baseUrl: definition.baseUrl,
                      protocol: definition.protocol,
                      promptCacheKey: definition.promptCacheKey,
                      models: definition.models.map((model) => ({
                          id: model.id,
                          name: model.name,
                          contextWindow: model.contextWindow,
                          images: model.inputTypes.includes("image"),
                      })),
                  },
              }
            : {}),
    };
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

/** What Import lists: each found credential with its pick or how its import ended. */
function credentialImportRows(
    snapshot: HappyAgentCredentialImportSnapshot,
): HappyAgentCredentialImportRow[] {
    return snapshot.found.map((entry): HappyAgentCredentialImportRow => {
        const base = {
            id: entry.id,
            vendorName: entry.vendorName,
            label: entry.label,
            source: entry.source,
            ...(entry.account === undefined ? {} : { account: entry.account }),
        };
        if (entry.use.kind === "unsupported")
            return { ...base, use: "unsupported", reason: entry.use.reason };
        const picked = snapshot.picked.get(entry.id);
        const result = snapshot.results.get(entry.id);
        return {
            ...base,
            use: "import",
            subscription: entry.use.subscription,
            ...(entry.masked === undefined ? {} : { masked: entry.masked }),
            ...(picked === undefined ? {} : { picked }),
            ...(result === undefined
                ? {}
                : {
                      result: result.ok
                          ? { ok: true, duplicate: result.duplicate }
                          : { ok: false, message: result.message },
                  }),
        };
    });
}

/** The service named beside a provider, unless its own name already says it. */
function providerTypeName(provider: HappyAgentProviderEntry): { typeName?: string } {
    const typeName = happyAgentProviderServiceName(
        provider.type,
        providerAccountName(provider.id, provider.name),
    );
    return typeName === undefined ? {} : { typeName };
}

/** A role's name, or its ID when the team's roles don't list it. */
function roleNameOf(members: HappyAgentMembersSnapshot, roleId: string): string {
    return members.roles.find((role) => role.id === roleId)?.name ?? roleId;
}

/** "Expires in 3 days", "Expires in 5 hours" or "Expires soon". */
function expiresText(expiresAt: number): string {
    const hours = Math.floor((expiresAt - Date.now()) / 3_600_000);
    if (hours >= 48) return `Expires in ${String(Math.floor(hours / 24))} days`;
    if (hours >= 2) return `Expires in ${String(hours)} hours`;
    return "Expires soon";
}
