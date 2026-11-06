/**
 * Every event the desktop may send, and every property it may carry: the
 * desktop's part of the shared `catalog.json`, which `catalog.test.ts` holds
 * it to. Anything not named here does not typecheck, and `analyticsEnvelope`
 * drops any property it does not know, or whose value its rule does not allow,
 * before an event leaves the window.
 *
 * Only enums, counts, booleans, and version numbers: never a model id, an
 * IP, a name, an id, a path, a URL, or any text the reader or an agent wrote.
 */

/** Operating-system family of a Happy Agent, shared with the phone. */
export const ANALYTICS_AGENT_OS = ["mac", "win", "linux", "other"] as const;
export type AnalyticsOs = (typeof ANALYTICS_AGENT_OS)[number];

/** Where the desktop itself runs: Electron ships for these three only. */
export const ANALYTICS_DESKTOP_OS = ["mac", "win", "linux"] as const;
export type AnalyticsDesktopOs = (typeof ANALYTICS_DESKTOP_OS)[number];

/** A provider's configured type, folded onto the catalog's list; anything else is `other`. */
export const ANALYTICS_PROVIDER_KINDS = [
    "claude",
    "codex",
    "grok",
    "bedrock",
    "anthropic",
    "gemini",
    "glm",
    "kimi",
    "openai",
    "other",
] as const;
export type AnalyticsProviderKind = (typeof ANALYTICS_PROVIDER_KINDS)[number];

/**
 * Why a turn failed, as the daemon typed it. `other` is a kind newer than this
 * client; `untyped` is a Happy Agent failure that came with no typed reason.
 */
export const ANALYTICS_FAILURE_KINDS = [
    "signin_missing",
    "usage_limit",
    "no_account_available",
    "rate_limited",
    "provider_unavailable",
    "network",
    "context_too_long",
    "provider_disabled",
    "internal",
    "other",
    "untyped",
] as const;
export type AnalyticsFailureKind = (typeof ANALYTICS_FAILURE_KINDS)[number];

export const ANALYTICS_DURATIONS = [
    "under_10s",
    "10s_to_30s",
    "30s_to_2m",
    "2m_to_5m",
    "5m_to_15m",
    "15m_to_1h",
    "over_1h",
] as const;
export type AnalyticsDuration = (typeof ANALYTICS_DURATIONS)[number];

/** What an error a person saw was, from typed causes and HTTP status, never its message. */
export const ANALYTICS_ERROR_CODES = [
    "offline",
    "timeout",
    "unauthorized",
    "forbidden",
    "not_found",
    "conflict",
    "too_large",
    "rate_limited",
    "server_error",
    "refused",
    "unknown",
] as const;
export type AnalyticsErrorCode = (typeof ANALYTICS_ERROR_CODES)[number];

export const ANALYTICS_EFFORTS = [
    "off",
    "on",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
    "ultra",
] as const;
export type AnalyticsEffort = (typeof ANALYTICS_EFFORTS)[number];

/**
 * A model's family, from the catalog's `model_family_rule` prefix table; the
 * model id itself never leaves the window.
 */
export const ANALYTICS_MODEL_FAMILIES = [
    "claude_opus",
    "claude_sonnet",
    "claude_haiku",
    "claude_fable",
    "gpt",
    "grok",
    "gemini",
    "glm",
    "kimi",
    "other",
] as const;
export type AnalyticsModelFamily = (typeof ANALYTICS_MODEL_FAMILIES)[number];

/** The catalog's `model_family_rule`: the first prefix a bare model id starts with names its family. */
export const ANALYTICS_MODEL_FAMILY_RULES: readonly (readonly [string, AnalyticsModelFamily])[] = [
    ["anthropic/opus", "claude_opus"],
    ["anthropic/claude-opus", "claude_opus"],
    ["anthropic/sonnet", "claude_sonnet"],
    ["anthropic/claude-sonnet", "claude_sonnet"],
    ["anthropic/haiku", "claude_haiku"],
    ["anthropic/claude-haiku", "claude_haiku"],
    ["anthropic/fable", "claude_fable"],
    ["openai/gpt", "gpt"],
    ["xai/grok", "grok"],
    ["google/gemini", "gemini"],
    ["zai/glm", "glm"],
    ["moonshotai/kimi", "kimi"],
];

