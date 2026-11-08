import { terminalDriverCreate, type AppHappyAgentSetup } from "happy-desktop-app";
import {
    connectHappyAgent,
    describeServerCompatibility,
    HappyAgentClient,
    happyAgentWorkspaceClientCreate,
    happyAgentProviderCredentialsApiCreate,
    happyAgentCloudProvidersApiCreate,
    happyCloudRequestCreate,
    happyAgentClockStoreCreate,
    gptLiveRuntimeCreate,
    type GptLiveRuntime,
    type GptLiveRuntimeCreateOptions,
    happyAgentDebugLogStoreCreate,
    happyAgentWorkspaceStoreCreate,
    happyAgentConversationRetentionFor,
    happyAgentOnboardingStoreCreate,
    happyAgentMobileConnectorStoreCreate,
    happyAgentChatOnboardingStoreCreate,
    happyAgentProviderClisStoreCreate,
    happyAgentDefaultModelStoreCreate,
    type HappyAgentChatOnboardingStore,
    type HappyAgentDefaultModelStore,
    type HappyAgentProviderClisStore,
    type HappyAgentSessionId,
    type HappyAgentChatOnboardingGate,
    type WelcomeStore,
    type HappyAgentOnboardingStore,
    HappyAgentApiError,
    type MutationRejectedDelta,
    type HappyAgentWorkspaceClient,
    type HappyAgentActivity,
    type HappyAgentClockStore,
    type HappyAgentCloudHost,
    type HappyAgentCloudStore,
    type HappyAgentTeamsStore,
    type HappyAgentConnection,
    type HappyAgentConnectionSnapshot,
    type HappyAgentConnectionStore,
    type HappyAgentDebugLogInput,
    type HappyAgentDebugLogStore,
    type HappyAgentHost,
    type HappyAgentIntegrationStore,
    type HappyAgentMobileConnectorStore,
    type HappyAgentInstructionsStore,
    type HappyAgentModelPreferencePersistence,
    type HappyAgentModelStore,
    type HappyAgentProfileStore,
    type HappyAgentProviderUsageStore,
    type HappyAgentProvidersStore,
    type HappyAgentVoiceSettingsStore,
    type HappyAgentSecurityPolicyStore,
    type HappyAgentSecretsStore,
    type HappyAgentArtifacts,
    type HappyAgentSearchStore,
    type HappyAgentSurfaces,
    type HappyAgentSessionLocation,
    type HappyAgentWorkspaceMemoryDocument,
    type HappyAgentFeedFilterPersistence,
    type HappyAgentWorkspaceMemoryPersistence,
    type HappyAgentWorkspaceStore,
    type HappyAgentCredentialImportHost,
    type ServerCompatibility,
    type TerminalColorScheme,
} from "happy-desktop-state";
import { imageCropOpen } from "happy-desktop-ui";
import { desktopViewPreferencesPersistence } from "./desktopViewPreferences";
import {
    desktopHappyMobileOnboardingSkip,
    desktopHappyMobileOnboardingSkipped,
} from "./desktopHappyMobileOnboarding";
import { happyAgentCatalogSourceCreate } from "./happyAgentCatalogSource";
import { happyAgentHostServicesCreate } from "./happyAgentHostServices";
import { happyAgentProfileSourceCreate } from "./happyAgentProfileSource";
import { happyAgentTranscriptConnectCreate } from "./happyAgentTranscriptSource";
import { happyAgentUsageSourceCreate } from "./happyAgentUsageSource";
import type { HappyAgentMobilePairingObserve } from "./desktopAnalytics";

export interface HappyAgentProtocolMismatch {
    readonly message: string;
}

function protocolMismatchOf(
    compatibility: ServerCompatibility,
): HappyAgentProtocolMismatch | undefined {
    if (compatibility.status === "checking" || compatibility.status === "compatible")
        return undefined;
    return {
        message: describeServerCompatibility(compatibility),
    };
}

const WORKSPACE_MEMORY_PREFIX = "happy.happy-agent.workspace-memory.v1:";
const FEED_FILTER_PREFIX = "happy.happy-agent.feed-filter.v1:";
const RETRY_MS = 1_000;
/** How many times onboarding's conversation is looked for before the window stops trying. */
const CHAT_ONBOARDING_OPEN_ATTEMPTS = 10;
const PRELOADED_SESSIONS = 12;

