import { partitionComponentProps } from "./componentProps";
import {
    useCallback,
    useContext,
    useLayoutEffect,
    useRef,
    useState,
    type CSSProperties,
    type HTMLAttributes,
    type ReactNode,
} from "react";
import { KeyCap } from "./Badge";
import { Icon } from "./Icon";
import { LinkContextMenu } from "./LinkContextMenu";
import {
    commandModifier,
    commandModifierHeld,
    commandShortcut,
    commandShortcutMatches,
    windowShortcutBlocked,
} from "./keyboardShortcut";
import { Tooltip } from "./Tooltip";
import { WindowOverlayHostContext } from "./WindowOverlay";
export type AppShellProps = Omit<HTMLAttributes<HTMLDivElement>, "style"> & {
    children: ReactNode;
    /**
     * Fills a region owned by another AppShell instead of imposing the desktop
     * window's minimum size. This lets a product surface own its workspace and
     * inspector while the outer window keeps navigation chrome mounted.
     */
    embedded?: boolean;
    panel?: ReactNode;
    panelWidth?: number;
    /** One persistent header control at the window's right edge. */
    panelToggleAction?: { open: boolean; onClick: () => void };
    /** Optional 64px feature rail. When omitted the content spans the full body. */
    rail?: ReactNode;
    sidebar?: ReactNode;
    style?: CSSProperties;
    titleBar?: ReactNode;
    /** Enables native macOS traffic-light spacing and draggable desktop header chrome. */
    windowControls?: boolean;
    /**
     * The window is in macOS full screen, where the traffic lights are gone. The
     * chrome inset closes with them — the sidebar toggle returns to the window's
     * left edge and the headings beside it follow — while the drag lanes stay put.
     * No CSS media query reports this, so the desktop shell supplies it.
     */
    windowFullScreen?: boolean;
    /**
     * The host draws macOS traffic lights over the window's top-left corner.
     * Only then is a lane held for them; full screen hides them regardless.
     * Defaults to true; a host on Windows or Linux passes false, so the
     * sidebar toggle and headings sit at the window's ordinary 12px inset.
     */
    windowTrafficLights?: boolean;
    /** Compact, shared title/tab band, with sidebar controls at its leading edge. */
    navigationChrome?: "integrated";
    /** Create control beside the sidebar toggle in the integrated header. */
    sidebarCollapsedAction?: { label: string; onClick: () => void };
    /**
     * The open sidebar draws its own Create row, so the header keeps its create
     * control only while the sidebar is hidden: one Create on screen, never two.
     */
    sidebarOwnsCreate?: boolean;
    /** Integrated controls occupy the header only when navigation is collapsed. */
    sidebarCollapsedLayout?: "lane" | "overlay";
    /**
     * A connection rail stands between the window's left edge and this shell,
     * holding most of the traffic lights' lane itself. The chrome inset closes
     * as in full screen, but in a window the lights still reach past the rail,
     * so the sidebar heading starts where their safe area ends.
     */
    connectionRail?: boolean;
    /**
     * Enables the left sidebar show/hide toggle and pointer/keyboard resize. When
     * omitted the sidebar keeps its fixed `clamp(250px, 30vw, 360px)` contract and
     * renders no interaction chrome, so existing callers are unaffected.
     */
    sidebarCollapsible?: boolean;
    /**
     * Initial sidebar width (clamped). A fixed sidebar given one keeps that
     * width instead of the standalone clamp.
     */
    sidebarDefaultWidth?: number;
    /** Reports each resize of a collapsible sidebar. */
    onSidebarWidthChange?: (width: number) => void;
    sidebarMinWidth?: number;
    sidebarMaxWidth?: number;
    /** Start collapsed. The sidebar DOM stays mounted; only its box is hidden. */
    sidebarDefaultCollapsed?: boolean;
    /**
     * Controlled collapse: the caller owns whether the sidebar is folded away
     * and hears every request to change it — the toggle, the reveal control,
     * and Command-B all go through `onSidebarCollapsedChange`. Omit it and
     * AppShell keeps the fold itself, seeded by `sidebarDefaultCollapsed`.
     */
    sidebarCollapsed?: boolean;
    onSidebarCollapsedChange?: (collapsed: boolean) => void;
    /**
     * The narrowest the workspace may be beside the panel, in CSS pixels, so
     * after zoom. Where the window cannot hold both at their minimums the
     * panel takes the workspace's width, laid over it rather than squeezing
     * it: the workspace keeps its layout, draft, and scroll underneath, and
     * closing the panel brings it back as it was.
     */
    workspaceReadableWidth?: number;
    sidebarCollapseLabel?: string;
    sidebarExpandLabel?: string;
    sidebarResizeLabel?: string;
    /**
     * Renders Command-key discovery for this window. `interactive` holds
     * Command for 500ms to reveal descendant hints and binds Command-B;
     * `display` renders the same caps for a deterministic fixture whose
     * ancestor supplies `data-shortcut-hints`.
     */
    shortcutHints?: "display" | "interactive";
    /**
     * A card shown in the middle of the window for as long as Command is held —
     * what the reader could do next, on the same gesture that reveals the caps.
     * It rides the existing hold: the same 500ms, the same boolean, the same
     * exits, and no listener or timer of its own.
     *
     * The layer is pointer-transparent and decorative. Anything modal here —
     * `role="dialog"`, `role="menu"`, a ModalOverlay — would read as a modal to
     * `windowShortcutBlocked()` and switch off the held-Command detection that
     * put it on screen. Pass `QuickActionsCard`, not a Modal.
     */
    shortcutHintsSurface?: ReactNode;
    /**
     * Enables pointer/keyboard resize of the right inspector panel. When omitted the
     * panel keeps its existing `panelWidth`/clamp contract and renders no handle.
     */
    panelResizable?: boolean;
    /** Initial panel width (clamped) once `panelResizable` is set; falls back to `panelWidth`. */
    panelDefaultWidth?: number;
    /**
     * Reports the settled width after a pointer drag or keyboard resize step.
     *
     * Supplying `panelWidth` alongside `panelResizable` hands the width to the
     * caller: the shell stops tracking it and only reports intent here. That is
     * what lets a
     * host keep a width per checkout, because a width the shell owned could only
     * ever be seeded once and would then follow the reader from project to
     * project. Without `panelWidth` the shell keeps owning it and this is simply
     * a notification.
     */
    onPanelWidthChange?: (width: number) => void;
    panelMinWidth?: number;
    panelMaxWidth?: number;
    /**
     * Optional content pinned to the bottom of the panel column, below the panel
     * body. Used to keep a composer/input usable while the panel body (e.g. a live
     * trace) fills the column. Rendering it does not affect the panel body's
     * identity, so the body stays mounted as the footer mounts/unmounts.
     */
    panelFooter?: ReactNode;
    /**
     * Lifts `panelFooter` out of the panel column's flow and floats it over the
     * bottom of the panel body. The body then keeps its full height as the footer
     * appears and disappears, so a scrolled position, a terminal's last lines, and
     * any measurement underneath survive it. The footer content owns its own
     * gradient and pointer-transparent regions.
     */
    panelFooterFloating?: boolean;
    panelResizeLabel?: string;
    /** Reports pointer or DOM-focus ownership for this exact shell instance. */
    onFocusedPaneChange?: (pane: AppShellFocusedPane) => void;
};
export type AppShellFocusedPane = "workspace" | "panel";
const SIDEBAR_DEFAULT_WIDTH = 288;
export const APP_SHELL_SIDEBAR_DEFAULT_WIDTH = SIDEBAR_DEFAULT_WIDTH;
const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 480;
const PANEL_DEFAULT_WIDTH = 340;
/**
 * The panel's width where nobody has chosen one. Exported so a host that
 * remembers the width per checkout can offer this for a checkout that has never
 * been sized, instead of restating the number and drifting from it.
 */
