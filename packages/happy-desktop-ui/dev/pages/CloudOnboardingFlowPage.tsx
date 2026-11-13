import type { ReactNode } from "react";
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
];

const ADMIN_BOT_DESCRIPTION =
    "This is your server's admin bot. It has expanded capabilities: it can change the server's settings, connect tools and create other bots, so it can adapt Happy and build a system around how your team works. Only owners can talk to it.";

type Screen = {
    readonly id: string;
    readonly label: string;
    readonly props: Omit<CloudOnboardingScreenProps, "appearance" | "steps">;
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
                description: ADMIN_BOT_DESCRIPTION,
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
            secondary: { label: "Use the free model for now", onSelect: noop },
            view: {
                kind: "inference",
                options: [
                    { id: "claude", connected: true },
                    { id: "chatgpt", connected: false, onSelect: noop },
                    { id: "grok", connected: false, onSelect: noop },
                ],
                onOtherSelect: noop,
            },
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
