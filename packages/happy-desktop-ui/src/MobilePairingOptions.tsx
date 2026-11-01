import type { ReactNode } from "react";
import { Banner } from "./Banner";
import { Box } from "./Box";
import { Button } from "./Button";
import {
    MobileDirectPairingPanel,
    mobileDirectPairingEngaged,
    type MobileDirectConnectorState,
} from "./MobileDirectConnection";
import {
    PairingActions,
    PairingCode,
    PairingCodePlaceholder,
    PairingExpiry,
    PairingNote,
    PairingResult,
} from "./MobilePairingParts";
import { SegmentedControl, type SegmentedControlSegment } from "./SegmentedControl";

/** The Happy relay attempt, as its own slot shows it. */
export type MobileRelayPairingState =
    | { readonly kind: "starting" }
    | { readonly kind: "waiting"; readonly data: string; readonly expiresAt: number }
    /** This computer is already linked through the relay. */
    | { readonly kind: "connected" }
    | { readonly kind: "disabled" }
    /** The Happy Agent reports no relay integration. */
    | { readonly kind: "unavailable" }
    | { readonly kind: "failed"; readonly message: string };

export type MobilePairingOptionsLayout = "settings" | "setup";

/** The Happy relay, or the direct connection over Tailcat, which is an experiment. */
export type MobilePairingMethod = "relay" | "direct";

