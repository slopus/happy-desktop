import { useState } from "react";
import {
    HappyAgentAccountSettings,
    HappyAgentDebugLogPanel,
    HappyAgentDebugSettings,
    HappyAgentFileTierSettings,
    HappyAgentGeneralSettings,
    HappyAgentExperimentalSettings,
    HappyAgentInstructionsSettings,
    HappyAgentMobileSettings,
    HappyAgentProviderSettings,
    HappyAgentCustomProviderDialog,
    HappyAgentCredentialImport,
    HappyAgentAiProviders,
    type HappyAgentAiProviderConnectionRow,
    type HappyAgentProviderAddDialogProps,
    HappyAgentMembersSettings,
    type HappyAgentCredentialImportRow,
    HappyAgentProfilerSettings,
    HappyAgentProfileSettings,
    HappyAgentSecretSettings,
    HappyAgentSettingsShell,
    GptLiveSettings,
    HappyAgentUsageSettings,
    type HappyAgentFileTierRow,
    type HappyAgentProfileSettingsProps,
    type HappyAgentProviderRow,
    type HappyAgentSecretRow,
    type HappyAgentSettingsCategory,
    type HappyAgentUsageProviderRow,
} from "../../src";
import { ComponentPage, FullScreenSpecimen } from "../kit";
import { settingsDefaultModel, settingsMenus } from "./happyAgentSettingsFixtures";
import { direct, relayWaiting } from "./mobilePairingFixtures";
import {
    directSectionSpecimen,
    mobileLinkSpecimen,
    pairingOptionsSpecimen,
} from "./mobilePairingSpecimens";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "P-012";

const categories: readonly HappyAgentSettingsCategory[] = [
    { icon: "settings", id: "general", label: "General", tone: "gray" },
    { icon: "users", id: "account", label: "Account", tone: "blue" },
    { icon: "file-diff", id: "file-tiers", label: "File tiers", tone: "orange" },
    { icon: "doc", id: "instructions", label: "Instructions", tone: "purple" },
    { icon: "lock", id: "secrets", label: "Secrets", tone: "green" },
    { icon: "globe", id: "providers", label: "Providers", tone: "indigo" },
    { icon: "zap", id: "usage", label: "Usage", tone: "teal" },
    { icon: "mobile", id: "mobile-access", label: "Mobile access", tone: "blue" },
    { icon: "code", id: "debug", label: "Dev tools", tone: "gray" },
];

const usageDescription = "How much of each provider account's plan this machine has spent";

const accountDescription = "Local author identity and Happy account connection";

const mobileDescription = "This Happy Agent's connection to Happy Mobile";

const usageAccounts: readonly HappyAgentUsageProviderRow[] = [
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
];

/**
 * What the daemon actually reports today: absolute token counts by model, with
 * no plan share behind them. Two of these accounts are the same vendor with
 * different credentials, which is why each account keeps its configured name
 * while its vendor is shown separately.
 */
const usageTokensOnly: readonly HappyAgentUsageProviderRow[] = [
    {
        providerId: "kirill_claude",
        name: "kirill@example.com",
        typeName: "Claude",
        checkedAt: 1_700_000_000_000,
        usage: {
            capturedAt: 1_700_000_000_000,
            models: [
                {
                    modelId: "anthropic/opus-5",
                    hour: {
                        inputTokens: 12_300,
                        outputTokens: 4_100,
                        cacheReadTokens: 286_000,
                        cacheWriteTokens: 15_800,
                    },
                    day: {
                        inputTokens: 188_000,
                        outputTokens: 62_400,
                        cacheReadTokens: 4_310_000,
                        cacheWriteTokens: 221_000,
                    },
                    week: {
                        inputTokens: 1_090_000,
                        outputTokens: 361_000,
                        cacheReadTokens: 26_700_000,
                        cacheWriteTokens: 1_380_000,
                    },
                    month: {
                        inputTokens: 4_260_000,
                        outputTokens: 1_410_000,
                        cacheReadTokens: 98_200_000,
                        cacheWriteTokens: 5_070_000,
                    },
                },
                {
                    modelId: "anthropic/fable-5",
                    week: {
                        inputTokens: 42_000,
                        outputTokens: 14_300,
                        cacheReadTokens: 611_000,
                        cacheWriteTokens: 31_200,
                    },
                    month: {
                        inputTokens: 151_000,
                        outputTokens: 52_800,
                        cacheReadTokens: 2_240_000,
                        cacheWriteTokens: 114_000,
                    },
                },
            ],
        },
    },
    {
        providerId: "bulka_codex",
        checkedAt: 1_700_000_000_000,
        usage: {
            capturedAt: 1_700_000_000_000,
            models: [
                {
                    modelId: "openai/gpt-5.6-sol",
                    day: {
                        inputTokens: 61_000,
                        outputTokens: 22_800,
                        cacheReadTokens: 1_940_000,
                        cacheWriteTokens: 88_000,
                    },
                    week: {
                        inputTokens: 604_000,
                        outputTokens: 214_000,
                        cacheReadTokens: 18_300_000,
                        cacheWriteTokens: 903_000,
                    },
                    month: {
                        inputTokens: 2_310_000,
                        outputTokens: 806_000,
                        cacheReadTokens: 71_500_000,
                        cacheWriteTokens: 3_420_000,
                    },
                },
            ],
        },
    },
    {
        providerId: "bulka_happy_codex",
        checkedAt: 1_700_000_000_000,
        usage: { capturedAt: 1_700_000_000_000, models: [] },
    },
];

/** A configured account the daemon has not reached yet: neither read nor failed. */
const usageUnread: readonly HappyAgentUsageProviderRow[] = [
    {
        providerId: "claude",
        checkedAt: 1_700_000_000_000,
        usage: {
            capturedAt: 1_700_000_000_000,
            planName: "Pro",
            exhausted: false,
            fiveHour: { usedPercent: 8, resetsAt: 1_700_012_000_000 },
        },
    },
    { providerId: "work_codex" },
];

/**
 * Each account at a different point of a refresh: one just read, one being
 * read now, one whose latest refresh failed beside the reading it keeps, and
 * one whose only read failed.
 */
const usageFreshness: readonly HappyAgentUsageProviderRow[] = [
    {
        providerId: "claude",
        checkedAt: 1_700_000_000_000,
        refreshedAt: 1_700_000_000_000,
        usage: {
            capturedAt: 1_700_000_000_000,
            planName: "Max 20×",
            exhausted: false,
            fiveHour: { usedPercent: 42, resetsAt: 1_700_007_200_000 },
            weekly: { usedPercent: 81, resetsAt: 1_700_400_000_000 },
        },
    },
    {
        providerId: "claude_extra",
        checkedAt: 1_699_999_400_000,
        refreshedAt: 1_699_999_400_000,
        refreshing: true,
        usage: {
            capturedAt: 1_699_999_400_000,
            exhausted: false,
            fiveHour: { usedPercent: 67, resetsAt: 1_700_003_000_000 },
            weekly: { usedPercent: 23, resetsAt: 1_700_400_000_000 },
        },
    },
    {
        providerId: "work_codex",
        checkedAt: 1_700_000_000_000,
        refreshedAt: 1_699_999_400_000,
        refreshError: "Codex did not answer the usage request in time.",
        usage: {
            capturedAt: 1_699_999_400_000,
            planName: "Pro",
            exhausted: false,
            fiveHour: { usedPercent: 12, resetsAt: 1_700_003_000_000 },
            weekly: { usedPercent: 54 },
        },
    },
    {
        providerId: "grok",
        checkedAt: 1_700_000_000_000,
        refreshError: "The Grok account could not be read: the assistant is signed out.",
    },
];

