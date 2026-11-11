import { Icon, type IconName } from "./Icon";
import { Ionicon, type IoniconName } from "./vectorIcons/VectorIcon";

/** The tile hues: iOS's system colours, from the `--happy-tile-*` roles. */
export type IconTileTone =
    | "blue"
    | "green"
    | "orange"
    | "indigo"
    | "purple"
    | "red"
    | "teal"
    | "gray";

/** `small` stands in a 20px glyph lane (a sidebar row); `medium` leads a settings row. */
export type IconTileSize = "small" | "medium";

type IconTileGlyph =
    | { readonly icon: IconName; readonly ionicon?: never }
    | { readonly ionicon: IoniconName; readonly icon?: never };

export type IconTileProps = IconTileGlyph & {
    readonly tone: IconTileTone;
    readonly size?: IconTileSize;
    readonly className?: string;
};

const GLYPH_SIZE = { small: 14, medium: 18 } as const;

/**
 * A white glyph on a filled, rounded square of one hue: the mark the native
 * clients' settings put at the head of a row, and macOS System Settings at the
 * head of each pane in its sidebar. The hue says which kind of thing the row is,
 * never its state, so it does not change while the row is used.
 */
export function IconTile(props: IconTileProps) {
    const size = props.size ?? "medium";
    return (
        <span
            aria-hidden="true"
            className={["happy-icon-tile", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="icon-tile"
            data-size={size}
            data-tone={props.tone}
        >
            {props.icon !== undefined ? (
                <Icon name={props.icon} size={GLYPH_SIZE[size]} />
            ) : (
                <Ionicon name={props.ionicon} size={GLYPH_SIZE[size]} />
            )}
        </span>
    );
}
