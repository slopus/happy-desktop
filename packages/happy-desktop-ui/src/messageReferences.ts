import {
    formatHappyFileUrl,
    formatHappyReferenceUrl,
    formatHappySettingsUrl,
    happyReferencePlaceholder,
    parseHappyLinks,
    parseHappyUrl,
    happyAgentFileLinkParse,
    happyShareLinkParse,
    happyShareLinksRelabel,
    isHappyUrl,
    happyShareLinksRewrite,
    HAPPY_SHARE_LINK_ORIGIN,
    happyAgentProviderAddPageOf,
    replaceHappyLinks,
    type HappyAgentFileLink,
    type HappyLink,
    type HappyLinkMatch,
    type HappyReference,
    type HappySettingsPage,
} from "happy-desktop-state";

/**
 * How one Happy reference in a message reads right now.
 *
 * - `link` — something the reader can open: its live title, and whether the
 *   thing is busy (an agent working, a service running) so the link can say so.
 * - `text` — something that cannot be opened: deleted, unknown, not visible to
 *   this reader, or a kind this build does not know. It reads as plain words.
 * - `person` — someone on the team: a tag in their current name, with their
 *   photo and role behind it, set apart further when it is the reader.
 */
export type MessageReferenceView =
    | {
          readonly type: "link";
          readonly label: string;
          readonly busy: boolean;
          /**
           * The live title is still being read and `label` stands in for it. A
           * surface holding a better stand-in of its own, such as the title an
           * artifact had when a tool call published it, shows that instead.
           */
          readonly reading?: boolean;
      }
    | { readonly type: "text"; readonly label: string }
    | {
          readonly type: "person";
          /** `@` and their current name. */
          readonly label: string;
          /** The name alone, as the card behind the tag shows it. */
          readonly name: string;
          readonly imageUrl?: string;
          readonly role?: string;
          /** The reader themselves. */
          readonly self: boolean;
      };

/**
 * The live side of the references a transcript shows, supplied by the surface
 * that owns the stores behind them. `view` is asked while rendering and while
 * sizing rows, so it must be a pure read of the owner's current snapshot.
 */
export interface MessageReferences {
    /**
     * The instance whose stores these references read. A link naming another
     * instance, or any instance while this is absent, names something these
     * stores do not hold: it reads as its words and opens nothing.
     */
    readonly instanceId?: string;
    view(reference: HappyReference): MessageReferenceView;
    open(reference: HappyReference): void;
}

/** The view a surface with no live stores behind it gives every reference. */
function placeholderView(reference: HappyReference): MessageReferenceView {
    return { type: "text", label: happyReferencePlaceholder(reference) };
}

/** What one reference reads as live, or as a placeholder with nothing behind it. */
function referenceView(
    reference: HappyReference,
    references: MessageReferences | undefined,
): MessageReferenceView {
    return references === undefined ? placeholderView(reference) : references.view(reference);
}

