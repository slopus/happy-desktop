import {
    endpointUrl,
    type Artifact,
    type ArtifactAuthor,
    type ArtifactFile,
    type ArtifactSource,
    type ArtifactVersion,
    type HappyAgentClient,
} from "@slopus/happy-agent-client";
import type {
    HappyAgentArtifact,
    HappyAgentArtifactAuthor,
    HappyAgentArtifactCover,
    HappyAgentArtifactCoverAspect,
    HappyAgentArtifactCoverMimeType,
    HappyAgentArtifactFile,
    HappyAgentArtifactId,
    HappyAgentArtifactLinks,
    HappyAgentArtifactPreview,
    HappyAgentArtifactSource,
    HappyAgentArtifactThumbnail,
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

/**
 * How a connection's client addresses an artifact's files and previews. The
 * pinned client predates the preview route, so its address is built here the
 * way the client builds a file's, beneath the client's own endpoint.
 */
export function happyAgentArtifactLinksCreate(
    client: Pick<HappyAgentClient, "artifactFileUrl" | "endpoint">,
    covers: boolean,
): HappyAgentArtifactLinks {
    return {
        file: (artifactId, version, path) => client.artifactFileUrl(artifactId, version, path),
        preview: (artifactId, version, path) =>
            endpointUrl(
                client.endpoint,
                `v0/artifacts/${encodeURIComponent(artifactId)}/versions/${String(version)}/previews/${path
                    .split("/")
                    .map(encodeURIComponent)
                    .join("/")}`,
            ),
        covers,
    };
}

/**
 * The artifact as this build shows it. Its pictures are read only where a
 * surface draws them: `links` is how they are addressed, and without it the
 * artifact has no cover and no thumbnail. Its cover is read only from a
 * daemon that has covers.
 */
export function happyAgentArtifactProject(
    artifact: Artifact,
    links?: HappyAgentArtifactLinks,
): HappyAgentArtifact {
    const cover = links?.covers === true ? happyAgentArtifactCoverProject(artifact, links) : null;
    return {
        id: artifact.id as HappyAgentArtifactId,
        type: happyAgentArtifactTypeProject(artifact.type),
        title: artifact.title,
        status: artifact.status === "deleted" ? "deleted" : "active",
        latestVersion: artifact.latestVersion,
        cover,
        background:
            links?.covers === true
                ? (happyAgentArtifactBackground(artifact.background) ?? null)
                : null,
        thumbnail:
            links === undefined ? null : happyAgentArtifactThumbnailProject(artifact, cover, links),
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

const ARTIFACT_COVER_MIME_TYPES: ReadonlySet<string> = new Set<HappyAgentArtifactCoverMimeType>([
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
]);

/**
 * The cover the artifact's latest version names. The pinned client predates
 * covers and hands the daemon's JSON over unparsed, so the field is read from
 * the object as the daemon sent it: an older daemon sends none, and a cover in
 * a format or of a shape this build does not know is no cover, so the
 * artifact keeps its compact row rather than a guess at its shape.
 */
export function happyAgentArtifactCoverProject(
    artifact: Artifact,
    links: Pick<HappyAgentArtifactLinks, "file" | "preview">,
): HappyAgentArtifactCover | null {
    const cover: unknown = "cover" in artifact ? artifact.cover : undefined;
    if (typeof cover !== "object" || cover === null) return null;
    const fields = cover as Record<string, unknown>;
    const { path, mimeType, width, height, aspect } = fields;
    if (typeof path !== "string" || path === "") return null;
    if (typeof mimeType !== "string" || !ARTIFACT_COVER_MIME_TYPES.has(mimeType)) return null;
    if (!dimension(width) || !dimension(height)) return null;
    if (aspect !== "wide" && aspect !== "square") return null;
    const id = artifact.id as HappyAgentArtifactId;
    return {
        version: artifact.latestVersion,
        path,
        mimeType: mimeType as HappyAgentArtifactCoverMimeType,
        width,
        height,
        aspect: aspect satisfies HappyAgentArtifactCoverAspect,
        url: links.file(id, artifact.latestVersion, path),
        thumbhash: thumbhashProject(fields.thumbhash),
        preview: previewProject(fields.preview, () =>
            links.preview(id, artifact.latestVersion, path),
        ),
    };
}

/** A pixel count a daemon reports: a positive whole number. */
function dimension(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/** A file's ThumbHash as the daemon sent it, or `null` for none or anything else. */
function thumbhashProject(value: unknown): string | null {
    return typeof value === "string" && value !== "" ? value : null;
}

/** A file's `preview`, read as `happyAgentArtifactCoverProject` reads a cover. */
function previewProject(value: unknown, url: () => string): HappyAgentArtifactPreview | null {
    if (typeof value !== "object" || value === null) return null;
    const { width, height } = value as Record<string, unknown>;
    return dimension(width) && dimension(height) ? { url: url(), width, height } : null;
}

/** Types whose entry is itself a picture, or a video with a poster. */
const MEDIA_TYPES: ReadonlySet<string> = new Set(["image", "image_series", "video"]);

/**
 * What a list leads the artifact's row with: its cover's preview, or the
 * whole cover where the daemon made none; else, for an image, image series,
 * or video, the preview of its entry — the first image, or the video's
 * poster; else nothing, and the row wears its type's glyph.
 */
export function happyAgentArtifactThumbnailProject(
    artifact: Artifact,
    cover: HappyAgentArtifactCover | null,
    links: Pick<HappyAgentArtifactLinks, "preview">,
): HappyAgentArtifactThumbnail | null {
    if (cover !== null)
        return {
            kind: "cover",
            aspect: cover.aspect,
            url: cover.preview?.url ?? cover.url,
            preview: cover.preview !== null,
            thumbhash: cover.thumbhash,
        };
    if (!MEDIA_TYPES.has(artifact.type)) return null;
    const entry = artifact.entry as ArtifactFile & Record<string, unknown>;
    const preview = previewProject(entry.preview, () =>
        links.preview(artifact.id as HappyAgentArtifactId, artifact.latestVersion, entry.path),
    );
    return preview === null
        ? null
        : { kind: "media", url: preview.url, thumbhash: thumbhashProject(entry.thumbhash) };
}

/** Whether two thumbnails are the same picture, drawn the same way. */
export function happyAgentArtifactThumbnailSame(
    left: HappyAgentArtifactThumbnail | null,
    right: HappyAgentArtifactThumbnail | null,
): boolean {
    if (left === right) return true;
    if (left === null || right === null || left.url !== right.url) return false;
    if (left.thumbhash !== right.thumbhash || left.kind !== right.kind) return false;
    return left.kind === "media" || (right.kind === "cover" && left.aspect === right.aspect);
}

/** Whether two covers are the same picture, drawn the same way. */
export function happyAgentArtifactCoverSame(
    left: HappyAgentArtifactCover | null,
    right: HappyAgentArtifactCover | null,
): boolean {
    return (
        left === right ||
        (left !== null &&
            right !== null &&
            left.url === right.url &&
            left.mimeType === right.mimeType &&
            left.width === right.width &&
            left.height === right.height &&
            left.aspect === right.aspect &&
            left.thumbhash === right.thumbhash &&
            left.preview?.url === right.preview?.url)
    );
}

/** The artifact's one-line summary, read as `happyAgentArtifactCoverProject` reads its cover. */
export function happyAgentArtifactSummaryProject(artifact: Artifact): string | null {
    const summary: unknown = "summary" in artifact ? artifact.summary : undefined;
    return typeof summary === "string" && summary.trim() !== "" ? summary : null;
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