function workspaceMemoryPersistence(happyAgentId: string): HappyAgentWorkspaceMemoryPersistence {
    const key = `${WORKSPACE_MEMORY_PREFIX}${happyAgentId}`;
    return {
        read() {
            try {
                const value = localStorage.getItem(key);
                return value ? (JSON.parse(value) as HappyAgentWorkspaceMemoryDocument) : undefined;
            } catch {
                return undefined;
            }
        },
        write(document) {
            try {
                localStorage.setItem(key, JSON.stringify(document));
            } catch {
                // Storage-denied windows retain the in-memory store for this run.
            }
        },
    };
}

/** The reader's Activity filter, kept for each Happy Agent this window connects to. */
function feedFilterPersistence(happyAgentId: string): HappyAgentFeedFilterPersistence {
    const key = `${FEED_FILTER_PREFIX}${happyAgentId}`;
    return {
        read() {
            try {
                return localStorage.getItem(key);
            } catch {
                return undefined;
            }
        },
        write(filter) {
            try {
                localStorage.setItem(key, filter);
            } catch {
                // A storage-denied window keeps the choice for this run.
            }
        },
    };
}

export interface HappyAgentSession {
    /** Supplies the existing authenticated connection only to the opt-in voice integration. */
    gptLiveRuntimeCreate(options: Omit<GptLiveRuntimeCreateOptions, "client">): GptLiveRuntime;
    readonly welcome: WelcomeStore;
    readonly onboarding: HappyAgentOnboardingStore;
    /** Onboarding the server runs as a conversation, where it does. */
    readonly chatOnboarding: HappyAgentChatOnboardingStore;
    /** The assistants' own programs on the server's machine, as a reply's figure shows one. */
    readonly providerClis: () => HappyAgentProviderClisStore;
    /** The default model for new conversations, as a reply's figure changes it. */
    readonly defaultModel: () => HappyAgentDefaultModelStore;
    readonly connection: HappyAgentConnectionStore;
    readonly cloud: () => HappyAgentCloudStore;
    readonly teams: () => HappyAgentTeamsStore;
    readonly debugLog: HappyAgentDebugLogStore;
    readonly host: HappyAgentHost;
    readonly models: HappyAgentModelStore;
    readonly happyIntegration: () => HappyAgentIntegrationStore;
    /** Phones paired directly with this Happy Agent, and the pairing that adds one. */
    readonly mobileConnector: () => HappyAgentMobileConnectorStore;
    readonly profile: () => HappyAgentProfileStore | undefined;
    readonly providerUsage: HappyAgentProviderUsageStore | undefined;
    readonly providers: HappyAgentProvidersStore;
    readonly members: () => import("happy-desktop-state").HappyAgentMembersStore | undefined;
    readonly computes: () => import("happy-desktop-state").HappyAgentComputesStore | undefined;
    readonly repositories: () =>
        | import("happy-desktop-state").HappyAgentRepositoriesStore
        | undefined;
    readonly cloudProviders: () =>
        | import("happy-desktop-state").HappyAgentCloudProvidersStore
        | undefined;
    readonly credentialImport: () =>
        | import("happy-desktop-state").HappyAgentCredentialImportStore
        | undefined;
    readonly voiceSettings: HappyAgentVoiceSettingsStore;
    readonly taskSettings: () => import("happy-desktop-state").HappyAgentTaskSettingsStore;
    readonly surfaceSettings: () => import("happy-desktop-state").HappyAgentSurfaceSettingsStore;
    readonly storiesSettings: () => import("happy-desktop-state").HappyAgentAutoJoinSettingsStore;
    readonly stories: () => import("happy-desktop-state").HappyAgentStoriesStore;
    readonly workspace: HappyAgentWorkspaceStore;
    readonly instructions: HappyAgentInstructionsStore;
    readonly securityPolicy: HappyAgentSecurityPolicyStore;
    readonly secrets: () => HappyAgentSecretsStore;
    /** This Happy Agent's published artifacts, materialized as their surfaces open. */
    readonly artifacts: HappyAgentArtifacts;
    /** The reader's feed on this Happy Agent, materialized as its surfaces open. */
    readonly feed: import("happy-desktop-state").HappyAgentFeed;
    /** This Happy Agent's shared Surfaces, such as todo lists, materialized as they open. */
    readonly surfaces: HappyAgentSurfaces;
    /** What this Happy Agent's search finds for the command palette's query. */
    readonly search: HappyAgentSearchStore;
    readonly clock: HappyAgentClockStore;
}

