import type { HappyAgentEvent } from "@slopus/happy-agent-client";
import {
    happyAgentArtifactAuthorProject,
    happyAgentArtifactCoverSame,
    happyAgentArtifactFileProject,
    happyAgentArtifactProject,
    happyAgentArtifactSourceProject,
    happyAgentArtifactThumbnailSame,
} from "./artifactProject.js";
import type {
    HappyAgentArtifact,
    HappyAgentArtifactAuthor,
    HappyAgentArtifactFile,
    HappyAgentArtifactFilter,
    HappyAgentArtifactId,
    HappyAgentArtifactLinks,
    HappyAgentArtifactSource,
} from "./artifactTypes.js";

/** The `artifact.*` events a catalog follows, as the daemon names them. */
export const HAPPY_AGENT_ARTIFACT_EVENT_TYPES = [
    "artifact.created",
    "artifact.updated",
    "artifact.deleted",
] as const satisfies readonly HappyAgentEvent["type"][];

/** One artifact change from the event stream, projected out of its wire envelope. */
export type HappyAgentArtifactEvent =
    | { readonly type: "created"; readonly artifact: HappyAgentArtifact }
    | {
          readonly type: "updated";
          readonly artifactId: HappyAgentArtifactId;
          readonly previousVersion: string;
          readonly version: string;
          readonly changes: {
              readonly latestVersion: number;
              readonly title: string;
              readonly entry: HappyAgentArtifactFile;
              readonly fileCount: number;
              readonly size: number;
              readonly updatedBy: HappyAgentArtifactAuthor;
              readonly updatedSource: HappyAgentArtifactSource | null;
              readonly updatedAt: number;
          };
      }
    | {
          readonly type: "deleted";
          readonly artifactId: HappyAgentArtifactId;
          readonly previousVersion: string;
          readonly version: string;
          readonly changes: {
              readonly deletedBy: HappyAgentArtifactAuthor;
              readonly deletedSource: HappyAgentArtifactSource | null;
              readonly deletedAt: number;
              readonly updatedBy: HappyAgentArtifactAuthor;
              readonly updatedSource: HappyAgentArtifactSource | null;
              readonly updatedAt: number;
          };
      };

/** The artifact change an event carries, or nothing for every other event. */
export function happyAgentArtifactEventProject(
    event: HappyAgentEvent,
    links?: HappyAgentArtifactLinks,
): HappyAgentArtifactEvent | undefined {
    switch (event.type) {
        case "artifact.created":
            return {
                type: "created",
                artifact: happyAgentArtifactProject(event.payload.artifact, links),
            };
        case "artifact.updated": {
            const { changes } = event.payload;
            return {
                type: "updated",
                artifactId: event.payload.artifactId as HappyAgentArtifactId,
                previousVersion: event.payload.previousVersion,
                version: event.payload.version,
                changes: {
                    latestVersion: changes.latestVersion,
                    title: changes.title,
                    entry: happyAgentArtifactFileProject(changes.entry),
                    fileCount: changes.fileCount,
                    size: changes.size,
                    updatedBy: happyAgentArtifactAuthorProject(changes.updatedBy),
                    updatedSource: happyAgentArtifactSourceProject(changes.updatedSource),
                    updatedAt: changes.updatedAt,
                },
            };
        }
        case "artifact.deleted": {
            const { changes } = event.payload;
            return {
                type: "deleted",
                artifactId: event.payload.artifactId as HappyAgentArtifactId,
                previousVersion: event.payload.previousVersion,
                version: event.payload.version,
                changes: {
                    deletedBy: happyAgentArtifactAuthorProject(changes.deletedBy),
                    deletedSource: happyAgentArtifactSourceProject(changes.deletedSource),
                    deletedAt: changes.deletedAt,
                    updatedBy: happyAgentArtifactAuthorProject(changes.updatedBy),
                    updatedSource: happyAgentArtifactSourceProject(changes.updatedSource),
                    updatedAt: changes.updatedAt,
                },
            };
        }
        default:
            return undefined;
    }
}

/** The one place a source names, by its kind: the id a `sourceId` query matches. */
export function happyAgentArtifactSourceId(source: HappyAgentArtifactSource): string | undefined {
    switch (source.kind) {
        case "bot":
            return source.botId;
        case "task":
            return source.taskId;
        case "project":
            return source.projectId;
        case "workspace":
            return source.workspaceId;
        case "agent":
            return source.agentId;
        case "unknown":
            return undefined;
    }
}

/** Whether a filter admits an artifact, by the same rules the daemon lists with. */
export function happyAgentArtifactFilterMatches(
    filter: HappyAgentArtifactFilter,
    artifact: HappyAgentArtifact,
): boolean {
    if (!filter.includeDeleted && artifact.status === "deleted") return false;
    if (filter.type !== undefined && artifact.type !== filter.type) return false;
    if (filter.agentId !== undefined && artifact.source?.agentId !== filter.agentId) return false;
    if (filter.source !== undefined) {
        if (artifact.source === null || artifact.source.kind !== filter.source.kind) return false;
        if (
            filter.source.id !== undefined &&
            happyAgentArtifactSourceId(artifact.source) !== filter.source.id
        )
            return false;
    }
    return true;
}

