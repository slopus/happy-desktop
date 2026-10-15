import { partitionComponentProps } from "./componentProps";
import { type CSSProperties } from "react";
import { MERMAID_DIAGRAM_MIN_SCALE, mermaidDiagramRender } from "./mermaidDiagramRender";
import { ScrollArea } from "./Scrollbar";
import { safeSvgElementCreate } from "./safeSvg";

export type MermaidDiagramProps = {
    className?: string;
    "data-testid"?: string;
    /** Incomplete streamed fences stay source until their message settles. */
    enabled?: boolean;
    label?: string;
    source: string;
    style?: CSSProperties;
    variant?: "document" | "message";
};

/*
 * The vector tree is Beautiful Mermaid's; these are the two things Happy says
 * about it that its options cannot. A box in Happy has round corners, and the
 * library draws every node square. A node also reads as a card rather than an
 * outline, so its stroke is left to the theme bridge and its corner radius
 * matches the cards around it.
 */
const SHADOW_STYLE = `
    :host { display: block; }
    svg { display: block; width: 100%; max-width: 100%; height: auto; }
    svg g.node > rect { rx: 8px; ry: 8px; }
    svg g.group > rect { rx: 10px; ry: 10px; }
`;

/**
 * A Mermaid fence rendered without Mermaid.js, an iframe, or untrusted DOM.
 *
 * Beautiful Mermaid synchronously returns both the SVG and its intrinsic
 * geometry. A strict static-SVG allowlist runs before a deep DOM clone enters
 * a scoped Shadow Root; source strings are never assigned as HTML. Happy theme
 * roles inherit through explicit bridge variables, so the vector tree follows
 * appearance changes without being rerendered. The source remains visible if
 * the fence is incomplete, invalid, or over budget.
 */
export function MermaidDiagram(props: MermaidDiagramProps) {
    const [local] = partitionComponentProps(props, [
        "className",
        "data-testid",
        "enabled",
        "label",
        "source",
        "style",
        "variant",
    ]);
    const enabled = local.enabled ?? true;
    const label = local.label ?? "Mermaid diagram";
    const variant = local.variant ?? "document";
    const mount = (canvas: HTMLDivElement | null) => {
        if (canvas === null) return;
        // The card says what it is showing; the canvas sits in its scroll pane.
        const element = canvas.closest<HTMLElement>(".happy-mermaid-diagram");
        if (element === null) return;
        element.dataset.renderState = "source";
        const shadow = canvas.shadowRoot ?? canvas.attachShadow({ mode: "open" });
        shadow.replaceChildren();
        if (enabled) {
            try {
                const rendered = mermaidDiagramRender(local.source);
                const svg = safeSvgElementCreate(rendered.svg);
                const style = document.createElement("style");
                style.textContent = SHADOW_STYLE;
                svg.setAttribute("aria-hidden", "true");
                canvas.style.aspectRatio = `${String(rendered.width)} / ${String(rendered.height)}`;
                canvas.style.width = `${String(rendered.width)}px`;
                // Below the floor the diagram keeps its size and its pane scrolls.
                canvas.style.minWidth = `${String(rendered.width * MERMAID_DIAGRAM_MIN_SCALE)}px`;
                shadow.replaceChildren(svg, style);
                element.dataset.renderState = "ready";
            } catch {
                element.dataset.renderState = "source";
            }
        }
        return () => {
            shadow.replaceChildren();
            canvas.style.removeProperty("aspect-ratio");
            canvas.style.removeProperty("width");
            canvas.style.removeProperty("min-width");
        };
    };
    return (
        <div
            className={[
                "happy-mermaid-diagram",
                `happy-mermaid-diagram--${variant}`,
                local.className,
            ]
                .filter(Boolean)
                .join(" ")}
            data-happy-desktop-ui="mermaid-diagram"
            data-render-state="source"
            data-renderer="beautiful-mermaid"
            data-testid={local["data-testid"]}
            style={local.style}
        >
            <ScrollArea
                axes="both"
                className="happy-mermaid-diagram__fallback"
                viewportClassName="happy-mermaid-diagram__fallback-viewport"
            >
                <pre aria-label="Mermaid source" className="happy-mermaid-diagram__source">
                    <code>{local.source}</code>
                </pre>
            </ScrollArea>
            <ScrollArea
                axes="horizontal"
                className="happy-mermaid-diagram__pane"
                viewportClassName="happy-mermaid-diagram__pane-viewport"
            >
                <div
                    aria-label={label}
                    className="happy-mermaid-diagram__canvas"
                    ref={mount}
                    role="img"
                />
            </ScrollArea>
        </div>
    );
}
