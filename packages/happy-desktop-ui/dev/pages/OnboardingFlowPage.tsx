import type { ReactNode } from "react";
import {
    LocalOnboardingScreen,
    type LocalOnboardingAssistant,
    type LocalOnboardingAssistantId,
    type LocalOnboardingView,
} from "../../src/LocalOnboardingScreen";
import type { OnboardingNodeIdentity } from "../../src/OnboardingNode";
import type { OnboardingStage } from "../../src/OnboardingSteps";
import { ThemeScope } from "../../src/ThemeScope";
import type { WelcomeSlide } from "../../src/WelcomeDeck";
import { WelcomeScreen } from "../../src/WelcomeScreen";
import {
    windowsSandboxSetupPage,
    type WindowsSandboxSetupProps,
} from "../../src/WindowsSandboxSetup";
import { SetupPage } from "../../src/SetupPage";
import { SplashCover } from "../../src/SplashCover";
import { ComponentPage, FullScreenSpecimen } from "../kit";
import type { DesktopMobilePairingOptions } from "../../src/DesktopMobileSetup";
import {
    customProviders,
    customProvidersAssistants,
    customProvidersChecking,
} from "./customProviderFixtures";
import { direct, relayWaiting } from "./mobilePairingFixtures";
import { setupPairingOptions } from "./mobilePairingSpecimens";

/** The sandbox step drawn alone, the way the flow's retained `SetupPage` draws it. */
function WindowsSandboxSetup(props: WindowsSandboxSetupProps) {
    return <SetupPage {...windowsSandboxSetupPage(props)} />;
}

/** The page plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "P-014";

const noop = () => undefined;

/**
 * What setup shows a phone on macOS: the Direct | Relay choice on Direct.
 * `starting` while the code is on its way.
 */
function appPairingOptions(starting = false): DesktopMobilePairingOptions {
    return setupPairingOptions({
        direct: starting ? direct.loading : direct.waiting,
        method: "direct",
        onMethodSelect: noop,
        relay: starting ? { kind: "starting" } : relayWaiting,
    });
}

/** The window Happy opens at, and the smallest one it allows. */
const windows = [
    { id: "default", width: 1100, height: 760 },
    { id: "minimum", width: 720, height: 640 },
] as const;

/* The app's first slide, word for word, so the pitch reads as it ships. */
const pitch: readonly WelcomeSlide[] = [
    {
        art: { kind: "logo" },
        copy: "Happy is open source, so anyone can check what it does. Run it on hardware you trust, and reach it from your phone with end-to-end encryption.",
        id: "happy",
        title: "Work with AI as a team. Safely.",
    },
];

/** The machine being set up, as its Happy Agent names itself; no picture, so its placeholder. */
const node: OnboardingNodeIdentity = { name: "Studio Mac", placeholderSeed: "Studio Mac" };

function onboarding(
    view: LocalOnboardingView,
    selectableStages?: readonly OnboardingStage[],
    agentPromptsOpen = false,
    appearance: "dark" | "light" = "dark",
    pairingOptions: DesktopMobilePairingOptions = appPairingOptions(),
) {
    // Until Happy Agent is installed and running there is no machine to name.
    const named =
        view.kind !== "checking" &&
        view.kind !== "node-missing" &&
        view.kind !== "agent-setup" &&
        view.kind !== "connecting";
    return (
        <LocalOnboardingScreen
            happyMobilePairingOptions={pairingOptions}
            agentPromptsOpen={agentPromptsOpen}
            appearance={appearance}
            {...(named ? { node } : {})}
            onAssistantsContinue={noop}
            onConnectRetry={noop}
            onExternalOpen={noop}
            onHappyMobileConnect={noop}
            onHappyMobileSkip={noop}
            onStageSelect={noop}
            showSteps
            view={view}
            {...(selectableStages ? { selectableStages } : {})}
        />
    );
}

/**
 * Subscriptions where Happy Agent signs the assistants in itself: each card's
 * button carries its state, and a connected one says so in words.
 */