/** Whether two filters list the same artifacts. */
export function happyAgentArtifactFilterSame(
    left: HappyAgentArtifactFilter,
    right: HappyAgentArtifactFilter,
): boolean {
    return (
        left.type === right.type &&
        left.agentId === right.agentId &&
        left.includeDeleted === right.includeDeleted &&
        left.source?.kind === right.source?.kind &&
        left.source?.id === right.source?.id
    );
}

/** The catalog's order: newest created first, the id breaking ties, as the daemon pages it. */
export function happyAgentArtifactCompare(
    left: HappyAgentArtifact,
    right: HappyAgentArtifact,
): number {
    if (left.createdAt !== right.createdAt) return right.createdAt - left.createdAt;
    return left.id < right.id ? 1 : left.id > right.id ? -1 : 0;
}

/**
 * Whether `candidate` is a later version than `current`. Artifact versions are
 * UUIDv7s, whose canonical lowercase form sorts by the time it was minted, so
 * comparing the strings orders the changes they name.
 */
export function happyAgentArtifactVersionNewer(candidate: string, current: string): boolean {
    return candidate > current;
}

/** What applying one event to a list did. */
export interface HappyAgentArtifactCatalogApplied {
    readonly artifacts: readonly HappyAgentArtifact[];
    /**
     * An artifact whose change could not be applied because the list missed an
     * earlier one in its version chain. The list keeps the stale copy until the
     * owner reads that artifact again and replaces it.
     */
    readonly gap?: HappyAgentArtifactId;
}

/**
 * Applies one artifact event to one filtered list, newest created first.
 *
 * `complete` says whether the list holds every matching artifact or only the
 * first pages of them: a creation older than the last loaded row belongs to a
 * page not read yet, and is left for that page to bring. A list that already
 * holds a creation, or a version at least as new as an update, is unchanged,
 * so an event racing the read that already reflects it costs nothing.
 *
 * Filters only narrow by fields an artifact never changes, apart from its
 * status, so an update never moves an artifact into or out of a list and a
 * deletion only ever takes one out.
 */
export function happyAgentArtifactCatalogApply(
    artifacts: readonly HappyAgentArtifact[],
    event: HappyAgentArtifactEvent,
    filter: HappyAgentArtifactFilter,
    complete: boolean,
): HappyAgentArtifactCatalogApplied {
    if (event.type === "created") {
        const artifact = event.artifact;
        if (!happyAgentArtifactFilterMatches(filter, artifact)) return { artifacts };
        if (artifacts.some((candidate) => candidate.id === artifact.id)) return { artifacts };
        const index = artifacts.findIndex(
            (candidate) => happyAgentArtifactCompare(artifact, candidate) < 0,
        );
        if (index < 0) return complete ? { artifacts: [...artifacts, artifact] } : { artifacts };
        return { artifacts: [...artifacts.slice(0, index), artifact, ...artifacts.slice(index)] };
    }
    const index = artifacts.findIndex((candidate) => candidate.id === event.artifactId);
    if (index < 0) return { artifacts };
    const current = artifacts[index]!;
    if (event.type === "deleted" && !filter.includeDeleted)
        return { artifacts: [...artifacts.slice(0, index), ...artifacts.slice(index + 1)] };
    if (current.version !== event.previousVersion) {
        if (
            current.version === event.version ||
            happyAgentArtifactVersionNewer(current.version, event.version)
        )
            return { artifacts };
        return { artifacts, gap: current.id };
    }
    const next = happyAgentArtifactEventApply(current, event);
    return { artifacts: [...artifacts.slice(0, index), next, ...artifacts.slice(index + 1)] };
}

/**
 * One artifact after an update or deletion that follows directly from it. The
 * caller has checked the version chain; this only writes the changed fields.
 */
export function happyAgentArtifactEventApply(
    artifact: HappyAgentArtifact,
    event: Exclude<HappyAgentArtifactEvent, { readonly type: "created" }>,
): HappyAgentArtifact {
    if (event.type === "updated")
        return {
            ...artifact,
            ...event.changes,
            version: event.version,
        };
    return {
        ...artifact,
        ...event.changes,
        status: "deleted",
        version: event.version,
    };
}

/**
 * Puts an artifact read whole — after a gap, or from a mutation's own answer —
 * into a list in place of the copy it holds, or takes it out when it no longer
 * belongs there. An artifact the list does not hold is left out: whether it
 * belongs on a page not yet read is not something one artifact can say.
 */
export function happyAgentArtifactCatalogReplace(
    artifacts: readonly HappyAgentArtifact[],
    artifact: HappyAgentArtifact,
    filter: HappyAgentArtifactFilter,
): readonly HappyAgentArtifact[] {
    const index = artifacts.findIndex((candidate) => candidate.id === artifact.id);
    if (index < 0) return artifacts;
    const current = artifacts[index]!;
    if (happyAgentArtifactVersionNewer(current.version, artifact.version)) return artifacts;
    if (!happyAgentArtifactFilterMatches(filter, artifact))
        return [...artifacts.slice(0, index), ...artifacts.slice(index + 1)];
    // An update's event does not carry the new version's cover or preview, so
    // a read of the same version may still bring them.
    if (
        current.version === artifact.version &&
        happyAgentArtifactCoverSame(current.cover, artifact.cover) &&
        happyAgentArtifactThumbnailSame(current.thumbnail, artifact.thumbnail) &&
        current.background === artifact.background
    )
        return artifacts;
    return [...artifacts.slice(0, index), artifact, ...artifacts.slice(index + 1)];
}