export interface HappyAgentSessionDeps {
    readonly conversationOpen: (location: HappyAgentSessionLocation) => void;
    readonly groupOpen: (groupId: string) => void;
    /**
     * Takes a group gone from the host's catalog out of this window's
     * navigation. Every remembered place inside it goes too, so no Back returns
     * to a row that no longer exists.
     */
    readonly groupForget: (groupId: string) => void;
    /** Takes bot subtasks the host stopped listing out of this window's navigation. */
    readonly subtasksForget: (
        removed: readonly HappyAgentSessionLocation[],
        open: HappyAgentSessionLocation | undefined,
    ) => void;
    /** A reader-initiated act this connection's workspace finished. */
    readonly activity?: (activity: HappyAgentActivity) => void;
    /** Observes this connection's phone pairings while a pairing page shows them. */
    readonly mobilePairingObserve?: HappyAgentMobilePairingObserve;
    /**
     * A top-level session on this connection finished a turn. Delegated
     * subagent runs never arrive here; whether the window says anything about
     * it is the owner's to decide.
     */
    readonly sessionFinished?: (sessionId: string, stillCurrent: () => boolean) => void;
    /** Announces that this connection's session is ready or has been replaced. */
    readonly changed: () => void;
    readonly unavailable?: (error: unknown) => void;
    readonly compatibility?: (mismatch: HappyAgentProtocolMismatch | undefined) => void;
}

export interface HappyAgentConnectionHandle {
    readonly setup: AppHappyAgentSetup | undefined;
    readonly sync: import("happy-desktop-state").HappyAgentSync;
    /** Onboarding the server runs as a conversation, followed for the connection's lifetime. */
    readonly chatOnboarding: HappyAgentChatOnboardingStore;
    get(): HappyAgentSession | undefined;
    /**
     * Why this connection has nothing to hand over, when that is a failure. A
     * daemon that is merely still starting is not one: see `starting`.
     */
    failure(): string | undefined;
    /** The daemon is up and has said it is not finished starting yet. */
    starting(): boolean;
    dispose(): void;
}

/**
 * Whether the daemon refused because it has not finished starting.
 *
 * Happy Agent has its own word for this and sends it: `not_initialized` means the
 * daemon is up, listening, and not ready to answer for its contents yet. That is
 * a startup, not a failure, and reading it from the code the daemon sends is the
 * whole of the test — the sentence beside it is for people, and matching on it
 * would make Happy's boot depend on Happy Agent's wording.
 *
 * The chain is walked because the refusal reaches here wrapped: a catalog read
 * fails as a `UserError` carrying whatever actually refused as its cause.
 */
function daemonStarting(error: unknown): boolean {
    for (let current = error; current instanceof Error; current = current.cause) {
        if (current instanceof HappyAgentApiError && current.code === "not_initialized")
            return true;
    }
    return false;
}

function snapshotsEqual(
    left: HappyAgentConnectionSnapshot,
    right: HappyAgentConnectionSnapshot,
): boolean {
    return (
        left.connection === right.connection &&
        left.daemon === right.daemon &&
        left.version === right.version &&
        left.message === right.message &&
        left.attempt === right.attempt &&
        left.admitting === right.admitting &&
        left.drain === right.drain
    );
}

/** The product version the daemon last reported in its own health. */
function daemonVersionOf(connection: HappyAgentConnection): string | undefined {
    const compatibility = connection.compatibility();
    return compatibility.status === "checking" ? undefined : compatibility.serverVersion;
}

/**
 * Projects the connection's managed update-feed lifecycle into the host
 * availability store. It opens no transport of its own: `/health` remains the
 * one startup gate inside `connectHappyAgent`, and the shared client owns
 * reconnect state. The version is the one the connection last read from the
 * daemon itself, which it reads again whenever a replacement starts answering.
 */
