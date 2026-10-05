import type { ReactNode } from "react";
import { Banner } from "./Banner";
import { Box } from "./Box";
import { Button } from "./Button";
import { Checkbox } from "./Checkbox";
import { Modal } from "./Modal";
import { ModalOverlay } from "./ModalOverlay";

/** Exactly what signing out the terminal CLI touches, as the host reports it. */
export interface MobileAccessTerminalResetPreview {
    /** The CLI credential file that is deleted. */
    readonly credentialFile: string;
    /** The CLI settings file the listed fields are removed from. */
    readonly settingsFile: string;
    readonly settingsFields: readonly ["machineId", "machineIdConfirmedByServer"];
    /** The CLI's own server registration, present only when it is known exactly. */
    readonly registration?: {
        readonly machineId: string;
        readonly serverUrl: string;
        readonly accountKeyFingerprint: string;
    };
    readonly stopsDaemon: true;
}

export type MobileAccessConfirmationState =
    | {
          readonly kind: "disconnect";
          readonly pending: boolean;
          readonly error?: string;
      }
    | {
          readonly kind: "terminal-reset";
          readonly preview: MobileAccessTerminalResetPreview;
          /** The account the CLI is signed in to; the reset refuses any other. */
          readonly accountKeyFingerprint?: string;
          /** Whether the known server registration is deleted as well. */
          readonly removeRegistration: boolean;
          readonly pending: boolean;
          readonly error?: string;
          readonly effects?: {
              readonly localAuthCleared: boolean;
              readonly registrationRemoved: boolean;
              readonly daemonStopped: boolean;
          };
      };

export interface MobileAccessConfirmationProps {
    readonly confirmation: MobileAccessConfirmationState;
    readonly "data-testid"?: string;
    onCancel(): void;
    onConfirm(): void;
    onRegistrationRemovalChange?(remove: boolean): void;
}

/**
 * C-285 MobileAccessConfirmation — the destructive confirmations of Mobile
 * Access. Each one names what changes and what stays, in terms of what the
 * operation actually does: disconnecting removes only this Happy Agent's
 * pairing; signing out the terminal CLI deletes the listed file and fields.
 * Neither claims to revoke a phone or delete a computer it cannot name.
 * Presentational and fully controlled; the dim cancels unless a request is in
 * flight.
 */
export function MobileAccessConfirmation(props: MobileAccessConfirmationProps) {
    const { confirmation } = props;
    const cancel = confirmation.pending ? undefined : props.onCancel;
    const disconnect = confirmation.kind === "disconnect";
    return (
        <ModalOverlay onDismiss={cancel}>
            <Modal
                className="happy-mobile-access-confirmation"
                data-testid={props["data-testid"]}
                footer={
                    <Box className="happy-mobile-access-confirmation__actions">
                        <Button
                            disabled={confirmation.pending}
                            onClick={props.onCancel}
                            variant="ghost"
                        >
                            Cancel
                        </Button>
                        <Button
                            data-testid="mobile-access-confirm"
                            disabled={confirmation.pending}
                            onClick={props.onConfirm}
                            variant="danger"
                        >
                            {disconnect
                                ? confirmation.pending
                                    ? "Disconnecting…"
                                    : "Disconnect"
                                : confirmation.pending
                                  ? "Removing…"
                                  : "Remove saved login"}
                        </Button>
                    </Box>
                }
                icon="unlink"
                onClose={cancel}
                size="medium"
                title={disconnect ? "Disconnect this computer?" : "Remove saved terminal login?"}
                tone="danger"
            >
                <Box className="happy-mobile-access-confirmation__body">
                    {confirmation.error ? (
                        <Banner
                            tone="danger"
                            title={disconnect ? "Could not disconnect" : "Removal did not finish"}
                        >
                            {confirmation.error}
                        </Banner>
                    ) : null}
                    {confirmation.kind === "disconnect" ? (
                        <DisconnectBody />
                    ) : (
                        <TerminalResetBody
                            accountKeyFingerprint={confirmation.accountKeyFingerprint}
                            disabled={confirmation.pending}
                            preview={confirmation.preview}
                            removeRegistration={confirmation.removeRegistration}
                            effects={confirmation.effects}
                            onRegistrationRemovalChange={props.onRegistrationRemovalChange}
                        />
                    )}
                </Box>
            </Modal>
        </ModalOverlay>
    );
}

function DisconnectBody() {
    return (
        <>
            <p className="happy-mobile-access-confirmation__lead">
                This removes this Happy Agent&apos;s saved pairing with Happy Mobile. Phones can no
                longer start or steer its sessions until you connect again.
            </p>
            <Group title="Stays as it is">
                <ul className="happy-mobile-access-confirmation__list">
                    <li>Your Happy account and every phone signed in to it</li>
                    <li>Session history already on your phones</li>
                    <li>The Happy CLI&apos;s sign-in and its daemon</li>
                    <li>Sessions running on this computer</li>
                </ul>
            </Group>
            <p className="happy-mobile-access-confirmation__note">
                This does not sign out or remove any phone. To remove one phone, log out of Happy on
                that phone.
            </p>
        </>
    );
}

