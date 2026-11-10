import type { ReactNode } from "react";
import { Button } from "./Button";
import type { MobilePairingMethod } from "./MobilePairingOptions";
import {
    OnboardingSteps,
    type MobileOnboardingStage,
    type OnboardingStage,
} from "./OnboardingSteps";
import { QRCode } from "./QRCode";
import { SetupDrift } from "./SetupDrift";
import { SetupPage } from "./SetupPage";
import type { ThemeMode } from "./ThemeScope";

export type DesktopMobileSetupStep =
    /** The download code; confirming it is the consent that starts setup. */
    | { readonly kind: "intro" }
    | {
          readonly kind: "link";
          readonly phase:
              | { readonly kind: "checking" }
              | { readonly kind: "pairing"; readonly data: string; readonly expiresAt: number }
              | { readonly kind: "failed"; readonly message: string };
      }
    | { readonly kind: "connected"; readonly online: boolean; readonly message?: string };

/** Both pairing methods on a setup page, and whether the direct emoji step leads. */
export interface DesktopMobilePairingOptions {
    /** MobilePairingOptions in its `setup` layout. */
    readonly view: ReactNode;
    /** A phone has connected directly (`mobileDirectPairingEngaged`). */
    readonly verifying: boolean;
    /** The direct pairing finished: the page offers Continue instead of Skip. */
    readonly completed: boolean;
    /** The method shown, one at a time; absent while both show side by side. */
    readonly method?: MobilePairingMethod;
}

/** The subtitle over the codes, or over the emoji step once a phone connects directly. */
export function desktopMobilePairingOptionsCopy(options: DesktopMobilePairingOptions): string {
    if (options.completed) return "Your phone can now reach this computer directly.";
    if (options.verifying) return "Check the emoji on this computer and on your phone.";
    return options.method === undefined
        ? "Open Happy on your phone and scan either code."
        : "Open Happy on your phone and scan the code.";
}

export interface DesktopMobileSetupProps {
    /** Full first-run context; Settings shows only the opted-in mobile branch. */
    readonly onboarding?: boolean;
    /** The Windows sandbox step is part of this machine's onboarding. */
    readonly sandboxStep?: boolean;
    /** Pinned bottom-right on every step, the way the rest of setup carries it. */
    readonly help?: ReactNode;
    /** Pinned top-left on every step: whose setup this is. */
    readonly identity?: ReactNode;
    /** Returns to an earlier onboarding step from the shared step bar. */
    onStageSelect?(stage: OnboardingStage): void;
    /** The steps the shared bar may send someone to; absent, every finished one behind. */
    readonly selectableStages?: readonly OnboardingStage[];
    readonly appearance: ThemeMode;
    readonly step: DesktopMobileSetupStep;
    readonly onContinue: () => void;
    readonly onSkip: () => void;
    /** Opens an external page: the host owns how a link leaves the app. */
    onExternalOpen?(url: string): void;
    /** Both pairing methods, shown side by side on the link step, each with its own state. */
    readonly pairingOptions: DesktopMobilePairingOptions;
}

/** One address for every phone: it sends each one on to its own store. */
const DOWNLOAD_URL = "https://link.happy.engineering/download";
/** The same address as someone types it, without the scheme. */
const DOWNLOAD_LINK_TEXT = "link.happy.engineering/download";
const ENCRYPTION_DOCS_URL = "https://happy.engineering/docs/security/";
/** What drifts beside the download code: a phone, its privacy, and its company. */
const DOWNLOAD_DRIFT = [
    "alien-monster",
    "monkey-hear-no-evil",
    "sparkles",
    "robot",
    "closed-lock",
    "cherry-blossom",
] as const;

/** The one line every phone screen leads with, and where encryption is explained. */
export function MobileAppCopy(props: { onExternalOpen?(url: string): void }) {
    return (
        <>
            Download the end-to-end encrypted mobile app.{" "}
            <EncryptionLink onExternalOpen={props.onExternalOpen} />
        </>
    );
}

/**
 * What to do with the download code, the same address written out for a phone
 * without a camera, and where encryption is explained.
 */
