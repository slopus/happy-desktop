import { partitionComponentProps } from "./componentProps";
import {
    createContext,
    createElement,
    memo,
    useContext,
    type ComponentPropsWithoutRef,
    type CSSProperties,
    type ReactNode,
} from "react";
import Markdown, {
    defaultUrlTransform,
    type Components,
    type ExtraProps,
    type UrlTransform,
} from "react-markdown";
import remarkGfm from "remark-gfm";
import {
    happyAgentFileLinkParse,
    happyReferencePlaceholder,
    isHappyUrl,
    type HappyReference,
} from "happy-desktop-state";
import { CodeBlock } from "./CodeBlock";
import {
    fileReferenceFragment,
    fileReferenceSplit,
    type FileLinkOpenHandler,
    type FileOpenHandler,
    type FileReference,
} from "./fileReference";
import { markdownFence, markdownFenceIsMermaid } from "./markdownFence";
import { MermaidDiagram } from "./MermaidDiagram";
import { markdownTableCodeKeepsLine } from "./messageTextLayout";
import { messageReferenceFromHref, type MessageReferences } from "./messageReferences";
import { ScrollArea } from "./Scrollbar";

// react-markdown reparses the document when this plugin list changes identity.
// Keep the product's fixed GFM configuration stable across streaming/store
// notifications so unchanged Markdown does not pay a second parse.
const MARKDOWN_REMARK_PLUGINS = [remarkGfm];

type MarkdownElement = NonNullable<ExtraProps["node"]>;
type MarkdownChild = MarkdownElement["children"][number];

/** Where text is not wrapped: code keeps its own text, and these hold only rows or items. */
const SOURCE_TEXT_UNWRAPPED = new Set([
    "pre",
    "code",
    "table",
    "thead",
    "tbody",
    "tfoot",
    "tr",
    "ul",
    "ol",
]);

/**
 * Marks the rendered Markdown with where it came from in the source, for a
 * reader that turns a click on the rendered text into a caret in the text it
 * came from. Every element carries `data-source-offset`, where its Markdown
 * starts; every run of prose is wrapped in a span carrying
 * `data-source-text`, where that run's characters start, so a click lands on
 * the character it was on.
 */
function rehypeSourceOffsets() {
    const mark = (element: MarkdownElement, code: boolean): void => {
        const offset = element.position?.start.offset;
        if (offset !== undefined) element.properties["dataSourceOffset"] = offset;
        const inCode = code || element.tagName === "pre" || element.tagName === "code";
        element.children = element.children.map((child): MarkdownChild => {
            if (child.type === "element") {
                mark(child, inCode);
                return child;
            }
            const start = child.position?.start.offset;
            if (
                child.type !== "text" ||
                inCode ||
                start === undefined ||
                SOURCE_TEXT_UNWRAPPED.has(element.tagName) ||
                !/\S/u.test(child.value)
            )
                return child;
            return {
                type: "element",
                tagName: "span",
                properties: { dataSourceText: start },
                children: [child],
            };
        });
    };
    return (tree: { children: MarkdownChild[] }): void => {
        for (const child of tree.children) if (child.type === "element") mark(child, false);
    };
}

const MARKDOWN_REHYPE_PLUGINS_NONE: [] = [];
const MARKDOWN_REHYPE_PLUGINS_SOURCE_OFFSETS = [rehypeSourceOffsets];

/** The source offset `rehypeSourceOffsets` put on an element, for a component that draws its own. */
function sourceOffsetOf(props: object): { "data-source-offset"?: number } {
    const offset = (props as { "data-source-offset"?: unknown })["data-source-offset"];
    return typeof offset === "number" ? { "data-source-offset": offset } : {};
}

// react-markdown is an unmemoized third-party function. Its fixed renderer
// configuration is safe to memoize here, so parent/store notifications with
// unchanged text do not parse and run the Markdown tree again.
const MemoMarkdown = memo(Markdown);

