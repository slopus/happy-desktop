import { Box } from "../../Box";
import { Button } from "../../Button";
import {
    desktopMobilePairingOptionsCopy,
    GetMobileAppCopy,
    MobileStoreDownload,
    type DesktopMobilePairingOptions,
    type DesktopMobileSetupStep,
} from "../../DesktopMobileSetup";
import { PairingActions, PairingResult } from "../../MobilePairingParts";
import { HappyAgentSettingsSection } from "./HappyAgentSettingsShell";

export interface HappyAgentMobileLinkSettingsProps {
    readonly step: DesktopMobileSetupStep;
    /** Both pairing methods; the view is MobilePairingOptions in its `settings` layout. */
    readonly pairingOptions: DesktopMobilePairingOptions;
    readonly onContinue: () => void;
    /** Opens an external page: the host owns how a link leaves the app. */
    onExternalOpen?(url: string): void;
}

/** What the Settings header names the page for `step`. */
export function happyAgentMobileLinkHeading(
    step: DesktopMobileSetupStep,
    pairingOptions: DesktopMobilePairingOptions,
): { readonly title: string; readonly description?: string } {
    if (step.kind === "intro") return { title: "Get mobile app", description: "Step 1 of 2" };
    if (step.kind === "link" && !pairingOptions.completed)
        return { title: "Link mobile app", description: "Step 2 of 2" };
    return { title: "Mobile app linked" };
}

/**
 * Linking a phone from Settings › Mobile Access: the same two steps as
 * first-run setup — the store code, then both pairing codes — drawn on the
 * Settings surface beside its category column rather than on a setup page.
 * The Settings header carries the step's name and the way back.
 */
export function HappyAgentMobileLinkSettings(props: HappyAgentMobileLinkSettingsProps) {
    const { step } = props;
    if (step.kind === "intro")
        return (
            <HappyAgentSettingsSection>
                <Box
                    className="happy-agent-mobile-link"
                    data-happy-desktop-ui="happy-agent-mobile-link"
                >
                    <p className="happy-agent-mobile-link__copy">
                        <GetMobileAppCopy
                            {...(props.onExternalOpen
                                ? { onExternalOpen: props.onExternalOpen }
                                : {})}
                        />
                    </p>
                    <MobileStoreDownload />
                    <Button onClick={props.onContinue} variant="primary">
                        Downloaded and opened
                    </Button>
                </Box>
            </HappyAgentSettingsSection>
        );

    if (step.kind === "link")
        return (
            <HappyAgentSettingsSection
                description={desktopMobilePairingOptionsCopy(props.pairingOptions)}
                rows="cards"
            >
                {props.pairingOptions.view}
                {props.pairingOptions.completed ? (
                    <Box className="happy-agent-mobile-link__actions">
                        <Button onClick={props.onContinue} variant="primary">
                            Done
                        </Button>
                    </Box>
                ) : null}
            </HappyAgentSettingsSection>
        );

    return (
        <HappyAgentSettingsSection>
            <Box
                className="happy-agent-mobile-link"
                data-happy-desktop-ui="happy-agent-mobile-link"
            >
                <PairingResult
                    detail={
                        step.online
                            ? "Happy Mobile can now reach this computer."
                            : (step.message ??
                              "Remote control resumes when your computer is online.")
                    }
                    icon="checkmark-circle"
                    title="Mobile app linked"
                    tone="success"
                >
                    <PairingActions>
                        <Button onClick={props.onContinue} variant="primary">
                            Done
                        </Button>
                    </PairingActions>
                </PairingResult>
            </Box>
        </HappyAgentSettingsSection>
    );
}
