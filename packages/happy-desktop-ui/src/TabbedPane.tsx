import { partitionComponentProps } from "./componentProps";
import {
    Component,
    createRef,
    useLayoutEffect,
    useRef,
    useState,
    type CSSProperties,
    type ReactNode,
} from "react";
import type { KeyboardShortcut } from "./keyboardShortcut";
import { type MenuItem } from "./Menu";
import { Tabs, type TabCloseQuestion, type TabItem, type TabsSize } from "./Tabs";
import type { TabTransferTarget } from "./tabTransfer";

export type TabbedPaneProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    /** The pane's body: the content of the active tab. */
    children: ReactNode;
    tabs: TabItem[];
    activeId: string;
    onSelect: (id: string) => void;
    /** The reader is likely to select this tab next; see `Tabs`. */
    onIntent?: (id: string) => void;
    /** Reports a tab activated with a double click, such as pinning a preview. */
    onDoubleClick?: (id: string) => void;
    /** Closes a tab; supplying it gives every tab a hover-revealed close control. */
    onClose?: (id: string) => void;
    /** Accessible name of the close control, for example `Close session`. */
    closeLabel?: string;
    /** Non-visual shortcut announced on the active tab's close control. */
    closeShortcut?: KeyboardShortcut;
    /** A question asked below one tab before it closes; see `Tabs`. */
    closeQuestion?: TabCloseQuestion;
    closePresentation?: "trailing" | "overlay";
    closeRevealedId?: string;
    /** Full titles scroll at their natural widths instead of sharing equal cells. */
    tabSizing?: "equal" | "content";
    /** Fade each edge of the scroller while more tabs remain out of view past it. */
    overflowFade?: boolean;
    /** Commits a drag with the tab ids in their new order; supplying it makes tabs draggable. */
    onReorder?: (ids: readonly string[]) => void;
    /** Returns the context-menu actions available for one tab. Empty means no menu. */
    tabMenuItems?: (tab: TabItem) => MenuItem[];
    onTabMenuSelect?: (tab: TabItem, actionId: string) => void;
    /** Where a tab from this pane may be moved to; see `Tabs`. */
    transferTargets?: readonly TabTransferTarget[];
    /** Whether one tab may leave this pane at all. Default: all may. */
    transferable?: (tab: TabItem) => boolean;
    /** Reports a tab moved into one of the targets. The owner performs the move. */
    onTransfer?: (tabId: string, zone: string) => void;
    size?: TabsSize;
    /**
     * Controls that ride directly after the last tab, such as an "add tab"
     * affordance. They follow the shrinkable tab scrollport so they read as the
     * next thing after a short strip and stay reachable when a long strip
     * scrolls. Living outside that clip also lets their overlays float below.
     */
    actions?: ReactNode;
    /**
     * Controls pinned to the far end of the bar, clear of the tabs. Use this for
     * an affordance that belongs to the strip as a whole rather than to the tab
     * after the last one: it holds the same trailing gutter as the header above
     * it, so the two line up in one column no matter how many tabs there are.
     */
    trailing?: ReactNode;
    /**
     * Floats the bar over the top of the body instead of stacking it above.
     * The body then fills the whole pane and keeps the bar's height clear as
     * its own top padding, so the bar can come and go without moving the
     * body's box.
     */
    barOverlay?: boolean;
    /**
     * Leaves the bar out, for a pane whose one document needs no strip. With
     * `barOverlay` the body's top inset goes to zero, and every scrollport in
     * the body keeps what it shows where it was as the inset changes.
     */
    barHidden?: boolean;
};

/**
 * Scrollports that already hold their reader's place across a change of their
 * own height. A transcript is held by its lower edge, so a top inset coming or
 * going moves none of its rows, and moving it here as well would move them.
 */
const TABBED_PANE_SELF_HELD_SCROLLPORTS = '[data-happy-desktop-ui="message-list"]';

type TabbedPaneScrollportTop = {
    readonly element: HTMLElement;
    readonly top: number;
    /** Read before the commit: a body that grows clamps it near the end. */
    readonly scrollTop: number;
};

/**
 * The outermost scrollports in `body` and where their top edges are. A
 * scrollport inside another one rides on its parent's scroll, so only the
 * outermost are read. One that cannot scroll yet is still read, since a
 * shrinking body can give it something to scroll.
 */
function tabbedPaneScrollportsRead(body: HTMLElement): TabbedPaneScrollportTop[] {
    const view = body.ownerDocument.defaultView;
    if (!view) return [];
    const scrollports: TabbedPaneScrollportTop[] = [];
    const visit = (parent: Element) => {
        for (const element of parent.children) {
            if (!(element instanceof view.HTMLElement)) continue;
            if (element.matches(TABBED_PANE_SELF_HELD_SCROLLPORTS)) continue;
            // A box that is not rendered has nothing on screen to hold.
            if (element.clientHeight === 0 && element.clientWidth === 0) continue;
            const overflow = view.getComputedStyle(element).overflowY;
            if (overflow === "auto" || overflow === "scroll") {
                scrollports.push({
                    element,
                    top: element.getBoundingClientRect().top,
                    scrollTop: element.scrollTop,
                });
                continue;
            }
            visit(element);
        }
    };
    visit(body);
    return scrollports;
}

