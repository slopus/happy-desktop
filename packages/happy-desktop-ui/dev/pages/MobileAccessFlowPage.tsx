import type { ReactNode } from "react";
import {
    HappyAgentMobileSettings,
    type HappyAgentMobileSettingsProps,
    type HappyAgentMobileTerminal,
} from "../../src/pages/settings/HappyAgentMobileSettings";
import {
    HappyAgentSettingsShell,
    type HappyAgentSettingsCategory,
} from "../../src/pages/settings/HappyAgentSettingsShell";
import type { MobileAccessTerminalResetPreview } from "../../src/MobileAccessConfirmation";
import { ComponentPage, FullScreenSpecimen } from "../kit";

/** The page plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "P-015";

const noop = () => undefined;

/** The window Happy opens at, and the smallest one it allows. */
const windows = [
    { id: "default", width: 1100, height: 760 },
    { id: "minimum", width: 720, height: 640 },
] as const;

const categories: readonly HappyAgentSettingsCategory[] = [
    { icon: "settings", id: "general", label: "General" },
    { icon: "users", id: "account", label: "Account" },
    { icon: "doc", id: "instructions", label: "Instructions" },
    { icon: "lock", id: "secrets", label: "Secrets" },
    { icon: "globe", id: "providers", label: "Providers" },
    { icon: "zap", id: "usage", label: "Usage" },
    { icon: "mobile", id: "mobile-access", label: "Mobile Access" },
    { icon: "code", id: "debug", label: "Dev Tools" },
];

const accountKeyFingerprint = "4f9a1c07e2b85d36a0c4e7f19b2d58a3c6e0f47b19d2a85c3e6f07b41a9d2c58";
const serverUrl = "https://api.cluster-fluster.com";
const machineId = "8f3c2a71-5d0e-4b6a-9c1f-2e7d4a90b3c5";
const updatedAt = 1_727_870_400_000;

const terminalReady: HappyAgentMobileTerminal = {
    status: "available",
    cliVersion: "1.4.2",
    auth: "v2",
    accountKeyFingerprint,
    serverUrl,
    machineId,
    daemon: { state: "online" },
};

const terminalSignedOut: HappyAgentMobileTerminal = {
    status: "available",
    cliVersion: "1.4.2",
    auth: "missing",
    serverUrl,
    daemon: { state: "stopped" },
};

const resetPreview: MobileAccessTerminalResetPreview = {
    credentialFile: "/Users/ada/.happy/access.key",
    settingsFile: "/Users/ada/.happy/settings.json",
    settingsFields: ["machineId", "machineIdConfirmedByServer"],
    registration: { machineId, serverUrl, accountKeyFingerprint },
    stopsDaemon: true,
};

const handlers = {
    onDisconnect: noop,
    onManagementCancel: noop,
    onManagementConfirm: noop,
    onPair: noop,
    onPairingCancel: noop,
    onSetup: noop,
    onTerminalRegistrationRemovalChange: noop,
    onTerminalReset: noop,
} satisfies Partial<HappyAgentMobileSettingsProps>;

/** A local Agent with a saved pairing; each screen overrides only what it is about. */
const paired = {
    ...handlers,
    configured: true,
    status: "connected",
    updatedAt,
    terminal: terminalReady,
    terminalSetupSupport: "standalone",
} satisfies HappyAgentMobileSettingsProps;

const screens: readonly {
    readonly id: string;
    readonly label: string;
    readonly props: HappyAgentMobileSettingsProps;
}[] = [
    {
        id: "not-set-up",
        label: "Not set up · CLI not installed",
        props: {
            ...handlers,
            configured: false,
            status: "disconnected",
            terminal: { status: "not-installed" },
            terminalSetupSupport: "standalone",
        },
    },
    {
        id: "pairing",
        label: "Pairing · QR code and auth link",
        props: {
            ...handlers,
            configured: false,
            status: "pairing",
            pairingData: "happy://pair?authorization=blueprint-happy-mobile",
            pairingExpiresAt: 1_924_992_000_000,
            terminal: terminalSignedOut,
            terminalSetupSupport: "standalone",
        },
    },
    { id: "ready", label: "Ready · phone connected, terminal ready", props: paired },
    {
        id: "offline-terminal-setup",
        label: "Offline · pairing saved, terminal not set up",
        props: { ...paired, status: "disconnected", terminal: terminalSignedOut },
    },
    {
        id: "personal-pairing",
        label: "Personal pairing · separate terminal sign-in",
        props: { ...paired, terminal: terminalSignedOut, terminalSetupSupport: "personal" },
    },
    {
        id: "cli-unsupported",
        label: "CLI too old · cannot report status",
        props: {
            ...paired,
            terminal: {
                status: "unavailable",
                cliVersion: "0.11.3",
                message:
                    "This installed Happy CLI does not support terminal connection management yet. Its sign-in has not been changed; Happy Mobile pairing works independently.",
            },
        },
    },
    {
        id: "disconnect",
        label: "Disconnect · confirmation",
        props: { ...paired, management: { kind: "disconnect", pending: false } },
    },
    {
        id: "terminal-reset",
        label: "Remove saved terminal login · confirmation",
        props: {
            ...paired,
            management: {
                kind: "terminal-reset",
                preview: resetPreview,
                accountKeyFingerprint,
                removeRegistration: false,
                pending: false,
            },
        },
    },
    {
        id: "terminal-reset-failed",
        label: "Remove saved terminal login · stopped part-way",
        props: {
            ...paired,
            terminal: { ...terminalReady, daemon: { state: "stopped" } },
            management: {
                kind: "terminal-reset",
                preview: resetPreview,
                accountKeyFingerprint,
                removeRegistration: true,
                pending: false,
                error: "Computer removal could not be confirmed. The CLI login was kept; try again when the server is reachable.",
                effects: {
                    localAuthCleared: false,
                    registrationRemoved: false,
                    daemonStopped: true,
                },
            },
        },
    },
];

/** The transform makes a confirmation's fixed dim cover this viewport, not the page. */
function shell(children: ReactNode) {
    return (
        <div style={{ transform: "translateZ(0)" }}>
            <HappyAgentSettingsShell
                activeCategoryId="mobile-access"
                categories={categories}
                description="This Happy Agent's connection to Happy Mobile"
                onCategorySelect={noop}
                onClose={noop}
                title="Mobile Access"
            >
                {children}
            </HappyAgentSettingsShell>
        </div>
    );
}

export function MobileAccessFlowPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Settings › Mobile Access in the order a person meets it, at the window Happy opens at and at its minimum window: pairing, the composed phone status, the terminal CLI, and the two destructive confirmations. Each viewport is named for `pnpm blueprint:screens`."
            title="Mobile Access flow"
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
                            {shell(<HappyAgentMobileSettings {...screen.props} />)}
                        </FullScreenSpecimen>
                    );
                }),
            )}
        </ComponentPage>
    );
}
