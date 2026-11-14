/*
 * Shared props for the settings flow page. Not a page itself: the file name
 * does not end in `Page`, so the Blueprint does not list it.
 */
import type {
    HappyAgentDailyUsage,
    HappyAgentDailyUsageDay,
    HappyAgentMenusSnapshot,
    HappyAgentModelOption,
    HappyAgentThinkingLevel,
} from "happy-desktop-state";
import type {
    HappyAgentFileTierRow,
    HappyAgentProviderRow,
    HappyAgentSecretRow,
    HappyAgentSettingsCategory,
    HappyAgentUsageProviderRow,
} from "../../src";
import { happyAgentComposerModelControlProps } from "../../src/happyAgentComposerModelControl";

const noop = () => undefined;

/** Settings on a Happy Cloud server as an owner sees it, with the Admin group. */
export const HAPPY_CLOUD_OWNER_SETTINGS_CATEGORIES: readonly HappyAgentSettingsCategory[] = [
    { icon: "settings", id: "general", label: "General", tone: "gray" },
    { icon: "users", id: "account", label: "Account", tone: "blue" },
    { group: "Team", icon: "users", id: "members", label: "Members", tone: "orange" },
    { group: "Team", icon: "repository", id: "repositories", label: "Repositories", tone: "gray" },
    { group: "Team", icon: "zap", id: "payments", label: "Payments", tone: "green" },
    { group: "Admin", icon: "shield", id: "administration", label: "Administration", tone: "blue" },
    { group: "Admin", icon: "alert", id: "danger", label: "Danger", tone: "red" },
];

export const usageAccounts: readonly HappyAgentUsageProviderRow[] = [
    {
        providerId: "claude",
        name: "Current CLI",
        typeName: "Claude",
        checkedAt: 1_700_000_000_000,
        usage: {
            capturedAt: 1_700_000_000_000,
            planName: "Max 20×",
            exhausted: false,
            fiveHour: { usedPercent: 42, resetsAt: 1_700_007_200_000 },
            weekly: { usedPercent: 81, resetsAt: 1_700_400_000_000 },
            monthly: { usedPercent: 34, resetsAt: 1_702_000_000_000 },
            models: [
                {
                    modelId: "anthropic/opus-5",
                    hour: {
                        inputTokens: 18_400,
                        outputTokens: 6_200,
                        cacheReadTokens: 412_000,
                        cacheWriteTokens: 24_000,
                    },
                    day: {
                        inputTokens: 214_000,
                        outputTokens: 71_500,
                        cacheReadTokens: 5_120_000,
                        cacheWriteTokens: 268_000,
                    },
                    week: {
                        inputTokens: 1_420_000,
                        outputTokens: 486_000,
                        cacheReadTokens: 33_800_000,
                        cacheWriteTokens: 1_740_000,
                    },
                    month: {
                        inputTokens: 5_180_000,
                        outputTokens: 1_760_000,
                        cacheReadTokens: 121_400_000,
                        cacheWriteTokens: 6_320_000,
                    },
                },
                {
                    modelId: "anthropic/sonnet-5",
                    day: {
                        inputTokens: 9_800,
                        outputTokens: 3_100,
                        cacheReadTokens: 142_000,
                        cacheWriteTokens: 7_400,
                    },
                    week: {
                        inputTokens: 86_000,
                        outputTokens: 29_400,
                        cacheReadTokens: 1_180_000,
                        cacheWriteTokens: 62_000,
                    },
                    month: {
                        inputTokens: 402_000,
                        outputTokens: 138_000,
                        cacheReadTokens: 5_640_000,
                        cacheWriteTokens: 291_000,
                    },
                },
            ],
        },
    },
    {
        providerId: "claude_extra",
        name: "work@example.com",
        typeName: "Claude",
        checkedAt: 1_700_000_000_000,
        refreshedAt: 1_699_999_700_000,
        usage: {
            capturedAt: 1_699_999_700_000,
            planName: "Max 5×",
            fiveHour: { usedPercent: 12, resetsAt: 1_700_010_000_000 },
            weekly: { usedPercent: 37, resetsAt: 1_700_300_000_000 },
            models: [
                {
                    modelId: "anthropic/opus-5",
                    day: {
                        inputTokens: 41_000,
                        outputTokens: 12_800,
                        cacheReadTokens: 610_000,
                        cacheWriteTokens: 33_000,
                    },
                    week: {
                        inputTokens: 388_000,
                        outputTokens: 121_000,
                        cacheReadTokens: 7_400_000,
                        cacheWriteTokens: 402_000,
                    },
                },
                {
                    // Configured but never used: Settings leaves it out.
                    modelId: "anthropic/haiku-5",
                    week: {
                        inputTokens: 0,
                        outputTokens: 0,
                        cacheReadTokens: 0,
                        cacheWriteTokens: 0,
                    },
                },
            ],
        },
    },
    {
        providerId: "work_codex",
        name: "work@example.com",
        typeName: "Codex",
        checkedAt: 1_700_000_000_000,
        usage: {
            capturedAt: 1_699_999_400_000,
            planName: "Pro",
            exhausted: true,
            fiveHour: { usedPercent: 100, resetsAt: 1_700_003_000_000 },
            weekly: { usedPercent: 96 },
            credits: { available: true, unlimited: false, remainingCents: 1_450 },
            models: [
                {
                    modelId: "openai/gpt-5.6-sol",
                    month: {
                        inputTokens: 2_940_000,
                        outputTokens: 812_000,
                        cacheReadTokens: 44_100_000,
                        cacheWriteTokens: 0,
                    },
                    week: {
                        inputTokens: 740_000,
                        outputTokens: 203_000,
                        cacheReadTokens: 11_200_000,
                        cacheWriteTokens: 0,
                    },
                },
            ],
        },
    },
    {
        providerId: "grok",
        name: "Current CLI",
        typeName: "Grok",
        checkedAt: 1_700_000_000_000,
        error: "The Grok account could not be read: the assistant is signed out.",
    },
    {
        // Reports no plan and has spent nothing: Settings leaves it and its service out.
        providerId: "bedrock",
        name: "Current CLI",
        typeName: "Amazon Bedrock",
        checkedAt: 1_700_000_000_000,
        error: "The provider did not report account usage.",
    },
];

