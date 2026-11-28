import type {
    LocalOnboardingAssistant,
    LocalOnboardingAssistantConnect,
    LocalOnboardingAssistantOperation,
    LocalOnboardingClaudeToken,
    LocalOnboardingCustom,
    LocalOnboardingKeyAdd,
    LocalOnboardingKeyCredential,
    LocalOnboardingKeyRowId,
    LocalOnboardingProviderRowId,
    LocalOnboardingView,
    OnboardingStage,
} from "happy-desktop-ui";
import {
    HappyAgentApiError,
    HappyAgentClient,
    happyAgentMobileConnectorStoreNoop,
    type HappyAgentMobileConnectorStore,
    type HappyAgentWorkspaceStore,
    type HappyMobileOnboardingSnapshot,
    type HappyMobileOnboardingStore,
} from "happy-desktop-state";
import type {
    DesktopDaemonSnapshot,
    DesktopRuntimeSnapshot,
    HappyDesktopBridge,
    LocalAssistantState,
    LocalOnboardingSnapshot,
    LocalOnboardingStepBack,
} from "../shared/desktopContract";
import {
    LocalProviderClisUnavailable,
    LocalProviderCliRouteMissing,
    LocalProviderCliRefused,
    localProviderClisApiCreate,
    type LocalProviderCli,
    type LocalProviderCliId,
} from "./localProviderClis";

type ProviderAuthenticationResult = "checking" | "valid" | "invalid" | "error";

interface ProviderAuthenticationSnapshot {
    /**
     * Whether Happy Agent's Antigravity account is on, from its configuration;
     * absent until that is read. The scan cannot see agy's sign-in, so this
     * and agy's own check are what make Antigravity ready.
     */
    readonly antigravityEnabled?: boolean;
    readonly claude?: ProviderAuthenticationResult;
    readonly codex?: ProviderAuthenticationResult;
    readonly complete: boolean;
    /** Model access configured some other way, each provider with its own check. */
    readonly custom?: {
        /** The column as a whole: one provider working is enough to go on. */
        readonly result: ProviderAuthenticationResult;
        readonly providers: readonly CustomProviderCheck[];
        /**
         * Happy Agent has answered for its configuration, so `providers` is
         * every row there is. Until then the page is not drawn: rows arriving
         * under cards already on screen would move them.
         */
        readonly read: boolean;
        /** Why nothing could be checked, while the configuration cannot be read. */
        readonly reason?: string;
    };
    readonly grok?: ProviderAuthenticationResult;
    readonly key?: string;
    /** Why each CLI that could not be verified failed, while it reads that way. */
    readonly reasons?: Partial<Readonly<Record<LocalAssistantState["id"], string>>>;
}

/** One configured provider that is none of the three CLIs, and how its check went. */
interface CustomProviderCheck {
    readonly id: string;
    /** Its kind as a person names it, for example "Bedrock". */
    readonly kind: string;
    /** The Connect your AI row that counts it, by its configured type. */
    readonly row: LocalOnboardingProviderRowId;
    /** The configured display name, or its kind and ID. */
    readonly name: string;
    readonly result: Exclude<ProviderAuthenticationResult, "invalid">;
    /** Why it failed, when it did. */
    readonly reason?: string;
}

/**
 * A request this window made that did not go through: which of its own calls
 * it was, and what to tell the person about it.
 */
export interface LocalOnboardingFailure {
    /**
     * `stateRead` is reading setup, download, or connection state from the
     * shell; `download` and `start` are the automatic first install; `request`
     * is any step the person asked for.
     */
    readonly cause: "stateRead" | "download" | "start" | "request";
    readonly message: string;
}

export interface LocalOnboardingViewSnapshot {
    readonly onboarding?: LocalOnboardingSnapshot;
    readonly daemon?: DesktopDaemonSnapshot;
    readonly runtime?: DesktopRuntimeSnapshot;
    /** Successful inference and current discovery of system provider credentials. */
    readonly providerAuthentication: ProviderAuthenticationSnapshot;
    /** The renderer has asked the verified first release to start. */
    readonly agentStarting: boolean;
    /** True while a request this window made is still in flight. */
    readonly pending: boolean;
    /** Why the last request could not be delivered, until another is made. */
    readonly failure?: LocalOnboardingFailure;
    /** The optional mobile steps, materialized only until setup completes. */
    readonly happyMobile?: HappyMobileOnboardingSnapshot;
    readonly chiefOfStaffReady: boolean;
    /**
     * Happy Agent's own install and sign-in for each assistant, read while
     * Subscriptions is on screen. Absent until read, and empty on a Happy
     * Agent that has no such routes.
     */
    readonly providerClis?: ReadonlyMap<LocalProviderCliId, LocalProviderCli>;
    /** Saving a pasted Claude setup token; absent until one is pasted. */
    readonly claudeToken?: LocalOnboardingClaudeToken;
    /**
     * Adding an account from an API key or AWS keys: whether this Happy Agent
     * can, read with the provider CLIs, and how the last save went.
     */
    readonly keyAdd?: LocalOnboardingKeyAdd;
}

export interface LocalOnboardingStore {
    get(): LocalOnboardingViewSnapshot;
    subscribe(listener: () => void): () => void;
    connectRetry(): void;
    /** Installs the newer Happy Agent a newer-data refusal is waiting for. */
    agentUpdate(): void;
    /** Enters machine setup and allows its automatic download and launch to begin. */
    agentSetupBegin(): void;
    chiefOfStaffSetup(): void;
    assistantsContinue(): void;
    stepBack(step: LocalOnboardingStepBack): void;
    /** Runs Codex's, Grok's or Antigravity's own sign-in through Happy Agent, opening its page. */
    assistantSignIn(id: LocalProviderCliId): void;
    /** Hands the code the vendor's page showed to the sign-in waiting for it. */
    assistantSignInCode(id: LocalProviderCliId, code: string): void;
    /** Installs a missing assistant from its vendor through Happy Agent. */
    assistantInstall(id: LocalProviderCliId): void;
    /** Stops the install or sign-in going on for one assistant. */
    assistantConnectCancel(id: LocalProviderCliId): void;
    /** Hands a pasted Claude setup token to Happy Agent. Never kept here. */
    claudeSetupTokenSave(token: string): void;
    /** Forgets how the last token save went, as the dialog opens again. */
    claudeSetupTokenReset(): void;
    /** Asks Happy Agent to add an API key or AWS keys as a new account. */
    providerKeyAdd(credential: LocalOnboardingKeyCredential): void;
    /** A key dialog opened again: forget how the last save went. */
    providerKeyAddReset(): void;
    /** Starts Windows sandbox setup; Windows' administrator prompt opens from here. */
    sandboxSetup(): void;
    happyMobileConnect(): void;
    happyMobileSkip(): void;
    /** The direct connector the mobile steps offer beside the relay code. */
    happyMobileDirect(): HappyAgentMobileConnectorStore;
}

export interface LocalOnboardingStoreOptions {
    /** The connected local workspace, available while earlier setup steps are open. */
    readonly chiefOfStaff: {
        get(): HappyAgentWorkspaceStore | undefined;
        subscribe(listener: () => void): () => void;
    };
    /** Prepares an editable draft only, then returns navigation for the completed setup. */
    readonly chiefOfStaffPrepare: () => Promise<() => void>;
    /** The local connection owns mobile setup and its shared realtime transport. */
    readonly happyMobile: {
        get(): HappyMobileOnboardingStore | undefined;
        subscribe(listener: () => void): () => void;
    };
    /**
     * Whether this window is talking to the local Happy Agent right now. The
     * runtime's connection outlives the agent behind it, so this is how setup
     * learns that an agent which went away has come back.
     */
    readonly localConnected: {
        get(): boolean;
        subscribe(listener: () => void): () => void;
    };
    /** True when the welcome was acknowledged before this window opened. */
    readonly agentSetupActive?: boolean;
    /** Opens a vendor's sign-in page in the person's browser. */
    readonly externalOpen?: (url: string) => void;
}

/**
 * How often the subscription report re-asks the daemon while it is on screen.
 *
 * Somebody signing in to Claude in another window is the whole point of this
 * screen, and they should not have to tell Happy they did. The pass stops the
 * moment the screen does.
 */
const providerRecheckMs = 2_000;
/** A failed network check must not turn the local discovery poll into paid traffic. */
const providerVerificationRetryMs = 30_000;
/** How often an install or sign-in going on is asked about. */
const providerClisPollMs = 1_500;
/**
 * How long one inference check may take before it counts as failed. A base URL
 * or proxy that never answers would otherwise hold the pass open, and with it
 * every card, on "Checking…" for good.
 */
const providerVerificationTimeoutMs = 60_000;
/** The same bound for the daemon's own local answers: its scan and its config. */
const providerDiscoveryTimeoutMs = 15_000;
const HAPPY_MOBILE_SKIPPED: HappyMobileOnboardingSnapshot = { status: "skipped" };
const downloadRetryMinimumMs = 3_000;
const downloadRetryMaximumMs = 30_000;
const startRetryMinimumMs = 3_000;
const startRetryMaximumMs = 30_000;

