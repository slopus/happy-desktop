/**
 * Every event the desktop may send, and every property it may carry. Anything
 * not named here does not typecheck, and `analyticsClientCreate` drops any
 * property it does not know before an event leaves the window.
 *
 * Only enums, counts, versions, and host-reported model identifiers: never an
 * IP, a name, a path, a URL, or any text the reader wrote.
 */

/** Operating-system family, shared with the phone. `null` when unknown. */
export type AnalyticsOs = "mac" | "win" | "linux" | "other";

/** How an action ended. `error_code` is a closed kind, never message text. */
export type AnalyticsOutcome =
    | { readonly result: "ok" }
    | { readonly result: "failed"; readonly error_code: "refused" | "offline" | "unknown" };

/** Carried by every desktop event. The `agent_*` fields describe the Happy Agent it happened on. */
export interface AnalyticsCommonProperties {
    readonly app_version: string;
    readonly flavor: "standard" | "nightly";
    /** Where the desktop runs. */
    readonly os: AnalyticsOs | null;
    readonly agent_os: AnalyticsOs | null;
    readonly agent_location: "local" | "remote" | null;
    readonly happy_agent_version: string | null;
}

/**
 * `message_sent` is one event across phone, web, and desktop with the same
 * property names. Keep in step with happy-app
 * `packages/happy-app/sources/track/messageSentProperties.ts` (lines 5-36).
 */
export type MessageSentSharedProperties = {
    client: "ios" | "android" | "web" | "desktop";
    target: "chief_of_staff" | "bot" | "session" | null;
    session_client: "happy_agent" | "cli" | null;
    happy_agent_version: string | null;
    /** Vendor-qualified Happy Agent model id, e.g. "anthropic/opus-5"; null is the agent default. */
    model: string | null;
    /**
     * The provider's configured type (`claude`, `codex`, `grok`, `bedrock`, `openrouter`, …),
     * never its account id (`claude_extra` is `claude`) and never collapsed to `custom`.
     */
    model_provider_kind: string | null;
    /**
     * Tells two accounts of one provider kind apart without naming either: the
     * first 12 hex characters of SHA-256(install id + ":" + provider id). Never
     * the provider id or account name itself; null when unknown.
     */
    provider_account_hash: string | null;
    /** Raw lowercase effort level as sent; null is the model default. */
    effort: string | null;
    agent_os: "mac" | "win" | "linux" | "other" | null;
    /** The addressed bot's raw system key (`chief_of_staff`, …); null for user bots and other sessions. */
    bot_system_key: string | null;
    /** 0 top-level conversation or bot, 1 subtask, 2 sub-subtask, …; null when unknown. */
    task_depth: number | null;
};

/** The model fields `conversation_created` shares with `message_sent`. */
export type AnalyticsModelProperties = Pick<
    MessageSentSharedProperties,
    "model" | "model_provider_kind" | "provider_account_hash" | "effort"
>;

/** What one Subscriptions card says about its assistant. */
export type AnalyticsAssistantStatus =
    | "signed_in"
    | "not_signed_in"
    | "not_installed"
    | "check_failed";

/**
 * Why a first-run Setup attempt did not end with Happy Agent connected, by the
 * step that failed: never the message it failed with.
 */
export type AnalyticsSetupErrorCode =
    /** No Node runtime on this machine. */
    | "node_missing"
    /** Fetching Happy Agent failed. */
    | "download_failed"
    /** Selecting or starting the downloaded Happy Agent failed. */
    | "start_failed"
    /** Happy Agent is installed but could not be reached. */
    | "connect_failed"
    /** The window could not read setup's own state from the app. */
    | "state_unreadable"
    /** The window closed while setup was still working, with no failure seen. */
    | "closed_during_setup";

