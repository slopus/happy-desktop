import {
    conversationActionBlockParse,
    UserError,
    type ChatActionBlock as ChatActionBlockModel,
    type HappyAgentDefaultModelSnapshot,
    type ProviderCli,
} from "happy-desktop-state";
import { ChatActionBlock } from "../../src/ChatActionBlock";
import {
    ChatDefaultModelFigure,
    ChatInviteFigure,
    ChatMembersFigure,
    ChatProviderCliFigure,
    type ChatInviteFigureProps,
    type ChatMembersFigureProps,
} from "../../src/ChatActionFigures";
import { MessageSettingsLinksContext } from "../../src/MessageMarkdown";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-338";

/* Read by the client package's grammar, as a reply's figure is. */
const blockOf = (html: string): ChatActionBlockModel => {
    const block = conversationActionBlockParse(html, 0);
    if (block === undefined) throw new Error(`The client refused a fixture block:\n${html}`);
    return block;
};

/*
 * Fixture data only: no CLI is installed or signed in to draw these, and the
 * account below is made up.
 */
const CODEX: ProviderCli = {
    id: "codex",
    name: "Codex",
    vendor: "OpenAI",
    website: "https://openai.com/codex",
    providerId: "codex",
    installation: { status: "missing", path: null, version: null, source: null, desktopApp: null },
    installer: {
        command: "curl -fsSL https://chatgpt.com/codex/install.sh | CODEX_NON_INTERACTIVE=1 sh",
        sourceUrl: "https://chatgpt.com/codex/install.sh",
        sourceHost: "chatgpt.com",
        vendorSite: "https://openai.com/codex",
    },
    commands: { run: "codex", signIn: "codex login" },
    signIn: { status: "signed_out", account: null, methods: ["browser", "device"] },
    operation: null,
    version: "0199a000-0000-7000-8000-000000000001",
    updatedAt: 0,
};

const GROK: ProviderCli = {
    ...CODEX,
    id: "grok",
    name: "Grok",
    vendor: "xAI",
    website: "https://x.ai",
    providerId: "grok",
    installer: {
        command: "curl -fsSL https://x.ai/cli/install.sh | bash",
        sourceUrl: "https://x.ai/cli/install.sh",
        sourceHost: "x.ai",
        vendorSite: "https://x.ai",
    },
    commands: { run: "grok", signIn: "grok login" },
};

const installed = (cli: ProviderCli, version = "0.61.0"): ProviderCli => ({
    ...cli,
    installation: {
        status: "installed",
        path: `/Users/you/.local/bin/${cli.id}`,
        version,
        source: "standalone",
        desktopApp: null,
    },
});

type Operation = NonNullable<ProviderCli["operation"]>;

const operating = (
    cli: ProviderCli,
    operation: Pick<Operation, "kind" | "status" | "message"> & Partial<Operation>,
): ProviderCli => ({
    ...cli,
    operation: {
        id: "op-1",
        authorization: null,
        output: [],
        error: null,
        startedAt: 0,
        finishedAt: null,
        ...operation,
    },
});

const signedIn = (cli: ProviderCli): ProviderCli => ({
    ...installed(cli),
    signIn: {
        status: "signed_in",
        account: { email: "you@example.com", plan: "Pro" },
        methods: ["browser"],
    },
});

