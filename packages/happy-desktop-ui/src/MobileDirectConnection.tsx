import { useId } from "react";
import type { BadgeVariant } from "./Badge";
import { Banner } from "./Banner";
import { HappyAgentSettingsStatus } from "./pages/settings/HappyAgentSettingsStatus";
import { Box } from "./Box";
import { Button } from "./Button";
import { FormRow } from "./FormRow";
import { Modal } from "./Modal";
import { ModalOverlay } from "./ModalOverlay";
import { Spinner } from "./Spinner";
import {
    PairingActions,
    PairingCode,
    PairingCodePlaceholder,
    PairingNote,
    PairingResult,
    pairingCountdown,
} from "./MobilePairingParts";
import { Ionicon } from "./vectorIcons/VectorIcon";

/** What a phone says it runs. Self-reported, so it is shown as a claim. */
export type MobileDirectPlatform = "ios" | "android" | "other";

/** The dedicated Tailcat socket phones connect through. */
export type MobileDirectSocketStatus = "disabled" | "closed" | "starting" | "open" | "failed";

export type MobileDirectPairingStatus =
    | "waiting"
    | "verifying"
    | "completed"
    | "rejected"
    | "expired"
    | "cancelled"
    | "failed";

/** The name and platform a connecting phone reports about itself. */
export interface MobileDirectDeviceClaim {
    readonly name: string;
    readonly platform: MobileDirectPlatform;
}

/** The caller's current or most recent direct pairing, as Happy Agent reports it. */
export interface MobileDirectPairing {
    readonly id: string;
    readonly status: MobileDirectPairingStatus;
    /** Secret and opaque: drawn as a QR code or copied as is, never read. */
    readonly qr: string | null;
    readonly expiresAt: number;
    /** Set once a phone has used the code. */
    readonly device: MobileDirectDeviceClaim | null;
    /** The four emoji Happy Agent derived from the shared secret. */
    readonly emoji: readonly string[] | null;
    readonly desktopConfirmed: boolean;
    readonly mobileConfirmed: boolean;
    readonly error: string | null;
}

/** A phone paired directly with this Happy Agent. */
export interface MobileDirectPairedDevice {
    readonly id: string;
    readonly name: string;
    readonly platform: MobileDirectPlatform;
    readonly createdAt: number;
    readonly lastSeenAt: number;
}

export interface MobileDirectConnector {
    readonly status: MobileDirectSocketStatus;
    readonly pairing: MobileDirectPairing | null;
    /** Oldest first. */
    readonly devices: readonly MobileDirectPairedDevice[];
    /** Why the socket failed; set only while `status` is `failed`. */
    readonly error: string | null;
}

export type MobileDirectConnectorState =
    | { readonly kind: "loading" }
    /** The Happy Agent predates direct connection. */
    | { readonly kind: "unsupported" }
    | { readonly kind: "read-failed"; readonly message: string }
    | { readonly kind: "ready"; readonly connector: MobileDirectConnector };

/** The open Remove confirmation for one paired phone. */
export interface MobileDirectRemoval {
    readonly deviceId: string;
    readonly pending: boolean;
    readonly error?: string;
}

/**
 * Whether a phone has connected directly and its step should lead: while it
 * verifies and once it has paired. A pairing that ended any other way hands the
 * surface back to both codes.
 */
export function mobileDirectPairingEngaged(state: MobileDirectConnectorState): boolean {
    if (state.kind !== "ready") return false;
    const pairing = state.connector.pairing;
    if (pairing === null || pairing.device === null) return false;
    return (
        pairing.status === "waiting" ||
        pairing.status === "verifying" ||
        pairing.status === "completed"
    );
}

const PLATFORM_NAMES: Record<MobileDirectPlatform, string> = {
    ios: "an iPhone",
    android: "an Android phone",
    other: "a phone",
};

const PLATFORM_LABELS: Record<MobileDirectPlatform, string> = {
    ios: "iPhone",
    android: "Android",
    other: "Phone",
};

