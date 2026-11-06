import { type GitState } from "@slopus/happy-agent-client";
import type { GitComparedWith, GitComparisonBaseSource } from "./types.js";

/*
 * The comparison-branch fields come from daemons newer than the client package
 * this build pins: 0.0.84 does not type them.
 * They are read and checked here, at the wire, once; past this file they are
 * ordinary typed fields. A daemon that predates them sends none, and that
 * absence stays absence so a surface can leave out what it cannot show.
 * Replace the reader once a client release types them.
 */

const COMPARISON_BASE_SOURCES: ReadonlySet<string> = new Set<GitComparisonBaseSource>([
    "explicit",
    "workspace",
    "inferred",
    "default",
]);

/** What a scan compared against, or nothing from a daemon that does not report it. */
export function gitComparedWithRead(git: GitState): GitComparedWith | undefined {
    const wire: GitState & { baseRef?: unknown; baseSource?: unknown; baseNotice?: unknown } = git;
    if (wire.baseRef !== null && typeof wire.baseRef !== "string") return undefined;
    return {
        ref: wire.baseRef,
        source:
            typeof wire.baseSource === "string" && COMPARISON_BASE_SOURCES.has(wire.baseSource)
                ? (wire.baseSource as GitComparisonBaseSource)
                : null,
        notice:
            typeof wire.baseNotice === "string" && wire.baseNotice.length > 0
                ? wire.baseNotice
                : null,
    };
}
