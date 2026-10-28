import {
    createContext,
    createElement,
    Fragment,
    useContext,
    useRef,
    useState,
    type CSSProperties,
    type ReactNode,
} from "react";
import {
    CONVERSATION_MEDIA_LAYOUT_CSS_PROPERTIES,
    conversationMediaWidgetComponent,
    conversationMediaWidgetIs,
    happyAgentComponentKey,
    type ConversationMediaKind,
    type ConversationMediaLayoutNode,
    type ConversationMediaLayoutStyle,
    type ConversationMediaWidgetNode,
    type HappyAgentComponent,
    type HappyAgentComponentSitesSnapshot,
} from "happy-desktop-state";
import type { MediaImageFit } from "./ConversationMedia";
import { INLINE_PAGE_MAX_HEIGHT, type InlinePageFit } from "./inlinePageFit";
import {
    mediaComponentEstimate,
    mediaComponentHeight,
    mediaComponentHeightRecord,
    mediaComponentHeightsSubscribe,
    mediaComponentHeightsVersion,
} from "./mediaComponentHeights";
import { mediaFlowPointSize } from "./mediaLayout";
import { messageTextLayoutFontGenerationGet } from "./messageTextLayout";

/**
 * C-304 MediaTree — a layout an agent wrote for the files it presented, drawn
 * as React elements.
 *
 * The tree arrives as closed typed nodes: a handful of tags, text, line
 * breaks, the call's items by index, and a style object over a closed set of
 * CSS properties. Each property's value is normalized CSS text that
 * `happy-desktop-state` has already checked against the protocol's
 * per-property grammar (see `ConversationMediaLayoutStyle` for why values are
 * text, not typed nodes); it is set as that one property and nothing else. A
 * tone is a theme colour role and a font size one of four type steps. There is
 * no HTML and no free CSS anywhere on the path. The whole tree sits in a
 * contained box (`.happy-media-tree`) that cannot paint outside itself or grow
 * past the transcript's width. Its height is never capped: inline means all of
 * it. A tree whose height is absurd is broken, not tall (`mediaTreeSound`),
 * and is not drawn at all.
 *
 * A picture with no width of its own, or `width: auto`, is drawn at its
 * natural size in points — its pixels over its density — and shrinks to fit
 * its container but is never enlarged; `width: 100%` fills the container.
 *
 * Its height is the one in the transcript that cannot be computed: it is
 * text, flexbox, and grid written by a model. `mediaTreeHeight` lays the same
 * nodes out off-screen at the row's exact width, once per width and font
 * generation, so the row model reserves exactly what is painted.
 */

/** What an item node needs to know about the item it shows. */
export type MediaTreeItem = {
    readonly kind: ConversationMediaKind;
    readonly width?: number;
    readonly height?: number;
    /** Pixels per point, for a picture; absent is 1×. */
    readonly scale?: number;
};

/** How one item node is drawn: its box style, and what the reader is told it is. */
export type MediaTreeItemRender = {
    readonly index: number;
    readonly className: string;
    readonly style: CSSProperties;
    readonly fit?: MediaImageFit;
    /** Normalized `object-position` text. */
    readonly position?: string;
    readonly alt?: string;
};

export type MediaTreeProps = {
    className?: string;
    "data-testid"?: string;
    root: readonly ConversationMediaLayoutNode[];
    items: readonly MediaTreeItem[];
    renderItem: (item: MediaTreeItemRender) => ReactNode;
};

/** `.happy-media-tree__item`'s max-height: the tallest a picture is drawn unless the layout says. */
const MEDIA_TREE_ITEM_MAX_HEIGHT = 640;
/** A document or file in a tree is one `ResultCard`. */
const MEDIA_TREE_CARD_HEIGHT = 64;
/** A recording whose producer stated no frame takes 16:9. */
const MEDIA_TREE_VIDEO_RATIO = 16 / 9;

