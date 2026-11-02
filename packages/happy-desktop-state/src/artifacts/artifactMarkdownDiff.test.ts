import { describe, expect, it } from "vitest";
import {
    HAPPY_AGENT_ARTIFACT_MARKDOWN_DIFF_RECENT_MS,
    happyAgentArtifactMarkdownDiffOffered,
    happyAgentArtifactMarkdownViewDefault,
} from "./artifactMarkdownDiff.js";

const now = 1_800_000_000_000;
const minute = 60 * 1000;

describe("happyAgentArtifactMarkdownDiffOffered", () => {
    it("offers the diff for a Markdown version with one before it", () => {
        expect(happyAgentArtifactMarkdownDiffOffered("markdown", 2)).toBe(true);
        expect(happyAgentArtifactMarkdownDiffOffered("markdown", 17)).toBe(true);
    });

    it("never offers it for the first version", () => {
        expect(happyAgentArtifactMarkdownDiffOffered("markdown", 1)).toBe(false);
    });

    it("never offers it for an artifact that is not Markdown", () => {
        expect(happyAgentArtifactMarkdownDiffOffered("html", 3)).toBe(false);
        expect(happyAgentArtifactMarkdownDiffOffered("image", 3)).toBe(false);
        expect(happyAgentArtifactMarkdownDiffOffered("unknown", 3)).toBe(false);
    });
});

describe("happyAgentArtifactMarkdownViewDefault", () => {
    it("opens a version made in the last twenty minutes on its diff", () => {
        for (const age of [
            0,
            minute,
            19 * minute,
            HAPPY_AGENT_ARTIFACT_MARKDOWN_DIFF_RECENT_MS - 1,
        ])
            expect(
                happyAgentArtifactMarkdownViewDefault({
                    type: "markdown",
                    number: 2,
                    createdAt: now - age,
                    now,
                }),
            ).toBe("diff");
    });

    it("opens an older version on the document", () => {
        for (const age of [
            HAPPY_AGENT_ARTIFACT_MARKDOWN_DIFF_RECENT_MS,
            21 * minute,
            3 * 86_400_000,
        ])
            expect(
                happyAgentArtifactMarkdownViewDefault({
                    type: "markdown",
                    number: 4,
                    createdAt: now - age,
                    now,
                }),
            ).toBe("document");
    });

    it("counts a version stamped ahead of the reader's clock as just made", () => {
        expect(
            happyAgentArtifactMarkdownViewDefault({
                type: "markdown",
                number: 2,
                createdAt: now + 5 * minute,
                now,
            }),
        ).toBe("diff");
    });

    it("opens the first version on the document, however recent", () => {
        expect(
            happyAgentArtifactMarkdownViewDefault({
                type: "markdown",
                number: 1,
                createdAt: now,
                now,
            }),
        ).toBe("document");
    });

    it("opens any other type on the document, however recent", () => {
        expect(
            happyAgentArtifactMarkdownViewDefault({ type: "html", number: 3, createdAt: now, now }),
        ).toBe("document");
    });
});
