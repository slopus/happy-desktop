import {
    Children,
    createContext,
    createElement,
    memo,
    useContext,
    type ComponentPropsWithoutRef,
    type ReactNode,
} from "react";
import Markdown, { type Components, type ExtraProps } from "react-markdown";
import { CodeBlockFrame } from "./CodeBlock";
import { filePreviewKind } from "./FilePreview";
import { markdownCodeText, markdownFence, markdownFenceIsMermaid } from "./markdownFence";
import { markdownDocumentLinkPath } from "./MarkdownDocument";
import { MermaidDiagram } from "./MermaidDiagram";
import { MESSAGE_MARKDOWN_REMARK_PLUGINS } from "./messageMarkdownAst";
import { ScrollArea } from "./Scrollbar";

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
const MarkdownFileOpenContext = createContext<((path: string) => void) | undefined>(undefined);
const MarkdownTrailingContext = createContext<{
    endOffset: number;
    node: ReactNode;
} | null>(null);
const MarkdownGenerationStatusContext = createContext<MessageGenerationStatus | undefined>(
    undefined,
);
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
    const safe = safeHref(href);
    const onFileOpen = useContext(MarkdownFileOpenContext);
    const path = safe === undefined ? markdownDocumentLinkPath(href) : undefined;
    // Only a file this product can actually show is offered as a click. An
    // archive or an executable stays plain text rather than promising a preview
    // that would open on "no preview".
    if (path !== undefined && onFileOpen !== undefined && filePreviewKind(path) !== "binary")
        return (
            <a
                className="happy-message__md-link happy-message__md-file"
                data-happy-desktop-ui="message-md-file"
                data-path={path}
                href={path}
                onClick={(event) => {
                    event.preventDefault();
                    onFileOpen(path);
                }}
            >
                <MarkdownLinkContext.Provider value={true}>{children}</MarkdownLinkContext.Provider>
            </a>
        );
    return (
        <a
            {...props}
            className={["happy-message__md-link", className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="message-md-link"
            href={safe}
            rel="noopener noreferrer nofollow"
            target="_blank"
        >
            <MarkdownLinkContext.Provider value={true}>{children}</MarkdownLinkContext.Provider>
        </a>
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
    if (markdownFenceIsMermaid(fence))
        return (
            <MermaidDiagram
                enabled={generationStatus !== "streaming"}
                source={fence!.text}
                variant="message"
            />
        );
    return (
        <CodeBlockFrame
            className="happy-message__code-block"
            data-happy-desktop-ui="message-code-block"
            text={fence?.text ?? markdownCodeText(node) ?? ""}
        >
            <ScrollArea
                axes="horizontal"
                data-happy-desktop-ui="message-code-scroll"
                placement="overlay"
                viewportClassName="happy-message__code-block-viewport"
            >
                <pre {...props}>{children}</pre>
            </ScrollArea>
        </CodeBlockFrame>
    );
};
const MarkdownTable = ({
    children,
    node: _node,
    ...props
}: ComponentPropsWithoutRef<"table"> & ExtraProps) => (
    <ScrollArea
        axes="horizontal"
        className="happy-message__table-scroll"
        data-happy-desktop-ui="message-table-scroll"
        placement="overlay"
        viewportClassName="happy-message__table-scroll-viewport"
    >
        <table {...props}>{children}</table>
    </ScrollArea>
);
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
/**
 * Render untrusted Markdown as React nodes. Raw HTML is never activated because
 * no raw-HTML plugin is present; block nodes are emitted as direct siblings so
 * the message body's spacing rules remain authoritative. Optional trailing
 * content is injected into the final paragraph's inline flow so it cannot wrap
 * independently at the paragraph boundary. `onFileOpen` turns a link that names
 * a workspace file into a click that opens Happy's own viewer instead of an
 * inert anchor.
 */
export function renderMessageMarkdown(
    text: string,
    trailing?: ReactNode,
    onFileOpen?: (path: string) => void,
    generationStatus?: MessageGenerationStatus,
): ReactNode {
    return (
        <MarkdownGenerationStatusContext.Provider value={generationStatus}>
            <MarkdownTrailingContext.Provider
                value={
                    trailing === undefined
                        ? null
                        : { endOffset: text.trimEnd().length, node: trailing }
                }
            >
                <MarkdownFileOpenContext.Provider value={onFileOpen}>
                    <MemoMarkdown
                        components={markdownComponents}
                        remarkPlugins={MESSAGE_MARKDOWN_REMARK_PLUGINS}
                        skipHtml
                    >
                        {text}
                    </MemoMarkdown>
                </MarkdownFileOpenContext.Provider>
            </MarkdownTrailingContext.Provider>
        </MarkdownGenerationStatusContext.Provider>
    );
}
