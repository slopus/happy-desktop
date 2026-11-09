import {
    type ChatUiGranted,
    type ConversationMediaItem,
    type ConversationQuickReplies,
    type ConversationUi,
    type ConversationUiAttempt,
    type HappyAgentDefaultModelSnapshot,
    type ProviderCli,
    type UiActionResponse,
    type UiComponent,
} from "happy-desktop-state";
import {
    UiComputeJoin,
    UiDefaultModel,
    UiGithubConnect,
    UiInvite,
    UiProviderSignIn,
} from "../../src/ui/UiLiveWidgets";
import { UiDocumentView, type UiDocumentViewProps } from "../../src/ui/UiDocumentView";
import { UiQuickReplies } from "../../src/ui/UiQuickReplies";
import { Message } from "../../src/Message";
import type { ChatUiLive } from "../../src/ui/UiWidgetControl";
import { ComponentPage, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-338";

/* Fixture documents only: nothing here was sent by a daemon. */
const OFFER = { messageId: "msgfixture01", uiId: "uifixture01" };

const documentOf = (
    components: readonly UiComponent[],
    extra: Partial<Pick<ConversationUi, "media" | "attempts">> = {},
): ConversationUi => ({
    offer: OFFER,
    document: { id: OFFER.uiId, components: [...components] },
    media: extra.media ?? [],
    attempts: extra.attempts ?? new Map(),
});

const FILE_TREE: UiComponent = {
    id: "tree",
    type: "file_tree",
    fallback: "weather-cli: src/index.ts, src/forecast.ts, package.json",
    props: {
        paths: [
            "weather-cli/src/index.ts",
            "weather-cli/src/forecast.ts",
            "weather-cli/package.json",
        ],
    },
};

const MEDIA: readonly ConversationMediaItem[] = [
    {
        kind: "image",
        name: "landscape.webp",
        mimeType: "image/webp",
        size: 0,
        width: 1600,
        height: 900,
        url: new URL("../assets/crop-landscape.webp", import.meta.url).href,
    },
    {
        kind: "image",
        name: "portrait.webp",
        mimeType: "image/webp",
        size: 0,
        width: 900,
        height: 1600,
        url: new URL("../assets/crop-portrait.webp", import.meta.url).href,
    },
];

const IMAGES: UiComponent = {
    id: "shots",
    type: "images",
    fallback: "Two screenshots",
    props: {
        images: [
            { mediaIndex: 0, alt: "The forecast, wide" },
            { mediaIndex: 1, alt: "The forecast on a phone" },
        ],
        columns: 2,
    },
};

/* A type from a newer daemon, which this build has never heard of. */
const UNKNOWN = {
    id: "future",
    type: "calendar_pick",
    fallback: "Pick a time for the call: Tue 10:00, Wed 14:00",
    props: {},
} as unknown as UiComponent;

const act = (): Promise<UiActionResponse> => new Promise(() => undefined);

const CODEX: ProviderCli = {
    id: "codex",
    name: "Codex",
    vendor: "OpenAI",
    website: "https://openai.com/codex",
    providerId: "codex",
    installation: {
        status: "installed",
        path: "/Users/you/.local/bin/codex",
        version: "0.61.0",
        source: "standalone",
        desktopApp: null,
    },
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

const CODEX_SIGNED_IN: ProviderCli = {
    ...CODEX,
    signIn: {
        status: "signed_in",
        account: { email: "you@example.com", plan: "Pro" },
        methods: ["browser"],
    },
};

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
    ],
};

const providerSignIn = (provider: string): UiComponent =>
    ({
        id: `sign-in-${provider}`,
        type: "provider_sign_in",
        fallback: `Sign in to ${provider}`,
        props: { provider },
    }) as UiComponent;

const LIVE: ChatUiLive = {
    provider_sign_in: (_component, control) => (
        <UiProviderSignIn cli={CODEX} control={control} provider="codex" />
    ),
    default_model: (_component, control) => <UiDefaultModel control={control} state={MODELS} />,
    invite: (_component, control) => (
        <UiInvite
            control={control}
            createdWords={() => ({ detail: "Joins acme as Member · Shown only here" })}
            figure={{
                loading: false,
                owner: true,
                roles: [
                    { id: "admin", name: "Admin" },
                    { id: "member", name: "Member" },
                ],
            }}
        />
    ),
};

const LIVE_TEAM: ChatUiLive = {
    github_connect: (_component, control) => (
        <UiGithubConnect connectedAs="octo-you" control={control} />
    ),
    compute_join: (_component, control) => (
        <UiComputeJoin
            control={control}
            machines={{
                loading: false,
                name: "Build machines",
                machines: [
                    { id: "n1", name: "mac-mini-studio", status: "online" },
                    { id: "n2", name: "linux-builder-2", status: "enrolling" },
                ],
            }}
        />
    ),
};

const LIVE_SIGNED_IN: ChatUiLive = {
    provider_sign_in: (_component, control) => (
        <UiProviderSignIn cli={CODEX_SIGNED_IN} control={control} provider="codex" />
    ),
};

const VIEWER: ChatUiGranted = new Set();

const REPLIES: ConversationQuickReplies = {
    messageId: "msgfixture02",
    toolCallId: "callfixture01",
    options: ["Write code", "Plan a launch", "Just look around"],
};

