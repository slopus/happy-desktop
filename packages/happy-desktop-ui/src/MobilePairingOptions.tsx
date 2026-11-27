import { Banner } from "./Banner";
import { Box } from "./Box";
import { Button } from "./Button";
import {
    MobileDirectPairingPanel,
    mobileDirectPairingEngaged,
    type MobileDirectConnectorState,
} from "./MobileDirectConnection";

/**
 * A card with its own heading in a Settings page, bare columns in setup, or
 * the body of a dialog that draws the title and close.
 */
export type MobilePairingOptionsLayout = "settings" | "setup" | "dialog";

export interface MobilePairingOptionsProps {
    readonly layout: MobilePairingOptionsLayout;
    readonly now: number;
    /** Why actions cannot currently reach this Happy Agent. */
    readonly unavailable?: string;
    readonly direct: MobileDirectConnectorState;
    readonly directStarting?: boolean;
    readonly directConfirming?: boolean;
    readonly directCancelling?: boolean;
    readonly directActionError?: string;
    onDirectStart(): void;
    onDirectConfirm(): void;
    onDirectReject(): void;
    onDirectErrorAssist?(): void;
    /**
     * Closes the pairing UI; its owner cancels whatever is still pending. In
     * Settings it brings the card's own heading and Close; a page whose header
     * already names it and leads back passes none.
     */
    onClose?(): void;
    readonly "data-testid"?: string;
}

const DIRECT_TITLE = "Direct connection";

/** The code's edge in px. Setup may shrink it to fit a short window (`--happy-qr-code-size`). */
const CODE_SIZE: Record<MobilePairingOptionsLayout, number> = {
    settings: 224,
    setup: 224,
    dialog: 224,
};

/**
 * C-299 MobilePairingOptions — pairing a phone: the direct Tailcat code, with
 * its countdown under it. Once a phone has connected, its emoji step takes
 * the whole surface. A Happy Agent that reports direct off or unavailable
 * shows that in the code's place.
 */
export function MobilePairingOptions(props: MobilePairingOptionsProps) {
    const engaged = mobileDirectPairingEngaged(props.direct);
    const setup = props.layout === "setup";
    const unavailable = props.unavailable ? (
        <Banner tone="warning" title="Happy Agent unavailable">
            {props.unavailable}
        </Banner>
    ) : null;
    // A dialog keeps one size, so its warning stands in the slot's fixed room
    // rather than above it.
    const dialog = props.layout === "dialog";
    const completed =
        props.direct.kind === "ready" && props.direct.connector.pairing?.status === "completed";
    return (
        <Box
            className="happy-mobile-pairing-options"
            data-engaged={engaged ? "" : undefined}
            data-happy-desktop-ui="mobile-pairing-options"
            data-layout={props.layout}
            data-method="direct"
            data-testid={props["data-testid"]}
        >
            {props.layout === "settings" && props.onClose ? (
                <Box className="happy-mobile-pairing-options__header">
                    <span className="happy-mobile-pairing-options__heading">Connect a phone</span>
                    <Button
                        onClick={props.onClose}
                        size="small"
                        variant={completed ? "primary" : "ghost"}
                    >
                        {completed ? "Done" : "Close"}
                    </Button>
                </Box>
            ) : null}
            {setup || dialog ? null : unavailable}
            <Box className="happy-mobile-pairing-options__slots">
                {dialog ? unavailable : null}
                <section
                    aria-label={DIRECT_TITLE}
                    className="happy-mobile-pairing-options__slot"
                    data-happy-desktop-ui="mobile-pairing-options-slot"
                    data-method="direct"
                >
                    <Box className="happy-mobile-pairing-options__slot-body">
                        <MobileDirectPairingPanel
                            {...(props.directActionError
                                ? { actionError: props.directActionError }
                                : {})}
                            cancelling={props.directCancelling}
                            codeCountdown
                            {...(dialog
                                ? {
                                      codeAside: (
                                          <span className="happy-mobile-pairing-options__hint">
                                              On your phone, tap + and scan this code.
                                          </span>
                                      ),
                                  }
                                : {})}
                            codeSize={CODE_SIZE[props.layout]}
                            density={setup ? "compact" : "regular"}
                            confirming={props.directConfirming}
                            connector={props.direct}
                            now={props.now}
                            onConfirm={props.onDirectConfirm}
                            {...(props.onDirectErrorAssist
                                ? { onErrorAssist: props.onDirectErrorAssist }
                                : {})}
                            onReject={props.onDirectReject}
                            onStart={props.onDirectStart}
                            starting={props.directStarting}
                            {...(props.unavailable === undefined
                                ? {}
                                : { unavailable: props.unavailable })}
                        />
                    </Box>
                </section>
            </Box>
        </Box>
    );
}
