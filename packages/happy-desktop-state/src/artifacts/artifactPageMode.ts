/**
 * How an HTML artifact's page asks to be shown. `page` is a document that
 * scrolls; `app` is a single screen with no page scrolling of its own — a
 * game, a canvas, a drawing pad — which fills whatever it is shown in, is
 * offered full screen, and is never run inside a chat row.
 */
export type HappyAgentArtifactPageMode = "page" | "app";

/** `<!-- … -->`, so a tag quoted in a comment is not read as declared. */
const HTML_COMMENT = /<!--[\s\S]*?-->/gu;
/** Every `<meta …>` tag. */
const HTML_META = /<meta\b[^>]*>/giu;
/** One attribute of a tag: a name, and its value quoted either way or bare. */
const HTML_ATTRIBUTE = /([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu;

/**
 * The mode a page declares in its `<head>`:
 *
 *     <meta name="happy-page-mode" content="app">
 *
 * Any other value, or no tag, is a page. The markup is the agent's own, so
 * this reads the declaration once, here, and the mode travels as a field from
 * then on. It matches what a page's host stylesheet selects with `:has()`, so
 * the layout the host draws and the mode the app knows agree.
 */
export function happyAgentArtifactPageModeRead(html: string): HappyAgentArtifactPageMode {
    for (const [tag] of html.replace(HTML_COMMENT, "").matchAll(HTML_META)) {
        let name: string | undefined;
        let content: string | undefined;
        for (const match of tag.slice("<meta".length).matchAll(HTML_ATTRIBUTE)) {
            const value = match[2] ?? match[3] ?? match[4] ?? "";
            const attribute = match[1]?.toLowerCase();
            if (attribute === "name") name ??= value;
            else if (attribute === "content") content ??= value;
        }
        if (name?.toLowerCase() === "happy-page-mode" && content?.toLowerCase() === "app")
            return "app";
    }
    return "page";
}