/** A small count, bucketed so it cannot single anyone out. */
export const ANALYTICS_BUCKETS = ["0", "1", "2", "3+"] as const;
export type AnalyticsBucket = (typeof ANALYTICS_BUCKETS)[number];

/** Why a create failed: `HappyAgentActionFailure`. */
export const ANALYTICS_CREATE_ERROR_CODES = ["refused", "offline", "unknown"] as const;

/** How an action ended. `error_code` is a closed kind, never message text. */
export type AnalyticsOutcome =
    | { readonly result: "ok" }
    | {
          readonly result: "failed";
          readonly error_code: (typeof ANALYTICS_CREATE_ERROR_CODES)[number];
      };

export const ANALYTICS_FLAVORS = ["standard", "nightly"] as const;
export const ANALYTICS_AGENT_LOCATIONS = ["local", "remote"] as const;
export const ANALYTICS_ARCHES = ["arm64", "x64", "other"] as const;

/** Carried by every desktop event. The `agent_*` fields describe the Happy Agent it happened on. */
export interface AnalyticsCommonProperties {
    readonly client: "desktop";
    readonly device_class: "desktop";
    /** Numbers only; null, and so left out, for a build whose version is not. */
    readonly app_version: string | null;
    readonly flavor: (typeof ANALYTICS_FLAVORS)[number];
    /** Where the desktop runs. */
    readonly os: AnalyticsDesktopOs;
    /** Major and minor only, e.g. `15.6` or `10.0`; null on Linux and older shells. */
    readonly os_version: string | null;
    /** The desktop app's own architecture; null on shells too old to say. */
    readonly arch: (typeof ANALYTICS_ARCHES)[number] | null;
    readonly agent_os: AnalyticsOs | null;
    readonly agent_location: (typeof ANALYTICS_AGENT_LOCATIONS)[number] | null;
    readonly happy_agent_version: string | null;
}

/** The model fields `conversation_created` shares with `message_sent`. */
export interface AnalyticsModelProperties {
    /** The model's family, `other` for any model outside the table, null for the agent default. */
    readonly model_family: AnalyticsModelFamily | null;
    readonly model_provider_kind: AnalyticsProviderKind | null;
    /** The effort level sent; null is the model default. */
    readonly effort: AnalyticsEffort | null;
}

export const ANALYTICS_TARGETS = ["chief_of_staff", "bot", "session"] as const;
export type AnalyticsTarget = (typeof ANALYTICS_TARGETS)[number];

export const ANALYTICS_MESSAGE_SOURCES = ["chat", "new_session", "voice"] as const;
export const ANALYTICS_CONVERSATION_SOURCES = [
    "workspace",
    "command_palette",
    "shortcut",
    "voice",
] as const;
export const ANALYTICS_PROJECT_SOURCES = ["open_folder", "clone_github"] as const;
export const ANALYTICS_BOT_SOURCES = ["sidebar", "voice"] as const;

/** What one Subscriptions card says about its assistant as the person continues. */
export const ANALYTICS_ASSISTANT_STATUSES = [
    "signed_in",
    "not_signed_in",
    "not_installed",
    "check_failed",
] as const;
export type AnalyticsAssistantStatus = (typeof ANALYTICS_ASSISTANT_STATUSES)[number];

export const ANALYTICS_ASSISTANTS = ["claude", "codex", "grok", "custom"] as const;
export const ANALYTICS_ONBOARDING_STEPS = [
    "setup",
    "subscriptions",
    "get_app",
    "connect_phone",
] as const;

/**
 * Why a first-run Setup attempt did not end with Happy Agent connected, by the
 * step that failed: never the message it failed with.
 */
export const ANALYTICS_SETUP_ERROR_CODES = [
    /** No Node runtime on this machine. */
    "node_missing",
    /** Fetching Happy Agent failed. */
    "download_failed",
    /** Selecting or starting the downloaded Happy Agent failed. */
    "start_failed",
    /** Happy Agent was started but did not answer in time. */
    "start_timeout",
    /** Happy Agent answered, but speaks a protocol this desktop cannot use. */
    "version_mismatch",
    /** Happy Agent is installed but could not be reached. */
    "connect_failed",
    /** The window could not read setup's own state from the app. */
    "state_unreadable",
    /** The window closed while setup was still working, with no failure seen. */
    "closed_during_setup",
] as const;
export type AnalyticsSetupErrorCode = (typeof ANALYTICS_SETUP_ERROR_CODES)[number];

