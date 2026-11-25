import {
    HappyAgentProviderSettings,
    HappyAgentSettingsShell,
    type HappyAgentProviderRow,
    type HappyAgentProviderSettingsProps,
    type HappyAgentProviderSignInDialogProps,
    type HappyAgentSettingsCategory,
} from "../../src";
import { ComponentPage, FullScreenSpecimen } from "../kit";

/** The component plan this page documents. */
export const componentNumber = "P-012g";

const categories: readonly HappyAgentSettingsCategory[] = [
    { icon: "settings", id: "general", label: "General", tone: "gray" },
    { icon: "users", id: "account", label: "Account", tone: "blue" },
    { icon: "mobile", id: "mobile-access", label: "Mobile access", tone: "green" },
    { group: "Agents", icon: "doc", id: "instructions", label: "Instructions", tone: "purple" },
    { group: "Agents", icon: "globe", id: "providers", label: "Inference", tone: "indigo" },
    { group: "Agents", icon: "zap", id: "usage", label: "Usage", tone: "teal" },
    { group: "Agents", icon: "lock", id: "secrets", label: "Secrets", tone: "green" },
    { group: "Advanced", icon: "file-diff", id: "file-tiers", label: "File tiers", tone: "orange" },
    { group: "Advanced", icon: "code", id: "debug", label: "Dev tools", tone: "gray" },
];

const noop = () => undefined;

const WINDOW = { width: 1100, height: 900 } as const;

/** The moment every line on this page is told against. */
const NOW = Date.UTC(2026, 10, 25, 19, 0);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** One subscription account's row, with one model. */
function account(
    id: string,
    typeName: "Codex" | "Claude" | "Grok",
    name: string,
    signIn: HappyAgentProviderRow["signIn"],
    more: Partial<HappyAgentProviderRow> = {},
): HappyAgentProviderRow {
    const model =
        typeName === "Claude"
            ? { id: "anthropic/opus-5", name: "Opus 5 1M", contextWindow: 1_000_000 }
            : typeName === "Grok"
              ? { id: "xai/grok-5", name: "Grok 5", contextWindow: 256_000 }
              : { id: "openai/gpt-5.6-sol", name: "GPT-5.6 Sol", contextWindow: 400_000 };
    return {
        enabled: true,
        id,
        mark: typeName === "Claude" ? "claude" : typeName === "Grok" ? "grok" : "openai",
        models: [
            {
                contextWindow: model.contextWindow,
                efforts: ["Low", "Medium", "High"],
                enabled: true,
                id: `${id}:${model.id}`,
                isDefault: false,
                modelId: model.id,
                name: model.name,
            },
        ],
        name,
        typeName,
        serviceTiers: [],
        status: "ready",
        ...(signIn ? { signIn } : {}),
        ...more,
    };
}

const codexSystem = {
    cli: "codex",
    source: "system",
    methods: ["device", "browser"],
    acceptsToken: false,
    installed: true,
} as const;

const claudeInternal = {
    cli: "claude",
    source: "internal",
    account: "ada@example.com · Max",
    methods: ["browser"],
    acceptsToken: true,
    installed: true,
} as const;

const grokSystem = {
    cli: "grok",
    source: "system",
    methods: ["device"],
    acceptsToken: false,
    installed: true,
} as const;

/** Healthy: Happy's own login, used minutes ago and refreshed since. */
const healthy = account("personal_steve", "Claude", "personal_steve", claudeInternal, {
    plan: "Max",
    activity: {
        signIn: "signed_in",
        lastUsedAt: NOW - 4 * MINUTE,
        login: { refreshedAt: NOW - 12 * MINUTE, expiresAt: NOW + 7 * HOUR, refreshError: null },
    },
});

/** Refreshing has failed for an hour; the access token has three hours left. */
const failing = account("work", "Codex", "work", codexSystem, {
    plan: "Pro",
    activity: {
        signIn: "signed_in",
        systemLogin: true,
        lastUsedAt: NOW - 50 * MINUTE,
        login: {
            refreshedAt: NOW - 5 * HOUR,
            expiresAt: NOW + 3 * HOUR,
            refreshError: {
                status: 503,
                code: "server_error",
                permanent: false,
                since: NOW - HOUR,
                at: NOW - 2 * MINUTE,
            },
        },
    },
});

/** The vendor refused the refresh token: only signing in again helps. */
const revoked = account(
    "robotics",
    "Codex",
    "robotics",
    { ...codexSystem, source: "internal" },
    {
        plan: "Plus",
        status: "not_authenticated",
        activity: {
            signIn: "signed_out",
            lastUsedAt: NOW - 3 * DAY,
            login: {
                refreshedAt: NOW - 3 * DAY,
                expiresAt: NOW - 2 * DAY,
                refreshError: {
                    status: 400,
                    code: "invalid_grant",
                    permanent: true,
                    since: NOW - 2 * DAY - 3 * HOUR,
                    at: NOW - 20 * MINUTE,
                },
            },
        },
    },
);

