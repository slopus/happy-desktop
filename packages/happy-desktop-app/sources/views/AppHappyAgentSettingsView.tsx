import { useSyncExternalStore } from "react";
import type {
    AppearanceStore,
    ExperimentsStore,
    HappyAgentInstructionsSnapshot,
    HappyAgentDebugLogSnapshot,
    HappyAgentSecurityPolicySnapshot,
    HappyAgentSecret,
    HappyAgentModelCatalog,
    HappyAgentModelKey,
    HappyAgentPermissionMode,
    HappyAgentProviderEntry,
    HappyAgentSettingsSnapshot,
    HappyAgentSettingsStore,
    HappyAgentThinkingLevel,
    HappyAgentWindowStore,
    TitleShimmerStore,
} from "happy-desktop-state";
import {
    HAPPY_AGENT_INSTRUCTIONS_MAX_BYTES,
    HAPPY_AGENT_SECURITY_POLICY_MAX_BYTES,
    happyAgentModelKey,
    happyAgentPermissionLabel,
    happyAgentThinkingLabel,
    experimentsStoreNoop,
    happyAgentCloudStoreNoop,
    happyAgentAvailabilityProject,
    happyAgentIntegrationStoreNoop,
    happyAgentProfileStoreNoop,
    happyAgentProviderUsageStoreNoop,
    happyAgentProvidersStoreNoop,
    happyAgentSecretsStoreNoop,
    happyAgentWindowStoreNoop,
    titleShimmerStoreNoop,
} from "happy-desktop-state";
import {
    HappyAgentAccountSettings,
    HappyAgentGeneralSettings,
    HappyAgentDebugLogPanel,
    HappyAgentDebugSettings,
    HappyAgentInstructionsSettings,
    HappyAgentMobileSettings,
    HappyAgentProviderSettings,
    HappyAgentProfilerSettings,
    HappyAgentProfileSettings,
    HappyAgentSecretSettings,
    HappyAgentSettingsShell,
    HappyAgentStateSettings,
    HappyAgentUsageSettings,
    providerAccountName,
    type HappyAgentProviderRow,
    type HappyAgentSecretRow,
    type HappyAgentSettingsCategory,
    type HappyAgentStateDocument,
} from "happy-desktop-ui";
import { HappyAgentVersionProvider } from "../HappyAgentVersionProvider";
import type { SelectOption } from "happy-desktop-ui";
import { hostHappyAgent, type AppHappyAgentDirectoryStore } from "../AppHappyAgentView";

/** The categories the local settings window offers, in the order they are listed. */
export const HAPPY_AGENT_SETTINGS_CATEGORIES: readonly HappyAgentSettingsCategory[] = [
    { icon: "settings", id: "general", label: "General" },
    // Local author identity and the optional WorkOS account share one category.
    { icon: "users", id: "account", label: "Account" },
    { icon: "doc", id: "instructions", label: "Instructions" },
    { icon: "lock", id: "secrets", label: "Secrets" },
    { icon: "globe", id: "providers", label: "Providers" },
    // Usage sits after Providers because it is the same accounts read the other
    // way round: which of them exist, then what each has spent.
    { icon: "zap", id: "usage", label: "Usage" },
    { icon: "mobile", id: "mobile-access", label: "Mobile Access" },
    { icon: "code", id: "debug", label: "Dev Tools" },
];

export const HAPPY_AGENT_SETTINGS_DEFAULT_CATEGORY = "general";

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

/** Why the daemon is being taken down and brought back. */
export type AppHappyAgentDaemonRestartReason = "install" | "restart";

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
          /** The drain was cut short, so work was interrupted rather than finished. */
          readonly killed: boolean;
      }
    | {
          readonly phase: "starting";
          readonly reason: AppHappyAgentDaemonRestartReason;
          readonly version: string;
      }
    | {
          readonly phase: "reconnecting";
          readonly reason: AppHappyAgentDaemonRestartReason;
          readonly version: string;
      }
    | {
          readonly phase: "error";
          readonly reason: AppHappyAgentDaemonRestartReason;
          readonly version: string;
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
    debug: "Inspect live state, Happy and Happy Agent debugger endpoints, and renderer profiles",
    general: "How this window looks and what a new session starts with",
    "mobile-access": "This Happy Agent's connection to Happy Mobile",
    account: "Local author identity and Happy account connection",
    instructions: "Machine-wide agent guidance and permission-review policy",
    secrets: "Write-only environment bundles this Happy Agent can provide to agents",
    providers: "Every model provider this Happy Agent daemon knows about",
    usage: "How much of each provider account's plan this machine has spent",
};