/**
 * Where a `download_failed` stopped, as the shell coded it where the failure
 * was raised. Absent from shells too old to say.
 */
export const ANALYTICS_SETUP_ERROR_DETAILS = [
    "release_lookup_rate_limited",
    "release_lookup_failed",
    "release_unavailable",
    "network_unreachable",
    "transfer_interrupted",
    "transfer_timeout",
    "transfer_http_error",
    "integrity_mismatch",
    "disk_full",
    "filesystem_locked",
    "extract_failed",
    "install_lock_timeout",
    "unclassified",
] as const;
export type AnalyticsSetupErrorDetail = (typeof ANALYTICS_SETUP_ERROR_DETAILS)[number];

/** How much of the archive had arrived when a download failed, as a percentage band. */
export const ANALYTICS_TRANSFER_PERCENT_BUCKETS = [
    "none",
    "under_half",
    "over_half",
    "complete",
] as const;
export type AnalyticsTransferPercentBucket = (typeof ANALYTICS_TRANSFER_PERCENT_BUCKETS)[number];

/** What a shell that codes its download failures adds to a `download_failed`. */
export interface AnalyticsSetupDownloadFailure {
    readonly error_detail: AnalyticsSetupErrorDetail;
    /** Requests made for the archive, resumes included; 0 when it failed before asking. */
    readonly attempt_count: number;
    readonly transfer_percent_bucket: AnalyticsTransferPercentBucket;
}

/** How a phone pairs: through the Happy server (relay), or a direct connection over Tailcat. */
export const ANALYTICS_PAIRING_METHODS = ["relay", "direct"] as const;
export type AnalyticsMobilePairingMethod = (typeof ANALYTICS_PAIRING_METHODS)[number];

/** Which pairing page: first-run onboarding, or Settings → Mobile Access. */
export const ANALYTICS_PAIRING_SURFACES = ["onboarding", "mobile_access"] as const;
export type AnalyticsMobilePairingSurface = (typeof ANALYTICS_PAIRING_SURFACES)[number];

/** Why a pairing this window showed ended unlinked, from the pairing's own typed status. */
export const ANALYTICS_PAIRING_ERROR_CODES = [
    "expired",
    "rejected",
    "unavailable",
    "unknown",
] as const;
export type AnalyticsPairingErrorCode = (typeof ANALYTICS_PAIRING_ERROR_CODES)[number];

export const ANALYTICS_FAILURE_ACTIONS = [
    "retry",
    "switch_model",
    "new_chat",
    "ask_chief",
] as const;
export type AnalyticsFailureAction = (typeof ANALYTICS_FAILURE_ACTIONS)[number];

export const ANALYTICS_CONNECTION_CODES = [
    "unreachable",
    "auth_expired",
    "version_mismatch",
    "unknown",
] as const;
export type AnalyticsConnectionCode = (typeof ANALYTICS_CONNECTION_CODES)[number];

export const ANALYTICS_CONNECTION_OUTCOMES = [
    "recovered",
    "restarted",
    "gave_up",
    "backgrounded",
    "closed",
] as const;
export type AnalyticsConnectionOutcome = (typeof ANALYTICS_CONNECTION_OUTCOMES)[number];

/** Which screen showed an error the person saw: the desktop surfaces that report one. */
export const ANALYTICS_ERROR_AREAS = [
    "conversation_load",
    "message_send",
    "file_load",
    "diff_load",
    "update",
] as const;
export type AnalyticsErrorArea = (typeof ANALYTICS_ERROR_AREAS)[number];