function streamConnectionStoreCreate(connection: HappyAgentConnection): {
    readonly store: HappyAgentConnectionStore;
    /** The connection read the daemon's health again. */
    readonly versionChanged: () => void;
} {
    const listeners = new Set<() => void>();
    const versioned = (
        next: Omit<HappyAgentConnectionSnapshot, "version">,
    ): HappyAgentConnectionSnapshot => {
        const version = daemonVersionOf(connection);
        return version === undefined ? next : { ...next, version };
    };
    let snapshot = versioned({ attempt: 0, connection: "connecting", daemon: "unknown" });
    let sourceState: ReturnType<
        ReturnType<HappyAgentConnection["connectGroups"]>["state"]
    >["connection"] = "connecting";
    let disposed = false;

    const publish = (state: Omit<HappyAgentConnectionSnapshot, "version">): void => {
        const next = versioned(state);
        if (snapshotsEqual(snapshot, next)) return;
        snapshot = next;
        for (const listener of listeners) listener();
    };

    const source = connection.connectGroups({
        onChange: (_projects, state) => {
            const previous = sourceState;
            sourceState = state.connection;
            // The daemon's own word that it takes nothing new, from its drain
            // until a replacement admits work, carried through every state.
            const admitting =
                state.admitting === false
                    ? {
                          admitting: false as const,
                          ...(state.drain === undefined ? {} : { drain: state.drain }),
                      }
                    : {};
            if (state.connection === "live") {
                publish({ attempt: 0, connection: "connected", daemon: "ready", ...admitting });
                return;
            }
            if (state.connection === "connecting") {
                publish({ attempt: 0, connection: "connecting", daemon: "unknown", ...admitting });
                return;
            }
            const attempt =
                state.connection === "reconnecting" && previous !== "reconnecting"
                    ? snapshot.attempt + 1
                    : snapshot.attempt;
            publish({
                attempt,
                connection: "disconnected",
                daemon: "unknown",
                ...admitting,
                // A closed connection is a fact about this Happy Agent worth stating.
                // Reconnecting is not: the window's own header says the machine
                // is unreachable, and naming the transport that is retrying
                // tells a reader nothing they can act on.
                ...(state.connection === "closed"
                    ? { message: "This Happy Agent connection is closed." }
                    : {}),
            });
        },
        onError: (error) => {
            publish({
                attempt: Math.max(1, snapshot.attempt),
                connection: "disconnected",
                daemon: "unknown",
                ...(snapshot.admitting === false ? { admitting: false as const } : {}),
                ...(snapshot.drain === undefined ? {} : { drain: snapshot.drain }),
                message: error instanceof Error ? error.message : String(error),
            });
        },
    });

    const store: HappyAgentConnectionStore = {
        get: () => snapshot,
        subscribe(listener) {
            if (disposed) return () => undefined;
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        retry: () => connection.retry(),
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            source.close();
            listeners.clear();
        },
    };
    return {
        store,
        versionChanged: () => {
            if (!disposed) publish(snapshot);
        },
    };
}

/**
 * Opens the local daemon's Happy Agent connection and composes its live product
 * state with the small set of services that remain owned by the desktop host.
 */
