import { describe, expect, it } from "vitest";
import { changedFileRenderedDiffOffered } from "../sources/changedFileRenderedDiff";

describe("changedFileRenderedDiffOffered", () => {
    it("offers the rendered change for a Markdown file with a committed version", () => {
        expect(changedFileRenderedDiffOffered("docs/notes.md", "modified")).toBe(true);
        expect(changedFileRenderedDiffOffered("README.markdown", "modified")).toBe(true);
        expect(changedFileRenderedDiffOffered("docs/page.mdx", "renamed")).toBe(true);
    });

    it("keeps today's views for a document new to the repository or deleted", () => {
        expect(changedFileRenderedDiffOffered("docs/notes.md", "added")).toBe(false);
        expect(changedFileRenderedDiffOffered("docs/notes.md", "untracked")).toBe(false);
        expect(changedFileRenderedDiffOffered("docs/notes.md", "deleted")).toBe(false);
    });

    it("keeps today's views for a file Git does not list as changed", () => {
        expect(changedFileRenderedDiffOffered("docs/notes.md", undefined)).toBe(false);
    });

    it("never offers it for a file that is not Markdown", () => {
        expect(changedFileRenderedDiffOffered("src/index.ts", "modified")).toBe(false);
        expect(changedFileRenderedDiffOffered("page.html", "modified")).toBe(false);
        expect(changedFileRenderedDiffOffered("notes.txt", "modified")).toBe(false);
    });
});