function PlatformIcon(props: { readonly platform: MobileDirectPlatform; readonly size: number }) {
    return (
        <Ionicon
            name={
                props.platform === "ios"
                    ? "logo-apple"
                    : props.platform === "android"
                      ? "logo-android"
                      : "phone-portrait-outline"
            }
            size={props.size}
        />
    );
}

export interface MobileDirectPairingPanelProps {
    readonly connector: MobileDirectConnectorState;
    /** The reference time the countdown is drawn against (epoch ms). */
    readonly now: number;
    /** Why actions cannot currently reach this Happy Agent. */
    readonly unavailable?: string;
    /** A start request is in flight. */
    readonly starting?: boolean;
    readonly confirming?: boolean;
    readonly cancelling?: boolean;
    /** Why the last start, confirm, or cancel was refused. */
    readonly actionError?: string;
    /** QR code edge in px; a layout may still shrink it through `--happy-qr-code-size`. */
    readonly codeSize?: number;
    /** False where the code's countdown is drawn beside it rather than under it. */
    readonly codeCountdown?: boolean;
    /** `compact` fits the emoji step under a setup page's title line. */
    readonly density?: "regular" | "compact";
    readonly "data-testid"?: string;
    onStart(): void;
    /** The person says the emoji match. */
    onConfirm(): void;
    /** The person says they don't match, or stops the pairing. */
    onReject(): void;
    /** Hands a failure to the Chief of Staff. */
    onErrorAssist?(): void;
    /** The Chief of Staff bot's live name. Defaults to "Chief of Staff". */
    readonly chiefOfStaffName?: string;
}

/**
 * C-298 MobileDirectPairingPanel — one direct pairing over Tailcat, from code
 * to result: the QR code and its countdown, the phone connecting, the four
 * emoji both screens must show, and how it ended. Every value comes from
 * Happy Agent's snapshot; nothing here derives emoji or reads the code.
 */
export function MobileDirectPairingPanel(props: MobileDirectPairingPanelProps) {
    const blocked = props.unavailable !== undefined;
    return (
        <Box
            className="happy-mobile-direct-pairing"
            data-happy-desktop-ui="mobile-direct-pairing"
            data-testid={props["data-testid"]}
        >
            {props.actionError ? (
                <Banner tone="danger" title="That didn't go through">
                    {props.actionError}
                </Banner>
            ) : null}
            <DirectPairingBody {...props} blocked={blocked} />
        </Box>
    );
}

