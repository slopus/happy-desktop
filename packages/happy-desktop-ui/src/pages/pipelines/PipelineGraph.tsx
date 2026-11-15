import { useId, type CSSProperties } from "react";
import type { PipelineEdgeOutcome, PipelineNodeKind } from "happy-desktop-state";
import { Icon } from "../../Icon";
import { ScrollArea } from "../../Scrollbar";
import {
    pipelineGraphLayout,
    type PipelineGraphLayoutMetrics,
    type PipelineGraphPoint,
} from "./pipelineGraphLayout";
import { PIPELINE_KIND_ICON, PIPELINE_KIND_LABEL, type PipelineTone } from "./pipelinePresentation";

export interface PipelineGraphNode {
    readonly id: string;
    readonly kind: PipelineNodeKind;
    /** Beside the name: what the step is, or in a run what it last said. */
    readonly detail: string;
    /** In a run: the node's state, as a colour and its word. */
    readonly state?: {
        readonly tone: PipelineTone;
        readonly label: string;
        readonly muted: boolean;
    };
    /** In a run: how far along the node said it is, from 0 to 1. */
    readonly progress?: number | null;
}

export interface PipelineGraphEdge {
    readonly from: string;
    readonly to: string;
    readonly on: PipelineEdgeOutcome;
}

export interface PipelineGraphProps {
    /** In definition order. */
    readonly nodes: readonly PipelineGraphNode[];
    readonly edges: readonly PipelineGraphEdge[];
    readonly root: string;
    readonly selectedNodeId: string | null;
    /** Selects a node; the selected node again selects nothing. */
    readonly onNodeSelect: (nodeId: string | null) => void;
    readonly "aria-label": string;
    /** A run's nodes carry a state dot and a progress lane. */
    readonly variant?: "definition" | "run";
    readonly className?: string;
    readonly style?: CSSProperties;
}

/**
 * The geometry every pipeline graph is drawn at: one dense row per node. A
 * run's progress lane sits inside the row, so both variants share it.
 */
export const PIPELINE_GRAPH_METRICS: PipelineGraphLayoutMetrics = {
    nodeWidth: 208,
    nodeHeight: 32,
    columnGap: 36,
    rowGap: 8,
    padding: 16,
};

/** How far left of the root its entry mark sits. */
const ENTRY_OFFSET = 14;

/** A smooth left-to-right path through the points; level runs stay straight. */
function edgePath(points: readonly PipelineGraphPoint[]): string {
    const [first, ...rest] = points;
    if (!first) return "";
    let path = `M ${String(first.x)} ${String(first.y)}`;
    let previous = first;
    for (const point of rest) {
        if (point.y === previous.y) path += ` L ${String(point.x)} ${String(point.y)}`;
        else {
            const bend = Math.max(16, (point.x - previous.x) / 2);
            path += ` C ${String(previous.x + bend)} ${String(previous.y)}, ${String(point.x - bend)} ${String(point.y)}, ${String(point.x)} ${String(point.y)}`;
        }
        previous = point;
    }
    return path;
}

/**
 * PipelineGraph — a pipeline's nodes and edges, laid out left to right in
 * columns from the root. Each node is one dense row: its kind's glyph, its ID,
 * and what it is or last said; success edges are solid, failure edges dashed,
 * and the root carries an entry mark on its leading side. The strip is as tall
 * as the drawing, up to a share of the page, and scrolls past that.
 */
