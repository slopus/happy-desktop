import { type CSSProperties } from "react";
import { Icon } from "./Icon";

export interface EditPromptButtonProps {
    readonly className?: string;
    readonly "data-happy-desktop-ui"?: string;
    readonly "data-testid"?: string;
    /** What the button offers, defaulting to "Edit and resend". */
    readonly label?: string;
    readonly style?: CSSProperties;
    /** Triggers restoring the prompt into the composer. */
    readonly onEdit: () => void;
}

/**
 * EditPromptButton — a quiet action beside an own message in the transcript.
 * It restores the prompt and its still-accessible attachments into the composer
 * so the person can edit and resend it.
 */
export function EditPromptButton(props: EditPromptButtonProps) {
    const label = props.label ?? "Edit and resend";
    return (
        <button
            aria-label={label}
            className={["happy-copy-button", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui={props["data-happy-desktop-ui"] ?? "edit-prompt-button"}
            data-testid={props["data-testid"]}
            onClick={(event) => {
                event.stopPropagation();
                props.onEdit();
            }}
            style={props.style}
            title={label}
            type="button"
        >
            <Icon name="edit" size={14} />
        </button>
    );
}
