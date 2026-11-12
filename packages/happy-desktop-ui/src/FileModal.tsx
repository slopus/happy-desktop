import { partitionComponentProps } from "./componentProps";
import { type CSSProperties, type ReactNode } from "react";
import { Button } from "./Button";

export type FileModalProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    /** Full path or name. Its last segment titles the card. */
    path: string;
    /** The file itself: a preview, an editor, or a diff, which fills the card below its header. */
    children: ReactNode;
    /**
     * Moves the file into the panel beside the conversation. Absent where there
     * is no such panel, so the control is missing rather than inert.
     */
    onBesideOpen?: () => void;
    /** Shows the file in the machine's file manager. Absent where the host cannot. */
    onReveal?: () => void;
    onClose: () => void;
    closeLabel?: string;
};

/**
 * C-342 FileModal — one file read over the conversation that named it.
 *
 * A panel card hosted directly by ModalOverlay, the way Lightbox is: it bounds
 * its own size, filling the overlay's 24px-gutter box up to 960 × 880, so a
 * file's lines get the room a 640px dialog cannot give them. The header names
 * the file and carries its ways out — beside the conversation, to the file
 * manager, closed — and the body is the file's own surface, which scrolls
 * itself.
 */
export function FileModal(props: FileModalProps) {
    const [local, rest] = partitionComponentProps(props, [
        "className",
        "style",
        "path",
        "children",
        "onBesideOpen",
        "onReveal",
        "onClose",
        "closeLabel",
    ]);
    const name = local.path.slice(local.path.lastIndexOf("/") + 1) || local.path;
    return (
        <div
            {...rest}
            aria-label={name}
            aria-modal="true"
            className={["happy-file-modal", local.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="file-modal"
            role="dialog"
            style={local.style}
        >
            <header className="happy-file-modal__header" data-happy-desktop-ui="file-modal-header">
                <h2
                    className="happy-file-modal__title"
                    data-happy-desktop-ui="file-modal-title"
                    title={local.path}
                >
                    {name}
                </h2>
                {local.onBesideOpen ? (
                    <Button
                        data-testid="file-modal-beside"
                        icon="panel-expand"
                        onClick={() => local.onBesideOpen?.()}
                        size="small"
                        variant="ghost"
                    >
                        Open beside
                    </Button>
                ) : null}
                {local.onReveal ? (
                    <Button
                        data-testid="file-modal-reveal"
                        icon="folder-open"
                        onClick={() => local.onReveal?.()}
                        size="small"
                        variant="ghost"
                    >
                        Show in Finder
                    </Button>
                ) : null}
                <Button
                    aria-label={local.closeLabel ?? "Close"}
                    className="happy-file-modal__close"
                    data-testid="file-modal-close"
                    icon="close"
                    iconOnly
                    onClick={() => local.onClose()}
                    size="small"
                    variant="ghost"
                />
            </header>
            <div className="happy-file-modal__body" data-happy-desktop-ui="file-modal-body">
                {local.children}
            </div>
        </div>
    );
}
