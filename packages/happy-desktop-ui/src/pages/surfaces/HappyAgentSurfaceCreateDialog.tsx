import { useRef, useState, type CSSProperties } from "react";
import { Button } from "../../Button";
import { Icon, type IconName } from "../../Icon";
import { Modal } from "../../Modal";
import { ModalOverlay } from "../../ModalOverlay";
import { TextField } from "../../TextField";

/** The pictures the daemon accepts, and how large one may be. */
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const IMAGE_BYTES_LIMIT = 8 * 1024 * 1024;
const IMAGE_PIXELS_LIMIT = 40_000_000;

/**
 * Whether a file's first bytes are a PNG, JPEG, or WebP picture. The type a
 * file is named with comes from its extension; the daemon reads the bytes.
 */
function imageSignatureAccepted(bytes: Uint8Array): boolean {
    const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
    return (
        (bytes[0] === 0x89 && ascii(1, 4) === "PNG") ||
        (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
        (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP")
    );
}

/** The kinds of Surface this dialog makes. */
export type HappyAgentSurfaceCreateKind =
    | "todo"
    | "document"
    | "calendar"
    | "vault"
    | "system_monitor"
    | "chat";

/** What the dialog asks for: a name, and a picture if the reader chose one. */
export interface HappyAgentSurfaceCreateInput {
    readonly kind: HappyAgentSurfaceCreateKind;
    readonly name: string;
    readonly image?: File;
}

/** Each kind's title, glyph, and the example its name field suggests. */
const KINDS = {
    todo: { title: "New todo list", icon: "tasks", placeholder: "Groceries" },
    document: { title: "New document", icon: "doc", placeholder: "House rules" },
    calendar: { title: "New calendar", icon: "calendar", placeholder: "Team" },
    vault: { title: "New vault", icon: "vault", placeholder: "Studio" },
    system_monitor: { title: "New system monitor", icon: "pulse", placeholder: "System Monitor" },
    chat: { title: "New chat", icon: "users", placeholder: "Family" },
} as const satisfies Record<
    HappyAgentSurfaceCreateKind,
    { title: string; icon: IconName; placeholder: string }
>;

export type HappyAgentSurfaceCreateDialogProps = {
    kind: HappyAgentSurfaceCreateKind;
    onSubmit: (input: HappyAgentSurfaceCreateInput) => void;
    onClose: () => void;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
};

interface Picture {
    readonly file: File;
    /** The picture read into a data URL, for the preview. */
    readonly preview: string;
}

/**
 * C-298 HappyAgentSurfaceCreateDialog — names a new Surface
 * and, if the reader wants, gives it a picture.
 *
 * The form is the dialog's own until it is submitted: the name typed, the
 * picture chosen and its preview. The owner hears only the finished request;
 * the list is made at once and the dialog closes, so it never waits on the
 * Happy Agent and has no refusal to state. A picture is therefore held to
 * everything the Happy Agent checks before it can be chosen at all — its
 * bytes, its size, and its pixel count — because a list the Happy Agent
 * refused would vanish from the sidebar.
 */
export function HappyAgentSurfaceCreateDialog(props: HappyAgentSurfaceCreateDialogProps) {
    const [name, setName] = useState(props.kind === "system_monitor" ? "System Monitor" : "");
    const [picture, setPicture] = useState<Picture>();
    const [pictureError, setPictureError] = useState<string>();
    const fileInput = useRef<HTMLInputElement>(null);
    const ready = name.trim().length > 0;
    const submit = () => {
        if (!ready) return;
        props.onSubmit({
            kind: props.kind,
            name: name.trim(),
            ...(picture ? { image: picture.file } : {}),
        });
    };
    const choose = (file: File | undefined) => {
        if (!file) return;
        if (!IMAGE_TYPES.includes(file.type)) {
            setPictureError("Choose a PNG, JPEG, or WebP picture.");
            return;
        }
        if (file.size > IMAGE_BYTES_LIMIT) {
            setPictureError("Choose a picture no larger than 8 MB.");
            return;
        }
        const unreadable = () => setPictureError("That picture could not be read.");
        void file
            .slice(0, 12)
            .arrayBuffer()
            .then((head) => {
                if (!imageSignatureAccepted(new Uint8Array(head))) {
                    setPictureError("Choose a PNG, JPEG, or WebP picture.");
                    return;
                }
                const reader = new FileReader();
                reader.onload = () => {
                    const preview = reader.result;
                    if (typeof preview !== "string") return unreadable();
                    // Decoded here once, so a picture that cannot be read or
                    // is too large to process is caught while it can be changed.
                    const image = new Image();
                    image.onload = () => {
                        if (image.naturalWidth === 0 || image.naturalHeight === 0)
                            return unreadable();
                        if (image.naturalWidth * image.naturalHeight > IMAGE_PIXELS_LIMIT) {
                            setPictureError("Choose a picture under 40 megapixels.");
                            return;
                        }
                        setPictureError(undefined);
                        setPicture({ file, preview });
                    };
                    image.onerror = unreadable;
                    image.src = preview;
                };
                reader.onerror = unreadable;
                reader.readAsDataURL(file);
            }, unreadable);
    };
    return (
        <ModalOverlay onDismiss={props.onClose}>
            <Modal
                className={props.className}
                data-testid={props["data-testid"]}
                footer={
                    <>
                        <Button onClick={props.onClose} variant="ghost">
                            Cancel
                        </Button>
                        <Button
                            data-testid="happy-agent-surface-create-submit"
                            disabled={!ready}
                            onClick={submit}
                            variant="primary"
                        >
                            Create
                        </Button>
                    </>
                }
                icon={KINDS[props.kind].icon}
                onClose={props.onClose}
                size="medium"
                style={props.style}
                title={KINDS[props.kind].title}
            >
                <div
                    className="happy-agent-surface-create-dialog"
                    data-happy-desktop-ui="happy-agent-surface-create-dialog"
                >
                    <TextField
                        autoFocus
                        data-testid="happy-agent-surface-create-name"
                        fullWidth
                        label="Name"
                        onSubmit={submit}
                        onValueChange={setName}
                        placeholder={KINDS[props.kind].placeholder}
                        value={name}
                    />
                    <div className="happy-agent-surface-create-dialog__picture">
                        <span
                            className="happy-agent-surface-create-dialog__preview"
                            data-happy-desktop-ui="happy-agent-surface-create-dialog-preview"
                        >
                            {picture ? (
                                <img alt="" draggable={false} src={picture.preview} />
                            ) : (
                                <Icon name="image" size={20} />
                            )}
                        </span>
                        <span className="happy-agent-surface-create-dialog__picture-text">
                            <span className="happy-agent-surface-create-dialog__picture-label">
                                Picture
                            </span>
                            <span
                                className="happy-agent-surface-create-dialog__picture-hint"
                                data-invalid={pictureError ? "" : undefined}
                            >
                                {pictureError ?? "Optional, up to 8 MB."}
                            </span>
                        </span>
                        {picture ? (
                            <Button
                                onClick={() => setPicture(undefined)}
                                size="small"
                                variant="ghost"
                            >
                                Remove
                            </Button>
                        ) : null}
                        <Button
                            onClick={() => fileInput.current?.click()}
                            size="small"
                            variant="secondary"
                        >
                            {picture ? "Change…" : "Choose…"}
                        </Button>
                        <input
                            accept={IMAGE_TYPES.join(",")}
                            className="happy-agent-surface-create-dialog__file"
                            data-testid="happy-agent-surface-create-file"
                            hidden
                            onChange={(event) => {
                                choose(event.currentTarget.files?.[0]);
                                event.currentTarget.value = "";
                            }}
                            ref={fileInput}
                            type="file"
                        />
                    </div>
                </div>
            </Modal>
        </ModalOverlay>
    );
}
