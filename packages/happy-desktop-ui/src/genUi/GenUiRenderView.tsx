import { Children, createContext, useContext, useRef, useState, type ReactNode } from "react";
import { Button } from "../Button";
import { CodeBlock } from "../CodeBlock";
import { CopyButton } from "../CopyButton";
import { Lightbox } from "../Lightbox";
import { ModalOverlay } from "../ModalOverlay";
import { thumbhashDataUrl } from "../thumbhashDataUrl";
import { GenUiIcon } from "./GenUiIcon";
import { genUiFill, genUiInk, genUiMarkerTones, genUiText } from "./genUiTheme";
import { GenUiPlot } from "./GenUiPlot";
import type {
    GenUiAction,
    GenUiActionType,
    GenUiBox,
    GenUiButton,
    GenUiGrid,
    GenUiImage,
    GenUiMarker,
    GenUiPress,
    GenUiRenderDocument,
    GenUiRenderNode,
    GenUiScroll,
    GenUiSpark,
    GenUiText,
    GenUiTone,
    GenUiViewerItem,
} from "./genUiRender";

/*
 * GenUiRenderView draws a Gen UI render document: fifteen primitives whose
 * roles, gaps and shapes map onto the app's own type, spacing and surfaces
 * (styles/gen-ui.css), and whose tones and colours are the shared Gen UI
 * theme, painted inline from genUiTheme.ts. The document carries no dimensions; every
 * number here is the desktop's.
 *
 * A renderer never runs an action. It tells the host `(elementKey, action)`
 * and the host decides. Picture loading goes through the host too: a `file` is
 * a path in the artifact, and only the host knows its authenticated address.
 */

export type GenUiActionHandler = (elementKey: string, action: GenUiAction) => void | Promise<void>;

export type GenUiRenderViewProps = {
    readonly document: GenUiRenderDocument;
    /**
     * Told when the person activates an interactive element. A returned
     * promise holds that control pressed until it settles, so the action
     * cannot be triggered twice while the host is handling it.
     */
    readonly onAction?: GenUiActionHandler;
    /** Which kinds of action the host can run; the others are drawn unavailable. */
    readonly actionsSupported?: ReadonlySet<GenUiActionType>;
    /** The address of one of the artifact's files, through the host's file route. */
    readonly fileUrl: (path: string) => string;
    /**
     * Told when the person taps an image that opens the viewer. The viewer is
     * not an action: when the host takes this, it owns the viewer; without it
     * the view opens its own over the window.
     */
    readonly onViewerOpen?: (elementKey: string, group: string, index: number) => void;
    /** Holds every loop on one frame, for fixtures and screenshots. */
    readonly still?: boolean;
};

/** Where "regular" layouts begin, in CSS pixels of the document's own width. */
const REGULAR_MIN_WIDTH = 560;

const ALL_ACTIONS: ReadonlySet<GenUiActionType> = new Set([
    "message",
    "open",
    "copy",
    "tool",
    "secret",
    "cluster_secret",
    "plugin",
]);

type Host = {
    readonly act: (elementKey: string, action: GenUiAction) => Promise<void>;
    readonly supported: (action: GenUiAction) => boolean;
    readonly fileUrl: (path: string) => string;
    readonly still: boolean;
    readonly compact: boolean;
    readonly viewerOpen: (elementKey: string, group: string, index: number) => void;
    /** Single-choice groups: the key picked in each group so far. */
    readonly picked: ReadonlyMap<string, string>;
    readonly pick: (group: string, elementKey: string) => void;
};

const HostContext = createContext<Host>({
    act: async () => {},
    supported: () => true,
    fileUrl: (path) => path,
    still: false,
    compact: false,
    viewerOpen: () => {},
    picked: new Map(),
    pick: () => {},
});

/** Whether a box is inside a card, so a nested card drops its frame. */
const InCardContext = createContext(false);

const NOT_SUPPORTED = "Not supported yet";

/* ---- Pressed state ---------------------------------------------------------- */

type Press = "idle" | "pending" | "done";

/** How long a handled action keeps its done mark before the control is offered again. */
const DONE_MS = 1_600;

/**
 * One activatable element's state: held while the host handles its action,
 * then done for a moment. In a single-choice group the first pick sticks, and
 * every other member of the group is disabled.
 */
