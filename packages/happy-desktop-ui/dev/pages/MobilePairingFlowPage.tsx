import type { ReactNode } from "react";
import { desktopMobileSetupPage, type DesktopMobileSetupProps } from "../../src/DesktopMobileSetup";
import { SetupPage } from "../../src/SetupPage";
import { LocalOnboardingScreen } from "../../src/LocalOnboardingScreen";
import type {
    MobileDirectConnectorState,
    MobileDirectRemoval,
} from "../../src/MobileDirectConnection";
import {
    HappyAgentMobileSettings,
    type HappyAgentMobileSettingsProps,
} from "../../src/pages/settings/HappyAgentMobileSettings";
import {
    HappyAgentSettingsShell,
    type HappyAgentSettingsCategory,
} from "../../src/pages/settings/HappyAgentSettingsShell";
import { ThemeScope } from "../../src/ThemeScope";
import { ComponentPage, FullScreenSpecimen } from "../kit";
import { devices, direct } from "./mobilePairingFixtures";
import {
    directSectionSpecimen,
    mobileLinkSpecimen,
    pairingOptionsSpecimen,
    setupPairingOptions,
    type PairingVariant,
} from "./mobilePairingSpecimens";

/** One setup step drawn alone, the way the flow's retained `SetupPage` draws it. */
function DesktopMobileSetup(props: DesktopMobileSetupProps) {
    return <SetupPage {...desktopMobileSetupPage(props)} />;
}

/** The page plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "P-021";

const noop = () => undefined;

const categories: readonly HappyAgentSettingsCategory[] = [
    { icon: "settings", id: "general", label: "General", tone: "gray" },
    { icon: "users", id: "account", label: "Account", tone: "blue" },
    { icon: "mobile", id: "mobile-access", label: "Mobile access", tone: "green" },
    { group: "Agents", icon: "globe", id: "providers", label: "Inference", tone: "indigo" },
    { group: "Advanced", icon: "code", id: "debug", label: "Dev tools", tone: "gray" },
];

/** The window Happy opens at, and the smallest one it allows. */
const defaultWindow = { width: 1100, height: 760 } as const;
const minimumWindow = { width: 720, height: 640 } as const;

function settings(props: {
    readonly direct: MobileDirectConnectorState;
    /** This Happy Agent has no direct connection: no direct section. */
    readonly directSectionOff?: boolean;
    readonly pairing?: PairingVariant;
    /** The Happy server link's own status, for a computer already linked through it. */
    readonly relay?: Partial<HappyAgentMobileSettingsProps>;
    readonly removal?: MobileDirectRemoval;
    readonly unavailable?: string;
}) {
    return (
        <HappyAgentSettingsShell
            activeCategoryId="mobile-access"
            categories={categories}
            description="This Happy Agent's connection to Happy Mobile"
            onCategorySelect={noop}
            onClose={noop}
            title="Mobile access"
        >
            <HappyAgentMobileSettings
                configured={false}
                {...(props.directSectionOff
                    ? {}
                    : {
                          direct: directSectionSpecimen(props.direct, {
                              ...(props.removal ? { removal: props.removal } : {}),
                              ...(props.unavailable ? { unavailable: props.unavailable } : {}),
                          }),
                      })}
                onDisconnect={noop}
                onPairingOptionsOpen={noop}
                {...(props.pairing
                    ? {
                          pairingOptions: pairingOptionsSpecimen("dialog", {
                              ...props.pairing,
                              ...(props.unavailable ? { unavailable: props.unavailable } : {}),
                          }),
                      }
                    : {})}
                status="disconnected"
                {...(props.unavailable ? { unavailable: props.unavailable } : {})}
                {...props.relay}
            />
        </HappyAgentSettingsShell>
    );
}

function setup(variant: PairingVariant) {
    return (
        <DesktopMobileSetup
            appearance="dark"
            onboarding
            onContinue={noop}
            onSkip={noop}
            pairingOptions={setupPairingOptions(variant)}
            step={{ kind: "link" }}
        />
    );
}

function remote(variant: PairingVariant) {
    return (
        <LocalOnboardingScreen
            appearance="dark"
            happyMobilePairingOptions={setupPairingOptions(variant)}
            onAssistantsContinue={noop}
            onConnectRetry={noop}
            onHappyMobileConnect={noop}
            onHappyMobileSkip={noop}
            showSteps
            view={{ kind: "happy-mobile-pairing" }}
        />
    );
}

/** Holds a window-fixed dialog inside its own viewport rather than the workbench's. */
function contained(children: ReactNode) {
    return (
        <div
            style={{
                display: "flex",
                height: "100%",
                position: "relative",
                transform: "translateZ(0)",
                width: "100%",
            }}
        >
            {children}
        </div>
    );
}