/**
 * The window's view of first-run setup: one coarse bridge subscription for the
 * durable stage.
 *
 * The shell exposes daemon state and two narrow capabilities; this surface owns
 * the first-run policy that uses them. Once the welcome hands the window to
 * machine setup, it begins and retries the harmless download, then starts the
 * verified release as soon as it is ready. Native work, durable stages, and
 * validation remain in the shell.
 */
export function localOnboardingStoreCreate(
    bridge: HappyDesktopBridge,
    options: LocalOnboardingStoreOptions,
): LocalOnboardingStore {
    const listeners = new Set<() => void>();
    let snapshot: LocalOnboardingViewSnapshot = {
        agentStarting: false,
        chiefOfStaffReady: false,
        pending: false,
        providerAuthentication: { complete: false },
    };
    let bridgeUnsubscribe: (() => void) | undefined;
    let daemonUnsubscribe: (() => void) | undefined;
    let runtimeUnsubscribe: (() => void) | undefined;
    let downloadInFlight = false;
    let downloadRetry: ReturnType<typeof setTimeout> | undefined;
    let downloadRetryMs = downloadRetryMinimumMs;
    let startInFlight = false;
    let startRetry: ReturnType<typeof setTimeout> | undefined;
    let startRetryMs = startRetryMinimumMs;
    let eventReceived = false;
    let daemonEventReceived = false;
    let runtimeEventReceived = false;
    let verificationAbort: AbortController | undefined;
    let verificationRunning = false;
    let verificationGeneration = 0;
    let verificationConnectionId: number | undefined;
    /** Each CLI whose check failed: when to check again, and why it failed. */
    const verificationRetry = new Map<
        LocalProviderCliId,
        { readonly at: number; readonly reason: string }
    >();
    /**
     * Each custom provider whose check failed: the configuration it was made
     * against, when to check again, and why it failed.
     */
    const customVerificationRetry = new Map<
        string,
        { readonly at: number; readonly config: string; readonly reason: string }
    >();
    let providerRecheck: ReturnType<typeof setInterval> | undefined;
    let providerClisPoll: ReturnType<typeof setInterval> | undefined;
    /** The runtime connection whose provider CLIs have been read. */
    let providerClisReadFor: number | undefined;
    let providerClisReading = false;
    /** Sign-ins this window asked for, whose page it opens once it exists. */
    const signInRequested = new Set<LocalProviderCliId>();
    let happyMobileStore: HappyMobileOnboardingStore | undefined;
    let happyMobileUnsubscribe: (() => void) | undefined;
    let happyMobileSourceUnsubscribe: (() => void) | undefined;
    /** Skipped before the local connection offered the step; applied once it does. */
    let happyMobileSkipped = false;
    let chiefOfStaffWorkspace: HappyAgentWorkspaceStore | undefined;
    let chiefOfStaffUnsubscribe: (() => void) | undefined;
    let chiefOfStaffSourceUnsubscribe: (() => void) | undefined;
    let chiefOfStaffAttempted = false;
    let localConnectedUnsubscribe: (() => void) | undefined;
    /** The runtime connection under which the local agent was last seen gone. */
    let localLostOn: number | undefined;
    /** The runtime connection setup has already asked to be made again once. */
    let reconnectRequestedFor: number | undefined;
    let inFlight = 0;
    let agentSetupActive = options.agentSetupActive === true;

    const publish = (next: LocalOnboardingViewSnapshot) => {
        snapshot = next;
        for (const listener of listeners) listener();
    };
    const onboardingSet = (next: LocalOnboardingSnapshot) => {
        if (Object.is(snapshot.onboarding, next)) return;
        publish({ ...snapshot, onboarding: next });
        setupSynchronize();
    };
    const daemonSet = (next: DesktopDaemonSnapshot) => {
        if (Object.is(snapshot.daemon, next)) return;
        publish({
            ...snapshot,
            daemon: next,
        });
        setupSynchronize();
    };
    const runtimeSet = (next: DesktopRuntimeSnapshot) => {
        if (Object.is(snapshot.runtime, next)) return;
        publish({
            ...snapshot,
            runtime: next,
        });
        setupSynchronize();
    };
    /**
     * Sends one request and reports what happened to it. A bridge call that
     * rejects is the shell refusing — a stale window, a step that is no longer
     * current — and saying so is the only way the person is not left pressing an
     * inert button.
     */
    const attempt = (operation: Promise<unknown>, failure: string) => {
        inFlight += 1;
        publish({ ...snapshot, failure: undefined, pending: true });
        void operation.then(
            () => {
                inFlight -= 1;
                publish({ ...snapshot, pending: inFlight > 0 });
                chiefOfStaffSetupAutomatically();
            },
            (error: unknown) => {
                inFlight -= 1;
                publish({
                    ...snapshot,
                    failure: { cause: "request", message: `${failure} ${errorMessage(error)}` },
                    pending: inFlight > 0,
                });
            },
        );
    };

    const downloadRetryStop = () => {
        if (!downloadRetry) return;
        clearTimeout(downloadRetry);
        downloadRetry = undefined;
    };
    const downloadBegin = () => {
        if (downloadInFlight) return;
        downloadRetryStop();
        downloadInFlight = true;
        if (snapshot.failure) publish({ ...snapshot, failure: undefined });
        void bridge
            .daemonDownload()
            .catch((error: unknown) => {
                publish({
                    ...snapshot,
                    failure: {
                        cause: "download",
                        message: `Happy could not download Happy Agent. ${errorMessage(error)}`,
                    },
                });
            })
            .finally(() => {
                downloadInFlight = false;
                setupSynchronize();
            });
    };
    function downloadSynchronize() {
        const onboarding = snapshot.onboarding;
        const daemon = snapshot.daemon;
        if (
            listeners.size === 0 ||
            !agentSetupActive ||
            onboarding?.stage !== "daemonDownload" ||
            !daemon ||
            daemon.installation !== "missing" ||
            daemon.readyVersion !== undefined ||
            // Every release on offer is older than this machine's data. Asking
            // again finds the same ones; the shell's own update check clears
            // this when a release that can open the data appears.
            daemon.errorCode === "data_newer"
        ) {
            downloadRetryStop();
            downloadRetryMs = downloadRetryMinimumMs;
            return;
        }
        if (
            downloadInFlight ||
            daemon.operation === "downloading" ||
            daemon.operation === "installing" ||
            downloadRetry
        )
            return;
        if (daemon.error || snapshot.failure) {
            const delay = downloadRetryMs;
            downloadRetryMs = Math.min(downloadRetryMaximumMs, downloadRetryMs * 2);
            downloadRetry = setTimeout(() => {
                downloadRetry = undefined;
                downloadBegin();
            }, delay);
            return;
        }
        downloadBegin();
    }

    const startRetryStop = () => {
        if (!startRetry) return;
        clearTimeout(startRetry);
        startRetry = undefined;
    };
    const startBegin = () => {
        if (startInFlight) return;
        startRetryStop();
        startInFlight = true;
        publish({ ...snapshot, agentStarting: true, failure: undefined });
        void bridge
            .daemonStart()
            .catch((error: unknown) => {
                publish({
                    ...snapshot,
                    failure: {
                        cause: "start",
                        message: `Happy could not start Happy Agent. ${errorMessage(error)}`,
                    },
                });
            })
            .finally(() => {
                startInFlight = false;
                publish({ ...snapshot, agentStarting: false });
                setupSynchronize();
            });
    };
    function startSynchronize() {
        const onboarding = snapshot.onboarding;
        const daemon = snapshot.daemon;
        if (
            listeners.size === 0 ||
            !agentSetupActive ||
            onboarding?.stage !== "daemonDownload" ||
            !daemon ||
            daemon.installation !== "missing" ||
            daemon.readyVersion === undefined ||
            // Refused for newer data: starting it again refuses again.
            daemon.errorCode === "data_newer"
        ) {
            startRetryStop();
            startRetryMs = startRetryMinimumMs;
            return;
        }
        if (startInFlight || daemon.operation === "installing" || startRetry) return;
        if (daemon.error || snapshot.failure) {
            const delay = startRetryMs;
            startRetryMs = Math.min(startRetryMaximumMs, startRetryMs * 2);
            startRetry = setTimeout(() => {
                startRetry = undefined;
                startBegin();
            }, delay);
            return;
        }
        startBegin();
    }
    function setupSynchronize() {
        downloadSynchronize();
        startSynchronize();
        providerAuthenticationSynchronize();
        happyMobileSynchronize();
        chiefOfStaffSynchronize();
        reconnectSynchronize();
    }

    /**
     * Picks setup back up after the local agent went away and came back.
     *
     * The runtime's connection to the agent survives the agent restarting
     * behind it — the window's own connection reconnects on its own — so a
     * setup step that failed to reach the agent while it was gone has nothing
     * telling it the agent is back, and "Can't reach Happy Agent" would stay up
     * over a healthy agent until somebody pressed "Try again". Seeing this
     * window reach the agent again under the same runtime connection is that
     * news, and setup answers it by doing exactly what "Try again" does, once
     * per connection, so a step that keeps failing for another reason still
     * ends on its button rather than in a loop.
     */
    function reconnectSynchronize() {
        const runtime = snapshot.runtime;
        if (listeners.size === 0 || runtime?.phase !== "ready" || runtime.mode !== "local") {
            localLostOn = undefined;
            return;
        }
        if (!options.localConnected.get()) {
            localLostOn = runtime.connectionId;
            return;
        }
        if (
            localLostOn !== runtime.connectionId ||
            reconnectRequestedFor === runtime.connectionId ||
            snapshot.onboarding?.stage !== "connectFailed"
        )
            return;
        localLostOn = undefined;
        reconnectRequestedFor = runtime.connectionId;
        attempt(bridge.runtimeRetry(), "Happy could not ask Happy Agent to start again.");
    }

    const chiefOfStaffRead = () => {
        const list = chiefOfStaffWorkspace?.get().list;
        const ready =
            list?.projects.type === "ready" &&
            list.bots.some((bot) => bot.systemKey === "chief_of_staff");
        if (snapshot.chiefOfStaffReady !== ready)
            publish({ ...snapshot, chiefOfStaffReady: ready });
        chiefOfStaffSetupAutomatically();
    };
    function chiefOfStaffSynchronize() {
        const onboarding = snapshot.onboarding;
        const workspace =
            listeners.size > 0 &&
            onboarding &&
            onboarding.stage !== "inactive" &&
            onboarding.stage !== "complete" &&
            snapshot.runtime?.phase === "ready" &&
            snapshot.runtime.mode === "local"
                ? options.chiefOfStaff.get()
                : undefined;
        if (chiefOfStaffWorkspace !== workspace) {
            chiefOfStaffUnsubscribe?.();
            chiefOfStaffWorkspace = workspace;
            chiefOfStaffUnsubscribe = workspace?.subscribe(chiefOfStaffRead);
        }
        chiefOfStaffRead();
    }

    // Open the real interface with an editable draft after mobile opt-in/skip.
    // Wait for the bot catalog, and never send the draft automatically.
    function chiefOfStaffSetupAutomatically() {
        if (!chiefOfStaffAttempted) chiefOfStaffSetupBegin();
    }

    function chiefOfStaffSetupBegin() {
        if (
            listeners.size === 0 ||
            !agentSetupActive ||
            snapshot.pending ||
            snapshot.onboarding?.busy ||
            !snapshot.chiefOfStaffReady ||
            localOnboardingView(snapshot)?.kind !== "finishing"
        )
            return;
        const runtime = snapshot.runtime;
        if (runtime?.phase !== "ready" || runtime.mode !== "local") return;
        chiefOfStaffAttempted = true;
        const current = () =>
            snapshot.runtime?.phase === "ready" &&
            snapshot.runtime.connectionId === runtime.connectionId;
        attempt(
            (async () => {
                const open = await options.chiefOfStaffPrepare();
                if (!current()) throw new Error("The local Happy Agent changed. Try again.");
                await bridge.onboardingChiefOfStaffComplete();
                const completed = await bridge.onboardingGet();
                if (current() && completed.stage === "complete") {
                    open();
                    onboardingSet(completed);
                }
            })(),
            "Happy could not open your first conversation.",
        );
    }

    const happyMobileStop = () => {
        happyMobileUnsubscribe?.();
        happyMobileUnsubscribe = undefined;
        happyMobileStore = undefined;
        const next = happyMobileSkipped ? HAPPY_MOBILE_SKIPPED : undefined;
        if (snapshot.happyMobile !== next) publish({ ...snapshot, happyMobile: next });
    };

    function happyMobileSynchronize() {
        const onboarding = snapshot.onboarding;
        const runtime = snapshot.runtime;
        if (
            listeners.size === 0 ||
            !onboarding ||
            onboarding.stage === "inactive" ||
            onboarding.stage === "complete" ||
            runtime?.phase !== "ready" ||
            runtime.mode !== "local"
        ) {
            happyMobileStop();
            return;
        }
        const store = options.happyMobile.get();
        if (happyMobileStore === store) return;
        happyMobileStop();
        if (!store) return;
        happyMobileStore = store;
        happyMobileUnsubscribe = store.subscribe(() => {
            if (happyMobileStore !== store) return;
            publish({ ...snapshot, happyMobile: store.get() });
            chiefOfStaffSetupAutomatically();
        });
        // The store records the skip, so a later launch remembers it too.
        if (happyMobileSkipped) store.happyMobileSkip();
        publish({ ...snapshot, happyMobile: store.get() });
        chiefOfStaffSetupAutomatically();
    }

    /** The subscription report's own surface, while it is the one on screen. */
    function providerAuthenticationLive():
        | { readonly runtime: DesktopRuntimeSnapshot & { phase: "ready" }; readonly key: string }
        | undefined {
        const onboarding = snapshot.onboarding;
        const runtime = snapshot.runtime;
        if (
            listeners.size === 0 ||
            (onboarding?.stage !== "providersMissing" && onboarding?.stage !== "assistantsFound") ||
            runtime?.phase !== "ready" ||
            runtime.mode !== "local"
        )
            return undefined;
        const assistants = onboarding.assistants ?? [];
        return {
            key: `${String(runtime.connectionId)}|${assistants
                .map((assistant) => `${assistant.id}:${assistant.status}`)
                .join(",")}`,
            runtime,
        };
    }

    function providerRecheckStop() {
        if (!providerRecheck) return;
        clearInterval(providerRecheck);
        providerRecheck = undefined;
    }

    /**
     * Discovers local sign-ins and proves each provider can work once.
     *
     * A repeat pass leaves the results already on screen exactly where they
     * are while it runs: the report is read while it updates, and rewriting
     * every column to "checking" would make a settled answer look unsettled.
     * Successful inference is not repeated while credentials remain present.
     * Account-usage endpoints can be rate limited independently of inference,
     * so their availability is not an authentication gate for onboarding.
     */
    function providerAuthenticationRun(key: string, runtime: DesktopRuntimeSnapshot) {
        if (runtime.phase !== "ready") return;
        if (verificationRunning && snapshot.providerAuthentication.key === key) return;
        if (verificationRunning) {
            verificationAbort?.abort();
            verificationRunning = false;
        }
        const assistants = snapshot.onboarding?.assistants ?? [];
        const first = snapshot.providerAuthentication.key !== key;
        const connectionChanged = verificationConnectionId !== runtime.connectionId;
        if (connectionChanged) {
            verificationConnectionId = runtime.connectionId;
            verificationRetry.clear();
            customVerificationRetry.clear();
        }
        const previous = connectionChanged ? { complete: false } : snapshot.providerAuthentication;
        const generation = ++verificationGeneration;

        verificationAbort?.abort();
        const abort = new AbortController();
        verificationAbort = abort;
        if (first)
            publish({
                ...snapshot,
                providerAuthentication: {
                    ...(previous.antigravityEnabled === undefined
                        ? {}
                        : { antigravityEnabled: previous.antigravityEnabled }),
                    claude: assistantAuthenticationInitial(assistants, "claude", previous),
                    codex: assistantAuthenticationInitial(assistants, "codex", previous),
                    complete: assistants.length === 0,
                    custom: customInitial(previous.custom),
                    grok: assistantAuthenticationInitial(assistants, "grok", previous),
                    key,
                },
            });
        // A GUI process may not have a native CLI's install directory on PATH.
        // The daemon can still reuse its credentials, so probe every provider.
        if (assistants.length === 0) return;

        const client = new HappyAgentClient({
            endpoint: runtime.activeTarget.happyAgentHttpUrl,
            token: "happy-local-capability",
        });
        verificationRunning = true;
        const current = () =>
            generation === verificationGeneration &&
            !abort.signal.aborted &&
            listeners.size > 0 &&
            providerAuthenticationLive()?.key === key;
        const resultPublish = (
            id: LocalAssistantState["id"],
            result: Exclude<ProviderAuthenticationResult, "checking">,
            reason?: string,
        ) => {
            if (!current()) return;
            publish({
                ...snapshot,
                providerAuthentication: authenticationResultsProject(
                    key,
                    [{ id, result, ...(reason ? { reason } : {}) }],
                    snapshot.providerAuthentication,
                    false,
                ),
            });
        };
        /**
         * The custom column, from its rows. `reason` is the configuration that
         * could not be read: nothing more can be checked, and a row still
         * waiting on that says why it will not be answered.
         */
        const customPublish = (providers: readonly CustomProviderCheck[], reason?: string) => {
            if (!current()) return;
            const rows = reason
                ? providers.map(
                      (provider): CustomProviderCheck =>
                          provider.result === "checking"
                              ? { ...provider, reason, result: "error" }
                              : provider,
                  )
                : providers;
            publish({
                ...snapshot,
                providerAuthentication: {
                    ...snapshot.providerAuthentication,
                    custom: {
                        providers: rows,
                        read: true,
                        result: reason && rows.length === 0 ? "error" : customResultProject(rows),
                        ...(reason ? { reason } : {}),
                    },
                },
            });
        };
        /** One custom provider's answer, into whatever the column holds by then. */
        const customProviderPublish = (next: CustomProviderCheck) => {
            const providers = snapshot.providerAuthentication.custom?.providers ?? [];
            if (!providers.some((provider) => provider.id === next.id)) return;
            customPublish(providers.map((provider) => (provider.id === next.id ? next : provider)));
        };
        // Every request is bounded, so a pass always ends and a check that cannot
        // be made settles as one that failed instead of staying "Checking…".
        // The bound is kept apart so a check it cut short can say so.
        const within = (ms: number) => {
            const bound = AbortSignal.timeout(ms);
            return { bound, signal: AbortSignal.any([abort.signal, bound]) };
        };
        /** Why a request that got no answer failed, in words for the screen. */
        const unansweredReason = (error: unknown, bound: AbortSignal, ms: number) => {
            if (bound.aborted) return `Timed out after ${Math.round(ms / 1000)}s`;
            // `fetch` itself refusing is the connection to Happy Agent, never the provider.
            if (error instanceof TypeError) return "Couldn't reach Happy Agent";
            return errorMessage(error) || "Couldn't verify";
        };
        /**
         * One verification through a provider, and why it did not pass when it
         * did not. Undefined when the check was abandoned rather than answered:
         * that is not a failure.
         */
        const verificationCheck = async (
            id: string,
            level: "inference" | "authentication",
        ): Promise<VerificationOutcome | undefined> => {
            const { bound, signal } = within(providerVerificationTimeoutMs);
            try {
                const result = await client.verifyProvider(id, { level }, { signal });
                // Inference must actually have run; the account answering
                // at all is what an authentication check asks.
                return result.status === "passed" &&
                    (level === "authentication" || result.performedLevel === "inference")
                    ? { passed: true }
                    : { answered: true, passed: false, reason: verificationFailureReason(result) };
            } catch (error) {
                if (abort.signal.aborted) return undefined;
                return {
                    answered: false,
                    passed: false,
                    reason: unansweredReason(error, bound, providerVerificationTimeoutMs),
                };
            }
        };
        // The same proof the three CLIs get, for each provider configured some
        // other way: one real inference through it, backed off after a failure.
        // Each one is its own row with its own answer.
        const customCheck = async () => {
            const { bound, signal } = within(providerDiscoveryTimeoutMs);
            const config = await client.getConfig({ signal }).catch((error: unknown) => {
                if (abort.signal.aborted) return undefined;
                return unansweredReason(error, bound, providerDiscoveryTimeoutMs);
            });
            if (!current() || config === undefined) return;
            if (typeof config === "string") {
                customPublish(
                    snapshot.providerAuthentication.custom?.providers ?? [],
                    `Couldn't read your provider configuration: ${config}`,
                );
                return;
            }
            // Antigravity's account is on only once agy's own check found it
            // signed in; nothing else on the card can say so.
            const antigravityEnabled = config.config.providers["antigravity"]?.enabled === true;
            if (snapshot.providerAuthentication.antigravityEnabled !== antigravityEnabled)
                publish({
                    ...snapshot,
                    providerAuthentication: {
                        ...snapshot.providerAuthentication,
                        antigravityEnabled,
                    },
                });
            const configured = customProvidersFind(config);
            for (const id of customVerificationRetry.keys())
                if (!configured.some((provider) => provider.id === id))
                    customVerificationRetry.delete(id);
            const held = new Map(
                (snapshot.providerAuthentication.custom?.providers ?? []).map((provider) => [
                    provider.id,
                    provider,
                ]),
            );
            const due: { readonly id: string; readonly config: string }[] = [];
            const rows = configured.map(
                ({ id, kind, modelsEnabled, name, row: providerRow }): CustomProviderCheck => {
                    const row = { id, kind, name, row: providerRow };
                    if (!modelsEnabled)
                        return { ...row, reason: "No models are enabled", result: "error" };
                    const before = held.get(id);
                    if (before?.result === "valid") return { ...row, result: "valid" };
                    // A changed configuration is a new answer to wait for, not the
                    // failed one backing off: fixing a base URL is noticed on the next poll.
                    const configNow = JSON.stringify(config.config.providers[id]);
                    const retry = customVerificationRetry.get(id);
                    if (retry && retry.config === configNow && Date.now() < retry.at)
                        return { ...row, reason: retry.reason, result: "error" };
                    due.push({ config: configNow, id });
                    // A repeat check leaves the answer on screen where it is while it runs.
                    return before?.result === "error"
                        ? {
                              ...row,
                              ...(before.reason ? { reason: before.reason } : {}),
                              result: "error",
                          }
                        : { ...row, result: "checking" };
                },
            );
            customPublish(rows);
            await Promise.all(
                due.map(async ({ config: configNow, id }) => {
                    const outcome = await verificationCheck(id, "inference");
                    if (!outcome) return;
                    if (outcome.passed) customVerificationRetry.delete(id);
                    else
                        customVerificationRetry.set(id, {
                            at: Date.now() + providerVerificationRetryMs,
                            config: configNow,
                            reason: outcome.reason,
                        });
                    if (!current()) return;
                    const row = rows.find((provider) => provider.id === id);
                    if (!row) return;
                    const { id: _id, kind, name, row: providerRow } = row;
                    const named = { id, kind, name, row: providerRow };
                    customProviderPublish(
                        outcome.passed
                            ? { ...named, result: "valid" }
                            : { ...named, reason: outcome.reason, result: "error" },
                    );
                }),
            );
        };
        const scanWithin = within(providerDiscoveryTimeoutMs);
        void client
            .scanProviders({ signal: scanWithin.signal })
            // A failed local scan says nothing about an earlier successful check.
            .catch((error: unknown) =>
                unansweredReason(error, scanWithin.bound, providerDiscoveryTimeoutMs),
            )
            .then((scanned) =>
                Promise.all([
                    customCheck(),
                    ...assistants.map(async (assistant) => {
                        if (!current()) return;
                        const scan = typeof scanned === "string" ? undefined : scanned;
                        // A completed scan lists every provider this Happy Agent
                        // has. One it does not list cannot work here at all, which
                        // is an answer rather than a check that could not be made.
                        const credentials = scan
                            ? (scan.providers.find(
                                  (provider) => provider.providerId === assistant.id,
                              )?.credentials ?? "missing")
                            : undefined;
                        if (credentials === "missing") {
                            verificationRetry.delete(assistant.id);
                            resultPublish(assistant.id, "invalid");
                            return;
                        }
                        if (credentials !== "available") {
                            resultPublish(
                                assistant.id,
                                "error",
                                typeof scanned === "string"
                                    ? `Couldn't look for its sign-in: ${scanned}`
                                    : "Couldn't read its sign-in",
                            );
                            return;
                        }
                        if (
                            authenticationFor(snapshot.providerAuthentication, assistant.id) ===
                            "valid"
                        )
                            return;
                        const retry = verificationRetry.get(assistant.id);
                        if (retry && Date.now() < retry.at) {
                            resultPublish(assistant.id, "error", retry.reason);
                            return;
                        }
                        // Back off failures; the two-second poll is only local discovery.
                        // A check abandoned because its screen went away is not a
                        // failure, so only an answered one starts the wait: one cut
                        // short by a sign-in landing must not read "Couldn't verify"
                        // for the next thirty seconds.
                        const inference = await verificationCheck(assistant.id, "inference");
                        // The API's failed result includes outages and usage limits;
                        // it does not prove that the person needs to sign in. The
                        // account itself answering is what onboarding asks: someone
                        // over today's limit is still connected. Its own refusal is
                        // the reason to show; otherwise the inference's.
                        const refused = inference?.passed === false && inference.answered;
                        const authentication = refused
                            ? await verificationCheck(assistant.id, "authentication")
                            : undefined;
                        const outcome: VerificationOutcome | undefined = !refused
                            ? inference
                            : !authentication || authentication.passed
                              ? authentication
                              : authentication.answered &&
                                  authentication.reason !== VERIFICATION_FAILED
                                ? authentication
                                : { ...authentication, reason: inference.reason };
                        if (!outcome) return;
                        if (outcome.passed) verificationRetry.delete(assistant.id);
                        else
                            verificationRetry.set(assistant.id, {
                                at: Date.now() + providerVerificationRetryMs,
                                reason: outcome.reason,
                            });
                        if (!current()) return;
                        if (outcome.passed) resultPublish(assistant.id, "valid");
                        else resultPublish(assistant.id, "error", outcome.reason);
                    }),
                ]),
            )
            .then(() => {
                if (generation !== verificationGeneration) return;
                verificationRunning = false;
                if (!current()) return;
                publish({
                    ...snapshot,
                    providerAuthentication: { ...snapshot.providerAuthentication, complete: true },
                });
            })
            .catch(() => {
                if (generation === verificationGeneration) verificationRunning = false;
            });
    }

    /** The local Happy Agent's client, while it is the one connected. */
    function agentClient() {
        const runtime = snapshot.runtime;
        if (runtime?.phase !== "ready" || runtime.mode !== "local") return undefined;
        return new HappyAgentClient({
            endpoint: runtime.activeTarget.happyAgentHttpUrl,
            token: "happy-local-capability",
        });
    }

    /** The local Happy Agent's provider CLI routes, while it is the one connected. */
    function providerClisApi() {
        const runtime = snapshot.runtime;
        if (runtime?.phase !== "ready" || runtime.mode !== "local") return undefined;
        return localProviderClisApiCreate({
            endpoint: runtime.activeTarget.happyAgentHttpUrl,
            token: "happy-local-capability",
        });
    }

    function providerClisPollStop() {
        if (!providerClisPoll) return;
        clearInterval(providerClisPoll);
        providerClisPoll = undefined;
    }

    /** The assistants with an install or sign-in still going. */
    function providerClisActive(): LocalProviderCliId[] {
        return [...(snapshot.providerClis?.values() ?? [])]
            .filter(
                (cli) => cli.operation?.status === "running" || cli.operation?.status === "waiting",
            )
            .map((cli) => cli.id);
    }

    /**
     * Follows an install or sign-in while one is going and Subscriptions is on
     * screen. Happy Agent says how it went on its event stream, which setup
     * does not hold, so this is the stopgap poll, and it stops with the work.
     */
    function providerClisPollSynchronize() {
        if (!providerAuthenticationLive() || providerClisActive().length === 0) {
            providerClisPollStop();
            return;
        }
        if (providerClisPoll) return;
        providerClisPoll = setInterval(() => {
            const api = providerClisApi();
            const active = providerClisActive();
            if (!api || !providerAuthenticationLive() || active.length === 0) {
                providerClisPollStop();
                return;
            }
            for (const id of active)
                void api.get(id).then(
                    (cli) => cli && providerCliAdopt(cli),
                    () => undefined,
                );
        }, providerClisPollMs);
    }

    function providerCliAdopt(cli: LocalProviderCli) {
        const previous = snapshot.providerClis?.get(cli.id);
        // UUIDv7 versions sort by time, so an answer older than the one held
        // is one that crossed a newer answer on the way.
        if (previous && cli.version !== "" && cli.version <= previous.version) return;
        const providerClis = new Map(snapshot.providerClis);
        providerClis.set(cli.id, cli);
        publish({ ...snapshot, providerClis });
        const operation = cli.operation;
        // The vendor's page opens once, for a sign-in this window asked for,
        // unless the vendor's own program already opened it.
        if (
            operation?.kind === "sign_in" &&
            operation.status === "waiting" &&
            operation.authorization &&
            signInRequested.delete(cli.id) &&
            !operation.authorization.openedByProgram
        )
            options.externalOpen?.(operation.authorization.url);
        if (operation && operation.status !== "running" && operation.status !== "waiting")
            signInRequested.delete(cli.id);
        // A sign-in that just worked is checked at once, not after a backoff
        // an earlier failed check started.
        if (operation?.status === "succeeded") verificationRetry.delete(cli.id);
        providerClisPollSynchronize();
    }

    /** Reads every assistant once per connection, as Subscriptions opens. */
    function providerClisSynchronize() {
        const runtime = snapshot.runtime;
        const api = providerClisApi();
        if (!api || runtime?.phase !== "ready" || !providerAuthenticationLive()) {
            providerClisPollStop();
            return;
        }
        if (providerClisReadFor === runtime.connectionId || providerClisReading) return;
        providerClisReading = true;
        const connectionId = runtime.connectionId;
        // Whether accounts can be added is asked once per connection, beside the
        // CLIs; a Happy Agent that cannot answer cannot add them either.
        const client = agentClient();
        void Promise.resolve()
            .then(() => client?.getHealth())
            .then(
                (health) =>
                    keyAddSupportedPublish(
                        connectionId,
                        health?.capabilities?.providerAccounts === true,
                    ),
                () => keyAddSupportedPublish(connectionId, false),
            );
        void api
            .list()
            .then(
                (clis) => {
                    providerClisReadFor = connectionId;
                    publish({
                        ...snapshot,
                        providerClis: new Map(clis.map((cli) => [cli.id, cli])),
                    });
                },
                (error: unknown) => {
                    // A Happy Agent without the routes keeps the cards' commands.
                    if (!(error instanceof LocalProviderClisUnavailable)) return;
                    providerClisReadFor = connectionId;
                    publish({ ...snapshot, providerClis: new Map() });
                },
            )
            .finally(() => {
                providerClisReading = false;
                providerClisPollSynchronize();
            });
    }

    function keyAddSupportedPublish(connectionId: number, supported: boolean) {
        const runtime = snapshot.runtime;
        if (runtime?.phase !== "ready" || runtime.connectionId !== connectionId) return;
        publish({
            ...snapshot,
            keyAdd: { ...(snapshot.keyAdd ?? { phase: "idle" }), supported },
        });
    }

    /** One install, sign-in, or cancel; a refusal still carries the object as it is. */
    function providerCliAttempt(
        request: (
            api: NonNullable<ReturnType<typeof providerClisApi>>,
        ) => Promise<LocalProviderCli | undefined>,
        failure: string,
    ) {
        const api = providerClisApi();
        if (!api) return;
        void request(api).then(
            (cli) => cli && providerCliAdopt(cli),
            (error: unknown) => {
                if (error instanceof LocalProviderCliRefused && error.providerCli) {
                    providerCliAdopt(error.providerCli);
                    return;
                }
                publish({
                    ...snapshot,
                    failure: {
                        cause: "request",
                        message: error instanceof Error && error.message ? error.message : failure,
                    },
                });
            },
        );
    }

    function providerAuthenticationSynchronize() {
        const live = providerAuthenticationLive();
        providerClisSynchronize();
        if (!live) {
            providerRecheckStop();
            verificationAbort?.abort();
            verificationAbort = undefined;
            verificationGeneration += 1;
            verificationRunning = false;
            return;
        }
        // While the report is on screen the machine is asked again on its own.
        // The daemon has no channel for "somebody just signed in", so this is
        // the stopgap poll the reactivity rule allows, and it stops with the
        // screen.
        if (!providerRecheck)
            providerRecheck = setInterval(() => {
                const current = providerAuthenticationLive();
                if (!current) {
                    providerRecheckStop();
                    return;
                }
                providerAuthenticationRun(current.key, current.runtime);
            }, providerRecheckMs);
        if (snapshot.providerAuthentication.key === live.key) return;
        providerAuthenticationRun(live.key, live.runtime);
    }

    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            if (listeners.size === 1) {
                chiefOfStaffSourceUnsubscribe =
                    options.chiefOfStaff.subscribe(chiefOfStaffSynchronize);
                happyMobileSourceUnsubscribe =
                    options.happyMobile.subscribe(happyMobileSynchronize);
                localConnectedUnsubscribe = options.localConnected.subscribe(reconnectSynchronize);
                eventReceived = false;
                bridgeUnsubscribe = bridge.onboardingSubscribe((next) => {
                    eventReceived = true;
                    onboardingSet(next);
                });
                daemonEventReceived = false;
                daemonUnsubscribe = bridge.daemonSubscribe((next) => {
                    daemonEventReceived = true;
                    daemonSet(next);
                });
                runtimeEventReceived = false;
                runtimeUnsubscribe = bridge.subscribe((next) => {
                    runtimeEventReceived = true;
                    runtimeSet(next);
                });
                void bridge.onboardingGet().then(
                    (initial) => {
                        if (!eventReceived) onboardingSet(initial);
                    },
                    (error: unknown) => {
                        publish({
                            ...snapshot,
                            failure: {
                                cause: "stateRead",
                                message: `Happy could not read the state of first-run setup. ${errorMessage(error)}`,
                            },
                        });
                    },
                );
                void bridge.daemonGet().then(
                    (initial) => {
                        if (!daemonEventReceived) daemonSet(initial);
                    },
                    (error: unknown) => {
                        publish({
                            ...snapshot,
                            failure: {
                                cause: "stateRead",
                                message: `Happy could not read Happy Agent download state. ${errorMessage(error)}`,
                            },
                        });
                    },
                );
                void bridge.runtimeGet().then(
                    (initial) => {
                        if (!runtimeEventReceived) runtimeSet(initial);
                    },
                    (error: unknown) => {
                        publish({
                            ...snapshot,
                            failure: {
                                cause: "stateRead",
                                message: `Happy could not read Happy Agent connection state. ${errorMessage(error)}`,
                            },
                        });
                    },
                );
                setupSynchronize();
            }
            return () => {
                listeners.delete(listener);
                if (listeners.size > 0) return;
                bridgeUnsubscribe?.();
                bridgeUnsubscribe = undefined;
                daemonUnsubscribe?.();
                daemonUnsubscribe = undefined;
                runtimeUnsubscribe?.();
                runtimeUnsubscribe = undefined;
                happyMobileSourceUnsubscribe?.();
                happyMobileSourceUnsubscribe = undefined;
                chiefOfStaffSourceUnsubscribe?.();
                chiefOfStaffSourceUnsubscribe = undefined;
                localConnectedUnsubscribe?.();
                localConnectedUnsubscribe = undefined;
                localLostOn = undefined;
                chiefOfStaffSynchronize();
                providerRecheckStop();
                providerClisPollStop();
                providerClisReadFor = undefined;
                signInRequested.clear();
                verificationAbort?.abort();
                verificationAbort = undefined;
                verificationGeneration += 1;
                verificationRunning = false;
                happyMobileStop();
                downloadRetryStop();
                startRetryStop();
            };
        },
        connectRetry() {
            attempt(bridge.runtimeRetry(), "Happy could not ask Happy Agent to start again.");
        },
        agentUpdate() {
            attempt(bridge.daemonUpgrade(), "Happy could not update Happy Agent.");
        },
        agentSetupBegin() {
            // A computer that has never run Happy Agent starts it only when
            // asked here; everything after that is setup's own sequence.
            // The welcome asks before anything here is watched, so the runtime
            // is read rather than taken from this store's last snapshot.
            attempt(
                bridge
                    .runtimeGet()
                    .then((runtime) =>
                        runtime.phase === "off"
                            ? bridge.runtimeStart({ mode: "local" })
                            : undefined,
                    ),
                "Happy could not start setting up Happy Agent.",
            );
            if (agentSetupActive) return;
            agentSetupActive = true;
            setupSynchronize();
        },
        chiefOfStaffSetup() {
            chiefOfStaffSetupBegin();
        },
        assistantsContinue() {
            attempt(bridge.onboardingAssistantsContinue(), "Happy could not continue setup.");
        },
        stepBack(step) {
            attempt(bridge.onboardingStepBack(step), "Happy could not go back to that step.");
        },
        assistantSignIn(id) {
            signInRequested.add(id);
            providerCliAttempt(
                (api) => api.signIn(id, crypto.randomUUID()),
                "Happy could not start that sign-in.",
            );
        },
        assistantSignInCode(id, code) {
            providerCliAttempt(
                (api) => api.signInCode(id, code, crypto.randomUUID()),
                "Happy could not hand over that code.",
            );
        },
        assistantInstall(id) {
            providerCliAttempt(
                (api) => api.install(id, crypto.randomUUID()),
                "Happy could not start that install.",
            );
        },
        assistantConnectCancel(id) {
            signInRequested.delete(id);
            providerCliAttempt(
                (api) => api.cancel(id, crypto.randomUUID()),
                "Happy could not stop that.",
            );
        },
        claudeSetupTokenSave(token) {
            const api = providerClisApi();
            if (!api || snapshot.claudeToken?.phase === "saving") return;
            publish({ ...snapshot, claudeToken: { phase: "saving" } });
            api.claudeSetupTokenSave(token, crypto.randomUUID()).then(
                () => {
                    verificationRetry.delete("claude");
                    publish({ ...snapshot, claudeToken: { phase: "saved" } });
                },
                (error: unknown) => {
                    publish({
                        ...snapshot,
                        claudeToken: {
                            error:
                                error instanceof LocalProviderCliRouteMissing
                                    ? "This version of Happy Agent can't take a setup token yet. Update Happy Agent, then try again."
                                    : error instanceof LocalProviderCliRefused ||
                                        error instanceof LocalProviderClisUnavailable
                                      ? error.message
                                      : "Happy couldn't reach Happy Agent. Try again.",
                            phase: "failed",
                        },
                    });
                },
            );
        },
        claudeSetupTokenReset() {
            if (snapshot.claudeToken?.phase === "saving") return;
            publish({ ...snapshot, claudeToken: { phase: "idle" } });
        },
        providerKeyAdd(credential) {
            const client = agentClient();
            const keyAdd = snapshot.keyAdd;
            if (!client || keyAdd?.supported !== true || keyAdd.phase === "saving") return;
            const row = credential.kind === "api-key" ? credential.type : "bedrock";
            publish({ ...snapshot, keyAdd: { phase: "saving", row, supported: true } });
            const mutationId = crypto.randomUUID();
            client
                .addProviderAccount(
                    credential.kind === "api-key"
                        ? { apiKey: credential.apiKey, mutationId, type: credential.type }
                        : {
                              bedrock:
                                  credential.kind === "aws"
                                      ? {
                                            accessKeyId: credential.accessKeyId,
                                            region: credential.region,
                                            secretAccessKey: credential.secretAccessKey,
                                        }
                                      : {
                                            bearerToken: credential.bearerToken,
                                            region: credential.region,
                                        },
                              mutationId,
                              type: "bedrock",
                          },
                )
                .then(
                    // The new account is a configured provider: the next pass reads
                    // and checks it like any other, and its row counts it.
                    () =>
                        publish({ ...snapshot, keyAdd: { phase: "saved", row, supported: true } }),
                    (error: unknown) => {
                        publish({
                            ...snapshot,
                            keyAdd: {
                                error: keyAddFailure(error, row),
                                phase: "failed",
                                row,
                                supported: true,
                            },
                        });
                    },
                );
        },
        providerKeyAddReset() {
            const keyAdd = snapshot.keyAdd;
            if (!keyAdd || keyAdd.phase === "saving") return;
            publish({
                ...snapshot,
                keyAdd:
                    keyAdd.supported === undefined
                        ? { phase: "idle" }
                        : { phase: "idle", supported: keyAdd.supported },
            });
        },
        sandboxSetup() {
            attempt(bridge.onboardingSandboxSetup(), "Happy could not start sandbox setup.");
        },
        happyMobileConnect() {
            happyMobileStore?.happyMobileConnect();
        },
        happyMobileSkip() {
            if (happyMobileStore) {
                happyMobileStore.happyMobileSkip();
                return;
            }
            // Pairing is optional, so a step that has not come up yet must
            // not hold the person on it.
            happyMobileSkipped = true;
            publish({ ...snapshot, happyMobile: HAPPY_MOBILE_SKIPPED });
            chiefOfStaffSetupAutomatically();
        },
        happyMobileDirect() {
            return happyMobileStore?.direct ?? happyAgentMobileConnectorStoreNoop;
        },
    };
}