export const APP_SHELL_PANEL_DEFAULT_WIDTH = PANEL_DEFAULT_WIDTH;
const PANEL_MIN_WIDTH = 280;
/**
 * How much of the window the panel may take, and the cap where the window's
 * width cannot be read.
 *
 * The panel holds a terminal, a file, and a composer, so on a wide display it
 * is often the side being worked in — a fixed few hundred pixels made that
 * impossible. A fraction rather than a number keeps the workspace column a real
 * column at every size: the remaining 30% is what stops a panel dragged to the
 * end from swallowing the transcript beside it.
 *
 * It is read at render, and a drag re-renders on every step, so the bound
 * follows a window being resized without this component watching for it.
 */
const PANEL_MAX_FRACTION = 0.7;
const PANEL_MAX_WIDTH = 560;
function panelShareOf(): number {
    const viewport = typeof window === "undefined" ? 0 : window.innerWidth;
    if (!(viewport > 0)) return PANEL_MAX_WIDTH;
    return Math.max(PANEL_MIN_WIDTH, Math.round(viewport * PANEL_MAX_FRACTION));
}
const FIXED_SIDEBAR_MIN_WIDTH = 250;
const REVEAL_WIDTH = 48;
const RAIL_WIDTH = 64;
/**
 * The workspace remaining at Happy's 720px desktop minimum after the 64px rail
 * and two 250px side lanes. The same number app-shell.css states.
 */
const WORKSPACE_MIN_WIDTH = 140;
/**
 * How wide one side lane may grow: never past the room left once the rail, the
 * lane opposite, and the workspace's own floor have taken theirs.
 *
 * Without this bound a lane's cap answered only to the window — the panel's was
 * a share of the viewport — and two lanes could each be within their own cap
 * while together asking for more than the window had. Flex then took the
 * difference out of whichever region would yield, and since the content region
 * clips, the far lane was simply cut off by the window edge instead of the
 * middle refusing to shrink. A lane cannot be sized against the window alone;
 * it has to be sized against what is left of it.
 */
function laneMaxWidthOf(
    cap: number,
    min: number,
    occupied: number,
    workspaceMin = WORKSPACE_MIN_WIDTH,
): number {
    const viewport = typeof window === "undefined" ? 0 : window.innerWidth;
    if (!(viewport > 0)) return cap;
    return Math.max(min, Math.min(cap, viewport - occupied - workspaceMin));
}
const SHORTCUT_HINT_DELAY_MS = 500;
const SIDEBAR_SHORTCUT = commandShortcut("b");
/**
 * The chord this shell folds its sidebar on. Exported so a surface that offers
 * the same fold elsewhere — the command palette's row — shows the cap the shell
 * actually answers to rather than a copy of it.
 */
export const APP_SHELL_SIDEBAR_SHORTCUT = SIDEBAR_SHORTCUT;
export const APP_SHELL_RESIZE_LAYOUT_EVENT = "happy-app-shell-resize-layout";
function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}
/**
 * A vertical drag divider. It is the ARIA `separator` that owns the adjacent
 * region's width: pointer drags use pointer capture (no window listeners), and
 * Arrow/Home/End keys nudge the boundary. `edge` names which side of the region
 * the handle sits on, so the same math grows the sidebar (handle on its right)
 * and the panel (handle on its left). All resize state is local UI state; the
 * caller receives only clamped width values through `onResize`.
 */
