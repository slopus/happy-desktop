import type { ReactNode } from "react";
import {
    MobileAccessConfirmation,
    type MobileAccessTerminalResetPreview,
} from "../../src/MobileAccessConfirmation";
import { ComponentPage, Specimen } from "../kit";

export const componentNumber = "C-285";

/** Gives each fixed overlay a desktop-sized, clipping-safe specimen window. */
function frame(children: ReactNode, height = 760) {
    return (
        <div
            style={{
                background: "var(--groupped-background)",
                border: "1px solid var(--surface-pressed-overlay)",
                borderRadius: "8px",
                height: `${height}px`,
                overflow: "hidden",
                position: "relative",
                transform: "translateZ(0)",
                width: "760px",
            }}
        >
            {children}
        </div>
    );
}

const handlers = {
    onCancel: () => undefined,
    onConfirm: () => undefined,
    onRegistrationRemovalChange: () => undefined,
};

const preview: MobileAccessTerminalResetPreview = {
    credentialFile: "/Users/ada/.happy/access.key",
    settingsFile: "/Users/ada/.happy/settings.json",
    settingsFields: ["machineId", "machineIdConfirmedByServer"],
    stopsDaemon: true,
};

const registration = {
    machineId: "8f3c2a71-5d0e-4b6a-9c1f-2e7d4a90b3c5",
    serverUrl: "https://api.cluster-fluster.com",
    accountKeyFingerprint: "4f9a1c07e2b85d36a0c4e7f19b2d58a3c6e0f47b19d2a85c3e6f07b41a9d2c58",
};

export function MobileAccessConfirmationPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="The destructive confirmations of Mobile Access. Each names what changes and what stays in terms of what the operation actually does; neither claims to revoke a phone or delete a computer it cannot name."
            title="MobileAccessConfirmation"
        >
            <Specimen
                detail="480px · removes only this Happy Agent's pairing · phones and CLI stay"
                label="Disconnect"
                number="01"
                stage="app"
            >
                {frame(
                    <MobileAccessConfirmation
                        {...handlers}
                        confirmation={{ kind: "disconnect", pending: false }}
                    />,
                    560,
                )}
            </Specimen>

            <Specimen
                detail="480px · request in flight · dim and Cancel inert"
                label="Disconnecting"
                number="02"
                stage="app"
            >
                {frame(
                    <MobileAccessConfirmation
                        {...handlers}
                        confirmation={{ kind: "disconnect", pending: true }}
                    />,
                    560,
                )}
            </Specimen>

            <Specimen
                detail="480px · refused disconnect keeps the dialog open with the reason"
                label="Disconnect failed"
                number="03"
                stage="app"
            >
                {frame(
                    <MobileAccessConfirmation
                        {...handlers}
                        confirmation={{
                            kind: "disconnect",
                            pending: false,
                            error: "Happy Agent did not answer within 10 seconds.",
                        }}
                    />,
                    640,
                )}
            </Specimen>

            <Specimen
                detail="480px · registration not known exactly · only local files and daemon listed"
                label="Remove saved terminal login"
                number="04"
                stage="app"
            >
                {frame(
                    <MobileAccessConfirmation
                        {...handlers}
                        confirmation={{
                            kind: "terminal-reset",
                            preview,
                            accountKeyFingerprint: registration.accountKeyFingerprint,
                            removeRegistration: false,
                            pending: false,
                        }}
                    />,
                )}
            </Specimen>

            <Specimen
                detail="480px · exact registration known · opt-in removal, off by default"
                label="With known registration"
                number="05"
                stage="app"
            >
                {frame(
                    <MobileAccessConfirmation
                        {...handlers}
                        confirmation={{
                            kind: "terminal-reset",
                            preview: { ...preview, registration },
                            accountKeyFingerprint: registration.accountKeyFingerprint,
                            removeRegistration: false,
                            pending: false,
                        }}
                    />,
                    860,
                )}
            </Specimen>

            <Specimen
                detail="480px · registration removal chosen · request in flight"
                label="Removing"
                number="06"
                stage="app"
            >
                {frame(
                    <MobileAccessConfirmation
                        {...handlers}
                        confirmation={{
                            kind: "terminal-reset",
                            preview: { ...preview, registration },
                            accountKeyFingerprint: registration.accountKeyFingerprint,
                            removeRegistration: true,
                            pending: true,
                        }}
                    />,
                    860,
                )}
            </Specimen>

            <Specimen
                detail="480px · partial failure lists only the steps that completed · no automatic retry"
                label="Removal did not finish"
                number="07"
                stage="app"
            >
                {frame(
                    <MobileAccessConfirmation
                        {...handlers}
                        confirmation={{
                            kind: "terminal-reset",
                            preview: { ...preview, registration },
                            accountKeyFingerprint: registration.accountKeyFingerprint,
                            removeRegistration: true,
                            pending: false,
                            error: "The Happy server refused the registration removal (HTTP 503).",
                            effects: {
                                localAuthCleared: false,
                                registrationRemoved: false,
                                daemonStopped: true,
                            },
                        }}
                    />,
                    940,
                )}
            </Specimen>
        </ComponentPage>
    );
}
