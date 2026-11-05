import { Fragment, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import type { ConversationMediaItem, ConversationMediaLayout } from "happy-desktop-state";
import { artifactSizeText } from "./pages/artifacts/artifactPresentation";
import { conversationMediaPlan, mediaFlowPointSize } from "./mediaLayout";
import { MediaFlow } from "./MediaFlow";
import { MediaVideoTile } from "./MediaVideoTile";
import { MediaTree } from "./MediaTree";
import {
    mediaItemsFramed,
    mediaItemsUnframed,
    mediaVideoFramesSubscribe,
    mediaVideoFramesVersion,
} from "./mediaVideoFrames";
import { FileTreeFamilyIcon, fileTreeFamily } from "./FileTree";
import { Icon } from "./Icon";
import { ResultCard } from "./ResultCard";
import { thumbhashDataUrl } from "./thumbhashDataUrl";

/** The `object-fit` a picture is drawn with. */
export type MediaImageFit = "contain" | "cover" | "fill" | "none" | "scale-down";

export type MediaImageTileProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    /** Where the full picture is read from. */
    url: string;
    /** Decoded placeholder painted at the picture's aspect ratio until its bytes arrive. */
    placeholderUrl?: string;
    /** What the picture is, for assistive technology and the open control. */
    alt: string;
    /**
     * The box the tile reserves; the picture fills it once it loads. Absent,
     * `style` sizes the tile, as a flow or tree tile does.
     */
    width?: number;
    height?: number;
    /** How the picture sits in its box: whole (the default), or as a layout asked. */
    fit?: MediaImageFit;
    /** Where in its box the picture sits, as normalized `object-position` text a layout supplied. */
    position?: string;
    /**
     * The picture's size in points when that differs from its pixels (a
     * Retina capture). `none` and `scale-down` then draw it at this size,
     * which `object-fit` alone would read off the pixels and double.
     */
    pointSize?: { readonly width: number; readonly height: number };
    /** Opens the picture full size. Absent leaves the tile a picture, not a fake button. */
    onOpen?: () => void;
    /**
     * Draws only the picture's first frame, for one that may be animated
     * where it must hold still: a small thumbnail, or a reader who asked for
     * less motion.
     */
    still?: boolean;
};

/**
 * C-292 MediaImageTile — one picture whose bytes are still on their way.
 *
 * The tile takes its final box at once and paints the ThumbHash placeholder in
 * it, so nothing moves when the picture arrives: the real image is laid over
 * the placeholder and fades in the moment it has decoded. A picture that fails
 * keeps its placeholder and says so with a quiet glyph rather than a broken
 * image. Which address has loaded is the tile's own state, so a new address
 * starts from its placeholder again.
 */
export function MediaImageTile(props: MediaImageTileProps) {
    const [settled, setSettled] = useState<{ url: string; state: "loaded" | "failed" }>();
    const state = settled?.url === props.url ? settled.state : "loading";
    // A still tile loads the picture into a hidden image, which is never
    // painted and so never advances past its first frame, and draws that frame
    // once onto a canvas in its place: the frame a canvas is given of an
    // animated picture.
    const image = useRef<HTMLImageElement | null>(null);
    const canvas = useRef<HTMLCanvasElement | null>(null);
    const stillDraw = () => {
        const source = image.current;
        const target = canvas.current;
        if (!target || !source?.complete || source.naturalWidth === 0) return;
        target.width = source.naturalWidth;
        target.height = source.naturalHeight;
        target.getContext("2d")?.drawImage(source, 0, 0);
    };
    const content = (
        <>
            <span
                aria-hidden="true"
                className="happy-media-image-tile__placeholder"
                data-happy-desktop-ui="media-image-tile-placeholder"
                style={{
                    ...(props.placeholderUrl
                        ? { backgroundImage: `url("${props.placeholderUrl}")` }
                        : {}),
                    ...(props.position ? { backgroundPosition: props.position } : {}),
                }}
            />
            <img
                alt={props.alt}
                className="happy-media-image-tile__image"
                data-happy-desktop-ui="media-image-tile-image"
                decoding="async"
                draggable={false}
                height={props.height}
                onError={() => setSettled({ url: props.url, state: "failed" })}
                onLoad={() => {
                    stillDraw();
                    setSettled({ url: props.url, state: "loaded" });
                }}
                // A row scrolled back into view finds its picture in the
                // cache, already decoded: shown in the same frame instead of
                // flashing its placeholder first.
                ref={(element) => {
                    image.current = element;
                    if (element?.complete && element.naturalWidth > 0 && state === "loading")
                        setSettled({ url: props.url, state: "loaded" });
                }}
                src={props.url}
                style={imagePlacement(props)}
                width={props.width}
            />
            {props.still ? (
                // After the image, so a picture already loaded when the
                // canvas appears is drawn onto it at once.
                <canvas
                    aria-label={props.alt}
                    className="happy-media-image-tile__image"
                    data-happy-desktop-ui="media-image-tile-still"
                    ref={(element) => {
                        canvas.current = element;
                        stillDraw();
                    }}
                    role="img"
                    style={imagePlacement(props)}
                />
            ) : null}
            {state === "failed" ? (
                <span
                    aria-hidden="true"
                    className="happy-media-image-tile__failure"
                    data-happy-desktop-ui="media-image-tile-failure"
                >
                    <Icon name="image" size={20} />
                </span>
            ) : null}
        </>
    );
    const shared = {
        className: ["happy-media-image-tile", props.className].filter(Boolean).join(" "),
        "data-happy-desktop-ui": "media-image-tile",
        "data-fit": props.fit === undefined || props.fit === "contain" ? undefined : props.fit,
        "data-state": state,
        "data-still": props.still ? "" : undefined,
        "data-testid": props["data-testid"],
        style:
            props.width === undefined || props.height === undefined
                ? props.style
                : { ...props.style, width: `${props.width}px`, height: `${props.height}px` },
    } as const;
    return props.onOpen ? (
        <button {...shared} aria-label={`Open ${props.alt}`} onClick={props.onOpen} type="button">
            {content}
        </button>
    ) : (
        <span {...shared}>{content}</span>
    );
}

