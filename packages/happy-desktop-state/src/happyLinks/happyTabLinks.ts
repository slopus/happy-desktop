import {
    formatHappyUrl as clientFormatHappyUrl,
    happyReferencePlaceholder as clientHappyReferencePlaceholder,
    parseHappyLinks as clientParseHappyLinks,
    parseHappyUrl as clientParseHappyUrl,
    type HappyLink,
    type HappyLinkMatch,
    type HappyLinkParseOptions,
    type HappyLinkSegment,
    type HappyReference,
} from "@slopus/happy-agent-client";

// The published client still calls the resource a Surface. Keep its strict
// grammar and Markdown scanner, translating only the explicit new URL spelling
// until the client release supplies Tabs links itself. Wire identity is unchanged.
const TAB_URL_PREFIX = /^happy:\/\/((?:[a-z][a-z0-9]{23}\/)?)(?:tabs)\//u;
const MARKDOWN_TAB_URL_PREFIX = /happy:\/\/((?:[a-z][a-z0-9]{23}\/)?)(?:tabs)\//gu;
const SURFACE_URL_PREFIX = /^happy:\/\/((?:[a-z][a-z0-9]{23}\/)?)(?:surfaces)\//u;

export function parseHappyUrl(url: string): HappyLink | undefined {
    return clientParseHappyUrl(url.replace(TAB_URL_PREFIX, "happy://$1surfaces/"));
}

export function formatHappyUrl(link: HappyLink): string {
    return clientFormatHappyUrl(link).replace(SURFACE_URL_PREFIX, "happy://$1tabs/");
}

export function formatHappyReferenceUrl(reference: HappyReference): string {
    return formatHappyUrl({ type: "reference", reference });
}

export function happyReferencePlaceholder(reference: HappyReference): string {
    return reference.kind === "surface"
        ? "an unavailable tab"
        : clientHappyReferencePlaceholder(reference);
}

export function parseHappyLinks(
    markdown: string,
    options?: HappyLinkParseOptions,
): HappyLinkSegment[] {
    return clientParseHappyLinks(markdown, options).map((segment) => {
        if (segment.type !== "link" || segment.link !== undefined || segment.syntax !== "link")
            return segment;
        const translated = segment.source.replace(MARKDOWN_TAB_URL_PREFIX, "happy://$1surfaces/");
        if (translated === segment.source) return segment;
        const parsed = clientParseHappyLinks(translated)[0];
        return parsed?.type === "link" ? { ...segment, link: parsed.link } : segment;
    });
}

export function replaceHappyLinks(
    markdown: string,
    replace: (match: HappyLinkMatch) => string,
    options?: HappyLinkParseOptions,
): string {
    return parseHappyLinks(markdown, options)
        .map((segment) => (segment.type === "text" ? segment.text : replace(segment)))
        .join("");
}
