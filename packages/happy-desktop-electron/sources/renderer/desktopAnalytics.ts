import {
    analyticsClientCreate,
    analyticsModel,
    analyticsProviderKind,
    type AnalyticsAssistantStatus,
    type AnalyticsClient,
    type AnalyticsCommonProperties,
    type AnalyticsEventName,
    type AnalyticsEvents,
    type AnalyticsOs,
    type AnalyticsOutcome,
    type AnalyticsSetupErrorCode,
    type AnalyticsTrackOptions,
} from "happy-desktop-analytics";
import {
    happyAgentBotSubtasks,
    happyAgentTaskDepths,
    usageAnalyticsStoreCreate,
    type HappyAgentActionResult,
    type HappyAgentActivity,
    type HappyAgentActivityModel,
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
import { localWebBuild } from "./localWebBuild";

declare const __HAPPY_RENDERER_VERSION__: string;
declare const __HAPPY_POSTHOG_API_KEY__: string | null;

const INSTALL_ID_KEY = "happy.analytics.install-id.v1";
const LAUNCH_COUNT_KEY = "happy.analytics.launch-count.v1";
const USAGE_ANALYTICS_KEY = "happy.usage-analytics.v1";
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
 * no typed answer, so this boundary reads its platform string once.
 */
function desktopOs(): AnalyticsOs {
    const platform = (
        (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
            ?.platform ?? navigator.platform
    ).toLowerCase();
    if (platform.startsWith("mac")) return "mac";
    if (platform.startsWith("win")) return "win";
    if (platform.startsWith("linux")) return "linux";
    return "other";
}

function outcomeOf(result: HappyAgentActionResult): AnalyticsOutcome {
    return result.ok ? { result: "ok" } : { result: "failed", error_code: result.failure };
}

/** How many hex characters of the digest an account hash keeps. */
const PROVIDER_ACCOUNT_HASH_LENGTH = 12;

/**
 * A short digest that tells two configured providers of one kind apart
 * without naming either. It is salted with this installation's random id, so
 * the same account hashes differently on every installation.
 */
async function providerAccountHash(installation: string, providerId: string): Promise<string> {
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(`${installation}:${providerId}`),
    );
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, PROVIDER_ACCOUNT_HASH_LENGTH);
}

