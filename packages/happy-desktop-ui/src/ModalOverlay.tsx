import { partitionComponentProps } from "./componentProps";
import { useEffectEvent, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
export type ModalOverlayProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    children: ReactNode;
    /**
     * Called when the dim outside the hosted card is clicked. Wiring it makes
     * the backdrop dismissable; omit it for surfaces that must not be closed by
     * clicking away — e.g. an editor holding unsaved work.
     */
    onDismiss?: () => void;
    /**
     * Called on Escape inside the overlay; defaults to `onDismiss`. A surface
     * that must not be lost to a stray click on the dim, but that the reader
     * may still close from the keyboard, wires only this.
     */
    onEscape?: () => void;
    /**
     * `center` (default) hosts dialogs and forms in the standard modal
     * location. `top` anchors transient type-ahead surfaces below the adaptive
     * top gutter; it is not a form placement. `fill` drops the gutter and gives
     * the whole window to one immersive media surface, which then paints its
     * own dark instead of floating as a card on the dim.
     */
    placement?: "center" | "top" | "fill";
    /**
     * `dim` (default) lays the scrim over the window and makes it the click
     * target that dismisses. `clear` leaves the window exactly as it is: no
     * dim, and pointers pass through to it. A press anywhere outside the hosted
     * card — the app behind it, or chrome outside the overlay such as the
     * connection rail — calls `onDismiss`, and the press still reaches what it
     * landed on. For a light, transient surface like the ⌘K palette.
     */
    backdrop?: "dim" | "clear";
};
const FOCUSABLE =
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
/**
 * C-058 ModalOverlay — the single backdrop every modal-class surface sits on.
 *
 * One dim (`Happy primary-background scrim`), one stacking level (`--happy-z-overlay`), fixed
 * to the app window, and a flex box that hosts exactly one card (Modal,
 * Lightbox, editor panel, or transient type-ahead) inside a 24px safe-area
 * gutter. The default placement centers dialogs and forms; `top` anchors a
 * transient type-ahead below an adaptive top gutter; `fill` hands the whole
 * window to one immersive surface with no gutter at all. Clicking the dim
 * outside the card calls `onDismiss` when wired; clicks inside never dismiss.
 *
 * A `clear` backdrop paints nothing and lets pointers through, for a light
 * transient card such as the ⌘K palette: the window stays exactly as it was,
 * and a press anywhere outside the card dismisses it.
 *
 * The overlay owns modal focus: on mount it moves focus to the hosted card's
 * first focusable control (unless the card already focused itself, as the
 * command palette does), so Escape works immediately without a preceding
 * click; on unmount it hands focus back to the control that opened it.
 */
export function ModalOverlay(props: ModalOverlayProps) {
    const [local, rest] = partitionComponentProps(props, [
        "className",
        "style",
        "children",
        "onDismiss",
        "onEscape",
        "placement",
        "backdrop",
    ]);
    const overlayEl = useRef<HTMLDivElement>(null);
    // Imperative focus handoff at the overlay's lifetime boundary: there is no
    // declarative way to move browser focus into the dialog on open and back to
    // the invoking control on close.
    // eslint-disable-next-line happy-react/no-layout-effect -- opening and closing a modal must move live browser focus into its committed dialog and back to the still-connected invoker
    useLayoutEffect(() => {
        const overlay = overlayEl.current;
        if (!overlay) return;
        const invoker = document.activeElement as HTMLElement | null;
        // A hosted card may have claimed focus in its own mount effect (child
        // effects run first); only fill the gap when focus is still outside.
        if (!overlay.contains(document.activeElement)) {
            const target = overlay.querySelector<HTMLElement>(FOCUSABLE) ?? overlay;
            target.focus();
        }
        const passThrough = local.backdrop === "clear";
        return () => {
            // A press outside a clear overlay may already have put focus where
            // it landed; that is where the reader went, so leave it there.
            const focused = document.activeElement;
            const unclaimed =
                !passThrough ||
                focused === null ||
                focused === document.body ||
                overlay.contains(focused);
            if (unclaimed && invoker && invoker.isConnected && invoker !== document.body)
                invoker.focus();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- focus moves in on open and back on close only; the backdrop is read once for that lifetime, and re-running on a change would steal focus mid-dialog
    }, []);
    const clear = local.backdrop === "clear";
    const dismissOutside = useEffectEvent((event: PointerEvent) => {
        const overlay = overlayEl.current;
        // Pointers pass through the clear overlay's own boxes, so a press that
        // lands anywhere inside it landed on the card or something it hosts.
        if (!overlay || (event.target instanceof Node && overlay.contains(event.target))) return;
        local.onDismiss?.();
    });
    // eslint-disable-next-line happy-react/no-layout-effect -- a clear overlay lets presses through to the window, so dismissing on a press outside the card can only be read from the document itself
    useLayoutEffect(() => {
        if (!clear) return;
        const onPointerDown = (event: PointerEvent) => dismissOutside(event);
        document.addEventListener("pointerdown", onPointerDown, true);
        return () => document.removeEventListener("pointerdown", onPointerDown, true);
    }, [clear]);
    return (
        <div
            {...rest}
            className={["happy-modal-overlay", local.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="modal-overlay"
            data-backdrop={clear ? "clear" : undefined}
            data-placement={local.placement === "center" ? undefined : local.placement}
            onClick={(event) => {
                if (
                    local.onDismiss &&
                    (event.target === event.currentTarget ||
                        (local.placement === "top" &&
                            event.target instanceof HTMLElement &&
                            event.target.dataset.happyDesktopUi === "modal-overlay-top-layout"))
                )
                    local.onDismiss();
            }}
            onKeyDown={(event) => {
                if (event.key === "Escape") (local.onEscape ?? local.onDismiss)?.();
            }}
            ref={overlayEl}
            style={local.style}
            tabIndex={-1}
        >
            {local.placement === "top" ? (
                <div
                    className="happy-modal-overlay__top-layout"
                    data-happy-desktop-ui="modal-overlay-top-layout"
                >
                    {local.children}
                </div>
            ) : (
                local.children
            )}
        </div>
    );
}
