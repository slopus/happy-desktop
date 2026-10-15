import {
    Children,
    createContext,
    createElement,
    memo,
    useContext,
    useState,
    type ComponentPropsWithoutRef,
    type ReactNode,
} from "react";
import { happyAgentFileLinkParse } from "happy-desktop-state";
import Markdown, { type Components, type ExtraProps, type UrlTransform } from "react-markdown";
import { ContextMenu } from "./ContextMenu";
import { filePreviewKind } from "./FilePreview";
import { type MenuItem } from "./Menu";
import { markdownFence, markdownFenceIsMermaid, markdownFenceLabel } from "./markdownFence";
import {
    guidedReviewDocument,
    guidedReviewFenceLabel,
    guidedReviewFenceOpen,
    remarkGuidedReviewSections,
    type HappyUiImage,
} from "./guidedReview";
import { GuidedReviewFence } from "./GuidedReviewFence";
import { type HappyUiGrounding } from "./happyUiGrounding";
import { type FileLinkOpenHandler, type FileOpenHandler } from "./fileReference";
import { markdownDocumentLinkTarget, markdownFileUrlTransform } from "./MarkdownDocument";
import { MermaidDiagram } from "./MermaidDiagram";
import { FILE_REFERENCE_LINK_ATTRIBUTE } from "./messageFileReferences";
import { MESSAGE_MARKDOWN_REMARK_PLUGINS } from "./messageMarkdownAst";
import {
    messageReferenceFromHref,
    messageReferenceHrefIs,
    messageReferencesResolve,
    type MessageReferences,
} from "./messageReferences";
import {
    markdownTableLayoutAt,
    messageTextLayoutFontGenerationSubscribe,
} from "./messageTextLayout";
import { ScrollArea } from "./Scrollbar";
import { ShimmerText } from "./ShimmerText";

// Keep unchanged streamed message bodies from re-running react-markdown's
// parser when an unrelated conversation notification reaches the parent.
const MemoMarkdown = memo(Markdown);
/**
 * Agent generation lifecycle for a streamed reply. This is deliberately kept
 * separate from `MessageDeliveryState`: delivery describes an *outgoing* message
 * reaching the server, while generation describes an *incoming* agent reply
 * being produced. A message can be delivered ("sent") while its body is still
 * being generated ("streaming").
 */
export type MessageGenerationStatus = "streaming" | "complete" | "failed";
/**
 * Schemes an untrusted chat link/image may navigate to. This explicit allowlist
 * is stricter than the renderer's general URL filter.
 */
const NAVIGABLE_SCHEMES = new Set(["http", "https", "mailto"]);
/**
 * Navigable URL, or `undefined` when unsafe/empty. Only an absolute `http:`,
 * `https:`, or `mailto:` target becomes a live href. Everything else — `data:`
 * (including `data:image`), `file:`, `blob:`, script schemes, protocol-relative
 * `//host`, relative paths, and bare `#fragment` navigation — is rejected so the
 * anchor renders inert (no `href`).
 */
function safeHref(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    if (trimmed.length === 0) return undefined;
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed);
    if (!scheme) return undefined;
    return NAVIGABLE_SCHEMES.has(scheme[1]!.toLowerCase()) ? trimmed : undefined;
}
const MarkdownLinkContext = createContext(false);
/**
 * Opens a file a message links to, when the surface hosting the transcript has
 * a workspace to open it in. A link to `docs/plan.md` is a link to something
 * Happy can show; without this it stays inert rather than becoming a navigation
 * the app cannot honour.
 */
const MarkdownFileOpenContext = createContext<FileOpenHandler | undefined>(undefined);
/**
 * Opens a file a `happy-file:` link names in another agent's or workspace's
 * folder. Absent, such a link stays inert like any other target this surface
 * cannot open.
 */
const MarkdownFileLinkOpenContext = createContext<FileLinkOpenHandler | undefined>(undefined);
/** Where the reader asked a web link to open from its context menu. */
export type LinkOpenPlacement = "browser" | "panel";
/**
 * Opens one web address where the reader chose: `browser` is the machine's own
 * browser, `panel` is the side panel beside the conversation.
 */
