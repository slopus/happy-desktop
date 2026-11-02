import type { HappyAgentArtifactType } from "./artifactTypes.js";

/**
 * How a Markdown version is shown: as a rendered diff against the version
 * before it, or as the document alone.
 */
export type HappyAgentArtifactMarkdownView = "diff" | "document";

/**
 * How long after a version was made it still opens on its diff. A version
 * that recent is most likely the change the reader came to look at; an older
 * one is read as a document.
 */
export const HAPPY_AGENT_ARTIFACT_MARKDOWN_DIFF_RECENT_MS = 20 * 60 * 1000;

/** Whether a version can be read as a diff: a Markdown version with one before it. */
export function happyAgentArtifactMarkdownDiffOffered(
    type: HappyAgentArtifactType,
    number: number,
): boolean {
    return type === "markdown" && number >= 2;
}

/**
 * The view an artifact viewer opens on, decided once by the reader's own
 * clock from the version it opens on. A version made in the last twenty
 * minutes opens on its diff; anything else, or a version with nothing to
 * compare it with, opens on the document. A version stamped after `now` is a clock running
 * behind the daemon's, so it counts as just made.
 */
export function happyAgentArtifactMarkdownViewDefault(input: {
    readonly type: HappyAgentArtifactType;
    readonly number: number;
    readonly createdAt: number;
    readonly now: number;
}): HappyAgentArtifactMarkdownView {
    if (!happyAgentArtifactMarkdownDiffOffered(input.type, input.number)) return "document";
    return input.now - input.createdAt < HAPPY_AGENT_ARTIFACT_MARKDOWN_DIFF_RECENT_MS
        ? "diff"
        : "document";
}