const CLI_STATES: readonly {
    readonly id: string;
    readonly label: string;
    readonly detail: string;
    readonly html: string;
    readonly cli?: ProviderCli;
    readonly requesting?: boolean;
    readonly error?: string;
}[] = [
    {
        id: "C-338a",
        label: "Reading",
        detail: "before the server has described the program",
        html: `<figure data-provider-cli="codex"></figure>`,
    },
    {
        id: "C-338b",
        label: "Missing",
        detail: "the installer it runs and where from · Install and sign in",
        html: `<figure data-provider-cli="codex"></figure>`,
        cli: CODEX,
    },
    {
        id: "C-338c",
        label: "Installing",
        detail: "the server's own sentence · Cancel",
        html: `<figure data-provider-cli="codex"></figure>`,
        cli: operating(CODEX, {
            kind: "install",
            status: "running",
            message: "Downloading Codex from chatgpt.com…",
        }),
    },
    {
        id: "C-338d",
        label: "Signed out",
        detail: "installed, not signed in · Sign in",
        html: `<figure data-provider-cli="codex"></figure>`,
        cli: installed(CODEX),
    },
    {
        id: "C-338e",
        label: "Waiting on the browser",
        detail: "the page to open again, and a code the page may show",
        html: `<figure data-provider-cli="codex"></figure>`,
        cli: operating(installed(CODEX), {
            kind: "sign_in",
            status: "waiting",
            message: "Finish signing in to Codex in your browser.",
            authorization: {
                method: "browser",
                url: "https://auth.openai.com/authorize",
                userCode: null,
                openedByProgram: false,
                acceptsCode: true,
                expiresAt: 0,
            },
        }),
    },
    {
        id: "C-338f",
        label: "Device sign-in",
        detail: "the code to confirm on the vendor's page",
        html: `<figure data-provider-cli="grok"></figure>`,
        cli: operating(installed(GROK, "1.4.2"), {
            kind: "sign_in",
            status: "waiting",
            message: "Open the page and confirm the code.",
            authorization: {
                method: "device",
                url: "https://accounts.x.ai/device",
                userCode: "WDJB-MJHT",
                openedByProgram: false,
                acceptsCode: false,
                expiresAt: 0,
            },
        }),
    },
    {
        id: "C-338g",
        label: "Signed in",
        detail: "the account the program reports",
        html: `<figure data-provider-cli="codex"></figure>`,
        cli: signedIn(CODEX),
    },
    {
        id: "C-338h",
        label: "Failed",
        detail: "the server's error · Try again",
        html: `<figure data-provider-cli="codex"></figure>`,
        cli: operating(installed(CODEX), {
            kind: "sign_in",
            status: "failed",
            message: "Signing in to Codex failed.",
            error: { code: "expired", message: "The sign-in page wasn't finished in time." },
        }),
    },
    {
        id: "C-338i",
        label: "Refused",
        detail: "a request the server turned down, over the state it left",
        html: `<figure data-provider-cli="codex"></figure>`,
        cli: installed(CODEX),
        error: "Happy Agent is busy installing Codex.",
    },
];

const MODELS: HappyAgentDefaultModelSnapshot = {
    loading: false,
    current: { providerId: "codex", modelId: "openai/gpt-6.1-sol", effort: "medium" },
    choices: [
        {
            providerId: "codex",
            providerName: "Codex",
            modelId: "openai/gpt-6.1-sol",
            modelName: "GPT-6.1 Sol",
            efforts: ["low", "medium", "high", "xhigh"],
            defaultEffort: "medium",
        },
        {
            providerId: "claude",
            providerName: "Claude",
            modelId: "anthropic/opus-5-5",
            modelName: "Opus 5.5",
            efforts: ["low", "medium", "high", "max"],
            defaultEffort: "high",
        },
    ],
};

const SETTING_STATES: readonly {
    readonly id: string;
    readonly label: string;
    readonly detail: string;
    readonly state: HappyAgentDefaultModelSnapshot;
}[] = [
    {
        id: "C-338j",
        label: "Default model, reading",
        detail: "before the catalog is read",
        state: { loading: true, choices: [] },
    },
    { id: "C-338k", label: "Default model", detail: "the model and its effort", state: MODELS },
    {
        id: "C-338l",
        label: "Default model, saving",
        detail: "the change asked for, until the server answers",
        state: { ...MODELS, saving: { providerId: "claude", modelId: "anthropic/opus-5-5" } },
    },
    {
        id: "C-338m",
        label: "Default model, refused",
        detail: "the server's reason, over what it still holds",
        state: {
            ...MODELS,
            saveError: new UserError("That model isn't offered by an enabled account."),
        },
    },
];

const ROLES = [
    { id: "owner", name: "Owner" },
    { id: "admin", name: "Admin" },
    { id: "member", name: "Member" },
    { id: "viewer", name: "Viewer" },
];

const INVITE_READY: ChatInviteFigureProps = {
    loading: false,
    roles: ROLES,
    manage: true,
    owner: true,
    creating: false,
    onCreate: () => undefined,
    onCreatedDismiss: () => undefined,
};