function DirectPairingBody(props: MobileDirectPairingPanelProps & { readonly blocked: boolean }) {
    const { connector } = props;
    // The code's own space while the connection is read, so nothing moves when it arrives.
    if (connector.kind === "loading")
        return (
            <PairingCodePlaceholder countdown={props.codeCountdown} size={props.codeSize ?? 200} />
        );
    if (connector.kind === "unsupported")
        return (
            <PairingNote
                detail="Update Happy Agent on this computer to connect a phone directly."
                title="Needs a newer Happy Agent"
            />
        );
    if (connector.kind === "read-failed")
        return (
            <PairingNote detail={connector.message} title="Couldn't read direct connection">
                {props.onErrorAssist ? (
                    <Button onClick={props.onErrorAssist} size="small" variant="ghost">
                        Ask {props.chiefOfStaffName ?? "Chief of Staff"}
                    </Button>
                ) : null}
            </PairingNote>
        );
    const { status, pairing } = connector.connector;
    if (status === "disabled")
        return (
            <PairingNote
                detail="It is turned off in this Happy Agent's happy.toml."
                title="Direct connection is off"
            />
        );
    if (pairing === null) {
        if (props.starting || status === "starting")
            return (
                <PairingCodePlaceholder
                    countdown={props.codeCountdown}
                    size={props.codeSize ?? 200}
                />
            );
        if (status === "failed")
            return (
                <DirectFailure
                    {...props}
                    message={connector.connector.error ?? "The direct connection didn't open."}
                    title="Couldn't open the direct connection"
                />
            );
        return (
            <PairingNote
                detail="Show a code to scan with Happy on your phone."
                title="Connect a phone"
            >
                <Button
                    disabled={props.blocked}
                    icon="link"
                    loading={props.starting}
                    onClick={props.onStart}
                    size="small"
                    variant="primary"
                >
                    Connect a phone
                </Button>
            </PairingNote>
        );
    }
    switch (pairing.status) {
        case "waiting":
            if (pairing.device !== null)
                return (
                    <Box
                        className="happy-mobile-direct-pairing__connected"
                        data-happy-desktop-ui="mobile-direct-pairing-connected"
                    >
                        <DeviceClaim device={pairing.device} />
                        <Box className="happy-mobile-direct-pairing__waiting">
                            <Spinner label="Verifying" size={16} />
                            <span>Phone connected, verifying…</span>
                        </Box>
                        <PairingCancel {...props} />
                    </Box>
                );
            if (pairing.qr === null)
                return (
                    <PairingCodePlaceholder
                        countdown={props.codeCountdown}
                        size={props.codeSize ?? 200}
                    />
                );
            return (
                <PairingCode
                    countdown={props.codeCountdown}
                    data={pairing.qr}
                    expiresAt={pairing.expiresAt}
                    label="QR code to connect a phone directly"
                    now={props.now}
                    size={props.codeSize ?? 200}
                    testId="happy-mobile-direct"
                />
            );
        case "verifying":
            return <EmojiVerification {...props} pairing={pairing} />;
        case "completed":
            // In a chat the emoji and the answer stay where they were, so
            // nothing moves; the line under them says the phone is paired.
            if (props.density === "compact" && pairing.emoji)
                return <EmojiVerification {...props} paired pairing={pairing} />;
            // Without them it settles to one line, so the reply after it stays close.
            if (props.density === "compact")
                return (
                    <Box
                        className="happy-mobile-direct-pairing__paired"
                        data-happy-desktop-ui="mobile-direct-pairing-paired"
                    >
                        <Ionicon name="checkmark-circle" size={18} />
                        <span>
                            <span className="happy-mobile-direct-pairing__paired-title">
                                {pairing.device?.name ?? "Your phone"} is paired
                            </span>
                            <span className="happy-mobile-direct-pairing__paired-detail">
                                {" · It reaches this computer directly."}
                            </span>
                        </span>
                    </Box>
                );
            return (
                <PairingResult
                    detail={
                        pairing.device
                            ? `“${pairing.device.name}” can now reach this computer directly.`
                            : "The phone can now reach this computer directly."
                    }
                    icon="checkmark-circle"
                    title="Phone connected"
                    tone="success"
                />
            );
        case "rejected":
            return (
                <PairingResult
                    detail="The phone said the emoji didn't match. Nothing was paired. If that wasn't you, someone else may have scanned this code."
                    icon="close-circle"
                    title="The phone rejected it"
                    tone="danger"
                >
                    <StartAgain {...props} />
                </PairingResult>
            );
        case "cancelled":
            return (
                <PairingResult
                    detail="Nothing was paired."
                    icon="close-circle"
                    title="Pairing cancelled"
                    tone="neutral"
                >
                    <StartAgain {...props} />
                </PairingResult>
            );
        case "expired":
            return (
                <PairingResult
                    detail={
                        pairing.device
                            ? "Both screens have to confirm within five minutes. Nothing was paired."
                            : "This code is no longer valid."
                    }
                    icon="time-outline"
                    title={pairing.device ? "Verification timed out" : "Code expired"}
                    tone="neutral"
                >
                    <StartAgain {...props} />
                </PairingResult>
            );
        case "failed":
            return (
                <DirectFailure
                    {...props}
                    message={pairing.error ?? "The pairing stopped before it finished."}
                    title="Pairing failed"
                />
            );
    }
}

/**
 * The step takes focus when it appears, so a screen reader starts here. Module
 * scoped so its identity is stable and React calls it only on mount, never
 * again on each countdown tick.
 */