/** Event-specific properties, by event name. */
export interface AnalyticsEvents {
    readonly app_opened: { readonly launch_count: number };
    readonly onboarding_step_viewed: {
        readonly step: "setup" | "subscriptions" | "get_app" | "connect_phone";
    };
    readonly onboarding_setup_result: (
        | { readonly result: "ok" }
        | { readonly result: "failed"; readonly error_code: AnalyticsSetupErrorCode }
    ) & {
        /** From the Setup step first showing in this window to its end. */
        readonly duration_ms: number;
    };
    readonly onboarding_assistant_status: {
        readonly assistant: "claude" | "codex" | "grok" | "custom";
        /** For `custom`, `signed_in` means a valid custom configuration. */
        readonly status: AnalyticsAssistantStatus;
    };
    readonly onboarding_command_copied: {
        readonly assistant: "claude" | "codex" | "grok" | "custom";
        /** `agent_prompt` is one of the Custom card's prompts for the person's own coding agent. */
        readonly kind: "install" | "sign_in" | "agent_prompt";
    };
    /** The window closed on Subscriptions without Continue: what each card said then. */
    readonly onboarding_subscriptions_exit: {
        readonly claude_status: AnalyticsAssistantStatus | null;
        readonly codex_status: AnalyticsAssistantStatus | null;
        readonly grok_status: AnalyticsAssistantStatus | null;
        readonly custom_status: AnalyticsAssistantStatus | null;
    };
    readonly onboarding_mobile: { readonly action: "paired" | "skipped" };
    readonly onboarding_completed: Readonly<Record<never, never>>;
    readonly conversation_created: AnalyticsModelProperties & {
        readonly source: "workspace" | "command_palette" | "shortcut" | "voice";
    };
    readonly project_added: {
        readonly source: "open_folder" | "clone_github";
    } & AnalyticsOutcome;
    readonly workspace_created: AnalyticsOutcome;
    readonly bot_created: { readonly source: "sidebar" | "voice" } & AnalyticsOutcome;
    readonly subtask_created: {
        readonly result: "ok";
        /** The new subtask's depth: 1 under a bot, 2 under one of its subtasks, …; null when unknown. */
        readonly task_depth: number | null;
    };
    readonly message_sent: MessageSentSharedProperties & {
        readonly source: "chat" | "new_session" | "voice";
    };
}

export type AnalyticsEventName = keyof AnalyticsEvents;

/** What one `track` call sends: the common fields and that event's own. */
export type AnalyticsEventProperties<E extends AnalyticsEventName> = AnalyticsCommonProperties &
    AnalyticsEvents[E];

/** Every property name the catalog allows, the allowlist `before_send` enforces. */
export const ANALYTICS_PROPERTY_NAMES: ReadonlySet<string> = new Set([
    "app_version",
    "flavor",
    "os",
    "agent_os",
    "agent_location",
    "happy_agent_version",
    "launch_count",
    "step",
    "duration_ms",
    "assistant",
    "status",
    "kind",
    "claude_status",
    "codex_status",
    "grok_status",
    "custom_status",
    "action",
    "source",
    "result",
    "error_code",
    "client",
    "target",
    "session_client",
    "model",
    "model_provider_kind",
    "provider_account_hash",
    "effort",
    "bot_system_key",
    "task_depth",
] satisfies readonly (
    | keyof AnalyticsCommonProperties
    | { [E in AnalyticsEventName]: keyof AnalyticsEvents[E] }[AnalyticsEventName]
    | "error_code"
)[]);

/** Maps an operating system as Node names it (`process.platform`) to the shared family. */
export function analyticsOsFromPlatform(platform: string): AnalyticsOs {
    switch (platform) {
        case "darwin":
            return "mac";
        case "win32":
            return "win";
        case "linux":
            return "linux";
        default:
            return "other";
    }
}

/** The provider's configured type exactly as Happy Agent reports it; null when unknown. */
export function analyticsProviderKind(providerType: string | undefined): string | null {
    return providerType === undefined || providerType.length === 0 ? null : providerType;
}

/** A Happy Agent model id as the phone sends it: never `providerId:modelId`. */
export function analyticsModel(modelId: string | undefined): string | null {
    if (modelId === undefined || modelId.length === 0) return null;
    const separator = modelId.indexOf(":");
    return separator === -1 ? modelId : modelId.slice(separator + 1);
}