export type MarkdownDocumentProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    /** The document's Markdown source. */
    text: string;
    /** Stable identity for the saved Markdown bytes, when the caller has one. */
    cacheKey?: string;
    /**
     * Opens a link that points at another file rather than at the web — a
     * relative path, a `file:` URL, or a bare workspace path. Without it those
     * links render inert, because a document viewer that cannot open its
     * neighbours should say so by not offering the click.
     */
    onFileOpen?: FileOpenHandler;
    /**
     * Opens a `happy://` or `happy-file://` file link — a file in another agent's or workspace's
     * folder. Without it such links render inert.
     */
    onFileLinkOpen?: FileLinkOpenHandler;
    /**
     * The live side of the `happy://` links to agents, artifacts, workspaces,
     * and the rest of Happy a document carries: what each reads as now, and
     * where opening one goes. Without it each reads as the label it was
     * written with, inert.
     */
    entities?: MessageReferences;
    /**
     * Resolves the document's own relative references, for a document that is
     * one file of a bundle whose other files it can show — an artifact's entry
     * beside its pictures. Without it a picture stays its label and a relative
     * link is read as a workspace path.
     */
    references?: MarkdownDocumentReferences;
    /**
     * Marks each block with `data-source-offset`, where its Markdown starts in
     * `text`, so a reader that edits the source can put the caret where the
     * reader clicked.
     */
    sourceOffsets?: boolean;
    /**
     * `scroll`, the default, reads the document on a surface of its own: a
     * scrollport with the document gutter. `inline` lays it into the flow
     * around it at its full height, with no gutter, surface, or scrolling of
     * its own, as an artifact shown in a reply is.
     */
    flow?: "scroll" | "inline";
};

/**
 * How a document that is one file of a bundle reaches the rest of it. Both
 * answer `undefined` for a reference that names nothing in the bundle, which
 * leaves it inert rather than letting it reach anywhere else.
 */
export type MarkdownDocumentReferences = {
    /** The address a picture the document shows loads from. */
    readonly image: (src: string) => string | undefined;
    /** The file of the bundle a link names, as `onFileOpen` receives it. */
    readonly link: (href: string) => string | undefined;
};

/** Schemes a document link may navigate the browser to. */
const NAVIGABLE_SCHEMES = new Set(["http", "https", "mailto"]);

/**
 * The web address a link carries, or `undefined` when it is not one. Anything
 * that is not an absolute `http:`, `https:`, or `mailto:` target is refused here
 * so a document cannot navigate the app through `javascript:`, `data:`, or a
 * protocol-relative host.
 */
function webHref(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed.startsWith("//")) return undefined;
    const scheme = /^([a-z][a-z0-9+.-]*):/iu.exec(trimmed);
    if (!scheme) return undefined;
    return NAVIGABLE_SCHEMES.has(scheme[1]!.toLowerCase()) ? trimmed : undefined;
}

/**
 * The file this link points at and the lines it points at within it, for a link
 * that is not a web address: a relative path, an absolute path, or a `file:`
 * URL. A bare `#fragment` is in-document navigation and names no file, and a
 * path ending in `/` names a directory rather than something to open.
 *
 * Naming a line is how everything that writes about code refers to it, so
 * `Store.ts:120-148` and a pasted `Store.ts#L120-L148` both resolve to the file
 * and the region. The position is split off the name rather than dropped: what
 * a viewer opens is the file, and what it scrolls to is the region.
 */
export function markdownDocumentLinkTarget(value: unknown): FileReference | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#") || trimmed.startsWith("//"))
        return undefined;
    if (webHref(trimmed) !== undefined) return undefined;
    const scheme = /^([a-z][a-z0-9+.-]*):/iu.exec(trimmed);
    if (scheme && scheme[1]!.toLowerCase() === "file") {
        try {
            const url = new URL(trimmed);
            if (url.hostname !== "" && url.hostname !== "localhost") return undefined;
            const reference = fileReferenceSplit(
                decodeURIComponent(url.pathname).replace(/^\/([a-z]:\/)/iu, "$1"),
            );
            if (reference.path.length === 0 || reference.path.endsWith("/")) return undefined;
            return referenceWithFragment(reference, url.hash.slice(1));
        } catch {
            return undefined;
        }
    }
    // A link's own query is addressing within the target document; its fragment
    // may still be naming lines, which is what a copied code-host address does.
    const [addressed = "", fragment = ""] = splitFragment(trimmed);
    let reference: FileReference;
    try {
        reference = fileReferenceSplit(
            decodeURIComponent(addressed.split("?")[0] ?? "").replaceAll("\\", "/"),
        );
    } catch {
        return undefined;
    }
    const path = reference.path;
    // eslint-disable-next-line no-control-regex -- Control characters are deliberately rejected in local file links.
    if (path.startsWith("//") || /[\u0000-\u001f]/u.test(path)) return undefined;
    // A colon before a line number is not a scheme separator, so the position
    // comes off before anything decides this is a protocol: `Message.tsx:42`
    // read as a scheme was a file reference the reader could not open. What is
    // still prefixed by a scheme after that really is one, and no viewer here
    // opens it.
    if (!/^[a-z]:\//iu.test(path) && /^[a-z][a-z0-9+.-]*:/iu.test(path)) return undefined;
    if (path.length === 0 || path.endsWith("/")) return undefined;
    return referenceWithFragment(reference, fragment);
}

