import { Banner } from "./Banner";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { ModalOverlay } from "./ModalOverlay";

/** Where connecting this window to Happy Cloud stands. */
export type CloudConnectView =
    | { readonly kind: "confirm" }
    /** The host Happy Agent is adding the cloud server; the browser opens next. */
    | { readonly kind: "connecting" }
    | { readonly kind: "failed"; readonly message: string };

export interface CloudConnectDialogProps {
    readonly view: CloudConnectView;
    onCancel(): void;
    onConnect(): void;
}

/**
 * The sidebar's "+" asks before it adds Happy Cloud: Connect adds the cloud
 * server and opens its sign-in, where the person signs in or creates a team.
 */
export function CloudConnectDialog(props: CloudConnectDialogProps) {
    const connecting = props.view.kind === "connecting";
    return (
        <ModalOverlay onEscape={props.onCancel}>
            <Modal
                data-testid="cloud-connect"
                footer={
                    <>
                        <Button onClick={props.onCancel} variant="secondary">
                            Cancel
                        </Button>
                        <Button loading={connecting} onClick={props.onConnect} variant="primary">
                            {props.view.kind === "failed" ? "Try again" : "Connect"}
                        </Button>
                    </>
                }
                onClose={props.onCancel}
                size="medium"
                title="Connect to Happy Cloud?"
            >
                <p className="happy-cloud-connect__text">
                    Sign in or create an account to add a cloud team. Agents run in the cloud; no
                    computer needed.
                </p>
                {props.view.kind === "failed" ? (
                    <Banner tone="danger" title="Couldn’t connect">
                        {props.view.message}
                    </Banner>
                ) : null}
            </Modal>
        </ModalOverlay>
    );
}