/* The code below is made up; a real one is the server's answer to one window. */
const INVITE_STATES: readonly {
    readonly id: string;
    readonly label: string;
    readonly detail: string;
    readonly state: ChatInviteFigureProps;
}[] = [
    {
        id: "C-338o",
        label: "Invite, reading",
        detail: "before the server's roles are read",
        state: { ...INVITE_READY, loading: true, roles: [] },
    },
    {
        id: "C-338p",
        label: "Invite",
        detail: "the role the reply suggested · Create invite code",
        state: INVITE_READY,
    },
    {
        id: "C-338q",
        label: "Invite, creating",
        detail: "the code asked for, until the server answers",
        state: { ...INVITE_READY, creating: true },
    },
    {
        id: "C-338r",
        label: "Invite code",
        detail: "shown here this once · Copy · Make another",
        state: {
            ...INVITE_READY,
            created: {
                code: "QX7M-4KDP",
                detail: "Joins acme as Member · Expires in 7 days · Shown only here",
            },
        },
    },
    {
        id: "C-338r2",
        label: "Invite code, ready message",
        detail: "Copy invite puts a ready message on the clipboard · Copy code · Make another",
        state: {
            ...INVITE_READY,
            created: {
                code: "QX7M-4KDP",
                detail: "Joins acme as Member · Expires in 7 days · Shown only here",
                message:
                    "Join @acme on Happy. Get the app at happy.engineering, choose Join a team, and enter @acme with this invite code: QX7M-4KDP. It works for 7 days.",
            },
        },
    },
    {
        id: "C-338s",
        label: "Invite, refused",
        detail: "the server's reason, over the role still picked",
        state: { ...INVITE_READY, error: "Invites need the accounts service, which is down." },
    },
    {
        id: "C-338t",
        label: "Invite, not allowed",
        detail: "someone who may not invite",
        state: { ...INVITE_READY, manage: false, owner: false },
    },
];

const MEMBERS_READY: ChatMembersFigureProps = {
    loading: false,
    summary: "2 people · 1 code waiting",
    rows: [
        {
            id: "acc-olga",
            kind: "member",
            name: "Olga Petrova (you)",
            role: "Owner",
            status: "Joined Nov 8",
            pending: false,
            saving: false,
        },
        {
            id: "acc-sam",
            kind: "member",
            name: "Sam Lee",
            role: "Member",
            status: "Hasn't opened acme yet",
            pending: true,
            saving: false,
        },
        {
            id: "inv-1",
            kind: "invite",
            name: "Invite code",
            role: "Admin",
            status: "Waiting · Expires in 7 days",
            pending: true,
            saving: false,
        },
    ],
    onInviteRevoke: () => undefined,
};

const MEMBERS_STATES: readonly {
    readonly id: string;
    readonly label: string;
    readonly detail: string;
    readonly state: ChatMembersFigureProps;
}[] = [
    {
        id: "C-338u",
        label: "Members, reading",
        detail: "before the server answers",
        state: { ...MEMBERS_READY, loading: true, rows: [] },
    },
    {
        id: "C-338v",
        label: "Members",
        detail: "joined, not here yet, and a waiting code · Revoke",
        state: MEMBERS_READY,
    },
    {
        id: "C-338w",
        label: "Members, many",
        detail: "past two rows the list scrolls in place",
        state: {
            ...MEMBERS_READY,
            summary: "4 people · 1 code waiting",
            rows: [
                ...MEMBERS_READY.rows.slice(0, 2),
                {
                    id: "acc-vera",
                    kind: "member",
                    name: "Vera Novak",
                    role: "Viewer",
                    status: "Joined Nov 9",
                    pending: false,
                    saving: false,
                },
                {
                    id: "acc-ada",
                    kind: "member",
                    name: "Ada Quinn",
                    role: "Admin",
                    status: "Joined Nov 9",
                    pending: false,
                    saving: false,
                },
                ...MEMBERS_READY.rows.slice(2),
            ],
        },
    },
    {
        id: "C-338x",
        label: "Members, as a viewer",
        detail: "who is on the server, with nothing to revoke",
        state: {
            loading: false,
            summary: "2 people",
            rows: MEMBERS_READY.rows.slice(0, 2),
        },
    },
];