/** Event-specific properties, by event name. */
export interface AnalyticsEvents {
    readonly app_opened: {
        /** Every desktop launch is a cold start: the renderer has no background state. */
        readonly is_cold_start: true;
        /** Happy Agent connections this window has, local included. */
        readonly agents_connected: AnalyticsBucket;
    };
    readonly onboarding_step_viewed: {
        readonly step: (typeof ANALYTICS_ONBOARDING_STEPS)[number];
    };
    readonly onboarding_setup_result: (
        | { readonly result: "ok" }
        | ({
              readonly result: "failed";
              readonly error_code: AnalyticsSetupErrorCode;
          } & Partial<AnalyticsSetupDownloadFailure>)
    ) & {
        /** From the Setup step first showing in this window to its end. */
        readonly duration: AnalyticsDuration;
    };
    readonly onboarding_assistant_status: {
        readonly assistant: (typeof ANALYTICS_ASSISTANTS)[number];
        /** For `custom`, `signed_in` means a valid custom configuration. */
        readonly status: AnalyticsAssistantStatus;
        /**
         * The command was found only on a PATH entry added after the shell
         * started, or at its installer's default location; false for `custom`
         * and for an assistant that is not installed.
         */
        readonly path_refreshed: boolean;
    };
    readonly onboarding_mobile: { readonly action: "paired" | "skipped" };
    readonly onboarding_completed: Readonly<Record<never, never>>;
    /** A phone pairing page showed its Relay | Direct choice. */
    readonly mobile_pairing_options_shown: {
        readonly options: "relay_direct";
        /** The method selected as it showed: the person's choice, else the rollout's default. */
        readonly default_method: AnalyticsMobilePairingMethod;
        readonly surface: AnalyticsMobilePairingSurface;
    };
    readonly mobile_pairing_option_selected: {
        readonly from: AnalyticsMobilePairingMethod;
        readonly to: AnalyticsMobilePairingMethod;
        readonly surface: AnalyticsMobilePairingSurface;
    };
    /** A pairing this window showed linked a phone. */
    readonly mobile_pairing_completed: { readonly method: AnalyticsMobilePairingMethod };
    /** A pairing this window showed ended unlinked: no code, an error, or emoji that did not match. */
    readonly mobile_pairing_failed: {
        readonly method: AnalyticsMobilePairingMethod;
        readonly error_code: AnalyticsPairingErrorCode;
    };
    /** A pairing in progress was left: its page closed or skipped, or the other method chosen. */
    readonly mobile_pairing_cancelled: { readonly method: AnalyticsMobilePairingMethod };
    readonly conversation_created: AnalyticsModelProperties & {
        readonly source: (typeof ANALYTICS_CONVERSATION_SOURCES)[number];
    };
    readonly project_added: {
        readonly source: (typeof ANALYTICS_PROJECT_SOURCES)[number];
    } & AnalyticsOutcome;
    readonly workspace_created: AnalyticsOutcome;
    readonly bot_created: {
        readonly source: (typeof ANALYTICS_BOT_SOURCES)[number];
    } & AnalyticsOutcome;
    readonly task_created: AnalyticsOutcome;
    /**
     * One event across phone and desktop with the same property names; the
     * denominator for failure rates.
     */
    readonly message_sent: AnalyticsModelProperties & {
        readonly source: (typeof ANALYTICS_MESSAGE_SOURCES)[number];
        readonly target: AnalyticsTarget | null;
        readonly session_client: "happy_agent" | null;
        /** `chief_of_staff` for that system bot; null for every other conversation. */
        readonly bot_system_key: "chief_of_staff" | null;
        /** 0 top-level conversation or bot, 1 subtask, 2 sub-subtask, …; null when unknown. */
        readonly task_depth: number | null;
        readonly has_attachment: boolean;
        /** Sent while the agent was still working on the conversation. */
        readonly is_steering: boolean;
    };
    /** A failed agent turn's card was shown, fresh, in the focused conversation. */
    readonly chat_failure_shown: {
        readonly kind: AnalyticsFailureKind;
        /** The failing provider's kind; null when the failure names no single provider. */
        readonly provider_kind: AnalyticsProviderKind | null;
        readonly target: AnalyticsTarget;
        readonly session_client: "happy_agent";
        /** The turn ran on a routing pool. */
        readonly is_pool: boolean;
    };
    readonly chat_failure_action_clicked: {
        readonly kind: AnalyticsFailureKind;
        readonly action: AnalyticsFailureAction;
    };
    /** The active Happy Agent was out of reach for 10 s or more while the window showed. */
    readonly agent_connection_lost: {
        readonly transport: (typeof ANALYTICS_AGENT_LOCATIONS)[number];
        readonly code: AnalyticsConnectionCode;
        readonly outcome: AnalyticsConnectionOutcome;
        readonly duration: AnalyticsDuration;
        /** The full-window "Happy is in a broken state" screen showed during it. */
        readonly is_recovery_screen_shown: boolean;
    };
    readonly error_shown: {
        readonly area: AnalyticsErrorArea;
        readonly code: AnalyticsErrorCode;
    };
}