/** Every state a row's line can be in, and a pool that keeps its summary. */
const accounts: readonly HappyAgentProviderRow[] = [
    healthy,
    account(
        "claude_cli",
        "Claude",
        "claude_cli",
        { ...claudeInternal, source: "system" },
        {
            activity: {
                signIn: "signed_in",
                systemLogin: true,
                lastUsedAt: NOW - 2 * HOUR,
                login: { refreshedAt: null, expiresAt: null, refreshError: null },
            },
        },
    ),
    failing,
    account("grok_lab", "Grok", "grok_lab", grokSystem, {
        activity: {
            signIn: "signed_in",
            systemLogin: true,
            lastUsedAt: NOW - DAY,
            login: {
                refreshedAt: NOW - 9 * HOUR,
                expiresAt: null,
                refreshError: {
                    status: 429,
                    code: null,
                    permanent: false,
                    since: NOW - 30 * MINUTE,
                    at: NOW - 6 * MINUTE,
                },
            },
        },
    }),
    revoked,
    account(
        "grok",
        "Grok",
        "grok",
        { ...grokSystem, running: true },
        {
            status: "not_authenticated",
            activity: { signIn: "signed_out", lastUsedAt: null, login: null },
        },
    ),
    account("codex_new", "Codex", "codex_new", codexSystem, {
        activity: { lastUsedAt: null, login: null },
    }),
    account("codex_old", "Codex", "codex_old", undefined, {
        plan: "Team",
        activity: { signIn: "signed_in", checkedAt: NOW - 3 * MINUTE },
    }),
    account("claude_spare", "Claude", "claude_spare", claudeInternal, {
        enabled: false,
        status: "not_enabled",
        activity: { signIn: "signed_in", lastUsedAt: NOW - 9 * DAY, login: null },
    }),
    {
        enabled: true,
        id: "claude_pool",
        models: healthy.models,
        name: "claude_pool",
        typeName: "Pool",
        serviceTiers: ["Priority"],
        status: "ready",
    },
];

/** An account whose vendor program is missing. */
const missing = account(
    "grok",
    "Grok",
    "grok",
    { ...grokSystem, installed: false },
    {
        status: "not_authenticated",
        activity: { signIn: "signed_out", lastUsedAt: null, login: null },
    },
);

const codexDialog = {
    providerId: "work",
    cli: "codex",
    methods: ["device", "browser"],
    onClose: noop,
    onStart: noop,
    onCodeSubmit: noop,
} as const satisfies HappyAgentProviderSignInDialogProps;

const dialogs: readonly {
    readonly screen: string;
    readonly label: string;
    readonly dialog: HappyAgentProviderSignInDialogProps;
}[] = [
    {
        screen: "08-starting",
        label: "Starting",
        dialog: { ...codexDialog, busy: "start", flow: { kind: "starting" } },
    },
    {
        screen: "09-device-code",
        label: "Waiting on a device code",
        dialog: {
            ...codexDialog,
            flow: {
                kind: "waiting",
                method: "device",
                url: "https://auth.openai.com/codex/device",
                userCode: "KQ7M-4XPD",
                acceptsCode: false,
                openedByProgram: false,
            },
        },
    },
    {
        screen: "10-claude-code",
        label: "Claude, waiting for the code its page shows",
        dialog: {
            providerId: "personal_steve",
            cli: "claude",
            methods: ["browser"],
            onClose: noop,
            onStart: noop,
            onCodeSubmit: noop,
            flow: {
                kind: "waiting",
                method: "browser",
                url: "https://claude.ai/oauth/authorize",
                acceptsCode: true,
                openedByProgram: false,
            },
        },
    },
    {
        screen: "11-succeeded",
        label: "Signed in",
        dialog: { ...codexDialog, account: "ada@example.com · Pro", flow: { kind: "succeeded" } },
    },
    {
        screen: "12-expired",
        label: "Expired",
        dialog: {
            ...codexDialog,
            flow: {
                kind: "failed",
                failure: "expired",
                message: "The code expired before the sign-in finished.",
            },
        },
    },
    {
        screen: "13-save-failed",
        label: "Couldn't save",
        dialog: {
            ...codexDialog,
            flow: {
                kind: "failed",
                failure: "save_failed",
                message: "Codex signed in, but Happy Agent couldn't save its configuration.",
            },
        },
    },
    {
        screen: "14-forbidden",
        label: "Refused: not the team owner",
        dialog: { ...codexDialog, error: "Only the team owner can change how accounts sign in." },
    },
];