export function happyAgentConnectionOpen(input: {
    /** The local desktop pairs Happy Mobile through the guided setup. */
    readonly guidedMobileSetup?: boolean;
    /**
     * Whether product stores wait for the member's profile. A remote Happy
     * Agent may be a team that authorizes nothing else until one exists; the
     * machine's own Happy Agent is solo and never asks for one.
     */
    readonly memberProfileRequired: boolean;
    readonly cloudHost: HappyAgentCloudHost;
    readonly host: HappyAgentHost;
    readonly deps: HappyAgentSessionDeps;
    readonly modelPreferencePersistence: HappyAgentModelPreferencePersistence;
    readonly happyAgentId: string;
    /**
     * The window's welcome. It introduces the person to Happy once, whichever
     * machine or team they connect to afterwards, so every connection shares it.
     */
    readonly welcome: WelcomeStore;
    /**
     * Whether the window takes onboarding a Happy Agent runs as a
     * conversation: the "Experimental onboarding" switch. Absent, it does
     * wherever the Happy Agent offers it.
     */
    readonly chatOnboardingGate?: HappyAgentChatOnboardingGate;
    /**
     * Where the daemon answers. The proxy forwards the daemon's own `/v0`
     * namespace as it stands, so this one origin serves the protocol client,
     * the catalog, and the desktop-local host routes alike.
     */
    readonly happyAgentHttpUrl: string;
    readonly client?: HappyAgentClient;
    readonly hostServicesUrl?: string;
    /** Whether this computer's USB devices and ports can be bridged to this Happy Agent. */
    readonly deviceBridges?: boolean;
    /** The shell's credential import, when this is a Happy Cloud server. */
    readonly credentialImportHost?: HappyAgentCredentialImportHost;
    /** Drops this Happy Cloud server from the window, after leaving or deleting it. */
    readonly cloudServer?: { readonly name: string; readonly forget: () => Promise<void> };
    /** Whether this is a Happy Cloud server, in the desktop or on the web. */
    readonly happyCloud?: boolean;
    /**
     * The window's appearance right now, read again for every terminal this
     * connection opens. A terminal is started in it and keeps it afterwards.
     */
    readonly terminalColorScheme: () => TerminalColorScheme;
    /**
     * Opens a web page in the person's browser, such as a vendor's sign-in
     * page. Absent, such a page is offered but not opened.
     */
    readonly linkOpen?: (url: string) => void;
    /**
     * Drains and restarts the server, for a provider chosen in onboarding that
     * needs it. Only the machine's own Happy Agent is restarted from here.
     */
    readonly serverRestart?: () => Promise<void>;
    /**
     * Whether onboarding the server runs as a conversation begins on its own
     * once the workspace loads, which for a team member is after their profile.
     * Without it the window's owner decides when it begins.
     */
    readonly chatOnboardingBeginOnLoad?: boolean;
}): HappyAgentConnectionHandle {
    let disposed = false;
    let session: HappyAgentSession | undefined;
    let sessionConnection: ReturnType<typeof streamConnectionStoreCreate> | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let compatibilityFailure: string | undefined;
    let catalogFailure: string | undefined;
    let catalogStarting = false;
    const { store: debugLog, writer: debugLogWriter } = happyAgentDebugLogStoreCreate();
    const debugEntry = (entry: HappyAgentDebugLogInput): void => debugLogWriter.entryAppend(entry);
    debugEntry({
        detail: JSON.stringify({ happyAgentHttpUrl: input.happyAgentHttpUrl }, null, 2),
        level: "info",
        message: "Opening local Happy Agent connection",
        source: "connection",
    });
    const directClient =
        input.client ??
        new HappyAgentClient({
            endpoint: input.happyAgentHttpUrl,
            token: "happy-local-capability",
        });
    const mutationListeners = new Set<(rejection: MutationRejectedDelta) => void>();
    const agentConnection: HappyAgentConnection = connectHappyAgent({
        client: directClient,
        endpoint: input.happyAgentHttpUrl,
        token: "happy-local-capability",
        memberProfileRequired: input.memberProfileRequired,
        // Read ahead the sessions most likely opened next, so a first open, of a remote's
        // session above all, shows its transcript instead of a loading line.
        preloadedSessions: PRELOADED_SESSIONS,
        onDebugEntry: debugEntry,
        onMutationRejected: (rejection) => {
            for (const listener of mutationListeners) listener(rejection);
        },
        onCompatibilityChange: (compatibility) => {
            if (disposed) return;
            const mismatch = protocolMismatchOf(compatibility);
            compatibilityFailure = mismatch?.message;
            // A replacement daemon reports its own version here, and Settings
            // follows the daemon this window is connected to.
            sessionConnection?.versionChanged();
            input.deps.compatibility?.(mismatch);
            input.deps.changed();
        },
        onTopLevelSessionFinished: (sessionId, stillCurrent) => {
            if (!disposed) input.deps.sessionFinished?.(sessionId, stillCurrent);
        },
    });
    const profile = happyAgentProfileSourceCreate(directClient, agentConnection.sync, () => {
        if (!session) agentConnection.retry();
    });
    const catalogSource = happyAgentCatalogSourceCreate(agentConnection, input.happyAgentHttpUrl);
    const hostServices = happyAgentHostServicesCreate(
        input.hostServicesUrl ?? input.happyAgentHttpUrl,
        input.happyAgentHttpUrl,
        { deviceBridges: input.deviceBridges ?? false },
    );
    const welcome = input.welcome;
    // One clock and one mobile connector per Happy Agent: onboarding and
    // Settings show the same pairing, and both count its codes down.
    const clock = happyAgentClockStoreCreate();
    const pairingObserve = input.deps.mobilePairingObserve;
    const connectorStore = happyAgentMobileConnectorStoreCreate({
        client: directClient,
        sync: agentConnection.sync,
    });
    const mobileConnector = pairingObserve?.connector(connectorStore) ?? connectorStore;
    /** Settings' Happy Mobile store, observed once for the connection. */
    let happyIntegration: HappyAgentIntegrationStore | undefined;
    const onboardingStore = happyAgentOnboardingStoreCreate(directClient, agentConnection.sync, {
        setupActive: input.happyAgentId !== "local" && welcome.get().welcomeAcknowledged,
        mobileSkipped: desktopHappyMobileOnboardingSkipped(input.happyAgentId),
        onMobileSkip: () => desktopHappyMobileOnboardingSkip(input.happyAgentId),
        guidedMobileSetup: input.guidedMobileSetup,
        mobileConnector,
        ...(input.chatOnboardingGate ? { chatOnboardingGate: input.chatOnboardingGate } : {}),
    });
    const onboarding = pairingObserve
        ? { ...onboardingStore, mobile: pairingObserve.onboarding(onboardingStore.mobile) }
        : onboardingStore;
    // A server opened before the window's welcome was read begins its setup
    // when it is: the welcome it would otherwise show is the one just read.
    // The machine's own Happy Agent begins with the window's first-run setup.
    let welcomeUnsubscribe: (() => void) | undefined;
    if (input.happyAgentId !== "local" && !welcome.get().welcomeAcknowledged)
        welcomeUnsubscribe = welcome.subscribe(() => {
            if (!welcome.get().welcomeAcknowledged) return;
            welcomeUnsubscribe?.();
            welcomeUnsubscribe = undefined;
            onboarding.onboardingBegin();
        });
    /** The conversation onboarding asked to open, until the workspace can say where it is. */
    let chatOnboardingAgent: { readonly agentId: string; attempts: number } | undefined;
    let chatOnboardingRetry: ReturnType<typeof setTimeout> | undefined;
    const chatOnboardingOpen = (): void => {
        const wanted = chatOnboardingAgent;
        const target = session?.workspace;
        if (disposed || wanted === undefined || target === undefined) return;
        void target.sessionLocationRead(wanted.agentId as HappyAgentSessionId).then(
            (location) => {
                if (disposed || chatOnboardingAgent !== wanted) return;
                if (location) {
                    chatOnboardingAgent = undefined;
                    input.deps.conversationOpen(location);
                    return;
                }
                // A conversation made a moment ago may not be listed yet.
                wanted.attempts += 1;
                if (wanted.attempts >= CHAT_ONBOARDING_OPEN_ATTEMPTS) {
                    chatOnboardingAgent = undefined;
                    return;
                }
                chatOnboardingRetry = setTimeout(() => {
                    chatOnboardingRetry = undefined;
                    chatOnboardingOpen();
                }, RETRY_MS);
            },
            () => undefined,
        );
    };
    const chatOnboarding = happyAgentChatOnboardingStoreCreate({
        client: directClient,
        sync: agentConnection.sync,
        conversationOpen: (agentId) => {
            if (chatOnboardingRetry) clearTimeout(chatOnboardingRetry);
            chatOnboardingRetry = undefined;
            chatOnboardingAgent = { agentId, attempts: 0 };
            chatOnboardingOpen();
        },
        ...(input.serverRestart ? { serverRestart: input.serverRestart } : {}),
        ...(input.chatOnboardingGate ? { gate: input.chatOnboardingGate } : {}),
    });
    let providerClis: HappyAgentProviderClisStore | undefined;
    let defaultModel: HappyAgentDefaultModelStore | undefined;
    // Happy Cloud's own routes, over the same transport as the daemon's.
    const cloudRequest = input.happyCloud
        ? happyCloudRequestCreate({
              endpoint: directClient.endpoint,
              token: "happy-local-capability",
          })
        : undefined;
    const client: HappyAgentWorkspaceClient = happyAgentWorkspaceClientCreate({
        client: directClient,
        providerCredentials: happyAgentProviderCredentialsApiCreate({
            endpoint: directClient.endpoint,
            token: "happy-local-capability",
        }),
        ...(input.credentialImportHost ? { credentialImportHost: input.credentialImportHost } : {}),
        ...(cloudRequest
            ? {
                  cloudRequest,
                  cloudProviders: happyAgentCloudProvidersApiCreate(cloudRequest),
              }
            : {}),
        ...(input.cloudServer
            ? {
                  cloudServer: {
                      serverName: input.cloudServer.name,
                      request: happyCloudRequestCreate({
                          endpoint: directClient.endpoint,
                          token: "happy-local-capability",
                      }),
                      serverForget: input.cloudServer.forget,
                  },
              }
            : {}),
        guidedMobileSetup: input.guidedMobileSetup,
        mobileConnector,
        cloudHost: input.cloudHost,
        connection: agentConnection,
        hostServices,
        modelPreferencePersistence: input.modelPreferencePersistence,
        workspaceMemoryPersistence: workspaceMemoryPersistence(input.happyAgentId),
        feedFilterPersistence: feedFilterPersistence(input.happyAgentId),
        catalogSource,
        profileActions: profile.actions,
        profilePhotoCodec: { open: imageCropOpen },
        profileSource: profile.source,
        providerUsageSource: happyAgentUsageSourceCreate(directClient, agentConnection.sync),
        transcriptConnect: happyAgentTranscriptConnectCreate(agentConnection),
        transcriptPrefetch: (sessionId) => agentConnection.prefetchSession(sessionId),
        connectMutationSubscribe: (listener) => {
            mutationListeners.add(listener);
            return () => mutationListeners.delete(listener);
        },
        terminalDriverCreate,
        terminalColorScheme: input.terminalColorScheme,
        // Chromium's own viewer shows a PDF inline when this window has one;
        // anything else is offered as a download.
        artifactDocumentInline: (mimeType) =>
            mimeType === "application/pdf" && navigator.pdfViewerEnabled,
    });
    // Keep account authentication subscribed for this connection's lifetime so
    // browser callbacks are handled even when Settings is closed or reloading.
    const cloudStore = client.cloud();
    const profileStore = client.profile();
    const accountKeepWarm: (() => void)[] = [];
    const setup: AppHappyAgentSetup | undefined = profileStore
        ? {
              welcome,
              onboarding,
              chatOnboarding,
              profile: profileStore,
              clock,
              retry: () => agentConnection.retry(),
          }
        : undefined;

    let workspace: HappyAgentWorkspaceStore | undefined;
    let workspaceKeepWarm: (() => void) | undefined;
    let modelsLoading = false;
    const modelsLoad = (): void => {
        retry = undefined;
        const startup = onboarding.get();
        if (
            disposed ||
            session ||
            modelsLoading ||
            !startup.available ||
            !startup.state ||
            (input.memberProfileRequired &&
                !startup.state.completed &&
                !startup.state.steps.profile.done) ||
            startup.error
        )
            return;
        // This is the first authorized opportunity to load the workspace — for
        // a team member, once their profile exists. Warm its empty state and
        // bot catalog alongside models, while onboarding is still on the steps
        // before first-project setup.
        if (!workspace) {
            workspace = happyAgentWorkspaceStoreCreate(client, {
                host: input.host,
                viewPreferences: desktopViewPreferencesPersistence(input.happyAgentId),
                // How many conversations just left this window keeps mounted is a
                // property of the machine it runs on, which only the browser can say.
                conversationRetention: happyAgentConversationRetentionFor(
                    (navigator as Navigator & { readonly deviceMemory?: number }).deviceMemory,
                ),
                output: (event) => {
                    switch (event.type) {
                        case "conversationOpenRequested":
                            input.deps.conversationOpen(event.location);
                            return;
                        case "groupOpenRequested":
                            input.deps.groupOpen(event.groupId);
                            return;
                        case "groupRemoved":
                            input.deps.groupForget(event.groupId);
                            return;
                        case "subtasksRemoved":
                            input.deps.subtasksForget(event.removed, event.open);
                            return;
                        case "activityRecorded":
                            input.deps.activity?.(event.activity);
                            return;
                    }
                },
            });
            workspaceKeepWarm = workspace.subscribe(() => undefined);
        }
        const preparedWorkspace = workspace;
        modelsLoading = true;
        debugEntry({
            level: "info",
            message: "Loading model catalog",
            source: "catalog",
        });
        void client.models.load().then(
            (modelSnapshot) => {
                modelsLoading = false;
                if (disposed) return;
                accountKeepWarm.push(cloudStore.subscribe(() => undefined));
                debugEntry({
                    detail: JSON.stringify(
                        {
                            models: modelSnapshot.catalog.providers.reduce(
                                (count, provider) => count + provider.models.length,
                                0,
                            ),
                            providers: modelSnapshot.catalog.providers.length,
                        },
                        null,
                        2,
                    ),
                    level: "info",
                    message: "Model catalog loaded",
                    source: "catalog",
                });
                sessionConnection = streamConnectionStoreCreate(agentConnection);
                session = {
                    gptLiveRuntimeCreate: (options) =>
                        gptLiveRuntimeCreate({
                            ...options,
                            client: () => (disposed ? undefined : directClient),
                        }),
                    welcome,
                    onboarding,
                    chatOnboarding,
                    providerClis: () =>
                        (providerClis ??= happyAgentProviderClisStoreCreate({
                            client: directClient,
                            sync: agentConnection.sync,
                            linkOpen: input.linkOpen ?? (() => undefined),
                        })),
                    defaultModel: () =>
                        (defaultModel ??= happyAgentDefaultModelStoreCreate({
                            client: directClient,
                            models: client.models,
                        })),
                    cloud: () => cloudStore,
                    teams: () => client.teams(),
                    connection: sessionConnection.store,
                    debugLog,
                    host: input.host,
                    happyIntegration: () =>
                        (happyIntegration ??= pairingObserve
                            ? pairingObserve.integration(client.happyIntegration())
                            : client.happyIntegration()),
                    mobileConnector: () => client.mobileConnector(),
                    models: client.models,
                    profile: () => profileStore,
                    providerUsage: client.providerUsage(),
                    providers: client.providers(),
                    credentialImport: () => client.credentialImport(),
                    cloudProviders: () => client.cloudProviders(),
                    repositories: () => client.repositories(),
                    members: () => client.members(),
                    computes: () => client.computes(),
                    voiceSettings: client.voiceSettings(),
                    taskSettings: () => client.taskSettings(),
                    surfaceSettings: () => client.surfaceSettings(),
                    storiesSettings: () => client.storiesSettings(),
                    stories: () => client.stories(),
                    workspace: preparedWorkspace,
                    instructions: client.instructions(),
                    securityPolicy: client.securityPolicy(),
                    secrets: () => client.secrets(),
                    artifacts: client.artifacts(),
                    feed: client.feed(),
                    surfaces: client.surfaces(),
                    search: client.search(),
                    clock,
                };
                debugEntry({
                    level: "info",
                    message: "Happy Agent product stores materialized",
                    source: "sync",
                });
                catalogFailure = undefined;
                catalogStarting = false;
                input.deps.changed();
                // The directory now owns the live workspace subscription.
                workspaceKeepWarm?.();
                workspaceKeepWarm = undefined;
                // Asked to open before there was a workspace to open it in.
                chatOnboardingOpen();
                if (input.chatOnboardingBeginOnLoad) chatOnboarding.begin();
            },
            (error: unknown) => {
                modelsLoading = false;
                if (disposed) return;
                // A daemon that is still starting is the ordinary first seconds
                // of a cold machine, not a fault: it is reported as the wait it
                // is, at the level a wait belongs, and the same retry brings the
                // catalog in as soon as the daemon will answer for it.
                const starting = daemonStarting(error);
                debugEntry({
                    detail: error instanceof Error ? (error.stack ?? error.message) : String(error),
                    level: starting ? "info" : "error",
                    message: starting
                        ? `Happy Agent is still starting; asking again in ${RETRY_MS} ms`
                        : `Model catalog failed; retrying in ${RETRY_MS} ms`,
                    source: "catalog",
                });
                catalogStarting = starting;
                catalogFailure = starting
                    ? undefined
                    : error instanceof Error && error.message
                      ? error.message
                      : "Happy could not read this Happy Agent's model catalog.";
                if (!starting) input.deps.unavailable?.(error);
                input.deps.changed();
                retry = setTimeout(modelsLoad, RETRY_MS);
            },
        );
    };
    accountKeepWarm.push(
        onboarding.subscribe(() => {
            if (!retry) modelsLoad();
            if (!session) input.deps.changed();
        }),
        ...(profileStore ? [profileStore.subscribe(() => undefined)] : []),
        // Following from before bootstrap, the stories setting arrives with it and is not read again.
        client.storiesSettings().subscribe(() => undefined),
        // So does the feed itself, with its media fetched ahead before the row is drawn.
        client.stories().subscribe(() => undefined),
        // Onboarding in a conversation is read only where the server runs it,
        // and only on the connection's own hints, so following it costs nothing
        // elsewhere; whoever begins it finds its flow already read.
        chatOnboarding.subscribe(() => undefined),
    );

    return {
        setup,
        get: () => session,
        sync: agentConnection.sync,
        chatOnboarding,
        failure: () =>
            compatibilityFailure ??
            (session ? undefined : (catalogFailure ?? onboarding.get().error)),
        starting: () => !session && catalogStarting,
        dispose() {
            if (disposed) return;
            debugEntry({
                level: "info",
                message: "Disposing local Happy Agent connection",
                source: "connection",
            });
            disposed = true;
            welcomeUnsubscribe?.();
            if (retry) clearTimeout(retry);
            if (chatOnboardingRetry) clearTimeout(chatOnboardingRetry);
            workspaceKeepWarm?.();
            workspace?.[Symbol.dispose]();
            if (session) {
                session.connection[Symbol.dispose]();
                session = undefined;
                sessionConnection = undefined;
            }
            for (const unsubscribe of accountKeepWarm) unsubscribe();
            onboarding[Symbol.dispose]();
            chatOnboarding[Symbol.dispose]();
            providerClis?.[Symbol.dispose]();
            defaultModel?.[Symbol.dispose]();
            client[Symbol.dispose]();
            mobileConnector[Symbol.dispose]();
            clock[Symbol.dispose]();
            mutationListeners.clear();
            agentConnection.close();
        },
    };
}
