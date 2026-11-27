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
 * Shows an overlay's frame only while the view that opened it is on screen,
 * and takes the focus out of it as it goes. React attaches the refs of a
 * subtree only while its `Activity` shows it — portals included — and detaches
 * them when it is hidden; one detached for good is unmounted with its node, so
 * hiding it costs nothing. The frame is hidden by its own style until it is
 * marked, so an overlay opened by a view already out of sight, whose refs were
 * never attached, stays out of sight too.
 *
 * The mark is made from the frame's first child rather than from the frame:
 * React attaches a parent's ref after its children's, and a menu that measures
 * itself in its own ref would then be measuring a box not yet displayed. An
 * earlier sibling's ref runs first.
 */
function retainedOverlayMark(mark: HTMLSpanElement | null) {
    const frame = mark?.parentElement;
    if (!frame) return;
    frame.setAttribute("data-shown", "");
    return () => {
        const focused = frame.ownerDocument.activeElement;
        if (focused instanceof HTMLElement && frame.contains(focused)) focused.blur();
        frame.removeAttribute("data-shown");
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
            >
                <span hidden ref={retainedOverlayMark} />
                {props.children}
            </div>
        ) : (
            props.children
        ),
        host,
    );
}

/**
 * The overlay lane above every connection, including the connection rail.
 * `undefined` where there is no connection shell at all; `null` inside a shell
 * whose lane has not been attached yet, which lasts one commit.
 */
export const WindowCoverHostContext = createContext<HTMLElement | null | undefined>(undefined);

/**
 * Hangs a full-window surface off the connection shell; hidden connections
 * hide their covers. `ModalOverlay` hangs itself here, so a dialog is written
 * where it belongs in the product and still dims the whole window.
 *
 * What a cover opens of its own, such as a menu or a picture viewer, hangs on
 * the same lane after it: left on the shell's lane inside the connection, it
 * would open underneath the cover that asked for it.
 */
export function WindowCover(props: { children: ReactNode }) {
    const host = useContext(WindowCoverHostContext);
    if (host === undefined) return <WindowOverlay>{props.children}</WindowOverlay>;
    // Mounting in place for the one commit before the lane exists would mount
    // the surface twice, dropping its focus and whatever it already held.
    if (host === null) return null;
    return createPortal(
        <div className="happy-window-cover" data-happy-desktop-ui="window-cover">
            <span hidden ref={retainedOverlayMark} />
            <WindowOverlayHostContext value={host}>
                <WindowOverlayRetainedContext value>{props.children}</WindowOverlayRetainedContext>
            </WindowOverlayHostContext>
        </div>,
        host,
    );
}