/** The address and its fragment, split at the first `#`. */
function splitFragment(value: string): [string, string] {
    const cut = value.indexOf("#");
    return cut === -1 ? [value, ""] : [value.slice(0, cut), value.slice(cut + 1)];
}

/**
 * The reference with a code-host fragment applied. A region already written
 * into the path wins: it is the more specific thing the author typed, and a
 * link can only mean one region.
 */
function referenceWithFragment(reference: FileReference, fragment: string): FileReference {
    if (reference.selection !== undefined || fragment.length === 0) return reference;
    const selection = fileReferenceFragment(fragment);
    return selection === undefined ? reference : { ...reference, selection };
}

/** The file a link points at, for callers with nowhere to put a region. */
export function markdownDocumentLinkPath(value: unknown): string | undefined {
    return markdownDocumentLinkTarget(value)?.path;
}

// Preserve file targets for our explicit viewer callback. react-markdown's
// default filter otherwise removes file: URLs, Windows drives, file:line
// references and every `happy://` address before the link component can handle
// them; the link component decides what a Happy address is, so even a malformed
// one reaches it and is drawn inert rather than as an empty link. All other URLs
// keep its default filter, and images never gain filesystem navigation.
export const markdownFileUrlTransform: UrlTransform = (url, key, node) =>
    key === "href" &&
    node.tagName === "a" &&
    (markdownDocumentLinkPath(url) !== undefined || isHappyUrl(url))
        ? url
        : defaultUrlTransform(url);

const FileOpenContext = createContext<FileOpenHandler | undefined>(undefined);
const FileLinkOpenContext = createContext<FileLinkOpenHandler | undefined>(undefined);
const MarkdownCacheKeyContext = createContext<string | undefined>(undefined);
const MarkdownReferencesContext = createContext<MarkdownDocumentReferences | undefined>(undefined);
const EntitiesContext = createContext<MessageReferences | undefined>(undefined);

/**
 * A `happy://` link to something in Happy — an agent, an artifact, a
 * workspace. It reads as the live title of what it names, as messages do,
 * and opens it in the app; the label it was written with stands in while
 * that title is being read, and for something this reader cannot look up.
 * An empty label means "fill in the name", so it is never drawn empty.
 */
function DocumentEntityLink(props: {
    children: ReactNode;
    reference: HappyReference;
    written: boolean;
}) {
    const entities = useContext(EntitiesContext);
    const view = entities?.view(props.reference);
    const placeholder = happyReferencePlaceholder(props.reference);
    if (view?.type === "link")
        return (
            <button
                className="happy-markdown-document__link happy-markdown-document__link--file"
                data-happy-desktop-ui="markdown-document-entity-link"
                data-reference-kind={props.reference.kind}
                onClick={() => entities?.open(props.reference)}
                type="button"
            >
                {view.reading === true && props.written ? props.children : view.label}
            </button>
        );
    return (
        <span
            className="happy-markdown-document__link"
            data-happy-desktop-ui="markdown-document-link"
        >
            {props.written && (view === undefined || view.label === placeholder)
                ? props.children
                : (view?.label ?? placeholder)}
        </span>
    );
}

/**
 * A link in a document. A web address opens in a fresh browsing context severed
 * from the app; a link to another file opens in the viewer itself, which is the
 * whole reason a document reads better here than in a browser.
 */
