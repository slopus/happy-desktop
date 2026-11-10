import type { ConversationMediaItem } from "happy-desktop-state";
import { MediaImageTile } from "../ConversationMedia";
import { thumbhashDataUrl } from "../thumbhashDataUrl";

/**
 * How `images` lays its pictures out. PROTOTYPE (chat UI onboarding
 * experiment): the contract today has only `columns`; this mirrors the
 * proposed `layout`, which names the layouts people actually built with
 * `present_files` and HTML.
 *
 *   hero     one picture, the reply's width, at most 440px tall
 *   compare  two side by side at one height, each labelled (before / after)
 *   grid     2–9 in equal cells, two or three across, captions under each
 *   strip    many small ones in rows of one height, captions on hover
 *   auto     by count: 1 hero, 2 compare, 3–4 grid, more a strip
 */
export type UiImagesLayout = "auto" | "hero" | "compare" | "grid" | "strip";

export type UiImagesProps = {
    /** The pictures, in order, each already resolved to its bytes on this connection. */
    readonly items: readonly ConversationMediaItem[];
    /** One caption per picture, by position; absent or empty, none. */
    readonly captions?: readonly (string | undefined)[];
    readonly layout?: UiImagesLayout;
    /** The column count the current contract carries; a grid with that many across. */
    readonly columns?: 1 | 2 | 3;
    /** Opens one picture full size, by its position in `items`. */
    readonly onItemOpen?: (index: number) => void;
};

const HERO_MAX_HEIGHT = 440;
const STRIP_PER_ROW = 6;

const ratioOf = (item: ConversationMediaItem): number =>
    item.width && item.height ? item.width / item.height : 4 / 3;

/** The layout drawn for `layout` and the count. */
export function uiImagesLayout(props: Pick<UiImagesProps, "items" | "layout" | "columns">) {
    const asked = props.layout ?? (props.columns ? "grid" : "auto");
    if (asked !== "auto") return asked;
    const count = props.items.length;
    return count === 1 ? "hero" : count === 2 ? "compare" : count <= 4 ? "grid" : "strip";
}

/**
 * Chat UI `images`: the pictures a `show_ui` call placed, laid on the reply
 * in the layout it asked for. Every box takes its shape from the picture's
 * known size before a byte arrives, so the document's measured height holds.
 */
export function UiImages(props: UiImagesProps) {
    const layout = uiImagesLayout(props);
    const caption = (index: number) => props.captions?.[index]?.trim() || undefined;
    const tile = (index: number, fit: "contain" | "cover" = "contain") => {
        const item = props.items[index]!;
        const open = props.onItemOpen;
        return (
            <MediaImageTile
                alt={caption(index) ?? item.name}
                fit={fit}
                {...(item.thumbhash ? { placeholderUrl: thumbhashDataUrl(item.thumbhash) } : {})}
                {...(open ? { onOpen: () => open(index) } : {})}
                style={{ width: "100%", height: "100%" }}
                url={item.url}
            />
        );
    };
    const figure = (
        index: number,
        options: { readonly grow: number; readonly ratio: number; readonly label?: boolean },
    ) => {
        const text = caption(index);
        return (
            <figure
                className="happy-chat-images__figure"
                key={index}
                style={{ flex: `${String(options.grow)} 1 0` }}
            >
                <span
                    className="happy-chat-images__box"
                    style={{ aspectRatio: String(options.ratio) }}
                >
                    {tile(index)}
                </span>
                {text ? (
                    <figcaption
                        className="happy-chat-images__caption"
                        data-label={options.label ? "" : undefined}
                        title={text}
                    >
                        {text}
                    </figcaption>
                ) : null}
            </figure>
        );
    };
    const indexes = props.items.map((_, index) => index);
    let body;
    if (layout === "hero") {
        const ratio = ratioOf(props.items[0]!);
        body = (
            <div
                className="happy-chat-images__row"
                style={{ width: `min(100%, ${String(Math.round(HERO_MAX_HEIGHT * ratio))}px)` }}
            >
                {figure(0, { grow: 1, ratio })}
            </div>
        );
    } else if (layout === "compare") {
        /* Each grows by its own shape from nothing, so both end up one height. */
        body = (
            <div className="happy-chat-images__row">
                {indexes.slice(0, 2).map((index) => {
                    const ratio = ratioOf(props.items[index]!);
                    return figure(index, { grow: ratio, ratio, label: true });
                })}
            </div>
        );
    } else if (layout === "grid") {
        const count = props.items.length;
        const across = props.columns ?? (count === 2 || count === 4 ? 2 : count === 1 ? 1 : 3);
        /* One cell shape for the whole grid: the most common picture's. */
        const ratio = commonRatio(props.items);
        body = chunk(indexes, across).map((row, rowIndex) => (
            <div className="happy-chat-images__row" key={rowIndex}>
                {row.map((index) => figure(index, { grow: 1, ratio }))}
                {Array.from({ length: across - row.length }, (_, filler) => (
                    <span className="happy-chat-images__filler" key={`f${String(filler)}`} />
                ))}
            </div>
        ));
    } else {
        const average =
            props.items.reduce((total, item) => total + ratioOf(item), 0) / props.items.length;
        body = chunk(indexes, STRIP_PER_ROW).map((row, rowIndex) => (
            <div className="happy-chat-images__row" data-strip="" key={rowIndex}>
                {row.map((index) => {
                    const ratio = ratioOf(props.items[index]!);
                    const text = caption(index);
                    return (
                        <span
                            className="happy-chat-images__thumb"
                            key={index}
                            style={{ flex: `${String(ratio)} 1 0`, aspectRatio: String(ratio) }}
                            title={text ?? props.items[index]!.name}
                        >
                            {tile(index, "cover")}
                        </span>
                    );
                })}
                {/* A short last row keeps the strip's height: room for the pictures it lacks. */}
                {row.length < STRIP_PER_ROW ? (
                    <span
                        className="happy-chat-images__filler"
                        style={{ flex: `${String(average * (STRIP_PER_ROW - row.length))} 1 0` }}
                    />
                ) : null}
            </div>
        ));
    }
    return (
        <div
            className="happy-chat-ui happy-chat-ui__images"
            data-happy-desktop-ui="chat-ui-images"
            data-layout={layout}
        >
            {body}
        </div>
    );
}

function chunk<T>(list: readonly T[], size: number): T[][] {
    const rows: T[][] = [];
    for (let at = 0; at < list.length; at += size) rows.push(list.slice(at, at + size));
    return rows;
}

function commonRatio(items: readonly ConversationMediaItem[]): number {
    const counts = new Map<string, { ratio: number; count: number }>();
    for (const item of items) {
        const ratio = ratioOf(item);
        const key = ratio.toFixed(2);
        const seen = counts.get(key);
        counts.set(key, { ratio, count: (seen?.count ?? 0) + 1 });
    }
    return [...counts.values()].sort((left, right) => right.count - left.count)[0]?.ratio ?? 4 / 3;
}