function useActivation(
    elementKey: string,
    action: GenUiAction | undefined,
    group: string | undefined,
) {
    const host = useContext(HostContext);
    const [press, setPress] = useState<Press>("idle");
    const supported = action !== undefined && host.supported(action);
    const picked = group === undefined ? undefined : host.picked.get(group);
    const chosen = picked !== undefined && picked === elementKey;
    const disabled = !supported || (picked !== undefined && !chosen);
    const run = () => {
        if (!action || disabled || press !== "idle" || chosen) return;
        if (group !== undefined) host.pick(group, elementKey);
        setPress("pending");
        host.act(elementKey, action).then(
            () => {
                setPress("done");
                setTimeout(() => setPress("idle"), DONE_MS);
            },
            () => setPress("idle"),
        );
    };
    return { press, run, disabled, chosen, supported };
}

/* ---- Text ------------------------------------------------------------------ */

function TextView(props: { node: GenUiText }) {
    const { node } = props;
    const host = useContext(HostContext);
    return (
        <p
            className="gen-ui-text"
            data-align={node.align}
            data-fixed={node.fixed ? "" : undefined}
            data-overflow={node.overflow}
            data-role={node.role}
            data-tone={node.tone}
            style={node.tone ? { color: genUiText(node.tone) } : undefined}
        >
            {node.spans.map((span, index) => {
                let body: ReactNode = span.text;
                if (span.code) body = <code className="gen-ui-inline-code">{body}</code>;
                if (span.emphasis) body = <em>{body}</em>;
                if (span.strong) body = <strong>{body}</strong>;
                const link = span.link;
                if (link !== undefined)
                    body = (
                        <a
                            className="gen-ui-link"
                            href={link}
                            onClick={(event) => {
                                event.preventDefault();
                                void host.act(node.key, { type: "open", url: link });
                            }}
                        >
                            {body}
                        </a>
                    );
                return <span key={index}>{body}</span>;
            })}
        </p>
    );
}

/* ---- Media ----------------------------------------------------------------- */

function Picture(props: { node: GenUiImage }) {
    const { node } = props;
    const host = useContext(HostContext);
    const placeholder = thumbhashDataUrl(node.thumbhash);
    const viewer = node.viewer;
    const picture = (
        <span
            className="gen-ui-image"
            data-happy-desktop-ui="gen-ui-image"
            data-role={node.role}
            data-shape={node.shape}
            style={placeholder ? { backgroundImage: `url("${placeholder}")` } : undefined}
        >
            <span aria-hidden="true" className="gen-ui-image__glyph">
                <GenUiIcon name="image" size={20} />
            </span>
            <img
                alt={node.alt}
                decoding="async"
                draggable={false}
                height={node.height}
                loading="lazy"
                onError={(event) => {
                    event.currentTarget.dataset.failed = "";
                }}
                src={host.fileUrl(node.file)}
                width={node.width}
            />
            {node.overlay !== undefined ? (
                <span className="gen-ui-image__overlay">{node.overlay}</span>
            ) : null}
        </span>
    );
    if (!viewer) return picture;
    return (
        <button
            aria-label={node.alt}
            className="gen-ui-image-open"
            data-role={node.role}
            data-shape={node.shape}
            onClick={() => host.viewerOpen(node.key, viewer.group, viewer.index)}
            type="button"
        >
            {picture}
        </button>
    );
}

/* ---- Containers ------------------------------------------------------------ */

/**
 * The tiles of a mosaic by count: 1 alone, 2 side by side, 3 one large beside
 * two stacked, 4 as 2 × 2, 5 as two over three. The compiler gives the tiles;
 * this arrangement is the platform's.
 */
function Mosaic(props: { node: GenUiBox; tiles: readonly ReactNode[] }) {
    const tiles = props.tiles;
    const rows =
        tiles.length >= 5
            ? [tiles.slice(0, 2), tiles.slice(2, 5)]
            : tiles.length === 4
              ? [tiles.slice(0, 2), tiles.slice(2, 4)]
              : [tiles];
    return (
        <div
            className="gen-ui-mosaic"
            data-count={Math.min(tiles.length, 5)}
            data-happy-desktop-ui="gen-ui-mosaic"
        >
            {tiles.length === 3 ? (
                <div className="gen-ui-mosaic__row" data-layout="feature">
                    <div className="gen-ui-mosaic__cell" data-span="2">
                        {tiles[0]}
                    </div>
                    <div className="gen-ui-mosaic__column">
                        <div className="gen-ui-mosaic__cell">{tiles[1]}</div>
                        <div className="gen-ui-mosaic__cell">{tiles[2]}</div>
                    </div>
                </div>
            ) : (
                rows.map((row, index) => (
                    <div className="gen-ui-mosaic__row" key={index}>
                        {row.map((tile, cell) => (
                            <div className="gen-ui-mosaic__cell" key={cell}>
                                {tile}
                            </div>
                        ))}
                    </div>
                ))
            )}
        </div>
    );
}

