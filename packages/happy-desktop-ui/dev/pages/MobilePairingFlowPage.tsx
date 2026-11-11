import type { ReactNode } from "react";
import { DesktopMobileSetup } from "../../src/DesktopMobileSetup";
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
import { devices, direct, relayWaiting } from "./mobilePairingFixtures";
import {
    directSectionSpecimen,
    mobileLinkSpecimen,
    pairingOptionsSpecimen,
    setupPairingOptions,
    type PairingVariant,
} from "./mobilePairingSpecimens";

/** The page plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "P-021";

const noop = () => undefined;

const categories: readonly HappyAgentSettingsCategory[] = [
    { icon: "settings", id: "general", label: "General", tone: "gray" },
    { icon: "users", id: "account", label: "Account", tone: "blue" },
    { icon: "mobile", id: "mobile-access", label: "Mobile access", tone: "green" },
    { group: "Agents", icon: "globe", id: "providers", label: "Providers", tone: "indigo" },
    { group: "Advanced", icon: "code", id: "debug", label: "Dev tools", tone: "gray" },
];

/** The window Happy opens at, and the smallest one it allows. */
const defaultWindow = { width: 1100, height: 760 } as const;
const minimumWindow = { width: 720, height: 640 } as const;

function settings(props: {
    readonly direct: MobileDirectConnectorState;
    /** The direct connection's experiment is off: no direct section. */
    readonly experimentOff?: boolean;
    readonly pairing?: PairingVariant;
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
                {...(props.experimentOff
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
                status={props.pairing ? "pairing" : "disconnected"}
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
            step={{ kind: "link", phase: { kind: "checking" } }}
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
        label: "Connect a phone, relay and direct sections",
        render: () => settings({ direct: direct.closed }),
    },
    {
        id: "method-relay",
        label: "Relay | Direct · Relay, the experiment off",
        render: () =>
            settings({
                direct: direct.closed,
                experimentOff: true,
                pairing: { direct: direct.closed, relay: relayWaiting, method: "relay" },
            }),
    },
    {
        id: "method-direct",
        label: "Relay | Direct · Direct, the experiment on",
        render: () =>
            settings({
                direct: direct.closed,
                pairing: { direct: direct.waiting, relay: relayWaiting, method: "direct" },
            }),
    },
    {
        id: "link-intro",
        label: "Link a phone · get the app",
        render: () => mobileLinkSpecimen({ categories, step: { kind: "intro" } }),
    },
    {
        id: "link-relay",
        label: "Link a phone · Relay code",
        render: () =>
            mobileLinkSpecimen({
                categories,
                step: { kind: "link", phase: { kind: "checking" } },
                pairing: { direct: direct.closed, relay: relayWaiting, method: "relay" },
            }),
    },
    {
        id: "link-direct",
        label: "Link a phone · Direct code",
        render: () =>
            mobileLinkSpecimen({
                categories,
                step: { kind: "link", phase: { kind: "checking" } },
                pairing: { direct: direct.waiting, relay: relayWaiting, method: "direct" },
            }),
    },
    {
        id: "link-direct-failed",
        label: "Link a phone · direct pairing failed",
        render: () =>
            mobileLinkSpecimen({
                categories,
                step: { kind: "link", phase: { kind: "checking" } },
                pairing: { direct: direct.failed, relay: relayWaiting, method: "direct" },
            }),
    },
    {
        id: "link-relay-failed",
        label: "Link a phone · relay failed",
        render: () =>
            mobileLinkSpecimen({
                categories,
                step: {
                    kind: "link",
                    phase: { kind: "failed", message: "Happy couldn't reach its server." },
                },
                pairing: {
                    direct: direct.closed,
                    relay: { kind: "failed", message: "Happy couldn't reach its server." },
                    method: "relay",
                },
            }),
    },
    {
        id: "link-verifying",
        label: "Link a phone · emoji step",
        render: () =>
            mobileLinkSpecimen({
                categories,
                step: { kind: "link", phase: { kind: "checking" } },
                pairing: { direct: direct.phoneConfirmed, relay: relayWaiting, method: "direct" },
            }),
    },
    {
        id: "link-completed",
        label: "Link a phone · paired directly, Done",
        render: () =>
            mobileLinkSpecimen({
                categories,
                step: { kind: "link", phase: { kind: "checking" } },
                pairing: { direct: direct.completed, relay: relayWaiting, method: "direct" },
            }),
    },
    {
        id: "link-connected",
        label: "Link a phone · linked through the relay",
        render: () => mobileLinkSpecimen({ categories, step: { kind: "connected", online: true } }),
    },
    {
        id: "codes",
        label: "Both codes, side by side",
        render: () =>
            settings({
                direct: direct.waiting,
                pairing: { direct: direct.waiting, relay: relayWaiting },
            }),
    },
    {
        id: "phone-connected",
        label: "Phone connected, verifying…",
        render: () =>
            settings({
                direct: direct.connected,
                pairing: { direct: direct.connected, relay: relayWaiting },
            }),
    },
    {
        id: "verifying",
        label: "Emoji step · nobody confirmed",
        render: () =>
            settings({
                direct: direct.verifying,
                pairing: { direct: direct.verifying, relay: relayWaiting },
            }),
    },
    {
        id: "phone-confirmed",
        label: "Emoji step · phone confirmed",
        render: () =>
            settings({
                direct: direct.phoneConfirmed,
                pairing: { direct: direct.phoneConfirmed, relay: relayWaiting },
            }),
    },
    {
        id: "desktop-confirmed",
        label: "Emoji step · waiting for the phone",
        render: () =>
            settings({
                direct: direct.desktopConfirmed,
                pairing: { direct: direct.desktopConfirmed, relay: relayWaiting },
            }),
    },
    {
        id: "completed",
        label: "Direct pairing completed",
        render: () =>
            settings({
                direct: direct.completed,
                pairing: { direct: direct.completed, relay: relayWaiting },
            }),
    },
    {
        id: "rejected",
        label: "Rejected by the phone",
        render: () =>
            settings({
                direct: direct.rejected,
                pairing: { direct: direct.rejected, relay: relayWaiting },
            }),
    },
    {
        id: "cancelled",
        label: "Cancelled on this computer",
        render: () =>
            settings({
                direct: direct.cancelled,
                pairing: { direct: direct.cancelled, relay: relayWaiting },
            }),
    },
    {
        id: "expired",
        label: "Verification timed out",
        render: () =>
            settings({
                direct: direct.expiredVerifying,
                pairing: { direct: direct.expiredVerifying, relay: relayWaiting },
            }),
    },
    {
        id: "code-expired",
        label: "Direct code expired before a scan",
        render: () =>
            settings({
                direct: direct.expiredBeforeScan,
                pairing: { direct: direct.expiredBeforeScan, relay: relayWaiting },
            }),
    },
    {
        id: "failed",
        label: "Direct pairing failed",
        render: () =>
            settings({
                direct: direct.failed,
                pairing: { direct: direct.failed, relay: relayWaiting },
            }),
    },
    {
        id: "relay-failed",
        label: "Relay failed, direct unaffected",
        render: () =>
            settings({
                direct: direct.waiting,
                pairing: {
                    direct: direct.waiting,
                    relay: { kind: "failed", message: "Happy couldn't reach its server." },
                },
            }),
    },
    {
        id: "relay-connected",
        label: "Relay already linked; direct pairs another phone",
        render: () =>
            settings({
                direct: direct.waiting,
                pairing: { direct: direct.waiting, relay: { kind: "connected" } },
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
                pairing: { direct: direct.disabled, relay: relayWaiting },
            }),
    },
    {
        id: "direct-starting",
        label: "Direct socket opening",
        render: () =>
            settings({
                direct: direct.starting,
                pairing: { direct: direct.starting, relay: relayWaiting },
            }),
    },
    {
        id: "direct-socket-failed",
        label: "Direct socket failed",
        render: () =>
            settings({
                direct: direct.socketFailed,
                pairing: { direct: direct.socketFailed, relay: relayWaiting },
            }),
    },
    {
        id: "older-agent",
        label: "Older Happy Agent (404)",
        render: () =>
            settings({
                direct: direct.unsupported,
                pairing: { direct: direct.unsupported, relay: relayWaiting },
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
        label: "Onboarding · both codes",
        render: () => setup({ direct: direct.waiting, relay: relayWaiting }),
    },
    {
        id: "setup-method-relay",
        label: "Onboarding · Relay | Direct, Relay",
        render: () => setup({ direct: direct.closed, relay: relayWaiting, method: "relay" }),
    },
    {
        id: "setup-method-direct",
        label: "Onboarding · Relay | Direct, Direct",
        render: () => setup({ direct: direct.waiting, relay: relayWaiting, method: "direct" }),
    },
    {
        id: "setup-verifying",
        label: "Onboarding · emoji step",
        render: () => setup({ direct: direct.phoneConfirmed, relay: relayWaiting }),
    },
    {
        id: "setup-relay-failed",
        label: "Onboarding · relay failed, direct code shown",
        render: () =>
            setup({
                direct: direct.waiting,
                relay: { kind: "failed", message: "Happy couldn't reach its server." },
            }),
    },
    {
        id: "setup-older-agent",
        label: "Onboarding · older Happy Agent",
        render: () => setup({ direct: direct.unsupported, relay: relayWaiting }),
    },
    {
        id: "setup-completed",
        label: "Onboarding · paired directly, Continue",
        render: () => setup({ direct: direct.completed, relay: relayWaiting }),
    },
    {
        id: "remote-codes",
        label: "Remote onboarding · both codes",
        render: () => remote({ direct: direct.waiting, relay: relayWaiting }),
    },
];

/** Settings screens also shown at the smallest window, where the codes stack. */
const narrowSettingsScreens = new Set([
    "method-relay",
    "method-direct",
    "link-intro",
    "link-relay",
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
            summary="Pairing a phone with both methods side by side, in Settings › Mobile access and in first-run setup. Each viewport is named for `pnpm blueprint:screens`."
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
        </ComponentPage>
    );
}
