import type {
    PipelineEdgeOutcome,
    PipelineNodeKind,
    PipelineNodeRunState,
} from "happy-desktop-state";
import { pipelineGraphLayout } from "./pipelineGraphLayout";

/**
 * The geometry of a run laid out in time, left to right.
 *
 * Every moment something started or ended is an event. Between two events the
 * timeline gives a fixed `BASE` plus the time between them: linear for the
 * first minute, logarithmic after, so a 2 s step stays legible beside a 20 min
 * one, and a gap in which nothing ran is capped. A finished node is at least
 * `MIN_BAR` wide. Events are only ever added at the end, so everything in the
 * past keeps its x for the whole run; only "now" and what is ahead of it move.
 *
 * Rows come from the definition alone. A node continues the row of a
 * predecessor that must end before it can start (its only one, or any of them
 * under `join: all`); every other node opens a row. So a node never changes
 * row during a run, and two nodes sharing one never overlap in time.
 *
 * Pure geometry in CSS pixels, from the track's origin; no DOM.
 */

export const PIPELINE_TIMELINE = {
    /** One row: a bar and the space around it. */
    rowHeight: 30,
    barHeight: 24,
    axisHeight: 22,
    padding: 6,
    /** The live card a working node shows on the now line. */
    cardWidth: 232,
    /** A node that has not started yet. */
    futureWidth: 148,
    /** From the now line's cards to the first nodes ahead. */
    futureGap: 44,
    /** Between one depth ahead and the next. */
    futureStep: 180,
    /** A skipped node's stub, at its narrowest and widest. */
    skipWidth: 64,
    skipWidthMax: 168,
    /** The fewest pixels a finished node takes. */
    minBar: 88,
    /** What every gap between two events takes, before its time. */
    base: 24,
    /** The most a gap in which nothing ran may take, after `base`. */
    idleCap: 40,
    /** The least room between two labelled ticks. */
    tickGap: 76,
    /** How far behind the now line the last tick stays, clear of its label. */
    tickNowGap: 52,
} as const;

/** Pixels per second for the first `KNEE` seconds of a gap. */
const LINEAR = 4;
const KNEE = 60;

/** A gap's width from its length in seconds, before `base`. */
function span(seconds: number, idle: boolean): number {
    const s = Math.max(0, seconds);
    const width = s <= KNEE ? LINEAR * s : LINEAR * KNEE * (1 + Math.log1p((s - KNEE) / KNEE));
    return idle ? Math.min(width, PIPELINE_TIMELINE.idleCap) : width;
}

export interface PipelineTimelineInput {
    readonly nodes: readonly {
        readonly id: string;
        readonly kind: PipelineNodeKind;
        readonly join: "all" | "any";
    }[];
    readonly edges: readonly {
        readonly from: string;
        readonly to: string;
        readonly on: PipelineEdgeOutcome;
    }[];
    readonly root: string;
    readonly runNodes: ReadonlyMap<
        string,
        {
            readonly state: PipelineNodeRunState;
            readonly startedAt: number | null;
            readonly endedAt: number | null;
        }
    >;
    readonly createdAt: number;
    readonly startedAt: number | null;
    /** When the run ended, once it has. */
    readonly endedAt: number | null;
    /**
     * Whether the run has an outcome: nothing more will start. A run can be
     * over (failed) while a node already running still finishes.
     */
    readonly over: boolean;
    readonly now: number;
}

/** Where "now" is: the last event, and whether nothing has been running since it. */
export interface PipelineTimelineLive {
    readonly lastAt: number;
    readonly lastX: number;
    readonly idle: boolean;
}

/** The now line's x at a moment after the last event. */
export function pipelineTimelineNowX(live: PipelineTimelineLive, at: number): number {
    return (
        live.lastX +
        PIPELINE_TIMELINE.base +
        span((Math.max(at, live.lastAt) - live.lastAt) / 1_000, live.idle)
    );
}

/** A point that is fixed in the past, or rides the now line at an offset. */
export type PipelineTimelineX =
    | { readonly fixed: number }
    | { readonly now: number; readonly node?: string };

