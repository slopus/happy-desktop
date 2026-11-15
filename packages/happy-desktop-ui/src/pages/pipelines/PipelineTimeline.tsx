import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import {
    pipelineRunAbortable,
    type PipelineDefinition,
    type PipelineRun,
} from "happy-desktop-state";
import { Icon } from "../../Icon";
import {
    PIPELINE_KIND_ICON,
    PIPELINE_KIND_LABEL,
    PIPELINE_NODE_STATE_LABEL,
    PIPELINE_NODE_STATE_TONE,
    pipelineDurationOf,
    pipelineFailureTitle,
    type PipelineLabels,
} from "./pipelinePresentation";
import {
    PIPELINE_TIMELINE,
    pipelineTimelineLayout,
    pipelineTimelineNowX,
    pipelineTimelineRowTop,
    type PipelineTimelineEdge,
    type PipelineTimelineLayout,
    type PipelineTimelineX,
} from "./pipelineTimelineLayout";

export interface PipelineTimelineProps {
    readonly definition: PipelineDefinition;
    readonly run: PipelineRun;
    /** The app's clock; between its ticks the timeline moves on by itself. */
    readonly now: number;
    readonly labels: PipelineLabels;
    readonly selectedNodeId: string | null;
    readonly onNodeSelect: (nodeId: string | null) => void;
    readonly "aria-label": string;
}

const T = PIPELINE_TIMELINE;
/** How long a glide to a new place takes. */
const GLIDE_MS = 420;
/** How far past the clock's last tick the now line may run on its own. */
const EXTRAPOLATE_MS = 1_500;
/** Where, across the view, a node ahead's leading edge starts to fade and where it is gone. */
const FADE_FROM = 0.72;
const FADE_TO = 1;
/** Below this, a change of row at one moment drops from the bar instead of curving. */
const ELBOW_BELOW = 28;
/** How far out of the view a row's last mark must be before the row folds away. */
const FOLD_MARGIN = 160;

const ease = (p: number) => 1 - (1 - p) ** 3;

/** Where an edge into a node turns toward its row, just before the node. */
const TRUNK = 14;
/** The radius of an edge's turns. */
const TURN = 6;

/**
 * An edge drawn in straight runs with rounded turns. Level edges stay
 * straight. Otherwise the edge leaves along its source's row and turns toward
 * the target's row just before the target, so every edge into one node shares
 * one vertical run: a fan-in reads as one bus, not a sheaf of curves. A
 * change of row at one moment drops from the source bar instead.
 */
function edgePath(sx: number, sy: number, tx: number, ty: number): string {
    const n = (value: number) => String(Math.round(value * 10) / 10);
    if (Math.abs(sy - ty) < 0.5) return `M ${n(sx)} ${n(sy)} L ${n(tx)} ${n(ty)}`;
    const down = ty > sy ? 1 : -1;
    if (tx - sx < ELBOW_BELOW) {
        const x = sx - TRUNK;
        const y0 = sy + (down * T.barHeight) / 2;
        const r = Math.min(TURN, Math.abs(ty - y0));
        return `M ${n(x)} ${n(y0)} L ${n(x)} ${n(ty - down * r)} Q ${n(x)} ${n(ty)}, ${n(x + r)} ${n(ty)} L ${n(tx)} ${n(ty)}`;
    }
    const x = tx - TRUNK;
    const r = Math.min(TURN, Math.abs(ty - sy) / 2);
    return `M ${n(sx)} ${n(sy)} L ${n(x - r)} ${n(sy)} Q ${n(x)} ${n(sy)}, ${n(x)} ${n(sy + down * r)} L ${n(x)} ${n(ty - down * r)} Q ${n(x)} ${n(ty)}, ${n(x + r)} ${n(ty)} L ${n(tx)} ${n(ty)}`;
}

interface Model {
    readonly layout: PipelineTimelineLayout;
    /** The clock when this layout was made, and the frame time it was handed over at. */
    readonly at: number;
    readonly perf: number;
}

interface Glide {
    readonly offset: number;
    readonly start: number;
}

