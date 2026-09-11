import type { GitState } from "@slopus/happy-agent-client";
import type { GitChangeSnapshot } from "./types.js";

/** The latest scan and the last complete comparison belong to one workspace. */
export interface GitSnapshotState {
    readonly current: GitState;
    readonly lastReady?: GitState;
    readonly invalidated?: boolean;
}

export function gitSnapshotStateUpdate(
    previous: GitSnapshotState | undefined,
    current: GitState,
): GitSnapshotState {
    if (previous && previous.current.scannedAt > current.scannedAt) return previous;
    const lastReady = current.comparison === "ready" ? current : previous?.lastReady;
    return { current, ...(lastReady === undefined ? {} : { lastReady }) };
}

/** Failed scans carry freshness, rather than erasing the last known file list. */
export function gitSnapshotProject(
    state: GitSnapshotState | undefined,
): GitChangeSnapshot | undefined {
    if (state === undefined) return undefined;
    const git = state.lastReady ?? state.current;
    return {
        comparison:
            !state.invalidated && state.current.comparison === "ready"
                ? "ready"
                : state.lastReady === undefined
                  ? "unavailable"
                  : "stale",
        changedFiles: git.changedFiles,
        insertions: git.insertions,
        deletions: git.deletions,
        files: git.files,
        generation: `${git.facts.head}:${String(git.scannedAt)}`,
        version: git.scannedAt,
        ...(git.comparison === "ready" && git.base !== null ? { baseRevision: git.base } : {}),
    };
}
