import {
    type CSSProperties,
    type KeyboardEvent,
    type MouseEvent,
    type ReactNode,
    useId,
} from "react";
import {
    FLOW_CHIP,
    FLOW_DOT,
    FLOW_DOT_GAP,
    FLOW_MIN_SCALE,
    FLOW_NODE_HEIGHT,
    FLOW_NODE_PADDING,
    FLOW_PAD,
    flowGraphLayout,
    flowMarks,
    flowParse,
    type FlowGraph,
    type FlowNode,
    type FlowNodeMark,
} from "./flowDiagramLayout";
import { ScrollArea } from "./Scrollbar";
import {
    SEQUENCE_CHIP,
    SEQUENCE_DOT,
    SEQUENCE_DOT_GAP,
    SEQUENCE_HEAD_HEIGHT,
    SEQUENCE_HEAD_PADDING,
    flowSequenceLayout,
} from "./sequenceDiagramLayout";

/**
 * - `graph` — how the parts connect: each part once, top to bottom, arrows
 *   from each part to the next.
 * - `sequence` — what happens: the calls in the order written, between
 *   lifelines.
 */
export type FlowDiagramLayout = "graph" | "sequence";

export type FlowDiagramProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    /** The fence's text: one part or one arrow per line. */
    source: string;
    layout: FlowDiagramLayout;
    /** Goes to the chapter a part's chip names; without it the chips only label. */
    onChapterOpen?: (chapter: number, chip: Element) => void;
};

const MARK_LABELS: Readonly<Record<FlowNodeMark, string>> = {
    new: "New",
    changed: "Changed",
    gone: "Removed",
};

type Placed = FlowNode & { readonly left: number; readonly top: number; readonly width: number };

/** A part's box: dot, name, chapter chip. Both layouts draw parts the same way. */
function Part(props: {
    part: Placed;
    height: number;
    padding: number;
    dot: number;
    dotGap: number;
    chip: number;
    radius: number;
    className: string;
    onChapterOpen: FlowDiagramProps["onChapterOpen"];
}) {
    const { part } = props;
    const middle = part.top + props.height / 2;
    const chipX = part.left + part.width - props.padding - props.chip / 2;
    const chapter = part.chapter;
    const open = props.onChapterOpen;
    return (
        <g className={props.className} data-mark={part.mark ?? "none"}>
            <rect
                className="happy-flow__box"
                height={props.height - 1}
                rx={props.radius}
                width={part.width - 1}
                x={part.left + 0.5}
                y={part.top + 0.5}
            />
            {part.mark === undefined ? null : (
                <circle
                    className="happy-flow__dot"
                    cx={part.left + props.padding + props.dot / 2}
                    cy={middle}
                    r={props.dot / 2}
                />
            )}
            <text
                className="happy-flow__name"
                dominantBaseline="central"
                x={
                    part.left +
                    props.padding +
                    (part.mark === undefined ? 0 : props.dot + props.dotGap)
                }
                y={middle}
            >
                {part.id}
            </text>
            {chapter === undefined ? null : (
                <g
                    aria-label={`Chapter ${String(chapter)}`}
                    className="happy-flow__chip"
                    {...(open === undefined
                        ? {}
                        : {
                              "data-openable": "",
                              onClick: (event: MouseEvent<SVGGElement>) => {
                                  open(chapter, event.currentTarget);
                              },
                              onKeyDown: (event: KeyboardEvent<SVGGElement>) => {
                                  if (event.key !== "Enter" && event.key !== " ") return;
                                  event.preventDefault();
                                  open(chapter, event.currentTarget);
                              },
                              role: "button",
                              tabIndex: 0,
                          })}
                >
                    <title>{`Go to chapter ${String(chapter)}`}</title>
                    <circle cx={chipX} cy={middle} r={props.chip / 2} />
                    <text dominantBaseline="central" textAnchor="middle" x={chipX} y={middle}>
                        {chapter}
                    </text>
                </g>
            )}
        </g>
    );
}

/** How the parts connect: nodes in rows, curves down, lanes at the right. */
function graphDrawing(graph: FlowGraph, arrow: string, props: FlowDiagramProps) {
    const layout = flowGraphLayout(graph);
    const body = (
        <>
            {layout.edges.map((edge, index) => (
                <path
                    className="happy-flow__edge"
                    d={edge.d}
                    data-back={edge.back ? "" : undefined}
                    data-mark={edge.mark ?? "none"}
                    key={`${edge.source}-${edge.target}-${String(index)}`}
                    markerEnd={`url(#${arrow})`}
                />
            ))}
            {layout.edges.map((edge, index) =>
                edge.label === undefined || edge.labelAt === undefined ? null : (
                    <text
                        className="happy-flow__edge-label"
                        data-mark={edge.mark ?? "none"}
                        dominantBaseline="central"
                        key={`label-${String(index)}`}
                        textAnchor={edge.labelAt.anchor}
                        x={edge.labelAt.x}
                        y={edge.labelAt.y}
                    >
                        {edge.label}
                    </text>
                ),
            )}
            {layout.nodes.map((node) => (
                <Part
                    chip={FLOW_CHIP}
                    className="happy-flow__node"
                    dot={FLOW_DOT}
                    dotGap={FLOW_DOT_GAP}
                    height={FLOW_NODE_HEIGHT}
                    key={node.id}
                    onChapterOpen={props.onChapterOpen}
                    padding={FLOW_NODE_PADDING}
                    part={{ ...node, left: node.x, top: node.y }}
                    radius={8}
                />
            ))}
        </>
    );
    return { width: layout.width, height: layout.height, body };
}

