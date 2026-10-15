/*
 * The two drawings a review makes of a system, read from one syntax: named
 * parts and the arrows between them, each part saying whether this change
 * added it, changed it, or took it out, and which chapter is about it, and
 * each arrow whether this change added or changed it.
 *
 *   Transcript -> ChatStore [changed 2]: sender ids
 *   ChatStore -> AgentIdentities [new 1]: lookup [new]
 *   AgentIdentities -> ChatStore: name
 *   OldResolver [gone]
 *
 * `happy-flow` draws them as a graph — how the parts connect, top to bottom,
 * each part once (`flowGraphLayout`, below). `happy-sequence` draws them as
 * calls in the order written — what happens, step by step, between lifelines
 * (`flowSequenceLayout` in `sequenceDiagramLayout.ts`). Both are laid out
 * here rather than by a library: every name is mono and every label short,
 * so every width is known without measuring anything.
 */

export type FlowNodeMark = "new" | "changed" | "gone";

export type FlowNode = {
    readonly id: string;
    readonly mark?: FlowNodeMark;
    readonly chapter?: number;
};

export type FlowEdge = {
    readonly source: string;
    readonly target: string;
    readonly label?: string;
    /** What this change did to the call itself. */
    readonly mark?: FlowNodeMark;
};

export type FlowGraph = {
    /** In the order they first appear, which is the order of the columns. */
    readonly nodes: readonly FlowNode[];
    /** In the order they happen. */
    readonly edges: readonly FlowEdge[];
};

export type FlowParsed =
    | { readonly type: "ready"; readonly graph: FlowGraph }
    | { readonly type: "invalid"; readonly reason: string };

const NODE = /^\s*([^[\]:]+?)\s*(?:\[\s*(new|changed|gone)?\s*(\d+)?\s*\])?\s*$/u;
const LABEL = /^(.*?)\s*(?:\[\s*(new|changed|gone)\s*\])?\s*$/u;

function nodeParse(text: string): FlowNode | undefined {
    const match = NODE.exec(text);
    if (match === null || match[1] === undefined) return undefined;
    const mark = match[2] as FlowNodeMark | undefined;
    const chapter = match[3] === undefined ? undefined : Number(match[3]);
    return {
        id: match[1],
        ...(mark === undefined ? {} : { mark }),
        ...(chapter === undefined ? {} : { chapter }),
    };
}

/** Reads a `happy-flow` fence; a line it cannot read is the reason it fails. */
export function flowParse(source: string): FlowParsed {
    const nodes = new Map<string, FlowNode>();
    const edges: FlowEdge[] = [];
    const add = (node: FlowNode) => {
        const known = nodes.get(node.id);
        nodes.set(node.id, { ...known, ...node });
    };
    const lines = source.split("\n");
    for (const [index, raw] of lines.entries()) {
        const line = raw.trim();
        if (line === "") continue;
        const arrow = line.indexOf("->");
        if (arrow === -1) {
            const node = nodeParse(line);
            if (node === undefined)
                return { type: "invalid", reason: `Line ${String(index + 1)} is not a part.` };
            add(node);
            continue;
        }
        const tail = line.slice(arrow + 2);
        const colon = tail.indexOf(":");
        // A colon left before the arrow, `A: -> B: label`, says nothing.
        const from = nodeParse(line.slice(0, arrow).replace(/:\s*$/u, ""));
        const to = nodeParse(colon === -1 ? tail : tail.slice(0, colon));
        const after = LABEL.exec(colon === -1 ? "" : tail.slice(colon + 1).trim());
        const label = after?.[1] ?? "";
        const mark = after?.[2] as FlowNodeMark | undefined;
        if (from === undefined || to === undefined)
            return { type: "invalid", reason: `Line ${String(index + 1)} is not an arrow.` };
        add(from);
        add(to);
        edges.push({
            source: from.id,
            target: to.id,
            ...(label === "" ? {} : { label }),
            ...(mark === undefined ? {} : { mark }),
        });
    }
    if (nodes.size === 0) return { type: "invalid", reason: "The flow names no parts." };
    return { type: "ready", graph: { nodes: [...nodes.values()], edges } };
}

