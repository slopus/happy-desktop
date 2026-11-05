import { HappyAgentApiError } from "@slopus/happy-agent-client";
import {
    analyticsBucket,
    analyticsClientCreate,
    analyticsErrorCodeOfStatus,
    analyticsErrorThrottleCreate,
    analyticsFailureKind,
    analyticsHostLoopback,
    analyticsModel,
    analyticsOutageTrackerCreate,
    analyticsSeenCreate,
    analyticsOsVersion,
    analyticsProviderKind,
    type AnalyticsAssistantStatus,
    type AnalyticsClient,
    type AnalyticsCommonProperties,
    type AnalyticsDesktopOs,
    type AnalyticsErrorArea,
    type AnalyticsErrorCode,
    type AnalyticsEventName,
    type AnalyticsEvents,
    type AnalyticsFailureAction,
    type AnalyticsFlag,
    type AnalyticsMemory,
    type AnalyticsMobilePairingMethod,
    type AnalyticsMobilePairingSurface,
    type AnalyticsModelProperties,
    type AnalyticsOutcome,
    type AnalyticsSeen,
    type AnalyticsSetupDownloadFailure,
    type AnalyticsSetupErrorCode,
    type AnalyticsTransferPercentBucket,
    type AnalyticsTrackOptions,
} from "happy-desktop-analytics";
import {
    entryKey,
    usageAnalyticsStoreCreate,
    type ConversationEntry,
    type ConversationFailure,
    type HappyAgentActionResult,
    type HappyAgentActivity,
    type HappyAgentActivityModel,
    type HappyAgentIntegrationSnapshot,
    type HappyAgentIntegrationStore,
    type HappyAgentMobileConnectorSnapshot,
    type HappyAgentMobileConnectorStore,
    type HappyAgentModelStore,
    type HappyAgentTraceViewer,
    type HappyAgentWorkspaceSnapshot,
    type HappyAgentWorkspaceStore,
    type HappyDesktopMobileStep,
    type HappyMobileOnboardingSnapshot,
    type HappyMobileOnboardingStore,
    type MobilePairingMethodOutput,
    type MobilePairingMethodStore,
    type UsageAnalyticsDocument,
    type UsageAnalyticsPersistence,
    type UsageAnalyticsStore,
    type WelcomeStore,
} from "happy-desktop-state";
import {
    localOnboardingStage,
    type LocalOnboardingAssistant,
    type LocalOnboardingCommandCopy,
    type LocalOnboardingView,
    type OnboardingStage,
} from "happy-desktop-ui";
import {
    localOnboardingView,
    type LocalOnboardingStore,
    type LocalOnboardingViewSnapshot,
} from "./localOnboardingStore";
import { LOCAL_HAPPY_AGENT_ID, type HappyAgentDirectoryStore } from "./happyAgentDirectoryStore";
import type { DesktopSystem } from "../shared/desktopContract";
import type { AppHappyAgentUpdateStore } from "happy-desktop-app";
import type { DesktopAgentBrokenStore } from "./desktopAgentBroken";
import { localWebBuild } from "./localWebBuild";

declare const __HAPPY_RENDERER_VERSION__: string;
declare const __HAPPY_POSTHOG_API_KEY__: string | null;
declare const __HAPPY_POSTHOG_HOST__: string | null;

const INSTALL_ID_KEY = "happy.analytics.install-id.v1";
const LAUNCH_COUNT_KEY = "happy.analytics.launch-count.v1";
const USAGE_ANALYTICS_KEY = "happy.usage-analytics.v1";
const ERROR_THROTTLE_KEY = "happy.analytics.error-shown.v1";
const FAILURES_SEEN_KEY = "happy.analytics.failures-seen.v1";
/** How long `app_opened` waits for the Happy Agent's version before going without it. */
const APP_OPENED_VERSION_WAIT_MS = 10_000;

export interface DesktopAnalytics {
    /** The Settings switch, shared with the settings screen. */
    readonly preference: UsageAnalyticsStore;
    /**
     * Counts this renderer start and reports it once, as soon as the active
     * Happy Agent's version is known or after a short wait without it.
     */
    appOpened(): void;
    /** What one Happy Agent's workspace reported doing. */
    activity(happyAgentId: string, activity: HappyAgentActivity): void;
    /**
     * Wraps first-run setup so its steps are observed exactly while the setup
     * screen itself is subscribed. Observing on its own would subscribe the
     * store, and subscribing it is what starts setup's machine work.
     */
    onboardingObserve(store: LocalOnboardingStore, welcome: WelcomeStore): LocalOnboardingStore;
    /** Observes one Happy Agent's phone pairing pages, reported on that Happy Agent. */
    mobilePairingObserve(
        happyAgentId: string,
        methods: MobilePairingMethods,
    ): HappyAgentMobilePairingObserve;
    /** The person picked a pairing method. */
    mobilePairingMethodSelected(output: MobilePairingMethodOutput): void;
    /**
     * Wraps the full-window recovery screen's store so its showing and its
     * Restart count toward the outage they belong to, exactly while it is shown.
     */
    agentBrokenObserve(store: DesktopAgentBrokenStore): DesktopAgentBrokenStore;
    /** Wraps the Happy Agent update card's store so a failed update it shows is counted. */
    agentUpdateObserve(store: AppHappyAgentUpdateStore): AppHappyAgentUpdateStore;
    /** Follows one PostHog feature flag; silent while analytics is off or unavailable. */
    flagFollow(flag: AnalyticsFlag, listener: (enabled: boolean) => void): () => void;
    /** Stops following the directory and the window's closing. */
    dispose(): void;
}

function storageRead(key: string): string | undefined {
    try {
        return localStorage.getItem(key) ?? undefined;
    } catch {
        return undefined;
    }
}

function storageWrite(key: string, value: string): void {
    try {
        localStorage.setItem(key, value);
    } catch {
        // A storage-denied window still reports for as long as it is open.
    }
}

/** A random identity for this installation, made once and kept by this window's storage. */
function installId(): string {
    const stored = storageRead(INSTALL_ID_KEY);
    if (stored) return stored;
    const created = crypto.randomUUID();
    storageWrite(INSTALL_ID_KEY, created);
    return created;
}

