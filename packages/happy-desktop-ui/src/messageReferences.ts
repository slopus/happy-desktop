import {
    formatHappyFileUrl,
    formatHappyReferenceUrl,
    happyReferencePlaceholder,
    parseHappyLinks,
    parseHappyUrl,
    replaceHappyLinks,
    type HappyLinkMatch,
    type HappyReference,
} from "happy-desktop-state";

/**
 * How one Happy reference in a message reads right now.
 *
 * - `link` — something the reader can open: its live title, and whether the
 *   thing is busy (an agent working, a service running) so the link can say so.
 * - `text` — something that cannot be opened: deleted, unknown, not visible to
 *   this reader, or a kind this build does not know. It reads as plain words.
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
    | { readonly type: "text"; readonly label: string };

/**
 * The live side of the references a transcript shows, supplied by the surface
 * that owns the stores behind them. `view` is asked while rendering and while
 * sizing rows, so it must be a pure read of the owner's current snapshot.
 */
export interface MessageReferences {
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
 * Which words one reference reads as, given the label its writer put on the
 * link. The live title wins whenever there is one; the writer's label stands in
 * while the title is still being read, and for a thing this reader cannot look
 * up at all, where it says more than "an unavailable artifact" would.
 */
function referenceWords(
    view: MessageReferenceView,
    reference: HappyReference,
    written: string,
): { readonly link: boolean; readonly label: string; readonly written: boolean } {
    const writtenUsable = written.trim().length > 0;
    if (view.type === "link")
        return view.reading === true && writtenUsable
            ? { link: true, label: written, written: true }
            : { link: true, label: view.label, written: false };
    return view.label === happyReferencePlaceholder(reference) && writtenUsable
        ? { link: false, label: written, written: true }
        : { link: false, label: view.label, written: false };
}

/** The reference a `happy://` address names, or nothing for a file link or anything malformed. */
export function messageReferenceFromHref(href: string | undefined): HappyReference | undefined {
    if (href === undefined) return undefined;
    const link = parseHappyUrl(href);
    return link?.type === "reference" ? link.reference : undefined;
}

/**
 * The Markdown a message body is rendered and measured from: every Happy link
 * replaced by what it reads as now.
 *
 * A link to something openable stays an ordinary Markdown link to its
 * canonical `happy://` address, titled with the escaped live title, so it
 * renders and wraps exactly like any other link in the body and the row-height
 * model measures the same words the reader sees. An inert one becomes its
 * words as plain text. A file link, `happy://` or `happy-file://`, stays as
 * written, with its path filled in when the writer left the label empty. The
 * legacy `<happy-KIND id/>` tags older history holds read exactly like their
 * `happy://` forms. While a reply is still streaming, a link that has only partly arrived
 * is held back rather than flashing as raw text. Links in code stay literal.
 *
 * Rendering and row geometry must both go through this with the same inputs;
 * a body with no Happy link in it comes back unchanged.
 */
export function messageReferencesResolve(
    text: string,
    references: MessageReferences | undefined,
    streaming: boolean,
): string {
    return replaceHappyLinks(
        text,
        (match) => {
            const link = match.link;
            if (link === undefined)
                return match.label.trim().length > 0
                    ? match.label
                    : match.syntax === "legacyTag"
                      ? "an unavailable reference"
                      : "";
            if (link.type === "file") {
                if (match.image || match.label.trim().length > 0) return match.source;
                return `[${labelEscape(link.file.path)}](${formatHappyFileUrl(link.file)})`;
            }
            const reference = link.reference;
            const words = referenceWords(
                referenceView(reference, references),
                reference,
                match.label,
            );
            const label =
                (words.written ? words.label.trim() : labelEscape(words.label)) ||
                labelEscape(happyReferencePlaceholder(reference));
            const href = words.link ? referenceHref(reference) : undefined;
            const shown = href === undefined ? label : `[${label}](${href})`;
            // A person a message mentions stands out from the words around them.
            return reference.kind === "user" ? `**${shown}**` : shown;
        },
        { streaming },
    );
}

/** The words one Happy link in a plain body reads as. */
function linkPlainWords(match: HappyLinkMatch, references: MessageReferences | undefined): string {
    const link = match.link;
    if (link?.type === "reference") {
        const words = referenceWords(
            referenceView(link.reference, references),
            link.reference,
            match.label,
        );
        return words.written ? labelPlain(words.label) : words.label;
    }
    const written = labelPlain(match.label);
    if (written.length > 0) return written;
    if (link?.type === "file") return link.file.path;
    return match.syntax === "legacyTag" ? "an unavailable reference" : "";
}

/**
 * One line of a body as plain words, for a one-line summary that is not
 * rendered as Markdown: every Happy link reads as its words.
 */
export function messageReferencesPlainText(
    text: string,
    references: MessageReferences | undefined,
): string {
    return replaceHappyLinks(text, (match) => linkPlainWords(match, references));
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

/**
 * A plain body split around the references it names, for a person's message
 * shown as typed: each openable reference becomes a link under the label it
 * reads as, and an inert one its label as words. Joined, the runs read
 * exactly as `messageReferencesPlainText` does, which is what its row is
 * measured from.
 */
export function messagePlainTextSegments(
    text: string,
    references: MessageReferences | undefined,
): readonly MessagePlainTextSegment[] {
    const segments: MessagePlainTextSegment[] = [];
    const textAdd = (words: string) => {
        if (words.length === 0) return;
        const last = segments.at(-1);
        if (last?.type === "text")
            segments[segments.length - 1] = { type: "text", text: last.text + words };
        else segments.push({ type: "text", text: words });
    };
    for (const segment of parseHappyLinks(text)) {
        if (segment.type === "text") {
            textAdd(segment.text);
            continue;
        }
        const label = linkPlainWords(segment, references);
        const link = segment.link;
        const href =
            link?.type === "reference" && references?.view(link.reference).type === "link"
                ? referenceHref(link.reference)
                : undefined;
        if (link?.type === "reference" && href !== undefined)
            segments.push({ type: "reference", reference: link.reference, href, label });
        else textAdd(label);
    }
    return segments;
}

/**
 * The references one body names, in order. A body is immutable, so a caller
 * holding the same body can keep this and skip the parse next time.
 */
export function messageReferencesNamed(text: string): readonly HappyReference[] {
    return parseHappyLinks(text).flatMap((segment) =>
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