function TerminalResetBody(props: {
    readonly accountKeyFingerprint?: string;
    readonly disabled: boolean;
    readonly preview: MobileAccessTerminalResetPreview;
    readonly removeRegistration: boolean;
    readonly effects?: {
        readonly localAuthCleared: boolean;
        readonly registrationRemoved: boolean;
        readonly daemonStopped: boolean;
    };
    onRegistrationRemovalChange?(remove: boolean): void;
}) {
    const { preview } = props;
    // After a failure, what already happened is read first, beside the error.
    // The choice comes straight after the changes so it is not scrolled away.
    return (
        <>
            {props.effects &&
            (props.effects.localAuthCleared ||
                props.effects.registrationRemoved ||
                props.effects.daemonStopped) ? (
                <Group title="Completed before the error">
                    <ul className="happy-mobile-access-confirmation__list">
                        {/* The CLI works in this order and stops at the first failure. */}
                        {props.effects.daemonStopped ? <li>CLI daemon stopped</li> : null}
                        {props.effects.registrationRemoved ? (
                            <li>CLI registration removed from your account</li>
                        ) : null}
                        {props.effects.localAuthCleared ? (
                            <li>Saved terminal login removed</li>
                        ) : null}
                    </ul>
                </Group>
            ) : null}
            <p className="happy-mobile-access-confirmation__lead">
                Removes the Happy CLI&apos;s saved sign-in on this computer and stops its daemon.
                Remote start and resume through that daemon stop until terminal access is set up
                again.
            </p>
            {/* A known registration names the same account key; it is shown once, there. */}
            {props.accountKeyFingerprint && !preview.registration ? (
                <Group title="Signed-in account">
                    <Detail fingerprint label="Account key" value={props.accountKeyFingerprint} />
                </Group>
            ) : null}
            <Group title="Changes">
                <Detail label="Deletes" value={preview.credentialFile} />
                <Detail
                    label="Removes"
                    value={`${preview.settingsFields.join(", ")} from ${preview.settingsFile}`}
                />
                <Detail label="Stops" value="The Happy CLI daemon" plain />
            </Group>
            <Registration
                disabled={props.disabled}
                preview={preview}
                removeRegistration={props.removeRegistration}
                onRegistrationRemovalChange={props.onRegistrationRemovalChange}
            />
            <Group title="Stays as it is">
                <ul className="happy-mobile-access-confirmation__list">
                    <li>This Happy Agent&apos;s phone pairing</li>
                    <li>Your Happy account, your phones, and their session history</li>
                    <li>Every other setting in {preview.settingsFile}</li>
                    <li>
                        Running terminal sessions, projects, logs, recovery keys, and Agent data
                    </li>
                </ul>
            </Group>
            <p className="happy-mobile-access-confirmation__note">
                Existing terminal sessions can keep their in-memory connection until they end. This
                does not revoke your account or sign out your phones.
            </p>
        </>
    );
}

function Registration(props: {
    readonly disabled: boolean;
    readonly preview: MobileAccessTerminalResetPreview;
    readonly removeRegistration: boolean;
    onRegistrationRemovalChange?(remove: boolean): void;
}) {
    const { preview } = props;
    return (
        <>
            {preview.registration ? (
                <Box className="happy-mobile-access-confirmation__registration">
                    <Checkbox
                        checked={props.removeRegistration}
                        disabled={props.disabled}
                        label="Also remove the CLI's registration from your Happy account"
                        onChange={(checked) => props.onRegistrationRemovalChange?.(checked)}
                    />
                    <Box className="happy-mobile-access-confirmation__registration-details">
                        <Detail label="Machine ID" value={preview.registration.machineId} />
                        <Detail label="Server" value={preview.registration.serverUrl} />
                        <Detail
                            fingerprint
                            label="Account key"
                            value={preview.registration.accountKeyFingerprint}
                        />
                        <span className="happy-mobile-access-confirmation__note">
                            It disappears from the computers on your phones. Past sessions from it
                            stay in your history.
                        </span>
                    </Box>
                </Box>
            ) : (
                <p className="happy-mobile-access-confirmation__note">
                    The CLI&apos;s registration on your Happy account is not known exactly, so it is
                    left in place.
                </p>
            )}
        </>
    );
}

function Group(props: { readonly title: string; readonly children: ReactNode }) {
    return (
        <Box className="happy-mobile-access-confirmation__group">
            <span className="happy-mobile-access-confirmation__group-title">{props.title}</span>
            {props.children}
        </Box>
    );
}

/**
 * One labelled value; paths, IDs, and fingerprints are set in the code face.
 * A fingerprint shows its first and last eight characters, enough to compare
 * by eye; the whole value stays in the tooltip.
 */
export function MobileAccessDetail(props: {
    readonly label: string;
    readonly value: string;
    readonly plain?: boolean;
    readonly fingerprint?: boolean;
}) {
    const short = props.fingerprint && props.value.length > 20;
    return (
        <Box className="happy-mobile-access-detail">
            <span className="happy-mobile-access-detail__label">{props.label}</span>
            <span
                className="happy-mobile-access-detail__value"
                data-plain={props.plain ? "true" : undefined}
                title={short ? props.value : undefined}
            >
                {short ? `${props.value.slice(0, 8)}…${props.value.slice(-8)}` : props.value}
            </span>
        </Box>
    );
}

const Detail = MobileAccessDetail;
