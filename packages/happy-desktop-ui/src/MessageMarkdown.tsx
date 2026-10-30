import {
    createContext,
    createElement,
    memo,
    useContext,
    useState,
    type ComponentPropsWithoutRef,
    type ReactNode,
} from "react";
import { happyAgentFileLinkParse, isHappyUrl, type HappyReference } from "happy-desktop-state";
import Markdown, { type Components, type ExtraProps, type UrlTransform } from "react-markdown";
import type { Processor } from "unified";
import { LinkContextMenu } from "./LinkContextMenu";
import { filePreviewKind } from "./FilePreview";
import { type MenuItem } from "./Menu";
import { markdownFence, markdownFenceIsMermaid } from "./markdownFence";
import { type FileLinkOpenHandler, type FileOpenHandler } from "./fileReference";
import { markdownDocumentLinkTarget, markdownFileUrlTransform } from "./MarkdownDocument";
import { MathFormula } from "./MathFormula";
import { mathFormulaRender } from "./mathFormulaRender";
import { MermaidDiagram } from "./MermaidDiagram";
import { FILE_REFERENCE_LINK_ATTRIBUTE } from "./messageFileReferences";
import { MESSAGE_MARKDOWN_REMARK_PLUGINS, type MessageMarkdownAst } from "./messageMarkdownAst";
import { messageInlineLayoutKey } from "./conversationInlineLayouts";
import {
    messageReferenceFromHref,
    messageReferencesResolve,
    type MessageReferences,
} from "./messageReferences";
import {
    markdownTableCodeKeepsLine,
    markdownTableLayoutAt,
    messageMarkdownRenderTree,
    messageTextLayoutFontGenerationSubscribe,
    type MessageTextLayoutCache,
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
 * Opens a file a `happy://` or `happy-file://` file link names in another agent's or workspace's
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
 * A Happy reference a message names: an underlined link like any other in the
 * body, reading as the live title of what it names. While that thing is busy
 * the title carries the same travelling band a busy sidebar row or tab does,
 * and nothing else changes — the words wrap where they would without it.
 */
export const MessageReferenceLink = ({
    children,
    href,
    references,
    reference,
}: {
    children?: ReactNode;
    href: string;
    references: MessageReferences;
    reference: HappyReference;
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
            // The href exists so this is a real, focusable link whose address
            // can be copied. `happy://` belongs to Happy, and the mobile app may
            // own it on this machine, so no click — plain, modified, or middle —
            // may hand it to the browser or the OS: every one opens it here.
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
const MarkdownTrailingContext = createContext<{
    endOffset: number;
    node: ReactNode;
} | null>(null);
const MarkdownGenerationStatusContext = createContext<MessageGenerationStatus | undefined>(
    undefined,
);
/** The Markdown being rendered; a table re-reads its own AST from it by offset. */
const MarkdownSourceContext = createContext("");
/** Whether the phrasing being rendered sits in a table cell. */
const MarkdownTableContext = createContext(false);
/** Reuse the parsed trees and cell measurements that sized the surrounding list. */
export const MarkdownLayoutCacheContext = createContext<MessageTextLayoutCache | undefined>(
    undefined,
);
function remarkSizedTree(this: Processor, cache: MessageTextLayoutCache | undefined) {
    if (cache) this.parser = (source) => messageMarkdownRenderTree(source, cache);
}
/**
 * Draws the layout a reply's placeholder block names, by its key; nothing for
 * a key it does not know. Absent, every placeholder is the skipped HTML it is.
 */
export type MessageLayoutRender = (key: string) => ReactNode;
const MarkdownLayoutRenderContext = createContext<MessageLayoutRender | undefined>(undefined);
/**
 * A top-level placeholder block becomes an element that names its layout, so
 * it survives `skipHtml` and `MarkdownDiv` can draw the layout in its place.
 * Only top-level blocks: that is where the reply's layouts are put, and the
 * only place the row-height model gives one a box.
 */
function remarkInlineLayouts() {
    return (tree: MessageMarkdownAst) => {
        for (const node of tree.children) {
            if (node.type !== "html") continue;
            const key = messageInlineLayoutKey(node.value);
            if (key === undefined) continue;
            node.data = { hName: "div", hProperties: { dataHappyLayout: key } };
        }
    };
}
function SizedMarkdown({ children }: { children: string }) {
    const cache = useContext(MarkdownLayoutCacheContext);
    return (
        <MemoMarkdown
            components={markdownComponents}
            urlTransform={messageUrlTransform}
            remarkPlugins={[
                ...MESSAGE_MARKDOWN_REMARK_PLUGINS,
                remarkInlineLayouts,
                [remarkSizedTree, cache],
            ]}
            skipHtml
        >
            {children}
        </MemoMarkdown>
    );
}
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
    // Only something this reader can open is offered as a click; anything
    // else is its words, below.
    if (reference !== undefined && references?.view(reference).type === "link")
        return (
            <MessageReferenceLink href={href!} reference={reference} references={references}>
                {children}
            </MessageReferenceLink>
        );
    // A link into another workspace's folder carries that folder, so it opens
    // the same file wherever the message is read. Its scheme means nothing to
    // the browser or the OS, so no click may hand it to either.
    const fileLink = typeof href === "string" ? happyAgentFileLinkParse(href) : undefined;
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
    // Any other Happy address — one this surface cannot open, or one that is
    // malformed — is its words. It is never a link the browser or the OS
    // could be handed.
    if (typeof href === "string" && isHappyUrl(href))
        return <MarkdownLinkContext.Provider value={true}>{children}</MarkdownLinkContext.Provider>;
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
                href={href}
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
                // Cmd-click (Ctrl-click off macOS) opens the link in the other
                // place: the browser when links default to the side panel, and
                // the side panel when they default to the browser.
                onClick={
                    menuOffered && linkOpenDefault !== undefined
                        ? (event) => {
                              if (!event.metaKey && !event.ctrlKey) return;
                              event.preventDefault();
                              onLinkOpen(
                                  webUrl,
                                  linkOpenDefault === LINK_MENU_BROWSER
                                      ? LINK_MENU_PANEL
                                      : LINK_MENU_BROWSER,
                              );
                          }
                        : undefined
                }
                onContextMenu={
                    menuOffered
                        ? (event) => {
                              event.preventDefault();
                              event.stopPropagation();
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
                <LinkContextMenu
                    data-testid="message-md-link-menu"
                    href={webUrl}
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
/** The no-break space glues the time to the paragraph's last word or link,
 * which stays outside the nowrap span so that one too long for a line still
 * breaks inside itself. */
function appendTrailingInline(children: ReactNode, trailing: ReactNode): ReactNode {
    return (
        <>
            {children}
            <span
                className="happy-message__trailing-inline"
                data-happy-desktop-ui="message-trailing-inline"
            >
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
    if (markdownFenceIsMermaid(fence))
        return (
            <MermaidDiagram
                enabled={generationStatus !== "streaming"}
                source={fence!.text}
                variant="message"
            />
        );
    return (
        <ScrollArea
            axes="horizontal"
            className="happy-message__code-block"
            data-happy-desktop-ui="message-code-block"
            viewportClassName="happy-message__code-block-viewport"
        >
            <pre {...props}>{children}</pre>
        </ScrollArea>
    );
};
/** The TeX a formula element was given by `messageMathTreeShape`. */
function markdownMathSource(node: ExtraProps["node"]): string {
    return (node?.children ?? [])
        .map((child) => (child.type === "text" ? child.value : ""))
        .join("");
}
/**
 * An inline formula in running text. Every other `<span>` the Markdown tree
 * produces renders unchanged.
 */
const MarkdownSpan = ({
    children,
    node,
    ...props
}: ComponentPropsWithoutRef<"span"> & ExtraProps) =>
    node?.properties["dataMath"] === "inline" ? (
        <MathFormula display={false} source={markdownMathSource(node)} />
    ) : (
        <span {...props}>{children}</span>
    );
/**
 * A display formula on its own line, scrolling sideways when it is wider than
 * the body. One KaTeX cannot parse is a code block of its source, exactly the
 * box the row-height model reserved for it.
 */
const MarkdownDiv = ({
    children,
    node,
    ...props
}: ComponentPropsWithoutRef<"div"> & ExtraProps) => {
    const layoutRender = useContext(MarkdownLayoutRenderContext);
    const layout = node?.properties["dataHappyLayout"];
    if (typeof layout === "string") return layoutRender?.(layout) ?? null;
    if (node?.properties["dataMath"] !== "display") return <div {...props}>{children}</div>;
    const source = markdownMathSource(node);
    const failed = mathFormulaRender(source, true).kind === "failed";
    return (
        <ScrollArea
            axes="horizontal"
            className={failed ? "happy-message__code-block" : "happy-message__math-block"}
            data-happy-desktop-ui={failed ? "message-code-block" : "message-math-block"}
            viewportClassName={
                failed ? "happy-message__code-block-viewport" : "happy-message__math-block-viewport"
            }
        >
            <MathFormula display source={source} />
        </ScrollArea>
    );
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
type MarkdownTableSolve = {
    readonly viewport: HTMLElement;
    readonly apply: (measure: number) => void;
};
const markdownTablesPending = new Set<MarkdownTableSolve>();
/**
 * Read all newly mounted table measures before writing any column widths.
 * Scroll-height and marker readers flush this batch before measuring; standalone
 * tables use their ResizeObserver. Both paths solve before the first paint.
 */
export function markdownTablesSolve(): void {
    if (markdownTablesPending.size === 0) return;
    const pending = [...markdownTablesPending];
    markdownTablesPending.clear();
    const measures = pending.map(({ viewport }) =>
        Number.parseFloat(getComputedStyle(viewport).width),
    );
    for (const [index, table] of pending.entries()) table.apply(measures[index]!);
}
/**
 * A table wraps its cells at column widths solved by `markdownTableLayoutAt`,
 * the same solve the virtual list sized this row with. The solve needs the
 * scrollport's real measure, which only exists once it is laid out. A commit
 * batch or ResizeObserver supplies it before paint and again when it changes.
 */
const MarkdownTable = ({
    children,
    node,
    ...props
}: ComponentPropsWithoutRef<"table"> & ExtraProps) => {
    const source = useContext(MarkdownSourceContext);
    const sized = useContext(MarkdownLayoutCacheContext);
    const offset = node?.position?.start.offset;
    const columns = markdownTableColumnCount(node);
    const tableRef = (table: HTMLTableElement | null) => {
        // ScrollArea renders its children directly in the scroll viewport.
        const viewport = table?.parentElement;
        if (!table || !viewport || offset === undefined) return;
        let solved = 0;
        let applied = "";
        const apply = (measure: number) => {
            if (!(measure > 0) || measure === solved) return;
            solved = measure;
            const layout = markdownTableLayoutAt(source, offset, measure, sized);
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
        const pending: MarkdownTableSolve = { viewport, apply };
        markdownTablesPending.add(pending);
        const observer = new ResizeObserver((entries) => {
            markdownTablesPending.delete(pending);
            apply(entries.at(-1)?.contentBoxSize[0]?.inlineSize ?? 0);
        });
        observer.observe(viewport);
        const unsubscribe = messageTextLayoutFontGenerationSubscribe(() => {
            const measure = solved;
            solved = 0;
            applied = "";
            apply(measure);
        });
        return () => {
            markdownTablesPending.delete(pending);
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
                <MarkdownTableContext.Provider value>{children}</MarkdownTableContext.Provider>
            </table>
        </ScrollArea>
    );
};
/** Short inline code in a table cell keeps one line, by the same rule the
 * column solve floors its column with, so `agent = "claude"` never wraps at
 * its spaces. Longer code wraps like the prose around it. */
const MarkdownCode = ({
    children,
    className,
    node,
    ...props
}: ComponentPropsWithoutRef<"code"> & ExtraProps) => {
    const inTable = useContext(MarkdownTableContext);
    const text = node?.children.length === 1 ? node.children[0] : undefined;
    const keepsLine = inTable && text?.type === "text" && markdownTableCodeKeepsLine(text.value);
    return (
        <code
            {...props}
            className={
                keepsLine
                    ? [className, "happy-message__table-code-line"].filter(Boolean).join(" ")
                    : className
            }
        >
            {children}
        </code>
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
    code: MarkdownCode,
    div: MarkdownDiv,
    img: MarkdownImage,
    p: MarkdownParagraph,
    pre: MarkdownPre,
    span: MarkdownSpan,
    sup: MarkdownSup,
    table: MarkdownTable,
    h1: headingOverride("h1"),
    h2: headingOverride("h2"),
    h3: headingOverride("h3"),
    h4: headingOverride("h4"),
    h5: headingOverride("h5"),
    h6: headingOverride("h6"),
};
/**
 * Keeps every Happy address a link carries, well-formed or not, so the link
 * component decides what it is rather than the filter turning it into an
 * empty link; every other URL is filtered as before.
 */
const messageUrlTransform: UrlTransform = (url, key, node) =>
    key === "href" && node.tagName === "a" && isHappyUrl(url)
        ? url
        : markdownFileUrlTransform(url, key, node);
/**
 * Render untrusted Markdown as React nodes. Raw HTML is never activated because
 * no raw-HTML plugin is present; block nodes are emitted as direct siblings so
 * the message body's spacing rules remain authoritative. Optional trailing
 * content is injected into the final paragraph's inline flow so it cannot wrap
 * independently at the paragraph boundary. `onFileOpen` turns a link that names
 * a workspace file into a click that opens Happy's own viewer instead of an
 * inert anchor, and `onFileLinkOpen` does the same for a `happy://` or `happy-file://` file link
 * into another agent's or workspace's folder. `onLinkOpen` gives a web link a context menu offering the
 * machine's browser, the side panel, or copying its destination. `references` resolves the
 * `happy://` links an agent wrote to entities to their live titles; without it each reads as
 * inert text, and a legacy reference tag never shows raw. `layoutRender` draws the
 * layouts a reply placed (see `conversationInlineLayouts`) where their
 * placeholders stand.
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
    layoutRender?: MessageLayoutRender,
): ReactNode {
    const text = messageReferencesResolve(source, references, generationStatus === "streaming");
    return (
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
                                        <MarkdownLayoutRenderContext.Provider value={layoutRender}>
                                            <SizedMarkdown>{text}</SizedMarkdown>
                                        </MarkdownLayoutRenderContext.Provider>
                                    </MarkdownLinkDefaultContext.Provider>
                                </MarkdownLinkOpenContext.Provider>
                            </MarkdownFileLinkOpenContext.Provider>
                        </MarkdownFileOpenContext.Provider>
                    </MarkdownReferencesContext.Provider>
                </MarkdownTrailingContext.Provider>
            </MarkdownGenerationStatusContext.Provider>
        </MarkdownSourceContext.Provider>
    );
}