/** The Blueprint's fixed now, and the local day it falls on. */
export const usageNow = 1_700_000_000_000;

function usageDate(ms: number): string {
    const date = new Date(ms);
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * A believable history of `days` days ending on the fixed now: quiet weekends,
 * busy weeks, a holiday gap, Opus doing most of the work and Codex picking up
 * later. Seeded, so every capture draws the same grid.
 */
function usageHistory(days: number): HappyAgentDailyUsage {
    let seed = 7;
    const random = () => {
        seed = (seed * 16_807) % 2_147_483_647;
        return seed / 2_147_483_647;
    };
    const counts = (tokens: number) => ({
        inputTokens: Math.round(tokens * 0.7),
        outputTokens: Math.round(tokens * 0.22),
        cacheReadTokens: Math.round(tokens * 9),
        cacheWriteTokens: Math.round(tokens * 0.08),
    });
    const listed: HappyAgentDailyUsageDay[] = [];
    const DAY = 86_400_000;
    for (let back = days - 1; back >= 0; back -= 1) {
        const at = usageNow - back * DAY;
        const weekday = new Date(at).getDay();
        const weekend = weekday === 0 || weekday === 6;
        // Two weeks off in the middle of the year, and most weekends.
        if (back > 150 && back < 165) continue;
        if (weekend && random() < 0.7) continue;
        if (random() < 0.08) continue;
        // Busier the nearer it gets to now.
        const scale = (0.35 + 0.65 * (1 - back / Math.max(days, 1))) * (weekend ? 0.3 : 1);
        const providers = new Map([
            [
                "claude",
                new Map([
                    ["anthropic/opus-5", counts(scale * (2_000_000 + random() * 9_000_000))],
                    ["anthropic/sonnet-5", counts(scale * random() * 600_000)],
                ]),
            ],
        ]);
        if (random() < 0.5)
            providers.set(
                "claude_extra",
                new Map([["anthropic/opus-5", counts(scale * random() * 2_400_000)]]),
            );
        if (back < 120 && random() < 0.6)
            providers.set(
                "work_codex",
                new Map([["openai/gpt-5.6-sol", counts(scale * random() * 5_000_000)]]),
            );
        listed.push({ date: usageDate(at), providers });
    }
    return { since: listed[0]?.date ?? usageDate(usageNow), days: listed };
}

/** A year and more of daily usage. */
export const usageHistoryYear = usageHistory(400);
/** A Happy Agent installed forty days ago: the grid shows only those days. */
export const usageHistoryRecent = usageHistory(40);

export const instructions = `# House rules

Ask before touching anything outside the working directory.

- Small commits, present tense, no ceremony.
- \`pnpm typecheck\` before you say a thing is done.
- Never force-push \`main\`.
`;

export const providers: readonly HappyAgentProviderRow[] = [
    {
        enabled: true,
        id: "codex",
        models: [
            {
                contextWindow: 400_000,
                efforts: ["Low", "Medium", "High"],
                enabled: true,
                id: "codex:openai/gpt-5.6-sol",
                isDefault: true,
                modelId: "openai/gpt-5.6-sol",
                name: "GPT-5.6 Sol",
            },
            {
                contextWindow: 400_000,
                efforts: ["Medium", "High", "Max"],
                enabled: true,
                id: "codex:openai/gpt-5.6-terra",
                isDefault: false,
                modelId: "openai/gpt-5.6-terra",
                name: "GPT-5.6 Terra",
            },
            {
                efforts: ["Medium", "High"],
                enabled: false,
                id: "codex:openai/gpt-5.6-luna",
                isDefault: false,
                modelId: "openai/gpt-5.6-luna",
                name: "GPT-5.6 Luna",
            },
        ],
        name: "Current CLI",
        typeName: "Codex",
        serviceTiers: ["Fast"],
        status: "ready",
    },
    {
        enabled: true,
        id: "claude",
        models: [
            {
                contextWindow: 1_000_000,
                efforts: ["Low", "Medium", "High", "Ultra"],
                enabled: true,
                id: "claude:anthropic/opus-5",
                isDefault: false,
                modelId: "anthropic/opus-5",
                name: "Opus 5 1M",
            },
            {
                contextWindow: 200_000,
                efforts: ["Low", "Medium", "High"],
                enabled: true,
                id: "claude:anthropic/sonnet-5",
                isDefault: false,
                modelId: "anthropic/sonnet-5",
                name: "Sonnet 5",
            },
        ],
        name: "Current CLI",
        typeName: "Claude",
        serviceTiers: [],
        status: "ready",
    },
    {
        enabled: true,
        id: "bedrock",
        models: [
            {
                contextWindow: 200_000,
                efforts: ["Medium", "High"],
                enabled: true,
                id: "bedrock:anthropic/sonnet-5",
                isDefault: false,
                modelId: "anthropic/sonnet-5",
                name: "Sonnet 5",
            },
        ],
        name: "Bedrock",
        saving: true,
        serviceTiers: [],
        status: "not_authenticated",
    },
    {
        enabled: false,
        id: "vertex",
        models: [],
        name: "Vertex",
        serviceTiers: [],
        status: "not_enabled",
    },
];

export const secrets: readonly HappyAgentSecretRow[] = [
    {
        availableToAgents: true,
        description: "Production deploy credentials",
        environmentVariables: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"],
        id: "secret-production",
        managed: false,
        updatedAt: "29 Aug 2026, 01:42",
    },
    {
        availableToAgents: false,
        description: "Linear integration",
        environmentVariables: ["LINEAR_API_KEY"],
        id: "secret-linear",
        managed: true,
        updatedAt: "27 Aug 2026, 18:10",
    },
];

export const fileTierRows: readonly HappyAgentFileTierRow[] = [
    { id: "tests", name: "Tests", patterns: ["*.test.ts", "*.test.tsx"] },
    { id: "text", name: "Text fixtures", patterns: ["*.text.ts"] },
    { id: "docs", name: "Docs", patterns: ["docs/", "*.md"] },
];

function option(
    providerId: string,
    providerType: string,
    providerName: string,
    modelId: string,
    name: string,
): HappyAgentModelOption {
    return {
        providerId,
        providerName,
        providerType,
        modelId,
        name,
        disabled: false,
        current: false,
        efforts: [
            { level: "low", label: "Low" },
            { level: "medium", label: "Medium" },
            { level: "high", label: "High" },
        ],
        defaultEffort: "medium",
    };
}

/** A menu snapshot standing on one model of a small two-service catalog. */
export function settingsMenus(
    providerId: string,
    modelId: string,
    effort: HappyAgentThinkingLevel = "medium",
): HappyAgentMenusSnapshot {
    const modelOptions = [
        option("codex", "codex", "Current CLI", "openai/gpt-6.1-sol", "GPT-6.1 Sol"),
        option("codex", "codex", "Current CLI", "openai/gpt-5.6-sol", "GPT-5.6 Sol"),
        option("codex", "codex", "Current CLI", "openai/gpt-5.6-terra", "GPT-5.6 Terra"),
        option("claude", "claude", "Current CLI", "anthropic/opus-5-5", "Opus 5.5 1M"),
        option("claude", "claude", "Current CLI", "anthropic/sonnet-5-5", "Sonnet 5.5"),
        option("claude_extra", "claude", "work@example.com", "anthropic/opus-5-5", "Opus 5.5 1M"),
    ].map((entry) => ({
        ...entry,
        current: entry.providerId === providerId && entry.modelId === modelId,
    }));
    return {
        modelOptions,
        effortOptions: [],
        permissionModeOptions: [
            { mode: "auto", label: "Auto", current: true },
            { mode: "workspace_write", label: "Workspace write", current: false },
            { mode: "read_only", label: "Read only", current: false },
            { mode: "full_access", label: "Full access", current: false },
        ],
        serviceTierOptions: [],
        currentProviderId: providerId,
        currentModelId: modelId,
        currentAccount: "available",
        currentOption: modelOptions.find((entry) => entry.current)!,
        currentEffort: effort,
        currentPermissionMode: "auto",
    };
}

/** The General page's default-model pill, standing on Opus on the Claude CLI; `open` shows its model list. */
export function settingsDefaultModel(open: boolean) {
    return {
        defaultModel: {
            ...happyAgentComposerModelControlProps(settingsMenus("claude", "anthropic/opus-5-5"), {
                onModelChange: noop,
                onEffortChange: noop,
            }),
            accountsReadOnly: true,
            ...(open ? { preview: { panel: "model" as const } } : {}),
        },
    };
}

export const voiceController = happyAgentComposerModelControlProps(
    // The Happy Agent's own default controller: GPT-6.1 Sol at low effort.
    settingsMenus("codex", "openai/gpt-6.1-sol", "low"),
    { onModelChange: noop, onEffortChange: noop },
);