export function GetMobileAppCopy(props: { onExternalOpen?(url: string): void }) {
    return (
        <>
            Scan with your phone’s camera or open{" "}
            <span className="happy-desktop-mobile-setup__raw-url">{DOWNLOAD_LINK_TEXT}</span>.
            End-to-end encrypted. <EncryptionLink onExternalOpen={props.onExternalOpen} />
        </>
    );
}

function EncryptionLink(props: { onExternalOpen?(url: string): void }) {
    return (
        <a
            className="happy-desktop-mobile-setup__link"
            href={ENCRYPTION_DOCS_URL}
            onClick={(event) => {
                if (!props.onExternalOpen) return;
                event.preventDefault();
                props.onExternalOpen(ENCRYPTION_DOCS_URL);
            }}
            rel="noopener noreferrer"
            target="_blank"
        >
            How it works
        </a>
    );
}

/** The download code; the subtitle above it writes the same address out. */
export function MobileStoreDownload() {
    return (
        <div className="happy-desktop-mobile-setup__download">
            <QRCode
                data={DOWNLOAD_URL}
                data-testid="happy-mobile-store-qr"
                label="QR code to download Happy mobile app"
                size={224}
            />
        </div>
    );
}

/** Optional desktop-to-phone setup. All operations and progress arrive through props. */
export function DesktopMobileSetup(props: DesktopMobileSetupProps) {
    const { step } = props;
    const mobile: MobileOnboardingStage =
        step.kind === "intro" ? "get-app" : step.kind === "link" ? "connect-phone" : "complete";
    // A failed method shows in its own slot, not on the bar.
    const steps = props.onboarding ? (
        <OnboardingSteps
            scope="desktop"
            stage={
                mobile === "connect-phone" || mobile === "complete" ? "connect-phone" : "get-app"
            }
            {...(props.sandboxStep ? { sandbox: true } : {})}
            {...(props.onStageSelect ? { onStageSelect: props.onStageSelect } : {})}
            {...(props.selectableStages ? { selectable: props.selectableStages } : {})}
        />
    ) : (
        <OnboardingSteps scope="mobile" stage={mobile} />
    );
    const frame = {
        backdrop: { appearance: props.appearance, kind: "sky" },
        className: "happy-desktop-mobile-setup",
        ...(props.help ? { help: props.help } : {}),
        ...(props.identity ? { identity: props.identity } : {}),
        steps,
        "data-testid": "local-onboarding-screen",
        // Approval replaces only the QR body, not the retained linking page or its sticker.
        transitionKey: `desktop-mobile-${step.kind}`,
    } as const;
    const skip = { label: "Skip mobile setup", onSelect: props.onSkip };

    // One screen gets the app onto the phone: what to do with the code, then
    // the code. Like Subscriptions it is a choice, so no picture and centred
    // words. Confirming it asks for the pairing code.
    if (step.kind === "intro")
        return (
            <SetupPage
                {...frame}
                action={{ label: "Downloaded and opened", onSelect: props.onContinue }}
                copy={<GetMobileAppCopy onExternalOpen={props.onExternalOpen} />}
                decoration={<SetupDrift scenes={DOWNLOAD_DRIFT} />}
                placement="centered"
                secondary={skip}
                title="Get Mobile App"
            >
                <MobileStoreDownload />
            </SetupPage>
        );

    if (step.kind === "link")
        return (
            <SetupPage
                {...frame}
                className="happy-desktop-mobile-setup happy-desktop-mobile-setup--options"
                copy={desktopMobilePairingOptionsCopy(props.pairingOptions)}
                scene="closed-lock"
                {...(props.pairingOptions.completed
                    ? { action: { label: "Continue", onSelect: props.onContinue } }
                    : { secondary: skip })}
                title={props.pairingOptions.completed ? "Mobile App Linked" : "Link Mobile App"}
            >
                {props.pairingOptions.view}
            </SetupPage>
        );

    return (
        <SetupPage
            {...frame}
            action={{ label: "Continue", onSelect: props.onContinue }}
            scene="confetti-ball"
            {...(step.online
                ? {}
                : {
                      status: {
                          label:
                              step.message ??
                              "Remote control resumes when your computer is online.",
                      },
                  })}
            title="Mobile App Linked"
        />
    );
}
