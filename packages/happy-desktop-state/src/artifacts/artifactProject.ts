import type {
    Artifact,
    ArtifactAuthor,
    ArtifactFile,
    ArtifactSource,
    ArtifactVersion,
} from "@slopus/happy-agent-client";
import type {
    HappyAgentArtifact,
    HappyAgentArtifactAuthor,
    HappyAgentArtifactFile,
    HappyAgentArtifactId,
    HappyAgentArtifactSource,
    HappyAgentArtifactType,
    HappyAgentArtifactVersion,
} from "./artifactTypes.js";

/*
 * The client's schemas close the type, source, and author unions, but the
 * daemon documents all three as growing with the product: a newer daemon can
 * send a kind this build never heard of. These projections therefore read the
 * discriminant as the string it is on the wire and keep anything unrecognised
 * as an explicit `unknown`, rather than trusting a closed TypeScript union the
 * bytes never promised.
 */

/** The artifact type as this build can show it. */
export function happyAgentArtifactTypeProject(type: string): HappyAgentArtifactType {
    switch (type) {
        case "markdown":
        case "html":
        case "image":
        case "image_series":
        case "video":
        case "document":
            return type;
        default:
            return "unknown";
    }
}

export function happyAgentArtifactFileProject(file: ArtifactFile): HappyAgentArtifactFile {
    return { path: file.path, mimeType: file.mimeType, size: file.size, sha256: file.sha256 };
}

export function happyAgentArtifactSourceProject(
    source: ArtifactSource | null,
): HappyAgentArtifactSource | null {
    if (source === null) return null;
    const wire = source as { readonly kind: string; readonly agentId?: string | null };
    switch (wire.kind) {
        case "bot": {
            const bot = source as Extract<ArtifactSource, { kind: "bot" }>;
            return { kind: "bot", botId: bot.botId, agentId: bot.agentId };
        }
        case "task": {
            const task = source as Extract<ArtifactSource, { kind: "task" }>;
            return { kind: "task", taskId: task.taskId, agentId: task.agentId };
        }
        case "project": {
            const project = source as Extract<ArtifactSource, { kind: "project" }>;
            return { kind: "project", projectId: project.projectId, agentId: project.agentId };
        }
        case "workspace": {
            const workspace = source as Extract<ArtifactSource, { kind: "workspace" }>;
            return {
                kind: "workspace",
                workspaceId: workspace.workspaceId,
                projectId: workspace.projectId,
                agentId: workspace.agentId,
            };
        }
        case "agent": {
            const agent = source as Extract<ArtifactSource, { kind: "agent" }>;
            return { kind: "agent", agentId: agent.agentId };
        }
        default:
            return {
                kind: "unknown",
                agentId: typeof wire.agentId === "string" ? wire.agentId : null,
            };
    }
}

export function happyAgentArtifactAuthorProject(author: ArtifactAuthor): HappyAgentArtifactAuthor {
    const kind = (author as { readonly kind: string }).kind;
    if (kind === "agent") {
        const agent = author as Extract<ArtifactAuthor, { kind: "agent" }>;
        return { kind: "agent", agentId: agent.agentId, botId: agent.botId };
    }
    if (kind === "user") {
        const user = author as Extract<ArtifactAuthor, { kind: "user" }>;
        return { kind: "user", userId: user.userId };
    }
    return { kind: "unknown" };
}

export function happyAgentArtifactProject(artifact: Artifact): HappyAgentArtifact {
    return {
        id: artifact.id as HappyAgentArtifactId,
        type: happyAgentArtifactTypeProject(artifact.type),
        title: artifact.title,
        status: artifact.status === "deleted" ? "deleted" : "active",
        latestVersion: artifact.latestVersion,
        entry: happyAgentArtifactFileProject(artifact.entry),
        fileCount: artifact.fileCount,
        size: artifact.size,
        source: happyAgentArtifactSourceProject(artifact.source),
        createdBy: happyAgentArtifactAuthorProject(artifact.createdBy),
        createdAt: artifact.createdAt,
        updatedBy: happyAgentArtifactAuthorProject(artifact.updatedBy),
        updatedSource: happyAgentArtifactSourceProject(artifact.updatedSource),
        updatedAt: artifact.updatedAt,
        deletedBy:
            artifact.deletedBy === null
                ? null
                : happyAgentArtifactAuthorProject(artifact.deletedBy),
        deletedSource: happyAgentArtifactSourceProject(artifact.deletedSource),
        deletedAt: artifact.deletedAt,
        version: artifact.version,
    };
}

/** `#rgb`, `#rgba`, `#rrggbb`, or `#rrggbbaa`: the only colours a version may name. */
const ARTIFACT_BACKGROUND = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/iu;

/**
 * The colour a version asks to be shown on, when it is one a slot may paint.
 * It comes from whoever published the version, so anything that is not a plain
 * hex colour — `null`, a missing field, or anything else — is no colour.
 */
export function happyAgentArtifactBackground(value: unknown): string | undefined {
    return typeof value === "string" && ARTIFACT_BACKGROUND.test(value) ? value : undefined;
}

export function happyAgentArtifactVersionProject(
    version: ArtifactVersion,
): HappyAgentArtifactVersion {
    // The pinned client predates `background`; it hands the daemon's JSON over
    // unparsed, so the field is read from the object as the daemon sent it.
    const background = happyAgentArtifactBackground(
        "background" in version ? version.background : undefined,
    );
    return {
        artifactId: version.artifactId as HappyAgentArtifactId,
        number: version.number,
        title: version.title,
        entry: happyAgentArtifactFileProject(version.entry),
        files: version.files.map(happyAgentArtifactFileProject),
        createdBy: happyAgentArtifactAuthorProject(version.createdBy),
        source: happyAgentArtifactSourceProject(version.source),
        createdAt: version.createdAt,
        ...(background === undefined ? {} : { background }),
    };
}