const settingsScreens: readonly {
    readonly id: string;
    readonly label: string;
    readonly render: () => ReactNode;
}[] = [
    {
        id: "idle",
        label: "Connect a phone and the direct section",
        render: () => settings({ direct: direct.closed }),
    },
    {
        id: "method-direct",
        label: "Connect a phone · direct code",
        render: () =>
            settings({
                direct: direct.closed,
                pairing: { direct: direct.waiting },
            }),
    },
    {
        id: "link-intro",
        label: "Link a phone · get the app",
        render: () => mobileLinkSpecimen({ categories, step: { kind: "intro" } }),
    },
    {
        id: "link-direct",
        label: "Link a phone · Direct code",
        render: () =>
            mobileLinkSpecimen({
                categories,
                step: { kind: "link" },
                pairing: { direct: direct.waiting },
            }),
    },
    {
        id: "link-direct-failed",
        label: "Link a phone · direct pairing failed",
        render: () =>
            mobileLinkSpecimen({
                categories,
                step: { kind: "link" },
                pairing: { direct: direct.failed },
            }),
    },
    {
        id: "link-verifying",
        label: "Link a phone · emoji step",
        render: () =>
            mobileLinkSpecimen({
                categories,
                step: { kind: "link" },
                pairing: { direct: direct.phoneConfirmed },
            }),
    },
    {
        id: "link-completed",
        label: "Link a phone · paired directly, Done",
        render: () =>
            mobileLinkSpecimen({
                categories,
                step: { kind: "link" },
                pairing: { direct: direct.completed },
            }),
    },
    {
        id: "link-connected",
        label: "Link a phone · linked through the relay",
        render: () => mobileLinkSpecimen({ categories, step: { kind: "connected", online: true } }),
    },
    {
        id: "codes",
        label: "Direct code, beside the direct section",
        render: () =>
            settings({
                direct: direct.waiting,
                pairing: { direct: direct.waiting },
            }),
    },
    {
        id: "phone-connected",
        label: "Phone connected, verifying…",
        render: () =>
            settings({
                direct: direct.connected,
                pairing: { direct: direct.connected },
            }),
    },
    {
        id: "verifying",
        label: "Emoji step · nobody confirmed",
        render: () =>
            settings({
                direct: direct.verifying,
                pairing: { direct: direct.verifying },
            }),
    },
    {
        id: "phone-confirmed",
        label: "Emoji step · phone confirmed",
        render: () =>
            settings({
                direct: direct.phoneConfirmed,
                pairing: { direct: direct.phoneConfirmed },
            }),
    },
    {
        id: "desktop-confirmed",
        label: "Emoji step · waiting for the phone",
        render: () =>
            settings({
                direct: direct.desktopConfirmed,
                pairing: { direct: direct.desktopConfirmed },
            }),
    },
    {
        id: "completed",
        label: "Direct pairing completed",
        render: () =>
            settings({
                direct: direct.completed,
                pairing: { direct: direct.completed },
            }),
    },
    {
        id: "rejected",
        label: "Rejected by the phone",
        render: () =>
            settings({
                direct: direct.rejected,
                pairing: { direct: direct.rejected },
            }),
    },
    {
        id: "cancelled",
        label: "Cancelled on this computer",
        render: () =>
            settings({
                direct: direct.cancelled,
                pairing: { direct: direct.cancelled },
            }),
    },
    {
        id: "expired",
        label: "Verification timed out",
        render: () =>
            settings({
                direct: direct.expiredVerifying,
                pairing: { direct: direct.expiredVerifying },
            }),
    },
    {
        id: "code-expired",
        label: "Direct code expired before a scan",
        render: () =>
            settings({
                direct: direct.expiredBeforeScan,
                pairing: { direct: direct.expiredBeforeScan },
            }),
    },
    {
        id: "failed",
        label: "Direct pairing failed",
        render: () =>
            settings({
                direct: direct.failed,
                pairing: { direct: direct.failed },
            }),
    },
    {
        id: "relay-connected",
        label: "Linked through the Happy server; direct pairs another phone",
        render: () =>
            settings({
                direct: direct.waiting,
                pairing: { direct: direct.waiting },
                relay: { configured: true, status: "connected" },
            }),
    },
    {
        id: "paired-devices",
        label: "Phones paired directly",
        render: () => settings({ direct: direct.paired }),
    },
    {
        id: "remove-confirm",
        label: "Remove a directly paired phone",
        render: () =>
            settings({
                direct: direct.paired,
                removal: { deviceId: devices[0]?.id ?? "", pending: false },
            }),
    },
    {
        id: "direct-disabled",
        label: "Direct connection disabled",
        render: () =>
            settings({
                direct: direct.disabled,
                pairing: { direct: direct.disabled },
            }),
    },
    {
        id: "direct-starting",
        label: "Direct socket opening",
        render: () =>
            settings({
                direct: direct.starting,
                pairing: { direct: direct.starting },
            }),
    },
    {
        id: "direct-socket-failed",
        label: "Direct socket failed",
        render: () =>
            settings({
                direct: direct.socketFailed,
                pairing: { direct: direct.socketFailed },
            }),
    },
    {
        id: "older-agent",
        label: "Older Happy Agent (404)",
        render: () =>
            settings({
                direct: direct.unsupported,
                pairing: { direct: direct.unsupported },
            }),
    },
    {
        id: "unavailable",
        label: "Happy Agent reconnecting",
        render: () =>
            settings({
                direct: direct.paired,
                unavailable: "Happy Agent is reconnecting. Actions return when it is back.",
            }),
    },
];