function ResizeHandle(props: {
    edge: "left" | "right";
    label: string;
    max: number;
    min: number;
    onResize: (next: number) => void;
    onResizeEnd?: (next: number) => void;
    step?: number;
    value: number;
}) {
    const drag = useRef<{ latestWidth: number; pointerX: number; width: number } | null>(null);
    const sign = props.edge === "right" ? 1 : -1;
    const step = props.step ?? 16;
    function nextWidth(width: number) {
        return clamp(Math.round(width), props.min, props.max);
    }
    function apply(width: number, settled: boolean) {
        const next = nextWidth(width);
        props.onResize(next);
        if (settled) props.onResizeEnd?.(next);
    }
    function finishDrag() {
        const current = drag.current;
        if (!current) return;
        drag.current = null;
        props.onResizeEnd?.(current.latestWidth);
    }
    return (
        <div
            aria-label={props.label}
            aria-orientation="vertical"
            aria-valuemax={props.max}
            aria-valuemin={props.min}
            aria-valuenow={Math.round(props.value)}
            className="happy-desktop-app-shell__resize-handle"
            data-edge={props.edge}
            data-happy-desktop-ui="app-shell-resize-handle"
            onKeyDown={(event) => {
                const keyDelta =
                    event.key === "ArrowRight"
                        ? step
                        : event.key === "ArrowLeft"
                          ? -step
                          : undefined;
                if (keyDelta !== undefined) {
                    event.preventDefault();
                    apply(props.value + sign * keyDelta, true);
                } else if (event.key === "Home") {
                    event.preventDefault();
                    apply(props.edge === "right" ? props.min : props.max, true);
                } else if (event.key === "End") {
                    event.preventDefault();
                    apply(props.edge === "right" ? props.max : props.min, true);
                }
            }}
            onLostPointerCapture={() => {
                finishDrag();
            }}
            onPointerCancel={() => {
                finishDrag();
            }}
            onPointerDown={(event) => {
                event.preventDefault();
                drag.current = {
                    latestWidth: props.value,
                    pointerX: event.clientX,
                    width: props.value,
                };
                try {
                    event.currentTarget.setPointerCapture(event.pointerId);
                } catch {
                    // Synthetic or already-released pointers cannot be captured; the
                    // move handler still works when events target this element.
                }
            }}
            onPointerMove={(event) => {
                const start = drag.current;
                if (!start) return;
                const next = nextWidth(start.width + sign * (event.clientX - start.pointerX));
                start.latestWidth = next;
                props.onResize(next);
            }}
            onPointerUp={(event) => {
                finishDrag();
                try {
                    event.currentTarget.releasePointerCapture(event.pointerId);
                } catch {
                    // Capture may already be lost; clearing drag state above is enough.
                }
            }}
            role="separator"
            // A focusable window splitter is an intentionally interactive separator
            // (WAI-ARIA window-splitter pattern): it must take keyboard focus so the
            // Arrow/Home/End resize keys above are reachable without a pointer.
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable resize separator
            tabIndex={0}
        >
            <span
                className="happy-desktop-app-shell__resize-line"
                data-happy-desktop-ui="app-shell-resize-line"
            />
        </div>
    );
}
/*
 * Window composition for the Happy desktop app. An optional title bar row,
 * then rail | navigation | workspace and an optional right inspector. Every
 * region meets on a hairline so the desktop feels like one native surface.
 *
 * The sidebar collapse/resize and the panel resize are narrowly scoped local UI
 * interactions owned here so application code stays props-only. Every region
 * stays mounted across them so focus, scroll, and any in-flight content survive.
 */