/* A divided row that is itself a pressable item gives its padding to the press. */
function pressRole(node: GenUiRenderNode | undefined) {
    return node?.type === "press" ? node.role : undefined;
}

function BoxView(props: { node: GenUiBox }) {
    const { node } = props;
    const inCard = useContext(InCardContext);
    const children = node.children.map((child) => <Node key={child.key} node={child} />);
    /* A mosaic of pictures is laid out here by count. An older compiler sent
       its rows as boxes; those are drawn as the boxes they are. */
    if (node.role === "mosaic" && node.children.every((child) => child.type === "image"))
        return <Mosaic node={node} tiles={children} />;
    /* Hairlines between children are drawn by a cell around each child, so the
       line can stop at the shared leading column. */
    const cells =
        node.divide === "none"
            ? node.equal
                ? Children.map(children, (child) => (
                      <div className="gen-ui-box__share">{child}</div>
                  ))
                : children
            : children.map((child, index) => (
                  <div
                      className="gen-ui-box__divided"
                      data-press={pressRole(node.children[index])}
                      key={node.children[index]?.key}
                  >
                      {child}
                  </div>
              ));
    const nested = node.role === "card" && inCard;
    const box = (
        <div
            className="gen-ui-box"
            data-align={node.align}
            data-direction={node.direction}
            data-divide={node.divide}
            data-equal={node.equal ? "" : undefined}
            data-gap={node.gap}
            data-grow={node.grow ? "" : undefined}
            data-happy-desktop-ui={`gen-ui-box-${node.role}`}
            data-justify={node.justify}
            data-leading={node.leading}
            data-nested={nested ? "" : undefined}
            data-role={node.role}
            data-tone={node.role === "notice" ? (node.tone ?? "neutral") : undefined}
            style={
                node.role === "notice"
                    ? { background: genUiFill(node.tone ?? "neutral") }
                    : undefined
            }
            data-wrap={node.wrap ? "" : undefined}
            role={node.role === "notice" ? "note" : undefined}
        >
            {cells}
        </div>
    );
    return node.role === "card" ? <InCardContext value>{box}</InCardContext> : box;
}

function GridView(props: { node: GenUiGrid }) {
    const { node } = props;
    const count = node.columns.length;
    return (
        <div
            className="gen-ui-grid"
            data-density={node.density}
            data-divide={node.divide ? "" : undefined}
            data-happy-desktop-ui="gen-ui-grid"
            role="table"
            style={{
                gridTemplateColumns: node.columns
                    .map((column) => (column.width === "fill" ? "minmax(0, 1fr)" : "auto"))
                    .join(" "),
            }}
        >
            {node.children.map((child, index) => {
                const row = Math.floor(index / count);
                const columnIndex = index % count;
                const column = node.columns[columnIndex];
                const head = node.header && row === 0;
                return (
                    <div
                        className="gen-ui-grid__cell"
                        data-align={column?.align ?? "start"}
                        data-edge={
                            columnIndex === 0
                                ? "start"
                                : columnIndex === count - 1
                                  ? "end"
                                  : undefined
                        }
                        data-first-row={row === 0 ? "" : undefined}
                        data-head={head ? "" : undefined}
                        key={child.key}
                        role={
                            head
                                ? "columnheader"
                                : child.type === "text" && child.role === "rowhead"
                                  ? "rowheader"
                                  : "cell"
                        }
                    >
                        <Node node={child} />
                    </div>
                );
            })}
        </div>
    );
}