const focusOnMount = (element: HTMLElement | null) => element?.focus({ preventScroll: true });

function EmojiVerification(
    props: MobileDirectPairingPanelProps & {
        readonly blocked: boolean;
        readonly pairing: MobileDirectPairing;
        /** The pairing finished: the answer stays, chosen, over the result. */
        readonly paired?: boolean;
    },
) {
    const { pairing } = props;
    const busy = props.confirming === true || props.cancelling === true;
    const compact = props.density === "compact";
    // In a chat, this computer's answer stays where it was given.
    const answered = compact && (pairing.desktopConfirmed || props.paired === true);
    const titleId = useId();
    const waitingForPhone = pairing.desktopConfirmed && !pairing.mobileConfirmed;
    return (
        <div
            aria-labelledby={titleId}
            className="happy-mobile-direct-pairing__verify"
            data-density={compact ? "compact" : "regular"}
            data-happy-desktop-ui="mobile-direct-pairing-verify"
            ref={focusOnMount}
            role="group"
            tabIndex={-1}
        >
            {compact ? null : (
                <h3 className="happy-mobile-pairing__title" id={titleId}>
                    Do the emoji match?
                </h3>
            )}
            {pairing.device ? <DeviceClaim device={pairing.device} /> : null}
            {pairing.emoji ? (
                <MobileDirectEmoji emoji={pairing.emoji} size={compact ? 48 : 64} />
            ) : null}
            {compact ? (
                <p className="happy-mobile-direct-pairing__instruction" id={titleId}>
                    Does your phone show the same four emoji, in this order?
                </p>
            ) : (
                <p className="happy-mobile-direct-pairing__instruction">
                    Check that your phone shows these four emoji in this order. If any differ,
                    choose Don&apos;t match.
                </p>
            )}
            {props.paired ? (
                // The progress row's own one line, so the answer under it stays put.
                <Box
                    className="happy-mobile-direct-pairing__progress"
                    data-happy-desktop-ui="mobile-direct-pairing-progress"
                >
                    <ConfirmationMark
                        confirmed
                        label={`${pairing.device?.name ?? "Your phone"} is paired`}
                        plain
                    />
                    <span className="happy-mobile-pairing__expiry">
                        It reaches this computer directly.
                    </span>
                </Box>
            ) : answered ? (
                <Box
                    className="happy-mobile-direct-pairing__progress"
                    data-happy-desktop-ui="mobile-direct-pairing-progress"
                >
                    <span className="happy-mobile-direct-pairing__progress-note">
                        <Spinner size={14} />
                        Waiting for the phone to confirm…
                    </span>
                </Box>
            ) : (
                <Box
                    className="happy-mobile-direct-pairing__progress"
                    data-happy-desktop-ui="mobile-direct-pairing-progress"
                >
                    <ConfirmationMark confirmed={pairing.desktopConfirmed} label="This computer" />
                    <ConfirmationMark confirmed={pairing.mobileConfirmed} label="Phone" />
                    <span className="happy-mobile-pairing__expiry">
                        Expires in {pairingCountdown(pairing.expiresAt, props.now)}
                    </span>
                </Box>
            )}
            <PairingActions>
                {answered ? (
                    <>
                        <Button
                            aria-pressed="true"
                            className="happy-mobile-direct-pairing__chosen"
                            data-chosen=""
                            disabled
                            icon="check"
                            size="medium"
                            variant="primary"
                        >
                            Emoji match
                        </Button>
                        <Button disabled size="medium" variant="secondary">
                            Don&apos;t match
                        </Button>
                    </>
                ) : pairing.desktopConfirmed ? (
                    <>
                        {waitingForPhone ? (
                            <span className="happy-mobile-direct-pairing__progress-note">
                                <Spinner size={14} />
                                Waiting for the phone to confirm…
                            </span>
                        ) : null}
                        <Button
                            disabled={props.blocked || busy}
                            loading={props.cancelling}
                            onClick={props.onReject}
                            size="medium"
                            variant="ghost"
                        >
                            Cancel pairing
                        </Button>
                    </>
                ) : (
                    /* The answer to give first, where every default answer in
                       Happy stands: on the left. */
                    <>
                        <Button
                            data-testid="happy-mobile-direct-confirm"
                            disabled={props.blocked || busy}
                            icon="check"
                            loading={props.confirming}
                            onClick={props.onConfirm}
                            size="medium"
                            variant="primary"
                        >
                            Emoji match
                        </Button>
                        <Button
                            data-testid="happy-mobile-direct-reject"
                            disabled={props.blocked || busy}
                            loading={props.cancelling}
                            onClick={props.onReject}
                            size="medium"
                            variant="secondary"
                        >
                            Don&apos;t match
                        </Button>
                    </>
                )}
            </PairingActions>
        </div>
    );
}

