import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * The lane `AppShell` keeps as its own last child for surfaces that cover the
 * window. It is `null` wherever there is no shell — a blueprint specimen, a
 * test fixture, a surface mounted on its own — and a `WindowOverlay` then
 * simply stays where it was written.
 */
export const WindowOverlayHostContext = createContext<HTMLElement | null>(null);

/**
 * True inside a view that can be kept mounted out of sight — see
 * `RetainedViews`. React's `Activity` hides a hidden view's own DOM, but not
 * what the view hung off the shell, so an overlay there would stay on screen,
 * focused and clickable, over the view shown next.
 */
export const WindowOverlayRetainedContext = createContext(false);

/*
 * Hides an overlay of a view kept out of sight, with the focus in it, and shows
 * it again with the view. React detaches the refs of a subtree its `Activity`
 * hides — portals included — and attaches them again when it is shown; one
 * detached for good is unmounted with its node, so hiding it costs nothing.
 */
function retainedOverlayFrame(element: HTMLDivElement | null) {
    if (!element) return;
    element.style.removeProperty("display");
    return () => {
        const focused = element.ownerDocument.activeElement;
        if (focused instanceof HTMLElement && element.contains(focused)) focused.blur();
        element.style.setProperty("display", "none", "important");
    };
}

/**
 * Hangs a window-covering surface off the shell rather than off whatever part
 * of the product opened it.
 *
 * A modal is written where it belongs in the product — the conversation owns
 * the viewer for its own pictures — but `--happy-z-overlay` only means "above
 * the app" in the stacking context the window itself is drawn in. The chat sits
 * inside a `DeferredPane` layer, which is positioned and given a z-index of its
 * own, so an overlay left in place is sealed inside that layer: the sidebar's
 * collapse control and its resize divider went on painting over a full-window
 * picture, because they are chrome of the shell and the picture was not.
 *
 * Moving the surface to the shell's own overlay lane resolves its z-index
 * against the window, which is what a modal-class surface means by "above". It
 * also puts it back inside `.happy-desktop-app-shell`, so the window-chrome
 * reservations — the lane held clear of the macOS traffic lights, the drag
 * regions — reach it exactly as they reach every other heading in the window.
 */
export function WindowOverlay(props: { children: ReactNode }) {
    const host = useContext(WindowOverlayHostContext);
    const retained = useContext(WindowOverlayRetainedContext);
    if (host === null) return <>{props.children}</>;
    return createPortal(
        retained ? (
            <div
                className="happy-retained-views__overlay"
                data-happy-desktop-ui="retained-view-overlay"
                ref={retainedOverlayFrame}
            >
                {props.children}
            </div>
        ) : (
            props.children
        ),
        host,
    );
}

/**
 * The lane `ConnectionShell` keeps beside its connections, outside the box
 * each connection holds its own fixed layers in. `null` where there is no
 * connection shell.
 */
export const WindowCoverHostContext = createContext<HTMLElement | null>(null);

/**
 * Hangs a surface that blacks out the whole window, the connection rail
 * included, off the connection shell. Every other modal stays inside its
 * connection, so the rail keeps working beside it; a story is watched in a
 * dark room, and the room is the window. Without a connection shell it is a
 * `WindowOverlay`. A hidden connection hides its cover with it.
 */
export function WindowCover(props: { children: ReactNode }) {
    const host = useContext(WindowCoverHostContext);
    if (host === null) return <WindowOverlay>{props.children}</WindowOverlay>;
    return createPortal(
        <div
            className="happy-window-cover"
            data-happy-desktop-ui="window-cover"
            ref={retainedOverlayFrame}
        >
            {props.children}
        </div>,
        host,
    );
}
