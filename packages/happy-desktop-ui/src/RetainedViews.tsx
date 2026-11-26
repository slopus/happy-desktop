import {
    Activity,
    createContext,
    memo,
    useCallback,
    useState,
    useSyncExternalStore,
    type ReactNode,
} from "react";
import { WindowOverlayRetainedContext } from "./WindowOverlay";

export type RetainedView = {
    readonly id: string;
    /**
     * What the view shows. Only the view on screen is drawn from it: one out
     * of sight keeps what it last drew, whatever it is given, until it is shown
     * again. A view first mounted out of sight is drawn from it once, at idle.
     */
    readonly content?: ReactNode;
    /**
     * Whether its content is current enough to be shown. Switched to while
     * false, the view on screen stays until it is, or until a short wait runs
     * out. Defaults to true.
     */
    readonly ready?: boolean;
};

/**
 * True inside the view on screen while it is shown before it was ready,
 * because the wait for it ran out. The reader has already waited that long
 * for it, so whatever it shows while it gets ready can appear at once rather
 * than after a quiet moment of its own.
 */
export const RetainedViewWaitedContext = createContext(false);

export type RetainedViewsProps = {
    /** The view on screen. Absent keeps every view out of sight, such as while something else covers the pane. */
    activeId?: string;
    /**
     * Every view kept mounted, the one on screen included, in any order. A view
     * that leaves this list is unmounted; one that stays keeps its DOM, scroll
     * position, and component state while it is out of sight.
     */
    views: readonly RetainedView[];
    /**
     * Told how many elements a view keeps alive each time it leaves the screen,
     * so its owner can decide how many it can afford to keep. Keep its identity
     * stable: every view is measured whenever it changes.
     */
    onViewHide?: (id: string, elements: number) => void;
};

/**
 * C-300 RetainedViews — keeps recently shown views mounted out of sight, so
 * showing one again reveals what is already there instead of building it anew.
 *
 * Each view sits in its own React `Activity`. One out of sight is
 * `display: none`, so it takes no space and nothing in it can be focused,
 * clicked, typed into, found, or read by assistive technology; its effects and
 * refs are disconnected, so no listener of its own answers the keyboard or the
 * window, and no store it reads re-renders it. What it hung off the shell
 * through `WindowOverlay` — a menu, a picture viewer — leaves with it, and so
 * does the focus, wherever in the view it was. Its DOM, including where each
 * scrollport was scrolled to, is left exactly as it was.
 *
 * A view out of sight does no work at all: it is frozen as it was last drawn,
 * and whatever its owner hands it meanwhile is not rendered, not even at idle
 * priority. Showing it again draws it once from the content it is given then.
 *
 * Views are placed in the order of their ids rather than of the list, so a view
 * never moves in the DOM — moving one would lose its scroll position — whatever
 * order its owner keeps them in.
 */
export function RetainedViews(props: RetainedViewsProps) {
    const views = [...props.views].sort((left, right) =>
        left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
    );
    /*
     * A view switched to before its content is current would be drawn, and its
     * reader placed, against what it held when it was left, then move to what
     * arrived since. The view on screen stays, frozen and inert, until the
     * next one is ready, so the next one appears in the commit that draws it
     * current: placed where it belongs in its first frame.
     */
    const [shown, setShown] = useState(props.activeId);
    const activeReady = props.views.find((view) => view.id === props.activeId)?.ready !== false;
    /* One wait for each view switched to while it is not ready. */
    const waitFor = activeReady ? undefined : props.activeId;
    const [wait, setWait] = useState(() => ({ id: waitFor, wait: NO_WAIT }));
    if (wait.id !== waitFor)
        setWait({ id: waitFor, wait: waitFor === undefined ? NO_WAIT : retainedViewWait() });
    const waited = useSyncExternalStore(wait.wait.subscribe, wait.wait.get, wait.wait.get);
    const holding =
        !activeReady &&
        !waited &&
        shown !== undefined &&
        shown !== props.activeId &&
        props.views.some((view) => view.id === shown);
    if (!holding && shown !== props.activeId) setShown(props.activeId);
    const displayedId = holding ? shown : props.activeId;
    return (
        <>
            {views.map((view) => (
                <RetainedViewEntry
                    active={view.id === displayedId}
                    content={view.content}
                    held={holding && view.id === displayedId}
                    id={view.id}
                    key={view.id}
                    onHide={props.onViewHide}
                    waited={waited && !activeReady && view.id === displayedId}
                />
            ))}
        </>
    );
}

