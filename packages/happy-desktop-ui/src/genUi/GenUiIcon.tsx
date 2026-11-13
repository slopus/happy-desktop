import type { CSSProperties } from "react";
import type { GenUiIconName } from "./genUiRender";

/*
 * Gen UI icons are shared by every client: `shared/icons/` is a copy of the
 * spec's glyphs, black on transparent. Each is used as a mask and painted with
 * the current colour, so an icon takes its tone's ink like the text beside it.
 */
const files = import.meta.glob<string>("./shared/icons/*.svg", {
    eager: true,
    import: "default",
    query: "?url",
});

const glyphs = new Map(
    Object.entries(files).map(([path, url]) => [
        path.slice("./shared/icons/".length, -".svg".length),
        url,
    ]),
);

/** The icon names the bundled glyph set has, for checking it against the theme. */
export const genUiBundledIconNames: readonly string[] = [...glyphs.keys()];

/**
 * One shared glyph at a square size, in the current colour unless `style`
 * paints it; a name without a glyph draws nothing.
 */
export function GenUiIcon(props: {
    name: GenUiIconName;
    size: number;
    className?: string;
    style?: CSSProperties;
}) {
    const url = glyphs.get(props.name);
    if (url === undefined) return null;
    const mask = `url("${url}")`;
    const style: CSSProperties = {
        ...props.style,
        width: props.size,
        height: props.size,
        maskImage: mask,
        WebkitMaskImage: mask,
    };
    return (
        <span
            aria-hidden="true"
            className={props.className ? `gen-ui-glyph ${props.className}` : "gen-ui-glyph"}
            data-happy-desktop-ui="gen-ui-glyph"
            style={style}
        />
    );
}