const REPLIES_LONG: ConversationQuickReplies = {
    messageId: "msgfixture03",
    options: [
        "Yes, ship it",
        "Not yet — run the slow browser suite first",
        "Show me the diff",
        "Explain what changed in the sync code and why it is safe",
        "Stop",
    ],
};

const SPECIMENS: readonly {
    readonly id: string;
    readonly label: string;
    readonly detail: string;
    readonly view: UiDocumentViewProps;
}[] = [
    {
        id: "C-338g",
        label: "File tree",
        detail: "paths as a tree, every folder open",
        view: { ui: documentOf([FILE_TREE]) },
    },
    {
        id: "C-338h",
        label: "Images",
        detail: "a show_ui call's pictures, in two columns",
        view: { ui: documentOf([IMAGES], { media: MEDIA }) },
    },
    {
        id: "C-338i",
        label: "Fallback",
        detail: "a type this build doesn't know, and one this server doesn't serve",
        view: { ui: documentOf([UNKNOWN, FILE_TREE]), served: new Set(["images"]) },
    },
    {
        id: "C-338j",
        label: "Provider sign-in",
        detail: "Sign in, or paste a setup token",
        view: { ui: documentOf([providerSignIn("codex")]), live: LIVE, onAction: act },
    },
    {
        id: "C-338j2",
        label: "Provider sign-in, already signed in",
        detail: "Use Codex connects it as it is",
        view: { ui: documentOf([providerSignIn("codex")]), live: LIVE_SIGNED_IN, onAction: act },
    },
    {
        id: "C-338j3",
        label: "Provider sign-in, viewer",
        detail: "controls drawn disabled, and why",
        view: {
            ui: documentOf([providerSignIn("codex")]),
            live: LIVE,
            granted: VIEWER,
            onAction: act,
        },
    },
    {
        id: "C-338k",
        label: "Provider sign-in, token refused",
        detail: "the record's reason, inside the widget",
        view: {
            ui: documentOf([providerSignIn("codex")], {
                attempts: new Map([
                    [
                        "sign-in-codex",
                        {
                            action: { type: "provider_sign_in.submit_token", payload: {} },
                            outcome: {
                                status: "rejected",
                                code: "token_rejected",
                                reason: "Codex didn't accept that token.",
                            },
                        } as ConversationUiAttempt,
                    ],
                ]),
            }),
            live: LIVE,
            onAction: act,
        },
    },
    {
        id: "C-338l2",
        label: "GitHub linked, and a pool's machines",
        detail: "the card flips when the credential appears; machines join live",
        view: {
            ui: documentOf([
                {
                    id: "github",
                    type: "github_connect",
                    fallback: "Connect GitHub",
                    props: {},
                } as UiComponent,
                {
                    id: "join",
                    type: "compute_join",
                    fallback: "Add a computer",
                    props: {},
                } as UiComponent,
            ]),
            live: LIVE_TEAM,
            onAction: act,
        },
    },
    {
        id: "C-338l",
        label: "Default model and invite",
        detail: "live widgets, each in its fixed box",
        view: {
            ui: documentOf([
                {
                    id: "model",
                    type: "default_model",
                    fallback: "Default model",
                    props: {},
                } as UiComponent,
                {
                    id: "invite",
                    type: "invite",
                    fallback: "Invite a teammate",
                    props: {},
                } as UiComponent,
            ]),
            live: LIVE,
            onAction: act,
        },
    },
];

export function ChatUiPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Chat UI: a document's components drawn top to bottom, 16px apart, on the reply's measure. Unknown or unserved types show the server's fallback line; live widgets keep one fixed box."
            title="Chat UI"
        >
            <div className="specimen-grid">
                {SPECIMENS.map((specimen) => (
                    <Specimen
                        detail={specimen.detail}
                        key={specimen.id}
                        label={specimen.label}
                        number={specimen.id}
                        stage="surface"
                    >
                        <div
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                padding: "24px",
                                width: "600px",
                            }}
                        >
                            <UiDocumentView {...specimen.view} />
                        </div>
                    </Specimen>
                ))}
                <Specimen
                    detail="one outline pill per option, under the latest agent message"
                    label="Quick replies"
                    number="C-338m"
                    stage="surface"
                >
                    <div style={{ display: "flex", padding: "24px", width: "600px" }}>
                        <UiQuickReplies onSend={() => undefined} replies={REPLIES} />
                    </div>
                </Specimen>
                <Specimen
                    detail="long options wrap onto further rows"
                    label="Quick replies, wrapping"
                    number="C-338n"
                    stage="surface"
                >
                    <div style={{ display: "flex", padding: "24px", width: "600px" }}>
                        <UiQuickReplies onSend={() => undefined} replies={REPLIES_LONG} />
                    </div>
                </Specimen>
                <Specimen
                    detail="no way to write: the pills are drawn disabled"
                    label="Quick replies, read-only"
                    number="C-338o"
                    stage="surface"
                >
                    <div style={{ display: "flex", padding: "24px", width: "600px" }}>
                        <UiQuickReplies replies={REPLIES} />
                    </div>
                </Specimen>
                <Specimen
                    detail="a tapped pill is the person's own message, marked with where it came from"
                    label="Sent from a suggestion"
                    number="C-338p"
                    stage="surface"
                >
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            padding: "24px",
                            width: "600px",
                        }}
                    >
                        <Message
                            author="You"
                            authorNote="↩ suggested by Happy"
                            body="Plan a launch"
                            initials="Y"
                            own
                            time="10:52"
                        />
                    </div>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
