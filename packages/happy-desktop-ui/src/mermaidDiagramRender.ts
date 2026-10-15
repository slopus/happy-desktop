import { renderMermaidSVG } from "beautiful-mermaid";
import { safeSvgAssert } from "./safeSvg";

const MAX_SOURCE_BYTES = 131_072;
const MAX_SVG_BYTES = 4_194_304;
const MAX_DIMENSION = 100_000;

export const MERMAID_DIAGRAM_BORDER = 2;

/**
 * How far a diagram may be shrunk to fit the measure it is read at.
 *
 * A diagram drawn at its intrinsic size is laid out around 13px labels. A
 * narrow column — a chat beside two panels — would otherwise scale a wide
 * flowchart until its words are a few pixels tall, which is a picture of a
 * diagram rather than one. Below this the diagram keeps its size and the
 * reader scrolls it sideways instead.
 */
export const MERMAID_DIAGRAM_MIN_SCALE = 0.8;

/** The width a diagram is painted at inside a given reading measure. */
export function mermaidDiagramPaintedWidth(
    dimensions: MermaidDiagramDimensions,
    availableWidth: number,
): number {
    const inside = Math.max(0, availableWidth - MERMAID_DIAGRAM_BORDER);
    const floor = dimensions.width * MERMAID_DIAGRAM_MIN_SCALE;
    return Math.max(Math.min(dimensions.width, inside), Math.min(floor, dimensions.width));
}

export type MermaidDiagramDimensions = {
    readonly height: number;
    readonly width: number;
};

export type MermaidDiagramRender = MermaidDiagramDimensions & {
    readonly svg: string;
};

const renderOptions = {
    font: "happy Figtree",
    layerSpacing: 32,
    nodeSpacing: 20,
    padding: 16,
} as const;

function byteLength(value: string): number {
    return new TextEncoder().encode(value).byteLength;
}

function dimensionsRead(svg: string): MermaidDiagramDimensions {
    const match = svg.match(
        /^<svg\b[^>]*\bviewBox="0 0 ([0-9]+(?:\.[0-9]+)?) ([0-9]+(?:\.[0-9]+)?)"/u,
    );
    const width = Number(match?.[1]);
    const height = Number(match?.[2]);
    if (
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        width <= 0 ||
        height <= 0 ||
        width > MAX_DIMENSION ||
        height > MAX_DIMENSION
    )
        throw new Error("Beautiful Mermaid produced invalid diagram dimensions.");
    return { height, width };
}

function sourceAssert(source: string): void {
    if (byteLength(source) > MAX_SOURCE_BYTES)
        throw new Error("Mermaid source exceeds the rendering limit.");
}

function svgPrepare(svg: string): MermaidDiagramRender {
    // Beautiful Mermaid currently emits Google Fonts imports even for an
    // explicitly supplied local font. A diagram preview must never fetch them.
    const prepared = svg.replace(/@import\s+url\([^)]*\);?/giu, "");
    if (byteLength(prepared) > MAX_SVG_BYTES)
        throw new Error("Rendered Mermaid SVG exceeds the diagram limit.");
    return { ...dimensionsRead(prepared), svg: prepared };
}

/** Synchronously renders one diagram against live Happy Shadow-DOM bridges. */
export function mermaidDiagramRender(source: string): MermaidDiagramRender {
    sourceAssert(source);
    return svgPrepare(
        renderMermaidSVG(source, {
            ...renderOptions,
            accent: "var(--happy-mermaid-accent)",
            bg: "var(--happy-mermaid-background)",
            border: "var(--happy-mermaid-border)",
            fg: "var(--happy-mermaid-text)",
            line: "var(--happy-mermaid-line)",
            muted: "var(--happy-mermaid-muted)",
            surface: "var(--happy-mermaid-surface)",
        }),
    );
}

/**
 * Resolves intrinsic geometry without a DOM. Colors do not participate in
 * Beautiful Mermaid's layout, so the library defaults are sufficient here.
 */
export function mermaidDiagramMeasure(source: string): MermaidDiagramDimensions {
    sourceAssert(source);
    const { height, svg, width } = svgPrepare(renderMermaidSVG(source, renderOptions));
    // The row model must choose the same fallback as the visible component;
    // otherwise a rejected SVG would leave the virtualized geometry incorrect.
    safeSvgAssert(svg);
    return { height, width };
}

/**
 * Natural SVG height: intrinsic size until the measure constrains it, then
 * proportional, down to the scale floor it stops shrinking at.
 */
export function mermaidDiagramNaturalHeight(
    dimensions: MermaidDiagramDimensions,
    availableWidth: number,
): number {
    const paintedWidth = mermaidDiagramPaintedWidth(dimensions, availableWidth);
    return MERMAID_DIAGRAM_BORDER + (paintedWidth * dimensions.height) / dimensions.width;
}