const INVITE = blockOf(`<figure data-invite data-role="member"></figure>`);
const MEMBERS = blockOf(`<figure data-members></figure>`);
const DEFAULT_MODEL = blockOf(`<figure data-setting="default-model"></figure>`);
const TEAM_PROVIDERS = blockOf(`<figure data-providers data-scope="team"></figure>`);
const SETTINGS_LINKS = { has: () => true, open: () => undefined };

const column = { display: "flex", flexDirection: "column", gap: "10px", width: "600px" } as const;

export function ChatActionFiguresPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="The live figures an agent may put in a reply: one provider CLI with its install and sign-in, the default model for new chats, a team server's invite and members, and its way into Settings for the rest. Each fills one fixed box whatever state it is in, so the height the transcript reserved never changes. Every specimen here is fixture data; nothing is installed or signed in to draw it."
            title="Chat action figures"
        >
            <div className="specimen-grid">
                {CLI_STATES.map((state) => (
                    <Specimen
                        detail={`${state.detail} · fixture data`}
                        key={state.id}
                        label={state.label}
                        number={state.id}
                        stage="surface"
                    >
                        <div style={column}>
                            <DimensionRule label="560 wide · 112 fixed" />
                            <ChatActionBlock
                                block={blockOf(state.html)}
                                figures={{
                                    providerCli: (cliId) => (
                                        <ChatProviderCliFigure
                                            cliId={cliId}
                                            {...(state.cli ? { cli: state.cli } : {})}
                                            {...(state.error ? { error: state.error } : {})}
                                            onCancel={() => undefined}
                                            onCodeSend={() => undefined}
                                            onInstall={() => undefined}
                                            onPageOpen={() => undefined}
                                            onSignIn={() => undefined}
                                            spinnerFrame={0}
                                        />
                                    ),
                                }}
                            />
                        </div>
                    </Specimen>
                ))}
            </div>

            <div className="specimen-grid">
                {INVITE_STATES.map((state) => (
                    <Specimen
                        detail={`${state.detail} · fixture data`}
                        key={state.id}
                        label={state.label}
                        number={state.id}
                        stage="surface"
                    >
                        <div style={column}>
                            <DimensionRule label="560 wide · 96 fixed" />
                            <ChatActionBlock
                                block={INVITE}
                                figures={{
                                    invite: (role) => (
                                        <ChatInviteFigure
                                            {...state.state}
                                            {...(role ? { role } : {})}
                                            spinnerFrame={0}
                                        />
                                    ),
                                }}
                            />
                        </div>
                    </Specimen>
                ))}
                {MEMBERS_STATES.map((state) => (
                    <Specimen
                        detail={`${state.detail} · fixture data`}
                        key={state.id}
                        label={state.label}
                        number={state.id}
                        stage="surface"
                    >
                        <div style={column}>
                            <DimensionRule label="560 wide · 104 fixed" />
                            <ChatActionBlock
                                block={MEMBERS}
                                figures={{
                                    members: () => (
                                        <ChatMembersFigure {...state.state} spinnerFrame={0} />
                                    ),
                                }}
                            />
                        </div>
                    </Specimen>
                ))}
            </div>

            <div className="specimen-grid">
                {SETTING_STATES.map((state) => (
                    <Specimen
                        detail={`${state.detail} · fixture data`}
                        key={state.id}
                        label={state.label}
                        number={state.id}
                        stage="surface"
                    >
                        <div style={column}>
                            <DimensionRule label="560 wide · 96 fixed" />
                            <ChatActionBlock
                                block={DEFAULT_MODEL}
                                figures={{
                                    defaultModel: (
                                        <ChatDefaultModelFigure
                                            onChange={() => undefined}
                                            spinnerFrame={0}
                                            state={state.state}
                                        />
                                    ),
                                }}
                            />
                        </div>
                    </Specimen>
                ))}
                <Specimen
                    detail="a team server's providers, as the way into its Settings page"
                    label="Team providers"
                    number="C-338n"
                    stage="surface"
                >
                    <MessageSettingsLinksContext.Provider value={SETTINGS_LINKS}>
                        <div style={column}>
                            <DimensionRule label="560 wide · 92 fixed" />
                            <ChatActionBlock
                                block={TEAM_PROVIDERS}
                                figures={{ teamSettings: true }}
                            />
                        </div>
                    </MessageSettingsLinksContext.Provider>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
