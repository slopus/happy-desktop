import {
    HappyAgentProviderSettings,
    HappyAgentSettingsShell,
    type HappyAgentProviderRow,
    type HappyAgentProviderSettingsProps,
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

/** The system login with a device code waiting, Happy's own sign-in, a config-file credential, and an expired attempt. */
const overview: readonly HappyAgentProviderRow[] = [
    account("codex", "Codex", "Work", {
        cli: "codex",
        source: "system",
        methods: ["device", "browser"],
        acceptsToken: false,
        installed: true,
        flow: {
            kind: "waiting",
            method: "device",
            url: "https://auth.openai.com/codex/device",
            userCode: "KQ7M-4XPD",
            acceptsCode: false,
            openedByProgram: false,
        },
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
            flow: {
                kind: "failed",
                failure: "expired",
                message: "The code expired before the sign-in finished.",
            },
        },
        "not_authenticated",
    ),
];

/** Claude waiting for its pasted code, a sign-in starting, one that succeeded, and one that couldn't be saved. */
const progress: readonly HappyAgentProviderRow[] = [
    account("claude_team", "Claude", "Team", {
        cli: "claude",
        source: "system",
        methods: ["browser"],
        acceptsToken: true,
        installed: true,
        flow: {
            kind: "waiting",
            method: "browser",
            url: "https://claude.ai/oauth/authorize",
            acceptsCode: true,
            openedByProgram: false,
        },
    }),
    account("codex", "Codex", "Work", {
        cli: "codex",
        source: "system",
        methods: ["device"],
        acceptsToken: false,
        installed: true,
        busy: "start",
        flow: { kind: "starting" },
    }),
    account("grok", "Grok", "Current CLI", {
        cli: "grok",
        source: "internal",
        account: "ada@example.com",
        methods: ["device"],
        acceptsToken: false,
        installed: true,
        flow: { kind: "succeeded" },
    }),
    account("codex_lab", "Codex", "Lab", {
        cli: "codex",
        source: "system",
        methods: ["device"],
        acceptsToken: false,
        installed: true,
        flow: {
            kind: "failed",
            failure: "save_failed",
            message: "Codex signed in, but Happy Agent couldn't save its configuration.",
        },
    }),
];

const ownerOnly: readonly HappyAgentProviderRow[] = [
    account("codex", "Codex", "Work", {
        cli: "codex",
        source: "system",
        methods: ["device"],
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
];

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
                onSignInCancel={noop}
                onSignInCodeSubmit={noop}
                onSignInStart={noop}
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
            summary="Settings › Inference: where each Codex, Claude, and Grok account's credential comes from, and signing it in again to a login only Happy uses. The flow runs in place under the account's name: the device code, the vendor's page, the code to paste back, and how it ended."
            title="HappyAgentProviderSignIn"
            width={1180}
        >
            <FullScreenSpecimen
                detail="The system login with a device code waiting, Happy's own sign-in, a config-file credential, and an expired attempt"
                label="Account sign-in"
                number="01"
                screen="01-sign-in"
                window={WINDOW}
            >
                <Inference providers={overview} />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="Claude waiting for the code its page shows, a sign-in starting, one that succeeded, and one that couldn't be saved"
                label="Account sign-in in progress"
                number="02"
                screen="02-sign-in-progress"
                window={WINDOW}
            >
                <Inference providers={progress} />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="A team member who isn't the owner sees where each account stands but can't change it"
                label="Account sign-in, owner only"
                number="03"
                screen="03-sign-in-owner-only"
                window={WINDOW}
            >
                <Inference
                    providers={ownerOnly}
                    signInLocked="Only the team owner can change how accounts sign in."
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="An account whose vendor program isn't installed on the Happy Agent's computer"
                label="Account sign-in, program missing"
                number="04"
                screen="04-sign-in-missing"
                window={WINDOW}
            >
                <Inference providers={missing} />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="Updating a Claude account's setup token, after a malformed one was refused"
                label="Update a Claude token"
                number="05"
                screen="05-sign-in-token"
                window={WINDOW}
            >
                <div style={{ display: "flex", transform: "translateZ(0)" }}>
                    <Inference
                        providers={ownerOnly}
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
