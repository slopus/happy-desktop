import type { ReactNode } from "react";
import { Box } from "./Box";
import { CopyButton } from "./CopyButton";
import { QRCode, type QRCodeMark } from "./QRCode";
import { Spinner } from "./Spinner";
import { Ionicon } from "./vectorIcons/VectorIcon";

/*
 * The parts both phone-pairing methods draw with: a code with its copy link and
 * countdown, the code's place while it is on its way, a short note, and how an
 * attempt ended. Shared so the two methods read as one surface side by side.
 */

/** `4:05` until a code stops working, never below zero. */
export function pairingCountdown(expiresAt: number, now: number): string {
    const seconds = Math.max(0, Math.ceil((expiresAt - now) / 1000));
    return `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, "0")}`;
}

export function PairingCode(props: {
    /** Opaque payload: drawn as a QR code or copied as is, never read. */
    readonly data: string;
    readonly expiresAt: number;
    readonly label: string;
    readonly mark?: QRCodeMark;
    readonly now: number;
    readonly size: number;
    readonly testId: string;
    /** False where the countdown is drawn beside the code instead of under it. */
    readonly countdown?: boolean;
}) {
    return (
        <Box className="happy-mobile-pairing__code" data-happy-desktop-ui="mobile-pairing-code">
            <QRCode
                data={props.data}
                data-testid={`${props.testId}-qr`}
                label={props.label}
                {...(props.mark ? { mark: props.mark } : {})}
                size={props.size}
            />
            <Box className="happy-mobile-pairing__code-side">
                <CopyButton
                    caption="Copy auth link"
                    copiedCaption="Link copied"
                    data-testid={`${props.testId}-copy`}
                    label="Copy auth link"
                    text={props.data}
                />
                {props.countdown === false ? null : (
                    <PairingExpiry expiresAt={props.expiresAt} now={props.now} />
                )}
            </Box>
        </Box>
    );
}

export function PairingExpiry(props: { readonly expiresAt: number; readonly now: number }) {
    return (
        <span
            className="happy-mobile-pairing__expiry"
            data-happy-desktop-ui="mobile-pairing-expiry"
        >
            Expires in {pairingCountdown(props.expiresAt, props.now)}
        </span>
    );
}

/** The code's place while it is on its way, at the code's own size. */
export function PairingCodePlaceholder(props: {
    readonly size: number;
    readonly countdown?: boolean;
}) {
    return (
        <Box className="happy-mobile-pairing__code">
            <span
                aria-hidden
                className="happy-mobile-pairing__placeholder"
                data-happy-desktop-ui="mobile-pairing-placeholder"
                style={{
                    height: `var(--happy-qr-code-size, ${String(props.size)}px)`,
                    width: `var(--happy-qr-code-size, ${String(props.size)}px)`,
                }}
            >
                <Spinner size={16} />
            </span>
            {props.countdown === false ? null : (
                <Box className="happy-mobile-pairing__code-footer">
                    <span className="happy-mobile-pairing__expiry">Getting a code…</span>
                </Box>
            )}
        </Box>
    );
}

export function PairingNote(props: {
    readonly busy?: boolean;
    readonly children?: ReactNode;
    readonly detail?: string;
    readonly title: string;
}) {
    return (
        <Box className="happy-mobile-pairing__note" data-happy-desktop-ui="mobile-pairing-note">
            <span className="happy-mobile-pairing__note-title">
                {props.busy ? <Spinner size={14} /> : null}
                {props.title}
            </span>
            {props.detail ? (
                <span className="happy-mobile-pairing__note-detail">{props.detail}</span>
            ) : null}
            {props.children}
        </Box>
    );
}

export type PairingResultTone = "success" | "danger" | "neutral";

export function PairingResult(props: {
    readonly children?: ReactNode;
    readonly detail: string;
    readonly icon: "checkmark-circle" | "close-circle" | "time-outline" | "link-outline";
    readonly title: string;
    readonly tone: PairingResultTone;
}) {
    return (
        <Box
            className="happy-mobile-pairing__result"
            data-happy-desktop-ui="mobile-pairing-result"
            data-tone={props.tone}
        >
            <span className="happy-mobile-pairing__result-icon">
                <Ionicon name={props.icon} size={32} />
            </span>
            <span className="happy-mobile-pairing__title">{props.title}</span>
            <span className="happy-mobile-pairing__note-detail">{props.detail}</span>
            {props.children}
        </Box>
    );
}

/** A row of a pairing's own actions, trailing in reading order. */
export function PairingActions(props: { readonly children: ReactNode }) {
    return <Box className="happy-mobile-pairing__actions">{props.children}</Box>;
}