const DocumentLink = ({ children, href, node }: ComponentPropsWithoutRef<"a"> & ExtraProps) => {
    const onFileOpen = useContext(FileOpenContext);
    const onFileLinkOpen = useContext(FileLinkOpenContext);
    const references = useContext(MarkdownReferencesContext);
    const web = webHref(href);
    if (web !== undefined)
        return (
            <a
                className="happy-markdown-document__link"
                data-happy-desktop-ui="markdown-document-link"
                href={web}
                rel="noopener noreferrer nofollow"
                target="_blank"
            >
                {children}
            </a>
        );
    // A link into another workspace's folder names that folder itself, so it
    // means the same thing whichever document carries it.
    const fileLink = typeof href === "string" ? happyAgentFileLinkParse(href) : undefined;
    if (fileLink !== undefined)
        return onFileLinkOpen === undefined ? (
            <span
                className="happy-markdown-document__link"
                data-happy-desktop-ui="markdown-document-link"
            >
                {children}
            </span>
        ) : (
            <button
                className="happy-markdown-document__link happy-markdown-document__link--file"
                data-happy-desktop-ui="markdown-document-file-link"
                data-path={fileLink.path}
                onClick={() => onFileLinkOpen(fileLink)}
                type="button"
            >
                {children}
            </button>
        );
    const reference = typeof href === "string" ? messageReferenceFromHref(href) : undefined;
    if (reference !== undefined)
        return (
            <DocumentEntityLink reference={reference} written={(node?.children.length ?? 0) > 0}>
                {children}
            </DocumentEntityLink>
        );
    // Any other Happy address is malformed, or something this build does not
    // know: its words, and never a link anything outside the app could open.
    if (typeof href === "string" && isHappyUrl(href))
        return (
            <span
                className="happy-markdown-document__link"
                data-happy-desktop-ui="markdown-document-link"
            >
                {children}
            </span>
        );
    // A document that is one file of a bundle names its neighbours relative to
    // itself, so the bundle decides what a link means; nothing it does not
    // recognize is read as a path on this machine instead.
    if (references !== undefined) {
        const path = typeof href === "string" ? references.link(href) : undefined;
        if (path === undefined || onFileOpen === undefined)
            return (
                <span
                    className="happy-markdown-document__link"
                    data-happy-desktop-ui="markdown-document-link"
                >
                    {children}
                </span>
            );
        return (
            <button
                className="happy-markdown-document__link happy-markdown-document__link--file"
                data-happy-desktop-ui="markdown-document-file-link"
                data-path={path}
                onClick={() => onFileOpen(path)}
                type="button"
            >
                {children}
            </button>
        );
    }
    const target = markdownDocumentLinkTarget(href);
    if (target === undefined || onFileOpen === undefined)
        return (
            <span
                className="happy-markdown-document__link"
                data-happy-desktop-ui="markdown-document-link"
            >
                {children}
            </span>
        );
    return (
        <button
            className="happy-markdown-document__link happy-markdown-document__link--file"
            data-happy-desktop-ui="markdown-document-file-link"
            data-path={target.path}
            onClick={() => onFileOpen(target.path, target.selection)}
            type="button"
        >
            {children}
        </button>
    );
};

/**
 * A document image renders as a labelled link rather than an `<img>`: the bytes
 * of a relative image live in a workspace this viewer has no reader for, and a
 * remote one would make merely opening a document fetch from its author's host.
 * A document whose bundle is readable shows the pictures that are part of it,
 * and only those.
 */
const DocumentImage = ({ alt, src }: ComponentPropsWithoutRef<"img"> & ExtraProps) => {
    const references = useContext(MarkdownReferencesContext);
    const label = alt?.trim() || (typeof src === "string" ? src : "") || "image";
    const url =
        references !== undefined && typeof src === "string" ? references.image(src) : undefined;
    if (url !== undefined)
        return (
            <img
                alt={alt ?? ""}
                className="happy-markdown-document__picture"
                data-happy-desktop-ui="markdown-document-picture"
                loading="lazy"
                src={url}
            />
        );
    return (
        <span
            className="happy-markdown-document__image"
            data-happy-desktop-ui="markdown-document-image"
        >
            {label}
        </span>
    );
};

/**
 * Fenced code is highlighted with the product's one code renderer, so a `ts`
 * block in a document reads exactly like the same lines opened as a file. The
 * wrapper keeps the block's spacing in the document flow.
 */