const PERMISSION_MODES: readonly HappyAgentPermissionMode[] = [
    "auto",
    "workspace_write",
    "read_only",
    "full_access",
];

export interface AppHappyAgentSettingsViewProps {
    appearance: AppearanceStore;
    /** Managed Happy Agent controls, present only in the native desktop shell. */
    daemon?: AppHappyAgentDaemonStore;
    /**
     * Whether this window offers the features that are not finished yet. Absent
     * in a host that remembers no such choice, which withholds them.
     */
    experiments?: ExperimentsStore;
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
    const stateOpen = props.section === "debug";
    const appearance = useSyncExternalStore(
        props.appearance.subscribe,
        props.appearance.get,
        props.appearance.get,
    );
    const experimentsStore = props.experiments ?? experimentsStoreNoop;
    const experiments = useSyncExternalStore(
        experimentsStore.subscribe,
        experimentsStore.get,
        experimentsStore.get,
    );
    const titleShimmerStore = props.titleShimmer ?? titleShimmerStoreNoop;
    const titleShimmer = useSyncExternalStore(
        titleShimmerStore.subscribe,
        titleShimmerStore.get,
        titleShimmerStore.get,
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
        (props.section === "account" || stateOpen ? host?.session?.profile?.() : undefined) ??
        happyAgentProfileStoreNoop;
    const profile = useSyncExternalStore(
        profileStore.subscribe,
        profileStore.get,
        profileStore.get,
    );
    // The connection keeps both identities synchronized. This category only
    // observes their already-warm snapshots while it is visible.
    const cloudStore =
        (props.section === "account" || stateOpen ? host?.session?.cloud?.() : undefined) ??
        happyAgentCloudStoreNoop;
    const cloud = useSyncExternalStore(cloudStore.subscribe, cloudStore.get, cloudStore.get);
    const happyIntegrationStore =
        (props.section === "mobile-access" || stateOpen
            ? host?.session?.happyIntegration?.()
            : undefined) ?? happyAgentIntegrationStoreNoop;
    const happyIntegration = useSyncExternalStore(
        happyIntegrationStore.subscribe,
        happyIntegrationStore.get,
        happyIntegrationStore.get,
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
        (props.section === "secrets" || stateOpen ? host?.session?.secrets?.() : undefined) ??
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
        (props.section === "providers" || stateOpen ? host?.session?.providers : undefined) ??
        happyAgentProvidersStoreNoop;
    const providers = useSyncExternalStore(
        providersStore.subscribe,
        providersStore.get,
        providersStore.get,
    );
    // The Usage category is the only thing that reads these, and subscribing is
    // what starts the work: the daemon is asked what its accounts have spent,
    // and the clock ticks the time left until each reset, only while that
    // category is the one on screen.
    const usageOpen = props.section === "usage";
    const usageStore =
        (usageOpen || stateOpen ? host?.session?.providerUsage : undefined) ??
        happyAgentProviderUsageStoreNoop;
    const usage = useSyncExternalStore(usageStore.subscribe, usageStore.get, usageStore.get);
    // The clock is not part of raw state: nothing there counts down, and a
    // ticking second would republish every snapshot on the page for nothing.
    const clockStore = usageOpen ? host?.session?.clock : undefined;
    const currentTime = useSyncExternalStore(
        clockStore?.subscribe ?? noSubscribe,
        clockStore?.get ?? clockStopped,
        clockStore?.get ?? clockStopped,
    );
    const windowStateStore = props.windowState ?? happyAgentWindowStoreNoop;
    const windowState = useSyncExternalStore(
        windowStateStore.subscribe,
        windowStateStore.get,
        windowStateStore.get,
    );
    const debugStore = (props.section === "debug" ? props.debug : undefined) ?? debugStoreNoop;
    const debug = useSyncExternalStore(debugStore.subscribe, debugStore.get, debugStore.get);
    const debugLogStore = props.section === "debug" ? host?.session?.debugLog : undefined;
    const debugLog = useSyncExternalStore(
        debugLogStore?.subscribe ?? noSubscribe,
        debugLogStore?.get ?? debugLogEmpty,
        debugLogStore?.get ?? debugLogEmpty,
    );
    const profilerStore =
        (props.section === "debug" ? props.profiler : undefined) ?? profilerStoreNoop;
    const profiler = useSyncExternalStore(
        profilerStore.subscribe,
        profilerStore.get,
        profilerStore.get,
    );
    const daemonStore = (props.section === "general" ? props.daemon : undefined) ?? daemonStoreNoop;
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
    const selection = defaultSelection(catalog, settings);
    const model = catalog?.providers
        .flatMap((provider) => provider.models.map((entry) => ({ provider, model: entry })))
        .find(
            (entry) =>
                entry.provider.id === selection.providerId && entry.model.id === selection.modelId,
        );
    const effort =
        model?.model && !model.model.thinkingLevels.includes(settings.defaultEffort)
            ? model.model.defaultThinkingLevel
            : settings.defaultEffort;
    const content = (
        <HappyAgentSettingsShell
            activeCategoryId={props.section}
            categories={HAPPY_AGENT_SETTINGS_CATEGORIES}
            description={CATEGORY_DESCRIPTIONS[props.section]}
            onCategorySelect={props.onCategorySelect}
            onClose={props.onClose}
            title={
                HAPPY_AGENT_SETTINGS_CATEGORIES.find((category) => category.id === props.section)
                    ?.label ?? "Settings"
            }
            windowControls={props.platform === "desktop"}
            windowFullScreen={windowState.fullScreen}
            connectionRail={windowState.connectionRail}
        >
            {props.section === "mobile-access" ? (
                <HappyAgentMobileSettings
                    configured={happyIntegration.configured}
                    disconnecting={happyIntegration.disconnecting}
                    onDisconnect={() => {
                        if (happyAgentOnline()) happyIntegrationStore.happyIntegrationDisconnect();
                    }}
                    onPair={() => {
                        if (happyAgentOnline()) happyIntegrationStore.happyIntegrationPair();
                    }}
                    onPairingCancel={() => {
                        if (happyAgentOnline())
                            happyIntegrationStore.happyIntegrationPairingCancel();
                    }}
                    pairingCanceling={happyIntegration.pairingCanceling}
                    pairingData={happyIntegration.pairing?.data}
                    pairingExpiresAt={happyIntegration.pairing?.expiresAt}
                    pairingStarting={happyIntegration.pairingStarting}
                    status={happyIntegration.status}
                    {...(happyIntegration.error ? { error: happyIntegration.error.message } : {})}
                    {...(happyIntegration.disconnectError
                        ? { disconnectError: happyIntegration.disconnectError.message }
                        : {})}
                    {...(happyIntegration.pairingError
                        ? { pairingError: happyIntegration.pairingError.message }
                        : {})}
                    {...(happyIntegration.message ? { message: happyIntegration.message } : {})}
                    {...(unavailable === undefined ? {} : { unavailable })}
                />
            ) : props.section === "debug" ? (
                <>
                    <HappyAgentStateSettings
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
            ) : props.section === "account" ? (
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
                        {...(profile.photo === undefined
                            ? {}
                            : { imageUrl: profile.photo.imageUrl })}
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
            ) : props.section === "instructions" ? (
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
            ) : props.section === "providers" ? (
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
            ) : props.section === "secrets" ? (
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
            ) : props.section === "usage" ? (
                <HappyAgentUsageSettings
                    loading={usage.loading}
                    providers={usage.providers}
                    readingTime={usageReadingTime}
                    {...(clockStore ? { currentTime } : {})}
                    {...(usage.error ? { error: usage.error } : {})}
                />
            ) : (
                <HappyAgentGeneralSettings
                    {...(props.daemon
                        ? {
                              agent: daemonView,
                              onAgentCheck: daemonStore.daemonCheck,
                              onAgentRestart: daemonStore.daemonRestart,
                              onAgentUpgrade: daemonStore.daemonUpgrade,
                              onAgentVersionSelect: daemonStore.daemonVersionSelect,
                          }
                        : {})}
                    appearance={appearance.mode}
                    defaultModelKey={
                        selection.modelId
                            ? happyAgentModelKey(selection.providerId, selection.modelId)
                            : undefined
                    }
                    effort={effort}
                    effortOptions={(model?.model.thinkingLevels ?? []).map((level) => ({
                        label: happyAgentThinkingLabel(level),
                        value: level,
                    }))}
                    error={models.type === "error" ? models.error.message : undefined}
                    experimentalFeaturesEnabled={experiments.experimentalFeaturesEnabled}
                    loading={models.type !== "ready" && models.type !== "error"}
                    modelOptions={modelOptions(catalog, settings)}
                    onAppearanceChange={(mode) => props.appearance.appearanceSelect(mode)}
                    onScrollbarVisibilityChange={(visibility) =>
                        props.appearance.scrollbarVisibilitySelect(visibility)
                    }
                    onExperimentalFeaturesChange={(enabled) =>
                        experimentsStore.experimentalFeaturesUpdate(enabled)
                    }
                    onTitleShimmerChange={(enabled) =>
                        titleShimmerStore.titleShimmerUpdate(enabled)
                    }
                    onDefaultModelChange={(key) => {
                        const [providerId, ...rest] = key.split(":");
                        const modelId = rest.join(":");
                        const selected = catalog?.providers
                            .find((provider) => provider.id === providerId)
                            ?.models.find((candidate) => candidate.id === modelId);
                        if (!providerId || !selected) return;
                        if (!happyAgentOnline()) return;
                        props.settings.defaultModelUpdate(providerId, modelId);
                        props.settings.defaultEffortUpdate(selected.defaultThinkingLevel);
                    }}
                    onEffortChange={(effort) => {
                        if (happyAgentOnline())
                            props.settings.defaultEffortUpdate(effort as HappyAgentThinkingLevel);
                    }}
                    onPermissionModeChange={(mode) => {
                        if (happyAgentOnline())
                            props.settings.defaultPermissionModeUpdate(
                                mode as HappyAgentPermissionMode,
                            );
                    }}
                    permissionMode={settings.defaultPermissionMode}
                    permissionModeOptions={PERMISSION_MODES.map((mode) => ({
                        label: happyAgentPermissionLabel(mode),
                        value: mode,
                    }))}
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
            description: "The model catalog and last-used selection",
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

/**
 * When a usage reading was taken, as an absolute local time. A reading is only
 * as good as its age — a plan can be spent in the minutes since — so the account
 * says when it was taken rather than implying it is live.
 */
function usageReadingTime(capturedAt: number): string {
    return new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(new Date(capturedAt));
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

/** The chosen default, falling back to whatever the catalog itself defaults to. */
function defaultSelection(
    catalog: HappyAgentModelCatalog | undefined,
    settings: HappyAgentSettingsSnapshot,
): { providerId: string; modelId: string } {
    return {
        modelId: settings.defaultModelId ?? catalog?.defaultModelId ?? "",
        providerId: settings.defaultProviderId ?? catalog?.defaultProviderId ?? "",
    };
}

/** Every model a usable provider offers, labelled "Provider · Model" for one flat picker. */
function modelOptions(
    catalog: HappyAgentModelCatalog | undefined,
    settings: HappyAgentSettingsSnapshot,
): readonly SelectOption[] {
    return (catalog?.providers ?? []).flatMap((provider) =>
        provider.models
            .filter(
                (model) => !settings.disabledModels.has(happyAgentModelKey(provider.id, model.id)),
            )
            .map((model) => ({
                disabled: provider.disabledReason !== undefined,
                label: `${providerAccountName(provider.id)} · ${model.name}`,
                value: happyAgentModelKey(provider.id, model.id),
            })),
    );
}

function providerRows(
    providers: readonly HappyAgentProviderEntry[],
    settings: HappyAgentSettingsSnapshot,
    selection: { providerId: string; modelId: string },
): readonly HappyAgentProviderRow[] {
    return providers.map((provider) => ({
        enabled: provider.enabled,
        id: provider.id,
        models: provider.models.map((model) => ({
            contextWindow: model.contextWindow,
            efforts: model.thinkingLevels.map(happyAgentThinkingLabel),
            enabled: !settings.disabledModels.has(happyAgentModelKey(provider.id, model.id)),
            id: happyAgentModelKey(provider.id, model.id),
            isDefault: provider.id === selection.providerId && model.id === selection.modelId,
            modelId: model.id,
            name: model.name,
        })),
        name: providerAccountName(provider.id),
        saving: provider.saving,
        serviceTiers: provider.serviceTiers.map((tier) => (tier === "fast" ? "Fast" : tier)),
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
