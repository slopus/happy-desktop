import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { LottieSceneStage } from "./LottieSceneStage";
import { Ionicon } from "./vectorIcons/VectorIcon";

export type SidebarBugReportProps = {
    /**
     * Starts a new task with the bug-report template as its unsent first
     * message. Resolves once it is there; a rejection's message is shown on
     * the card.
     */
    readonly onReport: () => Promise<void>;
    /** Why no task can be started right now; the button is then disabled. */
    readonly reportUnavailable?: string;
    /** A post on X addressed to the Happy team. */
    readonly xPostUrl: string;
    /** The Happy Discord invite. */
    readonly discordUrl: string;
    /** Opens one of the links above outside the app. */
    readonly onLinkOpen: (url: string) => void;
    /** Opens the card on the first render, for blueprint fixtures. */
    readonly defaultOpen?: boolean;
};

/**
 * SidebarBugReport — a bug glyph in the footer, just before the theme menu,
 * and the card it opens above the footer the way a Happy Agent update's card
 * stands there: as wide as the footer row, inside the sidebar column.
 *
 * The card is short on purpose: the crow, one button that starts a
 * troubleshooting task from the bug-report template — nothing is sent — and
 * two links for reporting in public. The crow plays each time the card opens.
 */
export function SidebarBugReport(props: SidebarBugReportProps) {
    const [open, setOpen] = useState(props.defaultOpen ?? false);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | undefined>(undefined);
    const root = useRef<HTMLDivElement>(null);

    // eslint-disable-next-line happy-react/no-layout-effect -- an open card owns document-level outside-pointer and Escape listeners that are attached after commit and completely removed when it closes
    useLayoutEffect(() => {
        if (!open) return;
        const closeOnOutsidePointer = (event: PointerEvent) => {
            if (event.target instanceof Node && !root.current?.contains(event.target))
                setOpen(false);
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };
        document.addEventListener("pointerdown", closeOnOutsidePointer, true);
        document.addEventListener("keydown", closeOnEscape, true);
        return () => {
            document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
            document.removeEventListener("keydown", closeOnEscape, true);
        };
    }, [open]);

    // Each mark is sized by eye to the label: the X is a tall, solid glyph, so
    // it is set smaller than Discord's rounded one to read at the same height.
    const link = (url: string, icon: "logo-x" | "logo-discord", text: string) => (
        <a
            className="happy-sidebar-bug-report__link"
            href={url}
            onClick={(event) => {
                event.preventDefault();
                props.onLinkOpen(url);
            }}
        >
            <Ionicon name={icon} size={icon === "logo-x" ? 10 : 12} />
            <span>{text}</span>
        </a>
    );

    const note = error ?? props.reportUnavailable;
    return (
        <div
            className="happy-sidebar-bug-report"
            data-happy-desktop-ui="sidebar-bug-report"
            data-open={open ? "" : undefined}
            ref={root}
        >
            <Button
                aria-expanded={open}
                aria-haspopup="dialog"
                aria-label="Report a bug"
                icon="bug"
                iconOnly
                onClick={() => {
                    setError(undefined);
                    setOpen((current) => !current);
                }}
                size="small"
                variant="ghost"
            />
            {open ? (
                <div
                    aria-label="Report a bug"
                    className="happy-sidebar-bug-report__panel"
                    data-happy-desktop-ui="sidebar-bug-report-panel"
                    role="dialog"
                >
                    <div className="happy-sidebar-bug-report__head">
                        <span aria-hidden="true" className="happy-sidebar-bug-report__scene">
                            <LottieSceneStage
                                name="crow-eating-worm"
                                replayLabel="Play the crow again"
                                size={56}
                            />
                        </span>
                        <span className="happy-sidebar-bug-report__copy">
                            <span className="happy-sidebar-bug-report__title">
                                <span>Report a bug</span>
                                <span>And eat it too!</span>
                            </span>
                            <span className="happy-sidebar-bug-report__line">
                                Thank you for your time (and optionally tokens)
                            </span>
                        </span>
                    </div>
                    <Button
                        disabled={props.reportUnavailable !== undefined}
                        fullWidth
                        loading={pending}
                        onClick={() => {
                            setPending(true);
                            setError(undefined);
                            props.onReport().then(
                                () => {
                                    setPending(false);
                                    setOpen(false);
                                },
                                (reason: unknown) => {
                                    setPending(false);
                                    setError(
                                        reason instanceof Error
                                            ? reason.message
                                            : "The draft could not be written.",
                                    );
                                },
                            );
                        }}
                        size="small"
                        variant="secondary"
                    >
                        Troubleshoot
                    </Button>
                    {note === undefined ? null : (
                        <span className="happy-sidebar-bug-report__note">{note}</span>
                    )}
                    <span className="happy-sidebar-bug-report__links">
                        {link(props.xPostUrl, "logo-x", "@happy__eng")}
                        {link(props.discordUrl, "logo-discord", "Discord")}
                    </span>
                </div>
            ) : null}
        </div>
    );
}