/** The marks a flow uses, parts and calls alike, in legend order. */
export function flowMarks(graph: FlowGraph): readonly FlowNodeMark[] {
    return (["new", "changed", "gone"] as const).filter(
        (mark) =>
            graph.nodes.some((node) => node.mark === mark) ||
            graph.edges.some((edge) => edge.mark === mark),
    );
}

export type FlowPoint = { readonly x: number; readonly y: number };

/** Room for the strokes and label halos round a drawing. */
export const FLOW_PAD = 4;
/** A drawing wider than its column shrinks to fit, down to this; then it scrolls. */
export const FLOW_MIN_SCALE = 0.8;

/**
 * A drawing's painted height in a column `column` wide: at its own size when
 * it fits, else shrunk to the column but no further than `FLOW_MIN_SCALE`,
 * past which it scrolls. `FlowDiagram` sizes it the same way in CSS.
 */
export function flowPaintedHeight(
    size: { readonly width: number; readonly height: number },
    column: number,
): number {
    const width = size.width + FLOW_PAD * 2;
    const height = size.height + FLOW_PAD * 2;
    return height * Math.min(1, Math.max(FLOW_MIN_SCALE, column / width));
}

/* The graph. Mono advances are 0.6em in the bundled JetBrains Mono. */
export const FLOW_NODE_HEIGHT = 36;
export const FLOW_NODE_PADDING = 12;
export const FLOW_CHIP = 18;
export const FLOW_DOT = 6;
const NAME_ADVANCE = 7.2; // 12px
export const FLOW_DOT_GAP = 8;
const CHIP_GAP = 8;
const NODE_GAP = 16;
// Between rows: room for a curve, and for a label on it when one has one.
const ROW_GAP = 36;
const LABELLED_ROW_GAP = 56;
// Labels are in the interface face, 12px; this is a generous mean advance, so
// labels kept apart by it never touch.
const LABEL_ADVANCE = 7;
const LABEL_SPACE = 8;
// Several labels in one gap alternate this far above and below its middle.
const LABEL_STAGGER = 9;
// Ports along one edge of a part, at most this far apart, clear of its corners.
const PORT_STEP = 20;
const PORT_INSET = 12;
// Arrows that do not go one row down run in lanes at the right.
const LANE_GAP = 24;
const LANE_STEP = 12;
const LANE_TURN = 10;
const LANE_LABEL_OFFSET = 8;
const CORNER = 8;

/** The face of a part a lane arrow meets. */
type LaneFace = "side" | "top" | "bottom";

export type FlowPlacedNode = FlowNode & {
    readonly x: number;
    readonly y: number;
    readonly width: number;
};

export type FlowPlacedEdge = FlowEdge & {
    /** The SVG path, ending where the arrowhead's tip meets the part. */
    readonly d: string;
    /**
     * Where the label sits: centred on a curve between two rows, or starting
     * beside a lane.
     */
    readonly labelAt?: FlowPoint & { readonly anchor: "middle" | "start" };
    /** Points back up the flow: drawn dashed, it is a reply, not a step. */
    readonly back: boolean;
};

export type FlowGraphLayout = {
    readonly width: number;
    readonly height: number;
    readonly nodes: readonly FlowPlacedNode[];
    readonly edges: readonly FlowPlacedEdge[];
};

export function flowNodeWidth(node: FlowNode): number {
    return Math.ceil(
        FLOW_NODE_PADDING * 2 +
            (node.mark === undefined ? 0 : FLOW_DOT + FLOW_DOT_GAP) +
            node.id.length * NAME_ADVANCE +
            (node.chapter === undefined ? 0 : CHIP_GAP + FLOW_CHIP),
    );
}

const labelWidth = (label: string | undefined): number =>
    label === undefined ? 0 : Math.ceil(label.length * LABEL_ADVANCE);