/** The longest a switch waits for a view that is not ready before showing it as it is (ms). */
const RETAINED_VIEW_READY_WAIT_MS = 250;

type RetainedViewWait = { get: () => boolean; subscribe: (notify: () => void) => () => void };

const NO_WAIT: RetainedViewWait = { get: () => false, subscribe: () => () => undefined };

/** Runs out once, after the longest wait, while the view holding for it is mounted. */
function retainedViewWait(): RetainedViewWait {
    let waited = false;
    return {
        get: () => waited,
        subscribe(notify) {
            const timer = setTimeout(() => {
                waited = true;
                notify();
            }, RETAINED_VIEW_READY_WAIT_MS);
            return () => clearTimeout(timer);
        },
    };
}

type RetainedViewEntryProps = {
    active: boolean;
    content: ReactNode;
    /** On screen only while the view switched to is made ready: frozen and inert. */
    held: boolean;
    id: string;
    onHide: RetainedViewsProps["onViewHide"];
    /** On screen only because the wait for it ran out; see `RetainedViewWaitedContext`. */
    waited: boolean;
};

/*
 * Memoized for a performance contract: once a view is out of sight, renders
 * around it stop here, before a new `Activity` element would have React walk
 * the hidden subtree at idle priority. It renders again only to be shown or
 * hidden.
 */
const RetainedViewEntry = memo(
    function RetainedViewEntry(props: RetainedViewEntryProps) {
        return (
            <Activity mode={props.active ? "visible" : "hidden"}>
                <RetainedViewFrame
                    content={props.content}
                    hidden={!props.active || props.held}
                    inert={props.held}
                    id={props.id}
                    onHide={props.onHide}
                    waited={props.waited}
                />
            </Activity>
        );
    },
    (previous, next) =>
        previous.active === next.active &&
        previous.held === next.held &&
        previous.id === next.id &&
        previous.onHide === next.onHide &&
        previous.waited === next.waited &&
        (!next.active || next.held || previous.content === next.content),
);

type RetainedViewFrameProps = {
    content: ReactNode;
    /** Freezes the frame as it was last drawn; see the comparison below. */
    hidden: boolean;
    /** Takes no input while it stays on screen for the view replacing it. */
    inert: boolean;
    id: string;
    onHide: RetainedViewsProps["onViewHide"];
    waited: boolean;
};

/*
 * Memoized for a performance contract: a frame being hidden, or out of sight,
 * counts as unchanged whatever it is given, so React keeps the content it last
 * drew instead of drawing a hidden transcript again. Shown, it compares as
 * usual against what it last drew.
 */
const RetainedViewFrame = memo(
    function RetainedViewFrame(props: RetainedViewFrameProps) {
        const { id, onHide } = props;
        /* A frozen frame still renders to change `inert`; it draws what it
           last drew, whatever it is handed now. */
        const [drawn, setDrawn] = useState(props.content);
        if (!props.hidden && drawn !== props.content) setDrawn(props.content);
        // React detaches a ref when its Activity hides, before the view is taken
        // off screen, so the cleanup is the moment the view leaves and is still
        // there to be counted. Kept stable so an ordinary render never re-measures.
        const frame = useCallback(
            (element: HTMLDivElement | null) => {
                if (!element) return;
                return () => {
                    // A control taken off screen can stay the focused element, and
                    // keys would keep going to it — and the view shown next would be
                    // refused the caret as if the reader were writing elsewhere. The
                    // focus leaves with the view.
                    const focused = element.ownerDocument.activeElement;
                    if (focused instanceof HTMLElement && element.contains(focused)) focused.blur();
                    onHide?.(id, element.getElementsByTagName("*").length);
                };
            },
            [id, onHide],
        );
        return (
            <div
                className="happy-retained-views__view"
                data-happy-desktop-ui="retained-view"
                data-view-id={id}
                inert={props.inert}
                ref={frame}
            >
                <WindowOverlayRetainedContext.Provider value>
                    <RetainedViewWaitedContext.Provider value={props.waited}>
                        {props.hidden ? drawn : props.content}
                    </RetainedViewWaitedContext.Provider>
                </WindowOverlayRetainedContext.Provider>
            </div>
        );
    },
    (previous, next) =>
        (next.hidden && previous.inert === next.inert) ||
        (previous.hidden === next.hidden &&
            previous.inert === next.inert &&
            previous.content === next.content &&
            previous.id === next.id &&
            previous.onHide === next.onHide &&
            previous.waited === next.waited),
);
