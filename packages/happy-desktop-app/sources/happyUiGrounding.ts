import {
    happyAgentArtifactImageKey,
    happyAgentChangedFileDiffKey,
    happyAgentRevisionRangeKey,
    type HappyAgentArtifactId,
    type HappyAgentArtifactImagesSnapshot,
    type HappyAgentArtifactImagesStore,
    type HappyAgentArtifactTitlesSnapshot,
    type HappyAgentArtifactTitlesStore,
    type HappyAgentChangedFileDiffsSnapshot,
    type HappyAgentChangedFileDiffsStore,
} from "happy-desktop-state";
import {
    happyUiDiffLines,
    type HappyUiBaseView,
    type HappyUiChangedFiles,
    type HappyUiGrounding,
    type HappyUiImage,
    type HappyUiImageView,
    type HappyUiLineRange,
    type HappyUiRange,
} from "happy-desktop-ui";

/**
 * The real change behind the guided reviews one conversation draws, read
 * from the checkout's changed-file store: the branch's live change for a reply
 * without a range, the two named commits for a reply with one; and the
 * before/after pictures it shows, from the artifact stores.
 *
 * Built from an immutable snapshot, so a new snapshot is a new value and the
 * transcript re-renders and re-sizes the rows whose blocks name what changed.
 * Asking for a file that has not been read yet records the want; the store
 * answers later through its subscription, never inside this call.
 */
export function happyUiGroundingCreate(input: {
    readonly diffs: HappyAgentChangedFileDiffsSnapshot;
    readonly store: HappyAgentChangedFileDiffsStore;
    /** Absent where this machine keeps no artifacts: a picture then says so. */
    readonly artifacts?: {
        readonly images: HappyAgentArtifactImagesSnapshot;
        readonly imagesStore: HappyAgentArtifactImagesStore;
        readonly titles: HappyAgentArtifactTitlesSnapshot;
        readonly titlesStore: HappyAgentArtifactTitlesStore;
    };
}): HappyUiGrounding {
    const held = (path: string, range: HappyUiRange | undefined) => {
        input.store.request(path, range);
        return input.diffs.diffs.get(happyAgentChangedFileDiffKey(path, range));
    };
    return {
        diff(path: string, span: HappyUiLineRange, range: HappyUiRange | undefined) {
            const diff = held(path, range);
            if (diff === undefined || diff.type === "loading") return { type: "loading" };
            if (diff.type === "missing") return { type: "missing" };
            if (diff.type === "error") return { type: "error", message: diff.error.message };
            // The store keeps one document object per read across snapshots,
            // so its parse and each range's lines are computed once per read.
            return happyUiDiffLines(diff.document, span);
        },
        changedFiles(range: HappyUiRange | undefined): HappyUiChangedFiles {
            if (range !== undefined) {
                input.store.revisionFilesRequest(range);
                const listed = input.diffs.revisionFiles.get(happyAgentRevisionRangeKey(range));
                if (listed === undefined) return { type: "loading" };
                // A Happy Agent that cannot list two commits' files, or a read
                // that failed, leaves coverage unchecked rather than guessed.
                if (listed.type !== "ready") return { type: "unchecked", reason: "range" };
                if (!listed.complete) return { type: "unchecked", reason: "truncated" };
                return {
                    type: "ready",
                    files: listed.files.map((file) => ({
                        path: file.path,
                        // A copy is a file this change adds; a new type or a
                        // moved submodule is one it modifies.
                        status:
                            file.status === "copied"
                                ? "added"
                                : file.status === "type_changed" || file.status === "submodule"
                                  ? "modified"
                                  : file.status,
                        ...(file.addedLines === undefined ? {} : { added: file.addedLines }),
                        ...(file.deletedLines === undefined ? {} : { removed: file.deletedLines }),
                    })),
                };
            }
            const files = input.diffs.files;
            if (files.type === "loading") return { type: "loading" };
            if (files.type === "unavailable") return { type: "unchecked", reason: "unavailable" };
            if (!files.complete) return { type: "unchecked", reason: "truncated" };
            return {
                type: "ready",
                files: files.files.map((file) => ({
                    path: file.path,
                    // An untracked file is one this change adds.
                    status: file.status === "untracked" ? "added" : file.status,
                    ...(file.addedLines === undefined ? {} : { added: file.addedLines }),
                    ...(file.deletedLines === undefined ? {} : { removed: file.deletedLines }),
                })),
            };
        },
        base(): HappyUiBaseView {
            const files = input.diffs.files;
            if (files.type === "loading") return { type: "loading" };
            if (files.type === "unavailable") return { type: "unavailable" };
            return { type: "ready", base: files.base };
        },
        image(image: HappyUiImage): HappyUiImageView {
            const artifacts = input.artifacts;
            if (artifacts === undefined) return { type: "missing" };
            const artifactId = image.artifact as HappyAgentArtifactId;
            // A version never changes, but its artifact can be deleted; the
            // titles store follows that, so a deleted picture says so at once.
            artifacts.titlesStore.request([artifactId]);
            artifacts.imagesStore.request(artifactId, image.version);
            const title = artifacts.titles.get(artifactId);
            if (title?.type === "ready" && title.status === "deleted") return { type: "deleted" };
            const held = artifacts.images.get(
                happyAgentArtifactImageKey(artifactId, image.version),
            );
            if (held === undefined) return { type: "loading" };
            return held.type === "ready" ? { type: "ready", url: held.url } : { type: held.type };
        },
    };
}