export type LinkOpenHandler = (url: string, placement: LinkOpenPlacement) => void;
/**
 * Offers a web link a choice of where to open, on right-click. Without it a
 * link is a plain click that goes wherever the host sends every link, and no
 * menu is drawn — a surface that cannot honour the choice does not ask it.
 */
const MarkdownLinkOpenContext = createContext<LinkOpenHandler | undefined>(undefined);
const LINK_MENU_BROWSER: LinkOpenPlacement = "browser";
const LINK_MENU_PANEL: LinkOpenPlacement = "panel";
/**
 * Which of the two places a plain click already goes, so the menu can say so
 * beside that row. Absent, neither row claims it.
 */
const MarkdownLinkDefaultContext = createContext<LinkOpenPlacement | undefined>(undefined);
function linkMenuItems(defaultPlacement: LinkOpenPlacement | undefined): MenuItem[] {
    const detail = (placement: LinkOpenPlacement) =>
        placement === defaultPlacement ? { detail: "Default" } : {};
    return [
        {
            kind: "item",
            id: LINK_MENU_BROWSER,
            label: "Open in browser",
            icon: "open-external",
            ...detail(LINK_MENU_BROWSER),
        },
        {
            kind: "item",
            id: LINK_MENU_PANEL,
            label: "Open in side panel",
            icon: "panel-expand",
            ...detail(LINK_MENU_PANEL),
        },
    ];
}
/**
 * The live side of the Happy references a message names: what each reads as,
 * and where opening one goes. Absent, every reference reads as inert text.
 */
const MarkdownReferencesContext = createContext<MessageReferences | undefined>(undefined);
/**
 * A Happy reference the agent named: an underlined link like any other in the
 * body, reading as the live title of what it names. While that thing is busy
 * the title carries the same travelling band a busy sidebar row or tab does,
 * and nothing else changes — the words wrap where they would without it.
 */
const MarkdownReferenceLink = ({
    children,
    href,
    references,
    reference,
}: {
    children?: ReactNode;
    href: string;
    references: MessageReferences;
    reference: NonNullable<ReturnType<typeof messageReferenceFromHref>>;
}) => {
    const view = references.view(reference);
    const busy = view.type === "link" && view.busy;
    return (
        <a
            className="happy-message__md-link happy-message__md-reference"
            data-busy={busy ? "" : undefined}
            data-happy-desktop-ui="message-md-reference"
            data-reference-kind={reference.kind}
            href={href}
            // The href exists only so this is a real, focusable link. Its
            // private scheme means nothing outside this window, so no click —
            // plain, modified, or middle — may hand it to the browser or the
            // OS: every one opens the reference here instead.
            onClick={(event) => {
                event.preventDefault();
                references.open(reference);
            }}
            onAuxClick={(event) => {
                event.preventDefault();
                if (event.button === 1) references.open(reference);
            }}
            onDragStart={(event) => event.preventDefault()}
        >
            {busy ? (
                <ShimmerText inline sweep="sheen" tone="inherit">
                    {children}
                </ShimmerText>
            ) : (
                children
            )}
        </a>
    );
};
/**
 * The real change behind the guided review a message draws. Absent, a block
 * still draws, but claims nothing about files: a transcript read somewhere
 * with no checkout behind it has no change to check against.
 */
const MarkdownHappyUiGroundingContext = createContext<HappyUiGrounding | undefined>(undefined);
const MarkdownTrailingContext = createContext<{
    endOffset: number;
    node: ReactNode;
} | null>(null);
const MarkdownGenerationStatusContext = createContext<MessageGenerationStatus | undefined>(
    undefined,
);
/**
 * The Markdown being rendered, after its references are resolved: a table
 * re-reads its own AST from it by offset, a guided review its fences.
 */
const MarkdownSourceContext = createContext("");
type MarkdownImageProps = ComponentPropsWithoutRef<"img"> & ExtraProps;
/**
 * A Markdown image is rendered as a safe labelled link, never an `<img>`: an
 * untrusted body must not trigger an implicit remote fetch merely by being
 * displayed. First-class attachments use the Message image grid instead.
 */
