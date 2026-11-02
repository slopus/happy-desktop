import { Button } from "../../Button";
import { Modal } from "../../Modal";
import { ModalOverlay } from "../../ModalOverlay";
import { QRCode } from "../../QRCode";

export interface HappyAgentServerPhoneDialogProps {
    /** The server's name, as the roster lists it. */
    readonly name: string;
    /** Its address, shown under the code so the person can check it. */
    readonly address: string;
    /** What the phone scans: opaque here, drawn as a QR code and never read. */
    readonly code: string;
    onClose(): void;
}

/**
 * The code a phone scans to add one team server. It names the server and its
 * address only; the phone signs in on its own, so there is nothing secret to
 * hide and nothing that expires. It is not phone pairing with this computer.
 */
export function HappyAgentServerPhoneDialog(props: HappyAgentServerPhoneDialogProps) {
    return (
        <ModalOverlay onEscape={props.onClose}>
            <Modal
                data-testid="happy-agent-server-phone"
                footer={
                    <Button onClick={props.onClose} variant="primary">
                        Done
                    </Button>
                }
                icon="mobile"
                onClose={props.onClose}
                size="medium"
                title={`Add ${props.name} on a phone`}
            >
                <div className="happy-agent-server-phone">
                    <QRCode
                        data={props.code}
                        data-testid="happy-agent-server-phone-qr"
                        label={`QR code to add ${props.name} on a phone`}
                        size={200}
                    />
                    <p className="happy-agent-server-phone__text">
                        Open Happy on your phone and scan this code. You sign in to the server on
                        the phone.
                    </p>
                    <p className="happy-agent-server-phone__address">{props.address}</p>
                </div>
            </Modal>
        </ModalOverlay>
    );
}
