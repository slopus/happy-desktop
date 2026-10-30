import type { ReactNode } from "react";
import { MobileAccessConfirmation } from "../../src/MobileAccessConfirmation";
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
};

export function MobileAccessConfirmationPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="The destructive confirmation of Mobile Access. It names what changes and what stays in terms of what the operation actually does, and never claims to revoke a phone or delete a computer it cannot name."
            title="MobileAccessConfirmation"
        >
            <Specimen
                detail="480px · Happy Agent before 0.4.84 · removes only this Happy Agent's pairing · phones stay"
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
                detail="480px · Happy Agent 0.4.84+ · removes this computer and its published chats"
                label="Remove this computer"
                number="03a"
                stage="app"
            >
                {frame(
                    <MobileAccessConfirmation
                        {...handlers}
                        confirmation={{ kind: "disconnect", pending: false }}
                        removesComputer
                    />,
                    680,
                )}
            </Specimen>

            <Specimen
                detail="480px · removal in flight · Removing…"
                label="Removing this computer"
                number="03b"
                stage="app"
            >
                {frame(
                    <MobileAccessConfirmation
                        {...handlers}
                        confirmation={{ kind: "disconnect", pending: true }}
                        removesComputer
                    />,
                    680,
                )}
            </Specimen>

            <Specimen
                detail="480px · Happy could not confirm the removal · confirm retries"
                label="Removal refused"
                number="03c"
                stage="app"
            >
                {frame(
                    <MobileAccessConfirmation
                        {...handlers}
                        confirmation={{
                            kind: "disconnect",
                            pending: false,
                            error: "Happy Agent couldn't remove this computer from Happy Mobile. Check your internet connection and try again. This computer stays linked until it is removed.",
                        }}
                        removesComputer
                    />,
                    760,
                )}
            </Specimen>
        </ComponentPage>
    );
}
