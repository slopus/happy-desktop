import type { ReactNode } from "react";
import { Button } from "./Button";
import { CopyButton } from "./CopyButton";
import { OnboardingSteps, type MobileOnboardingStage } from "./OnboardingSteps";
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

export interface DesktopMobileSetupProps {
    /** Full first-run context; Settings shows only the opted-in mobile branch. */
    readonly onboarding?: boolean;
    /** Pinned bottom-right on every step, the way the rest of setup carries it. */
    readonly help?: ReactNode;
    /** Returns to an earlier onboarding step from the shared step bar. */
    onStageSelect?(
        stage: "setup" | "subscriptions" | "profile" | "get-app" | "connect-phone",
    ): void;
    readonly appearance: ThemeMode;
    readonly step: DesktopMobileSetupStep;
    readonly onContinue: () => void;
    readonly onSkip: () => void;
    readonly onPlatformSelect?: (platform: "ios" | "android") => void;
    /** Opens an external page: the host owns how a link leaves the app. */
    onExternalOpen?(url: string): void;
}

const STORE_URLS = {
    ios: "https://apps.apple.com/us/app/happy-claude-code-client/id6748571505",
    android: "https://play.google.com/store/apps/details?id=com.ex3ndr.happy",
} as const;
const ENCRYPTION_DOCS_URL = "https://happy.engineering/docs/security/";
/**
 * Drawn blurred while the real code is on its way. It has the real payload's
 * shape and length, so the stand-in has the same density as what replaces it.
 */
const PLACEHOLDER_CODE = "happy://terminal?AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

/** The one line every phone screen leads with, and where encryption is explained. */
export function MobileAppCopy(props: { onExternalOpen?(url: string): void }) {
    return (
        <>
            Download the end-to-end encrypted mobile app.{" "}
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
        </>
    );
}

/** Optional desktop-to-phone setup. All operations and progress arrive through props. */
export function DesktopMobileSetup(props: DesktopMobileSetupProps) {
    const { step } = props;
    const mobile: MobileOnboardingStage =
        step.kind === "intro" ? "get-app" : step.kind === "link" ? "connect-phone" : "complete";
    const failed = step.kind === "link" && step.phase.kind === "failed";
    const steps = props.onboarding ? (
        <OnboardingSteps
            scope="desktop"
            stage={
                mobile === "connect-phone" || mobile === "complete" ? "connect-phone" : "get-app"
            }
            failed={failed}
            {...(props.onStageSelect ? { onStageSelect: props.onStageSelect } : {})}
        />
    ) : (
        <OnboardingSteps scope="mobile" stage={mobile} failed={failed} />
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

    // One screen gets the app onto the phone: the encrypted-app line, the
    // platform pick, and the store code. Confirming it asks for the pairing code.
    if (step.kind === "intro")
        return (
            <SetupPage
                {...frame}
                action={{ label: "I have it", onSelect: props.onContinue }}
                copy={<MobileAppCopy onExternalOpen={props.onExternalOpen} />}
                scene="closed-lock"
                secondary={skip}
                title="Take Happy with you"
            >
                <div className="happy-desktop-mobile-setup__download">
                    <div
                        className="happy-desktop-mobile-setup__platform"
                        role="group"
                        aria-label="Phone platform"
                    >
                        <Button
                            aria-pressed={step.platform === "ios"}
                            variant={step.platform === "ios" ? "primary" : "ghost"}
                            onClick={() => props.onPlatformSelect?.("ios")}
                            fullWidth
                        >
                            iPhone
                        </Button>
                        <Button
                            aria-pressed={step.platform === "android"}
                            variant={step.platform === "android" ? "primary" : "ghost"}
                            onClick={() => props.onPlatformSelect?.("android")}
                            fullWidth
                        >
                            Android
                        </Button>
                    </div>
                    <QRCode
                        data={STORE_URLS[step.platform]}
                        size={136}
                        label="QR code to download Happy Coder"
                        data-testid="happy-mobile-store-qr"
                    />
                </div>
            </SetupPage>
        );

    if (step.kind === "link") {
        const { phase } = step;
        if (phase.kind === "failed")
            return (
                <SetupPage
                    {...frame}
                    action={{ label: "Try again", onSelect: props.onContinue }}
                    scene="closed-lock"
                    secondary={skip}
                    status={{ label: phase.message }}
                    title="Phone didn't connect"
                />
            );
        // One page whether or not the code has arrived. Until it has, a
        // blurred stand-in holds its exact place, so nothing moves when the
        // real one replaces it.
        return (
            <SetupPage
                {...frame}
                copy="Open Happy Coder and scan."
                scene="closed-lock"
                secondary={skip}
                title="Scan this code"
            >
                <div className="happy-desktop-mobile-setup__pairing">
                    {phase.kind === "pairing" ? (
                        <>
                            <QRCode
                                data={phase.data}
                                size={136}
                                label="QR code to link your devices"
                                data-testid="happy-mobile-pairing-qr"
                            />
                            {/* The payload is opaque by contract: a client either
                                draws it as a QR code or hands it over as a deep
                                link, and never reads or rebuilds it. */}
                            <CopyButton
                                caption="Copy auth link"
                                copiedCaption="Link copied"
                                data-testid="happy-mobile-pairing-copy"
                                label="Copy auth link"
                                text={phase.data}
                            />
                        </>
                    ) : (
                        <div
                            aria-hidden
                            className="happy-desktop-mobile-setup__code-placeholder"
                            data-testid="happy-mobile-pairing-placeholder"
                        >
                            <QRCode data={PLACEHOLDER_CODE} size={136} />
                        </div>
                    )}
                </div>
            </SetupPage>
        );
    }

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
            title={step.online ? "Phone connected" : "Phone linked"}
        />
    );
}