const MarkdownImage = ({ alt, src }: MarkdownImageProps) => {
    const withinLink = useContext(MarkdownLinkContext);
    const href = safeHref(src);
    const label = alt?.trim() || href || "image";
    if (withinLink)
        return (
            <span
                className="happy-message__md-image"
                data-md-src={href}
                data-happy-desktop-ui="message-md-image"
            >
                {label}
            </span>
        );
    return (
        <a
            className="happy-message__md-link happy-message__md-image"
            data-md-src={href}
            data-happy-desktop-ui="message-md-image"
            href={href}
            rel="noopener noreferrer nofollow"
            target="_blank"
        >
            {label}
        </a>
    );
};
/**
 * Links inside untrusted chat content open in a fresh browsing context and never
 * replace the app window; `rel` severs the opener channel and drops the referrer.
 * A linked image becomes labelled content of this anchor instead of a nested
 * interactive element.
 */
const MarkdownLink = ({
    children,
    className,
    href,
    node: _node,
    ...props
}: ComponentPropsWithoutRef<"a"> & ExtraProps) => {
    const references = useContext(MarkdownReferencesContext);
    const reference = references === undefined ? undefined : messageReferenceFromHref(href);
    const safe = safeHref(href);
    const onFileOpen = useContext(MarkdownFileOpenContext);
    const onFileLinkOpen = useContext(MarkdownFileLinkOpenContext);
    const onLinkOpen = useContext(MarkdownLinkOpenContext);
    const linkOpenDefault = useContext(MarkdownLinkDefaultContext);
    // The link's own context menu, while it is up: where the pointer asked
    // for it. Local to the link because nothing else in the message reads it.
    const [menuAt, setMenuAt] = useState<{ x: number; y: number }>();
    if (reference !== undefined && references !== undefined)
        return (
            <MarkdownReferenceLink href={href!} reference={reference} references={references}>
                {children}
            </MarkdownReferenceLink>
        );
    // A link into another workspace's folder carries that folder, so it opens
    // the same file wherever the message is read. Its scheme means nothing to
    // the browser or the OS, so no click may hand it to either.
    const fileLink =
        safe === undefined && typeof href === "string" ? happyAgentFileLinkParse(href) : undefined;
    if (
        fileLink !== undefined &&
        onFileLinkOpen !== undefined &&
        filePreviewKind(fileLink.path) !== "binary"
    )
        return (
            <a
                className="happy-message__md-link happy-message__md-file"
                data-happy-desktop-ui="message-md-file"
                data-path={fileLink.path}
                href={href}
                onClick={(event) => {
                    event.preventDefault();
                    onFileLinkOpen(fileLink);
                }}
                onAuxClick={(event) => {
                    event.preventDefault();
                    if (event.button === 1) onFileLinkOpen(fileLink);
                }}
                onDragStart={(event) => event.preventDefault()}
            >
                <MarkdownLinkContext.Provider value={true}>{children}</MarkdownLinkContext.Provider>
            </a>
        );
    const target = safe === undefined ? markdownDocumentLinkTarget(href) : undefined;
    // Only a file this product can actually show is offered as a click. An
    // archive or an executable stays plain text rather than promising a preview
    // that would open on "no preview".
    if (
        target !== undefined &&
        onFileOpen !== undefined &&
        filePreviewKind(target.path) !== "binary"
    )
        return (
            <a
                className="happy-message__md-link happy-message__md-file"
                data-happy-desktop-ui="message-md-file"
                data-path={target.path}
                href={target.path}
                onClick={(event) => {
                    event.preventDefault();
                    onFileOpen(target.path, target.selection);
                }}
            >
                <MarkdownLinkContext.Provider value={true}>{children}</MarkdownLinkContext.Provider>
            </a>
        );
    // A written reference this surface cannot open is the words it was written
    // as. The transcript made that link itself, so an inert anchor here would
    // underline a path in every message read somewhere with no workspace behind
    // it and promise a click that is not coming. A link the author wrote to a
    // file is different: it was a link on the page and stays one, inert, the
    // way every other target this surface will not navigate to does.
    if (target !== undefined && FILE_REFERENCE_LINK_ATTRIBUTE in props)
        return <MarkdownLinkContext.Provider value={true}>{children}</MarkdownLinkContext.Provider>;
    // Only a web page has two places to open; a mail address has one, and it
    // is not a place this product draws.
    const webUrl =
        safe !== undefined && !safe.toLowerCase().startsWith("mailto:") ? safe : undefined;
    const menuOffered = onLinkOpen !== undefined && webUrl !== undefined;
    return (
        <>
            <a
                {...props}
                className={["happy-message__md-link", className].filter(Boolean).join(" ")}
                data-happy-desktop-ui="message-md-link"
                href={safe}
                onContextMenu={
                    menuOffered
                        ? (event) => {
                              event.preventDefault();
                              setMenuAt({ x: event.clientX, y: event.clientY });
                          }
                        : undefined
                }
                rel="noopener noreferrer nofollow"
                target="_blank"
            >
                <MarkdownLinkContext.Provider value={true}>{children}</MarkdownLinkContext.Provider>
            </a>
            {menuOffered && menuAt !== undefined ? (
                <ContextMenu
                    data-testid="message-md-link-menu"
                    items={linkMenuItems(linkOpenDefault)}
                    onClose={() => setMenuAt(undefined)}
                    onSelect={(id) => {
                        setMenuAt(undefined);
                        onLinkOpen(webUrl, id === LINK_MENU_BROWSER ? "browser" : "panel");
                    }}
                    x={menuAt.x}
                    y={menuAt.y}
                />
            ) : null}
        </>
    );
};
function appendTrailingInline(children: ReactNode, trailing: ReactNode): ReactNode {
    const nodes = Children.toArray(children);
    const last = nodes.pop();
    if (typeof last === "string") {
        const finalWord = /^(.*)(\s+)(\S+)$/.exec(last);
        if (finalWord)
            return (
                <>
                    {nodes}
                    {finalWord[1]}
                    {finalWord[2]}
                    <span
                        className="happy-message__trailing-inline"
                        data-happy-desktop-ui="message-trailing-inline"
                    >
                        {finalWord[3]}
                        {"\u00a0"}
                        {trailing}
                    </span>
                </>
            );
    }
    return (
        <>
            {nodes}
            <span
                className="happy-message__trailing-inline"
                data-happy-desktop-ui="message-trailing-inline"
            >
                {last}
                {"\u00a0"}
                {trailing}
            </span>
        </>
    );
}
const MarkdownParagraph = ({
    children,
    node,
    ...props
}: ComponentPropsWithoutRef<"p"> & ExtraProps) => {
    const trailing = useContext(MarkdownTrailingContext);
    return (
        <p {...props}>
            {trailing !== null && node?.position?.end.offset === trailing.endOffset
                ? appendTrailingInline(children, trailing.node)
                : children}
        </p>
    );
};
const MarkdownPre = ({
    children,
    node,
    ...props
}: ComponentPropsWithoutRef<"pre"> & ExtraProps) => {
    const fence = markdownFence(node);
    const generationStatus = useContext(MarkdownGenerationStatusContext);
    const grounding = useContext(MarkdownHappyUiGroundingContext);
    const onFileOpen = useContext(MarkdownFileOpenContext);
    const onFileLinkOpen = useContext(MarkdownFileLinkOpenContext);
    const onLinkOpen = useContext(MarkdownLinkOpenContext);
    const linkOpenDefault = useContext(MarkdownLinkDefaultContext);
    const references = useContext(MarkdownReferencesContext);
    const text = useContext(MarkdownSourceContext);
    const codeBlock = (
        <ScrollArea
            axes="horizontal"
            className="happy-message__code-block"
            data-happy-desktop-ui="message-code-block"
            viewportClassName="happy-message__code-block-viewport"
        >
            <pre {...props}>{children}</pre>
        </ScrollArea>
    );
    const reviewLabel = guidedReviewFenceLabel(markdownFenceLabel(node));
    // A Happy fence is drawn once it closes; until then one quiet line holds
    // its place, never its half-written fields.
    if (reviewLabel !== undefined)
        return (
            <GuidedReviewFence
                document={guidedReviewDocument(text)}
                label={reviewLabel}
                markdown={(body) => (
                    <div className="happy-message__body happy-message__body--markdown">
                        {renderMessageMarkdown(
                            body,
                            undefined,
                            onFileOpen,
                            "complete",
                            onLinkOpen,
                            linkOpenDefault,
                            references,
                            onFileLinkOpen,
                            grounding,
                        )}
                    </div>
                )}
                open={guidedReviewFenceOpen(
                    text,
                    node?.position?.end.offset ?? text.length,
                    generationStatus === "streaming",
                )}
                source={fence?.text ?? ""}
                sourceBlock={codeBlock}
                streaming={generationStatus === "streaming"}
                {...(grounding === undefined ? {} : { grounding })}
                {...(onFileOpen === undefined ? {} : { onFileOpen })}
                // A before/after picture is an artifact version; it opens
                // where that artifact's reference link would open it.
                {...(references === undefined
                    ? {}
                    : {
                          onImageOpen: (image: HappyUiImage) =>
                              references.open({
                                  kind: "artifact",
                                  id: image.artifact,
                                  version: image.version,
                              }),
                      })}
            />
        );
    if (markdownFenceIsMermaid(fence))
        return (
            <MermaidDiagram
                enabled={generationStatus !== "streaming"}
                source={fence!.text}
                variant="message"
            />
        );
    return codeBlock;
};
/** Cells in the header row, which is how many columns the table renders. */
function markdownTableColumnCount(node: ExtraProps["node"]): number {
    const head = node?.children.find(
        (child) => child.type === "element" && child.tagName === "thead",
    );
    const row =
        head?.type === "element"
            ? head.children.find((child) => child.type === "element" && child.tagName === "tr")
            : undefined;
    return row?.type === "element"
        ? row.children.filter((child) => child.type === "element").length
        : 0;
}
/**
 * A table wraps its cells at column widths solved by `markdownTableLayoutAt`,
 * the same solve the virtual list sized this row with. The solve needs the
 * scrollport's real measure, which only exists once it is laid out, so the ref
 * writes the widths during commit — before the first paint — and again
 * whenever that measure or the installed font changes.
 */