export const MarkdownDocumentPre = ({
    children,
    node,
    ...props
}: ComponentPropsWithoutRef<"pre"> & ExtraProps) => {
    const fence = markdownFence(node);
    const documentCacheKey = useContext(MarkdownCacheKeyContext);
    const cacheKey =
        fence?.offset === undefined || documentCacheKey === undefined
            ? undefined
            : `${documentCacheKey}:f${String(fence.offset)}`;
    if (markdownFenceIsMermaid(fence))
        return <MermaidDiagram source={fence!.text} variant="document" />;
    return (
        <div
            className="happy-markdown-document__code"
            data-happy-desktop-ui="markdown-document-code"
            {...sourceOffsetOf(props)}
        >
            {fence ? (
                <CodeBlock
                    {...(cacheKey === undefined ? {} : { cacheKey })}
                    lang={fence.lang}
                    text={fence.text}
                />
            ) : (
                <ScrollArea
                    axes="horizontal"
                    className="happy-markdown-document__plain-code"
                    viewportClassName="happy-markdown-document__plain-code-viewport"
                >
                    <pre {...props}>{children}</pre>
                </ScrollArea>
            )}
        </div>
    );
};

/** Whether the phrasing being rendered sits in a table cell. */
const DocumentTableContext = createContext(false);

const DocumentTable = ({
    children,
    node: _node,
    ...props
}: ComponentPropsWithoutRef<"table"> & ExtraProps) => (
    <ScrollArea
        axes="horizontal"
        className="happy-markdown-document__table-scroll"
        viewportClassName="happy-markdown-document__table-scroll-viewport"
    >
        <table {...props}>
            <DocumentTableContext.Provider value>{children}</DocumentTableContext.Provider>
        </table>
    </ScrollArea>
);

/** Characters of body copy a column floor holds on one line. */
const DOCUMENT_TABLE_FLOOR_CHARACTERS = 14;

type DocumentHastNode = NonNullable<ExtraProps["node"]>["children"][number];

function documentCellText(node: DocumentHastNode | undefined): string {
    if (!node) return "";
    if (node.type === "text") return node.value;
    return "children" in node ? node.children.map(documentCellText).join("") : "";
}

/** A cell no longer than the column floor holds on one line — a mark, a
 * count, a status — keeps that line, so a compact table stays compact. A
 * longer cell takes the floor and breaks anywhere, so its column never
 * collapses into a strip of single words and a long token never holds it
 * open. */
const documentCell = (tag: "td" | "th") => {
    const DocumentCell = ({
        children,
        className,
        node,
        ...props
    }: ComponentPropsWithoutRef<"td"> & ExtraProps) =>
        createElement(
            tag,
            {
                ...props,
                className: [
                    className,
                    documentCellText(node).trim().length > DOCUMENT_TABLE_FLOOR_CHARACTERS
                        ? "happy-markdown-document__cell--wraps"
                        : "happy-markdown-document__cell--line",
                ]
                    .filter(Boolean)
                    .join(" "),
            },
            children,
        );
    return DocumentCell as NonNullable<Components[typeof tag]>;
};

/** Short inline code in a table cell keeps one line, by the same rule chat
 * tables use, so `agent = "claude"` never wraps at its spaces. */
const DocumentCode = ({
    children,
    className,
    node,
    ...props
}: ComponentPropsWithoutRef<"code"> & ExtraProps) => {
    const inTable = useContext(DocumentTableContext);
    const text = node?.children.length === 1 ? node.children[0] : undefined;
    const keepsLine = inTable && text?.type === "text" && markdownTableCodeKeepsLine(text.value);
    return (
        <code
            {...props}
            className={
                keepsLine
                    ? [className, "happy-markdown-document__table-code-line"]
                          .filter(Boolean)
                          .join(" ")
                    : className
            }
        >
            {children}
        </code>
    );
};

/**
 * Headings render with no generated `id`. A viewer shows one document at a
 * time but several viewers can share a page, and generated anchors would
 * collide between them; the type ramp is by tag, so plain elements are enough.
 */
const headingOverride = (
    tag: "h1" | "h2" | "h3" | "h4" | "h5" | "h6",
): NonNullable<Components[typeof tag]> => {
    const DocumentHeading = ({ children, ...props }: { children?: ReactNode }) =>
        createElement(tag, sourceOffsetOf(props), children);
    return DocumentHeading as NonNullable<Components[typeof tag]>;
};

/**
 * The document's element renderers — links, pictures, fenced code, tables,
 * headings — for a component that renders a document tree of its own inside a
 * `MarkdownDocumentFrame`, as the Markdown diff does.
 */