/** Each part's row: the longest run of forward arrows that reaches it. */
function ranks(graph: FlowGraph): Map<string, number> {
    const order = new Map(graph.nodes.map((node, index) => [node.id, index]));
    const rank = new Map(graph.nodes.map((node) => [node.id, 0]));
    // An arrow to a part written earlier is a reply; it does not push it down.
    const forward = graph.edges.filter(
        (edge) => (order.get(edge.source) ?? 0) < (order.get(edge.target) ?? 0),
    );
    for (let pass = 0; pass < graph.nodes.length; pass += 1) {
        let moved = false;
        for (const edge of forward) {
            const next = (rank.get(edge.source) ?? 0) + 1;
            if (next > (rank.get(edge.target) ?? 0)) {
                rank.set(edge.target, next);
                moved = true;
            }
        }
        if (!moved) break;
    }
    return rank;
}

/** Points along one edge of a part, centred, one per arrow. */
function ports(node: FlowPlacedNode, count: number): number[] {
    const centre = node.x + node.width / 2;
    if (count <= 1) return [Math.round(centre)];
    const step = Math.min(PORT_STEP, (node.width - PORT_INSET * 2) / (count - 1));
    return Array.from({ length: count }, (_, at) =>
        Math.round(centre + (at - (count - 1) / 2) * step),
    );
}

/**
 * Where a curve from `(sx, sy)` down to `(tx, ty)` crosses height `y`. The
 * curve's control points stand halfway down under its ends, so its height
 * only grows along it and halving finds the point.
 */
function curveX(sx: number, sy: number, tx: number, ty: number, y: number): number {
    const bend = (ty - sy) / 2;
    const along = (t: number, a: number, b: number, c: number, d: number) =>
        a * (1 - t) ** 3 + 3 * b * (1 - t) ** 2 * t + 3 * c * (1 - t) * t ** 2 + d * t ** 3;
    let low = 0;
    let high = 1;
    for (let step = 0; step < 24; step += 1) {
        const t = (low + high) / 2;
        if (along(t, sy, sy + bend, ty - bend, ty) < y) low = t;
        else high = t;
    }
    return along((low + high) / 2, sx, sx, tx, tx);
}

/** A polyline with its corners rounded. */
function rounded(points: readonly FlowPoint[]): string {
    let d = `M${String(points[0]?.x ?? 0)},${String(points[0]?.y ?? 0)}`;
    for (let at = 1; at < points.length - 1; at += 1) {
        const previous = points[at - 1];
        const corner = points[at];
        const next = points[at + 1];
        if (previous === undefined || corner === undefined || next === undefined) continue;
        const into = Math.hypot(corner.x - previous.x, corner.y - previous.y);
        const out = Math.hypot(next.x - corner.x, next.y - corner.y);
        const r = Math.min(CORNER, into / 2, out / 2);
        const a = {
            x: corner.x - ((corner.x - previous.x) / (into || 1)) * r,
            y: corner.y - ((corner.y - previous.y) / (into || 1)) * r,
        };
        const b = {
            x: corner.x + ((next.x - corner.x) / (out || 1)) * r,
            y: corner.y + ((next.y - corner.y) / (out || 1)) * r,
        };
        d += ` L${String(a.x)},${String(a.y)} Q${String(corner.x)},${String(corner.y)} ${String(b.x)},${String(b.y)}`;
    }
    const last = points.at(-1);
    if (last !== undefined) d += ` L${String(last.x)},${String(last.y)}`;
    return d;
}

/**
 * Places the flow top to bottom. Each row is centred on the widest; a part
 * sits under the parts that point at it, so arrows cross as little as they
 * can. Arrows one row down are curves from a part's foot to the next part's
 * head, each on its own port, their labels on them; the rest run in lanes at
 * the right. The height depends only on the rows and which gaps hold labels,
 * never on how wide any text is.
 */