const MarkdownTable = ({
    children,
    node,
    ...props
}: ComponentPropsWithoutRef<"table"> & ExtraProps) => {
    const source = useContext(MarkdownSourceContext);
    const offset = node?.position?.start.offset;
    const columns = markdownTableColumnCount(node);
    const tableRef = (table: HTMLTableElement | null) => {
        // ScrollArea renders its children directly in the scroll viewport.
        const viewport = table?.parentElement;
        if (!table || !viewport || offset === undefined) return;
        let applied = "";
        const apply = () => {
            const measure = Number.parseFloat(getComputedStyle(viewport).width);
            if (!(measure > 0)) return;
            const layout = markdownTableLayoutAt(source, offset, measure);
            if (!layout) return;
            const key = layout.columnWidths.join(",");
            if (key === applied) return;
            applied = key;
            table.style.width = `${String(layout.width)}px`;
            for (const [index, col] of table
                .querySelectorAll<HTMLTableColElement>(":scope > colgroup > col")
                .entries())
                col.style.width = `${String(layout.columnWidths[index] ?? 0)}px`;
            table.dataset.layout = "solved";
        };
        apply();
        const observer = new ResizeObserver(apply);
        observer.observe(viewport);
        const unsubscribe = messageTextLayoutFontGenerationSubscribe(() => {
            applied = "";
            apply();
        });
        return () => {
            observer.disconnect();
            unsubscribe();
        };
    };
    return (
        <ScrollArea
            axes="horizontal"
            className="happy-message__table-scroll"
            data-happy-desktop-ui="message-table-scroll"
            viewportClassName="happy-message__table-scroll-viewport"
        >
            <table {...props} ref={tableRef}>
                <colgroup>
                    {Array.from({ length: columns }, (_, index) => (
                        // Columns are positions, not entities: the nth `<col>` is the nth column.
                        <col key={index} />
                    ))}
                </colgroup>
                {children}
            </table>
        </ScrollArea>
    );
};
/** Footnote references stay in normal inline flow so their AST label uses the
 * same line box and font metrics as the surrounding paragraph. */