function memoryOf(key: string): AnalyticsMemory {
    return { read: () => storageRead(key), write: (value) => storageWrite(key, value) };
}

/** On screen and holding the keyboard; a window with no document is neither. */
function windowFocused(): boolean {
    return (
        typeof document !== "undefined" &&
        document.visibilityState === "visible" &&
        document.hasFocus()
    );
}

function windowVisible(): boolean {
    return typeof document !== "undefined" && document.visibilityState === "visible";
}

const FAILURE_ACTIONS = {
    retry: "retry",
    switch: "switch_model",
    newChat: "new_chat",
    assistance: "ask_chief",
} as const satisfies Record<string, AnalyticsFailureAction>;

function usageAnalyticsPersistence(): UsageAnalyticsPersistence {
    return {
        read() {
            const value = storageRead(USAGE_ANALYTICS_KEY);
            return value ? (JSON.parse(value) as UsageAnalyticsDocument) : undefined;
        },
        write(document) {
            storageWrite(USAGE_ANALYTICS_KEY, JSON.stringify(document));
        },
    };
}

/**
 * The operating system this window runs on. The browser is not ours and gives
 * no typed answer, so this boundary reads its platform string once. Electron
 * ships for these three only, and the rest of its builds are Linux ones.
 */
function desktopOs(): AnalyticsDesktopOs {
    const platform = (
        (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
            ?.platform ?? navigator.platform
    ).toLowerCase();
    if (platform.startsWith("mac")) return "mac";
    if (platform.startsWith("win")) return "win";
    return "linux";
}

function outcomeOf(result: HappyAgentActionResult): AnalyticsOutcome {
    return result.ok ? { result: "ok" } : { result: "failed", error_code: result.failure };
}

function stepOf(
    stage: OnboardingStage,
): AnalyticsEvents["onboarding_step_viewed"]["step"] | undefined {
    switch (stage) {
        case "setup":
        case "subscriptions":
            return stage;
        // The analytics plan's step list has no sandbox step, so it is not sent.
        case "sandbox":
            return undefined;
        case "get-app":
            return "get_app";
        case "connect-phone":
            return "connect_phone";
    }
}

function assistantStatus(
    authentication: LocalOnboardingAssistant["authentication"],
): AnalyticsAssistantStatus | undefined {
    switch (authentication) {
        case "valid":
            return "signed_in";
        case "invalid":
            return "not_signed_in";
        case "unavailable":
            return "not_installed";
        case "error":
            return "check_failed";
        case "checking":
            return undefined;
    }
}

/**
 * Which step of Setup is failing right now, read from what each step reports:
 * the stage the shell says setup is at, the download controller's error for
 * the work it is doing, and which of this window's own requests failed. Never
 * the message any of them gave.
 */
export function setupFailureOf(
    snapshot: LocalOnboardingViewSnapshot,
    /** The local Happy Agent answered with a protocol this window cannot use. */
    protocolMismatch = false,
): AnalyticsSetupErrorCode | undefined {
    const failure = snapshot.failure?.cause;
    if (failure === "stateRead") return "state_unreadable";
    switch (snapshot.onboarding?.stage) {
        case "nodeMissing":
            return "node_missing";
        case "connectFailed": {
            // An older shell sends no code, and its failure stays a failed connection.
            const runtime = snapshot.runtime;
            return runtime?.phase === "error" && runtime.code === "start_timeout"
                ? "start_timeout"
                : "connect_failed";
        }
        case "daemonDownload":
        case "daemonStarting": {
            if (
                snapshot.daemon?.error !== undefined &&
                snapshot.daemon.errorCode === "start_timeout"
            )
                return "start_timeout";
            if (failure === "download") return "download_failed";
            if (failure === "start") return "start_failed";
            // The controller's error belongs to the work it is doing: fetching
            // until a verified release is ready here, starting it after.
            if (!snapshot.daemon?.error) return undefined;
            return snapshot.daemon.readyVersion === undefined ? "download_failed" : "start_failed";
        }
        default:
            return protocolMismatch ? "version_mismatch" : undefined;
    }
}

/**
 * Where the download behind a `download_failed` stopped, from the code the
 * shell gave its error. Absent when the shell gave none, as older shells do.
 */
export function setupDownloadFailureOf(
    snapshot: LocalOnboardingViewSnapshot,
): AnalyticsSetupDownloadFailure | undefined {
    const daemon = snapshot.daemon;
    if (
        daemon?.error === undefined ||
        daemon.errorCode === undefined ||
        daemon.errorCode === "start_timeout" ||
        daemon.errorCode === "data_newer"
    )
        return undefined;
    const progress = daemon.downloadFailure;
    return {
        error_detail: daemon.errorCode,
        attempt_count: progress?.attempts ?? 0,
        transfer_percent_bucket: transferPercentBucket(
            progress?.receivedBytes ?? 0,
            progress?.totalBytes ?? 0,
        ),
    };
}

function transferPercentBucket(
    receivedBytes: number,
    totalBytes: number,
): AnalyticsTransferPercentBucket {
    if (receivedBytes <= 0 || totalBytes <= 0) return "none";
    if (receivedBytes >= totalBytes) return "complete";
    return receivedBytes * 2 < totalBytes ? "under_half" : "over_half";
}

/** The Setup step as the step bar draws it, and not a finished Setup being looked at again. */
function setupLive(snapshot: LocalOnboardingViewSnapshot, view: LocalOnboardingView): boolean {
    return (
        localOnboardingStage(view) === "setup" &&
        view.kind !== "agent-ready" &&
        snapshot.onboarding?.reachedStage === undefined
    );
}

function commandKindOf(
    kind: LocalOnboardingCommandCopy["kind"],
): AnalyticsEvents["onboarding_command_copied"]["kind"] {
    switch (kind) {
        case "install":
            return "install";
        case "sign-in":
            return "sign_in";
        case "agent-prompt":
            return "agent_prompt";
    }
}

/** The pairing events, each carrying only methods and pages: never a code, address, emoji, or name. */
type MobilePairingEventName =
    | "mobile_pairing_options_shown"
    | "mobile_pairing_option_selected"
    | "mobile_pairing_completed"
    | "mobile_pairing_failed"
    | "mobile_pairing_cancelled";

/** The method a pairing page shows. */
export type MobilePairingMethods = Pick<MobilePairingMethodStore, "get" | "subscribe">;

export type MobilePairingReport = <E extends MobilePairingEventName>(
    event: E,
    properties: AnalyticsEvents[E],
) => void;

/**
 * Wraps one Happy Agent's phone pairing stores so their pairings are observed
 * exactly while a pairing page is subscribed to them. Observing on its own
 * would subscribe them, and subscribing is what starts their pairing work.
 */
export interface HappyAgentMobilePairingObserve {
    /** The direct connector, shared by onboarding and Settings. */
    connector(store: HappyAgentMobileConnectorStore): HappyAgentMobileConnectorStore;
    /** First-run onboarding's relay pairing. */
    onboarding(store: HappyMobileOnboardingStore): HappyMobileOnboardingStore;
    /** Settings → Mobile Access's relay pairing. */
    integration(store: HappyAgentIntegrationStore): HappyAgentIntegrationStore;
}

/** What a pairing page shows: whether its methods are on screen, and how far its relay code got. */
interface RelayPage {
    readonly shown: boolean;
    readonly phase: "idle" | "waiting" | "completed" | "failed";
}

const RELAY_CLOSED: RelayPage = { shown: false, phase: "idle" };

function relayPageOfStep(step: HappyDesktopMobileStep): RelayPage {
    switch (step.kind) {
        case "intro":
            return RELAY_CLOSED;
        case "link":
            return {
                shown: true,
                phase:
                    step.phase.kind === "pairing"
                        ? "waiting"
                        : step.phase.kind === "failed"
                          ? "failed"
                          : "idle",
            };
        case "connected":
            return { shown: false, phase: "completed" };
    }
}

/** Onboarding's mobile step, local and guided or remote and in place. */
function relayPageOfOnboarding(snapshot: HappyMobileOnboardingSnapshot): RelayPage {
    switch (snapshot.status) {
        case "desktop":
            return relayPageOfStep(snapshot.step);
        case "pairing":
            return { shown: true, phase: "waiting" };
        // A pending failure is a new code on its way.
        case "failed":
            return { shown: true, phase: snapshot.pending ? "idle" : "failed" };
        case "configured":
            return { shown: false, phase: "completed" };
        default:
            return RELAY_CLOSED;
    }
}

/** Mobile Access: the local desktop's guided setup, or a remote Happy Agent's pairing card. */
function relayPageOfIntegration(snapshot: HappyAgentIntegrationSnapshot): RelayPage {
    if (snapshot.setup) return relayPageOfStep(snapshot.setup);
    if (!snapshot.pairingOpen) return RELAY_CLOSED;
    // As the card's relay slot reads it: a refused start, or a pairing that
    // stopped or was cancelled, unless a new code is already on its way.
    if (snapshot.pairingError) return { shown: true, phase: "failed" };
    if (snapshot.configured === true) return { shown: true, phase: "completed" };
    switch (snapshot.status) {
        case "pairing":
            return { shown: true, phase: snapshot.pairing ? "waiting" : "idle" };
        case "failed":
        case "disconnected":
            return { shown: true, phase: snapshot.pairingStarting ? "idle" : "failed" };
        default:
            return { shown: true, phase: "idle" };
    }
}

/**
 * One pairing page's relay: reports the page showing its choice, and how a
 * relay code shown on it ended. A code kept behind Direct is not the person's
 * attempt, so it neither fails nor completes for them; choosing Direct while
 * one is on screen leaves it.
 */
function relayFollow(
    surface: AnalyticsMobilePairingSurface,
    method: () => AnalyticsMobilePairingMethod,
    report: MobilePairingReport,
): (page: RelayPage) => void {
    let current = RELAY_CLOSED;
    /** A relay code was on screen since the page showed or the last outcome. */
    let attempted = false;
    let failureQueued = false;
    return (page) => {
        const previous = current;
        current = page;
        if (page.shown && !previous.shown) {
            attempted = false;
            report("mobile_pairing_options_shown", {
                options: "relay_direct",
                default_method: method(),
                surface,
            });
        }
        if (!previous.shown && !page.shown) return;
        if (method() !== "relay") {
            if (attempted) report("mobile_pairing_cancelled", { method: "relay" });
            attempted = false;
            return;
        }
        if (page.phase === "waiting") attempted = true;
        if (page.phase === "completed" && previous.phase !== "completed") {
            if (attempted) report("mobile_pairing_completed", { method: "relay" });
            attempted = false;
            return;
        }
        if (page.phase === "failed" && previous.phase !== "failed") {
            // A store passes through a failure on its way to a new code, as an
            // unused code expires or a page opens on a stopped integration;
            // only a failure still standing once that call is done is one.
            if (!failureQueued) {
                failureQueued = true;
                queueMicrotask(() => {
                    failureQueued = false;
                    if (!current.shown || current.phase !== "failed" || method() !== "relay")
                        return;
                    // A relay pairing says only that it stopped, never why.
                    report("mobile_pairing_failed", { method: "relay", error_code: "unknown" });
                    attempted = false;
                });
            }
            return;
        }
        if (!page.shown && attempted) {
            report("mobile_pairing_cancelled", { method: "relay" });
            attempted = false;
        }
    };
}

/**
 * The direct connector: how each pairing seen in progress on an open page
 * ended, and an open page that could not get a code at all. One that expires
 * before a phone connects is replaced by a new code, not ended.
 */
function directFollow(
    report: MobilePairingReport,
): (snapshot: HappyAgentMobileConnectorSnapshot) => void {
    const inProgress = new Set<string>();
    let noCode = false;
    return (snapshot) => {
        const read = snapshot.connector;
        const pairing = read.kind === "ready" ? read.connector.pairing : null;
        const failing =
            snapshot.pairingOpen &&
            pairing === null &&
            (read.kind === "read-failed" ||
                (read.kind === "ready" && read.connector.status === "failed") ||
                snapshot.actionError !== undefined);
        if (failing && !noCode)
            report("mobile_pairing_failed", { method: "direct", error_code: "unavailable" });
        noCode = failing;
        if (!pairing) return;
        if (pairing.status === "waiting" || pairing.status === "verifying") {
            if (snapshot.pairingOpen) inProgress.add(pairing.id);
            // The page closed, or the person chose Relay: the pairing is cancelled.
            else if (inProgress.delete(pairing.id))
                report("mobile_pairing_cancelled", { method: "direct" });
            return;
        }
        if (!inProgress.has(pairing.id)) return;
        // An unused code expiring is replaced; one a phone was checking timed out.
        if (pairing.status === "expired" && pairing.device === null) {
            inProgress.delete(pairing.id);
            return;
        }
        inProgress.delete(pairing.id);
        switch (pairing.status) {
            case "completed":
                report("mobile_pairing_completed", { method: "direct" });
                return;
            case "rejected":
            case "expired":
                report("mobile_pairing_failed", { method: "direct", error_code: pairing.status });
                return;
            case "failed":
                report("mobile_pairing_failed", { method: "direct", error_code: "unknown" });
                return;
            case "cancelled":
                report("mobile_pairing_cancelled", { method: "direct" });
                return;
        }
    };
}

/**
 * The store, with every snapshot its subscribers see observed, again whenever
 * the chosen method changes, and once more as the last of them leaves, which
 * closes the page: `open` is false then.
 */
function observed<S extends { get(): unknown; subscribe(listener: () => void): () => void }>(
    store: S,
    methods: MobilePairingMethods,
    observe: (snapshot: ReturnType<S["get"]>, open: boolean) => void,
): S {
    const read = () => store.get() as ReturnType<S["get"]>;
    let subscribers = 0;
    let methodUnsubscribe: (() => void) | undefined;
    return {
        ...store,
        subscribe(listener: () => void) {
            subscribers += 1;
            const unsubscribe = store.subscribe(() => {
                observe(read(), true);
                listener();
            });
            methodUnsubscribe ??= methods.subscribe(() => observe(read(), true));
            observe(read(), true);
            let released = false;
            return () => {
                if (released) return;
                released = true;
                unsubscribe();
                subscribers -= 1;
                if (subscribers > 0) return;
                methodUnsubscribe?.();
                methodUnsubscribe = undefined;
                observe(read(), false);
            };
        },
    };
}

/** The pairing observers for one Happy Agent, with the method each page shows. */
export function mobilePairingObserveCreate(
    methods: MobilePairingMethods,
    report: MobilePairingReport,
): HappyAgentMobilePairingObserve {
    const method = (): AnalyticsMobilePairingMethod => methods.get().method;
    return {
        connector: (store) => observed(store, methods, directFollow(report)),
        onboarding: (store) => {
            const follow = relayFollow("onboarding", method, report);
            return observed(store, methods, (snapshot, open) =>
                follow(open ? relayPageOfOnboarding(snapshot) : RELAY_CLOSED),
            );
        },
        integration: (store) => {
            const follow = relayFollow("mobile_access", method, report);
            return observed(store, methods, (snapshot, open) =>
                follow(open ? relayPageOfIntegration(snapshot) : RELAY_CLOSED),
            );
        },
    };
}

/** The person picked a method on a pairing page's Relay | Direct choice. */
function mobilePairingMethodReport(
    output: MobilePairingMethodOutput,
    report: MobilePairingReport,
): void {
    report("mobile_pairing_option_selected", {
        from: output.from,
        to: output.to,
        surface: output.surface,
    });
}

/** A failure older than this was not just met; opening an old conversation is not news. */
const FAILURE_FRESH_MS = 5 * 60_000;

/**
 * What kind of error a person was shown, from its cause chain: a Happy Agent
 * refusal by its HTTP status, a request that never arrived as `offline`.
 */
function errorCodeOf(error: unknown): AnalyticsErrorCode {
    for (let current = error; current instanceof Error; current = current.cause) {
        if (current instanceof HappyAgentApiError) return analyticsErrorCodeOfStatus(current.status);
        if (current instanceof TypeError) return "offline";
        if (current.name === "TimeoutError") return "timeout";
    }
    return "unknown";
}

function providerTypeOf(failure: ConversationFailure | undefined): string | undefined {
    return failure !== undefined && "provider" in failure ? failure.provider.type : undefined;
}

/**
 * A failure card the transcript draws: a terminal failure row with a time,
 * typed or not. A row that is the agent retrying by itself is not one.
 */
function failureRowOf(entry: ConversationEntry) {
    if (entry.kind !== "notice" || entry.variant !== "notice") return undefined;
    if (entry.occurredAt === undefined || entry.retry !== undefined) return undefined;
    if (entry.failure === undefined && entry.level !== "error") return undefined;
    return { id: entry.id, occurredAt: entry.occurredAt, failure: entry.failure };
}

interface ConversationObserveDeps {
    readonly workspace: HappyAgentWorkspaceStore;
    readonly models: HappyAgentModelStore;
    /** Failures already counted on this device. */
    readonly seen: AnalyticsSeen;
    /** Analytics is on and the window is on screen with the keyboard. */
    readonly foreground: () => boolean;
    /** The entries the conversation's main view last said it has on screen. */
    readonly entriesOnScreen: (conversationId: string) => ReadonlySet<string> | undefined;
    readonly chatFailureShown: (properties: AnalyticsEvents["chat_failure_shown"]) => void;
    readonly errorShown: (area: AnalyticsErrorArea, code: AnalyticsErrorCode) => void;
}

/**
 * Reads one Happy Agent's workspace for errors the person is looking at: a
 * fresh failure card or a message that could not be sent among the rows on
 * screen, a conversation that could not load while it is the main view, and
 * the file or diff tab on screen that could not be read. Each counts once it
 * is first on screen in a foreground window, and again only after it stopped
 * failing, however often the workspace notifies.
 */
function conversationObserve(deps: ConversationObserveDeps): () => void {
    let loadCounted: string | undefined;
    let filesCounted = new Set<string>();
    let rowsConversation: string | undefined;
    let sendsCounted = new Set<string>();
    const poolOf = (snapshot: HappyAgentWorkspaceSnapshot): boolean => {
        const conversation = snapshot.conversation;
        if (conversation.type !== "ready" || conversation.value.session.type !== "ready")
            return false;
        const providerId = conversation.value.session.value.providerId;
        const models = deps.models.get();
        return (
            models.type === "ready" &&
            (models.catalog.providers.find((provider) => provider.id === providerId)?.poolMembers
                ?.length ?? 0) > 0
        );
    };
    const targetOf = (snapshot: HappyAgentWorkspaceSnapshot, conversationId: string) => {
        const bot = snapshot.list.bots.find((entry) => entry.conversation.id === conversationId);
        if (!bot) return "session" as const;
        return bot.systemKey === "chief_of_staff" ? ("chief_of_staff" as const) : ("bot" as const);
    };
    return () => {
        const snapshot = deps.workspace.get();
        const foreground = deps.foreground();
        const filesFailing = new Set<string>();
        for (const tab of snapshot.fileTabs) {
            if (tab.document.type !== "error") continue;
            const key = `${tab.id}:${tab.presentationId}`;
            if (filesCounted.has(key)) {
                filesFailing.add(key);
                continue;
            }
            // The tab the main content is showing, not one waiting in the strip.
            if (!foreground || tab.placement !== "main" || tab.id !== snapshot.activeMainViewId)
                continue;
            filesFailing.add(key);
            deps.errorShown(
                tab.kind === "diff" ? "diff_load" : "file_load",
                errorCodeOf(tab.document.error),
            );
        }
        filesCounted = filesFailing;
        const conversation = snapshot.conversation;
        if (conversation.type === "error") {
            const key = snapshot.address.conversationId ?? "";
            if (loadCounted !== key && foreground && snapshot.activeMainViewId === undefined) {
                loadCounted = key;
                deps.errorShown("conversation_load", errorCodeOf(conversation.error));
            }
        } else loadCounted = undefined;
        if (conversation.type !== "ready") return;
        const conversationId = conversation.value.conversationId;
        if (rowsConversation !== conversationId) {
            rowsConversation = conversationId;
            sendsCounted = new Set();
        }
        // Rows count once they are on screen: the conversation shows rather
        // than a file, in a window the person is looking at.
        const onScreen = deps.entriesOnScreen(conversationId);
        if (!onScreen || !foreground || snapshot.displayedMainViewId !== undefined) return;
        const entries = conversation.value.entries;
        const now = Date.now();
        // The rows on screen are a few, and most often the newest.
        let found = 0;
        for (let index = entries.length - 1; index >= 0 && found < onScreen.size; index -= 1) {
            const entry = entries[index]!;
            const key = entryKey(entry);
            if (!onScreen.has(key)) continue;
            found += 1;
            if (entry.kind === "message") {
                if (entry.delivery !== "failed") sendsCounted.delete(key);
                else if (!sendsCounted.has(key)) {
                    sendsCounted.add(key);
                    deps.errorShown("message_send", errorCodeOf(entry.error));
                }
                continue;
            }
            const row = failureRowOf(entry);
            if (!row || now - row.occurredAt > FAILURE_FRESH_MS) continue;
            if (!deps.seen.first(row.id)) continue;
            const kind = analyticsFailureKind(row.failure?.kind);
            deps.chatFailureShown({
                kind,
                provider_kind: analyticsProviderKind(providerTypeOf(row.failure)),
                target: targetOf(snapshot, conversationId),
                session_client: "happy_agent",
                is_pool: kind === "no_account_available" || poolOf(snapshot),
            });
        }
    };
}

/**
 * The desktop's analytics: one client for the window, the common fields read
 * from the Happy Agent each event happened on, and the observers that turn
 * product state into catalog events. Development windows send nothing.
 */
export function desktopAnalyticsCreate(options: {
    readonly development: boolean;
    readonly happyAgents: HappyAgentDirectoryStore;
    /** What the shell says about this machine; absent from older shells. */
    readonly system?: DesktopSystem;
    /** Replaces the PostHog client, for tests. */
    readonly client?: AnalyticsClient;
}): DesktopAnalytics {
    const preference = usageAnalyticsStoreCreate(usageAnalyticsPersistence());
    const installation = installId();
    const client: AnalyticsClient =
        options.client ??
        analyticsClientCreate({
            // Development windows send nothing, except to a capture endpoint
            // on this machine.
            apiKey:
                options.development &&
                (__HAPPY_POSTHOG_HOST__ === null || !analyticsHostLoopback(__HAPPY_POSTHOG_HOST__))
                    ? undefined
                    : (__HAPPY_POSTHOG_API_KEY__ ?? undefined),
            ...(__HAPPY_POSTHOG_HOST__ === null ? {} : { host: __HAPPY_POSTHOG_HOST__ }),
            distinctId: installation,
            enabled: () => preference.get().usageAnalyticsEnabled,
        });
    const os = desktopOs();

    /**
     * The fields every event carries, for the Happy Agent it happened on.
     * Happy Agent does not report its operating system yet, so a remote one
     * is unknown rather than guessed; the local one is this machine.
     */
    const common = (happyAgentId: string): AnalyticsCommonProperties => {
        const entry = options.happyAgents
            .get()
            .happyAgents.find((item) => item.id === happyAgentId);
        const local = happyAgentId === LOCAL_HAPPY_AGENT_ID;
        return {
            client: "desktop",
            device_class: "desktop",
            app_version: __HAPPY_RENDERER_VERSION__,
            flavor: localWebBuild ? "nightly" : "standard",
            os,
            os_version: analyticsOsVersion(options.system?.osVersion),
            arch: options.system?.arch ?? null,
            agent_os: local ? os : null,
            agent_location: entry ? (local ? "local" : "remote") : null,
            happy_agent_version: entry?.version ?? null,
        };
    };
    const track = <E extends AnalyticsEventName>(
        happyAgentId: string,
        event: E,
        properties: AnalyticsEvents[E],
        trackOptions?: AnalyticsTrackOptions,
    ): void => client.track(event, { ...common(happyAgentId), ...properties }, trackOptions);

    // What must still be said when the window goes away, each sent at once by
    // beacon because nothing queued after this moment would leave.
    const closers = new Set<() => void>();
    const closing = (): void => {
        for (const closer of closers) closer();
    };
    window.addEventListener("pagehide", closing);

    const modelOf = (model: HappyAgentActivityModel): AnalyticsModelProperties => ({
        model: analyticsModel(model.modelId),
        model_provider_kind: analyticsProviderKind(model.providerType),
        effort: model.effort ?? null,
    });

    const errorThrottle = analyticsErrorThrottleCreate(memoryOf(ERROR_THROTTLE_KEY));
    const failuresSeen = analyticsSeenCreate(memoryOf(FAILURES_SEEN_KEY));
    const errorShown = (
        happyAgentId: string,
        area: AnalyticsErrorArea,
        code: AnalyticsErrorCode,
    ): void => {
        // Nothing is remembered for a window that does not report.
        if (!preference.get().usageAnalyticsEnabled) return;
        const repeatCount = errorThrottle.occurred(area, code, Date.now());
        if (repeatCount !== undefined)
            track(happyAgentId, "error_shown", { area, code, repeat_count: repeatCount });
    };

    const outages = analyticsOutageTrackerCreate();
    const activeId = (): string =>
        options.happyAgents.get().activeHappyAgentId ?? LOCAL_HAPPY_AGENT_ID;
    /** The Happy Agent an open outage is on, so its end is reported there. */
    let outageAgent = LOCAL_HAPPY_AGENT_ID;
    const connectionCheck = (): void => {
        const id = activeId();
        const entry = options.happyAgents.get().happyAgents.find((item) => item.id === id);
        const ended = outages.observe(
            {
                agentId: entry?.id,
                transport: id === LOCAL_HAPPY_AGENT_ID ? "local" : "remote",
                down:
                    entry === undefined || entry.status === "connected"
                        ? undefined
                        : entry.protocolMismatch !== undefined
                          ? "version_mismatch"
                          : entry.signIn !== undefined
                            ? "auth_expired"
                            : entry.status === "disconnected"
                              ? "unreachable"
                              : "unknown",
                visible: windowVisible(),
            },
            Date.now(),
        );
        if (ended) track(outageAgent, "agent_connection_lost", ended);
        outageAgent = id;
    };
    const outageClose = (): void => {
        const ended = outages.close(Date.now());
        if (ended) track(outageAgent, "agent_connection_lost", ended, { beacon: true });
    };
    closers.add(outageClose);

    /** The rows the open conversation's main view last had on screen, and where. */
    let onScreen:
        | {
              readonly happyAgentId: string;
              readonly conversationId: string;
              readonly viewer: HappyAgentTraceViewer;
              readonly entryIds: ReadonlySet<string>;
          }
        | undefined;
    // The conversation the person is looking at: the active Happy Agent's open one.
    let followed:
        | { readonly workspace: unknown; readonly check: () => void; readonly stop: () => void }
        | undefined;
    const conversationFollow = (): void => {
        const id = activeId();
        const session = options.happyAgents
            .get()
            .happyAgents.find((item) => item.id === id)?.session;
        if (followed?.workspace !== session?.workspace) {
            followed?.stop();
            followed = undefined;
            if (session) {
                const check = conversationObserve({
                    workspace: session.workspace,
                    models: session.models,
                    seen: failuresSeen,
                    // Nothing is remembered for a window that does not report.
                    foreground: () => preference.get().usageAnalyticsEnabled && windowFocused(),
                    // Rows reported by a list that has since unmounted, or is
                    // hidden behind another surface such as Settings, are not
                    // on screen; a list shown again still has them.
                    entriesOnScreen: (conversationId) =>
                        onScreen?.happyAgentId === id &&
                        onScreen.conversationId === conversationId &&
                        onScreen.viewer.live()
                            ? onScreen.entryIds
                            : undefined,
                    chatFailureShown: (properties) => track(id, "chat_failure_shown", properties),
                    errorShown: (area, code) => errorShown(id, area, code),
                });
                followed = {
                    workspace: session.workspace,
                    check,
                    stop: session.workspace.subscribe(check),
                };
            }
        }
        followed?.check();
    };
    const directoryChanged = (): void => {
        connectionCheck();
        conversationFollow();
    };
    const directoryUnsubscribe = options.happyAgents.subscribe(directoryChanged);
    /** What else counts an error once the window comes to the front. */
    const foregroundChecks = new Set<() => void>();
    const windowChanged = (): void => {
        directoryChanged();
        for (const check of foregroundChecks) check();
    };
    if (typeof document !== "undefined")
        document.addEventListener("visibilitychange", windowChanged);
    window.addEventListener("focus", windowChanged);
    directoryChanged();

    let appOpenedCancel = (): void => undefined;
    /** Whether the local Happy Agent's protocol is one this window cannot use. */
    const localProtocolMismatch = (): boolean =>
        options.happyAgents.get().happyAgents.find((item) => item.id === LOCAL_HAPPY_AGENT_ID)
            ?.protocolMismatch !== undefined;

    const pairingReport =
        (happyAgentId: string): MobilePairingReport =>
        (event, properties) =>
            track(happyAgentId, event, properties);

    return {
        preference,
        agentBrokenObserve(store) {
            return {
                ...store,
                subscribe(listener) {
                    return store.subscribe(() => {
                        if (store.get().visible) outages.recoveryScreenShown();
                        listener();
                    });
                },
                restart() {
                    outages.restartRequested();
                    store.restart();
                },
            };
        },
        agentUpdateObserve(store) {
            /** The failure on the card was counted; cleared once the card stops failing. */
            let counted = false;
            const check = (): void => {
                const snapshot = store.get();
                const progress = snapshot?.progress;
                if (progress?.kind !== "failed" || snapshot?.revealed !== true) {
                    counted = false;
                    return;
                }
                if (counted || !windowFocused()) return;
                counted = true;
                // A restart that never came back is the one failure with a cause of its own.
                errorShown(
                    LOCAL_HAPPY_AGENT_ID,
                    "update",
                    progress.failedAt === "reconnecting" ? "timeout" : "unknown",
                );
            };
            let subscribers = 0;
            return {
                ...store,
                subscribe(listener) {
                    subscribers += 1;
                    foregroundChecks.add(check);
                    const unsubscribe = store.subscribe(() => {
                        check();
                        listener();
                    });
                    let released = false;
                    return () => {
                        if (released) return;
                        released = true;
                        unsubscribe();
                        subscribers -= 1;
                        if (subscribers === 0) foregroundChecks.delete(check);
                    };
                },
            };
        },
        mobilePairingObserve: (happyAgentId, methods) =>
            mobilePairingObserveCreate(methods, pairingReport(happyAgentId)),
        flagFollow: (flag, listener) => client.flagFollow(flag, listener),
        mobilePairingMethodSelected: (output) =>
            mobilePairingMethodReport(
                output,
                // A device-wide choice, reported on the Happy Agent the window is using.
                pairingReport(options.happyAgents.get().activeHappyAgentId ?? LOCAL_HAPPY_AGENT_ID),
            ),
        appOpened() {
            const count = Number(storageRead(LAUNCH_COUNT_KEY) ?? "0");
            const launchCount = (Number.isSafeInteger(count) && count > 0 ? count : 0) + 1;
            storageWrite(LAUNCH_COUNT_KEY, String(launchCount));
            // Reported on the Happy Agent the window is using, once its
            // version is known: a launch reported before the first connection
            // could only ever say it did not know which agent it ran.
            let sent = false;
            let timeout: ReturnType<typeof setTimeout> | undefined;
            let unsubscribe = (): void => undefined;
            const stop = (): void => {
                clearTimeout(timeout);
                unsubscribe();
                closers.delete(close);
            };
            const send = (trackOptions?: AnalyticsTrackOptions): void => {
                if (sent) return;
                sent = true;
                stop();
                track(
                    activeId(),
                    "app_opened",
                    {
                        launch_count: launchCount,
                        is_cold_start: true,
                        agents_connected: analyticsBucket(
                            options.happyAgents.get().happyAgents.length,
                        ),
                    },
                    trackOptions,
                );
            };
            const close = (): void => send({ beacon: true });
            const versionWait = (): void => {
                const id = activeId();
                const entry = options.happyAgents.get().happyAgents.find((item) => item.id === id);
                if (entry?.version !== undefined) send();
            };
            appOpenedCancel = stop;
            closers.add(close);
            timeout = setTimeout(() => send(), APP_OPENED_VERSION_WAIT_MS);
            unsubscribe = options.happyAgents.subscribe(versionWait);
            if (sent) unsubscribe();
            else versionWait();
        },
        activity(happyAgentId, activity) {
            switch (activity.kind) {
                case "conversationCreated":
                    track(happyAgentId, "conversation_created", {
                        source: activity.source,
                        ...modelOf(activity.model),
                    });
                    return;
                case "messageSent":
                    track(happyAgentId, "message_sent", {
                        target: activity.target,
                        session_client: "happy_agent",
                        bot_system_key:
                            activity.botSystemKey === "chief_of_staff" ? "chief_of_staff" : null,
                        task_depth: activity.taskDepth,
                        source: activity.source,
                        has_attachment: activity.hasAttachment,
                        is_steering: activity.steering,
                        ...modelOf(activity.model),
                    });
                    return;
                case "projectAdded":
                    track(happyAgentId, "project_added", {
                        source: activity.source,
                        ...outcomeOf(activity.result),
                    });
                    return;
                case "workspaceCreated":
                    track(happyAgentId, "workspace_created", outcomeOf(activity.result));
                    return;
                case "taskCreated":
                    track(happyAgentId, "task_created", outcomeOf(activity.result));
                    return;
                case "failureActionClicked":
                    track(happyAgentId, "chat_failure_action_clicked", {
                        kind: analyticsFailureKind(activity.failure),
                        action: FAILURE_ACTIONS[activity.action],
                    });
                    return;
                case "botCreated":
                    track(happyAgentId, "bot_created", {
                        source: activity.source,
                        ...outcomeOf(activity.result),
                    });
                    return;
                case "conversationEntriesSeen":
                    onScreen = {
                        happyAgentId,
                        conversationId: activity.conversationId,
                        viewer: activity.viewer,
                        entryIds: activity.entryIds,
                    };
                    followed?.check();
                    return;
            }
        },
        onboardingObserve(store, welcome) {
            /** One pass through Setup in this window, from its first showing to its end. */
            let setup:
                | {
                      readonly startedAt: number;
                      failure?: AnalyticsSetupErrorCode;
                      /** Where the download stopped, kept only beside a `download_failed`. */
                      download?: AnalyticsSetupDownloadFailure;
                  }
                | undefined;
            const setupEnd = (
                outcome:
                    | { readonly result: "ok" }
                    | ({
                          readonly result: "failed";
                          readonly error_code: AnalyticsSetupErrorCode;
                      } & Partial<AnalyticsSetupDownloadFailure>),
                trackOptions?: AnalyticsTrackOptions,
            ): void => {
                if (!setup) return;
                const durationMs = Math.round(performance.now() - setup.startedAt);
                setup = undefined;
                track(
                    LOCAL_HAPPY_AGENT_ID,
                    "onboarding_setup_result",
                    { ...outcome, duration_ms: durationMs },
                    trackOptions,
                );
            };
            const setupClose = (): void =>
                // Setup retries on its own and never gives up, so a pass that
                // is still running when the window goes is reported here, with
                // the last failure it met if it met one.
                setupEnd(
                    {
                        result: "failed",
                        error_code: setup?.failure ?? "closed_during_setup",
                        ...(setup?.failure === "download_failed" && setup.download
                            ? setup.download
                            : {}),
                    },
                    { beacon: true },
                );
            const subscriptionsClose = (): void => {
                const snapshot = store.get();
                const view = localOnboardingView(snapshot);
                if (
                    view?.kind !== "provider-authentication" ||
                    snapshot.pending ||
                    snapshot.onboarding?.reachedStage !== undefined ||
                    !welcome.get().welcomeAcknowledged
                )
                    return;
                const statusOf = (id: LocalOnboardingAssistant["id"]) => {
                    const assistant = view.assistants.find((item) => item.id === id);
                    return (assistant && assistantStatus(assistant.authentication)) ?? null;
                };
                track(
                    LOCAL_HAPPY_AGENT_ID,
                    "onboarding_subscriptions_exit",
                    {
                        claude_status: statusOf("claude"),
                        codex_status: statusOf("codex"),
                        grok_status: statusOf("grok"),
                        custom_status: assistantStatus(view.custom.authentication) ?? null,
                    },
                    { beacon: true },
                );
            };
            closers.add(setupClose);
            closers.add(subscriptionsClose);
            let step: AnalyticsEvents["onboarding_step_viewed"]["step"] | undefined;
            let localAppsSent = false;
            let mobile: string | undefined;
            let stage: string | undefined;
            const observe = (snapshot: LocalOnboardingViewSnapshot): void => {
                const view = localOnboardingView(snapshot);
                if (view && view.kind !== "finishing" && welcome.get().welcomeAcknowledged) {
                    const next = stepOf(localOnboardingStage(view));
                    if (next !== undefined && next !== step) {
                        step = next;
                        track(LOCAL_HAPPY_AGENT_ID, "onboarding_step_viewed", { step: next });
                    }
                    if (setupLive(snapshot, view)) setup ??= { startedAt: performance.now() };
                    if (next === "subscriptions" && !localAppsSent) {
                        const onboarding = snapshot.onboarding;
                        const apps = onboarding?.localApps;
                        // A shell that names no install shell predates the
                        // look entirely, so it will never answer: unknown.
                        if (apps || (onboarding?.assistants && !onboarding.installShell)) {
                            localAppsSent = true;
                            track(LOCAL_HAPPY_AGENT_ID, "onboarding_local_apps", {
                                claude_desktop_app: apps?.claudeDesktop ?? null,
                                codex_desktop_app: apps?.codexDesktop ?? null,
                                antigravity_app: apps?.antigravityApp ?? null,
                                agy_cli: apps?.agyCli ?? null,
                            });
                        }
                    }
                }
                if (setup) {
                    const failure = setupFailureOf(snapshot, localProtocolMismatch());
                    if (failure) {
                        // A retry clears the shell's error before the window's
                        // own failure, so a download failure seen again without
                        // its code keeps the one it had.
                        if (failure !== "download_failed") setup.download = undefined;
                        else if (setup.failure !== "download_failed")
                            setup.download = setupDownloadFailureOf(snapshot);
                        else setup.download = setupDownloadFailureOf(snapshot) ?? setup.download;
                        setup.failure = failure;
                    }
                    const stage = snapshot.onboarding?.stage;
                    // Setup ends when Happy Agent answers and setup moves on to
                    // what the machine has. Leaving local setup altogether is
                    // neither a success nor a failure of it.
                    if (stage === "inactive") setup = undefined;
                    else if (
                        stage === "complete" ||
                        (view !== undefined && localOnboardingStage(view) !== "setup")
                    )
                        setupEnd(
                            localProtocolMismatch()
                                ? { result: "failed", error_code: "version_mismatch" }
                                : { result: "ok" },
                        );
                }
                const mobileStatus = snapshot.happyMobile?.status;
                if (mobileStatus !== mobile) {
                    // Only a step this window saw end counts: a pairing or a
                    // skip remembered from an earlier launch is not news.
                    if (mobile !== undefined && mobile !== "checking") {
                        if (mobileStatus === "configured")
                            track(LOCAL_HAPPY_AGENT_ID, "onboarding_mobile", { action: "paired" });
                        if (mobileStatus === "skipped")
                            track(LOCAL_HAPPY_AGENT_ID, "onboarding_mobile", { action: "skipped" });
                    }
                    mobile = mobileStatus;
                }
                const nextStage = snapshot.onboarding?.stage;
                if (nextStage !== stage) {
                    if (nextStage === "complete" && stage !== undefined && stage !== "inactive")
                        track(LOCAL_HAPPY_AGENT_ID, "onboarding_completed", {});
                    stage = nextStage;
                }
            };
            return {
                ...store,
                subscribe(listener) {
                    const unsubscribe = store.subscribe(() => {
                        observe(store.get());
                        listener();
                    });
                    observe(store.get());
                    return unsubscribe;
                },
                assistantsContinue() {
                    const snapshot = store.get();
                    const view = localOnboardingView(snapshot);
                    if (view?.kind === "provider-authentication") {
                        const found = snapshot.onboarding?.assistants ?? [];
                        for (const assistant of view.assistants) {
                            const status = assistantStatus(assistant.authentication);
                            if (status)
                                track(LOCAL_HAPPY_AGENT_ID, "onboarding_assistant_status", {
                                    assistant: assistant.id,
                                    status,
                                    path_refreshed:
                                        status !== "not_installed" &&
                                        found.find((item) => item.id === assistant.id)
                                            ?.pathRefreshed === true,
                                });
                        }
                        const custom = assistantStatus(view.custom.authentication);
                        if (custom)
                            track(LOCAL_HAPPY_AGENT_ID, "onboarding_assistant_status", {
                                assistant: "custom",
                                status: custom,
                                path_refreshed: false,
                            });
                    }
                    store.assistantsContinue();
                },
                commandCopied(copy) {
                    const view = localOnboardingView(store.get());
                    track(LOCAL_HAPPY_AGENT_ID, "onboarding_command_copied", {
                        assistant: copy.assistant,
                        kind: commandKindOf(copy.kind),
                        // The variant on screen when it was copied.
                        shell:
                            view?.kind === "provider-authentication" ? view.installShell : "posix",
                    });
                    store.commandCopied(copy);
                },
            };
        },
        dispose() {
            directoryUnsubscribe();
            followed?.stop();
            if (typeof document !== "undefined")
                document.removeEventListener("visibilitychange", windowChanged);
            window.removeEventListener("focus", windowChanged);
            appOpenedCancel();
            window.removeEventListener("pagehide", closing);
            closers.clear();
        },
    };
}