/** The screen this snapshot is on, or nothing once setup is finished. */
export function localOnboardingView(
    snapshot: LocalOnboardingViewSnapshot,
): LocalOnboardingView | undefined {
    const onboarding = snapshot.onboarding;
    if (!onboarding)
        return {
            kind: "checking",
            ...(snapshot.failure ? { message: snapshot.failure.message } : {}),
        };
    // What the shell reported about the step comes first; a request this window
    // could not even deliver is the fallback, so one failure is never shown as
    // if it were the other.
    const message = onboarding.message ?? snapshot.failure?.message;
    const busy = onboarding.busy || snapshot.pending;
    switch (onboarding.stage) {
        case "inactive":
            return undefined;
        case "checking":
            return { kind: "checking", ...(message ? { message } : {}) };
        case "nodeMissing":
            return { kind: "node-missing" };
        case "daemonDownload":
            if (snapshot.daemon?.error && snapshot.daemon.errorCode === "data_newer")
                return dataNewerProject(snapshot.daemon, snapshot.daemon.error);
            return agentSetupProject(snapshot.daemon, snapshot.agentStarting, message);
        case "daemonStarting":
            return {
                kind: "agent-setup",
                phase: { kind: "starting" },
                ...(message ? { message } : {}),
            };
        case "connecting":
            return { kind: "connecting" };
        case "connectFailed":
            if (snapshot.runtime?.phase === "error" && snapshot.runtime.code === "data_newer")
                return dataNewerProject(snapshot.daemon, snapshot.runtime.message);
            return {
                kind: "connect-failed",
                message: message ?? "Happy could not reach your Happy Agent daemon.",
                retrying: onboarding.retrying === true,
            };
        case "providersMissing":
        case "assistantsFound":
            // Until the configuration is read the rows under the cards are not
            // known, so the cards are drawn still being checked: the step is
            // already Subscriptions, and drawing Setup meanwhile would put the
            // person back a step and forward again.
            if (customUnread(snapshot)) return { kind: "examining" };
            return {
                assistants: assistantsProject(
                    onboarding.assistants,
                    snapshot.providerAuthentication,
                    providersRefused(snapshot),
                    snapshot.providerClis,
                ),
                ...(snapshot.claudeToken ? { claudeToken: snapshot.claudeToken } : {}),
                ...(snapshot.keyAdd ? { keyAdd: snapshot.keyAdd } : {}),
                custom: customProject(snapshot),
                kind: "provider-authentication",
                installShell: onboarding.installShell ?? rendererInstallShell(),
            };
        case "agentReady":
            return {
                kind: "agent-ready",
                ...(snapshot.daemon?.installedVersion
                    ? { version: snapshot.daemon.installedVersion }
                    : {}),
                ...(onboarding.node ? { nodeVersion: onboarding.node.version } : {}),
            };
        case "examining":
            return { kind: "examining" };
        case "sandbox": {
            const sandbox = onboarding.sandbox;
            return {
                kind: "windows-sandbox",
                state:
                    sandbox?.settingUp || snapshot.pending
                        ? "waiting"
                        : sandbox?.previousAttempt
                          ? "unfinished"
                          : "before",
            };
        }
        case "project": {
            const mobile = snapshot.happyMobile;
            if (!mobile || mobile.status === "checking") return { kind: "happy-mobile-checking" };
            switch (mobile.status) {
                case "desktop":
                    return { kind: "happy-mobile-desktop", step: mobile.step };
                case "offer":
                    return {
                        busy: mobile.pending,
                        kind: "happy-mobile-offer",
                        ...(mobile.message ? { message: mobile.message } : {}),
                    };
                case "pairing":
                case "failed":
                    return { kind: "happy-mobile-pairing" };
                case "configured":
                case "disabled":
                case "skipped":
                    return {
                        busy,
                        kind: "finishing",
                        ...(message ? { message } : {}),
                    };
            }
        }
        case "complete":
            return undefined;
    }
    return undefined;
}

