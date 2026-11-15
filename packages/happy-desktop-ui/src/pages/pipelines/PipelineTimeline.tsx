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

const ease = (p: number) => 1 - (1 - p) ** 3;
const rowMiddle = (row: number) => pipelineTimelineRowTop(row) + T.barHeight / 2;

/** A smooth left-to-right path; level runs stay straight. */
function edgePath(sx: number, sy: number, tx: number, ty: number): string {
    if (sy === ty) return `M ${String(sx)} ${String(sy)} L ${String(tx)} ${String(ty)}`;
    if (tx - sx < ELBOW_BELOW) {
        // A fan-out at one moment: down (or up) from the source bar's edge
        // just before its end, then a short turn into the target's start.
        const down = ty > sy ? 1 : -1;
        const x = sx - 14;
        const y0 = sy + (down * T.barHeight) / 2;
        const r = 6;
        return `M ${String(x)} ${String(y0)} L ${String(x)} ${String(ty - down * r)} Q ${String(x)} ${String(ty)}, ${String(x + r)} ${String(ty)} L ${String(tx)} ${String(ty)}`;
    }
    const bend = Math.max(14, (tx - sx) / 2);
    return `M ${String(sx)} ${String(sy)} C ${String(sx + bend)} ${String(sy)}, ${String(tx - bend)} ${String(ty)}, ${String(tx)} ${String(ty)}`;
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
    private dynamic: { element: SVGPathElement; edge: PipelineTimelineEdge }[] = [];
    private ahead: { element: SVGPathElement; node: string }[] = [];
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
            if (event.offsetY >= viewport.clientHeight || event.offsetX >= viewport.clientWidth)
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
        this.dynamic = [];
        this.ahead = [];
        for (const element of plane.querySelectorAll<SVGPathElement>("[data-timeline-edge]")) {
            const edge = byIndex.get(Number(element.dataset.timelineEdge));
            if (!edge) continue;
            if (!("fixed" in edge.from && "fixed" in edge.to)) this.dynamic.push({ element, edge });
            if (edge.ahead !== null) this.ahead.push({ element, node: edge.ahead });
            else element.style.opacity = "";
        }
        this.model = next;
        this.track = track;
        if (!previous) {
            this.scrollX = this.viewport.scrollLeft;
            // A run taller than the view opens with its first working row at the
            // top, once; after that only the reader moves it up and down.
            const working = layout.items.filter((item) => item.mode === "live");
            if (working.length > 0 && this.viewport.scrollHeight > this.viewport.clientHeight) {
                const first = Math.min(...working.map((item) => item.row));
                this.viewport.scrollTop = pipelineTimelineRowTop(first) - T.axisHeight - T.padding;
            }
        }
        this.schedule();
        this.paint(perf);
    }

    private track: HTMLElement | null = null;

    private looping(): boolean {
        return this.model?.layout.live != null || this.animating(performance.now());
    }

    private animating(perf: number): boolean {
        const busy = (glide: Glide | null) => glide !== null && perf - glide.start < GLIDE_MS;
        return (
            this.returning !== null ||
            busy(this.nowGlide) ||
            [...this.headGlides.values()].some(busy)
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
        const end = layout.endX ?? layout.width;
        return layout.width <= this.width
            ? layout.width / 2
            : Math.max(0, end - this.width / 2 + 48);
    }

    private point(spot: PipelineTimelineX, now: number, perf: number): number {
        if ("fixed" in spot) return spot.fixed;
        const glide = spot.node ? this.glideOf(this.headGlides.get(spot.node) ?? null, perf) : 0;
        return now + spot.now + glide;
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
        for (const { element, edge } of this.dynamic)
            element.setAttribute(
                "d",
                edgePath(
                    this.point(edge.from, now, perf),
                    rowMiddle(edge.fromRow),
                    this.point(edge.to, now, perf),
                    rowMiddle(edge.toRow),
                ),
            );
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
            const opacity = clear ** 1.6;
            fade.set(id, opacity);
            head.element.style.opacity = opacity.toFixed(3);
            head.element.style.visibility = opacity < 0.01 ? "hidden" : "";
        }
        for (const { element, node } of this.ahead)
            element.style.opacity = (fade.get(node) ?? 1).toFixed(3);
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
    const nowAtRender = layout.live
        ? pipelineTimelineNowX(layout.live, props.now)
        : (layout.endX ?? 0);
    const select = (id: string) => props.onNodeSelect(props.selectedNodeId === id ? null : id);
    const staticEdges = layout.edges.filter((edge) => "fixed" in edge.from && "fixed" in edge.to);
    const movingEdges = layout.edges.filter(
        (edge) => !("fixed" in edge.from && "fixed" in edge.to),
    );
    const at = (spot: PipelineTimelineX) => ("fixed" in spot ? spot.fixed : nowAtRender + spot.now);
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
                    style={{
                        width: `calc(100cqw + ${String(layout.width)}px)`,
                        height: layout.height,
                    }}
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
                        style={{ width: layout.width, height: layout.height }}
                    >
                        {layout.ticks.map((tick) => (
                            <span
                                aria-hidden
                                className="happy-pipeline-timeline__tick"
                                key={tick.label}
                                style={{ transform: `translateX(${String(tick.x)}px)` }}
                            />
                        ))}
                        <svg
                            aria-hidden
                            className="happy-pipeline-timeline__edges"
                            height={layout.height}
                            width={layout.width}
                        >
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
                            {[...staticEdges, ...movingEdges].map((edge) => {
                                const on = props.definition.edges[edge.index]!.on;
                                return (
                                    <path
                                        className="happy-pipeline-graph__edge"
                                        d={edgePath(
                                            at(edge.from),
                                            rowMiddle(edge.fromRow),
                                            at(edge.to),
                                            rowMiddle(edge.toRow),
                                        )}
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
                            const top = pipelineTimelineRowTop(item.row);
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
                                        data-tone={PIPELINE_NODE_STATE_TONE[state]}
                                        key={`bar-${item.id}`}
                                        onClick={() => select(item.id)}
                                        // Placed by offsets, not a transform: a bar never moves, and
                                        // its sticky label measures from where layout puts it.
                                        style={{ left: item.x0, top, width }}
                                        title={[item.id, PIPELINE_NODE_STATE_LABEL[state], duration]
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
                                        key={`bar-${item.id}`}
                                        style={
                                            {
                                                "--x0": String(item.x0),
                                                transform: `translate(${String(item.x0)}px, ${String(top)}px)`,
                                            } as CSSProperties
                                        }
                                    />,
                                    <button
                                        aria-label={label(item.id)}
                                        aria-pressed={pressed}
                                        className="happy-pipeline-timeline__head"
                                        data-mode="live"
                                        data-rel="0"
                                        data-timeline-head="live"
                                        data-timeline-node={item.id}
                                        key={`head-${item.id}`}
                                        onClick={() => select(item.id)}
                                        style={{ "--rel": "0", top } as CSSProperties}
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
                                    key={`head-${item.id}`}
                                    onClick={() => select(item.id)}
                                    style={{ "--rel": String(item.offset), top } as CSSProperties}
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