/**
 * Scrolls each scrollport read before the body's top inset changed by as far
 * as its top edge then moved, which puts every line it shows back at the
 * height it was drawn at. One whose edge stayed, such as a control pinned to
 * the pane's bottom, is left alone. Growing the inset always has room to
 * hold, since it lengthens the scroll range by just as much; a shrinking inset
 * can hold only as far as the scrollport is scrolled.
 */
function tabbedPaneScrollportsHold(before: readonly TabbedPaneScrollportTop[]) {
    const moves = before
        .filter((entry) => entry.element.isConnected)
        .map((entry) => ({
            element: entry.element,
            scrollTop: entry.scrollTop,
            delta: entry.element.getBoundingClientRect().top - entry.top,
        }));
    // From the offset read before the commit, not the current one: a body
    // growing near the end of a scrollport has already clamped that.
    for (const move of moves)
        if (move.delta !== 0) move.element.scrollTop = move.scrollTop + move.delta;
}

/**
 * The pane's body. A class only for `getSnapshotBeforeUpdate`, the one place
 * the body's scrollports can be read before the commit that changes its inset
 * moves them.
 */
class TabbedPaneBody extends Component<{
    readonly activeId: string;
    readonly children: ReactNode;
    /** Whether the body's top inset is zero; a change is what is held. */
    readonly insetHidden: boolean | undefined;
}> {
    readonly #body = createRef<HTMLDivElement>();
    override getSnapshotBeforeUpdate(
        previous: TabbedPaneBody["props"],
    ): readonly TabbedPaneScrollportTop[] | null {
        const body = this.#body.current;
        // Only a body still showing the same tab has anything on screen to
        // hold. A bar that comes with a switch, such as a second tab opened
        // and selected at once, shows another document, which opens at its
        // own place under the new inset.
        if (
            !body ||
            previous.insetHidden === this.props.insetHidden ||
            previous.activeId !== this.props.activeId
        )
            return null;
        return tabbedPaneScrollportsRead(body);
    }
    override componentDidUpdate(
        _previous: TabbedPaneBody["props"],
        _state: unknown,
        before: readonly TabbedPaneScrollportTop[] | null,
    ) {
        if (before) tabbedPaneScrollportsHold(before);
    }
    override render() {
        return (
            <div
                className="happy-tabbed-pane__body"
                data-happy-desktop-ui="tabbed-pane-body"
                ref={this.#body}
            >
                {this.props.children}
            </div>
        );
    }
}

/**
 * C-160 TabbedPane — a tab bar over a body that fills the remaining height, for
 * a surface whose content region hosts several peer documents.
 *
 * The bar is the component's reason to exist: it is a fixed row that never
 * grows, so an unbounded number of tabs scrolls horizontally inside it instead
 * of wrapping into a second row that would move the body. By default every tab is the same
 * width, the way a browser's are: labels truncate inside it, a long title never
 * widens its tab, and when the bar runs short the tabs shrink together down to
 * a minimum before the strip starts to scroll. The body owns its own
 * scrollports. Trailing actions follow the shrinkable tab scrollport, staying
 * beside short strips and remaining visible while long ones scroll.
 *
 * It renders exactly one body — whatever the owner passes as `children` for the
 * active tab — so switching tabs is the owner's state change, not a hidden
 * mount of every tab at once.
 *
 * An overlaid bar floats over the body, which keeps the bar's height clear as
 * top padding. Hiding that bar zeroes the padding, so a pane with one document
 * gives it the full height, and the body's scrollports are scrolled by the
 * same amount so nothing they show moves.
 */
export function TabbedPane(props: TabbedPaneProps) {
    const [local, rest] = partitionComponentProps(props, [
        "actions",
        "activeId",
        "barHidden",
        "barOverlay",
        "children",
        "className",
        "closeLabel",
        "closeQuestion",
        "closeShortcut",
        "closePresentation",
        "closeRevealedId",
        "onClose",
        "onDoubleClick",
        "onIntent",
        "onReorder",
        "onSelect",
        "onTabMenuSelect",
        "onTransfer",
        "overflowFade",
        "size",
        "style",
        "tabMenuItems",
        "tabs",
        "tabSizing",
        "trailing",
        "transferTargets",
        "transferable",
    ]);
    const scroller = useRef<HTMLDivElement>(null);
    const [overflowStart, setOverflowStart] = useState(false);
    const [overflowEnd, setOverflowEnd] = useState(false);
    const measureOverflow = (viewport: HTMLElement) => {
        setOverflowStart(viewport.scrollLeft > 1);
        setOverflowEnd(viewport.scrollWidth - viewport.clientWidth - viewport.scrollLeft > 1);
    };
    // eslint-disable-next-line happy-react/no-layout-effect -- activation must reveal the committed tab before paint by moving its horizontal browser scrollport; depending only on activeId preserves a deliberate manual scroll until another tab is activated
    useLayoutEffect(() => {
        const viewport = scroller.current;
        const active = viewport?.querySelector<HTMLElement>(
            '[data-happy-desktop-ui="tab"][aria-selected="true"]',
        );
        if (!viewport || !active) return;
        const viewportBounds = viewport.getBoundingClientRect();
        const activeBounds = active.getBoundingClientRect();
        let left = viewport.scrollLeft;
        if (local.tabSizing === "content" && activeBounds.width > viewportBounds.width) {
            // A full title may exceed the viewport. Start at its leading edge
            // so the name remains identifiable while the reader scrolls it.
            left += activeBounds.left - viewportBounds.left;
        } else if (activeBounds.right > viewportBounds.right) {
            // A newly appended tab lands against the trailing edge, like the
            // document and terminal strips in desktop editors.
            left += activeBounds.right - viewportBounds.right;
        } else if (activeBounds.left < viewportBounds.left) {
            left -= viewportBounds.left - activeBounds.left;
        } else {
            return;
        }
        viewport.scrollTo({ behavior: "auto", left });
    }, [local.activeId, local.tabSizing]);
    return (
        <div
            {...rest}
            className={["happy-tabbed-pane", local.className].filter(Boolean).join(" ")}
            data-bar-hidden={local.barHidden ? "" : undefined}
            data-bar-overlay={local.barOverlay ? "" : undefined}
            data-happy-desktop-ui="tabbed-pane"
            data-size={local.size ?? "small"}
            data-tab-sizing={local.tabSizing ?? "equal"}
            style={local.style}
        >
            <div className="happy-tabbed-pane__bar" data-happy-desktop-ui="tabbed-pane-bar">
                <div
                    className="happy-tabbed-pane__scroller"
                    data-fade-end={local.overflowFade && overflowEnd ? "" : undefined}
                    data-fade-start={local.overflowFade && overflowStart ? "" : undefined}
                    data-happy-desktop-ui="tabbed-pane-scroller"
                    // The strip only scrolls sideways, and a mouse wheel only
                    // turns one way: without this, tabs past the edge are out of
                    // reach for anyone without a trackpad. A wheel that already
                    // turns sideways is left to the browser.
                    onWheel={(event) => {
                        if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
                        event.currentTarget.scrollLeft += event.deltaY;
                    }}
                    onScroll={
                        local.overflowFade
                            ? (event) => measureOverflow(event.currentTarget)
                            : undefined
                    }
                    ref={(node) => {
                        scroller.current = node;
                        if (!node || !local.overflowFade) return;
                        measureOverflow(node);
                        // The viewport and natural strip widths can change
                        // independently as panes resize or tab titles arrive.
                        const observer = new ResizeObserver(() => measureOverflow(node));
                        observer.observe(node);
                        if (node.firstElementChild) observer.observe(node.firstElementChild);
                        return () => observer.disconnect();
                    }}
                >
                    {/* The strip is only as wide as the tabs. The action follows
                        this shrinkable scrollport outside its clip, so it stays
                        beside short strips and reachable beside long ones. */}
                    <div
                        className="happy-tabbed-pane__strip"
                        data-happy-desktop-ui="tabbed-pane-strip"
                    >
                        <Tabs
                            activeId={local.activeId}
                            className="happy-tabbed-pane__tabs"
                            closeLabel={local.closeLabel}
                            closeQuestion={local.closeQuestion}
                            closeShortcut={local.closeShortcut}
                            closePresentation={local.closePresentation}
                            closeRevealedId={local.closeRevealedId}
                            onClose={local.onClose}
                            onDoubleClick={local.onDoubleClick}
                            onIntent={local.onIntent}
                            onReorder={local.onReorder}
                            onSelect={local.onSelect}
                            onTabMenuSelect={local.onTabMenuSelect}
                            onTransfer={local.onTransfer}
                            size={local.size ?? "small"}
                            tabMenuItems={local.tabMenuItems}
                            tabs={local.tabs}
                            transferTargets={local.transferTargets}
                            transferable={local.transferable}
                        />
                    </div>
                </div>
                {local.actions ? (
                    <div
                        className="happy-tabbed-pane__actions"
                        data-happy-desktop-ui="tabbed-pane-actions"
                    >
                        {local.actions}
                    </div>
                ) : null}
                {local.trailing ? (
                    <div
                        className="happy-tabbed-pane__trailing"
                        data-happy-desktop-ui="tabbed-pane-trailing"
                    >
                        {local.trailing}
                    </div>
                ) : null}
            </div>
            <TabbedPaneBody
                activeId={local.activeId}
                insetHidden={local.barOverlay ? local.barHidden : undefined}
            >
                {local.children}
            </TabbedPaneBody>
        </div>
    );
}