const setupScreens: readonly {
    readonly id: string;
    readonly label: string;
    readonly render: () => ReactNode;
}[] = [
    {
        id: "setup-codes",
        label: "Onboarding · direct code",
        render: () => setup({ direct: direct.waiting }),
    },
    {
        id: "setup-verifying",
        label: "Onboarding · emoji step",
        render: () => setup({ direct: direct.phoneConfirmed }),
    },
    {
        id: "setup-older-agent",
        label: "Onboarding · older Happy Agent",
        render: () => setup({ direct: direct.unsupported }),
    },
    {
        id: "setup-completed",
        label: "Onboarding · paired directly, Continue",
        render: () => setup({ direct: direct.completed }),
    },
    {
        id: "remote-codes",
        label: "Remote onboarding · direct code",
        render: () => remote({ direct: direct.waiting }),
    },
];

/**
 * The Settings pairing dialog through one pairing's whole life, as the app
 * opens it: the direct code. The dialog keeps one size
 * through all of them, so `pnpm blueprint:screens` can lay them side by side.
 */
const dialogScreens: readonly {
    readonly id: string;
    readonly label: string;
    readonly pairing: PairingVariant;
}[] = [
    {
        id: "dialog-generating",
        label: "Dialog · reading the connection",
        pairing: { direct: direct.loading },
    },
    {
        id: "dialog-opening",
        label: "Dialog · direct socket opening",
        pairing: { direct: direct.starting },
    },
    {
        id: "dialog-direct",
        label: "Dialog · direct code",
        pairing: { direct: direct.waiting },
    },
    {
        id: "dialog-connected",
        label: "Dialog · phone connected, verifying",
        pairing: { direct: direct.connected },
    },
    {
        id: "dialog-emoji",
        label: "Dialog · emoji match",
        pairing: { direct: direct.verifying },
    },
    {
        id: "dialog-emoji-waiting",
        label: "Dialog · emoji confirmed here, waiting for the phone",
        pairing: { direct: direct.desktopConfirmed },
    },
    {
        id: "dialog-completed",
        label: "Dialog · paired",
        pairing: { direct: direct.completed },
    },
    {
        id: "dialog-rejected",
        label: "Dialog · rejected by the phone",
        pairing: { direct: direct.rejected },
    },
    {
        id: "dialog-expired",
        label: "Dialog · verification timed out",
        pairing: { direct: direct.expiredVerifying },
    },
    {
        id: "dialog-code-expired",
        label: "Dialog · code expired",
        pairing: { direct: direct.expiredBeforeScan },
    },
    {
        id: "dialog-failed",
        label: "Dialog · pairing failed",
        pairing: { direct: direct.failed },
    },
    {
        id: "dialog-unavailable",
        label: "Dialog · Happy Agent reconnecting",
        pairing: {
            direct: direct.waiting,
            unavailable: "Happy Agent is reconnecting. Actions return when it is back.",
        },
    },
];

/** Onboarding's pairing step through the same pairing. */
const setupMethodScreens: readonly {
    readonly id: string;
    readonly label: string;
    readonly pairing: PairingVariant;
}[] = [
    {
        id: "setup-generating",
        label: "Onboarding · reading the connection",
        pairing: { direct: direct.loading },
    },
    {
        id: "setup-direct",
        label: "Onboarding · direct code",
        pairing: { direct: direct.waiting },
    },
    {
        id: "setup-emoji",
        label: "Onboarding · emoji match",
        pairing: { direct: direct.verifying },
    },
    {
        id: "setup-paired",
        label: "Onboarding · paired",
        pairing: { direct: direct.completed },
    },
    {
        id: "setup-failed",
        label: "Onboarding · pairing failed",
        pairing: { direct: direct.failed },
    },
];