/**
 * How far the sequence actually got, while a finished step is being looked at
 * again. Absent when the step on screen is the live one, because then the bar
 * already knows.
 */
export function localOnboardingReachedStage(
    snapshot: LocalOnboardingViewSnapshot,
): OnboardingStage | undefined {
    switch (snapshot.onboarding?.reachedStage) {
        case undefined:
            return undefined;
        case "providersMissing":
        case "assistantsFound":
        case "examining":
            return "subscriptions";
        case "sandbox":
            return "sandbox";
        case "project":
        case "complete":
            return "connect-phone";
        default:
            return "setup";
    }
}

/**
 * A refusal only an update can answer, with that update when Happy has one to
 * offer: an installed agent Happy manages, and a newer release it may run.
 */
function dataNewerProject(
    daemon: DesktopDaemonSnapshot | undefined,
    message: string,
): LocalOnboardingView {
    // The update's bytes arriving are already part of it.
    const upgrading = daemon?.operation === "upgrading" || daemon?.operation === "downloading";
    const offered =
        daemon?.managed === true &&
        daemon.installation === "installed" &&
        (daemon.updateAvailable || upgrading);
    // The refusal itself may be the daemon's error, and is already the message.
    const updateError =
        !upgrading && daemon?.error && daemon.error !== message ? daemon.error : undefined;
    return {
        kind: "data-newer",
        message,
        ...(updateError ? { updateError } : {}),
        ...(offered
            ? {
                  update: {
                      busy: upgrading,
                      ...(daemon.availableVersion ? { version: daemon.availableVersion } : {}),
                  },
              }
            : {}),
    };
}

