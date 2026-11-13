import type { ReactNode } from "react";
import { CloudOnboardingPluginDialog } from "../../src/CloudOnboardingPluginDialog";
import {
    CloudOnboardingScreen,
    type CloudOnboardingScreenProps,
} from "../../src/CloudOnboardingScreen";
import { ThemeScope, type ThemeMode } from "../../src/ThemeScope";
import { ComponentPage, FullScreenSpecimen } from "../kit";

/** The component plan this page documents. */
export const componentNumber = "P-046";

const WINDOWS = [
    { height: 760, width: 1100 },
    { height: 640, width: 720 },
] as const;
const noop = () => undefined;
const photoUrl = new URL("../assets/profile-photo.webp", import.meta.url).href;

const STEPS = [
    { id: "profile", label: "Profile" },
    { id: "adminBot", label: "Admin bot" },
    { id: "inference", label: "AI" },
    { id: "plugins", label: "Plugins" },
    { id: "teammates", label: "Team" },
    { id: "mobileApp", label: "Phone" },
    { id: "paymentMethod", label: "Payment" },
];
const APP_STORE = "https://apps.apple.com/us/app/happy-claude-code-client/id6748571505";
const PLAY_STORE = "https://play.google.com/store/apps/details?id=com.ex3ndr.happy";

const ADMIN_BOT_DESCRIPTION =
    "This is your server's admin bot. It has expanded capabilities: it can change the server's settings, connect tools and create other bots, so it can adapt Happy and build a system around how your team works. Only owners can talk to it.";
const ADMIN_BOT_LEAD = "It has expanded capabilities, so it can shape Happy around your team.";
const ADMIN_BOT_POINTS = [
    "Changes this server's settings when you ask",
    "Connects your tools and creates the bots you need",
    "Builds a system around how your team works",
];

type Screen = {
    readonly id: string;
    readonly label: string;
    readonly props: Omit<CloudOnboardingScreenProps, "appearance" | "steps">;
    /** A dialog open over the gate. */
    readonly dialog?: ReactNode;
};