function connectOnboarding(view: LocalOnboardingView, dialog?: LocalOnboardingAssistantId) {
    return (
        <LocalOnboardingScreen
            happyMobilePairingOptions={setupPairingOptions()}
            appearance="dark"
            node={node}
            onAssistantConnectCancel={noop}
            onAssistantInstall={noop}
            onAssistantSignIn={noop}
            onAssistantSignInCode={noop}
            onAssistantsContinue={noop}
            onClaudeTokenSubmit={noop}
            onConnectRetry={noop}
            onExternalOpen={noop}
            onHappyMobileConnect={noop}
            onHappyMobileSkip={noop}
            onStageSelect={noop}
            {...(dialog ? { providerDialogOpen: dialog } : {})}
            showSteps
            view={view}
        />
    );
}

/** Claude to connect, Codex connected, Grok waiting on its page with a device code. */
const connectSubscriptions: LocalOnboardingView = {
    assistants: [
        {
            authentication: "invalid",
            connect: { installable: true, installed: true },
            id: "claude",
            status: "found",
        },
        {
            authentication: "valid",
            connect: { installable: true, installed: true },
            id: "codex",
            status: "found",
        },
        {
            authentication: "invalid",
            connect: {
                installable: true,
                installed: true,
                operation: {
                    kind: "sign-in",
                    status: "waiting",
                    url: "https://accounts.x.ai/device",
                    userCode: "WDJB-MJHT",
                },
            },
            id: "grok",
            status: "found",
        },
    ],
    custom: { authentication: "invalid", providers: [] },
    kind: "provider-authentication",
    installShell: "posix",
};

/** Each assistant as the rows draw it before anything is connected. */
const claudeSignedOut: LocalOnboardingAssistant = {
    authentication: "invalid",
    connect: { installable: true, installed: true },
    id: "claude",
    status: "found",
};
const codexMissing: LocalOnboardingAssistant = {
    authentication: "unavailable",
    connect: { installable: true, installed: false },
    id: "codex",
    status: "missing",
};
const grokSignedOut: LocalOnboardingAssistant = {
    authentication: "invalid",
    connect: { installable: true, installed: true },
    id: "grok",
    status: "found",
};
const antigravitySignedOut: LocalOnboardingAssistant = {
    authentication: "invalid",
    connect: { installable: true, installed: true },
    id: "antigravity",
    status: "found",
};

/** One assistant connected, whether by a sign-in here or one already on this computer. */
function connected(assistant: LocalOnboardingAssistant): LocalOnboardingAssistant {
    return {
        ...assistant,
        authentication: "valid",
        connect: { installable: true, installed: true },
        status: "found",
    };
}

/** Antigravity's sign-in at one point of its way, everything else as before. */
function antigravityOperation(
    operation: NonNullable<LocalOnboardingAssistant["connect"]["operation"]>,
): LocalOnboardingAssistant {
    return {
        ...antigravitySignedOut,
        connect: { installable: true, installed: true, operation },
    };
}

/** A fixed moment, so the dialog says the same time on every capture. */
const antigravityExpiresAt = Date.UTC(2026, 10, 27, 11, 52, 30);

const antigravityWaiting = antigravityOperation({
    acceptsCode: true,
    expiresAt: antigravityExpiresAt,
    kind: "sign-in",
    status: "waiting",
    url: "https://accounts.google.com/o/oauth2/v2/auth?client_id=antigravity",
});

/** The four rows, with Subscriptions' usual empty custom column. */
function rowsView(assistants: readonly LocalOnboardingAssistant[]): LocalOnboardingView {
    return {
        assistants,
        custom: { authentication: "invalid", providers: [] },
        kind: "provider-authentication",
        installShell: "posix",
    };
}

