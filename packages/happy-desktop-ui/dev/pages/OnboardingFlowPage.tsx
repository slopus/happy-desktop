import type { ReactNode } from "react";
import { LocalOnboardingScreen, type LocalOnboardingView } from "../../src/LocalOnboardingScreen";
import type { OnboardingStage } from "../../src/OnboardingSteps";
import { ThemeScope } from "../../src/ThemeScope";
import type { WelcomeSlide } from "../../src/WelcomeDeck";
import { WelcomeScreen } from "../../src/WelcomeScreen";
import { SplashCover } from "../../src/SplashCover";
import { ComponentPage, FullScreenSpecimen } from "../kit";

/** The page plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "P-014";

const noop = () => undefined;

/** The window Happy opens at, and the smallest one it allows. */
const windows = [
    { id: "default", width: 1100, height: 760 },
    { id: "minimum", width: 720, height: 640 },
] as const;

/* The app's first slide, word for word, so the pitch reads as it ships. */
const pitch: readonly WelcomeSlide[] = [
    {
        art: { kind: "logo" },
        copy: "Happy integrates models, teams, and compute into one secure, open-source harness—accessible from terminal, desktop, and mobile, deployable anywhere, and adaptable to your team.",
        id: "happy",
        title: "Any team. Any model. One harness.",
    },
];

function onboarding(view: LocalOnboardingView, reachedStage?: OnboardingStage) {
    return (
        <LocalOnboardingScreen
            appearance="dark"
            onAssistantsContinue={noop}
            onConnectRetry={noop}
            onExternalOpen={noop}
            onHappyMobileConnect={noop}
            onHappyMobileSkip={noop}
            onProfileCreate={noop}
            onProfileEmailChange={noop}
            onProfileNameChange={noop}
            onProjectChoose={noop}
            onStageSelect={noop}
            showSteps
            view={view}
            {...(reachedStage ? { reachedStage } : {})}
        />
    );
}

/** First run in the order a new person meets it, one happy path, then a restart. */
const screens: readonly { id: string; label: string; render: () => ReactNode }[] = [
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
                        authentication: "invalid",
                        command: "/opt/homebrew/bin/claude",
                        id: "claude",
                        status: "found",
                    },
                    { authentication: "unavailable", id: "codex", status: "missing" },
                    { authentication: "unavailable", id: "grok", status: "missing" },
                ],
                kind: "provider-authentication",
            }),
    },
    {
        id: "subscriptions-ready",
        label: "Subscriptions · one signed in",
        render: () =>
            onboarding({
                assistants: [
                    {
                        authentication: "valid",
                        command: "/opt/homebrew/bin/claude",
                        id: "claude",
                        status: "found",
                    },
                    { authentication: "unavailable", id: "codex", status: "missing" },
                    { authentication: "unavailable", id: "grok", status: "missing" },
                ],
                kind: "provider-authentication",
            }),
    },
    {
        id: "profile",
        label: "Profile",
        render: () =>
            onboarding({ busy: false, email: "", kind: "profile-required", name: "" }, "profile"),
    },
    {
        id: "mobile",
        label: "Mobile · take Happy with you",
        render: () =>
            onboarding(
                { kind: "happy-mobile-desktop", step: { kind: "intro", platform: "ios" } },
                "get-app",
            ),
    },
    {
        id: "connect-code-loading",
        label: "Connect phone · code on its way (shown at least 1s)",
        render: () =>
            onboarding(
                {
                    kind: "happy-mobile-desktop",
                    step: { kind: "link", phase: { kind: "checking" } },
                },
                "connect-phone",
            ),
    },
    {
        id: "connect-phone",
        label: "Connect phone · QR",
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
                "connect-phone",
            ),
    },
    {
        id: "phone-connected",
        label: "Connect phone · connected",
        render: () =>
            onboarding(
                { kind: "happy-mobile-desktop", step: { kind: "connected", online: true } },
                "connect-phone",
            ),
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
                            <ThemeScope mode="dark">{screen.render()}</ThemeScope>
                        </FullScreenSpecimen>
                    );
                }),
            )}
        </ComponentPage>
    );
}