export function flowGraphLayout(graph: FlowGraph): FlowGraphLayout {
    const rankOf = ranks(graph);
    const count = Math.max(...rankOf.values()) + 1;
    const rows = Array.from({ length: count }, (): FlowNode[] => []);
    for (const node of graph.nodes) rows[rankOf.get(node.id) ?? 0]?.push(node);
    const adjacent = (edge: FlowEdge) =>
        (rankOf.get(edge.target) ?? 0) === (rankOf.get(edge.source) ?? 0) + 1;
    const down = graph.edges.filter(adjacent);
    const lanes = graph.edges.filter((edge) => edge.source !== edge.target && !adjacent(edge));

    // Order each row by where its parents sit in the row above; between
    // equals, a part with a lane arrow goes right, nearer the lanes.
    const position = new Map<string, number>();
    const laned = (node: FlowNode) =>
        lanes.some((edge) => edge.source === node.id || edge.target === node.id) ? 1 : 0;
    for (const [rank, row] of rows.entries()) {
        const centre = (node: FlowNode) => {
            const parents = down
                .filter((edge) => edge.target === node.id)
                .map((edge) => position.get(edge.source) ?? 0);
            return rank === 0 || parents.length === 0
                ? row.length
                : parents.reduce((sum, at) => sum + at, 0) / parents.length;
        };
        row.sort((left, right) => centre(left) - centre(right) || laned(left) - laned(right));
        for (const [at, node] of row.entries()) position.set(node.id, at);
    }

    const rowWidth = rows.map(
        (row) =>
            row.reduce((sum, node) => sum + flowNodeWidth(node), 0) +
            Math.max(0, row.length - 1) * NODE_GAP,
    );
    const inner = Math.max(...rowWidth);

    // Across first: a part centred under its parents, then rows pushed apart.
    const placedById = new Map<string, FlowPlacedNode>();
    for (const [rank, row] of rows.entries()) {
        let packed = Math.round((inner - (rowWidth[rank] ?? 0)) / 2);
        const wanted = row.map((node) => {
            const width = flowNodeWidth(node);
            const fallback = packed;
            packed += width + NODE_GAP;
            const parents = down
                .filter((edge) => edge.target === node.id)
                .flatMap((edge) => {
                    const parent = placedById.get(edge.source);
                    return parent === undefined ? [] : [parent.x + parent.width / 2];
                });
            return {
                width,
                x:
                    parents.length === 0
                        ? fallback
                        : Math.round(
                              parents.reduce((sum, at) => sum + at, 0) / parents.length - width / 2,
                          ),
            };
        });
        for (const [at, entry] of wanted.entries()) {
            const previous = wanted[at - 1];
            entry.x = Math.max(
                entry.x,
                previous === undefined ? 0 : previous.x + previous.width + NODE_GAP,
            );
        }
        for (let at = wanted.length - 1; at >= 0; at -= 1) {
            const entry = wanted[at];
            if (entry === undefined) continue;
            const next = wanted[at + 1];
            entry.x = Math.min(
                entry.x,
                next === undefined ? inner - entry.width : next.x - NODE_GAP - entry.width,
            );
        }
        for (const [at, node] of row.entries()) {
            const entry = wanted[at];
            if (entry !== undefined)
                placedById.set(node.id, { ...node, x: entry.x, y: 0, width: entry.width });
        }
    }

    /*
     * A lane arrow meets a part at its side only when nothing stands to its
     * right; otherwise it would run through that neighbour, so it uses the
     * face toward where it goes: a jump leaves a foot and comes in at a head,
     * a reply leaves a head and comes back in at a foot.
     */
    const outermost = (id: string) => rows[rankOf.get(id) ?? 0]?.at(-1)?.id === id;
    const backward = (edge: FlowEdge) =>
        (rankOf.get(edge.target) ?? 0) <= (rankOf.get(edge.source) ?? 0);
    const leaveFace = (edge: FlowEdge): LaneFace =>
        outermost(edge.source) ? "side" : backward(edge) ? "top" : "bottom";
    const enterFace = (edge: FlowEdge): LaneFace =>
        outermost(edge.target) ? "side" : backward(edge) ? "bottom" : "top";
    const turns = lanes.flatMap((edge) => [
        { face: leaveFace(edge), rank: rankOf.get(edge.source) ?? 0 },
        { face: enterFace(edge), rank: rankOf.get(edge.target) ?? 0 },
    ]);
    const above = turns.some((turn) => turn.face === "top" && turn.rank === 0) ? LANE_TURN + 2 : 0;
    const below = turns.some((turn) => turn.face === "bottom" && turn.rank === count - 1)
        ? LANE_TURN + 2
        : 0;

    // Then down: each gap tall enough for its curves, and their labels.
    const gapBelow = rows.map((_, rank) =>
        down.some((edge) => rankOf.get(edge.source) === rank && edge.label !== undefined)
            ? LABELLED_ROW_GAP
            : ROW_GAP,
    );
    const nodes: FlowPlacedNode[] = [];
    let top = above;
    for (const [rank, row] of rows.entries()) {
        for (const node of row) {
            const placed = placedById.get(node.id);
            if (placed === undefined) continue;
            const moved = { ...placed, y: top };
            nodes.push(moved);
            placedById.set(node.id, moved);
        }
        top += FLOW_NODE_HEIGHT + (rank === count - 1 ? 0 : (gapBelow[rank] ?? 0));
    }
    const centreOf = (id: string) => {
        const node = placedById.get(id);
        return node === undefined ? 0 : node.x + node.width / 2;
    };

    // Each arrow gets its own port at its part's foot and at the next head,
    // in the order of what lies at the other end, so curves do not cross there.
    const outPort = new Map<FlowEdge, number>();
    const inPort = new Map<FlowEdge, number>();
    for (const node of nodes) {
        const leaving = down
            .filter((edge) => edge.source === node.id)
            .sort((left, right) => centreOf(left.target) - centreOf(right.target));
        const at = ports(node, leaving.length);
        for (const [index, edge] of leaving.entries()) outPort.set(edge, at[index] ?? 0);
        const coming = down
            .filter((edge) => edge.target === node.id)
            .sort((left, right) => centreOf(left.source) - centreOf(right.source));
        const into = ports(node, coming.length);
        for (const [index, edge] of coming.entries()) inPort.set(edge, into[index] ?? 0);
    }
    // A part's only arrow to a part that sits under it, and is its only
    // arrow in, drops straight, through the middle of where the two overlap.
    for (const edge of down) {
        const from = placedById.get(edge.source);
        const to = placedById.get(edge.target);
        if (from === undefined || to === undefined) continue;
        const alone =
            down.filter((other) => other.source === edge.source).length === 1 &&
            down.filter((other) => other.target === edge.target).length === 1;
        const left = Math.max(from.x, to.x) + PORT_INSET;
        const right = Math.min(from.x + from.width, to.x + to.width) - PORT_INSET;
        if (!alone || left > right) continue;
        const sx = outPort.get(edge) ?? 0;
        const tx = inPort.get(edge) ?? 0;
        const x = Math.abs(sx - tx) < 2 ? sx : Math.round((left + right) / 2);
        outPort.set(edge, x);
        inPort.set(edge, x);
    }

    /*
     * Labels sit on their curves. One label in a gap sits at its curve's
     * middle; several take turns a little above and below it, left to right,
     * so side by side they never read as one line, and in each of those two
     * lines they are pushed apart.
     */
    const labelAt = new Map<FlowEdge, FlowPoint>();
    for (const [rank, row] of rows.entries()) {
        const rowTop = (row[0] === undefined ? undefined : placedById.get(row[0].id))?.y;
        const next = rows[rank + 1]?.[0];
        const bottom = next === undefined ? undefined : placedById.get(next.id)?.y;
        if (rowTop === undefined || bottom === undefined) continue;
        const sy = rowTop + FLOW_NODE_HEIGHT;
        const middle = (sy + bottom) / 2;
        const labelled = down
            .filter((edge) => rankOf.get(edge.source) === rank && edge.label !== undefined)
            .map((edge) => ({
                edge,
                half: labelWidth(edge.label) / 2 + LABEL_SPACE / 2,
                sx: outPort.get(edge) ?? 0,
                tx: inPort.get(edge) ?? 0,
            }))
            .sort((left, right) => left.sx + left.tx - (right.sx + right.tx));
        const lines =
            labelled.length > 1 ? [middle - LABEL_STAGGER, middle + LABEL_STAGGER] : [middle];
        for (const [line, y] of lines.entries()) {
            const placed = labelled
                .filter((_, at) => at % lines.length === line)
                .map((entry) => ({ ...entry, x: curveX(entry.sx, sy, entry.tx, bottom, y) }));
            let drift = 0;
            for (const [at, entry] of placed.entries()) {
                const previous = placed[at - 1];
                if (previous === undefined) continue;
                const least = previous.x + previous.half + entry.half;
                if (entry.x < least) {
                    drift += least - entry.x;
                    entry.x = least;
                }
            }
            // Pushing only rightwards drifts the line; centre it back.
            const shift = placed.length === 0 ? 0 : drift / placed.length / 2;
            const first = placed[0];
            const floor = first === undefined ? 0 : first.half - (first.x - shift);
            for (const entry of placed)
                labelAt.set(entry.edge, {
                    x: Math.round(entry.x - shift + Math.max(0, floor)),
                    y: Math.round(y),
                });
        }
    }

    let right = inner;
    let lane = 0;
    const edges = graph.edges.flatMap((edge): FlowPlacedEdge[] => {
        const from = placedById.get(edge.source);
        const to = placedById.get(edge.target);
        if (from === undefined || to === undefined || from === to) return [];
        const back = (rankOf.get(edge.target) ?? 0) <= (rankOf.get(edge.source) ?? 0);
        if (adjacent(edge)) {
            const sx = outPort.get(edge) ?? 0;
            const tx = inPort.get(edge) ?? 0;
            const sy = from.y + FLOW_NODE_HEIGHT;
            const ty = to.y;
            const bend = (ty - sy) / 2;
            const d =
                sx === tx
                    ? `M${String(sx)},${String(sy)} L${String(tx)},${String(ty)}`
                    : `M${String(sx)},${String(sy)} C${String(sx)},${String(sy + bend)} ${String(tx)},${String(ty - bend)} ${String(tx)},${String(ty)}`;
            const at = labelAt.get(edge);
            if (edge.label === undefined || at === undefined) return [{ ...edge, back, d }];
            right = Math.max(right, at.x + labelWidth(edge.label) / 2);
            return [{ ...edge, back, d, labelAt: { ...at, anchor: "middle" } }];
        }
        // A reply or a jump: out to a lane, down or up it, back in.
        const laneX = inner + LANE_GAP + lane * LANE_STEP;
        lane += 1;
        const portOut = from.x + from.width - PORT_INSET;
        const portIn = to.x + to.width - PORT_INSET;
        // Where a face is met, and the line in the gap beside it.
        const faceY = (node: FlowPlacedNode, face: LaneFace) =>
            face === "top" ? node.y : node.y + FLOW_NODE_HEIGHT;
        const turnY = (node: FlowPlacedNode, face: LaneFace) =>
            face === "top" ? node.y - LANE_TURN : node.y + FLOW_NODE_HEIGHT + LANE_TURN;
        const out = leaveFace(edge);
        const leave =
            out === "side"
                ? [
                      { x: from.x + from.width, y: from.y + FLOW_NODE_HEIGHT / 2 },
                      { x: laneX, y: from.y + FLOW_NODE_HEIGHT / 2 },
                  ]
                : [
                      { x: portOut, y: faceY(from, out) },
                      { x: portOut, y: turnY(from, out) },
                      { x: laneX, y: turnY(from, out) },
                  ];
        const into = enterFace(edge);
        const enter =
            into === "side"
                ? [
                      { x: laneX, y: to.y + FLOW_NODE_HEIGHT / 2 },
                      { x: to.x + to.width, y: to.y + FLOW_NODE_HEIGHT / 2 },
                  ]
                : [
                      { x: laneX, y: turnY(to, into) },
                      { x: portIn, y: turnY(to, into) },
                      { x: portIn, y: faceY(to, into) },
                  ];
        const d = rounded([...leave, ...enter]);
        right = Math.max(right, laneX);
        if (edge.label === undefined) return [{ ...edge, back, d }];
        const sy = leave.at(-1)?.y ?? 0;
        const ty = enter[0]?.y ?? 0;
        const at = {
            x: laneX + LANE_LABEL_OFFSET,
            y: Math.round((sy + ty) / 2),
            anchor: "start" as const,
        };
        right = Math.max(right, at.x + labelWidth(edge.label));
        return [{ ...edge, back, d, labelAt: at }];
    });
    return { width: Math.ceil(right), height: top + below, nodes, edges };
}