const instructions = `# House rules

Ask before touching anything outside the working directory.

- Small commits, present tense, no ceremony.
- \`pnpm typecheck\` before you say a thing is done.
- Never force-push \`main\`.
`;

const customProviders: readonly HappyAgentProviderRow[] = [
    {
        custom: { protocol: "openai_responses" },
        enabled: true,
        id: "acme",
        keys: {
            addable: true,
            source: "tenant",
            list: [{ enabled: true, id: "default", label: "Gateway key", state: "ready" }],
        },
        models: [
            {
                contextWindow: 128000,
                efforts: [],
                enabled: true,
                id: "acme:acme/qwen-3",
                isDefault: false,
                modelId: "acme/qwen-3",
                name: "Qwen 3",
            },
        ],
        name: "Acme vLLM",
        serviceTiers: [],
        status: "ready",
    },
    {
        custom: { protocol: "anthropic_messages" },
        enabled: false,
        id: "lab",
        keys: { addable: true, list: [], source: null },
        models: [],
        name: "Lab proxy",
        serviceTiers: [],
        status: "not_enabled",
    },
];

const customProviderValues = {
    providerId: "acme",
    name: "Acme vLLM",
    baseUrl: "https://llm.acme.com/v1",
    protocol: "openai_responses",
    promptCacheKey: true,
    models: [
        { id: "qwen-3", name: "Qwen 3", contextWindow: 128000, images: true },
        { id: "qwen-3-coder", name: "Qwen 3 Coder", contextWindow: 256000, images: false },
    ],
} as const;

const cloudProviders: readonly HappyAgentProviderRow[] = [
    {
        enabled: true,
        id: "openai",
        keys: {
            addable: true,
            source: "tenant",
            list: [
                { enabled: true, id: "default", label: "Team key", state: "ready" },
                {
                    coolingUntil: "4:30 PM",
                    enabled: true,
                    id: "k2",
                    label: "Backup key",
                    state: "cooling",
                },
                { enabled: true, id: "k3", label: "Old key", state: "invalid" },
                { enabled: false, id: "k4", label: "Spare", saving: true, state: "disabled" },
            ],
        },
        models: [
            {
                efforts: ["Low", "Medium", "High"],
                enabled: true,
                id: "openai:openai/gpt-6.1-sol",
                isDefault: true,
                modelId: "openai/gpt-6.1-sol",
                name: "GPT-6.1 Sol",
            },
        ],
        name: "OpenAI",
        serviceTiers: [],
        status: "ready",
    },
    {
        enabled: false,
        id: "grok",
        keys: { addable: true, list: [], source: null },
        models: [],
        name: "xAI",
        serviceTiers: [],
        status: "not_enabled",
    },
    {
        enabled: false,
        id: "bedrock",
        keys: { addable: true, list: [], source: null },
        models: [],
        name: "Amazon Bedrock",
        serviceTiers: [],
        status: "not_enabled",
    },
];

