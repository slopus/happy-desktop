/**
 * A layered layout for a pipeline's graph, flowing left to right.
 *
 * A pipeline is a DAG with one root, so each node takes the column of its
 * longest path from the root, which puts every edge pointing rightwards. An
 * edge that skips columns is routed through one waypoint per column it
 * crosses, and the waypoints take part in ordering, so a long edge runs in the
 * gaps between nodes instead of through them. Rows within a column are then
 * ordered by a few barycenter sweeps, which removes most crossings in graphs
 * of the size pipelines have.
 *
 * Pure geometry: integer CSS pixels, no DOM. The same graph always lays out
 * the same way, so a live run that changes node states moves nothing.
 */

export interface PipelineGraphLayoutInput {
    /** In definition order, which breaks ties. */
    readonly nodes: readonly string[];
    readonly edges: readonly { readonly from: string; readonly to: string }[];
    readonly root: string;
}

export interface PipelineGraphLayoutMetrics {
    readonly nodeWidth: number;
    readonly nodeHeight: number;
    /** Between columns. */
    readonly columnGap: number;
    /** Between nodes in one column. */
    readonly rowGap: number;
    /** Around the whole drawing. */
    readonly padding: number;
}

export interface PipelineGraphLayoutNode {
    readonly id: string;
    readonly column: number;
    readonly x: number;
    readonly y: number;
}

export interface PipelineGraphPoint {
    readonly x: number;
    readonly y: number;
}

export interface PipelineGraphLayoutEdge {
    /** Index into the input's edges. */
    readonly index: number;
    /** From the source's trailing edge, through each waypoint, to the target's leading edge. */
    readonly points: readonly PipelineGraphPoint[];
}

export interface PipelineGraphLayout {
    readonly width: number;
    readonly height: number;
    readonly nodes: ReadonlyMap<string, PipelineGraphLayoutNode>;
    readonly edges: readonly PipelineGraphLayoutEdge[];
}

const SWEEPS = 4;

/** A slot in one column: a node, or a waypoint of the edge with that index. */
type Slot =
    | { readonly kind: "node"; readonly id: string }
    | { readonly kind: "via"; readonly edge: number };

function slotKey(slot: Slot): string {
    return slot.kind === "node" ? `n:${slot.id}` : `e:${String(slot.edge)}`;
}