/**
 * The picture layer's own style: the layout's `object-position`, and, for a
 * high-density picture drawn unscaled or only ever scaled down, a box at its
 * point size centred in the tile, since `object-fit` measures pixels.
 */
function imagePlacement(props: MediaImageTileProps): CSSProperties | undefined {
    const point = props.pointSize;
    const position = props.position ? { objectPosition: props.position } : {};
    if (point && props.fit === "scale-down")
        return {
            ...position,
            width: `min(100%, ${String(point.width)}px)`,
            height: `min(100%, ${String(point.height)}px)`,
            margin: "auto",
            objectFit: "contain",
        };
    if (point && props.fit === "none")
        return {
            ...position,
            inset: "auto",
            left: "50%",
            top: "50%",
            width: `${String(point.width)}px`,
            height: `${String(point.height)}px`,
            objectFit: "fill",
            transform: "translate(-50%, -50%)",
        };
    return props.position ? position : undefined;
}

export type ConversationMediaProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    items: readonly ConversationMediaItem[];
    /** How the producer asked the items to be arranged; absent, justified rows. */
    layout?: ConversationMediaLayout;
    /**
     * Opens one item by its position in `items`: a picture full size, a
     * recording or a file in its preview.
     */
    onItemOpen?: (index: number) => void;
};

/** What kind of file a presented item is, in a word, from its declared media type. */
function mediaTypeLabel(item: ConversationMediaItem): string {
    if (item.mimeType === "application/pdf") return "PDF";
    if (item.kind === "document") return "Document";
    const [family, subtype] = item.mimeType.split("/");
    if (family === "image") return "Image";
    if (family === "video") return "Video";
    if (family === "audio") return "Audio";
    if (family === "text" && subtype) return subtype === "plain" ? "Text" : subtype.toUpperCase();
    return "File";
}

/**
 * C-294 ConversationMedia — the files one tool call put in front of the reader,
 * beneath its line in the transcript.
 *
 * A layout the agent wrote is drawn as its `MediaTree`. Otherwise every
 * picture and recording comes first, together and in order, as one
 * `MediaFlow`: the column grid the producer asked for, or justified rows — a
 * few phone recordings side by side, each at its own shape. Then one full
 * width card per document or file. Every box is known before a
 * byte arrives — from the producer's dimensions and the layout's arithmetic,
 * which `conversationRowHeight` shares — so the transcript reserves exactly
 * the height this paints. Nothing is cropped unless a tree asks for it.
 */
/* Items whose sizes are all stated never wait on a recording's metadata. */
const framesIgnore = () => () => undefined;
const framesSettled = () => 0;

