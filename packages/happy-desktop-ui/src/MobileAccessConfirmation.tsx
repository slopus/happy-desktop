import type { ReactNode } from "react";
import { Banner } from "./Banner";
import { Box } from "./Box";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { ModalOverlay } from "./ModalOverlay";

export interface MobileAccessConfirmationState {
    readonly kind: "disconnect";
    readonly pending: boolean;
    readonly error?: string;
}

export interface MobileAccessConfirmationProps {
    readonly confirmation: MobileAccessConfirmationState;
    readonly "data-testid"?: string;
    /**
     * Whether Disconnect deletes this computer, and the chats it published,
     * from the Happy account. Older Happy Agents only forget their pairing, and
     * the dialog describes whichever of the two will actually happen.
     */
    readonly removesComputer?: boolean;
    onCancel(): void;
    onConfirm(): void;
}

/**
 * C-285 MobileAccessConfirmation — the destructive confirmation of Mobile
 * Access. It names what changes and what stays, in terms of what the operation
 * actually does: disconnecting removes this computer and the chats it published
 * from the Happy account, and nothing else (an older Happy Agent only forgets
 * its pairing, and says so). It never claims to revoke a phone. Presentational
 * and fully controlled; the dim cancels unless a request is in flight.
 */
export function MobileAccessConfirmation(props: MobileAccessConfirmationProps) {
    const { confirmation } = props;
    const cancel = confirmation.pending ? undefined : props.onCancel;
    const removes = props.removesComputer === true;
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
                            {confirmation.pending
                                ? removes
                                    ? "Removing…"
                                    : "Disconnecting…"
                                : "Disconnect"}
                        </Button>
                    </Box>
                }
                icon="unlink"
                onClose={cancel}
                size="medium"
                title="Disconnect this computer?"
                tone="danger"
            >
                <Box className="happy-mobile-access-confirmation__body">
                    {confirmation.error ? (
                        <Banner
                            tone="danger"
                            title={
                                removes ? "Couldn't remove this computer" : "Could not disconnect"
                            }
                        >
                            {confirmation.error}
                        </Banner>
                    ) : null}
                    {removes ? <RemoveComputerBody /> : <DisconnectBody />}
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

function RemoveComputerBody() {
    return (
        <>
            <p className="happy-mobile-access-confirmation__lead">
                This removes this computer from your Happy account. Your phones stop showing it and
                the chats it published, and they can no longer start or steer its sessions. To use
                it from your phone again, connect this computer again.
            </p>
            <Group title="Removed">
                <ul className="happy-mobile-access-confirmation__list">
                    <li>This computer, on every phone signed in to your Happy account</li>
                    <li>Chats this computer published to Happy</li>
                </ul>
            </Group>
            <Group title="Stays as it is">
                <ul className="happy-mobile-access-confirmation__list">
                    <li>Your Happy account and every phone signed in to it</li>
                    <li>Sessions and history on this computer</li>
                    <li>Other computers on your account</li>
                </ul>
            </Group>
            <p className="happy-mobile-access-confirmation__note">
                This does not sign out or remove any phone. If this computer can&apos;t reach Happy,
                it stays linked and you can try again.
            </p>
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