function ScrollView(props: { node: GenUiScroll }) {
    const { node } = props;
    const scroller = useRef<HTMLDivElement | null>(null);
    /* No arrows until the cards are measured: one shown before then could vanish. */
    const [edges, setEdges] = useState({ start: true, end: true });
    const edgesRead = (element: HTMLDivElement) => {
        const start = element.scrollLeft <= 1;
        const end = element.scrollLeft + element.clientWidth >= element.scrollWidth - 1;
        if (start !== edges.start || end !== edges.end) setEdges({ start, end });
    };
    const page = (direction: 1 | -1) => {
        const element = scroller.current;
        if (!element) return;
        const card = element.querySelector<HTMLElement>(".gen-ui-scroll__item");
        const step = card ? card.offsetWidth + 12 : element.clientWidth;
        element.scrollBy({ left: direction * step * 2, behavior: "smooth" });
    };
    const arrow = (side: "start" | "end") => (
        <span className="gen-ui-scroll__arrow" data-side={side}>
            <Button
                aria-label={side === "start" ? "Previous" : "Next"}
                iconOnly
                onClick={() => page(side === "start" ? -1 : 1)}
                size="small"
                variant="secondary"
            >
                <GenUiIcon className="gen-ui-scroll__glyph" name="chevron-right" size={16} />
            </Button>
        </span>
    );
    return (
        <div
            className="gen-ui-scroll"
            data-happy-desktop-ui="gen-ui-scroll"
            data-shape={node.shape}
        >
            <div
                className="gen-ui-scroll__scroller"
                onScroll={(event) => edgesRead(event.currentTarget)}
                ref={(element) => {
                    scroller.current = element;
                    if (!element) return;
                    /* Whether anything lies past the end is known only once the
                       cards are laid out, and changes with the width. */
                    const observer = new ResizeObserver(() => edgesRead(element));
                    observer.observe(element);
                    return () => observer.disconnect();
                }}
            >
                <div className="gen-ui-scroll__track" role="list">
                    {node.children.map((child) => (
                        <div className="gen-ui-scroll__item" key={child.key} role="listitem">
                            <Node node={child} />
                        </div>
                    ))}
                </div>
            </div>
            {edges.start ? null : arrow("start")}
            {edges.end ? null : arrow("end")}
        </div>
    );
}

/* ---- Input ----------------------------------------------------------------- */

const buttonVariants = {
    primary: "primary",
    secondary: "secondary",
    plain: "ghost",
    chip: "secondary",
} as const;

function ButtonView(props: { node: GenUiButton }) {
    const { node } = props;
    const { press, run, disabled, chosen, supported } = useActivation(
        node.key,
        node.action,
        node.group,
    );
    const chip = node.variant === "chip";
    const glyph = press === "done" || chosen ? "check" : node.icon;
    return (
        <Button
            aria-pressed={chosen || press !== "idle" ? true : undefined}
            className="gen-ui-button"
            data-button-tone={node.tone}
            data-chip={chip ? "" : undefined}
            data-gen-ui-key={node.key}
            data-picked={chosen ? "" : undefined}
            data-press={press}
            disabled={disabled || press !== "idle"}
            onClick={run}
            size={chip ? "small" : "medium"}
            style={
                node.tone === "neutral"
                    ? undefined
                    : node.variant === "primary"
                      ? { backgroundColor: genUiInk(node.tone) }
                      : { color: genUiText(node.tone) }
            }
            title={supported ? undefined : NOT_SUPPORTED}
            variant={buttonVariants[node.variant]}
            working={press === "pending"}
        >
            {glyph && press !== "pending" ? (
                <GenUiIcon
                    className="gen-ui-button__glyph"
                    name={glyph}
                    size={chip ? 14 : 16}
                    style={
                        node.tone === "neutral" || node.variant === "primary"
                            ? undefined
                            : { color: genUiInk(node.tone) }
                    }
                />
            ) : null}
            <span className="gen-ui-button__label">{node.label}</span>
        </Button>
    );
}

/* A press without an action draws its child, not tappable. */
function PressView(props: { node: GenUiPress }) {
    const { node } = props;
    if (node.action) return <ActivePress action={node.action} node={node} />;
    return (
        <div className="gen-ui-press" data-gen-ui-key={node.key} data-role={node.role}>
            {node.children.map((child) => (
                <Node key={child.key} node={child} />
            ))}
        </div>
    );
}