export function AppShell(props: AppShellProps) {
    const shell = useRef<HTMLDivElement>(null);
    const [linkMenu, setLinkMenu] = useState<{ x: number; y: number; href: string }>();
    const lastFocus = useRef<HTMLElement | null>(null);
    const takeoverFocus = useRef<{ element: HTMLElement | null } | undefined>(undefined);
    const [panelNode, setPanelNode] = useState<HTMLElement | null>(null);
    const [focusedPaneOwner, setFocusedPaneOwner] = useState<HTMLElement | null>(null);
    // The overlay lane below, held as state rather than in a ref because the
    // surfaces that portal into it render from this shell's own subtree and
    // must be told once the node they hang from exists.
    const [overlayHost, setOverlayHost] = useState<HTMLDivElement | null>(null);
    // A surface that covers the window belongs to the window. An embedded shell
    // owns only a workspace inside another one, so it hands the lane it was
    // given straight on rather than opening one of its own.
    const outerOverlayHost = useContext(WindowOverlayHostContext);
    const [local, rest] = partitionComponentProps(props, [
        "children",
        "className",
        "embedded",
        "panel",
        "panelWidth",
        "panelToggleAction",
        "rail",
        "sidebar",
        "style",
        "titleBar",
        "windowControls",
        "windowFullScreen",
        "windowTrafficLights",
        "navigationChrome",
        "sidebarCollapsedAction",
        "sidebarOwnsCreate",
        "sidebarCollapsedLayout",
        "connectionRail",
        "sidebarCollapsible",
        "sidebarDefaultWidth",
        "onSidebarWidthChange",
        "sidebarMinWidth",
        "sidebarMaxWidth",
        "sidebarDefaultCollapsed",
        "sidebarCollapsed",
        "onSidebarCollapsedChange",
        "sidebarCollapseLabel",
        "workspaceReadableWidth",
        "sidebarExpandLabel",
        "sidebarResizeLabel",
        "shortcutHints",
        "shortcutHintsSurface",
        "panelResizable",
        "onPanelWidthChange",
        "panelDefaultWidth",
        "panelMinWidth",
        "panelMaxWidth",
        "panelFooter",
        "panelFooterFloating",
        "panelResizeLabel",
        "onFocusedPaneChange",
    ]);
    const onFocusedPaneChange = local.onFocusedPaneChange;
    const workspaceReadableWidth = local.workspaceReadableWidth;
    // Ref identity is a measured lifetime contract: a changed callback ref is
    // cleared on every render, while this reset must mean the panel itself left.
    const panelRef = useCallback(
        (node: HTMLElement | null): void => {
            setPanelNode(node);
            if (node === null) onFocusedPaneChange?.("workspace");
        },
        [onFocusedPaneChange],
    );
    const [contentWidth, setContentWidth] = useState(0);
    // The region the workspace and panel share, measured so the panel can tell
    // when the two no longer fit side by side. React Compiler keeps this
    // callback's identity, so the observer lives as long as the node.
    const contentRef = (node: HTMLDivElement | null) => {
        if (node === null) return;
        const observer = new ResizeObserver(([entry]) => {
            if (entry) setContentWidth(Math.round(entry.contentRect.width));
        });
        observer.observe(node);
        return () => observer.disconnect();
    };
    const sidebarMin = local.sidebarMinWidth ?? SIDEBAR_MIN_WIDTH;
    const workspaceMin = workspaceReadableWidth ?? WORKSPACE_MIN_WIDTH;
    const panelMin = local.panelMinWidth ?? PANEL_MIN_WIDTH;
    // The caps a lane answers to on its own. What is actually left for it is
    // worked out below, once the lane opposite has a width to be measured by.
    const sidebarCap = local.sidebarMaxWidth ?? SIDEBAR_MAX_WIDTH;
    const panelCap = local.panelMaxWidth ?? panelShareOf();
    const [sidebarCollapsedLocal, setSidebarCollapsedLocal] = useState(
        local.sidebarDefaultCollapsed ?? false,
    );
    const sidebarCollapsedControlled = local.sidebarCollapsed !== undefined;
    const sidebarCollapsed = local.sidebarCollapsed ?? sidebarCollapsedLocal;
    const onSidebarCollapsedChange = local.onSidebarCollapsedChange;
    const setSidebarCollapsed = (collapsed: boolean) => {
        if (!sidebarCollapsedControlled) setSidebarCollapsedLocal(collapsed);
        onSidebarCollapsedChange?.(collapsed);
    };
    const [sidebarWidth, setSidebarWidth] = useState(() =>
        clamp(local.sidebarDefaultWidth ?? SIDEBAR_DEFAULT_WIDTH, sidebarMin, sidebarCap),
    );
    const [panelWidthState, setPanelWidthState] = useState(() =>
        clamp(
            local.panelDefaultWidth ?? local.panelWidth ?? PANEL_DEFAULT_WIDTH,
            panelMin,
            panelCap,
        ),
    );
    const [panelDragWidth, setPanelDragWidth] = useState<number>();
    /*
     * What each lane may grow to, given the other. A lane's own cap is only half
     * the answer: the two share one window with the rail and the workspace, so
     * each is measured against the room the rest of them leave.
     *
     * A caller who named a maximum meant it and keeps it. A collapsed sidebar
     * occupies its reveal lane rather than its width, and an absent lane
     * occupies nothing, so folding one away really does hand its room to the
     * other instead of merely appearing to.
     */
    const railFootprint = local.rail ? RAIL_WIDTH : 0;
    const sidebarOccupied = !local.sidebar
        ? 0
        : local.sidebarCollapsible === true && sidebarCollapsed
          ? local.sidebarCollapsedLayout === "overlay"
              ? 0
              : REVEAL_WIDTH
          : sidebarWidth;
    const panelOccupied = local.panel === undefined || local.panel === null ? 0 : panelWidthState;
    const sidebarMax =
        local.sidebarMaxWidth ??
        laneMaxWidthOf(sidebarCap, sidebarMin, railFootprint + panelOccupied);
    const panelMax =
        local.panelMaxWidth ??
        laneMaxWidthOf(panelCap, panelMin, railFootprint + sidebarOccupied, workspaceMin);
    const [shortcutHintsHeld, setShortcutHintsHeld] = useState(false);
    const sidebarInteractive = local.sidebarCollapsible === true;
    const sidebarSized = sidebarInteractive || local.sidebarDefaultWidth !== undefined;
    const shortcutHintsEnabled = local.shortcutHints !== undefined;
    const shortcutHintsInteractive = local.shortcutHints === "interactive";
    const shortcutHintsVisible = shortcutHintsInteractive && shortcutHintsHeld;
    // eslint-disable-next-line happy-react/no-layout-effect -- modifier discovery and a window-wide sidebar chord must work regardless of which descendant control owns focus
    useLayoutEffect(() => {
        if (!shortcutHintsInteractive) return;
        let shortcutTimer: number | undefined;
        const pressedCommandKeys = new Set<string>();
        const timerClear = () => {
            if (shortcutTimer !== undefined) window.clearTimeout(shortcutTimer);
            shortcutTimer = undefined;
        };
        const hintsHide = () => {
            timerClear();
            pressedCommandKeys.clear();
            setShortcutHintsHeld(false);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === commandModifier) {
                if (
                    windowShortcutBlocked() ||
                    event.defaultPrevented ||
                    event.isComposing ||
                    event.keyCode === 229 ||
                    event.altKey ||
                    (commandModifier === "Meta" ? event.ctrlKey : event.metaKey) ||
                    event.shiftKey
                )
                    return;
                const code = event.code || commandModifier;
                if (pressedCommandKeys.has(code)) return;
                pressedCommandKeys.add(code);
                if (shortcutTimer !== undefined) return;
                shortcutTimer = window.setTimeout(() => {
                    shortcutTimer = undefined;
                    if (pressedCommandKeys.size > 0 && !windowShortcutBlocked())
                        setShortcutHintsHeld(true);
                }, SHORTCUT_HINT_DELAY_MS);
                return;
            }
            // Once a command chord is chosen, discovery has done its job. Hide
            // immediately and cancel a nearly-finished timer so hints cannot
            // flash up just after the action runs.
            if (commandModifierHeld(event)) hintsHide();
            if (
                !sidebarInteractive ||
                !commandShortcutMatches(event, SIDEBAR_SHORTCUT) ||
                windowShortcutBlocked()
            )
                return;
            event.preventDefault();
            if (!sidebarCollapsedControlled) setSidebarCollapsedLocal(!sidebarCollapsed);
            onSidebarCollapsedChange?.(!sidebarCollapsed);
        };
        const onKeyUp = (event: KeyboardEvent) => {
            if (event.key !== commandModifier) return;
            pressedCommandKeys.delete(event.code || commandModifier);
            if (pressedCommandKeys.size === 0) hintsHide();
        };
        const onVisibilityChange = () => {
            if (document.visibilityState !== "visible") hintsHide();
        };
        const onPointerDown = () => {
            if (pressedCommandKeys.size > 0) hintsHide();
        };
        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("keyup", onKeyUp);
        window.addEventListener("blur", hintsHide);
        window.addEventListener("pointerdown", onPointerDown);
        document.addEventListener("visibilitychange", onVisibilityChange);
        return () => {
            timerClear();
            pressedCommandKeys.clear();
            setShortcutHintsHeld(false);
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("keyup", onKeyUp);
            window.removeEventListener("blur", hintsHide);
            window.removeEventListener("pointerdown", onPointerDown);
            document.removeEventListener("visibilitychange", onVisibilityChange);
        };
    }, [
        onSidebarCollapsedChange,
        shortcutHintsInteractive,
        sidebarCollapsed,
        sidebarCollapsedControlled,
        sidebarInteractive,
    ]);
    const panelResizable = local.panelResizable === true;
    // Controlled when a resizable panel is given a width; otherwise AppShell owns it.
    const panelWidthControlled = panelResizable && local.panelWidth !== undefined;
    const panelWidthBase = panelWidthControlled
        ? clamp(local.panelWidth!, panelMin, panelMax)
        : panelWidthState;
    const panelWidth = panelWidthControlled ? (panelDragWidth ?? panelWidthBase) : panelWidthState;
    const panelPresent = local.panel !== undefined && local.panel !== null;
    // Nothing in the shell animates: a panel is there or it is not.
    const panelTakeover =
        panelPresent &&
        workspaceReadableWidth !== undefined &&
        contentWidth > 0 &&
        contentWidth < sidebarOccupied + panelMin + workspaceReadableWidth;
    // eslint-disable-next-line happy-react/no-layout-effect -- takeover changes real browser focus after inert commits; the prior focused node is recorded by focus events before that commit so the mounted draft and selection can be restored
    useLayoutEffect(() => {
        if (panelTakeover) {
            takeoverFocus.current ??= { element: lastFocus.current };
            if (panelNode && !panelNode.contains(document.activeElement)) {
                const control = Array.from(
                    panelNode.querySelectorAll<HTMLElement>(
                        'button:not([disabled]), input:not([disabled], [type="hidden"]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
                    ),
                ).find((element) => element.checkVisibility() && !element.closest("[inert]"));
                (control ?? panelNode).focus({ preventScroll: true });
            }
            return;
        }
        const restore = takeoverFocus.current?.element;
        takeoverFocus.current = undefined;
        if (restore?.isConnected && !restore.closest("[inert]"))
            restore.focus({ preventScroll: true });
    }, [panelTakeover, panelNode]);
    const focusedPane: AppShellFocusedPane =
        panelPresent && panelNode !== null && focusedPaneOwner === panelNode
            ? "panel"
            : "workspace";
    const paneFocusRead = (current: HTMLElement, target: EventTarget | null): void => {
        if (!(target instanceof Element)) return;
        // Resizing the boundary changes geometry, not keyboard ownership.
        if (target.closest('[data-happy-desktop-ui="app-shell-resize-handle"]')) return;
        const pane = target.closest<HTMLElement>("[data-app-shell-pane]");
        if (pane?.closest('[data-happy-desktop-ui="app-shell"]') !== current) return;
        if (pane.dataset.appShellPane === "panel") {
            setFocusedPaneOwner(pane);
            onFocusedPaneChange?.("panel");
        } else if (pane.dataset.appShellPane === "workspace") {
            setFocusedPaneOwner(null);
            onFocusedPaneChange?.("workspace");
        }
    };
    // eslint-disable-next-line happy-react/no-layout-effect -- live splitter geometry commits before paint; descendants use this scoped event to keep their own visual anchors in the same frame
    useLayoutEffect(() => {
        shell.current?.dispatchEvent(new Event(APP_SHELL_RESIZE_LAYOUT_EVENT, { bubbles: true }));
    }, [panelPresent, panelWidth, sidebarCollapsed, sidebarWidth]);
    function previewPanelWidth(next: number) {
        if (panelWidthControlled) setPanelDragWidth(next);
        else setPanelWidthState(next);
    }
    function settlePanelWidth(next: number) {
        local.onPanelWidthChange?.(next);
        setPanelDragWidth(undefined);
    }
    const showSidebarHandle = sidebarInteractive && !sidebarCollapsed;
    // A travelling fold closes the sidebar to nothing rather than taking it
    // out of layout, so its width can carry the toggle along.
    const sidebarFolded =
        local.navigationChrome === "integrated" &&
        local.sidebarCollapsedLayout === "overlay" &&
        sidebarInteractive &&
        sidebarCollapsed;
    const sidebarStyle: CSSProperties | undefined = sidebarFolded
        ? { width: "0px", minWidth: "0px", maxWidth: `${sidebarMax}px` }
        : sidebarSized
          ? {
                width: `${sidebarWidth}px`,
                minWidth: `${sidebarMin}px`,
                maxWidth: `${sidebarMax}px`,
            }
          : undefined;
    const panelMinCss = `calc(${String(panelMin)}px + var(--happy-desktop-app-shell-caption-inset, 0px))`;
    const panelStyle: CSSProperties | undefined = panelResizable
        ? {
              width: `${panelWidth}px`,
              // Native caption buttons drawn over the panel's top-right corner
              // (a Windows title-bar overlay; zero elsewhere) widen its floor
              // rather than eat its tab strip, so its tabs keep their room.
              minWidth: panelMinCss,
              // Where the bound is this component's own it is also stated in
              // viewport units, which the browser keeps current: a window
              // shrunk between renders narrows the panel with it rather than
              // waiting for the next one. Both halves of the bound are here —
              // the panel's share of the window, and the room left once the
              // rail, the sidebar, and the workspace's floor have theirs — so
              // a live resize cannot cross the second one either. A caller
              // that named a width means that width.
              maxWidth:
                  local.panelMaxWidth === undefined
                      ? `min(${panelMax}px, ${String(PANEL_MAX_FRACTION * 100)}vw, calc(100vw - ${String(railFootprint + sidebarOccupied + workspaceMin)}px))`
                      : `${panelMax}px`,
          }
        : local.panelWidth === undefined
          ? undefined
          : { width: `${local.panelWidth}px` };
    // The width the panel's box resolves to, which its contents hold while
    // the box opens or closes around them.
    const panelEdge = panelResizable
        ? `clamp(${panelMinCss}, ${String(panelWidth)}px, ${String(panelStyle?.maxWidth ?? `${String(panelMax)}px`)})`
        : `${String(local.panelWidth ?? PANEL_DEFAULT_WIDTH)}px`;
    const sidebarHidden = sidebarInteractive && sidebarCollapsed;
    // The integrated header owns its controls across both sidebar states.
    const sidebarTravel =
        local.navigationChrome === "integrated" &&
        sidebarInteractive &&
        local.sidebarCollapsedLayout === "overlay";
    // Under native window controls a collapsed sidebar leaves no lane behind: the
    // reveal control floats beside the traffic lights, exactly where the collapse
    // control sat, and the workspace takes the whole width.
    const revealFloating =
        sidebarHidden && local.windowControls === true && local.navigationChrome !== "integrated";
    const sidebarLayoutMin = !local.sidebar
        ? 0
        : revealFloating || (sidebarHidden && local.sidebarCollapsedLayout === "overlay")
          ? 0
          : sidebarHidden
            ? REVEAL_WIDTH
            : sidebarSized
              ? sidebarMin
              : FIXED_SIDEBAR_MIN_WIDTH;
    const revealButton = sidebarHidden ? (
        <button
            aria-label={local.sidebarExpandLabel ?? "Show sidebar"}
            aria-keyshortcuts={shortcutHintsInteractive ? SIDEBAR_SHORTCUT.aria : undefined}
            className="happy-desktop-app-shell__reveal-button"
            data-floating={revealFloating ? "" : undefined}
            data-happy-desktop-ui="app-shell-reveal-button"
            data-shortcut-hint={shortcutHintsEnabled ? "" : undefined}
            onClick={() => setSidebarCollapsed(false)}
            type="button"
        >
            {/* 16, not the 14 of a bare affordance: this glyph answers the
                sidebar's own 16px row icons across the divider, and an outline
                fills only 14 of its 16 box, so a 14 box would set 12.25px of
                ink beside 14px of ink. */}
            <Icon name="sidebar-expand" size={16} />
            {shortcutHintsEnabled ? (
                <KeyCap
                    className="happy-shortcut-hint--floating"
                    decorative
                    keys={SIDEBAR_SHORTCUT.caps}
                />
            ) : null}
        </button>
    ) : null;
    // Floating, the control is the bare button rather than a lane wrapping it:
    // a wrapper around a control docked over native window chrome is what stops
    // the pointer reaching it, so the collapsed toggle is structurally the same
    // element as the expanded one and only its position differs.
    const reveal = revealFloating ? (
        revealButton
    ) : sidebarHidden ? (
        <div
            className="happy-desktop-app-shell__reveal"
            data-happy-desktop-ui="app-shell-reveal"
            data-window-controls={local.windowControls ? "" : undefined}
        >
            {local.navigationChrome === "integrated" ? (
                <div className="happy-desktop-app-shell__reveal-controls">
                    {revealButton}
                    {local.navigationChrome === "integrated" && local.sidebarCollapsedAction ? (
                        <button
                            aria-label={local.sidebarCollapsedAction.label}
                            className="happy-desktop-app-shell__reveal-button"
                            data-happy-desktop-ui="app-shell-collapsed-action"
                            onClick={local.sidebarCollapsedAction.onClick}
                            type="button"
                        >
                            <Icon name="compose" size={16} />
                        </button>
                    ) : null}
                </div>
            ) : (
                revealButton
            )}
        </div>
    ) : null;
    const sidebarToggleLabel = sidebarHidden
        ? (local.sidebarExpandLabel ?? "Show sidebar")
        : (local.sidebarCollapseLabel ?? "Hide sidebar");
    const sidebarControls = sidebarTravel ? (
        <div
            className="happy-desktop-app-shell__sidebar-controls"
            data-collapsed={sidebarHidden ? "" : undefined}
            data-happy-desktop-ui="app-shell-sidebar-controls"
        >
            {/* Hovered, the toggle says what it does and its chord in one
                bubble hanging from it, never past the window's edge; held
                Command shows the chord alone, under the same button. */}
            <Tooltip
                align="start"
                className="happy-desktop-app-shell__sidebar-tip"
                label={sidebarToggleLabel}
                placement="bottom"
                shortcut={shortcutHintsEnabled ? SIDEBAR_SHORTCUT : undefined}
            >
                <button
                    aria-label={sidebarToggleLabel}
                    aria-keyshortcuts={shortcutHintsInteractive ? SIDEBAR_SHORTCUT.aria : undefined}
                    aria-pressed={!sidebarHidden}
                    className="happy-desktop-app-shell__sidebar-toggle"
                    data-happy-desktop-ui={
                        sidebarHidden ? "app-shell-reveal-button" : "app-shell-sidebar-collapse"
                    }
                    onClick={() => setSidebarCollapsed(!sidebarHidden)}
                    type="button"
                >
                    <Icon name={sidebarHidden ? "sidebar-expand" : "sidebar-collapse"} size={16} />
                    {shortcutHintsEnabled ? (
                        <KeyCap
                            className="happy-shortcut-hint--floating"
                            decorative
                            keys={SIDEBAR_SHORTCUT.caps}
                        />
                    ) : null}
                </button>
            </Tooltip>
            {local.sidebarCollapsedAction && (sidebarHidden || !local.sidebarOwnsCreate) ? (
                <button
                    aria-label={local.sidebarCollapsedAction.label}
                    className="happy-desktop-app-shell__new-work"
                    data-happy-desktop-ui="app-shell-collapsed-action"
                    onClick={local.sidebarCollapsedAction.onClick}
                    type="button"
                >
                    <Icon name="compose" size={16} />
                </button>
            ) : null}
            <span aria-hidden="true" className="happy-desktop-app-shell__sidebar-controls-rule" />
        </div>
    ) : null;
    const sidebarEdge = sidebarHidden ? 0 : clamp(sidebarWidth, sidebarMin, sidebarMax);
    const mainStyle: CSSProperties = {
        minWidth: `${sidebarLayoutMin + WORKSPACE_MIN_WIDTH}px`,
        ...(sidebarTravel
            ? ({
                  "--happy-app-shell-sidebar-edge": `${String(sidebarEdge)}px`,
                  "--happy-app-shell-sidebar-width": `${String(clamp(sidebarWidth, sidebarMin, sidebarMax))}px`,
              } as CSSProperties)
            : {}),
    };
    return (
        <WindowOverlayHostContext.Provider value={local.embedded ? outerOverlayHost : overlayHost}>
            <div
                {...rest}
                className={["happy-desktop-app-shell", local.className].filter(Boolean).join(" ")}
                data-embedded={local.embedded ? "" : undefined}
                data-focused-pane={focusedPane}
                data-happy-desktop-ui="app-shell"
                data-shortcut-hints={shortcutHintsVisible ? "" : undefined}
                data-sidebar-collapsed={sidebarHidden ? "" : undefined}
                data-sidebar-collapsed-layout={local.sidebarCollapsedLayout}
                data-sidebar-travel={sidebarTravel ? "" : undefined}
                data-window-controls={local.windowControls ? "" : undefined}
                data-window-full-screen={local.windowFullScreen ? "" : undefined}
                data-window-traffic-lights={
                    local.windowControls &&
                    !local.windowFullScreen &&
                    local.windowTrafficLights !== false
                        ? ""
                        : undefined
                }
                data-connection-rail={local.connectionRail ? "" : undefined}
                onContextMenu={(event) => {
                    rest.onContextMenu?.(event);
                    if (event.defaultPrevented || !(event.target instanceof Element)) return;
                    const link = event.target.closest("a[href]");
                    const href = link?.getAttribute("href");
                    if (!href) return;
                    event.preventDefault();
                    event.stopPropagation();
                    // Keep the link's own destination: resolving a workspace-relative
                    // file against the renderer URL would invent a different target.
                    setLinkMenu({ x: event.clientX, y: event.clientY, href });
                }}
                data-navigation-chrome={local.navigationChrome}
                data-panel-toggle={local.panelToggleAction ? "" : undefined}
                data-panel-open={panelPresent ? "" : undefined}
                onFocusCapture={(event) => {
                    if (!panelTakeover && event.target instanceof HTMLElement)
                        lastFocus.current = event.target;
                    rest.onFocusCapture?.(event);
                    paneFocusRead(event.currentTarget, event.target);
                }}
                onPointerDownCapture={(event) => {
                    rest.onPointerDownCapture?.(event);
                    paneFocusRead(event.currentTarget, event.target);
                }}
                ref={shell}
                style={local.style}
            >
                {local.windowControls ? (
                    <div
                        aria-hidden="true"
                        className="happy-desktop-app-shell__window-controls"
                        data-happy-desktop-ui="app-shell-window-controls"
                    >
                        <span
                            className="happy-desktop-app-shell__traffic-light-reservation"
                            data-happy-desktop-ui="title-bar-controls"
                        />
                    </div>
                ) : null}
                {local.windowControls && !local.sidebar && !local.titleBar ? (
                    <div
                        aria-hidden="true"
                        className="happy-desktop-app-shell__standalone-title-bar"
                        data-happy-desktop-ui="app-shell-standalone-title-bar"
                    />
                ) : null}
                {local.titleBar ? (
                    <div
                        className="happy-desktop-app-shell__title-bar"
                        data-happy-desktop-ui="app-shell-title-bar"
                    >
                        {local.titleBar}
                    </div>
                ) : null}
                <div
                    className="happy-desktop-app-shell__body"
                    data-happy-desktop-ui="app-shell-body"
                >
                    {local.rail ? (
                        <div
                            className="happy-desktop-app-shell__rail"
                            data-happy-desktop-ui="app-shell-rail"
                        >
                            {local.rail}
                        </div>
                    ) : null}
                    <div
                        className="happy-desktop-app-shell__content"
                        data-happy-desktop-ui="app-shell-content"
                        data-panel-takeover={panelTakeover ? "" : undefined}
                        ref={contentRef}
                    >
                        <main
                            className="happy-desktop-app-shell__main"
                            data-happy-desktop-ui="app-shell-main"
                            style={mainStyle}
                        >
                            {revealFloating || sidebarTravel ? null : reveal}
                            {local.sidebar ? (
                                <div
                                    className="happy-desktop-app-shell__sidebar"
                                    data-collapsed={
                                        sidebarInteractive && sidebarCollapsed ? "" : undefined
                                    }
                                    data-happy-desktop-ui="app-shell-sidebar"
                                    data-resizable={sidebarInteractive ? "" : undefined}
                                    data-travel={sidebarTravel ? "" : undefined}
                                    style={sidebarStyle}
                                >
                                    {local.sidebar}
                                    {sidebarInteractive && !sidebarTravel ? (
                                        <button
                                            aria-label={
                                                local.sidebarCollapseLabel ?? "Hide sidebar"
                                            }
                                            aria-keyshortcuts={
                                                shortcutHintsInteractive
                                                    ? SIDEBAR_SHORTCUT.aria
                                                    : undefined
                                            }
                                            className="happy-desktop-app-shell__sidebar-collapse"
                                            data-happy-desktop-ui="app-shell-sidebar-collapse"
                                            data-shortcut-hint={
                                                shortcutHintsEnabled ? "" : undefined
                                            }
                                            onClick={() => setSidebarCollapsed(true)}
                                            type="button"
                                        >
                                            {/* Matches the reveal control above; see
                                            the note there for why 16. */}
                                            <Icon name="sidebar-collapse" size={16} />
                                            {shortcutHintsEnabled ? (
                                                <KeyCap
                                                    className="happy-shortcut-hint--floating"
                                                    decorative
                                                    keys={SIDEBAR_SHORTCUT.caps}
                                                />
                                            ) : null}
                                        </button>
                                    ) : null}
                                    {showSidebarHandle ? (
                                        <ResizeHandle
                                            edge="right"
                                            label={local.sidebarResizeLabel ?? "Resize sidebar"}
                                            max={sidebarMax}
                                            min={sidebarMin}
                                            onResize={(width) => {
                                                setSidebarWidth(width);
                                                local.onSidebarWidthChange?.(width);
                                            }}
                                            value={sidebarWidth}
                                        />
                                    ) : null}
                                </div>
                            ) : null}
                            <div
                                className="happy-desktop-app-shell__workspace"
                                data-app-shell-pane="workspace"
                                data-happy-desktop-ui="app-shell-workspace"
                                inert={panelTakeover}
                            >
                                {local.children}
                            </div>
                            {/* After the workspace: its tab band is a drag lane,
                                and a later rectangle wins. */}
                            {sidebarControls}
                        </main>
                        {local.panel ? (
                            <aside
                                className="happy-desktop-app-shell__panel"
                                data-app-shell-pane="panel"
                                data-happy-desktop-ui="app-shell-panel"
                                data-resizable={panelResizable ? "" : undefined}
                                ref={panelRef}
                                tabIndex={-1}
                                style={
                                    panelTakeover
                                        ? { left: `${String(sidebarOccupied)}px` }
                                        : ({
                                              ...panelStyle,
                                              "--happy-app-shell-panel-width": panelEdge,
                                          } as CSSProperties)
                                }
                            >
                                {panelResizable ? (
                                    <ResizeHandle
                                        edge="left"
                                        label={local.panelResizeLabel ?? "Resize panel"}
                                        max={panelMax}
                                        min={panelMin}
                                        onResize={previewPanelWidth}
                                        onResizeEnd={settlePanelWidth}
                                        value={panelWidth}
                                    />
                                ) : null}
                                <div
                                    className="happy-desktop-app-shell__panel-content"
                                    data-happy-desktop-ui="app-shell-panel-content"
                                >
                                    {local.panel}
                                </div>
                                {local.panelFooter ? (
                                    <div
                                        className="happy-desktop-app-shell__panel-footer"
                                        data-floating={local.panelFooterFloating ? "" : undefined}
                                        data-happy-desktop-ui="app-shell-panel-footer"
                                    >
                                        {local.panelFooter}
                                    </div>
                                ) : null}
                            </aside>
                        ) : null}
                    </div>
                </div>
                {local.panelToggleAction ? (
                    <div
                        className="happy-desktop-app-shell__panel-controls"
                        data-happy-desktop-ui="app-shell-panel-controls"
                    >
                        <button
                            aria-label={
                                local.panelToggleAction.open
                                    ? "Hide secondary pane"
                                    : "Show secondary pane"
                            }
                            aria-pressed={local.panelToggleAction.open}
                            className="happy-desktop-app-shell__panel-toggle"
                            onClick={local.panelToggleAction.onClick}
                            type="button"
                        >
                            <Icon
                                name={
                                    local.panelToggleAction.open ? "panel-collapse" : "panel-expand"
                                }
                                size={16}
                            />
                        </button>
                    </div>
                ) : null}
                {/* Last, after every drag surface in the body. Native draggable
                regions are collected in tree order and later rectangles win, so
                a control that punches a hole in one has to come after it — the
                same order the sidebar's own toggle already sits in. */}
                {revealFloating ? reveal : null}
                {/* The held-Command read-out. It hangs on the window rather than
                in the layout because it covers the window, and it is mounted
                only while the hold lasts — every way out of the gesture above
                (chord, keyup, blur, pointerdown, tab hidden) takes it away with
                it. It draws nothing and takes no room otherwise. */}
                {shortcutHintsVisible && local.shortcutHintsSurface ? (
                    <div
                        className="happy-desktop-app-shell__shortcut-hints"
                        data-happy-desktop-ui="app-shell-shortcut-hints"
                    >
                        <div
                            className="happy-desktop-app-shell__shortcut-hints-layout"
                            data-happy-desktop-ui="app-shell-shortcut-hints-layout"
                        >
                            {local.shortcutHintsSurface}
                        </div>
                    </div>
                ) : null}
                {/* The window's overlay lane. A modal-class surface written
                deep in the product hangs here instead, so its z-index is
                resolved against the window rather than against whatever
                positioned layer it happened to be opened from — see
                `WindowOverlay`. The node draws nothing and takes no room. */}
                {local.embedded ? null : (
                    <div
                        className="happy-desktop-app-shell__overlays"
                        data-happy-desktop-ui="app-shell-overlays"
                        ref={setOverlayHost}
                    />
                )}
                {linkMenu ? (
                    <LinkContextMenu
                        href={linkMenu.href}
                        onClose={() => setLinkMenu(undefined)}
                        x={linkMenu.x}
                        y={linkMenu.y}
                    />
                ) : null}
            </div>
        </WindowOverlayHostContext.Provider>
    );
}