/** A remote Happy Agent's onboarding pairs on the same panel. */
const remoteMethodScreens: readonly {
    readonly id: string;
    readonly label: string;
    readonly pairing: PairingVariant;
}[] = [
    {
        id: "remote-direct",
        label: "Remote onboarding · direct code",
        pairing: { direct: direct.waiting },
    },
    {
        id: "remote-emoji",
        label: "Remote onboarding · emoji match",
        pairing: { direct: direct.verifying },
    },
];

/** Settings screens also shown in the dark appearance, at the window Happy opens at. */
const darkSettingsScreens = new Set(["method-direct", "link-direct"]);

/** Settings screens also shown at the smallest window, where the codes stack. */
const narrowSettingsScreens = new Set([
    "method-direct",
    "link-intro",
    "link-direct",
    "codes",
    "verifying",
    "older-agent",
    "paired-devices",
]);

export function MobilePairingFlowPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Pairing a phone with the direct code, in Settings › Mobile access and in first-run setup. Each viewport is named for `pnpm blueprint:screens`."
            title="Mobile pairing flow"
        >
            {[defaultWindow, minimumWindow].flatMap((window) =>
                settingsScreens.flatMap((screen, index) => {
                    // The smallest window shows the screens whose layout changes in it.
                    if (window === minimumWindow && !narrowSettingsScreens.has(screen.id))
                        return [];
                    const number = String(index + 1).padStart(2, "0");
                    const size = `${String(window.width)}x${String(window.height)}`;
                    return [
                        <FullScreenSpecimen
                            detail={`${String(window.width)} × ${String(window.height)}`}
                            key={`${size}-${screen.id}`}
                            label={screen.label}
                            number={number}
                            screen={`${number}-${screen.id}-${size}`}
                            window={window}
                        >
                            <ThemeScope mode="light">{contained(screen.render())}</ThemeScope>
                        </FullScreenSpecimen>,
                    ];
                }),
            )}
            {settingsScreens.flatMap((screen, index) => {
                if (!darkSettingsScreens.has(screen.id)) return [];
                const number = String(index + 1).padStart(2, "0");
                const size = `${String(defaultWindow.width)}x${String(defaultWindow.height)}`;
                return [
                    <FullScreenSpecimen
                        detail={`${String(defaultWindow.width)} × ${String(defaultWindow.height)} · dark`}
                        key={`${size}-${screen.id}-dark`}
                        label={`${screen.label} · dark appearance`}
                        number={number}
                        screen={`${number}-${screen.id}-dark-${size}`}
                        window={defaultWindow}
                    >
                        <ThemeScope mode="dark">{contained(screen.render())}</ThemeScope>
                    </FullScreenSpecimen>,
                ];
            })}
            {[defaultWindow, minimumWindow].flatMap((window) =>
                setupScreens.map((screen, index) => {
                    const number = String(settingsScreens.length + index + 1).padStart(2, "0");
                    const size = `${String(window.width)}x${String(window.height)}`;
                    return (
                        <FullScreenSpecimen
                            detail={`${String(window.width)} × ${String(window.height)}`}
                            key={`${size}-${screen.id}`}
                            label={screen.label}
                            number={number}
                            screen={`${number}-${screen.id}-${size}`}
                            window={window}
                        >
                            <ThemeScope mode="dark">{contained(screen.render())}</ThemeScope>
                        </FullScreenSpecimen>
                    );
                }),
            )}
            {[defaultWindow, minimumWindow].flatMap((window) => {
                const size = `${String(window.width)}x${String(window.height)}`;
                const first = settingsScreens.length + setupScreens.length + 1;
                return [
                    ...dialogScreens.map((screen, index) => ({
                        screen,
                        number: String(first + index),
                        render: () => settings({ direct: direct.closed, pairing: screen.pairing }),
                        mode: "light" as const,
                    })),
                    ...setupMethodScreens.map((screen, index) => ({
                        screen,
                        number: String(first + dialogScreens.length + index),
                        render: () => setup(screen.pairing),
                        mode: "dark" as const,
                    })),
                    ...remoteMethodScreens.map((screen, index) => ({
                        screen,
                        number: String(
                            first + dialogScreens.length + setupMethodScreens.length + index,
                        ),
                        render: () => remote(screen.pairing),
                        mode: "dark" as const,
                    })),
                ].map(({ screen, number, render, mode }) => (
                    <FullScreenSpecimen
                        detail={`${String(window.width)} × ${String(window.height)}`}
                        key={`${size}-${screen.id}`}
                        label={screen.label}
                        number={number}
                        screen={`${number}-${screen.id}-${size}`}
                        window={window}
                    >
                        <ThemeScope mode={mode}>{contained(render())}</ThemeScope>
                    </FullScreenSpecimen>
                ));
            })}
        </ComponentPage>
    );
}