function ActivePress(props: { node: GenUiPress; action: GenUiAction }) {
    const { node } = props;
    const { press, run, disabled, chosen, supported } = useActivation(
        node.key,
        props.action,
        node.group,
    );
    return (
        <button
            aria-pressed={node.group === undefined ? undefined : chosen}
            className="gen-ui-press"
            data-gen-ui-key={node.key}
            data-picked={chosen ? "" : undefined}
            data-role={node.role}
            data-press={press}
            disabled={disabled}
            onClick={run}
            title={supported ? undefined : NOT_SUPPORTED}
            type="button"
        >
            {node.children.map((child) => (
                <Node key={child.key} node={child} />
            ))}
        </button>
    );
}

/* ---- Data ------------------------------------------------------------------ */

function MarkerView(props: { node: GenUiMarker }) {
    const host = useContext(HostContext);
    const { status, rail } = props.node;
    return (
        <span className="gen-ui-marker" data-happy-desktop-ui="gen-ui-marker" data-status={status}>
            <span
                className="gen-ui-marker__dot"
                data-still={status === "active" && host.still ? "" : undefined}
                style={{ color: genUiInk(genUiMarkerTones[status]) }}
            >
                {status === "done" ? (
                    <GenUiIcon name="check" size={12} />
                ) : status === "failed" ? (
                    <GenUiIcon name="x" size={12} />
                ) : status === "active" ? (
                    <span className="gen-ui-marker__pulse" />
                ) : null}
            </span>
            {rail ? <span className="gen-ui-marker__rail" /> : null}
        </span>
    );
}

function SparkView(props: { node: GenUiSpark }) {
    const width = 120;
    const height = 28;
    const { values, tone } = props.node;
    const low = Math.min(...values);
    const high = Math.max(...values);
    const span = high - low || 1;
    const line = values
        .map((value, index) => {
            const x = (index / (values.length - 1)) * width;
            /* One pixel of air above and below the 1.5px stroke. */
            const y = 2 + (1 - (value - low) / span) * (height - 4);
            return `${index === 0 ? "M" : "L"}${x},${y}`;
        })
        .join("");
    return (
        <svg
            aria-hidden="true"
            className="gen-ui-spark"
            data-tone={tone}
            style={{ color: genUiInk(tone) }}
            height={height}
            preserveAspectRatio="none"
            viewBox={`0 0 ${width} ${height}`}
            width="100%"
        >
            <path className="gen-ui-spark__area" d={`${line}L${width},${height}L0,${height}Z`} />
            <path className="gen-ui-spark__line" d={line} vectorEffect="non-scaling-stroke" />
        </svg>
    );
}

/* ---- One node ---------------------------------------------------------------- */

function Node(props: { node: GenUiRenderNode }): ReactNode {
    const { node } = props;
    const host = useContext(HostContext);
    switch (node.type) {
        case "box":
            return <BoxView node={node} />;
        case "grid":
            return <GridView node={node} />;
        case "scroll":
            return <ScrollView node={node} />;
        case "switch": {
            const shown = host.compact
                ? (node.compact ?? node.regular)
                : (node.regular ?? node.compact);
            return shown ? <Node node={shown} /> : null;
        }
        case "text":
            return <TextView node={node} />;
        case "icon":
            return (
                <span
                    className="gen-ui-icon"
                    data-happy-desktop-ui="gen-ui-icon"
                    data-role={node.role}
                    data-tone={node.tone}
                    style={{ color: genUiInk(node.tone) }}
                >
                    <GenUiIcon name={node.name} size={node.role === "leading" ? 16 : 14} />
                </span>
            );
        case "image":
            return <Picture node={node} />;
        case "pill":
            return (
                <span
                    className="gen-ui-pill"
                    data-happy-desktop-ui="gen-ui-pill"
                    data-tone={node.tone}
                    style={{ color: genUiText(node.tone), background: genUiFill(node.tone) }}
                >
                    {node.icon ? (
                        <GenUiIcon
                            name={node.icon}
                            size={12}
                            style={{ color: genUiInk(node.tone) }}
                        />
                    ) : null}
                    <span className="gen-ui-pill__text">{node.text}</span>
                </span>
            );
        case "button":
            return <ButtonView node={node} />;
        case "press":
            return <PressView node={node} />;
        case "bar":
            return (
                <div
                    aria-valuemax={100}
                    aria-valuemin={0}
                    aria-valuenow={Math.round(node.value * 100)}
                    className="gen-ui-bar"
                    data-happy-desktop-ui="gen-ui-bar"
                    role="progressbar"
                >
                    <span
                        className="gen-ui-bar__fill"
                        data-tone={node.tone}
                        style={{ width: `${node.value * 100}%`, background: genUiInk(node.tone) }}
                    />
                </div>
            );
        case "marker":
            return <MarkerView node={node} />;
        case "spark":
            return <SparkView node={node} />;
        case "plot":
            return <GenUiPlot plot={node} />;
        case "code":
            return (
                <div className="gen-ui-code" data-happy-desktop-ui="gen-ui-code">
                    <div className="gen-ui-code__header">
                        <span className="gen-ui-code__title">
                            {node.title ?? node.language ?? "Code"}
                        </span>
                        <CopyButton
                            glyph={(copied) => (
                                <GenUiIcon name={copied ? "check" : "copy"} size={14} />
                            )}
                            label="Copy code"
                            text={node.text}
                        />
                    </div>
                    <div className="gen-ui-code__body">
                        <CodeBlock lang={node.language} text={node.text} />
                    </div>
                </div>
            );
    }
}

