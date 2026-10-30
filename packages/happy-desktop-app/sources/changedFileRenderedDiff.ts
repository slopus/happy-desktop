import type { HappyAgentGitChangedFile } from "happy-desktop-state";
import { filePreviewKind } from "happy-desktop-ui";

/**
 * Whether a changed file can be read as a rendered diff: a Markdown document
 * with a committed version to compare it with. The status is the live Git
 * snapshot's own. A file that is new to the repository — added or untracked —
 * has no committed version, so rendering it against nothing would only paint
 * the whole document green; it keeps the views it has today. A deleted file
 * has nothing left to render.
 */
export function changedFileRenderedDiffOffered(
    path: string,
    status: HappyAgentGitChangedFile["status"] | undefined,
): boolean {
    return filePreviewKind(path) === "markdown" && (status === "modified" || status === "renamed");
}
