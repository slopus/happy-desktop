import {
    layoutMedia,
    MEDIA_GAP,
    MEDIA_ROW_HEIGHT_DESKTOP,
    type ConversationMediaItem,
    type MediaFrame,
} from "happy-desktop-state";
import { MediaImageTile } from "../ConversationMedia";
import { FileTreeFamilyIcon, fileTreeFamily } from "../FileTree";
import { MediaVideoTile } from "../MediaVideoTile";
import { thumbhashDataUrl } from "../thumbhashDataUrl";

/** One picture or recording, with the line under it. */
export type UiMediaEntry = {
    readonly item: ConversationMediaItem;
    readonly label?: string;
};

export type UiMediaProps = {
    /** The pictures and recordings, in order, each already resolved to its bytes on this connection. */
    readonly entries: readonly UiMediaEntry[];
    /** The width the component lays its rows across: the reply's content measure. */
    readonly width: number;
    /** Opens one picture full size, by its position in `entries`. */
    readonly onOpen?: (index: number) => void;
};

type UiMediaRow = {
    readonly height: number;
    readonly placed: readonly { readonly index: number; readonly frame: MediaFrame }[];
    readonly labelled: boolean;
};

/**
 * The shared `layoutMedia` frames, grouped into the rows they sit in, so the
 * rows draw as flex rows: each row as tall as its pictures and label line.
 */
function uiMediaRows(
    entries: readonly UiMediaEntry[],
    width: number,
): { readonly rows: readonly UiMediaRow[]; readonly height: number } {
    const arrangement = layoutMedia(
        entries.map(({ item, label }) => ({
            kind: item.kind,
            ...(item.width === undefined ? {} : { width: item.width }),
            ...(item.height === undefined ? {} : { height: item.height }),
            ...(label === undefined ? {} : { label }),
        })),
        width,
        MEDIA_ROW_HEIGHT_DESKTOP,
    );
    const rows: { top: number; placed: UiMediaRow["placed"][number][] }[] = [];
    for (const [index, frame] of arrangement.frames.entries()) {
        const row = rows.at(-1);
        if (row?.top === frame.y) row.placed.push({ index, frame });
        else rows.push({ top: frame.y, placed: [{ index, frame }] });
    }
    return {
        height: arrangement.height,
        rows: rows.map((row, rowIndex) => ({
            placed: row.placed,
            labelled: row.placed.some((placed) => arrangement.labels[placed.index] !== null),
            /* To the next row's top, less the gap; the last row to the whole height. */
            height:
                (rows[rowIndex + 1]?.top ?? arrangement.height + MEDIA_GAP) - row.top - MEDIA_GAP,
        })),
    };
}

/** The component's height at `width`, from the items' stated sizes alone. */
export function uiMediaHeight(entries: readonly UiMediaEntry[], width: number): number {
    return uiMediaRows(entries, width).height;
}

/**
 * Chat UI `media`: the pictures and recordings a `show_ui` call placed, in
 * justified rows laid out from their own sizes by the client's `layoutMedia`.
 * Every box is in whole pixels before a byte arrives, and a picture covers its
 * box, so nothing moves when the bytes load. A file that is neither is its
 * icon and name in the same box. A label is one line under its item.
 */
export function UiMedia(props: UiMediaProps) {
    const layout = uiMediaRows(props.entries, props.width);
    const open = props.onOpen;
    return (
        <div
            className="happy-chat-ui happy-chat-ui__media"
            data-happy-desktop-ui="chat-ui-media"
            style={{ height: layout.height }}
        >
            {layout.rows.map((row) => (
                <div
                    className="happy-chat-media__row"
                    key={row.placed[0]?.index}
                    style={{ height: row.height }}
                >
                    {row.placed.map(({ index, frame }) => {
                        const { item, label } = props.entries[index]!;
                        const box = { width: frame.width, height: frame.height };
                        const placeholderUrl = item.thumbhash
                            ? thumbhashDataUrl(item.thumbhash)
                            : undefined;
                        return (
                            <div
                                className="happy-chat-media__item"
                                key={index}
                                style={{ width: frame.width }}
                            >
                                {item.kind === "video" ? (
                                    <MediaVideoTile
                                        className="happy-chat-media__box"
                                        name={label ?? item.name}
                                        {...(placeholderUrl ? { posterUrl: placeholderUrl } : {})}
                                        style={box}
                                        url={item.url}
                                    />
                                ) : item.kind !== "image" ? (
                                    <div
                                        className="happy-chat-media__box happy-chat-media__file"
                                        style={box}
                                        title={item.name}
                                    >
                                        <FileTreeFamilyIcon
                                            family={fileTreeFamily({
                                                kind: "file",
                                                name: item.name,
                                            })}
                                            size={32}
                                        />
                                        <span className="happy-chat-media__file-name">
                                            {item.name}
                                        </span>
                                    </div>
                                ) : (
                                    <MediaImageTile
                                        alt={label ?? item.name}
                                        className="happy-chat-media__box"
                                        fit="cover"
                                        {...(placeholderUrl ? { placeholderUrl } : {})}
                                        {...(open ? { onOpen: () => open(index) } : {})}
                                        style={box}
                                        url={item.url}
                                    />
                                )}
                                {row.labelled ? (
                                    <span className="happy-chat-media__label" title={label}>
                                        {label}
                                    </span>
                                ) : null}
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}
