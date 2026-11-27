import { useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { Ionicon } from "./vectorIcons/VectorIcon";

export interface SidebarSetupActionProps {
    /** Whose setup it is, as the rail names the server. */
    readonly location: string;
    /** How many steps are still open. */
    readonly stepsLeft: number;
    /** Returns to setup at the first step still open. */
    onResume(): void;
    /**
     * Opens the card on the first render: the reader left setup a moment ago,
     * and this is where it went.
     */
    readonly defaultOpen?: boolean;
    /** The card was closed, so a later mount need not open it by itself. */
    onClose?(): void;
}

/**
 * C-355 SidebarSetupAction — setup left for later, as a temporary footer mark
 * sharing the update card's anchor and typography. It stays until the last
 * step is finished or skipped, and its card is the way back in.
 */
export function SidebarSetupAction(props: SidebarSetupActionProps) {
    const [open, setOpen] = useState(props.defaultOpen ?? false);
    const root = useRef<HTMLDivElement>(null);
    const close = () => {
        setOpen(false);
        props.onClose?.();
    };
    const dismiss = useEffectEvent(close);
    const left = `${String(props.stepsLeft)} ${props.stepsLeft === 1 ? "step" : "steps"} left`;
    // eslint-disable-next-line happy-react/no-layout-effect -- the open popover owns document-level outside-pointer and Escape listeners, with complete cleanup
    useLayoutEffect(() => {
        if (!open) return;
        const outside = (event: PointerEvent) => {
            if (event.target instanceof Node && !root.current?.contains(event.target)) dismiss();
        };
        const escape = (event: KeyboardEvent) => {
            if (event.key === "Escape") dismiss();
        };
        document.addEventListener("pointerdown", outside, true);
        document.addEventListener("keydown", escape, true);
        return () => {
            document.removeEventListener("pointerdown", outside, true);
            document.removeEventListener("keydown", escape, true);
        };
    }, [open]);
    return (
        <div
            className="happy-sidebar-update happy-sidebar-setup-action"
            data-happy-desktop-ui="sidebar-setup-action"
            data-open={open ? "" : undefined}
            ref={root}
        >
            <button
                aria-expanded={open}
                aria-haspopup="dialog"
                aria-label={`Finish setting up ${props.location}, ${left}`}
                aria-pressed={open}
                className="happy-sidebar-update__trigger"
                onClick={() => (open ? close() : setOpen(true))}
                type="button"
            >
                <Ionicon name="flag-outline" size={20} />
            </button>
            {open ? (
                <div
                    aria-label={`${props.location} setup`}
                    className="happy-sidebar-update__panel happy-sidebar-setup-action__panel"
                    role="dialog"
                >
                    <div className="happy-sidebar-update__main">
                        <span className="happy-sidebar-update__eyebrow" title={props.location}>
                            Setup for {props.location}
                        </span>
                        <span className="happy-sidebar-update__assurance">
                            What you finished is saved. Pick up the rest whenever you like.
                        </span>
                        <div className="happy-sidebar-setup-action__bottom">
                            <span className="happy-sidebar-update__state">{left}</span>
                            <Button onClick={props.onResume} size="small" variant="primary">
                                Finish setup
                            </Button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