/** Escapes a label so Markdown reads every character of it literally. */
function labelEscape(label: string): string {
    return label
        .replace(/\s+/gu, " ")
        .trim()
        .replace(/[!-/:-@[-`{-~]/gu, (character) => `\\${character}`);
}

/** The words of a link label written as Markdown, for a surface that shows plain text. */
function labelPlain(label: string): string {
    return label
        .replace(/\s+/gu, " ")
        .trim()
        .replace(/\\([!-/:-@[-`{-~])/gu, "$1");
}

/**
 * The canonical `happy://` address of a reference, or nothing for one no
 * address can express: a legacy service tag written without its workspace.
 */
function referenceHref(reference: HappyReference): string | undefined {
    try {
        return formatHappyReferenceUrl(reference);
    } catch {
        return undefined;
    }
}

/**
 * The words one Happy link to a thing reads as, whatever label it was written
 * with: what the references say the thing is called now — its live title, a
 * person's `@name` — or, for one these references cannot name or that another
 * server holds, a placeholder such as "an unavailable artifact". A label goes
 * stale the moment the thing is renamed, so it is never shown.
 */
function referenceWords(
    link: Extract<HappyLink, { type: "reference" }>,
    references: MessageReferences | undefined,
): string {
    const placeholder = happyReferencePlaceholder(link.reference);
    if (!linkHere(link, references)) return placeholder;
    return referenceView(link.reference, references).label.trim() || placeholder;
}

/**
 * The plain words a Happy link reads as. A thing it names reads as
 * `referenceWords`; a file as its label, or its path when it has none; a
 * settings page as its label, or "Settings"; anything malformed or of a kind
 * this build does not know as "an unavailable reference".
 */
function linkWords(
    link: HappyLink | undefined,
    written: string,
    references: MessageReferences | undefined,
): string {
    const label = labelPlain(written);
    switch (link?.type) {
        case "reference":
            return referenceWords(link, references);
        case "file":
            return label || link.file.path;
        case "settings":
            return label || "Settings";
        case undefined:
            return "an unavailable reference";
    }
}

/**
 * What a share link opens, as a Happy link, or nothing for a URL the share
 * grammar refuses.
 */
function shareLinkParse(url: string): HappyLink | undefined {
    const target = happyShareLinkParse(url);
    return target === undefined ? undefined : parseHappyUrl(target.url);
}

/** Whether a reference reads as something in the body, a link or a person's tag, not as words. */
export function messageReferenceShown(view: MessageReferenceView | undefined): boolean {
    return view?.type === "link" || view?.type === "person";
}

/**
 * A link's destination as these references read it: a share link naming
 * their instance is the `happy://` link it carries; anything else is itself.
 */
export function messageHrefHere(
    href: string | undefined,
    references: MessageReferences | undefined,
): string | undefined {
    if (href === undefined || references?.instanceId === undefined) return href;
    const share = happyShareLinkParse(href);
    return share?.instanceId === references.instanceId ? share.url : href;
}

/** Whether a link is for the instance these references read, or names none. */
function linkHere(link: HappyLink, references: MessageReferences | undefined): boolean {
    return link.instanceId === undefined || link.instanceId === references?.instanceId;
}

/** The settings page a `happy://` address names here, or nothing for any other link. */
export function messageSettingsPageFromHref(
    href: string | undefined,
    references: MessageReferences | undefined,
): HappySettingsPage | string | undefined {
    const here = messageHrefHere(href, references);
    if (here === undefined) return undefined;
    const link = parseHappyUrl(here);
    if (link === undefined) return happyAgentProviderAddPageOf(here);
    return link.type === "settings" && linkHere(link, references) ? link.page : undefined;
}

/**
 * A provider add link as written, `[label](happy://settings/providers/add… "button")`,
 * which happy-agent-client does not read yet. It stays a link, as any settings link does.
 */
const PROVIDER_ADD_LINK =
    /^\[(?:[^\]\\]|\\.)*\]\((happy:\/\/settings\/providers\/add[^\s)]*)(?:\s+"button")?\)$/u;

function providerAddLink(match: HappyLinkMatch): string | undefined {
    if (match.syntax !== "link" || match.image) return undefined;
    const href = PROVIDER_ADD_LINK.exec(match.source)?.[1];
    if (href === undefined || happyAgentProviderAddPageOf(href) === undefined) return undefined;
    const label = labelEscape(match.label) || "Settings";
    return match.display === "button" ? `[${label}](${href} "button")` : `[${label}](${href})`;
}

/**
 * The words a link reads as when it is a Happy link to a thing, a share link
 * or a `happy://` address, whatever label it was written with: see
 * `referenceWords`. Nothing for a file or settings link, which keep their
 * labels, or for anything that is not a Happy link.
 */
export function messageLinkWords(
    href: string | undefined,
    references: MessageReferences | undefined,
): string | undefined {
    if (href === undefined) return undefined;
    const shared = happyShareLinkParse(href) !== undefined;
    if (!shared && (!isHappyUrl(href) || happyAgentProviderAddPageOf(href) !== undefined))
        return undefined;
    const link = shared ? shareLinkParse(href) : parseHappyUrl(href);
    if (link?.type === "file" || link?.type === "settings") return undefined;
    return linkWords(link, "", references);
}

/**
 * The reference a `happy://` address names here, or nothing for a file link,
 * anything malformed, or a link naming another instance.
 */
export function messageReferenceFromHref(
    href: string | undefined,
    references: MessageReferences | undefined,
): HappyReference | undefined {
    const here = messageHrefHere(href, references);
    if (here === undefined) return undefined;
    const link = parseHappyUrl(here);
    return link?.type === "reference" && linkHere(link, references) ? link.reference : undefined;
}

/** The file a link names here, or nothing for any other link or one naming another instance. */
export function messageFileLinkFromHref(
    href: string | undefined,
    references: MessageReferences | undefined,
): HappyAgentFileLink | undefined {
    const here = messageHrefHere(href, references);
    if (here === undefined) return undefined;
    const link = parseHappyUrl(here);
    if (link !== undefined && !linkHere(link, references)) return undefined;
    return happyAgentFileLinkParse(here);
}

/**
 * A `[label](happy://…)` link as written with `label` between its brackets,
 * or nothing when its source is not that shape.
 */
