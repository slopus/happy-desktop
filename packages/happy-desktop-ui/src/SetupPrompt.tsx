import { CopyButton } from "./CopyButton";

export interface SetupPromptProps {
    /** Exactly what the reader is meant to paste into another assistant, copied verbatim. */
    readonly prompt: string;
    /** A short visible excerpt; copying always includes the complete prompt above. */
    readonly preview?: string;
    /** Names this particular prompt for assistive technology. */
    readonly label: string;
    readonly "data-testid"?: string;
    /** Told when the prompt has been copied. */
    readonly onCopy?: () => void;
}

/**
 * C-306 SetupPrompt — one paragraph meant to be handed to another assistant.
 *
 * Where `SetupCommand` is one shell line that must never wrap, this is prose:
 * it wraps up to four lines at the column's measure, stays selectable, and carries one named
 * copy action under it, so the whole paragraph can be taken in one press when
 * nothing inside Happy is able to help.
 *
 * Props only: what the prompt says is the flow's business.
 */
export function SetupPrompt(props: SetupPromptProps) {
    return (
        <div
            className="happy-setup-prompt"
            data-happy-desktop-ui="setup-prompt"
            data-testid={props["data-testid"]}
        >
            <p
                aria-label={props.label}
                className="happy-setup-prompt__text"
                data-happy-desktop-ui="setup-prompt-text"
            >
                {props.preview ?? props.prompt}
            </p>
            <div className="happy-setup-prompt__actions">
                <CopyButton
                    caption="Copy"
                    copiedCaption="Copied"
                    data-happy-desktop-ui="setup-prompt-copy"
                    label={`Copy ${props.label}`}
                    {...(props.onCopy ? { onCopy: props.onCopy } : {})}
                    text={props.prompt}
                />
            </div>
        </div>
    );
}
