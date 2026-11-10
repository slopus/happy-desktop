import {
    layoutMedia,
    MEDIA_GAP,
    MEDIA_ROW_HEIGHT_DESKTOP,
    type ConversationMediaItem,
    type MediaFrame,
} from "happy-desktop-state";
import { MediaImageTile } from "../ConversationMedia";
import { MediaVideoTile } from "../MediaVideoTile";
import { thumbhashDataUrl } from "../thumbhashDataUrl";

export type UiMediaProps = {
    /** The pictures and recordings, in order, each already resolved to its bytes on this connection. */
    readonly items: readonly ConversationMediaItem[];
    /** One label per item, by position; absent or empty, none. */
    readonly labels?: readonly (string | undefined)[];
    /** The width the component lays its rows across: the reply's content measure. */
    readonly width: number;
    /** Opens one item full size, by its position in `items`. */
    readonly onItemOpen?: (index: number) => void;
};

/** The labels as layout and drawing read them: trimmed, empty as none. */
function labelOf(labels: UiMediaProps["labels"], index: number): string | undefined {
    return labels?.[index]?.trim() || undefined;
}

/** The component's height at `width`, from the items' stated sizes alone. */
export function uiMediaHeight(props: Omit<UiMediaProps, "onItemOpen">): number {
    return uiMediaRows(props).height;
}

type UiMediaRow = {
    readonly height: number;
    readonly items: readonly { readonly index: number; readonly frame: MediaFrame }[];
    readonly labelled: boolean;
};

/**
 * The shared `layoutMedia` frames, grouped into the rows they sit in, so the
 * rows draw as flex rows: each row as tall as its pictures and label line.
 */
function uiMediaRows(props: Omit<UiMediaProps, "onItemOpen">): {
    readonly rows: readonly UiMediaRow[];
    readonly height: number;
} {
    const arrangement = layoutMedia(
        props.items.map((item, index) => {
            const label = labelOf(props.labels, index);
            return {
                kind: item.kind,
                ...(item.width === undefined ? {} : { width: item.width }),
                ...(item.height === undefined ? {} : { height: item.height }),
                ...(label === undefined ? {} : { label }),
            };
        }),
        props.width,
        MEDIA_ROW_HEIGHT_DESKTOP,
    );
    const rows: { top: number; items: UiMediaRow["items"][number][] }[] = [];
    for (const [index, frame] of arrangement.frames.entries()) {
        const row = rows.at(-1);
        if (row?.top === frame.y) row.items.push({ index, frame });
        else rows.push({ top: frame.y, items: [{ index, frame }] });
    }
    return {
        height: arrangement.height,
        rows: rows.map((row, rowIndex) => ({
            items: row.items,
            labelled: row.items.some((item) => arrangement.labels[item.index] !== null),
            /* To the next row's top, less the gap; the last row to the whole height. */
            height:
                (rows[rowIndex + 1]?.top ?? arrangement.height + MEDIA_GAP) - row.top - MEDIA_GAP,
        })),
    };
}

/**
 * Chat UI `media`: the pictures and recordings a `show_ui` call placed, in
 * justified rows laid out from their own sizes (the client's `layoutMedia`). Every box
 * is in whole pixels before a byte arrives, and a picture covers its box, so
 * nothing moves when the bytes load. A label is one line under its item.
 */
export function UiMedia(props: UiMediaProps) {
    const layout = uiMediaRows(props);
    const open = props.onItemOpen;
    return (
        <div
            className="happy-chat-ui happy-chat-ui__media"
            data-happy-desktop-ui="chat-ui-media"
            style={{ height: layout.height }}
        >
            {layout.rows.map((row, rowIndex) => (
                <div
                    className="happy-chat-media__row"
                    key={row.items[0]?.index ?? rowIndex}
                    style={{ height: row.height }}
                >
                    {row.items.map((placed) => {
                        const item = props.items[placed.index]!;
                        const label = labelOf(props.labels, placed.index);
                        const box = { width: placed.frame.width, height: placed.frame.height };
                        const placeholderUrl = item.thumbhash
                            ? thumbhashDataUrl(item.thumbhash)
                            : undefined;
                        return (
                            <figure
                                className="happy-chat-media__item"
                                key={placed.index}
                                style={{ width: placed.frame.width }}
                            >
                                {item.kind === "video" ? (
                                    <MediaVideoTile
                                        className="happy-chat-media__box"
                                        name={label ?? item.name}
                                        {...(placeholderUrl ? { posterUrl: placeholderUrl } : {})}
                                        {...(open ? { onOpen: () => open(placed.index) } : {})}
                                        style={box}
                                        url={item.url}
                                    />
                                ) : (
                                    <MediaImageTile
                                        alt={label ?? item.name}
                                        className="happy-chat-media__box"
                                        fit="cover"
                                        {...(placeholderUrl ? { placeholderUrl } : {})}
                                        {...(open ? { onOpen: () => open(placed.index) } : {})}
                                        style={box}
                                        url={item.url}
                                    />
                                )}
                                {row.labelled ? (
                                    <figcaption className="happy-chat-media__label" title={label}>
                                        {label}
                                    </figcaption>
                                ) : null}
                            </figure>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}