export type AnalyticsEventName = keyof AnalyticsEvents;

/** What one `track` call sends: the common fields and that event's own. */
export type AnalyticsEventProperties<E extends AnalyticsEventName> = AnalyticsCommonProperties &
    AnalyticsEvents[E];

/** How one property's value is checked as an event leaves, as `catalog.json` states it. */
export type AnalyticsPropertyRule = (
    | { readonly type: "enum"; readonly values: readonly string[] }
    | { readonly type: "bool" | "count" | "version" | "os_version" }
) & { readonly nullable?: true; readonly optional?: true };

type AllKeys<T> = T extends unknown ? keyof T : never;

/** Every property of `T`, each with its rule. */
type AnalyticsPropertyRules<T> = { readonly [P in AllKeys<T>]-?: AnalyticsPropertyRule };

const oneOf = (values: readonly string[]) => ({ type: "enum", values }) as const;
const nullable = <R extends AnalyticsPropertyRule>(rule: R) =>
    ({ ...rule, nullable: true }) as const;
const optional = <R extends AnalyticsPropertyRule>(rule: R) =>
    ({ ...rule, optional: true }) as const;
const BOOL = { type: "bool" } as const;
const COUNT = { type: "count" } as const;
const MODEL_RULES = {
    model_family: nullable(oneOf(ANALYTICS_MODEL_FAMILIES)),
    model_provider_kind: nullable(oneOf(ANALYTICS_PROVIDER_KINDS)),
    effort: nullable(oneOf(ANALYTICS_EFFORTS)),
} as const;
const OUTCOME_RULES = {
    result: oneOf(["ok", "failed"]),
    error_code: optional(oneOf(ANALYTICS_CREATE_ERROR_CODES)),
} as const;
const NONE = {} as const;

export const ANALYTICS_COMMON_RULES: AnalyticsPropertyRules<AnalyticsCommonProperties> = {
    client: oneOf(["desktop"]),
    device_class: oneOf(["desktop"]),
    app_version: { type: "version" },
    flavor: oneOf(ANALYTICS_FLAVORS),
    os: oneOf(ANALYTICS_DESKTOP_OS),
    os_version: nullable({ type: "os_version" }),
    arch: nullable(oneOf(ANALYTICS_ARCHES)),
    agent_os: nullable(oneOf(ANALYTICS_AGENT_OS)),
    agent_location: nullable(oneOf(ANALYTICS_AGENT_LOCATIONS)),
    happy_agent_version: nullable({ type: "version" }),
};