/** What happens: heads over lifelines, one row per call. */
function sequenceDrawing(graph: FlowGraph, arrow: string, props: FlowDiagramProps) {
    const layout = flowSequenceLayout(graph);
    const body = (
        <>
            {layout.heads.map((head) => (
                <line
                    className="happy-flow__lifeline"
                    key={`lifeline-${head.id}`}
                    x1={head.x + 0.5}
                    x2={head.x + 0.5}
                    y1={head.y + SEQUENCE_HEAD_HEIGHT}
                    y2={layout.lifelineBottom}
                />
            ))}
            {layout.steps.map((step, index) => (
                <path
                    className="happy-flow__call"
                    d={step.d}
                    data-mark={step.mark ?? "none"}
                    data-reply={step.reply ? "" : undefined}
                    key={`call-${String(index)}`}
                    markerEnd={`url(#${arrow})`}
                    transform="translate(0.5 0.5)"
                />
            ))}
            {layout.steps.map((step, index) =>
                step.label === undefined || step.labelAt === undefined ? null : (
                    <text
                        className="happy-flow__call-label"
                        data-mark={step.mark ?? "none"}
                        dominantBaseline="central"
                        key={`label-${String(index)}`}
                        textAnchor={step.labelAt.anchor}
                        x={step.labelAt.x}
                        y={step.labelAt.y}
                    >
                        {step.label}
                    </text>
                ),
            )}
            {layout.heads.map((head) => (
                <Part
                    chip={SEQUENCE_CHIP}
                    className="happy-flow__head"
                    dot={SEQUENCE_DOT}
                    dotGap={SEQUENCE_DOT_GAP}
                    height={SEQUENCE_HEAD_HEIGHT}
                    key={head.id}
                    onChapterOpen={props.onChapterOpen}
                    padding={SEQUENCE_HEAD_PADDING}
                    part={{ ...head, top: head.y }}
                    radius={6}
                />
            ))}
        </>
    );
    return { width: layout.width, height: layout.height, body };
}

/**
 * A system drawn the way a review reads, in one of two ways from the same
 * lines: as a graph of how its parts connect, or as the sequence of calls a
 * change runs through. Names are in the code face; what this change added,
 * changed, or took out — a part or an arrow — is drawn in the colour the file
 * list uses for the same thing, and the rest stays quiet. A part a chapter is
 * about wears that chapter's number, which goes to the chapter when there is
 * one to go to. A legend says only the marks the picture uses.
 */
export function FlowDiagram(props: FlowDiagramProps) {
    const id = useId();
    const parsed = flowParse(props.source);
    if (parsed.type === "invalid")
        return (
            <div
                className={["happy-flow", props.className].filter(Boolean).join(" ")}
                data-happy-desktop-ui="flow-diagram"
                data-layout={props.layout}
                data-render-state="invalid"
                data-testid={props["data-testid"]}
                style={props.style}
            >
                <p className="happy-flow__reason">This flow could not be drawn: {parsed.reason}</p>
            </div>
        );
    const arrow = `${id}-arrow`;
    const drawing: { width: number; height: number; body: ReactNode } =
        props.layout === "graph"
            ? graphDrawing(parsed.graph, arrow, props)
            : sequenceDrawing(parsed.graph, arrow, props);
    const used = flowMarks(parsed.graph);
    const pad = FLOW_PAD;
    const width = drawing.width + pad * 2;
    const height = drawing.height + pad * 2;
    // At its own size when the column holds it, else shrunk to the column
    // down to `FLOW_MIN_SCALE`, then scrolled; the row model reads the same.
    const size: CSSProperties = {
        aspectRatio: `${String(width)} / ${String(height)}`,
        width: `clamp(${String(width * FLOW_MIN_SCALE)}px, 100%, ${String(width)}px)`,
    };
    return (
        <div
            className={["happy-flow", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="flow-diagram"
            data-layout={props.layout}
            data-render-state="ready"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            {used.length === 0 ? null : (
                <div className="happy-flow__legend">
                    {used.map((mark) => (
                        <span className="happy-flow__legend-item" data-mark={mark} key={mark}>
                            {MARK_LABELS[mark]}
                        </span>
                    ))}
                </div>
            )}
            <ScrollArea
                axes="horizontal"
                className="happy-flow__scroll"
                viewportClassName="happy-flow__scroll-viewport"
            >
                <svg
                    aria-label={props.layout === "graph" ? "Flow diagram" : "Sequence diagram"}
                    className="happy-flow__canvas"
                    role="img"
                    style={size}
                    viewBox={`${String(-pad)} ${String(-pad)} ${String(width)} ${String(height)}`}
                >
                    <defs>
                        <marker
                            id={arrow}
                            markerHeight="8"
                            markerUnits="userSpaceOnUse"
                            markerWidth="8"
                            orient="auto"
                            refX="8"
                            refY="4"
                        >
                            {/* Filled with whatever colour its arrow is stroked in. */}
                            <path className="happy-flow__arrowhead" d="M0,0.5 L8,4 L0,7.5 z" />
                        </marker>
                    </defs>
                    {drawing.body}
                </svg>
            </ScrollArea>
        </div>
    );
}