/* ---- Root -------------------------------------------------------------------- */

type Viewing = { readonly items: readonly GenUiViewerItem[]; readonly index: number };

/**
 * GenUiRenderView — one render document as part of an agent's reply, on the
 * chat's own surface. A document with nothing drawable shows its `fallback`
 * as plain text, or nothing.
 */
export function GenUiRenderView(props: GenUiRenderViewProps) {
    const { document } = props;
    const [compact, setCompact] = useState(false);
    const [picked, setPicked] = useState<ReadonlyMap<string, string>>(new Map());
    const [viewing, setViewing] = useState<Viewing | null>(null);
    const supported = props.actionsSupported ?? ALL_ACTIONS;
    const onAction = props.onAction;
    const host: Host = {
        act: async (elementKey, action) => {
            await onAction?.(elementKey, action);
        },
        supported: (action) => supported.has(action.type),
        fileUrl: props.fileUrl,
        still: props.still ?? false,
        compact,
        viewerOpen: (elementKey, group, index) => {
            if (props.onViewerOpen) {
                props.onViewerOpen(elementKey, group, index);
                return;
            }
            const items = document.viewers.get(group);
            if (items?.[index]) setViewing({ items, index });
        },
        picked,
        pick: (group, elementKey) => {
            if (picked.has(group)) return;
            setPicked(new Map([...picked, [group, elementKey]]));
        },
    };
    const shown = viewing ? viewing.items[viewing.index] : undefined;
    const step = (direction: 1 | -1) => {
        if (!viewing) return;
        const count = viewing.items.length;
        setViewing({ items: viewing.items, index: (viewing.index + direction + count) % count });
    };
    return (
        <HostContext value={host}>
            <div
                className="gen-ui"
                data-compact={compact ? "" : undefined}
                data-happy-desktop-ui="gen-ui"
                ref={(element) => {
                    if (!element) return;
                    /* `switch` draws its compact layout below the regular width. */
                    const observer = new ResizeObserver((entries) => {
                        const width = entries[0]?.contentRect.width;
                        if (width !== undefined && width > 0) setCompact(width < REGULAR_MIN_WIDTH);
                    });
                    observer.observe(element);
                    return () => observer.disconnect();
                }}
            >
                {document.root ? (
                    <Node node={document.root} />
                ) : document.fallback !== undefined ? (
                    <p className="gen-ui-fallback">{document.fallback}</p>
                ) : null}
            </div>
            {viewing && shown ? (
                <ModalOverlay onDismiss={() => setViewing(null)} placement="fill">
                    <Lightbox
                        alt={shown.alt}
                        caption={shown.caption ?? shown.alt}
                        imageThumbnail={{
                            url: thumbhashDataUrl(shown.thumbhash),
                            width: shown.width,
                            height: shown.height,
                        }}
                        imageUrl={props.fileUrl(shown.file)}
                        onClose={() => setViewing(null)}
                        {...(viewing.items.length > 1
                            ? {
                                  onNext: () => step(1),
                                  onPrevious: () => step(-1),
                                  position: { index: viewing.index, total: viewing.items.length },
                              }
                            : {})}
                    />
                </ModalOverlay>
            ) : null}
        </HostContext>
    );
}