export interface MobilePairingOptionsProps {
    /** A card with its own heading and close in Settings; bare columns in setup. */
    readonly layout: MobilePairingOptionsLayout;
    /**
     * Shows one method at a time, chosen with a Relay | Direct control at the
     * top: its code stands alone, without a method heading, and its countdown
     * sits under it. Absent shows both side by side.
     */
    readonly method?: MobilePairingMethod;
    onMethodSelect?(method: MobilePairingMethod): void;
    readonly now: number;
    /** Why actions cannot currently reach this Happy Agent. */
    readonly unavailable?: string;
    readonly relay: MobileRelayPairingState;
    readonly relayStarting?: boolean;
    onRelayRetry?(): void;
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

const RELAY_TITLE = "Happy relay";
const RELAY_DETAIL = "Through the Happy server, end-to-end encrypted. Works with the current app.";
const DIRECT_TITLE = "Direct connection";
const DIRECT_DETAIL = "Straight to this computer over Tailcat. Needs a newer app; you check emoji.";

const METHOD_SEGMENTS: SegmentedControlSegment[] = [
    { value: "relay", label: "Relay", title: RELAY_DETAIL },
    { value: "direct", label: "Direct", badge: "Experimental", title: DIRECT_DETAIL },
];

/**
 * C-299 MobilePairingOptions — the ways to pair a phone: the Happy relay code
 * and the direct Tailcat code. Each slot shows its own state, so one method
 * being unavailable never blocks the other. Once a phone has connected
 * directly, its emoji step takes the whole surface. With `method` one slot
 * shows at a time, in the same place, under a Relay | Direct control.
 */
export function MobilePairingOptions(props: MobilePairingOptionsProps) {
    const method = props.method;
    const single = method !== undefined;
    const engaged = method !== "relay" && mobileDirectPairingEngaged(props.direct);
    // Setup sets each heading beside its code, with the countdown under the
    // heading, so two codes take no more height than one. A code alone keeps
    // its countdown under it.
    const setup = props.layout === "setup";
    const headed = setup && !single;
    const directPairing = props.direct.kind === "ready" ? props.direct.connector.pairing : null;
    const directExpiry =
        headed && directPairing?.status === "waiting" && directPairing.qr !== null
            ? directPairing.expiresAt
            : undefined;
    const relayExpiry =
        headed && props.relay.kind === "waiting" ? props.relay.expiresAt : undefined;
    const codeSize = props.layout === "settings" ? 184 : 136;
    const direct = (
        <MobileDirectPairingPanel
            {...(props.directActionError ? { actionError: props.directActionError } : {})}
            cancelling={props.directCancelling}
            codeCountdown={!headed}
            codeSize={codeSize}
            density={props.layout === "setup" ? "compact" : "regular"}
            confirming={props.directConfirming}
            connector={props.direct}
            now={props.now}
            onConfirm={props.onDirectConfirm}
            {...(props.onDirectErrorAssist ? { onErrorAssist: props.onDirectErrorAssist } : {})}
            onReject={props.onDirectReject}
            onStart={props.onDirectStart}
            starting={props.directStarting}
            {...(props.unavailable === undefined ? {} : { unavailable: props.unavailable })}
        />
    );
    const completed =
        method !== "relay" &&
        props.direct.kind === "ready" &&
        props.direct.connector.pairing?.status === "completed";
    return (
        <Box
            className="happy-mobile-pairing-options"
            data-engaged={engaged ? "" : undefined}
            data-happy-desktop-ui="mobile-pairing-options"
            data-layout={props.layout}
            data-method={method}
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
            {props.layout === "settings" && props.unavailable ? (
                <Banner tone="warning" title="Happy Agent unavailable">
                    {props.unavailable}
                </Banner>
            ) : null}
            {method === undefined ? null : (
                <SegmentedControl
                    aria-label="Pairing method"
                    className="happy-mobile-pairing-options__method"
                    data-testid="mobile-pairing-method"
                    onChange={(value) => {
                        const next = value === "direct" ? "direct" : "relay";
                        if (next !== method) props.onMethodSelect?.(next);
                    }}
                    segments={METHOD_SEGMENTS}
                    size="small"
                    value={method}
                />
            )}
            <Box className="happy-mobile-pairing-options__slots">
                {engaged || method === "direct" ? null : (
                    <PairingSlot
                        detail={RELAY_DETAIL}
                        expiresAt={relayExpiry}
                        heading={!single}
                        method="relay"
                        now={props.now}
                        title={RELAY_TITLE}
                    >
                        <RelaySlot {...props} codeSize={codeSize} countdown={!headed} />
                    </PairingSlot>
                )}
                {method === "relay" ? null : (
                    <PairingSlot
                        detail={DIRECT_DETAIL}
                        expiresAt={directExpiry}
                        now={props.now}
                        // Setup has no height to spare once the emoji step leads; its question names it.
                        heading={!single && !(engaged && setup)}
                        method="direct"
                        title={DIRECT_TITLE}
                    >
                        {direct}
                    </PairingSlot>
                )}
            </Box>
        </Box>
    );
}

function PairingSlot(props: {
    readonly children: ReactNode;
    readonly detail: string;
    readonly expiresAt: number | undefined;
    readonly heading: boolean;
    readonly method: "relay" | "direct";
    readonly now: number;
    readonly title: string;
}) {
    return (
        <section
            aria-label={props.title}
            className="happy-mobile-pairing-options__slot"
            data-happy-desktop-ui="mobile-pairing-options-slot"
            data-method={props.method}
        >
            {props.heading ? (
                <Box className="happy-mobile-pairing-options__slot-heading">
                    <span className="happy-mobile-pairing-options__slot-title">{props.title}</span>
                    <span className="happy-mobile-pairing-options__slot-detail">
                        {props.detail}
                    </span>
                    {props.expiresAt === undefined ? null : (
                        <PairingExpiry expiresAt={props.expiresAt} now={props.now} />
                    )}
                </Box>
            ) : null}
            <Box className="happy-mobile-pairing-options__slot-body">{props.children}</Box>
        </section>
    );
}

function RelaySlot(
    props: MobilePairingOptionsProps & { readonly codeSize: number; readonly countdown: boolean },
) {
    const { relay } = props;
    switch (relay.kind) {
        case "starting":
            return <PairingCodePlaceholder countdown={props.countdown} size={props.codeSize} />;
        case "waiting":
            return (
                <PairingCode
                    countdown={props.countdown}
                    data={relay.data}
                    expiresAt={relay.expiresAt}
                    label="QR code to pair through Happy relay"
                    mark="link"
                    now={props.now}
                    size={props.codeSize}
                    testId="happy-mobile-relay"
                />
            );
        case "connected":
            return (
                <PairingResult
                    detail="Every phone signed in to your Happy account already sees this computer."
                    icon="link-outline"
                    title="Already connected"
                    tone="neutral"
                />
            );
        case "disabled":
            return (
                <PairingNote
                    detail="Happy Mobile integration is turned off for this Happy Agent."
                    title="Happy relay is off"
                />
            );
        case "unavailable":
            return (
                <PairingNote
                    detail="This Happy Agent doesn't report a Happy relay connection."
                    title="Not available"
                />
            );
        case "failed":
            return (
                <PairingResult
                    detail={relay.message}
                    icon="close-circle"
                    title="Couldn't get a code"
                    tone="danger"
                >
                    {props.onRelayRetry ? (
                        <PairingActions>
                            <Button
                                disabled={props.unavailable !== undefined}
                                loading={props.relayStarting}
                                onClick={props.onRelayRetry}
                                size="small"
                                variant="primary"
                            >
                                Try again
                            </Button>
                        </PairingActions>
                    ) : null}
                </PairingResult>
            );
    }
}