const MarkdownSup = ({
    children,
    node: _node,
    ...props
}: ComponentPropsWithoutRef<"sup"> & ExtraProps) => <span {...props}>{children}</span>;
/**
 * Headings render with no generated `id`. Chat bodies are untrusted and appear
 * many-to-a-page, so generated heading anchors would collide across messages.
 * The body has no in-message anchor navigation. Styling is by tag
 * (`.happy-message__body--markdown h1…h6`), so plain elements keep the type
 * ramp without adding global identifiers.
 */
const headingOverride = (
    tag: "h1" | "h2" | "h3" | "h4" | "h5" | "h6",
): NonNullable<Components[typeof tag]> => {
    const MarkdownHeading = ({ children }: { children?: ReactNode }) =>
        createElement(tag, undefined, children);
    return MarkdownHeading as NonNullable<Components[typeof tag]>;
};
const markdownComponents: Components = {
    a: MarkdownLink,
    img: MarkdownImage,
    p: MarkdownParagraph,
    pre: MarkdownPre,
    sup: MarkdownSup,
    table: MarkdownTable,
    h1: headingOverride("h1"),
    h2: headingOverride("h2"),
    h3: headingOverride("h3"),
    h4: headingOverride("h4"),
    h5: headingOverride("h5"),
    h6: headingOverride("h6"),
};
/** The chat's syntax, then a guided review's chapters grouped for layout. */
const MESSAGE_MARKDOWN_RENDER_PLUGINS = [
    ...MESSAGE_MARKDOWN_REMARK_PLUGINS,
    remarkGuidedReviewSections,
];
/** Keeps the reference links this module wrote; every other URL is filtered as before. */
const messageUrlTransform: UrlTransform = (url, key, node) =>
    key === "href" && node.tagName === "a" && messageReferenceHrefIs(url)
        ? url
        : markdownFileUrlTransform(url, key, node);
