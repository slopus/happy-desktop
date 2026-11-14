import { Button } from "./Button";
import { Ionicon } from "./vectorIcons/VectorIcon";

export interface SidebarErrorNoticeProps {
    /** The refusal as the person should read it; absence shows nothing. */
    readonly message?: string;
    /** Puts the notice away. The refused act itself is not retried. */
    readonly onDismiss: () => void;
}

/**
 * SidebarErrorNotice — a sidebar act that was refused, said once in a card
 * standing on the footer row instead of under the heading the row is listed
 * in. It shares the footer marks' card and anchor, opens on its own rather
 * than from a mark, and stays until the person dismisses it.
 */
export function SidebarErrorNotice(props: SidebarErrorNoticeProps) {
    if (props.message === undefined) return null;
    return (
        <div
            className="happy-sidebar-update__panel happy-sidebar-error-notice"
            data-happy-desktop-ui="sidebar-error-notice"
            role="alert"
        >
            <Ionicon
                className="happy-sidebar-error-notice__glyph"
                name="warning-outline"
                size={16}
            />
            <span className="happy-sidebar-error-notice__message">
                <span className="happy-sidebar-error-notice__text">{props.message}</span>
            </span>
            <Button
                aria-label="Dismiss"
                icon="close"
                iconOnly
                onClick={props.onDismiss}
                size="small"
                variant="ghost"
            />
        </div>
    );
}
