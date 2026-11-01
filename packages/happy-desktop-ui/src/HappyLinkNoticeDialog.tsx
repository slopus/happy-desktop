import type { ReactNode } from "react";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { ModalOverlay } from "./ModalOverlay";

/** Why a Happy link from outside the app was not opened. */
export type HappyLinkNoticeView =
    /** No connection in this window is the server the link names. */
    | { readonly kind: "unknownServer" }
    /** The link's server is known but did not come online in time; `label` names it. */
    | { readonly kind: "unreachable"; readonly label: string }
    /** The link names no server, or is not one Happy for desktop opens. */
    | { readonly kind: "unsupported" };

export interface HappyLinkNoticeDialogProps {
    readonly view: HappyLinkNoticeView;
    onClose(): void;
    /** Opens Settings › Servers; absent where this window cannot add a server. */
    onServersOpen?(): void;
}

/**
 * The centered notice for a Happy link that reached the window from a browser
 * or another app and was not opened. A link opens only on the server it names,
 * so this says which way that failed and never offers another server.
 */
export function HappyLinkNoticeDialog(props: HappyLinkNoticeDialogProps) {
    const presentation = present(props);
    return (
        <ModalOverlay onEscape={props.onClose}>
            <Modal
                data-testid="happy-link-notice"
                footer={
                    <>
                        {presentation.servers && props.onServersOpen ? (
                            <Button onClick={props.onServersOpen} variant="secondary">
                                Servers
                            </Button>
                        ) : null}
                        <Button onClick={props.onClose} variant="primary">
                            OK
                        </Button>
                    </>
                }
                icon="link"
                onClose={props.onClose}
                size="medium"
                title={presentation.title}
            >
                <p className="happy-link-notice__text">{presentation.body}</p>
            </Modal>
        </ModalOverlay>
    );
}

function present(props: HappyLinkNoticeDialogProps): {
    readonly title: string;
    readonly body: ReactNode;
    readonly servers: boolean;
} {
    switch (props.view.kind) {
        case "unknownServer":
            return {
                title: "Server not connected",
                body: "This link belongs to a Happy server you’re not connected to.",
                servers: true,
            };
        case "unreachable":
            return {
                title: "Couldn’t open the link",
                body: `${props.view.label} isn’t reachable.`,
                servers: false,
            };
        case "unsupported":
            return {
                title: "Couldn’t open the link",
                body: "This link can’t be opened in Happy for desktop.",
                servers: false,
            };
    }
}
