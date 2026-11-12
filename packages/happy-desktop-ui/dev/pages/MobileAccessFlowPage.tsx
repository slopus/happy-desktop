import type { ReactNode } from "react";
import {
    HappyAgentMobileSettings,
    type HappyAgentMobileSettingsProps,
} from "../../src/pages/settings/HappyAgentMobileSettings";
import {
    HappyAgentSettingsShell,
    type HappyAgentSettingsCategory,
} from "../../src/pages/settings/HappyAgentSettingsShell";
import { ComponentPage, FullScreenSpecimen } from "../kit";
import { direct, relayWaiting } from "./mobilePairingFixtures";
import { directSectionSpecimen, pairingOptionsSpecimen } from "./mobilePairingSpecimens";

/** The page plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "P-015";

const noop = () => undefined;

/** The window Happy opens at, and the smallest one it allows. */
const windows = [
    { id: "default", width: 1100, height: 760 },
    { id: "minimum", width: 720, height: 640 },
] as const;

const categories: readonly HappyAgentSettingsCategory[] = [
    { icon: "settings", id: "general", label: "General", tone: "gray" },
    { icon: "users", id: "account", label: "Account", tone: "blue" },
    { icon: "mobile", id: "mobile-access", label: "Mobile access", tone: "green" },
    { group: "Agents", icon: "doc", id: "instructions", label: "Instructions", tone: "purple" },
    { group: "Agents", icon: "globe", id: "providers", label: "Providers", tone: "indigo" },
    { group: "Agents", icon: "zap", id: "usage", label: "Usage", tone: "teal" },
    { group: "Agents", icon: "lock", id: "secrets", label: "Secrets", tone: "green" },
    { group: "Advanced", icon: "code", id: "debug", label: "Dev tools", tone: "gray" },
];

const updatedAt = 1_727_870_400_000;

const handlers = {
    onDisconnect: noop,
    onManagementCancel: noop,
    onManagementConfirm: noop,
    onPairingOptionsOpen: noop,
    direct: directSectionSpecimen(),
} satisfies Partial<HappyAgentMobileSettingsProps>;

/** A local Agent with a saved pairing; each screen overrides only what it is about. */
const paired = {
    ...handlers,
    configured: true,
    pairingDirectOnly: true,
    removesComputer: true,
    status: "connected",
    updatedAt,
} satisfies HappyAgentMobileSettingsProps;

const screens: readonly {
    readonly id: string;
    readonly label: string;
    readonly props: HappyAgentMobileSettingsProps;
}[] = [
    {
        id: "not-set-up",
        label: "Not set up",
        props: {
            ...handlers,
            configured: false,
            status: "disconnected",
        },
    },
    ...(["direct", "relay"] as const).map((method) => ({
        id: `pairing-${method}`,
        label: `Pairing · Direct | Relay dialog on ${method === "direct" ? "Direct" : "Relay"}`,
        props: {
            ...handlers,
            configured: false,
            status: "pairing" as const,
            pairingOptions: pairingOptionsSpecimen("dialog", {
                direct: direct.waiting,
                relay: relayWaiting,
                method,
            }),
        },
    })),
    { id: "ready", label: "Ready · linked through the Happy server", props: paired },
    {
        id: "direct",
        label: "Linked · direct code dialog",
        props: {
            ...paired,
            direct: directSectionSpecimen(direct.waiting),
            pairingOptions: pairingOptionsSpecimen("dialog", {
                direct: direct.waiting,
                relay: { kind: "connected" },
                method: "direct",
                methodFixed: true,
            }),
        },
    },
    {
        id: "offline",
        label: "Offline · pairing saved",
        props: { ...paired, status: "disconnected" },
    },
    {
        id: "disconnect",
        label: "Disconnect · confirmation",
        props: { ...paired, management: { kind: "disconnect", pending: false } },
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
                title="Mobile access"
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
            summary="Settings › Mobile access in the order a person meets it, at the window Happy opens at and at its minimum window: pairing, the composed phone status, and the disconnect confirmation. Each viewport is named for `pnpm blueprint:screens`."
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
