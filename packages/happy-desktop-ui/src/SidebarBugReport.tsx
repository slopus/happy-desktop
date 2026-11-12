import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { LottieScene } from "./LottieScene";
import { Ionicon } from "./vectorIcons/VectorIcon";

export type SidebarBugReportProps = {
    /**
     * Puts the bug-report template in a draft — the current chat's, or a new
     * task's — unsent. Resolves once it is there; a rejection's message is
     * shown on the card.
     */
    readonly onReport: () => Promise<void>;
    /** Why there is nowhere to report from right now; the button is then disabled. */
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
 * The card is short on purpose: the crow, one button that starts a report as
 * an unsent draft — where is the host's decision — and two links for
 * reporting in public. The crow plays each time the card opens.
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

    const link = (url: string, icon: "logo-x" | "logo-discord", text: string) => (
        <a
            className="happy-sidebar-bug-report__link"
            href={url}
            onClick={(event) => {
                event.preventDefault();
                props.onLinkOpen(url);
            }}
        >
            <Ionicon name={icon} size={14} />
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
                            <LottieScene
                                name="crow-eating-worm"
                                replayLabel="Play the crow again"
                                size={56}
                            />
                        </span>
                        <span className="happy-sidebar-bug-report__copy">
                            <span className="happy-sidebar-bug-report__title">
                                <span>Report a bug</span>
                                <span>And eat it too?</span>
                            </span>
                            <span className="happy-sidebar-bug-report__action">
                                <Button
                                    disabled={props.reportUnavailable !== undefined}
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
                            </span>
                            {note === undefined ? null : (
                                <span className="happy-sidebar-bug-report__note">{note}</span>
                            )}
                        </span>
                    </div>
                    <span className="happy-sidebar-bug-report__public">
                        <span className="happy-sidebar-bug-report__write">Or write us:</span>
                        <span className="happy-sidebar-bug-report__links">
                            {link(props.xPostUrl, "logo-x", "@happy__eng")}
                            {link(props.discordUrl, "logo-discord", "Discord")}
                        </span>
                    </span>
                </div>
            ) : null}
        </div>
    );
}
