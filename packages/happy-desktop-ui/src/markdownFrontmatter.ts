import type remarkParse from "remark-parse";
import type { Parser, Plugin, Processor } from "unified";

/** The Markdown syntax tree `remark-parse` produces. */
type Root = typeof remarkParse extends Plugin<never[], string, infer Tree> ? Tree : never;
type Code = Extract<Root["children"][number], { type: "code" }>;

/** The YAML block a Markdown document opens with. */
export type MarkdownFrontmatter = {
    /** What sits between the two fences, with its line endings read as `\n`. */
    readonly yaml: string;
    /** Where the closing fence's line ends in the source, before its line ending. */
    readonly end: number;
};

const FENCE_OPEN = /^---[ \t]*$/u;
const FENCE_CLOSE = /^(?:---|\.\.\.)[ \t]*$/u;

/**
 * The frontmatter of a document, or `undefined` when it has none.
 *
 * Frontmatter is only ever the very start of a document: its first line is
 * `---`, and a later line that is `---` or `...` closes it. An opening fence
 * nothing closes is not frontmatter, and neither is a `---` anywhere after the
 * first line; Markdown reads those as the rule or heading underline they are.
 */
export function markdownFrontmatter(source: string): MarkdownFrontmatter | undefined {
    let lineStart = 0;
    const lines: string[] = [];
    for (let index = 0; ; index += 1) {
        const newline = source.indexOf("\n", lineStart);
        const lineEnd = newline === -1 ? source.length : newline;
        const contentEnd =
            lineEnd > lineStart && source[lineEnd - 1] === "\r" ? lineEnd - 1 : lineEnd;
        const line = source.slice(lineStart, contentEnd);
        if (index === 0) {
            if (!FENCE_OPEN.test(line)) return undefined;
        } else if (FENCE_CLOSE.test(line)) {
            return { yaml: lines.join("\n"), end: contentEnd };
        } else {
            lines.push(line);
        }
        if (newline === -1) return undefined;
        lineStart = newline + 1;
    }
}

/**
 * Reads a document's frontmatter as a `yaml` code block ahead of its body.
 *
 * Markdown itself has no frontmatter: left alone, the opening fence is a rule
 * and the closing one turns every YAML line above it into one heading. So the
 * block is taken out before Markdown reads the document. Its characters are
 * blanked rather than removed, which leaves every offset and line number of
 * the body where it is in the source. Frontmatter with nothing in it draws
 * nothing.
 *
 * Use after `remark-parse`, whose parser this wraps.
 */
export function remarkMarkdownFrontmatter(this: Processor): void {
    // The plugin contract is what says the parser here is Markdown's.
    const parse = this.parser as Parser<Root> | undefined;
    if (parse === undefined) return;
    this.parser = (document, file) => {
        const frontmatter = markdownFrontmatter(document);
        if (frontmatter === undefined) return parse(document, file);
        const tree = parse(
            document.slice(0, frontmatter.end).replace(/[^\r\n]/gu, " ") +
                document.slice(frontmatter.end),
            file,
        );
        if (frontmatter.yaml.trim().length === 0) return tree;
        const opening = document.slice(0, frontmatter.end);
        const lastLine = opening.lastIndexOf("\n") + 1;
        const code: Code = {
            type: "code",
            lang: "yaml",
            meta: null,
            value: frontmatter.yaml,
            position: {
                start: { line: 1, column: 1, offset: 0 },
                end: {
                    line: opening.split("\n").length,
                    column: frontmatter.end - lastLine + 1,
                    offset: frontmatter.end,
                },
            },
        };
        tree.children.unshift(code);
        return tree;
    };
}