export function ConversationMedia(props: ConversationMediaProps) {
    /* A recording that stated no size is laid out at the size its metadata
       reports, once it has (`mediaVideoFrames`); only such a set listens. */
    const unframed = mediaItemsUnframed(props.items);
    const framesAt = useSyncExternalStore(
        unframed ? mediaVideoFramesSubscribe : framesIgnore,
        unframed ? mediaVideoFramesVersion : framesSettled,
    );
    const items = mediaItemsFramed(props.items, unframed ? framesAt : undefined);
    const open = props.onItemOpen;
    const className = ["happy-conversation-media", props.className].filter(Boolean).join(" ");
    const image = (tile: {
        index: number;
        style: CSSProperties;
        fit?: MediaImageFit;
        position?: string;
        alt?: string;
        className?: string;
    }) => {
        const index = tile.index;
        const item = items[index]!;
        const placeholderUrl = item.thumbhash ? thumbhashDataUrl(item.thumbhash) : undefined;
        const pointSize = item.scale && item.scale > 1 ? mediaFlowPointSize(item) : undefined;
        return (
            <MediaImageTile
                alt={tile.alt ?? item.name}
                {...(tile.className ? { className: tile.className } : {})}
                {...(tile.fit ? { fit: tile.fit } : {})}
                {...(tile.position ? { position: tile.position } : {})}
                {...(pointSize ? { pointSize } : {})}
                {...(placeholderUrl ? { placeholderUrl } : {})}
                {...(open ? { onOpen: () => open(index) } : {})}
                style={tile.style}
                url={item.url}
            />
        );
    };
    const video = (tile: {
        index: number;
        style: CSSProperties;
        name?: string;
        className?: string;
    }) => {
        const index = tile.index;
        const item = items[index]!;
        const posterUrl = item.thumbhash ? thumbhashDataUrl(item.thumbhash) : undefined;
        return (
            <MediaVideoTile
                {...(tile.className ? { className: tile.className } : {})}
                name={tile.name ?? item.name}
                {...(posterUrl ? { posterUrl } : {})}
                {...(open ? { onOpen: () => open(index) } : {})}
                style={tile.style}
                url={item.url}
            />
        );
    };
    const card = (index: number) => {
        const item = items[index]!;
        const family = fileTreeFamily({ kind: "file", name: item.name });
        return (
            <ResultCard
                detail={`${mediaTypeLabel(item)} · ${artifactSizeText(item.size)}`}
                glyph={
                    <span className="happy-file-family-glyph" data-family={family}>
                        <FileTreeFamilyIcon family={family} size={20} />
                    </span>
                }
                {...(open ? { onOpen: () => open(index) } : {})}
                title={item.name}
            />
        );
    };
    const layout = props.layout;
    if (layout?.type === "tree")
        return (
            <div
                className={className}
                data-happy-desktop-ui="conversation-media"
                data-layout="tree"
                data-testid={props["data-testid"]}
                style={props.style}
            >
                <MediaTree
                    items={items}
                    renderItem={(rendered) => {
                        const item = items[rendered.index]!;
                        if (item.kind === "image")
                            return image({
                                index: rendered.index,
                                style: rendered.style,
                                ...(rendered.fit ? { fit: rendered.fit } : {}),
                                ...(rendered.position ? { position: rendered.position } : {}),
                                ...(rendered.alt === undefined ? {} : { alt: rendered.alt }),
                                className: "happy-media-tree__item",
                            });
                        if (item.kind === "video")
                            return video({
                                index: rendered.index,
                                style: rendered.style,
                                ...(rendered.alt === undefined ? {} : { name: rendered.alt }),
                                className: "happy-media-tree__item",
                            });
                        return (
                            <div className={rendered.className} style={rendered.style}>
                                {card(rendered.index)}
                            </div>
                        );
                    }}
                    root={layout.root}
                />
            </div>
        );
    const indexed = items.map((item, index) => ({ item, index }));
    const visuals = indexed.filter(({ item }) => item.kind === "image" || item.kind === "video");
    const plan = conversationMediaPlan(
        visuals.map(({ item }) => item),
        layout,
    );
    return (
        <div
            className={className}
            data-happy-desktop-ui="conversation-media"
            data-layout={layout?.type === "columns" ? `columns-${String(layout.columns)}` : "auto"}
            data-testid={props["data-testid"]}
            style={props.style}
        >
            {visuals.length > 0 ? (
                <MediaFlow
                    data-testid={
                        props["data-testid"] ? `${props["data-testid"]}-images` : undefined
                    }
                    plan={plan}
                    renderTile={(position, style) => {
                        const index = visuals[position]!.index;
                        return items[index]!.kind === "video"
                            ? video({ index, style })
                            : image({ index, style });
                    }}
                />
            ) : null}
            {indexed.map(({ item, index }) =>
                item.kind === "image" || item.kind === "video" ? null : (
                    <Fragment key={index}>{card(index)}</Fragment>
                ),
            )}
        </div>
    );
}
