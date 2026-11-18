import { useState, type ReactNode } from "react";
import { Button } from "./Button";
import type { ThemeMode } from "./ThemeScope";

export interface ConnectSheetProps {
    readonly appearance: ThemeMode;
    /** What the dialog is called for assistive technology. */
    readonly label: string;
    /** The flow is leaving on its own account, such as a request handed off: the sheet sinks. */
    readonly leaving?: boolean;
    /** The first step opened from the start page, whose own Back leaves: no close button. */
    readonly closeHidden?: boolean;
    /** Called once the sheet has sunk away. */
    onClose(): void;
    /** The pages, given the way to sink the sheet the close button uses. */
    children(dismiss: () => void): ReactNode;
}

/**
 * The full-window sheet the sidebar's "+" opens, on the onboarding sky: it
 * rises from the bottom when it opens and sinks back before `onClose` is
 * called; that passing motion is its only state. Esc and the close button in
 * the top-right corner sink it from every page. The pages inside are the
 * flow's own; changing them leaves the sheet where it is.
 */
export function ConnectSheet(props: ConnectSheetProps) {
    const { onClose } = props;
    // Leaving plays the sheet back down first; the caller hears once it is gone.
    const [dismissed, dismissedSet] = useState(false);
    const closing = dismissed || props.leaving === true;
    const dismiss = () => dismissedSet(true);
    return (
        <div
            className="happy-cloud-connect__window"
            // The close button sits on the sky too, outside any one page.
            data-appearance={props.appearance}
            data-backdrop="sky"
            data-closing={closing ? "" : undefined}
            data-happy-desktop-ui="cloud-connect-screen"
            onAnimationEnd={(event) => {
                // Only the sheet's own motion; the pages inside dissolve too.
                if (closing && event.target === event.currentTarget) onClose();
            }}
            // Esc leaves from every state, wherever focus is: a waiting step
            // has nothing focused inside the screen to hear the key.
            ref={(element) => {
                if (!element) return;
                const document = element.ownerDocument;
                const keyDown = (event: KeyboardEvent) => {
                    if (event.key !== "Escape" || event.defaultPrevented) return;
                    event.preventDefault();
                    dismiss();
                };
                document.addEventListener("keydown", keyDown);
                return () => document.removeEventListener("keydown", keyDown);
            }}
            role="dialog"
            aria-modal="true"
            aria-label={props.label}
        >
            {props.children(dismiss)}
            {props.closeHidden ? null : (
                <Button
                    aria-label="Close"
                    className="happy-cloud-connect__close"
                    icon="close"
                    iconOnly
                    onClick={dismiss}
                    variant="ghost"
                />
            )}
        </div>
    );
}