function agentSetupProject(
    daemon: DesktopDaemonSnapshot | undefined,
    starting: boolean,
    message: string | undefined,
): LocalOnboardingView {
    const phase = (() => {
        if (starting || daemon?.operation === "installing") return { kind: "starting" } as const;
        if (daemon?.readyVersion) return { kind: "ready", version: daemon.readyVersion } as const;
        if (daemon?.operation === "downloading")
            return {
                ...(daemon.download ? { download: daemon.download } : {}),
                kind: "downloading",
            } as const;
        if (daemon?.error) return { kind: "retrying", message: daemon.error } as const;
        return { kind: "preparing" } as const;
    })();
    return {
        kind: "agent-setup",
        phase,
        ...(message ? { message } : {}),
    };
}

/**
 * The shell's answer about the three assistants, as the screen takes it, and
 * Antigravity after them, which only Happy Agent answers for.
 */
function assistantsProject(
    assistants: readonly LocalAssistantState[] | undefined,
    authentication: ProviderAuthenticationSnapshot,
    refused: boolean,
    providerClis: ReadonlyMap<LocalProviderCliId, LocalProviderCli> | undefined,
): readonly LocalOnboardingAssistant[] {
    const shell = (assistants ?? []).map((assistant): LocalOnboardingAssistant => {
        // Nothing can be checked against a daemon that would not start, and it
        // already said why: none of these works yet.
        const result = refused
            ? "invalid"
            : (authenticationFor(authentication, assistant.id) ?? "checking");
        // Happy Agent never runs these commands: it uses the sign-in they leave
        // behind, with its own copy of Claude Code where one is needed. So a
        // sign-in still on the machine is Ready without the command. Anything
        // short of that is fixed by signing in, which takes the command, so one
        // that is not here is installed first whether its check failed or found
        // nothing.
        // Happy Agent looks in more places than the login shell does, inside the
        // vendors' desktop apps among them, and installs there itself, so where
        // it answers, its answer is whether the program is here.
        const cli = providerClis?.get(assistant.id);
        const missing = cli ? !cli.installed : assistant.status === "missing";
        const unavailable = missing && result !== "valid" && result !== "checking";
        const reason = result === "error" ? authentication.reasons?.[assistant.id] : undefined;
        return {
            authentication: unavailable ? "unavailable" : result,
            ...(assistant.command ? { command: assistant.command } : {}),
            ...(reason && !unavailable ? { message: reason } : {}),
            // Before Happy Agent has answered, the card still offers its button,
            // read from the shell's own finding, so it never flashes the commands.
            connect: cli
                ? assistantConnectProject(cli)
                : { installable: true, installed: !missing },
            id: assistant.id,
            status: assistant.status,
        };
    });
    return [...shell, antigravityProject(authentication, refused, providerClis)];
}

