import type { ConversationMediaWidgetNode } from "happy-desktop-state";

/**
 * The height each standard component's page drew at, by component and width.
 *
 * A chart, diagram, code quote, or file list in a reply is a page of its own,
 * drawn by Happy Agent's standard components, and only that page knows its
 * height. The row model cannot wait for it, so a component starts at an
 * estimate from its content and the page's own height is kept here the first
 * time it reports one: the one resize when a component first loads, and the
 * exact box at once on every later mount. Bounded, and memory only.
 */

/** How many heights are kept; the oldest is forgotten first. */
const HEIGHTS_LIMIT = 1024;

const heights = new Map<string, number>();
const listeners = new Set<() => void>();
let version = 0;

function heightKey(componentKey: string, width: number): string {
    return `${String(Math.round(width))}\u0000${componentKey}`;
}

/** Keeps the height a component's page reported at `width`. */
export function mediaComponentHeightRecord(
    componentKey: string,
    width: number,
    height: number,
): void {
    if (!(width > 0) || !Number.isFinite(height) || height < 0) return;
    const key = heightKey(componentKey, width);
    const rounded = Math.ceil(height);
    if (heights.get(key) === rounded) return;
    heights.delete(key);
    heights.set(key, rounded);
    if (heights.size > HEIGHTS_LIMIT) heights.delete(heights.keys().next().value!);
    version += 1;
    for (const listener of listeners) listener();
}

/** The height a component's page reported at `width`, if it has. */
export function mediaComponentHeight(componentKey: string, width: number): number | undefined {
    return heights.get(heightKey(componentKey, width));
}

/** Changes whenever a height is learned; a layout that read the heights reads them again. */
export function mediaComponentHeightsVersion(): number {
    return version;
}

export function mediaComponentHeightsSubscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/* The standard components' own geometry, as `style.css` draws it, for the
   estimate a component starts at before its page reports a height. */
const CHART_PLOT_HEIGHT = 240;
const CHART_LEGEND_HEIGHT = 28;
const CHART_HBAR_ROW_HEIGHT = 28;
const LINE_HEIGHT = 20;
const FILE_ROW_HEIGHT = 24;
const CODE_HEADER_HEIGHT = 37;
const CODE_PADDING = 16;
const DIAGRAM_HEIGHT = 240;

/**
 * Roughly the height a component's page draws at: close enough that the one
 * correction when it reports its own is small.
 */
export function mediaComponentEstimate(node: ConversationMediaWidgetNode): number {
    switch (node.type) {
        case "chart": {
            const legend = node.series.length > 1 ? CHART_LEGEND_HEIGHT : 0;
            return node.variant === "hbar"
                ? legend + node.labels.length * CHART_HBAR_ROW_HEIGHT * node.series.length
                : legend + CHART_PLOT_HEIGHT;
        }
        case "diagram":
            return DIAGRAM_HEIGHT;
        case "codeQuote":
            return (
                (node.path === undefined ? 0 : CODE_HEADER_HEIGHT) +
                CODE_PADDING +
                node.code.split("\n").length * LINE_HEIGHT
            );
        case "files": {
            const folders = new Set(
                node.files.map((file) => file.path.split("/").slice(0, -1).join("/")),
            );
            return (node.files.length + folders.size) * FILE_ROW_HEIGHT;
        }
    }
}
