import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { describe, expect, it } from "vitest";
import { markdownFrontmatter, remarkMarkdownFrontmatter } from "./markdownFrontmatter";

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMarkdownFrontmatter);
const blocks = (source: string) => parser.parse(source).children.map((node) => node.type);

describe("markdownFrontmatter", () => {
    it("reads the block a document opens with", () => {
        const source = "---\nname: device\ninput:\n  id: string\n---\n\nBody text.\n";
        expect(markdownFrontmatter(source)).toEqual({
            yaml: "name: device\ninput:\n  id: string",
            end: 40,
        });
        expect(source.slice(40)).toBe("\n\nBody text.\n");
    });

    it("accepts `...` as the closing fence and a document that ends on it", () => {
        expect(markdownFrontmatter("---\na: 1\n...")).toEqual({ yaml: "a: 1", end: 12 });
        expect(markdownFrontmatter("---\na: 1\n---")).toEqual({ yaml: "a: 1", end: 12 });
    });

    it("finds none in a document without it", () => {
        expect(markdownFrontmatter("")).toBeUndefined();
        expect(markdownFrontmatter("# Title\n\nBody.\n")).toBeUndefined();
        expect(markdownFrontmatter("----\na: 1\n---\n")).toBeUndefined();
        expect(markdownFrontmatter("--- a\na: 1\n---\n")).toBeUndefined();
    });

    it("does not read an opening fence nothing closes", () => {
        expect(markdownFrontmatter("---")).toBeUndefined();
        expect(markdownFrontmatter("---\n")).toBeUndefined();
        expect(markdownFrontmatter("---\nname: device\n\nBody text.\n")).toBeUndefined();
        expect(markdownFrontmatter("---\nname: device\n ---\n")).toBeUndefined();
    });

    it("ignores `---` that is not the first line", () => {
        expect(markdownFrontmatter("\n---\na: 1\n---\n")).toBeUndefined();
        expect(markdownFrontmatter(" ---\na: 1\n---\n")).toBeUndefined();
        expect(markdownFrontmatter("Title\n---\n\nBody\n\n---\n\nMore\n")).toBeUndefined();
    });

    it("reads empty frontmatter", () => {
        expect(markdownFrontmatter("---\n---\nBody\n")).toEqual({ yaml: "", end: 7 });
        expect(markdownFrontmatter("---\n\n---\n")).toEqual({ yaml: "", end: 8 });
    });

    it("reads CRLF line endings", () => {
        const source = "---\r\nname: device\r\nkind: tool\r\n---\r\nBody\r\n";
        expect(markdownFrontmatter(source)).toEqual({
            yaml: "name: device\nkind: tool",
            end: 34,
        });
        expect(source.slice(34)).toBe("\r\nBody\r\n");
    });
});

describe("remarkMarkdownFrontmatter", () => {
    it("puts the frontmatter ahead of the body as a yaml code block", () => {
        const source = "---\nname: device\n---\n\n# Title\n\nBody.\n";
        const tree = parser.parse(source);
        expect(tree.children.map((node) => node.type)).toEqual(["code", "heading", "paragraph"]);
        expect(tree.children[0]).toMatchObject({
            lang: "yaml",
            value: "name: device",
            position: { start: { offset: 0 }, end: { line: 3, column: 4, offset: 20 } },
        });
        // The body keeps the place it has in the source.
        expect(tree.children[1]?.position?.start).toEqual({ line: 5, column: 1, offset: 22 });
    });

    it("keeps YAML that Markdown would read as an open block out of the body", () => {
        expect(blocks("---\nhtml: |\n<div>\n```\n---\nBody.\n")).toEqual(["code", "paragraph"]);
    });

    it("leaves a rule and a setext heading as they were", () => {
        expect(blocks("Title\n---\n\nBody\n\n---\n\nMore\n")).toEqual([
            "heading",
            "paragraph",
            "thematicBreak",
            "paragraph",
        ]);
        expect(blocks("---\nname: device\n\nBody.\n")).toEqual([
            "thematicBreak",
            "paragraph",
            "paragraph",
        ]);
    });

    it("draws nothing for empty frontmatter", () => {
        expect(blocks("---\n---\n\nBody.\n")).toEqual(["paragraph"]);
    });
});