export type PipelineTimelineItem =
    | {
          /** Ran, from `x0` to `x1`. */
          readonly mode: "past";
          readonly id: string;
          readonly row: number;
          readonly x0: number;
          readonly x1: number;
      }
    | {
          /** Working: a trail from `x0` to the now line, and its card on it. */
          readonly mode: "live";
          readonly id: string;
          readonly row: number;
          readonly x0: number;
      }
    | {
          /** Skipped, or aborted before it began: a stub where that was decided. */
          readonly mode: "skipped";
          readonly id: string;
          readonly row: number;
          readonly x0: number;
          readonly width: number;
      }
    | {
          /** Not started and still able to: ahead of the now line by its depth. */
          readonly mode: "future";
          readonly id: string;
          readonly row: number;
          readonly offset: number;
          readonly depth: number;
      };

export interface PipelineTimelineEdge {
    /** Index into the input's edges. */
    readonly index: number;
    readonly from: PipelineTimelineX;
    readonly fromRow: number;
    readonly to: PipelineTimelineX;
    readonly toRow: number;
    /** The node ahead whose fade the edge takes, when it leads into the future. */
    readonly ahead: string | null;
}

export interface PipelineTimelineTick {
    readonly x: number;
    readonly label: string;
}

export interface PipelineTimelineLayout {
    readonly rows: number;
    readonly height: number;
    /** The track's width now: everything placed, and room for the next few seconds. */
    readonly width: number;
    readonly items: readonly PipelineTimelineItem[];
    readonly edges: readonly PipelineTimelineEdge[];
    readonly ticks: readonly PipelineTimelineTick[];
    /** Where long stretches in which nothing ran were shortened. */
    readonly breaks: readonly number[];
    /** Null once the run has ended. */
    readonly live: PipelineTimelineLive | null;
    /** The end of the run, once it has one. */
    readonly endX: number | null;
}

/** The y of a row's bar top. */
export function pipelineTimelineRowTop(row: number): number {
    const t = PIPELINE_TIMELINE;
    return t.axisHeight + t.padding + row * t.rowHeight + (t.rowHeight - t.barHeight) / 2;
}

/** `m:ss`, or `h:mm:ss`, of time since the run started. */
function clockText(ms: number): string {
    const total = Math.round(ms / 1_000);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = String(total % 60).padStart(2, "0");
    return hours > 0
        ? `${String(hours)}:${String(minutes).padStart(2, "0")}:${seconds}`
        : `${String(minutes)}:${seconds}`;
}

const TICK_STEPS = [
    1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200,
];

/** Rows from the definition: chains of nodes that cannot overlap in time. */
function rowsOf(input: PipelineTimelineInput): { rows: Map<string, number>; count: number } {
    const graph = pipelineGraphLayout(
        { nodes: input.nodes.map((node) => node.id), edges: input.edges, root: input.root },
        { nodeWidth: 1, nodeHeight: 1, columnGap: 1, rowGap: 1, padding: 0 },
    );
    const place = (id: string) => graph.nodes.get(id) ?? { x: 0, y: 0 };
    const order = [...input.nodes].sort(
        (left, right) =>
            place(left.id).x - place(right.id).x || place(left.id).y - place(right.id).y,
    );
    const incoming = new Map<string, string[]>();
    for (const edge of input.edges) {
        const list = incoming.get(edge.to) ?? [];
        if (!list.includes(edge.from)) list.push(edge.from);
        incoming.set(edge.to, list);
    }
    const chainOf = new Map<string, number>();
    const tails: string[] = [];
    const members: string[][] = [];
    for (const node of order) {
        const preds = incoming.get(node.id) ?? [];
        const blockers = node.join === "all" || preds.length === 1 ? preds : [];
        const free = blockers
            .filter((pred) => {
                const chain = chainOf.get(pred);
                return chain !== undefined && tails[chain] === pred;
            })
            .sort(
                (left, right) =>
                    Math.abs(place(left).y - place(node.id).y) -
                    Math.abs(place(right).y - place(node.id).y),
            );
        const chain = free.length > 0 ? chainOf.get(free[0]!)! : tails.length;
        if (chain === tails.length) members.push([]);
        tails[chain] = node.id;
        members[chain]!.push(node.id);
        chainOf.set(node.id, chain);
    }
    // Rows top to bottom as the graph has them, by each chain's mean height.
    const meanY = members.map(
        (ids) => ids.reduce((sum, id) => sum + place(id).y, 0) / Math.max(1, ids.length),
    );
    const rank = members
        .map((_, chain) => chain)
        .sort((left, right) => meanY[left]! - meanY[right]! || left - right);
    const rowOfChain = new Map(rank.map((chain, row) => [chain, row]));
    const rows = new Map<string, number>();
    for (const [id, chain] of chainOf) rows.set(id, rowOfChain.get(chain)!);
    return { rows, count: members.length };
}

