import type { ReactNode } from "react";
import { Button } from "./Button";
import type { MobilePairingMethod } from "./MobilePairingOptions";
import {
    OnboardingSteps,
    type MobileOnboardingStage,
    type OnboardingStage,
} from "./OnboardingSteps";
import { QRCode } from "./QRCode";
import { SetupPage } from "./SetupPage";
import type { ThemeMode } from "./ThemeScope";

export type DesktopMobileSetupStep =
    /** Platform pick and store code; confirming it is the consent that starts setup. */
    | { readonly kind: "intro"; readonly platform: "ios" | "android" }
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
    /** Pinned bottom-right on every step, the way the rest of setup carries it. */
    readonly help?: ReactNode;
    /** Returns to an earlier onboarding step from the shared step bar. */
    onStageSelect?(stage: OnboardingStage): void;
    readonly appearance: ThemeMode;
    readonly step: DesktopMobileSetupStep;
    readonly onContinue: () => void;
    readonly onSkip: () => void;
    readonly onPlatformSelect?: (platform: "ios" | "android") => void;
    /** Opens an external page: the host owns how a link leaves the app. */
    onExternalOpen?(url: string): void;
    /** Both pairing methods, shown side by side on the link step, each with its own state. */
    readonly pairingOptions: DesktopMobilePairingOptions;
}

const STORE_URLS = {
    // The short form of the App Store link: fewer bytes keep the code at a
    // lower version, so it still decodes at the smallest window.
    ios: "https://apps.apple.com/app/id6748571505",
    android: "https://play.google.com/store/apps/details?id=com.ex3ndr.happy",
} as const;
const ENCRYPTION_DOCS_URL = "https://happy.engineering/docs/security/";

/** The one line every phone screen leads with, and where encryption is explained. */
export function MobileAppCopy(props: { onExternalOpen?(url: string): void }) {
    return (
        <>
            Download the end-to-end encrypted mobile app.{" "}
            <EncryptionLink onExternalOpen={props.onExternalOpen} />
        </>
    );
}

/** What to do with the store code, and where encryption is explained. */
export function GetMobileAppCopy(props: { onExternalOpen?(url: string): void }) {
    return (
        <>
            Scan with your phone’s camera. End-to-end encrypted.{" "}
            <EncryptionLink onExternalOpen={props.onExternalOpen} />
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

/** The platform pick beside the store code it selects. */
export function MobileStoreDownload(props: {
    readonly platform: "ios" | "android";
    onPlatformSelect?(platform: "ios" | "android"): void;
}) {
    return (
        <div className="happy-desktop-mobile-setup__download">
            <div
                className="happy-desktop-mobile-setup__platform"
                role="group"
                aria-label="Phone platform"
            >
                <Button
                    aria-pressed={props.platform === "ios"}
                    variant={props.platform === "ios" ? "primary" : "ghost"}
                    onClick={() => props.onPlatformSelect?.("ios")}
                    fullWidth
                >
                    iPhone
                </Button>
                <Button
                    aria-pressed={props.platform === "android"}
                    variant={props.platform === "android" ? "primary" : "ghost"}
                    onClick={() => props.onPlatformSelect?.("android")}
                    fullWidth
                >
                    Android
                </Button>
            </div>
            <QRCode
                data={STORE_URLS[props.platform]}
                data-testid="happy-mobile-store-qr"
                label="QR code to download Happy mobile app"
                mark={props.platform === "ios" ? "app-store" : "google-play"}
                size={176}
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
            {...(props.onStageSelect ? { onStageSelect: props.onStageSelect } : {})}
        />
    ) : (
        <OnboardingSteps scope="mobile" stage={mobile} />
    );
    const frame = {
        backdrop: { appearance: props.appearance, kind: "sky" },
        className: "happy-desktop-mobile-setup",
        ...(props.help ? { help: props.help } : {}),
        steps,
        "data-testid": "local-onboarding-screen",
        // Approval replaces only the QR body, not the retained linking page or its sticker.
        transitionKey: `desktop-mobile-${step.kind}`,
    } as const;
    const skip = { label: "Skip mobile setup", onSelect: props.onSkip };

    // One screen gets the app onto the phone: what to do with the code, the
    // platform pick, and the store code. Confirming it asks for the pairing code.
    if (step.kind === "intro")
        return (
            <SetupPage
                {...frame}
                action={{ label: "Downloaded and opened", onSelect: props.onContinue }}
                copy={<GetMobileAppCopy onExternalOpen={props.onExternalOpen} />}
                scene="closed-lock"
                secondary={skip}
                title="Get Mobile App"
            >
                <MobileStoreDownload
                    platform={step.platform}
                    {...(props.onPlatformSelect
                        ? { onPlatformSelect: props.onPlatformSelect }
                        : {})}
                />
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