/** One screen's answer, in sentence case beside its mark. */
function ConfirmationMark(props: {
    readonly confirmed: boolean;
    readonly label: string;
    /** The label is the whole sentence, without ": confirmed". */
    readonly plain?: boolean;
}) {
    return (
        <span
            className="happy-mobile-direct-pairing__mark"
            data-confirmed={props.confirmed ? "" : undefined}
            data-happy-desktop-ui="mobile-direct-pairing-mark"
        >
            <Ionicon name={props.confirmed ? "checkmark-circle" : "ellipse-outline"} size={14} />
            {props.plain
                ? props.label
                : `${props.label}: ${props.confirmed ? "confirmed" : "not yet"}`}
        </span>
    );
}

export interface MobileDirectEmojiProps {
    readonly emoji: readonly string[];
    /** Slot edge in px: 64 by default, 48 where height is scarce. */
    readonly size?: 48 | 64;
}

/**
 * The four verification emoji in large type. Each glyph sits in its own fixed
 * slot, because colour-emoji artwork differs in width and mass even at one
 * font size.
 */
export function MobileDirectEmoji(props: MobileDirectEmojiProps) {
    return (
        <ol
            aria-label={`Verification emoji: ${props.emoji.join(" ")}`}
            className="happy-mobile-direct-emoji"
            data-happy-desktop-ui="mobile-direct-emoji"
            data-size={props.size ?? 64}
        >
            {props.emoji.map((glyph, index) => (
                // A fixed sequence whose order is the content; a glyph may repeat.
                <li className="happy-mobile-direct-emoji__slot" key={index}>
                    {glyph}
                </li>
            ))}
        </ol>
    );
}

/** The phone's own name and platform, presented as what it says about itself. */
function DeviceClaim(props: { readonly device: MobileDirectDeviceClaim }) {
    return (
        <Box
            className="happy-mobile-direct-pairing__device"
            data-happy-desktop-ui="mobile-direct-pairing-device"
        >
            <span className="happy-mobile-direct-pairing__device-icon">
                <PlatformIcon platform={props.device.platform} size={16} />
            </span>
            <span className="happy-mobile-direct-pairing__device-text">
                <span className="happy-mobile-direct-pairing__device-name">
                    “{props.device.name}”
                </span>
                <span className="happy-mobile-direct-pairing__device-claim">
                    says it is {PLATFORM_NAMES[props.device.platform]}
                </span>
            </span>
        </Box>
    );
}

function DirectFailure(
    props: MobileDirectPairingPanelProps & {
        readonly blocked: boolean;
        readonly message: string;
        readonly title: string;
    },
) {
    return (
        <PairingResult detail={props.message} icon="close-circle" title={props.title} tone="danger">
            <PairingActions>
                {props.onErrorAssist ? (
                    <Button onClick={props.onErrorAssist} size="small" variant="ghost">
                        Ask {props.chiefOfStaffName ?? "Chief of Staff"}
                    </Button>
                ) : null}
                <Button
                    disabled={props.blocked}
                    loading={props.starting}
                    onClick={props.onStart}
                    size="small"
                    variant="primary"
                >
                    Try again
                </Button>
            </PairingActions>
        </PairingResult>
    );
}

