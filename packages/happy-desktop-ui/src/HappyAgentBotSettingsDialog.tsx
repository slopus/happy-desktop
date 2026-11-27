import { useRef, type CSSProperties } from "react";
import { Avatar } from "./Avatar";
import { Banner } from "./Banner";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { ModalOverlay } from "./ModalOverlay";
import { TextField } from "./TextField";

export type HappyAgentBotSettingsDialogProps = {
    /** What the bot is called now — the name the host has, not the draft. */
    name: string;
    /** The name being edited. */
    nameDraft: string;
    /** The instructions being edited. */
    instructions: string;
    /** UTF-8 bytes the instructions occupy, and the most the host keeps. */
    instructionsBytes: number;
    instructionsMaximumBytes: number;
    /** The bot's picture, when it has one. */
    imageUrl?: string;
    /** The bot's id, whose live placeholder it wears without a picture (`Avatar`). */
    placeholderSeed?: string;
    /** True while the host is being told; the dialog stays up and inert. */
    submitting?: boolean;
    /** Why the last save or picture was refused, in the reader's words. */
    error?: string;
    /** Why nothing can be saved right now, such as a server that is away. */
    submitDisabledReason?: string;
    onNameChange: (name: string) => void;
    onInstructionsChange: (instructions: string) => void;
    /** The reader picked a picture; it is sent at once rather than drafted. */
    onAvatarChoose: (file: File) => void;
    onSubmit: () => void;
    onClose: () => void;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
};

/** The encodings the host accepts, offered as the file picker's filter. */
const PICTURE_ACCEPT = "image/png,image/jpeg,image/webp";

function bytesLabel(bytes: number): string {
    return bytes < 1024 ? `${String(bytes)} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

/**
 * C-355 HappyAgentBotSettingsDialog — what a Happy Cloud personal bot is
 * called, how it looks, and what it is told to do.
 *
 * The identity strip answers "which bot is this" with the face every member's
 * row wears and the one control that changes it. Below are the two things the
 * reader writes: the name, and the instructions the bot runs with in every
 * member's conversation. Instructions are prose and can run to pages, so they
 * get a tall field and the room left under it.
 *
 * Props only. The drafts live with the caller so the dialog is a pure function
 * of what it is given, and `submitting` is the host being told.
 */
export function HappyAgentBotSettingsDialog(props: HappyAgentBotSettingsDialogProps) {
    const pictureInput = useRef<HTMLInputElement>(null);
    const submitting = props.submitting === true;
    const oversize = props.instructionsBytes > props.instructionsMaximumBytes;
    const committable = props.nameDraft.trim().length > 0 && !oversize;
    return (
        <ModalOverlay onDismiss={() => props.onClose()}>
            <Modal
                className={props.className}
                data-testid={props["data-testid"]}
                footer={
                    <>
                        <Button onClick={() => props.onClose()} variant="ghost">
                            Cancel
                        </Button>
                        <Button
                            data-testid="happy-agent-bot-settings-save"
                            disabled={
                                submitting ||
                                !committable ||
                                props.submitDisabledReason !== undefined
                            }
                            onClick={() => props.onSubmit()}
                            title={props.submitDisabledReason}
                            variant="primary"
                        >
                            {submitting ? "Saving…" : "Save"}
                        </Button>
                    </>
                }
                icon="settings"
                onClose={() => props.onClose()}
                size="medium"
                style={props.style}
                title="Bot settings"
            >
                <div
                    className="happy-agent-bot-settings"
                    data-happy-desktop-ui="happy-agent-bot-settings"
                >
                    {props.error ? (
                        <Banner tone="danger" title="Not saved">
                            {props.error}
                        </Banner>
                    ) : null}
                    <div
                        className="happy-agent-bot-settings__identity"
                        data-happy-desktop-ui="happy-agent-bot-settings-identity"
                    >
                        <Avatar
                            data-testid="happy-agent-bot-settings-avatar"
                            imageUrl={props.imageUrl}
                            initials={props.name.slice(0, 1).toUpperCase()}
                            placeholderSeed={props.placeholderSeed}
                            size="md"
                            type="agent"
                        />
                        <span className="happy-agent-bot-settings__identity-name">
                            {props.name}
                        </span>
                        <Button
                            data-testid="happy-agent-bot-settings-picture-choose"
                            disabled={submitting || props.submitDisabledReason !== undefined}
                            onClick={(event) => {
                                event.currentTarget.focus();
                                pictureInput.current?.click();
                            }}
                            size="small"
                            variant="secondary"
                        >
                            {props.imageUrl ? "Replace picture" : "Choose picture"}
                        </Button>
                        <input
                            accept={PICTURE_ACCEPT}
                            data-testid="happy-agent-bot-settings-picture-input"
                            hidden
                            onChange={(event) => {
                                const file = event.currentTarget.files?.[0];
                                // Picking the same file again is a new choice.
                                event.currentTarget.value = "";
                                if (file) props.onAvatarChoose(file);
                            }}
                            ref={pictureInput}
                            type="file"
                        />
                    </div>
                    <TextField
                        data-testid="happy-agent-bot-settings-name"
                        disabled={submitting}
                        fullWidth
                        label="Name"
                        onValueChange={props.onNameChange}
                        value={props.nameDraft}
                    />
                    <TextField
                        data-testid="happy-agent-bot-settings-instructions"
                        disabled={submitting}
                        fullWidth
                        hint={`Takes effect in every member's conversation with this bot from its next message. ${bytesLabel(props.instructionsBytes)} of ${bytesLabel(props.instructionsMaximumBytes)}.`}
                        label="Instructions"
                        multiline
                        onValueChange={props.onInstructionsChange}
                        placeholder="What this bot is for, and how it should work."
                        rows={10}
                        value={props.instructions}
                        {...(oversize
                            ? { error: "Too long to keep. Shorten the instructions." }
                            : {})}
                    />
                </div>
            </Modal>
        </ModalOverlay>
    );
}
