import type {
    LocalOnboardingAssistant,
    LocalOnboardingCustom,
    LocalOnboardingView,
    OnboardingStage,
} from "happy-desktop-ui";
import {
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

type ProviderAuthenticationResult = "checking" | "valid" | "invalid" | "error";

interface ProviderAuthenticationSnapshot {
    readonly claude?: ProviderAuthenticationResult;
    readonly codex?: ProviderAuthenticationResult;
    readonly complete: boolean;
    /** Model access configured some other way, and the kinds it was found to be. */
    readonly custom?: {
        readonly result: ProviderAuthenticationResult;
        readonly providers: readonly string[];
    };
    readonly grok?: ProviderAuthenticationResult;
    readonly key?: string;
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
    /** Starts Windows sandbox setup; Windows' administrator prompt opens from here. */
    sandboxSetup(): void;
    happyMobileConnect(): void;
    happyMobileSkip(): void;
    happyMobilePlatformSelect(platform: "ios" | "android"): void;
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
    const verificationRetryAt = new Map<LocalAssistantState["id"], number>();
    let customVerificationRetryAt = 0;
    /** The configured custom providers the last inference check was made against. */
    let customVerificationConfig: string | undefined;
    let providerRecheck: ReturnType<typeof setInterval> | undefined;
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
            verificationRetryAt.clear();
            customVerificationRetryAt = 0;
            customVerificationConfig = undefined;
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
                    claude: assistantAuthenticationInitial(assistants, "claude", previous),
                    codex: assistantAuthenticationInitial(assistants, "codex", previous),
                    complete: assistants.length === 0,
                    custom:
                        previous.custom?.result === "valid"
                            ? previous.custom
                            : { providers: [], result: "checking" },
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
        ) => {
            if (!current()) return;
            publish({
                ...snapshot,
                providerAuthentication: authenticationResultsProject(
                    key,
                    [{ id, result }],
                    snapshot.providerAuthentication,
                    false,
                ),
            });
        };
        const customPublish = (
            result: Exclude<ProviderAuthenticationResult, "checking">,
            providers: readonly string[],
        ) => {
            if (!current()) return;
            const previous = snapshot.providerAuthentication.custom;
            publish({
                ...snapshot,
                providerAuthentication: {
                    ...snapshot.providerAuthentication,
                    custom: {
                        providers,
                        result: authenticationResultProject(previous?.result, result),
                    },
                },
            });
        };
        // The same proof the three CLIs get, for whatever else is configured:
        // one real inference through it, backed off after a failure.
        // Every request is bounded, so a pass always ends and a check that cannot
        // be made settles as one that failed instead of staying "Checking…".
        const within = (ms: number) => AbortSignal.any([abort.signal, AbortSignal.timeout(ms)]);
        const customCheck = async () => {
            const config = await client
                .getConfig({ signal: within(providerDiscoveryTimeoutMs) })
                .catch(() => undefined);
            if (!current()) return;
            if (!config) {
                customPublish("error", snapshot.providerAuthentication.custom?.providers ?? []);
                return;
            }
            const configured = customProvidersFind(config);
            const providers = [...new Set(configured.map(({ type }) => providerKindLabel(type)))];
            if (configured.length === 0) {
                customVerificationRetryAt = 0;
                customVerificationConfig = undefined;
                customPublish("invalid", []);
                return;
            }
            if (snapshot.providerAuthentication.custom?.result === "valid") {
                customPublish("valid", providers);
                return;
            }
            // A changed configuration is a new answer to wait for, not the
            // failed one backing off: fixing a base URL is noticed on the next poll.
            const configuredNow = JSON.stringify(
                configured.map(({ id }) => [id, config.config.providers[id]]),
            );
            if (configuredNow !== customVerificationConfig) customVerificationRetryAt = 0;
            if (Date.now() < customVerificationRetryAt) {
                customPublish("error", providers);
                return;
            }
            customVerificationConfig = configuredNow;
            customVerificationRetryAt = Date.now() + providerVerificationRetryMs;
            const passed = await Promise.all(
                configured.map(({ id }) =>
                    client
                        .verifyProvider(
                            id,
                            { level: "inference" },
                            { signal: within(providerVerificationTimeoutMs) },
                        )
                        .then(
                            (result) =>
                                result.status === "passed" && result.performedLevel === "inference",
                            () => false,
                        ),
                ),
            );
            if (passed.includes(true)) customVerificationRetryAt = 0;
            customPublish(passed.includes(true) ? "valid" : "error", providers);
        };
        void client
            .scanProviders({ signal: within(providerDiscoveryTimeoutMs) })
            // A failed local scan says nothing about an earlier successful check.
            .catch(() => undefined)
            .then((scan) =>
                Promise.all([
                    customCheck(),
                    ...assistants.map(async (assistant) => {
                        if (!current()) return;
                        // A completed scan lists every provider this Happy Agent
                        // has. One it does not list cannot work here at all, which
                        // is an answer rather than a check that could not be made.
                        const credentials = scan
                            ? (scan.providers.find(
                                  (provider) => provider.providerId === assistant.id,
                              )?.credentials ?? "missing")
                            : undefined;
                        if (credentials === "missing") {
                            verificationRetryAt.delete(assistant.id);
                            resultPublish(assistant.id, "invalid");
                            return;
                        }
                        if (credentials !== "available") {
                            resultPublish(assistant.id, "error");
                            return;
                        }
                        if (
                            authenticationFor(snapshot.providerAuthentication, assistant.id) ===
                            "valid"
                        )
                            return;
                        if (Date.now() < (verificationRetryAt.get(assistant.id) ?? 0)) {
                            resultPublish(assistant.id, "error");
                            return;
                        }
                        // Back off failures; the two-second poll is only local discovery.
                        // A check abandoned because its screen went away is not a
                        // failure, so only an answered one starts the wait: one cut
                        // short by a sign-in landing must not read "Couldn't verify"
                        // for the next thirty seconds.
                        try {
                            const result = await client.verifyProvider(
                                assistant.id,
                                { level: "inference" },
                                { signal: within(providerVerificationTimeoutMs) },
                            );
                            const passed =
                                result.status === "passed" && result.performedLevel === "inference";
                            // The API's failed result includes outages and rate limits;
                            // it does not prove that the person needs to sign in.
                            if (passed) verificationRetryAt.delete(assistant.id);
                            else
                                verificationRetryAt.set(
                                    assistant.id,
                                    Date.now() + providerVerificationRetryMs,
                                );
                            if (!current()) return;
                            resultPublish(assistant.id, passed ? "valid" : "error");
                        } catch {
                            if (abort.signal.aborted) return;
                            verificationRetryAt.set(
                                assistant.id,
                                Date.now() + providerVerificationRetryMs,
                            );
                            if (!current()) return;
                            resultPublish(assistant.id, "error");
                        }
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

    function providerAuthenticationSynchronize() {
        const live = providerAuthenticationLive();
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
        happyMobilePlatformSelect(platform) {
            happyMobileStore?.happyMobilePlatformSelect(platform);
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
            return {
                assistants: assistantsProject(
                    onboarding.assistants,
                    snapshot.providerAuthentication,
                    providersRefused(snapshot),
                ),
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

/** The shell's answer about the three assistants, as the screen takes it. */
function assistantsProject(
    assistants: readonly LocalAssistantState[] | undefined,
    authentication: ProviderAuthenticationSnapshot,
    refused: boolean,
): readonly LocalOnboardingAssistant[] {
    return (assistants ?? []).map((assistant) => {
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
        const unavailable =
            assistant.status === "missing" && result !== "valid" && result !== "checking";
        return {
            authentication: unavailable ? "unavailable" : result,
            ...(assistant.command ? { command: assistant.command } : {}),
            id: assistant.id,
            status: assistant.status,
        };
    });
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
    }[],
    previous: ProviderAuthenticationSnapshot,
    complete: boolean,
): ProviderAuthenticationSnapshot {
    let claude = previous.claude;
    let codex = previous.codex;
    let grok = previous.grok;
    for (const result of results) {
        switch (result.id) {
            case "claude":
                claude = authenticationResultProject(previous.claude, result.result);
                break;
            case "codex":
                codex = authenticationResultProject(previous.codex, result.result);
                break;
            case "grok":
                grok = authenticationResultProject(previous.grok, result.result);
                break;
        }
    }
    return {
        ...(claude ? { claude } : {}),
        ...(codex ? { codex } : {}),
        complete,
        ...(previous.custom ? { custom: previous.custom } : {}),
        ...(grok ? { grok } : {}),
        key,
    };
}

/**
 * Model access configured some other way than the three CLIs' own sign-ins:
 * every enabled provider with models that is not `claude`, `codex`, or `grok`.
 * Pools are left out because their members are providers of their own.
 */
function customProvidersFind(
    config: Awaited<ReturnType<HappyAgentClient["getConfig"]>>,
): readonly { readonly id: string; readonly type: string }[] {
    return Object.entries(config.config.providers).flatMap(([id, provider]) =>
        !LOCAL_PROVIDER_IDS.has(id) &&
        provider.type !== "smart" &&
        provider.enabled &&
        provider.models.some((model) => model.enabled)
            ? [{ id, type: provider.type }]
            : [],
    );
}

const LOCAL_PROVIDER_IDS: ReadonlySet<string> = new Set(["claude", "codex", "grok"]);

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
    return { authentication: custom.result, providers: custom.providers };
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