function Inference(
    props: Omit<
        HappyAgentProviderSettingsProps,
        "onModelEnabledChange" | "onProviderEnabledChange" | "providers" | "currentTime"
    > & { readonly providers?: readonly HappyAgentProviderRow[] },
) {
    return (
        <HappyAgentSettingsShell
            activeCategoryId="providers"
            categories={categories}
            description="The models agents run on, and the accounts behind them"
            onCategorySelect={noop}
            onClose={noop}
            title="Inference"
        >
            <HappyAgentProviderSettings
                currentTime={NOW}
                onDetailClose={noop}
                onDetailOpen={noop}
                onModelEnabledChange={noop}
                onProviderEnabledChange={noop}
                onSignIn={noop}
                onTokenEditorOpen={noop}
                providers={accounts}
                {...props}
            />
        </HappyAgentSettingsShell>
    );
}

const details: readonly {
    readonly screen: string;
    readonly label: string;
    readonly props: Omit<
        HappyAgentProviderSettingsProps,
        "onModelEnabledChange" | "onProviderEnabledChange" | "providers" | "currentTime"
    > & { readonly providers?: readonly HappyAgentProviderRow[] };
}[] = [
    {
        screen: "02-detail",
        label: "Signed in to Happy, with its plan, refresh, and expiry",
        props: { detail: healthy.id },
    },
    {
        screen: "03-detail-failing",
        label: "Refreshing failing, the login running out within the day",
        props: { detail: failing.id },
    },
    {
        screen: "04-detail-revoked",
        label: "Refused for good: signing in again is the way out",
        props: { detail: revoked.id },
    },
    {
        screen: "05-detail-older-daemon",
        label: "An older Happy Agent, which only says when it last checked",
        props: { detail: "codex_old" },
    },
    {
        screen: "06-detail-owner-only",
        label: "A team member who isn't the owner",
        props: {
            detail: healthy.id,
            signInLocked: "Only the team owner can change how accounts sign in.",
        },
    },
    {
        screen: "07-detail-missing",
        label: "The vendor's program isn't installed",
        props: { detail: missing.id, providers: [missing] },
    },
];

export function HappyAgentProviderSignInPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Settings › Inference: one row per account with a dot and one line saying whether it needs anything, and everything else behind the row — the login with its refresh and expiry, signing in again or updating a token as a step of that, and the models."
            title="HappyAgentProviderSettings"
            width={1180}
        >
            <FullScreenSpecimen
                detail="Healthy, system login, refresh failing, HTTP status only, needs sign-in with and without a date, a sign-in running, not used yet, an older daemon, off, and a pool"
                label="Accounts"
                number="01"
                screen="01-accounts"
                window={WINDOW}
            >
                <Inference />
            </FullScreenSpecimen>
            {details.map((entry, index) => (
                <FullScreenSpecimen
                    detail={entry.label}
                    key={entry.screen}
                    label={`Account details — ${entry.label}`}
                    number={String(index + 2).padStart(2, "0")}
                    screen={entry.screen}
                    window={WINDOW}
                >
                    <div style={{ display: "flex", transform: "translateZ(0)" }}>
                        <Inference {...entry.props} />
                    </div>
                </FullScreenSpecimen>
            ))}
            {dialogs.map((entry, index) => (
                <FullScreenSpecimen
                    detail={`The sign-in step: ${entry.label.toLowerCase()}`}
                    key={entry.screen}
                    label={`Sign in — ${entry.label}`}
                    number={String(index + 2 + details.length).padStart(2, "0")}
                    screen={entry.screen}
                    window={WINDOW}
                >
                    <div style={{ display: "flex", transform: "translateZ(0)" }}>
                        <Inference detail={failing.id} signInDialog={entry.dialog} />
                    </div>
                </FullScreenSpecimen>
            ))}
            <FullScreenSpecimen
                detail="Updating a Claude account's setup token, after a malformed one was refused"
                label="Update a Claude token"
                number={String(2 + details.length + dialogs.length).padStart(2, "0")}
                screen="15-token"
                window={WINDOW}
            >
                <div style={{ display: "flex", transform: "translateZ(0)" }}>
                    <Inference
                        detail={healthy.id}
                        tokenEditor={{
                            error: "That isn't a Claude setup token. It starts with sk-ant-oat01-.",
                            onClose: noop,
                            onTokenSubmit: noop,
                            phase: "failed",
                            providerId: "personal_steve",
                            shell: "posix",
                        }}
                    />
                </div>
            </FullScreenSpecimen>
        </ComponentPage>
    );
}