const providers: readonly HappyAgentProviderRow[] = [
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

const secrets: readonly HappyAgentSecretRow[] = [
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

const noop = () => undefined;

const fileTiersDescription =
    "Which changed files every project lists apart, below the rest of a change";

const fileTierRows: readonly HappyAgentFileTierRow[] = [
    { id: "tests", name: "Tests", patterns: ["*.test.ts", "*.test.tsx"] },
    { id: "text", name: "Text fixtures", patterns: ["*.text.ts"] },
    { id: "docs", name: "Docs", patterns: ["docs/", "*.md"] },
];

/** The File tiers category wired to its own state, so every control answers. */
const credentialImportRows: readonly HappyAgentCredentialImportRow[] = [
    {
        id: "openai-env",
        vendorName: "OpenAI",
        label: "OpenAI API key",
        source: "$OPENAI_API_KEY",
        use: "import",
        subscription: false,
        masked: "••••3f9a",
        picked: "private",
    },
    {
        id: "codex-sub",
        vendorName: "ChatGPT",
        label: "ChatGPT subscription",
        source: "~/.codex/auth.json",
        account: "ada@example.com · Pro",
        use: "import",
        subscription: true,
        picked: "team",
    },
    {
        id: "anthropic-env",
        vendorName: "Anthropic",
        label: "Anthropic API key",
        source: "$ANTHROPIC_API_KEY",
        use: "import",
        subscription: false,
        masked: "••••k2Lw",
        result: { ok: true, duplicate: false },
    },
    {
        id: "grok-key",
        vendorName: "xAI",
        label: "Grok API key",
        source: "~/.grok/auth.json",
        use: "import",
        subscription: false,
        masked: "••••09cd",
        result: { ok: false, message: "xAI refused this key: it has been revoked." },
    },
    {
        id: "claude-sub",
        vendorName: "Claude",
        label: "Claude subscription",
        source: "Keychain · Claude Code",
        account: "Max",
        use: "import",
        subscription: true,
    },
    {
        id: "aws-session",
        vendorName: "Amazon Bedrock",
        label: "AWS access keys · work",
        source: "~/.aws/credentials",
        use: "unsupported",
        reason: "Temporary AWS keys expire. Use an IAM user's keys or a Bedrock API key.",
    },
];

const aiProviderConnections: readonly HappyAgentAiProviderConnectionRow[] = [
    {
        id: "operator:openai",
        name: "Happy (free)",
        group: "included",
        meta: "OpenAI · 2 models",
        enabled: true,
    },
    {
        id: "operator:anthropic",
        name: "Happy (free)",
        group: "included",
        meta: "Anthropic · 3 models",
        enabled: true,
    },
    {
        id: "anthropic",
        name: "Anthropic",
        group: "team",
        meta: "Anthropic · 3 models",
        enabled: true,
        credentials: [
            {
                id: "k1",
                label: "Team key",
                meta: "Anthropic · API key",
                enabled: true,
                state: "ready",
            },
        ],
    },
    {
        id: "private",
        name: "My account",
        group: "private",
        meta: "ChatGPT · 2 models",
        enabled: true,
        credentials: [
            {
                id: "k2",
                label: "ChatGPT Pro (ada@example.com)",
                meta: "ChatGPT · Subscription",
                enabled: true,
                state: "ready",
            },
            {
                id: "k3",
                label: "OpenAI API key",
                meta: "OpenAI · API key",
                enabled: true,
                state: "invalid",
            },
        ],
    },
];

/** AI providers wired to local state, so the dialog's choices answer. */
function AiProvidersSpecimen(props: {
    readonly add?: Pick<
        HappyAgentProviderAddDialogProps,
        "flow" | "phase" | "signIn" | "done" | "error"
    >;
}) {
    const [add, addSet] = useState(props.add);
    const [to, toSet] = useState<"private" | "team">("private");
    const teamOnly = add?.flow.kind === "apiKey" && add.flow.vendor === "bedrock";
    return (
        <div style={{ display: "flex", transform: "translateZ(0)" }}>
            <HappyAgentSettingsShell
                activeCategoryId="providers"
                categories={categories}
                description="Every model provider this server knows about"
                onCategorySelect={noop}
                onClose={noop}
                title="Providers"
            >
                <HappyAgentAiProviders
                    connections={aiProviderConnections}
                    teamManageable
                    {...(add
                        ? {
                              add: {
                                  ...add,
                                  ...(teamOnly ? { to: "team" as const } : { to }),
                                  destinationChoice: !teamOnly,
                                  keyVendors: ["openai", "anthropic", "grok", "bedrock"],
                                  teamOnly,
                                  teamRoutingEditable: true,
                                  chatgptAvailable: true,
                                  claudeAvailable: true,
                                  setupTokenAvailable: true,
                                  onFlowSelect: (flow) => addSet({ flow, phase: "idle" }),
                                  onBack: () => addSet({ flow: { kind: "choose" }, phase: "idle" }),
                                  onClose: () => addSet(undefined),
                                  onDestinationChange: toSet,
                                  onApiKeySubmit: noop,
                                  onAwsKeysSubmit: noop,
                                  onSetupTokenSubmit: noop,
                                  onSignInStart: noop,
                                  onSignInCodeSubmit: noop,
                              },
                          }
                        : {})}
                    onAdd={() => addSet({ flow: { kind: "choose" }, phase: "idle" })}
                    onCredentialEnabledChange={noop}
                    onCredentialRemove={noop}
                />
            </HappyAgentSettingsShell>
        </div>
    );
}

function FileTierSettingsSpecimen(props: {
    detail: string;
    label: string;
    number: string;
    tiers: readonly HappyAgentFileTierRow[];
}) {
    const [tiers, tiersSet] = useState(props.tiers);
    const [added, addedSet] = useState(0);
    return (
        <FullScreenSpecimen detail={props.detail} label={props.label} number={props.number}>
            <HappyAgentSettingsShell
                activeCategoryId="file-tiers"
                categories={categories}
                description={fileTiersDescription}
                onCategorySelect={noop}
                onClose={noop}
                title="File tiers"
            >
                <HappyAgentFileTierSettings
                    onTierAdd={() => {
                        addedSet(added + 1);
                        tiersSet([
                            ...tiers,
                            { id: `new-${String(added)}`, name: "", patterns: [] },
                        ]);
                    }}
                    onTierMove={(tierId, direction) => {
                        const index = tiers.findIndex((tier) => tier.id === tierId);
                        const target = direction === "earlier" ? index - 1 : index + 1;
                        if (index === -1 || target < 0 || target >= tiers.length) return;
                        const next = [...tiers];
                        next[index] = tiers[target]!;
                        next[target] = tiers[index]!;
                        tiersSet(next);
                    }}
                    onTierNameChange={(tierId, name) =>
                        tiersSet(
                            tiers.map((tier) => (tier.id === tierId ? { ...tier, name } : tier)),
                        )
                    }
                    onTierPatternsChange={(tierId, patterns) =>
                        tiersSet(
                            tiers.map((tier) =>
                                tier.id === tierId ? { ...tier, patterns } : tier,
                            ),
                        )
                    }
                    onTierRemove={(tierId) => tiersSet(tiers.filter((tier) => tier.id !== tierId))}
                    tiers={tiers}
                />
            </HappyAgentSettingsShell>
        </FullScreenSpecimen>
    );
}

/** A generated, fictional portrait standing in for an uploaded profile photo. */
const profilePhoto = {
    imageUrl: new URL("../assets/profile-photo.webp", import.meta.url).href,
    thumbhash: "HfkJRw53iVdwioiHeYZot3iIiAK3CHIJ",
};

/** One profile state inside the account category, so each photo state reads in place. */
function ProfileSpecimen(props: {
    readonly detail: string;
    readonly label: string;
    readonly number: string;
    readonly profile: Partial<HappyAgentProfileSettingsProps>;
}) {
    return (
        <FullScreenSpecimen detail={props.detail} label={props.label} number={props.number}>
            <HappyAgentSettingsShell
                activeCategoryId="account"
                categories={categories}
                description={accountDescription}
                onCategorySelect={noop}
                onClose={noop}
                title="Account"
            >
                <HappyAgentProfileSettings
                    email="steve@korshakov.com"
                    name="Steve Korshakov"
                    onEmailChange={noop}
                    onNameChange={noop}
                    onPhotoChoose={noop}
                    onPhotoCropCancel={noop}
                    onPhotoCropConfirm={noop}
                    onPhotoRemove={noop}
                    onRevert={noop}
                    onSave={noop}
                    {...props.profile}
                />
            </HappyAgentSettingsShell>
        </FullScreenSpecimen>
    );
}

export function HappyAgentSettingsBlueprintPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="The local workspace's settings window: a permanent category column whose heading is the way back out, and one category body beside it. Server-backed state is prop-driven, while transient write-only form values stay inside shared UI."
            title="Happy Agent settings"
        >
            <FullScreenSpecimen
                detail="Local Git author identity and a connected WorkOS account"
                label="Happy Agent settings — account"
                number="01a"
            >
                <HappyAgentSettingsShell
                    activeCategoryId="account"
                    categories={categories}
                    description={accountDescription}
                    onCategorySelect={noop}
                    onClose={noop}
                    title="Account"
                >
                    <HappyAgentProfileSettings
                        email="steve@korshakov.com"
                        name="Steve Korshakov"
                        onEmailChange={noop}
                        onNameChange={noop}
                        onPhotoChoose={noop}
                        onPhotoCropCancel={noop}
                        onPhotoCropConfirm={noop}
                        onPhotoRemove={noop}
                        onRevert={noop}
                        onSave={noop}
                    />
                    <HappyAgentAccountSettings
                        email="steve@example.com"
                        onConnect={noop}
                        onDisconnect={noop}
                        status="connected"
                    />
                </HappyAgentSettingsShell>
            </FullScreenSpecimen>
            {(["available", "downloading", "downloaded"] as const).map((updateStatus) => (
                <FullScreenSpecimen
                    detail="Desktop update status stays in Settings while downloading; Restart appears once the download finishes."
                    key={updateStatus}
                    label={`Happy Agent settings — general · update ${updateStatus}`}
                    number="01"
                    screen={`desktop-update-${updateStatus}`}
                >
                    <HappyAgentSettingsShell
                        activeCategoryId="general"
                        categories={categories}
                        description="How this window looks and what a new session starts with"
                        onCategorySelect={noop}
                        onClose={noop}
                        title="General"
                    >
                        <HappyAgentGeneralSettings
                            desktopUpdate={{
                                action: "restart",
                                detail:
                                    updateStatus === "downloading" ? "64% downloaded" : undefined,
                                status: updateStatus,
                                version: "0.0.102-preview.18",
                            }}
                            onDesktopUpdateApply={noop}
                            // The ordinary resting state of a machine with an update:
                            // the check found it and fetched it without asking, so
                            // the version is already on disk and the only thing left
                            // is the interruption nobody has agreed to yet.
                            agent={{
                                availableVersion: "0.3.1",
                                installedVersion: "0.3.0",
                                managed: true,
                                message: "Happy Agent 0.3.1 is ready to install.",
                                operation: "idle",
                                readyVersion: "0.3.1",
                                runningVersion: "0.3.0",
                                runtime: "ready",
                                updateAvailable: true,
                                versions: [
                                    { downloaded: true, prerelease: false, version: "0.3.1" },
                                    { downloaded: false, prerelease: true, version: "0.3.1-rc.2" },
                                    { downloaded: true, prerelease: false, version: "0.3.0" },
                                    { downloaded: true, prerelease: false, version: "0.2.9" },
                                ],
                            }}
                            appearance="system"
                            {...settingsDefaultModel(false)}
                            onAppearanceChange={noop}
                            statusBar={{
                                themeShown: true,
                                keepAwakeShown: false,
                                onThemeShownChange: noop,
                                onKeepAwakeShownChange: noop,
                            }}
                            keepAwake="agent"
                            onKeepAwakeChange={noop}
                            completionSound="focused"
                            onCompletionSoundChange={noop}
                            onAgentCheck={noop}
                            onAgentRestart={noop}
                            onAgentUpgrade={noop}
                            onAgentVersionSelect={noop}
                            onPreviewUpdatesChange={noop}
                            previewUpdatesEnabled
                            onUsageAnalyticsChange={noop}
                            usageAnalyticsEnabled
                            onPermissionModeChange={noop}
                            newSessionStart="lastStarted"
                            onNewSessionStartChange={noop}
                            onScrollbarVisibilityChange={noop}
                            onLinkOpenPlacementChange={noop}
                            linkOpenPlacement="panel"
                            onTitleShimmerChange={noop}
                            onProjectsHiddenChange={noop}
                            defaultAccessMenus={settingsMenus("claude", "anthropic/opus-5-5")}
                            projectsHidden
                            scrollbarVisibility="automatic"
                            avatarsAnimated={false}
                            onAvatarsAnimatedChange={noop}
                            titleShimmerEnabled={false}
                        />
                    </HappyAgentSettingsShell>
                </FullScreenSpecimen>
            ))}
            <FullScreenSpecimen
                label="Happy Agent settings — Experimental"
                detail="Independent choices for each unfinished feature"
                number="01x"
            >
                <HappyAgentSettingsShell
                    activeCategoryId="experimental"
                    categories={[
                        ...categories,
                        { id: "experimental", label: "Experimental", icon: "zap", tone: "purple" },
                    ]}
                    title="Experimental"
                    description="Features that are still being built"
                    onCategorySelect={noop}
                    onClose={noop}
                >
                    <HappyAgentExperimentalSettings
                        features={[
                            { id: "inbox", label: "Inbox", enabled: false },
                            { id: "voice", label: "Voice calls", enabled: false },
                        ]}
                        onFeatureChange={noop}
                    />
                </HappyAgentSettingsShell>
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="Mobile Access category: configured and connected, with the selected owner's disconnect action"
                label="Happy Agent settings — Mobile access"
                number="01e"
            >
                <HappyAgentSettingsShell
                    activeCategoryId="mobile-access"
                    categories={categories}
                    description={mobileDescription}
                    onCategorySelect={noop}
                    onClose={noop}
                    title="Mobile access"
                >
                    <HappyAgentMobileSettings
                        configured
                        direct={directSectionSpecimen(direct.paired)}
                        onDisconnect={noop}
                        onPairingOptionsOpen={noop}
                        pairingDirectOnly
                        status="connected"
                    />
                </HappyAgentSettingsShell>
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="Happy could not confirm removing this computer: one banner with Try again and Keep linked; the status line does not repeat the reason."
                label="Happy Agent settings — Mobile access removal incomplete"
                number="01e-removal"
            >
                <HappyAgentSettingsShell
                    activeCategoryId="mobile-access"
                    categories={categories}
                    description={mobileDescription}
                    onCategorySelect={noop}
                    onClose={noop}
                    title="Mobile access"
                >
                    <HappyAgentMobileSettings
                        configured
                        disconnectError="Happy Agent couldn't remove this computer from Happy Mobile. Check your internet connection and try again. This computer stays linked until it is removed."
                        message="Happy Agent couldn't remove this computer from Happy Mobile. Check your internet connection and try again. This computer stays linked until it is removed."
                        direct={directSectionSpecimen()}
                        onDisconnect={noop}
                        onPairingOptionsOpen={noop}
                        onReconnect={noop}
                        onRemovalRetry={noop}
                        removalIncomplete
                        removesComputer
                        status="failed"
                    />
                </HappyAgentSettingsShell>
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="Remote Agents pair in place with both codes; local Desktop opens the shared mobile setup instead."
                label="Happy Agent settings — Remote Mobile Access pairing"
                number="01f"
            >
                <HappyAgentSettingsShell
                    activeCategoryId="mobile-access"
                    categories={categories}
                    description={mobileDescription}
                    onCategorySelect={noop}
                    onClose={noop}
                    title="Mobile access"
                >
                    <HappyAgentMobileSettings
                        configured={false}
                        direct={directSectionSpecimen(direct.waiting)}
                        onDisconnect={noop}
                        onPairingOptionsOpen={noop}
                        pairingOptions={pairingOptionsSpecimen("dialog", {
                            direct: direct.waiting,
                            relay: relayWaiting,
                        })}
                        status="pairing"
                    />
                </HappyAgentSettingsShell>
            </FullScreenSpecimen>
            {([false, undefined] as const).map((configured) => (
                <FullScreenSpecimen
                    key={String(configured)}
                    detail="One local setup entry opens the same consent and linking flow as first-run. Unknown configuration is not shown as unlinked."
                    label={`Happy Mobile — local ${configured === false ? "unlinked" : "unknown"}`}
                    number={`01f-${String(configured)}`}
                >
                    <HappyAgentSettingsShell
                        activeCategoryId="mobile-access"
                        categories={categories}
                        description={mobileDescription}
                        onCategorySelect={noop}
                        onClose={noop}
                        title="Mobile access"
                    >
                        <HappyAgentMobileSettings
                            configured={configured}
                            direct={directSectionSpecimen(
                                configured === false ? direct.closed : direct.loading,
                            )}
                            onDisconnect={noop}
                            onPairingOptionsOpen={noop}
                            status={configured === false ? "disconnected" : "loading"}
                        />
                    </HappyAgentSettingsShell>
                </FullScreenSpecimen>
            ))}
            <FullScreenSpecimen
                detail="Settings walks the same store as first-run on its own surface. Back returns to Mobile Access status."
                label="Happy Mobile — link a phone"
                number="01f-setup"
            >
                {mobileLinkSpecimen({ categories, step: { kind: "intro" } })}
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="A failed native status read shows its reason in the relay slot; the direct code stays usable."
                label="Happy Mobile — native status unavailable"
                number="01f-read-failed"
            >
                {mobileLinkSpecimen({
                    categories,
                    step: {
                        kind: "link",
                        phase: {
                            kind: "failed",
                            message:
                                "Happy cannot reach the local Happy Agent. Reconnect and try again.",
                        },
                    },
                    pairing: {
                        direct: direct.waiting,
                        relay: {
                            kind: "failed",
                            message:
                                "Happy cannot reach the local Happy Agent. Reconnect and try again.",
                        },
                    },
                })}
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="Live debugger controls and a bounded raw renderer profile with React attribution"
                label="Happy Agent settings — Dev tools"
                number="01g"
            >
                <HappyAgentSettingsShell
                    activeCategoryId="debug"
                    categories={categories}
                    description="Inspect live runtimes or capture raw renderer performance evidence"
                    onCategorySelect={noop}
                    onClose={noop}
                    title="Dev tools"
                >
                    <HappyAgentDebugLogPanel
                        discardedEntries={7}
                        entries={[
                            {
                                detail: JSON.stringify(
                                    {
                                        previous: "reconnecting",
                                        next: "live",
                                    },
                                    null,
                                    2,
                                ),
                                id: 1,
                                level: "info",
                                message: "Connection state changed: reconnecting → live",
                                occurredAt: 1_700_000_000_000,
                                source: "connection",
                            },
                            {
                                detail: JSON.stringify(
                                    {
                                        cursor: "01HF7YAT00SQJZ6QH1Z2WQY7Q2",
                                        type: "message.delta",
                                        payload: {
                                            agentId: "agent_01HF7Y9P3M",
                                            delta: "Inspecting the workspace now.",
                                        },
                                    },
                                    null,
                                    2,
                                ),
                                id: 2,
                                level: "info",
                                message: "SSE event arrived: message.delta",
                                occurredAt: 1_700_000_001_250,
                                source: "sse",
                            },
                            {
                                detail: "TypeError: fetch failed\n    at healthProbe (happyAgentConnection.ts:112:18)",
                                id: 3,
                                level: "warning",
                                message: "Health probe failed (attempt 1)",
                                occurredAt: 1_700_000_003_500,
                                source: "health",
                            },
                        ]}
                    />
                    <HappyAgentDebugSettings
                        daemon={{
                            status: "running",
                            url: "ws://127.0.0.1:62701/happy-agent",
                        }}
                        daemonConnected
                        main={{
                            status: "running",
                            url: "ws://127.0.0.1:62702/main",
                        }}
                        onAllStart={noop}
                        onAllStop={noop}
                        onDaemonStart={noop}
                        onDaemonStop={noop}
                        onMainStart={noop}
                        onMainStop={noop}
                        onRendererStart={noop}
                        onRendererStop={noop}
                        renderer={{
                            status: "running",
                            url: "ws://127.0.0.1:62703/cdp/8a84291d",
                        }}
                        supported
                    />
                    <HappyAgentProfilerSettings
                        artifactPath="~/Library/Application Support/Happy/desktop/profiler/session-preview.json"
                        capabilities={{
                            liveDebuggerAttach: true,
                            nativeTrace: true,
                            processMetrics: true,
                            reactAttribution: true,
                            reactDevtoolsProfiling: true,
                            rendererMetrics: true,
                        }}
                        onStart={noop}
                        onStop={noop}
                        status="stopped"
                        supported
                    />
                </HappyAgentSettingsShell>
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="Instructions category: the machine's AGENTS.md and SECURITY.md as peer editable files"
                label="Happy Agent settings — instructions"
                number="02"
            >
                <HappyAgentSettingsShell
                    activeCategoryId="instructions"
                    categories={categories}
                    description="Machine-wide agent guidance and permission-review policy"
                    onCategorySelect={noop}
                    onClose={noop}
                    title="Instructions"
                >
                    <HappyAgentInstructionsSettings
                        documents={[
                            {
                                bytes: instructions.length,
                                description:
                                    "Given to every agent this machine starts, on top of the project's own AGENTS.md.",
                                id: "agents",
                                label: "AGENTS.md",
                                maximumBytes: 32 * 1024,
                                onRevert: noop,
                                onSave: noop,
                                onValueChange: noop,
                                path: "~/Happy/Config/AGENTS.md",
                                placeholder: "Anything every agent on this machine should know…",
                                value: instructions,
                            },
                            {
                                bytes: 0,
                                description:
                                    "Applied when this machine reviews whether an agent action is allowed.",
                                id: "security",
                                label: "SECURITY.md",
                                maximumBytes: 32 * 1024,
                                onRevert: noop,
                                onSave: noop,
                                onValueChange: noop,
                                path: "~/Happy/Config/SECURITY.md",
                                placeholder: "Rules for deciding which agent actions are allowed…",
                                value: "",
                            },
                        ]}
                    />
                </HappyAgentSettingsShell>
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="Edited in place: the fields differ from what is stored, and the last save was refused"
                label="Happy Agent settings — profile edited"
                number="02b"
            >
                <HappyAgentSettingsShell
                    activeCategoryId="account"
                    categories={categories}
                    description={accountDescription}
                    onCategorySelect={noop}
                    onClose={noop}
                    title="Account"
                >
                    <HappyAgentProfileSettings
                        dirty
                        email="steve@"
                        name="Steve Korshakov"
                        onEmailChange={noop}
                        onNameChange={noop}
                        onPhotoChoose={noop}
                        onPhotoCropCancel={noop}
                        onPhotoCropConfirm={noop}
                        onPhotoRemove={noop}
                        onRevert={noop}
                        onSave={noop}
                        saveError="Enter the email used for Git commits."
                    />
                </HappyAgentSettingsShell>
            </FullScreenSpecimen>
            <ProfileSpecimen
                detail="A stored photo, read and shown on the avatar, with removal beside the picker"
                label="Happy Agent settings — profile photo"
                number="02c"
                profile={{ photo: profilePhoto }}
            />
            <ProfileSpecimen
                detail="The photo's bytes are still being read: its ThumbHash stands in on the avatar"
                label="Happy Agent settings — profile photo loading"
                number="02d"
                profile={{ photo: { thumbhash: profilePhoto.thumbhash } }}
            />
            <ProfileSpecimen
                detail="A chosen photo is being sent; the picker carries the spinner and removal waits"
                label="Happy Agent settings — profile photo uploading"
                number="02e"
                profile={{ photo: profilePhoto, photoUploading: true }}
            />
            <ProfileSpecimen
                detail="The last photo change was refused, and the stored photo is unchanged"
                label="Happy Agent settings — profile photo refused"
                number="02f"
                profile={{
                    photo: profilePhoto,
                    photoError: "The profile photo must be no larger than 8 MiB.",
                }}
            />
            <ProfileSpecimen
                detail="No profile is stored yet, so a photo has no one to belong to until the first save"
                label="Happy Agent settings — profile photo before the first save"
                number="02g"
                profile={{
                    dirty: true,
                    email: "",
                    name: "Steve",
                    photoUnavailable: "Save your name first, then add a photo",
                }}
            />
            <FileTierSettingsSpecimen
                detail="File tiers: one global list, a card per tier in match order — name, patterns, reorder, remove"
                label="Happy Agent settings — file tiers"
                number="02f"
                tiers={fileTierRows}
            />
            <FileTierSettingsSpecimen
                detail="File tiers with none yet: every changed file is listed together"
                label="Happy Agent settings — file tiers empty"
                number="02f-empty"
                tiers={[]}
            />
            <FullScreenSpecimen
                detail="Secrets category: safe metadata lists write-only environment bundles without exposing values"
                label="Happy Agent settings — secrets"
                number="02s"
            >
                <HappyAgentSettingsShell
                    activeCategoryId="secrets"
                    categories={categories}
                    description="Write-only environment bundles this Happy Agent can provide to agents"
                    onCategorySelect={noop}
                    onClose={noop}
                    title="Secrets"
                >
                    <HappyAgentSecretSettings
                        onSecretCreate={() => Promise.resolve()}
                        secrets={secrets}
                    />
                </HappyAgentSettingsShell>
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="Create flow: one write-only value row, explicit global availability, and the standard modal form placement"
                label="Happy Agent settings — create secret"
                number="02t"
            >
                <HappyAgentSettingsShell
                    activeCategoryId="secrets"
                    categories={categories}
                    description="Write-only environment bundles this Happy Agent can provide to agents"
                    onCategorySelect={noop}
                    onClose={noop}
                    title="Secrets"
                >
                    <HappyAgentSecretSettings
                        initialCreateOpen
                        onSecretCreate={() => Promise.resolve()}
                        secrets={secrets}
                    />
                </HappyAgentSettingsShell>
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="Providers category: connected, unauthenticated, disabled, and model-less providers together"
                label="Happy Agent settings — providers"
                number="03"
            >
                <HappyAgentSettingsShell
                    activeCategoryId="providers"
                    categories={categories}
                    description="Every model provider this Happy Agent daemon knows about"
                    onCategorySelect={noop}
                    onClose={noop}
                    title="Providers"
                >
                    <HappyAgentProviderSettings
                        onModelEnabledChange={noop}
                        onProviderEnabledChange={noop}
                        providers={providers}
                    />
                </HappyAgentSettingsShell>
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="Happy Cloud providers: team API keys in each state, one with none yet, and Bedrock's region"
                label="Happy Agent settings — providers with team keys"
                number="03b"
                screen="providers-team-keys"
            >
                <HappyAgentSettingsShell
                    activeCategoryId="providers"
                    categories={categories}
                    description="Every model provider this server knows about"
                    onCategorySelect={noop}
                    onClose={noop}
                    title="Providers"
                >
                    <HappyAgentProviderSettings
                        onKeyAdd={() => Promise.resolve()}
                        onKeyEnabledChange={noop}
                        onKeyRemove={noop}
                        onModelEnabledChange={noop}
                        onProviderEnabledChange={noop}
                        providers={cloudProviders}
                    />
                </HappyAgentSettingsShell>
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="The team's own providers: one serving models, one on a protocol Happy Cloud doesn't serve yet, and the way to add another"
                label="Happy Agent settings — the team's own providers"
                number="03e"
                screen="providers-custom"
            >
                <HappyAgentSettingsShell
                    activeCategoryId="providers"
                    categories={categories}
                    description="Every model provider this server knows about"
                    onCategorySelect={noop}
                    onClose={noop}
                    title="Providers"
                >
                    <HappyAgentProviderSettings
                        onCustomProviderCreate={noop}
                        onCustomProviderEdit={noop}
                        onKeyAdd={() => Promise.resolve()}
                        onKeyEnabledChange={noop}
                        onKeyRemove={noop}
                        onModelEnabledChange={noop}
                        onProviderEnabledChange={noop}
                        providers={customProviders}
                    />
                </HappyAgentSettingsShell>
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="Adding a provider: name and ID, base URL, protocol, and one model"
                label="Happy Agent settings — add a provider"
                number="03f"
                screen="providers-custom-add"
            >
                <div style={{ display: "flex", transform: "translateZ(0)" }}>
                    <HappyAgentSettingsShell
                        activeCategoryId="providers"
                        categories={categories}
                        description="Every model provider this server knows about"
                        onCategorySelect={noop}
                        onClose={noop}
                        title="Providers"
                    >
                        <HappyAgentProviderSettings
                            onCustomProviderCreate={noop}
                            onCustomProviderEdit={noop}
                            onModelEnabledChange={noop}
                            onProviderEnabledChange={noop}
                            providers={customProviders}
                        />
                        <HappyAgentCustomProviderDialog
                            loading={false}
                            onClose={noop}
                            onSave={noop}
                            removing={false}
                            saving={false}
                        />
                    </HappyAgentSettingsShell>
                </div>
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="Editing a provider: what it stores, two models, one reading images, and a refusal from the server"
                label="Happy Agent settings — edit a provider"
                number="03g"
                screen="providers-custom-edit"
            >
                <div style={{ display: "flex", transform: "translateZ(0)" }}>
                    <HappyAgentSettingsShell
                        activeCategoryId="providers"
                        categories={categories}
                        description="Every model provider this server knows about"
                        onCategorySelect={noop}
                        onClose={noop}
                        title="Providers"
                    >
                        <HappyAgentProviderSettings
                            onCustomProviderCreate={noop}
                            onCustomProviderEdit={noop}
                            onModelEnabledChange={noop}
                            onProviderEnabledChange={noop}
                            providers={customProviders}
                        />
                        <HappyAgentCustomProviderDialog
                            error="`baseUrl` must be a public https URL such as https://llm.example.com/v1."
                            loading={false}
                            onClose={noop}
                            onRemove={noop}
                            onSave={noop}
                            providerId="acme"
                            removing={false}
                            saving={false}
                            values={customProviderValues}
                        />
                    </HappyAgentSettingsShell>
                </div>
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="Import from this computer: a key for my account, a ChatGPT sign-in picked for the team with the take-over warning, an imported key, a refused one, an unpicked Claude sign-in, and one the server can't use"
                label="Happy Agent settings — providers import"
                number="03d"
                screen="providers-import"
            >
                <HappyAgentSettingsShell
                    activeCategoryId="providers"
                    categories={categories}
                    description="Every model provider this server knows about"
                    onCategorySelect={noop}
                    onClose={noop}
                    title="Providers"
                >
                    <HappyAgentCredentialImport
                        onClose={noop}
                        onImport={noop}
                        onOpen={noop}
                        open
                        onPickScopeChange={noop}
                        onPickToggle={noop}
                        onScan={noop}
                        phase="ready"
                        rows={credentialImportRows}
                        shellScanned={false}
                        teamAllowed
                    />
                    <HappyAgentProviderSettings
                        onKeyAdd={() => Promise.resolve()}
                        onKeyEnabledChange={noop}
                        onKeyRemove={noop}
                        onModelEnabledChange={noop}
                        onProviderEnabledChange={noop}
                        providers={cloudProviders}
                    />
                </HappyAgentSettingsShell>
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="AI providers on Happy Cloud: Happy (free), the team's Anthropic key, and my ChatGPT sign-in beside a key that needs attention"
                label="Happy Agent settings — AI providers"
                number="03h"
                screen="ai-providers"
            >
                <AiProvidersSpecimen />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="Adding an AI provider: the choices, with Save to for someone who may add for the team"
                label="Happy Agent settings — add an AI provider"
                number="03i"
                screen="ai-providers-add"
            >
                <AiProvidersSpecimen add={{ flow: { kind: "choose" }, phase: "idle" }} />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="An Anthropic API key the vendor refused"
                label="Happy Agent settings — add an API key"
                number="03j"
                screen="ai-providers-add-key"
            >
                <AiProvidersSpecimen
                    add={{
                        flow: { kind: "apiKey", vendor: "anthropic" },
                        phase: "idle",
                        error: {
                            title: "Couldn't add the key",
                            message: "The vendor rejected the credential.",
                        },
                    }}
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="An Amazon Bedrock API key, with the region every team Bedrock key routes to"
                label="Happy Agent settings — add a Bedrock key"
                number="03o"
                screen="ai-providers-add-bedrock"
            >
                <AiProvidersSpecimen
                    add={{ flow: { kind: "apiKey", vendor: "bedrock" }, phase: "idle" }}
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="ChatGPT's device sign-in, waiting for the code to be entered at OpenAI"
                label="Happy Agent settings — sign in with ChatGPT"
                number="03k"
                screen="ai-providers-add-chatgpt"
            >
                <AiProvidersSpecimen
                    add={{
                        flow: { kind: "chatgpt" },
                        phase: "waiting",
                        signIn: {
                            url: "https://auth.openai.com/codex/device",
                            userCode: "ABCD-1234",
                            acceptsCode: false,
                        },
                    }}
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="Claude's sign-in, waiting for the code Claude's page shows"
                label="Happy Agent settings — sign in with Claude"
                number="03l"
                screen="ai-providers-add-claude"
            >
                <AiProvidersSpecimen
                    add={{
                        flow: { kind: "claude", setupToken: false },
                        phase: "waiting",
                        signIn: {
                            url: "https://claude.com/cai/oauth/authorize",
                            acceptsCode: true,
                        },
                    }}
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="A Claude setup token pasted instead of signing in, and the dialog once it is added"
                label="Happy Agent settings — Claude setup token"
                number="03m"
                screen="ai-providers-add-token"
            >
                <AiProvidersSpecimen
                    add={{ flow: { kind: "claude", setupToken: true }, phase: "idle" }}
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="Added: the dialog says what was connected"
                label="Happy Agent settings — AI provider added"
                number="03n"
                screen="ai-providers-add-done"
            >
                <AiProvidersSpecimen
                    add={{ flow: { kind: "chatgpt" }, phase: "done", done: "ChatGPT connected" }}
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="Happy Cloud members, seen by an owner: roles to change, an invite code shown once, a pending invite, and leaving or deleting the server"
                label="Happy Agent settings — members"
                number="03e"
                screen="members"
            >
                <HappyAgentSettingsShell
                    activeCategoryId="members"
                    categories={[
                        ...categories,
                        { icon: "users", id: "members", label: "Members", tone: "orange" },
                    ]}
                    description="Who is on this server and what they may do"
                    onCategorySelect={noop}
                    onClose={noop}
                    title="Members"
                >
                    <HappyAgentMembersSettings
                        inviteCreated={{
                            code: "K7QF-29XM",
                            roleName: "Member",
                            expires: "Expires in 7 days",
                        }}
                        inviteCreating={false}
                        invites={[
                            {
                                id: "i1",
                                roleName: "Admin",
                                expires: "Expires in 3 days",
                                saving: false,
                            },
                        ]}
                        loading={false}
                        manage
                        members={[
                            {
                                id: "a1",
                                name: "Ada Lovelace",
                                roleId: "owner",
                                joined: "Joined Nov 7",
                                self: true,
                                saving: false,
                            },
                            {
                                id: "a2",
                                name: "Grace Hopper",
                                roleId: "admin",
                                joined: "Joined Nov 7",
                                self: false,
                                saving: false,
                            },
                            {
                                id: "a3",
                                name: "Alan Turing",
                                roleId: "member",
                                joined: "Joined Nov 8",
                                self: false,
                                saving: true,
                            },
                        ]}
                        onDelete={() => Promise.resolve()}
                        onInviteCreate={noop}
                        onInviteCreatedDismiss={noop}
                        onInviteRevoke={noop}
                        onLeave={() => Promise.resolve()}
                        onRemove={noop}
                        onRoleChange={noop}
                        owner
                        roles={[
                            { id: "owner", name: "Owner" },
                            { id: "admin", name: "Admin" },
                            { id: "member", name: "Member" },
                            { id: "viewer", name: "Viewer" },
                        ]}
                        serverName="acme"
                    />
                </HappyAgentSettingsShell>
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="A refused provider change: the list still shows what the daemon holds, with the refusal above it"
                label="Happy Agent settings — providers refused"
                number="03a"
            >
                <HappyAgentSettingsShell
                    activeCategoryId="providers"
                    categories={categories}
                    description="Every model provider this Happy Agent daemon knows about"
                    onCategorySelect={noop}
                    onClose={noop}
                    title="Providers"
                >
                    <HappyAgentProviderSettings
                        onModelEnabledChange={noop}
                        onProviderEnabledChange={noop}
                        providers={providers}
                        saveError="This Happy Agent cannot change its providers while it is running."
                    />
                </HappyAgentSettingsShell>
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="The catalog has not arrived yet, so both the picker and the provider list say so"
                label="Happy Agent settings — loading"
                number="04"
            >
                <HappyAgentSettingsShell
                    activeCategoryId="providers"
                    categories={categories}
                    description="Every model provider this Happy Agent daemon knows about"
                    onCategorySelect={noop}
                    onClose={noop}
                    title="Providers"
                >
                    <HappyAgentProviderSettings
                        loading
                        onModelEnabledChange={noop}
                        onProviderEnabledChange={noop}
                        providers={[]}
                    />
                </HappyAgentSettingsShell>
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="A failed catalog read is a loud alert rather than an empty provider list"
                label="Happy Agent settings — error"
                number="05"
            >
                <HappyAgentSettingsShell
                    activeCategoryId="providers"
                    categories={categories}
                    description="Every model provider this Happy Agent daemon knows about"
                    onCategorySelect={noop}
                    onClose={noop}
                    title="Providers"
                >
                    <HappyAgentProviderSettings
                        error="The Happy Agent daemon could not read its model catalog."
                        onModelEnabledChange={noop}
                        onProviderEnabledChange={noop}
                        providers={[]}
                    />
                </HappyAgentSettingsShell>
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="Known Happy Agent offline: appearance remains local, retained defaults stay visible, and daemon-backed changes wait for reconnect"
                label="Happy Agent settings — offline"
                number="06"
            >
                <HappyAgentSettingsShell
                    activeCategoryId="general"
                    categories={categories}
                    description="How this window looks and what a new session starts with"
                    onCategorySelect={noop}
                    onClose={noop}
                    title="General"
                >
                    <HappyAgentGeneralSettings
                        appearance="system"
                        {...settingsDefaultModel(false)}
                        onAppearanceChange={noop}
                        onPermissionModeChange={noop}
                        newSessionStart="default"
                        onNewSessionStartChange={noop}
                        onScrollbarVisibilityChange={noop}
                        onLinkOpenPlacementChange={noop}
                        linkOpenPlacement="panel"
                        onTitleShimmerChange={noop}
                        defaultAccessMenus={settingsMenus("claude", "anthropic/opus-5-5")}
                        scrollbarVisibility="automatic"
                        avatarsAnimated={false}
                        onAvatarsAnimatedChange={noop}
                        titleShimmerEnabled={false}
                        unavailable="Happy Agent is offline. Showing the last synced defaults."
                        onPreviewUpdatesChange={noop}
                        previewUpdatesEnabled={false}
                    />
                </HappyAgentSettingsShell>
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="Known Happy Agent offline: instruction drafts remain editable and visible; Save waits for reconnect"
                label="Happy Agent settings — instructions offline"
                number="07"
            >
                <HappyAgentSettingsShell
                    activeCategoryId="instructions"
                    categories={categories}
                    description="Machine-wide agent guidance and permission-review policy"
                    onCategorySelect={noop}
                    onClose={noop}
                    title="Instructions"
                >
                    <HappyAgentInstructionsSettings
                        documents={[
                            {
                                bytes: instructions.length,
                                description:
                                    "Given to every agent this machine starts, on top of the project's own AGENTS.md.",
                                dirty: true,
                                id: "agents",
                                label: "AGENTS.md",
                                maximumBytes: 32 * 1024,
                                onRevert: noop,
                                onSave: noop,
                                onValueChange: noop,
                                path: "~/Happy/Config/AGENTS.md",
                                placeholder: "Anything every agent on this machine should know…",
                                saveDisabled: true,
                                saveDisabledReason:
                                    "Happy Agent is offline. Draft preserved until reconnect.",
                                value: instructions,
                            },
                        ]}
                    />
                </HappyAgentSettingsShell>
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="Usage category: three accounts separated by a rule rather than boxed — one with room across three windows, one spent with credits behind it, one that could not be read"
                label="Happy Agent settings — usage"
                number="08"
            >
                <HappyAgentSettingsShell
                    activeCategoryId="usage"
                    categories={categories}
                    description={usageDescription}
                    onCategorySelect={noop}
                    onClose={noop}
                    title="Usage"
                >
                    <HappyAgentUsageSettings
                        currentTime={1_700_000_000_000}
                        providers={usageAccounts}
                    />
                </HappyAgentSettingsShell>
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="Token counts with no plan share behind them: what each model spent per rolling window, two accounts of the same vendor kept apart by their own names, and one that has spent nothing"
                label="Happy Agent settings — usage tokens only"
                number="08a"
            >
                <HappyAgentSettingsShell
                    activeCategoryId="usage"
                    categories={categories}
                    description={usageDescription}
                    onCategorySelect={noop}
                    onClose={noop}
                    title="Usage"
                >
                    <HappyAgentUsageSettings
                        currentTime={1_700_000_000_000}
                        providers={usageTokensOnly}
                    />
                </HappyAgentSettingsShell>
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="Before the first reading arrives, so an empty account list is not claimed early"
                label="Happy Agent settings — usage loading"
                number="08b"
            >
                <HappyAgentSettingsShell
                    activeCategoryId="usage"
                    categories={categories}
                    description={usageDescription}
                    onCategorySelect={noop}
                    onClose={noop}
                    title="Usage"
                >
                    <HappyAgentUsageSettings loading providers={[]} />
                </HappyAgentSettingsShell>
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="No assistant is signed in on this machine, so the category sends the reader where accounts are actually made"
                label="Happy Agent settings — usage empty"
                number="08c"
            >
                <HappyAgentSettingsShell
                    activeCategoryId="usage"
                    categories={categories}
                    description={usageDescription}
                    onCategorySelect={noop}
                    onClose={noop}
                    title="Usage"
                >
                    <HappyAgentUsageSettings providers={[]} />
                </HappyAgentSettingsShell>
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="The reading failed; what was already read stays legible beneath the banner, and an account never read says so rather than reading as unspent"
                label="Happy Agent settings — usage error and unread"
                number="08d"
            >
                <HappyAgentSettingsShell
                    activeCategoryId="usage"
                    categories={categories}
                    description={usageDescription}
                    onCategorySelect={noop}
                    onClose={noop}
                    title="Usage"
                >
                    <HappyAgentUsageSettings
                        currentTime={1_700_000_000_000}
                        error={{
                            name: "UserError",
                            message: "The Happy Agent stopped reporting usage.",
                        }}
                        providers={usageUnread}
                    />
                </HappyAgentSettingsShell>
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="Each account says when it was last read: one just now, one being read again, one whose refresh failed beside the reading it keeps, and one whose only read failed"
                label="Happy Agent settings — usage freshness"
                number="08e"
            >
                <HappyAgentSettingsShell
                    activeCategoryId="usage"
                    categories={categories}
                    description={usageDescription}
                    onCategorySelect={noop}
                    onClose={noop}
                    title="Usage"
                >
                    <HappyAgentUsageSettings
                        currentTime={1_700_000_000_000}
                        providers={usageFreshness}
                    />
                </HappyAgentSettingsShell>
            </FullScreenSpecimen>
        </ComponentPage>
    );
}