const connectAiScreens: readonly {
    id: string;
    label: string;
    view: LocalOnboardingView;
    dialog?: LocalOnboardingAssistantId;
}[] = [
    {
        id: "ai-rows",
        label: "Connect your AI · four rows, none connected",
        view: rowsView([claudeSignedOut, codexMissing, grokSignedOut, antigravitySignedOut]),
    },
    {
        dialog: "antigravity",
        id: "ai-antigravity",
        label: "Antigravity dialog · sign in at Google, then paste its code",
        view: rowsView([claudeSignedOut, codexMissing, grokSignedOut, antigravitySignedOut]),
    },
    {
        dialog: "antigravity",
        id: "ai-antigravity-waiting",
        label: "Antigravity dialog · Google open, waiting for the code",
        view: rowsView([claudeSignedOut, codexMissing, grokSignedOut, antigravityWaiting]),
    },
    {
        dialog: "antigravity",
        id: "ai-antigravity-failed",
        label: "Antigravity dialog · the sign-in gave up",
        view: rowsView([
            claudeSignedOut,
            codexMissing,
            grokSignedOut,
            antigravityOperation({
                kind: "sign-in",
                message: "Antigravity stopped waiting for the code. Open Google to try again.",
                status: "failed",
            }),
        ]),
    },
    {
        id: "ai-antigravity-connected",
        label: "Connect your AI · Antigravity connected",
        view: rowsView([
            claudeSignedOut,
            codexMissing,
            grokSignedOut,
            connected(antigravitySignedOut),
        ]),
    },
    {
        id: "ai-detected",
        label: "Connect your AI · Claude Code and Codex already signed in on this computer",
        view: rowsView([
            connected(claudeSignedOut),
            connected(codexMissing),
            grokSignedOut,
            antigravitySignedOut,
        ]),
    },
    {
        dialog: "claude",
        id: "ai-claude",
        label: "Claude Code dialog · setup token",
        view: rowsView([claudeSignedOut, codexMissing, grokSignedOut, antigravitySignedOut]),
    },
    {
        dialog: "codex",
        id: "ai-codex",
        label: "Codex dialog · install, then sign in",
        view: rowsView([claudeSignedOut, codexMissing, grokSignedOut, antigravitySignedOut]),
    },
    {
        dialog: "grok",
        id: "ai-grok-waiting",
        label: "Grok dialog · waiting at xAI with a device code",
        view: rowsView([
            claudeSignedOut,
            codexMissing,
            {
                ...grokSignedOut,
                connect: {
                    installable: true,
                    installed: true,
                    operation: {
                        kind: "sign-in",
                        status: "waiting",
                        url: "https://accounts.x.ai/device",
                        userCode: "WDJB-MJHT",
                    },
                },
            },
            antigravityWaiting,
        ]),
    },
];

/** Still checking Claude, installing Codex, and a Grok sign-in that did not finish. */
const connectBusySubscriptions: LocalOnboardingView = {
    assistants: [
        {
            authentication: "checking",
            connect: { installable: true, installed: true },
            id: "claude",
            status: "found",
        },
        {
            authentication: "unavailable",
            connect: {
                installable: true,
                installed: false,
                operation: { kind: "install", status: "running" },
            },
            id: "codex",
            status: "missing",
        },
        {
            authentication: "invalid",
            connect: {
                installable: true,
                installed: true,
                operation: { kind: "sign-in", message: "Sign-in was cancelled.", status: "failed" },
            },
            id: "grok",
            status: "found",
        },
    ],
    custom: { authentication: "invalid", providers: [] },
    kind: "provider-authentication",
    installShell: "posix",
};

/** First run in the order a new person meets it, one happy path, then a restart. */
/** One of each card state side by side: signed in, not installed, not signed in, custom. */
const mixedSubscriptions: LocalOnboardingView = {
    assistants: [
        {
            connect: { installable: true, installed: true },
            authentication: "valid",
            command: "/opt/homebrew/bin/claude",
            id: "claude",
            status: "found",
        },
        {
            connect: { installable: true, installed: false },
            authentication: "unavailable",
            id: "codex",
            status: "missing",
        },
        {
            connect: { installable: true, installed: true },
            authentication: "invalid",
            command: "/usr/local/bin/grok",
            id: "grok",
            status: "found",
        },
    ],
    custom: { authentication: "invalid", providers: [] },
    kind: "provider-authentication",
    installShell: "posix",
};