const screens: readonly Screen[] = [
    {
        id: "profile",
        label: "Profile",
        props: {
            currentStep: "profile",
            serverLabel: "Acme",
            action: { label: "Continue", onSelect: noop },
            view: {
                kind: "profile",
                ask: "profile",
                busy: false,
                name: "Steve Korshakov",
                photoUrl,
                placeholderSeed: "acme",
                onNameChange: noop,
                onSubmit: noop,
                onPhotoChoose: noop,
                onPhotoCropCancel: noop,
                onPhotoCropConfirm: noop,
            },
        },
    },
    {
        id: "admin-bot",
        label: "Admin bot",
        props: {
            currentStep: "adminBot",
            serverLabel: "Acme",
            action: { label: "Continue", onSelect: noop },
            view: {
                kind: "adminBot",
                title: "Name your admin bot",
                description: ADMIN_BOT_LEAD,
                points: ADMIN_BOT_POINTS,
                note: "Only owners can talk to it.",
                name: "Chief of Staff",
                avatarUrl: null,
                placeholderSeed: "chief-of-staff",
                busy: false,
                onNameChange: noop,
                onSubmit: noop,
            },
        },
    },
    {
        id: "admin-bot-plain",
        label: "Admin bot · one description",
        props: {
            currentStep: "adminBot",
            serverLabel: "Acme",
            action: { label: "Continue", onSelect: noop },
            skip: { onSelect: noop },
            view: {
                kind: "adminBot",
                title: "Name your admin bot",
                description: ADMIN_BOT_DESCRIPTION,
                points: [],
                note: "",
                name: "Chief of Staff",
                avatarUrl: null,
                placeholderSeed: "chief-of-staff",
                busy: false,
                onNameChange: noop,
                onSubmit: noop,
            },
        },
    },
    {
        id: "inference",
        label: "AI",
        props: {
            currentStep: "inference",
            serverLabel: "Acme",
            action: { label: "Continue", onSelect: noop },
            skip: { onSelect: noop },
            view: {
                kind: "inference",
                options: [
                    { id: "chatgpt", connected: false, onSelect: noop },
                    { id: "claude", connected: true },
                    { id: "grok", connected: false, onSelect: noop },
                    { id: "custom", connected: false, onSelect: noop },
                ],
            },
        },
    },
    {
        id: "plugins",
        label: "Plugins",
        props: {
            currentStep: "plugins",
            serverLabel: "Acme",
            action: { label: "Continue", disabled: true, onSelect: noop },
            footnote: "Connect GitHub to continue.",
            view: {
                kind: "plugins",
                plugins: [
                    {
                        id: "github",
                        name: "GitHub",
                        description: "Repositories, issues and pull requests",
                        image: null,
                        required: true,
                        state: "setup",
                        onSelect: noop,
                    },
                    {
                        id: "linear",
                        name: "Linear",
                        description: "Issues, projects and cycles",
                        image: null,
                        required: false,
                        state: "connected",
                    },
                    {
                        id: "slack",
                        name: "Slack",
                        description: "Channels and messages",
                        image: null,
                        required: false,
                        state: "available",
                        busy: true,
                        onSelect: noop,
                    },
                ],
            },
        },
    },
    {
        id: "plugins-token",
        label: "Plugins, signing in with a token",
        props: {
            currentStep: "plugins",
            serverLabel: "Acme",
            action: { label: "Continue", disabled: true, onSelect: noop },
            footnote: "Connect GitHub to continue.",
            view: {
                kind: "plugins",
                plugins: [
                    {
                        id: "github",
                        name: "GitHub",
                        description: "Repositories, issues and pull requests",
                        image: null,
                        required: true,
                        state: "setup",
                        onSelect: noop,
                    },
                ],
            },
        },
        dialog: (
            <CloudOnboardingPluginDialog
                description="Repositories, issues and pull requests"
                image={null}
                installation={{
                    id: "inst-github",
                    pluginId: "github",
                    name: "GitHub",
                    ordinal: 1,
                    label: null,
                    status: "notConfigured",
                    error: null,
                    authMethod: null,
                    toolPrefix: null,
                    image: null,
                    available: true,
                }}
                methods={[
                    {
                        type: "fields",
                        id: "token",
                        label: "Access token",
                        fields: [
                            {
                                key: "token",
                                label: "Personal access token",
                                help: "A fine-grained token with read access to the repositories agents work in.",
                                required: true,
                                secret: true,
                                multiline: false,
                            },
                        ],
                    },
                    { type: "oauth", id: "app", label: "GitHub App", scopes: [] },
                ]}
                name="GitHub"
                onClose={noop}
                onConfigure={async () => undefined}
                onConnect={async () => undefined}
            />
        ),
    },
    {
        id: "teammates",
        label: "Team",
        props: {
            currentStep: "teammates",
            serverLabel: "Acme",
            action: { label: "Continue", onSelect: noop },
            skip: { onSelect: noop },
            view: {
                kind: "teammates",
                email: "kirill@acme.dev",
                busy: false,
                invites: [
                    { id: "i2", email: "anna@acme.dev", delivery: "sent" },
                    { id: "i1", email: "lee@acme.dev", delivery: "failed" },
                ],
                onEmailChange: noop,
                onInvite: noop,
                onLinkCreate: noop,
            },
        },
    },
    {
        id: "teammates-link",
        label: "Team · email unavailable",
        props: {
            currentStep: "teammates",
            serverLabel: "Acme",
            action: { label: "Continue", onSelect: noop },
            view: {
                kind: "teammates",
                email: "",
                busy: false,
                invites: [],
                link: "https://acme.happybases.com/invite/7Hq2mZpX4t",
                error: "This server can't send email. Share this link instead.",
                onEmailChange: noop,
                onInvite: noop,
            },
        },
    },
    {
        id: "mobile",
        label: "Phone",
        props: {
            currentStep: "mobileApp",
            serverLabel: "Acme",
            action: { label: "Continue", disabled: true, onSelect: noop },
            skip: { onSelect: noop },
            view: {
                kind: "mobileApp",
                appStoreUrl: APP_STORE,
                playStoreUrl: PLAY_STORE,
                registered: false,
            },
        },
    },
    {
        id: "payment-method",
        label: "Payment method",
        props: {
            currentStep: "paymentMethod",
            serverLabel: "Acme",
            action: { label: "Add a card", onSelect: noop },
            view: {
                kind: "payment",
                ask: "method",
                method: null,
                balance: null,
                detail: "With it on file, adding credit later takes one step.",
                testMode: true,
                waiting: false,
            },
        },
    },
    {
        id: "payment-credit",
        label: "Credit",
        props: {
            currentStep: "paymentMethod",
            serverLabel: "Acme",
            action: { label: "Add $25", busy: true, onSelect: noop },
            view: {
                kind: "payment",
                ask: "credit",
                method: "Visa •••• 4242",
                balance: "$0.00",
                detail: "Owners can cap what agents spend each month in Settings.",
                testMode: false,
                amounts: [
                    { id: "1000", label: "$10" },
                    { id: "2500", label: "$25" },
                    { id: "5000", label: "$50" },
                    { id: "10000", label: "$100" },
                ],
                amount: "2500",
                onAmountSelect: noop,
                waiting: true,
            },
        },
    },
    {
        id: "wait-for-admin",
        label: "Waiting for your admin",
        props: {
            currentStep: "plugins",
            serverLabel: "Acme",
            view: {
                kind: "notice",
                reason: "waitForAdmin",
                step: "Plugins",
                owners: ["Olga Petrova"],
            },
        },
    },
    {
        id: "update",
        label: "Update Happy",
        props: {
            currentStep: "plugins",
            serverLabel: "Acme",
            view: { kind: "notice", reason: "update", step: "Plugins" },
        },
    },
    {
        id: "finished-member",
        label: "Finished, the admin bot works with owners",
        props: {
            currentStep: "",
            serverLabel: "Acme",
            action: { label: "Go to Happy", onSelect: noop },
            view: { kind: "finished", botName: "Atlas" },
        },
    },
    {
        id: "unavailable",
        label: "Not checkable yet",
        props: {
            currentStep: "paymentMethod",
            serverLabel: "Acme",
            view: { kind: "notice", reason: "unavailable", step: "Payment" },
        },
    },
];