function StartAgain(props: MobileDirectPairingPanelProps & { readonly blocked: boolean }) {
    return (
        <Button
            disabled={props.blocked}
            loading={props.starting}
            onClick={props.onStart}
            size="small"
            variant="secondary"
        >
            Show a new code
        </Button>
    );
}

function PairingCancel(props: MobileDirectPairingPanelProps & { readonly blocked: boolean }) {
    return (
        <Button
            disabled={props.blocked}
            loading={props.cancelling}
            onClick={props.onReject}
            size="small"
            variant="ghost"
        >
            Cancel pairing
        </Button>
    );
}

const SOCKET_STATES: Record<
    MobileDirectSocketStatus,
    { readonly label: string; readonly variant: BadgeVariant; readonly description: string }
> = {
    disabled: {
        label: "Off",
        variant: "neutral",
        description: "Turned off in this Happy Agent's happy.toml.",
    },
    closed: {
        label: "Not in use",
        variant: "neutral",
        description: "Opens only while a phone pairs or is paired.",
    },
    starting: {
        label: "Opening…",
        variant: "info",
        description: "Opening the private Tailcat connection for phones.",
    },
    open: {
        label: "Open",
        variant: "success",
        description: "Paired phones can reach this computer.",
    },
    failed: {
        label: "Failed",
        variant: "danger",
        description: "The private Tailcat connection for phones didn't open.",
    },
};

export interface MobileDirectConnectionSectionProps {
    readonly connector: MobileDirectConnectorState;
    readonly now: number;
    readonly unavailable?: string;
    /** The open Remove confirmation, if any. */
    readonly removal?: MobileDirectRemoval;
    onDeviceRemoveRequest(deviceId: string): void;
    onDeviceRemoveCancel(): void;
    onDeviceRemoveConfirm(): void;
    onErrorAssist?(): void;
    /** The Chief of Staff bot's live name. Defaults to "Chief of Staff". */
    readonly chiefOfStaffName?: string;
}

/**
 * C-298b MobileDirectConnectionSection — the phones paired directly, each
 * removable after a confirmation, and the connection's state only when it
 * failed or cannot be read.
 */
export function MobileDirectConnectionSection(props: MobileDirectConnectionSectionProps) {
    const { connector } = props;
    const state =
        connector.kind === "ready"
            ? SOCKET_STATES[connector.connector.status]
            : connector.kind === "loading"
              ? { label: "Checking…", variant: "neutral" as const, description: undefined }
              : connector.kind === "unsupported"
                ? {
                      label: "Unavailable",
                      variant: "neutral" as const,
                      description:
                          "This Happy Agent is too old for direct connection. Update it to connect phones directly.",
                  }
                : {
                      label: "Unavailable",
                      variant: "warning" as const,
                      description: connector.message,
                  };
    const failure =
        connector.kind === "ready" && connector.connector.status === "failed"
            ? connector.connector.error
            : null;
    const devices = connector.kind === "ready" ? connector.connector.devices : [];
    const removing =
        props.removal === undefined
            ? undefined
            : devices.find((device) => device.id === props.removal?.deviceId);
    // The connection itself is only worth a row when something is wrong with it;
    // otherwise the phones paired through it say everything.
    const troubled =
        connector.kind === "read-failed" ||
        connector.kind === "unsupported" ||
        (connector.kind === "ready" && connector.connector.status === "failed");
    return (
        <Box className="happy-mobile-direct-section" data-happy-desktop-ui="mobile-direct-section">
            {troubled ? (
                <FormRow
                    control={
                        <Box className="happy-mobile-direct-section__status-control">
                            {failure && props.onErrorAssist ? (
                                <Button onClick={props.onErrorAssist} size="small" variant="ghost">
                                    Ask {props.chiefOfStaffName ?? "Chief of Staff"}
                                </Button>
                            ) : null}
                            <HappyAgentSettingsStatus label={state.label} variant={state.variant} />
                        </Box>
                    }
                    {...(state.description || failure
                        ? { description: [state.description, failure].filter(Boolean).join(" ") }
                        : {})}
                    label="Direct connection"
                />
            ) : null}
            {connector.kind === "ready" ? (
                devices.length === 0 ? null : (
                    <ul
                        aria-label="Phones paired directly"
                        className="happy-mobile-direct-section__devices"
                    >
                        {devices.map((device) => (
                            <li
                                className="happy-mobile-direct-device"
                                data-happy-desktop-ui="mobile-direct-device"
                                key={device.id}
                            >
                                <span className="happy-mobile-direct-device__icon">
                                    <PlatformIcon platform={device.platform} size={16} />
                                </span>
                                <span className="happy-mobile-direct-device__text">
                                    <span className="happy-mobile-direct-device__name">
                                        {device.name}
                                    </span>
                                    <span className="happy-mobile-direct-device__detail">
                                        Direct · {PLATFORM_LABELS[device.platform]} · Paired{" "}
                                        {pairedDate(device.createdAt)} · Last seen{" "}
                                        {relativeTime(device.lastSeenAt, props.now)}
                                    </span>
                                </span>
                                <Button
                                    aria-label={`Remove ${device.name}`}
                                    disabled={props.unavailable !== undefined}
                                    onClick={() => props.onDeviceRemoveRequest(device.id)}
                                    size="small"
                                    variant="ghost"
                                >
                                    Remove
                                </Button>
                            </li>
                        ))}
                    </ul>
                )
            ) : null}
            {props.removal && removing ? (
                <MobileDirectRemoveConfirmation
                    device={removing}
                    removal={props.removal}
                    onCancel={props.onDeviceRemoveCancel}
                    onConfirm={props.onDeviceRemoveConfirm}
                />
            ) : null}
        </Box>
    );
}