/**
 * Checks that settled as failed: Claude Code behind a custom base URL that did
 * not answer, and a Claude-type provider in `happy.toml` that failed the same way.
 */
const unverifiedSubscriptions: LocalOnboardingView = {
    assistants: [
        {
            connect: { installable: true, installed: true },
            authentication: "error",
            command: "/opt/homebrew/bin/claude",
            id: "claude",
            message: "Timed out after 60s",
            status: "found",
        },
        {
            connect: { installable: true, installed: false },
            authentication: "unavailable",
            id: "codex",
            status: "missing",
        },
        {
            connect: { installable: true, installed: false },
            authentication: "unavailable",
            id: "grok",
            status: "missing",
        },
    ],
    custom: {
        authentication: "error",
        providers: [
            {
                authentication: "error",
                id: "work-proxy",
                kind: "Claude",
                message: "Couldn't reach https://llm-proxy.internal: connection refused",
                name: "Work proxy",
            },
        ],
    },
    kind: "provider-authentication",
    installShell: "posix",
};

const screens: readonly {
    appearance?: "dark" | "light";
    id: string;
    label: string;
    render: () => ReactNode;
}[] = [
    {
        id: "welcome",
        label: "Welcome deck · first slide",
        render: () => (
            <WelcomeScreen
                appearance="dark"
                backdrop={{ kind: "sky" }}
                onAction={noop}
                onAppearanceChange={noop}
                slides={pitch}
            />
        ),
    },
    {
        appearance: "light",
        id: "welcome-light",
        label: "Welcome deck · native light palette",
        render: () => (
            <WelcomeScreen
                appearance="light"
                backdrop={{ kind: "sky" }}
                onAction={noop}
                onAppearanceChange={noop}
                slides={pitch}
            />
        ),
    },
    {
        id: "setup-downloading",
        label: "Setup · downloading Happy Agent",
        render: () =>
            onboarding({
                kind: "agent-setup",
                phase: {
                    download: { receivedBytes: 61 * 1024 * 1024, totalBytes: 148 * 1024 * 1024 },
                    kind: "downloading",
                },
            }),
    },
    {
        id: "setup-starting",
        label: "Setup · starting Happy Agent",
        render: () => onboarding({ kind: "agent-setup", phase: { kind: "starting" } }),
    },
    {
        id: "subscriptions-checking",
        label: "Subscriptions · checking",
        render: () => onboarding({ kind: "examining" }),
    },
    {
        id: "subscriptions-sign-in",
        label: "Subscriptions · none signed in yet",
        render: () =>
            onboarding({
                assistants: [
                    {
                        connect: { installable: true, installed: true },
                        authentication: "invalid",
                        command: "/opt/homebrew/bin/claude",
                        id: "claude",
                        status: "found",
                    },
                    {
                        connect: { installable: true, installed: false },
                        authentication: "unavailable",
                        id: "codex",
                        status: "missing",
                    },
                    {
                        connect: { installable: true, installed: false },
                        authentication: "unavailable",
                        id: "grok",
                        status: "missing",
                    },
                ],
                custom: { authentication: "invalid", providers: [] },
                kind: "provider-authentication",
                installShell: "posix",
            }),
    },
    {
        id: "subscriptions-empty",
        label: "Subscriptions · nothing on this machine",
        render: () =>
            onboarding({
                assistants: [
                    {
                        connect: { installable: true, installed: false },
                        authentication: "unavailable",
                        id: "claude",
                        status: "missing",
                    },
                    {
                        connect: { installable: true, installed: false },
                        authentication: "unavailable",
                        id: "codex",
                        status: "missing",
                    },
                    {
                        connect: { installable: true, installed: false },
                        authentication: "unavailable",
                        id: "grok",
                        status: "missing",
                    },
                ],
                custom: { authentication: "invalid", providers: [] },
                kind: "provider-authentication",
                installShell: "posix",
            }),
    },
    {
        id: "subscriptions-agent-prompts",
        label: "Subscriptions · set up with your agent",
        render: () =>
            onboarding(
                {
                    assistants: [
                        {
                            connect: { installable: true, installed: false },
                            authentication: "unavailable",
                            id: "claude",
                            status: "missing",
                        },
                        {
                            connect: { installable: true, installed: false },
                            authentication: "unavailable",
                            id: "codex",
                            status: "missing",
                        },
                        {
                            connect: { installable: true, installed: false },
                            authentication: "unavailable",
                            id: "grok",
                            status: "missing",
                        },
                    ],
                    custom: { authentication: "invalid", providers: [] },
                    kind: "provider-authentication",
                    installShell: "posix",
                },
                undefined,
                true,
            ),
    },
    {
        id: "subscriptions-unverified",
        label: "Subscriptions · couldn't verify",
        render: () => onboarding(unverifiedSubscriptions),
    },
    {
        id: "subscriptions-unverified-prompts",
        label: "Subscriptions · couldn't verify, custom endpoint with your agent",
        render: () => onboarding(unverifiedSubscriptions, undefined, true),
    },
    {
        id: "subscriptions-custom-ready",
        label: "Subscriptions · custom configuration ready",
        render: () =>
            onboarding({
                assistants: [
                    {
                        connect: { installable: true, installed: false },
                        authentication: "unavailable",
                        id: "claude",
                        status: "missing",
                    },
                    {
                        connect: { installable: true, installed: false },
                        authentication: "unavailable",
                        id: "codex",
                        status: "missing",
                    },
                    {
                        connect: { installable: true, installed: false },
                        authentication: "unavailable",
                        id: "grok",
                        status: "missing",
                    },
                ],
                custom: {
                    authentication: "valid",
                    providers: [
                        {
                            authentication: "valid",
                            id: "corp-bedrock",
                            kind: "Bedrock",
                            name: "Bedrock · corp-bedrock",
                        },
                    ],
                },
                kind: "provider-authentication",
                installShell: "posix",
            }),
    },
    {
        id: "subscriptions-custom-checking",
        label: "Subscriptions · custom providers, each checked on its own",
        render: () =>
            onboarding({
                assistants: customProvidersAssistants("checking"),
                custom: { authentication: "valid", providers: customProvidersChecking },
                kind: "provider-authentication",
                installShell: "posix",
            }),
    },
    {
        id: "subscriptions-custom-settled",
        label: "Subscriptions · custom providers, each with its own answer",
        render: () =>
            onboarding({
                assistants: customProvidersAssistants("invalid"),
                custom: { authentication: "valid", providers: customProviders },
                kind: "provider-authentication",
                installShell: "posix",
            }),
    },
    {
        id: "subscriptions-ready",
        label: "Subscriptions · one signed in",
        render: () =>
            onboarding({
                assistants: [
                    {
                        connect: { installable: true, installed: true },
                        authentication: "valid",
                        command: "/opt/homebrew/bin/claude",
                        id: "claude",
                        status: "found",
                    },
                    {
                        connect: { installable: true, installed: false },
                        authentication: "unavailable",
                        id: "codex",
                        status: "missing",
                    },
                    {
                        connect: { installable: true, installed: false },
                        authentication: "unavailable",
                        id: "grok",
                        status: "missing",
                    },
                ],
                custom: { authentication: "invalid", providers: [] },
                kind: "provider-authentication",
                installShell: "posix",
            }),
    },
    {
        id: "subscriptions-connect",
        label: "Subscriptions · connect, connected, waiting on the browser",
        render: () => connectOnboarding(connectSubscriptions),
    },
    {
        id: "subscriptions-connect-busy",
        label: "Subscriptions · checking, installing, sign-in failed",
        render: () => connectOnboarding(connectBusySubscriptions),
    },
    ...connectAiScreens.map((screen) => ({
        id: `subscriptions-${screen.id}`,
        label: screen.label,
        // The transform keeps each dialog's overlay inside its own window.
        render: () => (
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    height: "100%",
                    width: "100%",
                    overflow: "hidden",
                    position: "relative",
                    transform: "translateZ(0)",
                }}
            >
                {connectOnboarding(screen.view, screen.dialog)}
            </div>
        ),
    })),
    {
        id: "subscriptions-mixed",
        label: "Subscriptions · every card state",
        render: () => onboarding(mixedSubscriptions),
    },
    {
        appearance: "light",
        id: "subscriptions-mixed-light",
        label: "Subscriptions · every card state, light appearance",
        render: () => onboarding(mixedSubscriptions, undefined, false, "light"),
    },
    ...(["before", "waiting", "unfinished"] as const).map((state) => ({
        id: `windows-sandbox-${state}`,
        label: `Sandbox · Windows · ${state}`,
        render: () => <WindowsSandboxSetup appearance="dark" state={state} onContinue={noop} />,
    })),
    {
        appearance: "light",
        id: "windows-sandbox-before-light",
        label: "Sandbox · Windows · light appearance",
        render: () => <WindowsSandboxSetup appearance="light" state="before" onContinue={noop} />,
    },
    {
        id: "mobile",
        label: "Get Mobile App",
        render: () => onboarding({ kind: "happy-mobile-desktop", step: { kind: "intro" } }),
    },
    {
        id: "connect-code-loading",
        label: "Link Mobile App · code on its way (shown at least 1s)",
        render: () =>
            onboarding(
                {
                    kind: "happy-mobile-desktop",
                    step: { kind: "link", phase: { kind: "checking" } },
                },
                undefined,
                false,
                "dark",
                appPairingOptions(true),
            ),
    },
    {
        id: "connect-phone",
        label: "Link Mobile App · QR",
        render: () =>
            onboarding({
                kind: "happy-mobile-desktop",
                step: {
                    kind: "link",
                    phase: {
                        data: "happy://terminal?AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
                        expiresAt: 1924992000000,
                        kind: "pairing",
                    },
                },
            }),
    },
    ...(
        [
            ["direct", "dark", "macOS default: Direct, Relay one tap away"],
            ["relay", "dark", "Windows and Linux default: Relay"],
            ["direct", "light", "macOS default · light appearance"],
            ["relay", "light", "Windows and Linux default · light appearance"],
        ] as const
    ).map(([method, appearance, label]) => ({
        ...(appearance === "light" ? { appearance } : {}),
        id: `connect-phone-${method}${appearance === "light" ? "-light" : ""}`,
        label: `Link Mobile App · ${label}`,
        render: () =>
            onboarding(
                {
                    kind: "happy-mobile-desktop",
                    step: {
                        kind: "link",
                        phase: {
                            data: "happy://terminal?AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
                            expiresAt: 1924992000000,
                            kind: "pairing",
                        },
                    },
                },
                undefined,
                false,
                appearance,
                setupPairingOptions({
                    direct: direct.waiting,
                    relay: relayWaiting,
                    method,
                    onMethodSelect: noop,
                }),
            ),
    })),
    {
        id: "phone-connected",
        label: "Link Mobile App · linked, the last page",
        render: () =>
            onboarding({ kind: "happy-mobile-desktop", step: { kind: "connected", online: true } }),
    },
    {
        id: "restart",
        label: "Any later launch · until the workspace is ready",
        render: () => (
            <SplashCover quiet ready={false}>
                {null}
            </SplashCover>
        ),
    },
];

export function OnboardingFlowPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="First run as one happy path, every screen at the window Happy opens at and at its minimum window. Each viewport is named for `pnpm blueprint:screens`."
            title="Onboarding flow"
        >
            {windows.flatMap((window) =>
                screens.map((screen, index) => {
                    const number = String(index + 1).padStart(2, "0");
                    return (
                        <FullScreenSpecimen
                            key={`${window.id}-${screen.id}`}
                            detail={`${String(window.width)} × ${String(window.height)} · ${window.id} window`}
                            label={screen.label}
                            number={number}
                            screen={`${number}-${screen.id}-${String(window.width)}x${String(window.height)}`}
                            window={window}
                        >
                            <ThemeScope mode={screen.appearance ?? "dark"}>
                                {screen.render()}
                            </ThemeScope>
                        </FullScreenSpecimen>
                    );
                }),
            )}
        </ComponentPage>
    );
}