/**
 * Render untrusted Markdown as React nodes. Raw HTML is never activated because
 * no raw-HTML plugin is present; block nodes are emitted as direct siblings so
 * the message body's spacing rules remain authoritative. Optional trailing
 * content is injected into the final paragraph's inline flow so it cannot wrap
 * independently at the paragraph boundary. `onFileOpen` turns a link that names
 * a workspace file into a click that opens Happy's own viewer instead of an
 * inert anchor, and `onFileLinkOpen` does the same for a `happy-file:` link
 * into another agent's or workspace's folder. `onLinkOpen` gives a web link a context menu offering the
 * machine's browser or the side panel. `references` resolves the Happy
 * reference tags an agent wrote to their live titles; without it each reads as
 * inert placeholder text, and a tag never shows raw. `grounding` is the real
 * change the body's guided review is checked against.
 */
export function renderMessageMarkdown(
    source: string,
    trailing?: ReactNode,
    onFileOpen?: FileOpenHandler,
    generationStatus?: MessageGenerationStatus,
    onLinkOpen?: LinkOpenHandler,
    linkOpenDefault?: LinkOpenPlacement,
    references?: MessageReferences,
    onFileLinkOpen?: FileLinkOpenHandler,
    grounding?: HappyUiGrounding,
): ReactNode {
    const text = messageReferencesResolve(source, references, generationStatus === "streaming");
    return (
        <MarkdownHappyUiGroundingContext.Provider value={grounding}>
            <MarkdownSourceContext.Provider value={text}>
                <MarkdownGenerationStatusContext.Provider value={generationStatus}>
                    <MarkdownTrailingContext.Provider
                        value={
                            trailing === undefined
                                ? null
                                : { endOffset: text.trimEnd().length, node: trailing }
                        }
                    >
                        <MarkdownReferencesContext.Provider value={references}>
                            <MarkdownFileOpenContext.Provider value={onFileOpen}>
                                <MarkdownFileLinkOpenContext.Provider value={onFileLinkOpen}>
                                <MarkdownLinkOpenContext.Provider value={onLinkOpen}>
                                    <MarkdownLinkDefaultContext.Provider value={linkOpenDefault}>
                                        <MemoMarkdown
                                            components={markdownComponents}
                                            urlTransform={messageUrlTransform}
                                            remarkPlugins={MESSAGE_MARKDOWN_RENDER_PLUGINS}
                                            skipHtml
                                        >
                                            {text}
                                        </MemoMarkdown>
                                    </MarkdownLinkDefaultContext.Provider>
                                </MarkdownLinkOpenContext.Provider>
                                </MarkdownFileLinkOpenContext.Provider>
                            </MarkdownFileOpenContext.Provider>
                        </MarkdownReferencesContext.Provider>
                    </MarkdownTrailingContext.Provider>
                </MarkdownGenerationStatusContext.Provider>
            </MarkdownSourceContext.Provider>
        </MarkdownHappyUiGroundingContext.Provider>
    );
}