/**
 * Antigravity's card. The scan cannot read agy's sign-in, so it is ready when
 * agy's own check says signed in, Happy Agent has its account for it, and that
 * account is on. Nothing runs an inference check through agy.
 */
function antigravityProject(
    authentication: ProviderAuthenticationSnapshot,
    refused: boolean,
    providerClis: ReadonlyMap<LocalProviderCliId, LocalProviderCli> | undefined,
): LocalOnboardingAssistant {
    const cli = providerClis?.get("antigravity");
    const connect = cli ? assistantConnectProject(cli) : { installable: false, installed: false };
    const card = (
        result: LocalOnboardingAssistant["authentication"],
        message?: string,
    ): LocalOnboardingAssistant => ({
        authentication: result,
        connect,
        id: "antigravity",
        ...(message ? { message } : {}),
        status: cli?.installed ? "found" : "missing",
    });
    if (refused) return card("invalid");
    // Until Happy Agent answers, the card is checked; one with no answer for
    // Antigravity cannot set it up at all.
    if (!cli) return card(providerClis ? "unavailable" : "checking");
    if (!cli.installed) return card("unavailable");
    if (cli.signedIn !== "signed_in") return card("invalid");
    if (cli.providerId !== "antigravity")
        return card("error", "Update Happy Agent to use Antigravity");
    switch (authentication.antigravityEnabled) {
        case undefined:
            return card("checking");
        case false:
            return card("error", "Antigravity is turned off in Happy Agent");
        case true:
            return card("valid");
    }
}