function stepOf(stage: OnboardingStage): AnalyticsEvents["onboarding_step_viewed"]["step"] {
    switch (stage) {
        case "setup":
        case "subscriptions":
            return stage;
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
function setupFailureOf(
    snapshot: LocalOnboardingViewSnapshot,
): AnalyticsSetupErrorCode | undefined {
    const failure = snapshot.failure?.cause;
    if (failure === "stateRead") return "state_unreadable";
    switch (snapshot.onboarding?.stage) {
        case "nodeMissing":
            return "node_missing";
        case "connectFailed":
            return "connect_failed";
        case "daemonDownload":
        case "daemonStarting": {
            if (failure === "download") return "download_failed";
            if (failure === "start") return "start_failed";
            // The controller's error belongs to the work it is doing: fetching
            // until a verified release is ready here, starting it after.
            if (!snapshot.daemon?.error) return undefined;
            return snapshot.daemon.readyVersion === undefined ? "download_failed" : "start_failed";
        }
        default:
            return undefined;
    }
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

/**
 * The desktop's analytics: one client for the window, the common fields read
 * from the Happy Agent each event happened on, and the observers that turn
 * product state into catalog events. Development windows send nothing.
 */
export function desktopAnalyticsCreate(options: {
    readonly development: boolean;
    readonly happyAgents: HappyAgentDirectoryStore;
}): DesktopAnalytics {
    const preference = usageAnalyticsStoreCreate(usageAnalyticsPersistence());
    const installation = installId();
    const client: AnalyticsClient = analyticsClientCreate({
        apiKey: options.development ? undefined : (__HAPPY_POSTHOG_API_KEY__ ?? undefined),
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
            app_version: __HAPPY_RENDERER_VERSION__,
            flavor: localWebBuild ? "nightly" : "standard",
            os,
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

    const accountHashes = new Map<string, Promise<string | null>>();
    const accountHash = (providerId: string | undefined): Promise<string | null> => {
        if (providerId === undefined) return Promise.resolve(null);
        let hash = accountHashes.get(providerId);
        if (!hash) {
            hash = providerAccountHash(installation, providerId).catch(() => null);
            accountHashes.set(providerId, hash);
        }
        return hash;
    };
    /** The model fields of an event, once its account hash is known. */
    const modelOf = (model: HappyAgentActivityModel) =>
        accountHash(model.providerId).then((hash) => ({
            model: analyticsModel(model.modelId),
            model_provider_kind: analyticsProviderKind(model.providerType),
            provider_account_hash: hash,
            effort: model.effort ?? null,
        }));

    // A subtask is made by an agent, not by a control here, so it is counted
    // the first time this window sees it. What a Happy Agent already had when
    // its list first arrived is not new.
    const subtasksSeen = new Map<string, Set<string>>();
    const subtasksFollow = (): void => {
        for (const entry of options.happyAgents.get().happyAgents) {
            if (entry.projectsStatus !== "ready") continue;
            const ids = happyAgentBotSubtasks(entry.bots).map((task) => task.conversation.id);
            let depths: ReadonlyMap<string, number> | undefined;
            const seen = subtasksSeen.get(entry.id);
            if (!seen) {
                subtasksSeen.set(entry.id, new Set(ids));
                continue;
            }
            for (const id of ids) {
                if (seen.has(id)) continue;
                seen.add(id);
                depths ??= happyAgentTaskDepths(entry.bots);
                track(entry.id, "subtask_created", {
                    result: "ok",
                    task_depth: depths.get(id) ?? null,
                });
            }
        }
    };
    const directoryUnsubscribe = options.happyAgents.subscribe(subtasksFollow);
    let appOpenedCancel = (): void => undefined;
    subtasksFollow();

    return {
        preference,
        appOpened() {
            const count = Number(storageRead(LAUNCH_COUNT_KEY) ?? "0");
            const launchCount = (Number.isSafeInteger(count) && count > 0 ? count : 0) + 1;
            storageWrite(LAUNCH_COUNT_KEY, String(launchCount));
            // Reported on the Happy Agent the window is using, once its
            // version is known: a launch reported before the first connection
            // could only ever say it did not know which agent it ran.
            const activeId = (): string =>
                options.happyAgents.get().activeHappyAgentId ?? LOCAL_HAPPY_AGENT_ID;
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
                track(activeId(), "app_opened", { launch_count: launchCount }, trackOptions);
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
                    void modelOf(activity.model).then((model) =>
                        track(happyAgentId, "conversation_created", {
                            source: activity.source,
                            ...model,
                        }),
                    );
                    return;
                case "messageSent":
                    void modelOf(activity.model).then((model) =>
                        client.track("message_sent", {
                            ...common(happyAgentId),
                            client: "desktop",
                            target: activity.target,
                            session_client: "happy_agent",
                            bot_system_key: activity.botSystemKey,
                            task_depth: activity.taskDepth,
                            source: activity.source,
                            ...model,
                        }),
                    );
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
                case "botCreated":
                    track(happyAgentId, "bot_created", {
                        source: activity.source,
                        ...outcomeOf(activity.result),
                    });
                    return;
            }
        },
        onboardingObserve(store, welcome) {
            /** One pass through Setup in this window, from its first showing to its end. */
            let setup:
                | { readonly startedAt: number; failure?: AnalyticsSetupErrorCode }
                | undefined;
            const setupEnd = (
                outcome:
                    | { readonly result: "ok" }
                    | { readonly result: "failed"; readonly error_code: AnalyticsSetupErrorCode },
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
                    { result: "failed", error_code: setup?.failure ?? "closed_during_setup" },
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
            let mobile: string | undefined;
            let stage: string | undefined;
            const observe = (snapshot: LocalOnboardingViewSnapshot): void => {
                const view = localOnboardingView(snapshot);
                if (view && view.kind !== "finishing" && welcome.get().welcomeAcknowledged) {
                    const next = stepOf(localOnboardingStage(view));
                    if (next !== step) {
                        step = next;
                        track(LOCAL_HAPPY_AGENT_ID, "onboarding_step_viewed", { step: next });
                    }
                    if (setupLive(snapshot, view)) setup ??= { startedAt: performance.now() };
                }
                if (setup) {
                    const failure = setupFailureOf(snapshot);
                    if (failure) setup.failure = failure;
                    const stage = snapshot.onboarding?.stage;
                    // Setup ends when Happy Agent answers and setup moves on to
                    // what the machine has. Leaving local setup altogether is
                    // neither a success nor a failure of it.
                    if (stage === "inactive") setup = undefined;
                    else if (
                        stage === "complete" ||
                        (view !== undefined && localOnboardingStage(view) !== "setup")
                    )
                        setupEnd({ result: "ok" });
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
                    const view = localOnboardingView(store.get());
                    if (view?.kind === "provider-authentication") {
                        for (const assistant of view.assistants) {
                            const status = assistantStatus(assistant.authentication);
                            if (status)
                                track(LOCAL_HAPPY_AGENT_ID, "onboarding_assistant_status", {
                                    assistant: assistant.id,
                                    status,
                                });
                        }
                        const custom = assistantStatus(view.custom.authentication);
                        if (custom)
                            track(LOCAL_HAPPY_AGENT_ID, "onboarding_assistant_status", {
                                assistant: "custom",
                                status: custom,
                            });
                    }
                    store.assistantsContinue();
                },
                commandCopied(copy) {
                    track(LOCAL_HAPPY_AGENT_ID, "onboarding_command_copied", {
                        assistant: copy.assistant,
                        kind: commandKindOf(copy.kind),
                    });
                    store.commandCopied(copy);
                },
            };
        },
        dispose() {
            directoryUnsubscribe();
            appOpenedCancel();
            window.removeEventListener("pagehide", closing);
            closers.clear();
        },
    };
}
