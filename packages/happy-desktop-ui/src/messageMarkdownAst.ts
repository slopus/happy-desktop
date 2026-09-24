import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { remarkFileReferences } from "./messageFileReferences";

/**
 * Rendering and geometry share one Markdown syntax contract. ReactMarkdown
 * owns the render transform, while this parser exposes the same remark/GFM AST
 * to the row-height model without mounting anything.
 *
 * File references are linked in the render pipeline only. A transform runs
 * after parsing and this parser never runs one, and the geometry model is
 * unaffected either way: linking a reference changes what its text points at
 * and not one character of the text itself.
 */
export const MESSAGE_MARKDOWN_REMARK_PLUGINS = [remarkGfm, remarkFileReferences];

const messageMarkdownParser = unified().use(remarkParse).use(remarkGfm);

export type MessageMarkdownAst = ReturnType<typeof messageMarkdownParser.parse>;

/** Parses one message exactly once per text-layout cache lifetime. */
export function messageMarkdownParse(source: string): MessageMarkdownAst {
    return messageMarkdownParser.parse(source);
}