export function MediaTree(props: MediaTreeProps) {
    const render = (nodes: readonly ConversationMediaLayoutNode[]): ReactNode =>
        nodes.map((node, position) => {
            switch (node.type) {
                case "text":
                    return <Fragment key={position}>{node.text}</Fragment>;
                case "break":
                    return <br key={position} />;
                case "item": {
                    const item = props.items[node.index];
                    if (!item) return null;
                    const fit = mediaTreeFit(node.style?.objectFit);
                    const place = node.style?.objectPosition;
                    return (
                        <Fragment key={position}>
                            {props.renderItem({
                                index: node.index,
                                className: mediaTreeItemClass(item),
                                style: mediaTreeItemStyle(item, node.style),
                                ...(fit ? { fit } : {}),
                                ...(place ? { position: place } : {}),
                                ...(node.alt === undefined ? {} : { alt: node.alt }),
                            })}
                        </Fragment>
                    );
                }
                case "element":
                    return createElement(
                        node.tag,
                        {
                            key: position,
                            style: mediaTreeElementStyle(node.style),
                            ...mediaTreeAttributes(node.style),
                        },
                        render(node.children),
                    );
                case "chart":
                case "diagram":
                case "codeQuote":
                case "files":
                    return <MediaTreeWidget key={position} node={node} />;
            }
        });
    return (
        <div
            className={["happy-media-tree", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="media-tree"
            data-testid={props["data-testid"]}
        >
            {render(props.root)}
        </div>
    );
}

/**
 * What a tree needs from its host to draw its widgets: the pages the
 * conversation's standard components are served on, and the engine that
 * draws such a page. Absent where the host has no engine, which leaves each
 * widget's box with a line saying where it can be seen.
 */
export interface MediaTreeComponents {
    readonly sites: HappyAgentComponentSitesSnapshot;
    /** Asks the owner's store for these components' pages; it never publishes in this call. */
    request(components: readonly HappyAgentComponent[]): void;
    /** Draws the page served at `url`, at its content height. */
    render(url: string, fit: InlinePageFit): ReactNode;
}

export const MediaTreeComponentsContext = createContext<MediaTreeComponents | undefined>(undefined);

const widgetComponents = new WeakMap<ConversationMediaWidgetNode, HappyAgentComponent>();

/** The standard component a widget node is drawn as, the same object for the same node. */
function widgetComponent(node: ConversationMediaWidgetNode): HappyAgentComponent {
    let component = widgetComponents.get(node);
    if (component === undefined) {
        component = conversationMediaWidgetComponent(node);
        widgetComponents.set(node, component);
    }
    return component;
}

/** A widget's box height at `width`: what its page last reported there, or an estimate. */
function widgetHeight(node: ConversationMediaWidgetNode, width: number): number {
    return (
        mediaComponentHeight(happyAgentComponentKey(widgetComponent(node)), width) ??
        mediaComponentEstimate(node)
    );
}

const WIDGET_NAMES: Readonly<Record<ConversationMediaWidgetNode["type"], string>> = {
    chart: "chart",
    diagram: "diagram",
    codeQuote: "code",
    files: "file list",
};

/**
 * One widget node: a standard component — the same `<happy-chart>`,
 * `<happy-diagram>`, `<happy-code>`, or `<happy-files>` an HTML artifact
 * uses — drawn on a page of its own by Happy Agent's own script, so a reply's
 * chart and an artifact's chart are one implementation.
 *
 * The page's height is known only once it draws, so the box is sized
 * imperatively from the heights its pages reported (`mediaComponentHeights`),
 * by the same lookup the measuring tree makes at the same width, and the page
 * stays invisible until it has reported one. The ref callback is that whole
 * lifetime; React owns only the box and the page inside it.
 */
function MediaTreeWidget({ node }: { node: ConversationMediaWidgetNode }) {
    const components = useContext(MediaTreeComponentsContext);
    const [failure, setFailure] = useState<string | undefined>(undefined);
    const box = useRef<HTMLDivElement | null>(null);
    const component = widgetComponent(node);
    const key = happyAgentComponentKey(component);
    const site = components?.sites.get(key);
    if (components && site === undefined) components.request([component]);
    const mount = (element: HTMLDivElement | null) => {
        if (element === null) return;
        box.current = element;
        const size = () => {
            const width = element.getBoundingClientRect().width;
            const learned = mediaComponentHeight(key, width);
            element.style.height = `${String(learned ?? mediaComponentEstimate(node))}px`;
            element.toggleAttribute("data-drawn", learned !== undefined);
        };
        size();
        const observer = new ResizeObserver(size);
        observer.observe(element);
        const unsubscribe = mediaComponentHeightsSubscribe(size);
        return () => {
            observer.disconnect();
            unsubscribe();
            if (box.current === element) box.current = null;
        };
    };
    const fit: InlinePageFit = {
        heightChanged(height) {
            const element = box.current;
            if (element === null) return;
            mediaComponentHeightRecord(
                key,
                element.getBoundingClientRect().width,
                Math.min(INLINE_PAGE_MAX_HEIGHT, height),
            );
            if (failure !== undefined) setFailure(undefined);
        },
        failed(message) {
            setFailure(message);
        },
    };
    const name = WIDGET_NAMES[node.type];
    const note =
        failure ??
        (components === undefined
            ? `Open Happy Desktop to see this ${name}.`
            : site?.type === "app-outdated"
              ? `Update Happy to see this ${name}.`
              : site?.type === "unavailable"
                ? `This ${name} could not be shown.`
                : undefined);
    return (
        <div
            className="happy-media-tree__widget"
            data-widget={node.type}
            ref={mount}
            style={mediaTreeElementStyle(node.style)}
            {...mediaTreeAttributes(node.style)}
        >
            {note !== undefined ? (
                <div className="happy-media-tree__widget-note" role="status">
                    {note}
                </div>
            ) : site?.type === "opened" && components ? (
                <div className="happy-media-tree__widget-page">
                    {components.render(site.url, fit)}
                </div>
            ) : null}
        </div>
    );
}

const widgetTrees = new WeakMap<readonly ConversationMediaLayoutNode[], boolean>();

function nodesHoldWidget(nodes: readonly ConversationMediaLayoutNode[]): boolean {
    return nodes.some(
        (node) =>
            conversationMediaWidgetIs(node) ||
            (node.type === "element" && nodesHoldWidget(node.children)),
    );
}

/**
 * What a tree's height reads of the heights its widgets' pages reported, as
 * part of a cache key: empty for a tree without widgets, and otherwise the
 * `mediaComponentHeights` version, so it is measured again exactly when a
 * height arrives.
 */
export function mediaTreeWidgetsSignature(root: readonly ConversationMediaLayoutNode[]): string {
    let held = widgetTrees.get(root);
    if (held === undefined) {
        held = nodesHoldWidget(root);
        widgetTrees.set(root, held);
    }
    return held ? `w${String(mediaComponentHeightsVersion())}` : "";
}

/**
 * The inline style of one node: every CSS property the layout set, under its
 * React name, with the checked text it arrived as. The same object styles a
 * React element and an off-screen measuring node.
 */
export function mediaTreeElementStyle(
    style: ConversationMediaLayoutStyle | undefined,
): CSSProperties {
    if (!style) return {};
    const css: Record<string, string> = {};
    for (const property of CONVERSATION_MEDIA_LAYOUT_CSS_PROPERTIES) {
        const value = style[property];
        if (value !== undefined) css[property] = value;
    }
    return css as CSSProperties;
}

const FITS: ReadonlySet<string> = new Set<MediaImageFit>([
    "contain",
    "cover",
    "fill",
    "none",
    "scale-down",
]);

function mediaTreeFit(value: string | undefined): MediaImageFit | undefined {
    return value !== undefined && FITS.has(value) ? (value as MediaImageFit) : undefined;
}

/** Tone and type step are theme roles, named by attribute and resolved in CSS. */
function mediaTreeAttributes(style: ConversationMediaLayoutStyle | undefined): {
    "data-font-size"?: string;
    "data-tone"?: string;
} {
    return {
        ...(style?.fontSize ? { "data-font-size": style.fontSize } : {}),
        ...(style?.tone ? { "data-tone": style.tone } : {}),
    };
}

function mediaTreeItemClass(item: MediaTreeItem): string {
    if (item.kind === "image") return "happy-media-image-tile happy-media-tree__item";
    if (item.kind === "video") return "happy-media-video-tile happy-media-tree__item";
    return "happy-media-tree__item happy-media-tree__card";
}

/** A width that leaves the size to the content: for a picture, its natural size. */
const INTRINSIC_WIDTH = /^(?:auto|min-content|max-content|fit-content(?:\(.*\))?)$/u;
/** A height that is fixed whatever the container: a length, not a percentage. */
const DEFINITE_HEIGHT = /^\d+(?:\.\d+)?(?:px|em|rem)?$/u;

/**
 * An item's box. A document or file is a card at the layout's style. A
 * picture or recording keeps its own shape, and unless the layout gave it a
 * width it is drawn at its natural size in points, at most its container's
 * width and to the width `.happy-media-tree__item`'s height cap leaves it —
 * or, given only a fixed height, as wide as that height and its shape make
 * it. A picture at its own shape never passes the cap: whatever width it was
 * given, it narrows to the width the cap leaves it rather than letterboxing,
 * unless the layout set a height or a shape of its own.
 *
 * `object-fit` and `object-position` describe the picture inside the box, not
 * the box, and go to the tile instead.
 */
function mediaTreeItemStyle(
    item: MediaTreeItem,
    style: ConversationMediaLayoutStyle | undefined,
): CSSProperties {
    const { objectFit: _fit, objectPosition: _position, ...css } = mediaTreeElementStyle(style);
    if (item.kind !== "image" && item.kind !== "video") return css;
    const natural =
        item.kind === "image"
            ? mediaFlowPointSize(item)
            : item.width && item.height
              ? { width: item.width, height: item.height }
              : undefined;
    const ratio = natural
        ? natural.width / natural.height
        : item.kind === "video"
          ? MEDIA_TREE_VIDEO_RATIO
          : 4 / 3;
    const sized: CSSProperties = { ...css };
    /* `auto` (with or without a fallback ratio) is the picture's own shape. */
    if (sized.aspectRatio === undefined || String(sized.aspectRatio).startsWith("auto"))
        sized.aspectRatio = String(ratio);
    const naturalWidth = sized.width === undefined || INTRINSIC_WIDTH.test(String(sized.width));
    if (naturalWidth) {
        /* Given only a fixed height, the width follows from the shape. It is
           spelled out rather than left to `aspect-ratio`, which a block box
           with an automatic width does not consult in every engine.
           Otherwise the natural width is bounded by the container in the
           width itself, not only by `max-width`: a tile is not a replaced
           element, so a bare length would be its whole contribution to a
           grid track and would blow a `1fr` column out to a recording's
           1170 pixels, where a width that depends on the container
           contributes only its minimum. */
        if (sized.height !== undefined && DEFINITE_HEIGHT.test(String(sized.height)))
            sized.width = `calc(${String(sized.height)} * ${String(ratio)})`;
        else sized.width = natural ? `min(100%, ${String(natural.width)}px)` : "100%";
    }
    if (sized.maxHeight === undefined && sized.height !== undefined) sized.maxHeight = "none";
    /* A picture at its own shape that would pass the height cap — at its
       own size or at the width the layout gave it — narrows to it instead
       of letterboxing: the cap is a size, not a band around the picture. */
    if (sized.maxWidth === undefined)
        sized.maxWidth =
            sized.height === undefined &&
            sized.maxHeight === undefined &&
            sized.aspectRatio === String(ratio)
                ? `min(100%, ${String(MEDIA_TREE_ITEM_MAX_HEIGHT * ratio)}px)`
                : "100%";
    return sized;
}

let measureHost: HTMLDivElement | undefined;
const measured = new WeakMap<readonly ConversationMediaLayoutNode[], Map<string, number>>();

/**
 * The painted height of `root` at `width`: the same nodes, classes, and
 * inline styles `MediaTree` renders, laid out in a hidden box at that exact
 * width. Items are their boxes alone — a tile's contents are absolutely
 * placed and add nothing — so no picture has to load. Remembered per tree,
 * width, items, and font generation; a webfont arriving re-measures.
 */
export function mediaTreeHeight(
    root: readonly ConversationMediaLayoutNode[],
    items: readonly MediaTreeItem[],
    width: number,
): number {
    if (typeof document === "undefined") return 0;
    const key = `${String(width)}|${String(messageTextLayoutFontGenerationGet())}|${mediaTreeWidgetsSignature(root)}|${items
        .map(
            (item) =>
                `${item.kind}:${String(item.width)}x${String(item.height)}@${String(item.scale ?? 1)}`,
        )
        .join(",")}`;
    let byKey = measured.get(root);
    const known = byKey?.get(key);
    if (known !== undefined) return known;
    if (!measureHost?.isConnected) {
        measureHost = document.createElement("div");
        measureHost.setAttribute("aria-hidden", "true");
        measureHost.dataset.happyDesktopUi = "media-tree-measure";
        /* Absolute: the measuring box must sit outside every flow so laying
           out a tree in it moves nothing on screen. */
        measureHost.style.cssText =
            "position:absolute;top:0;left:-100000px;visibility:hidden;pointer-events:none;contain:layout paint;";
        document.body.append(measureHost);
    }
    measureHost.style.width = `${String(width)}px`;
    const tree = document.createElement("div");
    tree.className = "happy-media-tree";
    const widgets: [HTMLElement, ConversationMediaWidgetNode][] = [];
    for (const node of root) tree.append(...domNodes(node, items, widgets));
    measureHost.replaceChildren(tree);
    /* A widget's box is as tall as its page drew at the box's own width, which
       only the laid-out tree knows: each is sized once it has its width, by
       the lookup the painted box makes, and the tree is measured after. */
    const widths = widgets.map(([element]) => element.getBoundingClientRect().width);
    widgets.forEach(([element, node], index) => {
        element.style.height = `${String(widgetHeight(node, widths[index]!))}px`;
    });
    const height = tree.getBoundingClientRect().height;
    measureHost.replaceChildren();
    if (!byKey) {
        byKey = new Map();
        measured.set(root, byKey);
    }
    byKey.set(key, height);
    return height;
}

/**
 * The tallest a tree may lay out before it is taken for broken. No real
 * layout of a few pictures comes near it; one that does is a degenerate
 * aspect ratio or a runaway nesting, and drawing it would push the transcript
 * apart by millions of pixels. Such a tree is not clipped — it is not drawn:
 * its owner falls back to what it would show without it.
 */
const MEDIA_TREE_HEIGHT_LIMIT = 20_000;
/* The narrowest column a tree is drawn in — a side chat — and the widest, the
   chat measure less an agent row's inset. Aspect ratios grow a tree with its
   width; wrapping grows it as the width shrinks. */
const MEDIA_TREE_SOUND_WIDTHS = [320, 786] as const;

/** Whether `root` lays out at a believable height at every width it is drawn at. */
export function mediaTreeSound(
    root: readonly ConversationMediaLayoutNode[],
    items: readonly MediaTreeItem[],
): boolean {
    return MEDIA_TREE_SOUND_WIDTHS.every((width) => {
        const height = mediaTreeHeight(root, items, width);
        return Number.isFinite(height) && height <= MEDIA_TREE_HEIGHT_LIMIT;
    });
}

function styleApply(element: HTMLElement, style: CSSProperties): void {
    for (const [property, value] of Object.entries(style))
        element.style.setProperty(
            property.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`),
            String(value),
        );
}

function domNodes(
    node: ConversationMediaLayoutNode,
    items: readonly MediaTreeItem[],
    widgets: [HTMLElement, ConversationMediaWidgetNode][],
): Node[] {
    switch (node.type) {
        case "text":
            return [document.createTextNode(node.text)];
        case "break":
            return [document.createElement("br")];
        case "item": {
            const item = items[node.index];
            if (!item) return [];
            const element = document.createElement("span");
            element.className = mediaTreeItemClass(item);
            styleApply(element, mediaTreeItemStyle(item, node.style));
            if (item.kind !== "image" && item.kind !== "video") {
                const card = document.createElement("span");
                card.style.cssText = `display:block;height:${String(MEDIA_TREE_CARD_HEIGHT)}px;`;
                element.append(card);
            }
            return [element];
        }
        case "element": {
            const element = document.createElement(node.tag);
            styleApply(element, mediaTreeElementStyle(node.style));
            for (const [name, value] of Object.entries(mediaTreeAttributes(node.style)))
                element.setAttribute(name, value);
            for (const child of node.children) element.append(...domNodes(child, items, widgets));
            return [element];
        }
        default: {
            if (!conversationMediaWidgetIs(node)) return [];
            const element = document.createElement("div");
            element.className = "happy-media-tree__widget";
            styleApply(element, mediaTreeElementStyle(node.style));
            for (const [name, value] of Object.entries(mediaTreeAttributes(node.style)))
                element.setAttribute(name, value);
            widgets.push([element, node]);
            return [element];
        }
    }
}
