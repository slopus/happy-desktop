import { fileReferenceIsWhole, fileReferenceMatches } from "./fileReference";

/**
 * The parts of a Markdown tree this walk touches, named structurally.
 *
 * A remark transform is a walk over plain objects, and the two node shapes here
 * — something with children, something with a value — are all that is needed to
 * find a run of prose and put a link in it. Typing it this way keeps the plugin
 * from depending on the AST package's own declarations for four fields.
 */
interface MarkdownNode {
    type: string;
    value?: string;
    url?: string;
    children?: MarkdownNode[];
    /** What the node hands the element rendered from it, attribute by attribute. */
    data?: { hProperties: Record<string, string> };
}

/**
 * Containers whose text is not prose. A fenced block is code being shown rather
 * than code being discussed, and a link's own label is already pointing
 * somewhere — putting a second link inside it would nest two anchors.
 */
const OPAQUE = new Set(["code", "link", "linkReference", "definition", "html", "yaml"]);

/**
 * The attribute a link made here carries, telling it apart from one the author
 * wrote. A written reference that nothing can open goes back to being words;
 * an author's link to a file was a link on the page and stays one, inert. The
 * element's attributes are the one thing a remark node hands the component
 * that renders it, so the distinction travels there.
 */
export const FILE_REFERENCE_LINK_ATTRIBUTE = "data-file-reference";
const REFERENCE_LINK_DATA = { hProperties: { dataFileReference: "" } };

/**
 * Turns written file references into links.
 *
 * An agent writing about code names the place: `packages/app/src/View.tsx:88`,
 * or a run of lines. That is the most common thing anyone wants to follow in a
 * transcript, and until it is a link it is a path the reader has to copy into a
 * search box. The reference keeps its own text and gains a target; what the
 * target resolves to, and whether the product can open it at all, is decided by
 * the link component, so a reference to something with no viewer still reads as
 * the plain text it always was.
 *
 * Inline code is included because a path in backticks is how most of this gets
 * written, but only when the whole span is the reference: a line of code that
 * happens to contain one is code, not a citation.
 *
 * This is the one place a written convention is guessed at. It sits here
 * because the text came from a model and no contract can be asked of it; past
 * this boundary the reference travels as an explicit path and line range.
 */
export function remarkFileReferences() {
    return (tree: MarkdownNode): void => {
        walk(tree);
    };
}

function walk(node: MarkdownNode): void {
    const children = node.children;
    if (children === undefined || children.length === 0) return;
    const next: MarkdownNode[] = [];
    let changed = false;
    for (const child of children) {
        if (child.type === "inlineCode") {
            const linked = inlineCodeLink(child);
            next.push(linked ?? child);
            changed ||= linked !== undefined;
            continue;
        }
        if (OPAQUE.has(child.type)) {
            next.push(child);
            continue;
        }
        if (child.type !== "text" || child.value === undefined) {
            walk(child);
            next.push(child);
            continue;
        }
        const pieces = textPieces(child.value);
        if (pieces === undefined) {
            next.push(child);
            continue;
        }
        next.push(...pieces);
        changed = true;
    }
    if (changed) node.children = next;
}

/** One `inlineCode` span that is entirely a reference, as a link around it. */
function inlineCodeLink(node: MarkdownNode): MarkdownNode | undefined {
    if (node.type !== "inlineCode" || node.value === undefined) return undefined;
    const value = node.value.trim();
    if (!fileReferenceIsWhole(value)) return undefined;
    return {
        type: "link",
        url: value,
        children: [{ type: "inlineCode", value }],
        data: REFERENCE_LINK_DATA,
    };
}

/**
 * One run of prose split into the text around its references and the links for
 * them, or nothing when it holds none — in which case the original node is left
 * exactly as it was.
 */
function textPieces(value: string): MarkdownNode[] | undefined {
    const matches = fileReferenceMatches(value);
    if (matches.length === 0) return undefined;
    const pieces: MarkdownNode[] = [];
    let consumed = 0;
    for (const match of matches) {
        const reference = match.text;
        if (match.index > consumed)
            pieces.push({ type: "text", value: value.slice(consumed, match.index) });
        pieces.push({
            type: "link",
            url: reference,
            children: [{ type: "text", value: reference }],
            data: REFERENCE_LINK_DATA,
        });
        consumed = match.index + reference.length;
    }
    if (consumed < value.length) pieces.push({ type: "text", value: value.slice(consumed) });
    return pieces;
}