export function pipelineTimelineLayout(input: PipelineTimelineInput): PipelineTimelineLayout {
    const t = PIPELINE_TIMELINE;
    // The now line stays while anything works, even on a run that is over.
    const working = [...input.runNodes.values()].some((node) => node.state === "running");
    const ended = !working && (input.over || input.endedAt !== null);
    const { rows, count } = rowsOf(input);
    const run = (id: string) => input.runNodes.get(id);
    // Server times before the run was made (a skewed clock) count as its making.
    const atLeast = (time: number) => Math.max(input.createdAt, time);
    const startOf = (id: string): number | null => {
        const node = run(id);
        if (!node) return null;
        if (node.startedAt !== null) return atLeast(node.startedAt);
        return node.state === "running" ? atLeast(input.startedAt ?? input.createdAt) : null;
    };
    const endOf = (id: string): number | null => {
        const node = run(id);
        const start = startOf(id);
        if (!node || start === null) return null;
        if (node.state === "running" || node.state === "pending") return null;
        const end = node.endedAt ?? input.endedAt;
        return end === null ? null : Math.max(start, atLeast(end));
    };

    // ---- Events and the time scale ----
    const times = new Set<number>([input.createdAt]);
    if (input.startedAt !== null) times.add(atLeast(input.startedAt));
    const runEnd = input.endedAt === null ? null : atLeast(input.endedAt);
    if (runEnd !== null) times.add(runEnd);
    for (const node of input.nodes) {
        const start = startOf(node.id);
        const end = endOf(node.id);
        if (start !== null) times.add(start);
        if (end !== null) times.add(end);
    }
    const events = [...times].sort((a, b) => a - b);
    const intervals = input.nodes.flatMap((node) => {
        const start = startOf(node.id);
        return start === null ? [] : [{ id: node.id, start, end: endOf(node.id) }];
    });
    const runningThrough = (from: number, to: number) =>
        intervals.some((range) => range.start <= from && (range.end ?? Infinity) >= to);
    const x = new Map<number, number>([[events[0]!, 0]]);
    const idleAfter = new Map<number, boolean>();
    for (let index = 1; index < events.length; index++) {
        const from = events[index - 1]!;
        const to = events[index]!;
        const idle = !runningThrough(from, to);
        idleAfter.set(from, idle);
        let at = x.get(from)! + t.base + span((to - from) / 1_000, idle);
        for (const range of intervals)
            if (range.end === to) at = Math.max(at, x.get(range.start)! + t.minBar);
        x.set(to, at);
    }
    const last = events.at(-1)!;
    const lastIdle = !intervals.some((range) => range.end === null);
    idleAfter.set(last, lastIdle);
    const live: PipelineTimelineLive | null = ended
        ? null
        : { lastAt: last, lastX: x.get(last)!, idle: lastIdle };
    const nowX = live ? pipelineTimelineNowX(live, input.now) : x.get(last)!;
    /** Any moment's x, as the live formula would have put it, so ticks never move. */
    const xAt = (time: number): number => {
        let index = events.length - 1;
        while (index > 0 && events[index]! > time) index -= 1;
        const from = events[index]!;
        const atFrom = x.get(from)!;
        if (time <= from) return atFrom;
        const width = t.base + span((time - from) / 1_000, idleAfter.get(from) ?? false);
        const next = events[index + 1];
        return next === undefined ? atFrom + width : Math.min(atFrom + width, x.get(next)!);
    };

    // ---- Which pending nodes can still run, and how deep ahead ----
    const incoming = new Map<string, (typeof input.edges)[number][]>();
    for (const edge of input.edges) incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), edge]);
    const joinOf = new Map(input.nodes.map((node) => [node.id, node.join]));
    const pending = (id: string) => (run(id)?.state ?? "pending") === "pending";
    // Once the run is over, nothing ahead is promised.
    const alive = new Map<string, boolean>(input.nodes.map((node) => [node.id, !input.over]));
    const fires = (edge: (typeof input.edges)[number]): boolean => {
        const state = run(edge.from)?.state ?? "pending";
        if (state === "succeeded") return edge.on === "success";
        if (state === "failed") return edge.on === "failure";
        if (state === "running") return true;
        if (state === "pending") return alive.get(edge.from) === true;
        return false;
    };
    for (let pass = 0, changed = true; changed && pass <= input.nodes.length; pass++) {
        changed = false;
        for (const node of input.nodes) {
            if (!pending(node.id) || !alive.get(node.id)) continue;
            const into = incoming.get(node.id) ?? [];
            const can =
                node.id === input.root && into.length === 0
                    ? true
                    : into.length === 0
                      ? false
                      : joinOf.get(node.id) === "all"
                        ? into.every(fires)
                        : into.some(fires);
            if (!can) {
                alive.set(node.id, false);
                changed = true;
            }
        }
    }
    const depths = new Map<string, number>();
    const depthOf = (id: string, seen: Set<string>): number => {
        if (!pending(id)) return 0;
        const known = depths.get(id);
        if (known !== undefined) return known;
        if (seen.has(id)) return 1;
        seen.add(id);
        const deepest = (incoming.get(id) ?? [])
            .filter((edge) => fires(edge))
            .reduce((most, edge) => Math.max(most, depthOf(edge.from, seen)), 0);
        depths.set(id, deepest + 1);
        return deepest + 1;
    };

    // ---- Items ----
    const items: PipelineTimelineItem[] = [];
    const placed = new Map<string, PipelineTimelineItem>();
    const stubEnd = new Map<number, number>();
    const futureOffset = (depth: number) => t.cardWidth + t.futureGap + (depth - 1) * t.futureStep;
    let furthest = 0;
    for (const node of input.nodes) {
        const row = rows.get(node.id) ?? 0;
        const state = run(node.id)?.state ?? "pending";
        const start = startOf(node.id);
        let item: PipelineTimelineItem | null = null;
        if (start !== null && state === "running" && !ended)
            item = { mode: "live", id: node.id, row, x0: x.get(start)! };
        else if (start !== null && state !== "pending") {
            const end = endOf(node.id);
            item = {
                mode: "past",
                id: node.id,
                row,
                x0: x.get(start)!,
                x1: end === null ? nowX : x.get(end)!,
            };
        } else if (state === "skipped" || state === "aborted") {
            const decided =
                run(node.id)?.endedAt ??
                (incoming.get(node.id) ?? []).reduce<number | null>((latest, edge) => {
                    const end = endOf(edge.from);
                    return end === null ? latest : Math.max(latest ?? end, end);
                }, null) ??
                input.endedAt ??
                last;
            const x0 = Math.max(xAt(decided), stubEnd.get(row) ?? -Infinity);
            // Room for the glyph and the name at the bar's 12 px type.
            const width = Math.min(t.skipWidthMax, Math.max(t.skipWidth, 38 + node.id.length * 7));
            stubEnd.set(row, x0 + width + 4);
            item = { mode: "skipped", id: node.id, row, x0, width };
        } else if (state === "pending" && alive.get(node.id)) {
            const depth = depthOf(node.id, new Set());
            item = { mode: "future", id: node.id, row, offset: futureOffset(depth), depth };
            furthest = Math.max(furthest, futureOffset(depth) + t.futureWidth);
        }
        if (item) {
            items.push(item);
            placed.set(node.id, item);
        }
    }

    // ---- Edges: those that fired, and those that still may ----
    const waitsOnUnfinished = (id: string) =>
        (incoming.get(id) ?? []).some((edge) => {
            const mode = placed.get(edge.from)?.mode;
            return (mode === "live" || mode === "future") && fires(edge);
        });
    const edges: PipelineTimelineEdge[] = [];
    input.edges.forEach((edge, index) => {
        const from = placed.get(edge.from);
        const to = placed.get(edge.to);
        if (!from || !to || from.mode === "skipped" || to.mode === "skipped") return;
        if (!fires(edge)) return;
        // An edge into a node that already started is drawn only from what started it.
        if ((to.mode === "past" || to.mode === "live") && from.mode !== "past") return;
        // Into the future, only what it still waits on: a finished node's edge
        // is drawn while nothing working or ahead leads there too.
        if (to.mode === "future" && from.mode === "past" && waitsOnUnfinished(edge.to)) return;
        const tail: PipelineTimelineX =
            from.mode === "past"
                ? { fixed: from.x1 }
                : from.mode === "live"
                  ? { now: t.cardWidth, node: from.id }
                  : { now: from.offset + t.futureWidth, node: from.id };
        const head: PipelineTimelineX =
            to.mode === "future" ? { now: to.offset, node: to.id } : { fixed: to.x0 };
        if ("fixed" in tail && "fixed" in head && head.fixed < tail.fixed) return;
        edges.push({
            index,
            from: tail,
            fromRow: from.row,
            to: head,
            toRow: to.row,
            ahead: to.mode === "future" ? to.id : from.mode === "future" ? from.id : null,
        });
    });

    // ---- Axis: nice moments since the run started, never crowded ----
    // Stretches in which nothing ran are drawn shorter than their time, so no
    // tick stands inside one; a mark at its middle says it was shortened.
    const shortened: (readonly [number, number])[] = [];
    const breaks: number[] = [];
    for (let index = 1; index < events.length; index++) {
        const from = events[index - 1]!;
        const to = events[index]!;
        if (idleAfter.get(from) && span((to - from) / 1_000, false) > t.idleCap) {
            shortened.push([from, to]);
            breaks.push((x.get(from)! + x.get(to)!) / 2);
        }
    }
    // A tick's label hangs to the right of its rule; keep it clear of the
    // break marks and of the now line's label.
    const crowded = (at: number) => breaks.some((mark) => mark > at - 8 && mark < at + 44);
    const origin = atLeast(input.startedAt ?? input.createdAt);
    const until = ended ? (runEnd ?? last) : Math.max(input.now, last);
    const ticks: PipelineTimelineTick[] =
        live !== null && xAt(origin) > nowX - t.tickNowGap
            ? []
            : [{ x: xAt(origin), label: "0:00" }];
    let previous = origin;
    for (let guard = 0; guard < 400; guard++) {
        let next: number | null = null;
        for (const step of TICK_STEPS) {
            const ms = step * 1_000;
            let candidate = origin + (Math.floor((previous - origin) / ms) + 1) * ms;
            for (let tries = 0; candidate <= until && tries < 2; ) {
                const gap = shortened.find(([from, to]) => candidate > from && candidate < to);
                if (gap) {
                    candidate = origin + Math.ceil((gap[1] - origin) / ms) * ms;
                    continue;
                }
                const at = xAt(candidate);
                if (live !== null && at > nowX - t.tickNowGap) break;
                if (at - xAt(previous) >= t.tickGap && !crowded(at)) {
                    next = candidate;
                    break;
                }
                candidate += ms;
                tries += 1;
            }
            if (next !== null) break;
        }
        if (next === null) break;
        previous = next;
        ticks.push({ x: xAt(next), label: clockText(next - origin) });
    }

    const lookahead = live ? pipelineTimelineNowX(live, input.now + 5_000) : nowX;
    const width = Math.ceil(
        Math.max(
            ...items.map((item) => (item.mode === "past" ? item.x1 : 0)),
            ...items.map((item) => (item.mode === "skipped" ? item.x0 + item.width : 0)),
            live ? lookahead + Math.max(t.cardWidth, furthest) : nowX,
        ) + 24,
    );
    return {
        rows: count,
        height: t.axisHeight + t.padding * 2 + count * t.rowHeight,
        width,
        items,
        edges,
        ticks,
        breaks,
        live,
        endX: runEnd === null ? null : x.get(runEnd)!,
    };
}