export const markdownDocumentComponents: Components = {
    a: DocumentLink,
    code: DocumentCode,
    td: documentCell("td"),
    th: documentCell("th"),
    img: DocumentImage,
    pre: MarkdownDocumentPre,
    table: DocumentTable,
    h1: headingOverride("h1"),
    h2: headingOverride("h2"),
    h3: headingOverride("h3"),
    h4: headingOverride("h4"),
    h5: headingOverride("h5"),
    h6: headingOverride("h6"),
};

/**
 * C-171 MarkdownDocument — a Markdown file read as a document.
 *
 * This is the reading end of the file viewer: a full-bleed scrollport with the
 * document set on a reading measure inside it, in the document type ramp rather
 * than the tighter chat one. GitHub-flavoured tables, task lists, and fenced
 * code and Mermaid diagrams are supported; raw HTML is never activated, since
 * no raw-HTML plugin is present and the document's author is not necessarily
 * the reader. Mermaid runs in the component's isolated DOM-free renderer.
 *
 * Props only: the caller has already read the file and decides what a link to
 * another file does.
 */
export function MarkdownDocument(props: MarkdownDocumentProps) {
    const [local] = partitionComponentProps(props, [
        "className",
        "data-testid",
        "style",
        "text",
        "cacheKey",
        "onFileOpen",
        "onFileLinkOpen",
        "entities",
        "references",
        "sourceOffsets",
        "flow",
    ]);
    return (
        <MarkdownDocumentFrame
            cacheKey={local.cacheKey}
            className={local.className}
            data-testid={local["data-testid"]}
            entities={local.entities}
            flow={local.flow}
            onFileLinkOpen={local.onFileLinkOpen}
            onFileOpen={local.onFileOpen}
            part="markdown-document"
            references={local.references}
            style={local.style}
        >
            <MemoMarkdown
                components={markdownDocumentComponents}
                urlTransform={markdownFileUrlTransform}
                rehypePlugins={
                    local.sourceOffsets
                        ? MARKDOWN_REHYPE_PLUGINS_SOURCE_OFFSETS
                        : MARKDOWN_REHYPE_PLUGINS_NONE
                }
                remarkPlugins={MARKDOWN_REMARK_PLUGINS}
            >
                {local.text}
            </MemoMarkdown>
        </MarkdownDocumentFrame>
    );
}

export type MarkdownDocumentFrameProps = Pick<
    MarkdownDocumentProps,
    | "className"
    | "data-testid"
    | "style"
    | "cacheKey"
    | "onFileOpen"
    | "onFileLinkOpen"
    | "entities"
    | "references"
    | "flow"
> & {
    /** The rendered document, drawn with `markdownDocumentComponents`. */
    children: ReactNode;
    /** The frame's `data-happy-desktop-ui` part name. */
    part: string;
};

/**
 * The surface a document is read on — its scrollport or inline flow, the
 * reading measure, the type ramp — and what its links and fenced code are
 * given. `MarkdownDocument` renders Markdown text inside it; another document
 * view renders its own tree here with the same components and reads the same.
 */
export function MarkdownDocumentFrame(props: MarkdownDocumentFrameProps) {
    const body = (
        <article
            className="happy-markdown-document__body"
            data-happy-desktop-ui="markdown-document-body"
        >
            <MarkdownCacheKeyContext.Provider value={props.cacheKey}>
                <MarkdownReferencesContext.Provider value={props.references}>
                    <FileOpenContext.Provider value={props.onFileOpen}>
                        <FileLinkOpenContext.Provider value={props.onFileLinkOpen}>
                            <EntitiesContext.Provider value={props.entities}>
                                {props.children}
                            </EntitiesContext.Provider>
                        </FileLinkOpenContext.Provider>
                    </FileOpenContext.Provider>
                </MarkdownReferencesContext.Provider>
            </MarkdownCacheKeyContext.Provider>
        </article>
    );
    if (props.flow === "inline")
        return (
            <div
                className={["happy-markdown-document", props.className].filter(Boolean).join(" ")}
                data-flow="inline"
                data-happy-desktop-ui={props.part}
                data-testid={props["data-testid"]}
                style={props.style}
            >
                {body}
            </div>
        );
    return (
        <ScrollArea
            axes="both"
            className={["happy-markdown-document", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui={props.part}
            data-testid={props["data-testid"]}
            style={props.style}
            viewportClassName="happy-markdown-document__viewport"
        >
            {body}
        </ScrollArea>
    );
}