/**
 * Everything that moves on its own, kept outside React: the now line's
 * position (as `--now-x` on the plane), glides to new places, following
 * "now" with the scroll position, the fade of what is ahead, and the edges
 * that ride the now line. React draws the structure; this only writes
 * transforms, opacities, path data and `scrollLeft`, never reading layout in
 * a frame it has written to.
 */
class TimelineEngine {
    private model: Model | null = null;
    private following = true;
    private returning: { from: number; start: number } | null = null;
    private nowGlide: Glide | null = null;
    private readonly headGlides = new Map<string, Glide>();
    private heads = new Map<string, { element: HTMLElement; rel: number; future: boolean }>();
    private edges: { element: SVGPathElement; edge: PipelineTimelineEdge }[] = [];
    /** Every element drawn in a row, by row, with the opacity last written to it. */
    private rowElements = new Map<number, { element: HTMLElement; opacity: number }[]>();
    /** Rows with something in or near the view; the rest fold away. */
    private shown = new Set<number>();
    private readonly rowGlides = new Map<number, { from: number; to: number; start: number }>();
    /** Where the reader was when rows were last folded. */
    private foldedAt = 0;
    private folded = false;
    private height = 0;
    private scrollX = 0;
    private width = 0;
    private frame = 0;
    private interval: ReturnType<typeof setInterval> | undefined;
    private drag: { x: number; y: number; left: number; top: number; id: number } | null = null;
    private readonly still: boolean;
    private readonly cleanups: (() => void)[] = [];

