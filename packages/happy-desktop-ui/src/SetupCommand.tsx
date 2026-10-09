import { CopyButton } from "./CopyButton";

export interface SetupCommandProps {
    /** Exactly what the reader is meant to run, copied verbatim. */
    readonly command: string;
    /** Names this particular command for assistive technology. */
    readonly label: string;
    readonly "data-testid"?: string;
    /** Told when the command has been copied. */
    readonly onCopy?: () => void;
}

/**
 * C-284 SetupCommand — one shell command, presented as a terminal line.
 *
 * A prompt, the command in the monospace face on the terminal's own dark
 * surface, and the copy action pinned to the right. It is the same treatment
 * the marketing site gives the install command, because a reader arriving here
 * has already been told once what a thing to type looks like.
 *
 * The command never wraps. A shell line broken across two rows reads as two
 * commands, so a long one ends in an ellipsis and scrolls inside its own well
 * while the prompt and the copy button stay where they are. The line is focusable and selectable: a
 * desktop window is usually unselectable chrome, and a command nobody can take
 * is worse than no command at all.
 *
 * Props only: which command belongs on a screen is the flow's business.
 */
export function SetupCommand(props: SetupCommandProps) {
    return (
        <div
            className="happy-setup-command"
            data-happy-desktop-ui="setup-command"
            data-testid={props["data-testid"]}
        >
            <span
                aria-hidden="true"
                className="happy-setup-command__prompt"
                data-happy-desktop-ui="setup-command-prompt"
            >
                $
            </span>
            <code
                aria-label={props.label}
                className="happy-setup-command__text"
                data-happy-desktop-ui="setup-command-text"
                // A narrow well ends a long command in an ellipsis; hovering
                // still reads the whole of it.
                title={props.command}
            >
                {props.command}
            </code>
            <CopyButton
                className="happy-setup-command__copy"
                data-happy-desktop-ui="setup-command-copy"
                label={`Copy ${props.label}`}
                {...(props.onCopy ? { onCopy: props.onCopy } : {})}
                text={props.command}
            />
        </div>
    );
}
