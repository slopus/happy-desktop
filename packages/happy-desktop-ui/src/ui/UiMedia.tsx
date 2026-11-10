import type { ConversationMediaItem } from "happy-desktop-state";
import { MediaImageTile } from "../ConversationMedia";
import { MediaVideoTile } from "../MediaVideoTile";
import { thumbhashDataUrl } from "../thumbhashDataUrl";
import { uiMediaLayout, UI_MEDIA_ROW_HEIGHT } from "./uiMediaLayout";

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
    return uiMediaLayoutOf(props).height;
}

function uiMediaLayoutOf(props: Omit<UiMediaProps, "onItemOpen">) {
    return uiMediaLayout(
        props.items.map((item, index) => ({
            kind: item.kind,
            ...(item.width === undefined ? {} : { width: item.width }),
            ...(item.height === undefined ? {} : { height: item.height }),
            labelled: labelOf(props.labels, index) !== undefined,
        })),
        props.width,
        UI_MEDIA_ROW_HEIGHT,
    );
}

/**
 * Chat UI `media`: the pictures and recordings a `show_ui` call placed, in
 * justified rows laid out from their own sizes (`uiMediaLayout`). Every box
 * is in whole pixels before a byte arrives, and a picture covers its box, so
 * nothing moves when the bytes load. A label is one line under its item.
 */
export function UiMedia(props: UiMediaProps) {
    const layout = uiMediaLayoutOf(props);
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
                        const box = { width: placed.width, height: placed.height };
                        const placeholderUrl = item.thumbhash
                            ? thumbhashDataUrl(item.thumbhash)
                            : undefined;
                        return (
                            <figure
                                className="happy-chat-media__item"
                                key={placed.index}
                                style={{ width: placed.width }}
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