    constructor(
        private readonly viewport: HTMLDivElement,
        private readonly onFollowing: (following: boolean) => void,
    ) {
        this.still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        this.width = viewport.clientWidth;
        const listen = <K extends keyof HTMLElementEventMap>(
            type: K,
            handler: (event: HTMLElementEventMap[K]) => void,
            options?: AddEventListenerOptions,
        ) => {
            viewport.addEventListener(type, handler, options);
            this.cleanups.push(() => viewport.removeEventListener(type, handler, options));
        };
        listen(
            "scroll",
            () => {
                this.scrollX = viewport.scrollLeft;
                if (!this.looping()) this.request();
            },
            { passive: true },
        );
        listen(
            "wheel",
            (event) => {
                const sideways = Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.shiftKey;
                const tall = viewport.scrollHeight > viewport.clientHeight + 1;
                if (!sideways && tall) return;
                this.release();
                if (!sideways) {
                    // A plain wheel scrolls through time when there is nothing to scroll down to.
                    event.preventDefault();
                    viewport.scrollLeft += event.deltaY;
                }
            },
            { passive: false },
        );
        listen("keydown", (event) => {
            if (
                ["ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(event.key)
            )
                this.release();
        });
        listen("pointerdown", (event) => {
            if (event.button !== 0) return;
            if ((event.target as Element).closest("[data-timeline-node]")) return;
            this.release();
            // The bars of the viewport's own scrollbars drag natively.
            const box = viewport.getBoundingClientRect();
            if (
                event.clientY - box.top >= viewport.clientTop + viewport.clientHeight ||
                event.clientX - box.left >= viewport.clientLeft + viewport.clientWidth
            )
                return;
            this.drag = {
                x: event.clientX,
                y: event.clientY,
                left: viewport.scrollLeft,
                top: viewport.scrollTop,
                id: event.pointerId,
            };
            viewport.setPointerCapture(event.pointerId);
            viewport.dataset.dragging = "";
        });
        listen("pointermove", (event) => {
            const drag = this.drag;
            if (!drag || drag.id !== event.pointerId) return;
            viewport.scrollLeft = drag.left - (event.clientX - drag.x);
            viewport.scrollTop = drag.top - (event.clientY - drag.y);
        });
        const dragEnd = (event: PointerEvent) => {
            if (!this.drag || this.drag.id !== event.pointerId) return;
            this.drag = null;
            delete viewport.dataset.dragging;
        };
        listen("pointerup", dragEnd);
        listen("pointercancel", dragEnd);
        const observer = new ResizeObserver(() => {
            const width = viewport.clientWidth;
            if (width === this.width) return;
            // The track starts half a view in, so a narrower view shifts it; a
            // reader parked in the past keeps what they were looking at.
            const shift = (width - this.width) / 2;
            this.width = width;
            if (!this.following && !this.returning) {
                viewport.scrollLeft += shift;
                this.scrollX = viewport.scrollLeft;
            }
            this.request();
        });
        observer.observe(viewport);
        this.cleanups.push(() => observer.disconnect());
    }

    dispose(): void {
        cancelAnimationFrame(this.frame);
        clearInterval(this.interval);
        for (const cleanup of this.cleanups) cleanup();
    }

    /** The reader asks for "now" (or, on an ended run, its end) again. */
    follow(): void {
        if (this.following) return;
        this.following = true;
        this.returning = this.still ? null : { from: this.scrollX, start: performance.now() };
        this.onFollowing(true);
        this.request();
    }

    /** Hands a new layout over, after React has committed it. */
    update(
        layout: PipelineTimelineLayout,
        now: number,
        track: HTMLElement,
        plane: HTMLElement,
    ): void {
        const perf = performance.now();
        const previous = this.model;
        const next: Model = { layout, at: now, perf };
        if (previous && !this.still) {
            const at = this.clock(previous, perf);
            const before = this.nowX(previous, at) + this.glideOf(this.nowGlide, perf);
            const after = this.nowX(next, at);
            if (Math.abs(before - after) > 0.5)
                this.nowGlide = { offset: before - after, start: perf };
            if (previous.layout.live && !layout.live && this.following)
                this.returning = { from: this.scrollX, start: perf };
        }
        // Heads: the card a working node shows and the nodes ahead.
        const heads = new Map<string, { element: HTMLElement; rel: number; future: boolean }>();
        for (const element of plane.querySelectorAll<HTMLElement>("[data-timeline-head]")) {
            const id = element.dataset.timelineNode ?? "";
            const rel = Number(element.dataset.rel ?? "0");
            heads.set(id, { element, rel, future: element.dataset.timelineHead === "future" });
            const old = this.heads.get(id);
            if (!this.still && old && old.rel !== rel) {
                const offset = old.rel + this.glideOf(this.headGlides.get(id) ?? null, perf) - rel;
                this.headGlides.set(id, { offset, start: perf });
            }
            if (!heads.get(id)!.future) element.style.opacity = "";
        }
        this.heads = heads;
        const byIndex = new Map(layout.edges.map((edge) => [edge.index, edge]));
        this.edges = [];
        for (const element of plane.querySelectorAll<SVGPathElement>("[data-timeline-edge]")) {
            const edge = byIndex.get(Number(element.dataset.timelineEdge));
            if (edge) this.edges.push({ element, edge });
        }
        const rowElements = new Map<number, { element: HTMLElement; opacity: number }[]>();
        for (const element of plane.querySelectorAll<HTMLElement>("[data-timeline-row]")) {
            const row = Number(element.dataset.timelineRow);
            const old = this.rowElements.get(row)?.find((entry) => entry.element === element);
            rowElements.set(row, [
                ...(rowElements.get(row) ?? []),
                { element, opacity: old?.opacity ?? Number.NaN },
            ]);
        }
        this.rowElements = rowElements;
        this.model = next;
        this.track = track;
        if (!previous) this.scrollX = this.viewport.scrollLeft;
        this.schedule();
        this.paint(perf);
    }

    private track: HTMLElement | null = null;

    private looping(): boolean {
        return this.model?.layout.live != null || this.animating(performance.now());
    }

    private animating(perf: number): boolean {
        const busy = (glide: { readonly start: number } | null) =>
            glide !== null && perf - glide.start < GLIDE_MS;
        return (
            this.returning !== null ||
            busy(this.nowGlide) ||
            [...this.headGlides.values()].some(busy) ||
            [...this.rowGlides.values()].some(busy)
        );
    }

    private schedule(): void {
        clearInterval(this.interval);
        this.interval = undefined;
        // Reduced motion: the now line steps once a second instead of gliding.
        if (this.still && this.model?.layout.live)
            this.interval = setInterval(() => this.paint(performance.now()), 1_000);
        else this.request();
    }

    private request(): void {
        if (this.frame) return;
        // One time base for everything: a frame's own timestamp can be earlier
        // than the moment a layout was handed over, which would run glides backwards.
        this.frame = requestAnimationFrame(() => {
            this.frame = 0;
            this.paint(performance.now());
            if (!this.still && this.looping()) this.request();
        });
    }

    private release(): void {
        if (!this.following && !this.returning) return;
        this.following = false;
        this.returning = null;
        this.onFollowing(false);
    }

    private clock(model: Model, perf: number): number {
        return model.at + Math.min(EXTRAPOLATE_MS, Math.max(0, perf - model.perf));
    }

    private nowX(model: Model, at: number): number {
        const layout = model.layout;
        return layout.live ? pipelineTimelineNowX(layout.live, at) : (layout.endX ?? 0);
    }

    private glideOf(glide: Glide | null, perf: number): number {
        if (!glide) return 0;
        const p = Math.max(0, (perf - glide.start) / GLIDE_MS);
        return p >= 1 ? 0 : glide.offset * (1 - ease(p));
    }

    /** Where the view rests: on now, or on an ended run with as much of it as fits. */
    private target(model: Model, now: number): number {
        const layout = model.layout;
        if (layout.live) return now;
        // The run's last mark (a stub skipped at its end included) at the view's edge.
        return layout.width <= this.width
            ? layout.width / 2
            : Math.max(0, layout.width - this.width / 2);
    }

    private point(spot: PipelineTimelineX, now: number, perf: number): number {
        if ("fixed" in spot) return spot.fixed;
        const glide = spot.node ? this.glideOf(this.headGlides.get(spot.node) ?? null, perf) : 0;
        return now + spot.now + glide;
    }

    /**
     * Which rows are open, and how far: a row stays open while anything in it
     * is in or near the view, and folds away once it is well out of it. While
     * the view follows now, rows that finished long ago fold, and scrolling
     * back opens them again. A parked reader's rows only fold when they move
     * the view themselves; something new coming into view still opens its row.
     */
    private fold(
        layout: PipelineTimelineLayout,
        now: number,
        fade: ReadonlyMap<string, number>,
        perf: number,
    ): Map<number, number> {
        const left = this.scrollX - this.width / 2;
        const right = left + this.width;
        const spans = new Map<number, [number, number][]>();
        const add = (row: number, x0: number, x1: number) =>
            spans.set(row, [...(spans.get(row) ?? []), [x0, x1]]);
        for (const item of layout.items) {
            if (item.mode === "past") add(item.row, item.x0, item.x1);
            else if (item.mode === "skipped") add(item.row, item.x0, item.x0 + item.width);
            else if (item.mode === "live") add(item.row, item.x0, now + T.cardWidth);
            else if ((fade.get(item.id) ?? 1) >= 0.01) {
                const glide = this.glideOf(this.headGlides.get(item.id) ?? null, perf);
                add(item.row, now + item.offset + glide, now + item.offset + glide + T.futureWidth);
            }
        }
        const near = (row: number, margin: number) =>
            (spans.get(row) ?? []).some(([x0, x1]) => x1 >= left - margin && x0 <= right + margin);
        const moved = Math.abs(this.scrollX - this.foldedAt) > 0.5;
        const mayFold = !this.folded || this.following || this.returning !== null || moved;
        this.foldedAt = this.scrollX;
        const shown = new Set<number>();
        for (let row = 0; row < layout.rows; row++) {
            // Following, the view only moves on, so a row folds as soon as it
            // leaves; a reader moving back and forth gets some slack.
            const margin = this.following && this.returning === null ? 0 : FOLD_MARGIN;
            const keep = this.shown.has(row) && (!mayFold || near(row, margin));
            if (near(row, 0) || keep) shown.add(row);
        }
        // An empty view keeps the rows it had rather than folding to nothing.
        const next = shown.size > 0 ? shown : this.shown.size > 0 ? this.shown : new Set([0]);
        const first = !this.folded;
        this.folded = true;
        const heights = new Map<number, number>();
        for (let row = 0; row < layout.rows; row++) {
            const to = next.has(row) ? T.rowHeight : 0;
            const glide = this.rowGlides.get(row);
            if (first || this.still) {
                this.rowGlides.delete(row);
                heights.set(row, to);
                continue;
            }
            const at = glide
                ? this.rowHeightOf(glide, perf)
                : this.shown.has(row)
                  ? T.rowHeight
                  : 0;
            if (glide ? glide.to !== to : Math.abs(at - to) > 0.5) {
                this.rowGlides.set(row, { from: at, to, start: perf });
                heights.set(row, at);
                continue;
            }
            if (glide && perf - glide.start >= GLIDE_MS) this.rowGlides.delete(row);
            heights.set(row, glide ? this.rowHeightOf(glide, perf) : to);
        }
        this.shown = next;
        return heights;
    }

    private rowHeightOf(glide: { from: number; to: number; start: number }, perf: number): number {
        const p = Math.min(1, Math.max(0, (perf - glide.start) / GLIDE_MS));
        return glide.from + (glide.to - glide.from) * ease(p);
    }

    private paint(perf: number): void {
        const model = this.model;
        const track = this.track;
        if (!model || !track) return;
        const now = this.nowX(model, this.clock(model, perf)) + this.glideOf(this.nowGlide, perf);
        track.style.setProperty("--now-x", String(now));
        for (const [id, glide] of this.headGlides) {
            const head = this.heads.get(id);
            const offset = this.glideOf(glide, perf);
            if (offset === 0) this.headGlides.delete(id);
            head?.element.style.setProperty("--glide", String(offset));
        }
        if (this.returning) {
            const p = Math.max(0, (perf - this.returning.start) / GLIDE_MS);
            const goal = this.target(model, now);
            const left =
                p >= 1 ? goal : this.returning.from + (goal - this.returning.from) * ease(p);
            if (p >= 1) this.returning = null;
            this.viewport.scrollLeft = left;
            this.scrollX = left;
        } else if (this.following) {
            const left = this.target(model, now);
            this.viewport.scrollLeft = left;
            this.scrollX = left;
        }
        // What is ahead fades toward the view's trailing edge, so scrolling
        // forward brings it out.
        const fade = new Map<string, number>();
        for (const [id, head] of this.heads) {
            if (!head.future) continue;
            const glide = this.glideOf(this.headGlides.get(id) ?? null, perf);
            const lead = this.width / 2 + now + head.rel + glide - this.scrollX;
            const from = this.width * FADE_FROM;
            const to = this.width * FADE_TO;
            const clear = Math.min(1, Math.max(0, (to - lead) / Math.max(1, to - from)));
            fade.set(id, clear ** 1.6);
        }
        const heights = this.fold(model.layout, now, fade, perf);
        // A working node's card names it while the now line is in view.
        const nowInView =
            model.layout.live !== null &&
            now >= this.scrollX - this.width / 2 &&
            now <= this.scrollX + this.width / 2;
        if (nowInView !== (track.dataset.nowInView !== undefined)) {
            if (nowInView) track.dataset.nowInView = "";
            else delete track.dataset.nowInView;
        }
        // Rows stack in order; a folded row takes no room, and what is in it
        // fades with it.
        const tops = new Map<number, number>();
        let y = T.axisHeight + T.padding;
        for (let row = 0; row < model.layout.rows; row++) {
            tops.set(row, y + (T.rowHeight - T.barHeight) / 2);
            y += heights.get(row) ?? 0;
        }
        const height = Math.ceil(y + T.padding);
        if (height !== this.height) {
            this.height = height;
            track.style.height = `${String(height)}px`;
        }
        const openness = (row: number) => (heights.get(row) ?? 0) / T.rowHeight;
        for (const [row, entries] of this.rowElements) {
            const top = tops.get(row) ?? 0;
            for (const entry of entries) {
                entry.element.style.setProperty("--y", String(top));
                const node = entry.element.dataset.timelineNode ?? "";
                const opacity =
                    openness(row) *
                    (entry.element.dataset.timelineHead === "future" ? (fade.get(node) ?? 1) : 1);
                const rounded = Math.round(opacity * 1000) / 1000;
                if (rounded === entry.opacity) continue;
                entry.opacity = rounded;
                entry.element.style.opacity = rounded >= 1 ? "" : String(rounded);
                entry.element.style.visibility = rounded < 0.01 ? "hidden" : "";
            }
        }
        for (const { element, edge } of this.edges) {
            const middle = (row: number) => (tops.get(row) ?? 0) + T.barHeight / 2;
            element.setAttribute(
                "d",
                edgePath(
                    this.point(edge.from, now, perf),
                    middle(edge.fromRow),
                    this.point(edge.to, now, perf),
                    middle(edge.toRow),
                ),
            );
            const opacity =
                Math.min(openness(edge.fromRow), openness(edge.toRow)) *
                (edge.ahead === null ? 1 : (fade.get(edge.ahead) ?? 1));
            element.style.opacity = opacity >= 1 ? "" : opacity.toFixed(3);
        }
    }
}

/**
 * PipelineTimeline — a run laid out in time, left to right, with "now" at the
 * centre of the view. What finished sits to the left as bars placed by when it
 * ran, coloured by how it ended. What is working sits on the now line as a
 * card with its status line, progress and running time, its bar growing into
 * the line. What can still run waits to the right in graph order, fading
 * toward the view's edge. Edges join them: success solid, failure dashed.
 *
 * The view follows now, moving on smoothly between the app's clock ticks;
 * scrolling, dragging or the wheel leaves the reader where they are, and Now
 * brings them back. An ended run rests on its end. Nothing in the past ever
 * moves.
 */
export function PipelineTimeline(props: PipelineTimelineProps) {
    const run = props.run;
    const runNodes = new Map(run.nodes.map((node) => [node.nodeId, node]));
    const layout = pipelineTimelineLayout({
        nodes: props.definition.nodes.map((node) => ({
            id: node.id,
            kind: node.kind,
            join: node.join,
        })),
        edges: props.definition.edges,
        root: props.definition.root,
        runNodes,
        createdAt: run.createdAt,
        startedAt: run.startedAt,
        endedAt: run.endedAt,
        over: !pipelineRunAbortable(run.state),
        now: props.now,
    });
    const kinds = new Map(props.definition.nodes.map((node) => [node.id, node.kind]));
    const [following, followingSet] = useState(true);
    const engine = useRef<TimelineEngine | null>(null);
    const track = useRef<HTMLDivElement | null>(null);
    const plane = useRef<HTMLDivElement | null>(null);
    const viewportMount = useCallback((element: HTMLDivElement | null) => {
        if (element === null) return;
        const created = new TimelineEngine(element, followingSet);
        engine.current = created;
        return () => {
            created.dispose();
            engine.current = null;
        };
    }, []);
    // eslint-disable-next-line happy-react/no-layout-effect -- The engine must take each committed layout before the frame is painted, or the now line and the scroll position would show one frame at the clock's last tick; no declarative boundary sees the committed plane.
    useLayoutEffect(() => {
        if (engine.current && track.current && plane.current)
            engine.current.update(layout, props.now, track.current, plane.current);
    });
    const select = (id: string) => props.onNodeSelect(props.selectedNodeId === id ? null : id);
    const label = (id: string) => {
        const node = runNodes.get(id);
        const state = node?.state ?? "pending";
        return [
            id,
            PIPELINE_KIND_LABEL[kinds.get(id) ?? "code"],
            PIPELINE_NODE_STATE_LABEL[state],
        ].join(", ");
    };
    return (
        <div className="happy-pipeline-timeline" data-happy-desktop-ui="pipeline-timeline">
            <div
                aria-label={props["aria-label"]}
                className="happy-pipeline-timeline__viewport"
                ref={viewportMount}
                role="group"
            >
                <div
                    className="happy-pipeline-timeline__track"
                    data-live={layout.live ? "" : undefined}
                    ref={track}
                    // Its height is the engine's: the open rows'.
                    style={{ width: `calc(100cqw + ${String(layout.width)}px)` }}
                >
                    <div aria-hidden className="happy-pipeline-timeline__axis">
                        <div className="happy-pipeline-timeline__axis-plane">
                            {layout.ticks.map((tick) => (
                                <span
                                    className="happy-pipeline-timeline__tick-label"
                                    key={tick.label}
                                    style={{ transform: `translateX(${String(tick.x + 4)}px)` }}
                                >
                                    {tick.label}
                                </span>
                            ))}
                            {layout.breaks.map((x) => (
                                <span
                                    className="happy-pipeline-timeline__break"
                                    key={x}
                                    style={{ transform: `translateX(${String(x - 4)}px)` }}
                                    title="Nothing ran here; this stretch is shortened."
                                >
                                    ≈
                                </span>
                            ))}
                            {layout.live ? (
                                <span className="happy-pipeline-timeline__now-label">Now</span>
                            ) : null}
                        </div>
                    </div>
                    <div
                        className="happy-pipeline-timeline__plane"
                        ref={plane}
                        style={{ width: layout.width }}
                    >
                        {layout.ticks.map((tick) => (
                            <span
                                aria-hidden
                                className="happy-pipeline-timeline__tick"
                                key={tick.label}
                                style={{ transform: `translateX(${String(tick.x)}px)` }}
                            />
                        ))}
                        <svg aria-hidden className="happy-pipeline-timeline__edges">
                            <defs>
                                {(["success", "failure"] as const).map((outcome) => (
                                    <marker
                                        className="happy-pipeline-graph__arrow"
                                        data-on={outcome}
                                        id={`pipeline-timeline-${outcome}`}
                                        key={outcome}
                                        markerHeight="7"
                                        markerUnits="userSpaceOnUse"
                                        markerWidth="7"
                                        orient="auto"
                                        refX="7"
                                        refY="3.5"
                                    >
                                        <path d="M 0 0 L 7 3.5 L 0 7 z" />
                                    </marker>
                                ))}
                            </defs>
                            {layout.edges.map((edge) => {
                                const on = props.definition.edges[edge.index]!.on;
                                return (
                                    // Its path is drawn by the engine, which knows where rows are.
                                    <path
                                        className="happy-pipeline-graph__edge"
                                        data-on={on}
                                        data-timeline-edge={edge.index}
                                        key={edge.index}
                                        markerEnd={`url(#pipeline-timeline-${on})`}
                                    />
                                );
                            })}
                        </svg>
                        {layout.items.map((item) => {
                            const node = runNodes.get(item.id);
                            const kind = kinds.get(item.id) ?? "code";
                            const state = node?.state ?? "pending";
                            const glyph = (
                                <span className="happy-pipeline-timeline__glyph">
                                    <Icon name={PIPELINE_KIND_ICON[kind]} size={12} />
                                </span>
                            );
                            const pressed = props.selectedNodeId === item.id;
                            if (item.mode === "past" || item.mode === "skipped") {
                                const width =
                                    item.mode === "past"
                                        ? Math.max(1, item.x1 - item.x0)
                                        : item.width;
                                const duration =
                                    item.mode === "past" && node
                                        ? pipelineDurationOf(
                                              node.startedAt,
                                              node.endedAt,
                                              props.now,
                                          )
                                        : null;
                                return (
                                    <button
                                        aria-label={label(item.id)}
                                        aria-pressed={pressed}
                                        className="happy-pipeline-timeline__bar"
                                        data-mode={item.mode}
                                        data-timeline-node={item.id}
                                        data-timeline-row={item.row}
                                        data-tone={PIPELINE_NODE_STATE_TONE[state]}
                                        key={`bar-${item.id}`}
                                        onClick={() => select(item.id)}
                                        // Placed in time by its offset, not a transform: its sticky
                                        // label measures from where layout puts it. Its row's y
                                        // is the engine's, as rows fold.
                                        style={{ left: item.x0, width }}
                                        title={[
                                            item.id,
                                            PIPELINE_NODE_STATE_LABEL[state],
                                            node?.failure
                                                ? pipelineFailureTitle(node.failure.code)
                                                : null,
                                            duration,
                                        ]
                                            .filter(Boolean)
                                            .join(" · ")}
                                        type="button"
                                    >
                                        <span className="happy-pipeline-timeline__label">
                                            {glyph}
                                            <span className="happy-pipeline-timeline__name">
                                                {item.id}
                                            </span>
                                            {duration ? (
                                                <span className="happy-pipeline-timeline__meta">
                                                    {duration}
                                                </span>
                                            ) : null}
                                        </span>
                                    </button>
                                );
                            }
                            if (item.mode === "live") {
                                const progress = node?.status?.progress ?? null;
                                return [
                                    <span
                                        aria-hidden
                                        className="happy-pipeline-timeline__trail"
                                        data-timeline-row={item.row}
                                        key={`bar-${item.id}`}
                                        style={
                                            {
                                                "--x0": String(item.x0),
                                                left: item.x0,
                                            } as CSSProperties
                                        }
                                    >
                                        {/* Its name, for a reader scrolled back far from its card. */}
                                        <span className="happy-pipeline-timeline__label">
                                            {glyph}
                                            <span className="happy-pipeline-timeline__name">
                                                {item.id}
                                            </span>
                                        </span>
                                    </span>,
                                    <button
                                        aria-label={label(item.id)}
                                        aria-pressed={pressed}
                                        className="happy-pipeline-timeline__head"
                                        data-mode="live"
                                        data-rel="0"
                                        data-timeline-head="live"
                                        data-timeline-node={item.id}
                                        data-timeline-row={item.row}
                                        key={`head-${item.id}`}
                                        onClick={() => select(item.id)}
                                        style={{ "--rel": "0" } as CSSProperties}
                                        title={node?.status?.text ?? item.id}
                                        type="button"
                                    >
                                        {glyph}
                                        <span className="happy-pipeline-timeline__name">
                                            {item.id}
                                        </span>
                                        <span className="happy-pipeline-timeline__status">
                                            {node?.status?.text ?? PIPELINE_NODE_STATE_LABEL[state]}
                                        </span>
                                        <span className="happy-pipeline-timeline__meta">
                                            {pipelineDurationOf(
                                                node?.startedAt ?? null,
                                                null,
                                                props.now,
                                            ) ?? ""}
                                        </span>
                                        <span
                                            aria-hidden
                                            className="happy-pipeline-timeline__progress"
                                            data-empty={progress === null ? "" : undefined}
                                        >
                                            <span
                                                className="happy-pipeline-timeline__progress-fill"
                                                style={{
                                                    transform: `scaleX(${String(progress ?? 0)})`,
                                                }}
                                            />
                                        </span>
                                    </button>,
                                ];
                            }
                            return (
                                <button
                                    aria-label={label(item.id)}
                                    aria-pressed={pressed}
                                    className="happy-pipeline-timeline__head"
                                    data-mode="future"
                                    data-rel={item.offset}
                                    data-timeline-head="future"
                                    data-timeline-node={item.id}
                                    data-timeline-row={item.row}
                                    key={`head-${item.id}`}
                                    onClick={() => select(item.id)}
                                    style={{ "--rel": String(item.offset) } as CSSProperties}
                                    title={`${item.id} · Waiting`}
                                    type="button"
                                >
                                    {glyph}
                                    <span className="happy-pipeline-timeline__name">{item.id}</span>
                                </button>
                            );
                        })}
                        {layout.live ? (
                            <span aria-hidden className="happy-pipeline-timeline__now-line" />
                        ) : null}
                    </div>
                </div>
            </div>
            {following ? null : (
                <button
                    className="happy-pipeline-timeline__return"
                    onClick={() => engine.current?.follow()}
                    type="button"
                >
                    <Icon name="locate" size={12} />
                    {layout.live ? "Now" : "End"}
                </button>
            )}
        </div>
    );
}
