/*
 * `happy-sequence`: the calls a change runs through, in the order they
 * happen. Each part is a column headed by its name, a quiet lifeline under
 * it, one row per call, top to bottom in the order written, the call an arrow
 * from its caller's lifeline to the callee's with what it passes written over
 * it. An answer to an earlier call is dashed; a part calling itself loops.
 * The height is the number of calls, never any text.
 */

import { type FlowGraph, type FlowNode, type FlowEdge, type FlowPoint } from "./flowDiagramLayout";

/* Mono advances are 0.6em in the bundled JetBrains Mono. */
export const SEQUENCE_HEAD_HEIGHT = 28;
export const SEQUENCE_HEAD_PADDING = 10;
export const SEQUENCE_CHIP = 16;
export const SEQUENCE_DOT = 6;
export const SEQUENCE_DOT_GAP = 6;
const NAME_ADVANCE = 7.2; // 12px
const CHIP_GAP = 6;
const HEAD_GAP = 16;
/*
 * Heads stagger onto two rows once one row of them would be wider than this:
 * long names would otherwise set the calls far apart and shrink the drawing
 * in an ordinary reply column. A lifeline passing a head on the other row
 * keeps this far from it.
 */
const STAGGER_FROM = 640;
const STAGGER_GAP = 6;
const LIFELINE_CLEAR = 10;
/** One call is one row: its label, then its arrow under it. */
const STEP = 34;
const STEP_LABEL = 10;
const STEP_ARROW = 26;
const FIRST_STEP_GAP = 6;
/** The lifelines run on this far past the last call. */
const LAST_GAP = 10;
// Labels are in the interface face, 12px; this is a generous mean advance, so
// a label kept clear of the lifelines by it never touches them.
const LABEL_ADVANCE = 7;
const LABEL_ROOM = 12;
// A part calling itself loops out to its right, its label beside the loop.
const LOOP = 18;
const LOOP_TOP = 8;
const LOOP_BOTTOM = 22;
const LOOP_LABEL = 8;

export type SequenceHead = FlowNode & {
    /** Where its lifeline runs. */
    readonly x: number;
    /** The head's top: the first row, or the second when heads are staggered. */
    readonly y: number;
    readonly left: number;
    readonly width: number;
};

export type SequenceStep = FlowEdge & {
    /** The SVG path, ending where the arrowhead's tip meets the lifeline. */
    readonly d: string;
    /** Answers an earlier call the other way: drawn dashed. */
    readonly reply: boolean;
    readonly labelAt?: FlowPoint & { readonly anchor: "middle" | "start" };
};

export type FlowSequenceLayout = {
    readonly width: number;
    readonly height: number;
    readonly heads: readonly SequenceHead[];
    /** Where every lifeline ends; each starts under its own head. */
    readonly lifelineBottom: number;
    readonly steps: readonly SequenceStep[];
};

export function sequenceHeadWidth(node: FlowNode): number {
    return Math.ceil(
        SEQUENCE_HEAD_PADDING * 2 +
            (node.mark === undefined ? 0 : SEQUENCE_DOT + SEQUENCE_DOT_GAP) +
            node.id.length * NAME_ADVANCE +
            (node.chapter === undefined ? 0 : CHIP_GAP + SEQUENCE_CHIP),
    );
}

const labelWidth = (label: string | undefined): number =>
    label === undefined ? 0 : Math.ceil(label.length * LABEL_ADVANCE);

/**
 * Places the sequence. Columns go in the order the parts first appear, each
 * far enough from the next for both names — on two staggered rows when one
 * row would be too wide — and every labelled call wide enough for its label
 * between its two lifelines: a span short of that widens evenly across the
 * columns it crosses. The height is the number of calls, never any text.
 */
