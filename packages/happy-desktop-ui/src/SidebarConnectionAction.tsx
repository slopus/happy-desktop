import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { Ionicon } from "./vectorIcons/VectorIcon";

export interface SidebarConnectionActionProps {
    readonly location: string;
    /** Absence means recovered. An open card stays open until dismissed. */
    readonly outage?: {
        readonly status: "reconnecting" | "draining" | "restarting" | "failed";
        readonly explanation: string;
        readonly action?: { readonly label: string; readonly onSelect: () => void };
    };
    readonly defaultOpen?: boolean;
}

/** A temporary footer mark, sharing the update card's anchor and typography. */
export function SidebarConnectionAction(props: SidebarConnectionActionProps) {
    const [open, setOpen] = useState(props.defaultOpen ?? false);
    const root = useRef<HTMLDivElement>(null);
    const status = props.outage?.status ?? "connected";
    const label =
        status === "connected"
            ? "Connected"
            : status === "failed"
              ? "Restart failed"
              : status === "reconnecting"
                ? "Reconnecting…"
                : "Restarting…";
    // eslint-disable-next-line happy-react/no-layout-effect -- the open popover owns document-level outside-pointer and Escape listeners, with complete cleanup
    useLayoutEffect(() => {
        if (!open) return;
        const outside = (event: PointerEvent) => {
            if (event.target instanceof Node && !root.current?.contains(event.target))
                setOpen(false);
        };
        const escape = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };
        document.addEventListener("pointerdown", outside, true);
        document.addEventListener("keydown", escape, true);
        return () => {
            document.removeEventListener("pointerdown", outside, true);
            document.removeEventListener("keydown", escape, true);
        };
    }, [open]);

    if (!props.outage && !open) return null;
    return (
        <div
            className="happy-sidebar-update happy-sidebar-connection-action"
            data-happy-desktop-ui="sidebar-connection-action"
            data-open={open ? "" : undefined}
            data-status={status}
            ref={root}
        >
            <button
                aria-expanded={open}
                aria-haspopup="dialog"
                aria-label={`${props.location} — ${label}`}
                aria-pressed={open}
                className="happy-sidebar-update__trigger"
                onClick={() => setOpen((current) => !current)}
                type="button"
            >
                <Ionicon
                    name={status === "connected" ? "checkmark-circle" : "alert-circle-outline"}
                    size={20}
                />
            </button>
            <span aria-live="polite" className="happy-visually-hidden" role="status">
                {label}
            </span>
            {open ? (
                <div
                    aria-label={`${props.location} connection`}
                    className="happy-sidebar-update__panel happy-sidebar-connection-action__panel"
                    role="dialog"
                >
                    <div className="happy-sidebar-update__main">
                        <span className="happy-sidebar-update__eyebrow" title={props.location}>
                            {props.location}
                        </span>
                        <span className="happy-sidebar-update__assurance happy-sidebar-connection-action__explanation">
                            {props.outage?.explanation ??
                                "Your agent is back. You can continue where you left off."}
                        </span>
                        <div className="happy-sidebar-connection-action__bottom">
                            <span className="happy-sidebar-update__state">{label}</span>
                            {props.outage?.action ? (
                                <Button
                                    onClick={props.outage.action.onSelect}
                                    size="small"
                                    variant="primary"
                                >
                                    {props.outage.action.label}
                                </Button>
                            ) : null}
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