function linkRelabel(match: HappyLinkMatch, label: string): string | undefined {
    const opening = `[${match.label}]`;
    if (match.syntax !== "link" || match.image || !match.source.startsWith(opening))
        return undefined;
    return `[${label}]${match.source.slice(opening.length)}`;
}

/**
 * Where a Happy link was written to point, as written; the canonical address
 * for a legacy tag, which names no destination of its own.
 */
function linkHref(match: HappyLinkMatch, reference: HappyReference): string | undefined {
    if (match.syntax === "link") {
        const written = /\]\(\s*(\S+?)(?:\s+"[^"]*")?\s*\)$/u.exec(match.source)?.[1];
        if (written !== undefined) return written;
    }
    return referenceHref(reference);
}

// The end of a streaming body that may still become a share link: a link's
// label and the start of its destination, `[](https://link.happy.p`.
const SHARE_LINK_PARTIAL = /\[(?:[^\]\\\n]|\\.)*\]\(([^\s()]*)$/u;

/** `text` without a trailing share link that has only partly arrived. */
function shareLinkPartialHold(text: string): string {
    const partial = SHARE_LINK_PARTIAL.exec(text);
    const destination = partial?.[1];
    if (partial === null || destination === undefined) return text;
    const origin = `${HAPPY_SHARE_LINK_ORIGIN}/#`;
    return origin.startsWith(destination) || destination.startsWith(origin)
        ? text.slice(0, partial.index)
        : text;
}

/**
 * The label a `[label](share link)` reads under in Markdown, escaped, or
 * nothing to keep the one it was written with: a file link with a label.
 */
function shareLinkLabel(
    url: string,
    written: string,
    references: MessageReferences | undefined,
): string | undefined {
    const link = shareLinkParse(url);
    if (link?.type === "file" && written.trim().length > 0) return undefined;
    return labelEscape(linkWords(link, written, references));
}

/**
 * The Markdown a message body is rendered and measured from: every Happy link
 * written with brackets, a share link or a `happy://` address, put under the
 * words it reads as now.
 *
 * A link to a thing reads as what that thing is called now, never the label
 * it was written with, which goes stale on a rename; one these references
 * cannot name, or that another server holds, reads as a placeholder such as
 * "an unavailable artifact". Its destination stays exactly as written, so
 * what is copied is what was written, and the link component decides from it
 * whether the link opens here. A `happy://` link that does not open here is
 * its words as plain text; a share link stays a web link, which the app routes
 * to its server. A bare or angle-bracketed share link is its address, as
 * written. A file link keeps its label, with its path filled in when it has
 * none, and a settings link its label. The legacy `<happy-KIND id/>` tags
 * older history holds read as their `happy://` forms. While a reply is still
 * streaming, a link that has only partly arrived is held back rather than
 * flashing as raw text. Links in code stay literal.
 *
 * Rendering and row geometry must both go through this with the same inputs;
 * a body with no Happy link in it comes back unchanged.
 */
export function messageReferencesResolve(
    text: string,
    references: MessageReferences | undefined,
    streaming: boolean,
): string {
    const resolved = replaceHappyLinks(
        happyShareLinksRelabel(text, (url, written) => shareLinkLabel(url, written, references)),
        (match) => {
            const link = match.link;
            if (link === undefined)
                return providerAddLink(match) ?? labelEscape(linkWords(link, "", references));
            // What another instance holds is not read or opened here.
            if (!linkHere(link, references))
                return labelEscape(linkWords(link, match.label, references));
            if (link.type === "file") {
                if (match.image || match.label.trim().length > 0) return match.source;
                return `[${labelEscape(link.file.path)}](${formatHappyFileUrl(link.file)})`;
            }
            // A settings page has no live title: it reads as its label, and
            // the surface decides whether it opens. A button keeps its title.
            if (link.type === "settings") {
                const label = labelEscape(match.label) || "Settings";
                const href = formatHappySettingsUrl(link.page);
                return match.display === "button"
                    ? `[${label}](${href} "button")`
                    : `[${label}](${href})`;
            }
            const reference = link.reference;
            const view = referenceView(reference, references);
            const label = labelEscape(referenceWords(link, references));
            if (messageReferenceShown(view)) {
                const href = referenceHref(reference);
                const relabelled = linkRelabel(match, label);
                if (relabelled !== undefined) return relabelled;
                if (href !== undefined) return `[${label}](${href})`;
            }
            // A person a message mentions stands out from the words around them:
            // a tag where the team knows them, their name in bold where not.
            return reference.kind === "user" ? `**${label}**` : label;
        },
        { streaming },
    );
    return streaming ? shareLinkPartialHold(resolved) : resolved;
}

/**
 * One line of a body as plain words, for a one-line summary that is not
 * rendered as Markdown: every Happy link reads as its words.
 */
export function messageReferencesPlainText(
    text: string,
    references: MessageReferences | undefined,
): string {
    return messagePlainTextSegments(text, references)
        .map((segment) => (segment.type === "text" ? segment.text : segment.label))
        .join("");
}

/** One run of a plain body: its own words, or a reference read as a link. */
export type MessagePlainTextSegment =
    | { readonly type: "text"; readonly text: string }
    | {
          readonly type: "reference";
          readonly reference: HappyReference;
          readonly href: string;
          readonly label: string;
      };

// A share link in plain words, `[label](url)` or bare, up to what its grammar allows.
const SHARE_LINK_IN_PLAIN_TEXT =
    /\[((?:[^[\]\\\n]|\\.)*)\]\((https:\/\/link\.happy\.page\/#1\/[A-Za-z0-9\-._~!$&'*+,;=:@%/?]+)\)|https:\/\/link\.happy\.page\/#1\/[A-Za-z0-9\-._~!$&'*+,;=:@%/?]+/gu;
// What a sentence ends a bare address with, which is not part of it.
const SHARE_URL_TRAILING = /[?!.,:*_~']+$/u;

/**
 * A plain body split around the Happy links it holds, for a person's message
 * shown as typed and for one-line summaries: each link with brackets reads as
 * its words (see `messageReferencesResolve`), a link when it names something
 * openable here; a bare share link stays its address, a link on the same
 * terms. Joined, the runs are `messageReferencesPlainText`, which is what its
 * row is measured from.
 */
export function messagePlainTextSegments(
    text: string,
    references: MessageReferences | undefined,
): readonly MessagePlainTextSegment[] {
    const segments: MessagePlainTextSegment[] = [];
    const wordsAdd = (words: string) => {
        if (words.length === 0) return;
        const last = segments.at(-1);
        if (last?.type === "text")
            segments[segments.length - 1] = { type: "text", text: last.text + words };
        else segments.push({ type: "text", text: words });
    };
    const linkAdd = (link: HappyLink | undefined, href: string | undefined, label: string) => {
        const reference =
            link?.type === "reference" &&
            linkHere(link, references) &&
            messageReferenceShown(references?.view(link.reference))
                ? link.reference
                : undefined;
        if (reference !== undefined && href !== undefined)
            segments.push({ type: "reference", reference, href, label });
        else wordsAdd(label);
    };
    const textAdd = (words: string) => {
        let cursor = 0;
        for (const found of words.matchAll(SHARE_LINK_IN_PLAIN_TEXT)) {
            const written = found[1];
            const bracketed = found[2];
            const url = bracketed ?? found[0].replace(SHARE_URL_TRAILING, "");
            const link = shareLinkParse(url);
            if (link === undefined) continue;
            wordsAdd(words.slice(cursor, found.index));
            linkAdd(
                link,
                url,
                bracketed === undefined ? url : linkWords(link, written ?? "", references),
            );
            cursor = found.index + (bracketed === undefined ? url.length : found[0].length);
        }
        wordsAdd(words.slice(cursor));
    };
    for (const segment of parseHappyLinks(text)) {
        if (segment.type === "text") textAdd(segment.text);
        else
            linkAdd(
                segment.link,
                segment.link?.type === "reference"
                    ? linkHref(segment, segment.link.reference)
                    : undefined,
                providerAddLink(segment) === undefined
                    ? linkWords(segment.link, segment.label, references)
                    : labelPlain(segment.label) || "Settings",
            );
    }
    return segments;
}

/**
 * The references one body names, in order. A body is immutable, so a caller
 * holding the same body can keep this and skip the parse next time.
 */
export function messageReferencesNamed(text: string): readonly HappyReference[] {
    // Any server's share link is named, as any server's `happy://` link is.
    return parseHappyLinks(happyShareLinksRewrite(text, () => true)).flatMap((segment) =>
        segment.type === "link" && segment.link?.type === "reference"
            ? [segment.link.reference]
            : [],
    );
}

/**
 * What the references a body names read as, for caches keyed by an entry rather
 * than by its text: two bodies with the same signature lay out identically.
 * Empty when the body names nothing. Busy is left out because it only paints.
 */
export function messageReferencesSignature(
    named: readonly HappyReference[],
    references: MessageReferences | undefined,
): string {
    if (named.length === 0) return "";
    return named
        .map((reference) => {
            const view = referenceView(reference, references);
            return `${view.type}:${view.label}`;
        })
        .join("\u0000");
}