/**
 * What a card says about Happy Agent's own install or sign-in. A finished or
 * cancelled one says nothing more: the card's verified state answers for it.
 */
function assistantConnectProject(cli: LocalProviderCli): LocalOnboardingAssistantConnect {
    const operation = cli.operation;
    const kind = operation?.kind === "install" ? "install" : "sign-in";
    const projected: LocalOnboardingAssistantOperation | undefined = (() => {
        switch (operation?.status) {
            case "running":
                return { kind, status: "running" };
            case "waiting":
                return operation.authorization
                    ? {
                          kind: "sign-in",
                          status: "waiting",
                          url: operation.authorization.url,
                          ...(operation.authorization.userCode
                              ? { userCode: operation.authorization.userCode }
                              : {}),
                          ...(operation.authorization.acceptsCode ? { acceptsCode: true } : {}),
                          ...(operation.authorization.expiresAt === undefined
                              ? {}
                              : { expiresAt: operation.authorization.expiresAt }),
                      }
                    : { kind, status: "running" };
            case "failed":
                return { kind, message: operation.message, status: "failed" };
            default:
                return undefined;
        }
    })();
    return {
        ...(cli.acceptsCode ? { acceptsCode: true } : {}),
        installable: cli.installable,
        installed: cli.installed,
        ...(projected ? { operation: projected } : {}),
    };
}

function assistantAuthenticationInitial(
    assistants: readonly LocalAssistantState[],
    id: LocalAssistantState["id"],
    previous: ProviderAuthenticationSnapshot,
): ProviderAuthenticationResult | undefined {
    if (!assistants.some((assistant) => assistant.id === id)) return undefined;
    return authenticationFor(previous, id) === "valid" ? "valid" : "checking";
}

function authenticationFor(
    authentication: ProviderAuthenticationSnapshot,
    id: LocalAssistantState["id"],
): ProviderAuthenticationResult | undefined {
    switch (id) {
        case "claude":
            return authentication.claude;
        case "codex":
            return authentication.codex;
        case "grok":
            return authentication.grok;
    }
}

function authenticationResultsProject(
    key: string,
    results: readonly {
        readonly id: LocalAssistantState["id"];
        readonly result: Exclude<ProviderAuthenticationResult, "checking">;
        readonly reason?: string;
    }[],
    previous: ProviderAuthenticationSnapshot,
    complete: boolean,
): ProviderAuthenticationSnapshot {
    let claude = previous.claude;
    let codex = previous.codex;
    let grok = previous.grok;
    const reasons = { ...previous.reasons };
    for (const result of results) {
        let projected: Exclude<ProviderAuthenticationResult, "checking">;
        switch (result.id) {
            case "claude":
                projected = claude = authenticationResultProject(previous.claude, result.result);
                break;
            case "codex":
                projected = codex = authenticationResultProject(previous.codex, result.result);
                break;
            case "grok":
                projected = grok = authenticationResultProject(previous.grok, result.result);
                break;
        }
        // A reason belongs to the failure it explains, and goes with it.
        if (projected === "error" && result.reason) reasons[result.id] = result.reason;
        else delete reasons[result.id];
    }
    return {
        ...(previous.antigravityEnabled === undefined
            ? {}
            : { antigravityEnabled: previous.antigravityEnabled }),
        ...(claude ? { claude } : {}),
        ...(codex ? { codex } : {}),
        complete,
        ...(previous.custom ? { custom: previous.custom } : {}),
        ...(grok ? { grok } : {}),
        key,
        ...(Object.keys(reasons).length > 0 ? { reasons } : {}),
    };
}

