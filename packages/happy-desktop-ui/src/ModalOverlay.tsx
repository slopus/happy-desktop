import { partitionComponentProps } from "./componentProps";
import { CLOSE_SHORTCUT, commandShortcutMatches } from "./keyboardShortcut";
import {
    createContext,
    use,
    useEffectEvent,
    useLayoutEffect,
    useRef,
    useState,
    type CSSProperties,
    type ReactNode,
} from "react";
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
     * landed on. `soft` is the dim at a fraction of its weight, still the
     * click target that dismisses: for a transient type-ahead such as the ⌘K
     * palette, which sets itself apart from the window without hiding it.
     */
    backdrop?: "dim" | "soft" | "clear";
};
/**
 * What a ModalOverlayPresence tells the overlay and the card it hosts: whether
 * the surface is leaving, and how to say that it has finished leaving.
 */
export type ModalOverlayPresenceState = {
    readonly closing: boolean;
    readonly exited: () => void;
};
const ModalOverlayPresenceContext = createContext<ModalOverlayPresenceState | null>(null);
/**
 * The presence an enclosing ModalOverlayPresence gives, or null outside one. A
 * hosted card reads it to hand focus back the moment its surface starts
 * leaving rather than when the leaving is over.
 */
export function useModalOverlayPresence(): ModalOverlayPresenceState | null {
    return use(ModalOverlayPresenceContext);
}
export type ModalOverlayPresenceProps = {
    /** Whether the surface should be on screen. */
    open: boolean;
    /** The ModalOverlay, mounted while open and through its exit. */
    children: ReactNode;
};
/**
 * Keeps one ModalOverlay mounted through its exit, so a surface such as the ⌘K
 * palette arrives and leaves rather than cutting in and out. While `open` it
 * renders its overlay, which plays its entrance; when `open` turns false the
 * same overlay stays, inert, and plays its exit, then goes. Opening it again
 * while it is still leaving turns the very same overlay round — no second
 * mount, no restarted entrance. Outside one, a ModalOverlay neither enters nor
 * leaves with motion, which keeps the blueprint's fixtures still.
 */
export function ModalOverlayPresence(props: ModalOverlayPresenceProps) {
    const [mounted, setMounted] = useState(props.open);
    // An opening is known during render, so the overlay mounts in the same
    // commit that opened it: its input can take focus before the first frame.
    if (props.open && !mounted) setMounted(true);
    if (!mounted) return null;
    return (
        <ModalOverlayPresenceContext
            value={{ closing: !props.open, exited: () => setMounted(false) }}
        >
            {props.children}
        </ModalOverlayPresenceContext>
    );
}
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
 * A `clear` backdrop paints nothing and lets pointers through: the window
 * stays exactly as it was, and a press anywhere outside the card dismisses it.
 * A `soft` one dims the window lightly, for a transient type-ahead such as the
 * ⌘K palette.
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
    const presence = use(ModalOverlayPresenceContext);
    const present = presence !== null;
    const closing = presence?.closing === true;
    const invokerRef = useRef<HTMLElement | null>(null);
    // Imperative focus handoff at the overlay's lifetime boundary: there is no
    // declarative way to move browser focus into the dialog on open and back to
    // the invoking control on close.
    // eslint-disable-next-line happy-react/no-layout-effect -- opening and closing a modal must move live browser focus into its committed dialog and back to the still-connected invoker
    useLayoutEffect(() => {
        const overlay = overlayEl.current;
        if (!overlay) return;
        const invoker = document.activeElement as HTMLElement | null;
        invokerRef.current = invoker;
        // A hosted card may have claimed focus in its own mount effect (child
        // effects run first); only fill the gap when focus is still outside.
        if (!overlay.contains(document.activeElement)) {
            const target = overlay.querySelector<HTMLElement>(FOCUSABLE) ?? overlay;
            target.focus();
        }
        // A press outside a clear overlay, or anything a leaving overlay's
        // departure set off, may already have put focus somewhere else.
        const passThrough = local.backdrop === "clear" || presence !== null;
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
    const exited = useEffectEvent(() => presence?.exited());
    // eslint-disable-next-line happy-react/no-layout-effect -- a leaving overlay must hand live browser focus back before it goes (and take it again if opened before it is gone), and its exit ends only when the browser's own transitions on it do
    useLayoutEffect(() => {
        const overlay = overlayEl.current;
        if (!overlay || !present) return;
        if (!closing) {
            // Opened again before it was gone: focus comes back in, as on a
            // first opening, unless the card has already taken it.
            if (!overlay.contains(document.activeElement))
                (overlay.querySelector<HTMLElement>(FOCUSABLE) ?? overlay).focus();
            return;
        }
        // Focus goes back as the overlay starts to leave, not when it is gone,
        // so the next keystroke already lands where the reader is going.
        const invoker = invokerRef.current;
        const focused = document.activeElement;
        if (
            invoker &&
            invoker.isConnected &&
            !overlay.contains(invoker) &&
            (focused === null || focused === document.body || overlay.contains(focused))
        )
            invoker.focus();
        // Reading the animations settles style, which starts the exit
        // transitions. Each ends or is cancelled — by opening again, which
        // turns them round — and either way the wait ends, so a leaving
        // overlay can never be left standing.
        // Where there are no Web Animations at all (jsdom), nothing is running.
        const animations =
            "getAnimations" in overlay ? overlay.getAnimations({ subtree: true }) : [];
        let current = true;
        void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
            if (current) exited();
        });
        return () => {
            current = false;
        };
    }, [closing, present]);
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
            data-backdrop={local.backdrop === "dim" ? undefined : local.backdrop}
            data-placement={local.placement === "center" ? undefined : local.placement}
            data-presence={presence ? (closing ? "closing" : "open") : undefined}
            inert={closing || undefined}
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
                if (event.key === "Escape") {
                    (local.onEscape ?? local.onDismiss)?.();
                    return;
                }
                // The close chord means the innermost thing that is up, and
                // while an overlay is up that is the overlay: it leaves as it
                // does on Escape. Claiming the event keeps the same press from
                // reaching the window, which would close what is behind it too.
                const close = local.onEscape ?? local.onDismiss;
                if (!close || !commandShortcutMatches(event.nativeEvent, CLOSE_SHORTCUT)) return;
                event.preventDefault();
                close();
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
