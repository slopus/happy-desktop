import type {
    DesktopMobilePairingOptions,
    DesktopMobileSetupStep,
} from "../../src/DesktopMobileSetup";
import {
    MobileDirectConnectionSection,
    mobileDirectPairingEngaged,
    type MobileDirectConnectorState,
    type MobileDirectRemoval,
} from "../../src/MobileDirectConnection";
import {
    MobilePairingOptions,
    type MobilePairingOptionsLayout,
    type MobilePairingOptionsProps,
} from "../../src/MobilePairingOptions";
import {
    HappyAgentMobileLinkSettings,
    happyAgentMobileLinkHeading,
} from "../../src/pages/settings/HappyAgentMobileLinkSettings";
import {
    HappyAgentSettingsShell,
    type HappyAgentSettingsCategory,
} from "../../src/pages/settings/HappyAgentSettingsShell";
import { direct, now, relayWaiting } from "./mobilePairingFixtures";

const noop = () => undefined;

export type PairingVariant = Pick<MobilePairingOptionsProps, "direct" | "relay"> &
    Partial<MobilePairingOptionsProps>;

/** Both pairing methods at the fixed fixture time, every action a no-op. */
export function pairingOptionsSpecimen(
    layout: MobilePairingOptionsLayout,
    variant: PairingVariant,
    closable = true,
) {
    return (
        <MobilePairingOptions
            layout={layout}
            now={now}
            {...(closable ? { onClose: noop } : {})}
            onDirectConfirm={noop}
            onDirectReject={noop}
            onDirectStart={noop}
            onRelayRetry={noop}
            {...variant}
        />
    );
}

/** What a setup page receives for `variant`: both codes by default. */
export function setupPairingOptions(
    variant: PairingVariant = { direct: direct.waiting, relay: relayWaiting },
): DesktopMobilePairingOptions {
    return desktopPairingOptions("setup", variant);
}

/** What Settings › Mobile Access › Link mobile app receives for `variant`. */
export function settingsLinkPairingOptions(
    variant: PairingVariant = { direct: direct.waiting, relay: relayWaiting },
): DesktopMobilePairingOptions {
    // The guided link step has no close of its own: the Settings header leads back.
    return desktopPairingOptions("settings", variant, false);
}

function desktopPairingOptions(
    layout: MobilePairingOptionsLayout,
    variant: PairingVariant,
    closable = true,
): DesktopMobilePairingOptions {
    if (variant.method === "relay")
        return {
            view: pairingOptionsSpecimen(layout, variant, closable),
            verifying: false,
            completed: false,
            method: "relay",
        };
    return {
        view: pairingOptionsSpecimen(layout, variant, closable),
        ...(variant.method ? { method: variant.method } : {}),
        verifying: mobileDirectPairingEngaged(variant.direct),
        completed:
            variant.direct.kind === "ready" &&
            variant.direct.connector.pairing?.status === "completed",
    };
}

/** Settings › Mobile Access while a phone is being linked, at `step`. */
export function mobileLinkSpecimen(props: {
    readonly categories: readonly HappyAgentSettingsCategory[];
    readonly step: DesktopMobileSetupStep;
    readonly pairing?: PairingVariant;
}) {
    const pairingOptions = settingsLinkPairingOptions(props.pairing);
    const heading = happyAgentMobileLinkHeading(props.step, pairingOptions);
    return (
        <HappyAgentSettingsShell
            activeCategoryId="mobile-access"
            categories={props.categories}
            {...(heading.description ? { description: heading.description } : {})}
            onBack={noop}
            onCategorySelect={noop}
            onClose={noop}
            title={heading.title}
        >
            <HappyAgentMobileLinkSettings
                onContinue={noop}
                pairingOptions={pairingOptions}
                step={props.step}
            />
        </HappyAgentSettingsShell>
    );
}

/** The Settings direct section for `connector`. */
export function directSectionSpecimen(
    connector: MobileDirectConnectorState = direct.closed,
    extra: { readonly removal?: MobileDirectRemoval; readonly unavailable?: string } = {},
) {
    return (
        <MobileDirectConnectionSection
            connector={connector}
            now={now}
            onDeviceRemoveCancel={noop}
            onDeviceRemoveConfirm={noop}
            onDeviceRemoveRequest={noop}
            {...(extra.removal ? { removal: extra.removal } : {})}
            {...(extra.unavailable ? { unavailable: extra.unavailable } : {})}
        />
    );
}