type ProviderVerificationResponse = Awaited<ReturnType<HappyAgentClient["verifyProvider"]>>;

/** How one verification went, with the reason when it did not pass. */
type VerificationOutcome =
    | { readonly passed: true }
    | {
          readonly passed: false;
          readonly reason: string;
          /** The daemon answered that it failed, rather than not answering at all. */
          readonly answered: boolean;
      };

/** What a failed check says when nobody said why. */
const VERIFICATION_FAILED = "The test request failed";

/**
 * Why a check the daemon answered did not pass, in its words when it gave
 * them; a daemon older than `failure` says only that it failed.
 */
function verificationFailureReason(result: ProviderVerificationResponse): string {
    if (result.status === "passed") return "Happy Agent couldn't run a test request through it";
    return verificationFailureMessage(result) ?? VERIFICATION_FAILED;
}

/**
 * The daemon's own reason for a failed check, when it sent one. Its `kind`
 * is for branching, which this screen does not do, so a kind added after this
 * build reads like any other: the message is already worded for the person
 * and is shown as it is.
 */
function verificationFailureMessage(result: ProviderVerificationResponse): string | undefined {
    const message = result.failure?.message.trim();
    return message ? message.slice(0, VERIFICATION_REASON_MAX) : undefined;
}

/** The daemon's messages are at most this long; anything longer is cut there. */
const VERIFICATION_REASON_MAX = 500;

/**
 * Model access configured some other way than the CLIs' own sign-ins: every
 * enabled provider that is not `claude`, `codex`, `grok`, or `antigravity`.
 * One with no model enabled is listed too, because it is configured and cannot
 * work. Pools are left out because their members are providers of their own.
 */
function customProvidersFind(config: Awaited<ReturnType<HappyAgentClient["getConfig"]>>): readonly {
    readonly id: string;
    readonly kind: string;
    /** Whether it has a model to check with; one without cannot work at all. */
    readonly modelsEnabled: boolean;
    readonly name: string;
    readonly row: LocalOnboardingProviderRowId;
}[] {
    return Object.entries(config.config.providers).flatMap(([id, provider]) => {
        if (LOCAL_PROVIDER_IDS.has(id) || provider.type === "smart" || !provider.enabled) return [];
        const kind = providerKindLabel(provider.type);
        // Named by its display name, falling back to the kind and ID.
        const name = provider.name?.trim() || `${kind} · ${id}`;
        return [
            {
                id,
                kind,
                modelsEnabled: provider.models.some((model) => model.enabled),
                name,
                row: providerRow(provider.type),
            },
        ];
    });
}

const LOCAL_PROVIDER_IDS: ReadonlySet<string> = new Set(["claude", "codex", "grok", "antigravity"]);

/** Who issues each kind of key, as a refusal names them. */
const KEY_VENDORS: Readonly<Record<LocalOnboardingKeyRowId, string>> = {
    bedrock: "AWS",
    claude: "Anthropic",
    codex: "OpenAI",
    grok: "xAI",
};

/**
 * Why a key was not added, in words for under its field. A key the vendor
 * refused and one that could not be checked at all read differently: the
 * second says nothing against the key.
 */
function keyAddFailure(error: unknown, row: LocalOnboardingKeyRowId): string {
    const vendor = KEY_VENDORS[row];
    const plural = row === "bedrock";
    if (!(error instanceof HappyAgentApiError))
        return "Happy couldn't reach Happy Agent. Try again.";
    // A daemon without the route: the capability said otherwise, or it predates it.
    if (error.status === 404 && error.code === "not_found")
        return "This version of Happy Agent can't add keys yet. Update Happy Agent, then try again.";
    // The vendor's own refusal says best what is wrong with the key.
    if (error.code === "verification_failed")
        return error.message
            ? error.message
            : `${vendor} didn't accept ${plural ? "these keys" : "this key"}. Check that ${plural ? "they're" : "it's"} whole and still active.`;
    // Unproven, not wrong: nothing here may say the key is bad.
    if (error.code === "verification_unavailable")
        return `Happy Agent couldn't check ${plural ? "these keys" : "the key"} with ${vendor} right now. ${plural ? "They" : "It"} may be fine; try again in a moment.`;
    return error.message || "Happy Agent couldn't add that. Try again.";
}

/**
 * The Connect your AI row a configured provider counts toward. An account of
 * an assistant's type is one more account of that assistant, an OpenAI key
 * included; Bedrock has its own row, and every other type is a custom endpoint.
 */
function providerRow(type: string): LocalOnboardingProviderRowId {
    switch (type) {
        case "antigravity":
        case "claude":
        case "codex":
        case "grok":
        case "bedrock":
            return type;
        case "openai":
            return "codex";
        default:
            return "custom";
    }
}

/** A provider kind as a person would name it on the card. */
function providerKindLabel(type: string): string {
    switch (type) {
        case "bedrock":
            return "Bedrock";
        case "claude":
            return "Claude";
        case "codex":
            return "Codex";
        case "grok":
            return "Grok";
        case "openai":
            return "OpenAI";
        case "openai_compatible":
            return "OpenAI-compatible";
        default:
            return type;
    }
}

/**
 * The custom column as the screen reads it. A daemon that refused to start
 * because no provider works has answered for every column already, so nothing
 * custom is configured; otherwise it is whatever the last check found.
 */
function customProject(snapshot: LocalOnboardingViewSnapshot): LocalOnboardingCustom {
    if (providersRefused(snapshot)) return { authentication: "invalid", providers: [] };
    const custom = snapshot.providerAuthentication.custom;
    if (!custom) return { authentication: "checking", providers: [] };
    return {
        authentication: custom.result,
        ...(custom.reason ? { message: custom.reason } : {}),
        providers: custom.providers.map((provider) => ({
            authentication: provider.result,
            id: provider.id,
            kind: provider.kind,
            ...(provider.result === "error" && provider.reason ? { message: provider.reason } : {}),
            name: provider.name,
            row: provider.row,
        })),
    };
}

/**
 * The column as a new pass opens it: a provider that already works keeps its
 * answer, and every other one is checked again from the start.
 */
function customInitial(
    previous: ProviderAuthenticationSnapshot["custom"],
): NonNullable<ProviderAuthenticationSnapshot["custom"]> {
    if (!previous?.read) return { providers: [], read: false, result: "checking" };
    const providers = previous.providers.map(
        ({ id, kind, name, result, row }): CustomProviderCheck => ({
            id,
            kind,
            name,
            row,
            result: result === "valid" ? "valid" : "checking",
        }),
    );
    // What was configured is still known, so the rows hold their places.
    return providers.length === 0
        ? previous
        : { providers, read: true, result: customResultProject(providers) };
}

/** The column from its providers: any one that works is enough to go on. */
function customResultProject(
    providers: readonly CustomProviderCheck[],
): ProviderAuthenticationResult {
    if (providers.length === 0) return "invalid";
    if (providers.some((provider) => provider.result === "valid")) return "valid";
    if (providers.some((provider) => provider.result === "checking")) return "checking";
    return "error";
}

/**
 * The local Happy Agent can say what is configured besides the three CLIs:
 * it is the one connected, and there is an assistant row to check beside it.
 */
function customReadable(snapshot: LocalOnboardingViewSnapshot): boolean {
    const runtime = snapshot.runtime;
    return (
        runtime?.phase === "ready" &&
        runtime.mode === "local" &&
        (snapshot.onboarding?.assistants?.length ?? 0) > 0
    );
}

/**
 * Subscriptions waits, on its own skeleton, for the configuration: every row
 * it will hold is drawn with the answered cards, in place from the start.
 */
function customUnread(snapshot: LocalOnboardingViewSnapshot): boolean {
    return (
        customReadable(snapshot) &&
        !providersRefused(snapshot) &&
        snapshot.providerAuthentication.custom?.read !== true
    );
}

/** Happy Agent would not start because no inference provider works at all. */
function providersRefused(snapshot: LocalOnboardingViewSnapshot): boolean {
    return snapshot.onboarding?.stage === "providersMissing" && snapshot.runtime?.phase !== "ready";
}

/**
 * A failed poll is not evidence that a previously verified CLI signed out.
 * Keep the confirmed answer visible until a later completed verification
 * finds the local credential missing, so a transient daemon/network error cannot
 * ask for sign-in again or move the onboarding step backwards.
 */
function authenticationResultProject(
    previous: ProviderAuthenticationResult | undefined,
    next: Exclude<ProviderAuthenticationResult, "checking">,
): Exclude<ProviderAuthenticationResult, "checking"> {
    return previous === "valid" && next === "error" ? "valid" : next;
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * The install shell for a shell too old to name one. A hosted renderer can
 * outlive its shell, and the browser's platform string is the only answer it
 * has; Windows must not be handed POSIX commands that cannot run there.
 */
export function rendererInstallShell(
    platform: string = (navigator as Navigator & { userAgentData?: { platform?: string } })
        .userAgentData?.platform ?? navigator.platform,
): "powershell" | "posix" {
    return platform.toLowerCase().startsWith("win") ? "powershell" : "posix";
}
