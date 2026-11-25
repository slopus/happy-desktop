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

/** One subscription account's card, with one model. */
function account(
    id: string,
    typeName: "Codex" | "Claude" | "Grok",
    name: string,
    signIn: HappyAgentProviderRow["signIn"],
    status: HappyAgentProviderRow["status"] = "ready",
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
        status,
        ...(signIn ? { signIn } : {}),
    };
}

/** The system login, Happy's own sign-in with its account, a config-file credential, and a sign-in running from another window. */
const accounts: readonly HappyAgentProviderRow[] = [
    account("codex", "Codex", "Work", {
        cli: "codex",
        source: "system",
        methods: ["device", "browser"],
        acceptsToken: false,
        installed: true,
    }),
    account("claude", "Claude", "Personal", {
        cli: "claude",
        source: "internal",
        account: "ada@example.com · Max",
        methods: ["browser"],
        acceptsToken: true,
        installed: true,
    }),
    account("codex_robotics", "Codex", "Robotics", {
        cli: "codex",
        source: "configured",
        methods: ["device"],
        acceptsToken: false,
        installed: true,
    }),
    account(
        "grok",
        "Grok",
        "Current CLI",
        {
            cli: "grok",
            source: "system",
            methods: ["device"],
            acceptsToken: false,
            installed: true,
            running: true,
        },
        "not_authenticated",
    ),
];

/** An account whose vendor program is missing. */
const missing: readonly HappyAgentProviderRow[] = [
    account(
        "grok",
        "Grok",
        "Current CLI",
        {
            cli: "grok",
            source: "system",
            methods: ["device"],
            acceptsToken: false,
            installed: false,
        },
        "not_authenticated",
    ),
];

const codexDialog = {
    providerName: "Codex · Work",
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
        screen: "02-starting",
        label: "Starting",
        dialog: { ...codexDialog, busy: "start", flow: { kind: "starting" } },
    },
    {
        screen: "03-device-code",
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
        screen: "04-claude-code",
        label: "Claude, waiting for the code its page shows",
        dialog: {
            providerName: "Claude · Team",
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
        screen: "05-succeeded",
        label: "Signed in",
        dialog: { ...codexDialog, account: "ada@example.com · Pro", flow: { kind: "succeeded" } },
    },
    {
        screen: "06-expired",
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
        screen: "07-save-failed",
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
        screen: "08-forbidden",
        label: "Refused: not the team owner",
        dialog: { ...codexDialog, error: "Only the team owner can change how accounts sign in." },
    },
];

function Inference(
    props: Omit<
        HappyAgentProviderSettingsProps,
        "onModelEnabledChange" | "onProviderEnabledChange"
    >,
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
                onModelEnabledChange={noop}
                onProviderEnabledChange={noop}
                onSignIn={noop}
                onTokenEditorOpen={noop}
                {...props}
            />
        </HappyAgentSettingsShell>
    );
}

export function HappyAgentProviderSignInPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Settings › Inference: where each Codex, Claude, and Grok account's credential comes from, as one row on its card, and signing it in again to a login only Happy uses, in a dialog: the device code, the vendor's page, the code to paste back, and how it ended."
            title="HappyAgentProviderSignIn"
            width={1180}
        >
            <FullScreenSpecimen
                detail="The system login, Happy's own sign-in, a config-file credential, and a sign-in running from another window"
                label="Account credentials"
                number="01"
                screen="01-accounts"
                window={WINDOW}
            >
                <Inference providers={accounts} />
            </FullScreenSpecimen>
            {dialogs.map((entry, index) => (
                <FullScreenSpecimen
                    detail={`The sign-in dialog: ${entry.label.toLowerCase()}`}
                    key={entry.screen}
                    label={`Sign in — ${entry.label}`}
                    number={String(index + 2).padStart(2, "0")}
                    screen={entry.screen}
                    window={WINDOW}
                >
                    <div style={{ display: "flex", transform: "translateZ(0)" }}>
                        <Inference providers={accounts} signInDialog={entry.dialog} />
                    </div>
                </FullScreenSpecimen>
            ))}
            <FullScreenSpecimen
                detail="A team member who isn't the owner sees where each account stands but can't change it"
                label="Account credentials, owner only"
                number="09"
                screen="09-owner-only"
                window={WINDOW}
            >
                <Inference
                    providers={accounts.slice(0, 2)}
                    signInLocked="Only the team owner can change how accounts sign in."
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="An account whose vendor program isn't installed on the Happy Agent's computer"
                label="Account credentials, program missing"
                number="10"
                screen="10-missing"
                window={WINDOW}
            >
                <Inference providers={missing} />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="Updating a Claude account's setup token, after a malformed one was refused"
                label="Update a Claude token"
                number="11"
                screen="11-token"
                window={WINDOW}
            >
                <div style={{ display: "flex", transform: "translateZ(0)" }}>
                    <Inference
                        providers={accounts}
                        tokenEditor={{
                            error: "That isn't a Claude setup token. It starts with sk-ant-oat01-.",
                            onClose: noop,
                            onTokenSubmit: noop,
                            phase: "failed",
                            providerName: "Personal",
                            shell: "posix",
                        }}
                    />
                </div>
            </FullScreenSpecimen>
        </ComponentPage>
    );
}