export function pipelineGraphLayout(
    input: PipelineGraphLayoutInput,
    metrics: PipelineGraphLayoutMetrics,
): PipelineGraphLayout {
    const ids = new Set(input.nodes);
    const edges = input.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to));

    // Longest path from the root, in topological order. Anything a cycle or a
    // missing root leaves unplaced goes one column past what feeds it, or to 0.
    const column = new Map<string, number>();
    const incoming = new Map<string, number>(input.nodes.map((id) => [id, 0]));
    for (const edge of edges) incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
    const ready = input.nodes.filter((id) => incoming.get(id) === 0);
    // The root leads, so a graph whose root is listed late still starts at it.
    ready.sort((left, right) => Number(right === input.root) - Number(left === input.root));
    for (const id of ready) column.set(id, 0);
    while (ready.length > 0) {
        const id = ready.shift()!;
        for (const edge of edges) {
            if (edge.from !== id) continue;
            column.set(edge.to, Math.max(column.get(edge.to) ?? 0, (column.get(id) ?? 0) + 1));
            const left = (incoming.get(edge.to) ?? 0) - 1;
            incoming.set(edge.to, left);
            if (left === 0) ready.push(edge.to);
        }
    }
    for (const id of input.nodes) if (!column.has(id)) column.set(id, 0);

    const columnCount = Math.max(0, ...column.values()) + 1;
    const columns: Slot[][] = Array.from({ length: columnCount }, () => []);
    for (const id of input.nodes) columns[column.get(id)!]!.push({ kind: "node", id });
    // One waypoint per column an edge crosses; a backwards edge (only in a
    // definition the cluster would refuse) is drawn straight.
    const routes = edges.map((edge, index) => {
        const from = column.get(edge.from)!;
        const to = column.get(edge.to)!;
        const vias: Slot[] = [];
        for (let crossed = from + 1; crossed < to; crossed++) {
            const via: Slot = { kind: "via", edge: index };
            columns[crossed]!.push(via);
            vias.push(via);
        }
        return { from: edge.from, to: edge.to, vias };
    });

    // Neighbours of each slot in the columns either side, for the sweeps.
    const before = new Map<string, string[]>();
    const after = new Map<string, string[]>();
    const link = (left: string, right: string): void => {
        after.set(left, [...(after.get(left) ?? []), right]);
        before.set(right, [...(before.get(right) ?? []), left]);
    };
    for (const route of routes) {
        const chain = [
            slotKey({ kind: "node", id: route.from }),
            ...route.vias.map(slotKey),
            slotKey({ kind: "node", id: route.to }),
        ];
        for (let index = 1; index < chain.length; index++) link(chain[index - 1]!, chain[index]!);
    }

    const order = new Map<string, number>();
    const renumber = (slots: readonly Slot[]): void => {
        slots.forEach((slot, index) => order.set(slotKey(slot), index));
    };
    columns.forEach(renumber);
    const sweep = (slots: Slot[], neighbours: Map<string, string[]>): void => {
        const weight = new Map<string, number>();
        slots.forEach((slot, index) => {
            const near = neighbours.get(slotKey(slot)) ?? [];
            weight.set(
                slotKey(slot),
                near.length === 0
                    ? index
                    : near.reduce((sum, key) => sum + (order.get(key) ?? 0), 0) / near.length,
            );
        });
        // Stable, so equal weights keep definition order.
        slots.sort((left, right) => weight.get(slotKey(left))! - weight.get(slotKey(right))!);
        renumber(slots);
    };
    for (let pass = 0; pass < SWEEPS; pass++) {
        for (let index = 1; index < columnCount; index++) sweep(columns[index]!, before);
        for (let index = columnCount - 2; index >= 0; index--) sweep(columns[index]!, after);
    }

    // Each column is centred on the tallest one. A waypoint takes a narrow
    // band rather than a whole row, so long edges pack between nodes.
    const viaHeight = metrics.rowGap;
    const columnHeight = (slots: readonly Slot[]): number =>
        slots.reduce(
            (sum, slot, index) =>
                sum +
                (slot.kind === "node" ? metrics.nodeHeight : viaHeight) +
                (index > 0 ? metrics.rowGap : 0),
            0,
        );
    const tallest = Math.max(metrics.nodeHeight, ...columns.map(columnHeight));
    const position = new Map<string, PipelineGraphPoint>();
    const nodes = new Map<string, PipelineGraphLayoutNode>();
    columns.forEach((slots, index) => {
        const x = metrics.padding + index * (metrics.nodeWidth + metrics.columnGap);
        let y = metrics.padding + Math.round((tallest - columnHeight(slots)) / 2);
        for (const slot of slots) {
            const height = slot.kind === "node" ? metrics.nodeHeight : viaHeight;
            if (slot.kind === "node") nodes.set(slot.id, { id: slot.id, column: index, x, y });
            position.set(slotKey(slot), { x, y: y + Math.round(height / 2) });
            y += height + metrics.rowGap;
        }
    });

    const layoutEdges = routes.map((route, index): PipelineGraphLayoutEdge => {
        const from = nodes.get(route.from)!;
        const to = nodes.get(route.to)!;
        const middle = Math.round(metrics.nodeHeight / 2);
        return {
            index: input.edges.indexOf(edges[index]!),
            points: [
                { x: from.x + metrics.nodeWidth, y: from.y + middle },
                // Straight across each crossed column, in its waypoint's band.
                ...route.vias.flatMap((via) => {
                    const point = position.get(slotKey(via))!;
                    return [point, { x: point.x + metrics.nodeWidth, y: point.y }];
                }),
                { x: to.x, y: to.y + middle },
            ],
        };
    });

    return {
        width:
            metrics.padding * 2 +
            columnCount * metrics.nodeWidth +
            Math.max(0, columnCount - 1) * metrics.columnGap,
        height: metrics.padding * 2 + tallest,
        nodes,
        edges: layoutEdges,
    };
}