/** Each event's own properties and their rules. */
export const ANALYTICS_EVENT_RULES: {
    readonly [E in AnalyticsEventName]: AnalyticsPropertyRules<AnalyticsEvents[E]>;
} = {
    app_opened: {
        is_cold_start: BOOL,
        agents_connected: oneOf(ANALYTICS_BUCKETS),
    },
    onboarding_step_viewed: { step: oneOf(ANALYTICS_ONBOARDING_STEPS) },
    onboarding_setup_result: {
        result: oneOf(["ok", "failed"]),
        error_code: optional(oneOf(ANALYTICS_SETUP_ERROR_CODES)),
        error_detail: optional(oneOf(ANALYTICS_SETUP_ERROR_DETAILS)),
        attempt_count: optional(COUNT),
        transfer_percent_bucket: optional(oneOf(ANALYTICS_TRANSFER_PERCENT_BUCKETS)),
        duration: oneOf(ANALYTICS_DURATIONS),
    },
    onboarding_assistant_status: {
        assistant: oneOf(ANALYTICS_ASSISTANTS),
        status: oneOf(ANALYTICS_ASSISTANT_STATUSES),
        path_refreshed: BOOL,
    },
    onboarding_mobile: { action: oneOf(["paired", "skipped"]) },
    onboarding_completed: NONE,
    mobile_pairing_options_shown: {
        options: oneOf(["relay_direct"]),
        default_method: oneOf(ANALYTICS_PAIRING_METHODS),
        surface: oneOf(ANALYTICS_PAIRING_SURFACES),
    },
    mobile_pairing_option_selected: {
        from: oneOf(ANALYTICS_PAIRING_METHODS),
        to: oneOf(ANALYTICS_PAIRING_METHODS),
        surface: oneOf(ANALYTICS_PAIRING_SURFACES),
    },
    mobile_pairing_completed: { method: oneOf(ANALYTICS_PAIRING_METHODS) },
    mobile_pairing_failed: {
        method: oneOf(ANALYTICS_PAIRING_METHODS),
        error_code: oneOf(ANALYTICS_PAIRING_ERROR_CODES),
    },
    mobile_pairing_cancelled: { method: oneOf(ANALYTICS_PAIRING_METHODS) },
    conversation_created: { ...MODEL_RULES, source: oneOf(ANALYTICS_CONVERSATION_SOURCES) },
    project_added: { source: oneOf(ANALYTICS_PROJECT_SOURCES), ...OUTCOME_RULES },
    workspace_created: OUTCOME_RULES,
    bot_created: { source: oneOf(ANALYTICS_BOT_SOURCES), ...OUTCOME_RULES },
    task_created: OUTCOME_RULES,
    message_sent: {
        ...MODEL_RULES,
        source: oneOf(ANALYTICS_MESSAGE_SOURCES),
        target: nullable(oneOf(ANALYTICS_TARGETS)),
        session_client: nullable(oneOf(["happy_agent"])),
        bot_system_key: nullable(oneOf(["chief_of_staff"])),
        task_depth: nullable(COUNT),
        has_attachment: BOOL,
        is_steering: BOOL,
    },
    chat_failure_shown: {
        kind: oneOf(ANALYTICS_FAILURE_KINDS),
        provider_kind: nullable(oneOf(ANALYTICS_PROVIDER_KINDS)),
        target: oneOf(ANALYTICS_TARGETS),
        session_client: oneOf(["happy_agent"]),
        is_pool: BOOL,
    },
    chat_failure_action_clicked: {
        kind: oneOf(ANALYTICS_FAILURE_KINDS),
        action: oneOf(ANALYTICS_FAILURE_ACTIONS),
    },
    agent_connection_lost: {
        transport: oneOf(ANALYTICS_AGENT_LOCATIONS),
        code: oneOf(ANALYTICS_CONNECTION_CODES),
        outcome: oneOf(ANALYTICS_CONNECTION_OUTCOMES),
        duration: oneOf(ANALYTICS_DURATIONS),
        is_recovery_screen_shown: BOOL,
    },
    error_shown: {
        area: oneOf(ANALYTICS_ERROR_AREAS),
        code: oneOf(ANALYTICS_ERROR_CODES),
    },
};

/** Every event name the catalog allows; `analyticsEnvelope` drops any other. */
export const ANALYTICS_EVENT_NAMES: ReadonlySet<string> = new Set(
    Object.keys(ANALYTICS_EVENT_RULES),
);

/** The shapes the catalog's `types` allow for a string value. */
export const ANALYTICS_VALUE_PATTERNS = {
    version: /^[0-9]+(\.[0-9]+){0,3}$/,
    os_version: /^[0-9]+(\.[0-9]+)?$/,
} as const;
const VERSION = ANALYTICS_VALUE_PATTERNS.version;
const VERSION_MAX_LENGTH = 32;
const OS_VERSION = ANALYTICS_VALUE_PATTERNS.os_version;
const COUNT_MAX = 1_000_000;

/** Whether a value is one `rule` allows. */
export function analyticsValueAllowed(rule: AnalyticsPropertyRule, value: unknown): boolean {
    if (value === null) return rule.nullable === true;
    switch (rule.type) {
        case "enum":
            return typeof value === "string" && rule.values.includes(value);
        case "bool":
            return typeof value === "boolean";
        case "count":
            return (
                Number.isInteger(value) && (value as number) >= 0 && (value as number) <= COUNT_MAX
            );
        case "version":
            return (
                typeof value === "string" &&
                value.length <= VERSION_MAX_LENGTH &&
                VERSION.test(value)
            );
        case "os_version":
            return typeof value === "string" && OS_VERSION.test(value);
    }
}