function pairedDate(at: number): string {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(at);
}

/** "just now", "5 minutes ago", "yesterday", from the reference time. */
function relativeTime(at: number, now: number): string {
    const seconds = Math.round((at - now) / 1000);
    if (Math.abs(seconds) < 60) return "just now";
    const format = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
    const minutes = Math.round(seconds / 60);
    if (Math.abs(minutes) < 60) return format.format(minutes, "minute");
    const hours = Math.round(minutes / 60);
    if (Math.abs(hours) < 24) return format.format(hours, "hour");
    return format.format(Math.round(hours / 24), "day");
}

export interface MobileDirectRemoveConfirmationProps {
    readonly device: MobileDirectPairedDevice;
    readonly removal: MobileDirectRemoval;
    onCancel(): void;
    onConfirm(): void;
}

/** Removing one directly paired phone: what stops, and how to undo it. */
export function MobileDirectRemoveConfirmation(props: MobileDirectRemoveConfirmationProps) {
    const cancel = props.removal.pending ? undefined : props.onCancel;
    return (
        <ModalOverlay onDismiss={cancel}>
            <Modal
                className="happy-mobile-direct-remove"
                data-testid="happy-mobile-direct-remove"
                footer={
                    <Box className="happy-mobile-direct-remove__actions">
                        <Button
                            disabled={props.removal.pending}
                            onClick={props.onCancel}
                            variant="ghost"
                        >
                            Cancel
                        </Button>
                        <Button
                            disabled={props.removal.pending}
                            onClick={props.onConfirm}
                            variant="danger"
                        >
                            {props.removal.pending ? "Removing…" : "Remove"}
                        </Button>
                    </Box>
                }
                icon="unlink"
                onClose={cancel}
                size="small"
                title={`Remove “${props.device.name}”?`}
                tone="danger"
            >
                <Box className="happy-mobile-direct-remove__body">
                    {props.removal.error ? (
                        <Banner tone="danger" title="Couldn't remove this phone">
                            {props.removal.error}
                        </Banner>
                    ) : null}
                    <p className="happy-mobile-direct-remove__lead">
                        This phone can no longer reach this computer directly. Anything it has open
                        stops now. To use it again, pair it again.
                    </p>
                </Box>
            </Modal>
        </ModalOverlay>
    );
}