/** Contains the fixed page and any dialog inside the window-sized viewport. */
function frame(children: ReactNode) {
    return (
        <div
            style={{
                height: "100%",
                overflow: "hidden",
                position: "relative",
                transform: "translateZ(0)",
                width: "100%",
            }}
        >
            {children}
        </div>
    );
}

export function CloudOnboardingFlowPage() {
    const modes: readonly ThemeMode[] = ["light", "dark"];
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="A Happy Cloud server's onboarding gates, one page each in the server's order, with the step bar across the top."
            title="Cloud onboarding"
        >
            {modes.flatMap((mode) =>
                WINDOWS.flatMap((window) =>
                    screens.map((screen, index) => {
                        const number = String(index + 1).padStart(2, "0");
                        const size = `${String(window.width)}x${String(window.height)}`;
                        return (
                            <FullScreenSpecimen
                                detail={`${mode} · ${size}`}
                                key={`${mode}-${size}-${screen.id}`}
                                label={`${screen.label} · ${mode}`}
                                number={number}
                                screen={`${mode}-${number}-${screen.id}-${size}`}
                                window={window}
                            >
                                {frame(
                                    <ThemeScope mode={mode}>
                                        <CloudOnboardingScreen
                                            appearance={mode}
                                            steps={STEPS}
                                            {...screen.props}
                                        />
                                        {screen.dialog}
                                    </ThemeScope>,
                                )}
                            </FullScreenSpecimen>
                        );
                    }),
                ),
            )}
        </ComponentPage>
    );
}