/** The rule for one property of one event, common ones included; undefined for anything else. */
export function analyticsRuleOf(
    event: string,
    property: string,
): AnalyticsPropertyRule | undefined {
    if (Object.hasOwn(ANALYTICS_COMMON_RULES, property))
        return ANALYTICS_COMMON_RULES[property as keyof AnalyticsCommonProperties];
    if (!Object.hasOwn(ANALYTICS_EVENT_RULES, event)) return undefined;
    const rules: Readonly<Record<string, AnalyticsPropertyRule>> =
        ANALYTICS_EVENT_RULES[event as AnalyticsEventName];
    return Object.hasOwn(rules, property) ? rules[property] : undefined;
}

/**
 * The PostHog feature flags this desktop reads, by their exact keys. The phone
 * apps read the same keys, so a flag is renamed in all of them or none.
 */
export type AnalyticsFlag =
    /** On: pairing pages select Direct first for people who have not chosen. */
    "direct-connection-migration-new-users";

/** A provider's configured type on the catalog's list, else `other`; null when unknown. */
export function analyticsProviderKind(
    providerType: string | undefined,
): AnalyticsProviderKind | null {
    if (providerType === undefined || providerType.length === 0) return null;
    return (ANALYTICS_PROVIDER_KINDS as readonly string[]).includes(providerType)
        ? (providerType as AnalyticsProviderKind)
        : "other";
}

/**
 * A conversation failure's kind on the catalog's list: `untyped` for a failure
 * that came without one, `other` for a kind this client does not name.
 */
export function analyticsFailureKind(kind: string | undefined): AnalyticsFailureKind {
    if (kind === undefined) return "untyped";
    return kind !== "untyped" && (ANALYTICS_FAILURE_KINDS as readonly string[]).includes(kind)
        ? (kind as AnalyticsFailureKind)
        : "other";
}

/** What a Happy Agent refusal was, by its HTTP status. */
export function analyticsErrorCodeOfStatus(status: number): AnalyticsErrorCode {
    switch (status) {
        case 401:
            return "unauthorized";
        case 403:
            return "forbidden";
        case 404:
            return "not_found";
        case 408:
        case 504:
            return "timeout";
        case 409:
        case 412:
            return "conflict";
        case 413:
            return "too_large";
        case 429:
            return "rate_limited";
        default:
            return status >= 500 ? "server_error" : "refused";
    }
}

/**
 * A Happy Agent model id's family: its `providerId:` prefix stripped, then the
 * first rule it starts with, else `other`, since a custom provider's model
 * name could say something private. Null is the agent default.
 */
export function analyticsModelFamily(modelId: string | undefined): AnalyticsModelFamily | null {
    if (modelId === undefined || modelId.length === 0) return null;
    const separator = modelId.indexOf(":");
    const bare = separator === -1 ? modelId : modelId.slice(separator + 1);
    return ANALYTICS_MODEL_FAMILY_RULES.find(([prefix]) => bare.startsWith(prefix))?.[1] ?? "other";
}

/**
 * A version as the catalog allows it: numbers only, cut at the first `-` or
 * `+`; null when what is left is still not one.
 */
export function analyticsVersion(version: string | null | undefined): string | null {
    if (!version) return null;
    const bare = version.split(/[-+]/, 1)[0]!;
    return bare.length <= VERSION_MAX_LENGTH && VERSION.test(bare) ? bare : null;
}

/** An OS version cut to major.minor (`15.6.0` is `15.6`); null when it is not a plain number. */
export function analyticsOsVersion(version: string | null | undefined): string | null {
    const match = version ? /^([0-9]+)(\.[0-9]+)?/.exec(version) : null;
    return match ? `${match[1]}${match[2] ?? ""}` : null;
}

/** A count as the catalog's small buckets. */
export function analyticsBucket(count: number): AnalyticsBucket {
    return count >= 3 ? "3+" : (String(count) as AnalyticsBucket);
}

/** How long something lasted, as the catalog's coarse band. */
export function analyticsDuration(milliseconds: number): AnalyticsDuration {
    const seconds = milliseconds / 1000;
    if (seconds < 10) return "under_10s";
    if (seconds < 30) return "10s_to_30s";
    if (seconds < 120) return "30s_to_2m";
    if (seconds < 300) return "2m_to_5m";
    if (seconds < 900) return "5m_to_15m";
    if (seconds < 3600) return "15m_to_1h";
    return "over_1h";
}