export function flowSequenceLayout(graph: FlowGraph): FlowSequenceLayout {
    const nodes = graph.nodes;
    const column = new Map(nodes.map((node, at) => [node.id, at]));
    const widths = nodes.map(sequenceHeadWidth);
    const needs = graph.edges
        .map((edge) => {
            const from = column.get(edge.source) ?? 0;
            const to = column.get(edge.target) ?? 0;
            if (from === to)
                return {
                    low: from,
                    high: from + 1,
                    room: LOOP + LOOP_LABEL + labelWidth(edge.label) + LABEL_ROOM,
                };
            return {
                low: Math.min(from, to),
                high: Math.max(from, to),
                room: labelWidth(edge.label) + LABEL_ROOM * 2,
            };
        })
        .sort((left, right) => left.high - right.high || right.low - left.low);
    /*
     * The distance between neighbouring lifelines. In one row of heads,
     * neighbours stand a gap apart. Staggered, every other head drops to a
     * second row, so a head only has to clear the one two along, and its
     * neighbours' lifelines; long names then stop pushing the calls apart.
     */
    const place = (staggered: boolean) => {
        const gaps = widths
            .slice(1)
            .map((width, at) =>
                staggered
                    ? Math.max(width, widths[at] ?? 0) / 2 + LIFELINE_CLEAR
                    : (widths[at] ?? 0) / 2 + HEAD_GAP + width / 2,
            );
        let tail = (widths.at(-1) ?? 0) / 2;
        const spans = [...needs];
        if (staggered)
            for (let at = 0; at + 2 < widths.length; at += 1)
                spans.push({
                    low: at,
                    high: at + 2,
                    room: (widths[at] ?? 0) / 2 + HEAD_GAP + (widths[at + 2] ?? 0) / 2,
                });
        spans.sort((left, right) => left.high - right.high || right.low - left.low);
        for (const need of spans) {
            // A loop on the last part needs its room past the last lifeline.
            if (need.high > gaps.length) {
                tail = Math.max(tail, need.room);
                continue;
            }
            const span = gaps.slice(need.low, need.high).reduce((sum, gap) => sum + gap, 0);
            if (span >= need.room) continue;
            const each = (need.room - span) / (need.high - need.low);
            for (let at = need.low; at < need.high; at += 1) gaps[at] = (gaps[at] ?? 0) + each;
        }
        const width =
            (widths[0] ?? 0) / 2 +
            gaps.reduce((sum, gap) => sum + gap, 0) +
            Math.max(tail, (widths.at(-1) ?? 0) / 2);
        return { gaps, tail, width };
    };
    const single = place(false);
    const staggered = nodes.length > 2 && single.width > STAGGER_FROM;
    const { gaps, tail } = staggered ? place(true) : single;
    let x = (widths[0] ?? 0) / 2;
    const heads = nodes.map((node, at): SequenceHead => {
        if (at > 0) x += gaps[at - 1] ?? 0;
        const width = widths[at] ?? 0;
        const centre = Math.round(x);
        return {
            ...node,
            x: centre,
            y: staggered && at % 2 === 1 ? SEQUENCE_HEAD_HEIGHT + STAGGER_GAP : 0,
            left: Math.round(centre - width / 2),
            width,
        };
    });
    const xOf = (id: string) => heads[column.get(id) ?? 0]?.x ?? 0;

    const first =
        (staggered ? SEQUENCE_HEAD_HEIGHT * 2 + STAGGER_GAP : SEQUENCE_HEAD_HEIGHT) +
        FIRST_STEP_GAP;
    const steps = graph.edges.map((edge, at): SequenceStep => {
        const top = first + at * STEP;
        const reply = graph.edges
            .slice(0, at)
            .some((earlier) => earlier.source === edge.target && earlier.target === edge.source);
        const from = xOf(edge.source);
        const to = xOf(edge.target);
        if (from === to) {
            const d = `M${String(from)},${String(top + LOOP_TOP)} H${String(from + LOOP)} V${String(top + LOOP_BOTTOM)} H${String(from + 1)}`;
            return {
                ...edge,
                d,
                reply,
                ...(edge.label === undefined
                    ? {}
                    : {
                          labelAt: {
                              x: from + LOOP + LOOP_LABEL,
                              y: top + (LOOP_TOP + LOOP_BOTTOM) / 2,
                              anchor: "start" as const,
                          },
                      }),
            };
        }
        const y = top + STEP_ARROW;
        // The tip stops a pixel short so it reads as touching the lifeline.
        const end = to > from ? to - 1 : to + 1;
        return {
            ...edge,
            d: `M${String(from)},${String(y)} H${String(end)}`,
            reply,
            ...(edge.label === undefined
                ? {}
                : {
                      labelAt: {
                          x: Math.round((from + to) / 2),
                          y: top + STEP_LABEL,
                          anchor: "middle" as const,
                      },
                  }),
        };
    });
    const last = heads.at(-1);
    const right = Math.max(
        ...heads.map((head) => head.left + head.width),
        last === undefined ? 0 : last.x + tail,
    );
    const height = first + graph.edges.length * STEP + LAST_GAP;
    return {
        width: Math.ceil(right),
        height,
        heads,
        lifelineBottom: height,
        steps,
    };
}
