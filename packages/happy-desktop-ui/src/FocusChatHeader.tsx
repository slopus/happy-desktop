import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { Tooltip } from "./Tooltip";

/** What the lock on a private conversation says. */
const PRIVATE_LABEL = "Only you can see this conversation";

export interface FocusChatHeaderProps {
    /** The agent onboarding talks through, absent until it is known. */
    readonly name?: string;
    /** The setup it runs for, said the way the rail says it: `@acme`, `This Mac`. */
    readonly setup: string;
    /** The agent's face: its picture, or the placeholder its ID picks. */
    readonly face?: { readonly imageUrl?: string; readonly placeholderSeed?: string };
    /**
     * Only the reader can see this conversation, as with their own Chief of
     * Staff on a team: a small lock after the setup, which says so on hover.
     */
    readonly private?: boolean;
    /** Lets the window go to the app; absent, no Skip is offered. */
    readonly onSkip?: () => void;
}

/**
 * C-342 FocusChatHeader — the band over focus chat, where a setup's onboarding
 * has the window to itself: who is talking and for which setup ("Juno ·
 * @acme"), with a lock when only the reader can see the conversation, and
 * "Skip setup", which gives the window back to the app. It sits in AppShell's
 * `focus` band.
 */
export function FocusChatHeader(props: FocusChatHeaderProps) {
    const initials = (props.name ?? props.setup).replace(/^@/u, "").slice(0, 1).toUpperCase();
    return (
        <header className="happy-focus-chat-header" data-happy-desktop-ui="focus-chat-header">
            <div className="happy-focus-chat-header__who">
                <Avatar
                    initials={initials}
                    size="xs"
                    type="agent"
                    {...(props.face?.imageUrl ? { imageUrl: props.face.imageUrl } : {})}
                    {...(props.face?.placeholderSeed
                        ? { placeholderSeed: props.face.placeholderSeed }
                        : {})}
                />
                <span className="happy-focus-chat-header__title">
                    {props.name ? (
                        <>
                            <span className="happy-focus-chat-header__name">{props.name}</span>
                            <span aria-hidden="true" className="happy-focus-chat-header__dot">
                                ·
                            </span>
                        </>
                    ) : null}
                    <span className="happy-focus-chat-header__setup">{props.setup}</span>
                </span>
                {props.private ? (
                    <Tooltip className="happy-focus-chat-header__private" label={PRIVATE_LABEL}>
                        <span
                            aria-label={PRIVATE_LABEL}
                            className="happy-focus-chat-header__private-mark"
                            data-happy-desktop-ui="focus-chat-header-private"
                            role="img"
                        >
                            <Icon name="lock" size={12} />
                        </span>
                    </Tooltip>
                ) : null}
            </div>
            {props.onSkip ? (
                <div className="happy-focus-chat-header__actions">
                    <Button onClick={props.onSkip} size="small" variant="ghost">
                        Skip setup
                    </Button>
                </div>
            ) : null}
        </header>
    );
}