export function PipelineGraph(props: PipelineGraphProps) {
    const markerId = useId();
    const variant = props.variant ?? "definition";
    const metrics = PIPELINE_GRAPH_METRICS;
    const layout = pipelineGraphLayout(
        { nodes: props.nodes.map((node) => node.id), edges: props.edges, root: props.root },
        metrics,
    );
    const root = layout.nodes.get(props.root);
    const middle = metrics.nodeHeight / 2;
    return (
        <ScrollArea
            axes="both"
            className={["happy-pipeline-graph", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="pipeline-graph"
            style={{ height: layout.height, ...props.style }}
            viewportClassName="happy-pipeline-graph__viewport"
        >
            <div className="happy-pipeline-graph__stage">
                <div
                    aria-label={props["aria-label"]}
                    className="happy-pipeline-graph__canvas"
                    data-happy-desktop-ui="pipeline-graph-canvas"
                    role="group"
                    style={{ width: layout.width, height: layout.height }}
                >
                    <svg
                        aria-hidden
                        className="happy-pipeline-graph__edges"
                        height={layout.height}
                        viewBox={`0 0 ${String(layout.width)} ${String(layout.height)}`}
                        width={layout.width}
                    >
                        <defs>
                            {(["success", "failure"] as const).map((outcome) => (
                                <marker
                                    className="happy-pipeline-graph__arrow"
                                    data-on={outcome}
                                    id={`${markerId}-${outcome}`}
                                    key={outcome}
                                    markerHeight="8"
                                    markerUnits="userSpaceOnUse"
                                    markerWidth="8"
                                    orient="auto"
                                    refX="8"
                                    refY="4"
                                >
                                    <path d="M 0 0 L 8 4 L 0 8 z" />
                                </marker>
                            ))}
                        </defs>
                        {layout.edges.map((edge) => {
                            const on = props.edges[edge.index]!.on;
                            return (
                                <path
                                    className="happy-pipeline-graph__edge"
                                    d={edgePath(edge.points)}
                                    data-on={on}
                                    key={edge.index}
                                    markerEnd={`url(#${markerId}-${on})`}
                                />
                            );
                        })}
                        {root ? (
                            <g className="happy-pipeline-graph__entry">
                                <circle cx={root.x - ENTRY_OFFSET} cy={root.y + middle} r="3" />
                                <path
                                    d={`M ${String(root.x - ENTRY_OFFSET + 3)} ${String(root.y + middle)} L ${String(root.x)} ${String(root.y + middle)}`}
                                />
                            </g>
                        ) : null}
                    </svg>
                    {props.nodes.map((node) => {
                        const place = layout.nodes.get(node.id);
                        if (!place) return null;
                        const isRoot = node.id === props.root;
                        return (
                            <button
                                aria-label={[
                                    node.id,
                                    PIPELINE_KIND_LABEL[node.kind],
                                    node.state?.label,
                                    isRoot ? "start" : undefined,
                                ]
                                    .filter(Boolean)
                                    .join(", ")}
                                aria-pressed={props.selectedNodeId === node.id}
                                className="happy-pipeline-node"
                                data-happy-desktop-ui="pipeline-node"
                                data-kind={node.kind}
                                data-muted={node.state?.muted ? "" : undefined}
                                data-tone={node.state?.tone}
                                data-variant={variant}
                                key={node.id}
                                onClick={() =>
                                    props.onNodeSelect(
                                        props.selectedNodeId === node.id ? null : node.id,
                                    )
                                }
                                style={{
                                    left: place.x,
                                    top: place.y,
                                    width: metrics.nodeWidth,
                                    height: metrics.nodeHeight,
                                }}
                                type="button"
                            >
                                <span className="happy-pipeline-node__kind">
                                    <Icon name={PIPELINE_KIND_ICON[node.kind]} size={14} />
                                </span>
                                <span className="happy-pipeline-node__name">{node.id}</span>
                                <span className="happy-pipeline-node__detail" title={node.detail}>
                                    {node.detail}
                                </span>
                                {node.state ? (
                                    <span
                                        aria-hidden
                                        className="happy-pipeline-node__state"
                                        title={node.state.label}
                                    />
                                ) : null}
                                {variant === "run" ? (
                                    <span
                                        aria-hidden
                                        className="happy-pipeline-node__progress"
                                        data-empty={node.progress == null ? "" : undefined}
                                    >
                                        <span
                                            className="happy-pipeline-node__progress-fill"
                                            style={{
                                                width:
                                                    node.progress == null
                                                        ? 0
                                                        : `${String(Math.round(node.progress * 100))}%`,
                                            }}
                                        />
                                    </span>
                                ) : null}
                            </button>
                        );
                    })}
                </div>
            </div>
        </ScrollArea>
    );
}

/** What the two edge strokes mean, for beside the graph. */
export function PipelineGraphLegend() {
    return (
        <span className="happy-pipeline-legend" data-happy-desktop-ui="pipeline-legend">
            <span className="happy-pipeline-legend__item">
                <span aria-hidden className="happy-pipeline-legend__stroke" data-on="success" />
                On success
            </span>
            <span className="happy-pipeline-legend__item">
                <span aria-hidden className="happy-pipeline-legend__stroke" data-on="failure" />
                On failure
            </span>
        </span>
    );
}
